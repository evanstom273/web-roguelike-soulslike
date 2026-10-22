import * as Phaser from 'phaser'
import playerUrl from './art/player.svg?no-inline'
import { CombatWorld, type LandedHit } from './combat/CombatWorld.ts'
import { SpellSystem } from './combat/SpellSystem.ts'
import { getStatus } from './data/registry.ts'
import { generateFloor } from './dungeon/generateFloor.ts'
import type { HudStore } from './hudStore.ts'
import type { ActionButton, InputState } from './input.ts'
import type { Loadout } from './player/character.ts'
import { Player, weaponTextureKey } from './player/Player.ts'
import { buildFloorGeometry, type FloorGeometry, type Vec } from './world/floorGeometry.ts'
import { TrainingDummy } from './world/TrainingDummy.ts'

export interface RunSceneData {
  seed: string
  loadout: Loadout
  input: InputState
  hud: HudStore
}

// How much of the world fits on the shorter screen side, in world px.
const VIEW_SHORT_SIDE = 750

export class RunScene extends Phaser.Scene {
  private run!: RunSceneData
  private player!: Player
  private world!: CombatWorld
  private spells!: SpellSystem
  private dummies: TrainingDummy[] = []
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private mousePressed = new Set<ActionButton>()
  private hitStop = 0
  private reticle!: Phaser.GameObjects.Graphics
  // Camera target that tracks the player without the camera owning the player object.
  private playerAnchor = { x: 0, y: 0 }

  constructor() {
    super('run')
  }

  init(data: RunSceneData) {
    this.run = data
  }

  preload() {
    // Rasterised at native size: 1 SVG unit = 1 world pixel.
    this.load.svg('player', playerUrl, { width: 96, height: 96 })
    for (const w of this.run.loadout.weapons) {
      this.load.svg(weaponTextureKey(w.id), w.art.url, { width: w.art.width, height: w.art.height })
    }
  }

  create() {
    const floor = generateFloor(this.run.seed, { width: 16, height: 16 })
    const geometry = buildFloorGeometry(floor)
    this.drawFloor(geometry)

    this.world = new CombatWorld(geometry.walls)
    this.world.onHit = (hit) => this.onHit(hit)
    this.spells = new SpellSystem(this, this.world, getStatus)
    this.player = new Player(this, geometry.spawn, geometry.walls, this.run.loadout, this.world, this.spells, getStatus)

    this.reticle = this.add.graphics().setDepth(13)

    // Training dummies in the start room, for trying weapons, spells and lock-on.
    this.dummies.push(new TrainingDummy(this, this.world, { x: geometry.spawn.x + 220, y: geometry.spawn.y }, getStatus))
    this.dummies.push(new TrainingDummy(this, this.world, { x: geometry.spawn.x + 120, y: geometry.spawn.y + 230 }, getStatus))

    const cam = this.cameras.main
    cam.setBackgroundColor('#05070d')
    this.playerAnchor.x = geometry.spawn.x
    this.playerAnchor.y = geometry.spawn.y
    cam.startFollow(this.playerAnchor, false, 0.18, 0.18)
    this.fitCamera()
    this.scale.on('resize', this.fitCamera, this)

    const kb = this.input.keyboard!
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,K,L,F,Q,E,R,U,TAB') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.mouse?.disableContextMenu()
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return // touch has its own on-screen buttons
      this.mousePressed.add(p.middleButtonDown() ? 'lock' : p.rightButtonDown() ? 'heavy' : 'light')
    })
  }

  private fitCamera() {
    const { width, height } = this.scale.gameSize
    this.cameras.main.setZoom(Phaser.Math.Clamp(Math.min(width, height) / VIEW_SHORT_SIDE, 0.45, 1.05))
  }

  private onHit(hit: LandedHit) {
    this.damageNumber(hit.target, hit.outcome.damage, hit.payload.periodic ?? false)
    if (hit.recurring || hit.payload.periodic) return
    const a = hit.payload.attack
    if (a.hitStop > 0) this.hitStop = Math.max(this.hitStop, a.hitStop)
    if (a.cameraShake > 0) this.cameras.main.shake(120, Math.min(0.012, a.cameraShake * 0.0009))
  }

  private damageNumber(at: Vec, amount: number, periodic: boolean) {
    if (amount <= 0) return
    const text = this.add
      .text(at.x + (Math.random() - 0.5) * 20, at.y - 40, String(amount), {
        fontFamily: 'Chakra Petch, sans-serif',
        fontSize: periodic ? '16px' : '22px',
        color: periodic ? '#c9b6ff' : '#fff4d6',
        stroke: '#05070d',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20)
    this.tweens.add({ targets: text, y: text.y - 36, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => text.destroy() })
  }

  update(_time: number, deltaMs: number) {
    let dt = Math.min(deltaMs / 1000, 1 / 20) // don't teleport through walls after a hitch
    if (this.hitStop > 0) {
      // Hit-stop: freeze the action for a few frames when a blow lands.
      this.hitStop -= dt
      dt = 0
    }
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
    if (JustDown(k.E)) pressed.add('weapon')
    if (JustDown(k.Q)) pressed.add('spell')
    if (JustDown(k.U)) pressed.add('left')
    if (JustDown(k.R)) pressed.add('leftWeapon')
    if (JustDown(k.TAB)) pressed.add('lock')

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
    const mouse = !pointer.wasTouch
    const intent = {
      move: { x: mx, y: my },
      pressed,
      lightHeld: k.J.isDown || (mouse && pointer.leftButtonDown()) || input.isTouchHeld('light'),
      heavyHeld: k.K.isDown || (mouse && pointer.rightButtonDown()) || input.isTouchHeld('heavy'),
      leftHeld: k.U.isDown || input.isTouchHeld('left'),
      rollHeld: k.SPACE.isDown || input.isTouchHeld('roll'),
      cycleWeapon: pressed.has('weapon'),
      cycleLeftWeapon: pressed.has('leftWeapon'),
      cycleSpell: pressed.has('spell'),
      lock: pressed.has('lock'),
      lockHeld: k.TAB.isDown || (mouse && pointer.middleButtonDown()) || input.isTouchHeld('lock'),
    }

    if (dt > 0) {
      this.player.update(dt, intent)
      this.spells.update(dt)
      for (const d of this.dummies) d.update(dt)
    }
    this.playerAnchor.x = this.player.x
    this.playerAnchor.y = this.player.y
    this.drawReticle(_time)

    const p = this.player
    const spell = p.selectedSpell
    hud.update({
      hp: p.hp,
      maxHp: p.maxHp,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      runes: 0,
      charge: p.charge,
      weaponId: p.weapon.id,
      leftWeaponId: p.leftWeapon?.id ?? null,
      spellName: spell?.name ?? null,
      spellCharges: spell ? (spell.basic ? -1 : p.chargesLeft(spell)) : 0,
      skillCooldown: p.skillCooldown ?? -1,
      inCombat: p.inCombat,
      statuses: [...p.actor.meters.values()].map((m) => ({
        id: m.status.id,
        name: m.status.name,
        colour: m.status.colour,
        fill: m.cooldown > 0 ? 1 : Math.round((m.value / m.threshold) * 50) / 50,
        triggered: m.cooldown > 0,
      })),
      effects: [...p.actor.effects.values()].map((e) => e.def.name),
      notice: p.notice?.text ?? null,
    })
  }

  /** Lock-on marker: four brackets turning slowly around the target. */
  private drawReticle(time: number) {
    const g = this.reticle
    g.clear()
    const t = this.player.lockedTarget
    if (!t) return
    const r = t.radius + 14
    const spin = time / 900
    g.lineStyle(3, 0xffffff, 0.9)
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2
      g.beginPath()
      g.arc(t.x, t.y, r, a - 0.35, a + 0.35)
      g.strokePath()
    }
    g.fillStyle(0xff3d8b, 0.9)
    g.fillCircle(t.x, t.y - r - 8, 4)
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
