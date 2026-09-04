import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type Camera,
  type Scene,
} from '@babylonjs/core';
import type { InputSample } from '../core/input';
import type { EnemyActor, EnemyPart } from '../enemies/enemyActor';
import type { GameState } from '../gameplay/gameState';
import type { PlayerController } from '../player/playerController';
import type { BattleHud } from '../ui/battleHud';
import { projectToScreen } from '../ui/screen';

// EVEGDD Ch.3: the ATB battle, Parasite-Eve lineage stated outright. Real time
// runs until the gauge fills; the gauge buys a menu; the menu stops the world
// while she decides where to put the round.
//
// Screen-space note, since this is the one piece that does NOT transfer from
// the Three build by eye: Three projects to NDC with +Y up and x/y in -1..1,
// so its Precision Aim math flipped and rescaled by hand. Babylon's
// Vector3.Project goes straight to viewport pixels with Y measured DOWN from
// the top, which is already the space the sweep lines live in. So the
// conversion here is a divide by width/height and nothing else — no flip. Get
// that backwards and every precision shot lands mirrored about the horizon,
// which reads as "the crosshair lies" rather than as a bug.

export type BattlePhase =
  | 'inactive'
  | 'active' // real time: ATB fills, she moves, they act
  | 'menu' // paused: Attack / Reload / Precision / Escape
  | 'aim' // paused: range ring + part cycling
  | 'sweepH' // paused: Precision Aim horizontal sweep
  | 'sweepV' // paused: Precision Aim vertical sweep
  | 'fire' // real time: rooted, the shot resolves
  | 'won';

interface TargetEntry {
  enemy: EnemyActor;
  part: EnemyPart;
}

const WEAPON_RANGE = 6;
const DISENGAGE_RANGE = 16;

export class BattleSystem {
  phase: BattlePhase = 'inactive';

  private enemies: EnemyActor[] = [];
  private atb = 0;
  private menuIndex = 0;
  private targets: TargetEntry[] = [];
  private targetIndex = 0;
  private fireTimer = 0;
  private sweepT = 0;
  private lockedX = 0.5;
  private lockedY = 0.5;
  private pendingCrit: 'none' | 'weak' | 'body' | 'miss' = 'none';
  private victoryTimer = 0;
  private atbWasFull = false;
  private reloadPending = false;
  private readonly killsSeen = new Set<EnemyActor>();
  private readonly ring: Mesh;
  private readonly marker: Mesh;
  private readonly worldPoint = new Vector3();

  onKill: ((enemy: EnemyActor, wasLast: boolean) => void) | null = null;
  onVictory: (() => void) | null = null;
  onDefeat: (() => void) | null = null;
  /**
   * The fight is over: here is everyone who was in it. Survivors go back to
   * the world simulation, corpses get cleaned up — battle doesn't own them
   * permanently, it borrows them.
   */
  onEnd: ((participants: EnemyActor[]) => void) | null = null;

  constructor(
    private readonly state: GameState,
    private readonly scene: Scene,
    private readonly hud: BattleHud,
  ) {
    const glow = (hex: string, alpha: number): StandardMaterial => {
      const mat = new StandardMaterial(`battleGlow-${hex}`, scene);
      mat.emissiveColor = Color3.FromHexString(hex);
      mat.diffuseColor = Color3.Black();
      mat.specularColor = Color3.Black();
      mat.disableLighting = true;
      mat.alpha = alpha;
      mat.backFaceCulling = false;
      return mat;
    };

    // The ring on the ground does the communicating: this is your reach.
    this.ring = MeshBuilder.CreateTorus('rangeRing', {
      diameter: WEAPON_RANGE * 2, thickness: 0.07, tessellation: 56,
    }, scene);
    this.ring.material = glow('#55ffbb', 0.5);
    this.ring.isPickable = false;
    this.ring.setEnabled(false);

    this.marker = MeshBuilder.CreateTorus('targetMarker', {
      diameter: 0.42, thickness: 0.05, tessellation: 20,
    }, scene);
    const markerMat = glow('#ffdd55', 0.95);
    markerMat.disableDepthWrite = true;
    this.marker.material = markerMat;
    this.marker.isPickable = false;
    this.marker.renderingGroupId = 2; // drawn over the world, like a HUD element
    this.marker.setEnabled(false);
  }

  get active(): boolean {
    return this.phase !== 'inactive';
  }

  /** The GameClock reads this: menus and sweeps stop the world. */
  get wantsPause(): boolean {
    return this.phase === 'menu' || this.phase === 'aim'
      || this.phase === 'sweepH' || this.phase === 'sweepV';
  }

  /** Her movement is her own only in real-time phases. */
  get playerControlled(): boolean {
    return this.phase === 'active';
  }

  get atbFraction(): number {
    return this.atb;
  }

  get enemiesAlive(): EnemyActor[] {
    return this.enemies.filter((e) => !e.dead);
  }

  /**
   * Begin a fight, or fold newcomers into the one already running. Callers
   * hand over creatures they have already detached from the world sim, so
   * refusing them outright would leak them out of both systems — in an A-Life
   * world something else wandering in mid-fight is the normal case, not an
   * error.
   */
  start(enemies: EnemyActor[]): void {
    if (enemies.length === 0) return;
    for (const enemy of enemies) {
      // Species she's fought before glow on sight.
      if (this.state.knownWeaknesses.includes(enemy.displayName)) enemy.revealWeakness();
    }
    if (this.active) {
      this.enemies.push(...enemies);
      this.hud.message(
        enemies.length > 1 ? 'More of them.' : `${enemies[0]!.displayName} joins in.`,
      );
      return;
    }
    this.enemies = enemies;
    this.killsSeen.clear();
    this.atb = 0;
    this.phase = 'active';
    this.hud.setVisible(true);
    this.hud.message('CHIMERAS ATTACK');
  }

  update(
    realDt: number,
    gameDt: number,
    input: InputSample,
    player: PlayerController,
    camera: Camera,
  ): void {
    if (this.phase === 'inactive') return;

    for (const enemy of this.enemies) {
      enemy.updateAlways(realDt);
      if (enemy.dead && !this.killsSeen.has(enemy)) {
        this.killsSeen.add(enemy);
        this.onKill?.(enemy, this.enemiesAlive.length === 0);
        this.hud.message(`${enemy.displayName} is destroyed.`);
      }
    }

    if (this.atb >= 1 && !this.atbWasFull) {
      this.atbWasFull = true;
      this.hud.message('ATB READY');
    } else if (this.atb < 1) {
      this.atbWasFull = false;
    }

    // The range ring blooms out of her the moment the world stops.
    const paused = this.phase === 'menu' || this.phase === 'aim';
    this.ring.setEnabled(paused);
    if (paused) {
      this.ring.position.set(player.position.x, 0.06, player.position.z);
    }

    // They only act while the world is running.
    if (gameDt > 0) {
      for (const enemy of this.enemiesAlive) {
        if (enemy.tickStun(gameDt)) continue;
        this.pressAttack(enemy, player, gameDt);
      }
      this.separate(player);
    }

    switch (this.phase) {
      case 'active': {
        let nearest = Infinity;
        for (const enemy of this.enemiesAlive) {
          nearest = Math.min(nearest, Vector3.Distance(enemy.position, player.position));
        }
        // Finite check: with everything dead this is Infinity, and that's a
        // victory below, not a disengage.
        if (Number.isFinite(nearest) && nearest > DISENGAGE_RANGE) {
          this.hud.message('She leaves them behind.');
          this.end();
          return;
        }
        this.atb = Math.min(1, this.atb + this.state.atbRatePerSec * gameDt);
        if (this.atb >= 1 && input.confirmJust) this.openMenu();
        if (this.state.hp <= 0) {
          this.end();
          this.onDefeat?.();
          return;
        }
        this.checkVictory();
        break;
      }
      case 'menu':
        this.updateMenu(input);
        break;
      case 'aim':
        this.updateAim(input, player, camera);
        break;
      case 'sweepH':
      case 'sweepV':
        this.updateSweep(realDt, input, camera);
        break;
      case 'fire':
        this.fireTimer -= realDt;
        if (this.fireTimer <= 0) {
          if (this.reloadPending) {
            this.reloadPending = false;
            this.spendTurn();
          } else {
            this.resolveShot();
          }
          this.checkVictory();
          if (this.phase === 'fire') this.phase = 'active';
        }
        break;
      case 'won':
        this.victoryTimer -= realDt;
        if (this.victoryTimer <= 0) this.end();
        break;
    }

    this.hud.setGauges(
      this.state.hp, this.state.maxHp, this.atb, this.state.limit,
      this.state.ammoInClip, this.state.reserveAmmo,
    );
  }

  /** Contact damage: nothing has a swing animation budget yet, so they press. */
  private pressAttack(enemy: EnemyActor, player: PlayerController, gameDt: number): void {
    const dist = Vector3.Distance(enemy.position, player.position);
    if (dist > enemy.radius + 0.75) return;
    if (player.iFramesActive) return;
    this.state.damagePlayer(enemy.touchDps * gameDt);
  }

  /** Nothing stacks into anything else, including into her. */
  private separate(player: PlayerController): void {
    const alive = this.enemiesAlive;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i]!;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j]!;
        pushApart(a.position, b.position, a.radius + b.radius, 0.5);
      }
      pushApart(a.position, player.position, a.radius + 0.4, 0);
    }
  }

  // ---- menu -----------------------------------------------------------

  private menuEntries(): { label: string; enabled: boolean; action: () => void }[] {
    const s = this.state;
    return [
      {
        label: `Attack  (${s.ammoInClip}/${s.clipSize})`,
        enabled: s.ammoInClip > 0,
        action: () => this.openAim(),
      },
      {
        label: `Precision Aim  [${Math.floor(s.limit)}%]`,
        enabled: s.limit >= 100 && s.ammoInClip > 0,
        action: () => {
          this.hud.hideMenu();
          this.phase = 'sweepH';
          this.sweepT = 0;
        },
      },
      {
        label: `Reload  [${s.reserveAmmo} reserve]`,
        enabled: s.reserveAmmo > 0 && s.ammoInClip < s.clipSize,
        action: () => {
          const n = s.reload();
          this.hud.message(`${n} rounds. Hands steadier than they should be.`);
          this.reloadPending = true;
          this.beginFire(s.reloadSeconds);
        },
      },
      {
        label: 'Escape',
        enabled: true,
        action: () => {
          this.hud.message('She backs out of it.');
          this.end();
        },
      },
    ];
  }

  private openMenu(): void {
    this.phase = 'menu';
    this.menuIndex = 0;
    this.marker.setEnabled(false);
    this.hud.showMenu(this.menuEntries(), this.menuIndex);
  }

  private updateMenu(input: InputSample): void {
    const entries = this.menuEntries();
    if (input.navDownJust) this.menuIndex = (this.menuIndex + 1) % entries.length;
    if (input.navUpJust) this.menuIndex = (this.menuIndex + entries.length - 1) % entries.length;
    if (input.dodgeJust) {
      this.hud.hideMenu();
      this.phase = 'active';
      return;
    }
    if (input.confirmJust) {
      const entry = entries[this.menuIndex]!;
      if (!entry.enabled) {
        this.hud.message('Not now.');
      } else {
        this.hud.hideMenu();
        entry.action();
        return;
      }
    }
    this.hud.showMenu(entries, this.menuIndex);
  }

  // ---- aim ------------------------------------------------------------

  private openAim(): void {
    this.targets = [];
    for (const enemy of this.enemiesAlive) {
      // Out of reach is out of the fight: the ring is not decoration.
      if (Vector3.Distance(enemy.position, this.ring.position) > WEAPON_RANGE) continue;
      for (const part of enemy.parts) {
        if (part.active) this.targets.push({ enemy, part });
      }
    }
    if (this.targets.length === 0) {
      this.hud.message('Nothing in range.');
      this.openMenu();
      return;
    }
    this.phase = 'aim';
    this.targetIndex = 0;
  }

  private updateAim(input: InputSample, player: PlayerController, camera: Camera): void {
    void player;
    if (input.navLeftJust || input.navUpJust) {
      this.targetIndex = (this.targetIndex + this.targets.length - 1) % this.targets.length;
    }
    if (input.navRightJust || input.navDownJust) {
      this.targetIndex = (this.targetIndex + 1) % this.targets.length;
    }

    const target = this.targets[this.targetIndex]!;
    const at = target.enemy.aimPoint(target.part, this.worldPoint);
    this.marker.setEnabled(true);
    this.marker.position.copyFrom(at);
    // Face the ring at the camera so it reads as a reticle, not a hoop.
    this.marker.lookAt(camera.globalPosition);

    if (input.dodgeJust) {
      this.marker.setEnabled(false);
      this.openMenu();
      return;
    }
    if (input.confirmJust) {
      this.marker.setEnabled(false);
      this.pendingCrit = 'none';
      this.beginFire(0.4);
    }
  }

  // ---- Precision Aim --------------------------------------------------

  private updateSweep(realDt: number, input: InputSample, camera: Camera): void {
    if (this.phase === 'sweepH') {
      this.sweepT += realDt / 1.3; // full sweep 1.3s, ping-ponging
      const f = pingPong(this.sweepT);
      this.hud.setSweep('h', f);
      if (input.confirmJust) {
        this.lockedY = f;
        this.phase = 'sweepV';
        this.sweepT = 0;
      }
      return;
    }
    this.sweepT += realDt / 0.85; // the second sweep is faster
    const f = pingPong(this.sweepT);
    this.hud.setSweep('v', f);
    if (input.confirmJust) {
      this.lockedX = f;
      this.hud.setSweep('none', 0);
      this.resolvePrecision(camera);
    }
  }

  /**
   * What a precision cross at (x, y) — viewport fractions, y down from the top
   * — would strike. Weak points count even when inactive: the freeze-frame
   * catches anatomy mid-motion.
   *
   * Read-only, so the harness can assert the projection actually hits what it
   * looks like it hits without firing a round.
   */
  probePrecision(
    camera: Camera,
    lockedX: number,
    lockedY: number,
  ): { entry: TargetEntry; kind: 'weak' | 'body' } | null {
    const engine = this.scene.getEngine();
    const aspect = engine.getRenderWidth() / engine.getRenderHeight();

    let kind: 'weak' | 'body' | null = null;
    let best: TargetEntry | null = null;

    for (const enemy of this.enemiesAlive) {
      for (const part of enemy.parts) {
        if (!part.active && !part.weakPoint) continue;
        const at = enemy.aimPoint(part, this.worldPoint);
        const screen = projectToScreen(this.scene, at);
        if (!screen.onScreen) continue;

        // Forgiving screen radius: the part's size at that distance.
        const dist = Vector3.Distance(at, camera.globalPosition);
        const viewHeight = 2 * dist * Math.tan(camera.fov / 2);
        const rFrac = (part.radius * 1.6) / viewHeight;
        const dx = (screen.x - lockedX) * aspect;
        const dy = screen.y - lockedY;
        if (Math.hypot(dx / aspect, dy) >= rFrac) continue;

        if (part.weakPoint) {
          kind = 'weak';
          best = { enemy, part };
        } else if (kind !== 'weak') {
          kind = 'body';
          best = { enemy, part };
        }
      }
    }
    return best && kind ? { entry: best, kind } : null;
  }

  /** Where the two locked lines crossed, resolved into a shot. */
  private resolvePrecision(camera: Camera): void {
    const found = this.probePrecision(camera, this.lockedX, this.lockedY);
    this.state.limit = 0;
    this.pendingCrit = found?.kind ?? 'miss';
    if (found) {
      this.targets = [found.entry];
      this.targetIndex = 0;
    }
    this.beginFire(0.25);
  }

  // ---- firing ---------------------------------------------------------

  private beginFire(delay: number): void {
    this.phase = 'fire';
    this.fireTimer = delay;
  }

  private resolveShot(): void {
    const s = this.state;
    if (s.ammoInClip <= 0) {
      this.spendTurn();
      return;
    }
    s.ammoInClip--;

    if (this.pendingCrit === 'miss') {
      this.hud.message('The cross finds nothing but air.');
      this.spendTurn();
      return;
    }
    const target = this.targets[this.targetIndex];
    if (!target || target.enemy.dead) {
      this.spendTurn();
      return;
    }

    const wound = target.enemy.aimPoint(target.part, this.worldPoint).clone();
    let dealt: number;
    let crit = false;

    if (this.pendingCrit === 'weak') {
      // A crit ignores part overrides outright — that's the point of it.
      dealt = target.enemy.takeHit(s.gunDamage * 6, null);
      crit = true;
      this.hud.message(`CRITICAL — ${dealt} damage!`);
      if (!target.enemy.dead) target.enemy.stun(1.8);
    } else if (this.pendingCrit === 'body') {
      dealt = target.enemy.takeHit(s.gunDamage * 2, null);
      this.hud.message(`Precision hit — ${dealt} damage.`);
    } else {
      dealt = target.enemy.takeHit(s.gunDamage, target.part);
      crit = target.part.weakPoint === true || target.part.damageMultiplier > 1;
      this.hud.message(
        target.part.flatDamage !== undefined
          ? `It barely notices. (${dealt})`
          : `${target.part.tag} hit — ${dealt} damage.`,
      );
      if (crit && !target.enemy.dead) target.enemy.stun(1.2);
    }

    this.floatDamage(wound, dealt, crit);
    s.addLimit(dealt * 0.6);
    if (!target.enemy.dead) this.noteHit(target.enemy);
    this.pendingCrit = 'none';
    this.spendTurn();
  }

  /** Put the number where the wound is, in screen space. */
  private floatDamage(wound: Vector3, amount: number, crit: boolean): void {
    const screen = projectToScreen(this.scene, wound);
    if (!screen.onScreen) return;
    this.hud.floater(screen.x, screen.y, amount, crit);
  }

  /**
   * First blood teaches: the weak points glow from here on, and the species
   * goes into her mental bestiary — next time, they glow on sight.
   */
  private noteHit(enemy: EnemyActor): void {
    if (enemy.weaknessRevealed) return;
    enemy.revealWeakness();
    const weak = enemy.parts.find((p) => p.weakPoint);
    if (weak && this.state.learnWeakness(enemy.displayName)) {
      this.hud.message(`Something catches the light — the ${weak.tag}. She'll remember that.`);
    }
  }

  private spendTurn(): void {
    this.atb = 0;
    this.phase = 'active';
  }

  private checkVictory(): void {
    if (this.phase === 'won' || this.enemiesAlive.length > 0) return;
    this.phase = 'won';
    this.victoryTimer = 1.6;
    this.hud.message('The street goes quiet.');
    this.onVictory?.();
  }

  private end(): void {
    this.phase = 'inactive';
    const participants = this.enemies;
    this.enemies = [];
    this.targets = [];
    this.atb = 0;
    this.ring.setEnabled(false);
    this.marker.setEnabled(false);
    this.hud.hideMenu();
    this.hud.setSweep('none', 0);
    this.hud.setVisible(false);
    this.onEnd?.(participants);
  }

  /** For the headless harness. */
  get debug(): unknown {
    return {
      phase: this.phase,
      atb: Number(this.atb.toFixed(2)),
      limit: Math.floor(this.state.limit),
      hp: Math.round(this.state.hp),
      clip: this.state.ammoInClip,
      enemies: this.enemies.map((e) => ({
        name: e.displayName,
        hp: e.hp,
        dead: e.dead,
        parts: e.parts.map((p) => p.tag),
      })),
      target: this.targets[this.targetIndex]
        ? `${this.targets[this.targetIndex]!.enemy.displayName}/${this.targets[this.targetIndex]!.part.tag}`
        : null,
      menuIndex: this.menuIndex,
    };
  }
}

function pushApart(a: Vector3, b: Vector3, minDist: number, bShare: number): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= minDist || dist < 1e-6) return;
  const push = (minDist - dist) / dist;
  a.x -= dx * push * (1 - bShare);
  a.z -= dz * push * (1 - bShare);
  b.x += dx * push * bShare;
  b.z += dz * push * bShare;
}

function pingPong(t: number): number {
  const k = t % 2;
  return k <= 1 ? k : 2 - k;
}
