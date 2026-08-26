import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'idle' | 'hop' | 'telegraph' | 'tongueOut' | 'retract' | 'cooldown';

const TONGUE_SEGMENTS = 7;
const TONGUE_REACH = 5.5;

// The frog chimera: bloated frog, insectoid bulb-tipped tongue (Yoshi-style).
// Body shots deal a flat 1. The BULB — targetable only while the tongue is
// extended — takes massive damage: time the ATB pause to the tongue.
export class FrogChimera extends Enemy {
  readonly displayName = 'Frog Chimera';
  faction = 'frog';

  private state: State = 'idle';
  private timer = 1.2;
  private t = 0;
  private readonly body: THREE.Mesh;
  private readonly jaw: THREE.Mesh;
  private readonly tongueRoot = new THREE.Group();
  private readonly tongueSegs: THREE.Mesh[] = [];
  private readonly bulb: THREE.Mesh;
  private readonly bulbMat: THREE.MeshLambertMaterial;
  private readonly tongueTarget = new THREE.Vector3();
  private readonly hopDir = new THREE.Vector3();
  private tongueDidDamage = false;

  constructor() {
    super();
    this.maxHp = this.hp = 200;
    this.radius = 0.9;

    const skin = makePS1Material({ color: 0x4f6b3a });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), skin);
    this.body.scale.set(1.25, 0.85, 1.1);
    this.body.position.y = 0.72;
    this.object.add(this.body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 7, 5), makePS1Material({ color: 0xb9c49a }));
    belly.scale.set(1.1, 0.7, 0.95);
    belly.position.set(0, 0.5, 0.25);
    this.object.add(belly);

    this.jaw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.7), makePS1Material({ color: 0x455e33 }));
    this.jaw.position.set(0, 0.42, 0.62);
    this.object.add(this.jaw);

    const eyeMat = makePS1Material({ color: 0xd8c840 });
    for (const sx of [-0.42, 0.42]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 4), eyeMat);
      eye.position.set(sx, 1.28, 0.45);
      this.object.add(eye);
    }
    const legMat = makePS1Material({ color: 0x44582f });
    for (const [sx, sz, ry] of [[-0.8, 0.3, 0.5], [0.8, 0.3, -0.5], [-0.7, -0.5, 2.2], [0.7, -0.5, -2.2]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.85, 5), legMat);
      leg.position.set(sx, 0.35, sz);
      leg.rotation.z = ry * 0.35;
      this.object.add(leg);
    }

    // Tongue: segment chain + bulb, parented at the mouth.
    this.tongueRoot.position.set(0, 0.55, 0.7);
    this.object.add(this.tongueRoot);
    const tongueMat = makePS1Material({ color: 0xc06a7a });
    for (let i = 0; i < TONGUE_SEGMENTS; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1, 5), tongueMat);
      seg.visible = false;
      this.tongueRoot.add(seg);
      this.tongueSegs.push(seg);
    }
    this.bulbMat = makePS1Material({ color: 0xe8517a });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 5), this.bulbMat);
    this.bulb.visible = false;
    this.tongueRoot.add(this.bulb);

    this.parts = [
      {
        tag: 'body', node: this.body, radius: 0.95,
        damageMultiplier: 1, weakPoint: false, active: true, flatDamageOverride: 1,
      },
      {
        tag: 'tongue bulb', node: this.bulb, radius: 0.3,
        damageMultiplier: 8, weakPoint: true, active: false,
      },
    ];
    this.registerFlashMaterials();
  }

  protected override onDeath(): void {
    this.setTongue(0);
    this.body.scale.set(1.4, 0.3, 1.25); // deflates
    this.object.position.y = 0;
  }

  private setTongue(ext: number): void {
    const rootWorld = this.tongueRoot.getWorldPosition(new THREE.Vector3());
    // Extend TO the target, not past it — the bulb must land where she stood.
    const len = ext * Math.min(TONGUE_REACH, rootWorld.distanceTo(this.tongueTarget) + 0.15);
    const dir = this.tongueTarget.clone().sub(rootWorld);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    // Segments lay along the (local-space) line toward the target; the whole
    // group is already oriented by object rotation, so convert to local.
    const local = this.object.worldToLocal(
      this.tongueRoot.getWorldPosition(new THREE.Vector3()).add(dir),
    ).sub(this.tongueRoot.position).normalize();
    for (let i = 0; i < TONGUE_SEGMENTS; i++) {
      const seg = this.tongueSegs[i]!;
      const segLen = len / TONGUE_SEGMENTS;
      seg.visible = ext > 0.05;
      seg.scale.y = Math.max(0.05, segLen);
      seg.position.copy(local).multiplyScalar((i + 0.5) * segLen);
      // Droop like a real tongue: sag increases mid-chain.
      seg.position.y += Math.sin((i / TONGUE_SEGMENTS) * Math.PI) * -0.12 * ext;
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
    }
    this.bulb.visible = ext > 0.05;
    this.bulb.position.copy(local).multiplyScalar(len + 0.1);
    this.bulb.position.y += -0.12 * ext;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    // Always slowly face the player except mid-hop.
    if (this.state !== 'hop' && dist > 0.01) {
      const target = Math.atan2(toPlayer.x, toPlayer.z);
      let diff = target - this.object.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.object.rotation.y += diff * Math.min(1, dt * 3);
    }

    const bulbPart = this.parts[1]!;
    bulbPart.active = this.state === 'tongueOut';
    this.bulbMat.emissive.setHex(this.state === 'tongueOut' ? 0x99204a : 0x000000);

    switch (this.state) {
      case 'idle': {
        this.body.position.y = 0.72 + Math.sin(this.t * 2.2) * 0.05; // breathing
        if (this.timer <= 0) {
          if (dist > 6.5) {
            this.state = 'hop';
            this.timer = 0.55;
            this.hopDir.copy(toPlayer).normalize();
          } else {
            this.state = 'telegraph';
            this.timer = 0.8;
          }
        }
        break;
      }
      case 'hop': {
        this.object.position.addScaledVector(this.hopDir, 5.5 * dt);
        this.object.position.y = Math.sin((1 - this.timer / 0.55) * Math.PI) * 0.9;
        if (this.timer <= 0) {
          this.object.position.y = 0;
          this.state = 'idle';
          this.timer = 0.7;
        }
        break;
      }
      case 'telegraph': {
        // TELEGRAPH: inflates, jaw drops, croak (audio later).
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.body.scale.set(1.25 + k * 0.3, 0.85 + k * 0.25, 1.1 + k * 0.2);
        this.jaw.position.y = 0.42 - k * 0.18;
        if (this.timer <= 0) {
          this.state = 'tongueOut';
          this.timer = 2.2;
          this.tongueDidDamage = false;
          this.tongueTarget.copy(ctx.playerPos).setY(0.8);
        }
        break;
      }
      case 'tongueOut': {
        const outFor = 2.2 - this.timer;
        const ext = Math.min(1, outFor / 0.45); // extends fast, lingers
        this.setTongue(ext);
        // The grab: bulb reaching the player hurts once per extension.
        if (!this.tongueDidDamage && ext > 0.9 && !ctx.playerIFrames) {
          const bulbPos = this.bulb.getWorldPosition(new THREE.Vector3());
          if (bulbPos.distanceTo(ctx.playerPos.clone().setY(bulbPos.y)) < 0.85) {
            ctx.dealDamageToPlayer(18);
            this.tongueDidDamage = true;
          }
        }
        if (this.timer <= 0) {
          this.state = 'retract';
          this.timer = 0.4;
        }
        break;
      }
      case 'retract': {
        this.setTongue(Math.max(0, this.timer / 0.4));
        this.body.scale.set(1.25, 0.85, 1.1);
        this.jaw.position.y = 0.42;
        if (this.timer <= 0) {
          this.setTongue(0);
          this.state = 'cooldown';
          this.timer = 1.6;
        }
        break;
      }
      case 'cooldown': {
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 0.6;
        }
        break;
      }
    }
  }
}
