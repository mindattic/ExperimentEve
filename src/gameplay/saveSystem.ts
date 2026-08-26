import type { GameState } from './gameState';
import { Inventory, type ItemId } from './inventory';

const KEY = 'eve-save';

export interface SaveData {
  skills: GameState['skills'];
  unspentPoints: number;
  hp: number;
  maxHp: number;
  pe: number;
  ammoInClip: number;
  reserveAmmo: number;
  limit: number;
  flags: Record<string, boolean>;
  items: Partial<Record<ItemId, number>>;
  pos: [number, number];
}

export function saveGame(state: GameState, inv: Inventory, x: number, z: number): void {
  const items: Partial<Record<ItemId, number>> = {};
  for (const [def, n] of inv.entries()) items[def.id] = n;
  const data: SaveData = {
    skills: { ...state.skills },
    unspentPoints: state.unspentPoints,
    hp: state.hp,
    maxHp: state.maxHp,
    pe: state.pe,
    ammoInClip: state.ammoInClip,
    reserveAmmo: state.reserveAmmo,
    limit: state.limit,
    flags: { ...state.flags },
    items,
    pos: [x, z],
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
  state.recomputeDerived();
  state.hp = data.hp;
  state.pe = data.pe;
  state.ammoInClip = data.ammoInClip;
  state.reserveAmmo = data.reserveAmmo;
  state.limit = data.limit;
  state.flags = { ...data.flags };
  for (const [id, n] of Object.entries(data.items)) {
    if (n && n > 0) inv.add(id as ItemId, n);
  }
}
