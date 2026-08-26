import * as THREE from 'three';
import { resolveCircle, type Collider } from '../physics/colliders';

export const PLAYER_RADIUS = 0.35;
const DODGE_DURATION = 0.34;

// Exploration movement: world-space direction comes from the InputLatch,
// collision is circle-vs-level in XZ. The visual (rig or placeholder) is a
// child of `object` and faces `facing`.
export class PlayerController {
  readonly object = new THREE.Object3D();
  /** Radians around +Y; 0 faces +Z. */
  facing = 0;
  runSpeed = 4.0;
  turnRate = 12; // rad/s toward the move direction
  /** Bicycle: much faster, wide turns, momentum. */
  riding = false;
  /** Current floor height (0 = street, 3.7 = the pawnshop roof, ...). */
  floorY = 0;

  private readonly vel = new THREE.Vector3();
  private readonly dodgeDir = new THREE.Vector3();
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private iFrames = 0;
  /** While true (menus, cutscenes, fire animation) input is ignored. */
  locked = false;

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get iFramesActive(): boolean {
    return this.iFrames > 0;
  }

  get dodging(): boolean {
    return this.dodgeTimer > 0;
  }

  /** 1 at dodge start, 0 at landing — drives the rig's leap pose. */
  get dodgeProgress(): number {
    return this.dodgeTimer > 0 ? this.dodgeTimer / DODGE_DURATION : 0;
  }

  /**
   * Dodge = a real leap: she springs along the dodge direction (backward
   * when standing still), leaves the ground, and lands in a crouch.
   */
  dodge(moveDir: THREE.Vector3 | null): boolean {
    if (this.locked || this.dodgeCooldown > 0) return false;
    if (moveDir) this.dodgeDir.copy(moveDir).normalize();
    else this.dodgeDir.set(Math.sin(this.facing + Math.PI), 0, Math.cos(this.facing + Math.PI));
    this.dodgeTimer = DODGE_DURATION;
    this.dodgeCooldown = 0.9;
    this.iFrames = 0.5;
    return true;
  }

  update(
    dt: number,
    moveDir: THREE.Vector3 | null,
    magnitude: number,
    colliders: readonly Collider[],
  ): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.iFrames = Math.max(0, this.iFrames - dt);
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      // Burst fades over the leap; a low ballistic arc sells the jump.
      const k = Math.max(0, this.dodgeTimer / DODGE_DURATION); // 1 -> 0
      this.object.position.addScaledVector(this.dodgeDir, (5 + 6.5 * k) * dt);
      resolveCircle(this.object.position, PLAYER_RADIUS, colliders, this.floorY);
      this.object.position.y = this.floorY + Math.sin((1 - k) * Math.PI) * 0.28;
      // She keeps facing where she was facing — a leap AWAY, not a turn.
      this.object.rotation.y = this.facing;
      if (this.dodgeTimer <= 0) this.object.position.y = this.floorY;
      return;
    }
    if (this.locked) moveDir = null;
    const speedMul = this.riding ? 2.05 : 1;
    const turn = this.riding ? 3.6 : this.turnRate;
    if (moveDir) {
      const speed = this.runSpeed * speedMul * magnitude;
      if (this.riding) {
        // Momentum: velocity chases the input instead of snapping to it.
        const target = new THREE.Vector3(moveDir.x * speed, 0, moveDir.z * speed);
        this.vel.lerp(target, Math.min(1, dt * 2.2));
      } else {
        this.vel.set(moveDir.x * speed, 0, moveDir.z * speed);
      }
      const targetFacing = Math.atan2(moveDir.x, moveDir.z);
      this.facing = turnToward(this.facing, targetFacing, turn * dt);
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * (this.riding ? 1.2 : 20))); // bikes coast
      if (this.vel.lengthSq() < 1e-4) this.vel.set(0, 0, 0);
    }
    this.object.position.addScaledVector(this.vel, dt);
    resolveCircle(this.object.position, PLAYER_RADIUS, colliders, this.floorY);
    // Cutscenes (train jump, climbs) drive y themselves while locked.
    if (!this.locked) this.object.position.y = this.floorY;
    this.object.rotation.y = this.facing;
  }
}

function turnToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
