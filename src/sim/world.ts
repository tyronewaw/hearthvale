/**
 * World constants and torus helpers.
 *
 * The world is a wrap-around planet: an N×N grid of height vertices with no border.
 * Tile (x, y) has corners (x,y), (x+1,y), (x+1,y+1), (x,y+1), all wrapped, so tiles and
 * vertices share the same index space. Every coordinate goes through `wrap`.
 */

export const N = 128;
/** Highest terrain level. Level 0 is the sea floor / sea. */
export const MAXH = 9;
/** Tiles per render/physics chunk side. */
export const CHUNK = 16;
export const CHUNKS = N / CHUNK;
/** Seconds in one in-game day (as in the prototype). */
export const DAY = 150;
/** Fixed simulation step in seconds (10 Hz). */
export const TICK = 0.1;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

export const D4: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
export const D8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Wrap an integer or float coordinate into [0, N). */
export function wrap(i: number): number {
  return i - N * Math.floor(i / N);
}
/** Index of vertex or tile (x, y), wrapped. Integer inputs only. */
export function idx(x: number, y: number): number {
  return wrap(y) * N + wrap(x);
}
export function ix(i: number): number {
  return i % N;
}
export function iy(i: number): number {
  return (i / N) | 0;
}
/** Shortest signed delta from a to b on the torus, in (-N/2, N/2]. */
export function wd(a: number, b: number): number {
  let d = (b - a) % N;
  if (d > N / 2) d -= N;
  else if (d <= -N / 2) d += N;
  return d;
}
/** Distance on the torus. */
export function tdist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(wd(ax, bx), wd(ay, by));
}
/** Chunk index for a tile index. */
export function chunkOfTile(t: number): number {
  return ((iy(t) / CHUNK) | 0) * CHUNKS + ((ix(t) / CHUNK) | 0);
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Persistent world state. Plain data only, so it serialises cleanly. */
export interface State {
  v: 3;
  seed: number;
  /** Seconds since the world began. */
  t: number;
  h: Int8Array;
  tree: Uint8Array;
  flower: Uint8Array;
  rock: Uint8Array;
  /** Tile where the village starts (the Hearth goes here in phase 3). */
  start: [number, number];
  faith: number;
  food: number;
  wood: number;
  rngState: number;
}

export const season = (t: number): number => Math.floor(t / DAY / 3) % 4;
/** Time of day in [0, 1): 0 is midnight, 0.5 is noon. */
export const tod = (t: number): number => (t / DAY) % 1;
/** 1 at night, 0 in the day, ramps at dawn and dusk (the prototype's nightF). */
export function nightF(t: number): number {
  const d = tod(t);
  return d < 0.2 || d > 0.81 ? 1 : d < 0.3 ? (0.3 - d) / 0.1 : d > 0.71 ? (d - 0.71) / 0.1 : 0;
}
