import type { EnemyDef, SpellDef, WeaponDef } from './types.ts'

// Collects every definition file in data/weapons, data/spells and data/enemies.
// Adding content means adding a file; there's no list to update.

function collect<T extends { id: string }>(kind: string, modules: Record<string, { default: T }>): Map<string, T> {
  const out = new Map<string, T>()
  for (const [path, mod] of Object.entries(modules)) {
    const def = mod.default
    if (!def?.id) throw new Error(`${path}: expected a default-exported ${kind} definition with an id`)
    if (out.has(def.id)) throw new Error(`Duplicate ${kind} id "${def.id}" in ${path}`)
    out.set(def.id, def)
  }
  return out
}

export const WEAPONS = collect<WeaponDef>('weapon', import.meta.glob('./weapons/*.ts', { eager: true }))
export const SPELLS = collect<SpellDef>('spell', import.meta.glob('./spells/*.ts', { eager: true }))
export const ENEMIES = collect<EnemyDef>('enemy', import.meta.glob('./enemies/*.ts', { eager: true }))

// Cross-references can't be checked by the type system, so check them on load.
for (const enemy of ENEMIES.values()) {
  for (const entry of enemy.loot?.table ?? []) {
    const known = entry.item.kind === 'weapon' ? WEAPONS.has(entry.item.id) : SPELLS.has(entry.item.id)
    if (!known) throw new Error(`Enemy "${enemy.id}" drops unknown ${entry.item.kind} "${entry.item.id}"`)
  }
}

export function getWeapon(id: string): WeaponDef {
  const w = WEAPONS.get(id)
  if (!w) throw new Error(`Unknown weapon "${id}"`)
  return w
}

export function getSpell(id: string): SpellDef {
  const s = SPELLS.get(id)
  if (!s) throw new Error(`Unknown spell "${id}"`)
  return s
}

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.get(id)
  if (!e) throw new Error(`Unknown enemy "${id}"`)
  return e
}
