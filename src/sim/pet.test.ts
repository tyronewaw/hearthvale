import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { HABITS, alignment, mkPet, petStage, teach, watchLearn, type Habit } from './pet';
import { Sim } from './sim';
import { emptyState } from './worldgen';
import { N, TICK } from './world';

function petSim(kind: 'sheep' | 'monkey' | 'chicken' = 'sheep', x = 20, y = 20): Sim {
  const S = emptyState(9);
  S.h.fill(2);
  const sim = new Sim(S);
  sim.choosePet(kind, 'Testy', x, y);
  sim.drain();
  return sim;
}
const run = (sim: Sim, seconds: number) => {
  for (let i = 0; i < seconds / TICK; i++) sim.tick();
};

describe('teaching (stroke / scold within 20 s)', () => {
  it('a stroke straight after a habit strengthens it', () => {
    const sim = petSim(), P = sim.S.pet!;
    P.last = { id: 'dance', t: sim.S.t - 5 };
    const w0 = P.w.dance;
    expect(teach(sim, true)).toBe('dance');
    expect(P.w.dance).toBeCloseTo(w0 * (1 + 0.4 * 1.3)); // baby learns 30% faster
    expect(sim.S.stat.taught).toBe(1);
  });

  it('too late (over 20 s) teaches nothing', () => {
    const sim = petSim(), P = sim.S.pet!;
    P.last = { id: 'dance', t: sim.S.t - BALANCE.teachWindow - 1 };
    const before = { ...P.w };
    expect(teach(sim, true)).toBeNull();
    expect(P.w).toEqual(before);
  });

  it('a scold after mischief weakens it (never below 0.1), and a scold for nothing hurts its feelings', () => {
    const sim = petSim(), P = sim.S.pet!;
    for (let i = 0; i < 20; i++) {
      P.last = { id: 'mischief', t: sim.S.t };
      teach(sim, false);
    }
    expect(P.w.mischief).toBeCloseTo(0.1);
    const love = P.love;
    teach(sim, false);
    expect(P.love).toBeLessThan(love);
    expect(sim.drain().some((e) => e.k === 'toast' && /hurt/.test(e.msg))).toBe(true);
  });

  it('habits cap at 5 and the monkey learns 50% faster', () => {
    const a = petSim('sheep'), b = petSim('monkey');
    for (const sim of [a, b]) {
      sim.S.pet!.xp = BALANCE.petYoung; // not a baby
      sim.S.pet!.last = { id: 'help', t: sim.S.t };
      teach(sim, true);
    }
    expect(a.S.pet!.w.help).toBeCloseTo(1.4);
    expect(b.S.pet!.w.help).toBeCloseTo(1.6);
    for (let i = 0; i < 30; i++) {
      b.S.pet!.last = { id: 'help', t: b.S.t };
      teach(b, true);
    }
    expect(b.S.pet!.w.help).toBe(5);
  });

  it('alignment: kind when helpful habits outweigh mischief', () => {
    const P = mkPet('sheep', 'x', 0, 0);
    expect(alignment(P)).toBeCloseTo(0);
    for (const h of ['help', 'plant', 'dance'] as Habit[]) P.w[h] = 3;
    expect(alignment(P)).toBeGreaterThan(0.6);
  });
});

describe('learning tricks by watching', () => {
  it('two sightings within 10 tiles teach a trick; far away it sees nothing', () => {
    const sim = petSim('sheep', 5, 5), P = sim.S.pet!;
    watchLearn(sim, 'rain', 40, 40);
    expect(P.seen.rain).toBe(0);
    watchLearn(sim, 'rain', N - 2, 5); // 7 tiles away, across the seam
    expect(P.seen.rain).toBe(1);
    expect(P.tricks).toEqual([]);
    watchLearn(sim, 'rain', 8, 5);
    expect(P.tricks).toEqual(['rain']);
  });
});

describe('growth and needs', () => {
  it('grows from baby to young at 40 xp and to grand at 160', () => {
    const P = mkPet('chicken', 'x', 0, 0);
    expect(petStage(P)).toBe(0);
    P.xp = BALANCE.petYoung - 0.01;
    expect(petStage(P)).toBe(0);
    P.xp = BALANCE.petYoung;
    expect(petStage(P)).toBe(1);
    P.xp = BALANCE.petGrand;
    expect(petStage(P)).toBe(2);
  });

  it('gets hungry and bored over time but nothing ever drops below zero (nobody dies)', () => {
    const sim = petSim(), P = sim.S.pet!;
    const f0 = P.need.food;
    run(sim, 10);
    expect(P.need.food).toBeLessThan(f0);
    P.need.food = P.need.fun = P.need.energy = 0;
    run(sim, 30);
    for (const v of Object.values(P.need)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('habit weights only ever stay within 0.1..5', () => {
    const sim = petSim();
    run(sim, 300);
    for (const h of HABITS) {
      expect(sim.S.pet!.w[h]).toBeGreaterThanOrEqual(0.1);
      expect(sim.S.pet!.w[h]).toBeLessThanOrEqual(5);
    }
  });
});

describe('leash', () => {
  it('Follow walks to the hand, the short way round the planet', () => {
    const sim = petSim('monkey', N - 3, 30), P = sim.S.pet!;
    sim.setLeash('follow');
    sim.handGround = [2, 30];
    run(sim, 6);
    expect(P.x).toBeLessThan(5); // crossed the seam instead of walking 120 tiles back
  });

  it('Send makes it go to a spot and stay there', () => {
    const sim = petSim('chicken', 10, 10), P = sim.S.pet!;
    sim.sendPet(16, 12);
    expect(P.mode).toBe('stay');
    run(sim, 8);
    expect(Math.hypot(P.x - 16, P.y - 12)).toBeLessThan(6);
  });
});
