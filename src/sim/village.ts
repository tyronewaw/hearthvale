/**
 * Homes, work buildings and villagers, ported from the prototype (see legacy/index.html:
 * fields, levelFor, recheck, findSpot, stepSettler, stepRes, stepWorker, land, …).
 * Every distance and movement is measured round the torus.
 */
import { BALANCE } from './balance';
import { BMAX, BN, BTH, STRUCTS, ROLE_NAME, type StructKind } from './defs';
import type { SimEvent, SparkKind } from './events';
import type { Rng } from './rng';
import { isWater, tileFlat } from './terrain';
import {
  D8, N, idx, season, tdist, wd, wrap,
  type Home, type State, type Struct, type Vill, type VillType,
} from './world';

/** What village code needs from the Sim (kept as an interface to avoid an import cycle). */
export interface Ctx {
  S: State;
  rng: Rng;
  /** Building on each tile (derived; rebuilt by rebuildMap). */
  bmap: (Home | Struct | null)[];
  /** Crop tiles around finished farms (derived; rebuilt by calcCrops). */
  crops: Set<number>;
  emit(e: SimEvent): void;
}

const toast = (c: Ctx, msg: string) => c.emit({ k: 'toast', msg });
const sfx = (c: Ctx, id: string) => c.emit({ k: 'sfx', id });
export const spark = (c: Ctx, x: number, y: number, kind: SparkKind, n: number) => c.emit({ k: 'spark', x, y, kind, n });

// ---------------------------------------------------------------- lookups

export function homeById(S: State, id: number | null): Home | undefined {
  return id === null ? undefined : S.homes.find((h) => h.id === id);
}
export function structById(S: State, id: number | null): Struct | undefined {
  return id === null ? undefined : S.structs.find((s) => s.id === id);
}
export const hearth = (S: State): Struct | undefined => S.structs.find((s) => s.k === 'hearth');
export const roleCount = (S: State, r: string): number => S.vills.reduce((n, v) => n + (v.role === r ? 1 : 0), 0);
export const workersAt = (S: State, s: Struct): number => S.vills.reduce((n, v) => n + (v.job === s.id ? 1 : 0), 0);

export function rebuildMap(c: Ctx): void {
  c.bmap.fill(null);
  for (const b of c.S.homes) c.bmap[idx(b.x, b.y)] = b;
  for (const s of c.S.structs) c.bmap[idx(s.x, s.y)] = s;
}

/** Crops grow on the flat, free tiles around each finished farm. */
export function calcCrops(c: Ctx): void {
  const S = c.S;
  c.crops.clear();
  for (const s of S.structs) {
    if (s.k !== 'farm' || s.prog < 1) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = idx(s.x + dx, s.y + dy);
        if (tileFlat(S, s.x + dx, s.y + dy) && !c.bmap[t] && !S.tree[t]) c.crops.add(t);
      }
  }
}

export function nearWater(S: State, x: number, y: number): [number, number] | null {
  for (const [dx, dy] of D8) if (isWater(S, x + dx, y + dy)) return [dx, dy];
  return null;
}

export function countTrees(S: State, x: number, y: number, r: number): number {
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (S.tree[idx(x + dx, y + dy)]) n++;
  return n;
}

// ---------------------------------------------------------------- homes and fields

/**
 * Open fields around a home: tiles of the 5×5 that are flat at the home's height, with no
 * tree and no other building. The home's own tile counts.
 */
export function fields(c: Ctx, x: number, y: number): number {
  const S = c.S, h0 = S.h[idx(x, y)]!;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const tx = x + dx, ty = y + dy, t = idx(tx, ty);
      if (!tileFlat(S, tx, ty) || S.h[t] !== h0 || S.tree[t]) continue;
      if (c.bmap[t] && (dx || dy)) continue;
      n++;
    }
  return n;
}

export function levelFor(fieldCount: number): number {
  for (let i = 5; i > 0; i--) if (fieldCount >= BTH[i]!) return i;
  return 0;
}

/** No building in the 3×3 around (x, y). */
export function spaced(c: Ctx, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (c.bmap[idx(x + dx, y + dy)]) return false;
  return true;
}

export function canSettle(c: Ctx, x: number, y: number): boolean {
  const t = idx(x, y);
  return tileFlat(c.S, x, y) && !c.S.tree[t] && !c.S.rock[t] && !c.crops.has(t) && spaced(c, x, y);
}

export function mkV(c: Ctx, type: VillType, x: number, y: number, o: Partial<Vill> = {}): Vill {
  const R = c.rng, S = c.S;
  x = wrap(x);
  y = wrap(y);
  return {
    id: S.uid++, type, role: 'settler', job: null, home: null, x, y, px: x, py: y, tx: x, ty: y,
    think: R.next() * 0.5, blocked: 0, c: R.int(4), sk: R.int(4), face: R.next() * 6.28, st: '', t: 0, dizzy: 0,
    wave: 0, mv: false, spot: null, spotT: 0, carry: 0, goal: null, chop: null, plant: null, ...o,
  };
}

function settlersOut(c: Ctx, x: number, y: number, n: number): void {
  for (let k = 0; k < n; k++) c.S.vills.push(mkV(c, 'settler', x + 0.5 + (c.rng.next() - 0.5) * 0.6, y + 0.5 + (c.rng.next() - 0.5) * 0.6));
}

export function newHome(c: Ctx, x: number, y: number, pop: number): Home {
  const S = c.S, lv = levelFor(fields(c, x, y));
  const b: Home = { kind: 'home', id: S.uid++, x: wrap(x), y: wrap(y), lv, pop: Math.min(pop, BMAX[lv]!), tb: 1 };
  S.homes.push(b);
  c.bmap[idx(x, y)] = b;
  if (lv > S.maxLv) S.maxLv = lv;
  if (S.homes.length === 1) toast(c, 'Your first home!');
  sfx(c, 'settle');
  return b;
}

export function destroyHome(c: Ctx, b: Home): void {
  const S = c.S;
  S.homes = S.homes.filter((h) => h !== b);
  c.bmap[idx(b.x, b.y)] = null;
  S.vills = S.vills.filter((v) => v.home !== b.id);
  settlersOut(c, b.x, b.y, Math.max(1, Math.floor(b.pop)));
}

export function destroyStruct(c: Ctx, s: Struct): void {
  const S = c.S;
  S.structs = S.structs.filter((o) => o !== s);
  c.bmap[idx(s.x, s.y)] = null;
  for (const v of S.vills)
    if (v.job === s.id) {
      v.job = null;
      v.type = 'settler';
      v.role = 'settler';
    }
  toast(c, STRUCTS[s.k].name + ' was lost');
  calcCrops(c);
}

/** Re-evaluate every building after the land changed: homes level up or down, broken ones go. */
export function recheck(c: Ctx): void {
  const S = c.S;
  for (const b of S.homes.slice()) {
    if (!tileFlat(S, b.x, b.y)) {
      destroyHome(c, b);
      continue;
    }
    const l = levelFor(fields(c, b.x, b.y));
    if (l !== b.lv) {
      if (l > b.lv) {
        sfx(c, 'build');
        if (l > S.maxLv) {
          S.maxLv = l;
          if (l > 0) toast(c, 'Your first ' + BN[l]!.toLowerCase() + '!');
        }
      }
      b.lv = l;
      if (b.pop > BMAX[l]!) {
        const ex = Math.floor(b.pop - BMAX[l]!);
        b.pop = BMAX[l]!;
        settlersOut(c, b.x, b.y, ex);
      }
    }
    b.tb = 1 + 0.1 * Math.min(6, countTrees(S, b.x, b.y, 2));
  }
  for (const s of S.structs.slice()) {
    const ok = s.k === 'fish' ? !isWater(S, s.x, s.y) && !!nearWater(S, s.x, s.y) : tileFlat(S, s.x, s.y);
    if (!ok) destroyStruct(c, s);
  }
  calcCrops(c);
}

/** Best place for a settler near (ox, oy): open land with many fields, or a home with room. */
export function findSpot(c: Ctx, ox: number, oy: number, r: number, w: Vill): [number, number] | null {
  let best: [number, number] | null = null, bs = -1e9;
  for (let y = oy - r; y <= oy + r; y++)
    for (let x = ox - r; x <= ox + r; x++) {
      const tx = wrap(x), ty = wrap(y);
      const d = tdist(tx + 0.5, ty + 0.5, w.x, w.y) * 0.35;
      if (canSettle(c, tx, ty)) {
        const s = fields(c, tx, ty) - d;
        if (s > bs) {
          bs = s;
          best = [tx, ty];
        }
      } else {
        const b = c.bmap[idx(tx, ty)];
        if (b && b.kind === 'home' && b.pop + 1 <= BMAX[b.lv]!) {
          const s = (BMAX[b.lv]! - b.pop) * 0.4 - 1 - d;
          if (s > bs) {
            bs = s;
            best = [tx, ty];
          }
        }
      }
    }
  return best;
}

/** Search outward from (cx, cy) for a tile passing `pred`, with a little randomness. */
export function findTile(c: Ctx, cx: number, cy: number, r: number, pred: (x: number, y: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null, bd = 1e9;
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const tx = wrap(x), ty = wrap(y);
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + c.rng.next() * 0.8;
      if (d > r || d >= bd || !pred(tx, ty)) continue;
      bd = d;
      best = [tx, ty];
    }
  return best;
}

// ---------------------------------------------------------------- movement

function wander(c: Ctx, w: Vill, r = 8): void {
  for (let i = 0; i < 8; i++) {
    const x = w.x + (c.rng.next() - 0.5) * r, y = w.y + (c.rng.next() - 0.5) * r;
    if (!isWater(c.S, Math.floor(x), Math.floor(y))) {
      w.tx = wrap(x);
      w.ty = wrap(y);
      return;
    }
  }
}

/** Head for the nearest dry land (paddling back after a splash). */
export function swimPlan(c: Ctx, w: Vill): void {
  for (let r = 1; r < 10; r++)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, x = Math.floor(w.x + Math.cos(a) * r), y = Math.floor(w.y + Math.sin(a) * r);
      if (!isWater(c.S, x, y)) {
        w.tx = wrap(x + 0.5);
        w.ty = wrap(y + 0.5);
        return;
      }
    }
}

/** Walk towards (tx, ty). Returns true on arrival. Stops at the shore unless swimming. */
export function moveTo(c: Ctx, w: Vill, dt: number, sp: number, wet: boolean): boolean {
  const dx = wd(w.x, w.tx), dy = wd(w.y, w.ty), d = Math.hypot(dx, dy);
  w.mv = d > 0.04;
  if (!w.mv) return true;
  w.face = Math.atan2(dy, dx);
  const step = (wet ? 0.5 : sp) * dt, k = Math.min(1, step / d);
  const nx = w.x + dx * k, ny = w.y + dy * k;
  if (!wet && isWater(c.S, Math.floor(nx), Math.floor(ny))) {
    w.tx = w.x;
    w.ty = w.y;
    w.blocked = 2;
    w.mv = false;
    return false;
  }
  w.x = wrap(nx);
  w.y = wrap(ny);
  return d <= step + 0.04;
}

// ---------------------------------------------------------------- villager behaviour

function planSettler(c: Ctx, w: Vill, cx: number, cy: number): void {
  const S = c.S;
  w.goal = null;
  if (w.blocked > 0) {
    w.blocked--;
    wander(c, w);
    return;
  }
  if (S.totem) {
    const [tx, ty] = S.totem;
    if (tdist(tx, ty, w.x, w.y) > 6) {
      const g = findSpot(c, tx, ty, 5, w);
      if (g) {
        w.goal = g;
        w.tx = g[0] + 0.5;
        w.ty = g[1] + 0.5;
      } else {
        w.tx = wrap(tx + (c.rng.next() - 0.5) * 3);
        w.ty = wrap(ty + (c.rng.next() - 0.5) * 3);
      }
      return;
    }
  }
  const g = findSpot(c, cx, cy, 7, w);
  if (g) {
    w.goal = g;
    w.tx = g[0] + 0.5;
    w.ty = g[1] + 0.5;
  } else wander(c, w);
}

/** Returns true if the villager settled (and should be removed). */
function stepSettler(c: Ctx, w: Vill, dt: number, cx: number, cy: number): boolean {
  if (w.goal && cx === w.goal[0] && cy === w.goal[1] && tdist(w.x, w.y, cx + 0.5, cy + 0.5) < 0.25) {
    const [gx, gy] = w.goal;
    w.goal = null;
    w.think = 0;
    const b = c.bmap[idx(gx, gy)];
    if (b && b.kind === 'home' && b.pop + 1 <= BMAX[b.lv]!) {
      b.pop += 1;
      return true;
    }
    if (canSettle(c, gx, gy)) {
      newHome(c, gx, gy, 1);
      recheck(c);
      return true;
    }
  }
  if ((w.think -= dt) <= 0) {
    w.think = 1.2 + c.rng.next() * 1.5;
    planSettler(c, w, cx, cy);
  }
  moveTo(c, w, dt, 1.1, false);
  return false;
}

/** Residents potter about near home and sometimes sit. Returns true if their home is gone. */
function stepRes(c: Ctx, w: Vill, dt: number): boolean {
  const b = homeById(c.S, w.home);
  if (!b) return true;
  if (moveTo(c, w, dt, 0.7, false)) {
    w.mv = false;
    if ((w.t -= dt) <= 0) {
      w.t = 2 + c.rng.next() * 4;
      w.st = c.rng.next() < 0.3 ? 'sit' : '';
      const a = c.rng.next() * 6.3, r = 0.6 + c.rng.next() * 1.3, x = b.x + 0.5 + Math.cos(a) * r, y = b.y + 0.5 + Math.sin(a) * r;
      if (!isWater(c.S, Math.floor(x), Math.floor(y))) {
        w.tx = wrap(x);
        w.ty = wrap(y);
      }
    }
  } else w.st = '';
  return false;
}

function workSpot(c: Ctx, w: Vill, j: Struct): [number, number] {
  const S = c.S, R = c.rng;
  if (w.role === 'farmer') {
    const near = [...c.crops].filter((t) => Math.abs(wd(j.x, t % N)) <= 1 && Math.abs(wd(j.y, (t / N) | 0)) <= 1);
    if (near.length) {
      const t = near[R.int(near.length)]!;
      return [(t % N) + 0.3 + R.next() * 0.4, ((t / N) | 0) + 0.3 + R.next() * 0.4];
    }
  }
  if (w.role === 'fisher') {
    const d = nearWater(S, j.x, j.y) ?? [1, 0];
    return [j.x + 0.5 + d[0] * 0.55 + (R.next() - 0.5) * 0.3, j.y + 0.5 + d[1] * 0.55 + (R.next() - 0.5) * 0.3];
  }
  if (w.role === 'forester') {
    if (countTrees(S, j.x, j.y, 4) >= 3) {
      const t = findTile(c, j.x + 0.5, j.y + 0.5, 4, (x, y) => S.tree[idx(x, y)]! > 0);
      if (t) {
        w.chop = t;
        return [t[0] + 0.5, t[1] + 0.9];
      }
    }
    const p = findTile(c, j.x + 0.5, j.y + 0.5, 4, (x, y) => {
      const t = idx(x, y);
      return !isWater(S, x, y) && !S.tree[t] && !S.rock[t] && !c.bmap[t] && !c.crops.has(t) && !tileFlat(S, x, y);
    });
    if (p) {
      w.plant = p;
      return [p[0] + 0.5, p[1] + 0.9];
    }
  }
  const a = R.next() * 6.3;
  return [j.x + 0.5 + Math.cos(a) * 0.9, j.y + 0.5 + Math.sin(a) * 0.9];
}

/** Workers go to their job (or rest by the Hearth at night) and produce while there. */
function stepWorker(c: Ctx, w: Vill, dt: number, night: number): void {
  const S = c.S, R = c.rng, j = structById(S, w.job);
  if (!j) {
    w.job = null;
    w.type = 'settler';
    w.role = 'settler';
    return;
  }
  const H = hearth(S);
  if (night > 0.6 && H) {
    if (w.st !== 'rest') {
      const a = R.next() * 6.3;
      w.tx = wrap(H.x + 0.5 + Math.cos(a) * 1.4);
      w.ty = wrap(H.y + 0.5 + Math.sin(a) * 1.4);
      w.st = 'rest';
    }
    if (moveTo(c, w, dt, 1, false)) w.mv = false;
    return;
  }
  if (w.st === 'rest') w.st = '';
  if (w.role === 'builder') {
    let site: Struct | null = null, bd = 1e9;
    for (const s of S.structs)
      if (s.prog < 1) {
        const d = tdist(s.x, s.y, w.x, w.y);
        if (d < bd) {
          bd = d;
          site = s;
        }
      }
    if (site) {
      w.carry = 1;
      w.tx = wrap(site.x + 0.5 + ((w.id % 3) - 1) * 0.5);
      w.ty = wrap(site.y + 1.1);
      if (moveTo(c, w, dt, 1.1, false)) {
        w.mv = false;
        w.st = 'work';
        w.carry = 0;
        site.prog = Math.min(1, site.prog + dt / BALANCE.builderBuild);
        if (site.prog >= 1) finish(c, site);
      } else w.st = '';
      return;
    }
    w.carry = 0;
  }
  if (j.prog < 1 && w.role !== 'builder') {
    if (!w.spot) {
      const a = R.next() * 6.3;
      w.spot = [j.x + 0.5 + Math.cos(a) * 1.2, j.y + 0.5 + Math.sin(a) * 1.2];
    }
    w.tx = wrap(w.spot[0]);
    w.ty = wrap(w.spot[1]);
    if (moveTo(c, w, dt, 1, false)) w.mv = false;
    w.st = '';
    return;
  }
  if (!w.spot || (w.spotT -= dt) <= 0) {
    w.chop = null;
    w.plant = null;
    w.spot = workSpot(c, w, j);
    w.spotT = 7 + R.next() * 5;
    w.st = '';
  }
  w.tx = wrap(w.spot[0]);
  w.ty = wrap(w.spot[1]);
  if (!moveTo(c, w, dt, 1, false)) {
    w.st = '';
    return;
  }
  w.mv = false;
  w.st = 'work';
  const se = season(S.t), rainy = S.rains.some((r) => tdist(r.x, r.y, j.x, j.y) < 5) ? 2.5 : 1;
  if (w.role === 'farmer') S.food += dt * BALANCE.farmerFood * BALANCE.farmSeason[se]! * (j.fert > 0 ? 2 : 1) * rainy;
  else if (w.role === 'fisher') S.food += dt * BALANCE.fisherFood * (se === 3 ? 0.7 : 1);
  else if (w.role === 'priest') S.faith += dt * BALANCE.priestFaith;
  else if (w.role === 'forester') {
    w.t += dt;
    if (w.t > 6) {
      w.t = 0;
      if (w.chop && S.tree[idx(...w.chop)]) {
        S.tree[idx(...w.chop)] = 0;
        S.wood += 3;
        S.stat.woodIn += 3;
        spark(c, w.chop[0] + 0.5, w.chop[1] + 0.5, 'leaf', 5);
        c.emit({ k: 'flora', tiles: [idx(...w.chop)] });
      } else if (w.plant && !S.tree[idx(...w.plant)] && !c.bmap[idx(...w.plant)]) {
        S.tree[idx(...w.plant)] = 1 + R.int(3);
        c.emit({ k: 'flora', tiles: [idx(...w.plant)] });
      }
      w.spotT = 0;
    }
  } else if (w.role === 'builder') {
    w.st = '';
    if (!w.mv && R.next() < dt * 0.3 && H) {
      const a = R.next() * 6.3;
      w.spot = [H.x + 0.5 + Math.cos(a) * 1.3, H.y + 0.5 + Math.sin(a) * 1.3];
    }
  }
}

export function finish(c: Ctx, s: Struct): void {
  toast(c, STRUCTS[s.k].name + ' is built');
  sfx(c, 'build');
  if (s.k === 'farm') calcCrops(c);
}

/** One villager step. Returns true when the villager should be removed from the list. */
export function stepV(c: Ctx, v: Vill, dt: number, night: number): boolean {
  v.px = v.x;
  v.py = v.y;
  if (v.wave > 0) v.wave -= dt;
  if (v.dizzy > 0) {
    v.dizzy -= dt;
    v.mv = false;
    return false;
  }
  const cx = Math.floor(v.x), cy = Math.floor(v.y);
  if (isWater(c.S, cx, cy)) {
    if ((v.think -= dt) <= 0) {
      v.think = 1.5;
      swimPlan(c, v);
    }
    moveTo(c, v, dt, 0.5, true);
    return false;
  }
  if (v.type === 'settler') return stepSettler(c, v, dt, cx, cy);
  if (v.type === 'resident') return stepRes(c, v, dt);
  stepWorker(c, v, dt, night);
  return false;
}

/** Keep a few residents outside each home by day (they are the home's pop out for a walk). */
export function syncResidents(c: Ctx, night: number): void {
  const S = c.S, cnt = new Map<number, number>();
  for (const v of S.vills) if (v.type === 'resident' && v.home !== null) cnt.set(v.home, (cnt.get(v.home) ?? 0) + 1);
  for (const b of S.homes) {
    const want = night > 0.5 ? 0 : Math.min(b.lv >= 3 ? 3 : 2, Math.floor(b.pop / 2)), have = cnt.get(b.id) ?? 0;
    if (have < want) S.vills.push(mkV(c, 'resident', b.x + 0.5, b.y + 0.85, { home: b.id, t: c.rng.next() * 2 }));
    else if (have > want) {
      const i = S.vills.findIndex((v) => v.home === b.id && v.type === 'resident');
      if (i >= 0) S.vills.splice(i, 1);
    }
  }
}

/** Villagers who count towards the population: everyone in homes plus everyone out and about. */
export function popCount(S: State): number {
  let p = 0;
  for (const b of S.homes) p += Math.floor(b.pop);
  for (const v of S.vills) if (v.type !== 'resident') p++;
  if (S.held?.k === 'v') p++;
  return p;
}

// ---------------------------------------------------------------- building

export function validSite(c: Ctx, k: StructKind, x: number, y: number): boolean {
  const S = c.S;
  if (k === 'hearth' && hearth(S)) return false;
  if (k === 'fish') return !isWater(S, x, y) && !!nearWater(S, x, y) && spaced(c, x, y) && !S.tree[idx(x, y)] && !S.rock[idx(x, y)];
  return canSettle(c, x, y);
}

export function placeStruct(c: Ctx, k: StructKind, x: number, y: number, prog: number): Struct {
  const S = c.S, s: Struct = { kind: 'struct', id: S.uid++, k, x: wrap(x), y: wrap(y), prog, fert: 0 };
  S.structs.push(s);
  c.bmap[idx(x, y)] = s;
  S.tree[idx(x, y)] = 0;
  return s;
}

// ---------------------------------------------------------------- the hand

export function nearStruct(S: State, x: number, y: number, r: number): Struct | null {
  let best: Struct | null = null, bd = r;
  for (const s of S.structs) {
    const d = tdist(s.x + 0.5, s.y + 0.5, x, y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** Pick up a villager. Residents leave their home (its pop drops by one). */
export function grabVillager(c: Ctx, v: Vill): boolean {
  const S = c.S, i = S.vills.indexOf(v);
  if (i < 0 || S.held) return false;
  S.vills.splice(i, 1);
  if (v.type === 'resident') {
    v.type = 'settler';
    const h = homeById(S, v.home);
    if (h) h.pop = Math.max(0, h.pop - 1);
    v.home = null;
  }
  v.goal = null;
  v.dizzy = 0;
  S.held = { k: 'v', v };
  sfx(c, 'grab');
  return true;
}

export function grabFlora(c: Ctx, x: number, y: number, what: 'tree' | 'rock'): boolean {
  const S = c.S, t = idx(x, y);
  if (S.held) return false;
  if (what === 'tree' && S.tree[t]) {
    S.held = { k: 'tree', tree: S.tree[t]! };
    S.tree[t] = 0;
  } else if (what === 'rock' && S.rock[t]) {
    S.held = { k: 'rock', rock: S.rock[t]! };
    S.rock[t] = 0;
  } else return false;
  c.emit({ k: 'flora', tiles: [t] });
  sfx(c, 'grab');
  return true;
}

/**
 * Something the hand let go of has come to rest at (x, y): a tree or rock, or a villager
 * (who may get a job, join a home, or just land a bit dizzy). As in the prototype's `land`.
 */
export function land(c: Ctx, obj: { k: 'v'; v: Vill } | { k: 'tree'; tree: number } | { k: 'rock'; rock: number }, x: number, y: number, thrown: boolean): void {
  const S = c.S;
  x = wrap(x);
  y = wrap(y);
  const tx = Math.floor(x), ty = Math.floor(y), t = idx(tx, ty);
  if (obj.k === 'tree') {
    const s = nearStruct(S, x, y, 1.6);
    if (s && (s.k === 'hearth' || s.k === 'lumber')) {
      S.wood += 4;
      S.stat.woodIn += 4;
      spark(c, x, y, 'spark', 5);
      toast(c, '+4 wood');
    } else if (!isWater(S, tx, ty) && !c.bmap[t] && !S.tree[t] && !S.rock[t] && !c.crops.has(t)) {
      S.tree[t] = obj.tree;
      c.emit({ k: 'flora', tiles: [t] });
    } else {
      S.wood += 1;
      spark(c, x, y, isWater(S, tx, ty) ? 'splash' : 'puff', 3);
    }
    sfx(c, 'land');
    return;
  }
  if (obj.k === 'rock') {
    if (!isWater(S, tx, ty) && !c.bmap[t] && !S.tree[t] && !S.rock[t] && !c.crops.has(t)) {
      S.rock[t] = obj.rock;
      c.emit({ k: 'flora', tiles: [t] });
    } else spark(c, x, y, isWater(S, tx, ty) ? 'splash' : 'puff', 4);
    sfx(c, 'land');
    return;
  }
  const v = obj.v;
  v.x = v.px = v.tx = x;
  v.y = v.py = v.ty = y;
  v.goal = null;
  v.spot = null;
  v.st = '';
  v.dizzy = thrown ? 2.2 : 0.4;
  v.think = 0;
  if (thrown) {
    S.stat.throws++;
    spark(c, x, y, 'star', 1);
  } else S.stat.drops++;
  sfx(c, 'land');
  if (isWater(S, tx, ty)) spark(c, x, y, 'splash', 6);
  const s = nearStruct(S, x, y, 1.3);
  if (s) {
    const def = STRUCTS[s.k];
    if (v.job === s.id) {
      /* already works here */
    } else if (workersAt(S, s) < def.cap) {
      v.type = 'worker';
      v.role = def.role;
      v.job = s.id;
      v.dizzy = Math.min(v.dizzy, 0.5);
      toast(c, `Now a ${ROLE_NAME[def.role]}`);
      sfx(c, 'settle');
      spark(c, x, y, 'spark', 4);
    } else toast(c, `${def.name} is full (${def.cap} workers)`);
  } else {
    const b = c.bmap[t];
    if (b && b.kind === 'home' && b.pop + 1 <= BMAX[b.lv]! && !thrown) {
      b.pop += 1;
      spark(c, x, y, 'heart', 1);
      return;
    }
  }
  S.vills.push(v);
}

