// Level-up and weapon-upgrade costs, from the Godot version's progression curve, and the
// price of a checkpoint start.

/**
 * Runes needed to buy the next level. `level` is the character's current level
 * (starting at 1); each level is +1 attribute.
 */
export function levelCost(level: number): number {
  const earned = Math.max(0, level - 1)
  return Math.max(1, Math.round(180 + 45 * earned + 8 * earned * earned))
}

// Weapon upgrades: runes plus smithing shards, up to +10, each level adding 8% to the
// weapon's damage (or a catalyst's spells). Shards drop from enemies.
export const MAX_UPGRADE = 10
export const UPGRADE_DAMAGE = 0.08
export const SHARD_NAME = 'Smithing Shard' // placeholder name

/** Runes to take a weapon to `next` (1..10). */
export const upgradeCost = (next: number) => Math.max(1, Math.round(120 * Math.pow(1.55, Math.max(0, next - 1))))

/** Shards to take a weapon to `next`: one a level for +1 to +3, two for +4 to +6, and so on. */
export const upgradeShards = (next: number) => Math.max(1, 1 + Math.floor(Math.max(0, next - 1) / 3))

/** Damage multiplier for a weapon at an upgrade level. */
export const upgradeMultiplier = (level: number) => 1 + Math.max(0, level) * UPGRADE_DAMAGE

/**
 * Runes to start the next run at the beginning of `floor` (2 or deeper) instead of the
 * first floor. A one-off fee for that run. Placeholder pricing: not decided yet.
 */
export const checkpointCost = (floor: number) => Math.round(300 * Math.pow(1.6, Math.max(0, floor - 2)))
