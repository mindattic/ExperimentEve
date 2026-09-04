import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';

type State = 'approach' | 'telegraph' | 'burst' | 'return' | 'cooldown';

const BURST_TIME = 0.35;
const RETURN_TIME = 2.0;
// Local (pre-rotation) directions the three pigeons fan out along.
const OUT_DIRS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.55, 0, 0.85).normalize(),
  new THREE.Vector3(0, 0, 1).normalize(),
  new THREE.Vector3(0.55, 0, 0.85).normalize(),
];

// PIGEONCHEST — a man whose ribcage caved in and became a roost. Small grey
// pigeons nest where his chest should be. He grips his own ribs, and the
// flock bursts out in a startled spread before straggling home one by one.
export class Pigeonchest extends Afflicted {
  readonly displayName = 'Pigeonchest';

  private state: State = 'approach';
  private timer = 0.6 + Math.random() * 0.8;
  private t = 0;
  private readonly torso: THREE.Group;
  private readonly chestY: number;
  private readonly pigeons: THREE.Mesh[] = [];
  private readonly hit: boolean[] = [false, false, false];
  private readonly cavity: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 22;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.86;
    this.object.add(this.torso);
    this.chestY = 0.3;

    const cavityMat = makePS1Material({ color: 0x1a1512 });
    this.cavity = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), cavityMat);
    this.cavity.position.set(0, this.chestY, 0.08);
    this.cavity.visible = false;
    this.torso.add(this.cavity);
    // Broken rib edges framing the cavity — the roost's doorway.
    const ribMat = makePS1Material({ color: 0xe8e0d0 });
    for (const s of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.16, 5), ribMat);
      rib.rotation.z = s * 0.9;
      rib.position.set(s * 0.1, this.chestY + 0.02, 0.1);
      this.cavity.add(rib);
    }

    const pigeonMat = makePS1Material({ color: 0x9a9aa2 });
    const beakMat = makePS1Material({ color: 0x8a6a2a });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), pigeonMat);
      p.position.set(0, this.chestY, 0.1);
      this.torso.add(p);
      this.pigeons.push(p);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 5), beakMat);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.01, 0.09);
      p.add(beak);
    }

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'chest cavity', node: this.cavity, radius: 0.22, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    const exposed = this.state === 'burst' || this.state === 'return';
    this.parts[1]!.active = exposed;
    this.cavity.visible = exposed;

    switch (this.state) {
      case 'approach': {
        for (const p of this.pigeons) p.position.y = this.chestY + Math.sin(this.t * 5) * 0.01;
        if (dist > 1.8) {
          this.shamble(dt, ctx.playerPos);
        } else if (this.timer <= 0) {
          this.state = 'telegraph';
          this.timer = 0.7;
        }
        break;
      }
      case 'telegraph': {
        // TELEGRAPH: he grips his own ribs, chest juddering.
        const k = 1 - Math.max(0, this.timer) / 0.7;
        this.torso.rotation.x = -k * 0.15;
        for (const p of this.pigeons) p.scale.setScalar(1 + Math.sin(this.t * 30) * 0.08 * k);
        if (this.timer <= 0) {
          this.state = 'burst';
          this.timer = BURST_TIME;
          this.hit[0] = this.hit[1] = this.hit[2] = false;
          this.checkBurstHits(ctx);
        }
        break;
      }
      case 'burst': {
        this.torso.rotation.x = 0;
        const k = 1 - Math.max(0, this.timer) / BURST_TIME;
        this.pigeons.forEach((p, i) => {
          const dir = OUT_DIRS[i]!;
          p.position.set(dir.x * 1.5 * k, this.chestY + dir.z * 0.1 * k, 0.1 + dir.z * 1.5 * k);
        });
        if (this.timer <= 0) {
          this.state = 'return';
          this.timer = RETURN_TIME;
        }
        break;
      }
      case 'return': {
        // Pigeons straggle home one by one across the return window.
        const elapsed = RETURN_TIME - Math.max(0, this.timer);
        this.pigeons.forEach((p, i) => {
          const dir = OUT_DIRS[i]!;
          const startAt = i * (RETURN_TIME / 3.4);
          const k = Math.min(1, Math.max(0, (elapsed - startAt) / 0.5));
          p.position.set(dir.x * 1.5 * (1 - k), this.chestY + dir.z * 0.1 * (1 - k), 0.1 + dir.z * 1.5 * (1 - k));
        });
        if (this.timer <= 0) {
          this.state = 'cooldown';
          this.timer = 0.8;
        }
        break;
      }
      case 'cooldown': {
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.6 + Math.random() * 0.8;
        }
        break;
      }
    }
  }

  private checkBurstHits(ctx: BattleContext): void {
    if (ctx.playerIFrames) return;
    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 2.5 || dist < 0.01) return;
    const flat = toPlayer.clone().normalize();
    OUT_DIRS.forEach((dir, i) => {
      const world = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.object.rotation.y).normalize();
      if (!this.hit[i] && world.dot(flat) > 0.85) {
        ctx.dealDamageToPlayer(5);
        this.hit[i] = true;
      }
    });
  }
}
