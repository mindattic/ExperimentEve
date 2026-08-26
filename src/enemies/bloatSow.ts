import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'waddle' | 'headbuttTelegraph' | 'headbutt' | 'recover';

// Bloat Sow: a pig dragging an engorged tick's abdomen on its back. The
// sac is a permanent weak point — and when the sow finally dies, it bursts.
export class BloatSow extends Enemy {
  readonly displayName = 'Bloat Sow';
  faction = 'sow';

  /** For the future area-damage system; the immediate stopgap hit lives in onDeath. */
  readonly explosionDamage = 35;
  readonly explosionRadius = 3;
  exploded = false;

  private state: State = 'waddle';
  private timer = 0.6;
  private t = 0;
  private lastCtx: BattleContext | null = null;
  private headbuttDidDamage = false;
  private readonly headGroup = new THREE.Group();
  private readonly sacMesh: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 50;
    this.radius = 0.55;

    const skinMat = makePS1Material({ color: 0xc98a8a });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), skinMat);
    body.scale.set(1.1, 0.9, 1.4);
    body.position.set(0, 0.55, -0.1);
    this.object.add(body);

    this.headGroup.position.set(0, 0.55, 0.55);
    this.object.add(this.headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), skinMat);
    head.scale.set(1, 0.9, 1.1);
    this.headGroup.add(head);
    const snout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.12, 6),
      makePS1Material({ color: 0xd8a0a0 }),
    );
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.02, 0.28);
    this.headGroup.add(snout);
    const earMat = makePS1Material({ color: 0xb87a7a });
    for (const sx of [-0.18, 0.18]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), earMat);
      ear.position.set(sx, 0.2, 0.05);
      ear.rotation.z = sx > 0 ? -0.5 : 0.5;
      this.headGroup.add(ear);
    }

    const legMat = makePS1Material({ color: 0xa06868 });
    for (const [sx, sz] of [[-0.32, 0.4], [0.32, 0.4], [-0.32, -0.55], [0.32, -0.55]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 5), legMat);
      leg.position.set(sx, 0.25, sz);
      this.object.add(leg);
    }

    const sacMat = makePS1Material({ color: 0x6a3050 });
    this.sacMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 6), sacMat);
    this.sacMesh.scale.set(1.15, 1.0, 1.0);
    this.sacMesh.position.set(0, 0.65, -0.65);
    this.object.add(this.sacMesh);

    this.parts = [
      { tag: 'body', node: body, radius: 0.55, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'sac', node: this.sacMesh, radius: 0.5, damageMultiplier: 3, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  protected override onDeath(): void {
    this.sacMesh.scale.multiplyScalar(2);
    this.exploded = true;
    if (this.lastCtx) {
      const dist = this.lastCtx.playerPos.distanceTo(this.object.position);
      if (dist < this.explosionRadius) this.lastCtx.dealDamageToPlayer(25);
    }
    this.object.rotation.z = Math.PI / 2;
    this.object.position.y = 0;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.lastCtx = ctx;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (this.state !== 'headbutt' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    switch (this.state) {
      case 'waddle': {
        this.object.position.y = Math.abs(Math.sin(this.t * 5)) * 0.04;
        if (dist > 1.4) {
          if (dist > 0.01) this.object.position.addScaledVector(toPlayer.normalize(), 1.1 * dt);
        } else if (this.timer <= 0) {
          this.state = 'headbuttTelegraph';
          this.timer = 0.6;
        }
        break;
      }
      case 'headbuttTelegraph': {
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.headGroup.rotation.x = k * 0.6;
        this.headGroup.position.y = 0.55 - k * 0.18;
        if (this.timer <= 0) {
          this.state = 'headbutt';
          this.timer = 0.35;
          this.headbuttDidDamage = false;
        }
        break;
      }
      case 'headbutt': {
        if (dist > 0.01) this.object.position.addScaledVector(toPlayer.normalize(), 4.5 * dt);
        if (!this.headbuttDidDamage && !ctx.playerIFrames && dist < 1.2) {
          ctx.dealDamageToPlayer(10);
          this.headbuttDidDamage = true;
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 1.1;
        }
        break;
      }
      case 'recover': {
        this.headGroup.rotation.x += (0 - this.headGroup.rotation.x) * Math.min(1, dt * 4);
        this.headGroup.position.y += (0.55 - this.headGroup.position.y) * Math.min(1, dt * 4);
        this.object.position.y = 0;
        if (this.timer <= 0) {
          this.state = 'waddle';
          this.timer = 0.8 + Math.random() * 0.6;
        }
        break;
      }
    }
  }
}
