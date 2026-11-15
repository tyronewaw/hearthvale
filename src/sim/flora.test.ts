import { describe, expect, it } from 'vitest';
import { spreadTrees, treeCanGrow } from './flora';
import { Rng } from './rng';
import { tileFlat, isWater } from './terrain';
import { generateWorld } from './worldgen';
import { DAY, N } from './world';
import { Sim } from './sim';

const count = (a: Uint8Array) => a.reduce((n, v) => n + (v ? 1 : 0), 0);

describe('tree spread', () => {
  it('only ever seeds sloped, dry, rock-free land', () => {
    const S = generateWorld(11), R = new Rng(5);
    const before = Uint8Array.from(S.tree);
    for (let i = 0; i < 400; i++) spreadTrees(S, R);
    let grew = 0;
    for (let t = 0; t < N * N; t++) {
      if (S.tree[t] && !before[t]) {
        grew++;
        const x = t % N, y = (t / N) | 0;
        expect(tileFlat(S, x, y)).toBe(false);
        expect(isWater(S, x, y)).toBe(false);
        expect(S.rock[t]).toBe(0);
      }
    }
    expect(grew).toBeGreaterThan(20);
  });

  it('does not spread in winter', () => {
    const S = generateWorld(11), R = new Rng(5);
    S.t = DAY * 9 + 1; // day 10: winter (seasons last 3 days)
    const n0 = count(S.tree);
    for (let i = 0; i < 400; i++) expect(spreadTrees(S, R)).toHaveLength(0);
    expect(count(S.tree)).toBe(n0);
  });

  it('treeCanGrow refuses flat tiles and existing trees', () => {
    const S = generateWorld(11);
    const [sx, sy] = S.start;
    expect(tileFlat(S, sx, sy)).toBe(true);
    expect(treeCanGrow(S, sx, sy)).toBe(false);
  });

  it('the sim spreads trees over time and reports them as flora events', () => {
    const sim = Sim.newWorld(3);
    const n0 = count(sim.S.tree);
    let flora = 0;
    for (let i = 0; i < 600; i++) {
      sim.tick();
      for (const e of sim.drain()) if (e.k === 'flora') flora += e.tiles.length;
    }
    expect(count(sim.S.tree) - n0).toBe(flora);
    expect(flora).toBeGreaterThan(0);
  });

  it('announces each new season once', () => {
    const sim = Sim.newWorld(3);
    const seasons: number[] = [];
    for (let i = 0; i < (DAY * 12) / 0.1; i++) {
      sim.tick();
      for (const e of sim.drain()) if (e.k === 'season') seasons.push(e.season);
    }
    expect(seasons).toEqual([1, 2, 3, 0]);
  });
});
