import { BALANCE } from './balance';
import type { Rng } from './rng';
import { isWater, tileFlat } from './terrain';
import { N, idx, season, type State } from './world';

/** Can a tree grow on this tile? Not on water, flat land (kept for homes and fields) or rocks. */
export function treeCanGrow(S: State, x: number, y: number): boolean {
  const t = idx(x, y);
  return !S.tree[t] && !S.rock[t] && !isWater(S, x, y) && !tileFlat(S, x, y);
}

/**
 * One round of forest spread (the prototype's `tm.spread` block): sample random tiles, and
 * each tree found may seed a neighbouring slope. Nothing spreads in winter.
 * Returns the tiles that gained a tree.
 */
export function spreadTrees(S: State, R: Rng): number[] {
  if (season(S.t) === 3) return [];
  const grown: number[] = [];
  for (let i = 0; i < BALANCE.treeSpreadSamples; i++) {
    const t = R.int(N * N);
    if (!S.tree[t]) continue;
    const x = (t % N) + R.int(3) - 1, y = ((t / N) | 0) + R.int(3) - 1;
    if (treeCanGrow(S, x, y) && R.next() < BALANCE.treeSpreadChance) {
      const n = idx(x, y);
      S.tree[n] = 1 + R.int(3);
      grown.push(n);
    }
  }
  return grown;
}
