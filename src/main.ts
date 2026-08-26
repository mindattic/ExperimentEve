import * as THREE from 'three';
import { LowResPipeline, INTERNAL_WIDTH, INTERNAL_HEIGHT } from './render/ps1/lowResPipeline';
import { ps1GlobalUniforms } from './render/ps1/ps1Material';
import { Input } from './core/input';
import { GameClock } from './core/clock';
import { WorldClock } from './core/worldClock';
import { CameraManager } from './camera/cameraManager';
import { InputLatch } from './camera/inputLatch';
import { PlayerController } from './player/playerController';
import { PlayerRig } from './player/playerRig';
import { GameState } from './gameplay/gameState';
import { Inventory } from './gameplay/inventory';
import { rollLoot, rollSalvage, type Interactable } from './gameplay/interactables';
import { PawnMenu } from './ui/pawnMenu';
import { ITEMS } from './gameplay/inventory';
import { BattleSystem } from './battle/battle';
import { FrogChimera } from './enemies/frogBoss';
import { CrowSpider } from './enemies/spider';
import { StatMenu } from './ui/statMenu';
import { saveGame, loadGame, hasSave, applySave } from './gameplay/saveSystem';
import { TitleScreen } from './ui/titleScreen';
import { ApertureOS } from './ui/apertureOS';
import type { Collider } from './physics/colliders';
import { Hud } from './ui/hud';
import { Subtitles } from './ui/subtitles';
import { InventoryMenu } from './ui/inventoryMenu';
import { loadLevel, triggerContains } from './level/levelLoader';
import { LEVEL01 } from './level/level01';
import { buildProtestField } from './level/props/protestField';
import { GraffitiWall } from './level/props/graffiti';
import { buildHouse, buildStorefront, buildStreetLamp } from './level/props/facades';
import { placeModels } from './level/props/modelLoader';
import { AudioEngine } from './audio/audioEngine';
import { Sfx, AmbienceBed } from './audio/sfx';
import { WorldAI } from './enemies/worldAI';
import { ScareDirector } from './gameplay/scares';
import { ErasureSquad } from './gameplay/erasureSquad';

// ---- Experiment Eve — Kat Weiss in Kingsport's North End (design ref:
// Newport, RI; in-game names are winks only — see docs/GAZETTEER.md).

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudEl = document.getElementById('hud')!;
const pipeline = new LowResPipeline(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
scene.fog = new THREE.Fog(0x0a0a12, 14, 60);
const hemi = new THREE.HemisphereLight(0x9aa8c8, 0x2a201c, 1.35);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbfd0ff, 0.45);
moon.position.set(-4, 8, 3);
scene.add(moon);

// One night, real time: June 21, 1998, arrival 8:00 PM; dusk drains away
// through civil twilight into full dark. Dawn (5:11 AM) is the deadline.
const worldClock = new WorldClock();
const DUSK = {
  sky: new THREE.Color(0xb08868), ground: new THREE.Color(0x3a2a24),
  fog: new THREE.Color(0x261a2e), hemiI: 1.7,
  moonColor: new THREE.Color(0xffb070), moonI: 0.7,
};
const NIGHT = {
  sky: new THREE.Color(0x9aa8c8), ground: new THREE.Color(0x2a201c),
  fog: new THREE.Color(0x0a0a12), hemiI: 1.35,
  moonColor: new THREE.Color(0xbfd0ff), moonI: 0.45,
};
function applyTimeOfDay(): void {
  const k = Math.min(1, Math.max(0, (worldClock.darkness - 0.35) / 0.65));
  hemi.color.lerpColors(DUSK.sky, NIGHT.sky, k);
  hemi.groundColor.lerpColors(DUSK.ground, NIGHT.ground, k);
  hemi.intensity = DUSK.hemiI + (NIGHT.hemiI - DUSK.hemiI) * k;
  moon.color.lerpColors(DUSK.moonColor, NIGHT.moonColor, k);
  moon.intensity = DUSK.moonI + (NIGHT.moonI - DUSK.moonI) * k;
  (scene.fog as THREE.Fog).color.lerpColors(DUSK.fog, NIGHT.fog, k);
  (scene.background as THREE.Color).copy((scene.fog as THREE.Fog).color);
}

// Level.
const level = loadLevel(LEVEL01);
scene.add(level.root);

// The June 20th march ended here. West end of the cross street.
scene.add(buildProtestField(-13, 0.8, -5.5, 5.2, 22));

// The duel wall: REN vs SOAK, escalating as the night advances.
const duelWall = new GraffitiWall(-9, 1.7, 0.16, 0);
scene.add(duelWall.mesh);

// Final facades over the hidden collider boxes.
{
  const west = buildHouse({ w: 8, d: 7, h: 3.4, tint: 0xb8a898, litWindow: true });
  west.position.set(-7.5, 0, 12);
  west.rotation.y = Math.PI / 2; // front faces the street (east)
  scene.add(west);

  const video = buildStorefront({
    w: 7, d: 7, h: 3.4,
    sign: ['MEGAHIT VIDEO'], signBg: '#14206a', signFg: '#f4e04a', barred: false,
  });
  video.position.set(7.5, 0, 13.5);
  video.rotation.y = Math.PI / 2; // front faces the street (west)
  scene.add(video);

  const north = buildHouse({ w: 7, d: 7, h: 3.2, tint: 0x9aa4a8 });
  north.position.set(7.5, 0, 23.5);
  north.rotation.y = -Math.PI / 2;
  scene.add(north);

  const pawn = buildStorefront({
    w: 6, d: 4, h: 3.6,
    sign: ['PAWN', 'BUY · SELL · SURVIVE'], signBg: '#3a2a10', signFg: '#e8c860', barred: true,
  });
  pawn.position.set(9, 0, 8);
  scene.add(pawn);
}

// CC0 set dressing (Kenney Retro Urban Kit) through the PS1 pipeline.
placeModels(scene, [
  // The jackknifed semi: cab and cargo at broken angles under the pylons.
  { name: 'truck-flat', x: -4.6, z: -23.4, ry: 2.35, scale: 3.2 },
  { name: 'truck-grey-cargo', x: 1.4, z: -22.3, ry: 1.62, scale: 3.2 },
  // Blockade approach barriers.
  { name: 'detail-barrier-strong-damaged', x: -2.2, z: -17.6, ry: 0.15, scale: 2 },
  { name: 'detail-barrier-type-a', x: 1.8, z: -17.7, ry: -0.1, scale: 2 },
  // Street furniture.
  { name: 'detail-dumpster-open', x: 3.1, z: 7.2, ry: Math.PI, scale: 2 },
  { name: 'detail-dumpster-closed', x: -3.5, z: -2.4, ry: 0.2, scale: 2 },
  { name: 'detail-light-traffic', x: 4.6, z: 6.4, ry: Math.PI, scale: 2 },
  { name: 'detail-bench', x: -6.2, z: 30.6, ry: 0, scale: 2 },
  // Salvage-yard clutter by the garage and corridors.
  { name: 'pallet', x: 20.4, z: -3.2, ry: 0.4, scale: 2 },
  { name: 'pallet-small', x: 21.3, z: -2.5, ry: 1.2, scale: 2 },
  { name: 'planks', x: 24.8, z: -16.6, ry: 0.9, scale: 2 },
  { name: 'scaffolding-structure', x: 5.1, z: 21.5, ry: -Math.PI / 2, scale: 2.4 },
  // Overhead cables sagging across street A.
  { name: 'detail-cables-type-a', x: 0, z: 12, ry: Math.PI / 2, scale: 2.6 },
  { name: 'detail-cables-type-b', x: 0, z: 24, ry: Math.PI / 2, scale: 2.6 },
  // Green where the grass patches are.
  { name: 'tree-small', x: -12.2, z: 11, scale: 2.2 },
  { name: 'tree-shrub', x: 12.4, z: 24.5, scale: 2 },
  { name: 'tree-shrub', x: -12.8, z: 24, scale: 2.4 },
  { name: 'wall-broken-type-a', x: -8.5, z: 6.15, ry: Math.PI, scale: 2 },

  // --- City Pack: units vary per model, so everything uses fit (meters,
  // largest dimension) and auto-grounding. ---
  // Dead cars over their hidden salvage colliders.
  { name: 'city-pack/Car', x: 0.1, z: 2.4, ry: 0.35, fit: 4.2 },
  { name: 'city-pack/Van', x: -1.6, z: -14.3, ry: -1.35, fit: 4.6 },
  // Erasure cruiser abandoned at the blockade approach.
  { name: 'city-pack/Police Car', x: -8.5, z: -19.6, ry: 2.6, fit: 4.2 },
  // Street furniture.
  { name: 'city-pack/Fire hydrant', x: 4.4, z: -3.6, fit: 1.0 },
  { name: 'city-pack/Mailbox', x: -4.5, z: 7.2, ry: Math.PI / 2, fit: 1.3 },
  { name: 'city-pack/Stop sign', x: 4.5, z: 0.8, ry: Math.PI, fit: 2.6 },
  { name: 'city-pack/Manhole Cover', x: 0.4, z: 10, fit: 0.9 },
  { name: 'city-pack/Manhole Cover', x: -0.6, z: -8, fit: 0.9 },
  { name: 'city-pack/Trash Can', x: -4.4, z: 12.4, fit: 1.0 },
  { name: 'city-pack/trah bag grey', x: -4.1, z: 11.6, fit: 0.7 },
  { name: 'city-pack/trah bag grey', x: 3.9, z: 8.3, ry: 1.1, fit: 0.7 },
  { name: 'city-pack/Debris Papers', x: 0.5, z: 5.5, fit: 1.6 },
  { name: 'city-pack/Debris Papers', x: -1.8, z: -5.5, ry: 2, fit: 1.6 },
  // Bus stop sign on the cross street: nobody is coming.
  { name: 'city-pack/Bus stop sign', x: -0.8, z: 5.5, fit: 2.6 },
  // The pawnshop fire escape + roof dressing.
  { name: 'city-pack/Fire Exit', x: 12.15, z: 8.4, ry: -Math.PI / 2, fit: 4.0 },
  { name: 'city-pack/Roof Exit', x: 7, z: 9, y: 3.65, ry: Math.PI, fit: 1.8 },
  { name: 'city-pack/Air conditioner', x: 10.8, z: 6.8, y: 3.65, ry: 0.3, fit: 0.9 },
  { name: 'city-pack/Billboard', x: 8.8, z: 26.9, y: 3.1, ry: Math.PI, fit: 4.5 },
  // Poster + washing line in the west alley.
  { name: 'city-pack/Rock band poster', x: -4.35, z: 17.5, ry: Math.PI / 2, y: 0.9, fit: 1.1 },
  { name: 'city-pack/Washing Line', x: -7.5, z: 28.2, ry: 0.2, fit: 3.4 },
  // Distant skyline filler beyond the play area (visual only).
  { name: 'city-pack/Big Building', x: -20, z: -10, ry: Math.PI / 2, fit: 14 },
  { name: 'city-pack/Building Red', x: 17, z: 14, ry: -Math.PI / 2, fit: 9 },
  { name: 'city-pack/Building Green', x: -19, z: 12, ry: Math.PI / 2, fit: 9 },
  { name: 'city-pack/Brown Building', x: 17, z: 26, ry: -Math.PI / 2, fit: 10 },
  { name: 'city-pack/Pizza Corner', x: -18, z: -2, ry: Math.PI / 2, fit: 9 },
]);

// Street lamps: two sound ones and a dying one over the protest field.
const flickerLamp = buildStreetLamp();
flickerLamp.group.position.set(-5.2, 0, 1);
flickerLamp.group.rotation.y = Math.PI;
scene.add(flickerLamp.group);
for (const [lx, lz, ry] of [[2.5, -2.5, Math.PI], [-2.5, 14, 0]] as const) {
  const lamp2 = buildStreetLamp();
  lamp2.group.position.set(lx, 0, lz);
  lamp2.group.rotation.y = ry;
  scene.add(lamp2.group);
}

// Dynamic set-dressing: truck fire + lighthouse save lamp.
const fireGroup = new THREE.Group();
const fireMat = new THREE.MeshLambertMaterial({
  color: 0x331100, emissive: 0xff6a1a, emissiveIntensity: 1,
});
for (const [fx, fz, s] of [[-1, -22.3, 1.4], [1.5, -22, 1.1], [3.5, -22.4, 1.2], [-4.5, -23.5, 1.0]] as const) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 1.6 * s, 5), fireMat);
  cone.position.set(fx, 2.9 + 0.8 * s, fz);
  fireGroup.add(cone);
}
const fireLight = new THREE.PointLight(0xff7722, 2.4, 18);
fireLight.position.set(0, 3.5, -22);
fireGroup.add(fireLight);
scene.add(fireGroup);

const lampMat = new THREE.MeshLambertMaterial({ color: 0x223344, emissive: 0x77bbff, emissiveIntensity: 1 });
const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), lampMat);
lamp.position.set(19.45, 1.35, 1.05);
scene.add(lamp);
const lampLight = new THREE.PointLight(0x88ccff, 1.4, 10);
lampLight.position.copy(lamp.position);
scene.add(lampLight);

// Camera / player / systems.
const cameraMgr = new CameraManager(INTERNAL_WIDTH / INTERNAL_HEIGHT);
cameraMgr.setZones(level.zones);

const player = new PlayerController();
const rig = new PlayerRig();
player.object.add(rig.root);
player.position.set(LEVEL01.playerStart[0], 0, LEVEL01.playerStart[1]);
player.facing = LEVEL01.playerFacing;
scene.add(player.object);

const input = new Input();
const latch = new InputLatch();
const gameClock = new GameClock();
const state = new GameState();
const inventory = new Inventory();
const hud = new Hud(hudEl);
const subtitles = new Subtitles(hudEl);
const invMenu = new InventoryMenu(hudEl);
invMenu.onMessage = (t) => hud.message(t);
const statMenu = new StatMenu(hudEl);
const pawnMenu = new PawnMenu(hudEl);

// The garage save point: a CRT running ApertureOS 98.
const os = new ApertureOS(hudEl);
const garageMachine = {
  owner: 'NORTH-END SALVAGE',
  files: [
    {
      name: 'shift_log.txt',
      body: '6/19 - tow calls all day. brakes, brakes, brakes.\n6/20 - no calls. everybody at the march.\n6/21 - Ray took the flatbed out to the bridge approach.\nHe did not bring it back.',
    },
    {
      name: 'note_to_ray.txt',
      body: 'Ray -\nIf you get back before me, the lamp in the bay works.\nKeep it lit. People walk toward light.\nThat is all we can do now.\n- M.',
    },
    {
      name: 'march_flyer.txt',
      body: 'JUNE 20 - CITY HALL TO THE PIER\nBRING EVERYONE. IT IS OUR WATER TOO.\nTHEY CANNOT ERASE ALL OF US.',
      deleted: true,
    },
    {
      name: 'refund_draft.txt',
      body: 'To Aperture Systems:\nMy copy of ApertureOS 98 crashes when I open more than two windows.\nRequesting refund.\n(draft - unsent - revision 14)',
      deleted: true,
    },
    {
      name: 'dialer_log.txt',
      body: 'AMERIGATE ONLINE - SESSION LOG\n6/19 CONNECT 28.8k ... 4hrs (Ray downloading the Bigger Rock trailer)\n6/19 NOTE: M. picked up the phone at hour 3. Download lost. Words exchanged.\n6/20 CONNECT 28.8k ... CARRIER LOST 11:52 PM\n6/20 REDIAL ... NO DIAL TONE\n6/21 REDIAL ... NO DIAL TONE\nYou have got nothing.',
    },
    {
      name: 'finestein.txt',
      body: 'WHERE IS MY FINESTEIN TAPE, RAY.\nI taped the finale May 14. The tape is GONE.\nThe label is still on the shelf. The LABEL, Ray.\nWho steals the tape and leaves the label.',
      deleted: true,
    },
    {
      name: 'for_ray.txt',
      body: 'Ray -\nThe boys made you something. It is on your bench.\nCome home and get it.\n- M.',
      deleted: true,
    },
  ],
};
const battle = new BattleSystem(state, scene, hudEl, canvas);
battle.onMessage = (t) => hud.message(t);
battle.hasAxe = () => inventory.count('fireAxe') > 0;
battle.inv = inventory;
pawnMenu.onMessage = (t) => hud.message(t);

// Audio: everything synthesized; unlocked by the first user gesture.
const audio = new AudioEngine();
const sfx = new Sfx(audio);
const ambience = new AmbienceBed(audio);
let ambienceStarted = false;
const unlockAudio = (): void => {
  audio.unlock();
  if (!ambienceStarted && audio.unlocked) {
    ambienceStarted = true;
    ambience.start();
  }
};
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

const muzzleLight = new THREE.PointLight(0xffcc88, 0, 6);
scene.add(muzzleLight);
let muzzleTimer = 0;
battle.onShot = () => {
  muzzleTimer = 0.07;
  muzzleLight.position.copy(player.position).add(new THREE.Vector3(0, 1.3, 0));
  input.rumble(120, 0.4, 0.8);
  sfx.gunshot();
};

// City Hall chimes every hour on the hour — gameplay stops to listen, then
// the message box. Castlevania II: Simon's Quest, quoted directly.
const curseBox = document.createElement('div');
curseBox.style.cssText =
  'position:absolute;left:50%;top:16%;transform:translateX(-50%);display:none;' +
  'background:#06062a;border:3px solid #3050e8;padding:14px 22px;color:#fff;' +
  'font-size:16px;letter-spacing:2px;line-height:1.7;max-width:340px;text-align:left';
curseBox.textContent = 'WHAT A HORRIBLE NIGHT TO HAVE A CURSE.';
hudEl.appendChild(curseBox);

interface ChimeState {
  count: number;
  played: number;
  timer: number;
  msgTimer: number;
}
let chime: ChimeState | null = null;
let lastChimedHour = 19; // arrival at 20:00 chimes immediately — eight bells
let lastStepIndex = 0;
let lastHp = 80;
let executionMark: ReturnType<ErasureSquad['executionCandidate']> = null;
let payphoneRingT = 0;

// ---- Bicycle: fast, wide turns, low durability, ram on dodge -----------
const bikeMesh = new THREE.Group();
{
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x8a4420 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  for (const wz of [-0.42, 0.42]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.3, wz);
    bikeMesh.add(wheel);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 4), frameMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, 0.55, 0);
  bikeMesh.add(bar);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), frameMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 0.85, 0.42);
  bikeMesh.add(handle);
  bikeMesh.visible = false;
  player.object.add(bikeMesh);
}
let bikeHits = 0;
let ramTimer = 0;
const rammed = new Set<unknown>();

function toggleBike(i: Interactable): void {
  if (player.riding) {
    // Dismount: the bike leans wherever she leaves it.
    player.riding = false;
    bikeMesh.visible = false;
    i.x = player.position.x + Math.sin(player.facing) * 0.5;
    i.z = player.position.z + Math.cos(player.facing) * 0.5;
    i.prompt = 'Take the bicycle';
    hud.message('She leans the bike.');
  } else if (bikeHits >= 3) {
    hud.message('The frame is bent into a question mark. Salvage, maybe.');
  } else {
    player.riding = true;
    bikeMesh.visible = true;
    hud.message('Borrowed. Everything is borrowed now.');
    if (!state.flags['bikeBark']) {
      state.flags['bikeBark'] = true;
      subtitles.say('No helmet. Live dangerously.');
    }
  }
}

function bendBike(i: Interactable | undefined): void {
  player.riding = false;
  bikeMesh.visible = false;
  if (i) {
    i.kind = 'salvage';
    i.salvageType = 'bentBike';
    i.prompt = 'Salvage the bent bicycle';
    i.x = player.position.x;
    i.z = player.position.z;
  }
  hud.message('The bike folds under her. It is done being a bike.');
  subtitles.say('Fine. Walking. Walking is fine.');
}
function hourOf(minutes: number): number {
  return Math.floor(minutes / 60);
}

// Interact prompt.
const promptEl = document.createElement('div');
promptEl.style.cssText =
  'position:absolute;left:50%;transform:translateX(-50%);bottom:120px;font-size:14px;' +
  'color:#cfe0d0;background:rgba(4,8,14,.6);padding:2px 10px;display:none';
hudEl.appendChild(promptEl);

const debugLine = document.createElement('div');
debugLine.id = 'dbgline';
debugLine.style.cssText = 'position:absolute;left:8px;bottom:6px;font-size:12px;opacity:.75';
hudEl.appendChild(debugLine);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') pipeline.enabled = !pipeline.enabled;
  if (e.code === 'KeyO') {
    ps1GlobalUniforms.uSnapEnabled.value = ps1GlobalUniforms.uSnapEnabled.value > 0.5 ? 0 : 1;
  }
});

function nearestInteractable(): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const i of level.interactables) {
    if (i.used) continue;
    if (Math.abs((i.floorY ?? 0) - player.floorY) > 1) continue; // same floor only
    const d = Math.hypot(i.x - player.position.x, i.z - player.position.z);
    if (d < i.radius && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Scripted ladder climb: locks the player and drives position directly.
let climb: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
function startClimb(to: [number, number, number]): void {
  climb = {
    t: 0,
    dur: 1.3,
    from: player.position.clone(),
    to: new THREE.Vector3(to[0], to[2], to[1]),
  };
  latch.reset();
  sfx.footstep(false);
}

function handleInteract(i: Interactable): void {
  switch (i.kind) {
    case 'container': {
      // The Blue Dress: always hanging in the first closet she searches.
      if (i.containerType === 'closet' && !state.flags['blueDressFound']) {
        state.flags['blueDressFound'] = true;
        inventory.add('blueDress');
        subtitles.say('I don\'t think it\'s my size...', 2.6);
        subtitles.say('...and what is that STAIN?!', 2.8);
        hud.message('Found: The Blue Dress');
        sfx.pickup();
        i.used = true;
        break;
      }
      const loot = rollLoot(i);
      if (loot.length === 0) {
        hud.message('Nothing useful.');
      } else {
        for (const l of loot) inventory.add(l.item, l.n);
        hud.message('Found: ' + loot.map((l) => `${ITEMS[l.item].name}×${l.n}`).join(', '));
      }
      i.used = true;
      sfx.pickup();
      break;
    }
    case 'pickup': {
      for (const g of i.grants ?? []) inventory.add(g.item, g.n);
      if (i.grantsBlueprint) {
        inventory.blueprints.add(i.grantsBlueprint);
        subtitles.say('...I could actually build that.');
      }
      hud.message(i.inspectText ?? 'Taken.');
      i.used = true;
      break;
    }
    case 'inspect': {
      if (i.id === 'nest1') {
        if (inventory.count('molotov') > 0) {
          inventory.remove('molotov');
          if (worldAI.destroyNestNear(i.x, i.z)) {
            i.used = true;
            hud.message('The clutch catches all at once. Nothing else hatches here.');
            subtitles.say('Sorry. Not sorry. Both.');
            state.addLimit(15);
            input.rumble(300, 0.5, 0.8);
          }
        } else {
          hud.message('A clutch of eggs, warm from the inside. Fire would end this. A molotov would do.');
        }
        break;
      }
      if (i.id === 'payphone1') {
        if (!state.flags['payphoneAnswered']) {
          state.flags['payphoneAnswered'] = true;
          sfx.uiBlip();
          subtitles.say('[click]', 1.2);
          subtitles.say('...Breathing. Calm. Unhurried.', 2.8);
          subtitles.say('"Keep moving, Katherine."', 3.2);
          subtitles.say('[dial tone] ...Nobody calls me Katherine.', 3.4);
        } else {
          subtitles.say('Dead line. It rang once tonight. Once was the message.');
        }
        break;
      }
      if (i.id === 'ansMachine1') {
        if (!state.flags['ansHeard1']) {
          state.flags['ansHeard1'] = true;
          sfx.uiBlip();
          subtitles.say('[click] "Hi, you\'ve reached the Ansons! We\'re out, or—"', 3.2);
          subtitles.say('"—or at the march! Leave it at the beep!" [beep]', 3.2);
          subtitles.say('47 unheard messages. All from MEGAHIT VIDEO.', 3.4);
          subtitles.say('Sinking Ship, tape two. $4.50 a night. Forever.', 3.2);
        } else {
          subtitles.say('The tape is full. The machine keeps blinking anyway.');
        }
        break;
      }
      if (i.id === 'tub-house1') {
        if (!state.flags['tubUsed1']) {
          state.flags['tubUsed1'] = true;
          state.hp = state.maxHp;
          subtitles.say('...Monsters outside, and I\'m drawing a bath.');
          subtitles.say('Don\'t judge me.');
          hud.message('Bubble bath deployed. HP fully restored.');
        } else {
          subtitles.say('There\'s no more hot water.');
        }
      } else {
        hud.message(i.inspectText ?? '...');
        if (i.once) i.used = true;
      }
      break;
    }
    case 'salvage': {
      const parts = rollSalvage(i.salvageType ?? 'trashPile');
      for (const p of parts) inventory.add(p.item, p.n);
      hud.message(
        parts.length
          ? 'Stripped: ' + parts.map((p) => `${ITEMS[p.item].name}×${p.n}`).join(', ')
          : 'Nothing worth taking.',
      );
      sfx.pickup();
      i.used = true;
      break;
    }
    case 'trade': {
      if (!state.flags['pawnMet']) {
        state.flags['pawnMet'] = true;
        subtitles.say('A voice behind the bars: "Baubles only. Bullets back."');
      }
      pawnMenu.toggle();
      break;
    }
    case 'alarm': {
      i.used = true;
      worldAI.ring(i.x, i.z, 30);
      hud.message('The alarm howls. Everything with ears is coming HERE.');
      subtitles.say('Okay. Now be somewhere else.');
      let rings = 0;
      const ringLoop = (): void => {
        if (rings++ < 30) {
          sfx.alarmClang();
          window.setTimeout(ringLoop, 950);
        }
      };
      ringLoop();
      input.rumble(400, 0.3, 0.5);
      break;
    }
    case 'chop': {
      if (state.flags[i.chopFlag ?? '']) break;
      if (inventory.count('fireAxe') > 0) {
        state.flags[i.chopFlag ?? ''] = true;
        i.used = true;
        hud.message('The boards give way. A new way through.');
        sfx.chop();
        input.rumble(200, 0.6, 0.9);
      } else {
        hud.message('Boarded shut. An axe would have opinions about this.');
      }
      break;
    }
    case 'bike': {
      toggleBike(i);
      break;
    }
    case 'ladder': {
      if (player.riding) {
        hud.message('Not with the bike. She\'s strong, not circus-strong.');
        break;
      }
      if (i.ladderTo) startClimb(i.ladderTo);
      break;
    }
    case 'save': {
      if (!state.flags['lampSeen']) {
        state.flags['lampSeen'] = true;
        subtitles.say('A lighthouse lamp. And a computer that still has power.');
      }
      os.boot(garageMachine);
      break;
    }
  }
}

let currentEncounter: 'none' | 'frog' | 'swarm' | 'giant' = 'none';

function fireTrigger(id: string): void {
  switch (id) {
    case 'introBark':
      window.setTimeout(() => subtitles.say('What a shit hole.'), 1400);
      break;
    case 'frogStreet': {
      const frog = new FrogChimera();
      frog.object.position.set(0, 0, -9.5);
      currentEncounter = 'frog';
      battle.start([frog]);
      subtitles.say('...That used to be a frog.');
      break;
    }
    case 'blockadeSwarm': {
      const pack: CrowSpider[] = [];
      for (const [sx, sz] of [[-1, -22.8], [2, -22.5], [-4, -23.5]] as const) {
        const s = new CrowSpider({ flaming: true });
        s.object.position.set(sx, 0, sz);
        pack.push(s);
      }
      currentEncounter = 'swarm';
      battle.start(pack);
      subtitles.say('They\'re coming out of the fire—');
      break;
    }
    case 'sliceEnd': {
      state.flags['sliceComplete'] = true;
      subtitles.say('Providence. Right.');
      hud.message('SLICE COMPLETE — the route continues toward the bridge.');
      break;
    }
    case 'catScare':
      scares.catDash(-3.8, 3.8, player.position.z - 2.5);
      break;
    case 'protestBark':
      subtitles.say('...', 1.4);
      subtitles.say('I don\'t see any bullet wounds.', 3.2);
      break;
    case 'shutterScare':
      scares.shutterBang();
      subtitles.say('...Just a shutter. Just wind.');
      input.rumble(220, 0.5, 0.9);
      break;
    case 'dogFence':
      scares.dogFence(19.5, 23, -17.3);
      subtitles.say('The fence. The fence is holding. It\'s holding.');
      break;
    case 'corridorAmbush': {
      // Pinched in the corridor — and then the Observer proves itself.
      const south = new CrowSpider();
      south.object.position.set(24.5, 0, -19.5);
      const north = new CrowSpider();
      north.object.position.set(24.5, 0, -7);
      currentEncounter = 'none';
      battle.start([south, north]);
      subtitles.say('Both ends. Both ends—');
      window.setTimeout(() => {
        state.flags['observerGate'] = true;
        sfx.uiConfirm();
        sfx.alarmClang();
        hud.message('The side-gate lock buzzes open.');
        subtitles.say('...Nobody pressed anything.', 3);
      }, 1600);
      break;
    }
  }
}

battle.onVictory = () => {
  if (currentEncounter === 'frog') {
    state.flags['frogDead'] = true;
  } else if (currentEncounter === 'swarm') {
    window.setTimeout(() => {
      const giant = new CrowSpider({ giant: true, flaming: true });
      giant.object.position.set(-6, 0, -22.5);
      currentEncounter = 'giant';
      battle.start([giant]);
      subtitles.say('...That one ate well.');
    }, 1800);
  } else if (currentEncounter === 'giant') {
    state.flags['giantSpiderDead'] = true;
  }
};

os.onPerks = () => statMenu.toggle();
os.onBlip = () => sfx.uiBlip();
os.onSave = () => doSave();
statMenu.onSave = () => doSave();
function doSave(): void {
  state.hp = state.maxHp;
  state.flags['garageSaved'] = true;
  state.flags['fireOut'] = true;
  worldAI.resetOnSave(); // the lighthouse rule: the streets restock
  worldClock.elapsed += 8 * 60; // resting costs 8 minutes of the night
  sfx.saveChime();
  saveGame(state, inventory, player.position.x, player.position.z, worldClock.elapsed);
  hud.message('Saved. Outside, something changes in the light.');
  subtitles.say('The fire\'s dying down. Lucky. ...Lucky?');
};

function activeColliders(): readonly Collider[] {
  let cols = level.colliders;
  for (const g of level.gated) {
    if (!state.flags[g.flag]) cols = cols.concat(g.collider);
  }
  return cols;
}

// ---- Living world: wanderers, packs, nests, prey ----------------------
const worldAI = new WorldAI(scene);
const scares = new ScareDirector(scene, sfx);
// Rat-gull scavengers pick over the tracks.
worldAI.addWanderer({ species: 'ratGull', x: -8, z: 34, region: { minX: -13, minZ: 31, maxX: 13, maxZ: 39 }, packId: 'gulls', aggro: 'skittish' });
worldAI.addWanderer({ species: 'ratGull', x: 8, z: 35, region: { minX: -13, minZ: 31, maxX: 13, maxZ: 39 }, packId: 'gulls', aggro: 'skittish' });
// A stray tentacled doberman patrols the south street — cross-faction bait.
worldAI.addWanderer({ species: 'tentacleDoberman', x: 0, z: -14, region: { minX: -3, minZ: -16, maxX: 3, maxZ: -1 } });
// A hush fox haunts the CCTV cross street (it shows plainly on the lens).
worldAI.addWanderer({ species: 'hushFox', x: 10, z: 3, region: { minX: -13, minZ: 0.5, maxX: 13, maxZ: 5.5 } });
// Crow-spider nest in a backyard keeps juveniles trickling into street A.
worldAI.addNest({ species: 'crowSpider', x: -12.5, z: 17, capacity: 2, intervalSec: 45, region: { minX: -13, minZ: 7, maxX: 3, maxZ: 28 } });
worldAI.addRats(7, 0, 32, 16);
worldAI.onVocal = (species) => {
  if (!audio.unlocked) return;
  switch (species) {
    case 'ratGull': sfx.hiss(); break;
    case 'tentacleDoberman': sfx.bark(); break;
    case 'crowSpider': sfx.wingFlutter(); break;
    case 'frog': sfx.croak(); break;
    default: sfx.hiss();
  }
};
worldAI.onPlayerContact = (enemies) => {
  if (!battle.active) {
    currentEncounter = 'none';
    battle.start(enemies);
    subtitles.say(enemies.length > 1 ? 'A pack—' : 'It sees her.');
  }
};

// ---- Erasure squad vignette: coffee at the barrel, one at the pylon ---
const squad = new ErasureSquad(scene);
squad.spawn([
  { x: -10.6, z: -19.2, facing: 0.5, offGuard: false }, // coffee, watching the street east
  { x: -9.4, z: -19.8, facing: 1.6, offGuard: false }, // coffee, facing his buddy/east
  { x: -11.2, z: -24.0, facing: Math.PI, offGuard: true }, // peeing on the pylon
]);
const barrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.4, 0.9, 7),
  makeBarrelMaterial(),
);
barrel.position.set(-10, 0.45, -19.5);
scene.add(barrel);
function makeBarrelMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: 0x5a4a34, emissive: 0x672c10, emissiveIntensity: 0.5 });
}
squad.onAlert = (enemies, executed) => {
  currentEncounter = 'none';
  if (executed) {
    sfx.gunshot();
    hud.message('EXECUTION — one down before it starts.');
    subtitles.say('One less.');
    subtitles.say('...A folded paper falls out of his helmet. Crayon.', 3);
    state.addLimit(40);
  } else {
    subtitles.say('"CONTAMINANT! WEAPONS FREE!"');
  }
  window.setTimeout(() => battle.start(enemies.filter((e) => !e.dead)), executed ? 900 : 200);
};

// ---- Train intro: she rides in, jumps, the train doesn't stop ----------
let introTimer = 0;
const train = new THREE.Group();
{
  const trainMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 2.2, 5, 2, 2), trainMat);
    car.position.set(-i * 7.6, 1.5, 0);
    train.add(car);
  }
  train.position.set(-46, 0, 35.9);
  train.visible = false;
  scene.add(train);
}

// ---- Title / death / game-mode flow ----------------------------------
type GameMode = 'title' | 'game' | 'dead';
let mode: GameMode = 'title';
const title = new TitleScreen(hudEl);

function startNewGame(): void {
  mode = 'game';
  title.hide();
  introTimer = 3.4;
  train.visible = true;
  train.position.x = -46;
  // What she carries off the train: one clip, and the reason she's going.
  inventory.add('katsCard');
}

function continueGame(): void {
  const data = loadGame();
  if (!data) {
    startNewGame();
    return;
  }
  applySave(data, state, inventory);
  player.position.set(data.pos[0], 0, data.pos[1]);
  worldClock.elapsed = data.clockElapsed;
  lastChimedHour = Math.floor(((20 * 60) + data.clockElapsed / 60) / 60);
  lastHp = state.hp;
  // Fired one-shot triggers stay fired for boss/story flags.
  for (const t of level.triggers) {
    if (t.id === 'frogStreet' && state.flags['frogDead']) t.fired = true;
    if (t.id === 'blockadeSwarm' && state.flags['giantSpiderDead']) t.fired = true;
    if (t.id === 'introBark') t.fired = true;
  }
  mode = 'game';
  title.hide();
}

title.onSelect = (opt) => {
  unlockAudio();
  sfx.uiConfirm();
  if (title.mode === 'title') {
    if (opt === 'Continue') continueGame();
    else startNewGame();
  } else {
    // Death screen
    if (opt === 'Retry from the lamp' && hasSave()) {
      sessionStorage.setItem('eve-auto-continue', '1');
      location.reload();
    } else {
      location.reload();
    }
  }
};

battle.onDefeat = () => {
  mode = 'dead';
  title.showDeath(hasSave());
};

// Boot: retry goes straight back into the night.
if (sessionStorage.getItem('eve-auto-continue') === '1' && hasSave()) {
  sessionStorage.removeItem('eve-auto-continue');
  continueGame();
} else {
  title.showTitle(hasSave());
}

// Dev console handle (also used by automated drive tests).
(window as unknown as Record<string, unknown>)['__eve'] = { state, battle, inventory, player, worldAI, scene };

function frame(): void {
  const menuOpen = invMenu.open || statMenu.open || os.open || pawnMenu.open;
  const chiming = chime !== null;
  gameClock.timeScale = battle.wantsPause || menuOpen || chiming || mode !== 'game' ? 0 : 1;
  const { realDt, gameDt } = gameClock.tick();
  const sample = input.sample();

  // Title / death overlays swallow input; scene idles behind them.
  if (mode !== 'game') {
    title.update(sample);
    pipeline.render(scene, cameraMgr.camera);
    if (cameraMgr.activeZone === null) cameraMgr.update(player.position.x, player.position.z, realDt);
    requestAnimationFrame(frame);
    return;
  }
  const colliders = activeColliders();

  cameraMgr.update(player.position.x, player.position.z, realDt);
  pipeline.setDistortion(cameraMgr.activeZone?.fisheye ?? 0);
  const moveDir = latch.update(sample, cameraMgr.activeZone);

  // Menus (pause the world).
  if (os.open) {
    os.clockText = worldClock.timeString;
    os.update(sample);
    latch.reset();
  } else if (pawnMenu.open) {
    pawnMenu.update(sample, inventory, state);
    latch.reset();
  } else if (statMenu.open) {
    statMenu.update(sample, state);
    latch.reset();
  } else if (invMenu.open) {
    invMenu.update(sample, inventory, state);
    latch.reset();
  } else if (sample.menuJust && !battle.wantsPause) {
    invMenu.toggle();
  }

  const tryDodge = (): void => {
    if (player.dodge(moveDir)) {
      sfx.dodgeRoll();
      if (player.riding) {
        // Bike ram: the dodge burst becomes a battering pass.
        ramTimer = 0.35;
        rammed.clear();
        bikeHits++;
        input.rumble(150, 0.5, 0.7);
      }
    }
  };
  if (battle.active) {
    player.locked = !battle.playerControlled || menuOpen || chiming || climb !== null;
    if (battle.playerControlled && !menuOpen && !chiming && sample.dodgeJust) tryDodge();
    battle.update(realDt, gameDt, sample, player, cameraMgr.camera, colliders);
  } else {
    player.locked = menuOpen || chiming || climb !== null;
    if (!menuOpen && !chiming && !climb && sample.dodgeJust) tryDodge();
    for (const t of level.triggers) {
      if (!t.fired && triggerContains(t, player.position.x, player.position.z)) {
        t.fired = true;
        fireTrigger(t.id);
      }
    }
    state.regen(gameDt);
    // Walking is when she tops the clip off. No drama out here.
    if (state.ammoInClip < state.clipSize && state.reserveAmmo > 0) {
      const n = state.reload();
      if (n > 0) hud.message(`Reloaded. ${state.ammoInClip}/${state.clipSize}.`);
    }
    // Erasure vignette: detection + the Execution opener.
    squad.update(gameDt, player.position, moveDir ? sample.magnitude : 0, colliders);
    executionMark = squad.executionCandidate(player.position);
    if (executionMark && sample.confirmJust) {
      squad.execute(executionMark);
      executionMark = null;
    }
  }
  worldAI.update(gameDt, player.position, colliders, battle.active);
  scares.update(gameDt);
  player.update(gameDt, moveDir, sample.magnitude, colliders);

  // Bike ram resolution + durability.
  if (ramTimer > 0) {
    ramTimer -= gameDt;
    for (const e of battle.enemiesAlive) {
      if (!rammed.has(e) && e.object.position.distanceTo(player.position) < 1.35) {
        rammed.add(e);
        const dealt = e.takeHit(15, null);
        hud.message(`Rammed — ${dealt}.`);
        state.addLimit(dealt * 0.4);
      }
    }
  }
  if (player.riding && state.hp < lastHp - 0.01) bikeHits++;
  if (player.riding && bikeHits >= 3) {
    bendBike(level.interactables.find((x) => x.id === 'bike1'));
  }

  // Gated geometry: hide meshes whose flag has opened (chopped boards etc.).
  for (const g of level.gated) {
    if (g.mesh && g.mesh.visible && state.flags[g.flag]) g.mesh.visible = false;
  }

  rig.pose = battle.phase === 'fire' ? 'aim' : 'explore';
  const moving = moveDir !== null && !player.locked;
  rig.update(gameDt, moving && !player.riding ? sample.magnitude : 0);

  // Footsteps on foot-plants (walk phase crosses multiples of pi).
  if (moving) {
    const stepIndex = Math.floor(rig.phase / Math.PI);
    if (stepIndex !== lastStepIndex) {
      lastStepIndex = stepIndex;
      const indoor = cameraMgr.activeZone?.id === 'house1' || cameraMgr.activeZone?.id === 'garage';
      sfx.footstep(indoor);
    }
  }

  // Hurt feedback (any source).
  if (state.hp < lastHp - 0.01) {
    sfx.hurt();
    input.rumble(200, 0.6, 1);
  }
  lastHp = state.hp;

  // Interact / execution prompt. Riding: interact = get off, wherever —
  // and the same key-edge must not immediately remount the dropped bike.
  let interactConsumed = false;
  if (player.riding && !menuOpen && sample.interactJust) {
    const bikeI = level.interactables.find((x) => x.id === 'bike1');
    if (bikeI) {
      toggleBike(bikeI);
      interactConsumed = true;
    }
  }
  const near = !battle.active && !menuOpen && !player.riding ? nearestInteractable() : null;
  if (near) {
    promptEl.textContent = `${sample.padConnected ? 'X' : 'E'}: ${near.prompt}`;
    promptEl.style.display = 'block';
    if (sample.interactJust && !interactConsumed) handleInteract(near);
  } else if (executionMark) {
    promptEl.textContent = `${sample.padConnected ? 'A' : 'Enter'}: Execute`;
    promptEl.style.display = 'block';
  } else {
    promptEl.style.display = 'none';
  }

  // Ambience animation.
  worldClock.tick(realDt); // the night does not pause for menus
  applyTimeOfDay();
  audio.setDucked(battle.wantsPause || chiming);

  // The duel wall escalates with the night.
  duelWall.setStage(state.flags['fireOut'] ? 2 : state.flags['frogDead'] ? 1 : 0);

  // The payphone rings while she's near — until she answers, once.
  if (!state.flags['payphoneAnswered'] && mode === 'game') {
    const d = Math.hypot(player.position.x - 12.6, player.position.z - 4.6);
    payphoneRingT -= realDt;
    if (d < 7 && payphoneRingT <= 0) {
      payphoneRingT = 2.4;
      sfx.phoneRing();
    }
  }

  // Fire crackle loudness follows proximity to the burning semi.
  if (ambienceStarted) {
    const fireDist = Math.hypot(player.position.x, player.position.z + 22);
    ambience.setFireIntensity(state.flags['fireOut'] ? 0 : Math.max(0, 1 - fireDist / 22));
  }

  // Ladder climbs drive the player directly.
  if (climb) {
    player.locked = true;
    climb.t += realDt;
    const k = Math.min(1, climb.t / climb.dur);
    const ease = k * k * (3 - 2 * k);
    player.position.lerpVectors(climb.from, climb.to, ease);
    player.facing = Math.atan2(climb.to.x - climb.from.x, climb.to.z - climb.from.z);
    if (k >= 1) {
      player.floorY = climb.to.y;
      player.position.y = climb.to.y;
      climb = null;
      player.locked = false;
    }
  }

  // Train intro: she rides in on the freight line and bails.
  if (introTimer > 0) {
    introTimer -= realDt;
    player.locked = true;
    train.position.x += 15 * realDt;
    const jumpK = Math.min(1, Math.max(0, (3.4 - introTimer - 1.5) / 0.7));
    if (jumpK <= 0) {
      // Riding the lead car's doorway.
      player.position.set(train.position.x + 1.5, 1.2, 34.6);
    } else {
      // The jump: arc from the moving car down to the gravel.
      const fromX = train.position.x + 1.5;
      player.position.x = fromX + (0 - fromX) * jumpK * 0.25 + 0; // she lands where she lands
      player.position.x = jumpK < 1 ? fromX * (1 - jumpK) + 0 * jumpK : 0;
      player.position.z = 34.6 + (36 - 34.6) * jumpK;
      player.position.y = Math.max(0, Math.sin(jumpK * Math.PI) * 0.9 + (1 - jumpK) * 1.2);
      player.facing = Math.PI;
    }
    if (introTimer <= 0) {
      player.position.set(0, 0, 36);
      player.position.y = 0;
    }
  }
  if (train.visible && introTimer <= 0) {
    train.position.x += 15 * realDt; // keeps going without her
    if (train.position.x > 70) train.visible = false;
  }

  // Hourly chime: freeze, count the bells, read the curse.
  const nowHour = hourOf(worldClock.minutesOfDay);
  if (!chime && nowHour > lastChimedHour && audio.unlocked && introTimer <= 0) {
    lastChimedHour = nowHour;
    const h12 = nowHour % 12 === 0 ? 12 : nowHour % 12;
    chime = { count: h12, played: 0, timer: 0.8, msgTimer: -1 };
  }
  if (chime) {
    player.locked = true;
    chime.timer -= realDt;
    if (chime.played < chime.count) {
      if (chime.timer <= 0) {
        sfx.bellChime();
        input.rumble(180, 0.2, 0.4);
        chime.played++;
        chime.timer = 1.3;
      }
    } else if (chime.msgTimer < 0) {
      if (chime.timer <= 0) {
        curseBox.style.display = 'block';
        chime.msgTimer = 0;
      }
    } else {
      chime.msgTimer += realDt;
      if (chime.msgTimer > 3.2) {
        curseBox.style.display = 'none';
        chime = null;
      }
    }
  }

  const t = performance.now() / 1000;
  if (state.flags['fireOut'] && fireGroup.visible) {
    fireGroup.visible = false;
    fireLight.intensity = 0;
    const heat = level.interactables.find((i) => i.id === 'truckHeat');
    if (heat) heat.used = true;
  }
  if (fireGroup.visible) {
    fireLight.intensity = 2.2 + Math.sin(t * 13) * 0.5 + Math.sin(t * 29) * 0.3;
    fireGroup.children.forEach((c, idx) => {
      if ((c as THREE.Mesh).isMesh) c.scale.y = 1 + Math.sin(t * 11 + idx * 2.1) * 0.18;
    });
  }
  lampLight.intensity = 1.1 + Math.sin(t * 2.4) * 0.5;
  lamp.rotation.y = t * 1.8;
  // The lamp over the dead marchers can't hold a charge.
  flickerLamp.light.intensity =
    Math.sin(t * 13.7) + Math.sin(t * 7.1) > 1.2 ? 0.15 : 1.5;

  if (muzzleTimer > 0) {
    muzzleTimer -= realDt;
    muzzleLight.intensity = muzzleTimer > 0 ? 3 : 0;
  }

  subtitles.update(realDt);
  hud.update(realDt, state, battle, worldClock.timeString);
  debugLine.textContent =
    `zone: ${cameraMgr.activeZone?.id ?? '-'}  battle: ${battle.phase}  ` +
    `pad: ${sample.padConnected ? 'pad' : 'kb'}  ` +
    `pos: ${player.position.x.toFixed(1)},${player.position.z.toFixed(1)}`;
  pipeline.render(scene, cameraMgr.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
