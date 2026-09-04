import type { ItemId } from './inventory';

// The "magic system": no magic anywhere in it. Chimeric DNA infusions —
// body functions pushed past their limits. Each school is a real biological
// process gone wrong on purpose, delivered by injector (found, gifted,
// bought, or crafted). Kat doesn't cast; she doses.

export type InfusionId = 'combustion' | 'cryostasis' | 'neuroelectric' | 'mitosis' | 'metabolicBurn';

export interface InfusionDef {
  id: InfusionId;
  name: string;
  peCost: number;
  injector: ItemId;
  /** Battle-menu row (cost is appended by the menu). */
  menuLabel: string;
  /** Shown once, on injection. */
  unlockLine: string;
}

export const INFUSIONS: Record<InfusionId, InfusionDef> = {
  combustion: {
    id: 'combustion', name: 'Combustion', peCost: 25, injector: 'injCombustion',
    menuLabel: 'Combustion',
    unlockLine: 'Runaway ATP oxidation. Her hands are warm now. They stay warm.',
  },
  cryostasis: {
    id: 'cryostasis', name: 'Cryostasis', peCost: 20, injector: 'injCryostasis',
    menuLabel: 'Cryostasis',
    unlockLine: 'Not ice — theft. She can pull the heat out of a living thing.',
  },
  neuroelectric: {
    id: 'neuroelectric', name: 'Neuroelectric', peCost: 30, injector: 'injNeuroelectric',
    menuLabel: 'Neuroelectric',
    unlockLine: 'Every nerve is a wire. Wires can be crossed.',
  },
  mitosis: {
    id: 'mitosis', name: 'Mitosis', peCost: 25, injector: 'injMitosis',
    menuLabel: 'Mitosis',
    unlockLine: 'Growth on command. Somewhere to aim. She tries not to think about it.',
  },
  metabolicBurn: {
    id: 'metabolicBurn', name: 'Metabolic Burn', peCost: 20, injector: 'injMetabolic',
    menuLabel: 'Metabolic Burn',
    unlockLine: 'Her own metabolism, redlined. Fast now; hungry forever.',
  },
};

export const INFUSION_LIST = Object.values(INFUSIONS);

/** Injector item id -> infusion, for the inventory "use" path. */
export function infusionForInjector(item: ItemId): InfusionDef | null {
  return INFUSION_LIST.find((d) => d.injector === item) ?? null;
}
