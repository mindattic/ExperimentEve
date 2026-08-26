import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes, AFFLICTED_SKIN } from '../afflictedBase';
import type { BattleContext, EnemyPart } from '../enemyBase';

type State = 'shamble' | 'telegraph' | 'recover';

// ANGLERWIDOW — from across a dark street her lure reads exactly like a warm
// save-lamp glow. It is the cruelest fake in the game: a woman with an
// anglerfish's stalk grafted where a person used to be, still shuffling
// toward whatever drew her.
export class Anglerwidow extends Afflicted {
  readonly displayName = 'Anglerwidow';
  toppleEvery: [number, number] = [5, 10];

  private state: State = 'shamble';
  private timer = 0.6 + Math.random() * 0.8;
  private frantic = false;
  private t = Math.random() * 10;
  private readonly jaw: THREE.Mesh;
  private readonly lure: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 22;
    this.radius = 0.4;
    this.shambleSpeed = 1.2;

    const clothes = pickClothes(11);
    const legs = buildLegs(clothes);
    const torso = buildTorso(clothes);
    torso.position.y = 0.94;
    this.object.add(legs, torso);

    // Jaw: drops open in the telegraph, right before the bite.
    this.jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), makePS1Material({ color: AFFLICTED_SKIN }));
    this.jaw.position.set(0, 1.51, 0.1);
    this.object.add(this.jaw);

    // Stalk + lure: the fake lamp. Bobs forever, lit even when she's calm.
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.32, 4), makePS1Material({ color: 0x2e2a30 }));
    stalk.position.set(0, 1.86, 0.14);
    stalk.rotation.x = -0.6;
    this.object.add(stalk);

    this.lure = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      makePS1Material({ color: 0xffdd88, emissive: 0xffaa33 }),
    );
    this.lure.position.set(0, 2.04, 0.32);
    this.object.add(this.lure);

    this.parts = [
      { tag: 'body', node: torso, radius: 0.3, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'lure', node: this.lure, radius: 0.14, damageMultiplier: 4, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  override takeHit(amount: number, part: EnemyPart | null): number {
    const dealt = super.takeHit(amount, part);
    if (!this.frantic && part?.tag === 'lure') {
      // Shot lamp, shattered nerve: she never calms back down.
      this.frantic = true;
      this.shambleSpeed *= 1.5;
    }
    return dealt;
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.lure.position.y = 2.04 + Math.sin(this.t * 2.2) * 0.03;

    const dist = this.object.position.distanceTo(ctx.playerPos);

    switch (this.state) {
      case 'shamble': {
        this.shamble(dt, ctx.playerPos);
        this.jaw.rotation.x = 0;
        if (dist < 1.2) {
          this.state = 'telegraph';
          this.timer = 0.6;
        }
        break;
      }
      case 'telegraph': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.jaw.rotation.x = k * 0.9;
        if (this.timer <= 0) {
          if (!ctx.playerIFrames && this.object.position.distanceTo(ctx.playerPos) < 1.2) {
            ctx.dealDamageToPlayer(12);
          }
          this.state = 'recover';
          this.timer = 0.6;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.jaw.rotation.x *= Math.max(0, 1 - dt * 6);
        if (this.timer <= 0) this.state = 'shamble';
        break;
      }
    }
  }
}
