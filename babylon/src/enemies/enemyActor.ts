import { Color3, PBRMaterial, Vector3, type TransformNode } from '@babylonjs/core';
import type { Creature, SpeciesId } from './creature';

// A creature promoted to a battle participant: HP, targetable parts, hurt
// flash, stagger, death.
//
// Part targeting hangs off the rig's OWN bones. The Three build had to author
// dummy nodes onto stacks of primitives to have anything to aim at; these packs
// ship real anatomy (Head, Thorax, Abdomen, Sting, Tail, Mouth, Wing), so a
// weak point can be an actual body part that the actual mesh moves. Shooting a
// wasp's sting means shooting the thing that stings.

export interface PartSpec {
  tag: string;
  /** Bone name in the species' rig. Missing bones are skipped, not faked. */
  bone: string;
  radius: number;
  damageMultiplier: number;
  weakPoint?: boolean;
  /** Hard override: this part always deals exactly this much (frog body = 1). */
  flatDamage?: number;
}

export interface EnemyPart extends PartSpec {
  node: TransformNode;
  active: boolean;
}

interface SpeciesStats {
  displayName: string;
  maxHp: number;
  radius: number;
  /** Contact damage per second while it's on her. */
  touchDps: number;
  parts: PartSpec[];
}

const STATS: Partial<Record<SpeciesId, SpeciesStats>> = {
  rat: {
    displayName: 'Ratchoir Straggler',
    maxHp: 24,
    radius: 0.22,
    touchDps: 5,
    parts: [
      { tag: 'head', bone: 'Head', radius: 0.1, damageMultiplier: 2.5, weakPoint: true },
      { tag: 'torso', bone: 'Torso', radius: 0.14, damageMultiplier: 1 },
      { tag: 'tail', bone: 'Tail3', radius: 0.08, damageMultiplier: 0.5 },
    ],
  },
  frog: {
    displayName: 'Gutterspawn',
    maxHp: 46,
    radius: 0.26,
    touchDps: 7,
    parts: [
      { tag: 'head', bone: 'Head', radius: 0.13, damageMultiplier: 2.5, weakPoint: true },
      // Its back is armour in all but name — shots here barely register.
      { tag: 'back', bone: 'Back', radius: 0.18, damageMultiplier: 1, flatDamage: 1 },
      { tag: 'hind leg', bone: 'BackUpLeg.L', radius: 0.11, damageMultiplier: 1.4 },
    ],
  },
  spider: {
    displayName: 'Cobble Weaver',
    maxHp: 44,
    radius: 0.26,
    touchDps: 6,
    parts: [
      { tag: 'abdomen', bone: 'Abdomen', radius: 0.15, damageMultiplier: 2.5, weakPoint: true },
      { tag: 'thorax', bone: 'Thorax', radius: 0.12, damageMultiplier: 1 },
      { tag: 'leg', bone: 'FrontLeg2.L', radius: 0.1, damageMultiplier: 0.5 },
    ],
  },
  snake: {
    displayName: 'Gutter Serpent',
    maxHp: 42,
    radius: 0.24,
    touchDps: 8,
    parts: [
      { tag: 'mouth', bone: 'Mouth', radius: 0.1, damageMultiplier: 3, weakPoint: true },
      { tag: 'chest', bone: 'Chest', radius: 0.13, damageMultiplier: 1 },
      { tag: 'tail', bone: 'Tail2', radius: 0.1, damageMultiplier: 0.6 },
    ],
  },
  wasp: {
    displayName: 'Steeple Drone',
    maxHp: 24,
    radius: 0.2,
    touchDps: 9,
    parts: [
      { tag: 'sting', bone: 'Sting', radius: 0.08, damageMultiplier: 3.5, weakPoint: true },
      { tag: 'thorax', bone: 'Thorax', radius: 0.1, damageMultiplier: 1 },
      { tag: 'wing', bone: 'Wing.L', radius: 0.11, damageMultiplier: 0.7 },
    ],
  },
  bat: {
    displayName: 'Steeple Bat',
    maxHp: 22,
    radius: 0.2,
    touchDps: 5,
    parts: [
      { tag: 'head', bone: 'Head', radius: 0.09, damageMultiplier: 2.5, weakPoint: true },
      { tag: 'body', bone: 'Body', radius: 0.11, damageMultiplier: 1 },
      { tag: 'wing', bone: 'Wing2.L', radius: 0.13, damageMultiplier: 0.6 },
    ],
  },
  slime: {
    displayName: 'Drain Coil',
    maxHp: 56,
    radius: 0.3,
    touchDps: 6,
    parts: [
      { tag: 'core', bone: 'Head', radius: 0.14, damageMultiplier: 3, weakPoint: true },
      { tag: 'mass', bone: 'Body', radius: 0.2, damageMultiplier: 1, flatDamage: 2 },
    ],
  },
};

export function canFight(species: SpeciesId): boolean {
  return STATS[species] !== undefined;
}

export class EnemyActor {
  readonly displayName: string;
  readonly parts: EnemyPart[] = [];
  readonly radius: number;
  readonly touchDps: number;
  maxHp: number;
  hp: number;
  dead = false;
  weaknessRevealed = false;

  private hurtFlash = 0;
  private stunTimer = 0;
  private recentDamage = 0;
  private deathAge = 0;
  private glowT = Math.random() * 10;
  private readonly flashables: PBRMaterial[] = [];
  private readonly scratch = new Vector3();

  constructor(readonly creature: Creature) {
    const stats = STATS[creature.species];
    if (!stats) throw new Error(`${creature.species} has no battle stats`);
    this.displayName = stats.displayName;
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.radius = stats.radius;
    this.touchDps = stats.touchDps;

    // Bind each authored part to the real bone. A rig that doesn't have the
    // bone simply doesn't have that part — no invisible stand-ins.
    const bones = new Map<string, TransformNode>();
    for (const node of creature.root.getDescendants(false)) {
      if ('rotationQuaternion' in node) bones.set(node.name.replace(/^.*?-/, ''), node as TransformNode);
    }
    for (const spec of stats.parts) {
      const node = bones.get(spec.bone);
      if (!node) continue;
      this.parts.push({ ...spec, node, active: true });
    }

    for (const mesh of creature.meshes) {
      const mat = mesh.material;
      if (mat instanceof PBRMaterial) this.flashables.push(mat);
    }
  }

  get position(): Vector3 {
    return this.creature.root.position;
  }

  get stunned(): boolean {
    return this.stunTimer > 0;
  }

  /** The corpse has finished sinking — safe to pull from the scene. */
  get deathDone(): boolean {
    return this.dead && this.deathAge >= 2.6;
  }

  /** World position of a part's aim point. */
  aimPoint(part: EnemyPart, into = this.scratch): Vector3 {
    const m = part.node.getWorldMatrix();
    into.set(m.m[12]!, m.m[13]!, m.m[14]!);
    return into;
  }

  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
  }

  /**
   * First blood teaches: from here on the weak points pulse hot, so the player
   * can aim at what they've learned. Learning IS the progression.
   */
  revealWeakness(): void {
    this.weaknessRevealed = true;
  }

  takeHit(amount: number, part: EnemyPart | null): number {
    const dealt = Math.round(part?.flatDamage ?? amount * (part?.damageMultiplier ?? 1));
    this.hp = Math.max(0, this.hp - dealt);
    this.hurtFlash = 0.18;

    // Sustained damage staggers anything.
    this.recentDamage += dealt;
    if (!this.stunned && this.recentDamage >= Math.max(20, this.maxHp * 0.35)) {
      this.stun(1.8);
    }

    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.creature.play('death', false);
    }
    return dealt;
  }

  /** gameDt: frozen with the world during the ATB pause. Returns true if stunned. */
  tickStun(gameDt: number): boolean {
    this.recentDamage = Math.max(0, this.recentDamage - gameDt * 14);
    if (this.stunTimer > 0) {
      this.stunTimer -= gameDt;
      // Dazed judder.
      this.creature.root.rotation.y += Math.sin(this.stunTimer * 26) * 0.05;
      if (this.stunTimer <= 0) this.recentDamage = 0;
      return true;
    }
    return false;
  }

  /** realDt: hurt flash, weak-point glow, and the corpse leaving the street. */
  updateAlways(realDt: number): void {
    if (this.dead) {
      this.deathAge += realDt;
      const sink = Math.max(0, this.deathAge - 1.1);
      if (sink > 0) {
        this.creature.root.position.y -= realDt * 0.5;
        const s = Math.max(0.05, 1 - sink * 0.4);
        this.creature.root.scaling.setAll(s);
      }
      return;
    }

    if (this.hurtFlash > 0) {
      this.hurtFlash -= realDt;
      const on = this.hurtFlash > 0 && Math.floor(this.hurtFlash * 30) % 2 === 0;
      for (const mat of this.flashables) {
        mat.emissiveColor = on ? new Color3(0.55, 0.12, 0.12) : Color3.Black();
      }
      return;
    }

    // Learned weak points pulse — written after the flash so the flash wins.
    if (this.weaknessRevealed) {
      this.glowT += realDt;
      const k = 0.18 + Math.sin(this.glowT * 6) * 0.12;
      for (const mat of this.flashables) {
        mat.emissiveColor = new Color3(k, k * 0.42, k * 0.1);
      }
    }
  }

  dispose(): void {
    this.creature.dispose();
  }
}
