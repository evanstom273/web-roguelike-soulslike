import * as Phaser from 'phaser'
import { Combatant } from '../combat/Combatant.ts'
import type { CombatWorld, Target } from '../combat/CombatWorld.ts'
import { TRAINING_DUMMY_RECOVER_DELAY, TRAINING_DUMMY_VITALS } from '../data/trainingDummy.ts'
import type { StatusDef } from '../data/types.ts'
import type { Vec } from './floorGeometry.ts'
import { LAYER, standingDepth } from './projection.ts'

// Something to hit: takes damage and statuses like an enemy, never fights back, and
// stands back up a few seconds after being beaten.

const RADIUS = 39
export const DUMMY_TEXTURE = 'training-dummy'

export class TrainingDummy {
  readonly target: Target
  private sprite: Phaser.GameObjects.Image
  private bars: Phaser.GameObjects.Graphics
  private downFor = 0
  private flash = 0

  constructor(scene: Phaser.Scene, world: CombatWorld, at: Vec, getStatus: (id: string) => StatusDef) {
    const actor = new Combatant({ vitals: TRAINING_DUMMY_VITALS, maxHp: TRAINING_DUMMY_VITALS.health, getStatus })
    actor.onDamaged = (_amount, periodic) => {
      if (!periodic) this.flash = 0.1
    }
    this.target = world.add({ actor, team: 'enemy', x: at.x, y: at.y, radius: RADIUS })
    // The art's foot is at (48, 118) of 96 x 128.
    this.sprite = scene.add.image(at.x, at.y, DUMMY_TEXTURE).setOrigin(0.5, 118 / 128).setDepth(standingDepth(at.y))
    this.bars = scene.add.graphics().setDepth(LAYER.overhead)
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
    this.flash = Math.max(0, this.flash - dt)
    this.draw()
  }

  private draw() {
    const { x, y } = this.target
    const a = this.target.actor
    // Knocked flat when beaten; a white flash when hit.
    this.sprite.setPosition(x, y).setAngle(a.alive ? 0 : 80).setAlpha(a.alive ? 1 : 0.7)
    if (this.flash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
    else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)

    // Health and status meters above its head.
    const g = this.bars
    g.clear()
    const w = 90
    const top = y - 142
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
