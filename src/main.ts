import * as THREE from 'three';
import { LowResPipeline, INTERNAL_WIDTH, INTERNAL_HEIGHT } from './render/ps1/lowResPipeline';
import { makePS1Material, prepTexture, ps1GlobalUniforms } from './render/ps1/ps1Material';
import { Input } from './core/input';
import { CameraZone } from './camera/cameraZone';
import { CameraManager } from './camera/cameraManager';
import { InputLatch } from './camera/inputLatch';
import { PlayerController } from './player/playerController';
import { PlayerRig } from './player/playerRig';
import { segment, type Collider } from './physics/colliders';
import { GameClock } from './core/clock';
import { GameState } from './gameplay/gameState';
import { BattleSystem } from './battle/battle';
import { RatGullChimera } from './enemies/dummyChimera';
import { Hud } from './ui/hud';

// ---- M3-M6 test level: L-shaped street, three fixed cameras (one rotated
// 90°, one reversed), latch-driven movement, wall collision.

function makeCheckerTexture(colorA: string, colorB: string, cells = 8): THREE.CanvasTexture {
  const size = 64;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d')!;
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return prepTexture(new THREE.CanvasTexture(cnv)) as THREE.CanvasTexture;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const pipeline = new LowResPipeline(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
scene.fog = new THREE.Fog(0x0a0a12, 12, 55);

scene.add(new THREE.HemisphereLight(0x9aa8c8, 0x2a201c, 1.35));
const dir = new THREE.DirectionalLight(0xffeedd, 0.6);
dir.position.set(3, 6, 2);
scene.add(dir);

// Ground
const groundTex = makeCheckerTexture('#33333c', '#2b2b32', 4);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(16, 16);
// Heavily tessellated: affine mapping skews wildly on large triangles, so
// big flat surfaces need small triangles — exactly what real PS1 games did.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(64, 64, 48, 48),
  makePS1Material({ map: groundTex }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Walls: L-shaped corridor. Vertical arm x[-2,2] z[-2,14], horizontal arm
// x[-2,14] z[-2,2].
const colliders: Collider[] = [];
const wallMat = makePS1Material({ map: makeCheckerTexture('#4a4038', '#3c342c', 8) });
function addWall(ax: number, az: number, bx: number, bz: number): void {
  colliders.push(segment(ax, az, bx, bz));
  const len = Math.hypot(bx - ax, bz - az);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len, 2.6, 0.25, Math.max(1, Math.ceil(len / 1.5)), 2, 1),
    wallMat,
  );
  mesh.position.set((ax + bx) / 2, 1.3, (az + bz) / 2);
  mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
  scene.add(mesh);
}
addWall(-2, 14, -2, -2); // west wall, full length
addWall(2, 14, 2, 2); //    east wall of vertical arm
addWall(-2, 14, 2, 14); //  north cap
addWall(-2, -2, 14, -2); // south wall, full length
addWall(2, 2, 14, 2); //    north wall of horizontal arm
addWall(14, 2, 14, -2); //  east cap

// A pillar obstacle in the corner room.
const pillar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.45, 2.6, 6),
  makePS1Material({ color: 0x6a5a4a }),
);
pillar.position.set(0.9, 1.3, 0.0);
scene.add(pillar);
colliders.push(segment(0.9, -0.4, 0.9, 0.4)); // rough pillar blocker

// Camera zones
const zones = [
  new CameraZone({
    id: 'street-south',
    polygon: [[-2, 2], [2, 2], [2, 14], [-2, 14]],
    cameraPosition: [0, 3.4, 15.5],
    cameraLookAt: [0, 1, 6],
    forward: [0, -1],
  }),
  new CameraZone({
    id: 'corner',
    polygon: [[-2, -2], [2, -2], [2, 2], [-2, 2]],
    cameraPosition: [1.8, 4.0, 1.8],
    cameraLookAt: [-0.9, 0.2, -0.9],
    forward: [-0.7071, -0.7071],
  }),
  new CameraZone({
    id: 'corridor-east',
    polygon: [[2, -2], [14, -2], [14, 2], [2, 2]],
    cameraPosition: [13.2, 2.8, 0],
    cameraLookAt: [5, 0.8, 0],
    forward: [-1, 0],
  }),
];

const cameraMgr = new CameraManager(INTERNAL_WIDTH / INTERNAL_HEIGHT);
cameraMgr.setZones(zones);

// Player with the procedural rig (M7).
const player = new PlayerController();
const rig = new PlayerRig();
player.object.add(rig.root);
player.position.set(0, 0, 12);
scene.add(player.object);

const input = new Input();
const latch = new InputLatch();

const hudEl = document.getElementById('hud')!;
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

// --- game systems (M8) ---
const gameClock = new GameClock();
const state = new GameState();
const hud = new Hud(hudEl);
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

// Dev console handle (also used by automated drive tests).
(window as unknown as Record<string, unknown>)['__eve'] = { state, battle };

function frame(): void {
  gameClock.timeScale = battle.wantsPause ? 0 : 1;
  const { realDt, gameDt } = gameClock.tick();
  const sample = input.sample();

  cameraMgr.update(player.position.x, player.position.z);
  const moveDir = latch.update(sample, cameraMgr.activeZone);

  if (battle.active) {
    player.locked = !battle.playerControlled;
    if (battle.playerControlled && sample.dodgeJust) player.dodge(moveDir);
    battle.update(realDt, gameDt, sample, player, cameraMgr.camera, colliders);
  } else {
    player.locked = false;
    if (sample.dodgeJust) player.dodge(moveDir);
    // Test encounter: entering the east corridor wakes two chimeras.
    if (cameraMgr.activeZone?.id === 'corridor-east' && !state.flags['testBattle']) {
      state.flags['testBattle'] = true;
      const a = new RatGullChimera();
      a.object.position.set(10, 0, -1);
      const bEnemy = new RatGullChimera();
      bEnemy.object.position.set(12, 0, 1);
      battle.start([a, bEnemy]);
    }
  }
  player.update(gameDt, moveDir, sample.magnitude, colliders);
  rig.pose = battle.phase === 'fire' ? 'aim' : 'explore';
  rig.update(gameDt, moveDir && !player.locked ? sample.magnitude : 0);
  if (!battle.active) state.regen(gameDt);

  if (muzzleTimer > 0) {
    muzzleTimer -= realDt;
    muzzleLight.intensity = muzzleTimer > 0 ? 3 : 0;
  }

  hud.update(realDt, state, battle);
  debugLine.textContent =
    `zone: ${cameraMgr.activeZone?.id ?? '-'}  battle: ${battle.phase}  ` +
    `pad: ${sample.padConnected ? 'pad' : 'kb'}  ` +
    `pos: ${player.position.x.toFixed(1)},${player.position.z.toFixed(1)}  [P]ipe [O]snap`;
  pipeline.render(scene, cameraMgr.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
