import * as THREE from 'three';
import { LowResPipeline, INTERNAL_WIDTH, INTERNAL_HEIGHT } from './render/ps1/lowResPipeline';
import { ps1GlobalUniforms } from './render/ps1/ps1Material';
import { Input } from './core/input';
import { GameClock } from './core/clock';
import { CameraManager } from './camera/cameraManager';
import { InputLatch } from './camera/inputLatch';
import { PlayerController } from './player/playerController';
import { PlayerRig } from './player/playerRig';
import { GameState } from './gameplay/gameState';
import { Inventory } from './gameplay/inventory';
import { rollLoot, type Interactable } from './gameplay/interactables';
import { ITEMS } from './gameplay/inventory';
import { BattleSystem } from './battle/battle';
import { FrogChimera } from './enemies/frogBoss';
import { CrowSpider } from './enemies/spider';
import { StatMenu } from './ui/statMenu';
import { saveGame } from './gameplay/saveSystem';
import type { Collider } from './physics/colliders';
import { Hud } from './ui/hud';
import { Subtitles } from './ui/subtitles';
import { InventoryMenu } from './ui/inventoryMenu';
import { loadLevel, triggerContains } from './level/levelLoader';
import { LEVEL01 } from './level/level01';

// ---- Experiment Eve — Kat Weiss in the Newport North End (M9/M10 greybox).

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudEl = document.getElementById('hud')!;
const pipeline = new LowResPipeline(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
scene.fog = new THREE.Fog(0x0a0a12, 14, 60);
scene.add(new THREE.HemisphereLight(0x9aa8c8, 0x2a201c, 1.35));
const moon = new THREE.DirectionalLight(0xbfd0ff, 0.45);
moon.position.set(-4, 8, 3);
scene.add(moon);

// Level.
const level = loadLevel(LEVEL01);
scene.add(level.root);

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
const battle = new BattleSystem(state, scene, hudEl, canvas);
battle.onMessage = (t) => hud.message(t);

const muzzleLight = new THREE.PointLight(0xffcc88, 0, 6);
scene.add(muzzleLight);
let muzzleTimer = 0;
battle.onShot = () => {
  muzzleTimer = 0.07;
  muzzleLight.position.copy(player.position).add(new THREE.Vector3(0, 1.3, 0));
  input.rumble(120, 0.4, 0.8);
};

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
    const d = Math.hypot(i.x - player.position.x, i.z - player.position.z);
    if (d < i.radius && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function handleInteract(i: Interactable): void {
  switch (i.kind) {
    case 'container': {
      const loot = rollLoot(i);
      if (loot.length === 0) {
        hud.message('Nothing useful.');
      } else {
        for (const l of loot) inventory.add(l.item, l.n);
        hud.message('Found: ' + loot.map((l) => `${ITEMS[l.item].name}×${l.n}`).join(', '));
      }
      i.used = true;
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
    case 'save': {
      if (!state.flags['lampSeen']) {
        state.flags['lampSeen'] = true;
        subtitles.say('A lighthouse lamp, in a garage. Someone dragged this here.');
      }
      statMenu.toggle();
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

statMenu.onSave = () => {
  state.hp = state.maxHp;
  state.flags['garageSaved'] = true;
  state.flags['fireOut'] = true;
  saveGame(state, inventory, player.position.x, player.position.z);
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

// Dev console handle (also used by automated drive tests).
(window as unknown as Record<string, unknown>)['__eve'] = { state, battle, inventory, player };

function frame(): void {
  const menuOpen = invMenu.open || statMenu.open;
  gameClock.timeScale = battle.wantsPause || menuOpen ? 0 : 1;
  const { realDt, gameDt } = gameClock.tick();
  const sample = input.sample();
  const colliders = activeColliders();

  cameraMgr.update(player.position.x, player.position.z, realDt);
  pipeline.setDistortion(cameraMgr.activeZone?.fisheye ?? 0);
  const moveDir = latch.update(sample, cameraMgr.activeZone);

  // Menus (pause the world).
  if (statMenu.open) {
    statMenu.update(sample, state);
    latch.reset();
  } else if (invMenu.open) {
    invMenu.update(sample, inventory, state);
    latch.reset();
  } else if (sample.menuJust && !battle.wantsPause) {
    invMenu.toggle();
  }

  if (battle.active) {
    player.locked = !battle.playerControlled || menuOpen;
    if (battle.playerControlled && !menuOpen && sample.dodgeJust) player.dodge(moveDir);
    battle.update(realDt, gameDt, sample, player, cameraMgr.camera, colliders);
  } else {
    player.locked = menuOpen;
    if (!menuOpen && sample.dodgeJust) player.dodge(moveDir);
    for (const t of level.triggers) {
      if (!t.fired && triggerContains(t, player.position.x, player.position.z)) {
        t.fired = true;
        fireTrigger(t.id);
      }
    }
    state.regen(gameDt);
  }
  player.update(gameDt, moveDir, sample.magnitude, colliders);
  rig.pose = battle.phase === 'fire' ? 'aim' : 'explore';
  rig.update(gameDt, moveDir && !player.locked ? sample.magnitude : 0);

  // Interact.
  const near = !battle.active && !menuOpen ? nearestInteractable() : null;
  if (near) {
    promptEl.textContent = `${sample.padConnected ? 'X' : 'E'}: ${near.prompt}`;
    promptEl.style.display = 'block';
    if (sample.interactJust) handleInteract(near);
  } else {
    promptEl.style.display = 'none';
  }

  // Ambience animation.
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

  if (muzzleTimer > 0) {
    muzzleTimer -= realDt;
    muzzleLight.intensity = muzzleTimer > 0 ? 3 : 0;
  }

  subtitles.update(realDt);
  hud.update(realDt, state, battle);
  debugLine.textContent =
    `zone: ${cameraMgr.activeZone?.id ?? '-'}  battle: ${battle.phase}  ` +
    `pad: ${sample.padConnected ? 'pad' : 'kb'}  ` +
    `pos: ${player.position.x.toFixed(1)},${player.position.z.toFixed(1)}`;
  pipeline.render(scene, cameraMgr.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
