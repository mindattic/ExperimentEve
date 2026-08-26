import type { ItemId } from './inventory';

export type RoomType = 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'street' | 'garage';
export type ContainerType =
  | 'nightstand' | 'dresser' | 'cabinet' | 'sink' | 'closet' | 'shelf' | 'trash' | 'workbench';

export interface LootRoll {
  item: ItemId;
  min: number;
  max: number;
  chance: number;
}

// Contextual loot: the right things live in the right places. Keyed
// room:container with container-only fallback.
const LOOT: Record<string, LootRoll[]> = {
  'bedroom:nightstand': [
    { item: 'ammo9', min: 4, max: 8, chance: 0.6 },
    { item: 'ring', min: 1, max: 1, chance: 0.25 },
    { item: 'pocketWatch', min: 1, max: 1, chance: 0.2 },
  ],
  'bedroom:dresser': [
    { item: 'pearlNecklace', min: 1, max: 1, chance: 0.22 },
    { item: 'rag', min: 1, max: 2, chance: 0.65 },
  ],
  'bedroom:closet': [
    { item: 'ammo9', min: 4, max: 6, chance: 0.45 },
    { item: 'rag', min: 1, max: 2, chance: 0.5 },
  ],
  'bathroom:cabinet': [
    { item: 'alcohol', min: 1, max: 1, chance: 0.55 },
    { item: 'medkit', min: 1, max: 1, chance: 0.22 },
    { item: 'bandage', min: 1, max: 1, chance: 0.3 },
  ],
  'kitchen:sink': [
    { item: 'alcohol', min: 1, max: 1, chance: 0.45 },
    { item: 'bottle', min: 1, max: 2, chance: 0.7 },
  ],
  'living:shelf': [
    { item: 'bottle', min: 1, max: 1, chance: 0.4 },
    { item: 'silverware', min: 1, max: 1, chance: 0.3 },
    { item: 'pocketWatch', min: 1, max: 1, chance: 0.15 },
  ],
  'street:trash': [
    { item: 'bottle', min: 1, max: 2, chance: 0.55 },
    { item: 'rag', min: 1, max: 1, chance: 0.4 },
  ],
  'garage:workbench': [
    { item: 'sprayCan', min: 1, max: 1, chance: 0.5 },
    { item: 'rag', min: 1, max: 2, chance: 0.6 },
  ],
  ':trash': [
    { item: 'bottle', min: 1, max: 1, chance: 0.5 },
  ],
};

export type InteractKind = 'container' | 'salvage' | 'inspect' | 'save' | 'pickup';

export interface InteractableDef {
  id: string;
  x: number;
  z: number;
  radius?: number;
  prompt: string;
  kind: InteractKind;
  roomType?: RoomType;
  containerType?: ContainerType;
  /** inspect: line shown; pickup: items granted. */
  inspectText?: string;
  grants?: { item: ItemId; n: number }[];
  once?: boolean;
}

export interface Interactable extends InteractableDef {
  radius: number;
  used: boolean;
}

export function makeInteractable(def: InteractableDef): Interactable {
  return { radius: 1.1, once: true, ...def, used: false };
}

let seed = 12345;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

export function rollLoot(i: Interactable): { item: ItemId; n: number }[] {
  const key = `${i.roomType ?? ''}:${i.containerType ?? ''}`;
  const table = LOOT[key] ?? LOOT[`:${i.containerType ?? ''}`] ?? [];
  const out: { item: ItemId; n: number }[] = [];
  for (const roll of table) {
    if (rand() <= roll.chance) {
      out.push({ item: roll.item, n: roll.min + Math.floor(rand() * (roll.max - roll.min + 1)) });
    }
  }
  return out;
}
