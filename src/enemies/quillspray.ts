import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'approach' | 'rearUp' | 'quillSpray' | 'drop' | 'recover';

// Quillspray: skunk + porcupine chimera. Waddles close, then REARS UP onto
// its hind legs — exposing its soft striped belly — before spraying a fan
// of barbed quills at anything in front of it. The belly stays exposed for
// the whole rear-and-spray window.
export class Quillspray extends Enemy {
  readonly displayName = 'Quillspray';
  faction = 'skunk';

  private state: State = 'approach';
  private timer = 0.6;
  private t = 0;
  private readonly bodyGroup = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly belly: THREE.Mesh;
  private readonly quills: THREE.Mesh[] = [];
  private readonly tail: THREE.Mesh;
  private readonly earL: THREE.Mesh;
  private readonly earR: THREE.Mesh;
  private sprayHit = false;

  constructor() {
    super();
    this.maxHp = this.hp = 45;
    this.radius = 0.42;

    const furMat = makePS1Material({ color: 0x1c1c1c });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 6), furMat);
    this.body.scale.set(1.1, 0.85, 1.4);
    this.body.position.y = 0.3;
    this.bodyGroup.add(this.body);

    const bellyMat = makePS1Material({ color: 0xe8e4d8 });
    this.belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bellyMat);
    this.belly.scale.set(1, 0.7, 1.3);
    this.belly.position.set(0, 0.14, 0.05);
    this.bodyGroup.add(this.belly);

    const stripeMat = makePS1Material({ color: 0xf0eee0 });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.7), stripeMat);
    stripe.position.set(0, 0.5, -0.05);
    this.bodyGroup.add(stripe);

    // Beady eyes, twitchy ears, and a nose nub — the skunk half of the face.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const sx of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), eyeMat);
      eye.position.set(sx, 0.36, 0.5);
      this.bodyGroup.add(eye);
    }
    const earMat = makePS1Material({ color: 0x161616 });
    this.earL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), earMat);
    this.earL.position.set(-0.14, 0.48, 0.4);
    this.earR = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), earMat.clone());
    this.earR.position.set(0.14, 0.48, 0.4);
    this.bodyGroup.add(this.earL, this.earR);
    const noseMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), noseMat);
    nose.position.set(0, 0.28, 0.58);
    this.bodyGroup.add(nose);

    // Porcupine quills grafted across the back.
    const quillMat = makePS1Material({ color: 0xcfc7a0 });
    for (let i = 0; i < 9; i++) {
      const quill = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.28, 6), quillMat);
      const zOff = -0.4 + (i % 3) * 0.35;
      const xOff = (Math.floor(i / 3) - 1) * 0.18;
      quill.position.set(xOff, 0.5, zOff);
      quill.rotation.x = -0.5;
      this.bodyGroup.add(quill);
      this.quills.push(quill);
    }

    this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 7), furMat.clone());
    this.tail.rotation.x = Math.PI / 2 + 0.3;
    this.tail.position.set(0, 0.32, -0.65);
    this.bodyGroup.add(this.tail);

    // A couple of stray quills on the tail too.
    for (const zOff of [-0.15, 0.05]) {
      const tailQuill = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 5), quillMat);
      tailQuill.position.set(0, 0.06, zOff);
      tailQuill.rotation.x = -0.3;
      this.tail.add(tailQuill);
    }

    const legMat = makePS1Material({ color: 0x141414 });
    for (const [sx, sz] of [[-0.16, 0.2], [0.16, 0.2], [-0.15, -0.25], [0.15, -0.25]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 7), legMat);
      leg.position.set(sx, 0.16, sz);
      this.bodyGroup.add(leg);
    }

    this.object.add(this.bodyGroup);

    this.parts = [
      { tag: 'body', node: this.body, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'belly', node: this.belly, radius: 0.24, damageMultiplier: 5, weakPoint: true, active: false },
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
    if (this.state === 'approach' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    const bellyPart = this.parts[1]!;
    bellyPart.active = this.state === 'rearUp' || this.state === 'quillSpray';

    // Ear twitch and a slow breathing bulge — always running.
    this.earL.rotation.x = Math.sin(this.t * 6) * 0.12;
    this.earR.rotation.x = Math.sin(this.t * 6 + 0.5) * 0.12;
    const breathe = 1 + Math.sin(this.t * 2.5) * 0.04;
    this.body.scale.set(1.1 * breathe, 0.85 * breathe, 1.4 * breathe);

    switch (this.state) {
      case 'approach': {
        const waddle = Math.sin(this.t * 7) * 0.1;
        this.bodyGroup.rotation.z = waddle;
        this.tail.rotation.z = -waddle * 0.5;
        if (dist > 1.4) {
          this.object.position.addScaledVector(toPlayer.normalize(), 1.0 * dt);
        } else if (this.timer <= 0) {
          this.state = 'rearUp';
          this.timer = 0.8;
        }
        break;
      }
      case 'rearUp': {
        // TELEGRAPH: stands on hind legs, quills bristling outward.
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.bodyGroup.rotation.x = -k * 0.85;
        this.bodyGroup.position.y = k * 0.25;
        this.bodyGroup.rotation.z = 0;
        for (const quill of this.quills) quill.rotation.x = -0.5 - k * 0.6;
        if (this.timer <= 0) {
          this.state = 'quillSpray';
          this.timer = 0.5;
          this.sprayHit = false;
        }
        break;
      }
      case 'quillSpray': {
        for (const quill of this.quills) {
          quill.rotation.x = -1.1 - Math.sin(this.t * 20) * 0.1;
        }
        if (!this.sprayHit && !ctx.playerIFrames && dist < 3.5) {
          const facing = new THREE.Vector3(Math.sin(this.object.rotation.y), 0, Math.cos(this.object.rotation.y));
          const toPlayerNorm = toPlayer.clone().normalize();
          if (facing.dot(toPlayerNorm) > 0.6) {
            ctx.dealDamageToPlayer(12);
            this.sprayHit = true;
          }
        }
        if (this.timer <= 0) {
          this.state = 'drop';
          this.timer = 0.35;
        }
        break;
      }
      case 'drop': {
        const k = 1 - Math.max(0, this.timer) / 0.35;
        this.bodyGroup.rotation.x = -0.85 * (1 - k);
        this.bodyGroup.position.y = 0.25 * (1 - k);
        for (const quill of this.quills) quill.rotation.x = -0.5;
        if (this.timer <= 0) {
          this.bodyGroup.rotation.x = 0;
          this.bodyGroup.position.y = 0;
          this.state = 'recover';
          this.timer = 1.0;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.4 + Math.random() * 0.5;
        }
        break;
      }
    }
  }
}
