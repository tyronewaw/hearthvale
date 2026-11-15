import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { BMAX } from './defs';
import { Sim, growthMultiplier, homeGrowth } from './sim';
import { fields, levelFor, mkV, newHome, placeStruct, popCount, rebuildMap, recheck } from './village';
import { emptyState } from './worldgen';
import { DAY, N, TICK, idx } from './world';

/** A sim on a perfectly flat planet at height h (nothing on it). */
function flatSim(h = 2): Sim {
  const S = emptyState(4);
  S.h.fill(h);
  const sim = new Sim(S);
  sim.drain();
  return sim;
}
const run = (sim: Sim, seconds: number) => {
  for (let i = 0; i < seconds / TICK; i++) sim.tick();
};

describe('fields and levels', () => {
  it('counts the open flat 5×5 around a home', () => {
    const sim = flatSim();
    expect(fields(sim, 10, 10)).toBe(25);
    sim.S.tree[idx(11, 11)] = 1;
    expect(fields(sim, 10, 10)).toBe(24);
    placeStruct(sim, 'farm', 8, 12, 1);
    expect(fields(sim, 10, 10)).toBe(23);
    sim.S.h[idx(12, 8)] = 3; // vertex (12,8) raised: tiles (11..12, 7..8) are no longer flat
    expect(fields(sim, 10, 10)).toBe(21);
  });

  it('wraps around the planet seam', () => {
    const sim = flatSim();
    expect(fields(sim, 0, 0)).toBe(25);
    sim.S.tree[idx(N - 1, N - 1)] = 1;
    expect(fields(sim, 0, 0)).toBe(24);
  });

  it('levels follow the prototype thresholds', () => {
    expect([0, 3, 4, 8, 9, 13, 14, 18, 19, 24, 25].map(levelFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });
});

describe('home growth', () => {
  it('is faster for bigger homes and near trees', () => {
    const sim = flatSim(), S = sim.S;
    S.food = BALANCE.foodFull;
    S.t = DAY * 0.5; // spring
    const b = newHome(sim, 20, 20, 1);
    const sm = growthMultiplier(S);
    const g0 = homeGrowth(S, b, sm);
    expect(g0).toBeCloseTo((BALANCE.growBase + BALANCE.growPerLevel * 5) * BALANCE.growSeason[0]!);
    b.tb = 1.3;
    expect(homeGrowth(S, b, sm)).toBeCloseTo(g0 * 1.3);
  });

  it('rain ×2.5, cheers ×1.5, festival ×2, and hunger slows it (but never stops it)', () => {
    const sim = flatSim(), S = sim.S;
    S.food = BALANCE.foodFull;
    const b = newHome(sim, 1, 1, 1);
    const base = homeGrowth(S, b, growthMultiplier(S));
    S.rains.push({ x: N - 2, y: N - 2, t: 10 }); // within 5, across the seam
    expect(homeGrowth(S, b, growthMultiplier(S))).toBeCloseTo(base * 2.5);
    S.rains = [];
    S.cheers.push({ x: 3, y: 2, t: 10 });
    expect(homeGrowth(S, b, growthMultiplier(S))).toBeCloseTo(base * 1.5);
    S.cheers = [];
    S.fest = 10;
    expect(homeGrowth(S, b, growthMultiplier(S))).toBeCloseTo(base * 2);
    S.fest = 0;
    S.food = BALANCE.foodFull / 2;
    expect(homeGrowth(S, b, growthMultiplier(S))).toBeCloseTo(base * 0.5);
    S.food = 0;
    expect(homeGrowth(S, b, growthMultiplier(S))).toBeCloseTo(base * BALANCE.hungerFloor); // cosy: slowed, never stopped
  });

  it('a full home sends settlers out to found new homes', () => {
    const sim = flatSim(), S = sim.S;
    S.food = 200;
    const b = newHome(sim, 30, 30, BMAX[5] - 0.01);
    const before = S.vills.length;
    run(sim, 2);
    expect(S.vills.filter((v) => v.type === 'settler').length).toBeGreaterThan(before);
    expect(b.pop).toBeLessThan(BMAX[5]);
  });
});

describe('land changes', () => {
  it('a home whose land is no longer flat breaks, and its people come out as settlers', () => {
    const sim = flatSim();
    sim.sandbox = true;
    const b = newHome(sim, 40, 40, 3.5);
    rebuildMap(sim);
    expect(sim.useTool('raise', 41, 41)).toBe(true);
    expect(sim.S.homes.includes(b)).toBe(false);
    expect(sim.S.vills.filter((v) => v.type === 'settler').length).toBe(3);
  });

  it('a home shrinks when its fields are built over or forested', () => {
    const sim = flatSim(), S = sim.S;
    const b = newHome(sim, 50, 50, 1);
    expect(b.lv).toBe(5);
    for (let dx = -2; dx <= 2; dx++) S.tree[idx(50 + dx, 48)] = 1;
    recheck(sim);
    expect(b.lv).toBe(4); // 20 fields
  });
});

describe('jobs and production', () => {
  it('dropping villagers on a building gives them its job, up to the cap', () => {
    const sim = flatSim(), S = sim.S;
    const farm = placeStruct(sim, 'farm', 60, 60, 1);
    recheck(sim);
    for (let i = 0; i < 5; i++) {
      S.held = { k: 'v', v: mkV(sim, 'settler', 0, 0) };
      sim.drop(60.5, 60.6);
    }
    const farmers = S.vills.filter((v) => v.job === farm.id);
    expect(farmers).toHaveLength(4);
    expect(farmers.every((v) => v.role === 'farmer' && v.type === 'worker')).toBe(true);
    expect(sim.drain().some((e) => e.k === 'toast' && /full/.test(e.msg))).toBe(true);
  });

  it('farmers bring in more food in autumn than in winter', () => {
    const gain = (seasonIdx: number) => {
      const sim = flatSim(), S = sim.S;
      S.t = DAY * 3 * seasonIdx + DAY * 0.5;
      placeStruct(sim, 'hearth', 70, 70, 1);
      const farm = placeStruct(sim, 'farm', 75, 70, 1);
      recheck(sim);
      S.vills.push(mkV(sim, 'worker', 75.5, 71.5, { role: 'farmer', job: farm.id }));
      S.food = 100;
      run(sim, 20);
      return S.food;
    };
    expect(gain(2)).toBeGreaterThan(gain(3));
  });

  it('builders finish a site much faster than it builds itself', () => {
    const sim = flatSim(), S = sim.S;
    S.t = DAY * 0.4;
    const H = placeStruct(sim, 'hearth', 80, 80, 1);
    const site = placeStruct(sim, 'lumber', 84, 80, 0);
    recheck(sim);
    for (let i = 0; i < 3; i++) S.vills.push(mkV(sim, 'worker', 81 + i * 0.3, 81, { role: 'builder', job: H.id }));
    run(sim, 12);
    expect(site.prog).toBe(1);
  });

  it('a tree dropped on the Hearth becomes wood', () => {
    const sim = flatSim(), S = sim.S;
    placeStruct(sim, 'hearth', 90, 90, 1);
    S.tree[idx(95, 95)] = 2;
    expect(sim.grabTree(95, 95)).toBe(true);
    const w = S.wood;
    sim.drop(90.6, 90.5);
    expect(S.wood).toBe(w + 4);
    expect(S.stat.woodIn).toBe(4);
  });

  it('a thrown villager lands dizzy; a dropped one only briefly', () => {
    const sim = flatSim(), S = sim.S;
    const v = mkV(sim, 'settler', 5, 5);
    S.vills.push(v);
    expect(sim.grab(v.id)).toBe(true);
    expect(popCount(S)).toBe(1); // still counted while held
    sim.drop(10, 10, true);
    expect(v.dizzy).toBeCloseTo(2.2);
    expect(S.stat.throws).toBe(1);
    sim.grab(v.id);
    sim.drop(12, 12, false);
    expect(v.dizzy).toBeCloseTo(0.4);
    expect(S.stat.drops).toBe(1);
  });
});

describe('a fresh world', () => {
  it('starts with a Hearth and five settlers, who found homes on their own', () => {
    const sim = Sim.newWorld(42);
    expect(sim.S.structs.filter((s) => s.k === 'hearth')).toHaveLength(1);
    expect(sim.S.vills).toHaveLength(5);
    run(sim, DAY * 2);
    expect(sim.S.homes.length).toBeGreaterThan(0);
    expect(sim.S.popNow).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic: the same seed and ticks give the same village', () => {
    const a = Sim.newWorld(7), b = Sim.newWorld(7);
    run(a, 120);
    run(b, 120);
    expect(JSON.stringify(a.S.homes)).toBe(JSON.stringify(b.S.homes));
    expect(a.S.vills.map((v) => [v.x.toFixed(3), v.y.toFixed(3)])).toEqual(b.S.vills.map((v) => [v.x.toFixed(3), v.y.toFixed(3)]));
  });
});
