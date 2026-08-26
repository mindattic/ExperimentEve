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
};

export function spawnEnemy(speciesId: string): Enemy | null {
  const factory = ENEMY_REGISTRY[speciesId];
  return factory ? factory() : null;
}
