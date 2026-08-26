import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext, type EnemyPart } from './enemyBase';

type State = 'lurk' | 'eruptTelegraph' | 'latch' | 'draining' | 'writhe' | 'burrow';

const TRIGGER_RANGE = 3.5;
const ERUPT_TIME = 0.6;
const LATCH_TIME = 0.4;
const LATCH_HIT_RANGE = 1.2;
const DRAIN_TIME = 2.5;
const DRAIN_TICK = 0.5;
const DRAIN_DMG = 4;
const WRITHE_TIME = 2.0;
const BURROW_TIME = 0.8;

// Garter snake + lamprey mouth chimera. Spends nearly all its time buried —
// only a dirt mound shows — then erupts and LATCHES onto the player,
// draining HP in ticks. Landing a hit on the exposed mouth ring (the
// telegraphed weak point) breaks the latch and forces a vulnerable writhe.
export class DrainCoil extends Enemy {
  readonly displayName = 'Drain Coil';
  faction = 'snake';

  private state: State = 'lurk';
  private timer = 0;
  private t = 0;
  private drainTick = 0;
  private mouthHit = false;

  private readonly mound: THREE.Mesh;
  private readonly snakeGroup = new THREE.Group();
  private readonly bodySeg: THREE.Mesh;
  private readonly mouthRing: THREE.Mesh;
  private readonly mouthMat: THREE.MeshLambertMaterial;

  private readonly burrowFrom = new THREE.Vector3();
  private readonly burrowTo = new THREE.Vector3();

  constructor() {
    super();
    this.maxHp = this.hp = 40;
    this.radius = 0.4;

    const dirtMat = makePS1Material({ color: 0x5a4632 });
    this.mound = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.28, 6), dirtMat);
    this.mound.position.y = 0.05;
    this.object.add(this.mound);

    const scaleMat = makePS1Material({ color: 0x5c7248 });
    this.bodySeg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 6), scaleMat);
    this.bodySeg.rotation.x = Math.PI / 2;
    this.bodySeg.position.set(0, 0.2, -0.1);
    this.snakeGroup.add(this.bodySeg);

    const tailSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.5, 6), scaleMat.clone());
    tailSeg.rotation.x = Math.PI / 2;
    tailSeg.position.set(0, 0.16, -0.55);
    this.snakeGroup.add(tailSeg);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), scaleMat.clone());
    head.position.set(0, 0.24, 0.32);
    this.snakeGroup.add(head);

    this.mouthMat = makePS1Material({ color: 0x8a3050 });
    this.mouthRing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8), this.mouthMat);
    this.mouthRing.rotation.x = Math.PI / 2;
    this.mouthRing.position.set(0, 0.24, 0.44);
    this.snakeGroup.add(this.mouthRing);

    this.snakeGroup.visible = false;
    this.object.add(this.snakeGroup);

    this.parts = [
      { tag: 'body', node: this.bodySeg, radius: 0.3, damageMultiplier: 1, weakPoint: false, active: false },
      { tag: 'mouthRing', node: this.mouthRing, radius: 0.18, damageMultiplier: 6, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  override takeHit(amount: number, part: EnemyPart | null): number {
    const dealt = super.takeHit(amount, part);
    if (this.state === 'draining' && part?.tag === 'mouthRing') {
      this.mouthHit = true;
    }
    return dealt;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    const bodyPart = this.parts[0]!;
    const mouthPart = this.parts[1]!;

    switch (this.state) {
      case 'lurk': {
        this.mound.visible = true;
        this.snakeGroup.visible = false;
        this.mound.scale.setScalar(1 + Math.sin(this.t * 1.5) * 0.02);
        bodyPart.active = false;
        mouthPart.active = false;
        if (dist <= TRIGGER_RANGE) {
          this.state = 'eruptTelegraph';
          this.timer = ERUPT_TIME;
        }
        break;
      }
      case 'eruptTelegraph': {
        // TELEGRAPH: dirt mound bulges as the coil winds up beneath it.
        const k = 1 - Math.max(0, this.timer) / ERUPT_TIME;
        this.mound.scale.setScalar(1 + k * 0.9);
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.mound.visible = false;
          this.snakeGroup.visible = true;
          this.snakeGroup.scale.setScalar(0.2);
          bodyPart.active = true;
          this.state = 'latch';
          this.timer = LATCH_TIME;
        }
        break;
      }
      case 'latch': {
        const k = 1 - Math.max(0, this.timer) / LATCH_TIME;
        this.snakeGroup.scale.setScalar(0.2 + k * 0.8);
        this.snakeGroup.position.z = k * 0.3;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.snakeGroup.position.z = 0;
          const curDist = ctx.playerPos.clone().setY(0).distanceTo(this.object.position);
          if (curDist <= LATCH_HIT_RANGE) {
            this.state = 'draining';
            this.timer = DRAIN_TIME;
            this.drainTick = 0;
            this.mouthHit = false;
            mouthPart.active = true;
          } else {
            this.startBurrow();
          }
        }
        break;
      }
      case 'draining': {
        mouthPart.active = true;
        this.mouthMat.emissive.setHex(0xcc3355);
        this.drainTick += dt;
        if (this.drainTick >= DRAIN_TICK) {
          this.drainTick -= DRAIN_TICK;
          if (!ctx.playerIFrames && dist <= LATCH_HIT_RANGE + 0.3) {
            ctx.dealDamageToPlayer(DRAIN_DMG);
          }
        }
        if (this.mouthHit) {
          this.mouthMat.emissive.setHex(0x000000);
          this.state = 'writhe';
          this.timer = WRITHE_TIME;
        } else if (this.timer <= 0) {
          this.mouthMat.emissive.setHex(0x000000);
          mouthPart.active = false;
          this.startBurrow();
        }
        break;
      }
      case 'writhe': {
        bodyPart.active = true;
        mouthPart.active = true;
        this.snakeGroup.rotation.z = Math.sin(this.t * 14) * 0.4;
        if (this.timer <= 0) {
          this.snakeGroup.rotation.z = 0;
          mouthPart.active = false;
          this.startBurrow();
        }
        break;
      }
      case 'burrow': {
        const k = 1 - Math.max(0, this.timer) / BURROW_TIME;
        this.snakeGroup.scale.setScalar(Math.max(0.001, 1 - k));
        this.object.position.lerpVectors(this.burrowFrom, this.burrowTo, k);
        bodyPart.active = false;
        mouthPart.active = false;
        if (this.timer <= 0) {
          this.object.position.copy(this.burrowTo);
          this.snakeGroup.visible = false;
          this.snakeGroup.scale.setScalar(1);
          this.state = 'lurk';
          this.timer = 0;
        }
        break;
      }
    }
  }

  private startBurrow(): void {
    this.state = 'burrow';
    this.timer = BURROW_TIME;
    this.burrowFrom.copy(this.object.position);
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 2;
    this.burrowTo.set(
      this.burrowFrom.x + Math.cos(angle) * dist,
      0,
      this.burrowFrom.z + Math.sin(angle) * dist,
    );
  }
}
