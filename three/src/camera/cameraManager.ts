import * as THREE from 'three';
import { CameraZone } from './cameraZone';

// Owns the fixed camera. Two-threshold hysteresis: the active zone keeps the
// camera until the player leaves its INFLATED polygon; a new zone takes over
// only when its CORE polygon contains the player. No flicker at boundaries.
export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  private zones: CameraZone[] = [];
  private active: CameraZone | null = null;
  /** Incremented on every cut — systems can watch this to react to cuts. */
  cutCount = 0;
  onCut: ((zone: CameraZone) => void) | null = null;

  // Trauma-based shake: impacts add trauma, amplitude follows trauma², so
  // small hits barely tick the frame and big ones rattle it.
  private trauma = 0;
  private shakeT = 0;
  private readonly basePos = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 120);
  }

  /** Add shake trauma (0..1 per impact; stacks, capped at 1). */
  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  setZones(zones: CameraZone[]): void {
    this.zones = zones;
    this.active = null;
  }

  get activeZone(): CameraZone | null {
    return this.active;
  }

  private readonly trackTarget = new THREE.Vector3();

  update(playerX: number, playerZ: number, dt = 0): void {
    const current = this.active;
    if (current && current.contains(playerX, playerZ, current.hysteresisMargin)) {
      this.trackCCTV(current, playerX, playerZ, dt);
      this.applyShake(dt);
      return; // still held by the active zone
    }
    for (const zone of this.zones) {
      if (zone !== current && zone.contains(playerX, playerZ, 0)) {
        this.cut(zone);
        this.trackCCTV(zone, playerX, playerZ, 1); // snap onto her at cut
        this.applyShake(dt);
        return;
      }
    }
    // In no zone's core (doorway gaps, etc.): keep the current camera.
    if (current) this.trackCCTV(current, playerX, playerZ, dt);
    this.applyShake(dt);
  }

  private applyShake(dt: number): void {
    if (this.trauma <= 0) return;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt * 40;
    const amp = this.trauma * this.trauma * 0.14;
    // Layered sines beat like noise; three axes so no impact reads the same.
    this.camera.position.set(
      this.basePos.x + (Math.sin(this.shakeT * 1.1) + Math.sin(this.shakeT * 2.3)) * amp,
      this.basePos.y + (Math.sin(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1)) * amp * 0.7,
      this.basePos.z + (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.9)) * amp,
    );
    if (this.trauma <= 0) this.camera.position.copy(this.basePos);
  }

  /** CCTV zones pan (with servo lag) to keep the player framed. */
  private trackCCTV(zone: CameraZone, playerX: number, playerZ: number, dt: number): void {
    if (zone.mode !== 'cctv') return;
    this.trackTarget.set(playerX, 0.9, playerZ);
    const lerp = Math.min(1, dt * 2.2);
    this.lookAtSmoothed.lerp(this.trackTarget, lerp);
    this.camera.lookAt(this.lookAtSmoothed);
  }

  private readonly lookAtSmoothed = new THREE.Vector3();

  private cut(zone: CameraZone): void {
    this.active = zone;
    this.cutCount++;
    this.basePos.copy(zone.cameraPosition);
    this.camera.position.copy(zone.cameraPosition);
    this.camera.lookAt(zone.cameraLookAt);
    this.lookAtSmoothed.copy(zone.cameraLookAt);
    this.camera.fov = zone.fov;
    this.camera.updateProjectionMatrix();
    this.onCut?.(zone);
  }
}
