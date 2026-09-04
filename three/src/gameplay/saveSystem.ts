import type { GameState } from './gameState';
import { Inventory, type ItemId } from './inventory';

const KEY = 'eve-save';

export interface SaveData {
  skills: GameState['skills'];
  unspentPoints: number;
  level?: number;
  xp?: number;
  abilities?: GameState['abilities'];
  infusions?: GameState['infusions'];
  equipped?: GameState['equipped'];
  weaponId?: GameState['weaponId'];
  mods?: GameState['mods'];
  knownWeaknesses?: string[];
  hp: number;
  maxHp: number;
  pe: number;
  ammoInClip: number;
  reserveAmmo: number;
  limit: number;
  flags: Record<string, boolean>;
  items: Partial<Record<ItemId, number>>;
  pos: [number, number];
  /** Seconds since 8:00 PM — the night is part of the save. */
  clockElapsed: number;
}

export function saveGame(
  state: GameState,
  inv: Inventory,
  x: number,
  z: number,
  clockElapsed = 0,
): void {
  const items: Partial<Record<ItemId, number>> = {};
  for (const [def, n] of inv.entries()) items[def.id] = n;
  const data: SaveData = {
    skills: { ...state.skills },
    unspentPoints: state.unspentPoints,
    level: state.level,
    xp: state.xp,
    abilities: { ...state.abilities },
    infusions: { ...state.infusions },
    equipped: { ...state.equipped },
    weaponId: state.weaponId,
    mods: { ...state.mods },
    knownWeaknesses: [...state.knownWeaknesses],
    hp: state.hp,
    maxHp: state.maxHp,
    pe: state.pe,
    ammoInClip: state.ammoInClip,
    reserveAmmo: state.reserveAmmo,
    limit: state.limit,
    flags: { ...state.flags },
    items,
    pos: [x, z],
    clockElapsed,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode etc.) — the run just isn't persisted.
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadGame() !== null;
}

export function applySave(data: SaveData, state: GameState, inv: Inventory): void {
  state.skills = { ...data.skills };
  state.unspentPoints = data.unspentPoints;
  state.level = data.level ?? 1;
  state.xp = data.xp ?? 0;
  state.abilities = { rapidFire: false, taunt: false, kneeSlide: false, ...data.abilities };
  state.infusions = { ...state.infusions, ...data.infusions };
  state.equipped = { ...data.equipped };
  state.weaponId = data.weaponId ?? 'dutyPistol';
  state.mods = { damage: 0, clip: 0, action: 0, grip: 0, ...data.mods };
  state.knownWeaknesses = [...(data.knownWeaknesses ?? [])];
  state.recomputeDerived();
  state.hp = data.hp;
  state.pe = data.pe;
  state.ammoInClip = Math.min(data.ammoInClip, state.clipSize);
  state.reserveAmmo = data.reserveAmmo;
  state.limit = data.limit;
  state.flags = { ...data.flags };
  for (const [id, n] of Object.entries(data.items)) {
    if (n && n > 0) inv.add(id as ItemId, n);
  }
}
