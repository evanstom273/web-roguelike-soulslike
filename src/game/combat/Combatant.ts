import { drainDuration, drainFraction, healthDamage, type DamageContext } from '../data/damage.ts'
import { DAMAGE_TYPE_IDS } from '../data/damageTypes.ts'
import type { AttackDef, Defence, EffectDef, StatusApplication, StatusDef, VitalsDef } from '../data/types.ts'

// Health, poise, statuses and timed effects for anything that can be hit. Ported from
// the Godot version's receive_hit / ActorStatuses / SpellEffects. Knows nothing about
// rendering or positions.

export interface HitPayload {
  attack: AttackDef
  ctx: DamageContext
  /** Damage over time: doesn't start a new protection window. */
  periodic?: boolean
  /** Exact damage, skipping the formula (max-HP burn ticks). */
  exactDamage?: number
}

export interface HitOutcome {
  accepted: boolean
  damage: number
  staggered: boolean
  killed: boolean
}

const REJECTED: HitOutcome = { accepted: false, damage: 0, staggered: false, killed: false }

interface Meter {
  status: StatusDef
  value: number
  delay: number
  cooldown: number
  threshold: number
}

interface ActiveEffect {
  def: EffectDef
  remaining: number
  tick: number
  ctx: DamageContext
}

interface Burn {
  elapsed: number
  duration: number
  clock: number
  carry: number
  scheduled: number
  total: number
}

export interface CombatantOptions {
  vitals: VitalsDef
  maxHp: number
  getStatus: (id: string) => StatusDef
  /** Extra invulnerability on top of the post-hit window, e.g. dodge i-frames. */
  isInvulnerable?: () => boolean
}

export class Combatant {
  readonly vitals: VitalsDef
  maxHp: number
  hp: number
  poise: number
  /** Seconds of post-hit protection left. */
  protection = 0
  readonly meters = new Map<string, Meter>()
  readonly effects = new Map<string, ActiveEffect>()
  private burns = new Map<string, Burn>()
  private poiseDelay = 0
  private getStatus: (id: string) => StatusDef
  private isInvulnerable: () => boolean

  onDamaged: ((amount: number, periodic: boolean) => void) | null = null
  onStagger: ((knockback: number) => void) | null = null
  onHealed: ((amount: number) => void) | null = null
  onStaminaRestored: ((amount: number) => void) | null = null

  constructor(o: CombatantOptions) {
    this.vitals = o.vitals
    this.maxHp = this.hp = o.maxHp
    this.poise = o.vitals.poise
    this.getStatus = o.getStatus
    this.isInvulnerable = o.isInvulnerable ?? (() => false)
  }

  get alive() {
    return this.hp > 0
  }

  /** Base defence plus every active effect's bonus, per type, within -100..100. */
  get defence(): Defence {
    const out: Defence = { ...this.vitals.defence }
    for (const e of this.effects.values()) {
      if (!e.def.defenceBonus) continue
      for (const t of DAMAGE_TYPE_IDS) out[t] = Math.max(-100, Math.min(100, (out[t] ?? 0) + (e.def.defenceBonus[t] ?? 0)))
    }
    return out
  }

  get movementMultiplier() {
    let m = 1
    for (const e of this.effects.values()) m *= e.def.movementMultiplier
    return Math.max(0.1, Math.min(2, m))
  }

  receive(hit: HitPayload): HitOutcome {
    if (!this.alive || this.isInvulnerable()) return REJECTED
    if (this.protection > 0 && !hit.periodic) return REJECTED
    const damage = hit.exactDamage ?? healthDamage(hit.attack, hit.ctx, this.defence)
    if (damage <= 0 && hit.attack.statuses.length === 0 && !hit.attack.maxHealthDrain) return REJECTED

    let staggered = false
    if (damage > 0) {
      this.hp = Math.max(0, this.hp - damage)
      this.onDamaged?.(damage, !!hit.periodic)
      if (!hit.periodic) this.protection = this.vitals.damageInvulnerability
      if (hit.attack.poiseDamage > 0) {
        this.poise -= hit.attack.poiseDamage
        this.poiseDelay = this.vitals.poiseRegenerationDelay
        if (this.poise <= 0) {
          this.poise = this.vitals.poise
          staggered = true
          this.onStagger?.(hit.attack.knockback)
        }
      }
    }
    if (this.alive && hit.attack.maxHealthDrain) this.applyBurn(hit.attack, hit.ctx)
    if (this.alive) for (const s of hit.attack.statuses) this.addStatus(s, hit.ctx)
    return { accepted: true, damage, staggered, killed: !this.alive }
  }

  heal(amount: number) {
    if (!this.alive || amount <= 0) return
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    if (this.hp > before) this.onHealed?.(this.hp - before)
  }

  /** Builds up a status; fires it when the meter fills. Returns false if it couldn't build. */
  addStatus(app: StatusApplication, ctx: DamageContext): boolean {
    if (app.buildup <= 0 || !this.alive) return false
    const status = this.getStatus(app.status)
    if (this.vitals.statusImmunities.includes(status.id)) return false
    const resistance = Math.max(0.1, Math.min(10, this.vitals.statusResistances[status.id] ?? 1))
    let m = this.meters.get(status.id)
    if (!m) {
      m = { status, value: 0, delay: 0, cooldown: 0, threshold: status.threshold * resistance }
      this.meters.set(status.id, m)
    }
    if (m.cooldown > 0) return false
    m.value = Math.min(m.threshold, m.value + app.buildup)
    m.delay = status.decayDelay
    if (m.value < m.threshold) return true
    m.value = 0
    m.cooldown = status.retriggerDelay
    if (status.triggeredEffect) this.applyEffect(status.triggeredEffect, ctx)
    if (status.triggeredAttack) {
      // A proc can't build itself again.
      this.receive({ attack: { ...status.triggeredAttack, statuses: [] }, ctx, periodic: true })
    }
    return true
  }

  applyEffect(def: EffectDef, ctx: DamageContext) {
    if (!this.alive) return
    if (def.cleanseTags.length > 0) {
      for (const [id, m] of this.meters) if (m.status.tags.some((t) => def.cleanseTags.includes(t))) this.meters.delete(id)
      for (const [id, e] of this.effects) {
        if (e.def.negative && e.def.tags.some((t) => def.cleanseTags.includes(t))) this.effects.delete(id)
      }
    }
    this.heal(def.healthRestore)
    if (def.staminaRestore > 0) this.onStaminaRestored?.(def.staminaRestore)
    if (def.duration > 0) {
      // Same id refreshes; keep the tick clock so refreshing doesn't skip or double a tick.
      const tick = this.effects.get(def.id)?.tick ?? 0
      this.effects.set(def.id, { def, remaining: def.duration, tick, ctx })
    }
  }

  private applyBurn(attack: AttackDef, ctx: DamageContext) {
    const d = attack.maxHealthDrain!
    const level = ctx.levels?.intelligence ?? d.startingLevel
    const duration = drainDuration(d, level)
    const prev = this.burns.get(d.id)
    const carry = prev ? prev.carry + (prev.total * prev.elapsed) / prev.duration - prev.scheduled : 0
    this.burns.set(d.id, {
      elapsed: 0,
      duration,
      clock: prev?.clock ?? 0,
      carry,
      scheduled: 0,
      total: this.maxHp * drainFraction(d, level),
    })
  }

  update(dt: number) {
    if (!this.alive) {
      this.meters.clear()
      this.effects.clear()
      this.burns.clear()
      return
    }
    this.protection = Math.max(0, this.protection - dt)

    if (this.poiseDelay > 0) this.poiseDelay -= dt
    else this.poise = Math.min(this.vitals.poise, this.poise + this.vitals.poiseRegeneration * dt)

    for (const [id, m] of this.meters) {
      m.cooldown = Math.max(0, m.cooldown - dt)
      const decayStep = Math.max(0, dt - m.delay)
      m.delay = Math.max(0, m.delay - dt)
      m.value = Math.max(0, m.value - m.status.decayPerSecond * decayStep)
      if (m.value <= 0 && m.cooldown <= 0) this.meters.delete(id)
    }

    // Burns deal their total smoothly, in whole points, every 0.05 s.
    for (const [id, b] of this.burns) {
      const step = Math.min(dt, Math.max(0, b.duration - b.elapsed))
      b.elapsed += step
      b.clock += step
      if (b.clock >= 0.05 || b.elapsed >= b.duration) {
        b.clock %= 0.05
        const scheduled = Math.round(b.carry + b.total * Math.min(1, b.elapsed / b.duration))
        const amount = Math.max(0, scheduled - b.scheduled)
        b.scheduled = scheduled
        if (amount > 0) this.receive({ attack: BURN_TICK, ctx: { levels: null }, periodic: true, exactDamage: amount })
      }
      if (b.elapsed >= b.duration || !this.alive) this.burns.delete(id)
    }

    for (const [id, e] of this.effects) {
      const step = Math.min(dt, e.remaining)
      e.remaining -= step
      e.tick += step
      while (e.tick >= e.def.interval && this.effects.has(id)) {
        e.tick -= e.def.interval
        this.heal(e.def.periodicHeal)
        if (e.def.periodicAttack) this.receive({ attack: e.def.periodicAttack, ctx: e.ctx, periodic: true })
      }
      if (e.remaining <= 0) this.effects.delete(id)
    }
  }
}

const BURN_TICK: AttackDef = {
  name: 'Burn',
  damage: {},
  scaling: null,
  statuses: [],
  maxHealthDrain: null,
  poiseDamage: 0,
  stamina: 0,
  knockback: 0,
  windup: 0,
  active: 0,
  recovery: 0,
  movementMultiplier: 1,
  uninterruptibleWhileActive: false,
  chargeThreshold: 0,
  reach: 0,
  hitRadius: 0,
  arc: 0,
  lungeSpeed: 0,
  hitStop: 0,
  cameraShake: 0,
}
