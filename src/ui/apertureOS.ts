import type { InputSample } from '../core/input';

// ApertureOS 98 — the save-point computer. A little world of 1998: teal
// desktop, taskbar, documents, and a Trash bin with UNDELETE. Everything is
// somebody's leftover life; the lore hides in mundane files.

export interface OSFile {
  name: string;
  body: string;
  deleted?: boolean;
}

export interface OSMachineDef {
  owner: string; // taskbar label, e.g. "NORTH-END SALVAGE"
  files: OSFile[];
}

type Screen = 'desktop' | 'documents' | 'trash' | 'reading' | 'dialog';

const DESKTOP_ICONS = ['SAVE.EXE', 'PERKS.EXE', 'MY DOCUMENTS', 'TRASH', 'SOLITAIRE.EXE', 'MODEM'] as const;

export class ApertureOS {
  open = false;
  private screen: Screen = 'desktop';
  private index = 0;
  private machine: OSMachineDef | null = null;
  private readingFile: OSFile | null = null;
  private dialogText = '';
  private readonly el: HTMLDivElement;
  onSave: (() => void) | null = null;
  onPerks: (() => void) | null = null;
  onBlip: (() => void) | null = null;
  clockText = '';

  constructor(hudRoot: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;height:380px;' +
      'display:none;background:#2a7a72;border:3px solid #202024;box-shadow:0 0 0 3px #6a6a72,0 14px 40px #000;' +
      'font-size:13px;color:#0a0a0a;overflow:hidden';
    hudRoot.appendChild(this.el);
  }

  boot(machine: OSMachineDef): void {
    this.machine = machine;
    this.open = true;
    this.screen = 'desktop';
    this.index = 0;
    this.render();
    this.el.style.display = 'block';
  }

  close(): void {
    this.open = false;
    this.el.style.display = 'none';
  }

  update(input: InputSample): void {
    if (!this.open || !this.machine) return;
    const items = this.currentItems();
    if (input.navUpJust) {
      this.index = (this.index + items.length - 1) % Math.max(1, items.length);
      this.onBlip?.();
    }
    if (input.navDownJust) {
      this.index = (this.index + 1) % Math.max(1, items.length);
      this.onBlip?.();
    }
    if (input.dodgeJust || input.menuJust) {
      if (this.screen === 'desktop') this.close();
      else {
        this.screen = this.screen === 'reading' ? 'documents' : 'desktop';
        this.index = 0;
      }
      this.render();
      return;
    }
    if (input.confirmJust) this.activate(items);
    this.render();
  }

  private currentItems(): string[] {
    const m = this.machine!;
    switch (this.screen) {
      case 'desktop':
        return [...DESKTOP_ICONS];
      case 'documents':
        return [...m.files.filter((f) => !f.deleted).map((f) => f.name), '< Back'];
      case 'trash':
        return [...m.files.filter((f) => f.deleted).map((f) => `${f.name} [UNDELETE]`), 'Empty(?) — no.', '< Back'];
      case 'reading':
      case 'dialog':
        return ['< Back'];
    }
  }

  private activate(items: string[]): void {
    const m = this.machine!;
    const choice = items[this.index] ?? '';
    if (this.screen === 'desktop') {
      switch (choice) {
        case 'SAVE.EXE':
          this.dialogText = 'Writing C:\\SAVE\\NIGHT.SAV .......... OK\n\nRest a moment. The machine hums.\nDo not turn off the machine. Nobody will.';
          this.screen = 'dialog';
          this.index = 0;
          this.onSave?.();
          break;
        case 'PERKS.EXE':
          this.close();
          this.onPerks?.();
          break;
        case 'MY DOCUMENTS':
          this.screen = 'documents';
          this.index = 0;
          break;
        case 'TRASH':
          this.screen = 'trash';
          this.index = 0;
          break;
        case 'SOLITAIRE.EXE':
          this.dialogText = 'SOLITAIRE.EXE — Error 0x0F\n\nMissing component: HEARTS.DLL\n\nEverything is missing its hearts lately.';
          this.screen = 'dialog';
          this.index = 0;
          break;
        case 'MODEM':
          this.dialogText = 'APERTURE DIALER 98\n\nNo dial tone.\n\nThe lines went first.';
          this.screen = 'dialog';
          this.index = 0;
          break;
      }
    } else if (this.screen === 'documents') {
      if (choice === '< Back') {
        this.screen = 'desktop';
        this.index = 0;
      } else {
        const f = m.files.find((x) => !x.deleted && x.name === choice);
        if (f) {
          this.readingFile = f;
          this.screen = 'reading';
          this.index = 0;
        }
      }
    } else if (this.screen === 'trash') {
      if (choice === '< Back') {
        this.screen = 'desktop';
        this.index = 0;
      } else if (choice.endsWith('[UNDELETE]')) {
        const name = choice.replace(' [UNDELETE]', '');
        const f = m.files.find((x) => x.deleted && x.name === name);
        if (f) {
          f.deleted = false; // restored to MY DOCUMENTS
          this.dialogText = `UNDELETE ${f.name} .......... OK\n\nRestored to MY DOCUMENTS.\nDeleting something doesn't make it not have happened.`;
          this.screen = 'dialog';
          this.index = 0;
        }
      }
    } else {
      // reading / dialog: back out
      this.screen = this.screen === 'reading' ? 'documents' : 'desktop';
      this.index = 0;
    }
  }

  private render(): void {
    const m = this.machine;
    if (!m) return;
    const items = this.currentItems();
    let body = '';
    if (this.screen === 'desktop') {
      body =
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;padding:22px">' +
        items
          .map((it, i) => {
            const sel = i === this.index;
            return (
              `<div style="text-align:center;padding:8px 2px;background:${sel ? '#0a2a6a' : 'transparent'};color:${sel ? '#fff' : '#eaf2ee'}">` +
              `<div style="font-size:22px">${iconFor(it)}</div><div style="font-size:11px;margin-top:4px">${it}</div></div>`
            );
          })
          .join('') +
        '</div>';
    } else if (this.screen === 'reading' && this.readingFile) {
      body =
        `<div style="margin:14px;background:#f2f2ea;border:2px inset #888;padding:12px;height:270px;overflow:hidden;white-space:pre-wrap;font-family:'Courier New',monospace;font-size:12px">` +
        `<div style="color:#666;border-bottom:1px solid #bbb;margin-bottom:8px">APERTURE PAD — ${this.readingFile.name}</div>` +
        `${this.readingFile.body}</div>` +
        `<div style="text-align:center;color:#eaf2ee">&#9656; &lt; Back</div>`;
    } else if (this.screen === 'dialog') {
      body =
        `<div style="margin:60px 40px;background:#d8d8cc;border:2px outset #fff;padding:16px;white-space:pre-wrap;font-family:'Courier New',monospace;font-size:12px">${this.dialogText}</div>` +
        `<div style="text-align:center;color:#eaf2ee">&#9656; OK</div>`;
    } else {
      const title = this.screen === 'documents' ? 'MY DOCUMENTS' : 'TRASH';
      body =
        `<div style="margin:14px;background:#f2f2ea;border:2px inset #888;height:280px;padding:8px;font-size:12px">` +
        `<div style="color:#666;border-bottom:1px solid #bbb;margin-bottom:6px">${title}</div>` +
        items
          .map((it, i) => {
            const sel = i === this.index;
            return `<div style="padding:2px 6px;background:${sel ? '#0a2a6a' : 'transparent'};color:${sel ? '#fff' : '#222'}">${sel ? '&#9656; ' : '&nbsp;&nbsp;'}${it}</div>`;
          })
          .join('') +
        '</div>';
    }
    this.el.innerHTML =
      body +
      `<div style="position:absolute;left:0;right:0;bottom:0;height:30px;background:#c0c0b4;border-top:2px solid #fff;display:flex;align-items:center;justify-content:space-between;padding:0 8px">` +
      `<div style="background:#8a8a7e;border:2px outset #ddd;padding:2px 10px;font-weight:bold">Commence</div>` +
      `<div style="font-size:11px">${m.owner} &nbsp;|&nbsp; ApertureOS 98 &nbsp;|&nbsp; ${this.clockText}</div></div>`;
  }
}

function iconFor(name: string): string {
  switch (name) {
    case 'SAVE.EXE': return '&#128190;';
    case 'PERKS.EXE': return '&#128170;';
    case 'MY DOCUMENTS': return '&#128193;';
    case 'TRASH': return '&#128465;';
    case 'SOLITAIRE.EXE': return '&#127183;';
    case 'MODEM': return '&#128222;';
    default: return '&#128196;';
  }
}
