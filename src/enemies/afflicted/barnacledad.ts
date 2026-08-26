import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';

type State = 'approach' | 'leanback' | 'flop' | 'recover';

const FLOP_RANGE = 1.3;
const FLOP_LUNGE = 1.0;

// BARNACLE DAD — a heavyset man crusted shut in barnacles, arms sealed to
// his sides. He can't grab, can't punch — only headbutt, a full-body flop
// that leaves him flat on the ground more often than not.
export class Barnacledad extends Afflicted {
  readonly displayName = 'Barnacle Dad';
  toppleEvery: [number, number] = [2, 3];

  private state: State = 'approach';
  private timer = 0.6 + Math.random();
  private hitDone = false;
  private lungeDir = new THREE.Vector3(0, 0, 1);
  private readonly torso: THREE.Group;
  private readonly heart: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 32;
    this.radius = 0.44;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.86;
    this.object.add(this.torso);

    const barnacleMat = makePS1Material({ color: 0x8a8a86 });
    const spots: readonly [number, number, number][] = [
      [-0.12, 0.35, 0.14], [0.13, 0.3, 0.15], [0, 0.15, 0.16],
      [-0.1, 0.1, 0.14], [0.12, 0.4, 0.1], [-0.05, 0.44, 0.12],
    ];
    for (const [x, y, z] of spots) {
      const lump = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.03, 5, 4), barnacleMat);
      lump.position.set(x, y, z);
      this.torso.add(lump);
    }

    const heartMat = new THREE.MeshLambertMaterial({ color: 0x8a8a86, emissive: 0x552211, flatShading: true });
    this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.075, 5, 4), heartMat);
    this.heart.position.set(0.02, 0.28, 0.17);
    this.torso.add(this.heart);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.44, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'glowing barnacle', node: this.heart, radius: 0.15, damageMultiplier: 4, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    const dist = this.object.position.distanceTo(ctx.playerPos);

    switch (this.state) {
      case 'approach': {
        this.timer -= dt;
        if (dist > FLOP_RANGE + 0.6) {
          this.shamble(dt, ctx.playerPos);
        } else if (this.timer <= 0) {
          this.state = 'leanback';
          this.timer = 0.7;
          this.lungeDir = ctx.playerPos.clone().sub(this.object.position).setY(0).normalize();
        }
        break;
      }
      case 'leanback': {
        // TELEGRAPH: he rocks back, sealed arms useless, gathering weight.
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.7;
        this.object.rotation.x = -k * 0.4;
        if (this.timer <= 0) {
          this.state = 'flop';
          this.timer = 0.3;
          this.hitDone = false;
        }
        break;
      }
      case 'flop': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.3;
        this.object.rotation.x = THREE.MathUtils.lerp(-0.4, 0.5, k);
        this.object.position.addScaledVector(this.lungeDir, (FLOP_LUNGE / 0.3) * dt);
        if (!this.hitDone && !ctx.playerIFrames && dist < FLOP_RANGE) {
          ctx.dealDamageToPlayer(13);
          this.hitDone = true;
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.object.rotation.x += (0 - this.object.rotation.x) * Math.min(1, dt * 4);
        if (this.timer <= 0) {
          this.object.rotation.x = 0;
          this.state = 'approach';
          this.timer = 0.6 + Math.random();
        }
        break;
      }
    }
  }
}
