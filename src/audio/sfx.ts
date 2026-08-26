import type { AudioEngine } from './audioEngine';

// Named one-shots composed from the engine primitives.
export class Sfx {
  constructor(private readonly a: AudioEngine) {}

  gunshot(): void {
    this.a.noiseBurst({ duration: 0.16, filterFrom: 3200, filterTo: 400, gain: 0.9 });
    this.a.tone({ from: 160, to: 55, duration: 0.14, type: 'square', gain: 0.35 });
  }

  dryFire(): void {
    this.a.noiseBurst({ duration: 0.05, filterFrom: 2000, gain: 0.2 });
  }

  footstep(indoor: boolean): void {
    this.a.noiseBurst({
      duration: 0.07,
      filterFrom: indoor ? 900 : 500,
      filterTo: 180,
      gain: 0.16,
    });
  }

  dodgeRoll(): void {
    this.a.noiseBurst({ duration: 0.25, filterFrom: 700, filterTo: 250, gain: 0.3 });
  }

  hurt(): void {
    this.a.tone({ from: 300, to: 140, duration: 0.22, type: 'sawtooth', gain: 0.3 });
  }

  croak(): void {
    this.a.tone({ from: 110, to: 60, duration: 0.5, type: 'sawtooth', gain: 0.4 });
    this.a.tone({ from: 55, to: 90, duration: 0.5, type: 'triangle', gain: 0.3, attack: 0.15 });
  }

  hiss(): void {
    this.a.noiseBurst({ duration: 0.5, filterFrom: 4200, filterTo: 2400, gain: 0.25 });
  }

  wingFlutter(): void {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.a.noiseBurst({ duration: 0.06, filterFrom: 1000, gain: 0.18 }), i * 70);
    }
  }

  bark(): void {
    this.a.tone({ from: 240, to: 120, duration: 0.16, type: 'sawtooth', gain: 0.4 });
  }

  uiBlip(): void {
    this.a.tone({ from: 880, duration: 0.05, type: 'square', gain: 0.12 });
  }

  uiConfirm(): void {
    this.a.tone({ from: 660, to: 990, duration: 0.09, type: 'square', gain: 0.14 });
  }

  pickup(): void {
    this.a.tone({ from: 520, to: 780, duration: 0.12, type: 'triangle', gain: 0.2 });
  }

  saveChime(): void {
    this.a.tone({ from: 392, duration: 0.4, type: 'sine', gain: 0.25 });
    setTimeout(() => this.a.tone({ from: 523, duration: 0.5, type: 'sine', gain: 0.25 }), 180);
  }

  sweepTick(): void {
    this.a.tone({ from: 1200, duration: 0.03, type: 'square', gain: 0.08 });
  }

  /** City Hall bell: deep strike + overtone, long decay. */
  bellChime(): void {
    this.a.tone({ from: 147, duration: 2.4, type: 'sine', gain: 0.5, attack: 0.01 });
    this.a.tone({ from: 294, duration: 1.8, type: 'sine', gain: 0.18, attack: 0.01 });
    this.a.tone({ from: 441, duration: 0.9, type: 'triangle', gain: 0.08, attack: 0.005 });
    this.a.noiseBurst({ duration: 0.08, filterFrom: 1800, filterTo: 500, gain: 0.15 });
  }

  crit(): void {
    this.a.tone({ from: 200, to: 900, duration: 0.25, type: 'square', gain: 0.3 });
    this.a.noiseBurst({ duration: 0.3, filterFrom: 2500, filterTo: 600, gain: 0.5 });
  }
}

/** Continuous layers: wind drone, crickets-ish shimmer, fire crackle. */
export class AmbienceBed {
  private fireGain: GainNode | null = null;
  private crackleTimer: number | null = null;

  constructor(private readonly a: AudioEngine) {}

  start(): void {
    const ctx = this.a.ctx;
    // Wind drone: two detuned low oscillators through a slow-wobbling filter.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    for (const f of [55, 55.8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      osc.connect(g).connect(filter);
      osc.start();
    }
    filter.connect(this.a.ambience);

    // Night shimmer: high filtered noise, very quiet.
    const noise = ctx.createBufferSource();
    noise.buffer = this.a.getNoise();
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 5200;
    hp.Q.value = 8;
    const ng = ctx.createGain();
    ng.gain.value = 0.015;
    noise.connect(hp).connect(ng).connect(this.a.ambience);
    noise.start();

    // Fire crackle bed (volume set per-frame by distance to the truck).
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    this.fireGain.connect(this.a.ambience);
    const crackle = (): void => {
      if (this.fireGain && this.fireGain.gain.value > 0.01) {
        this.a.noiseBurst({
          duration: 0.05 + Math.random() * 0.1,
          filterFrom: 800 + Math.random() * 2500,
          gain: 0.5,
          bus: this.fireGain,
        });
      }
      this.crackleTimer = window.setTimeout(crackle, 40 + Math.random() * 120);
    };
    crackle();
  }

  /** 0..1 — proximity to the burning semi (0 when the fire is out). */
  setFireIntensity(v: number): void {
    if (this.fireGain) {
      this.fireGain.gain.setTargetAtTime(v * 0.8, this.a.ctx.currentTime, 0.2);
    }
  }

  stop(): void {
    if (this.crackleTimer !== null) window.clearTimeout(this.crackleTimer);
  }
}
