import type { InputSample } from '../core/input';
import { Inventory, ITEMS, type ItemId } from '../gameplay/inventory';
import type { GameState } from '../gameplay/gameState';

// Pause-style inventory: mark 2-3 items, Combine crafts (RE-style);
// consumables are used directly with the interact action.
export class InventoryMenu {
  open = false;
  private index = 0;
  private marked: ItemId[] = [];
  private readonly el: HTMLDivElement;
  onMessage: ((text: string) => void) | null = null;

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:300px;' +
      'background:rgba(6,10,16,.92);border:1px solid #4a6a7a;padding:12px 18px;display:none;' +
      'font-size:14px;line-height:1.55';
    hudRoot.appendChild(this.el);
  }

  toggle(): void {
    this.open = !this.open;
    this.el.style.display = this.open ? 'block' : 'none';
    this.index = 0;
    this.marked = [];
  }

  update(input: InputSample, inv: Inventory, state: GameState): void {
    if (!this.open) return;
    const items = inv.entries();
    const rows = items.length + 2; // + Combine + Close
    if (input.navUpJust) this.index = (this.index + rows - 1) % rows;
    if (input.navDownJust) this.index = (this.index + 1) % rows;
    if (input.menuJust || input.dodgeJust) {
      this.toggle();
      return;
    }

    if (input.confirmJust) {
      if (this.index < items.length) {
        const [def] = items[this.index]!;
        const already = this.marked.indexOf(def.id);
        if (already >= 0) this.marked.splice(already, 1);
        else if (this.marked.length < 3) this.marked.push(def.id);
      } else if (this.index === items.length) {
        const recipe = inv.tryCombine(this.marked);
        this.onMessage?.(
          recipe === 'locked'
            ? 'The parts fit together somehow... she needs to see it done first.'
            : recipe
              ? recipe.line
              : "Those don't combine.",
        );
        this.marked = [];
      } else {
        this.toggle();
        return;
      }
    }

    // Use consumable with interact.
    if (input.interactJust && this.index < items.length) {
      const [def] = items[this.index]!;
      if (def.id === 'bandage' && inv.remove('bandage')) {
        state.hp = Math.min(state.maxHp, state.hp + 25);
        this.onMessage?.('Bandaged up. (+25)');
      } else if (def.id === 'medkit' && inv.remove('medkit')) {
        state.hp = Math.min(state.maxHp, state.hp + 60);
        this.onMessage?.('Patched with the first-aid kit. (+60)');
      } else if (def.id === 'ammo9' && inv.remove('ammo9', 1)) {
        state.reserveAmmo += 1;
        this.onMessage?.('Rounds pocketed for reloads.');
      }
    }

    this.render(items);
  }

  private render(items: [(typeof ITEMS)[ItemId], number][]): void {
    const lines: string[] = ['<div style="color:#8fb0c0;margin-bottom:6px">INVENTORY — KAT WEISS</div>'];
    items.forEach(([def, n], i) => {
      const sel = i === this.index;
      const mark = this.marked.includes(def.id) ? '[*] ' : '[ ] ';
      lines.push(
        `<div style="color:${sel ? '#ffe28a' : '#cfd8dd'}">${sel ? '&#9656; ' : '&nbsp;&nbsp;'}${mark}${def.name} ×${n}</div>`,
      );
    });
    if (items.length === 0) lines.push('<div style="color:#5a6166">&nbsp;&nbsp;(empty pockets)</div>');
    const selected = this.index < items.length ? items[this.index]![0] : null;
    if (selected) {
      lines.push(
        `<div style="margin-top:8px;max-width:320px;font-size:12px;font-style:italic;color:#7a8a94;white-space:normal">${selected.desc}</div>`,
      );
    }
    const selC = this.index === items.length;
    const selX = this.index === items.length + 1;
    lines.push(
      `<div style="margin-top:6px;color:${selC ? '#ffe28a' : '#9fb8a0'}">${selC ? '&#9656; ' : '&nbsp;&nbsp;'}Combine marked</div>`,
      `<div style="color:${selX ? '#ffe28a' : '#8a9298'}">${selX ? '&#9656; ' : '&nbsp;&nbsp;'}Close</div>`,
      '<div style="margin-top:6px;font-size:11px;color:#5a6670">confirm: mark · interact: use · dodge: close</div>',
    );
    this.el.innerHTML = lines.join('');
  }
}
