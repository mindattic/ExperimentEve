import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildTorso, pickClothes } from '../afflictedBase';

type State = 'stalk' | 'fold' | 'bite' | 'stuck' | 'rise';

const HIP_Y = 3.0;
const BITE_RANGE = 1.4;

// STILTS — a woman grafted onto heron stilt-legs, three meters tall. Every
// step is a near-fall. When she attacks she folds down like a collapsing
// tripod to bite at ground level, and needs a long moment to unfold again.
export class Gantrylegs extends Afflicted {
  readonly displayName = 'Stilts';
  toppleEvery: [number, number] = [3, 6];

  private state: State = 'stalk';
  private timer = 0.6 + Math.random();
  private t = 0;
  private hitDone = false;
  private readonly hinge = new THREE.Group();
  private readonly torso: THREE.Group;
  private readonly legs: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 28;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    const legMat = makePS1Material({ color: 0x8a7355 });
    const jointMat = makePS1Material({ color: 0x6a5a40 });
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, HIP_Y, 8), legMat);
      leg.position.set(s * 0.16, HIP_Y / 2, 0);
      this.object.add(leg);
      this.legs.push(leg);
      // Knee-height knob: the joint that shouldn't bend this way and does.
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), jointMat);
      knee.position.set(s * 0.16, HIP_Y * 0.55, 0);
      this.object.add(knee);
      // Splayed foot pad at ground level, wide enough to (barely) balance on.
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 6), legMat);
      foot.position.set(s * 0.16, 0.05, 0.02);
      this.object.add(foot);
    }

    this.hinge.position.set(0, HIP_Y, 0);
    this.object.add(this.hinge);
    this.torso = buildTorso(clothes);
    this.hinge.add(this.torso);
    const head = this.torso.children[1]!; // buildTorso order: chest, head, arm, arm

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'head', node: head, radius: 0.2, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    const folded = this.state === 'fold' || this.state === 'bite' || this.state === 'stuck';
    this.parts[1]!.active = folded;

    switch (this.state) {
      case 'stalk': {
        this.object.position.y = Math.abs(Math.sin(this.t * 4)) * 0.18; // deep, near-toppling bob
        this.legs.forEach((leg, i) => {
          leg.rotation.x = Math.sin(this.t * 4 + (i === 0 ? 0 : Math.PI)) * 0.1;
        });
        this.timer -= dt;
        if (dist > BITE_RANGE) {
          this.shamble(dt, ctx.playerPos);
        } else if (this.timer <= 0) {
          this.state = 'fold';
          this.timer = 0.8;
        }
        break;
      }
      case 'fold': {
        // TELEGRAPH: the whole gantry frame buckles forward and down.
        this.object.position.y = 0;
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.hinge.position.y = THREE.MathUtils.lerp(HIP_Y, 0.5, k);
        this.hinge.rotation.x = -k * 1.3;
        this.legs.forEach((leg) => (leg.rotation.x = -k * 0.5));
        if (this.timer <= 0) {
          this.state = 'bite';
          this.timer = 0.15;
          this.hitDone = false;
        }
        break;
      }
      case 'bite': {
        this.timer -= dt;
        if (!this.hitDone && !ctx.playerIFrames && dist < BITE_RANGE) {
          ctx.dealDamageToPlayer(12);
          this.hitDone = true;
        }
        if (this.timer <= 0) {
          this.state = 'stuck';
          this.timer = 1.4;
        }
        break;
      }
      case 'stuck': {
        // Folded flat — the head is a rare, exposed target down here.
        this.timer -= dt;
        this.hinge.position.y = 0.5 + Math.sin(this.t * 10) * 0.02;
        if (this.timer <= 0) {
          this.state = 'rise';
          this.timer = 0.6;
        }
        break;
      }
      case 'rise': {
        this.timer -= dt;
        const k = Math.max(0, this.timer) / 0.6;
        this.hinge.position.y = THREE.MathUtils.lerp(HIP_Y, 0.5, k);
        this.hinge.rotation.x = -k * 1.3;
        this.legs.forEach((leg) => (leg.rotation.x = -k * 0.5));
        if (this.timer <= 0) {
          this.hinge.position.y = HIP_Y;
          this.hinge.rotation.x = 0;
          this.legs.forEach((leg) => (leg.rotation.x = 0));
          this.state = 'stalk';
          this.timer = 0.5 + Math.random();
        }
        break;
      }
    }
  }
}
