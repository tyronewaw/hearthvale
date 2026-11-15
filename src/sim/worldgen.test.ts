import { describe, expect, it } from 'vitest';
import { landTiles, slopeOk, tileFlat } from './terrain';
import { generateWorld, landmasses } from './worldgen';
import { N, idx } from './world';
import { Sim } from './sim';

describe('generateWorld', () => {
  for (const seed of [1, 42, 1234567, 0xbeef]) {
    it(`seed ${seed}: valid slopes, sensible land ratio, flat start`, () => {
      const S = generateWorld(seed);
      expect(slopeOk(S)).toBe(true);
      const ratio = landTiles(S) / (N * N);
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.6);
      const [sx, sy] = S.start;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(tileFlat(S, sx + dx, sy + dy)).toBe(true);
      expect(S.tree[idx(sx, sy)]).toBe(0);
      expect(landmasses(S)[0]!.length).toBeGreaterThan(400);
    });
  }

  it('is deterministic for a seed', () => {
    const a = generateWorld(77), b = generateWorld(77), c = generateWorld(78);
    expect(Buffer.from(a.h).equals(Buffer.from(b.h))).toBe(true);
    expect(Buffer.from(a.tree).equals(Buffer.from(b.tree))).toBe(true);
    expect(Buffer.from(a.h).equals(Buffer.from(c.h))).toBe(false);
  });
});

describe('Sim', () => {
  it('charges faith for raising and emits a terrain event', () => {
    const sim = Sim.newWorld(5);
    const [x, y] = sim.S.start;
    const f = sim.S.faith;
    expect(sim.useTool('raise', x, y)).toBe(true);
    expect(sim.S.faith).toBe(f - 1);
    const ev = sim.drain();
    expect(ev.some((e) => e.k === 'terrain')).toBe(true);
    expect(sim.drain()).toHaveLength(0);
  });
  it('refuses tools without faith, unless in sandbox', () => {
    const sim = Sim.newWorld(5);
    sim.S.faith = 0;
    expect(sim.useTool('raise', 3, 3)).toBe(false);
    sim.sandbox = true;
    expect(sim.useTool('raise', 3, 3)).toBe(true);
  });
  it('ticks time forward at 10 Hz and regenerates faith', () => {
    const sim = Sim.newWorld(5);
    const t0 = sim.S.t, f0 = sim.S.faith;
    for (let i = 0; i < 100; i++) sim.tick();
    expect(sim.S.t - t0).toBeCloseTo(10);
    expect(sim.S.faith).toBeGreaterThan(f0);
  });
});
