import * as THREE from 'three';
import type { Collider } from '../physics/colliders';
import { makePS1Material } from '../render/ps1/ps1Material';

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

  protected hurtFlash = 0;
  private flashables: THREE.MeshLambertMaterial[] = [];

  // ---- learned weaknesses: weak points glow only once she's drawn blood --
  weaknessRevealed = false;
  private weakGlowT = Math.random() * 10;
  private weakGlowMats: THREE.MeshLambertMaterial[] = [];
  protected addRecentDamage(amount: number): void {
    this.recentDamage += amount;
    if (!this.stunned && this.recentDamage >= Math.max(30, this.maxHp * 0.35)) {
      this.stun(2.2);
    }
  }

  /**
   * First hit teaches: from then on every weak-point part pulses hot so the
   * player can aim at what they've learned. Idempotent; re-collects parts
   * (so tumors grown later glow too).
   */
  revealWeakness(): void {
    this.weaknessRevealed = true;
    this.weakGlowMats = [];
    for (const p of this.parts) {
      if (!p.weakPoint) continue;
      p.node.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (m?.isMeshLambertMaterial) this.weakGlowMats.push(m);
      });
    }
  }

  // ---- stun: sustained rapid damage (or a crit) staggers anything --------
  private stunTimer = 0;
  private recentDamage = 0;

  get stunned(): boolean {
    return this.stunTimer > 0;
  }

  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
  }

  /**
   * Tick stun bookkeeping (battle calls this before updateBattle and skips
   * the FSM while it returns true). Recent-damage memory bleeds off fast.
   */
  tickStun(gameDt: number): boolean {
    this.recentDamage = Math.max(0, this.recentDamage - gameDt * 14);
    if (this.stunTimer > 0) {
      this.stunTimer -= gameDt;
      // Dazed judder.
      this.object.rotation.y += Math.sin(this.stunTimer * 26) * 0.05;
      if (this.stunTimer <= 0) this.recentDamage = 0;
      return true;
    }
    return false;
  }

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
    const dealt = Math.round(part?.flatDamageOverride ?? amount * (part?.damageMultiplier ?? 1));
    this.hp = Math.max(0, this.hp - dealt);
    this.hurtFlash = 0.18;
    // Rapid damage staggers: soak enough in a short window and stun.
    this.addRecentDamage(dealt);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath();
    }
    return dealt;
  }

  /**
   * MITOSIS: force a tumorous wound to bloom — a new weak-point part.
   * Bursting it rides the normal weak-point rules: crit floater + stagger.
   */
  growTumor(): void {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 5, 4),
      makePS1Material({ color: 0xc06a7a }),
    );
    node.position.set(
      (Math.random() - 0.5) * 0.5,
      0.5 + Math.random() * 0.7,
      (Math.random() - 0.5) * 0.5,
    );
    node.scale.set(1, 0.8, 1.1);
    this.object.add(node);
    this.parts.push({ tag: 'tumor', node, radius: 0.22, damageMultiplier: 4, weakPoint: true, active: true });
    this.registerFlashMaterials();
    // A grown tumor announces itself — that's the whole point of growing it.
    this.revealWeakness();
  }

  protected onDeath(): void {
    // Default: crumple. Subclasses can animate; battle removes the object.
    this.object.rotation.z = Math.PI / 2;
    this.object.position.y = 0;
  }

  /** Runs on gameDt — frozen during the ATB pause. */
  abstract updateBattle(gameDt: number, ctx: BattleContext): void;

  /** Runs on realDt — hurt flash decay, weak-point glow. */
  updateAlways(realDt: number): void {
    if (this.hurtFlash > 0) {
      this.hurtFlash -= realDt;
      const on = this.hurtFlash > 0 && Math.floor(this.hurtFlash * 30) % 2 === 0;
      for (const m of this.flashables) m.emissive.setHex(on ? 0x883333 : 0x000000);
    }
    // Learned weak points pulse hot — written after the flash so it wins.
    if (this.weaknessRevealed && !this.dead && this.weakGlowMats.length > 0) {
      this.weakGlowT += realDt;
      const k = 0.45 + Math.sin(this.weakGlowT * 6) * 0.3;
      for (const m of this.weakGlowMats) m.emissive.setRGB(k, k * 0.45, k * 0.12);
    }
  }
}
