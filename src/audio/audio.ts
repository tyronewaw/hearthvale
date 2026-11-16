/**
 * Sound effects and gentle generative music, ported from the prototype's WebAudio code.
 * Everything is synthesised (no audio files). Browsers only allow audio after a user
 * gesture, so `unlock()` is called from the first pointer or key press.
 */
const SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784];
const PREF = 'hearthvale-sound';

export class Audio {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private musT = 0;
  private beat = 0;
  private chime = 0;
  on: boolean;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PREF);
    } catch {
      /* storage blocked */
    }
    this.on = saved !== 'off';
  }

  /** Create or resume the audio context (call from a user gesture). */
  unlock(): void {
    if (!this.ac) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new Ctor();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ac.destination);
      } catch {
        this.ac = null;
      }
    }
    if (this.ac?.state === 'suspended') this.ac.resume().catch(() => {});
  }

  toggle(): boolean {
    this.on = !this.on;
    try {
      localStorage.setItem(PREF, this.on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.on) this.unlock();
    return this.on;
  }

  /** The running context and the master bus, for other players (voices); null until unlocked or when muted. */
  out(): { ac: AudioContext; bus: GainNode } | null {
    const ac = this.ready();
    return ac && this.master ? { ac, bus: this.master } : null;
  }

  /** The context once unlocked (even when muted), for decoding ahead of time. */
  context(): AudioContext | null {
    return this.ac;
  }

  private ready(): AudioContext | null {
    return this.on && this.ac && this.ac.state === 'running' ? this.ac : null;
  }

  private note(f: number, t0: number, d: number, type: OscillatorType, vol: number): void {
    const ac = this.ac!, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g);
    g.connect(this.master!);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }

  private slide(f0: number, f1: number, t0: number, d: number, type: OscillatorType, vol: number): void {
    const ac = this.ac!, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + d);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g);
    g.connect(this.master!);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }

  /** A short noise burst through a filter (water splash). */
  private noise(t0: number, d: number, freq: number, vol: number): void {
    const ac = this.ac!, n = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.frequency.value = freq;
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(t0);
  }

  sfx(k: string): void {
    const ac = this.ready();
    if (!ac) return;
    const t = ac.currentTime;
    if (k === 'build') {
      if (performance.now() - this.chime < 300) return;
      this.chime = performance.now();
    }
    if (k === 'up') {
      this.note(520, t, 0.12, 'triangle', 0.12);
      this.note(780, t + 0.04, 0.1, 'triangle', 0.07);
    } else if (k === 'down') {
      this.note(420, t, 0.12, 'triangle', 0.12);
      this.note(300, t + 0.04, 0.12, 'triangle', 0.07);
    } else if (k === 'build') [523, 659, 784].forEach((f, i) => this.note(f, t + i * 0.07, 0.45, 'sine', 0.09));
    else if (k === 'magic') [659, 784, 988, 1319].forEach((f, i) => this.note(f, t + i * 0.06, 0.7, 'sine', 0.07));
    else if (k === 'settle') this.note(660, t, 0.3, 'sine', 0.06);
    else if (k === 'no') this.note(160, t, 0.18, 'square', 0.03);
    else if (k === 'grab') this.note(880, t, 0.08, 'triangle', 0.08);
    else if (k === 'throw') this.slide(300, 900, t, 0.25, 'triangle', 0.08);
    else if (k === 'land') this.note(150, t, 0.15, 'sine', 0.12);
    else if (k === 'splash') this.noise(t, 0.35, 900, 0.25);
    else if (k === 'pet') {
      this.note(784, t, 0.3, 'sine', 0.06);
      this.note(988, t + 0.08, 0.35, 'sine', 0.05);
    } else if (k === 'scold') this.slide(300, 160, t, 0.18, 'square', 0.04);
    else if (k === 'sheep') {
      this.slide(340, 300, t, 0.45, 'sawtooth', 0.03);
      this.slide(345, 305, t + 0.02, 0.43, 'sawtooth', 0.02);
    } else if (k === 'chicken') {
      this.slide(900, 600, t, 0.07, 'square', 0.03);
      this.slide(950, 650, t + 0.12, 0.08, 'square', 0.03);
    } else if (k === 'monkey') {
      this.slide(420, 900, t, 0.22, 'sine', 0.07);
      this.slide(500, 1000, t + 0.25, 0.15, 'sine', 0.05);
    }
  }

  /** Gentle pentatonic music: a slow drone every 8 beats, scattered notes; lower and sparser at night. */
  music(rdt: number, night: boolean, festival: boolean): void {
    const ac = this.ready();
    if (!ac || (this.musT -= rdt) > 0) return;
    this.musT = festival ? 0.32 : 0.55;
    this.beat++;
    const t = ac.currentTime;
    if (this.beat % 8 === 0) [131, 196].forEach((f) => this.note(night ? f * 0.75 : f, t, 3.8, 'sine', 0.035));
    if (Math.random() < (festival ? 0.75 : night ? 0.3 : 0.5)) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)]!;
      this.note(f * (night ? 0.5 : 1), t, 1.4, 'triangle', 0.035);
    }
  }
}
