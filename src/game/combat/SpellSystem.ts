import type * as Phaser from 'phaser'
import type { AttributeLevels } from '../data/attributes.ts'
import type { DamageMap } from '../data/damageTypes.ts'
import type { AttackDef, SpellDef, SpellDelivery, StatusDef, SummonDef } from '../data/types.ts'
import { paletteFor, rand, Vfx, type Palette } from '../vfx/Vfx.ts'
import type { Vec } from '../world/floorGeometry.ts'
import { Combatant } from './Combatant.ts'
import { segmentDistance, type CombatWorld, type Target } from './CombatWorld.ts'

// Runs spell deliveries: a port of the Godot version's spell_delivery_runtime. Each
// live delivery updates, hits through the CombatWorld, and draws itself through Vfx.

export interface Caster {
  self: Target
  levels: AttributeLevels
  /** Current aim, radians. */
  aim(): number
  /** Still holding the cast for a channelled spell (beam, tether, held cone). */
  channelHeld(): boolean
  /** Moves the caster for dash spells; returns how far it actually got. */
  dashMove(dx: number, dy: number): number
  setDashInvulnerable(on: boolean): void
  imbue(bonus: DamageMap, duration: number, colour: string): void
}

export interface CastContext {
  caster: Caster
  spell: SpellDef
  attack: AttackDef // payload when the delivery has no attack of its own
  origin: Vec
  direction: number // radians
  point: Vec // placement point
  target: Target | null
  depth: number // 0 = cast by the player, >0 = launched by another delivery
  multiplier: number
}

const rad = (deg: number) => (deg * Math.PI) / 180
const rotateToward = (from: number, to: number, maxStep: number) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + Math.max(-maxStep, Math.min(maxStep, diff))
}
const dirOf = (a: number) => ({ x: Math.cos(a), y: Math.sin(a) })

const CHANNELLED = (d: SpellDelivery) => d.delivery === 'beam' || d.delivery === 'tether' || (d.delivery === 'cone' && d.held)

export class SpellSystem {
  private live: Delivery[] = []
  readonly vfx: Vfx
  private world: CombatWorld
  /** Summoned allies, updated alongside deliveries. */
  private allies: Ally[] = []
  readonly getStatus: (id: string) => StatusDef

  constructor(scene: Phaser.Scene, world: CombatWorld, getStatus: (id: string) => StatusDef) {
    this.world = world
    this.getStatus = getStatus
    this.vfx = new Vfx(scene)
  }

  launch(def: SpellDelivery, ctx: CastContext): Delivery | null {
    if (ctx.depth === 0) {
      // Each spell has a cap on live copies; casting again replaces the oldest.
      const siblings = this.live.filter((l) => l.ctx.spell === ctx.spell && l.ctx.depth === 0 && !l.cancelled)
      while (siblings.length >= def.maxInstances) siblings.shift()!.cancel()
    }
    const d = new Delivery(def, ctx, this)
    if (ctx.depth === 0 && def.delivery !== 'self' && def.delivery !== 'weapon-imbue' && def.delivery !== 'dash') {
      this.vfx.castFlare(ctx.origin.x, ctx.origin.y, ctx.direction, d.pal)
    }
    if (!d.cancelled) this.live.push(d)
    return d
  }

  /** The player pressed cast again with a commanded orbit up: start firing it. */
  command(spell: SpellDef): boolean {
    const orbit = this.live.find((l) => l.ctx.spell === spell && l.def.delivery === 'orbiting' && !l.cancelled)
    if (!orbit || orbit.commanded) return false
    orbit.command()
    return true
  }

  isChannelling(caster: Caster) {
    return this.live.some((l) => l.ctx.caster === caster && l.ctx.depth === 0 && !l.cancelled && CHANNELLED(l.def))
  }

  isDashing(caster: Caster) {
    return this.live.some((l) => l.ctx.caster === caster && !l.cancelled && l.def.delivery === 'dash')
  }

  /** Movement multiplier imposed by an active channel. */
  channelMovement(caster: Caster): number | null {
    const l = this.live.find((x) => x.ctx.caster === caster && !x.cancelled && CHANNELLED(x.def))
    if (!l) return null
    const d = l.def
    return d.delivery === 'beam' || d.delivery === 'cone' || d.delivery === 'tether' ? d.movementMultiplier : 1
  }

  cancelChannels(caster: Caster) {
    for (const l of this.live) if (l.ctx.caster === caster && CHANNELLED(l.def)) l.cancel()
  }

  spawnAlly(summon: SummonDef, ctx: CastContext, at: Vec, lifetime: number): Ally {
    const ally = new Ally(summon, ctx, at, lifetime, this)
    this.allies.push(ally)
    return ally
  }

  update(dt: number) {
    for (const l of [...this.live]) l.update(dt)
    this.live = this.live.filter((l) => !l.cancelled)
    for (const a of this.allies) a.update(dt)
    this.allies = this.allies.filter((a) => !a.gone)
    this.vfx.begin(dt)
    for (const l of this.live) l.draw(this.vfx, dt)
    for (const a of this.allies) a.draw(this.vfx, dt)
    this.vfx.end(dt)
  }

  get combat() {
    return this.world
  }
}

/** Hits `actor` with the delivery's payload and effects, like SpellDeliveryService.hit. */
function deliverHit(sys: SpellSystem, def: SpellDelivery, ctx: CastContext, target: Target, multiplier = 1) {
  const world = sys.combat
  const attack = def.attack ?? ctx.attack
  const recurring = ['beam', 'cone', 'ground-zone', 'aura', 'tether'].includes(def.delivery) || ctx.depth > 0
  let accepted = true
  if (def.targetFilter === 'hostile') {
    accepted = world.hit(target, { attack, ctx: { levels: ctx.caster.levels, multiplier: ctx.multiplier * multiplier } }, recurring).accepted
  }
  if (accepted) for (const e of def.effects) target.actor.applyEffect(e, { levels: ctx.caster.levels })
  return accepted
}

class Delivery {
  readonly def: SpellDelivery
  readonly ctx: CastContext
  private sys: SpellSystem
  cancelled = false
  commanded = false
  private elapsed = 0
  private clock = 0
  private travelled = 0
  private hits = new Set<Target>()
  private remaining = 0
  private brokenTime = 0
  private points: Vec[] = []
  private pos: Vec
  private beamEnd: Vec
  private allies: Ally[] = []
  private drainApplied = false
  readonly pal: Palette
  private trail: Vec[] = []
  private emitClock = 0

  constructor(def: SpellDelivery, ctx: CastContext, sys: SpellSystem) {
    this.def = def
    this.ctx = ctx
    this.sys = sys
    this.pos = { ...ctx.origin }
    this.beamEnd = { ...ctx.origin }
    this.pal = paletteFor(ctx.spell.colour, (def.attack ?? ctx.attack).damage)
    const world = sys.combat
    const self = ctx.caster.self

    switch (def.delivery) {
      case 'area':
        if (!def.atCaster) this.pos = { ...ctx.point }
        this.area(def.radius, def.wallOcclusion)
        this.flash(def.radius)
        this.cancel()
        break
      case 'self':
        deliverHit(sys, def, ctx, self)
        sys.vfx.uplift(self.x, self.y, self.radius + 16, this.pal)
        this.cancel()
        break
      case 'target':
        if (ctx.target?.actor.alive && (!def.requireLineOfSight || world.visible(this.pos, ctx.target))) {
          deliverHit(sys, def, ctx, ctx.target)
          this.flashAt({ x: ctx.target.x, y: ctx.target.y }, 34)
        }
        this.cancel()
        break
      case 'weapon-imbue':
        ctx.caster.imbue(def.bonusDamage, def.duration, def.weaponColour)
        sys.vfx.uplift(self.x, self.y, self.radius + 10, this.pal)
        this.cancel()
        break
      case 'ground-zone':
      case 'trap':
      case 'barrage':
      case 'summon':
        this.pos = { ...ctx.point }
        break
      case 'orbiting':
        this.remaining = def.count
        break
      case 'chain':
        this.remaining = def.targetCount
        break
      case 'dash':
        if (def.invulnerable) ctx.caster.setDashInvulnerable(true)
        break
    }
    if (def.delivery === 'trap') {
      this.remaining = def.triggerCount
      this.clock = def.rearmInterval
    }
    if (def.delivery === 'barrage') {
      for (let i = 0; i < def.count; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * def.scatterRadius
        const sample = { x: ctx.point.x + Math.cos(a) * r, y: ctx.point.y + Math.sin(a) * r }
        const placed = world.wallEnd(self, sample, 25)
        this.points.push(world.clear(placed, 22) ? placed : { ...ctx.point })
      }
    }
    if (def.delivery === 'summon') {
      for (let i = 0; i < def.count; i++) {
        const a = (i * Math.PI * 2) / def.count
        const spawn = { x: this.pos.x + Math.cos(a) * 22, y: this.pos.y + Math.sin(a) * 22 }
        this.allies.push(sys.spawnAlly(def.summon, ctx, world.clear(spawn, 22) ? spawn : this.pos, def.duration))
      }
    }
  }

  cancel() {
    if (this.cancelled) return
    this.cancelled = true
    if (this.def.delivery === 'dash') this.ctx.caster.setDashInvulnerable(false)
    for (const a of this.allies) a.dismiss()
  }

  command() {
    if (this.def.delivery === 'orbiting' && !this.commanded) {
      this.commanded = true
      this.clock = this.def.fireInterval // don't fire a full volley at once
    }
  }

  update(dt: number) {
    if (this.cancelled) return
    const { def, ctx } = this
    const caster = ctx.caster
    const world = this.sys.combat
    if (!caster.self.actor.alive) return this.cancel()

    const step = Math.min(dt, Math.max(0, def.duration - this.elapsed))
    this.elapsed += step
    this.clock += step

    if (CHANNELLED(def) && ctx.depth === 0) {
      if (!caster.channelHeld()) return this.cancel()
      if (def.delivery !== 'tether') {
        const turn = def.delivery === 'beam' || def.delivery === 'cone' ? def.turnRate : 0
        ctx.direction = rotateToward(ctx.direction, caster.aim(), rad(turn) * step)
      }
    }
    const self = caster.self
    const dir = dirOf(ctx.direction)

    switch (def.delivery) {
      case 'projectile': {
        if (def.homing && ctx.target?.actor.alive) {
          ctx.direction = rotateToward(ctx.direction, Math.atan2(ctx.target.y - this.pos.y, ctx.target.x - this.pos.x), rad(def.turnRate) * step)
        }
        this.travel(def.speed * step, def.radius, false)
        break
      }
      case 'wave': {
        ctx.direction += rad(def.curvature) * step
        this.travel(Math.min(def.speed * step, def.distance - this.travelled), def.thickness, true)
        if (this.travelled >= def.distance) this.cancel()
        break
      }
      case 'beam': {
        this.pos = { x: self.x, y: self.y }
        this.beamEnd = world.wallEnd(this.pos, { x: self.x + dir.x * def.length, y: self.y + dir.y * def.length })
        while (this.clock >= def.tickInterval) {
          this.clock -= def.tickInterval
          const victims = world
            .find(def.targetFilter, self, this.pos, def.length)
            .sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))
          for (const t of victims) {
            if (segmentDistance(t, this.pos, this.beamEnd) <= def.width / 2 + t.radius) {
              deliverHit(this.sys, def, ctx, t)
              if (!def.piercing) break
            }
          }
        }
        break
      }
      case 'cone': {
        this.pos = { x: self.x, y: self.y }
        while (!this.cancelled && (!def.held || this.clock >= def.tickInterval)) {
          if (def.held) this.clock -= def.tickInterval
          for (const t of world.find(def.targetFilter, self, this.pos, def.radius)) {
            const ox = t.x - this.pos.x
            const oy = t.y - this.pos.y
            const len = Math.hypot(ox, oy) || 1
            if (len <= def.radius + t.radius && (dir.x * ox + dir.y * oy) / len >= Math.cos(rad(def.angle / 2)) && world.visible(this.pos, t)) {
              deliverHit(this.sys, def, ctx, t)
            }
          }
          if (!def.held) {
            this.spray(70, 1)
            this.cancel()
          }
        }
        break
      }
      case 'ground-zone':
      case 'aura': {
        if (def.delivery === 'aura') this.pos = { x: self.x, y: self.y }
        const delay = def.delivery === 'ground-zone' ? def.initialDelay : 0
        while (this.clock >= def.tickInterval) {
          this.clock -= def.tickInterval
          if (this.elapsed >= delay) this.area(def.radius, true)
        }
        break
      }
      case 'chain': {
        while (!this.cancelled && this.clock >= def.jumpDelay) {
          this.clock -= def.jumpDelay
          const target = ctx.target
          if (!target?.actor.alive) {
            this.cancel()
            break
          }
          if (def.requireLineOfSight && !world.visible(this.pos, target)) {
            this.cancel()
            break
          }
          deliverHit(this.sys, def, ctx, target, Math.pow(def.damageFalloff, def.targetCount - this.remaining))
          this.hits.add(target)
          this.points.push({ ...this.pos }, { x: target.x, y: target.y })
          this.sys.vfx.bolt(this.pos, target, this.pal, 0.32, 1.2)
          this.sys.vfx.impact(target.x, target.y, 22, this.pal)
          this.pos = { x: target.x, y: target.y }
          this.remaining--
          ctx.target = world.nearestHostile(self, this.pos, def.jumpRadius, def.requireLineOfSight, this.hits)
          if (this.remaining <= 0 || !ctx.target) this.cancel()
        }
        break
      }
      case 'orbiting': {
        this.pos = { x: self.x, y: self.y }
        if (def.automatic || this.commanded) {
          while (this.clock >= def.fireInterval && this.remaining > 0) {
            const target = world.nearestHostile(self, this.pos, def.castRange)
            if (target || !def.automatic) {
              this.clock -= def.fireInterval
              const a = this.elapsed * rad(def.orbitSpeed) + (this.remaining * Math.PI * 2) / def.count
              const origin = { x: this.pos.x + Math.cos(a) * def.orbitRadius, y: this.pos.y + Math.sin(a) * def.orbitRadius }
              this.child(def.child, origin, target)
              this.remaining--
            } else {
              this.clock = Math.min(this.clock, def.fireInterval)
              break
            }
          }
          if (this.remaining <= 0) this.cancel()
        }
        break
      }
      case 'trap': {
        if (this.elapsed >= def.armingDelay && this.clock >= def.rearmInterval) {
          const target = world.nearestHostile(self, this.pos, def.triggerRadius)
          if (target) {
            this.child(def.child, this.pos, target)
            this.remaining--
            this.clock = 0
            if (this.remaining <= 0) this.cancel()
          }
        }
        break
      }
      case 'barrage': {
        while (this.remaining < this.points.length && this.elapsed >= def.telegraphDuration + this.remaining * def.impactInterval) {
          this.pos = this.points[this.remaining]
          this.area(def.impactRadius, true)
          this.flash(def.impactRadius)
          this.remaining++
        }
        if (this.remaining >= this.points.length) this.cancel()
        break
      }
      case 'dash': {
        const start = { x: self.x, y: self.y }
        this.points.push(start)
        if (def.steering > 0) ctx.direction = rotateToward(ctx.direction, caster.aim(), rad(def.steering) * step)
        const d2 = dirOf(ctx.direction)
        const requested = (def.distance * step) / def.duration
        const moved = caster.dashMove(d2.x * requested, d2.y * requested)
        this.pos = { x: self.x, y: self.y }
        if (def.invulnerable) {
          const f = this.elapsed / def.duration
          caster.setDashInvulnerable(f >= def.invulnerabilityStart && f <= def.invulnerabilityEnd)
        }
        for (const t of world.find('hostile', self, start, requested + def.hitWidth)) {
          if (!this.hits.has(t) && segmentDistance(t, start, this.pos) <= def.hitWidth / 2 + t.radius) {
            this.hits.add(t)
            deliverHit(this.sys, def, ctx, t)
          }
        }
        if (moved + 0.1 < requested) this.cancel() // ran into a wall
        break
      }
      case 'tether': {
        this.pos = { x: self.x, y: self.y }
        const target = ctx.target
        if (!target?.actor.alive || Math.hypot(target.x - self.x, target.y - self.y) > def.breakRange) return this.cancel()
        this.beamEnd = { x: target.x, y: target.y }
        this.brokenTime = world.visible(this.pos, this.beamEnd) ? 0 : this.brokenTime + step
        if (this.brokenTime > def.lineOfSightGrace) return this.cancel()
        while (this.clock >= def.tickInterval) {
          this.clock -= def.tickInterval
          const payload = def.attack ?? ctx.attack
          if (payload.maxHealthDrain) {
            // Burn tethers latch the burn once rather than re-applying it every tick.
            if (!this.drainApplied && this.brokenTime === 0) this.drainApplied = deliverHit(this.sys, def, ctx, target)
          } else if (this.brokenTime === 0) deliverHit(this.sys, def, ctx, target)
        }
        break
      }
    }

    if (this.elapsed >= def.duration && !this.cancelled) {
      if (def.delivery === 'tether' && !(def.attack ?? ctx.attack).maxHealthDrain && this.brokenTime === 0 && ctx.target?.actor.alive) {
        // Holding a tether to the end lands its finisher.
        const finisher: SpellDelivery = { ...def, delivery: 'self', attack: def.completionAttack, effects: def.completionEffects }
        deliverHit(this.sys, finisher, { ...ctx, attack: def.completionAttack ?? ctx.attack }, ctx.target)
        this.flashAt({ x: ctx.target.x, y: ctx.target.y }, 40)
      }
      this.cancel()
    }
  }

  private area(radius: number, occlusion: boolean) {
    const world = this.sys.combat
    for (const t of world.find(this.def.targetFilter, this.ctx.caster.self, this.pos, radius)) {
      if (Math.hypot(t.x - this.pos.x, t.y - this.pos.y) <= radius && (!occlusion || world.visible(this.pos, t))) {
        deliverHit(this.sys, this.def, this.ctx, t)
      }
    }
  }

  private child(def: SpellDelivery, origin: Vec, target: Target | null) {
    const direction = target?.actor.alive ? Math.atan2(target.y - origin.y, target.x - origin.x) : this.ctx.direction
    this.sys.launch(def, { ...this.ctx, origin: { ...origin }, point: { ...origin }, target, direction, depth: this.ctx.depth + 1 })
  }

  private travel(distance: number, radius: number, wave: boolean) {
    const world = this.sys.combat
    const self = this.ctx.caster.self
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)))
    const dir = dirOf(this.ctx.direction)
    for (let i = 0; i < steps; i++) {
      const start = { ...this.pos }
      const end = { x: start.x + (dir.x * distance) / steps, y: start.y + (dir.y * distance) / steps }
      const wall = world.wallEnd(start, end)
      this.pos = wall
      this.travelled += Math.hypot(wall.x - start.x, wall.y - start.y)
      const halfWidth = wave && this.def.delivery === 'wave' ? this.def.width / 2 : 0
      for (const t of world.find(this.def.targetFilter, self, start, Math.hypot(wall.x - start.x, wall.y - start.y) + (wave ? halfWidth : radius))) {
        let near = segmentDistance(t, start, wall) <= radius + t.radius
        if (wave) {
          const ox = t.x - wall.x
          const oy = t.y - wall.y
          near = Math.abs(ox * dir.x + oy * dir.y) <= radius + t.radius && Math.abs(-ox * dir.y + oy * dir.x) <= halfWidth
        }
        if (near && !this.hits.has(t) && world.visible(wall, t)) {
          this.hits.add(t)
          deliverHit(this.sys, this.def, this.ctx, t)
          this.flashAt({ x: t.x, y: t.y }, Math.max(22, radius * 1.6))
          if (!wave && this.def.delivery === 'projectile' && this.hits.size > this.def.pierce) return this.cancel()
        }
      }
      if (Math.hypot(wall.x - end.x, wall.y - end.y) > 0.1) {
        this.flashAt(wall, Math.max(18, radius * 1.3))
        return this.cancel()
      }
    }
    if (this.def.delivery === 'projectile' && this.elapsed >= this.def.duration) this.flashAt(this.pos, Math.max(14, radius))
  }

  // Brief impact flashes, drawn by the system for a moment after this delivery ends.
  private flash(radius: number) {
    this.flashAt(this.pos, radius)
  }
  private flashAt(at: Vec, radius: number) {
    this.sys.vfx.impact(at.x, at.y, radius, this.pal)
  }

  /** Flame or spark spray filling the cone; `count` particles at `intensity`. */
  private spray(count: number, intensity: number) {
    const def = this.def
    if (def.delivery !== 'cone') return
    const v = this.sys.vfx
    const half = rad(def.angle / 2)
    const fire = this.pal.element === 'fire'
    for (let i = 0; i < count; i++) {
      const a = this.ctx.direction + rand(-half, half) * rand(0.3, 0.95)
      const life = rand(0.32, 0.5)
      const speed = (def.radius / life) * rand(0.75, 1.05)
      const start = rand(10, 26)
      v.emit({
        x: this.pos.x + Math.cos(a) * start,
        y: this.pos.y + Math.sin(a) * start,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life,
        size: fire ? rand(3, 6) : rand(2, 4),
        endSize: fire ? rand(12, 20) : 1,
        colour: this.pal.core,
        endColour: fire ? this.pal.deep : this.pal.main,
        alpha: (fire ? 0.55 : 0.8) * intensity,
        drag: 0.6,
        kind: fire || i % 3 ? 'dot' : 'streak',
      })
      if (fire && i % 6 === 0) v.ember(this.pos.x + Math.cos(a) * def.radius * rand(0.3, 0.9), this.pos.y + Math.sin(a) * def.radius * rand(0.3, 0.9), this.pal)
    }
  }

  /** Particles to emit this frame for a steady `perSecond` rate. */
  private rate(perSecond: number, dt: number) {
    this.emitClock += perSecond * dt
    const n = Math.floor(this.emitClock)
    this.emitClock -= n
    return n
  }

  draw(v: Vfx, dt: number) {
    const { def, pal } = this
    const air = v.air
    const ground = v.ground
    const dir = dirOf(this.ctx.direction)
    const t = v.time
    // Fade in quickly and out over the last moments of anything that lingers.
    const fade = Math.max(0, Math.min(1, this.elapsed / 0.15, (def.duration - this.elapsed) / 0.3))

    switch (def.delivery) {
      case 'projectile': {
        const r = def.radius
        this.trail.unshift({ ...this.pos })
        if (this.trail.length > 12) this.trail.pop()
        for (let i = 0; i + 1 < this.trail.length; i++) {
          const k = 1 - i / this.trail.length
          air.lineStyle(r * 2.4 * k, pal.main, 0.16 * k)
          air.lineBetween(this.trail[i].x, this.trail[i].y, this.trail[i + 1].x, this.trail[i + 1].y)
          air.lineStyle(r * 0.9 * k, pal.core, 0.45 * k)
          air.lineBetween(this.trail[i].x, this.trail[i].y, this.trail[i + 1].x, this.trail[i + 1].y)
        }
        v.orb(air, this.pos.x, this.pos.y, r, pal)
        const back = { x: -dir.x, y: -dir.y }
        switch (pal.element) {
          case 'fire':
            for (let i = this.rate(70, dt); i > 0; i--) {
              v.emit({ x: this.pos.x + rand(-r, r) * 0.5, y: this.pos.y + rand(-r, r) * 0.5, vx: back.x * 60 + rand(-30, 30), vy: back.y * 60 + rand(-30, 30), life: rand(0.25, 0.45), size: r * 0.7, endSize: r * 1.4, colour: pal.core, endColour: pal.deep, alpha: 0.5, drag: 2 })
              if (Math.random() < 0.3) v.ember(this.pos.x, this.pos.y, pal, 0.7)
            }
            break
          case 'magic':
            v.shard(air, this.pos.x, this.pos.y, this.ctx.direction, r * 3.2, r * 1.3, pal)
            for (let i = this.rate(40, dt); i > 0; i--) {
              v.emit({ x: this.pos.x, y: this.pos.y, vx: back.x * 40 + rand(-45, 45), vy: back.y * 40 + rand(-45, 45), life: rand(0.3, 0.55), size: rand(1.2, 2.2), endSize: 0.4, colour: pal.core, endColour: pal.main, drag: 2, kind: 'shard' })
            }
            break
          case 'lightning':
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * Math.PI * 2
              v.glowLine(air, v.jagged(this.pos, { x: this.pos.x + Math.cos(a) * r * 2.6, y: this.pos.y + Math.sin(a) * r * 2.6 }, 3, r * 0.8), 2, pal, 0.8)
            }
            break
          case 'holy':
          case 'restore':
            for (let i = 0; i < 4; i++) {
              const a = t * 3 + (i * Math.PI) / 2
              air.lineStyle(2, pal.core, 0.5)
              air.lineBetween(this.pos.x, this.pos.y, this.pos.x + Math.cos(a) * r * 2.8, this.pos.y + Math.sin(a) * r * 2.8)
            }
            for (let i = this.rate(25, dt); i > 0; i--) {
              v.emit({ x: this.pos.x, y: this.pos.y, vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.4, 0.7), size: 2, endSize: 0.3, colour: pal.core, endColour: pal.main })
            }
            break
        }
        break
      }

      case 'beam':
      case 'tether': {
        const a = this.pos
        const b = this.beamEnd
        const beam = def.delivery === 'beam'
        const width = beam ? def.width : 9
        const broken = !beam && this.brokenTime > 0
        const alpha = fade * (broken ? 0.35 + 0.25 * Math.sin(t * 40) : 1)
        if (pal.element === 'lightning') {
          v.glowLine(air, v.jagged(a, b, Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 20)), width * 0.9), width * 0.8, pal, alpha)
        } else if (beam) {
          v.glowLine(air, [a, b], width, pal, alpha)
          for (let s = 0; s < 2; s++) {
            const pts = v.wavy(a, b, width * 0.45, 70, t * 18 + s * Math.PI)
            air.lineStyle(2, pal.core, 0.45 * alpha)
            air.beginPath()
            air.moveTo(pts[0].x, pts[0].y)
            for (const p of pts) air.lineTo(p.x, p.y)
            air.strokePath()
          }
        } else {
          // Tether: two strands twisting round each other, with motes drawn back to the caster.
          for (let s = 0; s < 2; s++) v.glowLine(air, v.wavy(a, b, 7, 60, t * 9 + s * Math.PI), 4, pal, alpha * 0.8)
          for (let i = 0; i < 4; i++) {
            const k = (t * 0.9 + i / 4) % 1
            v.orb(air, b.x + (a.x - b.x) * k, b.y + (a.y - b.y) * k, 3.5, pal, alpha)
          }
          v.runeCircle(ground, b.x, b.y, 34, pal, alpha * 0.8, t * 2)
        }
        v.orb(air, a.x, a.y, width * 0.55, pal, alpha)
        v.orb(air, b.x, b.y, width * (beam ? 0.75 : 0.5), pal, alpha)
        if (beam) {
          const back = Math.atan2(a.y - b.y, a.x - b.x)
          for (let i = this.rate(70, dt); i > 0; i--) v.burst(b.x, b.y, pal, 1, 260, back, 2.2)
          for (let i = this.rate(30, dt); i > 0; i--) {
            const k = Math.random()
            v.emit({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, vx: dir.x * 120 + rand(-30, 30), vy: dir.y * 120 + rand(-30, 30), life: 0.3, size: 2, endSize: 0.4, colour: pal.core, endColour: pal.main })
          }
          if (pal.element === 'fire') for (let i = this.rate(20, dt); i > 0; i--) v.ember(b.x, b.y, pal)
        }
        break
      }

      case 'wave': {
        const a = this.ctx.direction
        const r = def.width / 2
        const cx = this.pos.x - dir.x * r
        const cy = this.pos.y - dir.y * r
        const arc = (radius: number, w: number, colour: number, alpha: number) => {
          air.lineStyle(w, colour, alpha)
          air.beginPath()
          air.arc(cx, cy, radius, a - Math.PI / 2 + 0.15, a + Math.PI / 2 - 0.15)
          air.strokePath()
        }
        const th = def.thickness
        arc(r - th * 0.9, th * 1.6, pal.deep, 0.1)
        arc(r - th * 0.4, th * 1.4, pal.main, 0.22)
        arc(r, th * 0.8, pal.main, 0.55)
        arc(r + th * 0.15, Math.max(2, th * 0.25), pal.core, 0.95)
        for (let i = this.rate(140, dt); i > 0; i--) {
          const ang = a + rand(-Math.PI / 2, Math.PI / 2) * 0.9
          const px = cx + Math.cos(ang) * r
          const py = cy + Math.sin(ang) * r
          v.emit({ x: px, y: py, vx: dir.x * def.speed * 0.3 + Math.cos(ang) * 40, vy: dir.y * def.speed * 0.3 + Math.sin(ang) * 40, life: rand(0.2, 0.4), size: rand(1.5, 3), endSize: 0.4, colour: pal.core, endColour: pal.main, drag: 3, kind: pal.element === 'magic' ? 'shard' : 'streak' })
        }
        break
      }

      case 'cone': {
        if (!def.held) break
        const half = rad(def.angle / 2)
        ground.fillStyle(pal.main, 0.05 * fade)
        ground.slice(this.pos.x, this.pos.y, def.radius, this.ctx.direction - half, this.ctx.direction + half, false)
        ground.fillPath()
        this.spray(this.rate(170, dt), fade)
        v.orb(air, this.pos.x + dir.x * 22, this.pos.y + dir.y * 22, 8, pal, fade)
        break
      }

      case 'ground-zone':
      case 'aura': {
        const r = def.radius
        const { x, y } = this.pos
        const delay = def.delivery === 'ground-zone' ? def.initialDelay : 0
        if (this.elapsed < delay) {
          // Telegraph: a ring closing in on the edge.
          const k = this.elapsed / Math.max(0.01, delay)
          ground.fillStyle(pal.main, 0.04 + 0.06 * k)
          ground.fillCircle(x, y, r)
          ground.lineStyle(2, pal.main, 0.3 + 0.5 * k)
          ground.strokeCircle(x, y, r * (1.4 - 0.4 * k))
          break
        }
        ground.fillStyle(pal.deep, 0.1 * fade)
        ground.fillCircle(x, y, r)
        ground.fillStyle(pal.main, 0.06 * fade)
        ground.fillCircle(x, y, r * 0.72)
        ground.fillStyle(pal.main, 0.06 * fade)
        ground.fillCircle(x, y, r * 0.4)
        v.runeCircle(ground, x, y, r, pal, fade, t * (def.delivery === 'aura' ? 0.9 : 0.5))
        const n = this.rate(Math.min(140, (r * r) / 250), dt)
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          const d = Math.sqrt(Math.random()) * r * 0.95
          const px = x + Math.cos(a) * d
          const py = y + Math.sin(a) * d
          switch (pal.element) {
            case 'fire':
              v.emit({ x: px, y: py, vx: rand(-10, 10), vy: rand(-50, -20), life: rand(0.4, 0.7), size: rand(5, 9), endSize: 1.5, colour: pal.core, endColour: pal.deep, alpha: 0.45 * fade, drag: 0.5, ground: true })
              if (i % 3 === 0) v.ember(px, py, pal)
              break
            case 'lightning':
              if (i % 4 === 0) v.bolt({ x: px, y: py }, { x: px + rand(-40, 40), y: py + rand(-40, 40) }, pal, 0.12, 0.5)
              break
            default:
              v.emit({ x: px, y: py, vx: rand(-8, 8), vy: rand(-45, -15), life: rand(0.6, 1.1), size: rand(1.5, 2.8), endSize: 0.3, colour: pal.core, endColour: pal.main, alpha: fade, kind: pal.element === 'magic' && i % 2 ? 'shard' : 'dot' })
          }
        }
        break
      }

      case 'trap': {
        const armed = this.elapsed >= def.armingDelay
        const pulse = 0.75 + 0.25 * Math.sin(t * 5)
        v.runeCircle(ground, this.pos.x, this.pos.y, 22, pal, armed ? pulse : 0.3, t * 1.5)
        v.orb(air, this.pos.x, this.pos.y, armed ? 4.5 : 3, pal, armed ? pulse : 0.4)
        // The trigger radius as a slow dashed ring.
        ground.lineStyle(1.5, pal.main, armed ? 0.25 : 0.1)
        for (let i = 0; i < 24; i++) {
          const a = t * 0.3 + (i * Math.PI) / 12
          ground.beginPath()
          ground.arc(this.pos.x, this.pos.y, def.triggerRadius, a, a + 0.13)
          ground.strokePath()
        }
        break
      }

      case 'orbiting': {
        ground.lineStyle(1, pal.main, 0.12)
        ground.strokeCircle(this.pos.x, this.pos.y, def.orbitRadius)
        const spin = rad(def.orbitSpeed)
        for (let i = 0; i < this.remaining; i++) {
          const a = this.elapsed * spin + ((i + 1) * Math.PI * 2) / def.count
          const px = this.pos.x + Math.cos(a) * def.orbitRadius
          const py = this.pos.y + Math.sin(a) * def.orbitRadius
          air.lineStyle(5, pal.main, 0.2)
          air.beginPath()
          air.arc(this.pos.x, this.pos.y, def.orbitRadius, spin >= 0 ? a - 0.45 : a, spin >= 0 ? a : a + 0.45)
          air.strokePath()
          v.shard(air, px, py, a + (spin >= 0 ? Math.PI / 2 : -Math.PI / 2), 18, 7, pal)
        }
        break
      }

      case 'barrage': {
        for (let i = this.remaining; i < this.points.length; i++) {
          const p = this.points[i]
          const due = def.telegraphDuration + i * def.impactInterval
          const k = Math.max(0, Math.min(1, this.elapsed / due))
          const r = def.impactRadius
          ground.fillStyle(pal.main, 0.03 + 0.12 * k * k)
          ground.fillCircle(p.x, p.y, r)
          ground.lineStyle(2, pal.main, 0.25 + 0.6 * k)
          ground.strokeCircle(p.x, p.y, r * (1.6 - 0.6 * k))
          ground.lineStyle(1, pal.core, 0.3 * k)
          ground.lineBetween(p.x - r * 0.3, p.y, p.x + r * 0.3, p.y)
          ground.lineBetween(p.x, p.y - r * 0.3, p.x, p.y + r * 0.3)
          // The falling bolt, closing on the mark from above-left as it comes due.
          if (k > 0.75) {
            const f = (1 - k) / 0.25
            v.glowLine(air, [{ x: p.x - 60 * f, y: p.y - 160 * f }, p], 5, pal, 1 - f * 0.5)
          }
        }
        break
      }

      case 'dash': {
        const pts = this.points.slice(-14)
        for (let i = 1; i < pts.length; i++) {
          const k = i / pts.length
          air.lineStyle(def.hitWidth * k, pal.main, 0.16 * k * fade)
          air.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)
          air.lineStyle(def.hitWidth * 0.25 * k, pal.core, 0.6 * k * fade)
          air.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)
        }
        for (let i = this.rate(120, dt); i > 0; i--) {
          v.emit({ x: this.pos.x + rand(-20, 20), y: this.pos.y + rand(-20, 20), vx: -dir.x * 80 + rand(-30, 30), vy: -dir.y * 80 + rand(-30, 30), life: rand(0.25, 0.45), size: rand(1.5, 3), endSize: 0.3, colour: pal.core, endColour: pal.main, drag: 2, kind: pal.element === 'magic' ? 'shard' : 'streak' })
        }
        break
      }

      case 'chain':
        // Drawn as bolts when each jump lands.
        break
    }
  }
}

/** A summoned ally: follows its caster, picks targets, and attacks with its own delivery. */
class Ally {
  gone = false
  private target: Target
  private def: SummonDef
  private ctx: CastContext
  private sys: SpellSystem
  private remaining: number
  private attackClock = 0
  private acquireClock = 0
  private foe: Target | null = null
  private emitClock = 0

  constructor(def: SummonDef, ctx: CastContext, at: Vec, lifetime: number, sys: SpellSystem) {
    this.def = def
    this.ctx = ctx
    this.sys = sys
    this.remaining = lifetime
    const actor = new Combatant({
      vitals: { ...ctx.caster.self.actor.vitals, health: def.health, defence: def.defence ?? {}, damageInvulnerability: 0, statusImmunities: [] },
      maxHp: def.health,
      getStatus: sys.getStatus,
    })
    this.target = sys.combat.add({ actor, team: ctx.caster.self.team, x: at.x, y: at.y, radius: 18 })
  }

  dismiss() {
    if (this.gone) return
    this.gone = true
    this.sys.combat.remove(this.target)
  }

  update(dt: number) {
    if (this.gone) return
    this.remaining -= dt
    if (this.remaining <= 0 || !this.target.actor.alive) return this.dismiss()
    const world = this.sys.combat
    const owner = this.ctx.caster.self
    this.acquireClock -= dt
    if (this.acquireClock <= 0) {
      this.acquireClock = this.def.acquisitionInterval
      this.foe = world.nearestHostile(this.target, this.target, this.def.acquisitionRange)
    }
    // Keep near the caster, or close in on a foe that's out of range.
    let goal: Vec = owner
    let keep = this.def.followDistance
    if (this.foe?.actor.alive) {
      goal = this.foe
      keep = this.def.attackRange * 0.8
    }
    const dx = goal.x - this.target.x
    const dy = goal.y - this.target.y
    const d = Math.hypot(dx, dy)
    if (this.def.mobile && d > keep) {
      const step = Math.min(d - keep, this.def.speed * dt)
      const next = world.wallEnd(this.target, { x: this.target.x + (dx / d) * step, y: this.target.y + (dy / d) * step }, 18)
      this.target.x = next.x
      this.target.y = next.y
    }
    this.attackClock -= dt
    if (this.foe?.actor.alive && this.attackClock <= 0 && Math.hypot(this.foe.x - this.target.x, this.foe.y - this.target.y) <= this.def.attackRange && world.visible(this.target, this.foe)) {
      this.attackClock = this.def.attackInterval
      const direction = Math.atan2(this.foe.y - this.target.y, this.foe.x - this.target.x)
      const origin = { x: this.target.x, y: this.target.y }
      this.sys.launch(this.def.delivery, { ...this.ctx, origin, point: origin, target: this.foe, direction, depth: this.ctx.depth + 1 })
    }
  }

  draw(v: Vfx, dt: number) {
    const pal = paletteFor(this.ctx.spell.colour, this.def.delivery.attack?.damage)
    const { x, y } = this.target
    const pulse = 1 + 0.12 * Math.sin(v.time * 6)
    // A wisp: pulsing core, motes circling it, and a faint trail.
    v.orb(v.air, x, y, 9 * pulse, pal)
    for (let i = 0; i < 3; i++) {
      const a = v.time * 4 + (i * Math.PI * 2) / 3
      v.orb(v.air, x + Math.cos(a) * 18, y + Math.sin(a) * 18, 2.5, pal, 0.8)
    }
    this.emitClock += 25 * dt
    for (; this.emitClock >= 1; this.emitClock--) {
      v.emit({ x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-15, 15), vy: rand(-30, -5), life: rand(0.4, 0.7), size: 2.2, endSize: 0.3, colour: pal.core, endColour: pal.main })
    }
  }
}

export type { Delivery }
