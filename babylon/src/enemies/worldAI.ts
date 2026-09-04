import { Vector3, type Scene } from '@babylonjs/core';
import { resolveCircle, type Collider } from '../physics/colliders';
import { Creature, type SpeciesId } from './creature';

// EVEGDD Ch.4, first layer: the district's wildlife wanders, notices her, and
// reacts on its own account. Rule 11 is "The World Is at War With Itself" — the
// player is one more participant, not the centre — so nothing here waits to be
// interacted with.
//
// This is the wandering-and-reaction layer only. The rest of the STALKER-scaled
// simulation the design calls for (packs, rival factions, corpse-eating and
// growth, nests restocking a species, the noise/alarm propagation) is not built
// yet and must not be described as if it were.

type Reaction = 'flee' | 'stalk' | 'hold';

interface Profile {
  speed: number;
  /** How far off she has to be before it stops caring. */
  notice: number;
  reaction: Reaction;
  /** How far it will stray from where it was spawned. */
  range: number;
  /** Body radius for collision. */
  radius: number;
  /** Clip to play while moving — not every species has a walk. */
  moveClip: string;
  /** How close a stalker gets before it holds and threatens. */
  strike?: number;
  /** Airborne species ignore ground clutter and hover. */
  hover?: number;
}

const PROFILES: Record<SpeciesId, Profile> = {
  rat: { speed: 2.4, notice: 5.5, reaction: 'flee', range: 7, radius: 0.16, moveClip: 'run' },
  frog: { speed: 0.9, notice: 3.2, reaction: 'flee', range: 4, radius: 0.2, moveClip: 'jump' },
  snake: { speed: 1.1, notice: 4.0, reaction: 'stalk', range: 5, radius: 0.2, moveClip: 'walk', strike: 1.3 },
  spider: { speed: 1.6, notice: 6.0, reaction: 'stalk', range: 8, radius: 0.22, moveClip: 'walk', strike: 1.1 },
  wasp: { speed: 2.0, notice: 5.0, reaction: 'stalk', range: 6, radius: 0.18, moveClip: 'flying', strike: 1.4, hover: 1.3 },
  bat: { speed: 2.6, notice: 7.0, reaction: 'flee', range: 10, radius: 0.18, moveClip: 'flying', hover: 2.4 },
  slime: { speed: 0.7, notice: 3.5, reaction: 'stalk', range: 3, radius: 0.26, moveClip: 'walk', strike: 1.0 },
  fish1: { speed: 1.2, notice: 3.0, reaction: 'hold', range: 4, radius: 0.16, moveClip: 'swim' },
  fish2: { speed: 1.2, notice: 3.0, reaction: 'hold', range: 4, radius: 0.16, moveClip: 'swim' },
  shark: { speed: 2.2, notice: 6.0, reaction: 'hold', range: 12, radius: 0.4, moveClip: 'swim' },
  mantaRay: { speed: 1.4, notice: 4.0, reaction: 'hold', range: 10, radius: 0.3, moveClip: 'swim' },
};

type State = 'rest' | 'roam' | 'react' | 'threaten';

class Wanderer {
  private state: State = 'rest';
  private timer = Math.random() * 2.5;
  private readonly home: Vector3;
  private readonly goal = new Vector3();
  private readonly step = new Vector3();
  private facing: number;

  constructor(readonly creature: Creature, private readonly profile: Profile) {
    this.home = creature.root.position.clone();
    this.facing = creature.root.rotation.y;
  }

  get position(): Vector3 {
    return this.creature.root.position;
  }

  get debugState(): string {
    return this.state;
  }

  update(dt: number, player: Vector3, colliders: readonly Collider[]): void {
    const p = this.profile;
    const pos = this.creature.root.position;
    const dx = pos.x - player.x;
    const dz = pos.z - player.z;
    const distToPlayer = Math.hypot(dx, dz);
    const noticed = distToPlayer < p.notice;

    this.timer -= dt;

    if (noticed && p.reaction !== 'hold') {
      const strike = p.strike ?? 0;
      if (p.reaction === 'stalk' && distToPlayer <= strike) {
        // Close enough to be a problem. It has no attack to land until the
        // battle system exists, so it holds and telegraphs.
        this.state = 'threaten';
      } else {
        this.state = 'react';
      }
    } else if (this.state === 'react' || this.state === 'threaten') {
      // Lost interest; take a beat before wandering off again.
      this.state = 'rest';
      this.timer = 0.6 + Math.random();
    }

    switch (this.state) {
      case 'rest':
        if (this.timer <= 0) {
          this.pickGoal();
          this.state = 'roam';
          this.timer = 2 + Math.random() * 4;
        }
        this.creature.play('idle') || this.creature.play(p.moveClip);
        break;

      case 'roam': {
        const arrived = this.moveToward(this.goal, p.speed * 0.55, dt, colliders);
        if (arrived || this.timer <= 0) {
          this.state = 'rest';
          this.timer = 1.5 + Math.random() * 3;
        }
        this.creature.play(p.moveClip);
        break;
      }

      case 'react': {
        if (p.reaction === 'flee') {
          // Straight away from her, but bounded by how far home it will stray.
          const away = Math.hypot(dx, dz) || 1;
          this.goal.set(
            clamp(pos.x + (dx / away) * 3, this.home.x - p.range, this.home.x + p.range),
            pos.y,
            clamp(pos.z + (dz / away) * 3, this.home.z - p.range, this.home.z + p.range),
          );
        } else {
          this.goal.set(player.x, pos.y, player.z);
        }
        this.moveToward(this.goal, p.speed, dt, colliders);
        this.creature.play(p.moveClip);
        break;
      }

      case 'threaten':
        this.faceToward(player.x - pos.x, player.z - pos.z, dt * 8);
        this.creature.play('attack') || this.creature.play('idle');
        break;
    }

    if (p.hover !== undefined) {
      // Airborne species bob rather than walk.
      pos.y = p.hover + Math.sin(performance.now() * 0.003 + this.home.x) * 0.12;
    }
    this.creature.root.rotation.y = this.facing;
  }

  private pickGoal(): void {
    const p = this.profile;
    const angle = Math.random() * Math.PI * 2;
    const reach = p.range * (0.35 + Math.random() * 0.65);
    this.goal.set(
      this.home.x + Math.cos(angle) * reach,
      this.creature.root.position.y,
      this.home.z + Math.sin(angle) * reach,
    );
  }

  /** Returns true once it's effectively standing on the goal. */
  private moveToward(
    goal: Vector3,
    speed: number,
    dt: number,
    colliders: readonly Collider[],
  ): boolean {
    const pos = this.creature.root.position;
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) return true;

    this.step.set((dx / dist) * speed * dt, 0, (dz / dist) * speed * dt);
    pos.x += this.step.x;
    pos.z += this.step.z;
    // Airborne species fly over the fences and the trash.
    if (this.profile.hover === undefined) {
      resolveCircle(pos, this.profile.radius, colliders, 0);
    }
    this.faceToward(dx, dz, dt * 6);
    return false;
  }

  private faceToward(dx: number, dz: number, rate: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return;
    const want = Math.atan2(dx, dz);
    let diff = want - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, rate);
  }
}

export class WorldAI {
  private wanderers: Wanderer[] = [];

  constructor(private scene: Scene) {}

  /** Spawn a creature that then lives on its own. */
  async spawn(species: SpeciesId, x: number, z: number, facing = 0): Promise<Creature> {
    const creature = await Creature.spawn(this.scene, species, x, z, facing);
    this.wanderers.push(new Wanderer(creature, PROFILES[species]));
    return creature;
  }

  update(dt: number, player: Vector3, colliders: readonly Collider[]): void {
    for (const wanderer of this.wanderers) wanderer.update(dt, player, colliders);
  }

  /** Creatures within `radius` of a point — the encounter trigger's eyes. */
  near(point: Vector3, radius: number): Creature[] {
    const found: Creature[] = [];
    for (const wanderer of this.wanderers) {
      const dx = wanderer.position.x - point.x;
      const dz = wanderer.position.z - point.z;
      if (Math.hypot(dx, dz) <= radius) found.push(wanderer.creature);
    }
    return found;
  }

  /** Stop simulating one: the battle system is driving it now. */
  detach(creature: Creature): void {
    this.wanderers = this.wanderers.filter((w) => w.creature !== creature);
  }

  /** Take a survivor back into the world sim, where it stands. */
  attach(creature: Creature): void {
    if (this.wanderers.some((w) => w.creature === creature)) return;
    this.wanderers.push(new Wanderer(creature, PROFILES[creature.species]));
  }

  get population(): number {
    return this.wanderers.length;
  }

  /** For the headless harness: who is where, doing what. */
  get census(): unknown[] {
    return this.wanderers.map((w) => ({
      species: w.creature.species,
      state: w.debugState,
      x: Number(w.position.x.toFixed(2)),
      z: Number(w.position.z.toFixed(2)),
    }));
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
