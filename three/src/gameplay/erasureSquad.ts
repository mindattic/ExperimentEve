import * as THREE from 'three';
import { ErasureTrooper } from '../enemies/erasureTrooper';
import type { Enemy } from '../enemies/enemyBase';
import { lineBlocked, type Collider } from '../physics/colliders';

// Off-guard Erasure vignette: a squad caught slacking (coffee at a barrel,
// one peeing against a pylon). Detection = view cone + noise. Approach the
// off-guard one undetected and attack for an EXECUTION — a free kill before
// the fight starts. Detected instead → the whole squad opens up alert.

interface SquadMember {
  trooper: ErasureTrooper;
  facing: number; // radians, world
  offGuard: boolean;
  swayT: number;
}

export type SquadState = 'vignette' | 'alerted' | 'done';

const VIEW_ANGLE = Math.cos((70 * Math.PI) / 180); // half-angle 70°
const VIEW_DIST = 9;
const NOISE_RUN = 5;
const NOISE_WALK = 2;

export class ErasureSquad {
  state: SquadState = 'vignette';
  private members: SquadMember[] = [];
  onAlert: ((enemies: Enemy[], executed: boolean) => void) | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  spawn(defs: { x: number; z: number; facing: number; offGuard: boolean }[]): void {
    for (const d of defs) {
      const trooper = new ErasureTrooper();
      trooper.object.position.set(d.x, 0, d.z);
      trooper.object.rotation.y = d.facing;
      this.scene.add(trooper.object);
      this.members.push({ trooper, facing: d.facing, offGuard: d.offGuard, swayT: Math.random() * 5 });
    }
  }

  get alive(): SquadMember[] {
    return this.members.filter((m) => !m.trooper.dead);
  }

  /** The off-guard trooper Kat could execute right now, if any. */
  executionCandidate(playerPos: THREE.Vector3): SquadMember | null {
    if (this.state !== 'vignette') return null;
    for (const m of this.alive) {
      if (!m.offGuard) continue;
      const to = playerPos.clone().sub(m.trooper.object.position).setY(0);
      if (to.length() > 1.4) continue;
      // Must be behind him: player sits opposite his facing.
      const facingVec = new THREE.Vector3(Math.sin(m.facing), 0, Math.cos(m.facing));
      if (facingVec.dot(to.normalize()) < 0.1) return m;
    }
    return null;
  }

  execute(member: SquadMember): void {
    member.trooper.takeHit(9999, null);
    this.alert(true);
  }

  update(
    gameDt: number,
    playerPos: THREE.Vector3,
    playerSpeed01: number,
    colliders: readonly Collider[] = [],
  ): void {
    if (this.state !== 'vignette' || gameDt <= 0) return;
    for (const m of this.alive) {
      // Idle theater: sway, shift weight; the off-guard one faces his wall.
      m.swayT += gameDt;
      m.trooper.object.rotation.y = m.facing + Math.sin(m.swayT * 0.8) * 0.12;
      m.trooper.object.position.y = Math.sin(m.swayT * 1.7) * 0.015;

      const to = playerPos.clone().sub(m.trooper.object.position).setY(0);
      const dist = to.length();
      // Noise: running is loud, walking quiet, standing silent.
      const noiseRadius = playerSpeed01 > 0.7 ? NOISE_RUN : playerSpeed01 > 0.05 ? NOISE_WALK : 0;
      const heard = dist < noiseRadius;
      // Sight: view cone (off-guard members don't watch).
      const facingVec = new THREE.Vector3(Math.sin(m.facing), 0, Math.cos(m.facing));
      const pos = m.trooper.object.position;
      const seen =
        !m.offGuard &&
        dist < VIEW_DIST &&
        facingVec.dot(to.clone().normalize()) > VIEW_ANGLE &&
        !lineBlocked(pos.x, pos.z, playerPos.x, playerPos.z, colliders);
      if (heard || seen) {
        this.alert(false);
        return;
      }
    }
  }

  private alert(viaExecution: boolean): void {
    if (this.state !== 'vignette') return;
    this.state = 'alerted';
    const combatants = this.alive.map((m) => m.trooper);
    this.onAlert?.(combatants, viaExecution);
    this.state = 'done';
  }
}
