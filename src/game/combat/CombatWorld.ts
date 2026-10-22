import type { HitDef } from '../data/types.ts'
import type { Combatant } from './Combatant.ts'

// Everything that can be hit, with positions, plus the hit shapes attacks and spells use.
// Each query hits targets on the other team only, and skips any in `already` (so a
// single swing or projectile hits each target once).

export type Team = 'player' | 'enemy'

export interface Target {
  combatant: Combatant
  team: Team
  x: number
  y: number
  radius: number
}

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

export class CombatWorld {
  readonly targets = new Set<Target>()

  add(t: Target) {
    this.targets.add(t)
    return t
  }

  remove(t: Target) {
    this.targets.delete(t)
  }

  private land(team: Team, hit: HitDef, already: Set<Target> | undefined, test: (t: Target) => boolean): Target[] {
    const landed: Target[] = []
    for (const t of this.targets) {
      if (t.team === team || t.combatant.dead || already?.has(t) || !test(t)) continue
      t.combatant.takeHit(hit)
      already?.add(t)
      landed.push(t)
    }
    return landed
  }

  circle(team: Team, x: number, y: number, r: number, hit: HitDef, already?: Set<Target>) {
    return this.land(team, hit, already, (t) => Math.hypot(t.x - x, t.y - y) <= r + t.radius)
  }

  /** A ring segment: between `inner` and `outer` from (x, y), within `arc` radians of `angle`. */
  sector(team: Team, x: number, y: number, inner: number, outer: number, angle: number, arc: number, hit: HitDef, already?: Set<Target>) {
    return this.land(team, hit, already, (t) => {
      const d = Math.hypot(t.x - x, t.y - y)
      if (d > outer + t.radius || d < inner - t.radius) return false
      const spread = arc / 2 + (d > 0 ? Math.asin(Math.min(1, t.radius / d)) : Math.PI)
      return Math.abs(angleDiff(Math.atan2(t.y - y, t.x - x), angle)) <= spread
    })
  }

  /** A thick line from (x1, y1) to (x2, y2). */
  capsule(team: Team, x1: number, y1: number, x2: number, y2: number, width: number, hit: HitDef, already?: Set<Target>) {
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy || 1
    return this.land(team, hit, already, (t) => {
      const u = Math.max(0, Math.min(1, ((t.x - x1) * dx + (t.y - y1) * dy) / lenSq))
      return Math.hypot(t.x - (x1 + dx * u), t.y - (y1 + dy * u)) <= width / 2 + t.radius
    })
  }

  nearest(team: Team, x: number, y: number, maxDistance: number): Target | null {
    let best: Target | null = null
    let bestD = maxDistance
    for (const t of this.targets) {
      if (t.team === team || t.combatant.dead) continue
      const d = Math.hypot(t.x - x, t.y - y)
      if (d < bestD) {
        best = t
        bestD = d
      }
    }
    return best
  }
}
