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

export interface Cat {
  def: CatDef;
  group: THREE.Group;
  tail: THREE.Object3D;
  head: THREE.Object3D;
  state: 'idle' | 'bolt' | 'gone' | 'descend' | 'approach';
  respawn: number;
  idlePhase: number;
  petted: boolean;
}

/** A petted cat answering the debt: dash in, one guaranteed crit, gone. */
interface Striker {
  group: THREE.Group;
  target: THREE.Object3D;
  phase: 'in' | 'out';
  onHit: () => void;
  retreat: THREE.Vector3;
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
  private strikers: Striker[] = [];
  /** Fires once, the first time Kat gets a good look at any of them. */
  onFirstSight: (() => void) | null = null;
  private sighted = false;

  constructor(private readonly scene: THREE.Scene, defs: CatDef[]) {
    for (const def of defs) {
      const { group, tail, head } = buildCat(def.coat);
      group.position.set(def.x, def.y, def.z);
      scene.add(group);
      this.cats.push({ def, group, tail, head, state: 'idle', respawn: 0, idlePhase: Math.random() * 10, petted: false });
    }
  }

  /** Coats of every petted cat — the pool of possible battle allies. */
  get pettedCoats(): CatDef['coat'][] {
    return this.cats.filter((c) => c.petted).map((c) => c.def.coat);
  }

  /** A trusted, unpetted cat close enough to touch, if any. */
  petCandidate(playerPos: THREE.Vector3, trusted: boolean): Cat | null {
    if (!trusted) return null;
    for (const c of this.cats) {
      if (c.petted || !c.group.visible) continue;
      if (c.state !== 'idle' && c.state !== 'approach') continue;
      if (c.group.position.distanceTo(playerPos) < 1.6) return c;
    }
    return null;
  }

  /** Pet it. (It was never dangerous.) */
  pet(cat: Cat): void {
    cat.petted = true;
    cat.idlePhase = 0;
  }

  /**
   * A petted cat answers during battle: streaks in from off screen, lands
   * one guaranteed crit (onHit fires at contact), and retreats into the dark.
   */
  strike(coat: CatDef['coat'], target: THREE.Object3D, onHit: () => void): void {
    const { group } = buildCat(coat);
    group.scale.set(1, 0.85, 1.3); // full-stretch run
    const angle = Math.random() * Math.PI * 2;
    const from = target.position.clone().add(new THREE.Vector3(Math.sin(angle) * 12, 0, Math.cos(angle) * 12));
    from.y = 0;
    group.position.copy(from);
    this.scene.add(group);
    const retreat = target.position.clone().add(new THREE.Vector3(Math.sin(angle + Math.PI) * 16, 0, Math.cos(angle + Math.PI) * 16));
    retreat.y = 0;
    this.strikers.push({ group, target, phase: 'in', onHit, retreat });
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

  update(dt: number, playerPos: THREE.Vector3, trusted = false): void {
    if (dt <= 0) return;

    // Battle allies streak through regardless of the daily routine.
    for (const s of this.strikers) {
      const goal = s.phase === 'in' ? s.target.position : s.retreat;
      const dir = goal.clone().sub(s.group.position).setY(0);
      const remaining = dir.length();
      if (s.phase === 'in' && remaining < 0.7) {
        s.onHit();
        s.phase = 'out';
        continue;
      }
      if (s.phase === 'out' && remaining < 1.2) {
        this.scene.remove(s.group);
        s.group.position.y = -99; // mark done
        continue;
      }
      dir.normalize();
      s.group.position.addScaledVector(dir, 8.5 * dt);
      // Low pounce-lope: the run reads at PS1 res.
      s.group.position.y = Math.abs(Math.sin(s.group.position.x * 3 + s.group.position.z * 3)) * 0.12;
      s.group.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.strikers = this.strikers.filter((s) => s.group.position.y > -50);

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
          if (trusted && dist < 7) {
            // She's earned it. Watchers come down; skitters come over.
            c.state = c.def.kind === 'watcher' && pos.y > 0.5 ? 'descend' : 'approach';
            break;
          }
          if (!trusted && c.def.kind === 'skitter' && dist < 5.5) {
            c.state = 'bolt';
          }
          break;
        }
        case 'descend': {
          // Hop down the wall face — cats always know a way down.
          pos.y = Math.max(0, pos.y - 3.2 * dt);
          if (pos.y <= 0) c.state = 'approach';
          break;
        }
        case 'approach': {
          c.idlePhase += dt;
          c.tail.rotation.z = Math.sin(c.idlePhase * 2.3) * 0.35;
          const toKat = playerPos.clone().sub(pos).setY(0);
          const dist = toKat.length();
          if (!trusted) {
            // Trust withdrawn (fresh run) — back to the old wariness.
            c.state = 'idle';
            break;
          }
          if (dist > 1.1 && dist < 12) {
            toKat.normalize();
            pos.addScaledVector(toKat, 1.3 * dt);
            c.group.rotation.y = Math.atan2(toKat.x, toKat.z);
          } else if (dist <= 1.1) {
            // Close enough to be pettable: face her, purr-sway.
            c.group.rotation.y = Math.atan2(toKat.x, toKat.z);
            c.group.rotation.z = Math.sin(c.idlePhase * 3.1) * (c.petted ? 0.1 : 0.04);
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
