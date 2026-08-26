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

/**
 * Load (cached) and return a fresh clone, PS1-converted, ready to place.
 * `name` may be pack-qualified ("city-pack/Fire Exit"); bare names resolve
 * to the retro-urban kit for backward compatibility.
 */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    const path = name.includes('/') ? `/models/${name}.glb` : `/models/retro-urban/${name}.glb`;
    cache.set(
      name,
      loader.loadAsync(encodeURI(path)).then((gltf) => {
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
  /** Uniform scale (packs with consistent units, e.g. Kenney). */
  scale?: number;
  /**
   * Normalize instead: rescale so the model's LARGEST dimension equals this
   * (meters). Handles packs with wildly inconsistent per-model units.
   */
  fit?: number;
  y?: number;
}

const box = new THREE.Box3();
const size = new THREE.Vector3();

/** Fire-and-forget scatter: props pop in as they load (title screen covers it). */
export function placeModels(scene: THREE.Scene, placements: Placement[]): void {
  for (const p of placements) {
    void loadModel(p.name)
      .then((m) => {
        if (p.fit !== undefined) {
          box.setFromObject(m);
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 1e-6) m.scale.setScalar(p.fit / maxDim);
        } else {
          m.scale.setScalar(p.scale ?? 1);
        }
        m.rotation.y = p.ry ?? 0;
        // Ground it: after scaling, sit the bounding box on y=0 exactly.
        m.position.set(0, 0, 0);
        m.updateWorldMatrix(true, true);
        box.setFromObject(m);
        m.position.set(p.x, (p.y ?? 0) - box.min.y, p.z);
        m.userData['model'] = p.name;
        scene.add(m);
      })
      .catch(() => {
        // Missing/failed model: the world just has one less dumpster.
      });
  }
}
