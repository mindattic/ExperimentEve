import type { InputSample } from '../core/input';
import type { GameState, SkillPoints } from '../gameplay/gameState';

const STAT_ROWS: { key: keyof SkillPoints; label: string; desc: string }[] = [
  { key: 'health', label: 'HEALTH', desc: '+12 max HP' },
  { key: 'speed', label: 'SPEED', desc: '+move & ATB rate' },
  { key: 'damage', label: 'DAMAGE', desc: '+1.5 per shot' },
  { key: 'reload', label: 'RELOAD', desc: '-7% reload time' },
];

// Lighthouse-lamp menu: allocate skill points, then Save & Rest.
export class StatMenu {
  open = false;
  private index = 0;
  private readonly el: HTMLDivElement;
  onSave: (() => void) | null = null;

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:340px;' +
      'background:rgba(6,10,16,.94);border:1px solid #7a9aaa;padding:14px 20px;display:none;' +
      'font-size:14px;line-height:1.6';
    hudRoot.appendChild(this.el);
  }

  toggle(): void {
    this.open = !this.open;
    this.el.style.display = this.open ? 'block' : 'none';
    this.index = 0;
  }

  update(input: InputSample, state: GameState): void {
    if (!this.open) return;
    const rows = STAT_ROWS.length + 2; // + Save&Rest + Close
    if (input.navUpJust) this.index = (this.index + rows - 1) % rows;
    if (input.navDownJust) this.index = (this.index + 1) % rows;
    if (input.dodgeJust) {
      this.toggle();
      return;
    }
    if (input.confirmJust) {
      if (this.index < STAT_ROWS.length) {
        if (state.unspentPoints > 0) {
          state.skills[STAT_ROWS[this.index]!.key] += 1;
          state.unspentPoints -= 1;
          state.recomputeDerived();
        }
      } else if (this.index === STAT_ROWS.length) {
        this.onSave?.();
        this.toggle();
        return;
      } else {
        this.toggle();
        return;
      }
    }
    this.render(state);
  }

  private render(state: GameState): void {
    const lines = [
      `<div style="color:#8fb0c0;margin-bottom:6px">THE LAMP — unspent points: ${state.unspentPoints}</div>`,
    ];
    STAT_ROWS.forEach((row, i) => {
      const sel = i === this.index;
      lines.push(
        `<div style="color:${sel ? '#ffe28a' : '#cfd8dd'}">${sel ? '&#9656; ' : '&nbsp;&nbsp;'}` +
        `${row.label} ${state.skills[row.key]}  <span style="color:#6a7a84;font-size:12px">${row.desc}</span></div>`,
      );
    });
    const selS = this.index === STAT_ROWS.length;
    const selX = this.index === STAT_ROWS.length + 1;
    lines.push(
      `<div style="margin-top:6px;color:${selS ? '#ffe28a' : '#9fb8a0'}">${selS ? '&#9656; ' : '&nbsp;&nbsp;'}Save & Rest</div>`,
      `<div style="color:${selX ? '#ffe28a' : '#8a9298'}">${selX ? '&#9656; ' : '&nbsp;&nbsp;'}Step away</div>`,
    );
    this.el.innerHTML = lines.join('');
  }
}
