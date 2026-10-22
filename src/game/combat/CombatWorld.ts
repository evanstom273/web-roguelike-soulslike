import type { TargetFilter } from '../data/types.ts'
import type { Segment, Vec } from '../world/floorGeometry.ts'
import type { Combatant, HitOutcome, HitPayload } from './Combatant.ts'

// Everything that can be hit, where it is, and the line-of-sight / wall queries that
// attacks and spells use.

export type Team = 'player' | 'enemy'

export interface Target {
  actor: Combatant
  team: Team
  x: number
  y: number
  radius: number
}

export interface LandedHit {
  target: Target
  payload: HitPayload
  outcome: HitOutcome
  recurring: boolean // part of a stream of hits (beams, zones): no hit-stop or shake
}

export class CombatWorld {
  readonly targets = new Set<Target>()
  private walls: Segment[]
  /** Fires for every accepted hit, for feedback (numbers, hit-stop, shake). */
  onHit: ((hit: LandedHit) => void) | null = null

  constructor(walls: Segment[]) {
    this.walls = walls
  }

  add(t: Target) {
    this.targets.add(t)
    return t
  }

  remove(t: Target) {
    this.targets.delete(t)
  }

  /** Living targets matching the filter, relative to `self`, optionally within a circle. */
  find(filter: TargetFilter, self: Target, center?: Vec, radius = Infinity): Target[] {
    const out: Target[] = []
    for (const t of this.targets) {
      if (!t.actor.alive) continue
      if (filter === 'caster' ? t !== self : filter === 'friendly' ? t.team !== self.team : t.team === self.team) continue
      if (center && Math.hypot(t.x - center.x, t.y - center.y) > radius + t.radius) continue
      out.push(t)
    }
    return out
  }

  hit(target: Target, payload: HitPayload, recurring = false): HitOutcome {
    const outcome = target.actor.receive(payload)
    if (outcome.accepted) this.onHit?.({ target, payload, outcome, recurring })
    return outcome
  }

  /** Nearest hostile within `radius` of `from`, optionally needing line of sight, skipping `exclude`. */
  nearestHostile(self: Target, from: Vec, radius: number, sight = true, exclude?: Set<Target>): Target | null {
    let best: Target | null = null
    let bestD = radius
    for (const t of this.find('hostile', self, from, radius)) {
      const d = Math.hypot(t.x - from.x, t.y - from.y)
      if (d <= bestD && !exclude?.has(t) && (!sight || this.visible(from, t))) {
        best = t
        bestD = d
      }
    }
    return best
  }

  /** True if no wall crosses the straight line between the two points. */
  visible(a: Vec, b: Vec): boolean {
    return this.wallHit(a, b) === null
  }

  /** Where a straight line from `a` towards `b` stops at the first wall (or `b`). */
  wallEnd(a: Vec, b: Vec, backOff = 2): Vec {
    const t = this.wallHit(a, b)
    if (t === null) return { x: b.x, y: b.y }
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const u = Math.max(0, t - backOff / len)
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
  }

  /** True if a circle of `radius` at `p` is clear of walls. */
  clear(p: Vec, radius: number): boolean {
    for (const w of this.walls) if (segmentDistance(p, w.a, w.b) < radius) return false
    return true
  }

  // Fraction along a->b of the first wall crossing, or null.
  private wallHit(a: Vec, b: Vec): number | null {
    let best: number | null = null
    const rx = b.x - a.x
    const ry = b.y - a.y
    for (const w of this.walls) {
      const sx = w.b.x - w.a.x
      const sy = w.b.y - w.a.y
      const denom = rx * sy - ry * sx
      if (Math.abs(denom) < 1e-9) continue
      const qx = w.a.x - a.x
      const qy = w.a.y - a.y
      const t = (qx * sy - qy * sx) / denom
      const u = (qx * ry - qy * rx) / denom
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t
    }
    return best
  }
}

export function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}
