import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'camouflaged' | 'unfold' | 'approach' | 'clawWindup' | 'clawPinch' | 'flipped' | 'recover';

const TRIGGER_RANGE = 2.5;
const UNFOLD_TIME = 0.8;
const WINDUP_TIME = 0.6;
const PINCH_TIME = 0.4;
const PINCH_RANGE = 1.3;
const PINCH_DMG = 16;
const FLIP_TIME = 1.8;
const FLIP_CHANCE = 0.3;
const APPROACH_RANGE = 1.6;

// Green crab + barnacle/rubble armor chimera. Sits motionless disguised as
// a pile of rubble until approached, then unfolds — legs extend, eyestalks
// pop, armor plates hinge open — and sidesteps in for pinch attacks. A
// pinch occasionally over-extends and flips it onto its back, exposing the
// unarmored underside.
export class CobbleCrab extends Enemy {
  readonly displayName = 'Cobble Crab';
  faction = 'crab';

  private state: State = 'camouflaged';
  private timer = 0;
  private t = 0;
  private strafeSign = 1;
  private strafeTimer = 1;
  private pinchDidDamage = false;
  private flipRotX = 0;

  private readonly crabGroup = new THREE.Group();
  private readonly bodyShell: THREE.Mesh;
  private readonly underside: THREE.Mesh;
  private readonly plateTop: THREE.Mesh;
  private readonly plateL: THREE.Mesh;
  private readonly plateR: THREE.Mesh;
  private readonly eyeL: THREE.Mesh;
  private readonly eyeR: THREE.Mesh;
  private readonly legs: THREE.Mesh[] = [];
  private readonly clawL: THREE.Mesh;
  private readonly clawR: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 65;
    this.radius = 0.55;

    this.bodyShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.32, 0.75),
      makePS1Material({ color: 0x3f7a44 }),
    );
    this.bodyShell.position.y = 0.3;
    this.crabGroup.add(this.bodyShell);

    this.underside = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.6),
      makePS1Material({ color: 0xd8b8a0 }),
    );
    this.underside.position.y = 0.12;
    this.underside.visible = false;
    this.crabGroup.add(this.underside);

    const rubbleMat = makePS1Material({ color: 0x6b6b60 });
    this.plateTop = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.8), rubbleMat);
    this.plateTop.position.set(0, 0.42, 0);
    this.crabGroup.add(this.plateTop);
    this.plateL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.78), rubbleMat.clone());
    this.plateL.position.set(-0.33, 0.28, 0);
    this.crabGroup.add(this.plateL);
    this.plateR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.78), rubbleMat.clone());
    this.plateR.position.set(0.33, 0.28, 0);
    this.crabGroup.add(this.plateR);

    const eyeMat = makePS1Material({ color: 0x222222 });
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), eyeMat);
    this.eyeL.position.set(-0.14, 0.5, 0.4);
    this.crabGroup.add(this.eyeL);
    this.eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), eyeMat.clone());
    this.eyeR.position.set(0.14, 0.5, 0.4);
    this.crabGroup.add(this.eyeR);

    const legMat = makePS1Material({ color: 0x2f5c34 });
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 4), legMat.clone());
      leg.position.set(side * 0.36, 0.2, -0.24 + (i % 3) * 0.24);
      leg.rotation.z = side * 1.1;
      this.crabGroup.add(leg);
      this.legs.push(leg);
    }

    const clawMat = makePS1Material({ color: 0x4c9052 });
    this.clawL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.45), clawMat);
    this.clawL.geometry.translate(0, 0, 0.22);
    this.clawL.position.set(-0.32, 0.32, 0.28);
    this.crabGroup.add(this.clawL);
    this.clawR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.45), clawMat.clone());
    this.clawR.geometry.translate(0, 0, 0.22);
    this.clawR.position.set(0.32, 0.32, 0.28);
    this.crabGroup.add(this.clawR);

    this.object.add(this.crabGroup);

    this.parts = [
      { tag: 'body', node: this.bodyShell, radius: 0.5, damageMultiplier: 1, weakPoint: false, active: true, flatDamageOverride: 1 },
      { tag: 'underside', node: this.underside, radius: 0.4, damageMultiplier: 6, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();

    this.setUnfolded(0);
  }

  private setUnfolded(k: number): void {
    this.plateTop.rotation.x = -k * 1.1;
    this.plateL.rotation.z = -k * 0.9;
    this.plateR.rotation.z = k * 0.9;
    this.bodyShell.scale.setScalar(0.6 + k * 0.4);
    this.eyeL.scale.setScalar(0.2 + k * 0.8);
    this.eyeR.scale.setScalar(0.2 + k * 0.8);
    for (const leg of this.legs) leg.scale.y = 0.2 + k * 0.8;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const bodyPart = this.parts[0]!;
    const undersidePart = this.parts[1]!;
    bodyPart.flatDamageOverride = this.state === 'camouflaged' ? 1 : undefined;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // Flip animation: lerp the whole crab onto its back and upright again.
    const flipTarget = this.state === 'flipped' ? Math.PI : 0;
    this.flipRotX += (flipTarget - this.flipRotX) * Math.min(1, dt * 6);
    this.crabGroup.rotation.x = this.flipRotX;
    undersidePart.active = this.state === 'flipped';

    switch (this.state) {
      case 'camouflaged': {
        if (dist <= TRIGGER_RANGE) {
          this.state = 'unfold';
          this.timer = UNFOLD_TIME;
        }
        break;
      }
      case 'unfold': {
        // TELEGRAPH: rubble plates hinge open, legs extend, eyes pop up.
        const k = 1 - Math.max(0, this.timer) / UNFOLD_TIME;
        this.setUnfolded(k);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.setUnfolded(1);
          this.state = 'approach';
        }
        break;
      }
      case 'approach': {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeSign *= -1;
          this.strafeTimer = 1 + Math.random() * 1.2;
        }
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (dist > APPROACH_RANGE) {
          const forward = toPlayer.clone().normalize();
          const lateral = new THREE.Vector3(-forward.z, 0, forward.x).multiplyScalar(this.strafeSign);
          this.object.position.addScaledVector(lateral, 1.3 * dt);
          this.object.position.addScaledVector(forward, 0.5 * dt);
        } else {
          this.state = 'clawWindup';
          this.timer = WINDUP_TIME;
        }
        this.legs.forEach((leg, i) => {
          leg.rotation.x = Math.sin(this.t * 10 + i) * 0.3;
        });
        break;
      }
      case 'clawWindup': {
        // TELEGRAPH: claws draw back and open.
        const k = 1 - Math.max(0, this.timer) / WINDUP_TIME;
        this.clawL.rotation.x = -k * 0.9;
        this.clawR.rotation.x = -k * 0.9;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'clawPinch';
          this.timer = PINCH_TIME;
          this.pinchDidDamage = false;
        }
        break;
      }
      case 'clawPinch': {
        const k = 1 - Math.max(0, this.timer) / PINCH_TIME;
        this.clawL.rotation.x = -0.9 + k * 1.4;
        this.clawR.rotation.x = -0.9 + k * 1.4;
        if (!this.pinchDidDamage && k > 0.4 && dist <= PINCH_RANGE && !ctx.playerIFrames) {
          ctx.dealDamageToPlayer(PINCH_DMG);
          this.pinchDidDamage = true;
        }
        if (this.timer <= 0) {
          this.clawL.rotation.x = 0;
          this.clawR.rotation.x = 0;
          if (Math.random() < FLIP_CHANCE) {
            this.state = 'flipped';
            this.timer = FLIP_TIME;
          } else {
            this.state = 'recover';
            this.timer = 0.5;
          }
        }
        break;
      }
      case 'flipped': {
        this.crabGroup.rotation.z = Math.sin(this.t * 9) * 0.15;
        if (this.timer <= 0) {
          this.crabGroup.rotation.z = 0;
          this.state = 'recover';
          this.timer = 0.3;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) this.state = 'approach';
        break;
      }
    }
  }
}
