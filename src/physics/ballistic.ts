import { wrap, type State } from '../sim/world';
import { WATER_Y, standY } from '../render/scale';

export const GRAVITY = 14;

/**
 * A simple arc with one bounce, used before Rapier has loaded and in tests. Mirrors the
 * prototype's stepFly(): fly, bounce once if thrown, then land. Always returns a spot on
 * the planet (wrapped), so throws always land safely.
 */
export function ballisticLanding(
  S: State, x: number, y: number, z: number, vx: number, vy: number, vz: number, thrown: boolean,
): { x: number; z: number; wet: boolean; t: number } {
  const dt = 1 / 60;
  let bounced = false, t = 0;
  for (let i = 0; i < 60 * 12; i++) {
    t += dt;
    x += vx * dt;
    z += vz * dt;
    vy -= GRAVITY * dt;
    y += vy * dt;
    const g = standY(S, wrap(x), wrap(z));
    if (y <= g && vy < 0) {
      if (thrown && !bounced && Math.hypot(vx, vz) > 2 && g > WATER_Y + 0.01) {
        bounced = true;
        vy = -vy * 0.35;
        vx *= 0.4;
        vz *= 0.4;
        y = g;
      } else return { x: wrap(x), z: wrap(z), wet: g <= WATER_Y + 0.001, t };
    }
  }
  return { x: wrap(x), z: wrap(z), wet: false, t };
}
