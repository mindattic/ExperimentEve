import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'approach' | 'hoverTelegraph' | 'dartSting' | 'scurry';

const TRIGGER_RANGE = 3.0;
const HOVER_TIME = 0.5;
const HOVER_Y = 1.2;
const DART_TIME = 0.4;
const DART_SPEED = 16;
const DART_RANGE = 0.7;
const DART_DMG = 6;
const SCURRY_TIME = 0.6;
const SCURRY_SPEED = 5;

// Gray squirrel + paper wasp chimera: a tiny, erratic dive-bomber. Approaches
// in a fast zig-zag hop-glide, rises into a hover (wings blurring — the
// telegraph) before dashing straight through the player, then scurries off
// to reset. Meant to be spawned in small packs for swarm pressure.
export class DartSquirrel extends Enemy {
  readonly displayName = 'Dart Squirrel';
  faction = 'squirrel';

  private state: State = 'approach';
  private timer = 0;
  private t = 0;
  private dartDidDamage = false;
  private readonly travelDir = new THREE.Vector3();

  private readonly critterGroup = new THREE.Group();
  private readonly abdomen: THREE.Mesh;
  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 8;
    this.radius = 0.25;

    const furMat = makePS1Material({ color: 0x8a7a63 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), furMat);
    body.scale.set(1, 0.9, 1.3);
    body.position.y = 0.2;
    this.critterGroup.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), furMat.clone());
    head.position.set(0, 0.24, 0.2);
    this.critterGroup.add(head);

    const earMat = furMat.clone();
    for (const sx of [-0.06, 0.06]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), earMat);
      ear.position.set(sx, 0.33, 0.22);
      this.critterGroup.add(ear);
    }

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 5), furMat.clone());
    tail.rotation.x = Math.PI * 0.55;
    tail.position.set(0, 0.3, -0.28);
    this.critterGroup.add(tail);

    // Grafted wasp abdomen: striped, glossy — the weak point.
    const abdomenMat = makePS1Material({ color: 0xd8b31a });
    this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), abdomenMat);
    this.abdomen.scale.set(1, 0.9, 1.4);
    this.abdomen.position.set(0, 0.2, -0.16);
    this.critterGroup.add(this.abdomen);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6),
      makePS1Material({ color: 0x1a1a1a }),
    );
    stripe.rotation.z = Math.PI / 2;
    stripe.position.set(0, 0.2, -0.2);
    this.critterGroup.add(stripe);

    const wingMat = makePS1Material({ color: 0xdedad0 });
    this.wingL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.12), wingMat);
    this.wingL.position.set(-0.1, 0.28, -0.1);
    this.critterGroup.add(this.wingL);
    this.wingR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.12), wingMat.clone());
    this.wingR.position.set(0.1, 0.28, -0.1);
    this.critterGroup.add(this.wingR);

    this.object.add(this.critterGroup);

    this.parts = [
      { tag: 'body', node: body, radius: 0.22, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'abdomen', node: this.abdomen, radius: 0.14, damageMultiplier: 3, weakPoint: true, active: false },
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

    const abdomenPart = this.parts[1]!;
    abdomenPart.active = this.state === 'hoverTelegraph' || this.state === 'dartSting';

    switch (this.state) {
      case 'approach': {
        this.object.position.y = Math.abs(Math.sin(this.t * 14)) * 0.15;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        const forward = toPlayer.clone().normalize();
        const lateral = new THREE.Vector3(-forward.z, 0, forward.x).multiplyScalar(Math.sin(this.t * 8) * 0.7);
        this.object.position.addScaledVector(forward, 3.4 * dt);
        this.object.position.addScaledVector(lateral, dt);
        this.wingL.rotation.z = Math.sin(this.t * 30) * 0.3;
        this.wingR.rotation.z = -Math.sin(this.t * 30) * 0.3;
        if (dist <= TRIGGER_RANGE) {
          this.state = 'hoverTelegraph';
          this.timer = HOVER_TIME;
        }
        break;
      }
      case 'hoverTelegraph': {
        // TELEGRAPH: rises up, wings blur into a haze.
        const k = 1 - Math.max(0, this.timer) / HOVER_TIME;
        this.object.position.y = k * HOVER_Y;
        const blur = Math.floor(this.t * 40) % 2 === 0;
        this.wingL.scale.x = blur ? 1.6 : 0.6;
        this.wingR.scale.x = blur ? 1.6 : 0.6;
        if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (this.timer <= 0) {
          this.state = 'dartSting';
          this.timer = DART_TIME;
          this.dartDidDamage = false;
          this.travelDir.copy(ctx.playerPos).sub(this.object.position).setY(0).normalize();
        }
        break;
      }
      case 'dartSting': {
        this.object.position.addScaledVector(this.travelDir, DART_SPEED * dt);
        this.object.position.y = HOVER_Y;
        const blur = Math.floor(this.t * 50) % 2 === 0;
        this.wingL.scale.x = blur ? 1.8 : 0.5;
        this.wingR.scale.x = blur ? 1.8 : 0.5;
        if (!this.dartDidDamage && dist <= DART_RANGE && !ctx.playerIFrames) {
          ctx.dealDamageToPlayer(DART_DMG);
          this.dartDidDamage = true;
        }
        if (this.timer <= 0) {
          this.wingL.scale.x = 1;
          this.wingR.scale.x = 1;
          this.object.position.y = 0;
          this.state = 'scurry';
          this.timer = SCURRY_TIME;
          this.travelDir.copy(this.object.position).sub(ctx.playerPos).setY(0).normalize();
        }
        break;
      }
      case 'scurry': {
        this.object.position.addScaledVector(this.travelDir, SCURRY_SPEED * dt);
        if (this.travelDir.lengthSq() > 0.01) {
          this.object.rotation.y = Math.atan2(this.travelDir.x, this.travelDir.z);
        }
        if (this.timer <= 0) {
          this.state = 'approach';
        }
        break;
      }
    }
  }
}
