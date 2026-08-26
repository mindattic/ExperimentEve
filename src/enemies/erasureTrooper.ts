import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'reposition' | 'laserAim' | 'shoot' | 'recover';

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
  private readonly visor: THREE.Mesh;
  private readonly tank: THREE.Mesh;
  private readonly laser: THREE.Mesh;
  private readonly laserMat: THREE.MeshBasicMaterial;

  constructor() {
    super();
    this.maxHp = this.hp = 45;
    this.radius = 0.38;

    const suit = makePS1Material({ color: 0xb0a23a }); // mustard hazmat
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.62, 6), suit);
    torso.position.y = 1.05;
    this.object.add(torso);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), suit);
    hood.position.y = 1.52;
    this.object.add(hood);
    this.visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.06),
      makePS1Material({ color: 0x22303a }),
    );
    this.visor.position.set(0, 1.52, 0.15);
    this.object.add(this.visor);
    this.tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.42, 6),
      makePS1Material({ color: 0x8a929a }),
    );
    this.tank.position.set(0, 1.15, -0.24);
    this.object.add(this.tank);
    const legMat = makePS1Material({ color: 0x9a8e34 });
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.72, 5), legMat);
      leg.position.set(sx, 0.38, 0);
      this.object.add(leg);
    }
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
      { tag: 'body', node: torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
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
