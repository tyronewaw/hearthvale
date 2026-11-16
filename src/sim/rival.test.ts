import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { finishAct, type PetAct } from './pet';
import { QUESTS } from './quests';
import { beliefRate, fixTribes, rivalMood, rivalShrine, stepRival } from './rival';
import { deserialize, serialize } from './save';
import { Sim } from './sim';
import { convertHome, inInfluence, influenceField, mkV, newHome, placeStruct, popCount, rivalHearth, tribePop } from './village';
import { emptyState } from './worldgen';
import { DAY, N, TICK, idx, tdist } from './world';

const run = (sim: Sim, seconds: number) => {
  for (let i = 0; i < seconds / TICK; i++) sim.tick();
};

/** A flat world with a small Red village at (60, 60) and nothing of ours yet. */
function redSim(): Sim {
  const S = emptyState(21);
  S.h.fill(2);
  S.t = DAY * 0.5;
  const sim = new Sim(S);
  placeStruct(sim, 'hearth', 10, 10, 1);
  placeStruct(sim, 'hearth', 60, 60, 1, 1);
  newHome(sim, 70, 60, 4, 1);
  sim.S.rival = { joined: 0, united: false, elder: 999, fest: 0, festIn: 9999 };
  sim.drain();
  return sim;
}

describe('the Red tribe arrives', () => {
  it('new worlds have them on a far shore, with a Hearth, homes and wanderers, all red', () => {
    const sim = Sim.newWorld(42), S = sim.S, RH = rivalHearth(S)!;
    expect(RH).toBeDefined();
    expect(tdist(RH.x, RH.y, S.start[0], S.start[1])).toBeGreaterThanOrEqual(BALANCE.rivalMinDist);
    expect(S.homes.filter((b) => b.tribe === 1).length).toBeGreaterThanOrEqual(3);
    expect(S.vills.some((v) => v.tribe === 1)).toBe(true);
    expect(tribePop(S, 1)).toBeGreaterThan(0);
    // they don't count as ours
    expect(popCount(S)).toBe(5);
  });

  it('they grow on their own, only round their own Hearth, and never move into our homes', () => {
    const sim = Sim.newWorld(42), S = sim.S;
    const red0 = tribePop(S, 1);
    run(sim, DAY * 2);
    const RH = rivalHearth(S)!;
    expect(tribePop(S, 1)).toBeGreaterThan(red0);
    for (const b of S.homes) if (b.tribe === 1) expect(tdist(b.x, b.y, RH.x, RH.y)).toBeLessThanOrEqual(BALANCE.rivalRange);
    for (const v of S.vills) if (v.home !== null) expect(S.homes.find((b) => b.id === v.home)!.tribe).toBe(v.tribe);
  });

  it('an older save meets them on load, and everything already there stays ours', () => {
    const sim = Sim.newWorld(8);
    const o = JSON.parse(serialize(sim.S));
    // strip everything Red and every tribe field, as a pre-phase-10 save would be
    o.homes = o.homes.filter((b: { tribe: number }) => b.tribe === 0);
    o.structs = o.structs.filter((s: { tribe: number }) => s.tribe === 0);
    o.vills = o.vills.filter((v: { tribe: number }) => v.tribe === 0);
    for (const l of [o.homes, o.structs, o.vills]) for (const e of l) delete e.tribe;
    delete o.rival;
    const S = deserialize(JSON.stringify(o))!;
    const loaded = new Sim(S);
    expect(S.homes.every((b) => b.tribe === 0) && S.vills.every((v) => v.tribe === 0)).toBe(true);
    expect(S.rival).toBeNull();
    loaded.ensureRival();
    expect(rivalHearth(S)).toBeDefined();
    expect(loaded.drain().some((e) => e.k === 'toast' && /Red tribe/.test(e.msg))).toBe(true);
  });

  it('fixTribes leaves current data alone', () => {
    const sim = redSim(), before = JSON.stringify(sim.S.homes);
    fixTribes(sim.S);
    expect(JSON.stringify(sim.S.homes)).toBe(before);
  });
});

describe('winning them over', () => {
  it('our homes nearby raise their belief; on their own it fades', () => {
    const sim = redSim(), S = sim.S, red = S.homes.find((b) => b.tribe === 1)!;
    expect(beliefRate(S, red)).toBeLessThan(0);
    for (const [x, y] of [[74, 60], [74, 64], [70, 64], [66, 64]] as const) newHome(sim, x, y, 2).lv = 3;
    expect(beliefRate(S, red)).toBeGreaterThan(0);
    const b0 = red.bel;
    stepRival(sim, 1);
    expect(red.bel).toBeGreaterThan(b0);
  });

  it('a Red home at 100 joins us with everyone in it', () => {
    const sim = redSim(), S = sim.S, red = S.homes.find((b) => b.tribe === 1)!;
    S.vills.push(mkV(sim, 'resident', 70.5, 61, { home: red.id, tribe: 1 }));
    newHome(sim, 74, 60, 2).lv = 3;
    const ours = popCount(S);
    red.bel = 99.99;
    stepRival(sim, 1);
    expect(red.tribe).toBe(0);
    expect(S.vills.filter((v) => v.home === red.id).every((v) => v.tribe === 0)).toBe(true);
    expect(popCount(S)).toBeGreaterThan(ours);
    expect(S.rival!.joined).toBeGreaterThanOrEqual(4);
  });

  it('blessings and a kind pet near them impress them; mischief puts them off', () => {
    const sim = redSim(), S = sim.S, red = S.homes.find((b) => b.tribe === 1)!;
    sim.sandbox = true;
    S.best = 999;
    sim.useTool('bloom', 70, 62);
    expect(red.bel).toBeCloseTo(BALANCE.impressBless);
    sim.choosePet('monkey', 'Pip', 70.5, 61.5);
    const P = S.pet!, act = (id: PetAct['id']): PetAct => ({ id, ph: 'do', tx: P.x, ty: P.y, t: 0, go: 0, tile: [70, 61] });
    finishAct(sim, act('dance'));
    expect(red.bel).toBeCloseTo(BALANCE.impressBless + BALANCE.impressPet);
    finishAct(sim, act('mischief'));
    expect(red.bel).toBeCloseTo(BALANCE.impressBless);
  });

  it('Red wanderers can only be picked up inside our land, and join us when put down there', () => {
    const sim = redSim(), S = sim.S;
    const far = mkV(sim, 'settler', 61, 61, { tribe: 1 });
    S.vills.push(far);
    expect(sim.grab(far.id)).toBe(false);
    newHome(sim, 64, 62, 2).lv = 2; // our home right by them
    expect(inInfluence(S, 61, 61)).toBe(true);
    expect(sim.grab(far.id)).toBe(true);
    sim.drop(12, 12, false); // by our Hearth
    expect(far.tribe).toBe(0);
    expect(S.rival!.joined).toBe(1);
  });

  it('when every Red home and wanderer has joined, the tribes are one people', () => {
    const sim = redSim(), S = sim.S;
    for (const b of S.homes.slice()) if (b.tribe === 1) convertHome(sim, b);
    expect(S.rival!.united).toBe(false); // checked once a second
    stepRival(sim, 1);
    expect(S.rival!.united).toBe(true);
    expect(rivalHearth(S)).toBeUndefined();
    expect(S.structs.every((s) => s.tribe === 0)).toBe(true);
    expect(QUESTS.find((q) => q.id === 'unite')!.ok(S)).toBe(true);
  });

  it('they stop growing at rivalMax', () => {
    const sim = redSim(), S = sim.S, red = S.homes.find((b) => b.tribe === 1)!;
    red.pop = 2;
    S.homes.push({ kind: 'home', id: S.uid++, x: 90, y: 90, lv: 5, pop: BALANCE.rivalMax, tb: 1, tribe: 1, bel: 0 });
    run(sim, 20);
    expect(red.pop).toBe(2);
  });
});

describe('Red tribe life', () => {
  it('they hold festivals now and then: kindness counts double, and their homes grow faster', () => {
    const sim = redSim(), S = sim.S, red = S.homes.find((b) => b.tribe === 1)!;
    S.rival!.festIn = 1;
    stepRival(sim, 1);
    expect(S.rival!.fest).toBe(BALANCE.rivalFestSeconds);
    expect(sim.drain().some((e) => e.k === 'toast' && /festival/.test(e.msg))).toBe(true);
    expect(rivalMood(S, red)).toMatch(/celebrating/);
    sim.sandbox = true;
    S.best = 999;
    sim.useTool('bloom', 70, 62);
    expect(red.bel).toBeCloseTo(BALANCE.impressBless * BALANCE.rivalFestJoy);
    // it ends, and the next one is a couple of days away
    for (let i = 0; i < BALANCE.rivalFestSeconds; i++) stepRival(sim, 1);
    expect(S.rival!.fest).toBe(0);
    expect(S.rival!.festIn).toBeGreaterThan(BALANCE.rivalFestEvery * 0.7);
  });

  it('a grown Red village builds a shrine, and homes near it are more loyal', () => {
    const sim = redSim(), S = sim.S;
    for (let i = 0; i < 6; i++) newHome(sim, 64 + (i % 3) * 3, 66 + Math.floor(i / 3) * 3, 8, 1);
    expect(rivalShrine(S)).toBeUndefined();
    stepRival(sim, 1);
    const RS = rivalShrine(S)!;
    expect(RS).toBeDefined();
    expect(RS.tribe).toBe(1);
    expect(tdist(RS.x, RS.y, 60, 60)).toBeLessThanOrEqual(6.5);
    expect(sim.drain().some((e) => e.k === 'toast' && /Shrine is built/.test(e.msg))).toBe(false);
    const near = S.homes.find((b) => b.tribe === 1 && tdist(b.x, b.y, RS.x, RS.y) < BALANCE.rivalShrineR)!;
    const before = beliefRate(S, near);
    RS.prog = 1;
    expect(beliefRate(S, near)).toBeCloseTo(before - BALANCE.belRedShrine);
  });

  it('their tooltip says what would win them over', () => {
    const sim = redSim(), S = sim.S, red = S.homes.find((b) => b.tribe === 1)!;
    expect(rivalMood(S, red)).toMatch(/hardly seen/);
    const ours = newHome(sim, 74, 60, 2);
    ours.lv = 1;
    expect(rivalMood(S, red)).toMatch(/small/);
    ours.lv = 3;
    expect(rivalMood(S, red)).toMatch(/Shrine/);
    placeStruct(sim, 'shrine', 74, 64, 1);
    expect(rivalMood(S, red)).toMatch(/Warming|Loyal/);
  });

  it('the influence field is exactly where inInfluence changes, for both tribes', () => {
    const sim = Sim.newWorld(42);
    run(sim, DAY);
    for (const t of [0, 1] as const) {
      const F = influenceField(sim.S, t);
      for (let y = 0; y < N; y += 3)
        for (let x = 0; x < N; x += 3) expect(F[idx(x, y)]! >= 0).toBe(inInfluence(sim.S, x, y, t));
    }
  });
});
