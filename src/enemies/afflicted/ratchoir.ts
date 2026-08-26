import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildTorso, pickClothes } from '../afflictedBase';

type State = 'approach' | 'telegraph' | 'burst' | 'recover';

const BASE_SPEED = 1.2;
const DASH_SPEED = BASE_SPEED * 3;
const RING_RANGE = 2.0;

// THE CHOIR — a person whose lower half dissolved into a churning knot of
// rats. They carry him in sudden skitter-bursts. When he attacks the knot
// unspools into a ring around him, baring the exhausted human torso beneath.
export class Ratchoir extends Afflicted {
  readonly displayName = 'The Choir';
  shambleSpeed = BASE_SPEED;

  private state: State = 'approach';
  private timer = 0.6 + Math.random();
  private t = 0;
  private hitDone = false;
  private dashTimer = 2 + Math.random();
  private dashActive = false;
  private dashT = 0;
  private ringK = 0;
  private readonly torso: THREE.Group;
  private readonly rats: THREE.Mesh[] = [];
  private readonly angles: number[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 20;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.55;
    this.object.add(this.torso);

    const ratMat = makePS1Material({ color: 0x2c2620 });
    for (let i = 0; i < 5; i++) {
      const rat = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), ratMat);
      this.object.add(rat);
      this.rats.push(rat);
      this.angles.push((i / 5) * Math.PI * 2);
    }

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'exhausted torso', node: this.torso, radius: 0.3, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    const exposed = this.state === 'telegraph' || this.state === 'burst';
    this.parts[1]!.active = exposed;

    this.updateDash(dt);
    this.animateRats(exposed);

    switch (this.state) {
      case 'approach': {
        this.timer -= dt;
        if (dist > RING_RANGE) {
          this.shamble(dt, ctx.playerPos);
        } else if (this.timer <= 0) {
          this.state = 'telegraph';
          this.timer = 0.6;
        }
        break;
      }
      case 'telegraph': {
        // TELEGRAPH: the torso lifts as the knot below coils to unspool.
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.torso.position.y = 0.55 + k * 0.15;
        if (this.timer <= 0) {
          this.state = 'burst';
          this.timer = 0.3;
          this.hitDone = false;
        }
        break;
      }
      case 'burst': {
        this.timer -= dt;
        this.ringK = Math.min(1, this.ringK + dt * 6);
        if (!this.hitDone && !ctx.playerIFrames && dist < RING_RANGE) {
          ctx.dealDamageToPlayer(9);
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
        this.ringK = Math.max(0, this.ringK - dt * 3);
        this.torso.position.y = 0.55;
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.5 + Math.random();
        }
        break;
      }
    }
  }

  private updateDash(dt: number): void {
    if (this.dashActive) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.dashActive = false;
        this.shambleSpeed = BASE_SPEED;
        this.dashTimer = 1.6 + Math.random();
      }
      return;
    }
    this.dashTimer -= dt;
    if (this.dashTimer <= 0) {
      this.dashActive = true;
      this.dashT = 0.3;
      this.shambleSpeed = DASH_SPEED;
    }
  }

  private animateRats(exposed: boolean): void {
    const orbitR = 0.3 + this.ringK * (RING_RANGE - 0.3);
    this.rats.forEach((rat, i) => {
      const a = this.angles[i]! + this.t * (exposed ? 1.5 : 4);
      const jitter = exposed ? 0 : Math.sin(this.t * 20 + i) * 0.03;
      rat.position.set(Math.cos(a) * (orbitR + jitter), 0.15, Math.sin(a) * (orbitR + jitter));
    });
  }
}
