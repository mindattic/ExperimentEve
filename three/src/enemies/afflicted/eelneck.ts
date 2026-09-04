import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'approach' | 'coil' | 'dart' | 'recover';

// The Afflicted — Eelneck: a man whose neck grew a meter of live eel. The
// head strikes on its own agenda while the body just keeps stumbling
// forward, oblivious, never once noticing what its own neck is doing.
export class Eelneck extends Afflicted {
  readonly displayName = 'Eelneck';
  private state: State = 'approach';
  private timer = 1 + Math.random();
  private t = 0;
  private hitDone = false;
  private readonly segs: THREE.Group[] = [];
  private readonly eelHead: THREE.Object3D;

  constructor() {
    super();
    this.maxHp = this.hp = 22;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    const torso = buildTorso(clothes);
    torso.position.y = 0.86;
    torso.children[1]!.visible = false; // human head hidden - the eel neck replaces it
    this.object.add(torso);

    const neckMat = makePS1Material({ color: 0x3f5c4a });
    let parent: THREE.Object3D = new THREE.Group();
    parent.position.set(0, 0.5, 0);
    torso.add(parent);
    const finMat = makePS1Material({ color: 0x2c4636 });
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.y = 0.24;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065 - i * 0.008, 0.07 - i * 0.008, 0.26, 8), neckMat);
      mesh.position.y = 0.13;
      seg.add(mesh);
      // Dorsal fin ridge: the giveaway that this was never a human neck.
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.2), finMat);
      ridge.position.set(0, 0.13, -0.06);
      seg.add(ridge);
      parent.add(seg);
      this.segs.push(seg);
      parent = seg;
    }
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 8), makePS1Material({ color: 0x2c4636 }));
    head.rotation.x = -Math.PI / 2;
    head.position.y = 0.28;
    parent.add(head);
    this.eelHead = head;
    // Eyes: small, flat, unblinking.
    const eyeMat = makePS1Material({ color: 0x0e0e0c });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), eyeMat);
      eye.position.set(s * 0.055, 0.02, 0.18);
      head.add(eye);
    }

    this.parts = [
      { tag: 'body', node: torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'eel head', node: this.eelHead, radius: 0.14, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    // The body never stops stumbling toward the player, attack or not.
    this.shamble(dt, ctx.playerPos);
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'coil' || this.state === 'dart';

    this.segs.forEach((seg, i) => {
      const idle = Math.sin(this.t * 5 + i * 0.8) * 0.18 * (0.4 + i * 0.2);
      if (this.state === 'coil') {
        const k = 1 - Math.max(0, this.timer) / 0.5;
        seg.rotation.x = -k * (0.5 + i * 0.15);
      } else if (this.state === 'dart') {
        const k = 1 - Math.max(0, this.timer) / 0.22;
        seg.rotation.x = -0.5 - i * 0.15 + k * (1.1 + i * 0.2);
      } else {
        seg.rotation.x += (0 - seg.rotation.x) * Math.min(1, dt * 4);
      }
      seg.rotation.z = idle * (this.state === 'approach' || this.state === 'recover' ? 1 : 0.2);
    });

    switch (this.state) {
      case 'approach': {
        if (dist < 1.8 && this.timer <= 0) {
          this.state = 'coil';
          this.timer = 0.5;
        }
        break;
      }
      case 'coil': {
        if (this.timer <= 0) {
          this.state = 'dart';
          this.timer = 0.22;
          this.hitDone = false;
        }
        break;
      }
      case 'dart': {
        if (!this.hitDone && !ctx.playerIFrames && dist < 1.8) {
          ctx.dealDamageToPlayer(10);
          this.hitDone = true;
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.9 + Math.random() * 0.6;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 1 + Math.random() * 1.2;
        }
        break;
      }
    }
  }
}
