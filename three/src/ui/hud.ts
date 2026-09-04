import type { GameState } from '../gameplay/gameState';
import type { BattleSystem } from '../battle/battle';

// HUD: the top-left gauge cluster is drawn on a tiny canvas and upscaled
// with nearest-neighbor, so its pixels are the GAME's pixels — a crisp DOM
// gauge floating over a dithered frame reads as a browser, not a console.
// Messages/clock stay DOM (PS1 text was screen-space and clean-ish anyway).

const GW = 168; // gauge canvas logical size — matches internal-res density
const GH = 62;
const SCALE = 2;

export class Hud {
  private readonly gauge: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private timeEl!: HTMLDivElement;
  private readonly msgEl: HTMLDivElement;
  private msgTimer = 0;

  constructor(hudRoot: HTMLElement) {
    this.gauge = document.createElement('canvas');
    this.gauge.width = GW;
    this.gauge.height = GH;
    this.gauge.style.cssText =
      `position:absolute;left:14px;top:10px;width:${GW * SCALE}px;height:${GH * SCALE}px;` +
      'image-rendering:pixelated;z-index:8';
    hudRoot.appendChild(this.gauge);
    this.g = this.gauge.getContext('2d')!;

    this.timeEl = document.createElement('div');
    this.timeEl.style.cssText =
      'position:absolute;right:16px;bottom:14px;font-size:15px;color:#c8d0d8;text-align:right;' +
      'background:rgba(4,8,14,.55);padding:2px 10px;letter-spacing:1px;z-index:8';
    hudRoot.appendChild(this.timeEl);

    this.msgEl = document.createElement('div');
    this.msgEl.style.cssText =
      'position:absolute;left:50%;transform:translateX(-50%);bottom:36px;font-size:15px;z-index:8;' +
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

    const g = this.g;
    g.clearRect(0, 0, GW, GH);
    g.font = '7px monospace';
    g.textBaseline = 'top';

    const bar = (y: number, label: string, frac: number, color: string): void => {
      g.fillStyle = '#b8c0c8';
      g.fillText(label, 0, y);
      g.fillStyle = '#14181e';
      g.fillRect(34, y, 112, 7);
      g.strokeStyle = '#3a444e';
      g.lineWidth = 1;
      g.strokeRect(34.5, y + 0.5, 111, 6);
      g.fillStyle = color;
      g.fillRect(35, y + 1, Math.round(110 * Math.max(0, Math.min(1, frac))), 5);
    };

    let y = 0;
    bar(y, 'HP', state.hp / state.maxHp, '#c04040');
    y += 10;
    if (battle.active) {
      // The gauge is chimeric-DNA saturation, not "mana". Kat would object
      // to the word mana. Clinically.
      bar(y, 'DNA', state.pe / state.maxPe, '#4070c0');
      y += 10;
      bar(y, 'ATB', battle.atbFraction, battle.atbFraction >= 1 ? '#8ae08a' : '#48b060');
      y += 10;
      bar(y, 'LIM', state.limit / 100, '#d08830');
      y += 10;
    }
    g.fillStyle = '#cfd8dd';
    g.fillText(`9mm ${state.ammoInClip}/${state.clipSize} [${state.reserveAmmo}]`, 0, y + 2);
    g.fillText(`Lv ${state.level}  ${state.xp}/${state.xpToNext}`, 0, y + 12);

    if (this.msgTimer > 0) {
      this.msgTimer -= realDt;
      if (this.msgTimer <= 0) this.msgEl.style.display = 'none';
    }
  }
}
