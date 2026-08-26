// The whole game is one night: June 21, 1998, Newport RI (41.49°N).
// Kat arrives at exactly 8:00 PM EDT. Sunset 8:23 PM. Sunrise 5:11 AM.
// Ticks 1:1 with real time (scale is a dev knob, not a gameplay one).

const START_MINUTES = 20 * 60; // 8:00 PM
const SUNSET_MINUTES = 20 * 60 + 23;
const SUNRISE_MINUTES = 5 * 60 + 11 + 24 * 60; // next morning

export class WorldClock {
  /** Seconds since 8:00 PM. */
  elapsed = 0;
  /** 1 = real time. Dev acceleration only. */
  scale = 1;

  tick(realDt: number): void {
    this.elapsed += realDt * this.scale;
  }

  get minutesOfDay(): number {
    return START_MINUTES + this.elapsed / 60;
  }

  /** "8:04 PM" — Kat's wristwatch. */
  get timeString(): string {
    const total = Math.floor(this.minutesOfDay) % (24 * 60);
    let h = Math.floor(total / 60);
    const m = total % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 === 0 ? 12 : h % 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  /**
   * 0 = dusk light (arrival), 1 = full night. Ramps through civil twilight
   * after the 8:23 sunset; eases back slightly before the 5:11 sunrise.
   */
  get darkness(): number {
    const t = this.minutesOfDay;
    if (t < SUNSET_MINUTES) return 0.35; // low sun, long shadows
    if (t > SUNRISE_MINUTES - 40) {
      // Pre-dawn gray creeps in over the last 40 minutes.
      return Math.max(0.4, 1 - (t - (SUNRISE_MINUTES - 40)) / 40);
    }
    return 0.35 + Math.min(1, (t - SUNSET_MINUTES) / 35) * 0.65; // full dark ~9pm
  }

  /** Minutes remaining until the 5:11 AM deadline. */
  get minutesToDawn(): number {
    return Math.max(0, SUNRISE_MINUTES - this.minutesOfDay);
  }
}
