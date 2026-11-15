import { describe, expect, it } from 'vitest';
import { generateWorld } from '../sim/worldgen';
import { N } from '../sim/world';
import { ballisticLanding } from './ballistic';
import { THROW, throwVelocity, trimTrail, type TrailPoint } from './throw';

const trail = (pts: [number, number, number][]): TrailPoint[] => pts.map(([t, x, z]) => ({ t, x, y: 1, z }));

describe('throw velocity', () => {
  it('a still hand drops gently', () => {
    expect(throwVelocity(trail([[0, 5, 5], [100, 5, 5]]), 110).thrown).toBe(false);
    expect(throwVelocity([], 0).thrown).toBe(false);
  });
  it('a fast flick throws in the direction of motion, with lift', () => {
    const v = throwVelocity(trail([[0, 0, 0], [50, 0.5, 0], [100, 1, 0]]), 105);
    expect(v.thrown).toBe(true);
    expect(v.vx).toBeCloseTo(10);
    expect(v.vz).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(THROW.lift + 10 * THROW.liftPerSpeed);
  });
  it('is capped at the maximum speed', () => {
    const v = throwVelocity(trail([[0, 0, 0], [50, 10, 10]]), 55);
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(THROW.maxSpeed);
  });
  it('a hand that stopped before letting go drops', () => {
    expect(throwVelocity(trail([[0, 0, 0], [50, 1, 0]]), 50 + THROW.stillFor + 10).thrown).toBe(false);
  });
  it('trims old points but keeps the last three', () => {
    const t = trail([[0, 0, 0], [100, 0, 0], [200, 0, 0], [300, 0, 0], [900, 0, 0]]);
    trimTrail(t, 900);
    expect(t).toHaveLength(3);
  });
  it('still throws after a slow frame just before letting go', () => {
    // a fast flick, then a 380 ms hitch before the last sample
    const t = trail([[0, 0, 0], [16, 0.4, 0], [32, 0.8, 0], [412, 1.6, 0]]);
    trimTrail(t, 412);
    const v = throwVelocity(t, 420);
    expect(v.thrown).toBe(true);
    expect(v.vx).toBeGreaterThan(0);
  });
});

describe('ballistic landing (fallback before Rapier loads)', () => {
  it('always lands on the planet, wrapping round the seam', () => {
    const S = generateWorld(8);
    for (let i = 0; i < 200; i++) {
      const a = i * 0.7, sp = (i % 10) + 1;
      const r = ballisticLanding(S, (i * 13) % N, 3, (i * 29) % N, Math.cos(a) * sp, 4, Math.sin(a) * sp, true);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x).toBeLessThan(N);
      expect(r.z).toBeGreaterThanOrEqual(0);
      expect(r.z).toBeLessThan(N);
      expect(r.t).toBeLessThan(12);
    }
  });
  it('flies further when thrown harder', () => {
    const S = generateWorld(8);
    S.h.fill(2);
    const a = ballisticLanding(S, 10, 3, 10, 2, 3, 0, true), b = ballisticLanding(S, 10, 3, 10, 8, 3, 0, true);
    expect(b.x - 10).toBeGreaterThan(a.x - 10);
  });
});
