import { attributeDamageBonus, type AttributeLevels } from './attributes.ts'
import type { Scaling } from './types.ts'

// Base damage plus whatever the wielder's attributes add through the item's scaling.
export function scaledDamage(base: number, scaling: Scaling, levels: AttributeLevels): number {
  let bonus = 0
  for (const [attribute, coefficient] of Object.entries(scaling) as [keyof AttributeLevels, number][]) {
    bonus += coefficient * attributeDamageBonus(levels[attribute])
  }
  return base * (1 + bonus)
}
