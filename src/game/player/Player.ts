import type * as Phaser from 'phaser'
import type { ActionButton } from '../input.ts'
import { resolveWalls, type Segment, type Vec } from '../world/floorGeometry.ts'
import { CHARGE, CHARGED, COOLDOWN, HEAVY, LIGHT, PLAYER, ROLL, SPRINT, type SwingTuning } from './tuning.ts'

export interface PlayerIntent {
  move: Vec // length 0..1
  pressed: Set<ActionButton>
  heavyHeld: boolean
  rollHeld: boolean
}

type SwingKind = 'light' | 'heavy' | 'charged'

type State =
  | { kind: 'free' }
  | { kind: 'roll'; t: number; dir: number }
  | { kind: 'heavyHold'; t: number } // heavy pressed; becomes a charge if held long enough
  | { kind: 'charging'; t: number }
  | { kind: 'swing'; t: number; swing: SwingKind; tuning: SwingTuning; side: 1 | -1; charge: number }

const SWINGS: Record<SwingKind, SwingTuning> = { light: LIGHT, heavy: HEAVY, charged: CHARGED }
const HAND = { x: 14.5, y: 11.5 } // weapon hand relative to body centre, facing +x
const REST_ANGLE = 0.5 // weapon angle when idle, radians from facing
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const degToRad = (d: number) => (d * Math.PI) / 180

export class Player {
  x: number
  y: number
  facing = 0
  hp = PLAYER.maxHp
  fp = PLAYER.maxFp
  stamina = PLAYER.maxStamina
  notice: { text: string; until: number } | null = null

  private state: State = { kind: 'free' }
  private buffered: { button: ActionButton; at: number } | null = null
  private lastStaminaSpend = -Infinity
  private time = 0
  private nextSide: 1 | -1 = 1
  private rollDownAt: number | null = null // when the roll button went down, until it's released
  private sprinting = false
  private lastAttackAt = { light: -Infinity, heavy: -Infinity }

  private root: Phaser.GameObjects.Container
  private body: Phaser.GameObjects.Image
  private weapon: Phaser.GameObjects.Image
  private fx: Phaser.GameObjects.Graphics
  private trail: { x: number; y: number; facing: number; age: number }[] = []
  private trailGfx: Phaser.GameObjects.Graphics

  private walls: Segment[]

  constructor(scene: Phaser.Scene, spawn: Vec, walls: Segment[]) {
    this.walls = walls
    this.x = spawn.x
    this.y = spawn.y
    this.trailGfx = scene.add.graphics().setDepth(9)
    this.fx = scene.add.graphics().setDepth(11)
    this.weapon = scene.add.image(HAND.x, HAND.y, 'blade').setOrigin(6 / 88, 0.5)
    this.body = scene.add.image(0, 0, 'player')
    this.root = scene.add.container(this.x, this.y, [this.weapon, this.body]).setDepth(10)
  }

  get invulnerable() {
    return this.state.kind === 'roll' && this.state.t >= ROLL.invulnerable[0] && this.state.t <= ROLL.invulnerable[1]
  }

  /** 0..1 while charging a heavy attack. */
  get charge() {
    return this.state.kind === 'charging' ? Math.min(1, this.state.t / (CHARGE.maxCharge - CHARGE.holdToCharge)) : 0
  }

  update(dt: number, intent: PlayerIntent) {
    this.time += dt
    for (const button of intent.pressed) {
      if (button === 'roll') this.rollDownAt = this.time
      else this.buffered = { button, at: this.time }
    }
    // Roll fires when a short press is released; a long hold is a sprint instead.
    const rollHeldFor = this.rollDownAt === null ? 0 : this.time - this.rollDownAt
    if (this.rollDownAt !== null && !intent.rollHeld) {
      if (rollHeldFor < SPRINT.holdThreshold) this.buffered = { button: 'roll', at: this.time }
      this.rollDownAt = null
    }
    if (this.buffered && this.time - this.buffered.at > PLAYER.inputBuffer) this.buffered = null

    const moving = Math.hypot(intent.move.x, intent.move.y) > 0.15
    this.sprinting =
      this.state.kind === 'free' && moving && this.rollDownAt !== null && rollHeldFor >= SPRINT.holdThreshold && this.stamina > 0
    const moveDir = Math.atan2(intent.move.y, intent.move.x)

    switch (this.state.kind) {
      case 'free': {
        const speed = this.sprinting ? SPRINT.speed : PLAYER.walkSpeed
        this.move(intent.move.x * speed * dt, intent.move.y * speed * dt)
        if (this.sprinting) this.spendStamina(SPRINT.stamina * dt)
        if (moving) this.facing = moveDir
        this.takeBufferedAction(moving ? moveDir : this.facing)
        break
      }
      case 'roll': {
        const s = this.state
        const before = easeOut(Math.min(1, s.t / ROLL.duration))
        s.t += dt
        const after = easeOut(Math.min(1, s.t / ROLL.duration))
        const step = (after - before) * ROLL.distance
        this.move(Math.cos(s.dir) * step, Math.sin(s.dir) * step)
        if (s.t >= ROLL.duration + ROLL.recovery) {
          this.state = { kind: 'free' }
        } else if (s.t >= ROLL.duration) {
          if (moving) this.facing = moveDir
          this.takeBufferedAction(moving ? moveDir : this.facing)
        }
        break
      }
      case 'heavyHold': {
        this.state.t += dt
        if (!intent.heavyHeld) this.startSwing('heavy', 0)
        else if (this.state.t >= CHARGE.holdToCharge) this.state = { kind: 'charging', t: 0 }
        break
      }
      case 'charging': {
        this.state.t += dt
        if (moving) this.facing = moveDir // can still turn while winding up
        if (!intent.heavyHeld || this.state.t >= CHARGE.maxCharge - CHARGE.holdToCharge) {
          this.startSwing('charged', this.charge)
        }
        break
      }
      case 'swing': {
        const s = this.state
        const { windup, active, recovery, lunge } = s.tuning
        const prevT = s.t
        s.t += dt
        // Step forward over the active part of the swing.
        const lungeAt = (t: number) => Math.min(1, Math.max(0, (t - windup) / active))
        const step = (lungeAt(s.t) - lungeAt(prevT)) * lunge
        this.move(Math.cos(this.facing) * step, Math.sin(this.facing) * step)

        const recovering = s.t >= windup + active
        if (recovering && this.buffered) {
          // Rolls cancel recovery straight away; attacks chain once a bit of recovery has played.
          const intoRecovery = s.t - windup - active
          if (this.buffered.button === 'roll' || intoRecovery >= recovery * 0.35) {
            if (moving) this.facing = moveDir
            if (this.takeBufferedAction(moving ? moveDir : this.facing)) break
          }
        }
        if (s.t >= windup + active + recovery) this.state = { kind: 'free' }
        break
      }
    }

    this.regenStamina(dt)
    if (this.notice && this.time > this.notice.until) this.notice = null
    this.render(dt)
  }

  private takeBufferedAction(dir: number): boolean {
    const b = this.buffered
    if (!b) return false
    if (b.button === 'art') {
      this.buffered = null
      this.notice = { text: 'No skill', until: this.time + 1.2 }
      return false
    }
    if (this.stamina <= 0) return false // keep it buffered in case stamina comes back in time
    // Still cooling down: keep it buffered, so a press just before the cooldown ends still counts.
    if (b.button === 'light' && this.time - this.lastAttackAt.light < COOLDOWN.light) return false
    if (b.button === 'heavy' && this.time - this.lastAttackAt.heavy < COOLDOWN.heavy) return false
    this.buffered = null
    if (b.button === 'roll') {
      this.spendStamina(ROLL.stamina)
      this.facing = dir
      this.state = { kind: 'roll', t: 0, dir }
    } else if (b.button === 'light') {
      this.startSwing('light', 0)
    } else if (b.button === 'heavy') {
      this.state = { kind: 'heavyHold', t: 0 }
    }
    return true
  }

  private startSwing(swing: SwingKind, charge: number) {
    const tuning = SWINGS[swing]
    this.spendStamina(tuning.stamina)
    this.lastAttackAt[swing === 'light' ? 'light' : 'heavy'] = this.time
    this.state = { kind: 'swing', t: 0, swing, tuning, side: this.nextSide, charge }
    this.nextSide = this.nextSide === 1 ? -1 : 1
  }

  private spendStamina(amount: number) {
    this.stamina = Math.max(0, this.stamina - amount)
    this.lastStaminaSpend = this.time
  }

  private regenStamina(dt: number) {
    // Like the Souls games, stamina only comes back while you're not rolling or attacking.
    const busy = this.sprinting || this.state.kind === 'roll' || this.state.kind === 'swing' || this.state.kind === 'charging'
    if (busy || this.time - this.lastStaminaSpend < PLAYER.staminaRegenDelay) return
    this.stamina = Math.min(PLAYER.maxStamina, this.stamina + PLAYER.staminaRegen * dt)
  }

  private move(dx: number, dy: number) {
    const p = resolveWalls({ x: this.x + dx, y: this.y + dy }, PLAYER.radius, this.walls)
    this.x = p.x
    this.y = p.y
  }

  private render(dt: number) {
    this.root.setPosition(this.x, this.y).setRotation(this.facing)
    this.fx.clear()

    // Roll: slight squash plus a fading afterimage trail.
    const rolling = this.state.kind === 'roll' && this.state.t < ROLL.duration
    this.root.setScale(rolling ? 0.9 : 1)
    this.body.setAlpha(this.invulnerable ? 0.75 : 1)
    if (rolling || (this.sprinting && Math.random() < 0.35)) this.trail.push({ x: this.x, y: this.y, facing: this.facing, age: 0 })
    this.trailGfx.clear()
    this.trail = this.trail.filter((g) => (g.age += dt) < 0.22)
    for (const g of this.trail) {
      this.trailGfx.fillStyle(0x38e8ff, 0.18 * (1 - g.age / 0.22))
      this.trailGfx.fillCircle(g.x, g.y, PLAYER.radius + 2)
    }

    let weaponAngle = REST_ANGLE
    if (this.state.kind === 'heavyHold' || this.state.kind === 'charging') {
      // Draw the weapon back over the shoulder.
      const pull = this.state.kind === 'charging' ? 1 : Math.min(1, this.state.t / CHARGE.holdToCharge)
      weaponAngle = REST_ANGLE + pull * 1.9
      if (this.state.kind === 'charging') this.drawChargeGlow()
    } else if (this.state.kind === 'swing') {
      weaponAngle = this.swingAngle(this.state)
      this.drawSwingArc(this.state)
    }
    this.weapon.setRotation(weaponAngle)
  }

  private swingAngle(s: Extract<State, { kind: 'swing' }>) {
    const half = degToRad(s.tuning.arc) / 2
    const start = s.side * half
    const end = -s.side * half
    const { windup, active } = s.tuning
    if (s.t < windup) return lerp(REST_ANGLE, start, easeOut(s.t / windup))
    if (s.t < windup + active) return lerp(start, end, easeOut((s.t - windup) / active))
    return end
  }

  private drawSwingArc(s: Extract<State, { kind: 'swing' }>) {
    const { windup, active, recovery, reach } = s.tuning
    if (s.t < windup) return
    const half = degToRad(s.tuning.arc) / 2
    const progress = Math.min(1, (s.t - windup) / active)
    const fade = s.t < windup + active ? 1 : Math.max(0, 1 - (s.t - windup - active) / (recovery * 0.6))
    if (fade <= 0) return
    const from = this.facing + s.side * half
    const to = this.facing + s.side * half - s.side * 2 * half * easeOut(progress)
    const colour = s.swing === 'charged' ? 0xff3d8b : 0xbff8ff
    const thickness = s.swing === 'light' ? 10 : s.swing === 'heavy' ? 16 : 22
    this.fx.lineStyle(thickness, colour, 0.35 * fade)
    this.fx.beginPath()
    this.fx.arc(this.x, this.y, reach - thickness / 2, Math.min(from, to), Math.max(from, to))
    this.fx.strokePath()
    this.fx.lineStyle(2, 0xffffff, 0.6 * fade)
    this.fx.beginPath()
    this.fx.arc(this.x, this.y, reach, Math.min(from, to), Math.max(from, to))
    this.fx.strokePath()
  }

  private drawChargeGlow() {
    const c = this.charge
    const back = this.facing + REST_ANGLE + 1.9
    const tipX = this.x + Math.cos(this.facing) * HAND.x - Math.sin(this.facing) * HAND.y + Math.cos(back) * 78
    const tipY = this.y + Math.sin(this.facing) * HAND.x + Math.cos(this.facing) * HAND.y + Math.sin(back) * 78
    this.fx.fillStyle(0xff3d8b, 0.15 + 0.25 * c)
    this.fx.fillCircle(tipX, tipY, 6 + 12 * c)
    this.fx.lineStyle(2, 0xff3d8b, 0.3 + 0.5 * c)
    this.fx.strokeCircle(this.x, this.y, PLAYER.radius + 10 + 30 * (1 - c))
  }
}
