import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'stalk' | 'beakWindup' | 'beakStab' | 'stuck' | 'recover';

const BODY_Y = 2.6;
const NECK_REST_Y = 2.9;
const NECK_REARED_Y = 3.6;
const NECK_STAB_Y = 0.15;

// Stilt Stag: whitetail deer + great blue heron chimera. A spindly-legged
// silhouette towering over the player, deer torso balanced atop four heron
// stilt-legs, heron neck rearing back before it PLUNGES its beak to ground
// level in a stabbing peck. The heron's knee joints stay a constant,
// low-mounted soft spot regardless of what the head is doing.
export class StiltStag extends Enemy {
  readonly displayName = 'Stilt Stag';
  faction = 'deer';

  private state: State = 'stalk';
  private timer = 0.8;
  private t = 0;
  private readonly torso: THREE.Mesh;
  private readonly neckGroup = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly kneeNode: THREE.Object3D;
  private readonly legs: THREE.Mesh[] = [];
  private stabHit = false;

  constructor() {
    super();
    this.maxHp = this.hp = 70;
    this.radius = 0.6;

    const legMat = makePS1Material({ color: 0x8a7355 });
    for (const [sx, sz] of [[-0.4, 0.3], [0.4, 0.3], [-0.35, -0.35], [0.35, -0.35]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, BODY_Y, 4), legMat);
      leg.position.set(sx, BODY_Y / 2, sz);
      this.object.add(leg);
      this.legs.push(leg);
    }
    // Knee joints: a single representative mounting node at ~1.2m.
    this.kneeNode = new THREE.Group();
    this.kneeNode.position.set(0, 1.2, 0);
    this.object.add(this.kneeNode);
    const kneeMat = makePS1Material({ color: 0x6b5a40 });
    for (const [sx, sz] of [[-0.4, 0.3], [0.4, 0.3], [-0.35, -0.35], [0.35, -0.35]] as const) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), kneeMat);
      knob.position.set(sx, 0, sz);
      this.kneeNode.add(knob);
    }

    const deerMat = makePS1Material({ color: 0x9a6b45 });
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.9, 2, 1, 2), deerMat);
    this.torso.position.set(0, BODY_Y, 0);
    this.object.add(this.torso);

    const earMat = makePS1Material({ color: 0x855e3d });
    for (const sx of [-0.15, 0.15]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 4), earMat);
      ear.position.set(sx, BODY_Y + 0.35, 0.35);
      ear.rotation.x = -0.4;
      this.object.add(ear);
    }

    // Heron neck grafted where antlers would be — long and S-curved.
    this.neckGroup.position.set(0, NECK_REST_Y, 0.4);
    this.object.add(this.neckGroup);
    const neckMat = makePS1Material({ color: 0xb0a888 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 5), neckMat);
    neck.position.set(0, 0.35, 0);
    this.neckGroup.add(neck);
    const headMat = makePS1Material({ color: 0xc4bc9a });
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), headMat);
    this.head.rotation.x = Math.PI / 2;
    this.head.position.set(0, 0.7, 0.2);
    this.neckGroup.add(this.head);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.65, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'head', node: this.head, radius: 0.3, damageMultiplier: 5, weakPoint: true, active: false },
      { tag: 'knee', node: this.kneeNode, radius: 0.5, damageMultiplier: 2, weakPoint: true, active: true },
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
    if (this.state !== 'beakStab' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    const headPart = this.parts[1]!;
    headPart.active = this.state === 'stuck';

    switch (this.state) {
      case 'stalk': {
        const stride = Math.sin(this.t * 2.5);
        this.legs.forEach((leg, i) => {
          leg.rotation.x = (i % 2 === 0 ? stride : -stride) * 0.15;
        });
        this.neckGroup.position.y = NECK_REST_Y;
        this.head.position.y = 0.7;
        if (dist > 2.5) {
          this.object.position.addScaledVector(toPlayer.normalize(), 1.1 * dt);
        } else if (this.timer <= 0) {
          this.state = 'beakWindup';
          this.timer = 0.8;
        }
        break;
      }
      case 'beakWindup': {
        // TELEGRAPH: neck rears far back and high.
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.neckGroup.rotation.x = -k * 0.9;
        this.neckGroup.position.y = THREE.MathUtils.lerp(NECK_REST_Y, NECK_REARED_Y, k);
        if (this.timer <= 0) {
          this.state = 'beakStab';
          this.timer = 0.22;
          this.stabHit = false;
        }
        break;
      }
      case 'beakStab': {
        // Fast plunge to ground level.
        const k = Math.min(1, (1 - Math.max(0, this.timer) / 0.22) * 2);
        this.neckGroup.rotation.x = THREE.MathUtils.lerp(-0.9, 1.35, k);
        this.neckGroup.position.y = THREE.MathUtils.lerp(NECK_REARED_Y, NECK_STAB_Y, k);
        if (!this.stabHit && !ctx.playerIFrames && k > 0.8 && dist < 1.2) {
          ctx.dealDamageToPlayer(22);
          this.stabHit = true;
        }
        if (this.timer <= 0) {
          this.state = 'stuck';
          this.timer = 1.5;
        }
        break;
      }
      case 'stuck': {
        // Head embedded low — the vulnerable window.
        this.neckGroup.position.y = NECK_STAB_Y;
        this.neckGroup.rotation.x = 1.35 + Math.sin(this.t * 8) * 0.03;
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.6;
        }
        break;
      }
      case 'recover': {
        const k = Math.min(1, dt * 3);
        this.neckGroup.rotation.x += (0 - this.neckGroup.rotation.x) * k;
        this.neckGroup.position.y += (NECK_REST_Y - this.neckGroup.position.y) * k;
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = 0.5 + Math.random() * 0.6;
        }
        break;
      }
    }
  }
}
