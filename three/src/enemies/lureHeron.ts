import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext, type EnemyPart } from './enemyBase';

type State = 'stand' | 'snapTelegraph' | 'beakSnap' | 'recoil';

const TRIGGER_RANGE = 4.0;
const SNAP_TIME_NORMAL = 0.6;
const SNAP_TIME_DIMMED = 1.2;
const BEAK_TIME = 0.5;
const BEAK_RANGE = 2.2;
const BEAK_DMG = 19;
const RECOIL_TIME = 0.7;
const LURE_DAMAGE_TO_DIM = 20;

const REST_REACH = 0.55;
const COIL_REACH = 0.3;
const SNAP_REACH = 1.5;

// Great blue heron + anglerfish esca chimera: a tall wader that stands
// eerily still, its dangling glowing lure bobbing enticingly. Shooting the
// lure is the trick — it is always a weak point, but only enough cumulative
// damage there permanently dims it and slows the heron's strike.
export class LureHeron extends Enemy {
  readonly displayName = 'Lure Heron';
  faction = 'heron';

  private state: State = 'stand';
  private timer = 0;
  private t = 0;
  private beakDidDamage = false;
  private lureDamage = 0;
  private dimmed = false;

  private readonly bodyMesh: THREE.Mesh;
  private readonly neckGroup = new THREE.Group();
  private readonly neckMesh: THREE.Mesh;
  private readonly headGroup = new THREE.Group();
  private readonly lure: THREE.Mesh;
  private readonly lureMat: THREE.MeshLambertMaterial;
  private readonly legs: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 55;
    this.radius = 0.5;

    const featherMat = makePS1Material({ color: 0x6d7a78 });
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 7), featherMat);
    this.bodyMesh.scale.set(1, 1.2, 1.3);
    this.bodyMesh.position.y = 0.95;
    this.object.add(this.bodyMesh);

    // Small tail-feather tuft, fanned off the back.
    const tailTuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), featherMat.clone());
    tailTuft.rotation.x = Math.PI * 0.42;
    tailTuft.position.set(0, 1.0, -0.36);
    this.object.add(tailTuft);

    const legMat = makePS1Material({ color: 0xd8c060 });
    for (const sx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 8), legMat.clone());
      leg.position.set(sx, 0.45, 0);
      this.object.add(leg);
      this.legs.push(leg);
      // Splayed toe claw at the foot.
      const toe = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), legMat.clone());
      toe.rotation.x = Math.PI / 2;
      toe.position.set(0, -0.44, 0.06);
      leg.add(toe);
    }

    // Neck: a pivot at the chest; the mesh extends forward along local +z,
    // so both coil (rotation) and reach (scale/length) can animate.
    this.neckGroup.position.set(0, 1.05, 0.1);
    this.object.add(this.neckGroup);
    this.neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, REST_REACH, 8), featherMat.clone());
    this.neckMesh.geometry.translate(0, REST_REACH / 2, 0);
    this.neckMesh.rotation.x = Math.PI / 2;
    this.neckGroup.add(this.neckMesh);

    this.headGroup.position.set(0, 0, REST_REACH);
    this.neckGroup.add(this.headGroup);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 7), makePS1Material({ color: 0xd8a020 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.z = 0.16;
    this.headGroup.add(beak);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), featherMat.clone());
    this.headGroup.add(skull);

    // Beady eyes with a glinting highlight, set either side of the skull.
    const eyeMat = makePS1Material({ color: 0x1a1614 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    for (const sx of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 5, 4), eyeMat);
      eye.position.set(sx, 0.03, 0.09);
      this.headGroup.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 4, 3), glintMat);
      glint.position.set(sx + 0.01, 0.04, 0.105);
      this.headGroup.add(glint);
    }

    // Dangling anglerfish lure: thin rod + glowing bulb, always a weak point.
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 6), makePS1Material({ color: 0x2a2a2a }));
    rod.position.set(0, -0.16, 0.12);
    this.headGroup.add(rod);
    this.lureMat = makePS1Material({ color: 0x2a3a1a });
    this.lure = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.lureMat);
    this.lure.position.set(0, -0.31, 0.12);
    this.headGroup.add(this.lure);

    this.parts = [
      { tag: 'body', node: this.bodyMesh, radius: 0.42, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'lure', node: this.lure, radius: 0.12, damageMultiplier: 6, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  override takeHit(amount: number, part: EnemyPart | null): number {
    const dealt = super.takeHit(amount, part);
    if (part?.tag === 'lure' && !this.dimmed) {
      this.lureDamage += dealt;
      if (this.lureDamage >= LURE_DAMAGE_TO_DIM) this.dimmed = true;
    }
    return dealt;
  }

  private setReach(reach: number): void {
    this.neckMesh.scale.y = Math.max(0.05, reach / REST_REACH);
    this.headGroup.position.z = reach;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    // Slow chest breathing and a faint weight-shift between the two legs.
    const breathe = 1 + Math.sin(this.t * 1.8) * 0.025;
    this.bodyMesh.scale.set(breathe, 1.2 * breathe, 1.3 * breathe);
    if (this.legs[0]) this.legs[0].rotation.z = Math.sin(this.t * 0.7) * 0.03;
    if (this.legs[1]) this.legs[1].rotation.z = -Math.sin(this.t * 0.7) * 0.03;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    // Lure bob/glow — permanently dark once dimmed.
    if (this.dimmed) {
      this.lureMat.emissive.setHex(0x000000);
      this.lure.scale.setScalar(1);
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.6);
      this.lureMat.emissive.setRGB(0.1 + pulse * 0.5, 0.9 * pulse, 0.15 + pulse * 0.3);
      this.lure.scale.setScalar(1 + pulse * 0.15);
    }

    const snapTime = this.dimmed ? SNAP_TIME_DIMMED : SNAP_TIME_NORMAL;

    switch (this.state) {
      case 'stand': {
        this.neckGroup.rotation.x = Math.sin(this.t * 1.4) * 0.03 - 0.15;
        this.setReach(REST_REACH);
        if (dist <= TRIGGER_RANGE) {
          this.state = 'snapTelegraph';
          this.timer = snapTime;
        }
        break;
      }
      case 'snapTelegraph': {
        // TELEGRAPH: neck coils into a tight S, drawing back to strike.
        const k = 1 - Math.max(0, this.timer) / snapTime;
        this.neckGroup.rotation.x = -0.15 - k * 0.9;
        this.setReach(REST_REACH - k * (REST_REACH - COIL_REACH));
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'beakSnap';
          this.timer = BEAK_TIME;
          this.beakDidDamage = false;
        }
        break;
      }
      case 'beakSnap': {
        const k = 1 - Math.max(0, this.timer) / BEAK_TIME;
        this.neckGroup.rotation.x = -1.05 + k * 1.3;
        this.setReach(COIL_REACH + k * (SNAP_REACH - COIL_REACH));
        if (!this.beakDidDamage && k > 0.5 && dist <= BEAK_RANGE && !ctx.playerIFrames) {
          ctx.dealDamageToPlayer(BEAK_DMG);
          this.beakDidDamage = true;
        }
        if (this.timer <= 0) {
          this.state = 'recoil';
          this.timer = RECOIL_TIME;
        }
        break;
      }
      case 'recoil': {
        const k = Math.max(0, this.timer) / RECOIL_TIME;
        this.neckGroup.rotation.x = -0.15 - k * 0.2;
        this.setReach(SNAP_REACH - (1 - k) * (SNAP_REACH - REST_REACH));
        if (this.timer <= 0) {
          this.setReach(REST_REACH);
          this.state = 'stand';
          this.timer = 0.3 + Math.random() * 0.6;
        }
        break;
      }
    }
  }
}
