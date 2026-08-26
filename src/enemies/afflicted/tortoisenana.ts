import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, pickClothes, AFFLICTED_SKIN } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type Phase = 'creep' | 'hunker' | 'telegraph' | 'recover';

// TORTOISENANA — an old woman fused into a floral-tinted shell. Get close
// and she hunkers, near invulnerable, cycling with a slow creep; but she
// still keeps a shockingly fast neck-snap bite in reserve for whenever the
// creeping stops paying off.
export class Tortoisenana extends Afflicted {
  readonly displayName = 'Tortoisenana';

  private phase: Phase = 'creep';
  private cycleTimer = 2;
  private timer = 0.5;
  private attackTimer = 1.5 + Math.random();
  private t = 0;
  private readonly neck: THREE.Mesh;
  private readonly shell: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 34;
    this.radius = 0.42;
    this.shambleSpeed = 0.7;

    const clothes = pickClothes(53);
    const legs = buildLegs(clothes);
    this.object.add(legs);

    this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 9, 7), makePS1Material({ color: 0xb98fae }));
    this.shell.scale.set(1.1, 0.72, 1.25);
    this.shell.position.set(0, 1.22, 0);
    this.object.add(this.shell);
    // Scute rings: the segmented plates a shell like this should have.
    const scuteMat = makePS1Material({ color: 0x9c7391 });
    for (let i = 0; i < 2; i++) {
      const scute = new THREE.Mesh(new THREE.TorusGeometry(0.14 + i * 0.1, 0.014, 4, 9), scuteMat);
      scute.rotation.x = Math.PI / 2;
      scute.position.set(0, 1.4 - i * 0.02, 0);
      this.shell.add(scute);
    }

    const neckGeom = new THREE.CylinderGeometry(0.045, 0.05, 0.4, 8);
    neckGeom.translate(0, 0.2, 0);
    this.neck = new THREE.Mesh(neckGeom, makePS1Material({ color: AFFLICTED_SKIN }));
    this.neck.rotation.x = Math.PI / 2;
    this.neck.scale.y = 0.15;
    this.neck.position.set(0, 1.1, 0.3);
    this.object.add(this.neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 9, 7), makePS1Material({ color: AFFLICTED_SKIN }));
    head.position.set(0, 0.4, 0);
    this.neck.add(head);
    // Small dark eyes, patient, waiting for the creep to pay off.
    const eyeMat = makePS1Material({ color: 0x1a1410 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), eyeMat);
      eye.position.set(s * 0.06, 0.02, 0.08);
      head.add(eye);
    }

    this.parts = [
      { tag: 'body', node: this.shell, radius: 0.36, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'neck', node: this.neck, radius: 0.14, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    const body = this.parts[0]!;

    switch (this.phase) {
      case 'creep': {
        this.shamble(dt, ctx.playerPos);
        // The shell rocks with each slow, dragging step.
        this.shell.rotation.z = Math.sin(this.t * 2.6) * 0.03;
        body.flatDamageOverride = undefined;
        this.attackTimer -= dt;
        if (dist < 1.5 && this.attackTimer <= 0) {
          this.phase = 'telegraph';
          this.timer = 0.5;
          break;
        }
        if (dist < 3) {
          this.cycleTimer -= dt;
          if (this.cycleTimer <= 0) {
            this.phase = 'hunker';
            this.cycleTimer = 2;
          }
        }
        break;
      }
      case 'hunker': {
        // She tucks in: near invulnerable while the shell does the work.
        body.flatDamageOverride = 1;
        this.cycleTimer -= dt;
        if (dist >= 3 || this.cycleTimer <= 0) {
          this.phase = 'creep';
          this.cycleTimer = 2;
        }
        break;
      }
      case 'telegraph': {
        body.flatDamageOverride = undefined;
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.5;
        this.neck.scale.y = 0.15 + k * 0.85;
        if (this.timer <= 0) {
          if (!ctx.playerIFrames && this.object.position.distanceTo(ctx.playerPos) < 1.5) {
            ctx.dealDamageToPlayer(12);
          }
          this.phase = 'recover';
          this.timer = 0.6;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.neck.scale.y = Math.max(0.15, this.neck.scale.y - dt * 2);
        if (this.timer <= 0) {
          this.phase = 'creep';
          this.attackTimer = 2 + Math.random() * 2;
        }
        break;
      }
    }

    this.parts[1]!.active = this.phase === 'telegraph';
  }
}
