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
  /** Soulsborne-style flavor: ominous, oblique, lore-bearing. */
  desc: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  bottle: {
    id: 'bottle', name: 'Glass Bottle', category: 'component',
    desc: 'Green glass, unbroken. Rare, now — most ended their lives against something\'s carapace.',
  },
  rag: {
    id: 'rag', name: 'Rag', category: 'component',
    desc: 'Torn from a curtain, a shirt, a banner. The town is full of cloth nobody is coming back for.',
  },
  alcohol: {
    id: 'alcohol', name: 'Rubbing Alcohol', category: 'component',
    desc: 'The label promises purity. After the Experiment, everyone read labels very carefully.',
  },
  sprayCan: {
    id: 'sprayCan', name: 'Spray Paint Can', category: 'component',
    desc: 'Half-used. SOAK and REN empty hundreds of these arguing about salvation. Neither has stopped to fight the monsters.',
  },
  lighter: {
    id: 'lighter', name: 'Lighter', category: 'component',
    desc: 'A stranger\'s initials, scratched out. Fire still answers to anyone.',
  },
  bandage: {
    id: 'bandage', name: 'Bandage', category: 'consumable',
    desc: 'Alcohol-soaked cloth. Field medicine from a place that dismantled its hospitals first.',
  },
  molotov: {
    id: 'molotov', name: 'Molotov', category: 'crafted',
    desc: 'A bottle that gets to be a protest again.',
  },
  flamethrower: {
    id: 'flamethrower', name: 'Makeshift Flamethrower', category: 'crafted',
    desc: 'A stencil artist\'s diagram, made real. Designed to paint over things permanently.',
  },
  ammo9: {
    id: 'ammo9', name: '9mm Rounds', category: 'ammo',
    desc: 'Somebody\'s nightstand insurance. Toward the end, boxes like this outnumbered canned food.',
  },
  medkit: {
    id: 'medkit', name: 'First-Aid Kit', category: 'consumable',
    desc: 'Erasure issue. The seal is civilian-proof. The contents were never meant for civilians.',
  },
  pocketWatch: {
    id: 'pocketWatch', name: 'Pocket Watch', category: 'bauble',
    desc: 'Stopped at 6:47. They all stopped at 6:47.',
  },
  pearlNecklace: {
    id: 'pearlNecklace', name: 'Pearl Necklace', category: 'bauble',
    desc: 'Still warm, somehow. The pawnbroker pays in bullets and doesn\'t meet your eyes.',
  },
  ring: {
    id: 'ring', name: 'Gold Ring', category: 'bauble',
    desc: 'An inscription inside the band: \'til it\'s over.',
  },
  silverware: {
    id: 'silverware', name: 'Silverware', category: 'bauble',
    desc: 'A full set. The table was laid for four when they stopped eating.',
  },
};

export interface Recipe {
  inputs: ItemId[];
  output: ItemId;
  line: string;
  /** Needs a found blueprint before it can be crafted (a-ha drip). */
  needsBlueprint?: boolean;
}

// RE-style combine. Lighter survives the flamethrower build conceptually but
// is consumed into the weapon (it IS the ignition).
export const RECIPES: Recipe[] = [
  {
    inputs: ['sprayCan', 'lighter'],
    output: 'flamethrower',
    line: 'Spray can, lighter, bad intentions: flamethrower.',
    needsBlueprint: true, // SOAK's stencil diagram teaches it
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
  /** Outputs whose blueprints have been found. */
  readonly blueprints = new Set<ItemId>();

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

  /**
   * Try every recipe whose inputs match; craft the first allowed match.
   * Returns 'locked' when the parts fit but the blueprint is missing.
   */
  tryCombine(chosen: ItemId[]): Recipe | 'locked' | null {
    const sorted = [...chosen].sort();
    for (const r of RECIPES) {
      const need = [...r.inputs].sort();
      if (need.length === sorted.length && need.every((v, i) => v === sorted[i])) {
        if (r.needsBlueprint && !this.blueprints.has(r.output)) return 'locked';
        if (!need.every((id) => this.count(id) > 0)) return null;
        for (const id of need) this.remove(id);
        this.add(r.output);
        return r;
      }
    }
    return null;
  }
}
