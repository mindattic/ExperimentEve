// The run's single source of truth, scoped to what the core loop and the ATB
// battle actually need. Skill points, XP, infusions, worn gear and the bauble
// economy belong to EVEGDD Ch.8 and the stat menu; they are not modelled here
// yet rather than half-modelled.

export class GameState {
  maxHp = 80;
  hp = 80;

  /** Limit gauge 0..100; full unlocks Precision Aim. */
  limit = 0;

  clipSize = 8;
  ammoInClip = 8;
  reserveAmmo = 16;

  gunDamage = 10;
  reloadSeconds = 1.6;

  /** Fraction of the ATB gauge filled per second of game time. */
  atbRatePerSec = 0.42;

  /** Species whose weak points she's learned — they glow on sight now. */
  knownWeaknesses: string[] = [];

  flags: Record<string, boolean> = {};

  /** Record a discovery; true if it was new. */
  learnWeakness(species: string): boolean {
    if (this.knownWeaknesses.includes(species)) return false;
    this.knownWeaknesses.push(species);
    return true;
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

  damagePlayer(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    // Getting hurt fills the gauge: the comeback is the mechanic.
    this.addLimit(amount * 0.8);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
