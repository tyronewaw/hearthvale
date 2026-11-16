/**
 * Balance probe: a scripted, reasonably diligent player on a fresh planet. Every few
 * seconds it flattens land around homes, feeds trees to the Hearth, builds farms and
 * lumber camps, and staffs them. Prints one row per in-game day.
 *   npm run balance            (DAYS=40 SEED=42 to change)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { BMAX } from '../src/sim/defs';
import { Sim } from '../src/sim/sim';
import { bump } from '../src/sim/terrain';
import { hearth, tribePop, validSite, workersAt } from '../src/sim/village';
import { DAY, TICK, idx, tdist, wrap } from '../src/sim/world';

const DAYS = Number(process.env.DAYS ?? 30), SEED = Number(process.env.SEED ?? 42);

it(`balance: ${DAYS} days, seed ${SEED}`, () => {
  const sim = Sim.newWorld(SEED), S = sim.S, R = sim.rng;
  const rows: string[] = ['day   pop homes  sett  maxLv   food   wood  faith  farms workers   red joined'];
  let next = 0;
  const flattenAround = () => {
    // Pick a home and level one stray vertex in its 5×5 to the home's height (1 faith a step).
    const ours = S.homes.filter((o) => o.tribe === 0), b = ours[R.int(Math.max(1, ours.length))];
    if (!b || S.faith < 3) return;
    const h0 = S.h[idx(b.x, b.y)]!;
    for (let tries = 0; tries < 12; tries++) {
      const vx = b.x - 2 + R.int(6), vy = b.y - 2 + R.int(6), hv = S.h[idx(vx, vy)]!;
      // a careful player doesn't dig under their own buildings (a corner of any building tile)
      const underBuilding = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => sim.bmap[idx(vx + dx!, vy + dy!)]?.kind === 'struct');
      if (hv !== h0 && !underBuilding) {
        const t = new Set<number>();
        if (bump(S, vx, vy, hv < h0 ? 1 : -1, t)) {
          S.faith -= 1;
          for (const tt of t) { S.tree[tt] = 0; S.rock[tt] = 0; }
        }
        return;
      }
    }
  };
  const settler = () => S.vills.find((v) => v.type === 'settler' && v.tribe === 0 && v.dizzy <= 0);
  const TPD = Math.round(DAY / TICK); // ticks per day (150 / 0.1 is not an exact float)
  for (let i = 0; i < DAYS * TPD; i++) {
    sim.tick();
    const t = i * TICK;
    if (t >= next) {
      next = t + 4;
      flattenAround();
      const H = hearth(S);
      if (H && S.wood < 30) {
        // fetch the nearest tree to the Hearth
        let best: [number, number] | null = null, bd = 12;
        for (let y = H.y - 10; y <= H.y + 10; y++) for (let x = H.x - 10; x <= H.x + 10; x++)
          if (S.tree[idx(x, y)] && tdist(x, y, H.x, H.y) < bd) { bd = tdist(x, y, H.x, H.y); best = [wrap(x), wrap(y)]; }
        if (best && sim.grabTree(...best)) sim.drop(H.x + 0.5, H.y + 0.5);
      }
      const farms = S.structs.filter((s) => s.k === 'farm' && s.tribe === 0), lumbers = S.structs.filter((s) => s.k === 'lumber' && s.tribe === 0);
      const want = farms.length < 1 + Math.floor(S.popNow / 60) || (S.food < 30 && farms.length < 2 + S.popNow / 25) ? 'farm' : lumbers.length < 1 + Math.floor(S.popNow / 150) ? 'lumber' : null;
      if (H && want && S.wood >= (want === 'farm' ? 10 : 6)) {
        // look outwards from the Hearth for the nearest spot with room (as a player would)
        let site: [number, number] | null = null, bd = 1e9;
        for (let y = H.y - 18; y <= H.y + 18; y++)
          for (let x = H.x - 18; x <= H.x + 18; x++) {
            const d = tdist(x, y, H.x, H.y) + R.next() * 2;
            if (d < bd && validSite(sim, want, wrap(x), wrap(y))) {
              bd = d;
              site = [wrap(x), wrap(y)];
            }
          }
        if (site) sim.build(want, ...site);
      }
      for (const s of S.structs) {
        if (s.tribe !== 0) continue; // the player only staffs our own buildings
        const cap = s.k === 'hearth' ? 2 : s.k === 'farm' ? 3 : 2;
        if (workersAt(S, s) < cap) {
          const v = settler();
          if (v && sim.grab(v.id)) sim.drop(s.x + 0.5, s.y + 0.6);
        }
      }
    }
    if ((i + 1) % TPD === 0) {
      const d = (i + 1) / TPD;
      rows.push([d, S.popNow, S.homes.filter((b) => b.tribe === 0).length, S.vills.filter((v) => v.type === 'settler' && v.tribe === 0).length, S.maxLv,
        Math.round(S.food), Math.round(S.wood), Math.round(S.faith), S.structs.filter((s) => s.k === 'farm').length,
        S.vills.filter((v) => v.type === 'worker').length, tribePop(S, 1), S.rival?.joined ?? 0].map((x, j) => String(x).padStart(j ? 6 : 3)).join(' '));
    }
  }
  const cap = S.homes.filter((b) => b.tribe === 0).reduce((n, b) => n + BMAX[b.lv]!, 0);
  rows.push(`home capacity ${cap}, best pop ${S.best}`);
  mkdirSync('shots', { recursive: true });
  writeFileSync('shots/balance.txt', rows.join('\n') + '\n');
  console.log(rows.join('\n'));
});
