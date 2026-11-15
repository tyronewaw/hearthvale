import type { Ray } from 'three';
import { MAXH, wrap, type State } from '../sim/world';
import { bendDrop } from '../render/bend';
import { STEP, standY } from '../render/scale';

export interface GroundHit {
  /** World position in the frame around the camera focus (not wrapped). */
  x: number;
  y: number;
  z: number;
  /** Nearest vertex, wrapped into [0, N). */
  vx: number;
  vz: number;
  /** Tile under the point, wrapped. */
  tx: number;
  tz: number;
}

/**
 * Find where a screen ray meets the bent, wrapped ground (or the water surface).
 * Marches the ray through the height slab, then bisects to the surface.
 */
export function pickGround(S: State, ray: Ray, maxT = 500): GroundHit | null {
  const o = ray.origin, d = ray.direction;
  const top = MAXH * STEP + 0.5;
  const below = (t: number) => {
    const x = o.x + d.x * t, z = o.z + d.z * t;
    return o.y + d.y * t <= standY(S, wrap(x), wrap(z)) - bendDrop(x, z);
  };
  // Skip straight to where the ray enters the slab under the highest possible ground.
  let t = 0;
  if (o.y > top) {
    if (d.y >= 0) return null;
    t = (o.y - top) / -d.y;
  }
  if (below(t)) return null;
  const step = 0.35;
  let prev = t;
  for (; t < maxT; t += step) {
    if (below(t)) break;
    prev = t;
  }
  if (t >= maxT) return null;
  let a = prev, b = t;
  for (let i = 0; i < 12; i++) {
    const m = (a + b) / 2;
    if (below(m)) b = m;
    else a = m;
  }
  const x = o.x + d.x * b, y = o.y + d.y * b, z = o.z + d.z * b;
  return {
    x, y, z,
    vx: wrap(Math.round(x)),
    vz: wrap(Math.round(z)),
    tx: wrap(Math.floor(x)),
    tz: wrap(Math.floor(z)),
  };
}
