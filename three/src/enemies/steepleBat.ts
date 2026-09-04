import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'circle' | 'chirpTelegraph' | 'dive' | 'climb' | 'grounded';

const HOVER_Y = 2.2;
const CIRCLE_RADIUS = 4;
const GROUNDED_Y = 0.15;

// Steeple Bat: common bat + moray eel head chimera. It orbits high overhead
// on leathery wings, its eel maw glowing before it CHIRPS (telegraph) and
// swoops through player height. Wing it mid-dive and it crash-lands,
// crawling helplessly on the ground — an easy target until it recovers.
export class SteepleBat extends Enemy {
  readonly displayName = 'Steeple Bat';
  faction = 'bat';

  private state: State = 'circle';
  private timer = 1.0;
  private t = 0;
  private angle = Math.random() * Math.PI * 2;
  private readonly bodyGroup = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly headMat: THREE.MeshLambertMaterial;
  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;
  private readonly earL: THREE.Mesh;
  private readonly earR: THREE.Mesh;
  private readonly diveStart = new THREE.Vector3();
  private readonly diveEnd = new THREE.Vector3();
  private diveDidDamage = false;
  private lastHp = this.hp;

  constructor() {
    super();
    this.maxHp = this.hp = 35;
    this.lastHp = this.hp;
    this.radius = 0.4;

    const furMat = makePS1Material({ color: 0x2a2630 });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 6), furMat);
    this.body.scale.set(1, 0.9, 1.3);
    this.bodyGroup.add(this.body);

    // Bat ears — the one part of the silhouette still purely bat.
    const earMat = makePS1Material({ color: 0x201c26 });
    this.earL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), earMat);
    this.earL.position.set(-0.12, 0.22, 0.08);
    this.earL.rotation.z = 0.25;
    this.earR = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), earMat.clone());
    this.earR.position.set(0.12, 0.22, 0.08);
    this.earR.rotation.z = -0.25;
    this.bodyGroup.add(this.earL, this.earR);

    // Moray eel head grafted where the bat's snout should be.
    this.headMat = makePS1Material({ color: 0x4a5a3a });
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 8), this.headMat);
    this.head.rotation.x = Math.PI / 2;
    this.head.position.set(0, -0.02, 0.42);
    this.bodyGroup.add(this.head);

    // Tiny glinting eel eyes and a row of needle teeth at the maw tip.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xdff0c0 });
    for (const sx of [-0.06, 0.06]) {
      const eelEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), eyeMat);
      eelEye.position.set(sx, 0.03, 0.2);
      this.head.add(eelEye);
    }
    const toothMat = makePS1Material({ color: 0xe8e4d0 });
    const teeth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 5), toothMat);
    teeth.rotation.x = Math.PI / 2;
    teeth.position.set(0, -0.02, -0.24);
    this.head.add(teeth);

    const wingMat = makePS1Material({ color: 0x1c1a22 });
    this.wingL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.5, 3, 1, 1), wingMat);
    this.wingL.geometry.translate(-0.55, 0, 0);
    this.wingL.position.set(-0.12, 0, -0.05);
    this.wingR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.5, 3, 1, 1), wingMat.clone());
    this.wingR.geometry.translate(0.55, 0, 0);
    this.wingR.position.set(0.12, 0, -0.05);
    this.bodyGroup.add(this.wingL, this.wingR);

    // Clawed wing-finger tips, riding the wingtips through every flap.
    const clawMat = makePS1Material({ color: 0x100e14 });
    const wingClawL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), clawMat);
    wingClawL.rotation.z = Math.PI / 2;
    wingClawL.position.set(-1.08, 0, 0.02);
    this.wingL.add(wingClawL);
    const wingClawR = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), clawMat.clone());
    wingClawR.rotation.z = -Math.PI / 2;
    wingClawR.position.set(1.08, 0, 0.02);
    this.wingR.add(wingClawR);

    const legMat = makePS1Material({ color: 0x25222a });
    for (const sx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 7), legMat);
      leg.position.set(sx, -0.2, -0.15);
      this.bodyGroup.add(leg);
    }

    this.bodyGroup.position.y = HOVER_Y;
    this.object.add(this.bodyGroup);

    this.parts = [
      { tag: 'body', node: this.body, radius: 0.35, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'maw', node: this.head, radius: 0.22, damageMultiplier: 4, weakPoint: true, active: false },
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

    const mawPart = this.parts[1]!;
    mawPart.active = this.state === 'chirpTelegraph' || this.state === 'dive';
    this.headMat.emissive.setHex(mawPart.active ? 0x99cc44 : 0x000000);

    // Breathing bulge and ear twitch — always running underneath the state.
    const breathe = 1 + Math.sin(this.t * 3) * 0.04;
    this.body.scale.set(breathe, 0.9 * breathe, 1.3 * breathe);
    this.earL.rotation.x = Math.sin(this.t * 4.5) * 0.15;
    this.earR.rotation.x = Math.sin(this.t * 4.5 + 0.5) * 0.15;

    switch (this.state) {
      case 'circle': {
        this.angle += dt * 0.9;
        const target = ctx.playerPos.clone();
        target.x += Math.cos(this.angle) * CIRCLE_RADIUS;
        target.z += Math.sin(this.angle) * CIRCLE_RADIUS;
        target.y = HOVER_Y;
        this.object.position.lerp(target, Math.min(1, dt * 2));
        this.bodyGroup.position.y = HOVER_Y + Math.sin(this.t * 2) * 0.1;
        this.flapWings(10);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'chirpTelegraph';
          this.timer = 0.8;
        }
        break;
      }
      case 'chirpTelegraph': {
        // TELEGRAPH: maw glows, body shivers in place.
        this.bodyGroup.position.x = (Math.random() - 0.5) * 0.05;
        this.bodyGroup.position.z = (Math.random() - 0.5) * 0.05;
        this.flapWings(4);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.bodyGroup.position.x = 0;
          this.bodyGroup.position.z = 0;
          this.state = 'dive';
          this.timer = 0.9;
          this.diveDidDamage = false;
          this.lastHp = this.hp;
          this.diveStart.copy(this.object.position);
          this.diveEnd.copy(ctx.playerPos).add(toPlayer.clone().normalize().multiplyScalar(2.5));
          this.diveEnd.y = 0;
        }
        break;
      }
      case 'dive': {
        const k = 1 - Math.max(0, this.timer) / 0.9;
        this.object.position.lerpVectors(this.diveStart, this.diveEnd, k);
        this.bodyGroup.position.y = HOVER_Y - Math.sin(k * Math.PI) * (HOVER_Y - 0.6);
        this.flapWings(18);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (!this.diveDidDamage && !ctx.playerIFrames && k > 0.35 && k < 0.75 && dist < 1.0) {
          ctx.dealDamageToPlayer(13);
          this.diveDidDamage = true;
        }
        if (this.hp < this.lastHp) {
          // Winged mid-dive — crashes to the ground.
          this.state = 'grounded';
          this.timer = 3.0;
          this.bodyGroup.position.y = HOVER_Y;
        } else if (this.timer <= 0) {
          this.state = 'climb';
          this.timer = 0.6;
        }
        break;
      }
      case 'climb': {
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.bodyGroup.position.y = THREE.MathUtils.lerp(GROUNDED_Y, HOVER_Y, k);
        this.flapWings(14);
        if (this.timer <= 0) {
          this.bodyGroup.position.y = HOVER_Y;
          this.angle = Math.atan2(
            this.object.position.z - ctx.playerPos.z,
            this.object.position.x - ctx.playerPos.x,
          );
          this.state = 'circle';
          this.timer = 1.2 + Math.random() * 0.8;
        }
        break;
      }
      case 'grounded': {
        this.bodyGroup.position.y = GROUNDED_Y;
        this.wingL.rotation.z = 0.15;
        this.wingR.rotation.z = -0.15;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (dist > 0.5) {
          this.object.position.addScaledVector(toPlayer.normalize(), 0.5 * dt);
        }
        if (this.timer <= 0) {
          this.state = 'climb';
          this.timer = 0.6;
        }
        break;
      }
    }
  }

  private flapWings(speed: number): void {
    const beat = Math.sin(this.t * speed) * 0.6;
    this.wingL.rotation.z = 0.3 + beat;
    this.wingR.rotation.z = -0.3 - beat;
  }
}
