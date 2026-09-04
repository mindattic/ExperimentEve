import {
  AnimationGroup,
  Mesh,
  Scene,
  SceneLoader,
  Skeleton,
  TransformNode,
  type AbstractMesh,
} from '@babylonjs/core';
import { GLTFFileLoader, GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF';
import { paintOutfit } from './outfit';

// Kat is Quaternius' Universal Base Characters female body (CC0), animated from
// Quaternius' Universal Animation Library (CC0). The two ship the SAME 66-bone
// rig, bone for bone, so the library's clips apply directly — no retargeting,
// no rest-pose algebra, no bind-pose mismatch.
//
// That pairing is the whole point. Driving one Mixamo character with another's
// clips (the Three build's approach, Michelle animated from Soldier) needs
// delta retargeting AND a root-bone rebase, and still lands her arms 45° too
// high whenever the donor binds A-pose and the target binds T-pose. Matched
// rigs make all of that disappear.
//
// The non-_RM variant of the library is deliberate: world translation belongs
// to PlayerController, not to baked root motion.

const CHARACTER_DIR = '/models/kat/';
const BODY = 'Superhero_Female_FullBody.gltf';
const CLIPS = 'UAL1_Standard.glb';
/**
 * Hair is a separate skinned mesh in this pack, skinned to the SAME 65 joints
 * in the same order as the body — so handing it the body's skeleton lines the
 * skinning indices up exactly, and it deforms with her instead of needing to
 * be pinned to the head bone (which would need bind-transform compensation).
 */
const HAIR = 'Hair_Long.gltf';

const TARGET_HEIGHT = 1.7;
const WALK_SPEED = 1.6;
const RUN_SPEED = 4.2;
/** Ground speeds the clips were authored at, for footfall matching. */
const WALK_REF = 1.4;
const RUN_REF = 3.6;

/** Names as they appear in the Universal Animation Library. */
const CLIP_IDLE = 'Idle_Loop';
const CLIP_WALK = 'Walk_Loop';
const CLIP_RUN = 'Jog_Fwd_Loop';
const CLIP_SPRINT = 'Sprint_Loop';
const CLIP_ROLL = 'Roll';

SceneLoader.OnPluginActivatedObservable.add((plugin) => {
  // The loader autoplays the first clip by default; with 43 of them in one
  // file that means a stray animation fighting the locomotion blend.
  if (plugin.name === 'gltf' && plugin instanceof GLTFFileLoader) {
    plugin.animationStartMode = GLTFLoaderAnimationStartMode.NONE;
  }
});

interface Locomotion {
  idle: AnimationGroup;
  walk: AnimationGroup;
  run: AnimationGroup;
  sprint: AnimationGroup;
  roll: AnimationGroup;
}

export class PlayerCharacter {
  /** Visual root — parented to the controller's node. */
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  private locomotion: Locomotion | null = null;
  private skeleton: Skeleton | null = null;
  private blend = 0; // 0 idle .. 1 walk .. 2 run .. 3 sprint
  private rollWeight = 0;

  private constructor(scene: Scene, parent: TransformNode) {
    this.root = new TransformNode('katVisual', scene);
    this.root.parent = parent;
  }

  static async load(scene: Scene, parent: TransformNode): Promise<PlayerCharacter> {
    const character = new PlayerCharacter(scene, parent);

    const [body, clips, hair] = await Promise.all([
      SceneLoader.ImportMeshAsync('', CHARACTER_DIR, BODY, scene),
      SceneLoader.ImportMeshAsync('', CHARACTER_DIR, CLIPS, scene),
      SceneLoader.ImportMeshAsync('', CHARACTER_DIR, HAIR, scene),
    ]);

    const modelRoot = body.meshes.find((m) => !m.parent) ?? body.meshes[0]!;
    modelRoot.parent = character.root;
    modelRoot.position.setAll(0);
    // Its rotation is NOT ours to clear. The glTF loader parks the
    // right-to-left-handed conversion on this __root__ as a 180 degree Y
    // rotation together with a mirrored Z; the two compose to a plain X mirror.
    // Zeroing the rotation while leaving the mirror in place — which is what
    // any innocent-looking `rotation.setAll(0)` here does — keeps half of a
    // conversion and renders her facing exactly backwards, so she walks away
    // from wherever she is heading. Our own transform belongs on character.root,
    // which is a node we made, one level up.

    for (const mesh of body.meshes) {
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      character.meshes.push(mesh);
      // The base body is delivered in underwear; dress it before first frame.
      if (mesh instanceof Mesh && mesh.name.startsWith('Superhero_')) {
        paintOutfit(scene, mesh);
      }
    }

    const bounds = modelRoot.getHierarchyBoundingVectors(true);
    const height = bounds.max.y - bounds.min.y;
    if (height > 1e-4 && (height < 0.5 || height > 3)) {
      modelRoot.scaling.scaleInPlace(TARGET_HEIGHT / height);
    }

    character.skeleton = body.skeletons[0] ?? null;

    // Re-home the hair onto the body's rig, then drop its own duplicate
    // skeleton and node tree so only one set of bones is ever animated.
    for (const mesh of hair.meshes) {
      if (!mesh.getTotalVertices()) continue;
      mesh.skeleton = character.skeleton;
      mesh.parent = modelRoot;
      mesh.position.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.rotation.setAll(0);
      mesh.scaling.setAll(1);
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      character.meshes.push(mesh);
    }
    for (const group of hair.animationGroups) group.dispose();
    for (const skel of hair.skeletons) skel.dispose();
    for (const node of hair.transformNodes) node.dispose();

    const targets = new Map<string, TransformNode>();
    for (const node of body.transformNodes) targets.set(node.name, node);

    const adopt = (clipName: string): AnimationGroup => {
      const donor = clips.animationGroups.find((g) => g.name === clipName);
      if (!donor) throw new Error(`the animation library is missing "${clipName}"`);
      const group = donor.clone(`kat-${clipName}`, (oldTarget) => {
        const name = (oldTarget as { name?: string }).name;
        return name ? targets.get(name) ?? null : null;
      });
      // Rotations transfer untouched. Translation and scale tracks would fight
      // the controller and the height normalization, so they go.
      for (const targeted of [...group.targetedAnimations]) {
        const bone = (targeted.target as { name?: string } | null)?.name;
        if (!bone || targeted.animation.targetProperty !== 'rotationQuaternion') {
          group.removeTargetedAnimation(targeted.animation);
        }
      }
      return group;
    };

    const locomotion: Locomotion = {
      idle: adopt(CLIP_IDLE),
      walk: adopt(CLIP_WALK),
      run: adopt(CLIP_RUN),
      sprint: adopt(CLIP_SPRINT),
      roll: adopt(CLIP_ROLL),
    };
    character.locomotion = locomotion;

    // The library file is an animation source only; nothing of it renders.
    for (const group of clips.animationGroups) group.dispose();
    for (const mesh of clips.meshes) mesh.dispose(false, true);
    for (const skel of clips.skeletons) skel.dispose();

    for (const group of Object.values(locomotion)) {
      group.play(true);
      group.setWeightForAllAnimatables(0);
    }
    locomotion.idle.setWeightForAllAnimatables(1);

    return character;
  }

  /**
   * `speed` is ground speed in m/s. A dodge cross-fades to the library's Roll
   * clip rather than faking it with a lean, since there is a real one.
   */
  update(dt: number, speed: number, dodgeProgress: number, sliding: boolean): void {
    const loco = this.locomotion;
    if (!loco) return;

    const targetBlend = speed <= WALK_SPEED
      ? speed / WALK_SPEED
      : 1 + Math.min(2, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
    this.blend += (targetBlend - this.blend) * Math.min(1, dt * 9);

    // Roll owns the body outright while it lasts, then hands it back.
    const wantRoll = dodgeProgress > 0 ? 1 : 0;
    this.rollWeight += (wantRoll - this.rollWeight) * Math.min(1, dt * 18);

    const locoScale = 1 - this.rollWeight;
    const b = this.blend;
    loco.idle.setWeightForAllAnimatables(clamp01(1 - b) * locoScale);
    loco.walk.setWeightForAllAnimatables((b <= 1 ? clamp01(b) : clamp01(2 - b)) * locoScale);
    loco.run.setWeightForAllAnimatables((b <= 2 ? clamp01(b - 1) : clamp01(3 - b)) * locoScale);
    loco.sprint.setWeightForAllAnimatables(clamp01(b - 2) * locoScale);
    loco.roll.setWeightForAllAnimatables(this.rollWeight);

    // Match footfalls to real ground speed so she isn't skating.
    loco.walk.speedRatio = clampRange(speed / WALK_REF, 0.65, 1.7);
    loco.run.speedRatio = clampRange(speed / RUN_REF, 0.7, 1.6);

    // The knee slide has no clip of its own: it's the roll, held low.
    const drop = dodgeProgress > 0 && sliding ? -0.24 : 0;
    this.root.position.y += (drop - this.root.position.y) * Math.min(1, dt * 14);
  }

  /** Hurt flash / stealth tint hooks land here in a later chapter. */
  get bones(): Skeleton | null {
    return this.skeleton;
  }

  /** What the loader actually produced — read through the dev handle. */
  get debug(): unknown {
    const loco = this.locomotion;
    if (!loco) return null;
    return {
      blend: this.blend,
      rollWeight: this.rollWeight,
      groups: Object.entries(loco).map(([key, group]) => ({
        key,
        name: group.name,
        targeted: group.targetedAnimations.length,
        playing: group.isPlaying,
      })),
      skeletonBones: this.skeleton?.bones.length ?? 0,
    };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampRange(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
