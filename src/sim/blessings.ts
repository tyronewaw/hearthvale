/** Blessing effects (the tools and their costs arrive with the toolbar in phase 6; the pet's tricks use these now). */
import { BALANCE } from './balance';
import { isWater, tileFlat } from './terrain';
import type { Ctx } from './village';
import { idx, wrap } from './world';

/** Bloom: flowers all around and trees on the slopes (the prototype's bloom()). */
export function bloom(c: Ctx, vx: number, vy: number, r: number, plantTrees: boolean): number[] {
  const S = c.S, changed: number[] = [];
  for (let y = Math.floor(vy - r); y <= vy + r; y++)
    for (let x = Math.floor(vx - r); x <= vx + r; x++) {
      const tx = wrap(x), ty = wrap(y), t = idx(tx, ty);
      if (isWater(S, tx, ty) || Math.hypot(x + 0.5 - vx, y + 0.5 - vy) > r) continue;
      let ch = false;
      if (plantTrees && !S.tree[t] && !S.rock[t] && !c.bmap[t] && !c.crops.has(t) && !tileFlat(S, tx, ty) && c.rng.next() < 0.55) {
        S.tree[t] = 1 + c.rng.int(3);
        ch = true;
      }
      if (!c.crops.has(t) && c.rng.next() < 0.5) {
        S.flower[t] = 1 + c.rng.int(4);
        ch = true;
      }
      if (ch) changed.push(t);
    }
  if (changed.length) c.emit({ k: 'flora', tiles: changed });
  return changed;
}

/** Rain: a soft cloud that makes homes and farms beneath it grow faster, and flowers bloom. */
export function rain(c: Ctx, vx: number, vy: number, seconds: number = BALANCE.rainSeconds): void {
  c.S.rains.push({ x: wrap(vx), y: wrap(vy), t: seconds });
  bloom(c, vx, vy, 4, false);
}

/** Festival: every home grows faster for a while. */
export function festival(c: Ctx, seconds: number = BALANCE.festSeconds): void {
  c.S.fest = Math.max(c.S.fest, seconds);
}
