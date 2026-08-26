export type ItemId =
  // components
  | 'bottle' | 'rag' | 'alcohol' | 'sprayCan' | 'lighter' | 'scrap'
  // tools/weapons
  | 'fireAxe'
  // crafted
  | 'bandage' | 'molotov' | 'flamethrower'
  // consumables / ammo
  | 'ammo9' | 'medkit'
  // baubles (pawnshop currency)
  | 'pocketWatch' | 'pearlNecklace' | 'ring' | 'silverware'
  // 1998 nostalgia baubles (also pawnable)
  | 'pager' | 'durpy' | 'beanBuddy' | 'pocketPal' | 'vhsSinkingShip' | 'cdHeartGoes'
  | 'blueDress'
  // keepsakes: cannot be sold, spent, or lost
  | 'katsCard';

export type ItemCategory = 'component' | 'crafted' | 'consumable' | 'ammo' | 'bauble' | 'keepsake';

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
  scrap: {
    id: 'scrap', name: 'Scrap Parts', category: 'component',
    desc: 'Bolts, brackets, a length of good wire. Every car in town is an organ donor now.',
  },
  fireAxe: {
    id: 'fireAxe', name: 'Fire Axe', category: 'crafted',
    desc: 'IN CASE OF EMERGENCY, BREAK GLASS. Somebody finally agreed this counts.',
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
  pager: {
    id: 'pager', name: 'PageMate Pager', category: 'bauble',
    desc: '407-555-2689. Somebody still pages it every hour, on the hour. Exactly on the hour.',
  },
  durpy: {
    id: 'durpy', name: 'Durpy', category: 'bauble',
    desc: 'Batteries dying. It has started saying a word nobody taught it.',
  },
  beanBuddy: {
    id: 'beanBuddy', name: 'Bean Buddy (Rare?)', category: 'bauble',
    desc: 'Tag protector intact. The tag promised it would be valuable someday. Someday was cancelled.',
  },
  pocketPal: {
    id: 'pocketPal', name: 'Pocket Pal', category: 'bauble',
    desc: 'It starved on the 20th. It beeps anyway. It forgives you.',
  },
  vhsSinkingShip: {
    id: 'vhsSinkingShip', name: 'SINKING SHIP (Tape 2 of 2)', category: 'bauble',
    desc: 'BE KIND — REWIND. Nobody rewound. Nobody was kind. Late fee: $4.50 a night, forever.',
  },
  cdHeartGoes: {
    id: 'cdHeartGoes', name: '"My Heart Keeps Going" CD Single', category: 'bauble',
    desc: 'Saline Lyon. The song from the boat movie. Every radio still playing is playing it.',
  },
  blueDress: {
    id: 'blueDress', name: 'The Blue Dress', category: 'bauble',
    desc: 'Navy blue. Dry-clean only. It has been through something historic. The pawnbroker pays double and asks nothing.',
  },
  katsCard: {
    id: 'katsCard', name: 'Father\'s Day Card (unsigned)', category: 'keepsake',
    desc: 'She\'s carried it for three weeks. It isn\'t sealed. She hasn\'t signed it. Not for sale.',
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
