import { BALANCE } from './balance';
import { spreadTrees } from './flora';
import { Rng } from './rng';
import { bump, level, rise } from './terrain';
import { generateWorld } from './worldgen';
import { TICK, clamp, season, SEASONS, type State } from './world';

/** Messages from the sim to the outside world (renderer, UI, audio). Drained each frame. */
export type SimEvent =
  | { k: 'terrain'; tiles: number[] }
  /** Trees, flowers or rocks changed on these tiles (without the ground changing). */
  | { k: 'flora'; tiles: number[] }
  | { k: 'season'; season: number }
  | { k: 'toast'; msg: string }
  | { k: 'sfx'; id: string };

export type ToolId = 'hand' | 'raise' | 'lower' | 'flat' | 'isle';

export interface ToolDef {
  id: ToolId;
  name: string;
  cost: number;
  desc: string;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'hand', name: 'Hand', cost: 0, desc: 'Drag the land to look around. Grabbing comes in a later phase.' },
  { id: 'raise', name: 'Raise', cost: 1, desc: 'Lift the earth a step. Right-click anywhere to lower instead.' },
  { id: 'lower', name: 'Lower', cost: 1, desc: 'Sink the earth a step. Lower it to the sea to make a lake.' },
];

/**
 * The whole game simulation. Pure TypeScript, no Three.js or DOM, so it runs in tests and
 * headless scripts. Advance it with `tick()` at a fixed 10 Hz; read `S` to render.
 */
export class Sim {
  S: State;
  rng: Rng;
  events: SimEvent[] = [];
  /** Sandbox mode (URL ?sandbox): tools cost nothing. */
  sandbox = false;
  private lastSeason: number;
  /** Countdown timers (not saved, as in the prototype's `tm`). */
  private tm = { spread: 0 };

  constructor(S: State) {
    this.S = S;
    this.rng = new Rng(S.rngState);
    this.lastSeason = season(S.t);
  }

  static newWorld(seed: number): Sim {
    return new Sim(generateWorld(seed));
  }

  /** One fixed simulation step of TICK seconds. */
  tick(): void {
    const S = this.S;
    S.t += TICK;
    const se = season(S.t);
    if (se !== this.lastSeason) {
      this.lastSeason = se;
      this.emit({ k: 'season', season: se });
      this.emit({ k: 'toast', msg: `${SEASONS[se]} arrives` });
    }
    S.faith = clamp(S.faith + BALANCE.faithBase * TICK, 0, 999);
    if ((this.tm.spread -= TICK) <= 0) {
      this.tm.spread = BALANCE.treeSpreadEvery;
      const grown = spreadTrees(S, this.rng);
      if (grown.length) this.emit({ k: 'flora', tiles: grown });
    }
    S.rngState = this.rng.s;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Apply a terrain tool at vertex (vx, vy). Returns true if it did something. */
  useTool(id: ToolId, vx: number, vy: number): boolean {
    const def = TOOLS.find((t) => t.id === id);
    if (!def || id === 'hand') return false;
    if (!this.sandbox && this.S.faith < def.cost) {
      this.emit({ k: 'toast', msg: 'Not enough faith yet' });
      this.emit({ k: 'sfx', id: 'no' });
      return false;
    }
    const touched = new Set<number>();
    let ok = true;
    if (id === 'raise') ok = bump(this.S, vx, vy, 1, touched);
    else if (id === 'lower') ok = bump(this.S, vx, vy, -1, touched);
    else if (id === 'flat') level(this.S, vx, vy, touched);
    else if (id === 'isle') rise(this.S, vx, vy, touched);
    if (!ok) return false;
    if (!this.sandbox) this.S.faith -= def.cost;
    this.afterTerrain(touched);
    this.emit({ k: 'sfx', id: id === 'raise' ? 'up' : id === 'lower' ? 'down' : 'magic' });
    return true;
  }

  /** Reshaped tiles lose their trees, flowers and rocks (as in the prototype's `after`). */
  private afterTerrain(touched: Set<number>): void {
    if (!touched.size) return;
    const S = this.S;
    for (const t of touched) {
      S.tree[t] = 0;
      S.flower[t] = 0;
      S.rock[t] = 0;
    }
    this.emit({ k: 'terrain', tiles: [...touched] });
  }
}

