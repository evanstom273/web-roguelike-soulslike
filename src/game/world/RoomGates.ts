import type * as Phaser from 'phaser'
import type { Doorway, Segment } from './floorGeometry.ts'
import { LAYER, LOW_WALL_HEIGHT, WALL_HEIGHT } from './projection.ts'

// Iron gates across a room's doorways. They drop shut behind you when you walk into a room
// with enemies in it and lift again once they're all dead. While shut they're walls, for
// moving and for anything that needs a clear line.

const DROP_TIME = 0.2
const LIFT_TIME = 0.7
const BAR_GAP = 15
const IRON = 0x24272b
const IRON_LIGHT = 0x7a7f86
const INK = 0x0b0c0d

interface Gate {
  wall: Segment
  height: number
  g: Phaser.GameObjects.Graphics
}

export class RoomGates {
  private gates: Gate[]
  private walls: Segment[]
  /** 0 open (up in the ceiling) .. 1 shut. */
  private drop = 0
  private shut = false

  /** `walls` is the floor's shared wall list: shut gates are added to it. */
  constructor(scene: Phaser.Scene, doors: Doorway[], walls: Segment[]) {
    this.walls = walls
    this.gates = doors.map((d) => {
      // Seen full height when the room lies down the screen from it (a gap in a back wall),
      // kept low in front walls so it never hides you, like the walls themselves.
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
      let n = { x: -(d.b.y - d.a.y) / len, y: (d.b.x - d.a.x) / len }
      if (n.y < 0) n = { x: -n.x, y: -n.y }
      const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }
      const tall = Math.abs(n.y) < 0.05 || n.x * (d.inside.x - mid.x) + n.y * (d.inside.y - mid.y) > 0
      const g = scene.add.graphics().setDepth(tall ? LAYER.backWall + 0.15 : LAYER.lowWall + 0.15)
      return { wall: { a: d.a, b: d.b }, height: tall ? WALL_HEIGHT : LOW_WALL_HEIGHT + 18, g }
    })
  }

  get closed() {
    return this.shut
  }

  close() {
    if (this.shut) return
    this.shut = true
    for (const gate of this.gates) this.walls.push(gate.wall)
  }

  open() {
    if (!this.shut) return
    this.shut = false
    for (const gate of this.gates) {
      const i = this.walls.indexOf(gate.wall)
      if (i >= 0) this.walls.splice(i, 1)
    }
  }

  update(dt: number) {
    const before = this.drop
    this.drop = this.shut ? Math.min(1, this.drop + dt / DROP_TIME) : Math.max(0, this.drop - dt / LIFT_TIME)
    if (this.drop !== before) for (const gate of this.gates) this.draw(gate)
  }

  /** A portcullis: bars hanging from the top of the opening, down as far as it has dropped. */
  private draw({ wall: { a, b }, height, g }: Gate) {
    g.clear()
    if (this.drop <= 0) return
    const shown = height * this.drop
    const top = -height
    const bottom = top + shown
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const bars = Math.max(2, Math.round(len / BAR_GAP))
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    // Cross rails behind the bars, wherever the gate has come down that far.
    for (const f of [0.12, 0.45, 0.78]) {
      const h = top + height * f
      if (h > bottom) continue
      g.lineStyle(6, INK, 1).lineBetween(a.x, a.y + h, b.x, b.y + h)
      g.lineStyle(4, IRON, 1).lineBetween(a.x, a.y + h, b.x, b.y + h)
    }
    for (let i = 0; i <= bars; i++) {
      const p = at(i / bars)
      g.lineStyle(6, INK, 1).lineBetween(p.x, p.y + top, p.x, p.y + bottom + 3)
      g.lineStyle(4, IRON, 1).lineBetween(p.x, p.y + top, p.x, p.y + bottom)
      g.lineStyle(1.2, IRON_LIGHT, 0.8).lineBetween(p.x - 1, p.y + top, p.x - 1, p.y + bottom - 2)
      // Points on the bottom of each bar.
      g.fillStyle(IRON, 1).fillTriangle(p.x - 3, p.y + bottom, p.x + 3, p.y + bottom, p.x, p.y + bottom + 6)
    }
  }
}
