import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { prepTexture } from '../../render/ps1/ps1Material';

// A swath of dead marchers: prone low-poly figures dropped mid-step,
// placards still in hand. No wounds. The signs tell their own story.

const PLACARD_LINES = [
  'WE ARE NOT\nYOUR CONTROL\nGROUP',
  'OUR KIDS\nDRANK IT\nTOO',
  'SHUT IT\nDOWN',
  'THE ISLAND\nKNOWS',
  'ANSWERS\nBEFORE\nAUTUMN',
  'IT IS OUR\nWATER TOO',
];

function placardTexture(text: string): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = 64;
  cnv.height = 48;
  const ctx = cnv.getContext('2d')!;
  ctx.fillStyle = '#d8d2c0';
  ctx.fillRect(0, 0, 64, 48);
  ctx.fillStyle = '#2a2622';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 32, 14 + i * 11));
  return prepTexture(new THREE.CanvasTexture(cnv)) as THREE.CanvasTexture;
}

const CLOTHES = [0x4a4652, 0x5a4a3a, 0x3a4a4a, 0x554455, 0x46523e];

let seed = 777;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** Build N prone marchers scattered in the given rect. Returns the group. */
export function buildProtestField(
  minX: number, minZ: number, maxX: number, maxZ: number, count: number,
): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const person = new THREE.Group();
    const cloth = CLOTHES[Math.floor(rand() * CLOTHES.length)]!;
    const bodyMat = makePS1Material({ color: cloth });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.6), bodyMat);
    torso.position.y = 0.08;
    person.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 5, 4),
      makePS1Material({ color: 0xc9a68c }),
    );
    head.position.set(rand() * 0.1 - 0.05, 0.07, 0.4);
    person.add(head);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.5), bodyMat);
      leg.position.set(s * 0.1, 0.05, -0.5 - rand() * 0.1);
      leg.rotation.y = s * rand() * 0.4;
      person.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), bodyMat);
      arm.position.set(s * (0.24 + rand() * 0.1), 0.05, 0.1 + rand() * 0.2);
      arm.rotation.y = s * (0.4 + rand() * 0.6);
      person.add(arm);
    }
    // Roughly half still hold their placard.
    if (rand() < 0.55) {
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4),
        makePS1Material({ color: 0x8a7a5a }),
      );
      stick.rotation.z = Math.PI / 2 - 0.3 + rand() * 0.6;
      stick.position.set(0.4, 0.05, 0.25);
      person.add(stick);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.38),
        new THREE.MeshLambertMaterial({
          map: placardTexture(PLACARD_LINES[Math.floor(rand() * PLACARD_LINES.length)]!),
          side: THREE.DoubleSide,
        }),
      );
      sign.rotation.x = -Math.PI / 2 + 0.12;
      sign.position.set(0.75, 0.03, 0.25);
      person.add(sign);
    }
    person.position.set(
      minX + rand() * (maxX - minX),
      0.02,
      minZ + rand() * (maxZ - minZ),
    );
    person.rotation.y = rand() * Math.PI * 2;
    group.add(person);
  }
  return group;
}
