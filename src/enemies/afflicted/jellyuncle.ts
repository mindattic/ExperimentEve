import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';
import type { BattleContext } from '../enemyBase';

type State = 'shamble' | 'inflate' | 'recover';

// JELLYUNCLE — his skull gave up and became a jellyfish bell. Getting near
// him at all is the mistake: no telegraph needed for that, the whole man is
// the telegraph. The bell itself still knows how to sting on purpose.
export class Jellyuncle extends Afflicted {
  readonly displayName = 'Jellyuncle';

  private state: State = 'shamble';
  private timer = 1 + Math.random() * 2;
  private t = 0;
  private auraAcc = 0;
  private bellActiveTimer = 0;
  private readonly bell: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 30;
    this.radius = 0.42;
    this.shambleSpeed = 1.1;

    const clothes = pickClothes(41);
    const legs = buildLegs(clothes);
    const torso = buildTorso(clothes);
    torso.position.y = 0.94;
    this.object.add(legs, torso);

    this.bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 9, 7),
      makePS1Material({ color: 0xcfe9e2, emissive: 0x3a7a70, transparent: true, opacity: 0.7 }),
    );
    this.bell.position.set(0, 1.59, 0);
    this.object.add(this.bell);
    // Bioluminescent spots ringing the bell — a soft warning nobody heeds.
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x9dffe8, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), glowMat);
      glow.position.set(Math.sin(ang) * 0.19, 1.59, Math.cos(ang) * 0.19);
      this.object.add(glow);
    }

    const tendrilMat = makePS1Material({ color: 0x2f5c54, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const tendril = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.55, 7), tendrilMat);
      tendril.position.set(Math.sin(ang) * 0.1, 1.34, Math.cos(ang) * 0.08 - 0.14);
      tendril.rotation.x = 0.35;
      this.object.add(tendril);
    }

    this.parts = [
      { tag: 'body', node: torso, radius: 0.32, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'bell', node: this.bell, radius: 0.22, damageMultiplier: 3.5, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);

    // Passive hurt aura: no telegraph. Standing near him is the whole trap.
    if (dist < 1.1 && !ctx.playerIFrames) {
      this.auraAcc += dt;
      if (this.auraAcc >= 1) {
        this.auraAcc -= 1;
        ctx.dealDamageToPlayer(3);
      }
    } else {
      this.auraAcc = 0;
    }

    if (this.bellActiveTimer > 0) this.bellActiveTimer -= dt;
    this.parts[1]!.active = this.bellActiveTimer > 0;

    switch (this.state) {
      case 'shamble': {
        this.shamble(dt, ctx.playerPos);
        // Passive pulse: the bell breathes on its own even at rest.
        this.bell.scale.setScalar(1 + Math.sin(this.t * 1.8) * 0.04);
        this.timer -= dt;
        if (dist < 2 && this.timer <= 0) {
          this.state = 'inflate';
          this.timer = 0.8;
          this.bellActiveTimer = 1.8; // inflate window + 1s after
        }
        break;
      }
      case 'inflate': {
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.8;
        this.bell.scale.setScalar(1 + k * 0.6);
        if (this.timer <= 0) {
          if (!ctx.playerIFrames && dist < 2) ctx.dealDamageToPlayer(10);
          this.state = 'recover';
          this.timer = 1.2;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this.bell.scale.setScalar(THREE.MathUtils.lerp(this.bell.scale.x, 1, Math.min(1, dt * 4)));
        if (this.timer <= 0) {
          this.bell.scale.setScalar(1);
          this.state = 'shamble';
          this.timer = 1.5 + Math.random() * 1.5;
        }
        break;
      }
    }
  }
}
