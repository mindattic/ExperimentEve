export type ItemId =
  // components
  | 'bottle' | 'rag' | 'alcohol' | 'sprayCan' | 'lighter'
  // crafted
  | 'bandage' | 'molotov' | 'flamethrower'
  // consumables / ammo
  | 'ammo9' | 'medkit'
  // baubles (pawnshop currency)
  | 'pocketWatch' | 'pearlNecklace' | 'ring' | 'silverware';

export type ItemCategory = 'component' | 'crafted' | 'consumable' | 'ammo' | 'bauble';

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  bottle: { id: 'bottle', name: 'Glass Bottle', category: 'component' },
  rag: { id: 'rag', name: 'Rag', category: 'component' },
  alcohol: { id: 'alcohol', name: 'Rubbing Alcohol', category: 'component' },
  sprayCan: { id: 'sprayCan', name: 'Spray Paint Can', category: 'component' },
  lighter: { id: 'lighter', name: 'Lighter', category: 'component' },
  bandage: { id: 'bandage', name: 'Bandage', category: 'consumable' },
  molotov: { id: 'molotov', name: 'Molotov', category: 'crafted' },
  flamethrower: { id: 'flamethrower', name: 'Makeshift Flamethrower', category: 'crafted' },
  ammo9: { id: 'ammo9', name: '9mm Rounds', category: 'ammo' },
  medkit: { id: 'medkit', name: 'First-Aid Kit', category: 'consumable' },
  pocketWatch: { id: 'pocketWatch', name: 'Pocket Watch', category: 'bauble' },
  pearlNecklace: { id: 'pearlNecklace', name: 'Pearl Necklace', category: 'bauble' },
  ring: { id: 'ring', name: 'Gold Ring', category: 'bauble' },
  silverware: { id: 'silverware', name: 'Silverware', category: 'bauble' },
};

export interface Recipe {
  inputs: ItemId[];
  output: ItemId;
  line: string;
}

// RE-style combine. Lighter survives the flamethrower build conceptually but
// is consumed into the weapon (it IS the ignition).
export const RECIPES: Recipe[] = [
  {
    inputs: ['sprayCan', 'lighter'],
    output: 'flamethrower',
    line: 'Spray can, lighter, bad intentions: flamethrower.',
  },
  {
    inputs: ['bottle', 'rag', 'alcohol'],
    output: 'molotov',
    line: 'Bottle, rag, alcohol. Cocktail hour.',
  },
  {
    inputs: ['rag', 'alcohol'],
    output: 'bandage',
    line: 'Clean-ish rag, alcohol. Field medicine.',
  },
];

export class Inventory {
  private readonly counts = new Map<ItemId, number>();

  count(id: ItemId): number {
    return this.counts.get(id) ?? 0;
  }

  add(id: ItemId, n = 1): void {
    this.counts.set(id, this.count(id) + n);
  }

  remove(id: ItemId, n = 1): boolean {
    if (this.count(id) < n) return false;
    this.counts.set(id, this.count(id) - n);
    return true;
  }

  entries(): [ItemDef, number][] {
    return [...this.counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([id, n]) => [ITEMS[id], n]);
  }

  /** Try every recipe whose inputs are all present; craft the first match. */
  tryCombine(chosen: ItemId[]): Recipe | null {
    const sorted = [...chosen].sort();
    for (const r of RECIPES) {
      const need = [...r.inputs].sort();
      if (need.length === sorted.length && need.every((v, i) => v === sorted[i])) {
        if (!need.every((id) => this.count(id) > 0)) return null;
        for (const id of need) this.remove(id);
        this.add(r.output);
        return r;
      }
    }
    return null;
  }
}
