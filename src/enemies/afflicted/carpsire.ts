import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'coil' | 'leap' | 'beached';

// CARPSIRE — the inverse of the flailfish: a fish's tail where the legs
// should be, and a man's proud bathrobed upper body still expecting to be
// dry. He can only advance by flopping himself forward, and he beaches
// every single time. It was his bathtub, probably.
export class Carpsire extends Afflicted {
  readonly displayName = 'Carpsire';
  toppleEvery: [number, number] = [3, 5];

  private state: State = 'coil';
  private timer = 0.6;
  private leapDealt = false;
  private readonly leapVel = new THREE.Vector3();
  private readonly tail: THREE.Group;

  constructor() {
    super();
    this.maxHp = this.hp = 26;
    this.radius = 0.42;

    const clothes = pickClothes(67);
    const torso = buildTorso(clothes);
    torso.position.y = 0.85;
    this.object.add(torso);

    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.02), makePS1Material({ color: 0x6a3a4a }));
    sash.position.set(0.06, 1.17, 0.16);
    sash.rotation.z = 0.5;
    this.object.add(sash);

    this.tail = new THREE.Group();
    const tailMat = makePS1Material({ color: 0x6a8a92 });
    const tailBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.05, 0.85, 6), tailMat);
    tailBody.position.y = 0.42;
    this.tail.add(tailBody);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 4), tailMat);
    fin.rotation.x = Math.PI / 2;
    fin.position.set(0, 0.06, 0.16);
    this.tail.add(fin);
    this.object.add(this.tail);

    this.parts = [
      { tag: 'body', node: torso, radius: 0.32, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'tail', node: this.tail, radius: 0.3, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    const toPlayer = ctx.playerPos.clone().sub(this.object.position).setY(0);
    const dist = toPlayer.length();
    if (dist > 0.01 && this.state !== 'leap') {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    this.parts[1]!.active = this.state === 'beached';

    switch (this.state) {
      case 'coil': {
        // Telegraph: he winds his tail up before the flop.
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.tail.rotation.z = Math.sin(k * Math.PI * 4) * 0.25 * (1 - k);
        if (this.timer <= 0) {
          this.state = 'leap';
          this.timer = 0.4;
          this.leapDealt = false;
          const dir = dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);
          this.leapVel.copy(dir).multiplyScalar(1.5 / 0.4);
        }
        break;
      }
      case 'leap': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.4;
        this.object.position.addScaledVector(this.leapVel, dt);
        this.object.position.y = Math.sin(k * Math.PI) * 0.35;
        if (!this.leapDealt && k > 0.5 && !ctx.playerIFrames && this.object.position.distanceTo(ctx.playerPos) < 1) {
          ctx.dealDamageToPlayer(10);
          this.leapDealt = true;
        }
        if (this.timer <= 0) {
          this.object.position.y = 0;
          this.state = 'beached';
          this.timer = 1.5;
        }
        break;
      }
      case 'beached': {
        // He flails, exposed, until he can coil up for another flop.
        this.timer -= dt;
        this.tail.rotation.z = Math.sin(this.timer * 14) * 0.15;
        if (this.timer <= 0) {
          this.tail.rotation.z = 0;
          this.state = 'coil';
          this.timer = 0.6;
        }
        break;
      }
    }
  }
}
