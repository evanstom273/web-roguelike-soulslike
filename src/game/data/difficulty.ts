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

/** Enemies in a normal room: one per slot it covers. None in the start or boss room. */
export const enemiesPerSlot = 1
