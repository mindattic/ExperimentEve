export interface SkillPoints {
  health: number;
  speed: number;
  damage: number;
  reload: number;
}

// Single source of truth for the run: HP/PE/ammo/limit, skill points, story
// flags, inventory. Derived stats recompute from skill points.
export class GameState {
  skills: SkillPoints = { health: 0, speed: 0, damage: 0, reload: 0 };
  unspentPoints = 0;

  maxHp = 80;
  hp = 80;

  maxPe = 100;
  pe = 40;
  peRegenPerSec = 2.5;

  clipSize = 8;
  ammoInClip = 8;
  reserveAmmo = 0;

  /** Limit gauge 0..100; full enables Precision Aim. */
  limit = 0;

  flags: Record<string, boolean> = {};
  inventory: string[] = [];

  recomputeDerived(): void {
    const prevMax = this.maxHp;
    this.maxHp = 80 + this.skills.health * 12;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - prevMax));
  }

  get atbRatePerSec(): number {
    return 0.16 * (1 + this.skills.speed * 0.06);
  }

  get moveSpeed(): number {
    return 4.0 * (1 + this.skills.speed * 0.03);
  }

  get gunDamage(): number {
    return 10 + this.skills.damage * 1.5;
  }

  get reloadSeconds(): number {
    return 1.6 * Math.max(0.4, 1 - this.skills.reload * 0.07);
  }

  addLimit(amount: number): void {
    this.limit = Math.min(100, this.limit + amount);
  }

  regen(gameDt: number): void {
    this.pe = Math.min(this.maxPe, this.pe + this.peRegenPerSec * gameDt);
  }

  damagePlayer(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.addLimit(amount * 0.8);
  }
}
