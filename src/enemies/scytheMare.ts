import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'circle' | 'rearTelegraph' | 'charge' | 'skidTurn' | 'sweep';

const CIRCLE_RADIUS = 6;

// Scythe Mare: a carriage horse fused with praying-mantis fore-arms, wing
// cases folded on its back. Every third attack swaps the charge for a
// stationary 180-degree arm sweep — the same rearing telegraph precedes both.
export class ScytheMare extends Enemy {
  readonly displayName = 'Scythe Mare';
  faction = 'mare';

  private state: State = 'circle';
  private timer = 1.5 + Math.random();
  private t = 0;
  private angle = Math.random() * Math.PI * 2;
  private attackCount = 0;
  private isSweep = false;
  private chargeDidDamage = false;
  private sweepDidDamage = false;
  private readonly chargeDir = new THREE.Vector3();
  private readonly bodyMesh: THREE.Mesh;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly wingCaseGroup = new THREE.Group();
  private readonly wingCaseL: THREE.Mesh;
  private readonly wingCaseR: THREE.Mesh;
  private readonly earL: THREE.Mesh;
  private readonly earR: THREE.Mesh;
  private readonly mandibleL: THREE.Mesh;
  private readonly mandibleR: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 110;
    this.radius = 0.9;

    const hideMat = makePS1Material({ color: 0x3a2a22 });
    this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 2.0, 2, 2, 2), hideMat);
    this.bodyMesh.position.y = 1.0;
    this.object.add(this.bodyMesh);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.7, 1, 1, 1), hideMat);
    head.position.set(0, 1.55, 1.15);
    this.object.add(head);

    // Horse ears, still very much a horse under the chitin.
    const earMat = makePS1Material({ color: 0x2c1e18 });
    this.earL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), earMat);
    this.earL.position.set(-0.12, 1.85, 1.1);
    this.earL.rotation.z = 0.15;
    this.object.add(this.earL);
    this.earR = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), earMat.clone());
    this.earR.position.set(0.12, 1.85, 1.1);
    this.earR.rotation.z = -0.15;
    this.object.add(this.earR);

    // Eyes with a glint, dead center of the horse-box skull.
    const eyeMat = makePS1Material({ color: 0x1a1a14 });
    const eyeshineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), eyeMat);
      eye.position.set(sx, 1.6, 1.42);
      this.object.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 3), eyeshineMat);
      shine.position.set(sx - 0.012, 1.62, 1.45);
      this.object.add(shine);
    }

    // Mantis mandibles, grafted below the horse muzzle.
    const mandibleMat = makePS1Material({ color: 0x4a5a2a });
    this.mandibleL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), mandibleMat);
    this.mandibleL.rotation.x = Math.PI / 2 + 0.3;
    this.mandibleL.position.set(-0.08, 1.35, 1.45);
    this.object.add(this.mandibleL);
    this.mandibleR = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), mandibleMat.clone());
    this.mandibleR.rotation.x = Math.PI / 2 - 0.3;
    this.mandibleR.position.set(0.08, 1.35, 1.45);
    this.object.add(this.mandibleR);

    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 1.3, 1, 1, 1), makePS1Material({ color: 0x1c140f }));
    mane.position.set(0, 1.65, 0.5);
    this.object.add(mane);

    const legMat = makePS1Material({ color: 0x2c2018 });
    for (const [sx, sz] of [[-0.4, 0.8], [0.4, 0.8], [-0.4, -0.8], [0.4, -0.8]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.0, 8), legMat);
      leg.position.set(sx, 0.5, sz);
      this.object.add(leg);
    }

    const armMat = makePS1Material({ color: 0x4a5a2a });
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.1, 1, 1, 2), armMat);
    this.armL.geometry.translate(0, 0, -0.55);
    this.armL.position.set(-0.4, 1.1, 1.0);
    this.object.add(this.armL);
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.1, 1, 1, 2), armMat.clone());
    this.armR.geometry.translate(0, 0, -0.55);
    this.armR.position.set(0.4, 1.1, 1.0);
    this.object.add(this.armR);
    for (const arm of [this.armL, this.armR]) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 7), armMat);
      blade.rotation.x = -Math.PI / 2;
      blade.position.set(0, 0, -1.0);
      arm.add(blade);
    }

    const wcMat = makePS1Material({ color: 0x22261a });
    this.wingCaseL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.55, 1, 1, 1), wcMat);
    this.wingCaseL.geometry.translate(-0.2, 0, 0);
    this.wingCaseL.position.set(-0.05, 1.55, -0.2);
    this.wingCaseR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.55, 1, 1, 1), wcMat.clone());
    this.wingCaseR.geometry.translate(0.2, 0, 0);
    this.wingCaseR.position.set(0.05, 1.55, -0.2);
    this.wingCaseGroup.add(this.wingCaseL, this.wingCaseR);
    this.object.add(this.wingCaseGroup);

    this.parts = [
      { tag: 'body', node: this.bodyMesh, radius: 0.9, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'wingCase', node: this.wingCaseGroup, radius: 0.35, damageMultiplier: 5, weakPoint: true, active: false },
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

    // Idle ear twitch and mandible click, layered under whatever the state does.
    this.earL.rotation.x = Math.sin(this.t * 2.3) * 0.1;
    this.earR.rotation.x = Math.sin(this.t * 2.3 + 0.6) * 0.1;
    const mandibleTwitch = (Math.sin(this.t * 2.7) * 0.5 + 0.5) * 0.06;
    this.mandibleL.rotation.z = -mandibleTwitch;
    this.mandibleR.rotation.z = mandibleTwitch;

    const wingCasePart = this.parts[1]!;
    wingCasePart.active =
      this.state === 'rearTelegraph' || this.state === 'charge' ||
      this.state === 'skidTurn' || this.state === 'sweep';

    switch (this.state) {
      case 'circle': {
        this.angle += dt * 0.5;
        const target = ctx.playerPos.clone().add(
          new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle)).multiplyScalar(CIRCLE_RADIUS),
        );
        const toTarget = target.sub(this.object.position);
        toTarget.y = 0;
        if (toTarget.lengthSq() > 0.04) this.object.position.addScaledVector(toTarget.normalize(), 2.6 * dt);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        this.foldArms(dt);
        if (this.timer <= 0) {
          this.isSweep = this.attackCount % 3 === 2;
          this.state = 'rearTelegraph';
          this.timer = 0.8;
        }
        break;
      }
      case 'rearTelegraph': {
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.bodyMesh.rotation.x = -k * 0.35;
        this.armL.rotation.x = -k * 1.1;
        this.armR.rotation.x = -k * 1.1;
        this.armL.rotation.y = k * 0.6;
        this.armR.rotation.y = -k * 0.6;
        this.wingCaseL.rotation.z = k * 1.2;
        this.wingCaseR.rotation.z = -k * 1.2;
        if (this.timer <= 0) {
          if (this.isSweep) {
            this.state = 'sweep';
            this.timer = 0.9;
            this.sweepDidDamage = false;
          } else {
            this.state = 'charge';
            this.timer = 0.7;
            this.chargeDidDamage = false;
            this.chargeDir.copy(dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1));
            this.object.rotation.y = Math.atan2(this.chargeDir.x, this.chargeDir.z);
          }
        }
        break;
      }
      case 'charge': {
        this.object.position.addScaledVector(this.chargeDir, 12 * dt);
        this.bodyMesh.rotation.x = -0.15;
        if (!this.chargeDidDamage && !ctx.playerIFrames && dist < 1.2) {
          ctx.dealDamageToPlayer(24);
          this.chargeDidDamage = true;
        }
        if (this.timer <= 0) {
          this.state = 'skidTurn';
          this.timer = 1.2;
        }
        break;
      }
      case 'skidTurn': {
        this.bodyMesh.rotation.x *= Math.max(0, 1 - dt * 4);
        if (dist > 0.01) {
          let diff = Math.atan2(toPlayer.x, toPlayer.z) - this.object.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.object.rotation.y += diff * Math.min(1, dt * 2.5);
        }
        this.foldArms(dt);
        this.wingCaseL.rotation.z *= Math.max(0, 1 - dt * 3);
        this.wingCaseR.rotation.z *= Math.max(0, 1 - dt * 3);
        if (this.timer <= 0) {
          this.attackCount++;
          this.state = 'circle';
          this.timer = 1.8 + Math.random();
        }
        break;
      }
      case 'sweep': {
        const k = 1 - Math.max(0, this.timer) / 0.9;
        const sweepAngle = (k - 0.5) * Math.PI; // sweeps roughly -90deg..+90deg
        this.armL.rotation.y = 0.6 + sweepAngle;
        this.armR.rotation.y = -0.6 + sweepAngle;
        if (!this.sweepDidDamage && !ctx.playerIFrames && dist < 2.2 && k > 0.4 && k < 0.6) {
          const forward = new THREE.Vector3(Math.sin(this.object.rotation.y), 0, Math.cos(this.object.rotation.y));
          if (dist > 0.01 && forward.dot(toPlayer.clone().normalize()) > 0.2) {
            ctx.dealDamageToPlayer(18);
            this.sweepDidDamage = true;
          }
        }
        if (this.timer <= 0) {
          this.attackCount++;
          this.state = 'circle';
          this.timer = 1.8 + Math.random();
          this.wingCaseL.rotation.z = 0;
          this.wingCaseR.rotation.z = 0;
        }
        break;
      }
    }
  }

  private foldArms(dt: number): void {
    const rate = Math.min(1, dt * 5);
    this.armL.rotation.x += (0 - this.armL.rotation.x) * rate;
    this.armR.rotation.x += (0 - this.armR.rotation.x) * rate;
    this.armL.rotation.y += (0 - this.armL.rotation.y) * rate;
    this.armR.rotation.y += (0 - this.armR.rotation.y) * rate;
    this.bodyMesh.rotation.x += (0 - this.bodyMesh.rotation.x) * rate;
  }
}
