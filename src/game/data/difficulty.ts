// How regular enemies get tougher: with each floor down and with time spent on the run
// (Risk of Rain-style), and how their rune drops grow with run time. Bosses are exempt.
// All of these are placeholder numbers: the formulas aren't decided yet.

export interface Threat {
  health: number // multiplier on enemy max health
  damage: number // multiplier on enemy damage
  runes: number // multiplier on runes dropped
}

/** `runTime` in seconds since the run began (it carries on across floors). */
export function threat(floor: number, runTime: number): Threat {
  const depth = Math.max(0, floor - 1)
  const minutes = Math.max(0, runTime) / 60
  return {
    health: (1 + 0.2 * depth) * (1 + 0.06 * minutes),
    damage: (1 + 0.12 * depth) * (1 + 0.04 * minutes),
    runes: (1 + 0.2 * depth) * (1 + 0.05 * minutes),
  }
}

/**
 * How many enemies a normal room gets, by its size in slots (1 for the smallest rooms, 7
 * for the big flower rooms): a random count in a range that grows with the room. None
 * spawn in the start or boss room.
 */
export function enemyCount(slots: number, roll: number): number {
  const [min, max] = slots >= 4 ? [5, 6] : slots === 3 ? [3, 4] : slots === 2 ? [2, 3] : [1, 2]
  return min + Math.floor(roll * (max - min + 1))
}
