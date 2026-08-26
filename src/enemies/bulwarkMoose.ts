import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'stompApproach' | 'chargeTelegraph' | 'charge' | 'stuck' | 'recover';

const CHARGE_TRIGGER_RANGE = 6.0;
const CHARGE_TELEGRAPH_TIME = 0.9;
const CHARGE_SPEED = 15;
const CHARGE_MAX_DIST = 12;
const CHARGE_HIT_RANGE = 1.4;
const CHARGE_DMG = 30;
const STUCK_TIME = 2.5;
const RECOVER_TIME = 1.0;

// Bull moose + snapping-turtle shell plating chimera. Siege boss: the
// frontal shell shrugs off head-on hits (flat 1 damage) so the fight is
// about dodging the charge and punishing the CRASH — 2.5s stuck with its
// antlers embedded and its head wide open.
export class BulwarkMoose extends Enemy {
  readonly displayName = 'Bulwark Moose';
  faction = 'moose';

  private state: State = 'stompApproach';
  private timer = 0;
  private t = 0;
  private chargeDidDamage = false;
  private chargeTraveled = 0;
  private readonly chargeDir = new THREE.Vector3();

  private readonly torso: THREE.Mesh;
  private readonly headGroup = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly legFL: THREE.Mesh;
  private readonly legs: THREE.Mesh[] = [];
  private readonly puffs: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 180;
    this.radius = 1.2;

    const hideMat = makePS1Material({ color: 0x4a3a2c });
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 2.2, 2, 2, 2), hideMat);
    this.torso.position.y = 1.15;
    this.object.add(this.torso);

    const shellMat = makePS1Material({ color: 0x50603a });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.05, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat);
    shell.scale.set(1, 0.6, 1.15);
    shell.position.set(0, 1.55, 0.15);
    this.object.add(shell);

    const hoofMat = makePS1Material({ color: 0x1c1712 });
    const legMat = makePS1Material({ color: 0x2e2318 });
    const addHoof = (leg: THREE.Mesh) => {
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.09, 0.24), hoofMat.clone());
      hoof.position.set(0, -0.56, 0.03);
      leg.add(hoof);
    };
    this.legFL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 7), legMat.clone());
    this.legFL.position.set(-0.55, 0.55, 0.75);
    this.object.add(this.legFL);
    this.legs.push(this.legFL);
    addHoof(this.legFL);
    for (const [sx, sz] of [[0.55, 0.75], [-0.55, -0.75], [0.55, -0.75]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 7), legMat.clone());
      leg.position.set(sx, 0.55, sz);
      this.object.add(leg);
      this.legs.push(leg);
      addHoof(leg);
    }

    this.headGroup.position.set(0, 1.5, 1.15);
    this.object.add(this.headGroup);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.7), hideMat.clone());
    this.head.position.z = 0.3;
    this.headGroup.add(this.head);

    // Dark eyes with a glinting highlight either side of the head.
    const eyeMat = makePS1Material({ color: 0x140f0a });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
    for (const sx of [-0.19, 0.19]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), eyeMat);
      eye.position.set(sx, 0.06, 0.5);
      this.headGroup.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 4, 3), glintMat);
      glint.position.set(sx + 0.02, 0.08, 0.53);
      this.headGroup.add(glint);
    }
    // Dark nostrils at the muzzle tip.
    const nostrilMat = makePS1Material({ color: 0x1a120c });
    for (const sx of [-0.08, 0.08]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), nostrilMat);
      nostril.scale.set(1, 0.7, 1);
      nostril.position.set(sx, -0.08, 0.63);
      this.headGroup.add(nostril);
    }

    const antlerMat = makePS1Material({ color: 0x8a7a5c });
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.55, 6), antlerMat.clone());
      beam.geometry.translate(0, 0.28, 0);
      beam.position.set(side * 0.22, 0.3, 0.35);
      beam.rotation.z = side * 0.5;
      beam.rotation.x = -0.3;
      this.headGroup.add(beam);
      for (const t of [0.4, 0.75]) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.24, 6), antlerMat.clone());
        tine.geometry.translate(0, 0.12, 0);
        tine.position.set(side * (0.22 + side * 0.12 * t), 0.28 + t * 0.4, 0.35);
        tine.rotation.z = side * (0.9 + t * 0.4);
        this.headGroup.add(tine);
      }
    }

    // Snort puffs: small pale spheres near the muzzle, hidden until telegraph.
    const puffMat = makePS1Material({ color: 0xdedad0 });
    for (const sx of [-0.1, 0.1]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), puffMat.clone());
      puff.position.set(sx, -0.05, 0.62);
      puff.visible = false;
      this.headGroup.add(puff);
      this.puffs.push(puff);
    }

    this.parts = [
      { tag: 'body', node: this.torso, radius: 1.1, damageMultiplier: 1, weakPoint: false, active: true, flatDamageOverride: 1 },
      { tag: 'head', node: this.head, radius: 0.45, damageMultiplier: 6, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    // Slow chest breathing, always running, low amplitude.
    const breathe = 1 + Math.sin(this.t * 1.5) * 0.02;
    this.torso.scale.set(breathe, 1, breathe);

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    const headPart = this.parts[1]!;

    switch (this.state) {
      case 'stompApproach': {
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        this.object.position.y = Math.abs(Math.sin(this.t * 2.2)) * 0.06; // heavy stomps
        this.legFL.rotation.x = Math.sin(this.t * 2.2) * 0.4;
        for (const puff of this.puffs) puff.visible = false;
        if (dist > 2.5 && dist <= CHARGE_TRIGGER_RANGE) {
          this.state = 'chargeTelegraph';
          this.timer = CHARGE_TELEGRAPH_TIME;
        } else if (dist > CHARGE_TRIGGER_RANGE) {
          this.object.position.addScaledVector(toPlayer.normalize(), 1.3 * dt);
        } else {
          this.object.position.addScaledVector(toPlayer.normalize(), 1.3 * dt);
        }
        break;
      }
      case 'chargeTelegraph': {
        // TELEGRAPH: scrapes a hoof, lowers antlers, snorts steam.
        const k = 1 - Math.max(0, this.timer) / CHARGE_TELEGRAPH_TIME;
        this.legFL.rotation.x = -k * 0.6;
        this.headGroup.rotation.x = k * 0.5;
        for (const puff of this.puffs) {
          puff.visible = true;
          puff.scale.setScalar(0.6 + Math.sin(this.t * 20) * 0.4);
        }
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          for (const puff of this.puffs) puff.visible = false;
          this.legFL.rotation.x = 0;
          this.state = 'charge';
          this.chargeDidDamage = false;
          this.chargeTraveled = 0;
          this.chargeDir.copy(toPlayer).normalize();
        }
        break;
      }
      case 'charge': {
        const step = CHARGE_SPEED * dt;
        this.object.position.addScaledVector(this.chargeDir, step);
        this.chargeTraveled += step;
        this.object.position.y = 0;
        if (!this.chargeDidDamage && dist <= CHARGE_HIT_RANGE && !ctx.playerIFrames) {
          ctx.dealDamageToPlayer(CHARGE_DMG);
          this.chargeDidDamage = true;
        }
        if (this.chargeDidDamage || this.chargeTraveled >= CHARGE_MAX_DIST) {
          // CRASH: antlers embed into whatever it hit (player, wall, ground).
          this.state = 'stuck';
          this.timer = STUCK_TIME;
          this.headGroup.rotation.x = 1.0;
          headPart.active = true;
        }
        break;
      }
      case 'stuck': {
        headPart.active = true;
        this.object.position.y = Math.sin(this.t * 30) * 0.02; // straining to pull free
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = RECOVER_TIME;
        }
        break;
      }
      case 'recover': {
        // Wrenches free: antlers lift back up over the recovery window.
        const k = 1 - Math.max(0, this.timer) / RECOVER_TIME;
        this.headGroup.rotation.x = 1.0 * (1 - k);
        this.object.position.y = 0;
        if (this.timer <= 0) {
          this.headGroup.rotation.x = 0;
          headPart.active = false;
          this.state = 'stompApproach';
        }
        break;
      }
    }
  }
}
