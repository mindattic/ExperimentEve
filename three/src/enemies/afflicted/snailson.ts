import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';

type State = 'approach' | 'teeter' | 'roll' | 'recover';

const ROLL_DIST = 4;
const ROLL_SPEED = 5.5;
const ROLL_RANGE = 1.2;

// SNAIL-SON — a young man fused waist-up-back into a snail's shell. The
// shell is too heavy to carry properly: he's the slowest of the Afflicted,
// but when he tips forward into a roll he can't stop until he's spent —
// and he almost always ends up toppled right after.
export class Snailson extends Afflicted {
  readonly displayName = 'Shell-Boy';
  shambleSpeed = 0.8;
  toppleEvery: [number, number] = [2, 4];

  private state: State = 'approach';
  private timer = 0.6 + Math.random();
  private readonly torso: THREE.Group;
  private readonly shell: THREE.Group;
  private readonly neckJoint: THREE.Object3D;
  private rollDir = new THREE.Vector3(0, 0, 1);
  private rollTraveled = 0;
  private rollHit = false;
  private t = 0;

  constructor() {
    super();
    this.maxHp = this.hp = 30;
    this.radius = 0.45;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.86;
    this.object.add(this.torso);

    this.neckJoint = new THREE.Group();
    this.neckJoint.position.set(0, 0.35, -0.12);
    this.torso.add(this.neckJoint);
    const jointMat = makePS1Material({ color: 0x8a7a5c });
    const jointMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), jointMat);
    this.neckJoint.add(jointMesh);
    // Eye stalks: the one part of a snail nobody wants grafted onto a neck.
    for (const s of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.1, 6), jointMat);
      stalk.position.set(s * 0.05, 0.06, 0.02);
      stalk.rotation.x = -0.3;
      this.neckJoint.add(stalk);
      const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), makePS1Material({ color: 0x1a1a1a }));
      eyeball.position.set(s * 0.05, 0.11, 0.03);
      this.neckJoint.add(eyeball);
    }

    // Big flattened spiral shell riding on his back.
    this.shell = new THREE.Group();
    this.shell.position.set(0, 0.5, -0.28);
    this.torso.add(this.shell);
    const shellMat = makePS1Material({ color: 0x7a6a3e });
    const shellBase = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), shellMat);
    shellBase.scale.set(1, 0.55, 1);
    this.shell.add(shellBase);
    const spiralMat = makePS1Material({ color: 0x62542e });
    const spiral = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 7), spiralMat);
    spiral.position.set(0, 0.18, 0.05);
    spiral.rotation.x = -0.3;
    this.shell.add(spiral);
    // Concentric growth ridges around the whorl.
    const ridgeMat = makePS1Material({ color: 0x54461f });
    for (let i = 0; i < 2; i++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.12 + i * 0.09, 0.012, 4, 8), ridgeMat);
      ridge.position.set(0, 0.15 - i * 0.02, 0.05);
      ridge.rotation.x = Math.PI / 2 - 0.3;
      this.shell.add(ridge);
    }

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.45, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'shell joint', node: jointMesh, radius: 0.18, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'teeter' || this.state === 'roll';

    switch (this.state) {
      case 'approach': {
        // Too heavy to carry smoothly: the shell rocks with every dragging step.
        this.shell.rotation.z = Math.sin(this.t * 3.2) * 0.04;
        this.timer -= dt;
        if (dist > 4.5) {
          this.shamble(dt, ctx.playerPos);
        } else if (this.timer <= 0) {
          this.state = 'teeter';
          this.timer = 1.0;
        }
        break;
      }
      case 'teeter': {
        // TELEGRAPH: he tips forward, unable to stop what's coming.
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 1.0;
        this.torso.rotation.x = k * 0.55;
        if (this.timer <= 0) {
          this.state = 'roll';
          this.rollDir = ctx.playerPos.clone().sub(this.object.position).setY(0).normalize();
          this.rollTraveled = 0;
          this.rollHit = false;
        }
        break;
      }
      case 'roll': {
        const step = Math.min(ROLL_SPEED * dt, ROLL_DIST - this.rollTraveled);
        this.object.position.addScaledVector(this.rollDir, step);
        this.rollTraveled += step;
        this.shell.rotation.z += dt * 14;
        this.torso.rotation.x = 0.55;
        if (!this.rollHit && !ctx.playerIFrames && dist < ROLL_RANGE) {
          ctx.dealDamageToPlayer(13);
          this.rollHit = true;
        }
        if (this.rollTraveled >= ROLL_DIST) {
          this.state = 'recover';
          this.timer = 0.4;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.torso.rotation.x = Math.max(0, this.torso.rotation.x - dt * 1.5);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.8 + Math.random();
        }
        break;
      }
    }
  }
}
