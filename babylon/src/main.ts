import { PointLight, Scene, Vector3 } from '@babylonjs/core';
import { AudioEngine } from './audio/audioEngine';
import { AmbienceBed, Sfx } from './audio/sfx';
import { BattleSystem } from './battle/battleSystem';
import { CombatFx } from './battle/combatFx';
import { type Creature, type SpeciesId } from './enemies/creature';
import { canFight, EnemyActor } from './enemies/enemyActor';
import { WorldAI } from './enemies/worldAI';
import { FixedCameraDirector } from './camera/fixedCamera';
import { MovementBasis } from './camera/movementBasis';
import { GameClock } from './core/clock';
import { Input } from './core/input';
import { WorldClock } from './core/worldClock';
import { GameState } from './gameplay/gameState';
import { BattleHud } from './ui/battleHud';
import { projectToScreen } from './ui/screen';
import { LEVEL01 } from './level/level01';
import { buildLevel } from './level/levelBuilder';
import { SurfaceLibrary } from './level/materials';
import { buildHouse, buildStorefront, buildStreetLamp } from './level/props/facades';
import { LAMP_PLACEMENTS, LEVEL01_PROPS, placeModels } from './level/props/modelLoader';
import { buildShore } from './level/props/shore';
import { PlayerCharacter } from './player/playerCharacter';
import { PlayerController } from './player/playerController';
import { LightRig } from './render/lightRig';
import { Particles } from './render/particles';
import { createEngine, createRendering } from './render/sceneSetup';

// EVEGDD Chapter 2 — Player & Core Loop, on Babylon.
// Kat's movement and dodge, the fixed-camera/Observer system, and the
// one-real-time-night world clock. Battle, ecology, stealth, saves and
// crafting are later chapters.

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLDivElement;

const engine = createEngine(canvas);
const scene = new Scene(engine);

const director = new FixedCameraDirector(scene);
scene.activeCamera = director.camera;

const rendering = createRendering(engine, scene, director.camera);
const surfaces = new SurfaceLibrary(scene);

const level = buildLevel(LEVEL01, scene, surfaces);
level.root.parent = null;
director.setZones(level.zones);
for (const mesh of level.shadowCasters) rendering.shadows.addShadowCaster(mesh);

// The shore she washes up on: black water, granite, the wreck, the seagull.
const shore = buildShore(scene, surfaces, rendering.skybox);
for (const mesh of shore.meshes) rendering.shadows.addShadowCaster(mesh);

// Facades over the hidden collider boxes from level01.
{
  const west = buildHouse(scene, surfaces, { w: 8, d: 7, h: 3.4, litWindow: true });
  west.root.position.set(-7.5, 0, 12);
  west.root.rotation.y = Math.PI / 2; // front faces the street (east)

  const video = buildStorefront(scene, surfaces, {
    w: 7, d: 7, h: 3.4,
    sign: ['MEGAHIT VIDEO'], signBg: '#14206a', signFg: '#f4e04a',
  });
  video.root.position.set(7.5, 0, 13.5);
  video.root.rotation.y = Math.PI / 2; // front faces the street (west)

  const north = buildHouse(scene, surfaces, { w: 7, d: 7, h: 3.2 });
  north.root.position.set(7.5, 0, 23.5);
  north.root.rotation.y = -Math.PI / 2;

  const pawn = buildStorefront(scene, surfaces, {
    w: 6, d: 4, h: 3.6,
    sign: ['PAWN', 'BUY · SELL · SURVIVE'], signBg: '#3a2a10', signFg: '#e8c860', barred: true,
  });
  pawn.root.position.set(9, 0, 8);

  for (const built of [west, video, north, pawn]) {
    for (const mesh of built.meshes) rendering.shadows.addShadowCaster(mesh);
  }
}

// Cobra-head street lamps: real in-scene light sources doing the night's
// lighting, with posts you can actually see holding them up.
const lampLights: PointLight[] = [];
for (const [lx, lz, ry] of LAMP_PLACEMENTS) {
  const lamp = buildStreetLamp(scene, surfaces);
  lamp.root.position.set(lx, 0, lz);
  lamp.root.rotation.y = ry;
  lampLights.push(lamp.light);
  for (const mesh of lamp.meshes) rendering.shadows.addShadowCaster(mesh);
}

// CC0 set dressing (Kenney Retro Urban + City Pack), streamed in as it loads.
void placeModels(scene, LEVEL01_PROPS, (meshes) => {
  for (const mesh of meshes) rendering.shadows.addShadowCaster(mesh);
});

// The district's wildlife, living on its own account (EVEGDD Ch.4, wandering
// and reaction layer). Placed where the bestiary says their kin belong.
const worldAI = new WorldAI(scene);
const creatures: Creature[] = [];
const AMBIENT: [SpeciesId, number, number, number][] = [
  ['rat', -3.2, -12.6, 1.2],      // south street trash
  ['rat', -2.6, -11.9, -0.4],
  ['rat', 3.0, -4.2, 2.6],        // the other trash can
  ['spider', 24.2, -15.4, 2.1],   // the corridor, behind the dog fence
  ['spider', 20.6, -12.4, -1.1],  // the pocket yard
  ['frog', -0.6, -9.4, 0.6],      // frog street, which is named for a reason
  ['frog', 1.4, -10.8, -1.9],
  ['frog', -1.8, -14.2, 2.2],
  ['snake', -9.4, -21.6, 0.4],    // the blockade, under the pylons
  ['wasp', -12.3, 16.8, 0],       // the nest on the west fence
  ['bat', 8.4, 26.2, 1.5],        // over the billboard
];
for (const [species, x, z, facing] of AMBIENT) {
  void worldAI.spawn(species, x, z, facing).then((creature) => {
    creatures.push(creature);
    for (const mesh of creature.meshes) rendering.shadows.addShadowCaster(mesh);
  });
}

// Every point light in the scene — lamps, lit windows, storefront signs — is
// managed by the rig, which keeps only the nearest handful switched on.
const lightRig = new LightRig(
  scene.lights.filter((l): l is PointLight => l.getClassName() === 'PointLight'),
);

const player = new PlayerController(scene);
player.position.set(LEVEL01.playerStart[0], 0, LEVEL01.playerStart[1]);
player.facing = LEVEL01.playerFacing;

const input = new Input();
const basis = new MovementBasis();
const worldClock = new WorldClock();
const gameClock = new GameClock();
const state = new GameState();

// Sound is synthesized, not sampled: oscillators and filtered noise, no files,
// nothing to license. The context can't exist before a gesture (autoplay
// policy), so it's built on the first key or click and everything no-ops until
// then rather than throwing into the render loop.
const audio = new AudioEngine();
const sfx = new Sfx(audio);
const ambience = new AmbienceBed(audio);
audio.onReady = () => ambience.start();
for (const event of ['keydown', 'pointerdown', 'gamepadconnected'] as const) {
  window.addEventListener(event, () => audio.unlock());
}

const particles = new Particles(scene);

// EVEGDD Ch.3: the ATB battle. It borrows creatures from the world sim for the
// duration of a fight and hands the survivors back.
const battleHud = new BattleHud(hudRoot);
const combatFx = new CombatFx(sfx, particles, director, input, battleHud);
const battle = new BattleSystem(state, scene, battleHud, combatFx, level.colliders);
battle.onEnd = (participants) => {
  for (const actor of participants) {
    if (actor.dead) actor.dispose();
    else worldAI.attach(actor.creature);
  }
};
battle.onKill = () => director.addShake(0.35);
battle.onDefeat = () => {
  battleHud.message('KINGSPORT KEEPS HER.');
  state.hp = state.maxHp;
};

/** Anything hostile this close starts a fight — it doesn't wait to be asked. */
const ENCOUNTER_RANGE = 2.6;
function checkEncounter(): void {
  if (battle.active) return;
  const actors: EnemyActor[] = [];
  for (const creature of worldAI.near(player.position, ENCOUNTER_RANGE)) {
    if (!canFight(creature.species)) continue;
    worldAI.detach(creature);
    actors.push(new EnemyActor(creature));
  }
  if (actors.length > 0) battle.start(actors);
}

let character: PlayerCharacter | null = null;
void PlayerCharacter.load(scene, player.node).then((loaded) => {
  character = loaded;
  for (const mesh of loaded.meshes) rendering.shadows.addShadowCaster(mesh);
});

// --- HUD: her wristwatch, and the current shot. Everything else is chrome
// that belongs to later chapters.
const watch = document.createElement('div');
watch.style.cssText =
  'position:absolute;right:18px;top:14px;font:600 15px/1.3 "Courier New",monospace;' +
  'color:#d8dde2;letter-spacing:1px;text-align:right;opacity:0.9';
hudRoot.appendChild(watch);

const hint = document.createElement('div');
hint.style.cssText =
  'position:absolute;left:18px;bottom:14px;font:400 12px/1.5 "Courier New",monospace;' +
  'color:#aab2ba;opacity:0.75';
hint.textContent =
  'WASD move · Shift walk · Space dodge · Enter confirm · Arrows navigate · E bicycle · T time x120\n' +
  'Gamepad: left stick move · A confirm · B dodge · X bicycle · D-pad navigate';
hint.style.whiteSpace = 'pre';
hudRoot.appendChild(hint);

let timeAccelerated = false;
let lastTimeKey = false;
// Footsteps come off distance travelled, not off a clip event: the locomotion
// blend is a crossfade between four clips and has no single footfall to hook.
let strideAccum = 0;

engine.runRenderLoop(() => {
  // Menus and the Precision Aim sweeps stop the world without stopping the
  // frame: gameDt goes to zero, realDt keeps running.
  gameClock.timeScale = battle.wantsPause ? 0 : 1;
  const { realDt, gameDt } = gameClock.tick();
  const dt = realDt;
  // Pause is a time domain, and the particles and the mix live in it too: a
  // burst hangs mid-air and the street goes muffled while the menu is up.
  particles.setTimeScale(gameClock.timeScale);
  audio.setDucked(battle.wantsPause);

  // Dev knob: T fast-forwards the night so the lighting ramp is inspectable.
  const timeKey = input.isDown('KeyT');
  if (timeKey && !lastTimeKey) {
    timeAccelerated = !timeAccelerated;
    worldClock.scale = timeAccelerated ? 120 : 1;
  }
  lastTimeKey = timeKey;

  worldClock.tick(realDt);
  rendering.applyTimeOfDay(worldClock.darkness);

  // The lamp over the protest field is dying. It has been dying all night.
  const flicker = lampLights[0];
  if (flicker) {
    const t = worldClock.elapsed;
    const dip = Math.sin(t * 11.3) * Math.sin(t * 3.7) * Math.sin(t * 27.1);
    flicker.intensity = 22 * (dip > 0.55 ? 0.15 : 1);
  }

  const sample = input.sample();
  // While the battle owns her turn she is rooted; the basis still tracks the
  // camera so movement resumes pointing the way she's looking.
  const canMove = !battle.active || battle.playerControlled;
  const moveDir = basis.update(sample, director.activeZone, realDt);
  const moveIntent = canMove ? moveDir : null;

  if (canMove && sample.dodgeJust) {
    const slide = moveDir !== null && sample.magnitude < 0.6;
    if (player.dodge(moveDir, slide)) combatFx.dodgeRoll();
  }
  if (!battle.active && sample.interactJust) player.riding = !player.riding;

  player.update(gameDt, moveIntent, canMove ? sample.magnitude : 0, level.colliders);
  character?.update(realDt, player.speed, player.dodgeProgress, player.sliding);

  // A stride's worth of ground covered is a footfall. Stopping re-arms it just
  // short of a step, so setting off again sounds off immediately.
  if (!player.riding && !player.dodging && player.speed > 0.5) {
    strideAccum += player.speed * gameDt;
    const stride = player.speed > 2.6 ? 1.25 : 0.85;
    if (strideAccum >= stride) {
      strideAccum = 0;
      combatFx.footstep();
    }
  } else if (player.speed < 0.2) {
    strideAccum = 0.8;
  }

  battle.update(realDt, gameDt, sample, player, director.camera);
  battleHud.update(realDt);
  particles.update(realDt);
  checkEncounter();
  worldAI.update(gameDt, player.position, level.colliders);
  lightRig.update(player.position);
  director.update(player.position, player.velocity, dt);
  rendering.followShadows(player.position);
  rendering.setFisheye(director.fisheye);

  // The pad line is not decoration: "is the controller working" is otherwise
  // unanswerable from inside the game, and the answer is usually that the
  // browser cannot see the device at all.
  watch.textContent = `${worldClock.timeString}${timeAccelerated ? '  x120' : ''}\n${
    director.activeZone?.id ?? '—'}\n${sample.padConnected ? 'PAD' : 'no pad'}`;
  watch.style.whiteSpace = 'pre';

  scene.render();
});

window.addEventListener('resize', () => engine.resize());

// Dev handle, same shape the headless playtest harness expects on the Three
// build: hold keys ~120ms with ~90ms gaps or edge detection drops them.
(window as unknown as { __eve: unknown }).__eve = {
  engine,
  scene,
  player,
  director,
  worldClock,
  level,
  get state() {
    return {
      x: player.position.x,
      z: player.position.z,
      facing: player.facing,
      speed: player.speed,
      riding: player.riding,
      dodging: player.dodging,
      zone: director.activeZone?.id ?? null,
      cuts: director.cutCount,
      time: worldClock.timeString,
      darkness: worldClock.darkness,
      characterLoaded: character !== null,
      creatures: creatures.length,
      phase: battle.phase,
      hp: Math.round(state.hp),
      atb: Number(battle.atbFraction.toFixed(2)),
    };
  },
  worldAI,
  get creatures() {
    return worldAI.census;
  },
  get characterDebug() {
    return character?.debug ?? null;
  },
  input,
  get padDebug() {
    return input.padDebug;
  },
  battle,
  // `state` is already the harness's snapshot getter; the run's own state
  // lives under its own name.
  gameState: state,
  get battleDebug() {
    return battle.debug;
  },
  particles,
  combatFx,
  get fxDebug() {
    return particles.debug;
  },
  get audioDebug() {
    return { unlocked: audio.unlocked, contextState: audio.ctx?.state ?? null };
  },
  /** World -> screen fractions, the same path the HUD and Precision Aim use. */
  project(x: number, y: number, z: number) {
    return projectToScreen(scene, new Vector3(x, y, z));
  },
  /** Force a fight with whatever is nearest — the harness needs a way in. */
  startFight(radius = 14) {
    const actors: EnemyActor[] = [];
    for (const creature of worldAI.near(player.position, radius)) {
      if (!canFight(creature.species)) continue;
      worldAI.detach(creature);
      actors.push(new EnemyActor(creature));
    }
    battle.start(actors);
    return actors.length;
  },
  teleport(x: number, z: number) {
    player.position.set(x, player.floorY, z);
  },
  setTimeScale(scale: number) {
    worldClock.scale = scale;
  },
};
