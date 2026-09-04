import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'approach' | 'wander' | 'peckWindup' | 'peck' | 'recover';

// The Afflicted — Gullscream: a man whose head was replaced wholesale by a
// full-size gull, beak locked open mid-scream. He forgets what he's doing
// between lunges and wanders in confused little circles before trying again.
export class Gullscream extends Afflicted {
  readonly displayName = 'Gullscream';
  private state: State = 'approach';
  private timer = 0.8 + Math.random() * 0.6;
  private t = 0;
  private wanderTimer = 1.5 + Math.random() * 2;
  private readonly wanderTarget = new THREE.Vector3();
  private peckCount = 0;
  private peckHit = false;
  private readonly gullHead: THREE.Group;

  constructor() {
    super();
    this.maxHp = this.hp = 20;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    const torso = buildTorso(clothes);
    torso.position.y = 0.86;
    torso.children[1]!.visible = false; // human head hidden - the gull replaces it
    this.object.add(torso);

    this.gullHead = new THREE.Group();
    this.gullHead.position.set(0, 0.65, 0);
    torso.add(this.gullHead);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 9, 7), makePS1Material({ color: 0xe8e4da }));
    this.gullHead.add(skull);
    const beakMat = makePS1Material({ color: 0xd98a2b });
    const beakUpper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.32), beakMat);
    beakUpper.position.set(0, 0.03, 0.22);
    beakUpper.rotation.x = -0.16;
    this.gullHead.add(beakUpper);
    const beakLower = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.28), beakMat);
    beakLower.position.set(0, -0.03, 0.2);
    beakLower.rotation.x = 0.2;
    this.gullHead.add(beakLower);
    // Nostril slits: the one part of the beak that still looks earned.
    for (const s of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.03), makePS1Material({ color: 0x8a541a }));
      nostril.position.set(s * 0.016, 0.05, 0.14);
      this.gullHead.add(nostril);
    }
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), makePS1Material({ color: 0x3a1010 }));
    throat.position.set(0, 0, 0.12);
    this.gullHead.add(throat);
    const eyeMat = makePS1Material({ color: 0x1a1a1a });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), eyeMat);
      eye.position.set(s * 0.09, 0.06, 0.08);
      this.gullHead.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 4, 3), glintMat);
      glint.position.set(s * 0.1, 0.075, 0.1);
      this.gullHead.add(glint);
    }
    // Feather tuft: a ragged crest that never lies flat.
    const tuftMat = makePS1Material({ color: 0xd8d2c4 });
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 5), tuftMat);
      tuft.position.set((i - 1) * 0.03, 0.17, -0.06 + i * 0.01);
      tuft.rotation.x = -0.5 + i * 0.15;
      this.gullHead.add(tuft);
    }

    this.parts = [
      { tag: 'body', node: torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      // The beak/throat is a mercy: always open, always exposed.
      { tag: 'beak', node: throat, radius: 0.12, damageMultiplier: 3.5, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);

    // Idle jitter: a gull's head never sits still, even between lunges.
    this.gullHead.rotation.z = Math.sin(this.t * 3.4) * 0.06;

    switch (this.state) {
      case 'approach': {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0 && dist > 1.6) {
          this.state = 'wander';
          this.timer = 0.7 + Math.random() * 0.7;
          const ang = Math.random() * Math.PI * 2;
          this.wanderTarget.set(
            this.object.position.x + Math.cos(ang) * 1.4,
            0,
            this.object.position.z + Math.sin(ang) * 1.4,
          );
          break;
        }
        this.shamble(dt, ctx.playerPos);
        if (dist < 1.3 && this.timer <= 0) {
          this.state = 'peckWindup';
          this.timer = 0.6 + Math.random() * 0.2;
        }
        break;
      }
      case 'wander': {
        // Confused: shambles toward a random nearby point instead.
        this.shamble(dt, this.wanderTarget);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.wanderTimer = 1.5 + Math.random() * 2;
          this.timer = 0.4;
        }
        break;
      }
      case 'peckWindup': {
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.gullHead.rotation.x = -k * 0.55 + Math.sin(this.t * 40) * 0.04;
        if (this.timer <= 0) {
          this.state = 'peck';
          this.peckCount = 0;
          this.timer = 0.18;
          this.peckHit = false;
        }
        break;
      }
      case 'peck': {
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.18;
        this.gullHead.rotation.x = -0.55 + Math.sin(k * Math.PI) * 1.0;
        if (!this.peckHit && k > 0.45 && k < 0.75 && !ctx.playerIFrames && dist < 1.0) {
          ctx.dealDamageToPlayer(3);
          this.peckHit = true;
        }
        if (this.timer <= 0) {
          this.peckCount++;
          if (this.peckCount >= 5) {
            this.gullHead.rotation.x = 0;
            this.state = 'recover';
            this.timer = 0.9 + Math.random() * 0.5;
          } else {
            this.timer = 0.18;
            this.peckHit = false;
          }
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0.6 + Math.random() * 0.6;
        }
        break;
      }
    }
  }

  private facePlayer(ctx: BattleContext): void {
    const dir = ctx.playerPos.clone().sub(this.object.position).setY(0);
    if (dir.lengthSq() > 0.0001) this.object.rotation.y = Math.atan2(dir.x, dir.z);
  }
}
