import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';

// Protagonist: hierarchical Object3D "bones" with primitive meshes, animated
// procedurally (no SkinnedMesh). PSX-HD budget: this is a late-gen PS1 hero
// model — segmented limbs with hands, a face, hair masses, a collared jacket
// — not a launch-title mannequin. Roughly 1.7m tall; leather jacket, jeans,
// ponytail.

const COLORS = {
  skin: 0xd8b09a,
  skinShade: 0xc49c86,
  hair: 0xb89050,
  hairDark: 0xa07c40,
  jacket: 0x33424e,
  jacketDark: 0x2a3640,
  shirt: 0x9a8f80,
  jeans: 0x3c4a66,
  jeansDark: 0x33405a,
  boots: 0x2a2420,
  gun: 0x222226,
  eyes: 0x2a2620,
};

function limb(
  length: number,
  rTop: number,
  rBottom: number,
  color: number,
  radialSegments = 8,
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
  private recoilT = 0;
  private flinchT = 0;
  private flinchSide = 1;
  /** 0 healthy .. 1 nearly dead — hunches her over as it climbs. */
  hurtK = 0;
  pose: RigPose = 'explore';

  /** Gun recoil: the shot kicks her arm up and shoulders back. */
  kick(): void {
    this.recoilT = 1;
  }

  /** Taking a hit: a fast twist away from the wound. */
  flinch(): void {
    this.flinchT = 1;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
  }

  constructor() {
    const HIP_Y = 0.92;

    this.hips = new THREE.Object3D();
    this.hips.position.y = HIP_Y;
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.16, 0.18, 8),
      makePS1Material({ color: COLORS.jeans }),
    );
    pelvis.scale.z = 0.72;
    pelvis.position.y = -0.02;
    this.hips.add(pelvis);
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.045, 8),
      makePS1Material({ color: COLORS.boots }),
    );
    belt.scale.z = 0.74;
    belt.position.y = 0.08;
    this.hips.add(belt);

    // Torso pivots at the hip top: waist, chest, jacket hem + collar.
    this.torso = new THREE.Object3D();
    const waist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.125, 0.2, 8),
      makePS1Material({ color: COLORS.shirt }),
    );
    waist.scale.z = 0.7;
    waist.position.y = 0.16;
    this.torso.add(waist);
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.13, 0.34, 8),
      makePS1Material({ color: COLORS.jacket }),
    );
    chest.scale.z = 0.72;
    chest.position.y = 0.42;
    this.torso.add(chest);
    // Open jacket: two front panels over the shirt.
    for (const s of [-1, 1]) {
      const panel = box(0.075, 0.3, 0.02, COLORS.jacketDark);
      panel.position.set(s * 0.075, 0.26, 0.098);
      panel.rotation.x = 0.06;
      this.torso.add(panel);
    }
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.12, 0.07, 8),
      makePS1Material({ color: COLORS.jacketDark }),
    );
    collar.position.y = 0.6;
    this.torso.add(collar);
    // Shoulder caps soften the arm joins.
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 7, 5), makePS1Material({ color: COLORS.jacket }));
      cap.position.set(s * 0.2, 0.55, 0);
      this.torso.add(cap);
    }
    this.hips.add(this.torso);

    // Head: neck, skull with a face plane, hair cap + side masses + bangs.
    this.head = new THREE.Object3D();
    this.head.position.y = 0.62;
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.09, 7),
      makePS1Material({ color: COLORS.skinShade }),
    );
    neck.position.y = 0.02;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), makePS1Material({ color: COLORS.skin }));
    skull.scale.set(0.92, 1.08, 0.98);
    skull.position.y = 0.14;
    this.head.add(skull);
    const jaw = box(0.11, 0.05, 0.09, COLORS.skin);
    jaw.position.set(0, 0.065, 0.02);
    this.head.add(jaw);
    // Eyes: two dark quads on the face. At PSX-HD they actually read.
    for (const s of [-1, 1]) {
      const eye = box(0.022, 0.014, 0.005, COLORS.eyes);
      eye.position.set(s * 0.037, 0.15, 0.098);
      this.head.add(eye);
    }
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), makePS1Material({ color: COLORS.hair }));
    hairCap.scale.set(0.95, 0.9, 1.0);
    hairCap.position.set(0, 0.185, -0.02);
    this.head.add(hairCap);
    const bangs = box(0.19, 0.05, 0.03, COLORS.hairDark);
    bangs.position.set(0, 0.215, 0.085);
    bangs.rotation.x = -0.25;
    this.head.add(bangs);
    for (const s of [-1, 1]) {
      const side = box(0.03, 0.12, 0.08, COLORS.hairDark);
      side.position.set(s * 0.1, 0.13, -0.02);
      this.head.add(side);
    }
    this.ponytail = limb(0.34, 0.035, 0.012, COLORS.hair, 6);
    this.ponytail.position.set(0, 0.2, -0.1);
    this.ponytail.rotation.x = 0.5;
    this.head.add(this.ponytail);
    this.torso.add(this.head);

    // Arms with hands; the right hand holds the pistol.
    const shoulderY = 0.55;
    this.upperArmL = limb(0.28, 0.048, 0.04, COLORS.jacket);
    this.upperArmL.position.set(-0.21, shoulderY, 0);
    this.forearmL = limb(0.24, 0.035, 0.026, COLORS.jacket);
    this.forearmL.position.y = -0.28;
    const handL = box(0.045, 0.07, 0.05, COLORS.skin);
    handL.position.y = -0.27;
    this.forearmL.add(handL);
    this.upperArmL.add(this.forearmL);
    this.torso.add(this.upperArmL);

    this.upperArmR = limb(0.28, 0.048, 0.04, COLORS.jacket);
    this.upperArmR.position.set(0.21, shoulderY, 0);
    this.forearmR = limb(0.24, 0.035, 0.026, COLORS.jacket);
    this.forearmR.position.y = -0.28;
    const handR = box(0.045, 0.07, 0.05, COLORS.skin);
    handR.position.y = -0.27;
    this.forearmR.add(handR);
    this.upperArmR.add(this.forearmR);
    this.torso.add(this.upperArmR);

    // Pistol in the right hand.
    const gun = box(0.035, 0.09, 0.17, COLORS.gun);
    gun.position.set(0, -0.3, 0.06);
    gun.rotation.x = Math.PI / 2 - 0.2;
    this.forearmR.add(gun);

    // Legs: thigh / calf / boot with a heel.
    const buildLeg = (side: number): [THREE.Object3D, THREE.Object3D] => {
      const upper = limb(0.42, 0.078, 0.06, COLORS.jeans);
      upper.position.set(side * 0.09, -0.06, 0);
      const lower = limb(0.4, 0.055, 0.042, COLORS.jeansDark);
      lower.position.y = -0.42;
      const boot = box(0.09, 0.08, 0.21, COLORS.boots);
      boot.position.set(0, -0.38, 0.045);
      lower.add(boot);
      const heel = box(0.09, 0.05, 0.06, COLORS.boots);
      heel.position.set(0, -0.395, -0.06);
      lower.add(heel);
      upper.add(lower);
      this.hips.add(upper);
      return [upper, lower];
    };
    [this.upperLegL, this.lowerLegL] = buildLeg(-1);
    [this.upperLegR, this.lowerLegR] = buildLeg(1);

    this.root.add(this.hips);
  }

  /**
   * speed01: 0 idle .. 1 full run. dodgeK: 1 at leap start, 0 at landing —
   * tucks her into a mid-air guard. slideK: same window for the Knee Slide —
   * kneeling glide, torso back, gun up (the carpet burn is implied).
   * Call every frame with game dt.
   */
  update(dt: number, speed01: number, dodgeK = 0, slideK = 0): void {
    this.idleTime += dt;
    const moving = speed01 > 0.02;
    if (moving) {
      this.phase += dt * (5 + 7 * speed01);
    } else {
      // Ease legs back to neutral by pulling phase toward the nearest rest.
      const rest = Math.round(this.phase / Math.PI) * Math.PI;
      this.phase += (rest - this.phase) * Math.min(1, dt * 10);
    }
    const swing = Math.sin(this.phase) * (0.35 + 0.35 * speed01);

    // Legs: opposite swing; knee bends on the trailing leg.
    this.upperLegL.rotation.x = swing;
    this.upperLegR.rotation.x = -swing;
    this.lowerLegL.rotation.x = Math.max(0, -Math.sin(this.phase)) * 0.9 * speed01;
    this.lowerLegR.rotation.x = Math.max(0, Math.sin(this.phase)) * 0.9 * speed01;

    // Hip bob + slight forward lean at speed. Low HP hunches her over —
    // heavier breathing, shoulders in; the body tells the health bar's story.
    this.hips.position.y = 0.92 + (moving ? Math.abs(Math.cos(this.phase)) * 0.035 * speed01 : 0)
      + (!moving ? Math.sin(this.idleTime * 1.6) * 0.006 : 0)
      - this.hurtK * 0.05;
    this.torso.rotation.x = 0.12 * speed01
      + this.hurtK * (0.18 + Math.sin(this.idleTime * 3.2) * 0.03);
    this.head.rotation.x = -this.hurtK * 0.14; // eyes stay up even hunched

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

    // Recoil: a sharp kick that snaps in and eases out. The gun arm jumps,
    // the shoulders roll back, and it's gone in a quarter second.
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt * 4.5);
      const r = this.recoilT * this.recoilT;
      this.upperArmR.rotation.x -= 0.45 * r;
      this.forearmR.rotation.x -= 0.3 * r;
      this.torso.rotation.x -= 0.08 * r;
      this.head.rotation.x += 0.06 * r;
    }

    // Flinch: hit reaction — a fast twist away, arms pulled in.
    if (this.flinchT > 0) {
      this.flinchT = Math.max(0, this.flinchT - dt * 3.5);
      const f = Math.sin(this.flinchT * Math.PI) * this.flinchT;
      this.torso.rotation.z = 0.22 * f * this.flinchSide;
      this.torso.rotation.x += 0.18 * f;
      this.upperArmL.rotation.z += 0.4 * f;
      this.upperArmR.rotation.z -= 0.4 * f;
    } else {
      this.torso.rotation.z = 0;
    }

    // Dodge leap: lean back hard, knees up, arms flared for balance.
    if (dodgeK > 0 && slideK <= 0) {
      const d = Math.sin(dodgeK * Math.PI); // peaks mid-leap
      this.torso.rotation.x = -0.4 * d;
      this.upperLegL.rotation.x = -1.0 * d;
      this.upperLegR.rotation.x = -0.8 * d;
      this.lowerLegL.rotation.x = 1.3 * d;
      this.lowerLegR.rotation.x = 1.1 * d;
      this.upperArmL.rotation.z = 0.9 * d;
      this.upperArmR.rotation.z = -0.9 * d;
    }

    // Knee slide: kneeling glide — calves folded under, torso thrown back,
    // both arms up and shooting. The knees are the special effect.
    if (slideK > 0) {
      const s = Math.min(1, slideK * 3); // snaps in, holds through the slide
      this.hips.position.y = 0.92 - 0.42 * s;
      this.torso.rotation.x = -0.5 * s;
      this.head.rotation.x = 0.35 * s; // eyes stay on the target
      this.upperLegL.rotation.x = -0.4 * s;
      this.upperLegR.rotation.x = -0.55 * s;
      this.lowerLegL.rotation.x = 2.1 * s;
      this.lowerLegR.rotation.x = 2.2 * s;
      this.upperArmL.rotation.x = -1.35 * s;
      this.upperArmL.rotation.z = 0.35 * s;
      this.upperArmR.rotation.x = -1.45 * s;
      this.upperArmR.rotation.z = -0.15 * s;
      this.forearmL.rotation.x = -0.2 * s;
      this.forearmR.rotation.x = -0.1 * s;
    }

    // Ponytail lags the bob.
    this.ponytail.rotation.x = 0.5 + Math.sin(this.phase - 0.8) * 0.12 * speed01
      + Math.sin(this.idleTime * 1.6) * 0.02 + (dodgeK > 0 ? -0.5 * Math.sin(dodgeK * Math.PI) : 0);
  }
}
