import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makePS1Material, prepTexture } from '../../render/ps1/ps1Material';

// GLB pipeline: loads any GLB (Kenney CC0 kits today; AI-generated or other
// royalty-free packs tomorrow) and converts every material to the PS1 shader
// (vertex snap + affine UVs + nearest-filter textures) so imports sit in the
// same render world as the procedural meshes.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function toPS1(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    const map = src?.map ?? null;
    if (map) prepTexture(map);
    mesh.material = makePS1Material({
      map: map ?? undefined,
      color: map ? 0xffffff : (src?.color?.getHex() ?? 0x888888),
      vertexColors: Boolean(mesh.geometry.getAttribute('color')),
    });
  });
}

/** Load (cached) and return a fresh clone, PS1-converted, ready to place. */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`/models/retro-urban/${name}.glb`).then((gltf) => {
        toPS1(gltf.scene);
        return gltf.scene;
      }),
    );
  }
  const proto = await cache.get(name)!;
  return proto.clone(true);
}

export interface Placement {
  name: string;
  x: number;
  z: number;
  ry?: number;
  scale?: number;
  y?: number;
}

/** Fire-and-forget scatter: props pop in as they load (title screen covers it). */
export function placeModels(scene: THREE.Scene, placements: Placement[]): void {
  for (const p of placements) {
    void loadModel(p.name)
      .then((m) => {
        m.position.set(p.x, p.y ?? 0, p.z);
        m.rotation.y = p.ry ?? 0;
        m.scale.setScalar(p.scale ?? 1);
        m.userData['model'] = p.name;
        scene.add(m);
      })
      .catch(() => {
        // Missing/failed model: the world just has one less dumpster.
      });
  }
}
