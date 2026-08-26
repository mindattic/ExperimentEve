import * as THREE from 'three';
import type { InputSample } from '../core/input';
import type { CameraZone } from './cameraZone';

// The fixed-camera control fix: movement is camera-relative, but the camera
// BASIS used to interpret the stick is LATCHED while a direction is held.
// A camera cut mid-hold therefore keeps her moving in the same world
// direction; only returning the stick to neutral adopts the new camera's
// basis. (This is how the RE remakes solved "alternate" controls.)
export class InputLatch {
  private latchedForward: THREE.Vector3 | null = null;
  private latchedRight = new THREE.Vector3();
  private readonly outDir = new THREE.Vector3();

  /**
   * Returns the world-space movement direction (unit) scaled by magnitude,
   * or null when input is neutral. `zone` is the CURRENT (post-cut) zone.
   */
  update(input: InputSample, zone: CameraZone | null): THREE.Vector3 | null {
    if (input.magnitude < 1e-3 || !zone) {
      this.latchedForward = null;
      return null;
    }
    if (this.latchedForward === null) {
      this.latchedForward = zone.forward.clone();
      this.latchedRight.copy(zone.right);
    }
    // Latched basis, live stick: she keeps steering relative to the camera
    // she committed to, and stays fully steerable during the hold.
    this.outDir
      .copy(this.latchedForward)
      .multiplyScalar(input.moveY)
      .addScaledVector(this.latchedRight, input.moveX);
    if (this.outDir.lengthSq() < 1e-8) return null;
    return this.outDir.normalize();
  }

  /** Menus/cutscenes must call this so stale movement can't leak out. */
  reset(): void {
    this.latchedForward = null;
  }
}
