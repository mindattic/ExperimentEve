// Unified input: Gamepad API first-class, keyboard fallback.
// Game code reads abstract actions from InputSample — never devices.
//
// Pad ('standard' mapping): left stick move, A(0) confirm/attack,
// B(1) dodge (cancel inside menus), X(2) interact, Start(9) menu,
// D-pad(12-15) menu nav.
// Keyboard: WASD/arrows move, Enter/Z confirm, Space/X dodge,
// E/C interact, Esc menu. Shift walks (keyboard is full-speed otherwise).

export interface InputSample {
  /** Camera-space movement intent, x=right, y=forward, unit circle. */
  moveX: number;
  moveY: number;
  /** 0..1 — analog magnitude (walk/run). Keyboard: 1, or 0.45 with Shift. */
  magnitude: number;
  confirm: boolean;
  confirmJust: boolean;
  dodge: boolean;
  dodgeJust: boolean;
  interact: boolean;
  interactJust: boolean;
  menu: boolean;
  menuJust: boolean;
  reloadJust: boolean;
  navUpJust: boolean;
  navDownJust: boolean;
  navLeftJust: boolean;
  navRightJust: boolean;
  padConnected: boolean;
}

const DEADZONE = 0.25;

type ActionName =
  | 'confirm' | 'dodge' | 'interact' | 'menu' | 'reload'
  | 'navUp' | 'navDown' | 'navLeft' | 'navRight';

export class Input {
  private keys = new Set<string>();
  private prev: Record<ActionName, boolean> = {
    confirm: false, dodge: false, interact: false, menu: false, reload: false,
    navUp: false, navDown: false, navLeft: false, navRight: false,
  };
  padConnected = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private pad(): Gamepad | null {
    for (const gp of navigator.getGamepads()) {
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  rumble(durationMs: number, weak: number, strong: number): void {
    const gp = this.pad();
    const actuator = (gp as unknown as {
      vibrationActuator?: { playEffect?: (t: string, o: object) => void };
    } | null)?.vibrationActuator;
    actuator?.playEffect?.('dual-rumble', {
      duration: durationMs,
      weakMagnitude: weak,
      strongMagnitude: strong,
    });
  }

  private key(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Raw key probe for dev toggles. */
  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  sample(): InputSample {
    const gp = this.pad();
    this.padConnected = gp !== null;

    let moveX = 0;
    let moveY = 0;
    let magnitude = 0;
    if (gp) {
      const rawX = gp.axes[0] ?? 0;
      const rawY = gp.axes[1] ?? 0;
      const len = Math.hypot(rawX, rawY);
      if (len > DEADZONE) {
        const rescaled = Math.min(1, (len - DEADZONE) / (1 - DEADZONE));
        moveX = (rawX / len) * rescaled;
        moveY = (-rawY / len) * rescaled; // stick up = forward
        magnitude = rescaled;
      }
    }
    if (magnitude === 0) {
      const kx =
        (this.key('KeyD', 'ArrowRight') ? 1 : 0) - (this.key('KeyA', 'ArrowLeft') ? 1 : 0);
      const ky =
        (this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0);
      const len = Math.hypot(kx, ky);
      if (len > 0) {
        magnitude = this.key('ShiftLeft', 'ShiftRight') ? 0.45 : 1;
        moveX = (kx / len) * magnitude;
        moveY = (ky / len) * magnitude;
      }
    }

    const b = (i: number): boolean => (gp?.buttons[i]?.pressed ?? false);
    const now: Record<ActionName, boolean> = {
      confirm: b(0) || this.key('Enter', 'KeyZ'),
      dodge: b(1) || this.key('Space', 'KeyX'),
      interact: b(2) || this.key('KeyE', 'KeyC'),
      menu: b(9) || this.key('Escape'),
      reload: b(3) || this.key('KeyR'),
      navUp: b(12) || this.key('ArrowUp', 'KeyW'),
      navDown: b(13) || this.key('ArrowDown', 'KeyS'),
      navLeft: b(14) || this.key('ArrowLeft', 'KeyA'),
      navRight: b(15) || this.key('ArrowRight', 'KeyD'),
    };
    const just = (n: ActionName): boolean => now[n] && !this.prev[n];

    const s: InputSample = {
      moveX, moveY, magnitude,
      confirm: now.confirm, confirmJust: just('confirm'),
      dodge: now.dodge, dodgeJust: just('dodge'),
      interact: now.interact, interactJust: just('interact'),
      menu: now.menu, menuJust: just('menu'),
      reloadJust: just('reload'),
      navUpJust: just('navUp'),
      navDownJust: just('navDown'),
      navLeftJust: just('navLeft'),
      navRightJust: just('navRight'),
      padConnected: this.padConnected,
    };
    this.prev = now;
    return s;
  }
}
