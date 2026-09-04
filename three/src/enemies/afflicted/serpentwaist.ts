import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildTorso, pickClothes } from '../afflictedBase';

type State = 'approach' | 'telegraph' | 'strike' | 'recover';

const STRIKE_RANGE = 1.6;

// BACKWARDS PETE — human torso, snake from the waist down, fused facing the
// wrong way. He slithers toward you tail-first, head twisted back over his
// own shoulder to keep watching you the whole time.
export class Serpentwaist extends Afflicted {
  readonly displayName = 'Backwards Pete';

  private state: State = 'approach';
  private timer = 0.5 + Math.random();
  private t = 0;
  private hitDone = false;
  private readonly torso: THREE.Group;
  private readonly tail: THREE.Mesh;
  private readonly waistJoint: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 26;
    this.radius = 0.42;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.5;
    this.torso.rotation.y = Math.PI; // fused facing backward
    this.object.add(this.torso);

    const waistMat = makePS1Material({ color: 0x6a5a4a });
    this.waistJoint = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 7), waistMat);
    this.waistJoint.position.set(0, 0.5, 0);
    this.object.add(this.waistJoint);
    // Seam ring: where the graft was never properly closed.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 8), makePS1Material({ color: 0x2a2016 }));
    seam.rotation.x = Math.PI / 2;
    seam.position.set(0, 0.5, 0);
    this.object.add(seam);

    const tailMat = makePS1Material({ color: 0x445a3a });
    this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 8), tailMat);
    this.tail.position.set(0, 0.25, -0.4);
    this.tail.rotation.x = Math.PI / 2;
    this.object.add(this.tail);
    // Scale ridge bumps running the length of the tail (local Y = the cone's axis).
    const scaleMat = makePS1Material({ color: 0x3a4e30 });
    for (let i = 0; i < 4; i++) {
      const scale = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), scaleMat);
      scale.position.set(0, -0.35 + i * 0.22, 0.16 - i * 0.015);
      scale.scale.set(1, 1.4, 0.5);
      this.tail.add(scale);
    }

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.42, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'spine junction', node: this.waistJoint, radius: 0.2, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'telegraph' || this.state === 'strike';
    this.tail.rotation.z = Math.sin(this.t * 4) * 0.15;

    switch (this.state) {
      case 'approach': {
        if (dist > STRIKE_RANGE) {
          // Target a point reflected through the player: he always slides
          // straight at them, tail leading, never settling short.
          const reflected = ctx.playerPos.clone().multiplyScalar(2).sub(this.object.position);
          this.shamble(dt, reflected);
          this.torso.rotation.y = Math.PI; // stays twisted regardless of travel heading
        } else {
          this.timer -= dt;
          if (this.timer <= 0) {
            this.state = 'telegraph';
            this.timer = 0.6;
          }
        }
        break;
      }
      case 'telegraph': {
        // TELEGRAPH: the tail coils back for the whip.
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.tail.rotation.y = -k * 0.9;
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 0.25;
          this.hitDone = false;
        }
        break;
      }
      case 'strike': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.25;
        this.tail.rotation.y = -0.9 + k * 1.6;
        if (!this.hitDone && !ctx.playerIFrames && k > 0.5 && dist < STRIKE_RANGE) {
          ctx.dealDamageToPlayer(11);
          this.hitDone = true;
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.tail.rotation.y += (0 - this.tail.rotation.y) * Math.min(1, dt * 4);
        if (this.timer <= 0) {
          this.tail.rotation.y = 0;
          this.state = 'approach';
          this.timer = 0.4 + Math.random();
        }
        break;
      }
    }
  }
}
