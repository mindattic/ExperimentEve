import * as THREE from 'three';
import { makePS1Material } from '../../render/ps1/ps1Material';
import type { BattleContext } from '../enemyBase';
import { Afflicted, buildLegs, buildTorso, pickClothes } from '../afflictedBase';

type State = 'wait' | 'telegraph' | 'strike' | 'pause';

const WAIT_RANGE = 6;
const STRIKE_RANGE = 1.6;

// THE BRIDE — a woman in her wedding dress, mantis raptorial forearms folded
// as if in prayer. Mostly still: she doesn't chase, she waits. When you're
// close she unfolds in an eyeblink — the fastest strike in the tier.
export class Mantisbride extends Afflicted {
  readonly displayName = 'The Bride';

  private state: State = 'wait';
  private timer = 0.4;
  private t = 0;
  private strikes = 0;
  private hitDone = false;
  private readonly torso: THREE.Group;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly bouquet: THREE.Mesh;

  constructor() {
    super();
    this.maxHp = this.hp = 24;
    this.radius = 0.4;

    const clothes = pickClothes(Math.floor(Math.random() * 1000));
    this.object.add(buildLegs(0xf2eee0));
    this.torso = buildTorso(clothes);
    this.torso.position.y = 0.86;
    this.object.add(this.torso);

    const skirtMat = makePS1Material({ color: 0xf2eee0 });
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 7), skirtMat);
    skirt.position.set(0, 0.45, 0);
    this.object.add(skirt);

    const armMat = makePS1Material({ color: 0x4a5a3a });
    this.armL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4), armMat);
    this.armL.position.set(-0.12, 1.05, 0.22);
    this.armL.rotation.set(Math.PI / 2.3, 0, 0.5);
    this.torso.add(this.armL);
    this.armR = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4), armMat.clone());
    this.armR.position.set(0.12, 1.05, 0.22);
    this.armR.rotation.set(Math.PI / 2.3, 0, -0.5);
    this.torso.add(this.armR);

    const bouquetMat = makePS1Material({ color: 0xcc6688 });
    this.bouquet = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), bouquetMat);
    this.bouquet.position.set(0, 1.02, 0.4);
    this.torso.add(this.bouquet);

    this.parts = [
      { tag: 'body', node: this.torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'bouquet', node: this.bouquet, radius: 0.18, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  protected updateUpright(dt: number, ctx: BattleContext): void {
    this.t += dt;
    const dist = this.object.position.distanceTo(ctx.playerPos);
    this.parts[1]!.active = this.state === 'telegraph' || this.state === 'pause';

    switch (this.state) {
      case 'wait': {
        this.foldArms(dt);
        if (dist > WAIT_RANGE) break; // she does not chase from a distance
        if (dist > STRIKE_RANGE) {
          this.shamble(dt, ctx.playerPos);
          break;
        }
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'telegraph';
          this.timer = 0.5;
        }
        break;
      }
      case 'telegraph': {
        // TELEGRAPH: forearms snap open — the whole strike is over in a blink.
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.5;
        this.armL.rotation.z = 0.5 - k * 1.3;
        this.armR.rotation.z = -0.5 + k * 1.3;
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 0.16;
          this.hitDone = false;
        }
        break;
      }
      case 'strike': {
        this.timer -= dt;
        this.armL.rotation.z = -0.8 - Math.sin(this.t * 40) * 0.2;
        this.armR.rotation.z = 0.8 + Math.sin(this.t * 40) * 0.2;
        if (!this.hitDone && !ctx.playerIFrames && dist < STRIKE_RANGE) {
          ctx.dealDamageToPlayer(14);
          this.hitDone = true;
        }
        if (this.timer <= 0) {
          this.strikes++;
          if (this.strikes >= 3) {
            this.state = 'pause';
            this.timer = 2.0;
            this.strikes = 0;
          } else {
            this.state = 'wait';
            this.timer = 0.35;
          }
        }
        break;
      }
      case 'pause': {
        // She smooths her dress — vulnerable, bouquet still in hand.
        this.timer -= dt;
        this.foldArms(dt);
        if (this.timer <= 0) {
          this.state = 'wait';
          this.timer = 0.5;
        }
        break;
      }
    }
  }

  private foldArms(dt: number): void {
    const k = Math.min(1, dt * 6);
    this.armL.rotation.z += (0.5 - this.armL.rotation.z) * k;
    this.armR.rotation.z += (-0.5 - this.armR.rotation.z) * k;
  }
}
