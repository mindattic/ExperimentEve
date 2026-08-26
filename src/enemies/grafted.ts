import * as THREE from 'three';
import { Enemy, type BattleContext, type EnemyPart } from './enemyBase';
import { makePS1Material } from '../render/ps1/ps1Material';

// THE GRAFTED — surgery, not evolution. Somebody assembled these: a core
// mass wearing a set of grafted appendages, and every graft is its own
// target with its own health. Shoot a graft off and it tears away and
// falls; strip them all and the core is exposed (it glows, it crits, it
// panics). They debut as minibosses on the story clock, then join the
// street pool as the night deepens — tonight's boss is 3 AM's trash mob.
// That's the power fantasy, on schedule.

type SegKind = 'serpent' | 'fist' | 'head' | 'plate' | 'horn' | 'lantern' | 'spine';
type Layout = 'radial' | 'spine' | 'shoulders';

export interface GraftedType {
  id: string;
  name: string;
  /** Story tier: 1 debuts ~9:30 PM, 2 ~10:30 PM, 3 ~11:30 PM. */
  tier: 1 | 2 | 3;
  coreShape: 'sphere' | 'box' | 'dome';
  coreColor: number;
  coreSize: number;
  segKind: SegKind;
  segColor: number;
  segCount: number;
  segHp: number;
  layout: Layout;
  hp: number;
  radius: number;
  speed: number;
  /** Strike damage contributed per surviving graft (min 1 core headbutt). */
  dmgPerSeg: number;
  windup: number;
  cooldown: number;
}

export const GRAFTED_TYPES: GraftedType[] = [
  // Tier 1 — the evening's minibosses.
  {
    id: 'graftedQuarrel', name: 'The Quarrel', tier: 1,
    coreShape: 'sphere', coreColor: 0x5a4a52, coreSize: 0.55,
    segKind: 'serpent', segColor: 0x5c7a5e, segCount: 4, segHp: 26, layout: 'radial',
    hp: 90, radius: 0.7, speed: 1.1, dmgPerSeg: 5, windup: 0.8, cooldown: 1.6,
  },
  {
    id: 'graftedApplause', name: 'The Applause', tier: 1,
    coreShape: 'box', coreColor: 0x4a4652, coreSize: 0.5,
    segKind: 'fist', segColor: 0xc9a68c, segCount: 6, segHp: 20, layout: 'radial',
    hp: 80, radius: 0.7, speed: 1.3, dmgPerSeg: 4, windup: 0.7, cooldown: 1.4,
  },
  {
    id: 'graftedChoir', name: 'The Second Choir', tier: 1,
    coreShape: 'dome', coreColor: 0x554455, coreSize: 0.55,
    segKind: 'head', segColor: 0xc9a68c, segCount: 5, segHp: 22, layout: 'shoulders',
    hp: 85, radius: 0.7, speed: 1.0, dmgPerSeg: 5, windup: 0.9, cooldown: 1.8,
  },
  // Tier 2 — mid-night heavies-in-waiting.
  {
    id: 'graftedPicket', name: 'The Picket Line', tier: 2,
    coreShape: 'box', coreColor: 0x46523e, coreSize: 0.6,
    segKind: 'plate', segColor: 0x8a8276, segCount: 5, segHp: 32, layout: 'radial',
    hp: 120, radius: 0.8, speed: 1.0, dmgPerSeg: 6, windup: 0.9, cooldown: 1.7,
  },
  {
    id: 'graftedAntlerbank', name: 'Antler Bank', tier: 2,
    coreShape: 'dome', coreColor: 0x5a4a3a, coreSize: 0.6,
    segKind: 'horn', segColor: 0xd8cfc0, segCount: 6, segHp: 26, layout: 'spine',
    hp: 130, radius: 0.75, speed: 1.4, dmgPerSeg: 5, windup: 0.7, cooldown: 1.5,
  },
  {
    id: 'graftedLampline', name: 'Lampline', tier: 2,
    coreShape: 'sphere', coreColor: 0x3a4a52, coreSize: 0.55,
    segKind: 'lantern', segColor: 0x6a5a4e, segCount: 4, segHp: 24, layout: 'shoulders',
    hp: 110, radius: 0.7, speed: 1.2, dmgPerSeg: 7, windup: 1.0, cooldown: 1.9,
  },
  {
    id: 'graftedStroller', name: 'The Stroller', tier: 2,
    coreShape: 'sphere', coreColor: 0x4a4440, coreSize: 0.5,
    segKind: 'spine', segColor: 0xb8a890, segCount: 6, segHp: 22, layout: 'spine',
    hp: 115, radius: 0.65, speed: 1.9, dmgPerSeg: 4, windup: 0.5, cooldown: 1.2,
  },
  // Tier 3 — the late-night parade.
  {
    id: 'graftedAnchor', name: 'Anchorback', tier: 3,
    coreShape: 'dome', coreColor: 0x33424e, coreSize: 0.7,
    segKind: 'plate', segColor: 0x5a626a, segCount: 6, segHp: 38, layout: 'radial',
    hp: 180, radius: 0.9, speed: 0.8, dmgPerSeg: 7, windup: 1.1, cooldown: 2.0,
  },
  {
    id: 'graftedSteeple', name: 'The Steeple', tier: 3,
    coreShape: 'box', coreColor: 0x3c3a44, coreSize: 0.6,
    segKind: 'horn', segColor: 0x8a7a5a, segCount: 5, segHp: 30, layout: 'spine',
    hp: 160, radius: 0.75, speed: 1.1, dmgPerSeg: 8, windup: 0.9, cooldown: 1.6,
  },
  {
    id: 'graftedParade', name: 'The Parade', tier: 3,
    coreShape: 'sphere', coreColor: 0x6a5548, coreSize: 0.65,
    segKind: 'fist', segColor: 0xc49c86, segCount: 8, segHp: 24, layout: 'radial',
    hp: 200, radius: 0.9, speed: 1.5, dmgPerSeg: 4, windup: 0.6, cooldown: 1.3,
  },
];

export const GRAFTED_BY_ID: Record<string, GraftedType> = Object.fromEntries(
  GRAFTED_TYPES.map((t) => [t.id, t]),
);

interface Segment {
  group: THREE.Group;
  part: EnemyPart;
  hp: number;
  severed: boolean;
  baseRot: THREE.Euler;
  phase: number;
}

interface FallingPiece {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: number;
  t: number;
}

interface SeverEvent {
  pos: THREE.Vector3;
  label: string;
}

function buildSegment(kind: SegKind, color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = makePS1Material({ color });
  switch (kind) {
    case 'serpent': {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 7), mat);
      neck.geometry.translate(0, 0.25, 0);
      neck.rotation.x = Math.PI / 2.6;
      g.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mat);
      head.scale.set(0.85, 0.8, 1.3);
      head.position.set(0, 0.2, 0.42);
      g.add(head);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), new THREE.MeshBasicMaterial({ color: 0xd8e44a }));
        eye.position.set(s * 0.05, 0.25, 0.5);
        g.add(eye);
      }
      break;
    }
    case 'fist': {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 7), mat);
      arm.geometry.translate(0, 0.22, 0);
      arm.rotation.x = Math.PI / 2.4;
      g.add(arm);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), mat);
      fist.position.set(0, 0.16, 0.38);
      g.add(fist);
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.06), makePS1Material({ color: 0xa08672 }));
      knuckle.position.set(0, 0.22, 0.42);
      g.add(knuckle);
      break;
    }
    case 'head': {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.22, 7), mat);
      neck.geometry.translate(0, 0.11, 0);
      g.add(neck);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
      skull.scale.set(0.92, 1.08, 0.98);
      skull.position.y = 0.3;
      g.add(skull);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.08), mat);
      jaw.position.set(0, 0.22, 0.05);
      g.add(jaw);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.005), makePS1Material({ color: 0x1a1614 }));
        eye.position.set(s * 0.035, 0.32, 0.09);
        g.add(eye);
      }
      break;
    }
    case 'plate': {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.07), mat);
      slab.position.set(0, 0.24, 0.12);
      slab.rotation.x = -0.25;
      g.add(slab);
      const rivetMat = makePS1Material({ color: 0x3a3a3a });
      for (const [rx, ry] of [[-0.12, 0.1], [0.12, 0.1], [-0.12, 0.38], [0.12, 0.38]] as const) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), rivetMat);
        rivet.position.set(rx, ry, 0.16);
        g.add(rivet);
      }
      break;
    }
    case 'horn': {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 7), mat);
      horn.geometry.translate(0, 0.25, 0);
      horn.rotation.x = Math.PI / 3.2;
      g.add(horn);
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), mat);
      tine.position.set(0.06, 0.2, 0.16);
      tine.rotation.x = Math.PI / 4;
      tine.rotation.z = -0.5;
      g.add(tine);
      break;
    }
    case 'lantern': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), mat);
      stalk.geometry.translate(0, 0.25, 0);
      stalk.rotation.x = Math.PI / 3;
      g.add(stalk);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x443311, emissive: 0xffc37a, emissiveIntensity: 0.9 }),
      );
      bulb.position.set(0, 0.3, 0.4);
      g.add(bulb);
      break;
    }
    case 'spine': {
      for (let i = 0; i < 3; i++) {
        const vert = new THREE.Mesh(new THREE.SphereGeometry(0.08 - i * 0.015, 7, 5), mat);
        vert.position.set(0, 0.12 + i * 0.14, 0.06 * i);
        g.add(vert);
      }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6), mat);
      tip.position.set(0, 0.55, 0.15);
      tip.rotation.x = 0.5;
      g.add(tip);
      break;
    }
  }
  return g;
}

export class GraftedChimera extends Enemy {
  readonly displayName: string;
  faction = 'grafted';
  private readonly cfg: GraftedType;
  private readonly segments: Segment[] = [];
  private readonly corePart: EnemyPart;
  private readonly core: THREE.Mesh;
  private readonly falling: FallingPiece[] = [];
  private severEvents: SeverEvent[] = [];

  private state: 'approach' | 'windup' | 'strike' | 'recover' = 'approach';
  private timer = 0.5 + Math.random() * 0.5;
  private t = Math.random() * 10;
  private struck = false;
  private readonly lungeDir = new THREE.Vector3();

  constructor(cfg: GraftedType) {
    super();
    this.cfg = cfg;
    this.displayName = cfg.name;
    this.maxHp = this.hp = cfg.hp;
    this.radius = cfg.radius;

    // Stub legs — the grafts are the point; the chassis just has to walk.
    const legMat = makePS1Material({ color: 0x2a2624 });
    for (const [lx, lz] of [[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 6), legMat);
      leg.position.set(lx * cfg.radius * 2, 0.25, lz * cfg.radius * 2);
      this.object.add(leg);
    }

    // The core mass.
    const coreMat = makePS1Material({ color: cfg.coreColor });
    const coreGeo =
      cfg.coreShape === 'sphere' ? new THREE.SphereGeometry(cfg.coreSize, 9, 7)
      : cfg.coreShape === 'box' ? new THREE.BoxGeometry(cfg.coreSize * 1.5, cfg.coreSize * 1.2, cfg.coreSize * 1.2)
      : new THREE.SphereGeometry(cfg.coreSize, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.core.position.y = 0.55 + cfg.coreSize * 0.6;
    this.object.add(this.core);
    // Suture seams: the surgery shows.
    const seamMat = makePS1Material({ color: 0x2a1a1a });
    for (let i = 0; i < 3; i++) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(cfg.coreSize * 1.4, 0.025, 0.03), seamMat);
      seam.position.copy(this.core.position);
      seam.position.y += (i - 1) * cfg.coreSize * 0.4;
      seam.rotation.y = i * 1.1;
      this.object.add(seam);
    }

    // The grafts.
    for (let i = 0; i < cfg.segCount; i++) {
      const group = buildSegment(cfg.segKind, cfg.segColor);
      if (cfg.layout === 'radial') {
        const a = (i / cfg.segCount) * Math.PI * 2;
        group.position.set(Math.sin(a) * cfg.coreSize * 0.8, this.core.position.y, Math.cos(a) * cfg.coreSize * 0.8);
        group.rotation.y = a;
      } else if (cfg.layout === 'spine') {
        group.position.set(0, this.core.position.y + cfg.coreSize * 0.4 + 0.05 * i, -0.15 + i * 0.07);
        group.rotation.y = Math.PI + (i % 2 === 0 ? 0.3 : -0.3);
        group.rotation.x = -0.2 - i * 0.06;
      } else {
        group.position.set((i - (cfg.segCount - 1) / 2) * 0.26, this.core.position.y + cfg.coreSize * 0.55, 0.05);
      }
      this.object.add(group);
      const part: EnemyPart = {
        tag: cfg.segKind, node: group, radius: 0.28, damageMultiplier: 1, weakPoint: false, active: true,
      };
      this.segments.push({
        group, part, hp: cfg.segHp, severed: false,
        baseRot: group.rotation.clone(), phase: Math.random() * Math.PI * 2,
      });
    }

    this.corePart = {
      tag: 'core', node: this.core, radius: cfg.coreSize, damageMultiplier: 1, weakPoint: false, active: true,
    };
    this.parts = [this.corePart, ...this.segments.map((s) => s.part)];
    this.registerFlashMaterials();
  }

  get aliveSegments(): number {
    return this.segments.filter((s) => !s.severed).length;
  }

  /** Battle drains these each frame: gore + message per torn-off graft. */
  drainSevered(): SeverEvent[] {
    const out = this.severEvents;
    this.severEvents = [];
    return out;
  }

  override takeHit(amount: number, part: EnemyPart | null): number {
    const seg = part ? this.segments.find((s) => s.part === part) : undefined;
    if (!seg || seg.severed) return super.takeHit(amount, part);

    // Graft damage: its own pool, not the core's.
    const dealt = Math.round(amount * part!.damageMultiplier);
    seg.hp -= dealt;
    this.hurtFlash = 0.18;
    this.addRecentDamage(dealt);
    if (seg.hp <= 0) this.sever(seg);
    return dealt;
  }

  private sever(seg: Segment): void {
    seg.severed = true;
    seg.part.active = false;
    const pos = seg.group.getWorldPosition(new THREE.Vector3());
    // Detach into the world and let it fall where the fight is.
    const scene = this.object.parent;
    if (scene) scene.attach(seg.group);
    this.falling.push({
      mesh: seg.group,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 2),
      spin: (Math.random() - 0.5) * 8,
      t: 0,
    });
    this.severEvents.push({ pos, label: `${this.displayName}'s ${this.cfg.segKind}` });
    if (this.aliveSegments === 0) {
      // Stripped bare: the core is exposed, and it knows.
      this.corePart.weakPoint = true;
      this.corePart.damageMultiplier = 2;
      this.revealWeakness();
      this.stun(1.2); // one clean beat of panic
    }
  }

  protected updateUprightAnim(dt: number): void {
    this.t += dt;
    for (const s of this.segments) {
      if (s.severed) continue;
      s.group.rotation.z = s.baseRot.z + Math.sin(this.t * 2 + s.phase) * 0.12;
      s.group.rotation.x = s.baseRot.x + Math.sin(this.t * 1.4 + s.phase) * 0.05;
    }
    // The core breathes wrong.
    const b = 1 + Math.sin(this.t * 2.6) * 0.03;
    this.core.scale.set(b, 1 / b, b);
  }

  updateBattle(dt: number, ctx: BattleContext): void {
    if (this.dead) return;
    this.updateUprightAnim(dt);
    this.timer -= dt;
    const pos = this.object.position;
    const dist = pos.distanceTo(ctx.playerPos);
    const toKat = ctx.playerPos.clone().sub(pos).setY(0).normalize();

    switch (this.state) {
      case 'approach': {
        pos.addScaledVector(toKat, this.cfg.speed * dt);
        this.object.rotation.y = Math.atan2(toKat.x, toKat.z);
        if (dist < this.cfg.radius + 1.6) {
          this.state = 'windup';
          this.timer = this.cfg.windup;
        }
        break;
      }
      case 'windup': {
        // Telegraph: every surviving graft rears back together.
        const k = 1 - Math.max(0, this.timer) / this.cfg.windup;
        for (const s of this.segments) {
          if (!s.severed) s.group.rotation.x = s.baseRot.x - k * 0.7;
        }
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 0.28;
          this.struck = false;
          this.lungeDir.copy(toKat);
        }
        break;
      }
      case 'strike': {
        pos.addScaledVector(this.lungeDir, 5.5 * dt);
        const k = 1 - Math.max(0, this.timer) / 0.28;
        for (const s of this.segments) {
          if (!s.severed) s.group.rotation.x = s.baseRot.x - 0.7 + k * 1.3;
        }
        if (!this.struck && k > 0.4 && !ctx.playerIFrames && dist < this.cfg.radius + 1.5) {
          this.struck = true;
          ctx.dealDamageToPlayer(Math.max(4, this.cfg.dmgPerSeg * this.aliveSegments));
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = this.cfg.cooldown;
          for (const s of this.segments) {
            if (!s.severed) s.group.rotation.x = s.baseRot.x;
          }
        }
        break;
      }
      case 'recover': {
        // Drifts off you while it regathers whatever counts as nerve.
        pos.addScaledVector(toKat, -this.cfg.speed * 0.4 * dt);
        if (this.timer <= 0) {
          this.state = 'approach';
          this.timer = 0;
        }
        break;
      }
    }
  }

  override updateAlways(realDt: number): void {
    super.updateAlways(realDt);
    // Torn-off grafts fall, bounce once conceptually, rot away fast.
    for (const f of this.falling) {
      f.t += realDt;
      f.vel.y -= 9 * realDt;
      f.mesh.position.addScaledVector(f.vel, realDt);
      f.mesh.rotation.x += f.spin * realDt;
      f.mesh.rotation.z += f.spin * 0.7 * realDt;
      if (f.mesh.position.y < 0.05) {
        f.mesh.position.y = 0.05;
        f.vel.set(0, 0, 0);
        f.spin *= 0.6;
      }
      if (f.t > 2.2) f.mesh.parent?.remove(f.mesh);
    }
  }
}
