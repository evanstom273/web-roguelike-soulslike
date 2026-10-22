import { PLAYER_VITALS } from './player.ts'

// The player's attributes, and what each one feeds into. Levels are what the
// level-up screen will buy; everything else is derived from them here.
//
// HP and stamina growth come from the Godot version's vitals. Spell charges and loot
// luck are this game's own and still placeholder formulas.

export const ATTRIBUTES = {
  vigor: { name: 'Vigor', short: 'VIG', description: 'Maximum health.' },
  endurance: { name: 'Endurance', short: 'END', description: 'Maximum stamina.' },
  strength: { name: 'Strength', short: 'STR', description: 'Damage with strength weapons.' },
  dexterity: { name: 'Dexterity', short: 'DEX', description: 'Damage with dexterity weapons.' },
  intelligence: { name: 'Intelligence', short: 'INT', description: 'Spell damage and extra charges for each spell.' },
  arcane: { name: 'Arcane', short: 'ARC', description: 'Chance of better loot from enemies and other sources.' },
} as const

export type AttributeId = keyof typeof ATTRIBUTES
export type AttributeLevels = Record<AttributeId, number>

export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES) as AttributeId[]

export const BASE_LEVEL = 10

export const baseLevels = (): AttributeLevels =>
  Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, BASE_LEVEL])) as AttributeLevels

export interface DerivedStats {
  maxHp: number
  maxStamina: number
  extraSpellCharges: number // added to every finite spell's charges
  lootLuck: number // multiplier the loot system applies to better-quality drops; 1 = baseline
}

export function deriveStats(levels: AttributeLevels, vitals = PLAYER_VITALS): DerivedStats {
  return {
    maxHp: Math.max(1, Math.round(vitals.health + (levels.vigor - vitals.referenceLevel) * vitals.healthPerVigor)),
    maxStamina: Math.max(1, vitals.stamina + (levels.endurance - vitals.referenceLevel) * vitals.staminaPerEndurance),
    extraSpellCharges: Math.floor(Math.max(0, levels.intelligence - BASE_LEVEL) / 5),
    lootLuck: 1 + 0.02 * Math.max(0, levels.arcane - BASE_LEVEL),
  }
}

export const meetsRequirements = (levels: AttributeLevels, req: Partial<Record<AttributeId, number>>) =>
  ATTRIBUTE_IDS.every((id) => levels[id] >= (req[id] ?? 0))
