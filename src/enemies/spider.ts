import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'approach' | 'flutter' | 'leap' | 'recover' | 'slamWindup' | 'slam';

export interface CrowSpiderOptions {
  giant?: boolean;
  flaming?: boolean;
}

// Crow-winged spider chimera: spider body, grafted crow wings. The
// WING-FLUTTER IS THE TELEGRAPH — wings rise and beat, then it leaps.
// The giant one (it ate well) adds a rearing ground slam.
export class CrowSpider extends Enemy {
  readonly displayName: string;
  faction = 'spider';

  private state: State = 'approach';
  private timer = 0.5;
  private t = 0;
  private readonly giant: boolean;
  private readonly scaleK: number;
  private readonly bodyGroup = new THREE.Group();
  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;
  private readonly legs: THREE.Mesh[] = [];
  private readonly leapVel = new THREE.Vector3();
  private leapDidDamage = false;

  constructor(opts: CrowSpiderOptions = {}) {
    super();
    this.giant = opts.giant ?? false;
    this.displayName = this.giant ? 'Giant Crow-Spider' : 'Crow-Spider';
    this.scaleK = this.giant ? 2.4 : 1;
    this.maxHp = this.hp = this.giant ? 130 : 25;
    this.radius = 0.5 * this.scaleK;

    const bodyMat = makePS1Material({ color: opts.flaming ? 0x3a2820 : 0x2e2a30 });
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 5), bodyMat);
    abdomen.scale.set(1, 0.8, 1.35);
    abdomen.position.set(0, 0.42, -0.15);
    this.bodyGroup.add(abdomen);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), bodyMat);
    head.position.set(0, 0.38, 0.32);
    this.bodyGroup.add(head);
    const eyeMat = makePS1Material({ color: 0xcc3333 });
    for (const sx of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 3), eyeMat);
      eye.position.set(sx, 0.44, 0.47);
      this.bodyGroup.add(eye);
    }

    const legMat = makePS1Material({ color: 0x232026 });
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.75, 4), legMat);
      const zOff = -0.35 + (i % 4) * 0.22;
      leg.position.set(side * 0.38, 0.28, zOff);
      leg.rotation.z = side * 1.05;
      this.bodyGroup.add(leg);
      this.legs.push(leg);
    }

    // Crow wings: dark feathered boxes, folded until the telegraph.
    const wingMat = makePS1Material({ color: 0x17181d });
    this.wingL = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.4, 3, 1, 1), wingMat);
    this.wingL.geometry.translate(-0.42, 0, 0);
    this.wingL.position.set(-0.1, 0.62, -0.15);
    this.wingR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.4, 3, 1, 1), wingMat.clone());
    this.wingR.geometry.translate(0.42, 0, 0);
    this.wingR.position.set(0.1, 0.62, -0.15);
    this.bodyGroup.add(this.wingL, this.wingR);

    if (opts.flaming) {
      const flameMat = new THREE.MeshLambertMaterial({ color: 0x331100, emissive: 0xff7722 });
      for (const [fx, fy, fz] of [[-0.2, 0.62, -0.3], [0.22, 0.58, 0.05], [0, 0.7, -0.05]] as const) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), flameMat);
        flame.position.set(fx, fy, fz);
        this.bodyGroup.add(flame);
      }
    }

    this.bodyGroup.scale.setScalar(this.scaleK);
    this.object.add(this.bodyGroup);

    this.parts = [
      { tag: 'body', node: abdomen, radius: 0.42 * this.scaleK, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'wing joint', node: this.wingL, radius: 0.22 * this.scaleK, damageMultiplier: 4, weakPoint: true, active: false },
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
    if (this.state !== 'leap' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    // Wing joint targetable while the wings are doing anything.
    this.parts[1]!.active = this.state === 'flutter' || this.state === 'leap' || this.state === 'slamWindup';

    // Legs skitter whenever grounded and moving.
    const gait = this.state === 'approach' ? Math.sin(this.t * 16) * 0.25 : 0;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = (i % 2 === 0 ? gait : -gait);
    });

    switch (this.state) {
      case 'approach': {
        this.foldWings(dt);
        if (dist > 2.2 * this.scaleK) {
          this.object.position.addScaledVector(toPlayer.normalize(), (this.giant ? 1.4 : 2.2) * dt);
        } else if (this.timer <= 0) {
          if (this.giant && Math.random() < 0.45) {
            this.state = 'slamWindup';
            this.timer = 0.85;
          } else {
            this.state = 'flutter';
            this.timer = 0.75;
          }
        }
        break;
      }
      case 'flutter': {
        // TELEGRAPH: wings snap open and beat.
        const beat = Math.sin(this.t * 26) * 0.7;
        this.wingL.rotation.z = 0.9 + beat * 0.4;
        this.wingR.rotation.z = -0.9 - beat * 0.4;
        this.bodyGroup.position.y = Math.abs(beat) * 0.06;
        if (this.timer <= 0) {
          this.state = 'leap';
          this.timer = 0.55;
          this.leapDidDamage = false;
          const target = ctx.playerPos.clone().sub(this.object.position).setY(0);
          this.leapVel.copy(target).divideScalar(0.55);
        }
        break;
      }
      case 'leap': {
        const k = 1 - Math.max(0, this.timer) / 0.55;
        this.object.position.addScaledVector(this.leapVel, dt);
        this.object.position.y = Math.sin(k * Math.PI) * (this.giant ? 1.6 : 1.1);
        this.wingL.rotation.z = 1.3;
        this.wingR.rotation.z = -1.3;
        if (!this.leapDidDamage && k > 0.55 && !ctx.playerIFrames && dist < 1.0 * this.scaleK) {
          ctx.dealDamageToPlayer(this.giant ? 26 : 11);
          this.leapDidDamage = true;
        }
        if (this.timer <= 0) {
          this.object.position.y = 0;
          this.state = 'recover';
          this.timer = this.giant ? 1.3 : 0.9;
        }
        break;
      }
      case 'slamWindup': {
        // Giant only: rears up, wings mantled — dodge cue.
        const k = 1 - Math.max(0, this.timer) / 0.85;
        this.bodyGroup.rotation.x = -k * 0.7;
        this.wingL.rotation.z = 0.6 + k * 0.8;
        this.wingR.rotation.z = -0.6 - k * 0.8;
        if (this.timer <= 0) {
          this.state = 'slam';
          this.timer = 0.25;
        }
        break;
      }
      case 'slam': {
        this.bodyGroup.rotation.x = 0.15;
        if (this.timer <= 0.15 && !ctx.playerIFrames && dist < 2.4 * this.scaleK) {
          ctx.dealDamageToPlayer(30);
          this.timer = Math.min(this.timer, 0);
        }
        if (this.timer <= 0) {
          this.bodyGroup.rotation.x = 0;
          this.state = 'recover';
          this.timer = 1.5;
        }
        break;
      }
      case 'recover': {
        this.foldWings(dt);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.4 + Math.random() * 0.6;
        }
        break;
      }
    }
  }

  private foldWings(dt: number): void {
    this.wingL.rotation.z += (0.12 - this.wingL.rotation.z) * Math.min(1, dt * 6);
    this.wingR.rotation.z += (-0.12 - this.wingR.rotation.z) * Math.min(1, dt * 6);
    this.bodyGroup.rotation.x *= Math.max(0, 1 - dt * 6);
    this.bodyGroup.position.y = 0;
  }
}
