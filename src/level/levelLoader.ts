import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { CameraZone } from '../camera/cameraZone';
import { segment, aabb, type Collider } from '../physics/colliders';
import { makeInteractable, type Interactable } from '../gameplay/interactables';
import type { LevelDef, TriggerDef, WallTex } from './levelTypes';
import {
  brickTexture, clapboardTexture, plankTexture, interiorTexture,
  asphaltTexture, grassTexture, gravelTexture, chainlinkTexture,
} from './textures';

export interface LoadedLevel {
  root: THREE.Group;
  zones: CameraZone[];
  colliders: Collider[];
  /** Colliders active only while their flag is false (e.g. fire blockade). */
  gated: { flag: string; collider: Collider; mesh?: THREE.Object3D }[];
  interactables: Interactable[];
  triggers: (TriggerDef & { fired: boolean })[];
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

export function loadLevel(def: LevelDef): LoadedLevel {
  const root = new THREE.Group();
  const colliders: Collider[] = [];

  const wallTex: Record<WallTex, THREE.Texture | null> = {
    brick: brickTexture(),
    clapboard: clapboardTexture(),
    plank: plankTexture(),
    interior: interiorTexture(),
    plain: null,
  };
  const wallMats = new Map<WallTex, THREE.MeshLambertMaterial>();
  for (const [name, tex] of Object.entries(wallTex) as [WallTex, THREE.Texture | null][]) {
    wallMats.set(
      name,
      tex ? makePS1Material({ map: tex }) : makePS1Material({ color: 0x4c4c50 }),
    );
  }

  const gated: LoadedLevel['gated'] = [];
  for (const w of def.walls) {
    const col = segment(w.a[0], w.a[1], w.b[0], w.b[1]);
    const gate = w.gated ? { flag: w.gated, collider: col, mesh: undefined as THREE.Object3D | undefined } : null;
    if (gate) gated.push(gate);
    else colliders.push(col);
    if (w.invisible) continue;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const h = w.h ?? 2.7;
    const mat = wallMats.get(w.tex ?? 'plain')!.clone();
    if (mat.map) {
      mat.map = mat.map.clone();
      mat.map.repeat.set(Math.max(1, Math.round(len / 2)), Math.max(1, Math.round(h / 2.7)));
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, h, 0.22, Math.max(1, Math.ceil(len / 1.5)), 2, 1),
      mat,
    );
    mesh.position.set((w.a[0] + w.b[0]) / 2, h / 2, (w.a[1] + w.b[1]) / 2);
    mesh.rotation.y = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
    root.add(mesh);
    if (gate) gate.mesh = mesh;
  }

  for (const b of def.boxes) {
    const w = b.max[0] - b.min[0];
    const d = b.max[1] - b.min[1];
    const h = b.h ?? 1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / 1.5)), 1, Math.max(1, Math.ceil(d / 1.5))),
      makePS1Material({ color: b.color ?? 0x555a60 }),
    );
    mesh.position.set((b.min[0] + b.max[0]) / 2, (b.y ?? 0) + h / 2, (b.min[1] + b.max[1]) / 2);
    root.add(mesh);
    if (!b.noCollide) colliders.push(aabb(b.min[0], b.min[1], b.max[0], b.max[1]));
  }

  const linkTex = chainlinkTexture();
  for (const f of def.fences) {
    colliders.push(segment(f.a[0], f.a[1], f.b[0], f.b[1]));
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const h = f.h ?? 2.2;
    const tex = linkTex.clone();
    tex.repeat.set(len / 1.2, h / 1.2);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, h, Math.max(1, Math.ceil(len / 1.5)), 1),
      new THREE.MeshLambertMaterial({
        map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
      }),
    );
    mesh.position.set((f.a[0] + f.b[0]) / 2, h / 2, (f.a[1] + f.b[1]) / 2);
    mesh.rotation.y = -Math.atan2(f.b[1] - f.a[1], f.b[0] - f.a[0]);
    root.add(mesh);
    // Posts every ~3m.
    const posts = Math.max(2, Math.round(len / 3) + 1);
    const postMat = makePS1Material({ color: 0x777c80 });
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h, 4), postMat);
      post.position.set(
        f.a[0] + (f.b[0] - f.a[0]) * t,
        h / 2,
        f.a[1] + (f.b[1] - f.a[1]) * t,
      );
      root.add(post);
    }
  }

  const groundTexFns = {
    asphalt: asphaltTexture, grass: grassTexture, gravel: gravelTexture, interior: interiorTexture,
  } as const;
  for (const g of def.ground) {
    const w = g.max[0] - g.min[0];
    const d = g.max[1] - g.min[1];
    const tex = groundTexFns[g.tex]();
    tex.repeat.set(Math.max(1, w / 4), Math.max(1, d / 4));
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d, Math.max(2, Math.ceil(w / 2)), Math.max(2, Math.ceil(d / 2))),
      makePS1Material({ map: tex }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((g.min[0] + g.max[0]) / 2, 0, (g.min[1] + g.max[1]) / 2);
    root.add(mesh);
  }

  return {
    root,
    zones: def.zones.map((z) => new CameraZone(z)),
    colliders,
    gated,
    interactables: def.interactables.map(makeInteractable),
    triggers: def.triggers.map((t) => ({ ...t, fired: false })),
  };
}
