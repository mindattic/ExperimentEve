import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'inflate' | 'drift' | 'fuse';

const FLOAT_Y = 1.6;
const INFLATE_SECONDS = 1.1;
const MAX_SCALE = 2.7;
const FUSE_RANGE = 1.75;
const FUSE_SECONDS = 0.85;
const BOOM_RANGE = 2.3;
const BOOM_DAMAGE = 20;

// Puffergull: the shore seagull, if you shoot it. It does not die — it
// INFLATES, pufferfish-style, spines and all, then floats over on wings
// far too small for the new volume and detonates. Entirely avoidable.
// Nobody makes Kat shoot the seagull.
export class Puffergull extends Enemy {
  readonly displayName = 'Puffergull';
  override faction = 'gull';

  private state: State = 'inflate';
  private t = 0;
  private timer = INFLATE_SECONDS;
  private readonly balloon: THREE.Group;
  private readonly bodyMesh: THREE.Mesh;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly headGroup: THREE.Group;
  private readonly beakMesh: THREE.Mesh;
  private readonly wings: THREE.Mesh[] = [];
  private readonly spikes: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 26;
    this.radius = 0.55;
    // Flying corpse: fall + sink from float height before removal.
    this.deathSinkRate = 2.4;

    const feather = makePS1Material({ color: 0xdcd8cc });
    this.bodyMat = feather;

    // The balloon: body sphere + spines, all of it scales together.
    this.balloon = new THREE.Group();
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 7), feather);
    this.balloon.add(this.bodyMesh);
    const spikeMat = makePS1Material({ color: 0xcfc6ac });
    for (let i = 0; i < 14; i++) {
      // Poisson-ish shell directions via golden-angle spiral.
      const y = 1 - (i + 0.5) * (2 / 14);
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), spikeMat);
      spike.position.copy(dir).multiplyScalar(0.17);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.balloon.add(spike);
      this.spikes.push(spike);
    }
    this.object.add(this.balloon);

    // The face stays gull-sized — pufferfish rules. It rides the front of
    // the balloon outward as the body grows.
    this.headGroup = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 5), feather);
    this.headGroup.add(head);
    this.beakMesh = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), makePS1Material({ color: 0xd8a030 }));
    this.beakMesh.rotation.x = Math.PI / 2;
    this.beakMesh.position.set(0, 0, 0.11);
    this.headGroup.add(this.beakMesh);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 4, 3), makePS1Material({ color: 0x1a1a1a }));
      eye.position.set(s * 0.05, 0.03, 0.06);
      this.headGroup.add(eye);
    }
    this.headGroup.position.set(0, 0.12, 0.2);
    this.object.add(this.headGroup);

    // Wings that were adequate for a seagull.
    const wingMat = makePS1Material({ color: 0xb0aca0 });
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.14, 2, 1, 1), wingMat);
      wing.geometry.translate(s * 0.17, 0, 0);
      this.object.add(wing);
      this.wings.push(wing);
    }

    this.parts = [
      { tag: 'body', node: this.bodyMesh, radius: 0.5, damageMultiplier: 2, weakPoint: false, active: true },
      { tag: 'beak', node: this.beakMesh, radius: 0.14, damageMultiplier: 3, weakPoint: true, active: true },
    ];
    this.registerFlashMaterials();
  }

  protected override onDeath(): void {
    // Punctured. All that air, wasted.
    this.balloon.scale.setScalar(0.4);
    for (const s of this.spikes) s.visible = false;
    for (const w of this.wings) w.rotation.z = 0;
    this.headGroup.position.set(0, 0.1, 0.1);
  }

  /** 0..1 inflation, drives scale + wing/head placement. */
  private inflateK(): number {
    return this.state === 'inflate'
      ? 1 - Math.max(0, this.timer) / INFLATE_SECONDS
      : 1;
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 0.01) this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    // Inflation state drives the whole silhouette every frame.
    const k = this.inflateK();
    const scale = 1 + (MAX_SCALE - 1) * (k * k * (3 - 2 * k));
    this.balloon.scale.setScalar(scale);
    this.headGroup.position.set(0, 0.12 * scale, 0.2 * scale);
    const flap = Math.sin(this.t * (this.state === 'inflate' ? 6 : 15)) * 0.55;
    for (let i = 0; i < this.wings.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.wings[i]!.position.set(side * 0.17 * scale, 0.06 * scale, 0);
      this.wings[i]!.rotation.z = side * 0.2 + flap * side;
    }

    switch (this.state) {
      case 'inflate': {
        // Rising off the wreck as it fills.
        this.object.position.y += (FLOAT_Y - this.object.position.y) * Math.min(1, dt * 2.5);
        if (this.timer <= 0) {
          this.state = 'drift';
        }
        break;
      }
      case 'drift': {
        // A slow, wobbling, deliberate approach. It has all night.
        this.object.position.addScaledVector(toPlayer.normalize(), 1.15 * dt);
        this.object.position.y = FLOAT_Y + Math.sin(this.t * 2.2) * 0.1;
        this.bodyMat.emissive.setHex(0x000000);
        if (dist < FUSE_RANGE) {
          this.state = 'fuse';
          this.timer = FUSE_SECONDS;
        }
        break;
      }
      case 'fuse': {
        // Red strobe, closing slowly. The dodge window is generous. Take it.
        this.object.position.addScaledVector(toPlayer.normalize(), 0.4 * dt);
        const on = Math.floor(Math.max(0, this.timer) * 12) % 2 === 0;
        this.bodyMat.emissive.setHex(on ? 0xaa2010 : 0x000000);
        if (this.timer <= 0) {
          if (!ctx.playerIFrames && dist < BOOM_RANGE) {
            ctx.dealDamageToPlayer(BOOM_DAMAGE);
          }
          // It goes with the blast — the kill hooks throw the send-off.
          this.takeHit(this.maxHp * 10, null);
        }
        break;
      }
    }
  }
}
