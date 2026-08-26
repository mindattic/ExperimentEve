import * as THREE from 'three';
import type { Enemy } from './enemyBase';
import { spawnEnemy } from './registry';
import { makePS1Material } from '../render/ps1/ps1Material';
import { resolveCircle, lineBlocked, type Collider } from '../physics/colliders';

// A-Life, STALKER scaled way down: chimeras wander the district, hunt in
// packs, fight other factions to the death or until morale breaks, eat what
// they kill (growth stages), and nests keep the streets stocked. The player
// is just one more participant — walking into a hunt pulls it into battle.

export interface WandererDef {
  species: string;
  x: number;
  z: number;
  region: { minX: number; minZ: number; maxX: number; maxZ: number };
  packId?: string;
  /** hunters pull the player into battle; skittish ones bolt instead. */
  aggro?: 'hunter' | 'skittish';
}

export interface NestDef {
  species: string;
  x: number;
  z: number;
  capacity: number;
  intervalSec: number;
  region: WandererDef['region'];
}

type WMode = 'wander' | 'fight' | 'flee' | 'chase' | 'eat';

interface Wanderer {
  enemy: Enemy;
  def: WandererDef;
  mode: WMode;
  target: THREE.Vector3;
  opponent: Wanderer | null;
  attackCooldown: number;
  modeTimer: number;
  growthStage: number; // 0 juvenile-ish, grows by eating
  eatTarget: Corpse | null;
  speed: number;
}

interface Corpse {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  timer: number;
  eaten: boolean;
}

interface Nest {
  def: NestDef;
  mesh: THREE.Object3D;
  timer: number;
  alive: Wanderer[];
  destroyed: boolean;
}

interface Rat {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  alive: boolean;
}

const FIGHT_RANGE = 6;
const ATTACK_RANGE = 1.3;
const MORALE_FRACTION = 0.3;

export class WorldAI {
  private wanderers: Wanderer[] = [];
  private corpses: Corpse[] = [];
  private nests: Nest[] = [];
  private rats: Rat[] = [];
  /** Set when a wanderer reaches the player: main starts a battle with them. */
  onPlayerContact: ((enemies: Enemy[]) => void) | null = null;

  /** Burn/destroy the nearest nest within `radius`. Returns true if one died. */
  destroyNestNear(x: number, z: number, radius = 2.5): boolean {
    for (const n of this.nests) {
      if (!n.destroyed && Math.hypot(n.def.x - x, n.def.z - z) < radius) {
        n.destroyed = true;
        // Scorch: flatten and blacken the clutch.
        n.mesh.scale.set(1.1, 0.25, 1.1);
        n.mesh.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
          if (m?.isMeshLambertMaterial) m.color.setHex(0x1c1814);
        });
        return true;
      }
    }
    return false;
  }

  private readonly alarmPos = new THREE.Vector3();
  private alarmTimer = 0;

  /** Fire alarm pulled: every wanderer in earshot converges on the sound. */
  ring(x: number, z: number, durationSec: number): void {
    this.alarmPos.set(x, 0, z);
    this.alarmTimer = durationSec;
  }

  /** Dev/test visibility into the sim. */
  debugSnapshot(): { species: string; mode: WMode; hp: number; x: number; z: number; stage: number }[] {
    return this.wanderers.map((w) => ({
      species: w.def.species,
      mode: w.mode,
      hp: Math.round(w.enemy.hp),
      x: Math.round(w.enemy.object.position.x * 10) / 10,
      z: Math.round(w.enemy.object.position.z * 10) / 10,
      stage: w.growthStage,
    }));
  }

  constructor(private readonly scene: THREE.Scene) {}

  addWanderer(def: WandererDef): Wanderer | null {
    const enemy = spawnEnemy(def.species);
    if (!enemy) return null;
    enemy.object.position.set(def.x, 0, def.z);
    this.scene.add(enemy.object);
    const w: Wanderer = {
      enemy,
      def,
      mode: 'wander',
      target: new THREE.Vector3(def.x, 0, def.z),
      opponent: null,
      attackCooldown: 0,
      modeTimer: 0,
      growthStage: 1,
      eatTarget: null,
      speed: 1.4 + Math.random() * 0.6,
    };
    this.pickWanderTarget(w);
    this.wanderers.push(w);
    return w;
  }

  addNest(def: NestDef): void {
    const mesh = new THREE.Group();
    const clutch = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 7, 5),
      makePS1Material({ color: 0x6a5a6e }),
    );
    clutch.scale.y = 0.55;
    clutch.position.y = 0.25;
    mesh.add(clutch);
    for (let i = 0; i < 4; i++) {
      const egg = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 5, 4),
        makePS1Material({ color: 0x8a7a8e }),
      );
      egg.position.set(Math.sin(i * 2.1) * 0.35, 0.55, Math.cos(i * 2.1) * 0.35);
      mesh.add(egg);
    }
    mesh.position.set(def.x, 0, def.z);
    this.scene.add(mesh);
    this.nests.push({ def, mesh, timer: def.intervalSec * 0.5, alive: [], destroyed: false });
  }

  addRats(count: number, cx: number, cz: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 5, 4),
        makePS1Material({ color: 0x4a4440 }),
      );
      body.scale.set(1, 0.8, 1.5);
      body.position.y = 0.08;
      mesh.add(body);
      mesh.position.set(cx + (Math.random() - 0.5) * spread, 0, cz + (Math.random() - 0.5) * spread);
      this.scene.add(mesh);
      this.rats.push({ mesh, vel: new THREE.Vector3(), alive: true });
    }
  }

  /** Remove a wanderer from the sim (it moved into a battle). */
  extract(enemy: Enemy): void {
    this.wanderers = this.wanderers.filter((w) => w.enemy !== enemy);
  }

  /** Lighthouse rule: reset wanderers/nest stock; destroyed nests stay dead. */
  resetOnSave(): void {
    for (const w of this.wanderers) this.scene.remove(w.enemy.object);
    this.wanderers = [];
    for (const n of this.nests) {
      if (!n.destroyed) n.timer = 2;
      n.alive = [];
    }
  }

  update(gameDt: number, playerPos: THREE.Vector3, colliders: readonly Collider[], playerInBattle: boolean): void {
    if (gameDt <= 0) return;
    this.alarmTimer = Math.max(0, this.alarmTimer - gameDt);

    // Nests spawn juveniles up to capacity.
    for (const n of this.nests) {
      if (n.destroyed) continue;
      n.alive = n.alive.filter((w) => !w.enemy.dead && this.wanderers.includes(w));
      if (n.alive.length < n.def.capacity) {
        n.timer -= gameDt;
        if (n.timer <= 0) {
          n.timer = n.def.intervalSec;
          const w = this.addWanderer({
            species: n.def.species,
            x: n.def.x + (Math.random() - 0.5) * 2,
            z: n.def.z + (Math.random() - 0.5) * 2,
            region: n.def.region,
            packId: `nest:${n.def.x},${n.def.z}`,
          });
          if (w) {
            w.growthStage = 0; // juvenile
            w.enemy.hp = Math.round(w.enemy.maxHp * 0.6);
            w.enemy.object.scale.setScalar(0.6);
            n.alive.push(w);
          }
        }
      }
    }

    // Corpses rot away.
    for (const c of this.corpses) {
      c.timer -= gameDt;
      if (c.timer <= 0 && !c.eaten) {
        c.eaten = true;
        this.scene.remove(c.mesh);
      }
    }
    this.corpses = this.corpses.filter((c) => !c.eaten);

    for (const w of this.wanderers) {
      if (w.enemy.dead) continue;
      w.attackCooldown = Math.max(0, w.attackCooldown - gameDt);
      w.modeTimer -= gameDt;
      const pos = w.enemy.object.position;

      // Spot cross-faction enemies.
      if (w.mode === 'wander' || w.mode === 'chase') {
        const foe = this.findFoe(w);
        if (foe) {
          w.mode = 'fight';
          w.opponent = foe;
        }
      }

      // Skittish species bolt from the player instead of engaging.
      if (
        (w.def.aggro ?? 'hunter') === 'skittish' &&
        w.mode === 'wander' &&
        pos.distanceTo(playerPos) < 4
      ) {
        w.mode = 'flee';
        w.opponent = null;
        w.modeTimer = 2.5;
      }
      // Player contact pulls the hunt into a real battle (needs sightline —
      // no aggro through house walls).
      if (
        !playerInBattle &&
        (w.def.aggro ?? 'hunter') === 'hunter' &&
        pos.distanceTo(playerPos) < 3.2 &&
        !lineBlocked(pos.x, pos.z, playerPos.x, playerPos.z, colliders)
      ) {
        const packmates = this.wanderers.filter(
          (o) => o !== w && !o.enemy.dead && o.def.packId && o.def.packId === w.def.packId &&
            o.enemy.object.position.distanceTo(pos) < 9,
        );
        const group = [w, ...packmates];
        for (const g of group) this.extract(g.enemy);
        this.onPlayerContact?.(group.map((g) => g.enemy));
        continue;
      }

      switch (w.mode) {
        case 'wander': {
          if (this.alarmTimer > 0 && pos.distanceTo(this.alarmPos) < 40) {
            // The alarm owns everyone's ears. Regions don't matter right now.
            this.stepToward(w, this.alarmPos, w.speed * 1.7, gameDt, colliders);
            break;
          }
          this.stepToward(w, w.target, w.speed, gameDt, colliders);
          if (pos.distanceTo(w.target) < 0.8 || w.modeTimer <= 0) this.pickWanderTarget(w);
          break;
        }
        case 'fight': {
          const foe = w.opponent;
          if (!foe || foe.enemy.dead) {
            // Victory: eat if there's a corpse nearby.
            w.opponent = null;
            const corpse = this.corpses.find((c) => !c.eaten && c.pos.distanceTo(pos) < 4);
            if (corpse) {
              w.mode = 'eat';
              w.eatTarget = corpse;
              w.modeTimer = 3;
            } else {
              w.mode = 'wander';
              this.pickWanderTarget(w);
            }
            break;
          }
          // Morale: badly hurt → flee.
          if (w.enemy.hp < w.enemy.maxHp * MORALE_FRACTION) {
            w.mode = 'flee';
            w.modeTimer = 4;
            // Winner may give chase.
            if (!foe.enemy.dead && Math.random() < 0.5) {
              foe.mode = 'chase';
              foe.opponent = w;
              foe.modeTimer = 4;
            }
            break;
          }
          const foePos = foe.enemy.object.position;
          if (pos.distanceTo(foePos) > ATTACK_RANGE) {
            this.stepToward(w, foePos, w.speed * 1.5, gameDt, colliders);
          } else if (w.attackCooldown <= 0) {
            w.attackCooldown = 1.1 + Math.random() * 0.5;
            const dmg = (6 + w.growthStage * 4) * (0.8 + Math.random() * 0.4);
            foe.enemy.takeHit(dmg, null);
            if (foe.enemy.dead) this.onWandererKilled(foe);
          }
          break;
        }
        case 'flee': {
          const threat = w.opponent?.enemy.object.position ?? playerPos;
          const away = pos.clone().sub(threat).setY(0).normalize().multiplyScalar(10).add(pos);
          this.stepToward(w, away, w.speed * 2, gameDt, colliders);
          if (w.modeTimer <= 0) {
            w.mode = 'wander';
            w.opponent = null;
            this.pickWanderTarget(w);
          }
          break;
        }
        case 'chase': {
          const prey = w.opponent;
          if (!prey || prey.enemy.dead || w.modeTimer <= 0) {
            w.mode = 'wander';
            w.opponent = null;
            this.pickWanderTarget(w);
            break;
          }
          const preyPos = prey.enemy.object.position;
          this.stepToward(w, preyPos, w.speed * 1.9, gameDt, colliders);
          if (pos.distanceTo(preyPos) < ATTACK_RANGE && w.attackCooldown <= 0) {
            w.attackCooldown = 1.1;
            prey.enemy.takeHit(8 + w.growthStage * 4, null);
            if (prey.enemy.dead) this.onWandererKilled(prey);
          }
          break;
        }
        case 'eat': {
          const c = w.eatTarget;
          if (!c || c.eaten) {
            w.mode = 'wander';
            break;
          }
          if (pos.distanceTo(c.pos) > 1.2) {
            this.stepToward(w, c.pos, w.speed, gameDt, colliders);
          } else if (w.modeTimer <= 0) {
            // CONSUMPTION → GROWTH.
            c.eaten = true;
            this.scene.remove(c.mesh);
            this.grow(w);
            w.mode = 'wander';
            this.pickWanderTarget(w);
          }
          break;
        }
      }

      // Rats get eaten in passing.
      for (const r of this.rats) {
        if (r.alive && r.mesh.position.distanceTo(pos) < 0.7) {
          r.alive = false;
          this.scene.remove(r.mesh);
          this.grow(w, 0.5);
        }
      }
    }

    // Rats scatter from everything.
    for (const r of this.rats) {
      if (!r.alive) continue;
      const fromPlayer = r.mesh.position.clone().sub(playerPos).setY(0);
      const d = fromPlayer.length();
      if (d < 3) {
        r.vel.add(fromPlayer.normalize().multiplyScalar(6 * gameDt));
      }
      r.vel.multiplyScalar(Math.max(0, 1 - gameDt * 2));
      if (r.vel.lengthSq() > 9) r.vel.setLength(3);
      r.mesh.position.addScaledVector(r.vel, gameDt);
      if (r.vel.lengthSq() > 0.05) {
        r.mesh.rotation.y = Math.atan2(r.vel.x, r.vel.z);
      }
    }

    this.wanderers = this.wanderers.filter((w) => !w.enemy.dead);
  }

  private grow(w: Wanderer, amount = 1): void {
    w.growthStage += amount;
    const scale = Math.min(2.2, 0.6 + w.growthStage * 0.35);
    w.enemy.object.scale.setScalar(scale);
    w.enemy.maxHp = Math.round(w.enemy.maxHp * (1 + 0.25 * amount));
    w.enemy.hp = Math.min(w.enemy.maxHp, w.enemy.hp + Math.round(w.enemy.maxHp * 0.3));
  }

  private onWandererKilled(w: Wanderer): void {
    this.scene.remove(w.enemy.object);
    const corpse = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 6, 4),
      makePS1Material({ color: 0x3a2f2c }),
    );
    corpse.scale.set(1.4, 0.35, 1.4);
    corpse.position.copy(w.enemy.object.position).setY(0.12);
    this.scene.add(corpse);
    this.corpses.push({
      mesh: corpse,
      pos: corpse.position.clone(),
      timer: 25,
      eaten: false,
    });
  }

  private findFoe(w: Wanderer): Wanderer | null {
    let best: Wanderer | null = null;
    let bestD = FIGHT_RANGE;
    for (const o of this.wanderers) {
      if (o === w || o.enemy.dead || o.enemy.faction === w.enemy.faction) continue;
      const d = o.enemy.object.position.distanceTo(w.enemy.object.position);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  private pickWanderTarget(w: Wanderer): void {
    const r = w.def.region;
    w.target.set(
      r.minX + Math.random() * (r.maxX - r.minX),
      0,
      r.minZ + Math.random() * (r.maxZ - r.minZ),
    );
    w.modeTimer = 4 + Math.random() * 5;
  }

  private stepToward(
    w: Wanderer,
    target: THREE.Vector3,
    speed: number,
    dt: number,
    colliders: readonly Collider[],
  ): void {
    const pos = w.enemy.object.position;
    const dir = target.clone().sub(pos).setY(0);
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize();
    pos.addScaledVector(dir, speed * dt);
    resolveCircle(pos, w.enemy.radius, colliders);
    w.enemy.object.rotation.y = Math.atan2(dir.x, dir.z);
  }
}
