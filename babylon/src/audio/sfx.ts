import type { AudioEngine } from './audioEngine';

// Named one-shots composed from the engine primitives. Only the sounds the
// Babylon build can actually make right now live here — the Three build's
// lockpick, payphone, city-hall bell and fire-alarm cues belong to systems
// (interactables, ApertureOS, the crafting loop) that are EVEGDD Ch.7-8 and
// aren't built yet, so they'd be dead weight.
//
// Multi-part sounds schedule on the audio clock via `delay` rather than through
// setTimeout: sample-accurate, and it survives the ATB pause without a queue of
// stray timers firing into a frozen world.
export class Sfx {
  constructor(private readonly a: AudioEngine) {}

  // ---- her ------------------------------------------------------------

  gunshot(): void {
    this.a.noiseBurst({ duration: 0.16, filterFrom: 3200, filterTo: 400, gain: 0.9 });
    this.a.tone({ from: 160, to: 55, duration: 0.14, type: 'square', gain: 0.35 });
    // The street answers a moment later. Kingsport is all brick and water.
    this.a.noiseBurst({ duration: 0.42, filterFrom: 900, filterTo: 220, gain: 0.16, delay: 0.09 });
  }

  dryFire(): void {
    this.a.noiseBurst({ duration: 0.05, filterFrom: 2000, gain: 0.2 });
  }

  /** Magazine out, magazine in, slide. */
  reloadClack(): void {
    this.a.noiseBurst({ duration: 0.05, filterFrom: 1600, gain: 0.22 });
    this.a.noiseBurst({ duration: 0.05, filterFrom: 900, gain: 0.25, delay: 0.22 });
    this.a.tone({ from: 300, to: 190, duration: 0.07, type: 'square', gain: 0.2, delay: 0.43 });
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

  crit(): void {
    this.a.tone({ from: 200, to: 900, duration: 0.25, type: 'square', gain: 0.3 });
    this.a.noiseBurst({ duration: 0.3, filterFrom: 2500, filterTo: 600, gain: 0.5 });
  }

  // ---- rounds landing -------------------------------------------------

  /** Wet impact: the round went in. */
  fleshHit(): void {
    this.a.noiseBurst({ duration: 0.11, filterFrom: 700, filterTo: 160, gain: 0.5 });
    this.a.tone({ from: 120, to: 60, duration: 0.09, type: 'triangle', gain: 0.22 });
  }

  /** It went into armour instead, and the armour won. */
  armourPing(): void {
    this.a.tone({ from: 2100, to: 3400, duration: 0.09, type: 'square', gain: 0.16 });
    this.a.noiseBurst({ duration: 0.14, filterFrom: 5200, filterTo: 2600, gain: 0.22 });
  }

  /** The round found nothing. A crack off the asphalt somewhere behind. */
  ricochet(): void {
    this.a.tone({ from: 1700, to: 520, duration: 0.16, type: 'sawtooth', gain: 0.12, delay: 0.03 });
  }

  /** Something stops moving. */
  deathRattle(): void {
    this.a.tone({ from: 190, to: 42, duration: 0.7, type: 'sawtooth', gain: 0.26 });
    this.a.noiseBurst({ duration: 0.55, filterFrom: 1100, filterTo: 180, gain: 0.22 });
  }

  // ---- them -----------------------------------------------------------

  /** The swing itself: air moving where she was standing. */
  swing(): void {
    this.a.noiseBurst({ duration: 0.13, filterFrom: 2600, filterTo: 700, gain: 0.3 });
  }

  /** It connected. */
  bite(): void {
    this.a.noiseBurst({ duration: 0.09, filterFrom: 900, filterTo: 200, gain: 0.55 });
    this.a.tone({ from: 90, to: 48, duration: 0.16, type: 'square', gain: 0.3 });
  }

  /** She was already gone. The best sound in the game. */
  whiff(): void {
    this.a.noiseBurst({ duration: 0.22, filterFrom: 3400, filterTo: 900, gain: 0.26 });
  }

  // Species voices, used for the attack telegraph. Each one is the warning
  // the player learns to read before they ever learn the animation.
  squeak(): void {
    this.a.tone({ from: 1500, to: 2400, duration: 0.07, type: 'square', gain: 0.14 });
    this.a.tone({ from: 2200, to: 1400, duration: 0.06, type: 'square', gain: 0.12, delay: 0.08 });
  }

  croak(): void {
    this.a.tone({ from: 110, to: 60, duration: 0.5, type: 'sawtooth', gain: 0.4 });
    this.a.tone({ from: 55, to: 90, duration: 0.5, type: 'triangle', gain: 0.3, attack: 0.15 });
  }

  hiss(): void {
    this.a.noiseBurst({ duration: 0.5, filterFrom: 4200, filterTo: 2400, gain: 0.25 });
  }

  chitter(): void {
    for (let i = 0; i < 5; i++) {
      this.a.tone({
        from: 900 + i * 140, duration: 0.025, type: 'square', gain: 0.1, delay: i * 0.045,
      });
    }
  }

  buzz(): void {
    this.a.tone({ from: 220, to: 320, duration: 0.35, type: 'sawtooth', gain: 0.16 });
    this.a.tone({ from: 227, to: 331, duration: 0.35, type: 'sawtooth', gain: 0.14 });
  }

  screech(): void {
    this.a.tone({ from: 3400, to: 5200, duration: 0.11, type: 'sawtooth', gain: 0.1 });
  }

  squelch(): void {
    this.a.noiseBurst({ duration: 0.34, filterFrom: 420, filterTo: 120, gain: 0.35, type: 'lowpass' });
  }

  wingFlutter(): void {
    for (let i = 0; i < 4; i++) {
      this.a.noiseBurst({ duration: 0.06, filterFrom: 1000, gain: 0.18, delay: i * 0.07 });
    }
  }

  // ---- interface ------------------------------------------------------

  uiBlip(): void {
    this.a.tone({ from: 880, duration: 0.05, type: 'square', gain: 0.12 });
  }

  uiConfirm(): void {
    this.a.tone({ from: 660, to: 990, duration: 0.09, type: 'square', gain: 0.14 });
  }

  uiDeny(): void {
    this.a.tone({ from: 220, to: 160, duration: 0.11, type: 'square', gain: 0.14 });
  }

  /** ATB gauge full: the PE-style ready chirp. */
  atbReady(): void {
    this.a.tone({ from: 740, to: 1180, duration: 0.07, type: 'square', gain: 0.16 });
    this.a.tone({ from: 1180, duration: 0.09, type: 'square', gain: 0.13, delay: 0.08 });
  }

  /** A fight starts. Two notes, down a tritone, because of course. */
  encounterSting(): void {
    this.a.tone({ from: 330, duration: 0.22, type: 'sawtooth', gain: 0.2 });
    this.a.tone({ from: 233, duration: 0.5, type: 'sawtooth', gain: 0.22, delay: 0.2 });
    this.a.tone({ from: 116, duration: 0.9, type: 'triangle', gain: 0.18, delay: 0.2 });
  }

  victory(): void {
    const notes = [392, 523, 659];
    for (let i = 0; i < notes.length; i++) {
      this.a.tone({ from: notes[i]!, duration: 0.45, type: 'triangle', gain: 0.2, delay: i * 0.13 });
    }
  }
}

/** Continuous layers under everything: wind off the harbour, night shimmer. */
export class AmbienceBed {
  private started = false;

  constructor(private readonly a: AudioEngine) {}

  start(): void {
    const ctx = this.a.ctx;
    const bus = this.a.ambience;
    const noise = this.a.getNoise();
    if (this.started || !ctx || !bus || !noise) return;
    this.started = true;

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
    filter.connect(bus);

    // Night shimmer: high filtered noise, very quiet, mostly felt.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 5200;
    hp.Q.value = 8;
    const ng = ctx.createGain();
    ng.gain.value = 0.015;
    src.connect(hp).connect(ng).connect(bus);
    src.start();
  }
}
