import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'drift' | 'swellTelegraph' | 'dischargeDip' | 'riseBack';

const FLOAT_Y = 1.8;
const DIP_Y = 0.9;
const TENDRIL_COUNT = 4;

// Sting Gull: a seagull fused to a jellyfish bell, tendrils trailing below.
// The slow drift is itself a passive hazard — brush the tendrils and get
// stung — and every few seconds it also swells and dips for a bigger jolt.
export class StingGull extends Enemy {
  readonly displayName = 'Sting Gull';
  faction = 'gull';

  private state: State = 'drift';
  private timer = 3 + Math.random() * 2;
  private t = 0;
  private contactCooldown = 0;
  private dischargeDidDamage = false;
  private readonly headMesh: THREE.Mesh;
  private readonly bellMesh: THREE.Mesh;
  private readonly bellMat: THREE.MeshLambertMaterial;
  private readonly bellCore: THREE.Mesh;
  private readonly bellCoreMat: THREE.MeshBasicMaterial;
  private readonly tendrils: THREE.Mesh[] = [];
  private readonly wings: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 14;
    this.radius = 0.35;
    this.object.position.y = FLOAT_Y;

    const featherMat = makePS1Material({ color: 0xd8d4c8 });
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), featherMat);
    this.headMesh.position.set(0, 0.28, 0.1);
    this.object.add(this.headMesh);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), makePS1Material({ color: 0xd8a030 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.27, 0.24);
    this.object.add(beak);

    // Beady gull eyes with a glint of eyeshine.
    const eyeMat = makePS1Material({ color: 0x1a1a1a });
    const eyeshineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), eyeMat);
      eye.position.set(sx, 0.32, 0.21);
      this.object.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.007, 4, 3), eyeshineMat);
      shine.position.set(sx - 0.006, 0.33, 0.225);
      this.object.add(shine);
    }

    const wingMat = makePS1Material({ color: 0xb8b4a8 });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.18, 2, 1, 1), wingMat);
      wing.geometry.translate(side * 0.25, 0, 0);
      wing.position.set(0, 0.2, 0);
      wing.rotation.z = side * 0.15;
      this.object.add(wing);
      this.wings.push(wing);
    }

    this.bellMat = makePS1Material({ color: 0x9ac8d8 });
    this.bellMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), this.bellMat);
    this.bellMesh.scale.set(1, 0.75, 1);
    this.object.add(this.bellMesh);

    // Bioluminescent core glowing faintly inside the bell.
    this.bellCoreMat = new THREE.MeshBasicMaterial({
      color: 0x8ae0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    });
    this.bellCore = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.bellCoreMat);
    this.bellMesh.add(this.bellCore);

    const tendrilMat = makePS1Material({ color: 0x7ab0c0 });
    for (let i = 0; i < TENDRIL_COUNT; i++) {
      const a = (i / TENDRIL_COUNT) * Math.PI * 2;
      const tendril = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.3, 6), tendrilMat);
      tendril.geometry.translate(0, -0.65, 0);
      tendril.position.set(Math.cos(a) * 0.15, -0.15, Math.sin(a) * 0.15);
      this.object.add(tendril);
      this.tendrils.push(tendril);
    }

    this.parts = [
      { tag: 'head', node: this.headMesh, radius: 0.16, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'bell', node: this.bellMesh, radius: 0.32, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected override onDeath(): void {
    // Pops like a soap bubble — no lingering hazard pool (that's later).
    this.bellMesh.scale.set(2.2, 1.6, 2.2);
    for (const t of this.tendrils) t.visible = false;
    this.headMesh.visible = false;
    this.object.position.y = FLOAT_Y;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;
    if (this.contactCooldown > 0) this.contactCooldown -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    // Idle wing flap, tendril drift-sway, and core pulse — layered under state logic.
    const flap = Math.sin(this.t * 3) * 0.06;
    for (let i = 0; i < this.wings.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.wings[i]!.rotation.z = side * 0.15 + flap * side;
    }
    for (let i = 0; i < this.tendrils.length; i++) {
      this.tendrils[i]!.rotation.x = Math.sin(this.t * 1.6 + i * 1.7) * 0.05;
      this.tendrils[i]!.rotation.z = Math.cos(this.t * 1.4 + i * 2.1) * 0.05;
    }
    this.bellCoreMat.opacity = 0.4 + Math.sin(this.t * 4) * 0.15;

    const bellPart = this.parts[1]!;
    bellPart.active = this.state === 'swellTelegraph' || this.state === 'dischargeDip';

    // Passive hazard: brushing the trailing tendrils always stings.
    if (
      this.contactCooldown <= 0 && !ctx.playerIFrames && dist < 0.9 &&
      ctx.playerPos.y < this.object.position.y
    ) {
      ctx.dealDamageToPlayer(8);
      this.contactCooldown = 1.0;
    }

    switch (this.state) {
      case 'drift': {
        if (dist > 0.6) this.object.position.addScaledVector(toPlayer.normalize(), 0.5 * dt);
        this.object.position.y += (FLOAT_Y - this.object.position.y) * Math.min(1, dt * 3);
        this.bellMesh.scale.set(1, 0.75, 1);
        this.bellMat.emissiveIntensity = 0;
        if (this.timer <= 0) {
          this.state = 'swellTelegraph';
          this.timer = 0.8;
        }
        break;
      }
      case 'swellTelegraph': {
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.bellMesh.scale.set(1 + k * 0.5, 0.75 + k * 0.4, 1 + k * 0.5);
        this.bellMat.emissive.setHex(0x2a6a88);
        this.bellMat.emissiveIntensity = 0.4 + k * 0.8;
        if (this.timer <= 0) {
          this.state = 'dischargeDip';
          this.timer = 1.0;
          this.dischargeDidDamage = false;
        }
        break;
      }
      case 'dischargeDip': {
        this.object.position.y += (DIP_Y - this.object.position.y) * Math.min(1, dt * 8);
        if (!this.dischargeDidDamage && !ctx.playerIFrames && dist < 1.4) {
          ctx.dealDamageToPlayer(16);
          this.dischargeDidDamage = true;
        }
        if (this.timer <= 0) {
          this.state = 'riseBack';
          this.timer = 0.6;
        }
        break;
      }
      case 'riseBack': {
        this.object.position.y += (FLOAT_Y - this.object.position.y) * Math.min(1, dt * 4);
        const fade = Math.max(0, this.timer) / 0.6;
        this.bellMesh.scale.set(1 + fade * 0.2, 0.75 + fade * 0.15, 1 + fade * 0.2);
        this.bellMat.emissiveIntensity = fade * 0.8;
        if (this.timer <= 0) {
          this.bellMat.emissiveIntensity = 0;
          this.state = 'drift';
          this.timer = 4 + Math.random() * 2.5;
        }
        break;
      }
    }
  }
}
