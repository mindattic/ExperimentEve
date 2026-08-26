import * as THREE from 'three';

// Collision is 2D in the XZ plane: the player/enemies are circles, the world
// is AABBs and wall segments. No physics engine — push-out resolvers run a
// few iterations so corners settle.

export interface AABBCollider {
  kind: 'aabb';
  minX: number; minZ: number; maxX: number; maxZ: number;
}

export interface SegmentCollider {
  kind: 'segment';
  ax: number; az: number; bx: number; bz: number;
}

export type Collider = AABBCollider | SegmentCollider;

export function aabb(minX: number, minZ: number, maxX: number, maxZ: number): AABBCollider {
  return { kind: 'aabb', minX, minZ, maxX, maxZ };
}

export function segment(ax: number, az: number, bx: number, bz: number): SegmentCollider {
  return { kind: 'segment', ax, az, bx, bz };
}

/** Wall built from a box footprint: convenience for prop authoring. */
export function wall(cx: number, cz: number, w: number, d: number): AABBCollider {
  return aabb(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
}

/** True if the straight line a→b crosses any collider (2D occlusion). */
export function lineBlocked(
  ax: number, az: number, bx: number, bz: number,
  colliders: readonly Collider[],
): boolean {
  for (const c of colliders) {
    if (c.kind === 'segment') {
      if (segmentsIntersect(ax, az, bx, bz, c.ax, c.az, c.bx, c.bz)) return true;
    } else {
      if (
        segmentsIntersect(ax, az, bx, bz, c.minX, c.minZ, c.maxX, c.minZ) ||
        segmentsIntersect(ax, az, bx, bz, c.maxX, c.minZ, c.maxX, c.maxZ) ||
        segmentsIntersect(ax, az, bx, bz, c.maxX, c.maxZ, c.minX, c.maxZ) ||
        segmentsIntersect(ax, az, bx, bz, c.minX, c.maxZ, c.minX, c.minZ)
      ) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): boolean {
  const d1 = cross(cx, cz, dx, dz, ax, az);
  const d2 = cross(cx, cz, dx, dz, bx, bz);
  const d3 = cross(ax, az, bx, bz, cx, cz);
  const d4 = cross(ax, az, bx, bz, dx, dz);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function cross(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

const ITERATIONS = 3;

/** Mutates pos (x,z used) to push a circle of `radius` out of all colliders. */
export function resolveCircle(
  pos: THREE.Vector3,
  radius: number,
  colliders: readonly Collider[],
): void {
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false;
    for (const c of colliders) {
      if (c.kind === 'aabb') moved = pushOutAABB(pos, radius, c) || moved;
      else moved = pushOutSegment(pos, radius, c) || moved;
    }
    if (!moved) break;
  }
}

function pushOutAABB(pos: THREE.Vector3, r: number, box: AABBCollider): boolean {
  const cx = Math.max(box.minX, Math.min(pos.x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
  let dx = pos.x - cx;
  let dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq > r * r) return false;
  if (distSq > 1e-12) {
    const dist = Math.sqrt(distSq);
    const push = (r - dist) / dist;
    pos.x += dx * push;
    pos.z += dz * push;
  } else {
    // Center inside the box: exit along the shallowest axis.
    const left = pos.x - box.minX;
    const right = box.maxX - pos.x;
    const near = pos.z - box.minZ;
    const far = box.maxZ - pos.z;
    const m = Math.min(left, right, near, far);
    if (m === left) pos.x = box.minX - r;
    else if (m === right) pos.x = box.maxX + r;
    else if (m === near) pos.z = box.minZ - r;
    else pos.z = box.maxZ + r;
  }
  return true;
}

function pushOutSegment(pos: THREE.Vector3, r: number, seg: SegmentCollider): boolean {
  const ex = seg.bx - seg.ax;
  const ez = seg.bz - seg.az;
  const lenSq = ex * ex + ez * ez;
  let t = 0;
  if (lenSq > 1e-12) {
    t = ((pos.x - seg.ax) * ex + (pos.z - seg.az) * ez) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = seg.ax + ex * t;
  const cz = seg.az + ez * t;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq > r * r || distSq < 1e-12) return false;
  const dist = Math.sqrt(distSq);
  const push = (r - dist) / dist;
  pos.x += dx * push;
  pos.z += dz * push;
  return true;
}
