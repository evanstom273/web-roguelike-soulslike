import * as Phaser from 'phaser'
import type { DamageMap } from '../data/damageTypes.ts'
import type { Vec } from '../world/floorGeometry.ts'

// Spell visuals: additive glow layers, a particle pool and short-lived effects (impact
// flashes, shockwave rings, lightning bolts). Purely cosmetic: nothing here touches combat.

export type Element = 'magic' | 'fire' | 'lightning' | 'holy' | 'restore'

export interface Palette {
  element: Element
  main: number
  core: number
  deep: number
}

const CORE: Record<Element, number> = {
  magic: 0xeaf4ff,
  fire: 0xfff2c0,
  lightning: 0xffffff,
  holy: 0xfffbe6,
  restore: 0xeafff4,
}
const DEEP: Record<Element, number> = {
  magic: 0x2e4fd6,
  fire: 0xc0280c,
  lightning: 0xff9a1a,
  holy: 0xd99a2b,
  restore: 0x1f9e6a,
}

/** Picks the element from the payload's strongest damage type, else from the tint's hue. */
export function paletteFor(colour: string, damage: DamageMap | undefined): Palette {
  const main = parseInt(colour.replace('#', ''), 16)
  let element: Element | null = null
  let best = 0
  for (const [type, amount] of Object.entries(damage ?? {})) {
    if (!amount || amount <= best) continue
    const e = type === 'fire' || type === 'lightning' || type === 'holy' ? type : 'magic'
    best = amount
    element = e
  }
  if (!element) {
    const r = (main >> 16) & 255
    const g = (main >> 8) & 255
    const b = main & 255
    if (g > r && g > b) element = 'restore'
    else if (r > 200 && g < 170) element = 'fire'
    else if (r > 200 && g > 200 && b < 140) element = 'lightning'
    else if (r > 200 && g > 200) element = 'holy'
    else element = 'magic'
  }
  return { element, main, core: CORE[element], deep: DEEP[element] }
}

export function lerpColour(a: number, b: number, t: number) {
  const k = Math.max(0, Math.min(1, t))
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k)
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k)
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k)
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)
}

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

export type ParticleKind = 'dot' | 'streak' | 'shard'

export interface ParticleSpec {
  x: number
  y: number
  vx?: number
  vy?: number
  life: number
  size: number
  endSize?: number
  colour: number
  endColour?: number
  alpha?: number
  drag?: number // fraction of velocity lost per second
  kind?: ParticleKind
  ground?: boolean // drawn under characters
}

interface Particle extends Required<ParticleSpec> {
  age: number
}

interface Ring {
  x: number
  y: number
  from: number
  to: number
  width: number
  colour: number
  life: number
  age: number
  ground: boolean
}

interface Flash {
  x: number
  y: number
  radius: number
  pal: Palette
  life: number
  age: number
}

interface Bolt {
  a: Vec
  b: Vec
  pal: Palette
  width: number
  life: number
  age: number
}

const MAX_PARTICLES = 1400

export class Vfx {
  /** Under characters, over the floor: zones, runes, telegraphs. */
  readonly ground: Phaser.GameObjects.Graphics
  /** Over characters: projectiles, beams, sparks. */
  readonly air: Phaser.GameObjects.Graphics
  time = 0
  private particles: Particle[] = []
  private rings: Ring[] = []
  private flashes: Flash[] = []
  private bolts: Bolt[] = []

  constructor(scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD)
    this.air = scene.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD)
  }

  /** Clears the layers; deliveries draw after this, then `end` draws the shared effects. */
  begin(dt: number) {
    this.time += dt
    this.ground.clear()
    this.air.clear()
  }

  end(dt: number) {
    this.drawRings(dt)
    this.drawFlashes(dt)
    this.drawBolts(dt)
    this.drawParticles(dt)
  }

  // ---------------------------------------------------------------------------
  // Spawning

  emit(p: ParticleSpec) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
    this.particles.push({
      vx: 0,
      vy: 0,
      endSize: p.size,
      endColour: p.colour,
      alpha: 1,
      drag: 0,
      kind: 'dot',
      ground: false,
      ...p,
      age: 0,
    })
  }

  ring(x: number, y: number, from: number, to: number, life: number, colour: number, width = 3, ground = false) {
    this.rings.push({ x, y, from, to, width, colour, life, age: 0, ground })
  }

  bolt(a: Vec, b: Vec, pal: Palette, life = 0.28, width = 1) {
    this.bolts.push({ a: { ...a }, b: { ...b }, pal, width, life, age: 0 })
  }

  /** Sparks flying out from a point, with the element's own flavour. */
  burst(x: number, y: number, pal: Palette, count: number, speed: number, dir?: number, spread = Math.PI * 2) {
    for (let i = 0; i < count; i++) {
      const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + rand(-spread / 2, spread / 2)
      const s = speed * rand(0.4, 1)
      const kind: ParticleKind = pal.element === 'magic' && i % 2 === 0 ? 'shard' : 'streak'
      this.emit({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.22, 0.42),
        size: rand(1.5, 3),
        endSize: 0.5,
        colour: pal.core,
        endColour: pal.main,
        drag: 3.5,
        kind,
      })
    }
  }

  /** A hit landing: flash, shockwave and sparks. */
  impact(x: number, y: number, radius: number, pal: Palette) {
    this.flashes.push({ x, y, radius, pal, life: 0.2, age: 0 })
    this.ring(x, y, radius * 0.35, radius * 1.2, 0.32, pal.main, Math.max(2, radius / 8))
    this.burst(x, y, pal, Math.round(Math.max(6, Math.min(32, radius / 2.2))), radius * 6)
    switch (pal.element) {
      case 'fire':
        for (let i = 0; i < radius / 4; i++) this.ember(x + rand(-radius, radius) * 0.5, y + rand(-radius, radius) * 0.5, pal, 1.2)
        break
      case 'lightning':
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2
          const r = radius * rand(0.8, 1.5)
          this.bolt({ x, y }, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }, pal, 0.16, 0.6)
        }
        break
      case 'holy':
      case 'restore':
        this.ring(x, y, radius * 0.2, radius * 0.8, 0.45, pal.core, 1.5)
        break
      case 'magic':
        break
    }
  }

  /** Small flare where a spell leaves the caster's hand. */
  castFlare(x: number, y: number, dir: number, pal: Palette) {
    this.flashes.push({ x, y, radius: 16, pal, life: 0.16, age: 0 })
    this.ring(x, y, 4, 26, 0.24, pal.main, 2)
    this.burst(x, y, pal, 10, 260, dir, 1.2)
  }

  /** Healing or buffs: motes spiralling up around the target. */
  uplift(x: number, y: number, radius: number, pal: Palette) {
    this.ring(x, y, radius * 1.4, radius * 0.6, 0.4, pal.main, 2.5, true)
    this.ring(x, y, radius * 0.3, radius * 1.5, 0.5, pal.core, 1.5)
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2
      const r = radius * rand(0.3, 1.1)
      this.emit({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: -Math.sin(a) * 30,
        vy: Math.cos(a) * 30 - rand(40, 90),
        life: rand(0.5, 0.9),
        size: rand(2, 3.5),
        endSize: 0.5,
        colour: pal.core,
        endColour: pal.main,
        drag: 1,
      })
    }
  }

  /** A rising cinder: fire's signature particle. */
  ember(x: number, y: number, pal: Palette, scale = 1) {
    this.emit({
      x,
      y,
      vx: rand(-25, 25) * scale,
      vy: rand(-90, -30) * scale,
      life: rand(0.5, 1.1),
      size: rand(1.2, 2.6),
      endSize: 0.3,
      colour: pal.core,
      endColour: pal.deep,
      drag: 0.8,
    })
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers for deliveries

  /** A glowing ball: halo, body and hot core. */
  orb(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, pal: Palette, alpha = 1) {
    const flicker = 1 + Math.sin(this.time * 31 + x * 0.1) * 0.06
    g.fillStyle(pal.deep, 0.1 * alpha)
    g.fillCircle(x, y, r * 3.2 * flicker)
    g.fillStyle(pal.main, 0.2 * alpha)
    g.fillCircle(x, y, r * 1.9 * flicker)
    g.fillStyle(pal.main, 0.75 * alpha)
    g.fillCircle(x, y, r)
    g.fillStyle(pal.core, alpha)
    g.fillCircle(x, y, r * 0.55)
  }

  /** A line drawn in glow layers: wide and faint to thin and white-hot. */
  glowLine(g: Phaser.GameObjects.Graphics, pts: Vec[], width: number, pal: Palette, alpha = 1) {
    const layers: [number, number, number][] = [
      [width * 2.4, pal.deep, 0.12],
      [width * 1.3, pal.main, 0.28],
      [width * 0.6, pal.main, 0.6],
      [Math.max(1.5, width * 0.22), pal.core, 0.95],
    ]
    for (const [w, c, a] of layers) {
      g.lineStyle(w, c, a * alpha)
      g.beginPath()
      g.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
      g.strokePath()
    }
  }

  /** Points along a→b, jittered sideways (most in the middle) for lightning. */
  jagged(a: Vec, b: Vec, segments: number, jitter: number): Vec[] {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const pts: Vec[] = [{ ...a }]
    for (let i = 1; i < segments; i++) {
      const t = i / segments
      const off = rand(-1, 1) * jitter * Math.sin(Math.PI * t)
      pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off })
    }
    pts.push({ ...b })
    return pts
  }

  /** Points along a→b, bent into a travelling sine wave. */
  wavy(a: Vec, b: Vec, amplitude: number, wavelength: number, phase: number): Vec[] {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const n = Math.max(4, Math.ceil(len / 10))
    const pts: Vec[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const off = Math.sin((t * len) / wavelength * Math.PI * 2 + phase) * amplitude * Math.sin(Math.PI * t)
      pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off })
    }
    return pts
  }

  /** A turning rune circle: rims, ticks and a hexagram. */
  runeCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, pal: Palette, alpha: number, spin: number) {
    g.lineStyle(6, pal.main, 0.12 * alpha)
    g.strokeCircle(x, y, r)
    g.lineStyle(2, pal.main, 0.7 * alpha)
    g.strokeCircle(x, y, r)
    g.lineStyle(1, pal.main, 0.45 * alpha)
    g.strokeCircle(x, y, r * 0.84)
    // Dashes and ticks between the rims, turning against the sigil.
    for (let i = 0; i < 12; i++) {
      const a = -spin * 0.6 + (i * Math.PI) / 6
      g.lineStyle(2, pal.core, 0.55 * alpha)
      g.beginPath()
      g.arc(x, y, r * 0.92, a, a + 0.22)
      g.strokePath()
      g.lineBetween(x + Math.cos(a + 0.36) * r * 0.86, y + Math.sin(a + 0.36) * r * 0.86, x + Math.cos(a + 0.36) * r * 0.98, y + Math.sin(a + 0.36) * r * 0.98)
    }
    g.lineStyle(1.5, pal.main, 0.6 * alpha)
    for (let t = 0; t < 2; t++) {
      g.beginPath()
      for (let i = 0; i <= 3; i++) {
        const a = spin + (t * Math.PI) / 3 + (i * Math.PI * 2) / 3
        const px = x + Math.cos(a) * r * 0.8
        const py = y + Math.sin(a) * r * 0.8
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
    }
  }

  /** A crystal shard pointing along `angle`. */
  shard(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, length: number, width: number, pal: Palette, alpha = 1) {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const pt = (f: number, w: number) => ({ x: x + c * f - s * w, y: y + s * f + c * w })
    const tip = pt(length * 0.6, 0)
    const back = pt(-length * 0.4, 0)
    const l = pt(0, width / 2)
    const r = pt(0, -width / 2)
    g.fillStyle(pal.main, 0.18 * alpha)
    g.fillCircle(x, y, length * 0.7)
    g.fillStyle(pal.main, 0.85 * alpha)
    g.fillTriangle(tip.x, tip.y, l.x, l.y, back.x, back.y)
    g.fillStyle(pal.core, alpha)
    g.fillTriangle(tip.x, tip.y, r.x, r.y, back.x, back.y)
  }

  // ---------------------------------------------------------------------------

  private drawParticles(dt: number) {
    const live: Particle[] = []
    for (const p of this.particles) {
      p.age += dt
      if (p.age >= p.life) continue
      live.push(p)
      const k = Math.max(0, 1 - p.drag * dt)
      p.vx *= k
      p.vy *= k
      p.x += p.vx * dt
      p.y += p.vy * dt
      const t = p.age / p.life
      const size = p.size + (p.endSize - p.size) * t
      const colour = lerpColour(p.colour, p.endColour, t)
      const alpha = p.alpha * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85)
      const g = p.ground ? this.ground : this.air
      if (p.kind === 'streak') {
        const tail = 0.045
        g.lineStyle(size * 3, colour, 0.18 * alpha)
        g.lineBetween(p.x - p.vx * tail, p.y - p.vy * tail, p.x, p.y)
        g.lineStyle(size, colour, alpha)
        g.lineBetween(p.x - p.vx * tail, p.y - p.vy * tail, p.x, p.y)
      } else if (p.kind === 'shard') {
        const a = Math.atan2(p.vy, p.vx) + p.age * 9
        const c = Math.cos(a) * size * 1.8
        const s = Math.sin(a) * size * 1.8
        g.fillStyle(colour, alpha)
        g.fillTriangle(p.x + c, p.y + s, p.x - s * 0.45, p.y + c * 0.45, p.x - c, p.y - s)
        g.fillTriangle(p.x + c, p.y + s, p.x + s * 0.45, p.y - c * 0.45, p.x - c, p.y - s)
      } else {
        g.fillStyle(colour, 0.22 * alpha)
        g.fillCircle(p.x, p.y, size * 2.4)
        g.fillStyle(colour, alpha)
        g.fillCircle(p.x, p.y, size)
      }
    }
    this.particles = live
  }

  private drawRings(dt: number) {
    this.rings = this.rings.filter((r) => (r.age += dt) < r.life)
    for (const r of this.rings) {
      const t = r.age / r.life
      const e = 1 - (1 - t) * (1 - t)
      const radius = r.from + (r.to - r.from) * e
      const g = r.ground ? this.ground : this.air
      g.lineStyle(r.width * 3, r.colour, 0.12 * (1 - t))
      g.strokeCircle(r.x, r.y, radius)
      g.lineStyle(r.width * (1 - t * 0.6), r.colour, 0.8 * (1 - t))
      g.strokeCircle(r.x, r.y, radius)
    }
  }

  private drawFlashes(dt: number) {
    this.flashes = this.flashes.filter((f) => (f.age += dt) < f.life)
    for (const f of this.flashes) {
      const k = 1 - f.age / f.life
      this.air.fillStyle(f.pal.main, 0.22 * k)
      this.air.fillCircle(f.x, f.y, f.radius * (1.1 + 0.5 * (1 - k)))
      this.air.fillStyle(f.pal.core, 0.7 * k * k)
      this.air.fillCircle(f.x, f.y, f.radius * 0.5 * (0.6 + 0.4 * k))
    }
  }

  private drawBolts(dt: number) {
    this.bolts = this.bolts.filter((b) => (b.age += dt) < b.life)
    for (const b of this.bolts) {
      const k = 1 - b.age / b.life
      const len = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y)
      // Re-jag every frame so it crackles.
      const pts = this.jagged(b.a, b.b, Math.max(3, Math.round(len / 18)), Math.min(26, len * 0.18))
      this.glowLine(this.air, pts, 6 * b.width, b.pal, k)
      if (len > 60 && Math.random() < 0.6) {
        const from = pts[1 + Math.floor(Math.random() * (pts.length - 2))]
        const a = Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x) + rand(-1, 1)
        const r = len * rand(0.15, 0.3)
        this.glowLine(this.air, this.jagged(from, { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r }, 3, r * 0.3), 3 * b.width, b.pal, k * 0.7)
      }
    }
  }
}
