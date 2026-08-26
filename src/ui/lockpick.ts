import type { InputSample } from '../core/input';

// Skyrim's lockpicking, shamelessly — with one difference that changes
// everything: THE WORLD DOES NOT PAUSE. She is crouched at a lock while the
// street stays live behind her. Rotate the pin (stick/A+D), hold confirm to
// torque the plug; the closer the pin is to the sweet spot, the further the
// plug turns. Torquing past the limit stresses the pin until it snaps.

export type LockResult = 'opened' | 'broke' | 'cancelled';

export class LockpickGame {
  open = false;
  /** Sweet-spot half-width in radians (easy ~0.38, hard ~0.16). */
  private tolerance = 0.3;
  private sweet = 0; // -PI/2..PI/2
  private pick = 0;
  private plug = 0; // 0..1 turned
  private stress = 0;
  private shakeT = 0;
  onResult: ((r: LockResult) => void) | null = null;
  onCreak: (() => void) | null = null;

  private readonly el: HTMLDivElement;
  private readonly plugEl: HTMLDivElement;
  private readonly pickEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:50%;bottom:120px;transform:translateX(-50%);width:170px;height:120px;' +
      'display:none;pointer-events:none';
    // Lock body: a chunky ring.
    const ring = document.createElement('div');
    ring.style.cssText =
      'position:absolute;left:15px;top:0;width:140px;height:140px;border-radius:50%;' +
      'border:10px solid #3a3f46;background:rgba(8,10,14,.85);box-shadow:0 0 22px #000';
    this.el.appendChild(ring);
    // Keyhole plug: rotates with successful torque.
    this.plugEl = document.createElement('div');
    this.plugEl.style.cssText =
      'position:absolute;left:63px;top:48px;width:44px;height:44px;border-radius:50%;background:#23262c;';
    this.plugEl.innerHTML =
      '<div style="position:absolute;left:19px;top:4px;width:6px;height:22px;background:#0c0e12;border-radius:3px"></div>';
    this.el.appendChild(this.plugEl);
    // The pin: a thin lever pivoting at the plug center.
    this.pickEl = document.createElement('div');
    this.pickEl.style.cssText =
      'position:absolute;left:84px;top:70px;width:3px;height:64px;background:#cfc9a8;' +
      'transform-origin:top center;box-shadow:0 0 4px #000';
    this.el.appendChild(this.pickEl);
    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText =
      'position:absolute;left:0;right:0;top:126px;text-align:center;font-size:11px;color:#9aa4ac;white-space:nowrap';
    this.hintEl.textContent = 'stick/A·D: angle · hold confirm: turn · dodge: leave it';
    this.el.appendChild(this.hintEl);
    hudRoot.appendChild(this.el);
  }

  /** Dev/test: aim the pin straight at the sweet spot. */
  cheatAim(): void {
    this.pick = this.sweet;
  }

  start(difficulty: 'easy' | 'hard'): void {
    this.open = true;
    this.tolerance = difficulty === 'easy' ? 0.38 : 0.17;
    this.sweet = (Math.random() * 1.7 - 0.85);
    this.pick = 0;
    this.plug = 0;
    this.stress = 0;
    this.el.style.display = 'block';
  }

  close(): void {
    this.open = false;
    this.el.style.display = 'none';
  }

  /** Runs on realDt — the world keeps simulating around this. */
  update(input: InputSample, realDt: number): void {
    if (!this.open) return;
    if (input.dodgeJust || input.menuJust) {
      this.close();
      this.onResult?.('cancelled');
      return;
    }

    // Rotate the pin (analog stick x or A/D through moveX).
    this.pick = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pick + input.moveX * 2.2 * realDt));

    const delta = Math.abs(this.pick - this.sweet);
    // How far this pin position allows the plug to turn (Skyrim's rule).
    const maxTurn = delta <= this.tolerance ? 1 : Math.max(0, 1 - (delta - this.tolerance) * 2.4);

    if (input.confirm) {
      this.plug = Math.min(maxTurn, this.plug + realDt * 1.4);
      if (this.plug >= 1) {
        this.close();
        this.onResult?.('opened');
        return;
      }
      if (this.plug >= maxTurn - 0.001) {
        // Jammed against the limit: stress builds, pin rattles.
        this.stress += realDt;
        this.shakeT += realDt * 40;
        if (this.stress > 0.85) {
          this.close();
          this.onResult?.('broke');
          return;
        }
        if (Math.random() < realDt * 6) this.onCreak?.();
      } else {
        this.stress = Math.max(0, this.stress - realDt * 0.5);
      }
    } else {
      this.plug = Math.max(0, this.plug - realDt * 3);
      this.stress = Math.max(0, this.stress - realDt * 2);
      this.shakeT = 0;
    }

    const shake = this.stress > 0 && input.confirm ? Math.sin(this.shakeT) * 4 * this.stress : 0;
    this.pickEl.style.transform = `rotate(${(this.pick * 180) / Math.PI + shake}deg)`;
    this.plugEl.style.transform = `rotate(${this.plug * -90}deg)`;
    this.plugEl.style.background = this.stress > 0.5 ? '#3a262c' : '#23262c';
  }
}
