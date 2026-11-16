/**
 * Bring a save from the 2D prototype (localStorage `hearthvale-v2`, a 64×64 bounded island)
 * into the 3D game. The old island is set into a cleared stretch of sea in the middle of a
 * freshly generated 128×128 planet, offset by OFF tiles, with its homes, buildings, villagers,
 * pet and progress. The v2 save itself is left untouched, so the legacy game still has it.
 */
import { mkPet, type Pet, type PetKind } from './pet';
import { remapQuest } from './quests';
import { cascade, setVertices } from './terrain';
import { generateWorld } from './worldgen';
import { N, idx, wrap, type Home, type State, type Struct, type Vill } from './world';
import type { RoleId, StructKind } from './defs';

export const V2_KEY = 'hearthvale-v2';
const OLD_N = 64, OLD_V = 65;
/** Where the old map's (0, 0) lands on the planet. */
export const OFF = (N - OLD_N) / 2;

interface V2Vill { x: number; y: number; type: string; role: string; job: number; c: number; sk: number }
interface V2 {
  v: number; seed: number; h: number[]; tree: number[]; flower: number[];
  homes: { x: number; y: number; lv: number; pop: number }[];
  structs: { k: string; x: number; y: number; prog: number; fert: number }[];
  vills: V2Vill[];
  faith: number; food: number; wood: number; t: number; totem: [number, number] | null;
  best: number; maxLv: number; won: boolean; q: number;
  rains?: { x: number; y: number; t: number }[]; fest?: number; cheers?: { x: number; y: number; t: number }[]; poos?: { x: number; y: number; t: number }[];
  stat?: Partial<State['stat']>; hinted?: Record<string, 1>; pet?: Partial<Pet> & { kind: PetKind; name: string; x: number; y: number };
}

const KINDS: StructKind[] = ['hearth', 'farm', 'lumber', 'fish', 'shrine'];
const ROLES: RoleId[] = ['settler', 'farmer', 'forester', 'fisher', 'builder', 'priest'];

/** Convert a v2 save (JSON text). Returns null if it isn't one. */
export function migrateV2(json: string): State | null {
  let o: V2;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || o.v !== 2 || !Array.isArray(o.h) || o.h.length !== OLD_V * OLD_V) return null;
  const S = generateWorld((o.seed >>> 0) || 1);
  const at = (x: number, y: number) => idx(x + OFF, y + OFF);

  // Clear a basin of sea (with a margin) so the old island sits in open water.
  const basin: [number, number][] = [];
  for (let y = -4; y <= OLD_N + 4; y++) for (let x = -4; x <= OLD_N + 4; x++) basin.push([x + OFF, y + OFF]);
  setVertices(S, basin, 0, new Set());
  for (const [x, y] of basin) {
    const t = idx(x, y);
    S.tree[t] = S.flower[t] = S.rock[t] = 0;
  }
  // The old heights (their border was always sea), then a raise-only cascade for safety.
  const q: number[] = [];
  for (let y = 0; y < OLD_V; y++)
    for (let x = 0; x < OLD_V; x++) {
      const h = o.h[y * OLD_V + x]! | 0;
      if (h > 0) {
        S.h[at(x, y)] = h;
        q.push(at(x, y));
      }
    }
  cascade(S, q, new Set(), 1);
  for (let y = 0; y < OLD_N; y++)
    for (let x = 0; x < OLD_N; x++) {
      S.tree[at(x, y)] = o.tree?.[y * OLD_N + x] ?? 0;
      S.flower[at(x, y)] = o.flower?.[y * OLD_N + x] ?? 0;
    }

  // Entities, with fresh ids; old struct indices map to new ids.
  S.uid = 1;
  S.homes = o.homes.map((b): Home => ({ kind: 'home', id: S.uid++, x: wrap(b.x + OFF), y: wrap(b.y + OFF), lv: b.lv, pop: b.pop, tb: 1 }));
  const sid: number[] = [];
  S.structs = o.structs.filter((s) => KINDS.includes(s.k as StructKind)).map((s, i): Struct => {
    const st: Struct = { kind: 'struct', id: S.uid++, k: s.k as StructKind, x: wrap(s.x + OFF), y: wrap(s.y + OFF), prog: s.prog, fert: s.fert ?? 0 };
    sid[i] = st.id;
    return st;
  });
  S.vills = o.vills.map((v): Vill => {
    const x = wrap(v.x + OFF), y = wrap(v.y + OFF), job = v.job >= 0 ? sid[v.job] ?? null : null;
    const role = ROLES.includes(v.role as RoleId) ? (v.role as RoleId) : 'settler';
    return {
      id: S.uid++, type: job !== null ? 'worker' : 'settler', role: job !== null ? role : 'settler', job, home: null,
      x, y, px: x, py: y, tx: x, ty: y, think: 0, blocked: 0, c: v.c | 0, sk: v.sk | 0, face: 0, st: '', t: 0, dizzy: 0,
      wave: 0, mv: false, spot: null, spotT: 0, carry: 0, goal: null, chop: null, plant: null,
    };
  });
  const H = S.structs.find((s) => s.k === 'hearth');
  S.start = H ? [H.x, H.y] : [OFF + OLD_N / 2, OFF + OLD_N / 2];

  // Progress and resources.
  Object.assign(S, {
    faith: o.faith ?? 40, food: o.food ?? 40, wood: o.wood ?? 24, t: o.t ?? S.t, best: o.best ?? 0, maxLv: o.maxLv ?? -1,
    won: !!o.won, q: remapQuest(o.q ?? 0, 1), fest: o.fest ?? 0, hinted: o.hinted ?? {},
  });
  S.stat = { ...S.stat, ...(o.stat ?? {}) };
  S.totem = o.totem ? [wrap(o.totem[0] + OFF), wrap(o.totem[1] + OFF)] : null;
  const shift = (l?: { x: number; y: number; t: number }[]) => (l ?? []).map((r) => ({ x: wrap(r.x + OFF), y: wrap(r.y + OFF), t: r.t }));
  S.rains = shift(o.rains);
  S.cheers = shift(o.cheers);
  S.poos = shift(o.poos);

  // The pet keeps its habits, tricks and growth.
  if (o.pet && ['sheep', 'monkey', 'chicken'].includes(o.pet.kind)) {
    const p = o.pet, P = mkPet(p.kind, p.name, p.x + OFF, p.y + OFF);
    for (const k of ['need', 'love', 'mode', 'w', 'xp', 'stage', 'seen', 'tricks', 'trickCD', 'age', 'poop'] as const)
      if (p[k] !== undefined) (P as unknown as Record<string, unknown>)[k] = structuredClone(p[k]);
    P.post = p.post ? [wrap(p.post[0] + OFF), wrap(p.post[1] + OFF)] : null;
    P.last = p.last ?? null;
    S.pet = P;
  }
  return S;
}
