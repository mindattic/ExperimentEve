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

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 120);
  }

  setZones(zones: CameraZone[]): void {
    this.zones = zones;
    this.active = null;
  }

  get activeZone(): CameraZone | null {
    return this.active;
  }

  update(playerX: number, playerZ: number): void {
    const current = this.active;
    if (current && current.contains(playerX, playerZ, current.hysteresisMargin)) {
      return; // still held by the active zone
    }
    for (const zone of this.zones) {
      if (zone !== current && zone.contains(playerX, playerZ, 0)) {
        this.cut(zone);
        return;
      }
    }
    // In no zone's core (doorway gaps, etc.): keep the current camera.
  }

  private cut(zone: CameraZone): void {
    this.active = zone;
    this.cutCount++;
    this.camera.position.copy(zone.cameraPosition);
    this.camera.lookAt(zone.cameraLookAt);
    this.camera.fov = zone.fov;
    this.camera.updateProjectionMatrix();
    this.onCut?.(zone);
  }
}
