import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  Vector4,
} from '@babylonjs/core';
import { MAX_MATERIAL_LIGHTS } from '../../render/lightRig';
import type { SurfaceLibrary } from '../materials';

// The visual pass over the greybox facades: gabled row houses with dark
// windows, the two storefronts (the pawnshop and MEGAHIT VIDEO), and the
// cobra-head street lamps that actually light the streets. Colliders stay
// data-driven in level01 — those boxes are `hidden` there.

function signTexture(scene: Scene, lines: string[], bg: string, fg: string): DynamicTexture {
  const tex = new DynamicTexture(`sign-${lines[0]}`, { width: 512, height: 128 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.font = `bold ${lines.length > 1 ? 44 : 64}px sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, 256, lines.length > 1 ? 54 + i * 52 : 84));
  tex.update(false);
  return tex;
}

export interface HouseOpts {
  w: number;
  d: number;
  h: number;
  tint?: number;
  litWindow?: boolean;
}

/** A gabled row house: textured walls, roof slabs, dark window quads, stoop. */
export function buildHouse(
  scene: Scene,
  surfaces: SurfaceLibrary,
  opts: HouseOpts,
): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode('house', scene);
  const meshes: Mesh[] = [];
  const { w, d, h } = opts;
  const tile = surfaces.tileSize('clapboard');

  const body = MeshBuilder.CreateBox('houseBody', {
    width: w, height: h, depth: d,
    faceUV: [
      new Vector4(0, 0, w / tile, h / tile),
      new Vector4(0, 0, w / tile, h / tile),
      new Vector4(0, 0, d / tile, h / tile),
      new Vector4(0, 0, d / tile, h / tile),
      new Vector4(0, 0, w / tile, d / tile),
      new Vector4(0, 0, w / tile, d / tile),
    ],
  }, scene);
  body.position.y = h / 2;
  body.material = surfaces.get('clapboard');
  body.parent = root;
  meshes.push(body);

  // Gable roof: two tilted slabs meeting at a ridge along x.
  const roofMat = surfaces.solid(0x3a3034, 0.85);
  const slope = Math.hypot(d / 2, 1.1);
  for (const s of [-1, 1]) {
    const slab = MeshBuilder.CreateBox('roof', { width: w + 0.3, height: 0.12, depth: slope }, scene);
    slab.position.set(0, h + 0.52, (s * d) / 4);
    slab.rotation.x = -s * Math.atan2(1.1, d / 2);
    slab.material = roofMat;
    slab.parent = root;
    meshes.push(slab);
  }
  const cap = MeshBuilder.CreateBox('gable', { width: w, height: 1.0, depth: 0.14 }, scene);
  cap.position.set(0, h + 0.4, 0);
  cap.material = surfaces.get('clapboard');
  cap.parent = root;
  meshes.push(cap);

  // Windows: dark glass, with optionally one warm lit one (somebody stayed).
  const dark = new PBRMaterial('winDark', scene);
  dark.albedoColor = Color3.FromHexString('#10141c');
  dark.metallic = 0.6;
  dark.roughness = 0.18;
  dark.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
  const lit = new StandardMaterial('winLit', scene);
  lit.diffuseColor = Color3.FromHexString('#201408');
  lit.emissiveColor = Color3.FromHexString('#cc8830');
  lit.disableLighting = true;
  lit.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;

  const cols = Math.max(2, Math.floor(w / 2.4));
  let litPlaced = !opts.litWindow;
  for (let c = 0; c < cols; c++) {
    for (const wy of h > 2.9 ? [1.5, h - 1.1] : [1.5]) {
      const useLit = !litPlaced && c === Math.floor(cols / 2) && wy > 2;
      if (useLit) litPlaced = true;
      const win = MeshBuilder.CreatePlane('window', { width: 0.55, height: 0.8 }, scene);
      win.position.set(-w / 2 + (c + 0.5) * (w / cols), wy, d / 2 + 0.02);
      win.material = useLit ? lit : dark;
      win.parent = root;
      if (useLit) {
        // A real light behind the one lit window, so it spills onto the street.
        const glow = new PointLight('windowGlow', win.position.clone(), scene);
        glow.diffuse = Color3.FromHexString('#ffb45c');
        glow.intensity = 6;
        glow.range = 6;
        glow.parent = root;
      }
    }
  }

  const door = MeshBuilder.CreatePlane('door', { width: 0.8, height: 1.7 }, scene);
  door.position.set(w / 2 - 1.1, 0.85, d / 2 + 0.02);
  door.material = surfaces.solid(0x40342a);
  door.parent = root;
  const stoop = MeshBuilder.CreateBox('stoop', { width: 1.1, height: 0.3, depth: 0.7 }, scene);
  stoop.position.set(w / 2 - 1.1, 0.15, d / 2 + 0.35);
  stoop.material = surfaces.solid(0x5a5650);
  stoop.parent = root;
  meshes.push(stoop);

  return { root, meshes };
}

export interface StorefrontOpts {
  w: number;
  d: number;
  h: number;
  sign: string[];
  signBg: string;
  signFg: string;
  barred?: boolean;
}

/** Flat-roofed brick storefront with a lit sign board and big front glass. */
export function buildStorefront(
  scene: Scene,
  surfaces: SurfaceLibrary,
  opts: StorefrontOpts,
): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode('storefront', scene);
  const meshes: Mesh[] = [];
  const { w, d, h } = opts;
  const tile = surfaces.tileSize('brick');

  const body = MeshBuilder.CreateBox('shopBody', {
    width: w, height: h, depth: d,
    faceUV: [
      new Vector4(0, 0, w / tile, h / tile),
      new Vector4(0, 0, w / tile, h / tile),
      new Vector4(0, 0, d / tile, h / tile),
      new Vector4(0, 0, d / tile, h / tile),
      new Vector4(0, 0, w / tile, d / tile),
      new Vector4(0, 0, w / tile, d / tile),
    ],
  }, scene);
  body.position.y = h / 2;
  body.material = surfaces.get('brick');
  body.parent = root;
  meshes.push(body);

  const lip = MeshBuilder.CreateBox('parapet', { width: w + 0.2, height: 0.25, depth: d + 0.2 }, scene);
  lip.position.y = h + 0.12;
  lip.material = surfaces.solid(0x38302c);
  lip.parent = root;
  meshes.push(lip);

  // Sign board over the front (south face), genuinely emitting.
  const signMat = new StandardMaterial('signMat', scene);
  const signTex = signTexture(scene, opts.sign, opts.signBg, opts.signFg);
  signMat.diffuseTexture = signTex;
  signMat.emissiveTexture = signTex;
  signMat.emissiveColor = new Color3(0.85, 0.85, 0.85);
  signMat.specularColor = Color3.Black();
  signMat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
  const sign = MeshBuilder.CreatePlane('sign', { width: Math.min(w - 0.6, 4.6), height: 0.9 }, scene);
  sign.position.set(0, h - 0.65, -d / 2 - 0.03);
  sign.rotation.y = Math.PI;
  sign.material = signMat;
  sign.parent = root;

  const signGlow = new PointLight('signGlow', sign.position.add(sign.position.scale(0)), scene);
  signGlow.position.set(0, h - 0.9, -d / 2 - 0.7);
  signGlow.diffuse = Color3.FromHexString(opts.signFg);
  signGlow.intensity = 5;
  signGlow.range = 6;
  signGlow.parent = root;

  const glassMat = new PBRMaterial('shopGlass', scene);
  glassMat.albedoColor = Color3.FromHexString('#0e1218');
  glassMat.metallic = 0.7;
  glassMat.roughness = 0.14;
  glassMat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
  const glass = MeshBuilder.CreatePlane('glass', { width: w - 1.6, height: 1.5 }, scene);
  glass.position.set(0, 1.15, -d / 2 - 0.02);
  glass.rotation.y = Math.PI;
  glass.material = glassMat;
  glass.parent = root;

  if (opts.barred) {
    const barMat = surfaces.solid(0x2a2e33, 0.5);
    const bars = Math.floor((w - 1.6) / 0.45);
    for (let i = 0; i <= bars; i++) {
      const bar = MeshBuilder.CreateCylinder('bar', { diameter: 0.06, height: 1.6, tessellation: 6 }, scene);
      bar.position.set(-(w - 1.6) / 2 + i * 0.45, 1.15, -d / 2 - 0.08);
      bar.material = barMat;
      bar.parent = root;
      meshes.push(bar);
    }
  }

  const door = MeshBuilder.CreatePlane('shopDoor', { width: 0.9, height: 1.9 }, scene);
  door.position.set(w / 2 - 1.2, 0.95, -d / 2 - 0.02);
  door.rotation.y = Math.PI;
  door.material = surfaces.get('plank');
  door.parent = root;

  return { root, meshes };
}

/** A cobra-head street lamp; returns the group and its light for flicker. */
export function buildStreetLamp(
  scene: Scene,
  surfaces: SurfaceLibrary,
): { root: TransformNode; light: PointLight; meshes: Mesh[] } {
  const root = new TransformNode('streetLamp', scene);
  const poleMat = surfaces.solid(0x30343a, 0.55);
  const meshes: Mesh[] = [];

  const pole = MeshBuilder.CreateCylinder('pole', { diameterTop: 0.14, diameterBottom: 0.18, height: 4.4, tessellation: 10 }, scene);
  pole.position.y = 2.2;
  pole.material = poleMat;
  pole.parent = root;
  meshes.push(pole);

  const arm = MeshBuilder.CreateCylinder('lampArm', { diameter: 0.1, height: 1.1, tessellation: 8 }, scene);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.55, 4.35, 0);
  arm.material = poleMat;
  arm.parent = root;
  meshes.push(arm);

  const headMat = new StandardMaterial('lampHead', scene);
  headMat.diffuseColor = Color3.FromHexString('#222222');
  headMat.emissiveColor = Color3.FromHexString('#ffcf8a');
  headMat.specularColor = Color3.Black();
  headMat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
  const head = MeshBuilder.CreateBox('lampHead', { width: 0.5, height: 0.14, depth: 0.22 }, scene);
  head.position.set(1.05, 4.3, 0);
  head.material = headMat;
  head.parent = root;

  const light = new PointLight('lampLight', new Vector3(1.05, 4.1, 0), scene);
  light.diffuse = Color3.FromHexString('#ffc37a');
  light.intensity = 22;
  light.range = 12;
  light.radius = 0.3;
  light.parent = root;

  return { root, light, meshes };
}
