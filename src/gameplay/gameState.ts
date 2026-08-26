import type { InfusionId } from './infusions';
import { ITEMS, GUN_STATS, DUTY_PISTOL, type GearSlot, type ItemId, type GunStats } from './inventory';

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

  /** Unlockable abilities, bought with skill points at a lighthouse. */
  abilities = { rapidFire: false };

  /** Chimeric DNA infusions unlocked by injectors — biology, not magic. */
  infusions: Record<InfusionId, boolean> = {
    combustion: false, cryostasis: false, neuroelectric: false, mitosis: false, metabolicBurn: false,
  };

  /** Metabolic Burn: seconds of redlined metabolism remaining. */
  hasteTimer = 0;

  /** Worn clothes. Armor in Kingsport is denim and borrowed shirts. */
  equipped: Partial<Record<GearSlot, ItemId>> = {};

  /** Total incoming-damage reduction from worn gear (capped — it's cloth). */
  get armorFraction(): number {
    let a = 0;
    for (const id of Object.values(this.equipped)) {
      if (id) a += ITEMS[id].armor ?? 0;
    }
    return Math.min(0.3, a);
  }

  level = 1;
  xp = 0;

  /** XP needed to clear the current level. */
  get xpToNext(): number {
    return 100 * this.level;
  }

  /**
   * Grant XP; levels resolve immediately (points spend at a lighthouse).
   * Returns how many levels were gained.
   */
  addXp(amount: number): number {
    this.xp += amount;
    let ups = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.unspentPoints += 2;
      ups++;
    }
    return ups;
  }

  /** The cats can tell. Strength reads as safety. */
  get catsTrust(): boolean {
    return this.level >= 3;
  }

  /** Species whose weak points she's learned (they glow on sight now). */
  knownWeaknesses: string[] = [];

  /** Record a discovery; returns true if it was new. */
  learnWeakness(species: string): boolean {
    if (this.knownWeaknesses.includes(species)) return false;
    this.knownWeaknesses.push(species);
    return true;
  }

  maxHp = 80;
  hp = 80;

  maxPe = 100;
  pe = 40;
  peRegenPerSec = 2.5;

  ammoInClip = 8;
  reserveAmmo = 0;

  // ---- the gun in her hands (tinkering: wield / strip / install) --------
  /** Which gun is wielded: an inventory gun id, or her own duty pistol. */
  weaponId: ItemId | 'dutyPistol' = 'dutyPistol';
  /** Permanent installed mods — they move with her, not with the gun. */
  mods = { damage: 0, clip: 0, action: 0, grip: 0 };

  get weapon(): GunStats {
    return this.weaponId === 'dutyPistol' ? DUTY_PISTOL : (GUN_STATS[this.weaponId] ?? DUTY_PISTOL);
  }

  get clipSize(): number {
    return this.weapon.clip + this.mods.clip * 4;
  }

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
    return 0.16 * (1 + this.skills.speed * 0.06) * (this.hasteTimer > 0 ? 1.7 : 1)
      * this.weapon.atbMult * (1 + this.mods.grip * 0.1);
  }

  get moveSpeed(): number {
    return 4.0 * (1 + this.skills.speed * 0.03);
  }

  get gunDamage(): number {
    return this.weapon.damage + this.skills.damage * 1.5 + this.mods.damage * 3;
  }

  get reloadSeconds(): number {
    return 1.6 * this.weapon.reloadMult
      * Math.max(0.25, (1 - this.skills.reload * 0.07) * Math.pow(0.7, this.mods.action));
  }

  /** Move rounds from reserve into the clip. Returns rounds loaded. */
  reload(): number {
    const need = Math.min(this.clipSize - this.ammoInClip, this.reserveAmmo);
    this.ammoInClip += need;
    this.reserveAmmo -= need;
    return need;
  }

  addLimit(amount: number): void {
    this.limit = Math.min(100, this.limit + amount);
  }

  regen(gameDt: number): void {
    this.pe = Math.min(this.maxPe, this.pe + (this.peRegenPerSec + this.peRegenBonus) * gameDt);
    this.hasteTimer = Math.max(0, this.hasteTimer - gameDt);
  }

  damagePlayer(amount: number): void {
    const taken = amount * (1 - this.armorFraction);
    this.hp = Math.max(0, this.hp - taken);
    this.addLimit(taken * 0.8);
  }

  /** Lab-coat pockets: a working doctor regenerates PE faster. */
  get peRegenBonus(): number {
    return this.equipped.torso === 'labCoat' ? 1.5 : 0;
  }
}
