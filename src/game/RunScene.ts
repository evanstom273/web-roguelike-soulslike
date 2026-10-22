import * as Phaser from 'phaser'
import descentUrl from './art/props/descent.svg?no-inline'
import dummyUrl from './art/props/training-dummy.svg?no-inline'
import { CombatWorld, type LandedHit } from './combat/CombatWorld.ts'
import { SpellSystem } from './combat/SpellSystem.ts'
import { enemiesPerSlot, threat } from './data/difficulty.ts'
import { ENEMIES, getStatus, getWeapon } from './data/registry.ts'
import { generateFloor } from './dungeon/generateFloor.ts'
import { hexToPixel } from './dungeon/hex.ts'
import { Enemy } from './enemies/Enemy.ts'
import type { HudStore } from './hudStore.ts'
import type { ActionButton, InputState } from './input.ts'
import type { Loadout } from './player/character.ts'
import { preloadCharacter } from './player/characterArt.ts'
import { Player, weaponTextureKey } from './player/Player.ts'
import { biomeForFloor, type BiomeDef } from './world/biomes.ts'
import { buildEnvironment, preloadEnvironment, type Environment } from './world/environment.ts'
import { buildFloorGeometry, CELL_SIZE, type Vec } from './world/floorGeometry.ts'
import { LAYER } from './world/projection.ts'
import { SHARD_NAME } from './data/progression.ts'
import { createRng, pick } from './random.ts'
import { DUMMY_TEXTURE, TrainingDummy } from './world/TrainingDummy.ts'

export interface RunSceneData {
  seed: string
  floor: number // which floor of the descent; picks the biome
  loadout: Loadout
  input: InputState
  hud: HudStore
  /** Sandbox runs (nothing is saved) keep training dummies in the start room. */
  sandbox: boolean
  /** Runes carried and seconds into the run so far: a run carries on across floors. */
  runes: number
  runTime: number
  events: RunEvents
}

/** Where a run stands: runes carried, shards found this run, seconds in. */
export interface RunProgress {
  runes: number
  shards: number
  runTime: number
}

export interface RunEvents {
  /** Something worth saving changed (a kill). */
  onProgress(p: RunProgress): void
  /** The player died. Fires once. */
  onDied(p: RunProgress): void
  /** The player took the way down. */
  onDescend(p: RunProgress): void
}

// Slow motion for looking at animation closely: add ?timescale=0.2 to the URL.
const TIME_SCALE = Math.max(0.05, Math.min(1, Number(new URLSearchParams(location.search).get('timescale')) || 1))

// How much of the world fits on the shorter screen side, in world px.
const VIEW_SHORT_SIDE = 750

const AUTOSAVE_EVERY = 10 // seconds of run time

const DESCENT_TEXTURE = 'descent'
// Standing within this of the stairwell's middle offers the way down.
const DESCENT_REACH = 95

export class RunScene extends Phaser.Scene {
  private run!: RunSceneData
  private player!: Player
  private world!: CombatWorld
  private spells!: SpellSystem
  private dummies: TrainingDummy[] = []
  private enemies: Enemy[] = []
  private runes = 0
  private shards = 0
  private runTime = 0
  private exit: Vec = { x: 0, y: 0 }
  private atExit = false
  private deathReported = false
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
    this.runes = data.runes
    this.runTime = data.runTime
    this.shards = 0
    this.enemies = []
    this.dummies = []
    this.deathReported = false
  }

  preload() {
    // Rasterised at native size: 1 SVG unit = 1 world pixel.
    preloadCharacter(this, this.run.loadout.appearance)
    this.load.svg(DUMMY_TEXTURE, dummyUrl, { width: 96, height: 128 })
    this.load.svg(DESCENT_TEXTURE, descentUrl, { width: 280, height: 210 })
    preloadEnvironment(this, this.biome)
    const weapons = new Map(this.run.loadout.weapons.map((w) => [w.id, w]))
    for (const e of ENEMIES.values()) {
      preloadCharacter(this, e.look)
      if (e.weapon && !weapons.has(e.weapon)) weapons.set(e.weapon, getWeapon(e.weapon))
    }
    for (const w of weapons.values()) {
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
    // Dev builds only: the scene on window, for poking at from the console or a test.
    if (import.meta.env.DEV) Object.assign(window, { runScene: this })

    // Sandbox: training dummies in the start room, for trying weapons, spells and lock-on.
    if (this.run.sandbox) {
      this.dummies.push(new TrainingDummy(this, this.world, { x: geometry.spawn.x + 220, y: geometry.spawn.y }, getStatus))
      this.dummies.push(new TrainingDummy(this, this.world, { x: geometry.spawn.x + 120, y: geometry.spawn.y + 230 }, getStatus))
    }

    // Enemies in every room but the start and the boss room, tougher the deeper you are
    // and the longer the run has gone on.
    const rng = createRng(`${this.run.seed}:enemies`)
    const roster = [...ENEMIES.values()]
    const scale = threat(this.run.floor, this.runTime)
    for (const r of geometry.rooms) {
      if (r.room.kind !== 'normal') continue
      for (const slot of r.room.slots) {
        const c = hexToPixel(slot, CELL_SIZE)
        for (let i = 0; i < enemiesPerSlot; i++) {
          const a = rng() * Math.PI * 2
          const d = rng() * CELL_SIZE * 0.35
          const e = new Enemy(this, pick(rng, roster), { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }, scale, this.world, this.spells, geometry.walls, this.player, getStatus)
          e.onKilled = (dead) => this.reward(dead)
          this.enemies.push(e)
        }
      }
    }

    // The way down, in the middle of the boss room (until bosses guard it).
    this.exit = geometry.rooms[floor.bossRoom].centre
    this.add.image(this.exit.x, this.exit.y, DESCENT_TEXTURE).setDepth(LAYER.floorProp)

    const cam = this.cameras.main
    this.playerAnchor.x = geometry.spawn.x
    this.playerAnchor.y = geometry.spawn.y
    cam.startFollow(this.playerAnchor, false, 0.18, 0.18)
    this.fitCamera()
    this.scale.on('resize', this.fitCamera, this)

    const kb = this.input.keyboard!
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,K,L,F,Q,E,R,U,TAB,ENTER') as Record<string, Phaser.Input.Keyboard.Key>
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

  /** Runes for a kill (more the longer the run has gone on), and maybe a smithing shard. */
  private reward(e: Enemy) {
    const runes = Math.round(e.def.runes * threat(this.run.floor, this.runTime).runes)
    this.runes += runes
    this.floatText(e, `+${runes}`, '#e6c879', 0)
    if (Math.random() < e.def.shardChance * this.run.loadout.stats.lootLuck) {
      this.shards += 1
      this.floatText(e, `+1 ${SHARD_NAME}`, '#9fd3e0', 26)
    }
    this.run.events.onProgress(this.progress())
  }

  private progress(): RunProgress {
    return { runes: this.runes, shards: this.shards, runTime: this.runTime }
  }

  private floatText(at: Vec, text: string, colour: string, lift: number) {
    const t = this.add
      .text(at.x, at.y - 150 - lift, text, { fontFamily: 'Cinzel, serif', fontSize: '18px', color: colour, stroke: '#0a0907', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(LAYER.text)
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, delay: 500, duration: 1100, ease: 'Cubic.Out', onComplete: () => t.destroy() })
  }

  private onHit(hit: LandedHit) {
    if (hit.target.team === 'enemy' || hit.target === this.player.self) this.player.enterCombat()
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
      for (const e of this.enemies) e.update(dt)
      this.enemies = this.enemies.filter((e) => !e.removed)
      if (!this.player.dead) {
        this.runTime += dt
        // Save where the run stands every so often, so quitting doesn't lose the clock.
        if (Math.floor(this.runTime / AUTOSAVE_EVERY) !== Math.floor((this.runTime - dt) / AUTOSAVE_EVERY)) this.run.events.onProgress(this.progress())
      }
    }
    const p = this.player

    // Dying ends the run; the game view takes it from here.
    if (p.dead && !this.deathReported) {
      this.deathReported = true
      this.run.events.onDied(this.progress())
    }
    // The way down: stand on the stairwell and press Enter or the on-screen button.
    this.atExit = !p.dead && Math.hypot(p.x - this.exit.x, p.y - this.exit.y) < DESCENT_REACH
    if (input.takeDescend() || JustDown(k.ENTER)) {
      if (this.atExit) {
        this.run.events.onDescend(this.progress())
        this.atExit = false
      }
    }
    this.playerAnchor.x = this.player.x
    this.playerAnchor.y = this.player.y
    this.env.follow(this.player)
    this.env.update(_time)
    this.drawReticle(_time)

    const spell = p.selectedSpell
    hud.update({
      hp: p.hp,
      maxHp: p.maxHp,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      runes: this.runes,
      shards: this.shards,
      atExit: this.atExit,
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
