import type { SpellDef, StatusDef, WeaponDef } from './types.ts'

// Collects every definition file in data/weapons, data/spells and data/statuses.
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
export const STATUSES = collect<StatusDef>('status', import.meta.glob('./statuses/*.ts', { eager: true }))

// Cross-references can't be checked by the type system, so check them on load:
// every status any attack inflicts, and every catalyst's basic spell.
function checkStatuses(owner: string, value: unknown) {
  if (Array.isArray(value)) return value.forEach((v) => checkStatuses(owner, v))
  if (!value || typeof value !== 'object') return
  for (const [key, v] of Object.entries(value)) {
    if (key === 'statuses' && Array.isArray(v)) {
      for (const s of v) if (!STATUSES.has(s.status)) throw new Error(`${owner} inflicts unknown status "${s.status}"`)
    } else checkStatuses(owner, v)
  }
}
for (const w of WEAPONS.values()) {
  checkStatuses(`Weapon "${w.id}"`, w)
  const basic = w.catalyst?.basicSpell
  if (basic && !SPELLS.get(basic)?.basic) throw new Error(`Weapon "${w.id}" has unknown or non-basic basic spell "${basic}"`)
}
for (const s of SPELLS.values()) checkStatuses(`Spell "${s.id}"`, s)
for (const s of STATUSES.values()) checkStatuses(`Status "${s.id}"`, s)

function getter<T>(kind: string, map: Map<string, T>) {
  return (id: string): T => {
    const def = map.get(id)
    if (!def) throw new Error(`Unknown ${kind} "${id}"`)
    return def
  }
}

export const getWeapon = getter('weapon', WEAPONS)
export const getSpell = getter('spell', SPELLS)
export const getStatus = getter('status', STATUSES)
