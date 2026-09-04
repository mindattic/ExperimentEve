import {
  Color3,
  Color4,
  Constants,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Quaternion,
  StandardMaterial,
  Texture,
  Vector3,
  type Scene,
} from '@babylonjs/core';

// Combat feedback: muzzle flash, tracer, blood, spall, and the stain that's
// still on the asphalt a minute later.
//
// The Three build did this with one Points cloud and a hand-rolled pool,
// because a PS1-era look wanted screen-facing squares of flat colour. That
// constraint is gone. Babylon's ParticleSystem already pools, billboards and
// blends, so the pool here is only for the two things it does NOT do: the
// tracer (a stretched additive cylinder, not a spray) and the ground stains
// (persistent decals that outlive their event by half a minute).
//
// Every burst runs additive or alpha-blended through the existing bloom, which
// is what turns a muzzle flash from a yellow dot into a flash. Nothing here
// loads a file — the sprite is a radial gradient painted into a 64px canvas.

/**
 * Particle time advances in seconds when updateSpeed is 1/60, because Babylon
 * scales it by the animation ratio (60 / actual fps). Lifetimes below are
 * therefore readable as real seconds.
 */
const BASE_SPEED = 1 / 60;
const MAX_STAINS = 16;
const MAX_TRACERS = 6;
/** Six frames at 60fps: long enough to register, short enough to be a shot. */
const TRACER_SECONDS = 0.1;
const TRACER_THICKNESS = 0.045;

interface Tracer {
  mesh: Mesh;
  material: StandardMaterial;
  age: number;
}

interface Stain {
  mesh: Mesh;
  material: StandardMaterial;
  age: number;
  life: number;
  radius: number;
}

interface SystemSpec {
  capacity: number;
  /** Birth colour range, and the colour it dies at (alpha 0 = fades out). */
  color1: Color4;
  color2: Color4;
  colorDead: Color4;
  minSize: number;
  maxSize: number;
  minLife: number;
  maxLife: number;
  minPower: number;
  maxPower: number;
  /** Metres per second squared, positive = falls. */
  gravity: number;
  additive: boolean;
}

export class Particles {
  private readonly flash: ParticleSystem;
  private readonly sparks: ParticleSystem;
  private readonly spall: ParticleSystem;
  private readonly blood: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly all: ParticleSystem[];

  private readonly tracers: Tracer[] = [];
  private readonly stains: Stain[] = [];
  private nextTracer = 0;
  private timeScale = 1;
  /** Cumulative, for the harness: a tracer lives 80ms and is easy to sample past. */
  private tracersFired = 0;
  private particlesEmitted = 0;

  private readonly dir = new Vector3();
  private readonly mid = new Vector3();

  constructor(private readonly scene: Scene) {
    const sprite = paintDot(scene);

    this.flash = this.build('fxFlash', sprite, {
      capacity: 60,
      color1: new Color4(1, 0.94, 0.72, 1),
      color2: new Color4(1, 0.78, 0.36, 1),
      colorDead: new Color4(1, 0.5, 0.1, 0),
      // Lifetimes deliberately overlap TRACER_SECONDS: the flash and the line
      // are one event, and a flash that dies first reads as two.
      minSize: 0.28, maxSize: 0.62,
      minLife: 0.05, maxLife: 0.1,
      minPower: 0.2, maxPower: 1.2,
      gravity: 0,
      additive: true,
    });

    this.sparks = this.build('fxSparks', sprite, {
      capacity: 400,
      color1: new Color4(1, 0.95, 0.7, 1),
      color2: new Color4(1, 0.6, 0.18, 1),
      colorDead: new Color4(0.5, 0.08, 0, 0),
      minSize: 0.015, maxSize: 0.055,
      minLife: 0.08, maxLife: 0.26,
      minPower: 2.5, maxPower: 8,
      gravity: 7,
      additive: true,
    });

    // Cold and hard, so a round that skated off armour never reads as a wound.
    this.spall = this.build('fxSpall', sprite, {
      capacity: 300,
      color1: new Color4(0.85, 0.92, 1, 1),
      color2: new Color4(0.55, 0.66, 0.8, 1),
      colorDead: new Color4(0.2, 0.25, 0.34, 0),
      minSize: 0.012, maxSize: 0.04,
      minLife: 0.12, maxLife: 0.34,
      minPower: 3, maxPower: 9,
      gravity: 11,
      additive: true,
    });

    this.blood = this.build('fxBlood', sprite, {
      capacity: 500,
      color1: new Color4(0.48, 0.05, 0.05, 1),
      color2: new Color4(0.24, 0.02, 0.03, 1),
      colorDead: new Color4(0.08, 0.01, 0.01, 0),
      minSize: 0.025, maxSize: 0.1,
      minLife: 0.3, maxLife: 0.8,
      minPower: 1.2, maxPower: 4.5,
      gravity: 10,
      additive: false,
    });

    this.smoke = this.build('fxSmoke', sprite, {
      capacity: 200,
      color1: new Color4(0.62, 0.64, 0.68, 0.4),
      color2: new Color4(0.42, 0.44, 0.5, 0.3),
      colorDead: new Color4(0.16, 0.17, 0.2, 0),
      minSize: 0.12, maxSize: 0.34,
      minLife: 0.6, maxLife: 1.4,
      minPower: 0.3, maxPower: 1.1,
      gravity: -0.35, // smoke rises, slowly
      additive: false,
    });

    this.all = [this.flash, this.sparks, this.spall, this.blood, this.smoke];

    // A tracer is a straight hot line for one twelfth of a second. Pooled,
    // because a fight is a lot of them and each is a mesh.
    for (let i = 0; i < MAX_TRACERS; i++) {
      const material = new StandardMaterial(`tracerMat${i}`, scene);
      material.disableLighting = true;
      material.emissiveColor = new Color3(1, 0.86, 0.5);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.alpha = 0;
      material.disableDepthWrite = true;
      // Additive, not alpha: on an unlit street at night a blended line is a
      // grey wire, and the same line added to what's behind it is hot gas.
      material.alphaMode = Constants.ALPHA_ADD;
      const mesh = MeshBuilder.CreateCylinder(
        `tracer${i}`, { height: 1, diameter: 1, tessellation: 6 }, scene,
      );
      mesh.material = material;
      mesh.isPickable = false;
      mesh.applyFog = false;
      mesh.rotationQuaternion = Quaternion.Identity();
      mesh.setEnabled(false);
      this.tracers.push({ mesh, material, age: Infinity });
    }
  }

  private build(name: string, sprite: Texture, spec: SystemSpec): ParticleSystem {
    const system = new ParticleSystem(name, spec.capacity, this.scene);
    system.particleTexture = sprite;
    system.emitter = new Vector3();
    // Installed explicitly rather than relying on the default: every burst
    // below steers by writing direction1/direction2, and those setters only
    // mean anything while the emitter really is a box.
    system.createBoxEmitter(
      new Vector3(-1, -1, -1), new Vector3(1, 1, 1),
      new Vector3(-0.02, -0.02, -0.02), new Vector3(0.02, 0.02, 0.02),
    );
    system.color1 = spec.color1;
    system.color2 = spec.color2;
    system.colorDead = spec.colorDead;
    system.minSize = spec.minSize;
    system.maxSize = spec.maxSize;
    system.minLifeTime = spec.minLife;
    system.maxLifeTime = spec.maxLife;
    system.minEmitPower = spec.minPower;
    system.maxEmitPower = spec.maxPower;
    system.gravity = new Vector3(0, -spec.gravity, 0);
    system.blendMode = spec.additive
      ? ParticleSystem.BLENDMODE_ADD
      : ParticleSystem.BLENDMODE_STANDARD;
    system.minAngularSpeed = -3;
    system.maxAngularSpeed = 3;
    system.emitRate = 0; // bursts only — everything here is an event
    system.updateSpeed = BASE_SPEED;
    system.disposeOnStop = false;
    system.start();
    return system;
  }

  /**
   * Fire a burst. `spread` widens the cone around `dir`; a zero direction gives
   * a sphere. The emitter is cloned per burst so two events in the same frame
   * don't collapse onto one point.
   */
  private burst(
    system: ParticleSystem,
    at: Vector3,
    count: number,
    dir: Vector3 | null,
    spread: number,
  ): void {
    system.emitter = at.clone();
    if (dir) {
      system.direction1.set(dir.x - spread, dir.y - spread, dir.z - spread);
      system.direction2.set(dir.x + spread, dir.y + spread, dir.z + spread);
    } else {
      system.direction1.set(-spread, -spread, -spread);
      system.direction2.set(spread, spread, spread);
    }
    // manualEmitCount defaults to -1 (meaning "use emitRate"); accumulate so a
    // second burst in the same frame adds to the first rather than replacing it.
    system.manualEmitCount = Math.max(0, system.manualEmitCount) + count;
    this.particlesEmitted += count;
  }

  /** The gun going off: core flash, sparks down the barrel, a little smoke. */
  muzzleFlash(at: Vector3, forward: Vector3): void {
    this.burst(this.flash, at, 5, forward, 0.5);
    this.burst(this.sparks, at, 14, forward, 0.45);
    this.burst(this.smoke, at, 5, forward, 0.35);
  }

  /**
   * The shot itself, drawn as a line rather than simulated as a projectile —
   * at pistol range the round arrives the same frame it leaves.
   */
  tracer(from: Vector3, to: Vector3): void {
    const t = this.tracers[this.nextTracer % this.tracers.length];
    this.nextTracer++;
    if (!t) return;

    this.dir.copyFrom(to).subtractInPlace(from);
    const length = this.dir.length();
    if (length < 1e-3) return;
    this.dir.scaleInPlace(1 / length);

    this.mid.copyFrom(from).addInPlace(this.dir.scale(length * 0.5));
    t.mesh.position.copyFrom(this.mid);
    t.mesh.scaling.set(TRACER_THICKNESS, length, TRACER_THICKNESS);
    orientY(t.mesh, this.dir);
    t.mesh.setEnabled(true);
    t.material.alpha = 0.95;
    t.age = 0;
    this.tracersFired++;
  }

  /** A round going into something that bleeds. */
  bloodHit(at: Vector3, away: Vector3, heavy: boolean): void {
    this.burst(this.blood, at, heavy ? 42 : 20, away, 0.85);
    this.burst(this.sparks, at, heavy ? 6 : 3, away, 1);
  }

  /** A round going into something that doesn't. */
  armourHit(at: Vector3, away: Vector3): void {
    this.burst(this.spall, at, 22, away, 0.7);
  }

  /** It dies: one last heavy spray, and the street keeps the mark. */
  deathBurst(at: Vector3): void {
    this.burst(this.blood, at, 70, null, 1);
    this.stain(at.x, at.z, 0.5 + Math.random() * 0.3);
  }

  /** She takes one. Blood at her chest, thrown the way the blow travelled. */
  playerHit(at: Vector3, away: Vector3): void {
    this.burst(this.blood, at, 26, away, 0.9);
  }

  /**
   * A dark pool that blooms on the asphalt and slowly weathers away. Pooled;
   * past MAX_STAINS the oldest is recycled under the newest.
   */
  stain(x: number, z: number, radius = 0.55, y = 0): void {
    let s = this.stains.length >= MAX_STAINS ? this.stains.shift() ?? null : null;
    if (!s) {
      const material = new StandardMaterial(`stainMat${this.stains.length}`, this.scene);
      material.disableLighting = true;
      material.emissiveColor = new Color3(0.055, 0.012, 0.012);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableDepthWrite = true;
      material.alpha = 0.8;
      material.zOffset = -4; // sits on the road without fighting it for depth
      material.backFaceCulling = false;
      const mesh = MeshBuilder.CreateDisc(
        `stain${this.stains.length}`, { radius: 1, tessellation: 20 }, this.scene,
      );
      mesh.material = material;
      // A disc faces +Z; -90° about X lays it on the road facing the sky.
      mesh.rotation.x = -Math.PI / 2;
      mesh.isPickable = false;
      s = { mesh, material, age: 0, life: 40, radius };
    }
    s.age = 0;
    s.radius = radius;
    s.mesh.position.set(x, y + 0.02, z);
    s.mesh.setEnabled(true);
    this.stains.push(s);
  }

  /** Pause is a time domain here too: at scale 0 every burst hangs mid-air. */
  setTimeScale(scale: number): void {
    if (scale === this.timeScale) return;
    this.timeScale = scale;
    for (const system of this.all) system.updateSpeed = BASE_SPEED * scale;
  }

  /** realDt: tracers and stains age on the wall clock, like the hurt flash. */
  update(realDt: number): void {
    for (const t of this.tracers) {
      if (t.age === Infinity) continue;
      t.age += realDt;
      const k = t.age / TRACER_SECONDS;
      if (k >= 1) {
        t.mesh.setEnabled(false);
        t.age = Infinity;
        continue;
      }
      // Thins as it fades, so the line collapses rather than dissolving.
      t.material.alpha = 0.95 * (1 - k);
      t.mesh.scaling.x = t.mesh.scaling.z = TRACER_THICKNESS * (1 - k * 0.6);
    }

    for (const s of this.stains) {
      s.age += realDt;
      const bloom = 1 - Math.pow(1 - Math.min(1, s.age / 0.8), 3);
      s.mesh.scaling.setAll(Math.max(0.02, s.radius * bloom));
      const fade = Math.max(0, 1 - s.age / s.life);
      s.material.alpha = 0.8 * fade;
      if (fade <= 0) s.mesh.setEnabled(false);
    }
  }

  /** For the headless harness: is anything actually on screen? */
  get debug(): unknown {
    return {
      live: this.all.reduce((n, s) => n + s.getActiveCount(), 0),
      systems: Object.fromEntries(this.all.map((s) => [s.name, s.getActiveCount()])),
      ready: this.all.every((s) => s.isReady()),
      tracers: this.tracers.filter((t) => t.age !== Infinity).length,
      stains: this.stains.filter((s) => s.age < s.life).length,
      tracersFired: this.tracersFired,
      particlesEmitted: this.particlesEmitted,
    };
  }
}

/** Point a Y-aligned mesh (Babylon's cylinder default) down `dir`. */
function orientY(mesh: Mesh, dir: Vector3): void {
  const dot = dir.y; // Vector3.Dot(Vector3.Up(), dir), dir already normalized
  const quaternion = mesh.rotationQuaternion ?? Quaternion.Identity();
  if (dot > 0.9999) {
    quaternion.set(0, 0, 0, 1);
  } else if (dot < -0.9999) {
    Quaternion.RotationAxisToRef(Vector3.Right(), Math.PI, quaternion);
  } else {
    // cross(up, dir) — written out to keep this allocation-free per shot.
    const axis = new Vector3(dir.z, 0, -dir.x).normalize();
    Quaternion.RotationAxisToRef(axis, Math.acos(dot), quaternion);
  }
  mesh.rotationQuaternion = quaternion;
}

/** The one sprite everything shares: a soft radial dot, painted, not loaded. */
function paintDot(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture('fxDot', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.62)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update(false);
  tex.hasAlpha = true;
  return tex;
}
