import type * as Phaser from 'phaser'
import { Combatant } from '../combat/Combatant.ts'
import type { CombatWorld, Target } from '../combat/CombatWorld.ts'
import { TRAINING_DUMMY_RECOVER_DELAY, TRAINING_DUMMY_VITALS } from '../data/trainingDummy.ts'
import type { StatusDef } from '../data/types.ts'
import type { Vec } from './floorGeometry.ts'

// Something to hit: takes damage and statuses like an enemy, never fights back, and
// stands back up a few seconds after being beaten. Placeholder visuals.

const RADIUS = 39

export class TrainingDummy {
  readonly target: Target
  private gfx: Phaser.GameObjects.Graphics
  private downFor = 0

  constructor(scene: Phaser.Scene, world: CombatWorld, at: Vec, getStatus: (id: string) => StatusDef) {
    const actor = new Combatant({ vitals: TRAINING_DUMMY_VITALS, maxHp: TRAINING_DUMMY_VITALS.health, getStatus })
    this.target = world.add({ actor, team: 'enemy', x: at.x, y: at.y, radius: RADIUS })
    this.gfx = scene.add.graphics().setDepth(8)
  }

  update(dt: number) {
    const a = this.target.actor
    a.update(dt)
    if (!a.alive) {
      this.downFor += dt
      if (this.downFor >= TRAINING_DUMMY_RECOVER_DELAY) {
        this.downFor = 0
        a.hp = a.maxHp
      }
    }
    this.draw()
  }

  private draw() {
    const { x, y } = this.target
    const a = this.target.actor
    const g = this.gfx
    g.clear()
    // Post seen from above: a wooden disc with a crossbar.
    g.fillStyle(0x000000, 0.35)
    g.fillCircle(x + 4, y + 6, RADIUS + 6)
    g.fillStyle(a.alive ? 0x6b4a2e : 0x3a2a1c, 1)
    g.fillCircle(x, y, RADIUS)
    g.lineStyle(4, 0x2a1b10, 1)
    g.strokeCircle(x, y, RADIUS)
    g.fillStyle(0x8a6440, 1)
    g.fillRect(x - RADIUS - 15, y - 7.5, RADIUS * 2 + 30, 15)
    g.fillStyle(0x4d3420, 1)
    g.fillCircle(x, y, 13.5)

    // Health and status meters above it.
    const w = 90
    const top = y - RADIUS - 30
    g.fillStyle(0x000000, 0.6)
    g.fillRect(x - w / 2 - 1, top - 1, w + 2, 8)
    g.fillStyle(0xc43a32, 1)
    g.fillRect(x - w / 2, top, (w * a.hp) / a.maxHp, 6)
    let row = 0
    for (const m of a.meters.values()) {
      const by = top + 10 + row++ * 6
      g.fillStyle(0x000000, 0.6)
      g.fillRect(x - w / 2, by, w, 4)
      g.fillStyle(parseInt(m.status.colour.slice(1), 16), m.cooldown > 0 ? 0.4 : 1)
      g.fillRect(x - w / 2, by, m.cooldown > 0 ? w : (w * m.value) / m.threshold, 4)
    }
  }
}
