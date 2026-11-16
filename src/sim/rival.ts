/**
 * The Red tribe (phase 10). They live on a far shore, grow on their own (they never go
 * hungry), and are won over Black & White style rather than fought: our homes and Shrines
 * near them, festivals, blessings and a kind pet raise each Red home's belief, and at 100 it
 * joins us. Red wanderers carried into our land join at once. When every Red home and
 * villager has joined, the tribes are one people. Nobody dies.
 */
import { BALANCE } from './balance';
import { petLevel, type PetCtx } from './pet';
import { isWater, setVertices, tileFlat } from './terrain';
import {
  convertHome, convertVill, findTile, inInfluence, newHome, placeStruct, recheck, rivalHearth, spark, tribePop, type Ctx,
} from './village';
import { waterDist } from './worldgen';
import { N, clamp, idx, tdist, wrap, type Home, type State, type Struct, type Vill } from './world';
import { mkV } from './village';

/** Saves from before the Red tribe: everything already in the world is ours. */
export function fixTribes(S: State): void {
  for (const b of S.homes) {
    (b as Partial<Home>).tribe ??= 0;
    (b as Partial<Home>).bel ??= 0;
  }
  for (const s of S.structs) (s as Partial<Struct>).tribe ??= 0;
  for (const v of S.vills) (v as Partial<Vill>).tribe ??= 0;
  S.rival ??= null;
}

/** Where the Red tribe could live: inland, low, far from our start and from anything of ours. */
function pickRivalSite(c: Ctx): [number, number] | null {
  const S = c.S, B = BALANCE, dw = waterDist(S);
  const ours = [...S.homes, ...S.structs].filter((o) => o.tribe === 0);
  let best = -1, bs = -1e9;
  for (let t = 0; t < N * N; t++) {
    const x = t % N, y = (t / N) | 0, h = S.h[t]!;
    if (dw[t]! < 4 || h > 5) continue;
    const ds = tdist(x, y, S.start[0], S.start[1]);
    if (ds < B.rivalMinDist) continue;
    const s = Math.min(dw[t]!, 7) * 1.2 + Math.min(ds, 60) * 0.1 - h * 0.6 + (tileFlat(S, x, y) ? 2 : 0) + c.rng.next() * 0.5;
    if (s <= bs || ours.some((o) => tdist(o.x, o.y, x, y) < 24)) continue;
    bs = s;
    best = t;
  }
  return best < 0 ? null : [best % N, (best / N) | 0];
}

/**
 * Settle the Red tribe on a far shore: a flattened clearing with their Hearth, four homes and
 * a few wanderers. Returns false if the planet has no room for them (they then never come).
 */
export function spawnRival(c: PetCtx, announce: boolean): boolean {
  const S = c.S, site = pickRivalSite(c);
  if (!site) return false;
  const [sx, sy] = site, tg = clamp(S.h[idx(sx, sy)]!, 1, 4), verts: [number, number][] = [], touched = new Set<number>();
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) verts.push([sx + dx, sy + dy]);
  setVertices(S, verts, tg, touched);
  for (let dy = -5; dy <= 5; dy++)
    for (let dx = -5; dx <= 5; dx++) {
      const t = idx(sx + dx, sy + dy);
      S.tree[t] = S.flower[t] = S.rock[t] = 0;
      touched.add(t);
    }
  c.reshape(touched);
  placeStruct(c, 'hearth', sx, sy, 1, 1);
  for (const [dx, dy] of [[3, 0], [-3, 1], [0, 3], [1, -3]] as const) newHome(c, wrap(sx + dx), wrap(sy + dy), 3, 1);
  for (let i = 0; i < 4; i++) S.vills.push(mkV(c, 'settler', sx + 0.5 + Math.cos(i * 1.6) * 1.8, sy + 0.5 + Math.sin(i * 1.6) * 1.8, { tribe: 1 }));
  recheck(c);
  S.rival = { joined: 0, united: false, elder: BALANCE.rivalElderEvery };
  if (announce) c.emit({ k: 'toast', msg: 'A Red tribe has settled on a far shore. Win them over!' });
  return true;
}

/** A gentle, unbuilt slope near the Red Hearth that their elder can smooth for new homes. */
function elderSpot(c: Ctx, x: number, y: number): boolean {
  const S = c.S;
  if (isWater(S, x, y) || tileFlat(S, x, y)) return false;
  let lo = 99, hi = -1;
  for (let dy = 0; dy <= 2; dy++)
    for (let dx = 0; dx <= 2; dx++) {
      const h = S.h[idx(x + dx, y + dy)]!;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  if (lo < 1 || hi - lo > 1) return false;
  for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) if (c.bmap[idx(x + dx, y + dy)]) return false;
  return true;
}

/** Festivals impress every Red home that can see our village (within 20 tiles of one of our homes). */
export function festivalImpress(c: Ctx): void {
  const S = c.S, blue = S.homes.filter((b) => b.tribe === 0);
  for (const b of S.homes.slice())
    if (b.tribe === 1 && blue.some((o) => tdist(o.x, o.y, b.x, b.y) < 20)) {
      b.bel = Math.min(100, b.bel + BALANCE.impressBless);
      spark(c, b.x + 0.5, b.y + 0.5, 'heart', 1);
      if (b.bel >= 100) convertHome(c, b);
    }
}

/** Belief (per second) a Red home gains from what it can see of us. */
export function beliefRate(S: State, b: Home): number {
  const B = BALANCE, RH = rivalHearth(S);
  let rate = -B.belDecay, seen = false;
  for (const o of S.homes) {
    if (o.tribe !== 0) continue;
    const d = tdist(o.x, o.y, b.x, b.y);
    if (d < 20) seen = true;
    if (d < B.belNear) rate += B.belHome * (o.lv + 1) * (1 - d / B.belNear);
  }
  for (const s of S.structs) if (s.tribe === 0 && s.k === 'shrine' && s.prog >= 1 && tdist(s.x, s.y, b.x, b.y) < B.belNear) rate += B.belShrine;
  if (S.fest > 0 && seen) rate += B.belFest;
  if (RH && tdist(RH.x, RH.y, b.x, b.y) < 6) rate -= B.belCore;
  return rate;
}

/** Once a second: belief grows or fades, wanderers in our land may join, the elder works, and unity is checked. */
export function stepRival(c: PetCtx, dt: number): void {
  const S = c.S, Rv = S.rival, B = BALANCE;
  if (!Rv || Rv.united) return;
  for (const b of S.homes.slice()) {
    if (b.tribe !== 1) continue;
    b.bel = clamp(b.bel + beliefRate(S, b) * dt, 0, 100);
    if (b.bel >= 100) convertHome(c, b);
  }
  for (const v of S.vills) if (v.tribe === 1 && v.type === 'settler' && c.rng.next() < B.rivalWanderJoin * dt && inInfluence(S, v.x, v.y)) convertVill(c, v);

  const RH = rivalHearth(S);
  if ((Rv.elder -= dt) <= 0) {
    Rv.elder = B.rivalElderEvery;
    if (RH && tribePop(S, 1) < B.rivalMax) {
      const t = findTile(c, RH.x + 0.5, RH.y + 0.5, B.rivalRange - 3, (x, y) => elderSpot(c, x, y));
      if (t) petLevel(c, t[0], t[1]);
    }
  }

  const left = S.homes.some((b) => b.tribe === 1) || S.vills.some((v) => v.tribe === 1) ||
    (S.held?.k === 'v' && S.held.v.tribe === 1) || S.flying.some((f) => f.k === 'v' && f.v.tribe === 1);
  if (!left) {
    Rv.united = true;
    for (const s of S.structs) s.tribe = 0;
    if (RH) spark(c, RH.x + 0.5, RH.y + 0.5, 'heart', 14);
    c.emit({ k: 'toast', msg: 'The whole Red tribe has joined you. One people!' });
    c.emit({ k: 'sfx', id: 'magic' });
    c.emit({ k: 'ui' });
  }
}
