import { baseLevels, deriveStats, type AttributeLevels, type DerivedStats } from '../data/attributes.ts'
import { getSpell, getWeapon } from '../data/registry.ts'
import type { SpellDef, WeaponDef } from '../data/types.ts'

// Everything about the player that persists between runs or gets changed in menus:
// attribute levels (bought on the post-death screen) and equipment.
export interface Character {
  levels: AttributeLevels
  weaponId: string
  spellIds: string[] // attuned spells, in cycle order
}

export interface Loadout {
  levels: AttributeLevels
  stats: DerivedStats
  weapon: WeaponDef
  spells: SpellDef[]
}

// Starting equipment isn't decided yet (GDD §7); this is the placeholder.
export const startingCharacter = (): Character => ({
  levels: baseLevels(),
  weaponId: 'placeholder-blade',
  spellIds: [],
})

export function resolveLoadout(c: Character): Loadout {
  return {
    levels: c.levels,
    stats: deriveStats(c.levels),
    weapon: getWeapon(c.weaponId),
    spells: c.spellIds.map(getSpell),
  }
}
