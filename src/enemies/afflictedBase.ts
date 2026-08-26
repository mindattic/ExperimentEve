import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

// THE AFFLICTED — the human chimeras. Not survival of the fittest: wild
// clashes of two creatures that should never share a body. They are the
// game's zombie tier — clumsy, unpredictable, tragicomic. They were people.
//
// Shared behaviors every Afflicted gets from this base:
//  - SHAMBLE: erratic speed pulses + lateral stagger (never a clean line)
//  - TOPPLE: they fall down unexpectedly, mid-anything. Funny and apt.
//    While down they take double damage and can't act; then they scramble up.
//  - Subclasses implement updateUpright() for their attack FSM and never
//    have to think about falling over. The base decides when they fall.

export const AFFLICTED_SKIN = 0xc9a68c;
export const AFFLICTED_CLOTHES = [0x4a4652, 0x5a4a3a, 0x3a4a52, 0x554455, 0x46523e, 0x6a5548];

export function pickClothes(seed: number): number {
  return AFFLICTED_CLOTHES[Math.abs(seed) % AFFLICTED_CLOTHES.length]!;
}

/**
 * Human legs (hips + two segmented legs), the half most of them kept.
 * PSX-HD budget: belted waist, knee-split legs, shoes with heels — these
 * were people, and the legs should still read as somebody's slacks.
 */
export function buildLegs(clothes: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makePS1Material({ color: clothes });
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.165, 0.18, 8), mat);
  hips.scale.z = 0.72;
  hips.position.y = 0.86;
  g.add(hips);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 8), makePS1Material({ color: 0x2a2420 }));
  belt.scale.z = 0.74;
  belt.position.y = 0.95;
  g.add(belt);
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.42, 7), mat);
    thigh.position.set(s * 0.1, 0.62, 0);
    g.add(thigh);
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.4, 7), mat);
    calf.position.set(s * 0.1, 0.22, 0.01);
    g.add(calf);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), makePS1Material({ color: 0x2a2420 }));
    shoe.position.set(s * 0.1, 0.04, 0.05);
    g.add(shoe);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.06), makePS1Material({ color: 0x201c18 }));
    heel.position.set(s * 0.1, 0.025, -0.06);
    g.add(heel);
  }
  return g;
}

/**
 * A human torso + head, for the ones that kept the top half instead.
 * Shirt under an open collar, segmented arms with hands, a face that used
 * to answer to a name — eyes included, because eyes are the tragedy.
 */
export function buildTorso(clothes: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makePS1Material({ color: clothes });
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.18, 8), mat);
  waist.scale.z = 0.72;
  waist.position.y = 0.1;
  g.add(waist);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.36, 8), mat);
  chest.scale.z = 0.74;
  chest.position.y = 0.36;
  g.add(chest);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.06, 8), makePS1Material({ color: 0x2a2624 }));
  collar.position.y = 0.55;
  g.add(collar);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.08, 7), makePS1Material({ color: AFFLICTED_SKIN }));
  neck.position.y = 0.58;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), makePS1Material({ color: AFFLICTED_SKIN }));
  head.scale.set(0.92, 1.08, 0.98);
  head.position.y = 0.7;
  g.add(head);
  for (const s of [-1, 1]) {
    // Eyes. They were people.
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.014, 0.006), makePS1Material({ color: 0x1a1614 }));
    eye.position.set(s * 0.04, 0.72, 0.105);
    g.add(eye);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 5), mat);
    shoulder.position.set(s * 0.21, 0.5, 0);
    g.add(shoulder);
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.28, 7), mat);
    upperArm.position.set(s * 0.24, 0.36, 0);
    upperArm.rotation.z = s * 0.22;
    g.add(upperArm);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.24, 7), makePS1Material({ color: AFFLICTED_SKIN }));
    forearm.position.set(s * 0.285, 0.12, 0.02);
    forearm.rotation.z = s * 0.12;
    g.add(forearm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.05), makePS1Material({ color: AFFLICTED_SKIN }));
    hand.position.set(s * 0.3, -0.02, 0.03);
    g.add(hand);
  }
  return g;
}

type BaseState = 'upright' | 'toppling' | 'down' | 'rising';

export abstract class Afflicted extends Enemy {
  faction = 'afflicted';
  /** Seconds between random topples (min, max). Subclasses may tighten. */
  toppleEvery: [number, number] = [4, 9];
  /** How long they stay down. */
  downFor: [number, number] = [1.2, 2.2];
  shambleSpeed = 1.5;

  private baseState: BaseState = 'upright';
  private toppleTimer = 3 + Math.random() * 5;
  private downTimer = 0;
  private tumbleSign = Math.random() < 0.5 ? -1 : 1;
  private staggerT = Math.random() * 10;
  private breathT = Math.random() * 10;

  get isDown(): boolean {
    return this.baseState === 'down' || this.baseState === 'toppling';
  }

  override takeHit(amount: number, part: Parameters<Enemy['takeHit']>[1]): number {
    // On the ground they take double: the punish window for the patient.
    return super.takeHit(this.isDown ? amount * 2 : amount, part);
  }

  /** Erratic shamble toward a point; returns distance remaining. */
  protected shamble(dt: number, target: THREE.Vector3): number {
    this.staggerT += dt;
    const pulse = 0.55 + Math.abs(Math.sin(this.staggerT * 1.7)) * 0.9; // lurches
    const dir = target.clone().sub(this.object.position).setY(0);
    const dist = dir.length();
    if (dist > 0.01) {
      dir.normalize();
      // Lateral stagger: they never walk a clean line.
      const side = new THREE.Vector3(-dir.z, 0, dir.x)
        .multiplyScalar(Math.sin(this.staggerT * 2.9) * 0.45);
      this.object.position.addScaledVector(dir.add(side).normalize(), this.shambleSpeed * pulse * dt);
      this.object.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(this.staggerT * 2.1) * 0.2;
    }
    return dist;
  }

  /** Subclass attack FSM. Only runs while upright. */
  protected abstract updateUpright(dt: number, ctx: BattleContext): void;

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    switch (this.baseState) {
      case 'upright': {
        this.toppleTimer -= dt;
        if (this.toppleTimer <= 0) {
          // Down they go. Mid-anything. That's the joke and the horror.
          this.baseState = 'toppling';
          this.downTimer = 0.35;
          break;
        }
        // Ragged breathing sway — nothing Afflicted ever stands still.
        this.breathT += dt;
        this.object.rotation.z = Math.sin(this.breathT * 1.7) * 0.035;
        this.updateUpright(dt, ctx);
        break;
      }
      case 'toppling': {
        this.downTimer -= dt;
        const k = 1 - Math.max(0, this.downTimer) / 0.35;
        this.object.rotation.z = this.tumbleSign * k * (Math.PI / 2) * 0.92;
        this.object.position.y = Math.sin(k * Math.PI) * 0.12;
        if (this.downTimer <= 0) {
          this.object.position.y = 0;
          this.baseState = 'down';
          this.downTimer = this.downFor[0] + Math.random() * (this.downFor[1] - this.downFor[0]);
        }
        break;
      }
      case 'down': {
        this.downTimer -= dt;
        // Feeble ground-flail: still dangerous point-blank.
        this.object.rotation.z += Math.sin(this.downTimer * 18) * 0.02;
        if (
          this.downTimer > 0.3 &&
          !ctx.playerIFrames &&
          this.object.position.distanceTo(ctx.playerPos) < 0.9 &&
          Math.random() < dt * 1.2
        ) {
          ctx.dealDamageToPlayer(4);
        }
        if (this.downTimer <= 0) {
          this.baseState = 'rising';
          this.downTimer = 0.7;
        }
        break;
      }
      case 'rising': {
        this.downTimer -= dt;
        const k = Math.max(0, this.downTimer) / 0.7;
        this.object.rotation.z = this.tumbleSign * k * (Math.PI / 2) * 0.92;
        if (this.downTimer <= 0) {
          this.object.rotation.z = 0;
          this.baseState = 'upright';
          this.tumbleSign = Math.random() < 0.5 ? -1 : 1;
          this.toppleTimer = this.toppleEvery[0] + Math.random() * (this.toppleEvery[1] - this.toppleEvery[0]);
        }
        break;
      }
    }
  }

  protected override onDeath(): void {
    this.object.rotation.z = this.tumbleSign * (Math.PI / 2) * 0.95;
    this.object.position.y = 0;
  }
}
