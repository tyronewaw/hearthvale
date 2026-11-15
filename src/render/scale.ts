import { idx, type State } from '../sim/world';

/**
 * Mapping from sim units to world units. One tile is 1×1 world units (x = tile x,
 * z = tile y). Heights are integer levels; level 0 is the sea floor, set below the water
 * surface so coasts slope into the sea as beaches.
 */
export const STEP = 0.55;
export const SEA_FLOOR = -0.75;
export const WATER_Y = 0.16;

export function yOf(level: number): number {
  return level <= 0 ? SEA_FLOOR : level * STEP;
}

/**
 * Terrain surface height in world units at a fractional tile position, on the same two
 * triangles per tile the renderer draws and Rapier uses (split along (x+1,z)→(x,z+1)).
 */
export function surfaceY(S: State, x: number, z: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, H = S.h;
  const a = yOf(H[idx(x0, z0)]!), b = yOf(H[idx(x0 + 1, z0)]!), c = yOf(H[idx(x0 + 1, z0 + 1)]!), d = yOf(H[idx(x0, z0 + 1)]!);
  return fx + fz <= 1 ? a + (b - a) * fx + (d - a) * fz : c + (d - c) * (1 - fx) + (b - c) * (1 - fz);
}

/** The surface you would stand on: terrain, or the water where it is deeper. */
export function standY(S: State, x: number, z: number): number {
  return Math.max(surfaceY(S, x, z), WATER_Y);
}
