import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildTorso, pickClothes, AFFLICTED_SKIN } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'strafe' | 'telegraph' | 'recover';

/** Crab legs from the waist down: he was never built to walk forward again. */
function buildCrabLegs(outLegs: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), makePS1Material({ color: 0x3a4a3a }));
  shell.scale.set(1.3, 0.55, 1.1);
  shell.position.y = 0.32;
  g.add(shell);
  const legMat = makePS1Material({ color: 0x2c3a2c });
  const jointMat = makePS1Material({ color: 0x1e2a1e });
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 7), legMat);
    leg.position.set(side * 0.32, 0.2, -0.18 + (i % 3) * 0.18);
    leg.rotation.z = side * 1.1;
    g.add(leg);
    outLegs.push(leg);
    // Knuckle where the leg bends toward the ground.
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), jointMat);
    joint.position.set(0, -0.24, 0);
    leg.add(joint);
  }
  return g;
}

// TOGGLECRAB — a man whose legs became a crab's. He can only strafe, so he
// crabwalks a wide arc around you, flipping direction on a whim, and the
// head he strains to keep turned away from you is the only part of him
// that's still soft.
export class Togglecrab extends Afflicted {
  readonly displayName = 'Togglecrab';

  private state: State = 'strafe';
  private timer = 0.6 + Math.random() * 0.6;
  private sideSign: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
  private toggleTimer = 2 + Math.random() * 2;
  private t = 0;
  private readonly torso: THREE.Group;
  private readonly head: THREE.Mesh;
  private readonly legs: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 20;
    this.radius = 0.4;
    this.shambleSpeed = 1.6;

    const clothes = pickClothes(23);
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.5;
    const legs = buildCrabLegs(this.legs);
    this.object.add(legs, this.torso);

    this.head = this.torso.children[1] as THREE.Mesh;
    this.head.rotation.y = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), makePS1Material({ color: AFFLICTED_SKIN }));
    nose.position.set(0.11, 0, 0);
    this.head.add(nose);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.32, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'profile', node: this.head, radius: 0.15, damageMultiplier: 3.5, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const distPlayer = this.object.position.distanceTo(ctx.playerPos);
    // Scuttle: legs on each side skitter out of phase, never in a clean gait.
    this.legs.forEach((leg, i) => {
      const side = i < 3 ? -1 : 1;
      leg.rotation.x = Math.sin(this.t * 10 + i * 1.4) * 0.12 * side;
    });

    switch (this.state) {
      case 'strafe': {
        this.toggleTimer -= dt;
        if (this.toggleTimer <= 0) {
          this.sideSign = this.sideSign === 1 ? -1 : 1;
          this.toggleTimer = 2 + Math.random() * 2;
        }

        const bearing = ctx.playerPos.clone().sub(this.object.position).setY(0);
        if (bearing.lengthSq() > 0.0001) bearing.normalize();
        const perp = new THREE.Vector3(-bearing.z, 0, bearing.x).multiplyScalar(this.sideSign);
        const target = ctx.playerPos.clone().addScaledVector(perp, 1.6);
        target.y = this.object.position.y;
        this.shamble(dt, target);

        if (distPlayer < 1.3) {
          this.state = 'telegraph';
          this.timer = 0.6;
        }
        break;
      }
      case 'telegraph': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.torso.rotation.z = this.sideSign * k * 0.35; // leans away first
        if (this.timer <= 0) {
          if (!ctx.playerIFrames && this.object.position.distanceTo(ctx.playerPos) < 1.3) {
            ctx.dealDamageToPlayer(12);
          }
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.torso.rotation.z *= Math.max(0, 1 - dt * 6);
        if (this.timer <= 0) this.state = 'strafe';
        break;
      }
    }
  }
}
