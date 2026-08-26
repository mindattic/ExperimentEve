import type { InputSample } from '../core/input';
import { Inventory, ITEMS, type ItemId } from '../gameplay/inventory';
import type { GameState } from '../gameplay/gameState';

// The Pawnbroker trades through the mail slot under the bars. Currency is
// 9mm rounds — he pays in bullets and doesn't meet your eyes.

const SELL_RATES: Partial<Record<ItemId, number>> = {
  pocketWatch: 6,
  ring: 8,
  pearlNecklace: 12,
  silverware: 6,
  pager: 4,
  durpy: 5,
  beanBuddy: 3,
  pocketPal: 4,
  vhsSinkingShip: 5,
  cdHeartGoes: 4,
  blueDress: 24, // double, no questions
};

const BUY_LIST: { item: ItemId; cost: number }[] = [
  { item: 'bandage', cost: 4 },
  { item: 'medkit', cost: 10 },
  { item: 'fireAxe', cost: 15 },
  { item: 'alcohol', cost: 3 },
  { item: 'gunSnub', cost: 25 },
  { item: 'injMetabolic', cost: 18 }, // he kept the fridge running for this
];

export class PawnMenu {
  open = false;
  private index = 0;
  private readonly el: HTMLDivElement;
  onMessage: ((t: string) => void) | null = null;
  onBlip: (() => void) | null = null;

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:360px;' +
      'background:rgba(10,8,4,.94);border:1px solid #8a7a4a;padding:12px 18px;display:none;' +
      'font-size:14px;line-height:1.55';
    hudRoot.appendChild(this.el);
  }

  toggle(): void {
    this.open = !this.open;
    this.el.style.display = this.open ? 'block' : 'none';
    this.index = 0;
  }

  private rows(inv: Inventory): { label: string; act: (() => void) | null }[] {
    const rows: { label: string; act: (() => void) | null }[] = [];
    for (const [id, rate] of Object.entries(SELL_RATES) as [ItemId, number][]) {
      const n = inv.count(id);
      if (n > 0) {
        rows.push({
          label: `SELL ${ITEMS[id].name} — ${rate} rounds (have ${n})`,
          act: () => {
            inv.remove(id);
            this.stateRef!.reserveAmmo += rate;
            this.onMessage?.(
              id === 'blueDress'
                ? 'He pays double and looks at the wall the whole time.'
                : `Slid through the slot. ${rate} rounds slide back.`,
            );
          },
        });
      }
    }
    for (const b of BUY_LIST) {
      const owned = b.item === 'fireAxe' && inv.count('fireAxe') > 0;
      if (owned) continue;
      rows.push({
        label: `BUY ${ITEMS[b.item].name} — ${b.cost} rounds`,
        act:
          this.stateRef!.reserveAmmo >= b.cost
            ? () => {
                this.stateRef!.reserveAmmo -= b.cost;
                inv.add(b.item);
                this.onMessage?.(`${ITEMS[b.item].name} comes through the slot, wrapped in newspaper.`);
              }
            : null,
      });
    }
    rows.push({ label: 'Step away from the slot', act: () => this.toggle() });
    return rows;
  }

  private stateRef: GameState | null = null;

  update(input: InputSample, inv: Inventory, state: GameState): void {
    if (!this.open) return;
    this.stateRef = state;
    const rows = this.rows(inv);
    if (this.index >= rows.length) this.index = rows.length - 1;
    if (input.navUpJust) {
      this.index = (this.index + rows.length - 1) % rows.length;
      this.onBlip?.();
    }
    if (input.navDownJust) {
      this.index = (this.index + 1) % rows.length;
      this.onBlip?.();
    }
    if (input.dodgeJust || input.menuJust) {
      this.toggle();
      return;
    }
    if (input.confirmJust) {
      const row = rows[this.index]!;
      if (row.act) row.act();
      else this.onMessage?.('Not enough rounds. He taps the slot twice: no credit.');
      if (!this.open) return;
    }
    this.render(rows, state);
  }

  private render(rows: { label: string; act: (() => void) | null }[], state: GameState): void {
    const lines = [
      `<div style="color:#c0a860;margin-bottom:6px">THE MAIL SLOT — reserve: ${state.reserveAmmo} rounds</div>`,
      '<div style="font-size:11px;color:#6a6046;margin-bottom:6px;font-style:italic">A voice behind the bars: "Baubles only. Bullets back. No questions either way."</div>',
    ];
    rows.forEach((r, i) => {
      const sel = i === this.index;
      const color = r.act ? (sel ? '#ffe28a' : '#cfc8b0') : '#5a5648';
      lines.push(`<div style="color:${color}">${sel ? '&#9656; ' : '&nbsp;&nbsp;'}${r.label}</div>`);
    });
    this.el.innerHTML = lines.join('');
  }
}
