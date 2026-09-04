import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';

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
  /**
   * How much the shot leads the player's motion, in metres of velocity
   * look-ahead. Keeps her from walking into the edge of a static frame.
   */
  lead?: number;
  /** Subtle handheld drift amplitude (metres). 0 = locked-off tripod. */
  drift?: number;
}

export class CameraZone {
  readonly id: string;
  readonly polygon: Vector2[];
  readonly cameraPosition: Vector3;
  readonly cameraLookAt: Vector3;
  readonly forward: Vector3;
  readonly right: Vector3;
  /** Basis yaw in radians, for shortest-arc blending between zones. */
  readonly forwardYaw: number;
  readonly fov: number;
  readonly hysteresisMargin: number;
  readonly mode: 'fixed' | 'cctv';
  readonly fisheye: number;
  readonly lead: number;
  readonly drift: number;

  constructor(def: CameraZoneDef) {
    this.id = def.id;
    this.polygon = ensureCCW(def.polygon.map(([x, z]) => new Vector2(x, z)));
    this.cameraPosition = new Vector3(...def.cameraPosition);
    this.cameraLookAt = new Vector3(...def.cameraLookAt);
    const f = new Vector2(...def.forward).normalize();
    this.forward = new Vector3(f.x, 0, f.y);
    this.forwardYaw = Math.atan2(f.x, f.y);
    if (def.right) {
      const r = new Vector2(...def.right).normalize();
      this.right = new Vector3(r.x, 0, r.y);
    } else {
      // Right-handed default: right = forward rotated -90° around +Y.
      this.right = new Vector3(-f.y, 0, f.x);
    }
    // Babylon's FOV is vertical and in radians; the authored numbers are the
    // Three.js vertical degrees, so they carry over directly.
    this.fov = ((def.fov ?? 55) * Math.PI) / 180;
    this.hysteresisMargin = def.hysteresisMargin ?? 0.5;
    this.mode = def.mode ?? 'fixed';
    this.fisheye = def.fisheye ?? 0;
    this.lead = def.lead ?? 0.55;
    this.drift = def.drift ?? 0.012;
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

function ensureCCW(pts: Vector2[]): Vector2[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area >= 0 ? pts : pts.slice().reverse();
}
