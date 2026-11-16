import { BALANCE } from './balance';
import { QUEST_VERSION } from './defs';
import { blueHomes, roleCount } from './village';
import type { State } from './world';

export interface Quest {
  /** Stable id: saves map their quest index through these when the chain changes. */
  id: string;
  t: string;
  x: string;
  ok: (S: State) => boolean;
  /** Faith reward. */
  r: number;
}

const has = (S: State, k: string) => S.structs.some((s) => s.k === k && s.prog >= 1);

/** The quest chain: the prototype's (population targets ×2 for the bigger planet), plus new ones. */
export const QUESTS: readonly Quest[] = [
  { id: 'pet', t: 'A companion', x: 'Choose a god pet to watch over your world.', ok: (S) => !!S.pet, r: 20 },
  { id: 'hello', t: 'Say hello', x: 'Pick the Hand and click your pet to stroke it.', ok: (S) => S.stat.strokes > 0, r: 10 },
  { id: 'drop', t: 'Lend a hand', x: 'With the Hand, pick up a villager and put them down somewhere new.', ok: (S) => S.stat.drops + S.stat.throws > 0, r: 10 },
  { id: 'throw', t: 'Wheee!', x: 'Let go of a villager while your hand is moving to throw them. They always land safely.', ok: (S) => S.stat.throws > 0, r: 10 },
  { id: 'room', t: 'Room to grow', x: 'Shape flat land until 6 homes stand.', ok: (S) => blueHomes(S) >= 6, r: 25 },
  { id: 'neighbours', t: 'Neighbours', x: 'A Red tribe lives on a far shore. Click "Red tribe" in the panel at the top left to go and look.', ok: (S) => !S.rival || !!S.hinted.metRival || S.rival.united, r: 15 },
  { id: 'builder', t: 'Many hands', x: 'Drop a villager on the Hearth to make them a builder.', ok: (S) => roleCount(S, 'builder') > 0, r: 15 },
  { id: 'farmer', t: 'Daily bread', x: 'Build a Farm, then drop a villager on it to make them a farmer.', ok: (S) => roleCount(S, 'farmer') > 0, r: 30 },
  { id: 'timber', t: 'Timber!', x: 'Drop a tree on the Hearth, or give a Lumber camp a forester.', ok: (S) => S.stat.woodIn >= 4 || roleCount(S, 'forester') > 0, r: 20 },
  { id: 'goodpet', t: 'Good pet', x: 'Stroke your pet just after it helps, plants or dances. It will do that more often.', ok: (S) => S.stat.taught > 0, r: 25 },
  { id: 'pen', t: 'Home sweet pen', x: 'Build a Pet pen. Your pet sleeps there, rests faster and fertilises farms nearby.', ok: (S) => has(S, 'pen'), r: 20 },
  { id: 'village', t: 'A real village', x: `Reach ${BALANCE.goal / 5} villagers.`, ok: (S) => S.popNow >= BALANCE.goal / 5, r: 40 },
  { id: 'welcome', t: 'A warm welcome', x: 'Win over someone from the Red tribe: build big homes near them, bless their land, or carry a wanderer into your land.', ok: (S) => !S.rival || S.rival.joined > 0 || S.rival.united, r: 30 },
  { id: 'shrine', t: 'Quiet faith', x: 'Build a Shrine and give it a priest.', ok: (S) => roleCount(S, 'priest') > 0, r: 40 },
  { id: 'tricks', t: 'Clever pet', x: 'Teach your pet 3 tricks. It learns by watching you bless the land or place buildings nearby, twice each.', ok: (S) => (S.pet?.tricks.length ?? 0) >= 3, r: 40 },
  { id: 'lodge', t: 'Great lodge', x: 'Grow a home into a great lodge: it needs a full 5×5 of flat, open land.', ok: (S) => S.maxLv >= 5, r: 60 },
  { id: 'unite', t: 'One people', x: 'Win over the whole Red tribe: every home and wanderer.', ok: (S) => !S.rival || S.rival.united, r: 80 },
  { id: 'goal', t: 'The valley sings', x: `Reach ${BALANCE.goal} villagers.`, ok: (S) => S.popNow >= BALANCE.goal, r: 0 },
];

/** Quest ids by chain version (1: the prototype's 13 quests, as the first 3D saves and v2 saves have them). */
const CHAINS: Record<number, readonly string[]> = {
  1: ['pet', 'hello', 'drop', 'throw', 'room', 'builder', 'farmer', 'timber', 'goodpet', 'village', 'shrine', 'lodge', 'goal'],
  2: ['pet', 'hello', 'drop', 'throw', 'room', 'builder', 'farmer', 'timber', 'goodpet', 'pen', 'village', 'shrine', 'tricks', 'lodge', 'goal'],
  [QUEST_VERSION]: QUESTS.map((q) => q.id),
};

/**
 * Map a quest index saved under chain version `from` to today's chain. The player resumes
 * at the same quest; new quests that sit before it are skipped, and a finished chain stays finished.
 */
export function remapQuest(q: number, from: number): number {
  const old = CHAINS[from];
  if (!old || from === QUEST_VERSION) return Math.max(0, Math.min(q | 0, QUESTS.length));
  if (q >= old.length) return QUESTS.length;
  const i = QUESTS.findIndex((Q) => Q.id === old[Math.max(0, q | 0)]);
  return i < 0 ? QUESTS.length : i;
}
