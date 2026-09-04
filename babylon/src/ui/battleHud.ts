// Battle HUD: DOM overlay, not in-3D. The gauges and the menu sit on top of
// the canvas exactly as they did in the Three build — that part was never the
// problem — but drawn crisply rather than into a 168x62 pixel buffer.

export interface MenuEntry {
  label: string;
  enabled: boolean;
}

export class BattleHud {
  private readonly gauges: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly atbFill: HTMLDivElement;
  private readonly limitFill: HTMLDivElement;
  private readonly ammoEl: HTMLDivElement;
  private readonly menuEl: HTMLDivElement;
  private readonly messageEl: HTMLDivElement;
  private readonly sweepH: HTMLDivElement;
  private readonly sweepV: HTMLDivElement;
  private readonly barTop: HTMLDivElement;
  private readonly barBottom: HTMLDivElement;
  private readonly floaterLayer: HTMLDivElement;
  private readonly hurtVignette: HTMLDivElement;
  private messageTimer = 0;
  private hurtLife = 0;
  private hurtDuration = 1;
  private hurtPeak = 0;
  private floaters: { el: HTMLDivElement; life: number }[] = [];

  constructor(private readonly root: HTMLElement) {
    const bar = (color: string, glow: string): [HTMLDivElement, HTMLDivElement] => {
      const shell = document.createElement('div');
      shell.style.cssText =
        'height:9px;background:rgba(6,10,16,.78);border:1px solid #2f4450;margin-bottom:5px;' +
        'width:230px;overflow:hidden';
      const fill = document.createElement('div');
      fill.style.cssText =
        `height:100%;width:0%;background:${color};box-shadow:0 0 8px ${glow};` +
        'transition:width .12s linear';
      shell.appendChild(fill);
      return [shell, fill];
    };

    this.gauges = document.createElement('div');
    this.gauges.style.cssText =
      'position:absolute;left:18px;bottom:44px;display:none;z-index:7;' +
      'font:600 11px/1.4 "Courier New",monospace;color:#cfd6dc;letter-spacing:1px';

    const [hpShell, hpFill] = bar('#c8412f', '#ff5a3c');
    const [atbShell, atbFill] = bar('#3f8fd0', '#54b4ff');
    const [limitShell, limitFill] = bar('#d8b23a', '#ffd75e');
    this.hpFill = hpFill;
    this.atbFill = atbFill;
    this.limitFill = limitFill;

    const label = (text: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'opacity:.75;margin-bottom:2px';
      return el;
    };
    this.gauges.append(
      label('HP'), hpShell,
      label('ATB'), atbShell,
      label('LIMIT'), limitShell,
    );

    this.ammoEl = document.createElement('div');
    this.ammoEl.style.cssText = 'margin-top:4px;opacity:.9';
    this.gauges.appendChild(this.ammoEl);
    root.appendChild(this.gauges);

    this.menuEl = document.createElement('div');
    this.menuEl.style.cssText =
      'position:absolute;left:262px;bottom:44px;font:600 14px/1.55 "Courier New",monospace;' +
      'display:none;z-index:8;background:rgba(4,8,14,.85);border:1px solid #4a6a7a;' +
      'padding:8px 14px;min-width:196px;color:#e2e8ee';
    root.appendChild(this.menuEl);

    this.messageEl = document.createElement('div');
    this.messageEl.style.cssText =
      'position:absolute;left:0;right:0;bottom:118px;text-align:center;z-index:8;' +
      'font:600 15px/1.4 "Courier New",monospace;color:#f0e6d2;text-shadow:0 2px 6px #000;' +
      'opacity:0;transition:opacity .2s';
    root.appendChild(this.messageEl);

    const lineCss =
      'position:absolute;background:#ffdd55;box-shadow:0 0 8px #ffaa22;display:none;' +
      'pointer-events:none;z-index:9';
    this.sweepH = document.createElement('div');
    this.sweepH.style.cssText = lineCss + 'height:2px;left:0;right:0';
    this.sweepV = document.createElement('div');
    this.sweepV.style.cssText = lineCss + 'width:2px;top:0;bottom:0';
    root.append(this.sweepH, this.sweepV);

    // Cinematic letterbox: the frame narrows when a fight starts.
    const barCss =
      'position:absolute;left:0;right:0;height:0;background:#000;pointer-events:none;' +
      'transition:height .35s ease-out;z-index:6';
    this.barTop = document.createElement('div');
    this.barTop.style.cssText = barCss + ';top:0';
    this.barBottom = document.createElement('div');
    this.barBottom.style.cssText = barCss + ';bottom:0';
    root.append(this.barTop, this.barBottom);

    this.floaterLayer = document.createElement('div');
    this.floaterLayer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:8';
    root.appendChild(this.floaterLayer);

    // Getting bitten reads at the edges of the frame, not in the middle of it:
    // the HP bar is where you check the damage, this is where you feel it.
    this.hurtVignette = document.createElement('div');
    this.hurtVignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:9;opacity:0;' +
      'background:radial-gradient(ellipse at center,rgba(120,0,0,0) 34%,rgba(150,6,6,.55) 78%,' +
      'rgba(70,0,0,.9) 100%)';
    root.appendChild(this.hurtVignette);
  }

  /** `severity` 0..1 — how much of her that blow was worth. */
  hurtFlash(severity: number): void {
    this.hurtPeak = Math.min(0.72, 0.28 + severity * 0.44);
    this.hurtDuration = 0.5 + severity * 0.35;
    this.hurtLife = this.hurtDuration;
    this.hurtVignette.style.opacity = `${this.hurtPeak}`;
  }

  setVisible(on: boolean): void {
    this.gauges.style.display = on ? 'block' : 'none';
    this.barTop.style.height = on ? '7%' : '0';
    this.barBottom.style.height = on ? '7%' : '0';
    if (!on) {
      this.menuEl.style.display = 'none';
      this.sweepH.style.display = 'none';
      this.sweepV.style.display = 'none';
    }
  }

  setGauges(hp: number, maxHp: number, atb: number, limit: number, clip: number, reserve: number): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.atbFill.style.width = `${Math.min(100, atb * 100)}%`;
    this.limitFill.style.width = `${Math.min(100, limit)}%`;
    this.ammoEl.textContent = `${clip} / ${reserve} reserve`;
  }

  showMenu(entries: MenuEntry[], index: number): void {
    this.menuEl.style.display = 'block';
    this.menuEl.innerHTML = entries
      .map((entry, i) => {
        const cursor = i === index ? '&#9656; ' : '&nbsp;&nbsp;';
        const color = !entry.enabled ? '#6a737b' : i === index ? '#ffdd55' : '#e2e8ee';
        return `<div style="color:${color}">${cursor}${entry.label}</div>`;
      })
      .join('');
  }

  hideMenu(): void {
    this.menuEl.style.display = 'none';
  }

  /** Sweep guide lines, positioned by fraction of the viewport. */
  setSweep(axis: 'h' | 'v' | 'none', fraction: number): void {
    this.sweepH.style.display = axis === 'h' ? 'block' : 'none';
    this.sweepV.style.display = axis === 'v' ? 'block' : 'none';
    if (axis === 'h') this.sweepH.style.top = `${fraction * 100}%`;
    if (axis === 'v') this.sweepV.style.left = `${fraction * 100}%`;
  }

  message(text: string): void {
    this.messageEl.textContent = text;
    this.messageEl.style.opacity = '1';
    this.messageTimer = 2.6;
  }

  /** Damage floater at a screen position, in viewport fractions. */
  floater(xFraction: number, yFraction: number, amount: number, crit: boolean): void {
    const el = document.createElement('div');
    el.textContent = crit ? `${amount}!` : `${amount}`;
    el.style.cssText =
      `position:absolute;left:${xFraction * 100}%;top:${yFraction * 100}%;transform:translate(-50%,-50%);` +
      `font:700 ${crit ? 26 : 19}px/1 "Courier New",monospace;` +
      `color:${crit ? '#ffdd55' : '#f2f4f6'};text-shadow:0 2px 5px #000;`;
    this.floaterLayer.appendChild(el);
    this.floaters.push({ el, life: 0 });
  }

  update(realDt: number): void {
    if (this.messageTimer > 0) {
      this.messageTimer -= realDt;
      if (this.messageTimer <= 0) this.messageEl.style.opacity = '0';
    }
    if (this.hurtLife > 0) {
      this.hurtLife -= realDt;
      // Squared falloff: it slams on and bleeds off, rather than dissolving.
      const k = Math.max(0, this.hurtLife) / this.hurtDuration;
      this.hurtVignette.style.opacity = `${this.hurtPeak * k * k}`;
    }
    for (const floater of [...this.floaters]) {
      floater.life += realDt;
      const k = floater.life / 1.1;
      if (k >= 1) {
        floater.el.remove();
        this.floaters = this.floaters.filter((f) => f !== floater);
        continue;
      }
      floater.el.style.transform = `translate(-50%,-50%) translateY(${-k * 46}px)`;
      floater.el.style.opacity = `${1 - k * k}`;
    }
  }

  dispose(): void {
    for (const el of [
      this.gauges, this.menuEl, this.messageEl, this.sweepH, this.sweepV,
      this.barTop, this.barBottom, this.floaterLayer, this.hurtVignette,
    ]) {
      el.remove();
    }
    void this.root;
  }
}
