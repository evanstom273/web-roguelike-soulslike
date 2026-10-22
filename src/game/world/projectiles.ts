import type * as Phaser from 'phaser'
import type { CastEvent } from '../player/Player.ts'
import { resolveWalls, type Segment } from './floorGeometry.ts'

// Spell projectiles: fly straight, stop at walls or at the end of their range.
// Damage is carried along for when there's something to hit.

interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  travelled: number
  range: number
  damage: number
  sprite: Phaser.GameObjects.Image | null
}

export class Projectiles {
  private list: Projectile[] = []
  private gfx: Phaser.GameObjects.Graphics
  private scene: Phaser.Scene
  private walls: Segment[]

  constructor(scene: Phaser.Scene, walls: Segment[]) {
    this.scene = scene
    this.walls = walls
    this.gfx = scene.add.graphics().setDepth(12)
  }

  spawn(e: CastEvent) {
    if (e.spell.effect.kind !== 'projectile') return
    const { speed, radius, range } = e.spell.effect
    const sprite = e.spell.art ? this.scene.add.image(e.x, e.y, spellTextureKey(e.spell.id)).setDepth(12).setRotation(e.angle) : null
    this.list.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(e.angle) * speed,
      vy: Math.sin(e.angle) * speed,
      radius,
      travelled: 0,
      range,
      damage: e.damage,
      sprite,
    })
  }

  update(dt: number) {
    this.gfx.clear()
    this.list = this.list.filter((p) => {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.travelled += Math.hypot(p.vx, p.vy) * dt
      const pushed = resolveWalls({ x: p.x, y: p.y }, p.radius, this.walls)
      const hitWall = pushed.x !== p.x || pushed.y !== p.y
      if (hitWall || p.travelled >= p.range) {
        p.sprite?.destroy()
        return false
      }
      if (p.sprite) {
        p.sprite.setPosition(p.x, p.y)
      } else {
        // No art yet: a plain glowing orb.
        this.gfx.fillStyle(0x7fd8ff, 0.25)
        this.gfx.fillCircle(p.x, p.y, p.radius * 1.8)
        this.gfx.fillStyle(0xe6fbff, 0.9)
        this.gfx.fillCircle(p.x, p.y, p.radius)
      }
      return true
    })
  }
}

export const spellTextureKey = (id: string) => `spell:${id}`
