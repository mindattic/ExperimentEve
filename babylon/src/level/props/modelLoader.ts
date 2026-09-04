import {
  AssetContainer,
  PBRMaterial,
  Scene,
  SceneLoader,
  Texture,
  TransformNode,
  type AbstractMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { MAX_MATERIAL_LIGHTS } from '../../render/lightRig';

// GLB pipeline for the CC0 kits (Kenney Retro Urban, City Pack). Unlike the
// Three build — which flattened every import down to the PS1 Lambert material —
// imported materials are kept and nudged toward the scene's PBR lighting, so
// the props sit in the same lit world as the procedural geometry instead of
// being repainted flat.

const containers = new Map<string, Promise<AssetContainer>>();

function modelPath(name: string): string {
  // Bare names resolve to the retro-urban kit; pack-qualified names don't.
  return name.includes('/') ? `/models/${name}.glb` : `/models/retro-urban/${name}.glb`;
}

function loadContainer(scene: Scene, name: string): Promise<AssetContainer> {
  let pending = containers.get(name);
  if (!pending) {
    const path = encodeURI(modelPath(name));
    const slash = path.lastIndexOf('/');
    pending = SceneLoader.LoadAssetContainerAsync(
      path.slice(0, slash + 1),
      path.slice(slash + 1),
      scene,
    );
    containers.set(name, pending);
  }
  return pending;
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
   * (metres). Handles packs with wildly inconsistent per-model units.
   */
  fit?: number;
  y?: number;
}

export interface PlacedProps {
  /** Meshes worth feeding to the shadow generator. */
  meshes: AbstractMesh[];
}

/**
 * Scatter the placements. Each distinct model is downloaded once and then
 * instantiated, so repeated props (manhole covers, trash bags, shrubs) cost
 * one load and cheap instances.
 */
export async function placeModels(
  scene: Scene,
  placements: Placement[],
  onPlaced?: (meshes: AbstractMesh[]) => void,
): Promise<PlacedProps> {
  const all: AbstractMesh[] = [];

  await Promise.all(placements.map(async (p) => {
    try {
      const container = await loadContainer(scene, p.name);
      const entries = container.instantiateModelsToScene(
        (source) => `${p.name}-${source}`,
        false,
        { doNotInstantiate: false },
      );
      const root = entries.rootNodes[0];
      if (!root) return;

      const node = root as TransformNode;
      node.rotationQuaternion = null;
      node.rotation.set(0, p.ry ?? 0, 0);
      node.position.setAll(0);
      node.scaling.setAll(p.scale ?? 1);

      if (p.fit !== undefined) {
        node.scaling.setAll(1);
        node.computeWorldMatrix(true);
        const raw = node.getHierarchyBoundingVectors(true);
        const maxDim = Math.max(raw.max.x - raw.min.x, raw.max.y - raw.min.y, raw.max.z - raw.min.z);
        if (maxDim > 1e-6) node.scaling.setAll(p.fit / maxDim);
      }

      // Ground it: after scaling, sit the bounding box on y=0 exactly.
      node.computeWorldMatrix(true);
      const bounds = node.getHierarchyBoundingVectors(true);
      node.position.set(p.x, (p.y ?? 0) - bounds.min.y, p.z);

      const meshes: AbstractMesh[] = [];
      for (const mesh of node.getChildMeshes()) {
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        tuneMaterial(mesh);
        meshes.push(mesh);
      }
      all.push(...meshes);
      onPlaced?.(meshes);
    } catch {
      // Missing/failed model: the world just has one less dumpster.
    }
  }));

  return { meshes: all };
}

/**
 * Kit materials are authored for flat viewers: full-bright albedo, no
 * roughness variation. Push them toward something the night lighting can
 * actually shape.
 */
function tuneMaterial(mesh: AbstractMesh): void {
  const mat = mesh.material;
  if (!(mat instanceof PBRMaterial)) return;
  mat.metallic = mat.metallic === null ? 0 : Math.min(mat.metallic ?? 0, 0.25);
  mat.roughness = Math.max(mat.roughness ?? 0.5, 0.62);
  mat.environmentIntensity = 0.5;
  mat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
  if (mat.albedoTexture instanceof Texture) {
    mat.albedoTexture.anisotropicFilteringLevel = 8;
  }
}

/** Set dressing for Level 1 / North End, unchanged from the authored layout. */
export const LEVEL01_PROPS: Placement[] = [
  // The jackknifed semi: cab and cargo at broken angles under the pylons.
  { name: 'truck-flat', x: -4.6, z: -23.4, ry: 2.35, scale: 3.2 },
  { name: 'truck-grey-cargo', x: 1.4, z: -22.3, ry: 1.62, scale: 3.2 },
  // Blockade approach barriers.
  { name: 'detail-barrier-strong-damaged', x: -2.2, z: -17.6, ry: 0.15, scale: 2 },
  { name: 'detail-barrier-type-a', x: 1.8, z: -17.7, ry: -0.1, scale: 2 },
  // Street furniture.
  { name: 'detail-dumpster-open', x: 3.1, z: 7.2, ry: Math.PI, scale: 2 },
  { name: 'detail-dumpster-closed', x: -3.5, z: -2.4, ry: 0.2, scale: 2 },
  { name: 'detail-light-traffic', x: 4.6, z: 6.4, ry: Math.PI, scale: 2 },
  { name: 'detail-bench', x: -6.2, z: 30.6, ry: 0, scale: 2 },
  // Salvage-yard clutter by the garage and corridors.
  { name: 'pallet', x: 20.4, z: -3.2, ry: 0.4, scale: 2 },
  { name: 'pallet-small', x: 21.3, z: -2.5, ry: 1.2, scale: 2 },
  { name: 'planks', x: 24.8, z: -16.6, ry: 0.9, scale: 2 },
  { name: 'scaffolding-structure', x: 5.1, z: 21.5, ry: -Math.PI / 2, scale: 2.4 },
  // Overhead cables sagging across street A.
  { name: 'detail-cables-type-a', x: 0, z: 12, ry: Math.PI / 2, scale: 2.6 },
  { name: 'detail-cables-type-b', x: 0, z: 24, ry: Math.PI / 2, scale: 2.6 },
  // Green where the grass patches are.
  { name: 'tree-small', x: -12.2, z: 11, scale: 2.2 },
  { name: 'tree-shrub', x: 12.4, z: 24.5, scale: 2 },
  { name: 'tree-shrub', x: -12.8, z: 24, scale: 2.4 },
  { name: 'wall-broken-type-a', x: -8.5, z: 6.15, ry: Math.PI, scale: 2 },

  // --- City Pack: units vary per model, so everything uses fit (metres,
  // largest dimension) and auto-grounding.
  { name: 'city-pack/Car', x: 0.1, z: 2.4, ry: 0.35, fit: 4.2 },
  { name: 'city-pack/Van', x: -1.6, z: -14.3, ry: -1.35, fit: 4.6 },
  { name: 'city-pack/Police Car', x: -8.5, z: -19.6, ry: 2.6, fit: 4.2 },
  { name: 'city-pack/Fire hydrant', x: 4.4, z: -3.6, fit: 1.0 },
  { name: 'city-pack/Mailbox', x: -4.5, z: 7.2, ry: Math.PI / 2, fit: 1.3 },
  { name: 'city-pack/Stop sign', x: 4.5, z: 0.8, ry: Math.PI, fit: 2.6 },
  { name: 'city-pack/Manhole Cover', x: 0.4, z: 10, fit: 0.9 },
  { name: 'city-pack/Manhole Cover', x: -0.6, z: -8, fit: 0.9 },
  { name: 'city-pack/Trash Can', x: -4.4, z: 12.4, fit: 1.0 },
  { name: 'city-pack/trah bag grey', x: -4.1, z: 11.6, fit: 0.7 },
  { name: 'city-pack/trah bag grey', x: 3.9, z: 8.3, ry: 1.1, fit: 0.7 },
  { name: 'city-pack/Debris Papers', x: 0.5, z: 5.5, fit: 1.6 },
  { name: 'city-pack/Debris Papers', x: -1.8, z: -5.5, ry: 2, fit: 1.6 },
  { name: 'city-pack/Bus stop sign', x: -0.8, z: 5.5, fit: 2.6 },
  // The pawnshop fire escape + roof dressing.
  { name: 'city-pack/Fire Exit', x: 12.15, z: 8.4, ry: -Math.PI / 2, fit: 4.0 },
  { name: 'city-pack/Roof Exit', x: 7, z: 9, y: 3.65, ry: Math.PI, fit: 1.8 },
  { name: 'city-pack/Air conditioner', x: 10.8, z: 6.8, y: 3.65, ry: 0.3, fit: 0.9 },
  { name: 'city-pack/Billboard', x: 8.8, z: 26.9, y: 3.1, ry: Math.PI, fit: 4.5 },
  { name: 'city-pack/Rock band poster', x: -4.35, z: 17.5, ry: Math.PI / 2, y: 0.9, fit: 1.1 },
  { name: 'city-pack/Washing Line', x: -7.5, z: 28.2, ry: 0.2, fit: 3.4 },
  // Distant skyline filler beyond the play area (visual only).
  { name: 'city-pack/Big Building', x: -20, z: -10, ry: Math.PI / 2, fit: 14 },
  { name: 'city-pack/Building Red', x: 17, z: 14, ry: -Math.PI / 2, fit: 9 },
  { name: 'city-pack/Building Green', x: -19, z: 12, ry: Math.PI / 2, fit: 9 },
  { name: 'city-pack/Brown Building', x: 17, z: 26, ry: -Math.PI / 2, fit: 10 },
  { name: 'city-pack/Pizza Corner', x: -18, z: -2, ry: Math.PI / 2, fit: 9 },
];

/** Street lamp placements: [x, z, rotationY]. */
export const LAMP_PLACEMENTS: [number, number, number][] = [
  [-5.2, 1, Math.PI],
  [2.5, -2.5, Math.PI],
  [-2.5, 14, 0],
  [3.5, 27, Math.PI],
  [-3.5, 8, 0],
  [6, 31.5, -Math.PI / 2],
  [3.5, -8, Math.PI],
  [-3.5, -14.5, 0],
  [10, -19.5, 0],
  [24.5, -14, 0],
  [20.2, 0.6, Math.PI],
];
