import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';

// The shore north of the tracks: where Kat washes up. Black water out to
// the fog line, New England granite at the waterline, and what's left of
// the rowboat that got her here — bow wedged on the rocks, stern peeking
// out of the water with a seagull riding it. A normal seagull. So far.

const WATER_Y = -0.1;

function rock(x: number, z: number, s: number, squash = 0.6): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(s, 0),
    makePS1Material({ color: 0x555a60 + ((Math.floor(x * 7 + z * 13) % 3) * 0x040404) }),
  );
  m.position.set(x, s * squash * 0.4, z);
  m.scale.y = squash;
  m.rotation.set(x * 1.7, z * 2.3, x + z);
  return m;
}

function plank(w: number, l: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, l), makePS1Material({ color }));
}

const HULL = 0x84483a;
const HULL_DARK = 0x5e3226;
const HULL_INNER = 0x9a8a68;

export interface Shore {
  readonly group: THREE.Group;
  update(dt: number): void;
  /** World position of the perched gull (Puffergull spawn point). */
  gullWorldPos(): THREE.Vector3;
  /** The gull just got shot — remove the perched decoration. */
  removeGull(): void;
  readonly gullAlive: boolean;
}

export function buildShore(): Shore {
  const group = new THREE.Group();

  // Water: a dark sheet running out into the fog.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(76, 28),
    makePS1Material({ color: 0x0c1622 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_Y, 54);
  group.add(water);

  // Foam line breathing at the waterline.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x9ab4c0, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, WATER_Y + 0.03, 40.9);
  group.add(foam);

  // Granite at the waterline — the rocks that ended the boat.
  for (const [x, z, s] of [
    [-4.3, 40.7, 0.9], [-2.7, 41.4, 0.7], [-5.4, 41.6, 1.1], [-1.4, 40.9, 0.5],
    [-3.5, 42.4, 0.6], [-5.0, 39.7, 0.45], [-0.3, 41.8, 0.8],
    [4.2, 41.1, 0.7], [6.8, 40.6, 1.0], [8.4, 41.9, 0.6], [-9.5, 41.2, 0.9],
    [-11.8, 40.5, 0.55], [11.5, 41.0, 0.8],
  ] as const) {
    group.add(rock(x, z, s));
  }

  // ---- The rowboat, in two arguments with the rocks -----------------
  // Bow half: wedged up on the granite, cracked open at the break line.
  const bow = new THREE.Group();
  const keel = plank(0.72, 1.7, HULL_DARK);
  keel.position.y = 0.06;
  bow.add(keel);
  for (const s of [-1, 1]) {
    const side = plank(0.09, 1.6, HULL);
    side.rotation.z = s * 1.25;
    side.position.set(s * 0.42, 0.26, 0);
    bow.add(side);
    const gunwale = plank(0.07, 1.62, HULL_DARK);
    gunwale.rotation.z = s * 1.25;
    gunwale.position.set(s * 0.5, 0.42, 0);
    bow.add(gunwale);
    // Splintered stubs past the break.
    const stub = plank(0.09, 0.4, HULL);
    stub.rotation.set(0.4 * s, s * 0.5, s * 1.15);
    stub.position.set(s * 0.4, 0.2, -0.95);
    bow.add(stub);
  }
  // Stem post + a bench that stayed.
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.12), makePS1Material({ color: HULL_DARK }));
  stem.position.set(0, 0.3, 0.86);
  stem.rotation.x = -0.5;
  bow.add(stem);
  const bench = plank(0.8, 0.22, HULL_INNER);
  bench.position.set(0, 0.3, 0.25);
  bow.add(bench);
  bow.position.set(-3.6, 0.35, 40.9);
  bow.rotation.set(0.32, -0.55, 0.24); // heaved up the rocks, listing
  group.add(bow);

  // Loose planks the surf spat out.
  for (const [x, z, ry] of [[-2.3, 39.9, 0.7], [-4.6, 39.4, 2.3], [-1.7, 40.4, 1.4]] as const) {
    const p = plank(0.14, 0.9, HULL);
    p.position.set(x, 0.05, z);
    p.rotation.set(0, ry, 0.08);
    group.add(p);
  }

  // Stern half: out in the water, transom up, riding the swell.
  const stern = new THREE.Group();
  const transom = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.07), makePS1Material({ color: HULL }));
  transom.position.y = 0.25;
  stern.add(transom);
  const transomTrim = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.1), makePS1Material({ color: HULL_DARK }));
  transomTrim.position.y = 0.5;
  stern.add(transomTrim);
  for (const s of [-1, 1]) {
    const side = plank(0.08, 0.7, HULL);
    side.rotation.z = s * 1.25;
    side.rotation.x = -0.35;
    side.position.set(s * 0.4, 0.14, 0.32);
    stern.add(side);
  }
  stern.position.set(-1.3, -0.18, 43.6);
  stern.rotation.set(-0.45, 0.35, 0.1); // pitched back, mostly under
  group.add(stern);

  // ---- The seagull, perched on the transom, riding the wreck --------
  const gull = new THREE.Group();
  gull.scale.setScalar(1.3); // reads at PSX-HD across the dark water
  const feather = makePS1Material({ color: 0xf2eee2 });
  const wingMat = makePS1Material({ color: 0xb0aca0 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), feather);
  body.scale.set(0.85, 0.8, 1.25);
  body.position.y = 0.1;
  gull.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 5), feather);
  head.position.set(0, 0.22, 0.09);
  gull.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 5), makePS1Material({ color: 0xd8a030 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.215, 0.16);
  head.add(beak);
  beak.position.set(0, 0, 0.08);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 3), makePS1Material({ color: 0x1a1a1a }));
    eye.position.set(s * 0.04, 0.02, 0.045);
    head.add(eye);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.18), wingMat);
    wing.position.set(s * 0.09, 0.13, -0.01);
    wing.rotation.z = s * -0.2;
    gull.add(wing);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.12), wingMat);
  tail.position.set(0, 0.12, -0.16);
  tail.rotation.x = 0.25;
  gull.add(tail);
  gull.position.set(0, 0.54, 0); // atop the transom trim
  gull.rotation.y = Math.PI; // watching the shore
  stern.add(gull);

  let t = Math.random() * 10;
  let headYawTarget = 0;
  let headTimer = 1.5;
  let gullAlive = true;

  const sternBaseY = stern.position.y;
  const sternBaseRotZ = stern.rotation.z;

  return {
    group,
    get gullAlive() {
      return gullAlive;
    },
    gullWorldPos(): THREE.Vector3 {
      return gull.getWorldPosition(new THREE.Vector3());
    },
    removeGull(): void {
      gullAlive = false;
      stern.remove(gull);
    },
    update(dt: number): void {
      t += dt;
      // The stern rides the swell; the gull rides the stern.
      stern.position.y = sternBaseY + Math.sin(t * 0.55) * 0.05;
      stern.rotation.z = sternBaseRotZ + Math.sin(t * 0.7 + 1) * 0.05;
      foam.position.z = 40.9 + Math.sin(t * 0.4) * 0.25;
      (foam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 0.8) * 0.05;
      if (!gullAlive) return;
      // Gull idle: it checks the street, the water, the street again.
      headTimer -= dt;
      if (headTimer <= 0) {
        headTimer = 1.2 + Math.random() * 2.6;
        headYawTarget = (Math.random() - 0.5) * 1.6;
      }
      head.rotation.y += (headYawTarget - head.rotation.y) * Math.min(1, dt * 6);
      // The occasional settle-shuffle.
      body.rotation.z = Math.sin(t * 0.9) * 0.03;
    },
  };
}
