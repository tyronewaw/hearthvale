import { describe, expect, it } from 'vitest';
import { bump, cascade, hAt, isWater, level, rise, slopeOk, tileFlat } from './terrain';
import { emptyState } from './worldgen';
import { MAXH, N, idx, tdist, wd, wrap } from './world';

function flatWorld(h: number) {
  const S = emptyState(1);
  S.h.fill(h);
  return S;
}

describe('torus helpers', () => {
  it('wraps coordinates', () => {
    expect(wrap(-1)).toBe(N - 1);
    expect(wrap(N)).toBe(0);
    expect(wrap(N + 3.5)).toBeCloseTo(3.5);
    expect(idx(-1, -1)).toBe(N * N - 1);
  });
  it('measures the shortest way round', () => {
    expect(wd(1, N - 1)).toBe(-2);
    expect(wd(N - 1, 1)).toBe(2);
    expect(wd(0, N / 2)).toBe(N / 2);
    expect(tdist(0, 0, N - 3, N - 4)).toBeCloseTo(5);
  });
});

describe('tileFlat / isWater', () => {
  it('needs four equal non-zero corners to be flat', () => {
    const S = flatWorld(2);
    expect(tileFlat(S, 5, 5)).toBe(true);
    S.h[idx(6, 6)] = 3;
    expect(tileFlat(S, 5, 5)).toBe(false);
    expect(tileFlat(S, 4, 4)).toBe(true);
  });
  it('sea level is never flat land, and water needs all corners at 0', () => {
    const S = flatWorld(0);
    expect(tileFlat(S, 3, 3)).toBe(false);
    expect(isWater(S, 3, 3)).toBe(true);
    S.h[idx(4, 4)] = 1;
    expect(isWater(S, 3, 3)).toBe(false);
    expect(isWater(S, 4, 4)).toBe(false);
    expect(isWater(S, 5, 5)).toBe(true);
  });
  it('tiles on the seam use wrapped corners', () => {
    const S = flatWorld(0);
    S.h[idx(0, 0)] = 1;
    expect(isWater(S, N - 1, N - 1)).toBe(false);
  });
});

describe('cascade', () => {
  it('keeps neighbours within one step after a raise', () => {
    const S = flatWorld(0);
    const touched = new Set<number>();
    for (let i = 0; i < 6; i++) bump(S, 20, 20, 1, touched);
    expect(S.h[idx(20, 20)]).toBe(6);
    expect(S.h[idx(21, 21)]).toBe(5);
    expect(S.h[idx(25, 20)]).toBe(1);
    expect(S.h[idx(26, 20)]).toBe(0);
    expect(slopeOk(S)).toBe(true);
    expect(touched.size).toBeGreaterThan(0);
  });

  it('cascades across the wrap seam', () => {
    const S = flatWorld(0);
    const touched = new Set<number>();
    for (let i = 0; i < 4; i++) bump(S, 0, 0, 1, touched);
    expect(S.h[idx(N - 1, N - 1)]).toBe(3);
    expect(S.h[idx(N - 3, 0)]).toBe(1);
    expect(slopeOk(S)).toBe(true);
    // the touched tiles include ones on the far side of the seam
    expect(touched.has(idx(N - 1, N - 1))).toBe(true);
  });

  it('lowering pulls neighbours down', () => {
    const S = flatWorld(5);
    const touched = new Set<number>();
    for (let i = 0; i < 5; i++) bump(S, 10, 10, -1, touched);
    expect(S.h[idx(10, 10)]).toBe(0);
    expect(S.h[idx(11, 10)]).toBe(1);
    expect(slopeOk(S)).toBe(true);
  });

  it('repairs an arbitrary spike', () => {
    const S = flatWorld(0);
    S.h[idx(40, 40)] = 7;
    cascade(S, [idx(40, 40)], new Set(), 1);
    expect(slopeOk(S)).toBe(true);
  });
});

describe('bump limits', () => {
  it('refuses to go above MAXH or below 0', () => {
    const S = flatWorld(MAXH);
    expect(bump(S, 1, 1, 1, new Set())).toBe(false);
    const W = flatWorld(0);
    expect(bump(W, 1, 1, -1, new Set())).toBe(false);
  });
});

describe('level and rise', () => {
  it('level makes a 4×4 patch of flat tiles at the clicked height', () => {
    const S = flatWorld(0);
    const t = new Set<number>();
    for (let i = 0; i < 3; i++) bump(S, 30, 30, 1, t);
    level(S, 30, 30, t);
    for (let y = 28; y < 32; y++) for (let x = 28; x < 32; x++) expect(tileFlat(S, x, y)).toBe(true);
    expect(S.h[idx(28, 28)]).toBe(3);
    expect(slopeOk(S)).toBe(true);
  });
  it('level on the sea raises it to height 1', () => {
    const S = flatWorld(0);
    level(S, 0, 0, new Set());
    expect(S.h[idx(0, 0)]).toBe(1);
    expect(tileFlat(S, N - 1, N - 1)).toBe(true);
  });
  it('rise lifts a round patch out of the sea', () => {
    const S = flatWorld(0);
    rise(S, 50, 50, new Set());
    expect(S.h[idx(50, 50)]).toBe(1);
    expect(S.h[idx(52, 50)]).toBe(1);
    expect(S.h[idx(52, 52)]).toBe(0);
    expect(slopeOk(S)).toBe(true);
  });
});

describe('hAt', () => {
  it('matches corner heights and interpolates on the render/physics triangles', () => {
    const S = flatWorld(0);
    S.h[idx(1, 0)] = 1;
    expect(hAt(S, 0, 0)).toBe(0);
    expect(hAt(S, 1, 0)).toBe(1);
    expect(hAt(S, 0.5, 0)).toBeCloseTo(0.5);
    expect(hAt(S, 0.75, 0.25)).toBeCloseTo(0.75); // on the A-B-D triangle (split along B–D)
    expect(hAt(S, 0.75, 0.75)).toBeCloseTo(0.25); // on the B-C-D triangle: only B is raised
    expect(hAt(S, 0.25, 0.25)).toBeCloseTo(0.25);
    expect(hAt(S, N + 1, 0)).toBe(1); // wraps
  });
});

describe('slope rule fuzz', () => {
  it('stays valid after hundreds of random raise / lower / level / rise edits', async () => {
    const { generateWorld } = await import('./worldgen');
    const { Rng } = await import('./rng');
    const S = generateWorld(9), R = new Rng(123), t = new Set<number>();
    for (let i = 0; i < 600; i++) {
      // cluster edits near the seam so wrapping is exercised too
      const x = (R.int(24) - 12 + N) % N, y = (R.int(24) - 12 + N) % N, op = R.int(4);
      if (op === 0) bump(S, x, y, 1, t);
      else if (op === 1) bump(S, x, y, -1, t);
      else if (op === 2) level(S, x, y, t);
      else rise(S, x, y, t);
      if (op === 2) for (let dy = -2; dy < 2; dy++) for (let dx = -2; dx < 2; dx++) expect(tileFlat(S, x + dx, y + dy)).toBe(true);
    }
    expect(slopeOk(S)).toBe(true);
  });
});
