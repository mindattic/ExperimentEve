import {
  AssetContainer,
  PBRMaterial,
  Scene,
  SceneLoader,
  TransformNode,
  type AbstractMesh,
  type AnimationGroup,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { MAX_MATERIAL_LIGHTS } from '../render/lightRig';

// Creatures from the CC0 Quaternius packs, each shipping its own rig and its
// own clips (Idle/Walk/Attack/Death for the land animals, Swim or Flying for
// the rest). Nothing is retargeted or shared: every species is self-contained,
// which is exactly what the bestiary wants — a crabwife and a gullscream have
// no reason to agree on a skeleton.
//
// This is the loading and playback layer only. The A-Life simulation that gives
// them somewhere to be, and the ATB battle that gives them something to do, are
// EVEGDD chapters 3 and 4; for now instances stand in the world and idle.

const CREATURE_DIR = '/models/creatures/';

/** Species available, with the height each should stand at in metres. */
export const SPECIES = {
  frog: { file: 'Frog.glb', height: 0.34 },
  rat: { file: 'Rat.glb', height: 0.26 },
  snake: { file: 'Snake.glb', height: 0.3 },
  spider: { file: 'Spider.glb', height: 0.5 },
  wasp: { file: 'Wasp.glb', height: 0.32 },
  bat: { file: 'Bat.glb', height: 0.4 },
  slime: { file: 'Slime.glb', height: 0.55 },
  fish1: { file: 'Fish1.glb', height: 0.3 },
  fish2: { file: 'Fish2.glb', height: 0.3 },
  shark: { file: 'Shark.glb', height: 0.9 },
  mantaRay: { file: 'Manta_ray.glb', height: 0.5 },
} as const;

export type SpeciesId = keyof typeof SPECIES;

const containers = new Map<SpeciesId, Promise<AssetContainer>>();

function load(scene: Scene, species: SpeciesId): Promise<AssetContainer> {
  let pending = containers.get(species);
  if (!pending) {
    pending = SceneLoader.LoadAssetContainerAsync(CREATURE_DIR, SPECIES[species].file, scene);
    containers.set(species, pending);
  }
  return pending;
}

export class Creature {
  private constructor(
    readonly species: SpeciesId,
    readonly root: TransformNode,
    readonly meshes: AbstractMesh[],
    private readonly clips: Map<string, AnimationGroup>,
  ) {}

  static async spawn(
    scene: Scene,
    species: SpeciesId,
    x: number,
    z: number,
    facing = 0,
  ): Promise<Creature> {
    const container = await load(scene, species);
    // Cloned skeletons per instance: two rats must be able to be mid-different
    // frames of the same walk cycle.
    const entries = container.instantiateModelsToScene(
      (name) => `${species}-${name}`,
      true,
      { doNotInstantiate: true },
    );
    const root = (entries.rootNodes[0] ?? new TransformNode(species, scene)) as TransformNode;
    root.rotationQuaternion = null;
    root.rotation.set(0, facing, 0);
    root.position.setAll(0);
    root.scaling.setAll(1);

    // Normalize to a plausible size, then sit it on the ground exactly.
    root.computeWorldMatrix(true);
    const raw = root.getHierarchyBoundingVectors(true);
    const tall = raw.max.y - raw.min.y;
    if (tall > 1e-6) root.scaling.scaleInPlace(SPECIES[species].height / tall);
    root.computeWorldMatrix(true);
    const sized = root.getHierarchyBoundingVectors(true);
    root.position.set(x, -sized.min.y, z);

    const meshes: AbstractMesh[] = [];
    for (const mesh of root.getChildMeshes()) {
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      const mat = mesh.material;
      if (mat instanceof PBRMaterial) {
        mat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
        mat.roughness = Math.max(mat.roughness ?? 0.5, 0.7);
        mat.metallic = 0;
      }
      meshes.push(mesh);
    }

    const clips = new Map<string, AnimationGroup>();
    for (const group of entries.animationGroups) {
      group.stop();
      // Clips are prefixed per species in the source files (Rat_Idle, and so
      // on); key them bare so callers can just ask for 'idle'.
      const bare = group.name.replace(/^.*?[-_]/, '').replace(/^(Rat|Frog|Snake|Spider|Wasp|Bat|Slime)_?/i, '');
      clips.set(bare.toLowerCase(), group);
    }

    const creature = new Creature(species, root, meshes, clips);
    creature.play('idle') || creature.play('swim') || creature.play('flying');
    return creature;
  }

  /** Start a clip on loop. Returns false when the species has no such clip. */
  play(clip: string, loop = true): boolean {
    const group = this.clips.get(clip.toLowerCase());
    if (!group) return false;
    for (const other of this.clips.values()) {
      if (other !== group) other.stop();
    }
    if (!group.isPlaying) group.play(loop);
    return true;
  }

  get clipNames(): string[] {
    return [...this.clips.keys()];
  }

  dispose(): void {
    for (const group of this.clips.values()) group.dispose();
    this.root.dispose(false, true);
  }
}
