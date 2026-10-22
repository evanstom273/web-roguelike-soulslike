import type { EnemyDef, HitDef, SpellDef, StatusDef, WeaponDef } from './types.ts'

// Collects every definition file in data/weapons, data/spells, data/statuses and
// data/enemies. Adding content means adding a file; there's no list to update.

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
export const ENEMIES = collect<EnemyDef>('enemy', import.meta.glob('./enemies/*.ts', { eager: true }))

// Cross-references can't be checked by the type system, so check them on load.
function checkHit(owner: string, hit: { statuses?: HitDef['statuses'] } | undefined) {
  for (const s of hit?.statuses ?? []) {
    if (!STATUSES.has(s.status)) throw new Error(`${owner} inflicts unknown status "${s.status}"`)
  }
}
for (const w of WEAPONS.values()) {
  if (w.kind === 'melee') for (const m of [w.light, w.heavy, w.charged]) checkHit(`Weapon "${w.id}"`, m)
  if (w.skill) checkHit(`Weapon "${w.id}" skill`, w.skill.move)
}
for (const s of SPELLS.values()) {
  for (const d of s.deliveries) {
    checkHit(`Spell "${s.id}"`, d.delivery === 'self' ? d : d.delivery === 'summon' ? undefined : d.hit)
    if (d.delivery === 'projectile') checkHit(`Spell "${s.id}" impact`, d.onImpact?.hit)
    if (d.delivery === 'summon' && !ENEMIES.has(d.ally)) throw new Error(`Spell "${s.id}" summons unknown enemy "${d.ally}"`)
  }
}
for (const enemy of ENEMIES.values()) {
  for (const a of enemy.attacks) checkHit(`Enemy "${enemy.id}"`, a)
  for (const id of enemy.immune ?? []) if (!STATUSES.has(id)) throw new Error(`Enemy "${enemy.id}" is immune to unknown status "${id}"`)
  for (const entry of enemy.loot?.table ?? []) {
    const known = entry.item.kind === 'weapon' ? WEAPONS.has(entry.item.id) : SPELLS.has(entry.item.id)
    if (!known) throw new Error(`Enemy "${enemy.id}" drops unknown ${entry.item.kind} "${entry.item.id}"`)
  }
}

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
export const getEnemy = getter('enemy', ENEMIES)
