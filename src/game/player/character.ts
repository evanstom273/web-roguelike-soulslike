import { baseLevels, deriveStats, type AttributeLevels, type DerivedStats } from '../data/attributes.ts'
import type { ClassDef } from '../data/classes.ts'
import { getSpell, getWeapon, SPELLS, WEAPONS } from '../data/registry.ts'
import type { SpellDef, WeaponDef } from '../data/types.ts'

// Everything about the player that persists between runs or gets changed in menus:
// attribute levels (bought on the post-death screen) and equipment.
export interface Character {
  levels: AttributeLevels
  weaponIds: string[] // everything owned; either hand can hold any of them
  right: string
  left: string | null // null = empty-handed
  spellIds: string[] // attuned spells, cycled in order (basic spells come with catalysts)
}

export interface Loadout {
  levels: AttributeLevels
  stats: DerivedStats
  weapons: WeaponDef[]
  right: WeaponDef
  left: WeaponDef | null
  spells: SpellDef[]
}

/**
 * The debug sandbox character: owns every weapon and spell so all of them can be tried
 * out, starting with a sword in the right hand and a shield in the left.
 */
export const sandboxCharacter = (): Character => ({
  levels: baseLevels(),
  weaponIds: ['straight-sword', 'wand', 'shield', ...[...WEAPONS.keys()].filter((id) => !['straight-sword', 'wand', 'shield'].includes(id)).sort()],
  right: 'straight-sword',
  left: 'shield',
  spellIds: [...SPELLS.values()].filter((s) => !s.basic).map((s) => s.id).sort(),
})

/** A fresh character of the given class, wearing its starting kit. */
export const classCharacter = (c: ClassDef): Character => ({
  levels: { ...c.levels },
  weaponIds: [...c.weaponIds],
  right: c.right,
  left: c.left,
  spellIds: [...c.spellIds],
})

export function resolveLoadout(c: Character): Loadout {
  const basics = [...SPELLS.values()].filter((s) => s.basic)
  return {
    levels: c.levels,
    stats: deriveStats(c.levels),
    weapons: c.weaponIds.map(getWeapon),
    right: getWeapon(c.right),
    left: c.left ? getWeapon(c.left) : null,
    spells: [...basics, ...c.spellIds.map(getSpell)],
  }
}
