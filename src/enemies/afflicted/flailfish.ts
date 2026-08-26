import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'approach' | 'arch' | 'sprint' | 'slap' | 'recover';

// The Afflicted — Flailfish: a man's legs stumbling under a fish's whole
// upper body, always thrashing like it's still on the dock gasping for
// water. The wrongness IS the joke; the slap still hurts plenty.
export class Flailfish extends Afflicted {
  readonly displayName = 'Flailfish';
  private state: State = 'approach';
  private timer = 0.6 + Math.random() * 0.4;
  private t = 0;
  private slapDone = false;
  private readonly fish = new THREE.Group();
  private readonly mouth: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 28;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));

    const bodyMat = makePS1Material({ color: 0x5c7a6e });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 6), bodyMat);
    body.scale.set(1, 0.85, 1.9);
    body.position.y = 1.05;
    this.fish.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), bodyMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 1.0, -0.55);
    this.fish.add(tail);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.16), bodyMat);
      fin.position.set(s * 0.28, 1.0, 0.1);
      fin.rotation.z = s * 0.5;
      this.fish.add(fin);
    }
    const eyeMat = makePS1Material({ color: 0xf2f0e6 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 3), eyeMat);
      eye.position.set(s * 0.15, 1.15, 0.42);
      this.fish.add(eye);
    }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), makePS1Material({ color: 0x2a1512 }));
    this.mouth.position.set(0, 1.0, 0.5);
    this.fish.add(this.mouth);
    this.object.add(this.fish);

    this.parts = [
      { tag: 'body', node: body, radius: 0.35, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'mouth', node: this.mouth, radius: 0.14, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = false;

    // The fish never stops flailing, attack or not — it's still drowning.
    this.fish.rotation.z = Math.sin(this.t * 9) * 0.35;
    const pulse = 1 + Math.sin(this.t * 11) * 0.08;
    this.fish.scale.set(pulse, 1 / pulse, pulse);

    switch (this.state) {
      case 'approach': {
        this.shamble(dt, ctx.playerPos);
        if (dist < 3.2 && this.timer <= 0) {
          this.state = 'arch';
          this.timer = 0.5 + Math.random() * 0.4;
        }
        break;
      }
      case 'arch': {
        this.parts[1]!.active = true;
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.9;
        this.fish.rotation.x = -k * 0.9;
        if (this.timer <= 0) {
          this.state = 'sprint';
          this.timer = 0.8;
        }
        break;
      }
      case 'sprint': {
        const normalSpeed = this.shambleSpeed;
        this.shambleSpeed = normalSpeed * 2.5;
        this.shamble(dt, ctx.playerPos);
        this.shambleSpeed = normalSpeed;
        if (this.timer <= 0) {
          this.state = 'slap';
          this.timer = 0.35;
          this.slapDone = false;
        }
        break;
      }
      case 'slap': {
        this.parts[1]!.active = true;
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.35;
        this.fish.rotation.y = Math.sin(k * Math.PI) * 1.6;
        if (!this.slapDone && k > 0.4 && !ctx.playerIFrames && dist < 1.4) {
          ctx.dealDamageToPlayer(12);
          this.slapDone = true;
        }
        if (this.timer <= 0) {
          this.fish.rotation.y = 0;
          this.state = 'recover';
          this.timer = 1.0 + Math.random() * 0.6;
        }
        break;
      }
      case 'recover': {
        this.shamble(dt, ctx.playerPos);
        if (this.timer <= 0) this.state = 'approach';
        break;
      }
    }
  }

  private facePlayer(ctx: BattleContext): void {
    const dir = ctx.playerPos.clone().sub(this.object.position).setY(0);
    if (dir.lengthSq() > 0.0001) this.object.rotation.y = Math.atan2(dir.x, dir.z);
  }
}
