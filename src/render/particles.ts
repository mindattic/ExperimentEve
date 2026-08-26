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

export class Particles {
  private readonly pool: Particle[] = [];
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly flames: FlameEmitter[] = [];

  constructor(scene: THREE.Scene) {
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

  /** Continuous fire column. Returns a handle to switch it off. */
  addFlame(x: number, y: number, z: number, radius = 0.6, rate = 26): FlameEmitter {
    const f: FlameEmitter = { pos: new THREE.Vector3(x, y, z), radius, rate, acc: 0, on: true };
    this.flames.push(f);
    return f;
  }

  update(dt: number): void {
    if (dt > 0) {
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
