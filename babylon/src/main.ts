import { PointLight, Scene } from '@babylonjs/core';
import { FixedCameraDirector } from './camera/fixedCamera';
import { MovementBasis } from './camera/movementBasis';
import { Input } from './core/input';
import { WorldClock } from './core/worldClock';
import { LEVEL01 } from './level/level01';
import { buildLevel } from './level/levelBuilder';
import { SurfaceLibrary } from './level/materials';
import { buildHouse, buildStorefront, buildStreetLamp } from './level/props/facades';
import { LAMP_PLACEMENTS, LEVEL01_PROPS, placeModels } from './level/props/modelLoader';
import { buildShore } from './level/props/shore';
import { PlayerCharacter } from './player/playerCharacter';
import { PlayerController } from './player/playerController';
import { LightRig } from './render/lightRig';
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
  'WASD / stick move · Shift walk · Space dodge (walk+dodge = knee slide) · E bicycle · T time x120';
hudRoot.appendChild(hint);

let timeAccelerated = false;
let lastTimeKey = false;

engine.runRenderLoop(() => {
  const dt = Math.min(0.05, engine.getDeltaTime() / 1000);

  // Dev knob: T fast-forwards the night so the lighting ramp is inspectable.
  const timeKey = input.isDown('KeyT');
  if (timeKey && !lastTimeKey) {
    timeAccelerated = !timeAccelerated;
    worldClock.scale = timeAccelerated ? 120 : 1;
  }
  lastTimeKey = timeKey;

  worldClock.tick(dt);
  rendering.applyTimeOfDay(worldClock.darkness);

  // The lamp over the protest field is dying. It has been dying all night.
  const flicker = lampLights[0];
  if (flicker) {
    const t = worldClock.elapsed;
    const dip = Math.sin(t * 11.3) * Math.sin(t * 3.7) * Math.sin(t * 27.1);
    flicker.intensity = 22 * (dip > 0.55 ? 0.15 : 1);
  }

  const sample = input.sample();
  const moveDir = basis.update(sample, director.activeZone, dt);

  if (sample.dodgeJust) {
    const slide = moveDir !== null && sample.magnitude < 0.6;
    player.dodge(moveDir, slide);
  }
  if (sample.interactJust) player.riding = !player.riding;

  player.update(dt, moveDir, sample.magnitude, level.colliders);
  character?.update(dt, player.speed, player.dodgeProgress, player.sliding);

  lightRig.update(player.position);
  director.update(player.position, player.velocity, dt);
  rendering.followShadows(player.position);
  rendering.setFisheye(director.fisheye);

  watch.textContent = `${worldClock.timeString}${timeAccelerated ? '  x120' : ''}\n${
    director.activeZone?.id ?? '—'}`;
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
    };
  },
  get characterDebug() {
    return character?.debug ?? null;
  },
  teleport(x: number, z: number) {
    player.position.set(x, player.floorY, z);
  },
  setTimeScale(scale: number) {
    worldClock.scale = scale;
  },
};
