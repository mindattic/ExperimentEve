import {
  Color3,
  DynamicTexture,
  PBRMaterial,
  Scene,
  Texture,
} from '@babylonjs/core';
import { MAX_MATERIAL_LIGHTS } from '../render/lightRig';

// Procedural surfaces, drawn once into canvases and used as PBR albedo plus a
// Sobel-derived normal map. Keeps the "no external art assets" constraint the
// project has always had, without the flat untextured look that came with it.
//
// One material per surface kind, always. Tiling is baked into each mesh's UVs
// (see tileSize) instead of set per-material, so every wall sharing a texture
// can be merged into a single draw call.

export type SurfaceKind =
  | 'brick' | 'clapboard' | 'plank' | 'interior' | 'plain'
  | 'asphalt' | 'grass' | 'gravel' | 'chainlink';

const SIZE = 512;

interface SurfaceSpec {
  roughness: number;
  bumpStrength: number;
  /** World metres covered by one texture tile. */
  tile: number;
  paint(ctx: CanvasRenderingContext2D, rand: () => number): void;
}

const SPECS: Record<SurfaceKind, SurfaceSpec> = {
  brick: { roughness: 0.88, bumpStrength: 1.5, tile: 2.4, paint: paintBrick },
  clapboard: { roughness: 0.82, bumpStrength: 1.1, tile: 2.6, paint: paintClapboard },
  plank: { roughness: 0.86, bumpStrength: 1.2, tile: 2.2, paint: paintPlank },
  interior: { roughness: 0.92, bumpStrength: 0.45, tile: 2.8, paint: paintInterior },
  plain: { roughness: 0.8, bumpStrength: 0.5, tile: 3.0, paint: paintConcrete },
  asphalt: { roughness: 0.58, bumpStrength: 0.8, tile: 5.0, paint: paintAsphalt },
  grass: { roughness: 0.9, bumpStrength: 0.9, tile: 3.2, paint: paintGrass },
  gravel: { roughness: 0.8, bumpStrength: 1.4, tile: 2.6, paint: paintGravel },
  chainlink: { roughness: 0.4, bumpStrength: 0.6, tile: 1.4, paint: paintChainlink },
};

export class SurfaceLibrary {
  private cache = new Map<string, PBRMaterial>();

  constructor(private scene: Scene) {}

  /** World metres per texture tile — multiply into mesh UVs. */
  tileSize(kind: SurfaceKind): number {
    return SPECS[kind].tile;
  }

  get(kind: SurfaceKind): PBRMaterial {
    const hit = this.cache.get(kind);
    if (hit) return hit;

    const spec = SPECS[kind];
    const albedo = new DynamicTexture(`tex-${kind}`, { width: SIZE, height: SIZE }, this.scene, true);
    const ctx = albedo.getContext() as CanvasRenderingContext2D;
    spec.paint(ctx, seededRandom(kind.length * 7919 + 13));
    albedo.update(true);
    wrap(albedo);

    const normal = normalFromAlbedo(this.scene, albedo, kind);
    wrap(normal);

    const mat = new PBRMaterial(`mat-${kind}`, this.scene);
    mat.albedoTexture = albedo;
    mat.bumpTexture = normal;
    mat.bumpTexture.level = spec.bumpStrength;
    mat.metallic = 0;
    mat.roughness = spec.roughness;
    mat.environmentIntensity = 0.55;
    mat.specularIntensity = 0.5;
    mat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
    if (kind === 'chainlink') {
      albedo.hasAlpha = true;
      mat.useAlphaFromAlbedoTexture = true;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      mat.backFaceCulling = false;
      mat.metallic = 0.7;
    }
    this.cache.set(kind, mat);
    return mat;
  }

  /** Flat-coloured PBR for the authored prop boxes. */
  solid(hex: number, roughness = 0.75): PBRMaterial {
    const key = `solid|${hex}|${roughness}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const mat = new PBRMaterial(`mat-${key}`, this.scene);
    mat.albedoColor = Color3.FromHexString(`#${hex.toString(16).padStart(6, '0')}`);
    mat.metallic = 0;
    mat.roughness = roughness;
    mat.environmentIntensity = 0.5;
    mat.maxSimultaneousLights = MAX_MATERIAL_LIGHTS;
    this.cache.set(key, mat);
    return mat;
  }
}

function wrap(tex: Texture): void {
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
}

/** Sobel the albedo's luminance into a tangent-space normal map. */
function normalFromAlbedo(scene: Scene, albedo: DynamicTexture, kind: string): DynamicTexture {
  const src = (albedo.getContext() as CanvasRenderingContext2D).getImageData(0, 0, SIZE, SIZE);
  const out = new DynamicTexture(`nrm-${kind}`, { width: SIZE, height: SIZE }, scene, true);
  const octx = out.getContext() as CanvasRenderingContext2D;
  const dst = octx.createImageData(SIZE, SIZE);

  const lum = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    lum[i] =
      (src.data[i * 4]! * 0.299 + src.data[i * 4 + 1]! * 0.587 + src.data[i * 4 + 2]! * 0.114) / 255;
  }
  const at = (x: number, y: number): number =>
    lum[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        at(x + 1, y - 1) - 2 * at(x + 1, y) - at(x + 1, y + 1);
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
      const nx = dx * 2;
      const ny = dy * 2;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * SIZE + x) * 4;
      dst.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      dst.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      dst.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      dst.data[i + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  out.update(true);
  return out;
}

function seededRandom(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function noiseOverlay(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  count: number,
  maxR: number,
  alpha: number,
  tint: [number, number, number],
): void {
  for (let i = 0; i < count; i++) {
    const a = rand() * alpha;
    ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${a.toFixed(3)})`;
    const r = rand() * maxR + 0.4;
    ctx.beginPath();
    ctx.arc(rand() * SIZE, rand() * SIZE, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBrick(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#2b2622';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rows = 16;
  const bh = SIZE / rows;
  const bw = SIZE / 8;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : -bw / 2;
    for (let c = -1; c <= 8; c++) {
      const x = c * bw + offset + 1.5;
      const y = r * bh + 1.5;
      const w = bw - 3;
      const h = bh - 3;
      const tone = 0.72 + rand() * 0.5;
      ctx.fillStyle = `rgb(${Math.round(96 * tone)},${Math.round(52 * tone)},${Math.round(42 * tone)})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(255,235,215,${(rand() * 0.06).toFixed(3)})`;
      ctx.fillRect(x, y, w, 1.5);
      ctx.fillStyle = `rgba(0,0,0,${(rand() * 0.16).toFixed(3)})`;
      ctx.fillRect(x, y + h - 2, w, 2);
    }
  }
  noiseOverlay(ctx, rand, 900, 2.4, 0.1, [20, 16, 14]);
  const grime = ctx.createLinearGradient(0, SIZE, 0, SIZE * 0.35);
  grime.addColorStop(0, 'rgba(10,10,12,0.42)');
  grime.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function paintClapboard(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const boards = 12;
  const bh = SIZE / boards;
  for (let i = 0; i < boards; i++) {
    const tone = 0.82 + rand() * 0.32;
    ctx.fillStyle = `rgb(${Math.round(150 * tone)},${Math.round(146 * tone)},${Math.round(130 * tone)})`;
    ctx.fillRect(0, i * bh, SIZE, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(0, i * bh + bh - 3, SIZE, 3);
    ctx.fillStyle = 'rgba(255,255,250,0.07)';
    ctx.fillRect(0, i * bh + 1, SIZE, 2);
    for (let p = 0; p < 5; p++) {
      if (rand() > 0.55) continue;
      ctx.fillStyle = `rgba(96,84,68,${(rand() * 0.4 + 0.15).toFixed(3)})`;
      ctx.fillRect(rand() * SIZE, i * bh + rand() * bh * 0.6, rand() * 26 + 6, rand() * 5 + 2);
    }
  }
  noiseOverlay(ctx, rand, 600, 1.8, 0.07, [40, 36, 30]);
}

function paintPlank(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const planks = 7;
  const pw = SIZE / planks;
  for (let i = 0; i < planks; i++) {
    const tone = 0.75 + rand() * 0.4;
    ctx.fillStyle = `rgb(${Math.round(104 * tone)},${Math.round(78 * tone)},${Math.round(52 * tone)})`;
    ctx.fillRect(i * pw, 0, pw, SIZE);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(48,34,22,${(rand() * 0.3 + 0.05).toFixed(3)})`;
      ctx.lineWidth = rand() * 1.4 + 0.3;
      const x = i * pw + rand() * pw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= SIZE; y += 48) {
        ctx.lineTo(x + Math.sin((y / SIZE) * Math.PI * 2 + i) * 2.4, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(i * pw + pw - 2, 0, 2, SIZE);
  }
  noiseOverlay(ctx, rand, 500, 2, 0.08, [30, 22, 14]);
}

function paintInterior(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#b9ac95';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let x = 0; x < SIZE; x += 34) {
    ctx.fillStyle = 'rgba(150,132,108,0.55)';
    ctx.fillRect(x, 0, 3, SIZE);
    ctx.fillStyle = 'rgba(168,152,126,0.4)';
    ctx.fillRect(x + 7, 0, 1.5, SIZE);
  }
  for (let i = 0; i < 7; i++) {
    const g = ctx.createRadialGradient(rand() * SIZE, rand() * SIZE, 2, rand() * SIZE, rand() * SIZE, rand() * 70 + 25);
    g.addColorStop(0, 'rgba(112,96,70,0.3)');
    g.addColorStop(1, 'rgba(112,96,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  noiseOverlay(ctx, rand, 400, 1.6, 0.05, [90, 80, 64]);
}

function paintConcrete(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#6e6f72';
  ctx.fillRect(0, 0, SIZE, SIZE);
  noiseOverlay(ctx, rand, 1600, 3.2, 0.1, [40, 42, 46]);
  noiseOverlay(ctx, rand, 700, 2.2, 0.08, [200, 202, 206]);
}

function paintAsphalt(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#34363c';
  ctx.fillRect(0, 0, SIZE, SIZE);
  noiseOverlay(ctx, rand, 4200, 2.6, 0.16, [92, 94, 100]);
  noiseOverlay(ctx, rand, 1800, 2, 0.09, [10, 10, 12]);
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(12,12,14,${(rand() * 0.5 + 0.3).toFixed(3)})`;
    ctx.lineWidth = rand() * 1.8 + 0.5;
    ctx.beginPath();
    let x = rand() * SIZE;
    let y = rand() * SIZE;
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (rand() - 0.5) * 90;
      y += (rand() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const g = ctx.createRadialGradient(rand() * SIZE, rand() * SIZE, 4, rand() * SIZE, rand() * SIZE, rand() * 90 + 40);
    g.addColorStop(0, 'rgba(14,16,20,0.5)');
    g.addColorStop(1, 'rgba(14,16,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

function paintGrass(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#242f21';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 6000; i++) {
    const g = Math.round(52 + rand() * 58);
    ctx.strokeStyle = `rgba(${Math.round(g * 0.55)},${g},${Math.round(g * 0.45)},${(rand() * 0.6 + 0.2).toFixed(2)})`;
    ctx.lineWidth = rand() * 1.1 + 0.3;
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y - rand() * 6 - 2);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const g = ctx.createRadialGradient(rand() * SIZE, rand() * SIZE, 3, rand() * SIZE, rand() * SIZE, rand() * 60 + 20);
    g.addColorStop(0, 'rgba(58,46,32,0.55)');
    g.addColorStop(1, 'rgba(58,46,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

function paintGravel(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#3a3733';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 2600; i++) {
    const tone = 0.5 + rand() * 0.75;
    const r = rand() * 4.5 + 1.2;
    ctx.fillStyle = `rgb(${Math.round(120 * tone)},${Math.round(116 * tone)},${Math.round(106 * tone)})`;
    ctx.beginPath();
    ctx.ellipse(rand() * SIZE, rand() * SIZE, r, r * (0.6 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${(rand() * 0.3).toFixed(2)})`;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, r * 0.8, 1);
  }
  noiseOverlay(ctx, rand, 900, 2, 0.12, [16, 15, 14]);
}

function paintChainlink(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const step = 32;
  ctx.lineWidth = 3.2;
  for (let i = -SIZE; i < SIZE * 2; i += step) {
    ctx.strokeStyle = `rgba(176,182,188,${(0.75 + rand() * 0.25).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + SIZE, SIZE);
    ctx.stroke();
    ctx.strokeStyle = `rgba(150,156,162,${(0.7 + rand() * 0.3).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(i + SIZE, 0);
    ctx.lineTo(i, SIZE);
    ctx.stroke();
  }
}
