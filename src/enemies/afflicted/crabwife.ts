import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'approach' | 'heave' | 'pinch' | 'spin' | 'recover';

// The Afflicted — Crabwife: a woman fused with crab claws too heavy for
// her own arms, so they hang and drag along the ground. Every crushing
// pinch costs her balance — the claw's weight spins her clean around.
export class Crabwife extends Afflicted {
  readonly displayName = 'Crabwife';
  private state: State = 'approach';
  private timer = 0.8 + Math.random() * 0.6;
  private t = 0;
  private clawIdx = 0;
  private pinchDone = false;
  private readonly claws: THREE.Group[] = [];
  private readonly pincers: THREE.Mesh[] = [];
  private readonly face: THREE.Object3D;

  constructor() {
    super();
    this.maxHp = this.hp = 32;
    this.radius = 0.42;
    this.shambleSpeed = 1.3; // the claws slow her down

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    const torso = buildTorso(clothes);
    torso.position.y = 0.86;
    torso.children[2]!.visible = false; // human arms hidden - claws replace them
    torso.children[3]!.visible = false;
    this.face = torso.children[1]!;
    this.object.add(torso);

    const clawMat = makePS1Material({ color: 0xa8412e });
    for (const s of [-1, 1]) {
      const claw = new THREE.Group();
      claw.position.set(s * 0.3, 1.05, 0.02);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 5), clawMat);
      arm.position.y = -0.35;
      claw.add(arm);
      const pincer = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.28), clawMat);
      pincer.position.y = -0.78;
      claw.add(pincer);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), clawMat);
      tip.position.set(0, -0.78, 0.2);
      tip.rotation.x = Math.PI / 2;
      claw.add(tip);
      this.object.add(claw);
      this.claws.push(claw);
      this.pincers.push(pincer);
    }

    this.parts = [
      { tag: 'body', node: torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'face', node: this.face, radius: 0.15, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = false;

    // Idle drag: both claws sway slightly along the ground when not attacking.
    if (this.state === 'approach') {
      for (const claw of this.claws) claw.rotation.x = Math.sin(this.t * 2 + claw.position.x) * 0.06;
    }

    switch (this.state) {
      case 'approach': {
        this.shamble(dt, ctx.playerPos);
        if (dist < 1.6 && this.timer <= 0) {
          this.clawIdx = Math.random() < 0.5 ? 0 : 1;
          this.state = 'heave';
          this.timer = 0.9;
        }
        break;
      }
      case 'heave': {
        // Long, visible struggle: she's fighting the claw's own weight.
        this.parts[1]!.active = true;
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.9;
        const claw = this.claws[this.clawIdx]!;
        claw.rotation.x = -k * 1.7 + Math.sin(this.t * 24) * 0.05 * k;
        if (this.timer <= 0) {
          this.state = 'pinch';
          this.timer = 0.3;
          this.pinchDone = false;
        }
        break;
      }
      case 'pinch': {
        this.parts[1]!.active = true;
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.3;
        const claw = this.claws[this.clawIdx]!;
        claw.rotation.x = -1.7 + k * 2.2;
        const pincer = this.pincers[this.clawIdx]!;
        pincer.scale.z = 1 - Math.sin(k * Math.PI) * 0.4;
        if (!this.pinchDone && k > 0.5 && !ctx.playerIFrames && dist < 1.2) {
          ctx.dealDamageToPlayer(14);
          this.pinchDone = true;
        }
        if (this.timer <= 0) {
          pincer.scale.z = 1;
          this.state = 'spin';
          this.timer = 0.8;
        }
        break;
      }
      case 'spin': {
        // The weight of the claw spins her clean around — vulnerable, dazed.
        this.parts[1]!.active = true;
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.object.rotation.y += dt * ((Math.PI * 2) / 0.8);
        this.claws[this.clawIdx]!.rotation.x = -1.7 * (1 - k);
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.6 + Math.random() * 0.5;
        }
        break;
      }
      case 'recover': {
        this.shamble(dt, ctx.playerPos);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.6 + Math.random() * 0.6;
        }
        break;
      }
    }
  }

  private facePlayer(ctx: BattleContext): void {
    const dir = ctx.playerPos.clone().sub(this.object.position).setY(0);
    if (dir.lengthSq() > 0.0001) this.object.rotation.y = Math.atan2(dir.x, dir.z);
  }
}
