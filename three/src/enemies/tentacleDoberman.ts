import * as THREE from 'three';
import { makePS1Material } from '../render/ps1/ps1Material';
import { Enemy, type BattleContext } from './enemyBase';

type State = 'sprint' | 'coil' | 'lash' | 'bite' | 'stagger' | 'recover';

// Tentacle Doberman: doberman pinscher + squid chimera. A lean, fast pack
// rusher with a knot of squid tentacles grafted across its shoulders. The
// tentacles COIL UP (glowing faintly) before lashing forward; shoot them
// during the coil and the dog staggers, tentacles limp, buying breathing
// room. Land the lash and it follows up with an unsignaled bite.
export class TentacleDoberman extends Enemy {
  readonly displayName = 'Tentacle Doberman';
  faction = 'dog';

  private state: State = 'sprint';
  private timer = 0.5;
  private t = 0;
  private readonly bodyGroup = new THREE.Group();
  private readonly tentacleGroup = new THREE.Group();
  private readonly tentacles: THREE.Mesh[] = [];
  private readonly tentacleMats: THREE.MeshLambertMaterial[] = [];
  private readonly legs: THREE.Mesh[] = [];
  private readonly head: THREE.Mesh;
  private readonly eyeMat: THREE.MeshBasicMaterial;
  private lashHit = false;
  private biteHit = false;
  private lastHp = this.hp;

  constructor() {
    super();
    this.maxHp = this.hp = 40;
    this.lastHp = this.hp;
    this.radius = 0.42;

    const coatMat = makePS1Material({ color: 0x1a1512 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.75, 2, 1, 2), coatMat);
    torso.position.y = 0.42;
    this.bodyGroup.add(torso);

    const tanMat = makePS1Material({ color: 0x6b3f22 });
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), tanMat);
    chest.position.set(0, 0.32, 0.3);
    this.bodyGroup.add(chest);

    const headMat = makePS1Material({ color: 0x1a1512 });
    this.head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), headMat);
    this.head.rotation.x = Math.PI / 2;
    this.head.position.set(0, 0.52, 0.55);
    this.bodyGroup.add(this.head);

    // Glinting eyes and a pair of fangs at the muzzle tip.
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x882222 });
    for (const sx of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), this.eyeMat);
      eye.position.set(sx, 0.03, 0.08);
      this.head.add(eye);
    }
    const fangMat = makePS1Material({ color: 0xe8e4d8 });
    for (const sx of [-0.04, 0.04]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.06, 5), fangMat);
      fang.position.set(sx, -0.04, -0.18);
      this.head.add(fang);
    }

    const earMat = makePS1Material({ color: 0x120e0c });
    for (const sx of [-0.1, 0.1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), earMat);
      ear.position.set(sx, 0.68, 0.5);
      this.bodyGroup.add(ear);
    }

    const legMat = makePS1Material({ color: 0x110d0a });
    for (const [sx, sz] of [[-0.14, 0.28], [0.14, 0.28], [-0.13, -0.28], [0.13, -0.28]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 7), legMat);
      leg.position.set(sx, 0.21, sz);
      this.bodyGroup.add(leg);
      this.legs.push(leg);
    }

    // Squid tentacles knotted across the shoulders/back.
    this.tentacleGroup.position.set(0, 0.6, -0.1);
    this.bodyGroup.add(this.tentacleGroup);
    const suckerMat = makePS1Material({ color: 0x7a5a72 });
    for (let i = 0; i < 5; i++) {
      const mat = makePS1Material({ color: 0x5a3a52 });
      const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.55, 6), mat);
      const ang = (i / 5) * Math.PI * 2;
      tentacle.position.set(Math.cos(ang) * 0.1, 0.2, Math.sin(ang) * 0.1 - 0.1);
      tentacle.rotation.z = Math.cos(ang) * 0.3;
      tentacle.rotation.x = Math.sin(ang) * 0.3 - 0.3;
      this.tentacleGroup.add(tentacle);
      this.tentacles.push(tentacle);
      this.tentacleMats.push(mat);

      // Sucker bumps along a couple of tentacles for texture.
      if (i < 2) {
        const sucker = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), suckerMat.clone());
        sucker.position.set(0, 0.22, 0);
        tentacle.add(sucker);
      }
    }

    this.object.add(this.bodyGroup);

    this.parts = [
      { tag: 'body', node: torso, radius: 0.4, damageMultiplier: 1, weakPoint: false, active: true },
      { tag: 'tentacles', node: this.tentacleGroup, radius: 0.35, damageMultiplier: 4, weakPoint: true, active: false },
    ];
    this.registerFlashMaterials();
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.t += dt;
    this.timer -= dt;

    const toPlayer = ctx.playerPos.clone().sub(this.object.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (this.state !== 'lash' && dist > 0.01) {
      this.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    const tentaclePart = this.parts[1]!;
    tentaclePart.active = this.state === 'coil' || this.state === 'lash';
    const glow = tentaclePart.active ? 0x662255 : 0x000000;
    for (const mat of this.tentacleMats) mat.emissive.setHex(glow);

    // Eyes glint brighter with the tentacles, and the head lunges into bites.
    this.eyeMat.color.setHex(tentaclePart.active ? 0xcc4444 : 0x882222);
    this.head.position.z = 0.55 + (this.state === 'bite' ? Math.sin(this.t * 30) * 0.03 : 0);

    switch (this.state) {
      case 'sprint': {
        const gait = Math.sin(this.t * 14);
        this.legs.forEach((leg, i) => { leg.rotation.x = (i % 2 === 0 ? gait : -gait) * 0.5; });
        if (dist > 1.6) {
          this.object.position.addScaledVector(toPlayer.normalize(), 4.2 * dt);
        } else if (this.timer <= 0) {
          this.state = 'coil';
          this.timer = 0.6;
          this.lastHp = this.hp;
        }
        break;
      }
      case 'coil': {
        // TELEGRAPH: tentacles curl tight and glow.
        const k = 1 - Math.max(0, this.timer) / 0.6;
        this.tentacles.forEach((tentacle, i) => {
          const ang = (i / this.tentacles.length) * Math.PI * 2;
          tentacle.rotation.x = Math.sin(ang) * 0.3 - 0.3 - k * 0.9;
          tentacle.scale.y = 1 - k * 0.4;
        });
        if (this.hp < this.lastHp) {
          this.state = 'stagger';
          this.timer = 1.5;
        } else if (this.timer <= 0) {
          this.state = 'lash';
          this.timer = 0.3;
          this.lashHit = false;
        }
        break;
      }
      case 'lash': {
        const k = Math.min(1, (1 - Math.max(0, this.timer) / 0.3) * 1.4);
        this.tentacles.forEach((tentacle, i) => {
          const ang = (i / this.tentacles.length) * Math.PI * 2;
          tentacle.rotation.x = THREE.MathUtils.lerp(-0.3 + Math.sin(ang) * 0.3 - 0.9, 1.2, k);
          tentacle.scale.y = THREE.MathUtils.lerp(0.6, 1.6, k);
        });
        if (!this.lashHit && !ctx.playerIFrames && k > 0.6 && dist < 1.6) {
          ctx.dealDamageToPlayer(14);
          this.lashHit = true;
        }
        if (this.timer <= 0) {
          this.state = this.lashHit && dist < 1.6 ? 'bite' : 'recover';
          this.timer = this.state === 'bite' ? 0.2 : 1.0;
          this.biteHit = false;
        }
        break;
      }
      case 'bite': {
        // No telegraph — the lash itself was the tell.
        if (!this.biteHit && !ctx.playerIFrames && dist < 1.3) {
          ctx.dealDamageToPlayer(8);
          this.biteHit = true;
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.9;
        }
        break;
      }
      case 'stagger': {
        this.bodyGroup.rotation.z = Math.sin(this.t * 18) * 0.08;
        for (const tentacle of this.tentacles) tentacle.scale.y = 1;
        if (this.timer <= 0) {
          this.bodyGroup.rotation.z = 0;
          this.state = 'recover';
          this.timer = 0.6;
        }
        break;
      }
      case 'recover': {
        for (let i = 0; i < this.tentacles.length; i++) {
          const tentacle = this.tentacles[i]!;
          const ang = (i / this.tentacles.length) * Math.PI * 2;
          tentacle.rotation.x = Math.sin(ang) * 0.3 - 0.3;
          tentacle.scale.y = 1;
        }
        if (this.timer <= 0) {
          this.state = 'sprint';
          this.timer = 0.3 + Math.random() * 0.4;
        }
        break;
      }
    }
  }
}
