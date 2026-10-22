import type * as Phaser from 'phaser'
import type { AttributeLevels } from '../data/attributes.ts'
import type { DamageMap } from '../data/damageTypes.ts'
import type { AttackDef, SpellDef, SpellDelivery, StatusDef, SummonDef } from '../data/types.ts'
import type { Vec } from '../world/floorGeometry.ts'
import { Combatant } from './Combatant.ts'
import { segmentDistance, type CombatWorld, type Target } from './CombatWorld.ts'

// Runs spell deliveries: a port of the Godot version's spell_delivery_runtime. Each
// live delivery updates, hits through the CombatWorld, and draws placeholder visuals
// (until spells get real art).

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
const colourOf = (hex: string) => parseInt(hex.replace('#', ''), 16)
const rotateToward = (from: number, to: number, maxStep: number) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + Math.max(-maxStep, Math.min(maxStep, diff))
}
const dirOf = (a: number) => ({ x: Math.cos(a), y: Math.sin(a) })

const CHANNELLED = (d: SpellDelivery) => d.delivery === 'beam' || d.delivery === 'tether' || (d.delivery === 'cone' && d.held)

export class SpellSystem {
  private live: Delivery[] = []
  private gfx: Phaser.GameObjects.Graphics
  private world: CombatWorld
  /** Summoned allies, updated alongside deliveries. */
  private allies: Ally[] = []
  readonly getStatus: (id: string) => StatusDef

  constructor(scene: Phaser.Scene, world: CombatWorld, getStatus: (id: string) => StatusDef) {
    this.world = world
    this.getStatus = getStatus
    this.gfx = scene.add.graphics().setDepth(12)
  }

  launch(def: SpellDelivery, ctx: CastContext): Delivery | null {
    if (ctx.depth === 0) {
      // Each spell has a cap on live copies; casting again replaces the oldest.
      const siblings = this.live.filter((l) => l.ctx.spell === ctx.spell && l.ctx.depth === 0 && !l.cancelled)
      while (siblings.length >= def.maxInstances) siblings.shift()!.cancel()
    }
    const d = new Delivery(def, ctx, this)
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
    this.gfx.clear()
    for (const l of this.live) l.draw(this.gfx)
    for (const a of this.allies) a.draw(this.gfx)
    drawImpacts(this.gfx, dt)
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
  private colour: number

  constructor(def: SpellDelivery, ctx: CastContext, sys: SpellSystem) {
    this.def = def
    this.ctx = ctx
    this.sys = sys
    this.pos = { ...ctx.origin }
    this.beamEnd = { ...ctx.origin }
    this.colour = colourOf(ctx.spell.colour)
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
        this.cancel()
        break
      case 'target':
        if (ctx.target?.actor.alive && (!def.requireLineOfSight || world.visible(this.pos, ctx.target))) {
          deliverHit(sys, def, ctx, ctx.target)
          this.flashAt({ x: ctx.target.x, y: ctx.target.y }, 24)
        }
        this.cancel()
        break
      case 'weapon-imbue':
        ctx.caster.imbue(def.bonusDamage, def.duration, def.weaponColour)
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
          if (!def.held) this.cancel()
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
          this.flashAt({ x: t.x, y: t.y }, 14)
          if (!wave && this.def.delivery === 'projectile' && this.hits.size > this.def.pierce) return this.cancel()
        }
      }
      if (Math.hypot(wall.x - end.x, wall.y - end.y) > 0.1) {
        this.flashAt(wall, 12)
        return this.cancel()
      }
    }
    if (this.def.delivery === 'projectile' && this.elapsed >= this.def.duration) this.flashAt(this.pos, 10)
  }

  // Brief impact flashes, drawn by the system for a moment after this delivery ends.
  private flash(radius: number) {
    this.flashAt(this.pos, radius)
  }
  private flashAt(at: Vec, radius: number) {
    impacts.push({ x: at.x, y: at.y, radius, colour: this.colour, age: 0 })
  }

  draw(g: Phaser.GameObjects.Graphics) {
    const { def } = this
    const c = this.colour
    const dir = dirOf(this.ctx.direction)
    switch (def.delivery) {
      case 'beam':
      case 'tether': {
        const width = def.delivery === 'beam' ? def.width : 8
        g.lineStyle(width, c, 0.25)
        g.lineBetween(this.pos.x, this.pos.y, this.beamEnd.x, this.beamEnd.y)
        g.lineStyle(3, c, 0.95)
        g.lineBetween(this.pos.x, this.pos.y, this.beamEnd.x, this.beamEnd.y)
        break
      }
      case 'projectile':
        g.fillStyle(c, 0.25)
        g.fillCircle(this.pos.x, this.pos.y, def.radius * 1.7)
        g.fillStyle(c, 0.95)
        g.fillCircle(this.pos.x, this.pos.y, def.radius)
        g.fillStyle(0xffffff, 0.85)
        g.fillCircle(this.pos.x, this.pos.y, def.radius * 0.45)
        break
      case 'wave': {
        const a = this.ctx.direction
        g.lineStyle(def.thickness, c, 0.4)
        g.beginPath()
        g.arc(this.pos.x - dir.x * (def.width / 2), this.pos.y - dir.y * (def.width / 2), def.width / 2, a - Math.PI / 2, a + Math.PI / 2)
        g.strokePath()
        break
      }
      case 'cone': {
        const half = rad(def.angle / 2)
        g.fillStyle(c, 0.18)
        g.slice(this.pos.x, this.pos.y, def.radius, this.ctx.direction - half, this.ctx.direction + half, false)
        g.fillPath()
        break
      }
      case 'ground-zone':
      case 'aura':
        g.fillStyle(c, 0.12)
        g.fillCircle(this.pos.x, this.pos.y, def.radius)
        g.lineStyle(2, c, 0.8)
        g.strokeCircle(this.pos.x, this.pos.y, def.radius)
        break
      case 'trap':
        g.lineStyle(2, c, this.elapsed >= def.armingDelay ? 0.85 : 0.3)
        g.strokeCircle(this.pos.x, this.pos.y, def.triggerRadius)
        g.fillStyle(c, 0.8)
        g.fillCircle(this.pos.x, this.pos.y, 6)
        break
      case 'orbiting':
        for (let i = 0; i < this.remaining; i++) {
          const a = this.elapsed * rad(def.orbitSpeed) + ((i + 1) * Math.PI * 2) / def.count
          g.fillStyle(c, 0.95)
          g.fillCircle(this.pos.x + Math.cos(a) * def.orbitRadius, this.pos.y + Math.sin(a) * def.orbitRadius, 7)
        }
        break
      case 'barrage':
        for (let i = this.remaining; i < this.points.length; i++) {
          const p = this.points[i]
          g.lineStyle(1.5, c, 0.5)
          g.strokeCircle(p.x, p.y, def.impactRadius)
        }
        break
      case 'chain':
        for (let i = 0; i + 1 < this.points.length; i += 2) {
          g.lineStyle(3, c, 0.9)
          g.lineBetween(this.points[i].x, this.points[i].y, this.points[i + 1].x, this.points[i + 1].y)
        }
        break
      case 'dash':
        for (let i = 1; i < this.points.length; i++) {
          g.lineStyle(def.hitWidth, c, 0.12)
          g.lineBetween(this.points[i - 1].x, this.points[i - 1].y, this.points[i].x, this.points[i].y)
        }
        break
    }
  }
}

// Impact flashes outlive their deliveries, so they're tracked module-wide and drawn by
// whichever SpellSystem updates.
const impacts: { x: number; y: number; radius: number; colour: number; age: number }[] = []
const FLASH = 0.25

export function drawImpacts(g: Phaser.GameObjects.Graphics, dt: number) {
  for (let i = impacts.length - 1; i >= 0; i--) {
    const f = impacts[i]
    f.age += dt
    if (f.age >= FLASH) {
      impacts.splice(i, 1)
      continue
    }
    const k = 1 - f.age / FLASH
    g.fillStyle(f.colour, 0.35 * k)
    g.fillCircle(f.x, f.y, f.radius * (0.6 + 0.4 * (1 - k)))
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

  draw(g: Phaser.GameObjects.Graphics) {
    const c = colourOf(this.ctx.spell.colour)
    g.fillStyle(c, 0.2)
    g.fillCircle(this.target.x, this.target.y, 26)
    g.fillStyle(c, 0.9)
    g.fillCircle(this.target.x, this.target.y, 12)
    g.fillStyle(0xffffff, 0.9)
    g.fillCircle(this.target.x, this.target.y, 5)
  }
}

export type { Delivery }
