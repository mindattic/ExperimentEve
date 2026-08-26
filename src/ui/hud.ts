import type { GameState } from '../gameplay/gameState';
import type { BattleSystem } from '../battle/battle';

// DOM overlay HUD: HP always; PE/ATB/Limit bars during battle; ammo counter;
// one-line message feed (battle text + barks share it for now).
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly bars: Record<string, HTMLDivElement> = {};
  private readonly ammoEl: HTMLDivElement;
  private timeEl!: HTMLDivElement;
  private readonly msgEl: HTMLDivElement;
  private msgTimer = 0;

  constructor(hudRoot: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;left:14px;top:10px;width:190px;font-size:12px';
    hudRoot.appendChild(this.root);

    for (const [key, color] of [
      ['HP', '#c04040'],
      ['PE', '#4070c0'],
      ['ATB', '#48b060'],
      ['LIMIT', '#d08830'],
    ] as const) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:4px';
      const label = document.createElement('span');
      label.textContent = key;
      label.style.cssText = 'display:inline-block;width:44px;color:#b8c0c8';
      const track = document.createElement('div');
      track.style.cssText =
        'display:inline-block;width:130px;height:8px;background:#14181e;border:1px solid #3a444e;vertical-align:middle';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:0%;background:${color}`;
      track.appendChild(fill);
      row.append(label, track);
      this.root.appendChild(row);
      this.bars[key] = fill;
    }

    this.ammoEl = document.createElement('div');
    this.ammoEl.style.cssText = 'color:#cfd8dd;margin-top:2px';
    this.root.appendChild(this.ammoEl);

    this.timeEl = document.createElement('div');
    this.timeEl.style.cssText =
      'position:absolute;right:14px;top:10px;font-size:13px;color:#a8b4bc;text-align:right';
    hudRoot.appendChild(this.timeEl);

    this.msgEl = document.createElement('div');
    this.msgEl.style.cssText =
      'position:absolute;left:50%;transform:translateX(-50%);bottom:36px;font-size:15px;' +
      'color:#e8e0c8;background:rgba(4,8,14,.7);padding:4px 14px;display:none;white-space:nowrap';
    hudRoot.appendChild(this.msgEl);
  }

  message(text: string): void {
    this.msgEl.textContent = text;
    this.msgEl.style.display = 'block';
    this.msgTimer = 2.6;
  }

  update(realDt: number, state: GameState, battle: BattleSystem, watch?: string): void {
    if (watch !== undefined) this.timeEl.textContent = watch;
    this.bars['HP']!.style.width = `${(state.hp / state.maxHp) * 100}%`;
    this.bars['PE']!.style.width = `${(state.pe / state.maxPe) * 100}%`;
    this.bars['LIMIT']!.style.width = `${state.limit}%`;
    const atbFill = this.bars['ATB']!;
    atbFill.style.width = `${battle.active ? battle.atbFraction * 100 : 0}%`;
    atbFill.style.background = battle.atbFraction >= 1 ? '#8ae08a' : '#48b060';

    const peRow = this.bars['PE']!.parentElement!.parentElement as HTMLDivElement;
    const atbRow = atbFill.parentElement!.parentElement as HTMLDivElement;
    const limitRow = this.bars['LIMIT']!.parentElement!.parentElement as HTMLDivElement;
    const show = battle.active ? '' : 'none';
    peRow.style.display = show;
    atbRow.style.display = show;
    limitRow.style.display = show;

    this.ammoEl.textContent = `9mm  ${state.ammoInClip}/${state.clipSize}  [${state.reserveAmmo}]`;

    if (this.msgTimer > 0) {
      this.msgTimer -= realDt;
      if (this.msgTimer <= 0) this.msgEl.style.display = 'none';
    }
  }
}
