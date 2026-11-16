import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { QUEST_VERSION } from './defs';
import { finishAct, petLevel, petRise, startAct } from './pet';
import { QUESTS, remapQuest } from './quests';
import { deserialize, serialize } from './save';
import { Sim } from './sim';
import { isWater, slopeOk, tileFlat } from './terrain';
import { centreX, centreY, land, mkV, placeStruct } from './village';
import { emptyState } from './worldgen';
import { DAY, TICK, idx, tdist } from './world';

/** A flat world at height 2, midday, with a sheep at (x, y). */
function penSim(x = 26, y = 26, pet = true): Sim {
  const S = emptyState(11);
  S.h.fill(2);
  S.t = DAY * 0.5;
  S.wood = 100;
  const sim = new Sim(S);
  if (pet) sim.choosePet('sheep', 'Wooly', x, y);
  sim.drain();
  return sim;
}
const run = (sim: Sim, seconds: number, until?: () => boolean) => {
  for (let i = 0; i < seconds / TICK; i++) {
    sim.tick();
    if (until?.()) return true;
  }
  return false;
};

describe('the pet pen', () => {
  it('needs a pet, and there is only ever one', () => {
    const sim = penSim(26, 26, false);
    expect(sim.build('pen', 20, 20)).toBe(false);
    expect(sim.drain().some((e) => e.k === 'toast' && /pet first/.test(e.msg))).toBe(true);
    sim.choosePet('sheep', 'Wooly', 26, 26);
    expect(sim.build('pen', 20, 20)).toBe(true);
    expect(sim.S.wood).toBe(100 - 12);
    sim.drain();
    expect(sim.build('pen', 40, 40)).toBe(false);
    expect(sim.drain().some((e) => e.k === 'toast' && /already have a Pet pen/.test(e.msg))).toBe(true);
  });

  it('gives no job to a villager dropped on it', () => {
    const sim = penSim();
    placeStruct(sim, 'pen', 20, 20, 1);
    const v = mkV(sim, 'settler', 5, 5);
    land(sim, { k: 'v', v }, 20.5, 20.5, false);
    expect(v.job).toBeNull();
    expect(v.type).toBe('settler');
    expect(sim.S.vills).toContain(v);
  });

  it('the tired pet sleeps in its pen, rests twice as fast, and its bedding fertilises nearby farms', () => {
    const sim = penSim(26, 26), S = sim.S, P = S.pet!;
    const pen = placeStruct(sim, 'pen', 20, 20, 1);
    const near = placeStruct(sim, 'farm', 24, 20, 1), far = placeStruct(sim, 'farm', 40, 40, 1);
    P.need = { food: 100, energy: 10, fun: 100 };
    const inPen = () => P.act?.id === 'sleep' && P.act.ph === 'do';
    expect(run(sim, 30, inPen)).toBe(true);
    expect(P.act!.pen).toBe(true);
    expect(tdist(P.x, P.y, centreX(pen), centreY(pen))).toBeLessThan(0.5);
    const e0 = P.need.energy;
    run(sim, 2);
    expect(P.need.energy - e0).toBeCloseTo(2 * 2.4 * BALANCE.penRest, 0);
    expect(run(sim, 40, () => P.act?.id !== 'sleep')).toBe(true);
    expect(near.fert).toBeGreaterThan(0);
    expect(far.fert).toBe(0);
  });

  it('Pen sends the pet home to stay there', () => {
    const sim = penSim(30, 30), P = sim.S.pet!;
    expect(sim.penPet()).toBe(false); // nothing built yet
    placeStruct(sim, 'pen', 20, 20, 1);
    expect(sim.penPet()).toBe(true);
    expect(P.mode).toBe('stay');
    expect(P.post).toEqual([21, 21]); // the middle of the 2×2 pen
  });
});

describe('new tricks', () => {
  it('watching Level, Rise or two buildings nearby teaches Level, Rise and Build', () => {
    const sim = penSim(20, 20), P = sim.S.pet!;
    sim.sandbox = true;
    sim.S.best = 999;
    sim.useTool('flat', 22, 22);
    sim.useTool('flat', 18, 22);
    expect(P.tricks).toContain('flat');
    sim.useTool('isle', 16, 16);
    sim.useTool('isle', 24, 16);
    expect(P.tricks).toContain('isle');
    expect(sim.build('farm', 26, 20)).toBe(true);
    expect(P.seen.build).toBe(1);
    expect(sim.build('lumber', 20, 28)).toBe(true);
    expect(P.tricks).toContain('build');
  });

  it('Build adds progress to a building site', () => {
    const sim = penSim(20, 20), S = sim.S, P = S.pet!;
    P.xp = BALANCE.petYoung;
    P.tricks = ['build'];
    const site = placeStruct(sim, 'farm', 23, 20, 0);
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      P.trickCD = 0;
      startAct(sim, 'help');
      found = P.act?.id === 'trick';
    }
    expect(found).toBe(true);
    expect(P.act!.trick).toBe('build');
    expect(P.act!.s).toBe(site.id);
    finishAct(sim, P.act!);
    expect(site.prog).toBeCloseTo(BALANCE.petBuild);
    expect(P.trickCD).toBe(BALANCE.trickCooldown);
  });

  it('Level smooths a gentle bump, but never breaks a home', () => {
    const sim = penSim(), S = sim.S;
    S.h[idx(30, 30)] = 3;
    expect(slopeOk(S)).toBe(true);
    sim.drain();
    expect(petLevel(sim, 29, 29)).toBe(true);
    expect(S.h[idx(30, 30)]).toBe(2);
    expect(sim.drain().some((e) => e.k === 'terrain')).toBe(true);

    // a home on a little plateau right next to the patch: levelling would tip it, so nothing changes
    for (const [x, y] of [[31, 30], [32, 30], [31, 31], [32, 31]] as const) S.h[idx(x, y)] = 3;
    sim.S.homes.push({ kind: 'home', id: S.uid++, x: 31, y: 30, lv: 0, pop: 1, tb: 1, tribe: 0, bel: 0 });
    sim.bmap[idx(31, 30)] = S.homes.at(-1)!;
    const before = S.h.slice();
    expect(petLevel(sim, 29, 29)).toBe(false);
    expect(S.h).toEqual(before);
    expect(tileFlat(S, 31, 30)).toBe(true);
    expect(S.homes).toHaveLength(1);
  });

  it('Rise turns a tile of shallow sea by the shore into beach', () => {
    const S = emptyState(12);
    for (let y = 10; y <= 20; y++) for (let x = 10; x <= 20; x++) S.h[idx(x, y)] = 1;
    const sim = new Sim(S);
    expect(isWater(S, 21, 15)).toBe(true);
    expect(petRise(sim, 21, 15)).toBe(true);
    expect(isWater(S, 21, 15)).toBe(false);
    expect(slopeOk(S)).toBe(true);
  });
});

describe('older saves', () => {
  it('keep their quest (mapped onto the longer chain) and their pet learns the new tricks', () => {
    const sim = penSim();
    sim.S.q = 9; // "A real village" in the first chain
    const o = JSON.parse(serialize(sim.S));
    delete o.qv;
    o.pet.seen = { bloom: 1, rain: 0, fest: 0 };
    const S = deserialize(JSON.stringify(o))!;
    expect(QUESTS[S.q]!.id).toBe('village');
    expect(S.qv).toBe(QUEST_VERSION);
    const loaded = new Sim(S);
    expect(loaded.S.pet!.seen).toMatchObject({ bloom: 1, flat: 0, isle: 0, build: 0 });
  });

  it('remapQuest: start, finished chain, and today\'s chain pass through', () => {
    expect(remapQuest(0, 1)).toBe(0);
    expect(remapQuest(13, 1)).toBe(QUESTS.length);
    expect(remapQuest(12, 1)).toBe(QUESTS.length - 1);
    expect(remapQuest(5, QUEST_VERSION)).toBe(5);
  });
});
