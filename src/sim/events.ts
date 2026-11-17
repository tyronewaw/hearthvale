import type { Held } from './world';

/** Messages from the sim to the outside world (renderer, UI, audio). Drained each frame. */
export type SparkKind = 'heart' | 'spark' | 'leaf' | 'puff' | 'star' | 'note' | 'zzz' | 'bang' | 'splash';

export type SimEvent =
  | { k: 'terrain'; tiles: number[] }
  /** Trees, flowers or rocks changed on these tiles (without the ground changing). */
  | { k: 'flora'; tiles: number[] }
  | { k: 'season'; season: number }
  | { k: 'toast'; msg: string }
  | { k: 'sfx'; id: string }
  | { k: 'spark'; x: number; y: number; kind: SparkKind; n: number }
  /** A tool unlocked, a quest finished… anything the toolbar should redraw for. */
  | { k: 'ui' }
  /** Something must fly (the monkey flinging a villager): physics or an arc takes it. */
  | { k: 'launch'; obj: Held; x: number; z: number; vx: number; vz: number }
  /** The last quest is done. */
  | { k: 'win'; pop: number; day: number }
  /**
   * A villager says something (a key in audio/voice-lines.json without its _n, e.g. 'throw'),
   * or the pet makes a sound (e.g. 'sheep_happy', with its growth `stage` for pitch and a synth
   * `fallback` sfx for when there's no clip),
   * at tile position (x, y). `who` is the speaker's villager id (0 for a crowd) for pitch.
   */
  | { k: 'voice'; id: string; x: number; y: number; who: number; stage?: number; fallback?: string };
