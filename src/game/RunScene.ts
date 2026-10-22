import * as Phaser from 'phaser'
import bladeUrl from './art/blade.svg?no-inline'
import playerUrl from './art/player.svg?no-inline'
import { generateFloor } from './dungeon/generateFloor.ts'
import type { HudStore } from './hudStore.ts'
import type { ActionButton, InputState } from './input.ts'
import { Player } from './player/Player.ts'
import { PLAYER } from './player/tuning.ts'
import { buildFloorGeometry, type FloorGeometry, type Vec } from './world/floorGeometry.ts'

export interface RunSceneData {
  seed: string
  input: InputState
  hud: HudStore
}

// How much of the world fits on the shorter screen side, in world px.
const VIEW_SHORT_SIDE = 560

export class RunScene extends Phaser.Scene {
  private run!: RunSceneData
  private player!: Player
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private mousePressed = new Set<ActionButton>()

  constructor() {
    super('run')
  }

  init(data: RunSceneData) {
    this.run = data
  }

  preload() {
    // Rasterised at native size: 1 SVG unit = 1 world pixel.
    this.load.svg('player', playerUrl, { width: 64, height: 64 })
    this.load.svg('blade', bladeUrl, { width: 88, height: 16 })
  }

  create() {
    const floor = generateFloor(this.run.seed, { width: 16, height: 16 })
    const geometry = buildFloorGeometry(floor)
    this.drawFloor(geometry)
    this.player = new Player(this, geometry.spawn, geometry.walls)

    const cam = this.cameras.main
    cam.setBackgroundColor('#05070d')
    this.playerAnchor.x = geometry.spawn.x
    this.playerAnchor.y = geometry.spawn.y
    cam.startFollow(this.playerAnchor, false, 0.18, 0.18)
    this.fitCamera()
    this.scale.on('resize', this.fitCamera, this)

    const kb = this.input.keyboard!
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,K,L,F') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.mouse?.disableContextMenu()
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return // touch has its own on-screen buttons
      this.mousePressed.add(p.rightButtonDown() ? 'heavy' : 'light')
    })
  }

  // Camera target that tracks the player without the camera owning the player object.
  private playerAnchor = { x: 0, y: 0 }

  private fitCamera() {
    const { width, height } = this.scale.gameSize
    this.cameras.main.setZoom(Phaser.Math.Clamp(Math.min(width, height) / VIEW_SHORT_SIDE, 0.6, 1.4))
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 20) // don't teleport through walls after a hitch
    const { input, hud } = this.run
    const k = this.keys
    const JustDown = Phaser.Input.Keyboard.JustDown

    const pressed = input.takeTouchPresses()
    for (const b of this.mousePressed) pressed.add(b)
    this.mousePressed.clear()
    if (JustDown(k.SPACE)) pressed.add('roll')
    if (JustDown(k.J)) pressed.add('light')
    if (JustDown(k.K)) pressed.add('heavy')
    if (JustDown(k.L) || JustDown(k.F)) pressed.add('art')

    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0)
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0)
    const len = Math.hypot(mx, my)
    if (len > 0) {
      mx /= len
      my /= len
    } else {
      mx = input.touchMove.x
      my = input.touchMove.y
    }

    const pointer = this.input.activePointer
    const heavyHeld = k.K.isDown || (!pointer.wasTouch && pointer.rightButtonDown()) || input.isTouchHeld('heavy')

    const rollHeld = k.SPACE.isDown || input.isTouchHeld('roll')

    this.player.update(dt, { move: { x: mx, y: my }, pressed, heavyHeld, rollHeld })
    this.playerAnchor.x = this.player.x
    this.playerAnchor.y = this.player.y

    hud.update({
      hp: this.player.hp,
      maxHp: PLAYER.maxHp,
      fp: this.player.fp,
      maxFp: PLAYER.maxFp,
      stamina: this.player.stamina,
      maxStamina: PLAYER.maxStamina,
      runes: 0,
      charge: this.player.charge,
      notice: this.player.notice?.text ?? null,
    })
  }

  // Placeholder floor rendering so there's somewhere to move. Not final environment art.
  private drawFloor(g: FloorGeometry) {
    const gfx = this.add.graphics().setDepth(0)
    const fill = (pts: Vec[], colour: number, alpha = 1) => {
      gfx.fillStyle(colour, alpha)
      gfx.fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true)
    }

    for (const h of g.hallways) fill(h.corners, 0x0e1522)
    for (const r of g.rooms) {
      const colour = r.room.kind === 'boss' ? 0x241122 : r.room.kind === 'start' ? 0x0f2128 : 0x121a29
      for (const cell of r.cells) fill(cell, colour)
      // Faint panel seams between cells.
      gfx.lineStyle(2, 0x1c2a42, 0.8)
      for (const cell of r.cells) gfx.strokePoints(cell.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true)
    }

    const walls = this.add.graphics().setDepth(5)
    walls.lineStyle(14, 0x1d2840, 1)
    walls.fillStyle(0x1d2840, 1)
    for (const w of g.walls) {
      walls.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y)
      // Round joints so angled wall segments meet without notches.
      walls.fillCircle(w.a.x, w.a.y, 7)
      walls.fillCircle(w.b.x, w.b.y, 7)
    }
    walls.lineStyle(3, 0x38e8ff, 0.45)
    for (const w of g.walls) walls.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y)
  }
}
