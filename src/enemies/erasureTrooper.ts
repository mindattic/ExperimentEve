import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'reposition' | 'laserAim' | 'shoot' | 'recover';

// Pivot-at-top limb segment, same trick as the player rig: rotating the
// returned Object3D swings the mesh from its joint end.
function limbSeg(length: number, rTop: number, rBottom: number, color: number, segments = 7): THREE.Object3D {
  const bone = new THREE.Object3D();
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, segments);
  geo.translate(0, -length / 2, 0);
  bone.add(new THREE.Mesh(geo, makePS1Material({ color })));
  return bone;
}

// Erasure Team trooper: human in a hazmat suit, here to bury the outbreak.
// Not a chimera — that's the point. Rifle with a laser-sight telegraph;
// the air tank on his back is the weak point (flank him).
export class ErasureTrooper extends Enemy {
  readonly displayName = 'Erasure Trooper';
  faction = 'erasure';

  private state: State = 'reposition';
  private timer = 0.5;
  private t = 0;
  private strafeSign = Math.random() < 0.5 ? -1 : 1;
  private readonly torso: THREE.Mesh;
  private readonly visor: THREE.Mesh;
  private readonly tank: THREE.Mesh;
  private readonly laser: THREE.Mesh;
  private readonly laserMat: THREE.MeshBasicMaterial;
  private readonly legHips: THREE.Object3D[] = [];
  private readonly armShoulders: THREE.Object3D[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 45;
    this.radius = 0.38;

    const suit = makePS1Material({ color: 0xb0a23a }); // mustard hazmat
    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.62, 8), suit);
    this.torso.position.y = 1.05;
    this.object.add(this.torso);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), suit);
    hood.position.y = 1.52;
    this.object.add(hood);

    // Dark faceplate, framed by a rim so the mask reads as a distinct piece.
    this.visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.06),
      makePS1Material({ color: 0x151d22 }),
    );
    this.visor.position.set(0, 1.52, 0.15);
    this.object.add(this.visor);
    const visorRim = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.13, 0.02),
      makePS1Material({ color: 0x0d1216 }),
    );
    visorRim.position.set(0, 1.52, 0.17);
    this.object.add(visorRim);
    // Gas-mask filter canisters on either cheek.
    const filterMat = makePS1Material({ color: 0x4a4e40 });
    for (const sx of [-0.14, 0.14]) {
      const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 6), filterMat.clone());
      filter.rotation.z = Math.PI / 2;
      filter.position.set(sx, 1.46, 0.1);
      this.object.add(filter);
    }

    this.tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.42, 8),
      makePS1Material({ color: 0x8a929a }),
    );
    this.tank.position.set(0, 1.15, -0.24);
    this.object.add(this.tank);
    // Valve cap on top of the tank, and a hose feeding forward to the mask.
    const valve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6),
      makePS1Material({ color: 0x6a727a }),
    );
    valve.position.set(0, 1.39, -0.24);
    this.object.add(valve);
    const hose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.32, 6),
      makePS1Material({ color: 0x24241f }),
    );
    hose.position.set(0.07, 1.34, -0.12);
    hose.rotation.set(1.0, 0, 0.35);
    this.object.add(hose);

    // Legs: hip pivot -> thigh -> shin -> boot, so the hazmat suit reads
    // as segmented limbs rather than fence-post cylinders.
    const buildLeg = (sx: number): THREE.Object3D => {
      const hip = new THREE.Object3D();
      hip.position.set(sx, 0.74, 0);
      const thigh = limbSeg(0.38, 0.075, 0.065, 0x9a8e34, 7);
      hip.add(thigh);
      const shin = limbSeg(0.34, 0.06, 0.05, 0x8a7e2e, 7);
      shin.position.y = -0.38;
      thigh.add(shin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.2), makePS1Material({ color: 0x2a2420 }));
      boot.position.set(0, -0.36, 0.04);
      shin.add(boot);
      this.object.add(hip);
      return hip;
    };
    for (const sx of [-0.1, 0.1]) this.legHips.push(buildLeg(sx));

    // Arms: shoulder -> upper arm -> forearm -> gloved hand. The right arm
    // is posed forward as if bracing the rifle; the left hangs relaxed.
    const buildArm = (sx: number, forward: boolean): THREE.Object3D => {
      const shoulder = new THREE.Object3D();
      shoulder.position.set(sx, 1.28, 0);
      shoulder.rotation.x = forward ? 0.55 : 0.08;
      const upper = limbSeg(0.26, 0.05, 0.042, 0xb0a23a, 7);
      shoulder.add(upper);
      const fore = limbSeg(0.24, 0.04, 0.032, 0xb0a23a, 7);
      fore.position.y = -0.26;
      fore.rotation.x = forward ? -0.5 : -0.1;
      upper.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.055), makePS1Material({ color: 0x24221a }));
      hand.position.y = -0.24;
      fore.add(hand);
      this.object.add(shoulder);
      return shoulder;
    };
    this.armShoulders.push(buildArm(-0.22, false), buildArm(0.22, true));

    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.62),
      makePS1Material({ color: 0x24262a }),
    );
    rifle.position.set(0.2, 1.12, 0.25);
    this.object.add(rifle);

    // Laser sight: a thin beam that appears during the aim telegraph.
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.7 });
    this.laser = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 3), this.laserMat);
    this.laser.visible = false;
    this.object.add(this.laser);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'air tank', node: this.tank, radius: 0.18, damageMultiplier: 5, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  protected override onDeath(): void {
    this.laser.visible = false;
    this.object.rotation.x = Math.PI / 2;
    this.object.position.y = 0.2;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    // Subtle idle breathing and weight-shift — always running, low amplitude.
    const breathe = 1 + Math.sin(this.t * 2.4) * 0.02;
    this.torso.scale.set(breathe, 1, breathe);
    for (let i = 0; i < this.legHips.length; i++) {
      this.legHips[i]!.rotation.z = Math.sin(this.t * 1.1 + i * Math.PI) * 0.03;
    }
    for (let i = 0; i < this.armShoulders.length; i++) {
      this.armShoulders[i]!.rotation.z = (i === 0 ? 1 : -1) * Math.sin(this.t * 1.7 + i) * 0.03;
    }

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    switch (this.state) {
      case 'reposition': {
        // Keep rifle range: back off when close, strafe otherwise.
        const dir = toPlayer.clone().normalize();
        if (dist < 4) {
          this.object.position.addScaledVector(dir, -1.8 * dt);
        } else if (dist > 9) {
          this.object.position.addScaledVector(dir, 1.8 * dt);
        } else {
          const strafe = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeSign * 1.6 * dt);
          this.object.position.add(strafe);
        }
        if (this.timer <= 0) {
          this.state = 'laserAim';
          this.timer = 0.95;
          this.laser.visible = true;
        }
        break;
      }
      case 'laserAim': {
        // TELEGRAPH: red beam sweeps onto her.
        const target = ctx.playerPos.clone().setY(1.1);
        const from = new THREE.Vector3(0.2, 1.12, 0.35).applyEuler(this.object.rotation).add(this.object.position);
        const beam = target.clone().sub(from);
        const len = beam.length();
        this.laser.scale.y = len;
        this.laser.position.copy(this.object.worldToLocal(from.clone().add(beam.multiplyScalar(0.5))));
        this.laser.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          this.object.worldToLocal(target).sub(this.object.worldToLocal(from.clone())).normalize(),
        );
        if (this.timer <= 0) {
          this.state = 'shoot';
          this.timer = 0.12;
        }
        break;
      }
      case 'shoot': {
        if (this.timer <= 0) {
          this.laser.visible = false;
          if (!ctx.playerIFrames && dist < 14) {
            ctx.dealDamageToPlayer(16);
          }
          this.state = 'recover';
          this.timer = 1.4 + Math.random() * 0.8;
          this.strafeSign = Math.random() < 0.5 ? -1 : 1;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) {
          this.state = 'reposition';
          this.timer = 1.2 + Math.random();
        }
        break;
      }
    }
  }
}
