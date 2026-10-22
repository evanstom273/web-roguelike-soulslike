import { baseLevels } from './attributes.ts'
import { scalingMultiplier, totalDamage } from './damage.ts'
import type { SpellDef, WeaponDef } from './types.ts'

// What the shop on the post-death screen charges for weapons and spells. Prices come from
// how strong a thing is, so anything new is priced without anyone picking a number:
// damage per hit, what its scaling is worth to a mid-game build, statuses, speed and spell
// charges. Deliberately steep: buying gear competes with levelling for the same runes.

/** A mid-game build (every attribute at 40), for judging what scaling is worth. */
const MID_GAME = Object.fromEntries(Object.keys(baseLevels()).map((k) => [k, 40])) as ReturnType<typeof baseLevels>
const round = (n: number) => Math.round(n / 100) * 100

export function weaponPrice(w: WeaponDef): number {
  if (w.catalyst) {
    // Spell power at mid-game Intelligence, and the extra charges it gives.
    const c = w.catalyst
    return round(6000 * c.power * scalingMultiplier(c.scaling, MID_GAME) * (1 + 0.05 * c.extraCharges))
  }
  const a = w.light
  const hit = totalDamage(a.damage) + totalDamage(w.heavy.damage) * 0.5
  const scaling = scalingMultiplier(a.scaling, MID_GAME)
  const statuses = 1 + 0.2 * a.statuses.length
  // Quicker weapons are worth a little more, slower ones a little less.
  const speed = Math.pow(1 / Math.max(0.2, a.windup + a.active + a.recovery + w.cooldown.light), 0.3)
  return round(15 * hit * scaling * statuses * speed)
}

export function spellPrice(s: SpellDef): number {
  const own = 'attack' in s.delivery && s.delivery.attack ? totalDamage(s.delivery.attack.damage) : 0
  const value = Math.max(totalDamage(s.cast.damage), own) + s.healthRestore * 0.8
  return Math.max(2500, round((2000 + value * 30) * (0.7 + s.charges / 25)))
}
