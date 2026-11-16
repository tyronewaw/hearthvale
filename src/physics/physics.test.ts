import { beforeAll, describe, expect, it } from 'vitest';
import { surfaceY } from '../render/scale';
import { mkV } from '../sim/village';
import { Sim } from '../sim/sim';
import { generateWorld } from '../sim/worldgen';
import { N, idx } from '../sim/world';
import { Physics } from './physics';

// These use the real Rapier WASM in node.
beforeAll(async () => {
  await Physics.load(generateWorld(6)); // warm up the WASM once
});

describe('Rapier terrain matches the drawn terrain', () => {
  it('heightfield surface equals surfaceY at sample points, across chunk edges and the seam', async () => {
    const S = generateWorld(6), P = await Physics.load(S);
    for (const [x, z] of [[10.5, 10.5], [16, 16], [31.25, 47.75], [127.5, 0.5], [0.3, 127.9], [64.7, 3.2]] as const) {
      expect(P.surfaceAt(x, z)!).toBeCloseTo(surfaceY(S, x % N, z % N), 2);
    }
  });

  it('rebuilds only the edited chunk after a terrain change', async () => {
    const S = generateWorld(6), P = await Physics.load(S);
    const sim = new Sim(S);
    sim.sandbox = true;
    sim.useTool('raise', 40, 40);
    for (const e of sim.drain()) if (e.k === 'terrain') P.terrainChanged(e.tiles);
    expect(P.surfaceAt(40, 40)!).toBeCloseTo(surfaceY(S, 40, 40), 2);
  });
});

describe('throws', () => {
  it('a thrown villager arcs, lands safely on the planet and is handed back', async () => {
    const S = generateWorld(6);
    S.h.fill(2);
    const P = await Physics.load(S), sim = new Sim(S);
    const v = mkV(sim, 'settler', 20, 20);
    P.launch({ k: 'v', v }, 20, 2.5, 20, 6, 4, 0, true, 1);
    let landed = null;
    for (let i = 0; i < 600 && !landed; i++) landed = P.step(1 / 60, 20, 20)[0] ?? null;
    expect(landed).not.toBeNull();
    expect(landed!.thrown).toBe(true);
    expect(landed!.x).toBeGreaterThan(22);
    expect(landed!.x).toBeLessThan(N);
    expect(P.flyers).toHaveLength(0);
  });

  it('a tree thrown into the sea splashes and floats', async () => {
    const S = generateWorld(6);
    S.h.fill(0);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) S.h[idx(x, y)] = 1;
    const P = await Physics.load(S);
    P.launch({ k: 'tree', tree: 1 }, 5, 2, 5, 8, 3, 0, true);
    let landed = null;
    for (let i = 0; i < 900 && !landed; i++) landed = P.step(1 / 60, 5, 5)[0] ?? null;
    expect(P.splashes.length).toBeGreaterThan(0);
    expect(landed).not.toBeNull();
  });

  it('works across the wrap seam', async () => {
    const S = generateWorld(6);
    S.h.fill(2);
    const P = await Physics.load(S), sim = new Sim(S);
    P.launch({ k: 'v', v: mkV(sim, 'settler', N - 1, 5) }, N - 1, 2.5, 5, 6, 3, 0, true);
    let landed = null;
    for (let i = 0; i < 600 && !landed; i++) landed = P.step(1 / 60, N - 1, 5)[0] ?? null;
    expect(landed!.x).toBeLessThan(20); // came out the other side
  });
});

