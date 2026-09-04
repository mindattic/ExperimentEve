import { Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { resolveCircle, type Collider } from '../physics/colliders';

export const PLAYER_RADIUS = 0.35;
const DODGE_DURATION = 0.34;
const SLIDE_DURATION = 0.6;

// Movement keeps the original's authored numbers — run speed, dodge windows,
// i-frames, bicycle momentum — because those were tuned. What changes is the
// response curve: the Three build snapped velocity straight to target every
// frame, which is what made walking feel like dragging a cursor. Here speed
// ramps in and out, so starts have weight and stops have a little settle.
const ACCEL = 26;
const DECEL = 34;

export class PlayerController {
  readonly node: TransformNode;
  /** Radians around +Y; 0 faces +Z. */
  facing = 0;
  runSpeed = 4.0;
  turnRate = 12; // rad/s toward the move direction
  /** Bicycle: much faster, wide turns, momentum. */
  riding = false;
  /** Current floor height (0 = street, 3.65 = the pawnshop roof, ...). */
  floorY = 0;
  /** While true (menus, cutscenes, fire animation) input is ignored. */
  locked = false;
  /** Bullet time: freezes a dodge mid-motion so she can shoot from inside it. */
  suspendDodge = false;

  private readonly vel = new Vector3();
  private readonly dodgeDir = new Vector3();
  private readonly target = new Vector3();
  private dodgeTimer = 0;
  private dodgeDuration = DODGE_DURATION;
  private slideMode = false;
  private dodgeCooldown = 0;
  private iFrames = 0;

  constructor(scene: Scene) {
    this.node = new TransformNode('player', scene);
  }

  get position(): Vector3 {
    return this.node.position;
  }

  get velocity(): Vector3 {
    return this.vel;
  }

  /** Ground speed in m/s — drives the locomotion blend. */
  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get iFramesActive(): boolean {
    return this.iFrames > 0;
  }

  /**
   * Where the round leaves from. There is no weapon model yet, so this is her
   * right hand at shoulder height rather than a bone lookup — but the muzzle
   * flash and the tracer both start here, and at fixed-camera distance the
   * difference between an authored offset and a real socket is nothing.
   */
  muzzlePoint(into: Vector3): Vector3 {
    const sin = Math.sin(this.facing);
    const cos = Math.cos(this.facing);
    const pos = this.node.position;
    return into.set(
      pos.x + sin * 0.34 + cos * 0.16,
      pos.y + (this.sliding ? 0.86 : 1.24),
      pos.z + cos * 0.34 - sin * 0.16,
    );
  }

  /** Snap her onto a target — she does not fire over her own shoulder. */
  faceToward(x: number, z: number): void {
    const dx = x - this.node.position.x;
    const dz = z - this.node.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    this.facing = Math.atan2(dx, dz);
    this.node.rotation.y = this.facing;
  }

  get dodging(): boolean {
    return this.dodgeTimer > 0;
  }

  /** Mid knee-slide (the dodge's low, forward, guns-out variant). */
  get sliding(): boolean {
    return this.dodgeTimer > 0 && this.slideMode;
  }

  /** 1 at dodge start, 0 at landing — drives the leap/slide pose. */
  get dodgeProgress(): number {
    return this.dodgeTimer > 0 ? this.dodgeTimer / this.dodgeDuration : 0;
  }

  /**
   * Dodge = a real leap: she springs along the dodge direction (backward when
   * standing still), leaves the ground, and lands in a crouch.
   * slide = the Knee Slide: low and forward, knees paying for it.
   */
  dodge(moveDir: Vector3 | null, slide = false): boolean {
    if (this.locked || this.dodgeCooldown > 0) return false;
    if (moveDir) this.dodgeDir.copyFrom(moveDir).normalize();
    else this.dodgeDir.set(Math.sin(this.facing + Math.PI), 0, Math.cos(this.facing + Math.PI));
    this.slideMode = slide && moveDir !== null;
    this.dodgeDuration = this.slideMode ? SLIDE_DURATION : DODGE_DURATION;
    this.dodgeTimer = this.dodgeDuration;
    this.dodgeCooldown = this.slideMode ? 1.1 : 0.9;
    this.iFrames = this.slideMode ? 0.45 : 0.5;
    if (this.slideMode) {
      // She slides facing down the lane, not away from it.
      this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    }
    return true;
  }

  update(
    dt: number,
    moveDir: Vector3 | null,
    magnitude: number,
    colliders: readonly Collider[],
  ): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.iFrames = Math.max(0, this.iFrames - dt);
    const pos = this.node.position;

    if (this.dodgeTimer > 0) {
      if (this.suspendDodge) {
        this.iFrames = Math.max(this.iFrames, 0.1);
        this.node.rotation.y = this.facing;
        return;
      }
      this.dodgeTimer -= dt;
      const k = Math.max(0, this.dodgeTimer / this.dodgeDuration); // 1 -> 0
      const burst = this.slideMode ? 2.5 + 6 * k : 5 + 6.5 * k;
      pos.x += this.dodgeDir.x * burst * dt;
      pos.z += this.dodgeDir.z * burst * dt;
      resolveCircle(pos, PLAYER_RADIUS, colliders, this.floorY);
      // A low ballistic arc sells the leap; the slide stays pinned to the road.
      pos.y = this.slideMode ? this.floorY : this.floorY + Math.sin((1 - k) * Math.PI) * 0.28;
      this.vel.set(this.dodgeDir.x * burst, 0, this.dodgeDir.z * burst);
      // She keeps facing where she was facing — a leap AWAY, not a turn.
      this.node.rotation.y = this.facing;
      if (this.dodgeTimer <= 0) {
        pos.y = this.floorY;
        this.slideMode = false;
      }
      return;
    }

    if (this.locked) moveDir = null;
    const speedMul = this.riding ? 2.05 : 1;
    const turn = this.riding ? 3.6 : this.turnRate;

    if (moveDir) {
      const speed = this.runSpeed * speedMul * magnitude;
      this.target.set(moveDir.x * speed, 0, moveDir.z * speed);
      // Bikes carry momentum; on foot she still accelerates, just briskly.
      const rate = this.riding ? 2.2 : ACCEL / Math.max(speed, 0.001);
      approach(this.vel, this.target, Math.min(1, dt * rate));
      const targetFacing = Math.atan2(moveDir.x, moveDir.z);
      this.facing = turnToward(this.facing, targetFacing, turn * dt);
    } else {
      const rate = this.riding ? 1.2 : DECEL / Math.max(this.speed, 0.001);
      this.vel.scaleInPlace(Math.max(0, 1 - dt * rate));
      if (this.vel.lengthSquared() < 1e-4) this.vel.setAll(0);
    }

    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;
    resolveCircle(pos, PLAYER_RADIUS, colliders, this.floorY);
    // Cutscenes (train jump, climbs) drive y themselves while locked.
    if (!this.locked) pos.y = this.floorY;
    this.node.rotation.y = this.facing;
  }
}

function approach(v: Vector3, target: Vector3, t: number): void {
  v.x += (target.x - v.x) * t;
  v.z += (target.z - v.z) * t;
}

function turnToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
