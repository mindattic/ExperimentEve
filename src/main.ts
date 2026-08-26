import * as THREE from 'three';
import { LowResPipeline, INTERNAL_WIDTH, INTERNAL_HEIGHT } from './render/ps1/lowResPipeline';
import { makePS1Material, prepTexture, ps1GlobalUniforms } from './render/ps1/ps1Material';

// ---- M0-M2 test scene: verifies the PS1 pipeline before game systems land.

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
scene.fog = new THREE.Fog(0x0a0a12, 6, 26);

const camera = new THREE.PerspectiveCamera(60, INTERNAL_WIDTH / INTERNAL_HEIGHT, 0.1, 100);
camera.position.set(0, 2.2, 6.5);
camera.lookAt(0, 1, 0);

scene.add(new THREE.HemisphereLight(0x8899bb, 0x221814, 0.9));
const dir = new THREE.DirectionalLight(0xffeedd, 0.7);
dir.position.set(3, 6, 2);
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40, 8, 8),
  makePS1Material({ map: makeCheckerTexture('#3a3a44', '#2c2c34', 16) }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 1.6, 1.6),
  makePS1Material({ map: makeCheckerTexture('#b8451f', '#e8d8a0', 8) }),
);
cube.position.y = 1.4;
scene.add(cube);

// A long textured wall close to the camera: the classic case where affine
// warp is obvious on large triangles at grazing angles.
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 3, 1, 1),
  makePS1Material({ map: makeCheckerTexture('#41505a', '#333d46', 8) }),
);
wall.position.set(0, 1.5, -4);
scene.add(wall);

for (let i = 0; i < 6; i++) {
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.35, 3, 6),
    makePS1Material({ color: 0x6a5a4a }),
  );
  pillar.position.set(-7.5 + i * 3, 1.5, -2.5);
  scene.add(pillar);
}

const hud = document.getElementById('hud')!;
hud.innerHTML =
  '<div style="position:absolute;left:8px;bottom:6px;font-size:12px;opacity:.7">' +
  'P: toggle pipeline &nbsp; O: toggle vertex snap</div>';

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') pipeline.enabled = !pipeline.enabled;
  if (e.code === 'KeyO') {
    ps1GlobalUniforms.uSnapEnabled.value = ps1GlobalUniforms.uSnapEnabled.value > 0.5 ? 0 : 1;
  }
});

const clock = new THREE.Clock();
function frame(): void {
  const dt = clock.getDelta();
  cube.rotation.y += dt * 0.7;
  cube.rotation.x += dt * 0.3;
  pipeline.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
