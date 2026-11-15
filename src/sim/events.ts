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
  | { k: 'launch'; obj: Held; x: number; z: number; vx: number; vz: number };
