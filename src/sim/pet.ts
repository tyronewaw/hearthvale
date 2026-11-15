/**
 * The god pet, Black & White 2 style, ported from the prototype (mkPet, startAct, finishAct,
 * stepPet, teach, watchLearn). It has needs, picks its own actions weighted by habits you
 * teach it (stroke or scold within 20 s of an action), learns tricks by watching your
 * blessings, grows from baby to young to grand, and follows a leash.
 */
import { BALANCE } from './balance';
import { bloom, festival, rain } from './blessings';
import { BMAX } from './defs';
import { isWater, tileFlat } from './terrain';
import { findTile, hearth, homeById, mkV, spark, structById, type Ctx } from './village';
import { clamp, idx, nightF, tdist, wd, wrap, type Held, type State, type Vill } from './world';

export type PetKind = 'sheep' | 'monkey' | 'chicken';
export type Habit = 'help' | 'plant' | 'dance' | 'play' | 'mischief';
export type Trick = 'bloom' | 'rain' | 'fest';
export type PetActId = Habit | 'eat' | 'sleep' | 'wander' | 'follow' | 'poop' | 'trick';
export type Leash = 'free' | 'follow' | 'stay';

export const HABITS: readonly Habit[] = ['help', 'plant', 'dance', 'play', 'mischief'];
export const HNAME: Record<PetActId, string> = {
  help: 'Helping', plant: 'Planting', dance: 'Dancing', play: 'Playing', mischief: 'Mischief', eat: 'Eating',
  sleep: 'Sleeping', wander: 'Pottering about', follow: 'Following you', poop: 'Fertilising the soil', trick: 'Casting a trick',
};
export const TRICK_NAME: Record<Trick, string> = { bloom: 'Bloom', rain: 'Rain', fest: 'Festival' };
export const STAGES = ['Baby', 'Young', 'Grand'] as const;

export const PETS: Record<PetKind, { name: string; def: string; speed: number; learn: number; traits: string[] }> = {
  sheep: { name: 'Sheep', def: 'Wooly', speed: 1.1, learn: 1, traits: ['Gentle and sleepy.', 'Helps by fertilising farms so they yield double.', 'Mischief: nibbles the crops.'] },
  monkey: { name: 'Monkey', def: 'Pip', speed: 1.5, learn: 1.5, traits: ['Clever: learns 50% faster.', 'Helps by hauling trees to the Hearth for wood.', 'Mischief: throws villagers about.'] },
  chicken: { name: 'Chicken', def: 'Clucky', speed: 1.7, learn: 1, traits: ['Busy and cheerful.', 'Helps by laying golden eggs full of faith.', 'Mischief: pecks villagers out of their huts.'] },
};

export interface PetAct {
  id: PetActId;
  ph: 'go' | 'do';
  tx: number;
  ty: number;
  t: number;
  go: number;
  tile: [number, number];
  store?: boolean;
  /** Target villager / struct / home ids. */
  v?: number;
  s?: number;
  b?: number;
  step?: number;
  trick?: Trick;
}

export interface Pet {
  kind: PetKind;
  name: string;
  x: number;
  y: number;
  px: number;
  py: number;
  face: number;
  need: { food: number; energy: number; fun: number };
  love: number;
  mode: Leash;
  post: [number, number] | null;
  act: PetAct | null;
  w: Record<Habit, number>;
  /** The last habit it acted on and when (sim seconds), for teaching. */
  last: { id: Habit; t: number } | null;
  carry: number | null;
  poop: number;
  mv: boolean;
  age: number;
  xp: number;
  stage: number;
  seen: Record<Trick, number>;
  tricks: Trick[];
  trickCD: number;
}

export function mkPet(kind: PetKind, name: string, x: number, y: number): Pet {
  return {
    kind, name, x: wrap(x), y: wrap(y), px: wrap(x), py: wrap(y), face: 0, need: { food: 80, energy: 85, fun: 70 }, love: 55,
    mode: 'free', post: null, act: null, w: { help: 1, plant: 1, dance: 1, play: 1, mischief: 1 }, last: null, carry: null,
    poop: 0, mv: false, age: 0, xp: 0, stage: 0, seen: { bloom: 0, rain: 0, fest: 0 }, tricks: [], trickCD: 30,
  };
}

export const petStage = (P: Pet): number => (P.xp >= BALANCE.petGrand ? 2 : P.xp >= BALANCE.petYoung ? 1 : 0);

/** Kind (> 0.6), cheeky (< -0.4) or balanced: helpful habits against mischief. */
export function alignment(P: Pet): number {
  return (P.w.help + P.w.plant + P.w.dance) / 3 - P.w.mischief;
}

/** What the sim's pet code needs beyond village Ctx. */
export interface PetCtx extends Ctx {
  /** Where the hand points on the ground (torus), for Follow. */
  handGround: [number, number] | null;
  /** Throw a villager (monkey mischief): physics or a simple arc takes over. */
  fling(v: Vill, vx: number, vz: number): void;
}

const toast = (c: Ctx, msg: string) => c.emit({ k: 'toast', msg });
const sfx = (c: Ctx, id: string) => c.emit({ k: 'sfx', id });

/** Centre and radius the pet looks around: its post, the hand, or itself. */
function petCentre(c: PetCtx, P: Pet): [number, number, number] {
  if (P.mode === 'stay' && P.post) return [P.post[0], P.post[1], 6];
  if (P.mode === 'follow' && c.handGround) return [c.handGround[0], c.handGround[1], 6];
  return [P.x, P.y, 14];
}

function nearestV(S: State, x: number, y: number, r: number, f?: (v: Vill) => boolean): Vill | null {
  let best: Vill | null = null, bd = r;
  for (const v of S.vills) {
    if (f && !f(v)) continue;
    const d = tdist(v.x, v.y, x, y);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

/** Choose a target for an action and start walking to it (the prototype's startAct). */
export function startAct(c: PetCtx, id: PetActId): void {
  const S = c.S, P = S.pet!, R = c.rng, [cx, cy, r] = petCentre(c, P), H = hearth(S), k = P.kind;
  const land = (x: number, y: number) => !isWater(S, x, y);
  const a: PetAct = { id, ph: 'go', tx: P.x, ty: P.y, t: 2, go: 0, tile: [Math.floor(P.x), Math.floor(P.y)] };
  let tgt: [number, number] | null = null;
  if (id === 'eat') {
    if (k === 'monkey') tgt = findTile(c, cx, cy, r, (x, y) => S.tree[idx(x, y)]! > 0);
    else if (k === 'chicken') tgt = findTile(c, cx, cy, r, (x, y) => c.crops.has(idx(x, y)) || S.flower[idx(x, y)]! > 0);
    else tgt = findTile(c, cx, cy, r, (x, y) => S.flower[idx(x, y)]! > 0);
    if (!tgt && H && S.food > 10 && tdist(H.x, H.y, cx, cy) < r + 4) {
      tgt = [H.x, H.y];
      a.store = true;
    }
    if (!tgt) tgt = findTile(c, cx, cy, r, (x, y) => land(x, y) && !c.bmap[idx(x, y)]);
    a.t = 5;
  } else if (id === 'sleep') {
    tgt = nightF(S.t) > 0.5 && H && tdist(H.x, H.y, P.x, P.y) < 12 ? [wrap(H.x + 1), wrap(H.y + 1)] : [Math.floor(P.x), Math.floor(P.y)];
    a.t = 999;
  } else if (id === 'play') {
    const v = nearestV(S, cx, cy, r, (o) => o.type !== 'worker');
    if (v) {
      a.v = v.id;
      tgt = [Math.floor(v.x), Math.floor(v.y)];
    }
    a.t = 6;
  } else if (id === 'help' && P.tricks.length && petStage(P) >= 1 && P.trickCD <= 0 && R.next() < 0.6) {
    a.id = 'trick';
    a.trick = P.tricks[R.int(P.tricks.length)]!;
    a.t = 3;
    if (a.trick === 'bloom') tgt = findTile(c, cx, cy, r, (x, y) => land(x, y) && !tileFlat(S, x, y) && !S.tree[idx(x, y)]);
    else if (a.trick === 'rain') {
      const f = S.structs.find((s) => s.k === 'farm' && tdist(s.x, s.y, cx, cy) < r) ?? S.homes.find((b) => tdist(b.x, b.y, cx, cy) < r);
      if (f) tgt = [f.x, f.y];
    } else if (H) tgt = [wrap(H.x + 1), wrap(H.y + 1)];
  } else if (id === 'help') {
    if (k === 'sheep') {
      let bd = 1e9;
      for (const s of S.structs)
        if (s.k === 'farm' && s.prog >= 1) {
          const d = tdist(s.x, s.y, cx, cy);
          if (d < bd) {
            bd = d;
            tgt = [s.x, s.y];
            a.s = s.id;
          }
        }
      if (!tgt) {
        const b = S.homes.find((o) => tdist(o.x, o.y, cx, cy) < r);
        if (b) {
          tgt = [b.x, b.y];
          a.b = b.id;
        }
      }
    } else if (k === 'monkey') tgt = findTile(c, cx, cy, r, (x, y) => S.tree[idx(x, y)]! > 0);
    else if (H) tgt = [H.x, H.y];
    a.t = 3;
  } else if (id === 'plant') {
    tgt = findTile(c, cx, cy, Math.min(r, 8), (x, y) => land(x, y) && !tileFlat(S, x, y));
    a.t = 3;
  } else if (id === 'dance') {
    let bc = 0;
    for (const b of S.homes) {
      if (tdist(b.x, b.y, cx, cy) > r) continue;
      const n = S.homes.filter((o) => tdist(o.x, o.y, b.x, b.y) < 4).length;
      if (n > bc) {
        bc = n;
        tgt = [wrap(b.x + 1), wrap(b.y + 1)];
      }
    }
    a.t = 6;
  } else if (id === 'mischief') {
    if (k === 'sheep') tgt = findTile(c, cx, cy, r, (x, y) => c.crops.has(idx(x, y))) ?? findTile(c, cx, cy, r, (x, y) => S.flower[idx(x, y)]! > 0);
    else if (k === 'monkey') {
      const v = nearestV(S, cx, cy, r, (o) => o.type !== 'worker' || R.next() < 0.3);
      if (v) {
        a.v = v.id;
        tgt = [Math.floor(v.x), Math.floor(v.y)];
      }
    } else {
      const cand = S.homes.filter((b) => b.pop >= 2 && tdist(b.x, b.y, cx, cy) < r);
      const b = cand[R.int(Math.max(1, cand.length))];
      if (b) {
        a.b = b.id;
        tgt = [b.x, wrap(b.y + 1)];
      }
    }
    a.t = 2.5;
  } else if (id === 'poop') {
    tgt = [Math.floor(P.x), Math.floor(P.y)];
    a.t = 2;
  } else if (id === 'wander') {
    tgt = findTile(c, cx, cy, Math.min(r, 6), land);
    a.t = 1 + R.next() * 3;
  }
  if (!tgt) {
    if (id !== 'wander') return startAct(c, 'wander');
    tgt = [Math.floor(P.x), Math.floor(P.y)];
  }
  a.tx = wrap(tgt[0] + 0.5);
  a.ty = wrap(tgt[1] + 0.5);
  a.tile = tgt;
  P.act = a;
}

/** The action is done: apply its effect (the prototype's finishAct). Returns 'keep' to continue. */
export function finishAct(c: PetCtx, a: PetAct): 'keep' | void {
  const S = c.S, P = S.pet!, k = P.kind, n = P.need, R = c.rng, [tx, ty] = a.tile, st = petStage(P);
  let msg: string | null = null;
  const t = idx(tx, ty);
  if (a.id === 'eat') {
    n.food = Math.min(100, n.food + 60);
    if (a.store) S.food = Math.max(0, S.food - 5);
    else if (S.flower[t]) {
      S.flower[t] = 0;
      c.emit({ k: 'flora', tiles: [t] });
    }
    if (k === 'chicken' && c.crops.has(t)) S.food = Math.max(0, S.food - 1);
    if (R.next() < 0.6) P.poop = 15 + R.next() * 15;
  } else if (a.id === 'play') {
    n.fun = Math.min(100, n.fun + 45);
    S.faith += 2;
    for (const v of S.vills)
      if (tdist(v.x, v.y, P.x, P.y) < 2) {
        v.wave = 1.5;
        spark(c, v.x, v.y, 'heart', 1);
      }
  } else if (a.id === 'help') {
    if (k === 'sheep') {
      const s = structById(S, a.s ?? null), b = homeById(S, a.b ?? null);
      if (s) {
        s.fert = BALANCE.fertSeconds;
        msg = `${P.name} fertilised the farm`;
      } else if (b) {
        b.pop = Math.min(BMAX[b.lv]!, b.pop + 1);
        msg = `${P.name} cheered up a hut`;
      }
      spark(c, P.x, P.y, 'spark', 6);
    } else if (k === 'monkey' && st === 0) {
      S.wood += 1;
      S.stat.woodIn += 1;
      msg = `${P.name} brought back a stick`;
      spark(c, P.x, P.y, 'spark', 3);
    } else if (k === 'monkey') {
      if (!a.step) {
        if (!S.tree[t]) return;
        S.tree[t] = 0;
        c.emit({ k: 'flora', tiles: [t] });
        P.carry = 1;
        const d = S.structs.filter((s) => s.k === 'hearth' || s.k === 'lumber').sort((p, q) => tdist(p.x, p.y, P.x, P.y) - tdist(q.x, q.y, P.x, P.y))[0];
        if (d) {
          P.act = { ...a, step: 1, ph: 'go', tx: wrap(d.x + 0.5), ty: wrap(d.y + 1.2), tile: [d.x, d.y], t: 1.5, go: 0 };
          return 'keep';
        }
        P.carry = null;
      } else {
        P.carry = null;
        const g = st === 2 ? 6 : 4;
        S.wood += g;
        S.stat.woodIn += g;
        msg = `${P.name} fetched wood`;
        spark(c, P.x, P.y, 'spark', 6);
      }
    } else {
      const g = st === 2 ? 1.5 : st === 0 ? 0.5 : 1;
      S.faith += 12 * g;
      S.food += 4 * g;
      msg = st === 0 ? `${P.name} laid a tiny egg` : `${P.name} laid a golden egg`;
      spark(c, P.x, P.y, 'spark', 8);
    }
  } else if (a.id === 'trick' && a.trick) {
    P.trickCD = 110;
    if (a.trick === 'bloom') bloom(c, tx + 0.5, ty + 0.5, 3, true);
    else if (a.trick === 'rain') rain(c, tx, ty, 18);
    else festival(c, 20);
    msg = `${P.name} cast ${TRICK_NAME[a.trick]}!`;
    spark(c, P.x, P.y, 'spark', 10);
    sfx(c, 'magic');
    P.last = { id: 'help', t: S.t };
  } else if (a.id === 'plant') {
    bloom(c, tx + 0.5, ty + 0.5, 2, true);
    msg = `${P.name} planted a grove`;
  } else if (a.id === 'dance') {
    S.cheers.push({ x: tx, y: ty, t: 25 });
    S.faith += 3;
    msg = `${P.name} danced for the village`;
  } else if (a.id === 'mischief') {
    if (k === 'sheep') {
      if (c.crops.has(t)) {
        S.food = Math.max(0, S.food - 8);
        msg = `${P.name} nibbled the crops!`;
      } else {
        S.flower[t] = 0;
        c.emit({ k: 'flora', tiles: [t] });
        msg = `${P.name} trampled the flowers`;
      }
      n.food = Math.min(100, n.food + 25);
    } else if (k === 'monkey') {
      const v = S.vills.find((o) => o.id === a.v);
      if (v && tdist(v.x, v.y, P.x, P.y) < 2) {
        if (v.type === 'resident') {
          v.type = 'settler';
          const h = homeById(S, v.home);
          if (h) h.pop = Math.max(0, h.pop - 1);
          v.home = null;
        }
        const ang = R.next() * Math.PI * 2;
        c.fling(v, Math.cos(ang) * 5, Math.sin(ang) * 5);
        msg = `${P.name} threw a villager!`;
      }
    } else {
      const b = homeById(S, a.b ?? null);
      if (b && b.pop >= 2) {
        b.pop -= 2;
        for (let i = 0; i < 2; i++) S.vills.push(mkV(c, 'settler', b.x + 0.5, b.y + 1, { dizzy: 1.5 }));
        msg = `${P.name} pecked villagers out of a hut!`;
      }
    }
    n.fun = Math.min(100, n.fun + 30);
    spark(c, P.x, P.y, 'bang', 1);
  } else if (a.id === 'poop') S.poos.push({ x: P.x, y: P.y, t: 30 });
  P.xp += a.id === 'eat' ? 3 : 2;
  if ((HABITS as readonly string[]).includes(a.id)) P.last = { id: a.id as Habit, t: S.t };
  if (msg) toast(c, msg);
}

/** One pet step (the prototype's stepPet). */
export function stepPet(c: PetCtx, dt: number): void {
  const S = c.S, P = S.pet;
  if (!P) return;
  const R = c.rng, n = P.need, night = nightF(S.t);
  P.px = P.x;
  P.py = P.y;
  P.age += dt;
  P.xp += dt * 0.01;
  if (P.trickCD > 0) P.trickCD -= dt;
  const st = petStage(P);
  if (st !== P.stage) {
    P.stage = st;
    if (st > 0) {
      toast(c, `${P.name} has grown! Now ${STAGES[st]!.toLowerCase()}`);
      spark(c, P.x, P.y, 'spark', 14);
      sfx(c, 'magic');
    }
  }
  const a0 = P.act;
  n.food = Math.max(0, n.food - dt * 0.2);
  n.fun = Math.max(0, n.fun - dt * 0.17);
  n.energy = clamp(n.energy + dt * (a0 && a0.id === 'sleep' && a0.ph === 'do' ? 2.4 : -0.14), 0, 100);
  P.love += (50 - P.love) * dt * 0.0015;
  if (P.poop > 0 && (P.poop -= dt) <= 0 && (!a0 || a0.id === 'wander')) startAct(c, 'poop');
  const hg = c.handGround;
  if (P.mode === 'follow' && hg && (!P.act || P.act.id === 'wander' || P.act.id === 'follow') && tdist(P.x, P.y, hg[0], hg[1]) > 2.5)
    P.act = { id: 'follow', ph: 'go', tx: hg[0], ty: hg[1], t: 0.1, tile: [Math.floor(hg[0]), Math.floor(hg[1])], go: 0 };
  if (!P.act) {
    if (n.food < 30) startAct(c, 'eat');
    else if (n.energy < 22 || (night > 0.6 && n.energy < 75)) startAct(c, 'sleep');
    else if (n.fun < 25) startAct(c, 'play');
    else {
      const opts: [PetActId, number][] = HABITS.map((h) => [h, P.w[h] * (h === 'mischief' && P.love < 30 ? 1.6 : 1)]);
      opts.push(['wander', 1.4]);
      let s = opts.reduce((q, o) => q + o[1], 0) * R.next();
      for (const [h, wt] of opts) {
        s -= wt;
        if (s <= 0) {
          startAct(c, h);
          break;
        }
      }
      if (!P.act) startAct(c, 'wander');
    }
  }
  const A = P.act!;
  if (A.id === 'follow' && P.mode === 'follow' && hg) {
    A.tx = hg[0];
    A.ty = hg[1];
  }
  if ((A.id === 'play' || (A.id === 'mischief' && P.kind === 'monkey')) && A.v !== undefined && A.ph === 'go') {
    const v = S.vills.find((o) => o.id === A.v);
    if (v) {
      A.tx = v.x;
      A.ty = v.y;
    }
  }
  if (A.ph === 'go') {
    A.go += dt;
    const dx = wd(P.x, A.tx), dy = wd(P.y, A.ty), d = Math.hypot(dx, dy);
    P.mv = d > 0.1;
    if (d < 0.35 || A.go > 30) {
      if (A.id === 'follow') {
        P.act = null;
        P.mv = false;
        return;
      }
      A.ph = 'do';
      P.mv = false;
      if (A.id === 'mischief' || A.id === 'help') sfx(c, P.kind);
    } else {
      P.face = Math.atan2(dy, dx);
      const sp = PETS[P.kind].speed * [0.8, 1, 1.15][petStage(P)]! * (A.id === 'follow' ? 1.4 : 1), k = Math.min(1, (sp * dt) / d);
      const nx = P.x + dx * k, ny = P.y + dy * k;
      if (isWater(S, Math.floor(nx), Math.floor(ny)) && !isWater(S, Math.floor(P.x), Math.floor(P.y))) {
        P.act = null;
        P.mv = false;
        return;
      }
      P.x = wrap(nx);
      P.y = wrap(ny);
    }
  } else {
    A.t -= dt;
    if (A.id === 'sleep') {
      if (R.next() < dt * 0.8) spark(c, P.x, P.y, 'zzz', 1);
      if (n.energy >= 99 || (night < 0.3 && n.energy > 70)) A.t = 0;
    }
    if (A.id === 'dance' && R.next() < dt * 3) spark(c, P.x + (R.next() - 0.5), P.y + (R.next() - 0.5), 'note', 1);
    if (A.id === 'play' && R.next() < dt * 2) spark(c, P.x, P.y, 'heart', 1);
    if (A.t <= 0 && finishAct(c, A) !== 'keep') P.act = null;
  }
  // villagers wave at the pet as it passes
  for (const v of S.vills)
    if (v.type !== 'worker' && v.dizzy <= 0 && tdist(v.x, v.y, P.x, P.y) < 1.6 && R.next() < dt * 0.5) {
      v.wave = 1;
      v.face = Math.atan2(wd(v.y, P.y), wd(v.x, P.x));
    }
}

/**
 * Stroke (good) or scold (bad). Within 20 s of a habit, it strengthens or weakens that
 * habit (the prototype's teach): ×(1 + 0.4·L) or ×(1 − 0.35·L), L = species learn rate,
 * ×1.3 for babies. Returns the habit taught, if any.
 */
export function teach(c: PetCtx, good: boolean): Habit | null {
  const S = c.S, P = S.pet;
  if (!P) return null;
  const A = P.act, L = PETS[P.kind].learn;
  const recent: Habit | null = A && (HABITS as readonly string[]).includes(A.id) && A.ph === 'do'
    ? (A.id as Habit)
    : P.last && S.t - P.last.t < BALANCE.teachWindow ? P.last.id : null;
  const LB = L * (petStage(P) === 0 ? 1.3 : 1);
  if (good) {
    P.xp += 3;
    P.love = Math.min(100, P.love + 8);
    P.need.fun = Math.min(100, P.need.fun + 6);
    S.stat.strokes++;
    spark(c, P.x, P.y, 'heart', 4);
    sfx(c, 'pet');
    if (recent) {
      P.w[recent] = Math.min(5, P.w[recent] * (1 + 0.4 * LB));
      toast(c, `${P.name} will do more ${HNAME[recent].toLowerCase()}`);
      if (recent !== 'mischief') S.stat.taught++;
      P.last = null;
    }
  } else {
    P.love = Math.max(0, P.love - (recent === 'mischief' ? 2 : 7));
    spark(c, P.x, P.y, 'puff', 3);
    sfx(c, 'scold');
    if (recent) {
      P.w[recent] = Math.max(0.1, P.w[recent] * (1 - 0.35 * LB));
      toast(c, `${P.name} will do less ${HNAME[recent].toLowerCase()}`);
      P.last = null;
    } else toast(c, `${P.name} looks hurt. It wasn't doing anything wrong`);
  }
  if (P.act && P.act.id === 'sleep') P.act = null;
  return recent;
}

/** The pet watches a blessing cast within 10 tiles: two sightings teach it the trick. */
export function watchLearn(c: PetCtx, id: Trick, vx: number, vy: number): void {
  const S = c.S, P = S.pet;
  if (!P || tdist(P.x, P.y, vx, vy) > 10) return;
  const h: Habit = id === 'bloom' ? 'plant' : 'help';
  P.w[h] = Math.min(5, P.w[h] + 0.15 * PETS[P.kind].learn);
  P.xp += 2;
  P.seen[id] = (P.seen[id] ?? 0) + 1;
  const nm = TRICK_NAME[id];
  if (P.seen[id] >= 2 && !P.tricks.includes(id)) {
    P.tricks.push(id);
    P.trickCD = Math.min(P.trickCD, 20);
    toast(c, `${P.name} learned to cast ${nm}!` + (petStage(P) < 1 ? ' It can use it once it grows' : ''));
    sfx(c, 'magic');
    spark(c, P.x, P.y, 'spark', 12);
  } else if (!P.tricks.includes(id)) toast(c, `${P.name} watched you cast ${nm}. Once more and it will learn it`);
  else toast(c, `${P.name} watched you and learned`);
}

/** Feed from the store (the pet card's Feed button). */
export function feedPet(c: PetCtx): boolean {
  const S = c.S, P = S.pet;
  if (!P) return false;
  if (S.food < 8) {
    toast(c, 'Needs 8 food from the store');
    return false;
  }
  S.food -= 8;
  P.need.food = Math.min(100, P.need.food + 50);
  P.xp += 5;
  P.love = Math.min(100, P.love + 3);
  spark(c, P.x, P.y, 'heart', 3);
  sfx(c, P.kind);
  toast(c, `${P.name} gobbles a basket of food`);
  return true;
}

/** Droppings fertilise: flowers bloom, and sometimes a sapling takes. */
export function stepPoos(c: Ctx, dt: number): void {
  const S = c.S;
  for (const p of S.poos) {
    p.t -= dt;
    if (p.t <= 0) {
      bloom(c, p.x, p.y, 1.2, false);
      const x = Math.floor(p.x), y = Math.floor(p.y), t = idx(x, y);
      if (c.rng.next() < 0.5 && !c.bmap[t] && !S.rock[t] && !tileFlat(S, x, y) && !isWater(S, x, y)) {
        S.tree[t] = 1;
        c.emit({ k: 'flora', tiles: [t] });
      }
    }
  }
  S.poos = S.poos.filter((p) => p.t > 0);
}


/** Pet size by stage, for catching things dropped on it (render uses the same scales). */
export const PET_STAGE_SCALE = [0.6, 1.15, 1.75] as const;

/**
 * Something landed on the pet: a tree is a snack, a villager gently dropped is a playmate
 * (the prototype's land() pet rules). Returns true if the pet took it.
 */
export function petCatch(c: Ctx, obj: Held, x: number, y: number, thrown: boolean): boolean {
  const S = c.S, P = S.pet;
  if (!P || tdist(P.x, P.y, x, y) > 1.6 * PET_STAGE_SCALE[petStage(P)]!) return false;
  if (obj.k === 'tree') {
    P.need.food = Math.min(100, P.need.food + 40);
    P.xp += 4;
    P.love = Math.min(100, P.love + 2);
    spark(c, P.x, P.y, 'heart', 3);
    sfx(c, P.kind);
    toast(c, `${P.name} munches the tree`);
    return true;
  }
  if (obj.k === 'v' && !thrown) {
    P.need.fun = Math.min(100, P.need.fun + 25);
    P.xp += 2;
    obj.v.wave = 2;
    spark(c, P.x, P.y, 'heart', 2);
    sfx(c, P.kind);
    toast(c, `${P.name} plays with the villager`);
  }
  return false;
}
