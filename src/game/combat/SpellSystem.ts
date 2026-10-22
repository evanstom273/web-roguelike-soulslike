import type * as Phaser from 'phaser'
import { resolveHit } from '../data/damage.ts'
import { DAMAGE_TYPES, type DamageTypeId } from '../data/damageTypes.ts'
import type { AreaEffect, BeamEffect, HitDef, ProjectileEffect, SpellDef, WaveEffect } from '../data/types.ts'
import { resolveWalls, type Segment } from '../world/floorGeometry.ts'
import type { Combatant } from './Combatant.ts'
import type { CombatWorld, Target, Team } from './CombatWorld.ts'

// Runs spell effects once a cast completes. Each live effect updates, hits through the
// CombatWorld, and draws itself; placeholder visuals until spells have real art.

export interface Caster {
  x: number
  y: number
  facing: number
  team: Team
  combatant: Combatant
}

export interface CastEvent {
  spell: SpellDef
  caster: Caster
  multiplier: number // attribute scaling, applied to every damage number
}

const rad = (deg: number) => (deg * Math.PI) / 180
const colourOf = (hex: string) => parseInt(hex.replace('#', ''), 16)

interface Live {
  update(dt: number): boolean // false once finished
  draw(g: Phaser.GameObjects.Graphics): void
}

export class SpellSystem {
  private live: Live[] = []
  private gfx: Phaser.GameObjects.Graphics
  private scene: Phaser.Scene
  private walls: Segment[]
  private world: CombatWorld

  constructor(scene: Phaser.Scene, walls: Segment[], world: CombatWorld) {
    this.scene = scene
    this.walls = walls
    this.world = world
    this.gfx = scene.add.graphics().setDepth(12)
  }

  cast({ spell, caster, multiplier }: CastEvent) {
    const colour = colourOf(spell.colour ?? firstDamageColour(spell) ?? '#7fd8ff')
    const hit = (h: HitDef) => resolveHit(h, multiplier)
    for (const e of spell.effects) {
      switch (e.kind) {
        case 'projectile': {
          const count = e.count ?? 1
          const spread = rad(e.spread ?? 0)
          for (let i = 0; i < count; i++) {
            const offset = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1)
            this.live.push(this.projectile(e, caster, caster.facing + offset, multiplier, colour, spell))
          }
          break
        }
        case 'wave':
          this.live.push(this.wave(e, caster, hit(e.hit), colour))
          break
        case 'area': {
          const d = e.at === 'aim' ? this.clearDistance(caster.x, caster.y, caster.facing, e.distance ?? 0) : 0
          const x = caster.x + Math.cos(caster.facing) * d
          const y = caster.y + Math.sin(caster.facing) * d
          this.live.push(this.area(e, caster.team, x, y, hit(e.hit), colour))
          break
        }
        case 'beam':
          this.live.push(this.beam(e, caster, hit(e.hit), colour))
          break
        case 'self':
          if (e.heal) caster.combatant.heal(e.heal * multiplier)
          for (const s of e.statuses ?? []) caster.combatant.applyStatus(s)
          break
      }
    }
  }

  update(dt: number) {
    this.live = this.live.filter((l) => l.update(dt))
    this.gfx.clear()
    for (const l of this.live) l.draw(this.gfx)
  }

  /** How far you can go from (x, y) along `angle` before a wall, up to `max`. */
  private clearDistance(x: number, y: number, angle: number, max: number, radius = 4) {
    for (let d = 0; d <= max; d += 8) {
      const px = x + Math.cos(angle) * d
      const py = y + Math.sin(angle) * d
      const p = resolveWalls({ x: px, y: py }, radius, this.walls)
      if (p.x !== px || p.y !== py) return Math.max(0, d - 8)
    }
    return max
  }

  private projectile(e: ProjectileEffect, caster: Caster, angle: number, multiplier: number, colour: number, spell: SpellDef): Live {
    const hit = resolveHit(e.hit, multiplier)
    const startOffset = 30
    let x = caster.x + Math.cos(angle) * startOffset
    let y = caster.y + Math.sin(angle) * startOffset
    let heading = angle
    let travelled = 0
    let piercesLeft = e.pierce ?? 0
    const already = new Set<Target>()
    const sprite = spell.art ? this.scene.add.image(x, y, spellTextureKey(spell.id)).setDepth(12) : null
    const finish = () => {
      sprite?.destroy()
      if (e.onImpact) this.live.push(this.area({ ...e.onImpact, at: 'self' }, caster.team, x, y, resolveHit(e.onImpact.hit, multiplier), colour))
      return false
    }
    return {
      update: (dt) => {
        if (e.homing) {
          const target = this.world.nearest(caster.team, x, y, 600)
          if (target) {
            const want = Math.atan2(target.y - y, target.x - x)
            const diff = Math.atan2(Math.sin(want - heading), Math.cos(want - heading))
            heading += Math.max(-rad(e.homing) * dt, Math.min(rad(e.homing) * dt, diff))
          }
        }
        x += Math.cos(heading) * e.speed * dt
        y += Math.sin(heading) * e.speed * dt
        travelled += e.speed * dt
        const p = resolveWalls({ x, y }, e.radius, this.walls)
        if (p.x !== x || p.y !== y || travelled >= e.range) return finish()
        const landed = this.world.circle(caster.team, x, y, e.radius, hit, already)
        if (landed.length > 0) {
          piercesLeft -= landed.length
          if (piercesLeft < 0) return finish()
        }
        sprite?.setPosition(x, y).setRotation(heading)
        return true
      },
      draw: (g) => {
        if (sprite) return
        g.fillStyle(colour, 0.25)
        g.fillCircle(x, y, e.radius * 1.8)
        g.fillStyle(0xffffff, 0.9)
        g.fillCircle(x, y, e.radius * 0.6)
        g.fillStyle(colour, 0.9)
        g.fillCircle(x, y, e.radius)
      },
    }
  }

  private wave(e: WaveEffect, caster: Caster, hit: HitDef, colour: number): Live {
    const { x, y, facing } = caster
    const arc = rad(e.arc)
    let r = 0
    const already = new Set<Target>()
    return {
      update: (dt) => {
        r += e.speed * dt
        this.world.sector(caster.team, x, y, Math.max(0, r - e.thickness), r, facing, arc, hit, already)
        return r < e.range
      },
      draw: (g) => {
        const fade = 1 - r / e.range
        g.lineStyle(e.thickness, colour, 0.35 * fade)
        g.beginPath()
        g.arc(x, y, Math.max(1, r - e.thickness / 2), facing - arc / 2, facing + arc / 2)
        g.strokePath()
      },
    }
  }

  private area(e: AreaEffect, team: Team, x: number, y: number, hit: HitDef, colour: number): Live {
    const delay = e.delay ?? 0
    const duration = e.duration ?? 0
    let t = 0
    let sinceTick = 0
    let burst = false
    return {
      update: (dt) => {
        t += dt
        if (t < delay) return true
        if (!burst) {
          burst = true
          this.world.circle(team, x, y, e.radius, hit)
        } else if (duration > 0 && e.interval) {
          sinceTick += dt
          while (sinceTick >= e.interval) {
            sinceTick -= e.interval
            this.world.circle(team, x, y, e.radius, hit)
          }
        }
        // Single bursts linger briefly so you can see them.
        return t < delay + Math.max(duration, 0.25)
      },
      draw: (g) => {
        if (t < delay) {
          // Warning: a ring that fills in as it's about to go off.
          g.lineStyle(2, colour, 0.6)
          g.strokeCircle(x, y, e.radius)
          g.fillStyle(colour, 0.12)
          g.fillCircle(x, y, e.radius * (t / delay))
          return
        }
        const since = t - delay
        const alpha = duration > 0 ? 0.22 : 0.45 * (1 - since / 0.25)
        g.fillStyle(colour, Math.max(0, alpha))
        g.fillCircle(x, y, e.radius)
        g.lineStyle(2, colour, Math.max(0, alpha * 2))
        g.strokeCircle(x, y, e.radius)
      },
    }
  }

  private beam(e: BeamEffect, caster: Caster, hit: HitDef, colour: number): Live {
    let angle = caster.facing
    let t = 0
    let sinceTick = e.interval // hit on the first frame
    let length = 0
    const ends = () => ({
      x1: caster.x + Math.cos(angle) * 24,
      y1: caster.y + Math.sin(angle) * 24,
      x2: caster.x + Math.cos(angle) * (24 + length),
      y2: caster.y + Math.sin(angle) * (24 + length),
    })
    return {
      update: (dt) => {
        t += dt
        if (e.turnRate) {
          const diff = Math.atan2(Math.sin(caster.facing - angle), Math.cos(caster.facing - angle))
          angle += Math.max(-rad(e.turnRate) * dt, Math.min(rad(e.turnRate) * dt, diff))
        }
        length = this.clearDistance(caster.x, caster.y, angle, e.length, e.width / 2) - 24
        sinceTick += dt
        while (sinceTick >= e.interval) {
          sinceTick -= e.interval
          const { x1, y1, x2, y2 } = ends()
          this.world.capsule(caster.team, x1, y1, x2, y2, e.width, hit)
        }
        return t < e.duration
      },
      draw: (g) => {
        const { x1, y1, x2, y2 } = ends()
        g.lineStyle(e.width, colour, 0.3)
        g.lineBetween(x1, y1, x2, y2)
        g.lineStyle(Math.max(2, e.width * 0.3), 0xffffff, 0.8)
        g.lineBetween(x1, y1, x2, y2)
      },
    }
  }
}

function firstDamageColour(spell: SpellDef): string | undefined {
  for (const e of spell.effects) {
    if (e.kind === 'self') continue
    const type = Object.keys(e.hit.damage)[0] as DamageTypeId | undefined
    if (type) return DAMAGE_TYPES[type].colour
  }
  return undefined
}

export const spellTextureKey = (id: string) => `spell:${id}`

/** How long a spell keeps its caster rooted after the cast completes. */
export const spellRootTime = (spell: SpellDef) =>
  spell.recovery + Math.max(0, ...spell.effects.map((e) => (e.kind === 'beam' ? e.duration : 0)))
