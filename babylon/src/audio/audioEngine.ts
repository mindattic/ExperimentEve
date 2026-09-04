// All audio is synthesized — no samples, nothing to load, nothing to license.
// One AudioContext, a master bus behind a lowpass (ducked while the ATB menu
// holds the world still), and sfx/ambience sub-buses.
//
// Carried over from the Three build almost verbatim, because it never had a
// Three dependency to begin with: it is oscillators and filtered noise all the
// way down. The one real change is that the context is now built on the first
// gesture rather than in the constructor, so a tab nobody ever touches — a
// headless harness run, say — simply never has one, and every primitive below
// no-ops instead of throwing into the render loop.

export class AudioEngine {
  ctx: AudioContext | null = null;
  sfx: GainNode | null = null;
  ambience: GainNode | null = null;
  /** Fires once, when the context exists. Hang continuous beds off this. */
  onReady: (() => void) | null = null;

  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ducked = false;

  /** Call from the first user gesture (autoplay policy). Cheap to call often. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return; // No audio device, or a context budget already spent. Play on.
    }
    this.ctx = ctx;

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = this.ducked ? 700 : 20000;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.lowpass).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.5;
    this.ambience.connect(this.master);

    void ctx.resume();
    this.onReady?.();
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Bullet-time duck: muffle the world while the menu is up. */
  setDucked(ducked: boolean): void {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    if (!this.ctx || !this.lowpass) return;
    this.lowpass.frequency.setTargetAtTime(ducked ? 700 : 20000, this.ctx.currentTime, 0.06);
  }

  getNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Filtered noise burst: cracks, steps, hisses, wingbeats. */
  noiseBurst(opts: {
    duration: number;
    filterFrom: number;
    filterTo?: number;
    type?: BiquadFilterType;
    gain?: number;
    /** Delay in seconds before it sounds — cheaper than a setTimeout chain. */
    delay?: number;
    bus?: GainNode | null;
  }): void {
    const ctx = this.ctx;
    const noise = this.getNoise();
    if (!ctx || !noise || !this.unlocked) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.filterFrom, t);
    if (opts.filterTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.filterTo), t + opts.duration);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.duration);
    src.connect(filter).connect(g).connect(opts.bus ?? this.sfx!);
    src.start(t);
    src.stop(t + opts.duration + 0.05);
  }

  /** Pitched tone with a frequency ramp: croaks, blips, growl layers. */
  tone(opts: {
    from: number;
    to?: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    delay?: number;
    bus?: GainNode | null;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(opts.from, t);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.duration);
    }
    const g = ctx.createGain();
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.duration);
    osc.connect(g).connect(opts.bus ?? this.sfx!);
    osc.start(t);
    osc.stop(t + opts.duration + 0.05);
  }
}
