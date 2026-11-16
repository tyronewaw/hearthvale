/**
 * Tunable numbers in one place. Values marked "proto" are the 2D prototype's; values
 * marked "×4" are scaled for the 128×128 planet (four times the prototype's 64×64 area).
 */
export const BALANCE = {
  /** Seconds between tree-spread rounds (proto). */
  treeSpreadEvery: 3,
  /** Random tiles sampled per round (proto 5, ×4). */
  treeSpreadSamples: 20,
  /** Chance a sampled tree seeds a neighbour (proto). */
  treeSpreadChance: 0.4,
  /** Faith trickle per second with no villagers (proto). */
  faithBase: 0.15,
} as const;
