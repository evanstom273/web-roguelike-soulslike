// The player's attributes, and what each one feeds into. Levels are what the
// level-up screen will buy; everything else is derived from them here.
//
// The roster is decided. Every formula below is a placeholder: it's set so a fresh
// character (all attributes at BASE_LEVEL) matches the numbers the game used before
// attributes existed, and is there to be tuned.

export const ATTRIBUTES = {
  vigor: { name: 'Vigor', short: 'VIG', description: 'Maximum health.' },
  endurance: { name: 'Endurance', short: 'END', description: 'Maximum stamina.' },
  strength: { name: 'Strength', short: 'STR', description: 'Damage with strength weapons.' },
  dexterity: { name: 'Dexterity', short: 'DEX', description: 'Damage with dexterity weapons.' },
  intelligence: { name: 'Intelligence', short: 'INT', description: 'Extra charges for each attuned spell.' },
  arcane: { name: 'Arcane', short: 'ARC', description: 'Chance of better loot from enemies and other sources.' },
} as const

export type AttributeId = keyof typeof ATTRIBUTES
export type AttributeLevels = Record<AttributeId, number>

export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES) as AttributeId[]

export const BASE_LEVEL = 10

export const baseLevels = (): AttributeLevels =>
  Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, BASE_LEVEL])) as AttributeLevels

const above = (level: number) => Math.max(0, level - BASE_LEVEL)

export interface DerivedStats {
  maxHp: number
  maxStamina: number
  extraSpellCharges: number // added to every attuned spell's base charges
  lootLuck: number // multiplier the loot system applies to better-quality drops; 1 = baseline
}

export function deriveStats(levels: AttributeLevels): DerivedStats {
  return {
    maxHp: 100 + 12 * above(levels.vigor),
    maxStamina: 100 + 4 * above(levels.endurance),
    extraSpellCharges: Math.floor(above(levels.intelligence) / 5),
    lootLuck: 1 + 0.02 * above(levels.arcane),
  }
}

// Bonus multiplier a weapon or spell gets from one attribute, before its own scaling
// coefficient is applied. 0 at the base level.
export const attributeDamageBonus = (level: number) => above(level) * 0.025
