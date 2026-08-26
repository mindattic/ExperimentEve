// All audio is synthesized — no samples. One AudioContext, master bus with a
// lowpass (ducked during the ATB pause for the bullet-time feel), and
// sfx/ambience sub-buses.

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly lowpass: BiquadFilterNode;
  readonly sfx: GainNode;
  readonly ambience: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;

  constructor() {
    this.ctx = new AudioContext();
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.lowpass).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.ambience = this.ctx.createGain();
    this.ambience.gain.value = 0.5;
    this.ambience.connect(this.master);
  }

  /** Call from the first user gesture (autoplay policy). */
  unlock(): void {
    if (this.started) return;
    this.started = true;
    void this.ctx.resume();
  }

  get unlocked(): boolean {
    return this.started && this.ctx.state === 'running';
  }

  /** Bullet-time duck: muffle the world while paused. */
  setDucked(ducked: boolean): void {
    const target = ducked ? 700 : 20000;
    this.lowpass.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.06);
  }

  getNoise(): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  /** Filtered noise burst: cracks, steps, hisses. */
  noiseBurst(opts: {
    duration: number;
    filterFrom: number;
    filterTo?: number;
    type?: BiquadFilterType;
    gain?: number;
    bus?: GainNode;
  }): void {
    if (!this.unlocked) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoise();
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.filterFrom, t);
    if (opts.filterTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.filterTo), t + opts.duration);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.duration);
    src.connect(filter).connect(g).connect(opts.bus ?? this.sfx);
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
    bus?: GainNode;
  }): void {
    if (!this.unlocked) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(opts.from, t);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.duration);
    }
    const g = this.ctx.createGain();
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.duration);
    osc.connect(g).connect(opts.bus ?? this.sfx);
    osc.start(t);
    osc.stop(t + opts.duration + 0.05);
  }
}
