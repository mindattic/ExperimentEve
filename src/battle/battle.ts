import * as THREE from 'three';
import type { Enemy, EnemyPart } from '../enemies/enemyBase';
import type { GameState } from '../gameplay/gameState';
import type { Inventory } from '../gameplay/inventory';
import { INFUSIONS } from '../gameplay/infusions';
import type { InputSample } from '../core/input';
import type { PlayerController } from '../player/playerController';
import type { Collider } from '../physics/colliders';

export type BattlePhase =
  | 'inactive'
  | 'active' // real time: ATB fills, player moves/dodges, enemies act
  | 'menu' // paused: Attack / PE / Item / Precision / Escape
  | 'aim' // paused: range dome + part cycling
  | 'sweepH' // paused: Precision Aim horizontal sweep
  | 'sweepV' // paused: Precision Aim vertical sweep
  | 'fire' // real time: rooted, shot resolves
  | 'won';

interface TargetEntry {
  enemy: Enemy;
  part: EnemyPart;
}

const WEAPON_RANGE = 6;

// PE1 battle loop. Owns the pause state (exposed as `wantsPause` for the
// GameClock), the menu/aiming UI (DOM), the range dome mesh, and combat math.
export class BattleSystem {
  phase: BattlePhase = 'inactive';

  private enemies: Enemy[] = [];
  private atb = 0;
  private menuIndex = 0;
  private targets: TargetEntry[] = [];
  private targetIndex = 0;
  private fireTimer = 0;
  private rapidPending = false;
  private domeGrow = 0;
  private domeShown = false;
  private atbWasFull = false;
  /** ATB gauge just filled — main plays the ready chirp. */
  onAtbReady: (() => void) | null = null;
  private pendingCrit: 'none' | 'weak' | 'body' | 'miss' = 'none';
  private sweepT = 0;
  private lockedY = 0.5;
  private lockedX = 0.5;
  private victoryTimer = 0;
  onMessage: ((text: string) => void) | null = null;
  /** Damage floater hook: world position of the wound, amount, crit flag. */
  onDamage: ((worldPos: THREE.Vector3, amount: number, crit: boolean) => void) | null = null;
  onShot: (() => void) | null = null;
  onVictory: (() => void) | null = null;
  onDefeat: (() => void) | null = null;
  /** Supplied by main: does Kat carry the fire axe? */
  hasAxe: (() => boolean) | null = null;
  /** Supplied by main: crafted-weapon ammo lives in the inventory. */
  inv: Inventory | null = null;
  private meleePending = false;
  private readonly lastPlayerPos = new THREE.Vector3();

  private readonly dome: THREE.Mesh;
  private readonly targetMarker: THREE.Mesh;
  private readonly menuEl: HTMLDivElement;
  private readonly sweepHEl: HTMLDivElement;
  private readonly sweepVEl: HTMLDivElement;

  constructor(
    private readonly state: GameState,
    private readonly scene: THREE.Scene,
    hudRoot: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(WEAPON_RANGE, 14, 8),
      new THREE.MeshBasicMaterial({
        color: 0x55ffbb,
        wireframe: true,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    );
    this.dome.visible = false;
    scene.add(this.dome);

    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }),
    );
    this.targetMarker.visible = false;
    this.targetMarker.renderOrder = 999;
    scene.add(this.targetMarker);

    this.menuEl = document.createElement('div');
    this.menuEl.style.cssText =
      'position:absolute;left:14px;bottom:64px;font-size:15px;line-height:1.5;display:none;z-index:8;' +
      'background:rgba(4,8,14,.82);border:1px solid #4a6a7a;padding:8px 14px;min-width:170px';
    hudRoot.appendChild(this.menuEl);

    const lineCss =
      'position:absolute;background:#ffdd55;box-shadow:0 0 6px #ffaa22;display:none;pointer-events:none;';
    this.sweepHEl = document.createElement('div');
    this.sweepHEl.style.cssText = lineCss + 'height:2px;';
    this.sweepVEl = document.createElement('div');
    this.sweepVEl.style.cssText = lineCss + 'width:2px;';
    hudRoot.append(this.sweepHEl, this.sweepVEl);

    // Cinematic letterbox: the frame narrows when a fight starts.
    const barCss =
      'position:absolute;left:0;right:0;height:0;background:#000;pointer-events:none;' +
      'transition:height .35s ease-out;z-index:5';
    this.barTop = document.createElement('div');
    this.barTop.style.cssText = barCss + ';top:0';
    this.barBottom = document.createElement('div');
    this.barBottom.style.cssText = barCss + ';bottom:0';
    hudRoot.append(this.barTop, this.barBottom);
  }

  private readonly barTop!: HTMLDivElement;
  private readonly barBottom!: HTMLDivElement;

  private setLetterbox(on: boolean): void {
    const h = on ? '7%' : '0';
    this.barTop.style.height = h;
    this.barBottom.style.height = h;
  }

  get active(): boolean {
    return this.phase !== 'inactive';
  }

  get wantsPause(): boolean {
    return this.phase === 'menu' || this.phase === 'aim' || this.phase === 'sweepH' || this.phase === 'sweepV';
  }

  /** Player movement is theirs only during real-time phases. */
  get playerControlled(): boolean {
    return this.phase === 'active';
  }

  get atbFraction(): number {
    return this.atb;
  }

  get enemiesAlive(): Enemy[] {
    return this.enemies.filter((e) => !e.dead);
  }

  /**
   * Player damage landed on this enemy: first blood reveals its weak points
   * (they glow from here on), and the species goes in Kat's mental bestiary
   * — next time, they glow on sight. Learning IS the progression.
   */
  noteHit(e: Enemy): void {
    if (e.weaknessRevealed) return;
    e.revealWeakness();
    const weak = e.parts.find((p) => p.weakPoint && p.tag !== 'tumor');
    if (weak && this.state.learnWeakness(e.displayName)) {
      this.onMessage?.(`Something catches the light — the ${weak.tag}. She'll remember that.`);
    }
  }

  start(enemies: Enemy[]): void {
    this.setLetterbox(true);
    this.enemies = enemies;
    // Species she's fought before: their weak points glow on sight.
    for (const e of enemies) {
      if (this.state.knownWeaknesses.includes(e.displayName)) e.revealWeakness();
    }
    for (const e of enemies) {
      if (!e.object.parent) this.scene.add(e.object);
    }
    this.atb = 0;
    this.phase = 'active';
    this.onMessage?.('CHIMERAS ATTACK');
  }

  update(
    realDt: number,
    gameDt: number,
    input: InputSample,
    player: PlayerController,
    camera: THREE.Camera,
    colliders: readonly Collider[],
  ): void {
    if (this.phase === 'inactive') return;
    this.lastPlayerPos.copy(player.position);

    for (const e of this.enemies) e.updateAlways(realDt);

    // ATB-full chirp (once per fill).
    if (this.atb >= 1 && !this.atbWasFull) {
      this.atbWasFull = true;
      this.onAtbReady?.();
    } else if (this.atb < 1) {
      this.atbWasFull = false;
    }

    // The range dome blooms out of Kat the moment the game pauses.
    const paused = this.phase === 'menu' || this.phase === 'aim';
    if (paused && !this.domeShown) {
      this.domeShown = true;
      this.domeGrow = 0;
    }
    if (!paused) this.domeShown = false;
    this.dome.visible = paused;
    if (paused) {
      this.domeGrow = Math.min(1, this.domeGrow + realDt * 2.0);
      const k = 1 - Math.pow(1 - this.domeGrow, 3); // ease-out bloom
      this.dome.scale.setScalar(Math.max(0.02, k));
      this.dome.position.copy(player.position);
    }

    // Enemies act only in real-time phases (gameDt is 0 while paused anyway,
    // but skipping entirely avoids dt=0 math).
    if (gameDt > 0) {
      const ctx = {
        playerPos: player.position,
        playerIFrames: player.iFramesActive,
        colliders,
        dealDamageToPlayer: (amount: number) => this.state.damagePlayer(amount),
      };
      for (const e of this.enemies) {
        if (!e.dead && !e.tickStun(gameDt)) e.updateBattle(gameDt, ctx);
      }
      // Separation: enemies never stack into one another (or into Kat).
      const alive = this.enemiesAlive;
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i]!;
        for (let j = i + 1; j < alive.length; j++) {
          const b = alive[j]!;
          pushApart(a.object.position, b.object.position, a.radius + b.radius, 0.5);
        }
        pushApart(a.object.position, player.position, a.radius + 0.4, 0);
      }
      this.state.regen(gameDt);
    }

    switch (this.phase) {
      case 'active': {
        // Disengage: leaving the fight zone counts as an escape (until real
        // arena-perimeter walls land with the encounter data).
        let nearest = Infinity;
        for (const e of this.enemiesAlive) {
          nearest = Math.min(nearest, e.object.position.distanceTo(player.position));
        }
        if (nearest > 18) {
          this.onMessage?.('She leaves them behind.');
          this.end();
          return;
        }
        this.atb = Math.min(1, this.atb + this.state.atbRatePerSec * gameDt);
        if (this.atb >= 1 && input.confirmJust) {
          this.openMenu();
        }
        if (this.state.hp <= 0) {
          this.end();
          this.onDefeat?.();
          return;
        }
        this.checkVictory(realDt);
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
      case 'fire': {
        this.fireTimer -= realDt;
        if (this.fireTimer <= 0) {
          if (this.meleePending) {
            this.meleePending = false;
            this.spendTurn();
            this.checkVictory(realDt);
            if (this.phase === 'fire') this.phase = 'active';
            break;
          }
          this.resolveShot();
          this.phase = this.enemiesAlive.length > 0 ? 'active' : this.phase;
          this.checkVictory(realDt);
          if (this.phase === 'fire') this.phase = 'active';
        }
        break;
      }
      case 'won': {
        this.victoryTimer -= realDt;
        if (this.victoryTimer <= 0) this.end();
        break;
      }
    }
  }

  // ---- menu ----------------------------------------------------------

  private menuOptions(): { label: string; enabled: boolean; action: () => void }[] {
    const s = this.state;
    return [
      {
        label: `Attack  (${s.ammoInClip}/${s.clipSize})`,
        enabled: s.ammoInClip > 0,
        action: () => this.openAim(),
      },
      ...(s.ammoInClip < s.clipSize && s.reserveAmmo > 0
        ? [
            {
              label: `Reload  [${s.reserveAmmo} reserve]`,
              enabled: true,
              action: () => {
                const n = s.reload();
                this.onMessage?.(`${n} rounds. Hands steadier than they should be.`);
                this.meleePending = true;
                this.beginFire(s.reloadSeconds); // rooted for the reload
              },
            },
          ]
        : []),
      {
        label: 'Proliferation — heal 30  (25 PE)',
        enabled: s.pe >= 25 && s.hp < s.maxHp,
        action: () => {
          s.pe -= 25;
          s.hp = Math.min(s.maxHp, s.hp + 30);
          this.onMessage?.('Forced cell division knits the wounds shut.');
          this.spendTurn();
        },
      },
      // Chimeric DNA infusions — body functions at gunpoint, per injector.
      ...(s.infusions.combustion
        ? [{
            label: `Combustion  (${INFUSIONS.combustion.peCost} PE)`,
            enabled: s.pe >= INFUSIONS.combustion.peCost && this.enemiesAlive.length > 0,
            action: () => {
              s.pe -= INFUSIONS.combustion.peCost;
              const t = this.nearestEnemy();
              if (t) {
                const dealt = t.takeHit(40, null);
                this.onDamage?.(t.object.position.clone().add(new THREE.Vector3(0, 1.2, 0)), dealt, false);
                this.onMessage?.(`COMBUSTION — ${t.displayName} ignites from the inside. ${dealt}.`);
                if (t.dead) this.onMessage?.(`${t.displayName} burns down.`);
              }
              this.spendTurn();
            },
          }]
        : []),
      ...(s.infusions.cryostasis
        ? [{
            label: `Cryostasis  (${INFUSIONS.cryostasis.peCost} PE)`,
            enabled: s.pe >= INFUSIONS.cryostasis.peCost && this.enemiesAlive.length > 0,
            action: () => {
              s.pe -= INFUSIONS.cryostasis.peCost;
              const t = this.nearestEnemy();
              if (t) {
                t.stun(4);
                this.onMessage?.(`CRYOSTASIS — the heat leaves ${t.displayName}. It goes still.`);
              }
              this.spendTurn();
            },
          }]
        : []),
      ...(s.infusions.neuroelectric
        ? [{
            label: `Neuroelectric  (${INFUSIONS.neuroelectric.peCost} PE)`,
            enabled: s.pe >= INFUSIONS.neuroelectric.peCost && this.enemiesAlive.length > 0,
            action: () => {
              s.pe -= INFUSIONS.neuroelectric.peCost;
              for (const e of this.enemiesAlive) {
                const dealt = e.takeHit(20, null);
                e.stun(0.7);
                this.onDamage?.(e.object.position.clone().add(new THREE.Vector3(0, 1.2, 0)), dealt, false);
              }
              this.onMessage?.('NEUROELECTRIC — every nerve is a wire. She crosses them.');
              this.spendTurn();
            },
          }]
        : []),
      ...(s.infusions.mitosis
        ? [{
            label: `Mitosis  (${INFUSIONS.mitosis.peCost} PE)`,
            enabled: s.pe >= INFUSIONS.mitosis.peCost && this.enemiesAlive.length > 0,
            action: () => {
              s.pe -= INFUSIONS.mitosis.peCost;
              const t = this.nearestEnemy();
              if (t) {
                t.growTumor();
                this.onMessage?.(`MITOSIS — a tumorous wound blooms on ${t.displayName}. Burst it.`);
              }
              this.spendTurn();
            },
          }]
        : []),
      ...(s.infusions.metabolicBurn
        ? [{
            label: `Metabolic Burn  (${INFUSIONS.metabolicBurn.peCost} PE, -5 HP)`,
            enabled: s.pe >= INFUSIONS.metabolicBurn.peCost && s.hasteTimer <= 0,
            action: () => {
              s.pe -= INFUSIONS.metabolicBurn.peCost;
              s.hp = Math.max(1, s.hp - 5);
              s.hasteTimer = 20;
              this.onMessage?.('METABOLIC BURN — she redlines. Everything else slows down.');
              this.spendTurn();
            },
          }]
        : []),
      {
        label: `Precision Aim  (LIMIT${s.limit >= 100 ? ' READY' : ` ${Math.floor(s.limit)}%`})`,
        enabled: s.limit >= 100 && s.ammoInClip > 0,
        action: () => this.openSweep(),
      },
      ...(s.abilities.rapidFire
        ? [
            {
              label: `Rapid Fire  (dump ${s.ammoInClip} rounds)`,
              enabled: s.ammoInClip > 1,
              action: () => {
                this.rapidPending = true;
                this.openAim();
              },
            },
          ]
        : []),
      ...(this.inv && this.inv.count('molotov') > 0
        ? [
            {
              label: `Molotov  (×${this.inv.count('molotov')})`,
              enabled: this.enemiesAlive.length > 0,
              action: () => {
                this.inv!.remove('molotov');
                const center = this.nearestEnemy();
                if (center) {
                  let hits = 0;
                  for (const e of this.enemiesAlive) {
                    if (e.object.position.distanceTo(center.object.position) < 3) {
                      const dealt = e.takeHit(35, null);
                      this.onDamage?.(e.object.position.clone().add(new THREE.Vector3(0, 1.2, 0)), dealt, false);
                      this.state.addLimit(dealt * 0.3);
                      hits++;
                      if (e.dead) this.onMessage?.(`${e.displayName} burns down.`);
                      else this.noteHit(e);
                    }
                  }
                  this.onMessage?.(`The bottle gets to be a protest again. ${hits} caught in the fire.`);
                }
                this.meleePending = true;
                this.beginFire(0.6);
              },
            },
          ]
        : []),
      ...(this.inv && this.inv.count('flamethrower') > 0
        ? [
            {
              label: `Flamethrower  (paint ×${this.inv.count('sprayCan')})`,
              enabled: this.inv.count('sprayCan') > 0 && this.nearestEnemyDist() < 4.2,
              action: () => {
                this.inv!.remove('sprayCan');
                let hits = 0;
                for (const e of this.enemiesAlive) {
                  if (e.object.position.distanceTo(this.lastPlayerPos) < 4.2) {
                    const dealt = e.takeHit(22, null);
                    this.onDamage?.(e.object.position.clone().add(new THREE.Vector3(0, 1.2, 0)), dealt, false);
                    this.state.addLimit(dealt * 0.3);
                    hits++;
                    if (e.dead) this.onMessage?.(`${e.displayName} is painted over. Permanently.`);
                    else this.noteHit(e);
                  }
                }
                this.onMessage?.(`A cone of burning paint. ${hits} hit.`);
                this.meleePending = true;
                this.beginFire(0.7);
              },
            },
          ]
        : []),
      ...(this.hasAxe?.()
        ? [
            {
              label: 'Fire Axe  (melee)',
              enabled: this.nearestEnemyDist() < 1.9,
              action: () => {
                const target = this.nearestEnemy();
                if (target) {
                  const dealt = target.takeHit(25, null);
                  this.onDamage?.(target.object.position.clone().add(new THREE.Vector3(0, 1.2, 0)), dealt, false);
                  this.onMessage?.(`The axe lands — ${dealt}.`);
                  this.state.addLimit(dealt * 0.5);
                  if (target.dead) this.onMessage?.(`${target.displayName} is destroyed.`);
                  else this.noteHit(target);
                }
                this.meleePending = true;
                this.beginFire(0.8); // rooted longer than a shot
              },
            },
          ]
        : []),
      {
        label: 'Escape',
        enabled: true,
        action: () => {
          this.onMessage?.('She breaks off the fight.');
          this.end();
        },
      },
    ];
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemiesAlive) {
      const d = e.object.position.distanceTo(this.lastPlayerPos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private nearestEnemyDist(): number {
    const e = this.nearestEnemy();
    return e ? e.object.position.distanceTo(this.lastPlayerPos) : Infinity;
  }

  private openMenu(): void {
    this.phase = 'menu';
    this.menuIndex = 0;
    this.renderMenu();
    this.menuEl.style.display = 'block';
  }

  private closeMenu(): void {
    this.menuEl.style.display = 'none';
  }

  private renderMenu(): void {
    const opts = this.menuOptions();
    this.menuEl.innerHTML = opts
      .map((o, i) => {
        const sel = i === this.menuIndex;
        const color = o.enabled ? (sel ? '#ffe28a' : '#cfd8dd') : '#5a6166';
        return `<div style="color:${color}">${sel ? '&#9656; ' : '&nbsp;&nbsp;'}${o.label}</div>`;
      })
      .join('');
  }

  private updateMenu(input: InputSample): void {
    const opts = this.menuOptions();
    if (input.navUpJust) this.menuIndex = (this.menuIndex + opts.length - 1) % opts.length;
    if (input.navDownJust) this.menuIndex = (this.menuIndex + 1) % opts.length;
    this.renderMenu();
    if (input.dodgeJust) {
      // Cancel: back to real time, gauge stays full.
      this.closeMenu();
      this.phase = 'active';
      return;
    }
    if (input.confirmJust) {
      const opt = opts[this.menuIndex]!;
      if (!opt.enabled) return;
      this.closeMenu();
      opt.action();
    }
  }

  private spendTurn(): void {
    this.atb = 0;
    this.phase = 'active';
  }

  // ---- aiming (dome + part cycling) -----------------------------------

  private openAim(): void {
    this.targets = [];
    for (const e of this.enemiesAlive) {
      for (const p of e.parts) {
        if (p.active) this.targets.push({ enemy: e, part: p });
      }
    }
    if (this.targets.length === 0) {
      this.onMessage?.('No target.');
      this.openMenu();
      return;
    }
    this.phase = 'aim';
    this.targetIndex = 0;
    this.dome.visible = true;
  }

  private updateAim(input: InputSample, player: PlayerController, camera: THREE.Camera): void {
    this.dome.position.copy(player.position);
    if (input.navLeftJust) this.targetIndex = (this.targetIndex + this.targets.length - 1) % this.targets.length;
    if (input.navRightJust || input.navDownJust) this.targetIndex = (this.targetIndex + 1) % this.targets.length;

    const t = this.targets[this.targetIndex]!;
    const wp = t.part.node.getWorldPosition(new THREE.Vector3());
    this.targetMarker.visible = true;
    this.targetMarker.position.copy(wp);
    this.targetMarker.lookAt((camera as THREE.PerspectiveCamera).position);

    if (input.dodgeJust) {
      this.rapidPending = false;
      this.dome.visible = false;
      this.targetMarker.visible = false;
      this.openMenu();
      return;
    }
    if (input.confirmJust) {
      this.dome.visible = false;
      this.targetMarker.visible = false;
      this.pendingCrit = 'none';
      // Rapid fire roots her longer: the whole clip goes downrange.
      this.beginFire(this.rapidPending ? 0.9 : 0.4);
    }
  }

  // ---- Precision Aim sweeps -------------------------------------------

  private openSweep(): void {
    this.phase = 'sweepH';
    this.sweepT = 0;
  }

  private canvasRect(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  private updateSweep(realDt: number, input: InputSample, camera: THREE.Camera): void {
    const rect = this.canvasRect();
    const appRect = (this.canvas.parentElement as HTMLElement).getBoundingClientRect();
    const offX = rect.left - appRect.left;
    const offY = rect.top - appRect.top;

    if (this.phase === 'sweepH') {
      this.sweepT += realDt / 1.3; // full sweep 1.3s, ping-pong
      const f = pingPong(this.sweepT);
      this.sweepHEl.style.display = 'block';
      this.sweepHEl.style.left = `${offX}px`;
      this.sweepHEl.style.width = `${rect.width}px`;
      this.sweepHEl.style.top = `${offY + f * rect.height}px`;
      if (input.confirmJust) {
        this.lockedY = f;
        this.phase = 'sweepV';
        this.sweepT = 0;
      }
    } else {
      this.sweepT += realDt / 0.85; // second sweep faster
      const f = pingPong(this.sweepT);
      this.sweepVEl.style.display = 'block';
      this.sweepVEl.style.top = `${offY}px`;
      this.sweepVEl.style.height = `${rect.height}px`;
      this.sweepVEl.style.left = `${offX + f * rect.width}px`;
      if (input.confirmJust) {
        this.lockedX = f;
        this.sweepHEl.style.display = 'none';
        this.sweepVEl.style.display = 'none';
        this.resolvePrecision(camera);
      }
    }
  }

  private resolvePrecision(camera: THREE.Camera): void {
    const cam = camera as THREE.PerspectiveCamera;
    let hit: 'miss' | 'body' | 'weak' = 'miss';
    let best: TargetEntry | null = null;
    const wp = new THREE.Vector3();
    for (const e of this.enemiesAlive) {
      for (const p of e.parts) {
        // Precision can strike weak points even when "inactive" — the freeze
        // frame catches anatomy mid-motion; body parts must be active.
        if (!p.active && !p.weakPoint) continue;
        p.node.getWorldPosition(wp);
        const dist = wp.distanceTo(cam.position);
        const ndc = wp.clone().project(cam);
        if (ndc.z > 1) continue;
        const sx = (ndc.x + 1) / 2;
        const sy = (1 - ndc.y) / 2;
        const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
        const rFrac = (p.radius * 1.6) / viewH; // forgiving screen radius
        const dx = (sx - this.lockedX) * cam.aspect; // aspect-correct x
        const dy = sy - this.lockedY;
        if (Math.hypot(dx / cam.aspect, dy) < rFrac) {
          if (p.weakPoint) {
            hit = 'weak';
            best = { enemy: e, part: p };
          } else if (hit !== 'weak') {
            hit = 'body';
            best = { enemy: e, part: p };
          }
        }
      }
    }
    this.state.limit = 0;
    this.pendingCrit = hit;
    if (best) this.targets = [best];
    this.targetIndex = 0;
    this.beginFire(0.25);
  }

  // ---- firing ----------------------------------------------------------

  private beginFire(delay: number): void {
    this.phase = 'fire';
    this.fireTimer = delay;
  }

  private resolveShot(): void {
    if (this.rapidPending) {
      this.rapidPending = false;
      this.resolveRapid();
      return;
    }
    const s = this.state;
    if (s.ammoInClip <= 0) return;
    s.ammoInClip--;
    this.onShot?.();

    if (this.pendingCrit === 'miss') {
      this.onMessage?.('The cross finds nothing but air.');
      this.spendTurn();
      return;
    }
    const t = this.targets[this.targetIndex];
    if (!t || t.enemy.dead) {
      this.spendTurn();
      return;
    }
    let dealt: number;
    const wound = t.part.node.getWorldPosition(new THREE.Vector3());
    if (this.pendingCrit === 'weak') {
      dealt = t.enemy.takeHit(s.gunDamage * 6, null); // crit ignores overrides
      this.onMessage?.(`CRITICAL — ${dealt} damage!`);
      this.onDamage?.(wound, dealt, true);
      if (!t.enemy.dead) {
        t.enemy.stun(1.8);
        this.onMessage?.(`${t.enemy.displayName} reels.`);
      }
    } else if (this.pendingCrit === 'body') {
      dealt = t.enemy.takeHit(s.gunDamage * 2, null);
      this.onMessage?.(`Precision hit — ${dealt} damage.`);
      this.onDamage?.(wound, dealt, false);
    } else {
      dealt = t.enemy.takeHit(s.gunDamage, t.part);
      this.onMessage?.(
        t.part.flatDamageOverride !== undefined
          ? `It barely notices. (${dealt})`
          : `${t.part.tag} hit — ${dealt} damage.`,
      );
      // Weak-point anatomy is this game's crit.
      const crit = t.part.weakPoint || t.part.damageMultiplier > 1;
      this.onDamage?.(wound, dealt, crit);
      if (crit && !t.enemy.dead) t.enemy.stun(1.2);
    }
    s.addLimit(dealt * 0.6);
    if (t.enemy.dead) this.onMessage?.(`${t.enemy.displayName} is destroyed.`);
    else this.noteHit(t.enemy);
    this.pendingCrit = 'none';
    this.spendTurn();
  }

  /**
   * Rapid Fire: the whole clip at one target. Every round rolls its own
   * spray-and-pray miss (the aim penalty); a few land hot (burst rounds).
   * The damage spike itself trips the sustained-damage stun.
   */
  private resolveRapid(): void {
    const s = this.state;
    const rounds = s.ammoInClip;
    s.ammoInClip = 0;
    this.onShot?.();
    const t = this.targets[this.targetIndex];
    if (!t || t.enemy.dead || rounds <= 0) {
      this.spendTurn();
      return;
    }
    const wound = t.part.node.getWorldPosition(new THREE.Vector3());
    let hits = 0;
    let total = 0;
    for (let i = 0; i < rounds; i++) {
      if (Math.random() < 0.3) continue; // aim penalty: some rounds spray wide
      let dmg = s.gunDamage;
      let burst = false;
      if (Math.random() < 0.12) {
        dmg *= 3; // burst round
        burst = true;
      }
      const dealt = t.enemy.takeHit(dmg, t.part);
      this.onDamage?.(wound, dealt, burst);
      total += dealt;
      hits++;
      if (t.enemy.dead) break;
    }
    this.onMessage?.(
      hits === 0
        ? 'The whole clip finds nothing but air.'
        : `RAPID FIRE — ${hits}/${rounds} land for ${total}.`,
    );
    if (!t.enemy.dead && t.enemy.stunned) this.onMessage?.(`${t.enemy.displayName} is staggered!`);
    s.addLimit(total * 0.6);
    if (t.enemy.dead) this.onMessage?.(`${t.enemy.displayName} is destroyed.`);
    else if (hits > 0) this.noteHit(t.enemy);
    this.pendingCrit = 'none';
    this.spendTurn();
  }

  // ---- end conditions --------------------------------------------------

  private checkVictory(_realDt: number): void {
    if (this.phase === 'won') return;
    if (this.enemiesAlive.length === 0 && this.enemies.length > 0) {
      this.phase = 'won';
      this.victoryTimer = 1.4;
      const xp = this.enemies.reduce((sum, e) => sum + e.maxHp, 0);
      const ups = this.state.addXp(xp);
      this.onMessage?.(`Clear. +${xp} XP.`);
      if (ups > 0) this.onMessage?.(`LEVEL UP — Lv ${this.state.level}. Allot points at a lighthouse.`);
      this.onVictory?.();
    }
  }

  private end(): void {
    this.setLetterbox(false);
    for (const e of this.enemies) {
      if (e.dead) this.scene.remove(e.object);
    }
    this.closeMenu();
    this.dome.visible = false;
    this.targetMarker.visible = false;
    this.sweepHEl.style.display = 'none';
    this.sweepVEl.style.display = 'none';
    this.phase = 'inactive';
    this.enemies = [];
  }
}

function pingPong(t: number): number {
  const m = t % 2;
  return m < 1 ? m : 2 - m;
}

/**
 * Push a away from b (and b away from a by `share`) until they no longer
 * overlap in XZ. share=0 leaves b (the player) unmoved.
 */
function pushApart(a: THREE.Vector3, b: THREE.Vector3, minDist: number, share: number): void {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d >= minDist || d < 1e-4) return;
  const push = (minDist - d) / d;
  a.x += dx * push * (1 - share);
  a.z += dz * push * (1 - share);
  b.x -= dx * push * share;
  b.z -= dz * push * share;
}
