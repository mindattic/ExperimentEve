import type { Enemy } from './enemyBase';
import { FrogChimera } from './frogBoss';
import { CrowSpider } from './spider';
import { RatGullChimera } from './dummyChimera';
import { Trashclaw } from './trashclaw';
import { SteepleBat } from './steepleBat';
import { Shellback } from './shellback';
import { StiltStag } from './stiltStag';
import { Quillspray } from './quillspray';
import { TentacleDoberman } from './tentacleDoberman';
import { GutterSerpent } from './gutterSerpent';
import { StingGull } from './stingGull';
import { ScytheMare } from './scytheMare';
import { BloatSow } from './bloatSow';
import { HushFox } from './hushFox';
import { DrainCoil } from './drainCoil';
import { CobbleCrab } from './cobbleCrab';
import { DartSquirrel } from './dartSquirrels';
import { LureHeron } from './lureHeron';
import { HiveBear } from './hiveBear';
import { BulwarkMoose } from './bulwarkMoose';
import { Flailfish } from './afflicted/flailfish';
import { Crabwife } from './afflicted/crabwife';
import { Gullscream } from './afflicted/gullscream';
import { Mothmother } from './afflicted/mothmother';
import { Houndfather } from './afflicted/houndfather';
import { Eelneck } from './afflicted/eelneck';
import { Owlneighbor } from './afflicted/owlneighbor';
import { Pigeonchest } from './afflicted/pigeonchest';
import { Mantisbride } from './afflicted/mantisbride';
import { Snailson } from './afflicted/snailson';
import { Serpentwaist } from './afflicted/serpentwaist';
import { Gantrylegs } from './afflicted/gantrylegs';
import { Barnacledad } from './afflicted/barnacledad';
import { Ratchoir } from './afflicted/ratchoir';
import { Anglerwidow } from './afflicted/anglerwidow';
import { Togglecrab } from './afflicted/togglecrab';
import { Jellyuncle } from './afflicted/jellyuncle';
import { Woodpeckerclerk } from './afflicted/woodpeckerclerk';
import { Tortoisenana } from './afflicted/tortoisenana';
import { Carpsire } from './afflicted/carpsire';
import { GraftedChimera, GRAFTED_TYPES, GRAFTED_BY_ID } from './grafted';

// String-keyed species registry: level data and the A-Life sim spawn by id,
// and expansion districts can register new species without touching core.
export const ENEMY_REGISTRY: Record<string, () => Enemy> = {
  frog: () => new FrogChimera(),
  crowSpider: () => new CrowSpider(),
  crowSpiderFlaming: () => new CrowSpider({ flaming: true }),
  crowSpiderGiant: () => new CrowSpider({ giant: true, flaming: true }),
  ratGull: () => new RatGullChimera(),
  trashclaw: () => new Trashclaw(),
  steepleBat: () => new SteepleBat(),
  shellback: () => new Shellback(),
  stiltStag: () => new StiltStag(),
  quillspray: () => new Quillspray(),
  tentacleDoberman: () => new TentacleDoberman(),
  gutterSerpent: () => new GutterSerpent(),
  stingGull: () => new StingGull(),
  scytheMare: () => new ScytheMare(),
  bloatSow: () => new BloatSow(),
  hushFox: () => new HushFox(),
  drainCoil: () => new DrainCoil(),
  cobbleCrab: () => new CobbleCrab(),
  dartSquirrel: () => new DartSquirrel(),
  lureHeron: () => new LureHeron(),
  hiveBear: () => new HiveBear(),
  bulwarkMoose: () => new BulwarkMoose(),
  // The Afflicted — the human chimeras, the zombie tier.
  flailfish: () => new Flailfish(),
  crabwife: () => new Crabwife(),
  gullscream: () => new Gullscream(),
  mothmother: () => new Mothmother(),
  houndfather: () => new Houndfather(),
  eelneck: () => new Eelneck(),
  owlneighbor: () => new Owlneighbor(),
  pigeonchest: () => new Pigeonchest(),
  mantisbride: () => new Mantisbride(),
  snailson: () => new Snailson(),
  serpentwaist: () => new Serpentwaist(),
  gantrylegs: () => new Gantrylegs(),
  barnacledad: () => new Barnacledad(),
  ratchoir: () => new Ratchoir(),
  anglerwidow: () => new Anglerwidow(),
  togglecrab: () => new Togglecrab(),
  jellyuncle: () => new Jellyuncle(),
  woodpeckerclerk: () => new Woodpeckerclerk(),
  tortoisenana: () => new Tortoisenana(),
  carpsire: () => new Carpsire(),
};

// THE GRAFTED — segmented minibosses that graduate into street heavies.
for (const t of GRAFTED_TYPES) {
  ENEMY_REGISTRY[t.id] = () => new GraftedChimera(GRAFTED_BY_ID[t.id]!);
}

/** Grafted ids by story tier, for the boss-debut schedule + heavy pool. */
export const GRAFTED_TIERS: Record<1 | 2 | 3, string[]> = {
  1: GRAFTED_TYPES.filter((t) => t.tier === 1).map((t) => t.id),
  2: GRAFTED_TYPES.filter((t) => t.tier === 2).map((t) => t.id),
  3: GRAFTED_TYPES.filter((t) => t.tier === 3).map((t) => t.id),
};

/** The zombie-tier species ids, for random street spawns. */
export const AFFLICTED_SPECIES = [
  'flailfish', 'crabwife', 'gullscream', 'mothmother', 'houndfather',
  'eelneck', 'owlneighbor', 'pigeonchest', 'mantisbride', 'snailson',
  'serpentwaist', 'gantrylegs', 'barnacledad', 'ratchoir', 'anglerwidow',
  'togglecrab', 'jellyuncle', 'woodpeckerclerk', 'tortoisenana', 'carpsire',
];

export function spawnEnemy(speciesId: string): Enemy | null {
  const factory = ENEMY_REGISTRY[speciesId];
  return factory ? factory() : null;
}
