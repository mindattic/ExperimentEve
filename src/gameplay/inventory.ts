export type ItemId =
  // components
  | 'bottle' | 'rag' | 'alcohol' | 'sprayCan' | 'lighter' | 'scrap'
  // tools/weapons
  | 'fireAxe' | 'bobbyPin'
  // crafted
  | 'bandage' | 'molotov' | 'flamethrower' | 'smokeBomb'
  // consumables / ammo
  | 'ammo9' | 'medkit'
  // chimeric DNA injectors (the "magic system" — biology at gunpoint)
  | 'injCombustion' | 'injCryostasis' | 'injNeuroelectric' | 'injMitosis' | 'injMetabolic'
  // baubles (pawnshop currency)
  | 'pocketWatch' | 'pearlNecklace' | 'ring' | 'silverware'
  // 1998 nostalgia baubles (also pawnable)
  | 'pager' | 'durpy' | 'beanBuddy' | 'pocketPal' | 'vhsSinkingShip' | 'cdHeartGoes'
  | 'blueDress'
  // gear: armor is just normal clothes. Kat is an ER doctor, not a knight.
  | 'labCoat' | 'yellowVest' | 'puffyShirt' | 'denimPants'
  // guns (all 9mm-fed in the slice) and the parts stripped out of them
  | 'gunSnub' | 'gunErasure' | 'gunLongslide'
  | 'partBarrel' | 'partMag' | 'partAction' | 'partGrip'
  // skill tapes: watch them on a TV/VCR combo to learn what they teach
  | 'tapeOpenHand' | 'tapeCarpetBurn'
  // keepsakes: cannot be sold, spent, or lost
  | 'katsCard';

export type ItemCategory = 'component' | 'crafted' | 'consumable' | 'ammo' | 'bauble' | 'gear' | 'gun' | 'gunPart' | 'tape' | 'keepsake';

export type GearSlot = 'torso' | 'legs';

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  /** Soulsborne-style flavor: ominous, oblique, lore-bearing. */
  desc: string;
  /** gear only: where it's worn. */
  slot?: GearSlot;
  /** gear only: fraction of incoming damage absorbed. */
  armor?: number;
  /** gear only: line Kat says when she puts it on. */
  equipLine?: string;
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
  bobbyPin: {
    id: 'bobbyPin', name: 'Bobby Pin', category: 'crafted',
    desc: 'Bent just so. Every locked thing in this town is somebody\'s last drawer. It opens anyway.',
  },
  bandage: {
    id: 'bandage', name: 'Bandage', category: 'consumable',
    desc: 'Alcohol-soaked cloth. Field medicine from a place that dismantled its hospitals first.',
  },
  molotov: {
    id: 'molotov', name: 'Molotov', category: 'crafted',
    desc: 'A bottle that gets to be a protest again.',
  },
  smokeBomb: {
    id: 'smokeBomb', name: 'Smoke Bomb', category: 'crafted',
    desc: 'Half a can of paint and a rag fuse. SOAK calls this "instant weather." Everything in the cloud loses her.',
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
  injCombustion: {
    id: 'injCombustion', name: 'Injector: COMBUSTION', category: 'consumable',
    desc: 'Chimeric DNA in a field syringe. The label warns of "spontaneous oxidation events." Someone underlined "events."',
  },
  injCryostasis: {
    id: 'injCryostasis', name: 'Injector: CRYOSTASIS', category: 'consumable',
    desc: 'The serum is cold. It has always been cold. It will make other things cold.',
  },
  injNeuroelectric: {
    id: 'injNeuroelectric', name: 'Injector: NEUROELECTRIC', category: 'consumable',
    desc: 'Labeled in grease pencil, recently. Somebody who watches wanted her to have this.',
  },
  injMitosis: {
    id: 'injMitosis', name: 'Injector: MITOSIS', category: 'consumable',
    desc: 'Growth, bottled. The payroll box it was locked in suggests it was worth more than the payroll.',
  },
  injMetabolic: {
    id: 'injMetabolic', name: 'Injector: METABOLIC BURN', category: 'consumable',
    desc: 'The pawnbroker had one. He would not say where from. He would not say why he kept the fridge running.',
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
  gunSnub: {
    id: 'gunSnub', name: '.38 Snub (rechambered)', category: 'gun',
    desc: 'Rechambered for 9mm by someone with more nerve than tooling. Light, quick, five shots of commitment.',
  },
  gunErasure: {
    id: 'gunErasure', name: 'Erasure Sidearm', category: 'gun',
    desc: 'Government issue, serial filed by the government. Twelve rounds. The magazine assumes you will miss.',
  },
  gunLongslide: {
    id: 'gunLongslide', name: 'Longslide 9mm', category: 'gun',
    desc: 'Competition iron from the sporting-goods cage. Heavy, slow, and it does not miss so much as decline.',
  },
  partBarrel: {
    id: 'partBarrel', name: 'Rifled Barrel', category: 'gunPart',
    desc: 'Match-grade. Stripped from something that deserved better. +3 damage, installed.',
  },
  partMag: {
    id: 'partMag', name: 'Extended Magazine', category: 'gunPart',
    desc: 'Holds four more chances. +4 clip, installed.',
  },
  partAction: {
    id: 'partAction', name: 'Polished Action', category: 'gunPart',
    desc: 'Somebody\'s thousand hours of dry-firing, inherited. -30% reload, installed.',
  },
  partGrip: {
    id: 'partGrip', name: 'Skeleton Grip', category: 'gunPart',
    desc: 'Drilled out for weight. The gun stops arguing with her hands. +ATB, installed.',
  },
  labCoat: {
    id: 'labCoat', name: 'Lab Coat', category: 'gear', slot: 'torso', armor: 0.05,
    desc: 'KATHERINE WEISS, M.D. — EMERGENCY MEDICINE. She left in it. The pockets still work; that\'s most of medicine.',
    equipLine: 'Dr. Weiss, rounding. God help the patients.',
  },
  yellowVest: {
    id: 'yellowVest', name: 'Yellow Vest', category: 'gear', slot: 'torso', armor: 0.08,
    desc: 'Road-crew hi-vis. The night can see her coming from anywhere. Nothing out here needed the help.',
    equipLine: 'Safety first.',
  },
  puffyShirt: {
    id: 'puffyShirt', name: 'Puffy Shirt', category: 'gear', slot: 'torso', armor: 0.12,
    desc: 'Enormous billowing sleeves. Whoever owned it was on TV once, briefly, against their will.',
    equipLine: 'But I don\'t want to be a pirate!',
  },
  denimPants: {
    id: 'denimPants', name: 'Denim Pants', category: 'gear', slot: 'legs', armor: 0.08,
    desc: 'Stonewashed, bootcut, indestructible. The 90s built two things to last and this is both of them.',
    equipLine: 'These are somebody\'s good jeans.',
  },
  tapeOpenHand: {
    id: 'tapeOpenHand', name: 'PATHS OF THE OPEN HAND (VHS)', category: 'tape',
    desc: 'A kung-fu rental, rewound by nobody. The master beckons with four fingers and lets the fight come to him. Watch it on a working VCR.',
  },
  tapeCarpetBurn: {
    id: 'tapeCarpetBurn', name: 'CARPET BURN 2: BURN HARDER (VHS)', category: 'tape',
    desc: 'Direct-to-video. The hero spends forty minutes of runtime sliding on his knees, guns out. The knees are the special effect. Watch it on a working VCR.',
  },
  katsCard: {
    id: 'katsCard', name: 'Father\'s Day Card (unsigned)', category: 'keepsake',
    desc: 'She\'s carried it for three weeks. It isn\'t sealed. She hasn\'t signed it. Not for sale.',
  },
};

// ---- gun tinkering ------------------------------------------------------
// Wield any found gun; strip the ones you don't carry into their best part;
// install parts permanently on whatever you're holding. Unique combinations
// out of common iron — the tinkering IS the build.

export interface GunStats {
  name: string;
  damage: number;
  clip: number;
  /** Reload-time multiplier (heavier actions reload slower). */
  reloadMult: number;
  /** Portability: ATB-rate multiplier (heavy guns slow the bar). */
  atbMult: number;
  /** What stripping it yields. */
  strips: ItemId;
}

export const GUN_STATS: Partial<Record<ItemId, GunStats>> = {
  gunSnub: { name: '.38 Snub', damage: 13, clip: 5, reloadMult: 0.85, atbMult: 1.08, strips: 'partAction' },
  gunErasure: { name: 'Erasure Sidearm', damage: 12, clip: 12, reloadMult: 1.15, atbMult: 0.95, strips: 'partMag' },
  gunLongslide: { name: 'Longslide 9mm', damage: 16, clip: 6, reloadMult: 1.25, atbMult: 0.88, strips: 'partBarrel' },
};

/** Kat's arrival weapon — hers, not an item; strips to a grip if replaced. */
export const DUTY_PISTOL: GunStats = { name: 'Duty Pistol', damage: 10, clip: 8, reloadMult: 1, atbMult: 1, strips: 'partGrip' };

export interface Recipe {
  inputs: ItemId[];
  output: ItemId;
  line: string;
  /** Needs a found blueprint before it can be crafted (a-ha drip). */
  needsBlueprint?: boolean;
  /** Extra copies of the output beyond the first. */
  bonusCount?: number;
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
  {
    inputs: ['sprayCan', 'rag'],
    output: 'smokeBomb',
    line: 'Paint can, rag fuse. Instant weather.',
  },
  {
    inputs: ['scrap'],
    output: 'bobbyPin',
    line: 'A little wire, a little bend. Two pins, actually.',
    bonusCount: 1, // scrap yields 2 pins
  },
  {
    inputs: ['medkit', 'alcohol', 'scrap'],
    output: 'injCryostasis',
    line: 'Coolant chemistry, a clean needle, a steady hand. Cryostasis, home brew.',
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
        this.add(r.output, 1 + (r.bonusCount ?? 0));
        return r;
      }
    }
    return null;
  }
}
