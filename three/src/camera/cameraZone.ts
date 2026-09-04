import * as THREE from 'three';

// A fixed-camera zone: a convex XZ footprint plus an authored camera and an
// authored input basis. forward/right are hand-authored, not derived from
// lookAt, so near-top-down cameras still give a well-defined movement basis.
export interface CameraZoneDef {
  id: string;
  /** Convex polygon in the XZ plane (any winding; normalized at load). */
  polygon: [number, number][];
  cameraPosition: [number, number, number];
  cameraLookAt: [number, number, number];
  /** World-space input basis (y ignored, normalized at load). */
  forward: [number, number];
  right?: [number, number];
  fov?: number;
  /** Extra margin the player must exit past before this zone lets go. */
  hysteresisMargin?: number;
  /** 'cctv': fixed mount that PANS to track the player (observer feel). */
  mode?: 'fixed' | 'cctv';
  /** Barrel distortion 0..~0.5 for warped-lens CCTV zones. */
  fisheye?: number;
}

export class CameraZone {
  readonly id: string;
  readonly polygon: THREE.Vector2[];
  readonly cameraPosition: THREE.Vector3;
  readonly cameraLookAt: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly fov: number;
  readonly hysteresisMargin: number;
  readonly mode: 'fixed' | 'cctv';
  readonly fisheye: number;

  constructor(def: CameraZoneDef) {
    this.id = def.id;
    this.polygon = ensureCCW(def.polygon.map(([x, z]) => new THREE.Vector2(x, z)));
    this.cameraPosition = new THREE.Vector3(...def.cameraPosition);
    this.cameraLookAt = new THREE.Vector3(...def.cameraLookAt);
    const f = new THREE.Vector2(...def.forward).normalize();
    this.forward = new THREE.Vector3(f.x, 0, f.y);
    if (def.right) {
      const r = new THREE.Vector2(...def.right).normalize();
      this.right = new THREE.Vector3(r.x, 0, r.y);
    } else {
      // Right-handed default: right = forward rotated -90° around +Y.
      this.right = new THREE.Vector3(-f.y, 0, f.x);
    }
    this.fov = def.fov ?? 55;
    this.hysteresisMargin = def.hysteresisMargin ?? 0.5;
    this.mode = def.mode ?? 'fixed';
    this.fisheye = def.fisheye ?? 0;
  }

  /** Point-in-convex-polygon; positive margin inflates the polygon. */
  contains(x: number, z: number, margin = 0): boolean {
    const n = this.polygon.length;
    for (let i = 0; i < n; i++) {
      const a = this.polygon[i]!;
      const b = this.polygon[(i + 1) % n]!;
      const ex = b.x - a.x;
      const ez = b.y - a.y;
      const elen = Math.hypot(ex, ez);
      if (elen < 1e-8) continue;
      // CCW winding: inside points have non-negative cross with each edge.
      const cross = ex * (z - a.y) - ez * (x - a.x);
      if (cross / elen < -margin) return false;
    }
    return true;
  }
}

function ensureCCW(pts: THREE.Vector2[]): THREE.Vector2[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area >= 0 ? pts : pts.slice().reverse();
}
