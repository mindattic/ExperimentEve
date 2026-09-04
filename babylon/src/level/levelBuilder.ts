import {
  Mesh,
  MeshBuilder,
  Scene,
  TransformNode,
  Vector3,
  Vector4,
  VertexBuffer,
} from '@babylonjs/core';
import { CameraZone } from '../camera/cameraZone';
import { aabb, segment, type Collider } from '../physics/colliders';
import { SurfaceLibrary, type SurfaceKind } from './materials';
import type { InteractableDef, LevelDef, TriggerDef } from './levelTypes';

export interface LoadedLevel {
  root: TransformNode;
  zones: CameraZone[];
  colliders: Collider[];
  /** Colliders active only while their flag is false (e.g. fire blockade). */
  gated: { flag: string; collider: Collider; mesh?: Mesh }[];
  interactables: InteractableDef[];
  triggers: (TriggerDef & { fired: boolean })[];
  /** Everything that should cast/receive the moon's shadow. */
  shadowCasters: Mesh[];
}

function inPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function triggerContains(t: TriggerDef, x: number, z: number): boolean {
  return inPolygon(x, z, t.polygon);
}

const WALL_THICKNESS = 0.22;

export function buildLevel(def: LevelDef, scene: Scene, surfaces: SurfaceLibrary): LoadedLevel {
  const root = new TransformNode('level', scene);
  const colliders: Collider[] = [];
  const gated: LoadedLevel['gated'] = [];
  const shadowCasters: Mesh[] = [];
  // Grouped by material so each texture kind collapses to one draw call.
  const mergeGroups = new Map<string, Mesh[]>();

  const stage = (key: string, mesh: Mesh): void => {
    const group = mergeGroups.get(key);
    if (group) group.push(mesh);
    else mergeGroups.set(key, [mesh]);
  };

  for (const w of def.walls) {
    const col = segment(w.a[0], w.a[1], w.b[0], w.b[1]);
    col.topY = w.h ?? 2.7;
    const gate = w.gated ? { flag: w.gated, collider: col, mesh: undefined as Mesh | undefined } : null;
    if (gate) gated.push(gate);
    else colliders.push(col);
    if (w.invisible) continue;

    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const h = w.h ?? 2.7;
    const kind: SurfaceKind = (w.tex ?? 'plain') as SurfaceKind;
    const tile = surfaces.tileSize(kind);
    const mesh = MeshBuilder.CreateBox(
      `wall-${w.a[0]}-${w.a[1]}`,
      { width: len, height: h, depth: WALL_THICKNESS, faceUV: boxFaceUV(len, h, WALL_THICKNESS, tile) },
      scene,
    );
    mesh.position.set((w.a[0] + w.b[0]) / 2, h / 2, (w.a[1] + w.b[1]) / 2);
    mesh.rotation.y = Math.atan2(w.b[0] - w.a[0], w.b[1] - w.a[1]) - Math.PI / 2;
    mesh.material = surfaces.get(kind);
    mesh.receiveShadows = true;
    if (gate) {
      // Gated walls come and go, so they stay separate meshes.
      mesh.parent = root;
      gate.mesh = mesh;
      shadowCasters.push(mesh);
    } else {
      stage(`wall-${kind}`, mesh);
    }
  }

  for (const b of def.boxes) {
    const w = b.max[0] - b.min[0];
    const d = b.max[1] - b.min[1];
    const h = b.h ?? 1;
    const topY = (b.y ?? 0) + h;
    if (b.hidden) {
      const col = aabb(b.min[0], b.min[1], b.max[0], b.max[1]);
      col.topY = topY;
      colliders.push(col);
      continue;
    }
    const mesh = MeshBuilder.CreateBox(`box-${b.min[0]}-${b.min[1]}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set((b.min[0] + b.max[0]) / 2, (b.y ?? 0) + h / 2, (b.min[1] + b.max[1]) / 2);
    mesh.material = surfaces.solid(b.color ?? 0x555a60);
    mesh.receiveShadows = true;
    stage(`box-${b.color ?? 0x555a60}`, mesh);
    if (!b.noCollide) {
      const col = aabb(b.min[0], b.min[1], b.max[0], b.max[1]);
      col.topY = topY;
      colliders.push(col);
    }
  }

  for (const f of def.fences) {
    const fcol = segment(f.a[0], f.a[1], f.b[0], f.b[1]);
    const h = f.h ?? 2.2;
    fcol.topY = h;
    colliders.push(fcol);

    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const tile = surfaces.tileSize('chainlink');
    const mesh = MeshBuilder.CreatePlane(
      `fence-${f.a[0]}-${f.a[1]}`,
      { width: len, height: h, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    scaleUVs(mesh, len / tile, h / tile);
    mesh.position.set((f.a[0] + f.b[0]) / 2, h / 2, (f.a[1] + f.b[1]) / 2);
    mesh.rotation.y = Math.atan2(f.b[0] - f.a[0], f.b[1] - f.a[1]) - Math.PI / 2;
    mesh.material = surfaces.get('chainlink');
    stage('fence', mesh);

    // Posts every ~3m, plus a top rail — reads as a real fence line at night.
    const posts = Math.max(2, Math.round(len / 3) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const post = MeshBuilder.CreateCylinder(`post-${i}`, { diameter: 0.09, height: h, tessellation: 8 }, scene);
      post.position.set(f.a[0] + (f.b[0] - f.a[0]) * t, h / 2, f.a[1] + (f.b[1] - f.a[1]) * t);
      post.material = surfaces.solid(0x777c80, 0.5);
      stage('fencePost', post);
    }
    const rail = MeshBuilder.CreateCylinder('rail', { diameter: 0.06, height: len, tessellation: 8 }, scene);
    rail.rotation.z = Math.PI / 2;
    rail.rotation.y = Math.atan2(f.b[0] - f.a[0], f.b[1] - f.a[1]) + Math.PI / 2;
    rail.position.set((f.a[0] + f.b[0]) / 2, h - 0.04, (f.a[1] + f.b[1]) / 2);
    rail.material = surfaces.solid(0x777c80, 0.5);
    stage('fencePost', rail);
  }

  for (const g of def.ground) {
    const w = g.max[0] - g.min[0];
    const d = g.max[1] - g.min[1];
    const kind = g.tex as SurfaceKind;
    const tile = surfaces.tileSize(kind);
    const mesh = MeshBuilder.CreateGround(
      `ground-${g.min[0]}-${g.min[1]}`,
      { width: w, height: d, subdivisions: 1 },
      scene,
    );
    scaleUVs(mesh, w / tile, d / tile);
    mesh.position.set((g.min[0] + g.max[0]) / 2, 0, (g.min[1] + g.max[1]) / 2);
    mesh.material = surfaces.get(kind);
    mesh.receiveShadows = true;
    stage(`ground-${kind}`, mesh);
  }

  // One merged mesh per material. Merging keeps materials intact and drops the
  // draw-call count from ~400 to ~15.
  for (const [key, group] of mergeGroups) {
    if (group.length === 0) continue;
    const merged = group.length === 1
      ? group[0]!
      : Mesh.MergeMeshes(group, true, true, undefined, false, false);
    if (!merged) continue;
    merged.name = `merged-${key}`;
    merged.parent = root;
    merged.receiveShadows = true;
    merged.isPickable = false;
    if (!key.startsWith('ground-')) shadowCasters.push(merged);
    merged.freezeWorldMatrix();
  }

  return {
    root,
    zones: def.zones.map((z) => new CameraZone(z)),
    colliders,
    gated,
    interactables: def.interactables,
    triggers: def.triggers.map((t) => ({ ...t, fired: false })),
    shadowCasters,
  };
}

/**
 * Per-face UV rectangles for a box, sized in world metres so the texture keeps
 * a constant scale no matter how long the wall is. Face order is Babylon's:
 * back, front, right, left, top, bottom.
 */
function boxFaceUV(width: number, height: number, depth: number, tile: number): Vector4[] {
  const w = width / tile;
  const h = height / tile;
  const d = depth / tile;
  return [
    new Vector4(0, 0, w, h),
    new Vector4(0, 0, w, h),
    new Vector4(0, 0, d, h),
    new Vector4(0, 0, d, h),
    new Vector4(0, 0, w, d),
    new Vector4(0, 0, w, d),
  ];
}

function scaleUVs(mesh: Mesh, u: number, v: number): void {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
  if (!uvs) return;
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] = uvs[i]! * u;
    uvs[i + 1] = uvs[i + 1]! * v;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs, false);
}

/** Street lamps and window glow: the warm pools the moon can't provide. */
export function lampPositions(): Vector3[] {
  return [
    new Vector3(-3.2, 4.2, 26.5),
    new Vector3(3.2, 4.2, 12.5),
    new Vector3(-12.6, 4.0, 4.6),
    new Vector3(3.4, 4.2, -8.5),
    new Vector3(-9.5, 4.4, -19.5),
    new Vector3(24.5, 3.8, -14.0),
    new Vector3(20.2, 3.2, 0.6),
    new Vector3(-8.5, 2.6, 23.0),
  ];
}
