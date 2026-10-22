import * as Phaser from 'phaser'
import dummyUrl from './art/props/training-dummy.svg?no-inline'
import { CombatWorld, type LandedHit } from './combat/CombatWorld.ts'
import { SpellSystem } from './combat/SpellSystem.ts'
import { getStatus } from './data/registry.ts'
import { generateFloor } from './dungeon/generateFloor.ts'
import type { HudStore } from './hudStore.ts'
import type { ActionButton, InputState } from './input.ts'
import type { Loadout } from './player/character.ts'
import { preloadCharacter } from './player/characterArt.ts'
import { Player, weaponTextureKey } from './player/Player.ts'
import { biomeForFloor, type BiomeDef } from './world/biomes.ts'
import { buildEnvironment, preloadEnvironment, type Environment } from './world/environment.ts'
import { buildFloorGeometry, type Vec } from './world/floorGeometry.ts'
import { LAYER } from './world/projection.ts'
import { DUMMY_TEXTURE, TrainingDummy } from './world/TrainingDummy.ts'

export interface RunSceneData {
  seed: string
  floor: number // which floor of the descent; picks the biome
  loadout: Loadout
  input: InputState
  hud: HudStore
}

// Slow motion for looking at animation closely: add ?timescale=0.2 to the URL.
const TIME_SCALE = Math.max(0.05, Math.min(1, Number(new URLSearchParams(location.search).get('timescale')) || 1))

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
  private biome!: BiomeDef
  private env!: Environment
  // Camera target that tracks the player without the camera owning the player object.
  private playerAnchor = { x: 0, y: 0 }

  constructor() {
    super('run')
  }

  init(data: RunSceneData) {
    this.run = data
    this.biome = biomeForFloor(data.floor)
  }

  preload() {
    // Rasterised at native size: 1 SVG unit = 1 world pixel.
    preloadCharacter(this, this.run.loadout.appearance)
    this.load.svg(DUMMY_TEXTURE, dummyUrl, { width: 96, height: 128 })
    preloadEnvironment(this, this.biome)
    for (const w of this.run.loadout.weapons) {
      this.load.svg(weaponTextureKey(w.id), w.art.url, { width: w.art.width, height: w.art.height })
    }
  }

  create() {
    const floor = generateFloor(this.run.seed, { width: 16, height: 16 })
    const geometry = buildFloorGeometry(floor)
    this.env = buildEnvironment(this, floor, geometry, this.biome)

    this.world = new CombatWorld(geometry.walls)
    this.world.onHit = (hit) => this.onHit(hit)
    this.spells = new SpellSystem(this, this.world, getStatus)
    this.player = new Player(this, geometry.spawn, geometry.walls, this.run.loadout, this.world, this.spells, getStatus)

    this.reticle = this.add.graphics().setDepth(LAYER.reticle)

    // Training dummies in the start room, for trying weapons, spells and lock-on.
    this.dummies.push(new TrainingDummy(this, this.world, { x: geometry.spawn.x + 220, y: geometry.spawn.y }, getStatus))
    this.dummies.push(new TrainingDummy(this, this.world, { x: geometry.spawn.x + 120, y: geometry.spawn.y + 230 }, getStatus))

    const cam = this.cameras.main
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
      .text(at.x + (Math.random() - 0.5) * 20, at.y - 120, String(amount), {
        fontFamily: 'Cinzel, serif',
        fontSize: periodic ? '16px' : '22px',
        color: periodic ? '#d9c08a' : '#fff4d6',
        stroke: '#0a0907',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(LAYER.text)
    this.tweens.add({ targets: text, y: text.y - 36, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => text.destroy() })
  }

  update(_time: number, deltaMs: number) {
    let dt = Math.min(deltaMs / 1000, 1 / 20) * TIME_SCALE // don't teleport through walls after a hitch
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
    this.env.follow(this.player)
    this.env.update(_time)
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

  /** Lock-on marker: brackets turning on the ground around the target, a gem above its head. */
  private drawReticle(time: number) {
    const g = this.reticle
    g.clear()
    const t = this.player.lockedTarget
    if (!t) return
    const r = t.radius + 14
    const spin = time / 900
    g.lineStyle(3, 0xffffff, 0.8)
    for (let i = 0; i < 4; i++) {
      // Points on a flattened ring so it reads as lying on the floor.
      const a = spin + (i * Math.PI) / 2
      g.beginPath()
      for (let k = 0; k <= 6; k++) {
        const b = a - 0.35 + (0.7 * k) / 6
        const px = t.x + Math.cos(b) * r
        const py = t.y + Math.sin(b) * r * 0.55
        if (k === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
    }
    const bob = Math.sin(time / 250) * 3
    const top = t.y - 128 - 14 + bob
    g.fillStyle(0xd9a35b, 0.95)
    g.fillTriangle(t.x, top + 10, t.x - 6, top, t.x + 6, top)
  }
}
