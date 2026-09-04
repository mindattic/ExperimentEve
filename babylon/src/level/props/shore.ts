import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  Vector2,
  type AbstractMesh,
} from '@babylonjs/core';
import { WaterMaterial } from '@babylonjs/materials';
import type { SurfaceLibrary } from '../materials';

// The shore she washes up on, north of the tracks: black water out to the
// island, granite the bay dropped her on, and the half a rented rowboat that
// didn't make it. This is the first thing the player ever sees, so the water is
// real WaterMaterial — moving, reflecting the sky — rather than a flat plane.

export interface Shore {
  water: Mesh;
  meshes: AbstractMesh[];
}

export function buildShore(scene: Scene, surfaces: SurfaceLibrary, skybox: Mesh): Shore {
  const meshes: AbstractMesh[] = [];

  const water = MeshBuilder.CreateGround('water', { width: 400, height: 400, subdivisions: 32 }, scene);
  water.position.set(0, -0.22, 120);
  water.isPickable = false;

  const material = new WaterMaterial('waterMat', scene, new Vector2(512, 512));
  material.bumpTexture = rippleTexture(scene);
  material.windForce = -2.4;
  material.waveHeight = 0.06;
  material.waveLength = 0.24;
  material.bumpHeight = 0.32;
  material.windDirection = new Vector2(0.6, 1);
  material.waterColor = new Color3(0.014, 0.026, 0.038);
  material.colorBlendFactor = 0.22;
  material.alpha = 1;
  // The water shader is the heaviest in the scene; the lamps contribute
  // nothing to open bay water and 16 light slots overflowed the vertex
  // uniform buffers outright.
  material.maxSimultaneousLights = 2;
  // Reflecting the sky is what sells black water at night; reflecting the
  // whole district would cost a second pass over everything for no gain.
  material.addToRenderList(skybox);
  water.material = material;

  // Granite: the bay's idea of a landing strip.
  const granite = surfaces.get('plain');
  const slabs: [number, number, number, number, number, number][] = [
    // x, z, w, d, h, rotY
    [-5.0, 39.6, 2.4, 1.5, 0.5, 0.2],
    [-2.0, 40.4, 3.2, 1.8, 0.7, -0.15],
    [2.6, 39.2, 2.0, 1.2, 0.35, 0.5],
    [-8.5, 40.8, 3.6, 2.2, 0.9, 0.35],
    [5.5, 40.6, 4.0, 2.4, 1.1, -0.3],
    [-0.5, 41.6, 6.0, 2.6, 1.3, 0.1],
  ];
  for (const [x, z, w, d, h, ry] of slabs) {
    const slab = MeshBuilder.CreateBox('granite', { width: w, height: h, depth: d }, scene);
    slab.position.set(x, h / 2 - 0.12, z);
    slab.rotation.set(0.04, ry, 0.03);
    slab.material = granite;
    slab.receiveShadows = true;
    slab.isPickable = false;
    meshes.push(slab);
  }

  // Half a rented rowboat, folded over the granite. The bay kept the rest.
  const hullMat = surfaces.solid(0x6d5138, 0.85);
  const hull = MeshBuilder.CreateCylinder('wreckHull', {
    diameterTop: 1.3, diameterBottom: 0.5, height: 2.8, tessellation: 8, arc: 0.55,
  }, scene);
  hull.position.set(-3.4, 0.45, 39.7);
  hull.rotation.set(Math.PI / 2 - 0.35, 0.6, Math.PI * 0.08);
  hull.material = hullMat;
  hull.receiveShadows = true;
  meshes.push(hull);

  for (let i = 0; i < 5; i++) {
    const rib = MeshBuilder.CreateBox('wreckRib', { width: 0.09, height: 0.5, depth: 1.15 }, scene);
    rib.position.set(-4.3 + i * 0.44, 0.3 + (i % 2) * 0.06, 39.4 + (i % 3) * 0.16);
    rib.rotation.set(0.3, 0.5 + i * 0.06, 0.12);
    rib.material = hullMat;
    rib.receiveShadows = true;
    meshes.push(rib);
  }
  // A snapped oar, and the plank the deposit bought.
  const oar = MeshBuilder.CreateCylinder('oar', { diameter: 0.075, height: 1.9, tessellation: 6 }, scene);
  oar.position.set(-1.9, 0.2, 40.2);
  oar.rotation.set(Math.PI / 2 - 0.1, 1.1, 0);
  oar.material = hullMat;
  meshes.push(oar);

  // The seagull on the stern. It is a normal seagull.
  const gull = buildGull(scene, surfaces);
  gull.position.set(-1.4, 0.62, 39.6);
  gull.rotation.y = -1.2;
  meshes.push(gull);

  return { water, meshes };
}

function buildGull(scene: Scene, surfaces: SurfaceLibrary): Mesh {
  const bodyMat = surfaces.solid(0xdfe3e6, 0.8);
  const body = MeshBuilder.CreateSphere('gull', { diameterX: 0.2, diameterY: 0.2, diameterZ: 0.34, segments: 8 }, scene);
  body.material = bodyMat;

  const head = MeshBuilder.CreateSphere('gullHead', { diameter: 0.13, segments: 8 }, scene);
  head.position.set(0, 0.11, 0.14);
  head.material = bodyMat;
  head.parent = body;

  const beak = MeshBuilder.CreateCylinder('gullBeak', { diameterTop: 0, diameterBottom: 0.045, height: 0.12, tessellation: 6 }, scene);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.1, 0.23);
  beak.material = surfaces.solid(0xe0a020, 0.6);
  beak.parent = body;

  const tail = MeshBuilder.CreateBox('gullTail', { width: 0.14, height: 0.03, depth: 0.16 }, scene);
  tail.position.set(0, 0.02, -0.2);
  tail.rotation.x = -0.3;
  tail.material = bodyMat;
  tail.parent = body;

  body.isPickable = false;
  return body;
}

/** A tiling ripple normal map for the water's bump. */
function rippleTexture(scene: Scene): DynamicTexture {
  const size = 512;
  const tex = new DynamicTexture('ripple', { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const h =
        Math.sin(u * 4) * 0.35 + Math.sin(v * 5 + 1.3) * 0.3 +
        Math.sin((u + v) * 7) * 0.2 + Math.sin((u - v) * 11) * 0.15;
      const nx = Math.cos(u * 4) * 0.5;
      const ny = Math.cos(v * 5 + 1.3) * 0.5;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255 * (0.5 + h * 0.1);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(true);
  return tex;
}
