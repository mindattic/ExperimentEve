import type { InputSample } from '../core/input';

// Title + death overlays. PS1-plain: black, serif-ish caps, two options.
export class TitleScreen {
  private readonly el: HTMLDivElement;
  private index = 0;
  private options: string[] = [];
  mode: 'title' | 'death' | 'hidden' = 'hidden';
  onSelect: ((option: string) => void) | null = null;

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;inset:0;background:rgba(0,0,0,.88);display:none;' +
      'flex-direction:column;align-items:center;justify-content:center;text-align:center';
    hudRoot.appendChild(this.el);
  }

  showTitle(hasSave: boolean): void {
    this.mode = 'title';
    this.options = hasSave ? ['New Game', 'Continue'] : ['New Game'];
    this.index = 0;
    this.render(
      'EXPERIMENT EVE',
      'June 21, 1998 — the shortest night of the year',
    );
  }

  showDeath(hasSave: boolean): void {
    this.mode = 'death';
    this.options = hasSave ? ['Retry from the lamp', 'Give up the night'] : ['Give up the night'];
    this.index = 0;
    this.render('THE NIGHT TAKES HER', 'Dawn is at 5:11 AM. She will not see it.');
  }

  hide(): void {
    this.mode = 'hidden';
    this.el.style.display = 'none';
  }

  update(input: InputSample): void {
    if (this.mode === 'hidden') return;
    if (input.navUpJust) this.index = (this.index + this.options.length - 1) % this.options.length;
    if (input.navDownJust) this.index = (this.index + 1) % this.options.length;
    if (input.confirmJust) {
      const opt = this.options[this.index]!;
      this.onSelect?.(opt);
      return;
    }
    this.renderOptions();
  }

  private titleText = '';
  private subText = '';

  private render(title: string, sub: string): void {
    this.titleText = title;
    this.subText = sub;
    this.el.style.display = 'flex';
    this.renderOptions();
  }

  private renderOptions(): void {
    const opts = this.options
      .map((o, i) => {
        const sel = i === this.index;
        return `<div style="margin:4px;color:${sel ? '#ffe28a' : '#9aa4ac'};font-size:17px">${sel ? '&#9656; ' : '&nbsp;&nbsp;'}${o}</div>`;
      })
      .join('');
    this.el.innerHTML =
      `<div style="font-size:42px;letter-spacing:10px;color:#cdd6dd;text-shadow:0 0 18px #223">${this.titleText}</div>` +
      `<div style="margin:10px 0 30px;font-size:13px;font-style:italic;color:#6a7680">${this.subText}</div>` +
      opts +
      '<div style="margin-top:26px;font-size:11px;color:#4a545c">confirm: Enter / A</div>';
  }
}
