import * as THREE from 'three';
import type { Collider } from '../physics/colliders';

export interface EnemyPart {
  tag: string;
  /** Node whose world position is the part's aim point. */
  node: THREE.Object3D;
  radius: number;
  /** Damage multiplier for normal shots (crit paths read weakPoint). */
  damageMultiplier: number;
  /** Weak point: Precision Aim crits here; highlighted while active. */
  weakPoint: boolean;
  /** Inactive parts can't be targeted (e.g. tongue bulb retracted). */
  active: boolean;
  /** Hard override: shots here always deal exactly this (frog body = 1). */
  flatDamageOverride?: number;
}

export interface BattleContext {
  playerPos: THREE.Vector3;
  playerIFrames: boolean;
  colliders: readonly Collider[];
  dealDamageToPlayer(amount: number): void;
}

// Base battle-mode enemy: HP, targetable parts, telegraphed-attack FSM left
// to subclasses. (World-sim wander/faction AI arrives with worldAI.ts.)
export abstract class Enemy {
  readonly object = new THREE.Group();
  abstract readonly displayName: string;
  faction = 'chimera';
  maxHp = 40;
  hp = 40;
  dead = false;
  parts: EnemyPart[] = [];
  radius = 0.5;

  private hurtFlash = 0;
  private flashables: THREE.MeshLambertMaterial[] = [];

  /** Collect materials that should flash on hit. Call after building meshes. */
  protected registerFlashMaterials(): void {
    this.flashables = [];
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
        this.flashables.push(mesh.material as THREE.MeshLambertMaterial);
      }
    });
  }

  takeHit(amount: number, part: EnemyPart | null): number {
    const dealt = part?.flatDamageOverride ?? amount * (part?.damageMultiplier ?? 1);
    this.hp = Math.max(0, this.hp - dealt);
    this.hurtFlash = 0.18;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath();
    }
    return dealt;
  }

  protected onDeath(): void {
    // Default: crumple. Subclasses can animate; battle removes the object.
    this.object.rotation.z = Math.PI / 2;
    this.object.position.y = 0;
  }

  /** Runs on gameDt — frozen during the ATB pause. */
  abstract updateBattle(gameDt: number, ctx: BattleContext): void;

  /** Runs on realDt — hurt flash decay etc. */
  updateAlways(realDt: number): void {
    if (this.hurtFlash > 0) {
      this.hurtFlash -= realDt;
      const on = this.hurtFlash > 0 && Math.floor(this.hurtFlash * 30) % 2 === 0;
      for (const m of this.flashables) m.emissive.setHex(on ? 0x883333 : 0x000000);
    }
  }
}
