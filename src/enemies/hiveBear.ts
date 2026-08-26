import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext, type EnemyPart } from './enemyBase';

type State = 'lumber' | 'swipeTelegraph' | 'swipe' | 'roarTelegraph' | 'roar' | 'hiveLinger' | 'recover';

const SWIPE_RANGE = 2.0;
const SWIPE_TELEGRAPH_TIME = 0.8;
const SWIPE_HIT_RANGE = 1.8;
const SWIPE_DMG = 20;
const ROAR_TELEGRAPH_TIME = 1.0;
const ROAR_TIME = 0.4;
const ROAR_LINGER_TIME = 1.2;
const ROAR_RANGE = 3.0;
const ROAR_DMG = 10;
const WASP_CLOUD_TIME = 3.0;
const WASP_TICK = 0.8;
const WASP_DMG = 3;
const WASP_RANGE = 2.5;
const WASP_COUNT = 6;

// Black bear + paper-wasp hive chimera. Boss-tier. Body shots anger it — a
// hidden wasp cloud boils out and stings the player on a tick — so the
// intended tactic is to bait the roar (chest hive splits open) and punish
// the exposed hive core instead.
export class HiveBear extends Enemy {
  readonly displayName = 'Hive Bear';
  faction = 'bear';

  private state: State = 'lumber';
  private timer = 0;
  private t = 0;
  private swipeDidDamage = false;
  private roarDidDamage = false;
  private roarCooldown = 4 + Math.random() * 3;
  private waspCloudTimer = 0;
  private waspTickAccum = 0;

  private readonly torso: THREE.Mesh;
  private readonly armPivot = new THREE.Group();
  private readonly arm: THREE.Mesh;
  private readonly armLOther: THREE.Mesh;
  private readonly hivePlateL: THREE.Mesh;
  private readonly hivePlateR: THREE.Mesh;
  private readonly hiveCore: THREE.Mesh;
  private readonly hiveCoreMat: THREE.MeshLambertMaterial;
  private readonly waspCloudGroup = new THREE.Group();
  private readonly waspSpheres: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 220;
    this.radius = 1.1;

    const furMat = makePS1Material({ color: 0x3a2c22 });
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 1.6, 2, 2, 2), furMat);
    this.torso.position.y = 1.1;
    this.object.add(this.torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 7, 5), furMat.clone());
    head.position.set(0, 1.95, 0.55);
    this.object.add(head);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.35, 5), furMat.clone());
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 1.85, 0.9);
    this.object.add(snout);

    const legMat = makePS1Material({ color: 0x2c2018 });
    for (const [sx, sz] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.0, 5), legMat.clone());
      leg.position.set(sx, 0.5, sz);
      this.object.add(leg);
    }

    this.armPivot.position.set(0.75, 1.65, 0.2);
    this.object.add(this.armPivot);
    this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 5), furMat.clone());
    this.arm.geometry.translate(0, -0.55, 0);
    this.armPivot.add(this.arm);

    this.armLOther = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 5), furMat.clone());
    this.armLOther.position.set(-0.75, 1.1, 0.2);
    this.object.add(this.armLOther);

    // Hive grown into the chest: two hinged plates over a glowing core.
    const hiveMat = makePS1Material({ color: 0xc9a86a });
    this.hivePlateL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.3), hiveMat);
    this.hivePlateL.position.set(-0.2, 1.15, 0.78);
    this.object.add(this.hivePlateL);
    this.hivePlateR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.3), hiveMat.clone());
    this.hivePlateR.position.set(0.2, 1.15, 0.78);
    this.object.add(this.hivePlateR);
    this.hiveCoreMat = makePS1Material({ color: 0x8a5a1a });
    this.hiveCore = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), this.hiveCoreMat);
    this.hiveCore.position.set(0, 1.15, 0.75);
    this.object.add(this.hiveCore);

    const waspMat = makePS1Material({ color: 0x151515 });
    for (let i = 0; i < WASP_COUNT; i++) {
      const wasp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), waspMat.clone());
      this.waspCloudGroup.add(wasp);
      this.waspSpheres.push(wasp);
    }
    this.waspCloudGroup.visible = false;
    this.object.add(this.waspCloudGroup);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 1.0, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'hiveCore', node: this.hiveCore, radius: 0.3, damageMultiplier: 7, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  override takeHit(amount: number, part: EnemyPart | null): number {
    const dealt = super.takeHit(amount, part);
    if (part?.tag === 'body') {
      this.waspCloudTimer = WASP_CLOUD_TIME;
    }
    return dealt;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;
    this.roarCooldown -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // Wasp cloud: boils out on body shots and stings on a tick.
    if (this.waspCloudTimer > 0) {
      this.waspCloudTimer -= dt;
      this.waspCloudGroup.visible = true;
      this.waspTickAccum += dt;
      if (this.waspTickAccum >= WASP_TICK) {
        this.waspTickAccum -= WASP_TICK;
        if (!ctx.playerIFrames && dist <= WASP_RANGE) ctx.dealDamageToPlayer(WASP_DMG);
      }
      for (let i = 0; i < this.waspSpheres.length; i++) {
        const angle = this.t * 4 + (i / this.waspSpheres.length) * Math.PI * 2;
        this.waspSpheres[i]!.position.set(
          Math.cos(angle) * 0.9,
          1.3 + Math.sin(this.t * 3 + i) * 0.2,
          0.4 + Math.sin(angle) * 0.9,
        );
      }
    } else {
      this.waspCloudGroup.visible = false;
      this.waspTickAccum = 0;
    }

    const hiveCorePart = this.parts[1]!;

    switch (this.state) {
      case 'lumber': {
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.roarCooldown <= 0) {
          this.state = 'roarTelegraph';
          this.timer = ROAR_TELEGRAPH_TIME;
        } else if (dist > SWIPE_RANGE) {
          this.object.position.addScaledVector(toPlayer.normalize(), 1.1 * dt);
        } else {
          this.state = 'swipeTelegraph';
          this.timer = SWIPE_TELEGRAPH_TIME;
        }
        break;
      }
      case 'swipeTelegraph': {
        // TELEGRAPH: rears one arm high before the swipe.
        const k = 1 - Math.max(0, this.timer) / SWIPE_TELEGRAPH_TIME;
        this.armPivot.rotation.x = -k * 1.6;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'swipe';
          this.timer = 0.35;
          this.swipeDidDamage = false;
        }
        break;
      }
      case 'swipe': {
        const k = 1 - Math.max(0, this.timer) / 0.35;
        this.armPivot.rotation.x = -1.6 + k * 2.1;
        if (!this.swipeDidDamage && k > 0.4 && dist <= SWIPE_HIT_RANGE && !ctx.playerIFrames) {
          ctx.dealDamageToPlayer(SWIPE_DMG);
          this.swipeDidDamage = true;
        }
        if (this.timer <= 0) {
          this.armPivot.rotation.x = 0;
          this.state = 'recover';
          this.timer = 0.6;
        }
        break;
      }
      case 'roarTelegraph': {
        // TELEGRAPH: stands full height, chest hive splits open — the core
        // is exposed and targetable from this moment on.
        const k = 1 - Math.max(0, this.timer) / ROAR_TELEGRAPH_TIME;
        this.object.position.y = k * 0.15;
        this.armPivot.rotation.x = -k * 0.7;
        this.armLOther.rotation.x = -k * 0.7;
        this.hivePlateL.rotation.y = -k * 1.2;
        this.hivePlateR.rotation.y = k * 1.2;
        hiveCorePart.active = true;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'roar';
          this.timer = ROAR_TIME;
          this.roarDidDamage = false;
        }
        break;
      }
      case 'roar': {
        hiveCorePart.active = true;
        this.hiveCoreMat.emissive.setHex(0xff8822);
        if (!this.roarDidDamage && this.timer <= 0.03 && !ctx.playerIFrames && dist <= ROAR_RANGE) {
          ctx.dealDamageToPlayer(ROAR_DMG);
          this.roarDidDamage = true;
        }
        if (this.timer <= 0) {
          this.state = 'hiveLinger';
          this.timer = ROAR_LINGER_TIME;
        }
        break;
      }
      case 'hiveLinger': {
        hiveCorePart.active = true;
        if (this.timer <= 0) {
          this.hiveCoreMat.emissive.setHex(0x000000);
          this.hivePlateL.rotation.y = 0;
          this.hivePlateR.rotation.y = 0;
          hiveCorePart.active = false;
          this.object.position.y = 0;
          this.roarCooldown = 7 + Math.random() * 4;
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) this.state = 'lumber';
        break;
      }
    }
  }
}
