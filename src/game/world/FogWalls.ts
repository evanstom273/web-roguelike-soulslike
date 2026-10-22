import * as Phaser from 'phaser'
import type { Doorway, Segment } from './floorGeometry.ts'
import { LAYER, WALL_HEIGHT } from './projection.ts'

// Fog walls across a room's doorways. They rise behind you when you walk into a room with
// enemies in it and dissipate once they're all dead. While up they're walls, for moving
// and for anything that needs a clear line.

const PUFF_TEXTURE = 'fog-puff'
const RISE_TIME = 0.6
const FADE_TIME = 1.1
const PUFF_SPACING = 11 // px of doorway per puff, per layer
// Fog in front walls stands lower and thinner, so you can still see yourself through it.
const FRONT_HEIGHT = 80
const FOG = [0xf2ecdf, 0xd9d2c3, 0xfff6e0]

interface Puff {
  img: Phaser.GameObjects.Image
  t: number // along the doorway, 0..1
  h: number // height it started at, 0..1
  rise: number // how fast it drifts up, heights per second
  sway: number
  size: number
  alpha: number
}

interface Wall {
  wall: Segment
  height: number
  puffs: Puff[]
  /** The veil itself: a pale sheet filling the doorway, under the drifting puffs. */
  sheet: Phaser.GameObjects.Graphics
  thin: number // 1 in back walls, less in front walls
}

/** A soft round blob, drawn once and shared by every puff of fog. */
function puffTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(PUFF_TEXTURE)) return
  const size = 64
  const tex = scene.textures.createCanvas(PUFF_TEXTURE, size, size)!
  const ctx = tex.getContext()
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}

export class FogWalls {
  private fogs: Wall[]
  private walls: Segment[]
  /** 0 gone .. 1 fully up. */
  private amount = 0
  private up = false
  private time = Math.random() * 10

  /** `walls` is the floor's shared wall list: fog that's up is added to it. */
  constructor(scene: Phaser.Scene, doors: Doorway[], walls: Segment[]) {
    puffTexture(scene)
    this.walls = walls
    this.fogs = doors.map((d) => {
      // Full height where the room lies down the screen from the doorway (a gap in a back
      // wall); lower in front walls, which stand between you and the camera.
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
      let n = { x: -(d.b.y - d.a.y) / len, y: (d.b.x - d.a.x) / len }
      if (n.y < 0) n = { x: -n.x, y: -n.y }
      const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }
      const back = Math.abs(n.y) < 0.05 || n.x * (d.inside.x - mid.x) + n.y * (d.inside.y - mid.y) > 0
      const depth = back ? LAYER.backWall + 0.15 : LAYER.lowWall + 0.15
      const sheet = scene.add.graphics().setDepth(depth - 0.01)
      const thin = back ? 1 : 0.6
      const puffs: Puff[] = []
      const count = Math.round(len / PUFF_SPACING) * 4
      for (let i = 0; i < count; i++) {
        const glow = i % 9 === 0 // a few brighter wisps, added on, for the shimmer
        const img = scene.add
          .image(0, 0, PUFF_TEXTURE)
          .setDepth(depth)
          .setTint(glow ? FOG[2] : FOG[i % 2])
          .setBlendMode(glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setVisible(false)
        puffs.push({
          img,
          t: Math.random(),
          h: Math.random(),
          rise: 0.12 + Math.random() * 0.18,
          sway: Math.random() * Math.PI * 2,
          size: (glow ? 0.5 : 0.8) + Math.random() * 0.7,
          alpha: (glow ? 0.5 : 0.3) * thin,
        })
      }
      return { wall: { a: d.a, b: d.b }, height: back ? WALL_HEIGHT : FRONT_HEIGHT, puffs, sheet, thin }
    })
  }

  get closed() {
    return this.up
  }

  close() {
    if (this.up) return
    this.up = true
    for (const f of this.fogs) this.walls.push(f.wall)
  }

  open() {
    if (!this.up) return
    this.up = false
    for (const f of this.fogs) {
      const i = this.walls.indexOf(f.wall)
      if (i >= 0) this.walls.splice(i, 1)
    }
  }

  update(dt: number) {
    this.amount = this.up ? Math.min(1, this.amount + dt / RISE_TIME) : Math.max(0, this.amount - dt / FADE_TIME)
    if (this.amount <= 0 && !this.up) {
      for (const f of this.fogs) {
        for (const p of f.puffs) p.img.setVisible(false)
        f.sheet.clear()
      }
      return
    }
    this.time += dt
    for (const f of this.fogs) this.draw(f)
  }

  /**
   * Puffs drifting up the doorway and swaying along it, faded at the top and the ends.
   * Rising in, the fog fills from the ground up; dissipating, it thins and spreads.
   */
  private draw({ wall: { a, b }, height, puffs, sheet, thin }: Wall) {
    const k = this.amount
    // The sheet: brightest low down, thinning towards the top, risen as far as the fog has.
    sheet.clear()
    const top = height * (this.up ? k : 1)
    const bands = 6
    for (let i = 0; i < bands; i++) {
      const h0 = (top * i) / bands
      const h1 = (top * (i + 1)) / bands
      const shimmer = 0.85 + 0.15 * Math.sin(this.time * 2.1 + i)
      sheet.fillStyle(FOG[0], 0.3 * thin * (1 - i / bands) * shimmer * (this.up ? 1 : k))
      sheet.fillPoints([new Phaser.Math.Vector2(a.x, a.y - h0), new Phaser.Math.Vector2(b.x, b.y - h0), new Phaser.Math.Vector2(b.x, b.y - h1), new Phaser.Math.Vector2(a.x, a.y - h1)], true)
    }
    // A bright seam where it meets the floor.
    sheet.lineStyle(3, FOG[2], 0.55 * thin * (this.up ? 1 : k)).lineBetween(a.x, a.y, b.x, b.y)
    const spread = this.up ? 1 : 1 + (1 - k) * 0.6
    for (const p of puffs) {
      const h = (p.h + this.time * p.rise) % 1
      if (this.up && h > k) {
        p.img.setVisible(false)
        continue
      }
      const t = Math.min(1, Math.max(0, p.t + Math.sin(this.time * 0.9 + p.sway) * 0.03))
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t - h * height
      const fade = Math.sin(Math.PI * Math.min(1, h * 1.15)) * Math.min(1, t * 6, (1 - t) * 6)
      p.img
        .setVisible(true)
        .setPosition(x, y)
        .setScale(p.size * (1 + h * 0.5) * spread)
        .setAlpha(p.alpha * fade * (this.up ? 1 : k))
    }
  }
}
