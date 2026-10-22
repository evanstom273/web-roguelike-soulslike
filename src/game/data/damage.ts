import type { AttributeLevels } from './attributes.ts'
import { DAMAGE_TYPE_IDS, type DamageMap } from './damageTypes.ts'
import type { AttackDef, Defence, MaxHealthDrainDef, Scaling, Stars } from './types.ts'

// The damage formula, ported from the Godot version:
//   power = sum over types of damage * (1 - defence% / 100)
//   power *= attribute scaling multiplier * other multipliers (catalyst power, chain falloff)
//   power += unscaled bonus (weapon imbues), after defence
//   rounded once at the end.

/** Bonus at full investment for each star tier: none, *, **, ***. */
export const STAR_BONUS: Record<Stars, number> = { 0: 0, 1: 0.4, 2: 1.0, 3: 1.8 }

/**
 * How much of a star tier's bonus a stat level unlocks, Elden Ring-style: steep to 18,
 * a soft cap at 60, a harder one at 80, and almost nothing after.
 */
const CURVE: [number, number][] = [
  [1, 0],
  [18, 0.25],
  [60, 0.75],
  [80, 0.9],
  [99, 1],
]
export function scalingCurve(level: number): number {
  if (level <= CURVE[0][0]) return 0
  for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i]
    const [x0, y0] = CURVE[i - 1]
    if (level <= x1) return y0 + ((level - x0) / (x1 - x0)) * (y1 - y0)
  }
  return 1
}

export function scalingMultiplier(scaling: Scaling | null, levels: AttributeLevels | null): number {
  if (!scaling || !levels) return 1
  let m = 1
  for (const [attr, stars] of Object.entries(scaling) as [keyof AttributeLevels, Stars][]) {
    m += STAR_BONUS[stars] * scalingCurve(levels[attr])
  }
  return m
}

export function mitigated(damage: DamageMap, defence: Defence | null): number {
  let total = 0
  for (const t of DAMAGE_TYPE_IDS) total += (damage[t] ?? 0) * (1 - (defence?.[t] ?? 0) / 100)
  return total
}

export const totalDamage = (damage: DamageMap) => DAMAGE_TYPE_IDS.reduce((t, k) => t + (damage[k] ?? 0), 0)

export interface DamageContext {
  levels: AttributeLevels | null // the attacker's
  multiplier?: number // upgrades, chain falloff
  bonus?: DamageMap | null // unscaled extra, e.g. a weapon imbue
}

export function healthDamage(attack: AttackDef, ctx: DamageContext, defence: Defence | null): number {
  let power = mitigated(attack.damage, defence) * scalingMultiplier(attack.scaling, ctx.levels) * (ctx.multiplier ?? 1)
  if (ctx.bonus) power += mitigated(ctx.bonus, defence)
  return Math.max(0, Math.round(power))
}

// Max-HP burn: total fraction and duration grow with Intelligence along a log curve.
function drainProgress(d: MaxHealthDrainDef, level: number) {
  const x = Math.min(1, Math.max(0, (level - d.startingLevel) / Math.max(1, d.levelCap - d.startingLevel)))
  return Math.log(1 + d.curvature * x) / Math.log(1 + d.curvature)
}
export const drainFraction = (d: MaxHealthDrainDef, level: number) =>
  d.startingFraction + (d.cappedFraction - d.startingFraction) * drainProgress(d, level)
export const drainDuration = (d: MaxHealthDrainDef, level: number) =>
  d.startingDuration + (d.cappedDuration - d.startingDuration) * drainProgress(d, level)
