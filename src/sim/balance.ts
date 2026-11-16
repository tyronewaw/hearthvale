/**
 * Tunable numbers in one place. Values marked "proto" are the 2D prototype's; values
 * marked "×N" are scaled for the 128×128 planet (four times the prototype's 64×64 area).
 */
export const BALANCE = {
  /** Seconds between tree-spread rounds (proto). */
  treeSpreadEvery: 3,
  /** Random tiles sampled per round (proto 5, ×4). */
  treeSpreadSamples: 20,
  /** Chance a sampled tree seeds a neighbour (proto). */
  treeSpreadChance: 0.4,

  /** Faith per second: base + per villager (proto). */
  faithBase: 0.15,
  faithPerPop: 0.025,
  /** Food per second: base + per home − eaten per villager (proto). */
  foodBase: 0.1,
  foodPerHome: 0.002,
  foodEatPerPop: 0.006,
  /** Food that counts as fully fed for home growth (proto). */
  foodFull: 60,
  /**
   * Growth never drops below this share when the store is empty. The prototype stopped
   * growth outright at 0 food; the cosy rule is that hunger only slows growth.
   */
  hungerFloor: 0.1,
  /** Per worker per second (proto). */
  farmerFood: 0.11,
  farmSeason: [0.8, 1.1, 1.4, 0.35],
  fisherFood: 0.13,
  priestFaith: 0.25,

  /** Home growth per second: (base + perLevel·lv) · trees · season · hunger (proto). */
  growBase: 0.01,
  growPerLevel: 0.009,
  growSeason: [1.25, 1.1, 1, 0.7],
  rainGrowth: 2.5,
  cheerGrowth: 1.5,
  festGrowth: 2,
  /** Most wandering settlers at once (proto 80, ×2: more land, but each one is drawn). */
  maxSettlers: 160,
  /** Seconds for a site to finish by itself, and per builder-second (proto). */
  selfBuild: 70,
  builderBuild: 14,
  /** Pet growth: xp for young and grand (proto). */
  petYoung: 40,
  petGrand: 160,
  /** Seconds after an action that a stroke or scold still teaches it (proto). */
  teachWindow: 20,
  /** Seconds a sheep's fertiliser doubles a farm (proto). */
  fertSeconds: 45,
  /** The pet pen: energy recovers this many times faster asleep in it, love grows per second, and waking fertilises farms within this many tiles. */
  penRest: 2,
  penLove: 0.25,
  penFertR: 6,
  /** Seconds between the pet's tricks (proto). */
  trickCooldown: 110,
  /** A pet's Build trick adds this much progress to a building site (×1.4 when grand). */
  petBuild: 0.25,
  /** Blessing durations (proto). */
  rainSeconds: 25,
  festSeconds: 40,

  /**
   * The final quest's population (proto 500, ×2). The balance probe (npm run balance) reaches
   * 500 around day 9 and 1000 around day 14 on the 128² planet with a diligent player.
   */
  goal: 1000,
} as const;
