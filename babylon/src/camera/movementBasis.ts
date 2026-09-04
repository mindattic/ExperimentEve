import { Vector3 } from '@babylonjs/core';
import type { InputSample } from '../core/input';
import type { CameraZone } from './cameraZone';

// Fixed cameras break movement in a specific way: the shot cuts mid-stride, the
// stick's meaning flips, and the player walks back the way she came.
//
// The Three build hard-latched the basis until the stick returned to neutral.
// That kills the flip but leaves the controls bound to a camera you can no
// longer see, which is its own kind of awful on a long hold.
//
// This version rotates the basis instead: a cut is absorbed for a grace period
// (so direction is preserved through the cut itself), then the basis turns
// along the shortest arc to the new shot's authored forward. She curves into
// the new framing over about a second rather than reversing, and the controls
// end up agreeing with what's on screen. Neutral input realigns instantly,
// since there's no motion to disturb.

const GRACE = 0.16;
const TURN_RATE = Math.PI * 0.9; // rad/s
const ALIGN_EPSILON = 0.02;

export class MovementBasis {
  /** Current basis yaw (radians, 0 = +Z), i.e. "which way is forward". */
  private yaw = 0;
  private targetYaw = 0;
  private graceLeft = 0;
  private initialized = false;

  private readonly out = new Vector3();

  /** True while the basis is still catching up to the active shot. */
  get realigning(): boolean {
    return Math.abs(shortestArc(this.targetYaw - this.yaw)) > ALIGN_EPSILON;
  }

  /**
   * World-space movement direction (unit) scaled by nothing — magnitude stays
   * on the InputSample — or null when input is neutral.
   */
  update(input: InputSample, zone: CameraZone | null, dt: number): Vector3 | null {
    if (!zone) return null;

    if (!this.initialized) {
      this.yaw = zone.forwardYaw;
      this.targetYaw = zone.forwardYaw;
      this.initialized = true;
    }

    if (zone.forwardYaw !== this.targetYaw) {
      this.targetYaw = zone.forwardYaw;
      this.graceLeft = GRACE;
    }

    const moving = input.magnitude >= 1e-3;
    if (!moving) {
      // Nothing in motion to protect: adopt the shot's basis outright.
      this.yaw = this.targetYaw;
      this.graceLeft = 0;
      return null;
    }

    if (this.graceLeft > 0) {
      this.graceLeft = Math.max(0, this.graceLeft - dt);
    } else {
      const diff = shortestArc(this.targetYaw - this.yaw);
      const step = TURN_RATE * dt;
      this.yaw = Math.abs(diff) <= step ? this.targetYaw : this.yaw + Math.sign(diff) * step;
    }

    const f = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new Vector3(-f.z, 0, f.x);
    this.out.set(
      f.x * input.moveY + r.x * input.moveX,
      0,
      f.z * input.moveY + r.z * input.moveX,
    );
    if (this.out.lengthSquared() < 1e-8) return null;
    return this.out.normalize();
  }

  /** Menus/cutscenes must call this so stale movement can't leak out. */
  reset(): void {
    this.graceLeft = 0;
    this.yaw = this.targetYaw;
  }
}

function shortestArc(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
