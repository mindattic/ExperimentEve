import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'circle' | 'freezeStalk' | 'eyeGlint' | 'pounce' | 'recoverTrot';

const CIRCLE_RADIUS = 5;

// Hush Fox: a red fox with a great horned owl's facial disc grafted on.
// It stalks in silent arcs and gives exactly one warning — a glint in
// the huge owl eyes — before it pounces.
export class HushFox extends Enemy {
  readonly displayName = 'Hush Fox';
  faction = 'fox';

  private state: State = 'circle';
  private timer = 2 + Math.random() * 1.5;
  private t = 0;
  private angle = Math.random() * Math.PI * 2;
  private pounceDidDamage = false;
  private readonly pounceDir = new THREE.Vector3();
  private readonly bodyMesh: THREE.Mesh;
  private readonly eyeL: THREE.Mesh;
  private readonly eyeMat: THREE.MeshLambertMaterial;
  private readonly tail: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 30;
    this.radius = 0.4;

    const furMat = makePS1Material({ color: 0xb5502a });
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), furMat);
    this.bodyMesh.scale.set(1, 0.85, 1.5);
    this.bodyMesh.position.set(0, 0.32, 0);
    this.object.add(this.bodyMesh);

    // Owl facial disc grafted where a fox muzzle would be.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8),
      makePS1Material({ color: 0xd8c090 }),
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0.4, 0.42);
    this.object.add(disc);

    this.eyeMat = makePS1Material({ color: 0xf0d020 });
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), this.eyeMat);
    this.eyeL.position.set(-0.09, 0.42, 0.46);
    this.object.add(this.eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), this.eyeMat);
    eyeR.position.set(0.09, 0.42, 0.46);
    this.object.add(eyeR);

    const earMat = makePS1Material({ color: 0x8a3a1c });
    for (const sx of [-0.14, 0.14]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), earMat);
      ear.position.set(sx, 0.58, 0.2);
      this.object.add(ear);
    }

    const wingMat = makePS1Material({ color: 0x6a4020 });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.4, 1, 1, 1), wingMat);
      wing.position.set(side * 0.28, 0.32, -0.05);
      wing.rotation.z = side * 0.15;
      this.object.add(wing);
    }

    const legMat = makePS1Material({ color: 0x8a3a1c });
    for (const [sx, sz] of [[-0.15, 0.3], [0.15, 0.3], [-0.15, -0.3], [0.15, -0.3]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 4), legMat);
      leg.position.set(sx, 0.16, sz);
      this.object.add(leg);
    }

    this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 5), furMat);
    this.tail.rotation.x = Math.PI / 2 + 0.3;
    this.tail.position.set(0, 0.3, -0.55);
    this.object.add(this.tail);

    this.parts = [
      { tag: 'body', node: this.bodyMesh, radius: 0.35, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'eyes', node: this.eyeL, radius: 0.1, damageMultiplier: 5, weakPoint: true, active: false },
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

    const eyesPart = this.parts[1]!;
    eyesPart.active = this.state === 'eyeGlint' || this.state === 'pounce';
    this.eyeMat.emissive.setHex(eyesPart.active ? 0xffee66 : 0x000000);
    this.eyeMat.emissiveIntensity = eyesPart.active ? 1.2 : 0;

    switch (this.state) {
      case 'circle': {
        // Approximate "stay behind the player": drift around a slowly
        // wandering angle rather than tracking real player facing.
        this.angle += dt * 0.35;
        const target = ctx.playerPos.clone().add(
          new THREE.Vector3(Math.cos(this.angle), 0, Math.sin(this.angle)).multiplyScalar(CIRCLE_RADIUS),
        );
        const toTarget = target.sub(this.object.position);
        toTarget.y = 0;
        if (toTarget.lengthSq() > 0.04) this.object.position.addScaledVector(toTarget.normalize(), 1.4 * dt);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        this.tail.rotation.z = Math.sin(this.t * 3) * 0.1;
        if (this.timer <= 0) {
          this.state = 'freezeStalk';
          this.timer = 1.0;
        }
        break;
      }
      case 'freezeStalk': {
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'eyeGlint';
          this.timer = 0.5;
        }
        break;
      }
      case 'eyeGlint': {
        this.bodyMesh.position.z = -0.05 * (1 - Math.max(0, this.timer) / 0.5);
        if (this.timer <= 0) {
          this.state = 'pounce';
          this.timer = 0.45;
          this.pounceDidDamage = false;
          this.pounceDir.copy(dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1));
        }
        break;
      }
      case 'pounce': {
        const k = 1 - Math.max(0, this.timer) / 0.45;
        this.object.position.addScaledVector(this.pounceDir, 8 * dt);
        this.object.position.y = Math.sin(k * Math.PI) * 0.5;
        if (!this.pounceDidDamage && k > 0.6 && !ctx.playerIFrames && dist < 1.0) {
          ctx.dealDamageToPlayer(17);
          this.pounceDidDamage = true;
        }
        if (this.timer <= 0) {
          this.object.position.y = 0;
          this.bodyMesh.position.z = 0;
          this.state = 'recoverTrot';
          this.timer = 1.5;
        }
        break;
      }
      case 'recoverTrot': {
        if (dist > 0.01 && dist < CIRCLE_RADIUS - 0.3) {
          this.object.position.addScaledVector(toPlayer.normalize(), -1.2 * dt);
        }
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        this.tail.rotation.z = Math.sin(this.t * 3) * 0.1;
        if (this.timer <= 0) {
          this.state = 'circle';
          this.timer = 2 + Math.random() * 1.5;
        }
        break;
      }
    }
  }
}
