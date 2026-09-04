// Two time domains, because the ATB battle needs to stop the world without
// stopping the game. `realDt` always advances — HUD animation, the menu, the
// Precision Aim sweeps, corpse sinks, the wristwatch. `gameDt` is realDt scaled
// by timeScale, and everything that can act reads that one: the player, the
// creatures, the ATB gauge itself.
//
// Pausing is therefore a scale of 0 rather than a flag anyone has to check, and
// bullet time is the same lever at 0.18.

export interface FrameTimes {
  realDt: number;
  gameDt: number;
}

const MAX_STEP = 0.05;

export class GameClock {
  /** 1 = normal, 0 = paused (menus/aim), 0.18 = bullet time. */
  timeScale = 1;
  private last = performance.now();

  tick(): FrameTimes {
    const now = performance.now();
    // Clamped: a tab that was backgrounded must not teleport her through a
    // wall on the frame it comes back.
    const realDt = Math.min(MAX_STEP, (now - this.last) / 1000);
    this.last = now;
    return { realDt, gameDt: realDt * this.timeScale };
  }
}
