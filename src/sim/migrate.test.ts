import { describe, expect, it } from 'vitest';
import { OFF, migrateV2 } from './migrate';
import { QUESTS } from './quests';
import { Sim } from './sim';
import { slopeOk, tileFlat } from './terrain';
import { idx } from './world';

/** A small prototype (v2) save: a flat island with a Hearth, a farm and its farmer, a home and a pet. */
function v2Fixture(): string {
  const V = 65, h = new Array(V * V).fill(0);
  // island: height 2 over [10..50], a ring of 1 around it (the slope rule holds)
  for (let y = 9; y <= 51; y++) for (let x = 9; x <= 51; x++) h[y * V + x] = x === 9 || y === 9 || x === 51 || y === 51 ? 1 : 2;
  const tree = new Array(64 * 64).fill(0), flower = new Array(64 * 64).fill(0);
  tree[40 * 64 + 40] = 2;
  flower[12 * 64 + 12] = 3;
  return JSON.stringify({
    v: 2, seed: 4242, h, tree, flower, t: 900, faith: 321, food: 55, wood: 77, best: 140, maxLv: 4, won: false, q: 7,
    totem: [25, 26], fest: 0, rains: [{ x: 20, y: 20, t: 5 }], cheers: [], poos: [], hinted: { flat: 1 },
    stat: { strokes: 3, drops: 4, throws: 2, woodIn: 12, taught: 1 },
    homes: [{ x: 20, y: 20, lv: 3, pop: 6 }],
    structs: [{ k: 'hearth', x: 30, y: 30, prog: 1, fert: 0 }, { k: 'farm', x: 36, y: 30, prog: 1, fert: 10 }],
    vills: [{ x: 36.5, y: 31.5, type: 'worker', role: 'farmer', job: 1, c: 2, sk: 1 }, { x: 25, y: 25, type: 'settler', role: 'settler', job: -1, c: 0, sk: 3 }],
    pet: {
      kind: 'monkey', name: 'Pip', x: 31.5, y: 31.5, need: { food: 50, energy: 60, fun: 40 }, love: 80, mode: 'stay', post: [31, 31],
      w: { help: 3, plant: 2, dance: 1, play: 1, mischief: 0.3 }, xp: 90, stage: 1, seen: { bloom: 2, rain: 1, fest: 0 }, tricks: ['bloom'], trickCD: 10,
    },
  });
}

describe('migrating a prototype (v2) save', () => {
  it('rejects anything else', () => {
    expect(migrateV2('nope')).toBeNull();
    expect(migrateV2(JSON.stringify({ v: 3 }))).toBeNull();
  });

  it('places the old island in the middle of the planet, intact', () => {
    const S = migrateV2(v2Fixture())!;
    expect(S).not.toBeNull();
    expect(slopeOk(S)).toBe(true);
    expect(S.h[idx(30 + OFF, 30 + OFF)]).toBe(2);
    expect(S.h[idx(5 + OFF, 5 + OFF)]).toBe(0); // the old sea is sea
    expect(tileFlat(S, 20 + OFF, 20 + OFF)).toBe(true);
    expect(S.tree[idx(40 + OFF, 40 + OFF)]).toBe(2);
    expect(S.flower[idx(12 + OFF, 12 + OFF)]).toBe(3);
  });

  it('keeps homes, buildings, jobs, villagers, the pet and progress', () => {
    const S = migrateV2(v2Fixture())!;
    expect(S.homes).toHaveLength(1);
    expect([S.homes[0]!.x, S.homes[0]!.y, S.homes[0]!.lv]).toEqual([20 + OFF, 20 + OFF, 3]);
    const farm = S.structs.find((s) => s.k === 'farm')!;
    const farmer = S.vills.find((v) => v.role === 'farmer')!;
    expect(farmer.job).toBe(farm.id);
    expect(farmer.x).toBeCloseTo(36.5 + OFF);
    expect(S.start).toEqual([30 + OFF, 30 + OFF]);
    expect(S.pet!.name).toBe('Pip');
    expect(S.pet!.tricks).toEqual(['bloom']);
    expect(S.pet!.w.help).toBe(3);
    expect(S.pet!.x).toBeCloseTo(31.5 + OFF);
    expect([S.faith, S.food, S.wood, S.best]).toEqual([321, 55, 77, 140]);
    expect(QUESTS[S.q]!.id).toBe('timber'); // the prototype's 8th quest, wherever it sits in today's chain
    expect(S.stat.strokes).toBe(3);
    expect(S.totem).toEqual([25 + OFF, 26 + OFF]);
    expect(S.q).toBeLessThan(QUESTS.length);
  });

  it('plays on as a normal 3D world', () => {
    const sim = new Sim(migrateV2(v2Fixture())!);
    for (let i = 0; i < 300; i++) sim.tick();
    expect(sim.S.homes.length).toBeGreaterThanOrEqual(1);
    expect(sim.S.structs.some((s) => s.k === 'hearth')).toBe(true);
  });
});

describe('quests', () => {
  it('a fresh world starts on "A companion" and choosing a pet completes it with faith', () => {
    const sim = Sim.newWorld(3);
    expect(sim.S.q).toBe(0);
    const f = sim.S.faith;
    sim.choosePet('sheep', 'Wooly');
    for (let i = 0; i < 6; i++) sim.tick();
    expect(sim.S.q).toBe(1);
    expect(sim.S.faith).toBeGreaterThan(f + 19);
  });

  it('blessings unlock with population and teach the watching pet', () => {
    const sim = Sim.newWorld(3);
    const [sx, sy] = sim.S.start;
    sim.choosePet('sheep', 'Wooly', sx, sy);
    expect(sim.useTool('bloom', sx, sy)).toBe(false); // locked until 25 villagers
    sim.S.best = 30;
    sim.S.faith = 100;
    expect(sim.useTool('bloom', sx, sy)).toBe(true);
    expect(sim.S.faith).toBe(85);
    expect(sim.S.pet!.seen.bloom).toBe(1);
  });
});
