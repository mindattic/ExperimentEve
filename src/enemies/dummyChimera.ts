import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'approach' | 'windup' | 'lunge' | 'recover';

// M8 test enemy: a rat/gull chimera — plump rat body, stubby gull wings.
// Wing-flare telegraph → lunge (the pattern all chimeras follow), and a
// periodic glowing eye weak point to exercise part targeting + crits.
export class RatGullChimera extends Enemy {
  readonly displayName = 'Rat-Gull';
  private state: State = 'approach';
  private timer = 0;
  private eyeOpenTimer = 0;
  private readonly body: THREE.Mesh;
  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;
  private readonly eye: THREE.Mesh;
  private readonly eyeMat: THREE.MeshLambertMaterial;
  private readonly lungeDir = new THREE.Vector3();
  private t = 0;

  constructor() {
    super();
    this.maxHp = this.hp = 40;
    this.radius = 0.45;

    this.body = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 7, 5),
      makePS1Material({ color: 0x5a4a42 }),
    );
    this.body.scale.set(1.15, 0.8, 1.3);
    this.body.position.y = 0.35;
    this.object.add(this.body);

    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.012, 0.5, 4),
      makePS1Material({ color: 0xc0a0a0 }),
    );
    tail.position.set(0, 0.3, -0.55);
    tail.rotation.x = Math.PI / 2 - 0.3;
    this.object.add(tail);

    const wingMat = makePS1Material({ color: 0xd8d8d0 });
    this.wingL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), wingMat);
    this.wingL.position.set(-0.45, 0.5, 0);
    this.wingR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), wingMat.clone());
    this.wingR.position.set(0.45, 0.5, 0);
    this.object.add(this.wingL, this.wingR);

    this.eyeMat = makePS1Material({ color: 0xffcc44 });
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), this.eyeMat);
    this.eye.position.set(0, 0.5, 0.45);
    this.object.add(this.eye);

    this.parts = [
      { tag: 'body', node: this.body, radius: 0.45, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'eye', node: this.eye, radius: 0.14, damageMultiplier: 3, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    // Eye opens ~1.4s of every 4s — the crit window.
    this.eyeOpenTimer += dt;
    const eyeOpen = this.eyeOpenTimer % 4 < 1.4;
    this.parts[1]!.active = eyeOpen;
    this.eyeMat.emissive.setHex(eyeOpen ? 0xcc8800 : 0x000000);
    this.eye.scale.setScalar(eyeOpen ? 1.35 : 0.7);

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    switch (this.state) {
      case 'approach': {
        if (dist > 1.4) {
          const step = toPlayer.normalize().multiplyScalar(1.6 * dt);
          this.object.position.add(step);
        } else {
          this.state = 'windup';
          this.timer = 0.55;
        }
        this.object.position.y = Math.abs(Math.sin(this.t * 6)) * 0.08; // scurry-hop
        this.wingL.rotation.z = Math.sin(this.t * 3) * 0.15;
        this.wingR.rotation.z = -Math.sin(this.t * 3) * 0.15;
        break;
      }
      case 'windup': {
        // TELEGRAPH: wings flare high, body inflates.
        this.wingL.rotation.z = 1.2;
        this.wingR.rotation.z = -1.2;
        this.body.scale.setScalar(1 + (0.55 - this.timer) * 0.5);
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = 0.32;
          this.lungeDir.copy(toPlayer).normalize();
        }
        break;
      }
      case 'lunge': {
        this.object.position.addScaledVector(this.lungeDir, 7.5 * dt);
        if (dist < 0.9 && !ctx.playerIFrames) {
          ctx.dealDamageToPlayer(12);
          this.timer = 0;
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 1.1;
          this.body.scale.set(1.15, 0.8, 1.3);
          this.wingL.rotation.z = 0;
          this.wingR.rotation.z = 0;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) this.state = 'approach';
        break;
      }
    }

    if (dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }
  }
}
