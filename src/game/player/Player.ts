import type * as Phaser from 'phaser'
import { scaledDamage } from '../data/damage.ts'
import type { MeleeWeaponDef, MoveDef, SpellDef } from '../data/types.ts'
import type { ActionButton } from '../input.ts'
import { resolveWalls, type Segment, type Vec } from '../world/floorGeometry.ts'
import type { Loadout } from './character.ts'
import { PLAYER, ROLL, SPRINT } from './tuning.ts'

export interface PlayerIntent {
  move: Vec // length 0..1
  pressed: Set<ActionButton>
  heavyHeld: boolean
  rollHeld: boolean
}

/** A spell leaving the caster, for the scene to turn into a projectile or other effect. */
export interface CastEvent {
  spell: SpellDef
  damage: number
  x: number
  y: number
  angle: number
}

type SwingKind = 'light' | 'heavy' | 'charged' | 'skill'

type State =
  | { kind: 'free' }
  | { kind: 'roll'; t: number; dir: number }
  | { kind: 'heavyHold'; t: number } // heavy pressed; becomes a charge if held long enough
  | { kind: 'charging'; t: number }
  | { kind: 'swing'; t: number; swing: SwingKind; move: MoveDef; damage: number; side: 1 | -1 }
  | { kind: 'cast'; t: number; spell: SpellDef; castTime: number; released: boolean }

const HAND = { x: 14.5, y: 11.5 } // weapon hand relative to body centre, facing +x
const REST_ANGLE = 0.5 // weapon angle when idle, radians from facing
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const degToRad = (d: number) => (d * Math.PI) / 180

export class Player {
  x: number
  y: number
  facing = 0
  readonly maxHp: number
  readonly maxStamina: number
  hp: number
  stamina: number
  notice: { text: string; until: number } | null = null
  /** Remaining uses of each attuned spell, same order as the loadout's spells. */
  readonly spellCharges: number[]
  readonly maxSpellCharges: number[]
  spellIndex = 0

  private loadout: Loadout
  private state: State = { kind: 'free' }
  private buffered: { button: ActionButton; at: number } | null = null
  private lastStaminaSpend = -Infinity
  private time = 0
  private nextSide: 1 | -1 = 1
  private rollDownAt: number | null = null // when the roll button went down, until it's released
  private sprinting = false
  private lastAttackAt = { light: -Infinity, heavy: -Infinity }
  private skillReadyAt = 0
  private onCast: (e: CastEvent) => void

  private root: Phaser.GameObjects.Container
  private body: Phaser.GameObjects.Image
  private weapon: Phaser.GameObjects.Image
  private fx: Phaser.GameObjects.Graphics
  private trail: { x: number; y: number; facing: number; age: number }[] = []
  private trailGfx: Phaser.GameObjects.Graphics

  private walls: Segment[]

  constructor(scene: Phaser.Scene, spawn: Vec, walls: Segment[], loadout: Loadout, onCast: (e: CastEvent) => void) {
    this.walls = walls
    this.loadout = loadout
    this.onCast = onCast
    this.x = spawn.x
    this.y = spawn.y
    this.maxHp = this.hp = loadout.stats.maxHp
    this.maxStamina = this.stamina = loadout.stats.maxStamina
    this.maxSpellCharges = loadout.spells.map((s) => s.charges + loadout.stats.extraSpellCharges)
    this.spellCharges = [...this.maxSpellCharges]

    const w = loadout.weapon
    this.trailGfx = scene.add.graphics().setDepth(9)
    this.fx = scene.add.graphics().setDepth(11)
    this.weapon = scene.add.image(HAND.x, HAND.y, weaponTextureKey(w.id)).setOrigin(w.art.grip.x / w.art.width, w.art.grip.y / w.art.height)
    this.body = scene.add.image(0, 0, 'player')
    this.root = scene.add.container(this.x, this.y, [this.weapon, this.body]).setDepth(10)
  }

  get invulnerable() {
    return this.state.kind === 'roll' && this.state.t >= ROLL.invulnerable[0] && this.state.t <= ROLL.invulnerable[1]
  }

  private get melee(): MeleeWeaponDef | null {
    return this.loadout.weapon.kind === 'melee' ? this.loadout.weapon : null
  }

  /** 0..1 while charging a heavy attack. */
  get charge() {
    const m = this.melee
    if (!m || this.state.kind !== 'charging') return 0
    return Math.min(1, this.state.t / (m.charge.maxCharge - m.charge.holdToCharge))
  }

  /** Remaining skill cooldown as 0..1 of the full cooldown, or null with no skill. */
  get skillCooldown(): number | null {
    const skill = this.loadout.weapon.skill
    if (!skill) return null
    return Math.max(0, this.skillReadyAt - this.time) / skill.cooldown
  }

  get selectedSpell(): SpellDef | null {
    return this.loadout.spells[this.spellIndex] ?? null
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
    const melee = this.melee

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
        if (!melee) break
        this.state.t += dt
        if (!intent.heavyHeld) this.startSwing('heavy', melee.heavy)
        else if (this.state.t >= melee.charge.holdToCharge) this.state = { kind: 'charging', t: 0 }
        break
      }
      case 'charging': {
        if (!melee) break
        this.state.t += dt
        if (moving) this.facing = moveDir // can still turn while winding up
        if (!intent.heavyHeld || this.state.t >= melee.charge.maxCharge - melee.charge.holdToCharge) {
          this.startSwing('charged', melee.charged)
        }
        break
      }
      case 'swing': {
        const s = this.state
        const { windup, active, recovery, lunge } = s.move
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
      case 'cast': {
        const s = this.state
        s.t += dt
        if (!s.released && s.t >= s.castTime) {
          s.released = true
          this.onCast({
            spell: s.spell,
            damage: scaledDamage(s.spell.damage, s.spell.scaling, this.loadout.levels),
            x: this.x + Math.cos(this.facing) * (PLAYER.radius + 10),
            y: this.y + Math.sin(this.facing) * (PLAYER.radius + 10),
            angle: this.facing,
          })
        }
        if (s.released && this.buffered?.button === 'roll') this.takeBufferedAction(moving ? moveDir : this.facing)
        else if (s.t >= s.castTime + s.spell.recovery) this.state = { kind: 'free' }
        break
      }
    }

    this.regenStamina(dt)
    if (this.notice && this.time > this.notice.until) this.notice = null
    this.render(dt)
  }

  private say(text: string) {
    this.notice = { text, until: this.time + 1.2 }
  }

  private takeBufferedAction(dir: number): boolean {
    const b = this.buffered
    if (!b) return false
    const weapon = this.loadout.weapon
    const melee = this.melee

    // Things that can't happen at all are dropped straight away, with a message.
    if (b.button === 'art' && !weapon.skill) {
      this.buffered = null
      this.say('No skill')
      return false
    }
    if (b.button === 'light' && weapon.kind === 'catalyst') {
      const spell = this.selectedSpell
      if (!spell || this.spellCharges[this.spellIndex] <= 0) {
        this.buffered = null
        this.say(spell ? 'No charges' : 'No spell')
        return false
      }
    }
    if (b.button === 'heavy' && !melee) {
      this.buffered = null // catalysts have no heavy attack
      return false
    }

    // Things that just aren't ready yet stay buffered, so a slightly early press still counts.
    if (this.stamina <= 0) return false
    if (b.button === 'light' && melee && this.time - this.lastAttackAt.light < melee.cooldown.light) return false
    if (b.button === 'heavy' && melee && this.time - this.lastAttackAt.heavy < melee.cooldown.heavy) return false
    if (b.button === 'art' && this.time < this.skillReadyAt) return false

    this.buffered = null
    if (b.button === 'roll') {
      this.spendStamina(ROLL.stamina)
      this.facing = dir
      this.state = { kind: 'roll', t: 0, dir }
    } else if (b.button === 'light') {
      if (melee) {
        this.startSwing('light', melee.light)
      } else if (weapon.kind === 'catalyst') {
        const spell = this.selectedSpell!
        this.spellCharges[this.spellIndex]--
        this.state = { kind: 'cast', t: 0, spell, castTime: spell.castTime / weapon.castSpeed, released: false }
      }
    } else if (b.button === 'heavy') {
      this.state = { kind: 'heavyHold', t: 0 }
    } else if (b.button === 'art' && weapon.skill) {
      this.skillReadyAt = this.time + weapon.skill.cooldown
      this.startSwing('skill', weapon.skill.move)
    }
    return true
  }

  private startSwing(swing: SwingKind, move: MoveDef) {
    this.spendStamina(move.stamina)
    if (swing === 'light') this.lastAttackAt.light = this.time
    if (swing === 'heavy' || swing === 'charged') this.lastAttackAt.heavy = this.time
    const damage = scaledDamage(move.damage, this.loadout.weapon.scaling, this.loadout.levels)
    this.state = { kind: 'swing', t: 0, swing, move, damage, side: this.nextSide }
    this.nextSide = this.nextSide === 1 ? -1 : 1
  }

  private spendStamina(amount: number) {
    this.stamina = Math.max(0, this.stamina - amount)
    this.lastStaminaSpend = this.time
  }

  private regenStamina(dt: number) {
    // Like the Souls games, stamina only comes back while you're not rolling or attacking.
    const k = this.state.kind
    const busy = this.sprinting || k === 'roll' || k === 'swing' || k === 'charging' || k === 'cast'
    if (busy || this.time - this.lastStaminaSpend < PLAYER.staminaRegenDelay) return
    this.stamina = Math.min(this.maxStamina, this.stamina + PLAYER.staminaRegen * dt)
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
    const melee = this.melee
    if (melee && (this.state.kind === 'heavyHold' || this.state.kind === 'charging')) {
      // Draw the weapon back over the shoulder.
      const pull = this.state.kind === 'charging' ? 1 : Math.min(1, this.state.t / melee.charge.holdToCharge)
      weaponAngle = REST_ANGLE + pull * 1.9
      if (this.state.kind === 'charging') this.drawChargeGlow()
    } else if (this.state.kind === 'swing') {
      weaponAngle = this.swingAngle(this.state)
      this.drawSwingArc(this.state)
    } else if (this.state.kind === 'cast') {
      // Raise the casting tool forward while the spell forms.
      weaponAngle = lerp(REST_ANGLE, -0.15, Math.min(1, this.state.t / Math.max(0.01, this.state.castTime)))
      if (!this.state.released) this.drawCastGlow(this.state.t / Math.max(0.01, this.state.castTime))
    }
    this.weapon.setRotation(weaponAngle)
  }

  private swingAngle(s: Extract<State, { kind: 'swing' }>) {
    const half = degToRad(s.move.arc) / 2
    const start = s.side * half
    const end = -s.side * half
    const { windup, active } = s.move
    if (s.t < windup) return lerp(REST_ANGLE, start, easeOut(s.t / windup))
    if (s.t < windup + active) return lerp(start, end, easeOut((s.t - windup) / active))
    return end
  }

  private drawSwingArc(s: Extract<State, { kind: 'swing' }>) {
    const { windup, active, recovery, reach } = s.move
    if (s.t < windup) return
    const half = degToRad(s.move.arc) / 2
    const progress = Math.min(1, (s.t - windup) / active)
    const fade = s.t < windup + active ? 1 : Math.max(0, 1 - (s.t - windup - active) / (recovery * 0.6))
    if (fade <= 0) return
    const from = this.facing + s.side * half
    const to = this.facing + s.side * half - s.side * 2 * half * easeOut(progress)
    const colour = s.swing === 'charged' || s.swing === 'skill' ? 0xff3d8b : 0xbff8ff
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

  private weaponTip(angleFromFacing: number, length: number) {
    const a = this.facing + angleFromFacing
    return {
      x: this.x + Math.cos(this.facing) * HAND.x - Math.sin(this.facing) * HAND.y + Math.cos(a) * length,
      y: this.y + Math.sin(this.facing) * HAND.x + Math.cos(this.facing) * HAND.y + Math.sin(a) * length,
    }
  }

  private drawChargeGlow() {
    const c = this.charge
    const w = this.loadout.weapon.art
    const tip = this.weaponTip(REST_ANGLE + 1.9, w.width - w.grip.x - 4)
    this.fx.fillStyle(0xff3d8b, 0.15 + 0.25 * c)
    this.fx.fillCircle(tip.x, tip.y, 6 + 12 * c)
    this.fx.lineStyle(2, 0xff3d8b, 0.3 + 0.5 * c)
    this.fx.strokeCircle(this.x, this.y, PLAYER.radius + 10 + 30 * (1 - c))
  }

  private drawCastGlow(progress: number) {
    const w = this.loadout.weapon.art
    const tip = this.weaponTip(-0.15, w.width - w.grip.x)
    this.fx.fillStyle(0x7fd8ff, 0.2 + 0.4 * progress)
    this.fx.fillCircle(tip.x, tip.y, 4 + 10 * progress)
  }
}

export const weaponTextureKey = (id: string) => `weapon:${id}`
