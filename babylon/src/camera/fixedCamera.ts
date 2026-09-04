import { Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import type { CameraZone } from './cameraZone';

// The fixed-camera pillar, kept — but the three things that made it play badly
// are fixed here:
//
//  1. Cuts are no longer instant teleports. A short eased dolly carries the
//     shot from the old setup to the new one, so the player never loses track
//     of where she is in space (the single biggest complaint about the genre).
//  2. Shots re-aim gently toward her instead of staring at a fixed point while
//     she walks out of frame, and they lead her movement slightly.
//  3. Locked-off tripod shots get a hair of handheld drift so a static frame
//     doesn't read as a frozen game.
//
// Composition still belongs to the authored zone: the camera never orbits, and
// the player never controls it.

const CUT_BLEND = 0.28;
/** How far a fixed shot re-aims from its authored look-at toward the player. */
const FRAMING_PULL = 0.42;

interface Shot {
  position: Vector3;
  target: Vector3;
  fov: number;
  fisheye: number;
}

export class FixedCameraDirector {
  readonly camera: UniversalCamera;
  private zones: CameraZone[] = [];
  private active: CameraZone | null = null;

  /** Incremented on every cut — systems can watch this to react to cuts. */
  cutCount = 0;
  onCut: ((zone: CameraZone) => void) | null = null;

  private trauma = 0;
  private shakeT = 0;
  private driftT = Math.random() * 100;

  private blendFrom: Shot | null = null;
  private blendT = 1;

  private readonly aim = new Vector3();
  private readonly lead = new Vector3();
  private readonly scratch = new Vector3();
  private currentFisheye = 0;

  constructor(scene: Scene) {
    this.camera = new UniversalCamera('director', new Vector3(0, 4, 10), scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 220;
    this.camera.fov = (55 * Math.PI) / 180;
    // Nothing may drive this camera but the director.
    this.camera.inputs.clear();
  }

  setZones(zones: CameraZone[]): void {
    this.zones = zones;
    this.active = null;
  }

  get activeZone(): CameraZone | null {
    return this.active;
  }

  get fisheye(): number {
    return this.currentFisheye;
  }

  /** Add shake trauma (0..1 per impact; stacks, capped at 1). */
  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Two-threshold hysteresis, unchanged from the original: the active zone
   * keeps the camera until she leaves its INFLATED polygon, and a new zone
   * only takes over when its CORE polygon contains her. No boundary flicker.
   */
  update(playerPos: Vector3, playerVel: Vector3, dt: number): void {
    const current = this.active;
    if (!current || !current.contains(playerPos.x, playerPos.z, current.hysteresisMargin)) {
      const next = this.zones.find(
        (z) => z !== current && z.contains(playerPos.x, playerPos.z, 0),
      );
      // Outside every core polygon (doorway gaps): hold the current shot.
      if (next) this.cut(next);
    }
    const zone = this.active;
    if (!zone) return;

    // Where the shot wants to look: the authored point, pulled part-way toward
    // her and led slightly by her velocity.
    this.lead.copyFrom(playerVel).scaleInPlace(zone.lead);
    this.scratch.set(playerPos.x + this.lead.x, playerPos.y + 1.05, playerPos.z + this.lead.z);
    const pull = zone.mode === 'cctv' ? 1 : FRAMING_PULL;
    const wanted = Vector3.Lerp(zone.cameraLookAt, this.scratch, pull);

    // CCTV mounts have servo lag; fixed heads settle faster.
    const follow = Math.min(1, dt * (zone.mode === 'cctv' ? 2.2 : 5.5));
    if (this.aim.lengthSquared() === 0) this.aim.copyFrom(wanted);
    Vector3.LerpToRef(this.aim, wanted, follow, this.aim);

    const shot: Shot = {
      position: zone.cameraPosition.clone(),
      target: this.aim.clone(),
      fov: zone.fov,
      fisheye: zone.fisheye,
    };

    // Ease the cut instead of snapping it.
    if (this.blendT < 1 && this.blendFrom) {
      this.blendT = Math.min(1, this.blendT + dt / CUT_BLEND);
      const k = smoothstep(this.blendT);
      shot.position = Vector3.Lerp(this.blendFrom.position, shot.position, k);
      shot.target = Vector3.Lerp(this.blendFrom.target, shot.target, k);
      shot.fov = this.blendFrom.fov + (shot.fov - this.blendFrom.fov) * k;
      shot.fisheye = this.blendFrom.fisheye + (shot.fisheye - this.blendFrom.fisheye) * k;
    }

    this.applyDrift(shot, zone.drift, dt);
    this.applyShake(shot, dt);

    this.camera.position.copyFrom(shot.position);
    this.camera.setTarget(shot.target);
    this.camera.fov = shot.fov;
    this.currentFisheye = shot.fisheye;
  }

  private applyDrift(shot: Shot, amplitude: number, dt: number): void {
    if (amplitude <= 0) return;
    this.driftT += dt;
    // Slow, irregular, sub-centimetre. Present but not noticeable as motion.
    shot.position.x += (Math.sin(this.driftT * 0.37) + Math.sin(this.driftT * 0.71)) * amplitude;
    shot.position.y += Math.sin(this.driftT * 0.53) * amplitude * 0.7;
    shot.position.z += (Math.sin(this.driftT * 0.29) + Math.sin(this.driftT * 0.61)) * amplitude;
  }

  private applyShake(shot: Shot, dt: number): void {
    if (this.trauma <= 0) return;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt * 40;
    // Amplitude follows trauma², so small hits barely tick the frame.
    const amp = this.trauma * this.trauma * 0.14;
    shot.position.x += (Math.sin(this.shakeT * 1.1) + Math.sin(this.shakeT * 2.3)) * amp;
    shot.position.y += (Math.sin(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1)) * amp * 0.7;
    shot.position.z += (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.9)) * amp;
  }

  private cut(zone: CameraZone): void {
    const previous = this.active;
    this.active = zone;
    this.cutCount++;
    if (previous) {
      this.blendFrom = {
        position: this.camera.position.clone(),
        target: this.aim.clone(),
        fov: this.camera.fov,
        fisheye: this.currentFisheye,
      };
      this.blendT = 0;
    } else {
      // First acquisition: land on the shot directly.
      this.blendFrom = null;
      this.blendT = 1;
      this.aim.copyFrom(zone.cameraLookAt);
      this.camera.position.copyFrom(zone.cameraPosition);
      this.camera.setTarget(zone.cameraLookAt);
      this.camera.fov = zone.fov;
      this.currentFisheye = zone.fisheye;
    }
    this.onCut?.(zone);
  }
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
