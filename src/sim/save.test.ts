import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from './save';
import { Sim } from './sim';
import { TICK } from './world';

describe('save / load', () => {
  it('round-trips a living village', () => {
    const sim = Sim.newWorld(21);
    sim.sandbox = true;
    const [sx, sy] = sim.S.start;
    sim.useTool('raise', sx + 8, sy + 8);
    for (let i = 0; i < 900 / TICK / 10; i++) sim.tick();
    const json = serialize(sim.S);
    const S2 = deserialize(json)!;
    expect(S2).not.toBeNull();
    expect(Buffer.from(S2.h.buffer).equals(Buffer.from(sim.S.h.buffer))).toBe(true);
    expect(Buffer.from(S2.tree).equals(Buffer.from(sim.S.tree))).toBe(true);
    expect(S2.homes).toEqual(sim.S.homes);
    expect(S2.structs).toEqual(sim.S.structs);
    // residents are recreated from homes, everyone else is kept
    expect(S2.vills.map((v) => v.id)).toEqual(sim.S.vills.filter((v) => v.type !== 'resident').map((v) => v.id));
    expect(S2.t).toBe(sim.S.t);
    expect(S2.rngState).toBe(sim.S.rngState);
    // and it plays on
    const sim2 = new Sim(S2);
    for (let i = 0; i < 50; i++) sim2.tick();
    expect(sim2.S.t).toBeGreaterThan(sim.S.t);
  });

  it('puts a held villager back down', () => {
    const sim = Sim.newWorld(3);
    const v = sim.S.vills[0]!;
    sim.grab(v.id);
    const S2 = deserialize(serialize(sim.S))!;
    expect(S2.held).toBeNull();
    expect(S2.vills.some((o) => o.id === v.id)).toBe(true);
  });

  it('rejects other saves', () => {
    expect(deserialize('nope')).toBeNull();
    expect(deserialize(JSON.stringify({ v: 2, h: [] }))).toBeNull();
  });
});

describe('flying villagers', () => {
  it('count towards the population while airborne, and are kept by a save', () => {
    const sim = Sim.newWorld(5);
    const ours = sim.S.vills.filter((o) => o.tribe === 0), v = ours[0]!;
    const pop = ours.length;
    sim.grab(v.id);
    const obj = sim.release()!;
    expect(sim.S.flying).toHaveLength(1);
    sim.tick();
    expect(sim.S.popNow).toBe(pop);
    const S2 = deserialize(serialize(sim.S))!;
    expect(S2.vills.some((o) => o.id === v.id)).toBe(true);
    sim.landed(obj, 10, 10, true);
    expect(sim.S.flying).toHaveLength(0);
    expect(sim.S.vills.includes(v)).toBe(true);
  });
});
