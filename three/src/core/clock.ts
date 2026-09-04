import * as THREE from 'three';

export interface FrameTimes {
  /** Wall-clock delta — UI, menus, aim cursors, sweep lines. */
  realDt: number;
  /** Scaled delta — world sim, enemies, particles. 0 while paused. */
  gameDt: number;
}

// Two time domains: the ATB pause freezes the WORLD (gameDt = 0) while menus
// and aiming keep running on realDt. Systems that divide by dt must simply
// not be called when gameDt is 0 — never called with 0.
export class GameClock {
  timeScale = 1;
  private readonly clock = new THREE.Clock();

  tick(): FrameTimes {
    const realDt = Math.min(this.clock.getDelta(), 0.05);
    return { realDt, gameDt: realDt * this.timeScale };
  }
}
