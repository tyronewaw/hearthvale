import type { RoleId, StructKind } from './defs';
import type { Pet } from './pet';

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

/** A home: grows from tepee (0) to great lodge (5) with the flat land around it. */
export interface Home {
  kind: 'home';
  id: number;
  x: number;
  y: number;
  lv: number;
  /** Villagers living inside (fractional: grows continuously). */
  pop: number;
  /** Growth bonus from nearby trees (1 = none). */
  tb: number;
}

/** A work building, or a construction site while prog < 1. */
export interface Struct {
  kind: 'struct';
  id: number;
  k: StructKind;
  x: number;
  y: number;
  prog: number;
  /** Seconds of fertiliser left (doubles a farm's yield). */
  fert: number;
}

export type VillType = 'settler' | 'resident' | 'worker';

/** A walking villager. Settlers look for land, residents potter round home, workers work. */
export interface Vill {
  id: number;
  type: VillType;
  role: RoleId;
  /** Struct id of the job, or null. */
  job: number | null;
  /** Home id (residents), or null. */
  home: number | null;
  x: number;
  y: number;
  /** Position at the start of this tick, for render interpolation. */
  px: number;
  py: number;
  tx: number;
  ty: number;
  think: number;
  blocked: number;
  /** Clothing shade (tribe blue) and skin tone indices. */
  c: number;
  sk: number;
  /** Heading in radians (atan2 of movement in x/y). */
  face: number;
  st: '' | 'sit' | 'work' | 'rest';
  t: number;
  dizzy: number;
  wave: number;
  mv: boolean;
  spot: [number, number] | null;
  spotT: number;
  /** Carrying building materials (builders). */
  carry: number;
  goal: [number, number] | null;
  chop: [number, number] | null;
  plant: [number, number] | null;
}

/** What the god hand is holding. */
export type Held = { k: 'v'; v: Vill } | { k: 'tree'; tree: number } | { k: 'rock'; rock: number };

export interface Stats {
  strokes: number;
  drops: number;
  throws: number;
  woodIn: number;
  taught: number;
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
  /** Tile where the village started (the first Hearth). */
  start: [number, number];
  faith: number;
  food: number;
  wood: number;
  rngState: number;
  /** Next entity id. */
  uid: number;
  homes: Home[];
  structs: Struct[];
  vills: Vill[];
  held: Held | null;
  /** Things the hand threw or dropped that are still in the air (physics owns their motion). */
  flying: Held[];
  totem: [number, number] | null;
  /** Highest population reached (unlocks blessings). */
  best: number;
  /** Highest home level reached. */
  maxLv: number;
  popNow: number;
  won: boolean;
  rains: { x: number; y: number; t: number }[];
  /** Festival seconds left. */
  fest: number;
  cheers: { x: number; y: number; t: number }[];
  stat: Stats;
  hinted: Record<string, 1>;
  /** The god pet (null until chosen). */
  pet: Pet | null;
  /** Pet droppings that fertilise the ground when they fade. */
  poos: { x: number; y: number; t: number }[];
}

export const season = (t: number): number => Math.floor(t / DAY / 3) % 4;
/** Time of day in [0, 1): 0 is midnight, 0.5 is noon. */
export const tod = (t: number): number => (t / DAY) % 1;
/** 1 at night, 0 in the day, ramps at dawn and dusk (the prototype's nightF). */
export function nightF(t: number): number {
  const d = tod(t);
  return d < 0.2 || d > 0.81 ? 1 : d < 0.3 ? (0.3 - d) / 0.1 : d > 0.71 ? (d - 0.71) / 0.1 : 0;
}
