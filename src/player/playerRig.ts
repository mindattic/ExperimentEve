import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';

// Protagonist: hierarchical Object3D "bones" with primitive meshes, animated
// procedurally (no SkinnedMesh). Deliberately low-poly so the vertex-snap
// wobble reads. Roughly 1.7m tall; leather jacket, jeans, ponytail.

const COLORS = {
  skin: 0xd8b09a,
  hair: 0xb89050,
  jacket: 0x33424e,
  shirt: 0x9a8f80,
  jeans: 0x3c4a66,
  boots: 0x2a2420,
  gun: 0x222226,
};

function limb(
  length: number,
  rTop: number,
  rBottom: number,
  color: number,
  radialSegments = 5,
): THREE.Object3D {
  // Pivot at the TOP of the limb so rotation swings it naturally.
  const bone = new THREE.Object3D();
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, radialSegments);
  geo.translate(0, -length / 2, 0);
  bone.add(new THREE.Mesh(geo, makePS1Material({ color })));
  return bone;
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makePS1Material({ color }));
}

export type RigPose = 'explore' | 'aim';

export class PlayerRig {
  readonly root = new THREE.Group();

  private readonly hips: THREE.Object3D;
  private readonly torso: THREE.Object3D;
  private readonly head: THREE.Object3D;
  private readonly ponytail: THREE.Object3D;
  private readonly upperArmL: THREE.Object3D;
  private readonly upperArmR: THREE.Object3D;
  private readonly forearmL: THREE.Object3D;
  private readonly forearmR: THREE.Object3D;
  private readonly upperLegL: THREE.Object3D;
  private readonly upperLegR: THREE.Object3D;
  private readonly lowerLegL: THREE.Object3D;
  private readonly lowerLegR: THREE.Object3D;

  /** Walk-cycle phase in radians; footsteps land at phase ≈ 0 and π. */
  phase = 0;
  private idleTime = 0;
  private aimBlend = 0;
  pose: RigPose = 'explore';

  constructor() {
    const HIP_Y = 0.92;

    this.hips = new THREE.Object3D();
    this.hips.position.y = HIP_Y;
    const pelvis = box(0.3, 0.16, 0.18, COLORS.jeans);
    pelvis.position.y = -0.02;
    this.hips.add(pelvis);

    // Torso pivots at the hip top.
    this.torso = new THREE.Object3D();
    const chestGeo = new THREE.CylinderGeometry(0.13, 0.155, 0.5, 6);
    chestGeo.translate(0, 0.31, 0);
    this.torso.add(new THREE.Mesh(chestGeo, makePS1Material({ color: COLORS.jacket })));
    const shirt = box(0.2, 0.12, 0.14, COLORS.shirt);
    shirt.position.set(0, 0.5, 0.06);
    this.torso.add(shirt);
    this.hips.add(this.torso);

    this.head = new THREE.Object3D();
    this.head.position.y = 0.62;
    const skull = box(0.17, 0.2, 0.18, COLORS.skin);
    skull.position.y = 0.1;
    this.head.add(skull);
    const hairCap = box(0.19, 0.1, 0.2, COLORS.hair);
    hairCap.position.set(0, 0.19, -0.01);
    this.head.add(hairCap);
    this.ponytail = limb(0.32, 0.035, 0.015, COLORS.hair);
    this.ponytail.position.set(0, 0.16, -0.11);
    this.ponytail.rotation.x = 0.5;
    this.head.add(this.ponytail);
    this.torso.add(this.head);

    const shoulderY = 0.55;
    this.upperArmL = limb(0.28, 0.045, 0.04, COLORS.jacket);
    this.upperArmL.position.set(-0.21, shoulderY, 0);
    this.forearmL = limb(0.26, 0.035, 0.028, COLORS.skin);
    this.forearmL.position.y = -0.28;
    this.upperArmL.add(this.forearmL);
    this.torso.add(this.upperArmL);

    this.upperArmR = limb(0.28, 0.045, 0.04, COLORS.jacket);
    this.upperArmR.position.set(0.21, shoulderY, 0);
    this.forearmR = limb(0.26, 0.035, 0.028, COLORS.skin);
    this.forearmR.position.y = -0.28;
    this.upperArmR.add(this.forearmR);
    this.torso.add(this.upperArmR);

    // Pistol in the right hand.
    const gun = box(0.035, 0.09, 0.16, COLORS.gun);
    gun.position.set(0, -0.28, 0.05);
    gun.rotation.x = Math.PI / 2 - 0.2;
    this.forearmR.add(gun);

    this.upperLegL = limb(0.42, 0.075, 0.06, COLORS.jeans);
    this.upperLegL.position.set(-0.09, -0.06, 0);
    this.lowerLegL = limb(0.42, 0.055, 0.045, COLORS.jeans);
    this.lowerLegL.position.y = -0.42;
    const bootL = box(0.09, 0.07, 0.2, COLORS.boots);
    bootL.position.set(0, -0.4, 0.04);
    this.lowerLegL.add(bootL);
    this.upperLegL.add(this.lowerLegL);
    this.hips.add(this.upperLegL);

    this.upperLegR = limb(0.42, 0.075, 0.06, COLORS.jeans);
    this.upperLegR.position.set(0.09, -0.06, 0);
    this.lowerLegR = limb(0.42, 0.055, 0.045, COLORS.jeans);
    this.lowerLegR.position.y = -0.42;
    const bootR = box(0.09, 0.07, 0.2, COLORS.boots);
    bootR.position.set(0, -0.4, 0.04);
    this.lowerLegR.add(bootR);
    this.upperLegR.add(this.lowerLegR);
    this.hips.add(this.upperLegR);

    this.root.add(this.hips);
  }

  /** speed01: 0 idle .. 1 full run. Call every frame with game dt. */
  update(dt: number, speed01: number): void {
    this.idleTime += dt;
    const moving = speed01 > 0.02;
    if (moving) {
      this.phase += dt * (5 + 7 * speed01);
    } else {
      // Ease legs back to neutral by pulling phase toward the nearest rest.
      const rest = Math.round(this.phase / Math.PI) * Math.PI;
      this.phase += (rest - this.phase) * Math.min(1, dt * 10);
    }
    const swing = Math.sin(this.phase) * (0.35 + 0.35 * speed01) * (moving ? 1 : 1);

    // Legs: opposite swing; knee bends on the trailing leg.
    this.upperLegL.rotation.x = swing;
    this.upperLegR.rotation.x = -swing;
    this.lowerLegL.rotation.x = Math.max(0, -Math.sin(this.phase)) * 0.9 * speed01;
    this.lowerLegR.rotation.x = Math.max(0, Math.sin(this.phase)) * 0.9 * speed01;

    // Hip bob + slight forward lean at speed.
    this.hips.position.y = 0.92 + (moving ? Math.abs(Math.cos(this.phase)) * 0.035 * speed01 : 0)
      + (!moving ? Math.sin(this.idleTime * 1.6) * 0.006 : 0);
    this.torso.rotation.x = 0.12 * speed01;

    // Arms: counter-swing; blend toward aim pose when aiming.
    const armSwing = Math.sin(this.phase) * 0.45 * speed01;
    const targetAim = this.pose === 'aim' ? 1 : 0;
    this.aimBlend += (targetAim - this.aimBlend) * Math.min(1, dt * 8);
    const a = this.aimBlend;

    this.upperArmL.rotation.x = (-armSwing) * (1 - a) + -1.15 * a;
    this.upperArmL.rotation.z = 0.08 * (1 - a) + 0.5 * a;
    this.forearmL.rotation.x = -0.25 * (1 - a) + -0.35 * a;
    this.upperArmR.rotation.x = armSwing * (1 - a) + -1.5 * a;
    this.upperArmR.rotation.z = -0.08 * (1 - a);
    this.forearmR.rotation.x = -0.25 * (1 - a);

    // Ponytail lags the bob.
    this.ponytail.rotation.x = 0.5 + Math.sin(this.phase - 0.8) * 0.12 * speed01
      + Math.sin(this.idleTime * 1.6) * 0.02;
  }
}
