import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'approach' | 'heave' | 'burst' | 'spent';

// The Afflicted — Mothmother: a woman fused to a moth's wings, grown far too
// heavy to lift. She drags them through the dirt and can only beat them hard
// enough to kick up a blinding wall of wing-dust. She drifts toward any light.
export class Mothmother extends Afflicted {
  readonly displayName = 'Mothmother';
  private state: State = 'approach';
  private timer = 1 + Math.random();
  private t = 0;
  private burstDone = false;
  private readonly driftOffset = new THREE.Vector3();
  private driftTimer = 0;
  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;
  private readonly motes: THREE.Mesh[] = [];

  constructor() {
    super();
    this.maxHp = this.hp = 26;
    this.radius = 0.42;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(clothes));
    const torso = buildTorso(clothes);
    torso.position.y = 0.86;
    this.object.add(torso);

    const wingMat = makePS1Material({ color: 0x6a5c4a });
    this.wingL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 1.2, 2, 1, 3), wingMat);
    this.wingL.geometry.translate(-0.2, 0, -0.55);
    this.wingL.position.set(-0.12, 0.6, -0.1);
    this.wingL.rotation.x = 0.55;
    torso.add(this.wingL);
    this.wingR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 1.2, 2, 1, 3), wingMat.clone());
    this.wingR.geometry.translate(0.2, 0, -0.55);
    this.wingR.position.set(0.12, 0.6, -0.1);
    this.wingR.rotation.x = 0.55;
    torso.add(this.wingR);

    const moteMat = makePS1Material({ color: 0x9a9284 });
    for (let i = 0; i < 6; i++) {
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), moteMat);
      const ang = (i / 6) * Math.PI * 2;
      mote.position.set(Math.cos(ang) * 0.5, 0.5, Math.sin(ang) * 0.5 - 0.2);
      mote.scale.setScalar(0.001);
      torso.add(mote);
      this.motes.push(mote);
    }

    this.parts = [
      { tag: 'body', node: torso, radius: 0.42, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'wings', node: this.wingL, radius: 0.5, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    this.timer -= dt;
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      // Drawn toward the flicker of any light: her aim-point drifts.
      this.driftTimer = 1.5 + Math.random() * 2;
      this.driftOffset.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
    }
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'heave' || this.state === 'burst' || this.state === 'spent';

    switch (this.state) {
      case 'approach': {
        const aim = ctx.playerPos.clone().add(this.driftOffset);
        this.shamble(dt, aim);
        for (const mote of this.motes) mote.scale.setScalar(0.001);
        if (dist < 2.4 && this.timer <= 0) {
          this.state = 'heave';
          this.timer = 0.8;
        }
        break;
      }
      case 'heave': {
        this.facePlayer(ctx);
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.wingL.rotation.x = 0.55 - k * 0.9;
        this.wingR.rotation.x = 0.55 - k * 0.9;
        this.motes.forEach((mote, i) => mote.scale.setScalar(0.001 + k * (0.5 + (i % 3) * 0.15)));
        if (this.timer <= 0) {
          this.state = 'burst';
          this.timer = 0.25;
          this.burstDone = false;
        }
        break;
      }
      case 'burst': {
        this.wingL.rotation.x = 0.55 + Math.sin(this.t * 40) * 0.3;
        this.wingR.rotation.x = 0.55 + Math.sin(this.t * 40 + 0.5) * 0.3;
        for (const mote of this.motes) mote.scale.setScalar(0.9);
        if (!this.burstDone && !ctx.playerIFrames && dist < 2.0) {
          ctx.dealDamageToPlayer(8);
          this.burstDone = true;
        }
        if (this.timer <= 0) {
          this.state = 'spent';
          this.timer = 1.5;
        }
        break;
      }
      case 'spent': {
        // Blinded by her own dust: stands still, wings the only target.
        for (const mote of this.motes) mote.scale.setScalar(Math.max(0.001, mote.scale.x - dt * 0.6));
        if (this.timer <= 0) {
          this.wingL.rotation.x = 0.55;
          this.wingR.rotation.x = 0.55;
          this.state = 'approach';
          this.timer = 1.2 + Math.random() * 0.8;
        }
        break;
      }
    }
  }

  private facePlayer(ctx: BattleContext): void {
    const dir = ctx.playerPos.clone().sub(this.object.position).setY(0);
    if (dir.lengthSq() > 0.0001) this.object.rotation.y = Math.atan2(dir.x, dir.z);
  }
}
