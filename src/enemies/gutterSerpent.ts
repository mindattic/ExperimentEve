import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'slink' | 'hissTelegraph' | 'strike' | 'withdraw';

const SEGMENT_COUNT = 8;
const CHAIN_LERP_RATE = 10;

// Gutter Serpent: a house cat's head grafted onto a centipede's segmented
// body. The chain of segments shrugs off almost anything (flat 2 damage
// per hit, it "regrows") — only the cat head itself is the real kill point.
export class GutterSerpent extends Enemy {
  readonly displayName = 'Gutter Serpent';
  faction = 'serpent';

  private state: State = 'slink';
  private timer = 0.6 + Math.random() * 0.6;
  private t = 0;
  private weaveSeed = Math.random() * 10;
  private segInit = false;
  private strikeDidDamage = false;
  private readonly strikeDir = new THREE.Vector3();
  private readonly headGroup = new THREE.Group();
  private readonly headMesh: THREE.Mesh;
  private readonly earL: THREE.Mesh;
  private readonly earR: THREE.Mesh;
  private readonly segments: THREE.Mesh[] = [];
  private readonly segWorldPos: THREE.Vector3[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 60;
    this.radius = 0.4;

    const furMat = makePS1Material({ color: 0x5a4a3a });
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), furMat);
    this.headMesh.scale.set(1, 0.85, 1.1);
    this.headGroup.add(this.headMesh);

    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 5), furMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.02, 0.16);
    this.headGroup.add(snout);

    const earMat = makePS1Material({ color: 0x4a3a2c });
    this.earL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 4), earMat);
    this.earL.position.set(-0.08, 0.16, -0.02);
    this.headGroup.add(this.earL);
    this.earR = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 4), earMat.clone());
    this.earR.position.set(0.08, 0.16, -0.02);
    this.headGroup.add(this.earR);

    const eyeMat = makePS1Material({ color: 0xd8c840 });
    for (const sx of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), eyeMat);
      eye.position.set(sx, 0.02, 0.14);
      this.headGroup.add(eye);
    }

    this.headGroup.position.set(0, 0.16, 0.3);
    this.object.add(this.headGroup);

    const segMat = makePS1Material({ color: 0x3a3226 });
    const legMat = makePS1Material({ color: 0x2c2620 });
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const k = 1 - (i / SEGMENT_COUNT) * 0.4;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.14 * k, 6, 4), segMat);
      seg.scale.set(1, 0.75, 1.15);
      this.object.add(seg);
      this.segments.push(seg);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.16, 3), legMat);
        leg.position.set(side * 0.13, -0.05, 0);
        leg.rotation.z = side * 1.1;
        seg.add(leg);
      }
    }

    this.parts = [
      {
        tag: 'segments', node: this.segments[3]!, radius: 1.0,
        damageMultiplier: 1, weakPoint: false, active: true, flatDamageOverride: 2,
      },
      {
        tag: 'head', node: this.headMesh, radius: 0.14,
        damageMultiplier: 4, weakPoint: true, active: true,
      },
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
    if (this.state !== 'strike' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    switch (this.state) {
      case 'slink': {
        const weave = Math.sin(this.t * 6 + this.weaveSeed) * 0.6;
        if (dist > 1.5) {
          const fwd = toPlayer.clone().normalize();
          const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
          this.object.position.addScaledVector(fwd, 2.6 * dt);
          this.object.position.addScaledVector(side, weave * dt);
        }
        this.headGroup.rotation.x += (0 - this.headGroup.rotation.x) * Math.min(1, dt * 6);
        this.headGroup.position.y += (0.16 - this.headGroup.position.y) * Math.min(1, dt * 6);
        this.earL.rotation.x = 0;
        this.earR.rotation.x = 0;
        this.earL.scale.setScalar(1);
        this.earR.scale.setScalar(1);
        if (this.timer <= 0 && dist < 1.8) {
          this.state = 'hissTelegraph';
          this.timer = 0.6;
        }
        break;
      }
      case 'hissTelegraph': {
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.headGroup.position.y = 0.16 + k * 0.14;
        this.headGroup.rotation.x = -k * 0.5;
        this.earL.rotation.x = -k * 0.6;
        this.earR.rotation.x = -k * 0.6;
        this.earL.scale.setScalar(1 + k * 0.6);
        this.earR.scale.setScalar(1 + k * 0.6);
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 0.4;
          this.strikeDidDamage = false;
          this.strikeDir.copy(dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1));
        }
        break;
      }
      case 'strike': {
        const k = 1 - Math.max(0, this.timer) / 0.4;
        this.object.position.addScaledVector(this.strikeDir, 9 * dt * (k < 0.6 ? 1 : 0.2));
        this.headGroup.position.y = 0.3 - k * 0.14;
        this.headGroup.rotation.x = -0.5 + k * 0.5;
        if (!this.strikeDidDamage && !ctx.playerIFrames && dist < 1.0) {
          ctx.dealDamageToPlayer(12);
          this.strikeDidDamage = true;
        }
        if (this.timer <= 0) {
          this.state = 'withdraw';
          this.timer = 0.7;
        }
        break;
      }
      case 'withdraw': {
        if (dist > 0.01) this.object.position.addScaledVector(toPlayer.clone().normalize(), -1.6 * dt);
        this.earL.rotation.x *= 0.9;
        this.earR.rotation.x *= 0.9;
        if (this.timer <= 0) {
          this.state = 'slink';
          this.timer = 0.8 + Math.random() * 0.6;
          this.weaveSeed = Math.random() * 10;
        }
        break;
      }
    }

    this.updateChain(dt);
  }

  /** Each segment lerps toward the previous segment's pre-update position. */
  private updateChain(dt: number): void {
    const leader = this.headGroup.getWorldPosition(new THREE.Vector3());
    if (!this.segInit) {
      for (let i = 0; i < SEGMENT_COUNT; i++) this.segWorldPos.push(leader.clone());
      this.segInit = true;
    }
    const prev = this.segWorldPos.map((p) => p.clone());
    const rate = Math.min(1, dt * CHAIN_LERP_RATE);
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const target = i === 0 ? leader : prev[i - 1]!;
      this.segWorldPos[i]!.lerp(target, rate);
    }
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.segments[i]!.position.copy(this.object.worldToLocal(this.segWorldPos[i]!.clone()));
    }
  }
}
