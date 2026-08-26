import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'wander' | 'blink' | 'grab' | 'recover';

// The Afflicted — Owlneighbor: a man whose head rotates clean around on an
// owl's swivel, always pinned to whoever's watching him, while his body
// wanders off on its own errand entirely. Neighbors said he "kept an eye out."
export class Owlneighbor extends Afflicted {
  readonly displayName = 'Owlneighbor';
  private state: State = 'wander';
  private timer = 1 + Math.random();
  private t = 0;
  private grabDone = false;
  private driftTimer = 0;
  private readonly driftTarget = new THREE.Vector3();
  private readonly headPivot: THREE.Group;
  private readonly eyes: THREE.Mesh[] = [];
  private readonly arms: THREE.Object3D[];

  constructor() {
    super();
    this.maxHp = this.hp = 24;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    const torso = buildTorso(clothes);
    torso.position.y = 0.86;
    torso.children[1]!.visible = false; // human head hidden - the owl head replaces it
    this.arms = [torso.children[2]!, torso.children[3]!];
    this.object.add(torso);

    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.65, 0);
    torso.add(this.headPivot);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), makePS1Material({ color: 0xc9a68c }));
    this.headPivot.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 7), makePS1Material({ color: 0x8a6a2a }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, 0.13);
    this.headPivot.add(beak);
    const eyeMat = makePS1Material({ color: 0xf2e6b0 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1610 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMat);
      eye.position.set(s * 0.08, 0.02, 0.09);
      this.headPivot.add(eye);
      this.eyes.push(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), pupilMat);
      pupil.position.set(s * 0.09, 0.02, 0.13);
      this.headPivot.add(pupil);
    }
    // Ear tufts: raised feather horns, always faintly twitching.
    const tuftMat = makePS1Material({ color: 0xa8896a });
    for (const s of [-1, 1]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), tuftMat);
      tuft.position.set(s * 0.07, 0.14, 0);
      tuft.rotation.z = s * 0.25;
      this.headPivot.add(tuft);
    }

    this.parts = [
      { tag: 'body', node: torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'eyes', node: this.headPivot, radius: 0.16, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'blink' || this.state === 'grab';

    // The head always tracks the player, counter-rotated against the body.
    const toPlayer = ctx.playerPos.clone().sub(this.object.position).setY(0);
    if (toPlayer.lengthSq() > 0.0001) {
      const worldAngle = Math.atan2(toPlayer.x, toPlayer.z);
      this.headPivot.rotation.y = worldAngle - this.object.rotation.y;
    }
    // Unsettling micro-tilt: the head never sits perfectly level while it watches.
    this.headPivot.rotation.z = Math.sin(this.t * 1.6) * 0.05;

    const eyeScale = this.state === 'blink' || this.state === 'grab' ? 1.8 : 1;
    for (const eye of this.eyes) eye.scale.setScalar(eyeScale);

    switch (this.state) {
      case 'wander': {
        this.driftTimer -= dt;
        if (this.driftTimer <= 0) {
          this.driftTimer = 1.6 + Math.random() * 0.8;
          const ang = Math.random() * Math.PI * 2;
          const r = 1 + Math.random() * 2;
          this.driftTarget.set(ctx.playerPos.x + Math.cos(ang) * r, 0, ctx.playerPos.z + Math.sin(ang) * r);
        }
        this.shamble(dt, this.driftTarget);
        if (dist < 1.6 && this.timer <= 0) {
          this.state = 'blink';
          this.timer = 0.7;
        }
        break;
      }
      case 'blink': {
        if (this.timer <= 0) {
          this.state = 'grab';
          this.timer = 0.4;
          this.grabDone = false;
        }
        break;
      }
      case 'grab': {
        const k = 1 - Math.max(0, this.timer) / 0.4;
        this.arms[0]!.rotation.z = 0.25 + k * 1.3;
        this.arms[1]!.rotation.z = -0.25 - k * 1.3;
        if (!this.grabDone && k > 0.5 && !ctx.playerIFrames && dist < 1.1) {
          ctx.dealDamageToPlayer(11);
          this.grabDone = true;
        }
        if (this.timer <= 0) {
          this.arms[0]!.rotation.z = 0.25;
          this.arms[1]!.rotation.z = -0.25;
          this.state = 'recover';
          this.timer = 1 + Math.random() * 0.8;
        }
        break;
      }
      case 'recover': {
        if (this.timer <= 0) {
          this.state = 'wander';
          this.timer = 1 + Math.random();
        }
        break;
      }
    }
  }
}
