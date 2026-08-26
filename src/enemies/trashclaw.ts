import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'approach' | 'clawWindup' | 'clawSlam' | 'exposed' | 'recover';

// Trashclaw: raccoon + lobster chimera. A banded raccoon body wears a
// lobster's armored front carapace and two oversized claws — shots to the
// body deal only 1 flat damage while armored. The CLAW WINDUP telegraphs a
// short lunge-slam; whiff it (player dodges out of range) and the beast
// overbalances, spinning helplessly with its soft ringed tail exposed.
export class Trashclaw extends Enemy {
  readonly displayName = 'Trashclaw';
  faction = 'raccoon';

  private state: State = 'approach';
  private timer = 0.6;
  private t = 0;
  private readonly bodyGroup = new THREE.Group();
  private readonly clawL: THREE.Group;
  private readonly clawR: THREE.Group;
  private readonly pincerL: THREE.Mesh;
  private readonly pincerR: THREE.Mesh;
  private readonly tail: THREE.Mesh;
  private readonly bodyMesh: THREE.Mesh;
  private readonly lungeDir = new THREE.Vector3();
  private slamHit = false;

  constructor() {
    super();
    this.maxHp = this.hp = 55;
    this.radius = 0.5;

    const furMat = makePS1Material({ color: 0x4a4640 });
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), furMat);
    this.bodyMesh.scale.set(1.1, 0.9, 1.3);
    this.bodyMesh.position.y = 0.42;
    this.bodyGroup.add(this.bodyMesh);

    // Lobster carapace plating grafted over the raccoon's back/chest.
    const shellMat = makePS1Material({ color: 0x8a3020 });
    const carapace = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.75, 2, 1, 2), shellMat);
    carapace.position.set(0, 0.52, 0.05);
    this.bodyGroup.add(carapace);

    const maskMat = makePS1Material({ color: 0x1c1c1c });
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.1), maskMat);
    mask.position.set(0, 0.5, 0.58);
    this.bodyGroup.add(mask);

    const ringMat = makePS1Material({ color: 0xc9a24a });
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.7, 5), ringMat);
    this.tail.position.set(0, 0.32, -0.55);
    this.tail.rotation.x = Math.PI / 2 - 0.25;
    this.bodyGroup.add(this.tail);

    const armMat = makePS1Material({ color: 0x9a3a26 });
    const pincerMat = makePS1Material({ color: 0xb04a30 });
    const buildClaw = (side: number): { arm: THREE.Group; pincer: THREE.Mesh } => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.42, 0.55, 0.2);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.4, 5), armMat);
      upper.position.set(0, -0.2, 0);
      arm.add(upper);
      const pincer = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.4, 1, 1, 1), pincerMat);
      pincer.position.set(0, -0.42, 0.15);
      arm.add(pincer);
      this.bodyGroup.add(arm);
      return { arm, pincer };
    };
    const left = buildClaw(-1);
    const right = buildClaw(1);
    this.clawL = left.arm;
    this.clawR = right.arm;
    this.pincerL = left.pincer;
    this.pincerR = right.pincer;

    const legMat = makePS1Material({ color: 0x3a3630 });
    for (const [sx, sz] of [[-0.28, 0.25], [0.28, 0.25], [-0.24, -0.3], [0.24, -0.3]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 4), legMat);
      leg.position.set(sx, 0.2, sz);
      this.bodyGroup.add(leg);
    }

    this.object.add(this.bodyGroup);

    this.parts = [
      {
        tag: 'body', node: this.bodyMesh, radius: 0.5,
        damageMultiplier: 1, weakPoint: false, active: true, flatDamageOverride: 1,
      },
      {
        tag: 'tail', node: this.tail, radius: 0.28,
        damageMultiplier: 5, weakPoint: true, active: false,
      },
    ];
    this.registerFlashMaterials();
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (this.state !== 'clawSlam' && this.state !== 'exposed' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    const bodyPart = this.parts[0]!;
    const tailPart = this.parts[1]!;
    bodyPart.flatDamageOverride = this.state === 'exposed' ? undefined : 1;
    tailPart.active = this.state === 'exposed';

    switch (this.state) {
      case 'approach': {
        const gait = Math.abs(Math.sin(this.t * 8)) * 0.06;
        this.bodyGroup.position.y = gait;
        if (dist > 1.5) {
          this.object.position.addScaledVector(toPlayer.normalize(), 1.5 * dt);
        } else if (this.timer <= 0) {
          this.state = 'clawWindup';
          this.timer = 0.7;
        }
        break;
      }
      case 'clawWindup': {
        // TELEGRAPH: claws raise overhead and open.
        const k = 1 - Math.max(0, this.timer) / 0.7;
        this.clawL.rotation.x = -k * 1.6;
        this.clawR.rotation.x = -k * 1.6;
        this.pincerL.rotation.x = -k * 0.9;
        this.pincerR.rotation.x = k * 0.9;
        if (this.timer <= 0) {
          this.state = 'clawSlam';
          this.timer = 0.35;
          this.slamHit = false;
          this.lungeDir.copy(toPlayer.lengthSq() > 0.0001 ? toPlayer.normalize() : new THREE.Vector3(0, 0, 1));
        }
        break;
      }
      case 'clawSlam': {
        this.object.position.addScaledVector(this.lungeDir, 6 * dt);
        this.clawL.rotation.x = -0.3;
        this.clawR.rotation.x = -0.3;
        if (!this.slamHit && !ctx.playerIFrames && dist < 1.1) {
          ctx.dealDamageToPlayer(15);
          this.slamHit = true;
        }
        if (this.timer <= 0) {
          this.clawL.rotation.x = 0;
          this.clawR.rotation.x = 0;
          this.pincerL.rotation.x = 0;
          this.pincerR.rotation.x = 0;
          if (this.slamHit) {
            this.state = 'recover';
            this.timer = 1.0;
          } else {
            // Whiffed — overbalances into an exposed spin.
            this.state = 'exposed';
            this.timer = 2.2;
          }
        }
        break;
      }
      case 'exposed': {
        this.bodyGroup.rotation.y += dt * 6;
        this.bodyGroup.rotation.z = Math.sin(this.t * 10) * 0.15;
        if (this.timer <= 0) {
          this.bodyGroup.rotation.y = 0;
          this.bodyGroup.rotation.z = 0;
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      }
      case 'recover': {
        this.bodyGroup.position.y *= Math.max(0, 1 - dt * 6);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.4 + Math.random() * 0.5;
        }
        break;
      }
    }
  }
}
