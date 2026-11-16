import { describe, expect, it } from 'vitest';
import type { SimEvent } from './events';
import { convertVill, land, mkV, newHome, placeStruct } from './village';
import { Sim } from './sim';
import { emptyState } from './worldgen';
import { idx } from './world';

function flatSim(): Sim {
  const S = emptyState(5);
  S.h.fill(2);
  return new Sim(S);
}
const voices = (sim: Sim) => sim.drain().filter((e): e is Extract<SimEvent, { k: 'voice' }> => e.k === 'voice').map((e) => e.id);

describe('villagers speak at the right moments', () => {
  it('picked up, thrown down, put down gently, splashing, given a job', () => {
    const sim = flatSim(), S = sim.S;
    const v = mkV(sim, 'settler', 10, 10);
    S.vills.push(v);
    sim.drain();
    sim.grab(v.id);
    expect(voices(sim)).toContain('pickup');
    sim.drop(20, 20, true);
    expect(voices(sim)).toContain('land');
    sim.grab(v.id);
    sim.drop(20, 20, false);
    expect(voices(sim)).toContain('drop');
    for (let y = 40; y < 44; y++) for (let x = 40; x < 44; x++) S.h[idx(x, y)] = 0;
    sim.grab(v.id);
    sim.drop(41.5, 41.5, true);
    expect(voices(sim)).toContain('splash');
    placeStruct(sim, 'farm', 30, 30, 1);
    sim.grab(v.id);
    sim.drop(31, 31, false);
    expect(voices(sim)).toContain('job');
  });

  it('a new home cheers, and Red villagers have their own lines', () => {
    const sim = flatSim(), S = sim.S;
    newHome(sim, 50, 50, 1);
    expect(voices(sim)).toContain('newhome');
    const red = mkV(sim, 'settler', 60, 60, { tribe: 1 });
    S.vills.push(red);
    convertVill(sim, red);
    expect(voices(sim)).toContain('red_join');
    const red2 = mkV(sim, 'settler', 12, 12, { tribe: 1 });
    S.vills.push(red2);
    placeStruct(sim, 'hearth', 10, 10, 1); // our Hearth: red2 stands in our land
    sim.drain();
    sim.grab(red2.id);
    expect(voices(sim)).toContain('red_pickup');
    land(sim, { k: 'v', v: red2 }, 12, 12, false);
  });
});
