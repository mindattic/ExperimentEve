import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'approach' | 'haunchLower' | 'pounce' | 'recover';

// The Afflicted — Houndfather: a man whose arms became a hound's forelegs,
// so he runs on all fours with a gait that's just WRONG — bobbing off-beat,
// too fast, too eager. He still wears his old dog's collar. Fastest of them.
export class Houndfather extends Afflicted {
  readonly displayName = 'Houndfather';
  private state: State = 'approach';
  private timer = 0.6 + Math.random() * 0.8;
  private t = 0;
  private pounceHit = false;
  private readonly pounceVel = new THREE.Vector3();
  private readonly torso: THREE.Group;
  private readonly collar: THREE.Object3D;
  private readonly forelegs: THREE.Group[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 30;
    this.radius = 0.42;
    this.shambleSpeed = 2.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    this.torso = buildTorso(clothes);
    this.torso.position.set(0, 0.5, 0.22);
    this.torso.rotation.x = 1.15; // pitched forward - runs on all fours
    this.torso.children[2]!.visible = false; // human arms hidden - forelegs replace them
    this.torso.children[3]!.visible = false;
    this.object.add(this.torso);

    this.collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8),
      makePS1Material({ color: 0x8a1f1f }),
    );
    this.collar.rotation.x = Math.PI / 2;
    this.collar.position.set(0, 0.56, 0);
    this.torso.add(this.collar);

    const legMat = makePS1Material({ color: 0x4a3a2c });
    for (const s of [-1, 1]) {
      const foreleg = new THREE.Group();
      foreleg.position.set(s * 0.18, 0.55, 0.35);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 5), legMat);
      upper.position.y = -0.15;
      foreleg.add(upper);
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), legMat);
      paw.position.y = -0.38;
      foreleg.add(paw);
      this.object.add(foreleg);
      this.forelegs.push(foreleg);
    }

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.42, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'collar', node: this.collar, radius: 0.16, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'haunchLower' || this.state === 'pounce';

    // The wrong, syncopated gait: two off-phase bobs layered together.
    const bob = Math.sin(this.t * 15) * 0.02 + Math.sin(this.t * 15 * 1.6 + 1.1) * 0.015;
    this.forelegs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.t * 15 + i * Math.PI) * 0.5;
    });

    switch (this.state) {
      case 'approach': {
        this.torso.position.y = 0.5 + bob;
        this.shamble(dt, ctx.playerPos);
        if (dist < 2.5 && this.timer <= 0) {
          this.state = 'haunchLower';
          this.timer = 0.6;
        }
        break;
      }
      case 'haunchLower': {
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.torso.rotation.x = 1.15 + k * 0.35;
        this.torso.position.y = 0.5 - k * 0.12 + bob;
        if (this.timer <= 0) {
          this.state = 'pounce';
          this.timer = 0.4;
          this.pounceHit = false;
          const dir = ctx.playerPos.clone().sub(this.object.position).setY(0).normalize();
          this.pounceVel.copy(dir).multiplyScalar((dist + 2) / 0.4);
        }
        break;
      }
      case 'pounce': {
        this.torso.rotation.x = 1.5;
        this.object.position.addScaledVector(this.pounceVel, dt);
        const curDist = this.object.position.distanceTo(ctx.playerPos);
        if (!this.pounceHit && !ctx.playerIFrames && curDist < 1.1) {
          ctx.dealDamageToPlayer(12);
          this.pounceHit = true;
        }
        if (this.timer <= 0) {
          this.torso.rotation.x = 1.15;
          this.torso.position.y = 0.5;
          this.state = 'recover';
          this.timer = 0.7 + Math.random() * 0.5;
        }
        break;
      }
      case 'recover': {
        this.shamble(dt, ctx.playerPos);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.5 + Math.random() * 0.7;
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
