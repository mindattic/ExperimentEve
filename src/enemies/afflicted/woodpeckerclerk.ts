import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'shamble' | 'reach' | 'drum' | 'dizzy';

// WOODPECKERCLERK — a man in a work tie whose face never stopped becoming a
// bill. He still reaches for you like a handshake, then drums: six rapid
// pecks, tak-tak-tak, and afterward he's too dizzy to protect it.
export class Woodpeckerclerk extends Afflicted {
  readonly displayName = 'Woodpeckerclerk';

  private state: State = 'shamble';
  private timer = 0.8 + Math.random();
  private peckIndex = 0;
  private peckTimer = 0;
  private readonly torso: THREE.Group;
  private readonly head: THREE.Mesh;
  private readonly bill: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 28;
    this.radius = 0.4;
    this.shambleSpeed = 1.4;

    const clothes = pickClothes(31);
    const legs = buildLegs(clothes);
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.94;
    this.object.add(legs, this.torso);
    this.head = this.torso.children[1] as THREE.Mesh;

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.02), makePS1Material({ color: 0x7a2222 }));
    tie.position.set(0, 1.28, 0.17);
    this.object.add(tie);

    this.bill = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 5), makePS1Material({ color: 0xd9c98a }));
    this.bill.rotation.x = Math.PI / 2;
    this.bill.position.set(0, 1.59, 0.22);
    this.object.add(this.bill);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.32, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'bill', node: this.bill, radius: 0.14, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'reach' || this.state === 'dizzy';

    switch (this.state) {
      case 'shamble': {
        this.shamble(dt, ctx.playerPos);
        this.timer -= dt;
        if (dist < 1.2 && this.timer <= 0) {
          this.state = 'reach';
          this.timer = 0.6;
        }
        break;
      }
      case 'reach': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.torso.rotation.x = k * 0.4;
        if (this.timer <= 0) {
          this.torso.rotation.x = 0;
          if (dist < 1.2) {
            this.state = 'drum';
            this.peckIndex = 0;
            this.peckTimer = 0;
          } else {
            this.state = 'shamble';
            this.timer = 0.8 + Math.random();
          }
        }
        break;
      }
      case 'drum': {
        this.peckTimer -= dt;
        if (this.peckTimer <= 0) {
          if (this.peckIndex < 6) {
            if (!ctx.playerIFrames && dist < 1.2) ctx.dealDamageToPlayer(2);
            this.head.rotation.z = this.peckIndex % 2 === 0 ? 0.35 : -0.35;
            this.peckIndex++;
            this.peckTimer = 0.1;
          } else {
            this.head.rotation.z = 0;
            this.state = 'dizzy';
            this.timer = 1.5;
          }
        }
        break;
      }
      case 'dizzy': {
        this.timer -= dt;
        this.head.rotation.z = Math.sin(this.timer * 10) * 0.15;
        if (this.timer <= 0) {
          this.head.rotation.z = 0;
          this.state = 'shamble';
          this.timer = 1 + Math.random();
        }
        break;
      }
    }
  }
}
