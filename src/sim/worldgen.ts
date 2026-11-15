import { Rng } from './rng';
import { isWater, setVertices, tileFlat } from './terrain';
import { D4, D8, DAY, MAXH, N, clamp, idx, type State } from './world';

/** Fraction of vertices that should end up above the sea. */
const LAND_TARGET = 0.44;

/**
 * Value noise that tiles with period 1 in both directions: the lattice indices wrap,
 * so the planet has no seams.
 */
function periodicNoise(R: Rng, p: number): (u: number, v: number) => number {
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = R.next();
  const at = (x: number, y: number) => g[((y % p) + p) % p * p + (((x % p) + p) % p)]!;
  return (u, v) => {
    const x = u * p, y = v * p, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const A = at(x0, y0), B = at(x0 + 1, y0), C = at(x0, y0 + 1), D = at(x0 + 1, y0 + 1);
    return A + (B - A) * sx + (C - A) * sy + (A - B - C + D) * sx * sy;
  };
}

export function emptyState(seed: number): State {
  return {
    v: 3,
    seed,
    t: DAY * 0.3,
    h: new Int8Array(N * N),
    tree: new Uint8Array(N * N),
    flower: new Uint8Array(N * N),
    rock: new Uint8Array(N * N),
    start: [0, 0],
    faith: 40,
    food: 40,
    wood: 24,
    rngState: seed >>> 0 || 1,
    uid: 1,
    homes: [],
    structs: [],
    vills: [],
    held: null,
    totem: null,
    best: 0,
    maxLv: -1,
    popNow: 0,
    won: false,
    rains: [],
    fest: 0,
    cheers: [],
    stat: { strokes: 0, drops: 0, throws: 0, woodIn: 0, taught: 0 },
    hinted: {},
  };
}

/** Generate a fresh archipelago planet. Deterministic for a given seed. */
export function generateWorld(seed: number): State {
  const S = emptyState(seed);
  const R = new Rng(seed ^ 0x9e3779b9);
  const n3 = periodicNoise(R, 3), n6 = periodicNoise(R, 6), n12 = periodicNoise(R, 12), n24 = periodicNoise(R, 24);

  // 1. Elevation field.
  const e = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      e[y * N + x] = n3(u, v) * 0.5 + n6(u, v) * 0.27 + n12(u, v) * 0.15 + n24(u, v) * 0.08;
    }

  // 2. Sea level at the quantile that leaves LAND_TARGET of the planet above water.
  const sorted = Float32Array.from(e).sort();
  const q = sorted[Math.floor(sorted.length * (1 - LAND_TARGET))]!;
  const emax = sorted[sorted.length - 1]!;
  for (let i = 0; i < N * N; i++) {
    const k = (e[i]! - q) / (emax - q);
    if (k <= 0) continue;
    // Most land low and gentle, a few tall peaks, with a little jitter for ragged coasts.
    S.h[i] = clamp(Math.round(Math.pow(k, 1.2) * MAXH * 1.1 + 0.6 + (R.next() - 0.5) * 0.8), 0, MAXH);
  }

  // 3. Enforce the slope rule by pulling down vertices that tower over a neighbour.
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const h0 = S.h[y * N + x]!;
        for (const [dx, dy] of D8) {
          const n = idx(x + dx, y + dy);
          if (S.h[n]! > h0 + 1) {
            S.h[n] = h0 + 1;
            changed = true;
          }
        }
      }
  }

  // Fill one-vertex pits: a lone sea vertex inside land would show as a hexagonal hole.
  // Its neighbours are all exactly 1 (slope rule), so lifting it to 1 keeps the rule.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (S.h[y * N + x] === 0 && D8.every(([dx, dy]) => S.h[idx(x + dx, y + dy)]! > 0)) S.h[y * N + x] = 1;

  // 4. Dressing: trees, flowers, rocks.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (isWater(S, x, y)) continue;
      const t = y * N + x, flat = tileFlat(S, x, y);
      if (R.next() < (flat ? 0.05 : 0.24)) S.tree[t] = 1 + R.int(3);
      if (R.next() < 0.1) S.flower[t] = 1 + R.int(4);
      const avg = (S.h[t]! + S.h[idx(x + 1, y)]! + S.h[idx(x, y + 1)]! + S.h[idx(x + 1, y + 1)]!) / 4;
      if (!flat && !S.tree[t] && R.next() < (avg >= 5 ? 0.1 : 0.012)) S.rock[t] = 1 + R.int(3);
    }

  // 5. Start site: a gentle spot inland on the largest landmass, flattened 5×5.
  const st = pickStart(S, R);
  S.start = st;
  const tg = clamp(S.h[idx(st[0], st[1])]!, 1, 4), verts: [number, number][] = [];
  for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) verts.push([st[0] + dx, st[1] + dy]);
  setVertices(S, verts, tg, new Set());
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const t = idx(st[0] + dx, st[1] + dy);
      S.tree[t] = 0;
      S.flower[t] = 0;
      S.rock[t] = 0;
    }
  S.rngState = R.s;
  return S;
}

/** Tile indices of each landmass (4-connected, wrapping), largest first. */
export function landmasses(S: State): number[][] {
  const seen = new Uint8Array(N * N), out: number[][] = [];
  for (let s = 0; s < N * N; s++) {
    if (seen[s] || isWater(S, s % N, (s / N) | 0)) continue;
    const comp: number[] = [], stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      const x = t % N, y = (t / N) | 0;
      for (const [dx, dy] of D4) {
        const n = idx(x + dx, y + dy);
        if (!seen[n] && !isWater(S, x + dx, y + dy)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

function pickStart(S: State, R: Rng): [number, number] {
  // Distance from each tile to the nearest water tile (multi-source BFS, wrapping).
  const dw = new Int16Array(N * N).fill(-1), queue: number[] = [];
  for (let t = 0; t < N * N; t++)
    if (isWater(S, t % N, (t / N) | 0)) {
      dw[t] = 0;
      queue.push(t);
    }
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head]!, x = t % N, y = (t / N) | 0;
    for (const [dx, dy] of D4) {
      const n = idx(x + dx, y + dy);
      if (dw[n] === -1) {
        dw[n] = dw[t]! + 1;
        queue.push(n);
      }
    }
  }
  const big = landmasses(S)[0];
  if (!big) return [N / 2, N / 2];
  let best = big[0]!, bs = -1e9;
  for (const t of big) {
    const x = t % N, y = (t / N) | 0;
    const s = Math.min(dw[t]!, 8) - S.h[t]! * 0.7 + (tileFlat(S, x, y) ? 2 : 0) + R.next() * 0.5;
    if (s > bs) {
      bs = s;
      best = t;
    }
  }
  return [best % N, (best / N) | 0];
}
