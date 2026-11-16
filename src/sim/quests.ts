import { BALANCE } from './balance';
import { roleCount } from './village';
import type { State } from './world';

export interface Quest {
  t: string;
  x: string;
  ok: (S: State) => boolean;
  /** Faith reward. */
  r: number;
}

/** The quest chain from the prototype (population targets ×2 for the bigger planet). */
export const QUESTS: readonly Quest[] = [
  { t: 'A companion', x: 'Choose a god pet to watch over your world.', ok: (S) => !!S.pet, r: 20 },
  { t: 'Say hello', x: 'Pick the Hand and click your pet to stroke it.', ok: (S) => S.stat.strokes > 0, r: 10 },
  { t: 'Lend a hand', x: 'With the Hand, pick up a villager and put them down somewhere new.', ok: (S) => S.stat.drops + S.stat.throws > 0, r: 10 },
  { t: 'Wheee!', x: 'Let go of a villager while your hand is moving to throw them. They always land safely.', ok: (S) => S.stat.throws > 0, r: 10 },
  { t: 'Room to grow', x: 'Shape flat land until 6 homes stand.', ok: (S) => S.homes.length >= 6, r: 25 },
  { t: 'Many hands', x: 'Drop a villager on the Hearth to make them a builder.', ok: (S) => roleCount(S, 'builder') > 0, r: 15 },
  { t: 'Daily bread', x: 'Build a Farm, then drop a villager on it to make them a farmer.', ok: (S) => roleCount(S, 'farmer') > 0, r: 30 },
  { t: 'Timber!', x: 'Drop a tree on the Hearth, or give a Lumber camp a forester.', ok: (S) => S.stat.woodIn >= 4 || roleCount(S, 'forester') > 0, r: 20 },
  { t: 'Good pet', x: 'Stroke your pet just after it helps, plants or dances. It will do that more often.', ok: (S) => S.stat.taught > 0, r: 25 },
  { t: 'A real village', x: `Reach ${BALANCE.goal / 5} villagers.`, ok: (S) => S.popNow >= BALANCE.goal / 5, r: 40 },
  { t: 'Quiet faith', x: 'Build a Shrine and give it a priest.', ok: (S) => roleCount(S, 'priest') > 0, r: 40 },
  { t: 'Great lodge', x: 'Grow a home into a great lodge: it needs a full 5×5 of flat, open land.', ok: (S) => S.maxLv >= 5, r: 60 },
  { t: 'The valley sings', x: `Reach ${BALANCE.goal} villagers.`, ok: (S) => S.popNow >= BALANCE.goal, r: 0 },
];
