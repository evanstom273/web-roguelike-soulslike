import { baseLevels, deriveStats, type AttributeLevels, type DerivedStats } from '../data/attributes.ts'
import { CLASSES, type ClassDef } from '../data/classes.ts'
import { getSpell, getWeapon, SPELLS, WEAPONS } from '../data/registry.ts'
import type { SpellDef, WeaponDef } from '../data/types.ts'

// Everything about the player that persists between runs or gets changed in menus:
// attribute levels and weapon upgrades (bought on the post-death screen) and equipment.
export interface Character {
  /** Whose art to draw: a class id (warrior, dex, magic). */
  appearance: string
  levels: AttributeLevels
  weaponIds: string[] // everything owned; either hand can hold any of them
  right: string
  left: string | null // null = empty-handed
  spellIds: string[] // attuned spells, cycled in order (basic spells come with catalysts)
  /** Upgrade level of each owned weapon, by id (missing = +0). */
  weaponLevels: Record<string, number>
  /** Smithing shards held, for weapon upgrades. Kept through death, unlike runes. */
  shards: number
}

export interface Loadout {
  appearance: string
  levels: AttributeLevels
  stats: DerivedStats
  weapons: WeaponDef[]
  right: WeaponDef
  left: WeaponDef | null
  spells: SpellDef[]
  weaponLevels: Record<string, number>
}

/**
 * The debug sandbox character: owns every weapon and spell so all of them can be tried
 * out, starting with a sword in the right hand and a shield in the left.
 */
export const sandboxCharacter = (appearance = 'warrior'): Character => ({
  appearance,
  levels: baseLevels(),
  weaponIds: ['straight-sword', 'wand', 'shield', ...[...WEAPONS.keys()].filter((id) => !['straight-sword', 'wand', 'shield'].includes(id)).sort()],
  right: 'straight-sword',
  left: 'shield',
  spellIds: [...SPELLS.values()].filter((s) => !s.basic).map((s) => s.id).sort(),
  weaponLevels: {},
  shards: 0,
})

/** A fresh character of the given class, wearing its starting kit. */
export const classCharacter = (c: ClassDef): Character => ({
  appearance: c.id,
  levels: { ...c.levels },
  weaponIds: [...c.weaponIds],
  right: c.right,
  left: c.left,
  spellIds: [...c.spellIds],
  weaponLevels: {},
  shards: 0,
})

export function resolveLoadout(c: Character): Loadout {
  const basics = [...SPELLS.values()].filter((s) => s.basic)
  return {
    appearance: c.appearance,
    levels: c.levels,
    stats: deriveStats(c.levels),
    weapons: c.weaponIds.map(getWeapon),
    right: getWeapon(c.right),
    left: c.left ? getWeapon(c.left) : null,
    spells: [...basics, ...c.spellIds.map(getSpell)],
    weaponLevels: c.weaponLevels,
  }
}

/**
 * Fills in fields added since a save was made. Characters made before starting spells
 * existed get their class's.
 */
export const upgradeCharacter = (c: Character, classId: string): Character => ({
  ...c,
  appearance: c.appearance ?? classId,
  weaponLevels: c.weaponLevels ?? {},
  shards: c.shards ?? 0,
  spellIds: c.spellIds.length ? c.spellIds : [...(CLASSES.find((k) => k.id === classId)?.spellIds ?? [])],
})
