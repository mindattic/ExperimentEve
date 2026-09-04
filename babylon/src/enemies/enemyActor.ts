import { Color3, PBRMaterial, Vector3, type TransformNode } from '@babylonjs/core';
import { resolveCircle, type Collider } from '../physics/colliders';
import type { Creature, SpeciesId } from './creature';

// A creature promoted to a battle participant: HP, targetable parts, hurt
// flash, stagger, death — and, since it is in a fight, the will to close the
// distance and swing.
//
// Part targeting hangs off the rig's OWN bones. The Three build had to author
// dummy nodes onto stacks of primitives to have anything to aim at; these packs
// ship real anatomy (Head, Thorax, Abdomen, Sting, Tail, Mouth, Wing), so a
// weak point can be an actual body part that the actual mesh moves. Shooting a
// wasp's sting means shooting the thing that stings.
//
// The attack is deliberately four beats, not one: close, WIND UP, strike,
// recover. The windup is the whole design — it is the window the dodge exists
// to answer, and it is announced three ways at once (the species' own attack
// clip, a hot emissive ramp, its own voice) so a player learns to read the
// animal rather than to read a health bar. Contact damage per second, which is
// what stood here before, can't be dodged, can't be baited, and can't be
// learned; it is a placeholder pretending to be combat.

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

/** What its voice is — the telegraph the player actually learns. */
export type Voice = 'squeak' | 'croak' | 'hiss' | 'chitter' | 'buzz' | 'screech' | 'squelch';

interface SpeciesStats {
  displayName: string;
  maxHp: number;
  radius: number;
  parts: PartSpec[];
  /** How fast it closes on her once the fight is on. */
  speed: number;
  /** Damage on a connected swing. Not per second — per swing. */
  attackDamage: number;
  /** Centre-to-centre distance at which it commits to a swing. */
  reach: number;
  /** Telegraph length. This is the dodge window; it is the difficulty knob. */
  windup: number;
  /** How long it stands in its own follow-through afterwards. */
  recover: number;
  /** Minimum seconds between commits, on top of windup + recover. */
  cooldown: number;
  voice: Voice;
  /** Clip to play while closing. */
  moveClip: string;
  /** Airborne species hold this height and dive to strike. */
  hover?: number;
}

const STATS: Partial<Record<SpeciesId, SpeciesStats>> = {
  rat: {
    displayName: 'Ratchoir Straggler',
    maxHp: 24,
    radius: 0.22,
    // Fast, cheap, and constant. Individually trivial; the point of a rat is
    // that it is never one rat.
    speed: 3.0, attackDamage: 6, reach: 0.85,
    windup: 0.34, recover: 0.34, cooldown: 0.8,
    voice: 'squeak', moveClip: 'run',
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
    // Slow to arrive, slow to commit, and it hurts. The armoured back means a
    // player who panics into centre mass gets nothing for the round.
    speed: 1.7, attackDamage: 10, reach: 1.0,
    windup: 0.52, recover: 0.5, cooldown: 1.1,
    voice: 'croak', moveClip: 'jump',
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
    speed: 2.3, attackDamage: 8, reach: 0.95,
    windup: 0.42, recover: 0.42, cooldown: 0.9,
    voice: 'chitter', moveClip: 'walk',
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
    // The longest reach and the longest tell: it rears, and then it is simply
    // where you were. Readable, and brutal to anyone who reads it late.
    speed: 1.9, attackDamage: 13, reach: 1.3,
    windup: 0.66, recover: 0.55, cooldown: 1.3,
    voice: 'hiss', moveClip: 'walk',
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
    // Hovers out of reach and dives. Glass, but it picks its moment.
    speed: 3.2, attackDamage: 9, reach: 0.95,
    windup: 0.4, recover: 0.5, cooldown: 1.0,
    voice: 'buzz', moveClip: 'flying', hover: 1.25,
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
    speed: 3.5, attackDamage: 5, reach: 0.9,
    windup: 0.28, recover: 0.4, cooldown: 0.85,
    voice: 'screech', moveClip: 'flying', hover: 1.7,
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
    // You can walk away from it. You just can't walk away from it and reload.
    speed: 1.0, attackDamage: 12, reach: 1.05,
    windup: 0.75, recover: 0.7, cooldown: 1.5,
    voice: 'squelch', moveClip: 'walk',
    parts: [
      { tag: 'core', bone: 'Head', radius: 0.14, damageMultiplier: 3, weakPoint: true },
      { tag: 'mass', bone: 'Body', radius: 0.2, damageMultiplier: 1, flatDamage: 2 },
    ],
  },
};

export function canFight(species: SpeciesId): boolean {
  return STATS[species] !== undefined;
}

/** What a creature is doing about her right now. */
export type CombatState = 'close' | 'windup' | 'strike' | 'recover';

/** How long the committed lunge takes to travel, for every species. */
const STRIKE_SECONDS = 0.14;

/** What just happened, for the caller to make noise and light about. */
export type CombatEvent = 'telegraph' | 'strike' | null;

export class EnemyActor {
  readonly displayName: string;
  readonly parts: EnemyPart[] = [];
  readonly radius: number;
  readonly attackDamage: number;
  readonly reach: number;
  readonly voice: Voice;
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

  private readonly stats: SpeciesStats;
  private combat: CombatState = 'close';
  private phaseTimer = 0;
  private cooldownTimer = 0;
  private facing: number;
  /** Which way round her it prowls while it waits its turn. */
  private readonly circleDir = Math.random() < 0.5 ? -1 : 1;
  /** Where she was standing when it committed. A swing goes THERE, not at her. */
  private readonly anchor = new Vector3();

  constructor(readonly creature: Creature) {
    const stats = STATS[creature.species];
    if (!stats) throw new Error(`${creature.species} has no battle stats`);
    this.stats = stats;
    this.displayName = stats.displayName;
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.radius = stats.radius;
    this.attackDamage = stats.attackDamage;
    this.reach = stats.reach;
    this.voice = stats.voice;
    this.facing = creature.root.rotation.y;
    // A fight doesn't start with everything lunging on the same frame.
    this.cooldownTimer = Math.random() * 0.6;

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
    // A stagger eats the swing. Shooting something mid-windup should SAVE her,
    // not merely delay the same hit — otherwise stunning is worth nothing.
    this.combat = 'close';
    this.phaseTimer = 0;
    this.cooldownTimer = Math.max(this.cooldownTimer, 0.35);
  }

  get combatState(): CombatState {
    return this.combat;
  }

  /** Mid-swing, in the sense that matters: it is holding one of the pack's turns. */
  get committed(): boolean {
    return this.combat === 'windup' || this.combat === 'strike';
  }

  /** Mid-telegraph: the window the dodge is for. */
  get telegraphing(): boolean {
    return this.combat === 'windup';
  }

  /**
   * One beat of the fight, on game time — so a menu freezes a raised sting
   * exactly where it is. Returns the moment worth reacting to, if any: the
   * caller owns sound, light, and whether the swing actually connects.
   */
  combatTick(
    gameDt: number,
    target: Vector3,
    colliders: readonly Collider[],
    mayCommit: boolean,
  ): CombatEvent {
    if (this.dead || gameDt <= 0) return null;
    const s = this.stats;
    const pos = this.creature.root.position;
    this.cooldownTimer = Math.max(0, this.cooldownTimer - gameDt);
    this.phaseTimer -= gameDt;

    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    let event: CombatEvent = null;

    switch (this.combat) {
      case 'close': {
        // It turns to face her fast while closing — the tell is the windup,
        // not a slow pirouette she can walk around.
        this.faceToward(dx, dz, gameDt * 9);
        if (dist > s.reach) {
          this.moveAlong(dx, dz, dist, s.speed, gameDt, colliders);
          this.creature.play(s.moveClip) || this.creature.play('idle');
        } else if (!mayCommit) {
          // Its turn hasn't come round. It prowls the edge of its own reach
          // instead of shoving into her, which is what turns six animals into
          // a pack circling her rather than a heap standing on her feet.
          this.prowl(dx, dz, dist, gameDt, colliders);
          this.creature.play(s.moveClip) || this.creature.play('idle');
        } else if (this.cooldownTimer <= 0) {
          this.combat = 'windup';
          this.phaseTimer = s.windup;
          this.anchor.set(target.x, pos.y, target.z);
          // Non-looping: the clip runs through the swing on its own clock, and
          // nothing else is played over it until recovery ends. A species with
          // no attack clip keeps moving rather than freezing mid-pose.
          if (!this.creature.play('attack', false) && !this.creature.play('bite', false)) {
            this.creature.play(s.moveClip) || this.creature.play('idle');
          }
          event = 'telegraph';
        } else {
          this.creature.play('idle') || this.creature.play(s.moveClip);
        }
        break;
      }

      case 'windup': {
        // It coils: coming off her a little, and tracking her only weakly, so
        // moving during the tell is genuinely worth doing. The pull-back is
        // small on purpose — far enough to read as a wind-up, never so far
        // that the creature backs itself out of its own reach.
        this.faceToward(dx, dz, gameDt * 2.5);
        if (dist > 0.05) {
          this.moveAlong(-dx, -dz, dist, s.speed * 0.18, gameDt, colliders);
        }
        if (this.phaseTimer <= 0) {
          this.combat = 'strike';
          this.phaseTimer = STRIKE_SECONDS;
        }
        break;
      }

      case 'strike': {
        // Committed. It goes to where she WAS, at speed, and the blow lands
        // when the body arrives — not when the decision was made. That last
        // fraction of a second is the difference between a dodge that reads as
        // skill and one that reads as a dice roll.
        const ax = this.anchor.x - pos.x;
        const az = this.anchor.z - pos.z;
        const toAnchor = Math.hypot(ax, az);
        if (toAnchor > 0.05) {
          this.moveAlong(ax, az, toAnchor, s.speed * 3.2, gameDt, colliders);
        }
        if (this.phaseTimer <= 0) {
          this.combat = 'recover';
          this.phaseTimer = s.recover;
          event = 'strike'; // the caller decides whether it landed
        }
        break;
      }

      case 'recover': {
        if (this.phaseTimer <= 0) {
          this.combat = 'close';
          this.cooldownTimer = s.cooldown;
        }
        break;
      }
    }

    if (s.hover !== undefined) {
      // Airborne species sit out of reach and drop onto her to swing. That
      // dive IS their telegraph, and it's visible from across the street.
      const diving = this.combat === 'windup' || this.combat === 'strike';
      const want = diving ? 0.75 : s.hover + Math.sin(this.glowT * 2.4) * 0.1;
      pos.y += (want - pos.y) * Math.min(1, gameDt * (diving ? 9 : 3));
    }

    this.creature.root.rotation.y = this.facing;
    return event;
  }

  /** Did the swing that just fired actually reach her? */
  strikeConnects(target: Vector3): boolean {
    const pos = this.creature.root.position;
    // Measured against the anchor's generosity, not her live position: it
    // swings where she was, and a step out of the arc is a clean evasion.
    const dist = Math.hypot(target.x - pos.x, target.z - pos.z);
    return dist <= this.reach + 0.35;
  }

  /** Orbit her at arm's length: tangential, with the radius gently corrected. */
  private prowl(
    dx: number,
    dz: number,
    dist: number,
    dt: number,
    colliders: readonly Collider[],
  ): void {
    if (dist < 1e-4) return;
    const nx = dx / dist;
    const nz = dz / dist;
    // Perpendicular, signed by which way this one happens to circle.
    const tx = -nz * this.circleDir;
    const tz = nx * this.circleDir;
    // Hold station a hair outside its own reach, so committing is a real step.
    const radial = dist - this.stats.reach * 0.92;
    const mx = tx * 0.85 + nx * radial;
    const mz = tz * 0.85 + nz * radial;
    const len = Math.hypot(mx, mz);
    this.moveAlong(mx, mz, len, this.stats.speed * 0.55, dt, colliders);
  }

  private moveAlong(
    dx: number,
    dz: number,
    dist: number,
    speed: number,
    dt: number,
    colliders: readonly Collider[],
  ): void {
    if (dist < 1e-5) return;
    const pos = this.creature.root.position;
    const step = Math.min(speed * dt, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    // Fliers go over the fences and the trash; everything else negotiates them.
    if (this.stats.hover === undefined) resolveCircle(pos, this.radius, colliders, 0);
  }

  private faceToward(dx: number, dz: number, rate: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return;
    const want = Math.atan2(dx, dz);
    let diff = want - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, rate);
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

    this.glowT += realDt;

    // One emissive colour, three claims on it, resolved by urgency: being shot
    // beats being about to bite, which beats the ambient weak-point pulse.
    let tint = Color3.Black();
    if (this.hurtFlash > 0) {
      this.hurtFlash -= realDt;
      const on = this.hurtFlash > 0 && Math.floor(this.hurtFlash * 30) % 2 === 0;
      if (on) tint = new Color3(0.55, 0.12, 0.12);
    } else if (this.combat === 'windup' || this.combat === 'strike') {
      // The telegraph, said a second way for anyone not watching the anatomy:
      // it heats up through the wind-up and is at its brightest as it commits.
      const heat = this.combat === 'strike'
        ? 1
        : 1 - Math.max(0, this.phaseTimer) / Math.max(0.01, this.stats.windup);
      // Kept under the bloom threshold on purpose: it should read as an animal
      // heating up, not as a lamp. Two of these on screen at once is the most
      // the pack rules ever allow, and two lanterns would wash out the street.
      tint = new Color3(0.1 + heat * 0.42, 0.02 + heat * 0.07, 0.02);
    } else if (this.weaknessRevealed) {
      const k = 0.18 + Math.sin(this.glowT * 6) * 0.12;
      tint = new Color3(k, k * 0.42, k * 0.1);
    }
    for (const mat of this.flashables) mat.emissiveColor = tint;
  }

  dispose(): void {
    this.creature.dispose();
  }
}
