import {
  DynamicTexture,
  Mesh,
  PBRMaterial,
  Scene,
  VertexBuffer,
} from '@babylonjs/core';

// The CC0 base character ships a body and hair, nothing else — outfits are a
// separate pack, and the only free one is medieval, which is no use in 1998.
//
// So her clothes are painted rather than modelled: walk the body mesh's
// triangles, classify each one by where it sits on the body (height up the
// figure, distance out from the spine), and rasterize it into a new albedo in
// UV space with the colour that limb should be. The result is baked into the
// texture she already skins with, so it deforms with every animation for free
// and costs nothing at runtime — the same procedural-texture discipline the
// rest of the project's surfaces use.
//
// It is set dressing, not tailoring: no cuffs, no collar, no folds. It reads
// correctly at the distance a fixed camera puts her at, which is the job.

const SIZE = 1024;

interface Region {
  /** Fraction of total body height, from the soles up. */
  from: number;
  to: number;
  /** Optional limit on distance out from the body's centre line. */
  maxSpread?: number;
  minSpread?: number;
  color: [number, number, number];
  /** Fabric speckle strength. */
  grain: number;
}

// Kat, as described: work boots, jeans, a dark tank, bare arms.
const OUTFIT: Region[] = [
  { from: -0.01, to: 0.075, color: [26, 22, 20], grain: 10 },   // boots
  { from: 0.075, to: 0.10, color: [38, 32, 28], grain: 8 },      // boot cuff
  { from: 0.10, to: 0.475, color: [46, 58, 84], grain: 16 },     // jeans
  { from: 0.475, to: 0.50, color: [34, 30, 30], grain: 8 },      // belt
  // Up to the shoulder line, and only near the spine: the spread limit is what
  // keeps the sleeves off her arms without needing to know where they are.
  { from: 0.50, to: 0.805, maxSpread: 0.19, color: [40, 42, 46], grain: 12 }, // tank
];

const SKIN: [number, number, number] = [176, 132, 104];

/**
 * Repaint `body`'s albedo with clothing. Call after the mesh is loaded and
 * before it is first rendered; the material's other channels are left alone.
 */
export function paintOutfit(scene: Scene, body: Mesh): void {
  const positions = body.getVerticesData(VertexBuffer.PositionKind);
  const uvs = body.getVerticesData(VertexBuffer.UVKind);
  const indices = body.getIndices();
  const material = body.material;
  if (!positions || !uvs || !indices || !(material instanceof PBRMaterial)) return;

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    const y = positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = maxY - minY || 1;

  const texture = new DynamicTexture('katOutfit', { width: SIZE, height: SIZE }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = rgb(SKIN);
  ctx.fillRect(0, 0, SIZE, SIZE);

  let seed = 90210;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;

    const cy = (positions[a * 3 + 1]! + positions[b * 3 + 1]! + positions[c * 3 + 1]!) / 3;
    const cx = (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3;
    const cz = (positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3;
    const h = (cy - minY) / height;
    // Arms sit far out from the spine at the same height as the torso, so
    // spread is what separates "tank top" from "bare shoulder".
    const spread = Math.hypot(cx, cz) / height;

    const region = OUTFIT.find(
      (r) => h >= r.from && h < r.to &&
        (r.maxSpread === undefined || spread <= r.maxSpread) &&
        (r.minSpread === undefined || spread >= r.minSpread),
    );
    if (!region) continue;

    const jitter = (rand() - 0.5) * region.grain;
    ctx.fillStyle = rgb([
      clampByte(region.color[0] + jitter),
      clampByte(region.color[1] + jitter),
      clampByte(region.color[2] + jitter),
    ]);
    ctx.beginPath();
    ctx.moveTo(uvs[a * 2]! * SIZE, (1 - uvs[a * 2 + 1]!) * SIZE);
    ctx.lineTo(uvs[b * 2]! * SIZE, (1 - uvs[b * 2 + 1]!) * SIZE);
    ctx.lineTo(uvs[c * 2]! * SIZE, (1 - uvs[c * 2 + 1]!) * SIZE);
    ctx.closePath();
    // Stroke as well as fill: adjacent triangles otherwise leave hairline
    // seams where the rasterizer rounds their shared edge differently.
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
  }

  texture.update(true);
  material.albedoTexture = texture;
  material.albedoColor.set(1, 1, 1);
  // The pack's normal/roughness maps describe a superhero suit that is no
  // longer there; flat cloth response reads better than the wrong detail.
  material.bumpTexture = null;
  material.metallic = 0;
  material.roughness = 0.78;
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
