/**
 * Villager voices: short recorded clips in the tribe's made-up language (written in
 * audio/voice-lines.json, made with VoxCPM2 voice design and processed by `npm run voices`). Each sim `voice` event picks one of that line's takes, gives it the
 * speaker's own pitch, pans it by where they stand on screen and quietens it with distance.
 * Lines without clips stay silent (the synthesised sound effects still play).
 */
import table from './voice-lines.json';
import type { Audio } from './audio';

/** Bundled clips: src/assets/voices/<file>.ogg (any not yet recorded are simply absent). */
const URLS = import.meta.glob('../assets/voices/*.ogg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const PREF = 'hearthvale-voices';

/** Seconds between two lines of the same kind (so a busy village doesn't babble). */
const GAP: Record<string, number> = { chatter: 2.2, red_chatter: 2.2, grow: 0.8, newhome: 0.8, festival: 3, red_fest: 3, red_join: 0.6, petplay: 2 };
const MAX_AT_ONCE = 4;
/**
 * Clips play a little fast, so the villagers sound like a small, chirpy people: their quick
 * calls rise in pitch and pace together, like a sped-up tape (the user wanted them to sound
 * like the little people of a classic god game).
 */
const SPEED = 1.3;

export interface Listener {
  /** Where the camera looks (tiles) and how far away it is (world units). */
  fx: number;
  fz: number;
  dist: number;
  /** The camera's right vector on the ground, for panning. */
  right: [number, number];
  wd: (a: number, b: number) => number;
}

export class Voices {
  on: boolean;
  /** Clip URLs by event, e.g. throw → [throw_1, throw_2, throw_3]. */
  private byEvent = new Map<string, string[]>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private last = new Map<string, number>();
  private playing = 0;
  /** Lines actually started (for the smoke test). */
  said = 0;

  constructor(private audio: Audio) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PREF);
    } catch {
      /* storage blocked */
    }
    this.on = saved !== 'off';
    const known = new Set(table.lines.map((l) => l[0]));
    for (const [path, url] of Object.entries(URLS)) {
      const file = path.split('/').pop()!.replace(/\.ogg$/, '');
      if (!known.has(file)) continue;
      const ev = file.replace(/_\d+$/, '');
      if (!this.byEvent.has(ev)) this.byEvent.set(ev, []);
      this.byEvent.get(ev)!.push(url);
    }
  }

  /** How many recorded clips the game has (0 until the voices arrive). */
  get count(): number {
    let n = 0;
    for (const l of this.byEvent.values()) n += l.length;
    return n;
  }

  has(event: string): boolean {
    return (this.byEvent.get(event)?.length ?? 0) > 0;
  }

  toggle(): boolean {
    this.on = !this.on;
    try {
      localStorage.setItem(PREF, this.on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    return this.on;
  }

  /** Start decoding every clip in the background once audio is unlocked (they're small). */
  preload(): void {
    const ac = this.audio.context();
    if (!ac) return;
    for (const urls of this.byEvent.values()) for (const u of urls) this.load(ac, u);
  }

  /** Decode every clip and report any that fail (for the smoke test). */
  async check(): Promise<{ count: number; decoded: number; failed: string[] }> {
    const ac = this.audio.context(), failed: string[] = [];
    let decoded = 0;
    if (ac)
      for (const urls of this.byEvent.values())
        for (const u of urls) {
          if (await this.load(ac, u)) decoded++;
          else failed.push(u);
        }
    return { count: this.count, decoded, failed };
  }

  private load(ac: AudioContext, url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => ac.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /**
   * Say an `event` line at tile (x, y), heard from the listener. `who` gives a stable pitch
   * per villager; `vol` scales it (chatter is quieter).
   */
  say(event: string, x: number, y: number, who: number, L: Listener, vol = 1): void {
    if (!this.on) return;
    const urls = this.byEvent.get(event);
    const out = this.audio.out();
    if (!urls?.length || !out || this.playing >= MAX_AT_ONCE) return;
    const now = out.ac.currentTime;
    if (now - (this.last.get(event) ?? -99) < (GAP[event] ?? 0.25)) return;
    // heard within about 26 tiles of where the camera looks, and better close up
    const dx = L.wd(L.fx, x), dz = L.wd(L.fz, y), d = Math.hypot(dx, dz);
    const near = Math.max(0, 1 - d / 26) * Math.min(1, 34 / Math.max(10, L.dist));
    if (near < 0.05) return;
    this.last.set(event, now);
    const url = urls[Math.floor(Math.random() * urls.length)]!;
    const pan = Math.max(-0.8, Math.min(0.8, (dx * L.right[0] + dz * L.right[1]) / 10));
    // each villager has their own voice: a steady pitch from their id, plus a little wobble
    const h = who ? ((who * 2654435761) >>> 0) / 4294967296 : Math.random();
    const rate = SPEED * (0.92 + h * 0.18) + (Math.random() - 0.5) * 0.05;
    this.playing++;
    void this.load(out.ac, url).then((buf) => {
      const o = this.audio.out();
      if (!buf || !o) {
        this.playing--;
        return;
      }
      const src = o.ac.createBufferSource(), g = o.ac.createGain(), p = o.ac.createStereoPanner();
      src.buffer = buf;
      src.playbackRate.value = rate;
      g.gain.value = 0.9 * near * vol;
      p.pan.value = pan;
      src.connect(g).connect(p).connect(o.bus);
      src.onended = () => this.playing--;
      src.start();
      this.said++;
    });
  }
}
