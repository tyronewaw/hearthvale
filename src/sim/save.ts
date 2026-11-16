import { QUEST_VERSION } from './defs';
import { remapQuest } from './quests';
import { N, type State } from './world';
import { emptyState } from './worldgen';

/** localStorage key for the 3D game (the prototype used hearthvale-v2, which is left alone). */
export const SAVE_KEY = 'hearthvale-v3';

function b64(a: Uint8Array | Int8Array): string {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/**
 * Serialise the world. The height and flora maps go in as base64 bytes. Anything in the
 * hand is put down first: a held villager returns to where they were picked up.
 */
export function serialize(S: State): string {
  const vills = S.vills.filter((v) => v.type !== 'resident').slice();
  if (S.held?.k === 'v') vills.push({ ...S.held.v });
  // Anyone mid-air is put back where they were picked up.
  for (const f of S.flying) if (f.k === 'v') vills.push({ ...f.v, type: f.v.job !== null ? 'worker' : 'settler' });
  const { h, tree, flower, rock, held, flying, ...rest } = S;
  void held;
  void flying;
  return JSON.stringify({
    ...rest,
    vills,
    held: null,
    n: N,
    h: b64(h),
    tree: b64(tree),
    flower: b64(flower),
    rock: b64(rock),
  });
}

/** Parse a v3 save, or return null if it isn't one (or is for another map size). */
export function deserialize(json: string): State | null {
  try {
    const o = JSON.parse(json);
    if (!o || o.v !== 3 || o.n !== N) return null;
    const base = emptyState(o.seed);
    const S: State = { ...base, ...o };
    S.h = new Int8Array(unb64(o.h).buffer);
    S.tree = unb64(o.tree);
    S.flower = unb64(o.flower);
    S.rock = unb64(o.rock);
    if (S.h.length !== N * N || S.tree.length !== N * N) return null;
    S.stat = { ...base.stat, ...(o.stat ?? {}) };
    S.q = remapQuest(o.q ?? 0, o.qv ?? 1);
    S.qv = QUEST_VERSION;
    S.held = null;
    S.flying = [];
    for (const v of S.vills) {
      v.px = v.x;
      v.py = v.y;
    }
    return S;
  } catch {
    return null;
  }
}
