import type { DamageMap, DamageTypeId } from '../data/damageTypes.ts'
import type { HitDef, StatusApplication, StatusDef, StatusEffect } from '../data/types.ts'

// Health, resistances and statuses for anything that can be hit: the player now,
// enemies later. Knows nothing about rendering or positions.

interface ActiveEffect {
  status: StatusDef
  effect: Extract<StatusEffect, { duration: number }>
  remaining: number
  sinceTick: number
}

export interface CombatantOptions {
  maxHp: number
  resistances?: DamageMap
  immune?: string[]
  getStatus: (id: string) => StatusDef
}

export class Combatant {
  maxHp: number
  hp: number
  private resistances: DamageMap
  private immune: Set<string>
  private getStatus: (id: string) => StatusDef
  /** Buildup per status id, for statuses with a meter. */
  readonly meters = new Map<string, number>()
  private active: ActiveEffect[] = []
  /** Called whenever damage lands, for numbers / flashes later. */
  onDamage: ((amount: number, source: 'hit' | 'status') => void) | null = null

  constructor(o: CombatantOptions) {
    this.maxHp = this.hp = o.maxHp
    this.resistances = o.resistances ?? {}
    this.immune = new Set(o.immune)
    this.getStatus = o.getStatus
  }

  get dead() {
    return this.hp <= 0
  }

  get speedMultiplier() {
    return this.active.reduce((m, a) => (a.effect.kind === 'slow' ? m * a.effect.multiplier : m), 1)
  }

  get damageTakenMultiplier() {
    return this.active.reduce((m, a) => (a.effect.kind === 'vulnerability' ? m * a.effect.multiplier : m), 1)
  }

  /** Status ids with something currently running on this combatant. */
  get activeStatuses(): string[] {
    return [...new Set(this.active.map((a) => a.status.id))]
  }

  takeHit(hit: HitDef): number {
    const dealt = this.takeDamage(hit.damage, 0, 'hit')
    for (const s of hit.statuses ?? []) this.applyStatus(s)
    return dealt
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount)
  }

  applyStatus(app: StatusApplication) {
    if (this.immune.has(app.status) || this.dead) return
    const status = this.getStatus(app.status)
    if (status.buildup) {
      const meter = (this.meters.get(status.id) ?? 0) + (app.buildup ?? 0)
      if (meter < status.buildup.threshold) {
        this.meters.set(status.id, meter)
        return
      }
      this.meters.set(status.id, 0) // proc
    }
    this.trigger(status)
  }

  update(dt: number) {
    // Meters drain when you stop being hit.
    for (const [id, value] of this.meters) {
      const decay = this.getStatus(id).buildup?.decayPerSecond ?? 0
      const next = Math.max(0, value - decay * dt)
      if (next === 0) this.meters.delete(id)
      else this.meters.set(id, next)
    }
    for (const a of this.active) {
      a.remaining -= dt
      if (a.effect.kind !== 'dot') continue
      a.sinceTick += dt
      while (a.sinceTick >= a.effect.interval && a.remaining > -1e-9) {
        a.sinceTick -= a.effect.interval
        this.takeDamage(a.effect.damage ?? {}, a.effect.percentMaxHp ?? 0, 'status')
      }
    }
    this.active = this.active.filter((a) => a.remaining > 1e-9)
  }

  private trigger(status: StatusDef) {
    const running = this.active.filter((a) => a.status.id === status.id)
    for (const effect of status.effects) {
      if (effect.kind === 'burst') {
        this.takeDamage(effect.damage ?? {}, effect.percentMaxHp ?? 0, 'status')
        continue
      }
      const same = running.filter((a) => a.effect === effect)
      if (same.length > 0 && status.stacking === 'ignore') continue
      if (same.length > 0 && status.stacking === 'refresh') {
        for (const a of same) a.remaining = effect.duration
        continue
      }
      if (status.stacking === 'stack' && status.maxStacks && same.length >= status.maxStacks) {
        this.active.splice(this.active.indexOf(same[0]), 1) // drop the oldest stack
      }
      this.active.push({ status, effect, remaining: effect.duration, sinceTick: 0 })
    }
  }

  private takeDamage(damage: DamageMap, percentMaxHp: number, source: 'hit' | 'status'): number {
    if (this.dead) return 0
    let total = percentMaxHp * this.maxHp
    for (const [type, amount] of Object.entries(damage) as [DamageTypeId, number][]) {
      total += amount * (this.resistances[type] ?? 1)
    }
    total *= this.damageTakenMultiplier
    if (total <= 0) return 0
    this.hp = Math.max(0, this.hp - total)
    this.onDamage?.(total, source)
    return total
  }
}
