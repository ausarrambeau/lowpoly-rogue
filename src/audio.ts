/** Tiny synthesized SFX + ambient drone. No assets; unlocked on the first click. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startDrone();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private burst(dur: number, vol = 0.2, cutoff = 1200, delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  private startDrone(): void {
    if (!this.ctx || !this.master) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;
    const g = this.ctx.createGain();
    g.gain.value = 0.045;
    filter.connect(g).connect(this.master);
    for (const f of [55, 55.7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
    }
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
  }

  swing(): void { this.burst(0.08, 0.1, 2500); this.tone(320, 0.08, 'sawtooth', 0.04, 140); }
  hit(crit: boolean): void {
    this.tone(crit ? 330 : 220, 0.08, 'square', 0.14, 90);
    this.burst(0.06, 0.14, 900);
    if (crit) this.tone(660, 0.12, 'square', 0.1, 990, 0.03);
  }
  hurt(): void { this.tone(180, 0.22, 'sawtooth', 0.22, 55); this.burst(0.15, 0.12, 500); }
  coin(): void { this.tone(1300, 0.07, 'sine', 0.12); this.tone(1900, 0.1, 'sine', 0.12, undefined, 0.06); }
  potion(): void { [520, 660, 880].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.12, undefined, i * 0.07)); }
  gear(): void { [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.11, undefined, i * 0.08)); }
  enemyDie(): void { this.tone(200, 0.28, 'triangle', 0.2, 40); this.burst(0.2, 0.1, 700); }
  bossDie(): void {
    this.tone(160, 0.8, 'sawtooth', 0.25, 30);
    [220, 277, 330, 440].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.1, undefined, 0.3 + i * 0.12));
    this.burst(0.5, 0.2, 400);
  }
  chest(): void {
    this.tone(90, 0.25, 'sawtooth', 0.12, 130);
    [660, 990, 1320].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.1, undefined, 0.2 + i * 0.07));
  }
  stairs(): void { [660, 520, 415, 330].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, undefined, i * 0.12)); }
  slam(): void { this.tone(70, 0.4, 'sine', 0.35, 30); this.burst(0.35, 0.25, 250); }
  roar(): void { this.tone(110, 0.6, 'sawtooth', 0.2, 60); this.burst(0.4, 0.15, 350); }
  victory(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.14, undefined, i * 0.15)); }
}

export const sfx = new Sfx();
