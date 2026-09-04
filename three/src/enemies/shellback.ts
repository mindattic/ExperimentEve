import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'approach' | 'retract' | 'neckLunge' | 'neckLinger' | 'recover';

const NECK_REST = 0.3;
const NECK_EXT = 1.15;

// Shellback: harbor seal + snapping turtle chimera. A slow blocker that
// lumbers forward, then RETRACTS entirely into its shell (fully
// invulnerable — the shell-up is itself the tell that a lunge is coming),
// before its seal head rockets out on a stretched turtle neck to bite.
export class Shellback extends Enemy {
  readonly displayName = 'Shellback';
  faction = 'seal';

  private state: State = 'approach';
  private timer = 0.8;
  private t = 0;
  private neckLingerTimer = 0;
  private readonly shell: THREE.Mesh;
  private readonly neck: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly neckGroup = new THREE.Group();
  private readonly fins: THREE.Mesh[] = [];
  private readonly whiskerL: THREE.Mesh;
  private readonly whiskerR: THREE.Mesh;
  private lungeHit = false;

  constructor() {
    super();
    this.maxHp = this.hp = 90;
    this.radius = 0.7;

    const shellMat = makePS1Material({ color: 0x3f5535 });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.65, 9, 7), shellMat);
    this.shell.scale.set(1.1, 0.65, 1.25);
    this.shell.position.y = 0.5;
    this.object.add(this.shell);

    const clawMat = makePS1Material({ color: 0x374a2d });
    const finMat = makePS1Material({ color: 0x556b58 });
    for (const sx of [-0.6, 0.6]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.5, 2, 1, 1), finMat);
      fin.position.set(sx, 0.28, 0.1);
      fin.rotation.z = sx > 0 ? -0.2 : 0.2;
      this.object.add(fin);
      this.fins.push(fin);

      // Small claw nub at each flipper tip.
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), clawMat.clone());
      claw.rotation.x = Math.PI / 2;
      claw.position.set(sx > 0 ? 0.16 : -0.16, -0.02, 0.32);
      fin.add(claw);
    }

    this.neckGroup.position.set(0, 0.55, 0.55);
    this.object.add(this.neckGroup);

    const neckMat = makePS1Material({ color: 0x6b7a5a });
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, NECK_REST, 8), neckMat);
    this.neck.rotation.x = Math.PI / 2;
    this.neck.position.z = NECK_REST / 2;
    this.neckGroup.add(this.neck);

    const headMat = makePS1Material({ color: 0x7a8a6a });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 6), headMat);
    this.head.scale.set(1, 0.9, 1.2);
    this.head.position.z = NECK_REST;
    this.neckGroup.add(this.head);

    const eyeMat = makePS1Material({ color: 0x101010 });
    for (const sx of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat);
      eye.position.set(sx, 0.05, NECK_REST + 0.16);
      this.neckGroup.add(eye);
    }

    // Turtle beak ridge at the snout tip.
    const beakMat = makePS1Material({ color: 0x5c5238 });
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.01, NECK_REST + 0.2);
    this.neckGroup.add(beak);

    // Nostril dots and seal whiskers on the head.
    const nostrilMat = new THREE.MeshBasicMaterial({ color: 0x0a0a08 });
    for (const sx of [-0.05, 0.05]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 3), nostrilMat);
      nostril.position.set(sx, 0.09, NECK_REST + 0.19);
      this.neckGroup.add(nostril);
    }
    const whiskerMat = makePS1Material({ color: 0xd8d0b8 });
    this.whiskerL = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.002, 0.16, 4), whiskerMat);
    this.whiskerL.rotation.z = Math.PI / 2;
    this.whiskerL.position.set(-0.1, 0.02, NECK_REST + 0.1);
    this.neckGroup.add(this.whiskerL);
    this.whiskerR = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.002, 0.16, 4), whiskerMat.clone());
    this.whiskerR.rotation.z = Math.PI / 2;
    this.whiskerR.position.set(0.1, 0.02, NECK_REST + 0.1);
    this.neckGroup.add(this.whiskerR);

    this.parts = [
      { tag: 'body', node: this.shell, radius: 0.75, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'neck', node: this.head, radius: 0.28, damageMultiplier: 6, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  private setNeck(len: number): void {
    this.neck.scale.y = Math.max(0.01, len / NECK_REST);
    this.neck.position.z = len / 2;
    this.head.position.z = len;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (this.state === 'approach' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    const bodyPart = this.parts[0]!;
    const neckPart = this.parts[1]!;
    bodyPart.active = this.state !== 'retract';

    if (this.neckLingerTimer > 0) {
      this.neckLingerTimer -= dt;
    }
    neckPart.active = this.state === 'neckLunge' || this.neckLingerTimer > 0;

    // Idle flipper flutter and whisker sway — small, always running.
    for (const [i, fin] of this.fins.entries()) {
      const base = i === 0 ? 0.2 : -0.2;
      fin.rotation.x = Math.sin(this.t * 2 + i * Math.PI) * 0.05;
      fin.rotation.z = base + Math.sin(this.t * 1.5) * 0.03;
    }
    this.whiskerL.rotation.y = Math.sin(this.t * 3) * 0.1;
    this.whiskerR.rotation.y = -Math.sin(this.t * 3 + 0.3) * 0.1;

    switch (this.state) {
      case 'approach': {
        if (dist > 1.8) {
          this.object.position.addScaledVector(toPlayer.normalize(), 0.9 * dt);
        } else if (this.timer <= 0) {
          this.state = 'retract';
          this.timer = 1.4;
        }
        break;
      }
      case 'retract': {
        // TELEGRAPH: shell pulls in tight and low — untargetable, but a
        // lunge is imminent.
        const k = 1 - Math.max(0, this.timer) / 1.4;
        this.shell.scale.set(1.1 - k * 0.15, 0.65 - k * 0.3, 1.25 - k * 0.15);
        this.neckGroup.scale.setScalar(1 - k * 0.7);
        if (this.timer <= 0) {
          this.state = 'neckLunge';
          this.timer = 0.5;
          this.lungeHit = false;
        }
        break;
      }
      case 'neckLunge': {
        const k = Math.min(1, (1 - Math.max(0, this.timer) / 0.5) * 1.6);
        this.shell.scale.set(1.1, 0.65, 1.25);
        this.neckGroup.scale.setScalar(1);
        this.setNeck(THREE.MathUtils.lerp(NECK_REST, NECK_EXT, k));
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (!this.lungeHit && !ctx.playerIFrames && k > 0.7 && dist < 1.9) {
          ctx.dealDamageToPlayer(20);
          this.lungeHit = true;
        }
        if (this.timer <= 0) {
          this.state = 'neckLinger';
          this.timer = 0.15;
          this.neckLingerTimer = 0.6;
        }
        break;
      }
      case 'neckLinger': {
        // Neck stays extended (and vulnerable) briefly after the strike.
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      }
      case 'recover': {
        const k = Math.min(1, dt * 4);
        this.setNeck(THREE.MathUtils.lerp(this.neck.position.z * 2, NECK_REST, k));
        if (this.timer <= 0) {
          this.setNeck(NECK_REST);
          this.state = 'approach';
          this.timer = 0.6 + Math.random() * 0.5;
        }
        break;
      }
    }
  }
}
