import { attributeDamageBonus, type AttributeLevels } from './attributes.ts'
import type { DamageMap, DamageTypeId } from './damageTypes.ts'
import type { HitDef, Scaling } from './types.ts'

/** Attribute bonus multiplier for an item's scaling: 1 = no bonus. */
export function scalingMultiplier(scaling: Scaling, levels: AttributeLevels): number {
  let bonus = 0
  for (const [attribute, coefficient] of Object.entries(scaling) as [keyof AttributeLevels, number][]) {
    bonus += coefficient * attributeDamageBonus(levels[attribute])
  }
  return 1 + bonus
}

export function scaleDamage(damage: DamageMap, multiplier: number): DamageMap {
  const out: DamageMap = {}
  for (const [type, amount] of Object.entries(damage) as [DamageTypeId, number][]) out[type] = amount * multiplier
  return out
}

/** A hit with the wielder's attribute bonuses baked in, ready to land. */
export const resolveHit = (hit: HitDef, multiplier: number): HitDef => ({
  damage: scaleDamage(hit.damage, multiplier),
  statuses: hit.statuses,
})

export const totalDamage = (damage: DamageMap) => Object.values(damage).reduce((t, n) => t + (n ?? 0), 0)
