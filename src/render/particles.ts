import * as THREE from 'three';

// Pooled square-point particles — PS1 games did fire, sparks, and blood with
// screen-facing quads; GL points at PSX-HD resolution read the same way.
// One Points mesh, one attribute pass a frame, zero allocations at runtime.

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  from: THREE.Color;
  to: THREE.Color;
}

export interface BurstOpts {
  count: number;
  color: number;
  colorEnd?: number;
  speed?: number;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  /** Directional bias (unit-ish); omitted = spherical. */
  dir?: THREE.Vector3;
}

interface FlameEmitter {
  pos: THREE.Vector3;
  radius: number;
  rate: number; // particles/sec
  acc: number;
  on: boolean;
}

const MAX = 900;

interface Stain {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  radius: number;
}

const MAX_STAINS = 14;

export class Particles {
  private readonly pool: Particle[] = [];
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly flames: FlameEmitter[] = [];
  private readonly stains: Stain[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, maxLife: 1, size: 1, gravity: 0, drag: 0,
        from: new THREE.Color(), to: new THREE.Color(),
      });
    }
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Clamp: a particle skimming the camera plane must not smear
          // into a screen-wide streak.
          gl_PointSize = clamp(size * (240.0 / -mv.z), 1.0, 22.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(): Particle | null {
    for (const p of this.pool) {
      if (!p.alive) return p;
    }
    return null;
  }

  burst(at: THREE.Vector3, opts: BurstOpts): void {
    const speed = opts.speed ?? 3;
    const spread = opts.spread ?? 1;
    for (let i = 0; i < opts.count; i++) {
      const p = this.spawn();
      if (!p) return;
      p.alive = true;
      p.pos.copy(at);
      p.vel.set(
        (Math.random() - 0.5) * 2 * spread,
        (Math.random() - 0.5) * 2 * spread,
        (Math.random() - 0.5) * 2 * spread,
      );
      if (opts.dir) p.vel.addScaledVector(opts.dir, 1.2);
      p.vel.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.maxLife = p.life = (opts.life ?? 0.45) * (0.6 + Math.random() * 0.8);
      p.size = (opts.size ?? 0.09) * (0.7 + Math.random() * 0.6);
      p.gravity = opts.gravity ?? 6;
      p.drag = 1.5;
      p.from.setHex(opts.color);
      p.to.setHex(opts.colorEnd ?? opts.color);
    }
  }

  /**
   * Bullet tracer: a beaded line of hot particles from muzzle to wound,
   * gone in a tenth of a second — the PS1 way to draw a shot.
   */
  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const k = (i + 0.5) / n;
      p.alive = true;
      p.pos.lerpVectors(from, to, k);
      p.vel.set(0, 0, 0);
      // The head of the streak lives shortest — the line collapses toward Kat.
      p.maxLife = p.life = 0.05 + (1 - k) * 0.07;
      p.size = 0.06;
      p.gravity = 0;
      p.drag = 0;
      p.from.setHex(0xfff2c0);
      p.to.setHex(0xff8830);
    }
  }

  /**
   * Smoke-bomb cloud: a slow, thick, rising column that hangs for seconds.
   */
  smokeCloud(at: THREE.Vector3): void {
    for (let i = 0; i < 70; i++) {
      const p = this.spawn();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4;
      p.alive = true;
      p.pos.set(at.x + Math.sin(a) * r, at.y + 0.2 + Math.random() * 1.1, at.z + Math.cos(a) * r);
      p.vel.set((Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.7, (Math.random() - 0.5) * 0.9);
      p.maxLife = p.life = 2.2 + Math.random() * 2.4;
      // Chunky billows: at PSX-HD internal res these read as fat squares.
      p.size = 0.45 + Math.random() * 0.3;
      p.gravity = -0.25; // smoke rises, slowly
      p.drag = 0.5;
      p.from.setHex(0x9aa2b0);
      p.to.setHex(0x2c3038);
    }
  }

  /**
   * A dark pool that blooms on the asphalt and slowly weathers away.
   * Pooled; the oldest stain is recycled past MAX_STAINS.
   */
  stain(x: number, z: number, radius = 0.55, y = 0): void {
    let s = this.stains.length >= MAX_STAINS ? this.stains.shift()! : null;
    if (!s) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 9),
        new THREE.MeshBasicMaterial({
          color: 0x3a0f0c, transparent: true, opacity: 0.75,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      s = { mesh, age: 0, life: 30, radius };
    }
    s.age = 0;
    s.radius = radius;
    s.mesh.position.set(x, y + 0.03, z);
    s.mesh.visible = true;
    this.stains.push(s);
  }

  /** Continuous fire column. Returns a handle to switch it off. */
  addFlame(x: number, y: number, z: number, radius = 0.6, rate = 26): FlameEmitter {
    const f: FlameEmitter = { pos: new THREE.Vector3(x, y, z), radius, rate, acc: 0, on: true };
    this.flames.push(f);
    return f;
  }

  update(dt: number): void {
    if (dt > 0) {
      for (const s of this.stains) {
        s.age += dt;
        const grow = Math.min(1, s.age / 0.8);
        const bloom = 1 - Math.pow(1 - grow, 3);
        s.mesh.scale.setScalar(Math.max(0.02, s.radius * bloom));
        const fade = Math.max(0, 1 - s.age / s.life);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
        if (fade <= 0) s.mesh.visible = false;
      }
      for (const f of this.flames) {
        if (!f.on) continue;
        f.acc += dt * f.rate;
        while (f.acc >= 1) {
          f.acc -= 1;
          const p = this.spawn();
          if (!p) break;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * f.radius;
          p.alive = true;
          p.pos.set(f.pos.x + Math.sin(a) * r, f.pos.y + Math.random() * 0.3, f.pos.z + Math.cos(a) * r);
          p.vel.set((Math.random() - 0.5) * 0.7, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.7);
          p.maxLife = p.life = 0.7 + Math.random() * 0.7;
          p.size = 0.16 + Math.random() * 0.14;
          p.gravity = -1.2; // fire rises
          p.drag = 0.4;
          // Embers run yellow -> deep red as they die.
          p.from.setHex(Math.random() < 0.25 ? 0xffd888 : 0xff9a33);
          p.to.setHex(0x661100);
        }
      }
    }

    let i = 0;
    for (const p of this.pool) {
      if (p.alive && dt > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
        } else {
          p.vel.y -= p.gravity * dt;
          p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
          p.pos.addScaledVector(p.vel, dt);
          if (p.pos.y < 0.02 && p.gravity > 0) {
            p.pos.y = 0.02;
            p.vel.y = 0;
          }
        }
      }
      const k = p.alive ? 1 - p.life / p.maxLife : 0;
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.alive ? p.pos.y : -999;
      this.positions[i * 3 + 2] = p.pos.z;
      if (p.alive) {
        const c = p.from.clone().lerp(p.to, k);
        this.colors[i * 3] = c.r;
        this.colors[i * 3 + 1] = c.g;
        this.colors[i * 3 + 2] = c.b;
        this.sizes[i] = p.size * (1 - k * 0.5);
      } else {
        this.sizes[i] = 0;
      }
      i++;
    }
    this.geometry.attributes['position']!.needsUpdate = true;
    this.geometry.attributes['color']!.needsUpdate = true;
    this.geometry.attributes['size']!.needsUpdate = true;
  }
}
