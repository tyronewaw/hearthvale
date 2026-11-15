import { D8, MAXH, N, idx, type State } from './world';

/** A tile is flat land when all four corners share the same non-zero height. */
export function tileFlat(S: State, x: number, y: number): boolean {
  const H = S.h;
  const a = H[idx(x, y)]!;
  return a > 0 && a === H[idx(x + 1, y)] && a === H[idx(x + 1, y + 1)] && a === H[idx(x, y + 1)];
}

/** A tile is water when all four corners are at sea level. */
export function isWater(S: State, x: number, y: number): boolean {
  const H = S.h;
  return !(H[idx(x, y)]! | H[idx(x + 1, y)]! | H[idx(x + 1, y + 1)]! | H[idx(x, y + 1)]!);
}

/**
 * Height at a fractional position, interpolated over the same two triangles the renderer
 * draws (split along the (x,y)→(x+1,y+1) diagonal), so things stand exactly on the surface.
 */
export function hAt(S: State, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, H = S.h;
  const a = H[idx(x0, y0)]!, b = H[idx(x0 + 1, y0)]!, c = H[idx(x0 + 1, y0 + 1)]!, d = H[idx(x0, y0 + 1)]!;
  return fx >= fy ? a + (b - a) * fx + (c - b) * fy : a + (c - d) * fx + (d - a) * fy;
}

/** Mark the four tiles that share vertex (vx, vy) as changed. */
export function touchVertex(vx: number, vy: number, out: Set<number>): void {
  out.add(idx(vx - 1, vy - 1));
  out.add(idx(vx, vy - 1));
  out.add(idx(vx - 1, vy));
  out.add(idx(vx, vy));
}

/**
 * Enforce the slope rule: neighbouring vertices (8-way, wrapping) differ by at most 1.
 * Starts from the vertex indices in `q` and pushes neighbours towards them.
 *
 * One-directional on purpose. With `dir = 1` (after raising the sources) it only ever raises
 * neighbours that sit too low; with `dir = -1` it only lowers ones that sit too high.
 * Every changed vertex is re-queued, so it is processed after its last change, and the
 * result is valid provided the terrain was valid before the edit. A two-way cascade is
 * order-dependent: a vertex popped while still stale can drag a correct neighbour back.
 * Mixed edits (some vertices up, some down) go through `setVertices`.
 */
export function cascade(S: State, q: number[], touched: Set<number>, dir: 1 | -1): void {
  const H = S.h;
  let guard = 0;
  while (q.length && guard++ < N * N * 40) {
    const v = q.pop()!;
    const x = v % N, y = (v / N) | 0, h0 = H[v]!;
    for (const [dx, dy] of D8) {
      const n = idx(x + dx, y + dy);
      const hn = H[n]!;
      if (dir > 0 && hn < h0 - 1) H[n] = h0 - 1;
      else if (dir < 0 && hn > h0 + 1) H[n] = h0 + 1;
      else continue;
      q.push(n);
      touchVertex(x + dx, y + dy, touched);
    }
  }
}

/** Raise (d = 1) or lower (d = -1) one vertex. Returns false at the height limits. */
export function bump(S: State, vx: number, vy: number, d: number, touched: Set<number>): boolean {
  const v = idx(vx, vy), nh = S.h[v]! + d;
  if (nh < 0 || nh > MAXH) return false;
  S.h[v] = nh;
  touchVertex(vx, vy, touched);
  cascade(S, [v], touched, d > 0 ? 1 : -1);
  return true;
}

/**
 * Set a group of vertices to one height and cascade. Done as a raise pass and then a
 * lower pass, so each cascade is one-directional and the patch comes out exactly flat.
 * `verts` holds [x, y] vertex coordinates.
 */
export function setVertices(S: State, verts: ReadonlyArray<readonly [number, number]>, tgt: number, touched: Set<number>): void {
  for (const dir of [1, -1] as const) {
    const q: number[] = [];
    for (const [x, y] of verts) {
      const v = idx(x, y), h = S.h[v]!;
      if ((dir > 0 && h < tgt) || (dir < 0 && h > tgt)) {
        S.h[v] = tgt;
        touchVertex(x, y, touched);
        q.push(v);
      }
    }
    cascade(S, q, touched, dir > 0 ? 1 : -1);
  }
}

/** Level blessing: set a 5×5 block of vertices (a 4×4 patch of tiles) to the clicked height. */
export function level(S: State, vx: number, vy: number, touched: Set<number>): void {
  const tgt = Math.max(1, S.h[idx(vx, vy)]!), verts: [number, number][] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) verts.push([vx + dx, vy + dy]);
  setVertices(S, verts, tgt, touched);
}

/** Rise blessing: lift a broad round patch by one level, even out of the sea. */
export function rise(S: State, vx: number, vy: number, touched: Set<number>): void {
  const q: number[] = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.hypot(dx, dy) > 2.3) continue;
      const v = idx(vx + dx, vy + dy);
      if (S.h[v]! < MAXH) {
        S.h[v] = S.h[v]! + 1;
        touchVertex(vx + dx, vy + dy, touched);
      }
      q.push(v);
    }
  cascade(S, q, touched, 1);
}

/** True when every vertex obeys the slope rule (used by tests and debug checks). */
export function slopeOk(S: State): boolean {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const h0 = S.h[idx(x, y)]!;
      for (const [dx, dy] of D8) if (Math.abs(S.h[idx(x + dx, y + dy)]! - h0) > 1) return false;
    }
  return true;
}

/** Count of land (non-water) tiles. */
export function landTiles(S: State): number {
  let c = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!isWater(S, x, y)) c++;
  return c;
}
