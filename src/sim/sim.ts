import { BALANCE } from './balance';
import { BMAX, STRUCTS, TOOL, TOOLS, type StructKind, type ToolId } from './defs';
import type { SimEvent } from './events';
import { spreadTrees } from './flora';
import { Rng } from './rng';
import { bump, level, rise } from './terrain';
import {
  calcCrops, destroyHome, grabFlora, grabVillager, hearth, land, mkV, placeStruct, popCount, rebuildMap, recheck,
  roleCount, spark, stepV, syncResidents, validSite, finish, type Ctx,
} from './village';
import { generateWorld } from './worldgen';
import {
  N, TICK, clamp, idx, nightF, season, SEASONS, tdist, wrap, type Home, type State, type Struct, type Vill,
} from './world';

export type { SimEvent } from './events';
export { TOOLS, type ToolId } from './defs';

/**
 * The whole game simulation. Pure TypeScript, no Three.js or DOM, so it runs in tests and
 * headless scripts. Advance it with `tick()` at a fixed 10 Hz; read `S` to render.
 */
export class Sim implements Ctx {
  S: State;
  rng: Rng;
  events: SimEvent[] = [];
  bmap: (Home | Struct | null)[] = new Array(N * N).fill(null);
  crops = new Set<number>();
  /** Sandbox mode (URL ?sandbox): tools cost nothing. */
  sandbox = false;
  private lastSeason: number;
  /** Countdown timers (not saved, as in the prototype's `tm`). */
  private tm = { spread: 0, re: 0, res: 0 };

  constructor(S: State) {
    this.S = S;
    this.rng = new Rng(S.rngState);
    this.lastSeason = season(S.t);
    rebuildMap(this);
    recheck(this);
  }

  /** A fresh planet with a Hearth and five settlers at the start site (as in the prototype). */
  static newWorld(seed: number): Sim {
    const sim = new Sim(generateWorld(seed));
    const [sx, sy] = sim.S.start;
    placeStruct(sim, 'hearth', sx, sy, 1);
    for (let i = 0; i < 5; i++) sim.S.vills.push(mkV(sim, 'settler', sx + 0.5 + Math.cos(i * 1.3) * 1.6, sy + 0.5 + Math.sin(i * 1.3) * 1.6));
    recheck(sim);
    sim.drain();
    return sim;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** One fixed simulation step of TICK seconds (the prototype's `update`). */
  tick(): void {
    const S = this.S, dt = TICK, B = BALANCE;
    S.t += dt;
    const se = season(S.t), night = nightF(S.t);
    if (se !== this.lastSeason) {
      this.lastSeason = se;
      this.emit({ k: 'season', season: se });
      this.emit({ k: 'toast', msg: `${SEASONS[se]} arrives` });
      calcCrops(this);
    }

    // Economy
    const pop = popCount(S);
    S.popNow = pop;
    S.faith = clamp(S.faith + (B.faithBase + pop * B.faithPerPop) * dt, 0, 999);
    S.food = clamp(S.food + (B.foodBase + B.foodPerHome * S.homes.length - B.foodEatPerPop * pop) * dt, 0, 999);
    S.wood = Math.min(999, S.wood);
    for (const r of S.rains) r.t -= dt;
    S.rains = S.rains.filter((r) => r.t > 0);
    if (S.fest > 0) S.fest -= dt;
    for (const c of S.cheers) c.t -= dt;
    S.cheers = S.cheers.filter((c) => c.t > 0);
    for (const s of S.structs) {
      if (s.fert > 0) s.fert -= dt;
      if (s.prog < 1) {
        s.prog = Math.min(1, s.prog + dt / B.selfBuild);
        if (s.prog >= 1) finish(this, s);
      }
    }
    if ((this.tm.re -= dt) <= 0) {
      this.tm.re = 0.5;
      recheck(this);
    }
    if ((this.tm.res -= dt) <= 0) {
      this.tm.res = 1;
      syncResidents(this, night);
    }

    // Homes grow; full homes send out settlers to found new ones.
    const sm = growthMultiplier(S);
    if (S.food < 10 && !S.hinted.food) {
      S.hinted.food = 1;
      this.emit({ k: 'toast', msg: 'Food is running low, so homes grow slowly. Build a Farm or Fishing hut' });
    }
    let settlers = S.vills.reduce((n, v) => n + (v.type === 'settler' ? 1 : 0), 0);
    for (const b of S.homes) {
      b.pop += homeGrowth(S, b, sm) * dt;
      if (b.pop >= BMAX[b.lv]!) {
        const out = Math.max(1, Math.floor(BMAX[b.lv]! / 2));
        if (settlers + out <= B.maxSettlers) {
          settlers += out;
          b.pop -= out;
          for (let k = 0; k < out; k++)
            S.vills.push(mkV(this, 'settler', b.x + 0.5 + (this.rng.next() - 0.5) * 0.6, b.y + 0.8 + (this.rng.next() - 0.5) * 0.3));
        } else b.pop = BMAX[b.lv]!;
      }
    }

    // Villagers
    const gone = new Set<Vill>();
    for (const v of S.vills) if (stepV(this, v, dt, night)) gone.add(v);
    if (gone.size) S.vills = S.vills.filter((v) => !gone.has(v));

    if ((this.tm.spread -= dt) <= 0) {
      this.tm.spread = B.treeSpreadEvery;
      const grown = spreadTrees(S, this.rng).filter((t) => !this.bmap[t] && !this.crops.has(t));
      if (grown.length) this.emit({ k: 'flora', tiles: grown });
    }

    if (pop > S.best) {
      const old = S.best;
      S.best = pop;
      for (const t of TOOLS)
        if (t.need > old && t.need <= pop) {
          this.emit({ k: 'toast', msg: 'New blessing: ' + t.name });
          this.emit({ k: 'sfx', id: 'magic' });
          this.emit({ k: 'ui' });
        }
    }
    if (!S.hinted.flat && settlers >= 5 && S.homes.length <= 2 && S.t > 150 * 0.5) {
      S.hinted.flat = 1;
      this.emit({ k: 'toast', msg: 'Wanderers need flat land. Raise or lower ground into level patches' });
    }
    S.rngState = this.rng.s;
  }

  // ---------------------------------------------------------------- commands

  private pay(cost: number): boolean {
    if (this.sandbox || this.S.faith >= cost) {
      if (!this.sandbox) this.S.faith -= cost;
      return true;
    }
    this.emit({ k: 'toast', msg: 'Not enough faith yet' });
    this.emit({ k: 'sfx', id: 'no' });
    return false;
  }

  /** Apply a terrain or placement tool at vertex (vx, vy). Returns true if it did something. */
  useTool(id: ToolId, vx: number, vy: number): boolean {
    const def = TOOL[id], S = this.S;
    if (!def || id === 'hand' || id === 'build') return false;
    if (S.best < def.need && !this.sandbox) {
      this.emit({ k: 'toast', msg: `${def.name} unlocks at ${def.need} villagers` });
      return false;
    }
    if (id === 'totem') {
      vx = wrap(vx);
      vy = wrap(vy);
      S.totem = S.totem && S.totem[0] === vx && S.totem[1] === vy ? null : [vx, vy];
      for (const w of S.vills) if (w.type === 'settler') w.think = this.rng.next() * 0.6;
      this.emit({ k: 'sfx', id: 'settle' });
      return true;
    }
    if (!this.sandbox && S.faith < def.cost) return this.pay(def.cost);
    const touched = new Set<number>();
    let ok = true;
    if (id === 'raise') ok = bump(S, vx, vy, 1, touched);
    else if (id === 'lower') ok = bump(S, vx, vy, -1, touched);
    else if (id === 'flat') level(S, vx, vy, touched);
    else if (id === 'isle') rise(S, vx, vy, touched);
    if (!ok) return false;
    this.pay(def.cost);
    this.afterTerrain(touched);
    this.emit({ k: 'sfx', id: id === 'raise' ? 'up' : id === 'lower' ? 'down' : 'magic' });
    return true;
  }

  /** Place a construction site (or the Hearth) on tile (x, y). */
  build(k: StructKind, x: number, y: number): boolean {
    const S = this.S, cost = STRUCTS[k].wood;
    x = wrap(x);
    y = wrap(y);
    if (!validSite(this, k, x, y)) {
      this.emit({
        k: 'toast',
        msg: k === 'fish' ? 'A fishing hut must touch water, with space around it' : k === 'hearth' && hearth(S) ? 'You already have a Hearth' : 'Needs flat, clear land with space around it',
      });
      this.emit({ k: 'sfx', id: 'no' });
      return false;
    }
    if (S.wood < cost && !this.sandbox) {
      this.emit({ k: 'toast', msg: `Needs ${cost} wood. Drop trees on the Hearth to get more` });
      this.emit({ k: 'sfx', id: 'no' });
      return false;
    }
    if (!this.sandbox) S.wood -= cost;
    placeStruct(this, k, x, y, k === 'hearth' ? 1 : 0);
    this.emit({ k: 'flora', tiles: [idx(x, y)] });
    this.emit({ k: 'sfx', id: 'settle' });
    recheck(this);
    if (k !== 'hearth' && !roleCount(S, 'builder')) this.emit({ k: 'toast', msg: 'Drop villagers on the Hearth to make builders' });
    return true;
  }

  /** The hand picks up a villager (by id). */
  grab(id: number): boolean {
    const v = this.S.vills.find((o) => o.id === id);
    return !!v && grabVillager(this, v);
  }

  grabTree(x: number, y: number): boolean {
    return grabFlora(this, wrap(x), wrap(y), 'tree');
  }

  grabRock(x: number, y: number): boolean {
    return grabFlora(this, wrap(x), wrap(y), 'rock');
  }

  /** The hand lets go at (x, y); `thrown` marks a throw (dizzier landing). Without physics it lands at once. */
  drop(x: number, y: number, thrown = false): void {
    const h = this.S.held;
    if (!h) return;
    this.S.held = null;
    land(this, h, x, y, thrown);
  }

  /** Release the held object into the air: physics (or a test) calls `landed` when it settles. */
  release(): Exclude<State['held'], null> | null {
    const h = this.S.held;
    this.S.held = null;
    return h;
  }

  landed(obj: Exclude<State['held'], null>, x: number, y: number, thrown: boolean): void {
    land(this, obj, x, y, thrown);
  }

  /** Reshaped tiles lose their trees, flowers and rocks (the prototype's `after`), then buildings recheck. */
  private afterTerrain(touched: Set<number>): void {
    if (!touched.size) return;
    const S = this.S;
    for (const t of touched) {
      S.tree[t] = 0;
      S.flower[t] = 0;
      S.rock[t] = 0;
    }
    this.emit({ k: 'terrain', tiles: [...touched] });
    recheck(this);
  }

  /** Nearest villager to (x, y) within r (for hand picking and tests). */
  villagerNear(x: number, y: number, r: number): Vill | null {
    let best: Vill | null = null, bd = r;
    for (const v of this.S.vills) {
      const d = tdist(v.x, v.y, x, y);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** For debugging and tests: remove a home as if its land were broken. */
  breakHome(b: Home): void {
    destroyHome(this, b);
  }

  spark(x: number, y: number): void {
    spark(this, x, y, 'spark', 4);
  }
}

/** Season, festival and hunger factor on home growth (the prototype's `sm`). */
export function growthMultiplier(S: State): number {
  const B = BALANCE;
  return B.growSeason[season(S.t)]! * (S.fest > 0 ? B.festGrowth : 1) * clamp(S.food / B.foodFull, B.hungerFloor, 1);
}

/** Villagers per second a home gains (before the time step). */
export function homeGrowth(S: State, b: Home, sm: number): number {
  const B = BALANCE;
  let m = (B.growBase + B.growPerLevel * b.lv) * b.tb * sm;
  if (S.rains.some((r) => tdist(b.x + 0.5, b.y + 0.5, r.x, r.y) < 5)) m *= B.rainGrowth;
  if (S.cheers.some((c) => tdist(b.x, b.y, c.x, c.y) < 4)) m *= B.cheerGrowth;
  return m;
}
