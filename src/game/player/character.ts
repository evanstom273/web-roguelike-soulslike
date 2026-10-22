import { baseLevels, deriveStats, type AttributeLevels, type DerivedStats } from '../data/attributes.ts'
import { getSpell, getWeapon, SPELLS, WEAPONS } from '../data/registry.ts'
import type { SpellDef, WeaponDef } from '../data/types.ts'

// Everything about the player that persists between runs or gets changed in menus:
// attribute levels (bought on the post-death screen) and equipment.
export interface Character {
  levels: AttributeLevels
  weaponIds: string[] // right-hand slots, cycled in order
  spellIds: string[] // attuned spells, cycled in order (basic spells come with catalysts)
}

export interface Loadout {
  levels: AttributeLevels
  stats: DerivedStats
  weapons: WeaponDef[]
  spells: SpellDef[]
}

/**
 * Starting equipment isn't decided yet (GDD §7). Until there's an equipment screen,
 * the player carries every weapon and every spell so all of them can be tried out.
 */
export const startingCharacter = (): Character => ({
  levels: baseLevels(),
  weaponIds: ['straight-sword', 'wand', ...[...WEAPONS.keys()].filter((id) => id !== 'straight-sword' && id !== 'wand' && id !== 'shield').sort()],
  spellIds: [...SPELLS.values()].filter((s) => !s.basic).map((s) => s.id).sort(),
})

export function resolveLoadout(c: Character): Loadout {
  const basics = [...SPELLS.values()].filter((s) => s.basic)
  return {
    levels: c.levels,
    stats: deriveStats(c.levels),
    weapons: c.weaponIds.map(getWeapon),
    spells: [...basics, ...c.spellIds.map(getSpell)],
  }
}
