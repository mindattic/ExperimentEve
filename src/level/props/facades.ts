import * as THREE from 'three';
import { makePS1Material, prepTexture } from '../../render/ps1/ps1Material';
import { clapboardTexture, brickTexture, plankTexture } from '../textures';

// Final visual pass over the greybox facades: gabled row houses with dark
// windows, and the two storefronts (the pawnshop and MEGAHIT VIDEO).
// Colliders stay data-driven in level01 (those boxes are now `hidden`).

function signTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = 128;
  cnv.height = 32;
  const ctx = cnv.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.font = `bold ${lines.length > 1 ? 11 : 16}px sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, 64, lines.length > 1 ? 13 + i * 13 : 21));
  return prepTexture(new THREE.CanvasTexture(cnv)) as THREE.CanvasTexture;
}

interface HouseOpts {
  w: number;
  d: number;
  h: number;
  tint?: number;
  litWindow?: boolean;
}

/** A gabled row house: textured walls, roof slabs, dark window quads, stoop. */
export function buildHouse(opts: HouseOpts): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = opts;

  const wallTex = clapboardTexture();
  wallTex.repeat.set(Math.max(1, w / 2), Math.max(1, h / 2.7));
  const wallMat = makePS1Material({ map: wallTex, color: opts.tint ?? 0xffffff });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d, Math.ceil(w / 1.5), 2, Math.ceil(d / 1.5)),
    wallMat,
  );
  body.position.y = h / 2;
  g.add(body);

  // Gable roof: two tilted slabs meeting at a ridge along x.
  const roofMat = makePS1Material({ color: 0x3a3034 });
  const slope = Math.hypot(d / 2, 1.1);
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.12, slope, Math.ceil(w / 1.5), 1, 2), roofMat);
    slab.position.set(0, h + 0.52, s * d / 4);
    slab.rotation.x = -s * Math.atan2(1.1, d / 2);
    g.add(slab);
  }
  // Gable end caps (triangles faked with a thin center box).
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.14), wallMat);
  cap.position.set(0, h + 0.4, 0);
  g.add(cap);

  // Windows: dark glass; optionally one warm lit one (somebody stayed).
  const darkMat = makePS1Material({ color: 0x10141c });
  const litMat = new THREE.MeshLambertMaterial({ color: 0x201408, emissive: 0xcc8830, emissiveIntensity: 0.85 });
  const cols = Math.max(2, Math.floor(w / 2.4));
  let litPlaced = !opts.litWindow;
  for (let c = 0; c < cols; c++) {
    for (const floorYy of h > 2.9 ? [1.5, h - 1.1] : [1.5]) {
      const useLit = !litPlaced && c === Math.floor(cols / 2) && floorYy > 2;
      if (useLit) litPlaced = true;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), useLit ? litMat : darkMat);
      win.position.set(-w / 2 + (c + 0.5) * (w / cols), floorYy, d / 2 + 0.02);
      g.add(win);
    }
  }

  // Door + stoop on the front face.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), makePS1Material({ color: 0x40342a }));
  door.position.set(w / 2 - 1.1, 0.85, d / 2 + 0.02);
  g.add(door);
  const stoop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.7), makePS1Material({ color: 0x5a5650 }));
  stoop.position.set(w / 2 - 1.1, 0.15, d / 2 + 0.35);
  g.add(stoop);
  return g;
}

interface StorefrontOpts {
  w: number;
  d: number;
  h: number;
  sign: string[];
  signBg: string;
  signFg: string;
  barred?: boolean;
}

/** Flat-roofed brick storefront with a lit sign board and big front glass. */
export function buildStorefront(opts: StorefrontOpts): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = opts;
  const tex = brickTexture();
  tex.repeat.set(Math.max(1, w / 2), Math.max(1, h / 2.7));
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d, Math.ceil(w / 1.5), 2, Math.ceil(d / 1.5)),
    makePS1Material({ map: tex }),
  );
  body.position.y = h / 2;
  g.add(body);
  // Parapet lip.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), makePS1Material({ color: 0x38302c }));
  lip.position.y = h + 0.12;
  g.add(lip);
  // Sign board over the front (south face), faintly glowing.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(w - 0.6, 4.6), 0.9),
    new THREE.MeshLambertMaterial({
      map: signTexture(opts.sign, opts.signBg, opts.signFg),
      emissive: 0x888888,
      emissiveMap: signTexture(opts.sign, opts.signBg, opts.signFg),
      emissiveIntensity: 0.55,
    }),
  );
  sign.position.set(0, h - 0.65, -d / 2 - 0.03);
  sign.rotation.y = Math.PI;
  g.add(sign);
  // Front glass, dark; bars optional.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.6, 1.5), makePS1Material({ color: 0x0e1218 }));
  glass.position.set(0, 1.15, -d / 2 - 0.02);
  glass.rotation.y = Math.PI;
  g.add(glass);
  if (opts.barred) {
    const barMat = makePS1Material({ color: 0x2a2e33 });
    const bars = Math.floor((w - 1.6) / 0.45);
    for (let i = 0; i <= bars; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), barMat);
      bar.position.set(-(w - 1.6) / 2 + i * 0.45, 1.15, -d / 2 - 0.08);
      g.add(bar);
    }
  }
  // Plank-boarded door.
  const doorTex = plankTexture();
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), makePS1Material({ map: doorTex }));
  door.position.set(w / 2 - 1.2, 0.95, -d / 2 - 0.02);
  door.rotation.y = Math.PI;
  g.add(door);
  return g;
}

/** A cobra-head street lamp; returns the group and its light for flicker. */
export function buildStreetLamp(): { group: THREE.Group; light: THREE.PointLight } {
  const g = new THREE.Group();
  const poleMat = makePS1Material({ color: 0x30343a });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 5), poleMat);
  pole.position.y = 2.2;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.55, 4.35, 0);
  g.add(arm);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0xffcf8a, emissiveIntensity: 0.9 }),
  );
  head.position.set(1.05, 4.3, 0);
  g.add(head);
  const light = new THREE.PointLight(0xffc37a, 1.5, 11);
  light.position.set(1.05, 4.1, 0);
  g.add(light);
  return { group: g, light };
}
