import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';

// The cats of Kingsport. Five of them, ordinary housecats, and that is the
// whole point: every animal in the district twisted except these. They are
// set dressing with a thesis — something out here is immune — but nobody
// says that out loud. Kat can never reach one. Watchers sit on rooflines
// and wall tops and track her; skitters hold a street corner until she gets
// close, then bolt into an alley and are gone.

export interface CatDef {
  /** Coat name, for debugging/tests. */
  coat: 'black' | 'tabby' | 'calico' | 'gray' | 'tuxedo';
  x: number;
  y: number;
  z: number;
  kind: 'watcher' | 'skitter';
  /** Skitters only: where the bolt ends (inside an alley, off camera). */
  escape?: [number, number];
}

interface Cat {
  def: CatDef;
  group: THREE.Group;
  tail: THREE.Object3D;
  head: THREE.Object3D;
  state: 'idle' | 'bolt' | 'gone';
  respawn: number;
  idlePhase: number;
}

const COATS: Record<CatDef['coat'], { body: number; head: number; tail: number; patch?: number; eyes: number }> = {
  black: { body: 0x141210, head: 0x141210, tail: 0x141210, eyes: 0xd8e44a },
  tabby: { body: 0xa66a2e, head: 0x9a5f28, tail: 0x7e4d20, patch: 0x7e4d20, eyes: 0x9adf4e },
  calico: { body: 0xd8d2c4, head: 0xc07a34, tail: 0x201c18, patch: 0xc07a34, eyes: 0xd8b84a },
  gray: { body: 0x6a6a72, head: 0x6a6a72, tail: 0x5a5a62, eyes: 0x7ac4e0 },
  tuxedo: { body: 0x1a1816, head: 0x1a1816, tail: 0x1a1816, patch: 0xd8d4cc, eyes: 0xd8e44a },
};

function buildCat(coat: CatDef['coat']): { group: THREE.Group; tail: THREE.Object3D; head: THREE.Object3D } {
  const c = COATS[coat];
  const group = new THREE.Group();

  // Sitting pose: haunches up, chest forward, ~0.4 tall. +Z is its facing.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), makePS1Material({ color: c.body }));
  body.scale.set(0.85, 1.15, 1.15);
  body.position.set(0, 0.17, -0.03);
  body.rotation.x = -0.35;
  group.add(body);

  if (c.patch !== undefined) {
    // Chest/flank patch — the cheap way to read as a pattern at PS1 res.
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.085, 5, 4), makePS1Material({ color: c.patch }));
    patch.scale.set(0.9, 1, 0.6);
    patch.position.set(0, 0.16, 0.09);
    group.add(patch);
  }

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), makePS1Material({ color: c.head }));
  head.add(skull);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.085, 4), makePS1Material({ color: c.head }));
    ear.position.set(side * 0.055, 0.095, -0.01);
    ear.rotation.z = -side * 0.25;
    head.add(ear);
    // Eyeshine: fullbright pinpricks. At night this is all you really see.
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 4, 3),
      new THREE.MeshBasicMaterial({ color: c.eyes }),
    );
    eye.position.set(side * 0.038, 0.015, 0.082);
    head.add(eye);
  }
  head.position.set(0, 0.36, 0.07);
  group.add(head);

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.3, 4), makePS1Material({ color: c.tail }));
  tail.geometry.translate(0, 0.15, 0);
  tail.position.set(0.05, 0.08, -0.16);
  tail.rotation.x = 0.9;
  group.add(tail);

  return { group, tail, head };
}

export class Cats {
  private cats: Cat[] = [];
  /** Fires once, the first time Kat gets a good look at any of them. */
  onFirstSight: (() => void) | null = null;
  private sighted = false;

  constructor(scene: THREE.Scene, defs: CatDef[]) {
    for (const def of defs) {
      const { group, tail, head } = buildCat(def.coat);
      group.position.set(def.x, def.y, def.z);
      scene.add(group);
      this.cats.push({ def, group, tail, head, state: 'idle', respawn: 0, idlePhase: Math.random() * 10 });
    }
  }

  /** Dev/test visibility. */
  debugSnapshot(): { coat: string; kind: string; state: string; x: number; y: number; z: number }[] {
    return this.cats.map((c) => ({
      coat: c.def.coat,
      kind: c.def.kind,
      state: c.state,
      x: Math.round(c.group.position.x * 10) / 10,
      y: Math.round(c.group.position.y * 10) / 10,
      z: Math.round(c.group.position.z * 10) / 10,
    }));
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    if (dt <= 0) return;
    for (const c of this.cats) {
      const pos = c.group.position;
      switch (c.state) {
        case 'idle': {
          c.idlePhase += dt;
          // Tail plays metronome whether or not anyone is watching back.
          c.tail.rotation.z = Math.sin(c.idlePhase * 1.7) * 0.3;
          const dx = playerPos.x - pos.x;
          const dz = playerPos.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 20) {
            // It watches her. Head first, body a lazy beat behind.
            const yaw = Math.atan2(dx, dz);
            c.head.rotation.y = clampAngleDelta(yaw - c.group.rotation.y, 1.1);
            c.group.rotation.y += clampAngleDelta(yaw - c.group.rotation.y, 0) * Math.min(1, dt * 1.5);
          } else {
            c.head.rotation.y *= Math.max(0, 1 - dt * 2);
          }
          if (!this.sighted && dist < 9) {
            this.sighted = true;
            this.onFirstSight?.();
          }
          if (c.def.kind === 'skitter' && dist < 5.5) {
            c.state = 'bolt';
          }
          break;
        }
        case 'bolt': {
          const [ex, ez] = c.def.escape ?? [pos.x, pos.z];
          const dir = new THREE.Vector3(ex - pos.x, 0, ez - pos.z);
          const remaining = dir.length();
          if (remaining < 0.25) {
            // Into the alley and gone.
            c.state = 'gone';
            c.group.visible = false;
            c.respawn = 150 + Math.random() * 120;
            break;
          }
          dir.normalize();
          pos.addScaledVector(dir, 6.5 * dt);
          c.group.rotation.y = Math.atan2(dir.x, dir.z);
          c.head.rotation.y = 0;
          // Full-stretch run reads even on a sitting model at PS1 res.
          c.group.scale.set(1, 0.85, 1.25);
          c.tail.rotation.x = 1.5;
          break;
        }
        case 'gone': {
          c.respawn -= dt;
          if (c.respawn <= 0 && playerPos.distanceTo(new THREE.Vector3(c.def.x, 0, c.def.z)) > 10) {
            pos.set(c.def.x, c.def.y, c.def.z);
            c.group.visible = true;
            c.group.scale.set(1, 1, 1);
            c.tail.rotation.x = 0.9;
            c.state = 'idle';
          }
          break;
        }
      }
    }
  }
}

/** Shortest signed angle toward `delta`, clamped to ±`limit` (0 = no clamp). */
function clampAngleDelta(delta: number, limit: number): number {
  let d = delta % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return limit > 0 ? Math.max(-limit, Math.min(limit, d)) : d;
}
