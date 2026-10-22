import type * as Phaser from 'phaser'
import { meetsRequirements } from '../data/attributes.ts'
import type { DamageMap } from '../data/damageTypes.ts'
import { PLAYER_MOVEMENT as MOVE, PLAYER_VITALS } from '../data/player.ts'
import type { AttackDef, SpellDef, StatusDef, WeaponDef } from '../data/types.ts'
import { Combatant } from '../combat/Combatant.ts'
import type { CombatWorld, Target } from '../combat/CombatWorld.ts'
import type { Caster, SpellSystem } from '../combat/SpellSystem.ts'
import type { ActionButton } from '../input.ts'
import { resolveWalls, type Segment, type Vec } from '../world/floorGeometry.ts'
import type { Loadout } from './character.ts'

// The player character: movement, dodge, melee, casting. Feel and numbers follow the
// Godot version (data/player.ts); weapons and spells come from the loadout's data.

export interface PlayerIntent {
  move: Vec // length 0..1
  pressed: Set<ActionButton>
  lightHeld: boolean
  heavyHeld: boolean
  rollHeld: boolean
  cycleWeapon: boolean
  cycleSpell: boolean
}

type SwingKind = 'light' | 'heavy' | 'charged' | 'skill'

type State =
  | { kind: 'free' }
  | { kind: 'roll'; t: number; dir: number }
  | { kind: 'heavyHold'; t: number } // heavy pressed; becomes a charge if held long enough
  | { kind: 'charging'; t: number }
  | { kind: 'swing'; t: number; swing: SwingKind; attack: AttackDef; side: 1 | -1; hits: Set<Target> }
  | { kind: 'cast'; t: number; spell: SpellDef; released: boolean }
  | { kind: 'channel' } // a beam / tether / held cone is running
  | { kind: 'dash' } // a dash spell is moving us

const RADIUS = 20 // collision circle
const HAND = { x: 14.5, y: 11.5 } // weapon hand relative to body centre, facing +x
const REST_ANGLE = 0.5 // weapon angle when idle, radians from facing
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const degToRad = (d: number) => (d * Math.PI) / 180

export class Player implements Caster {
  x: number
  y: number
  facing = 0
  readonly self: Target
  readonly actor: Combatant
  readonly maxStamina: number
  stamina: number
  notice: { text: string; until: number } | null = null
  weaponIndex = 0
  spellIndex = 0
  /** Remaining uses per attuned spell id (basic spells don't use charges). */
  readonly charges = new Map<string, number>()
  readonly maxCharges = new Map<string, number>()

  private loadout: Loadout
  private world: CombatWorld
  private spells: SpellSystem
  private walls: Segment[]
  private vx = 0
  private vy = 0
  private state: State = { kind: 'free' }
  private buffered: { button: ActionButton; at: number } | null = null
  private time = 0
  private regenDelay = 0
  private combatTime = 0
  private dodgeCooldown = 0
  private nextSide: 1 | -1 = 1
  private rollDownAt: number | null = null
  private sprinting = false
  private exhausted = false
  private lastAttackAt = { light: -Infinity, heavy: -Infinity }
  private skillReadyAt = 0
  private dashInvulnerable = false
  private imbueState: { bonus: DamageMap; remaining: number; colour: string } | null = null
  private lightHeld = false

  private root: Phaser.GameObjects.Container
  private body: Phaser.GameObjects.Image
  private weaponImage: Phaser.GameObjects.Image
  private fx: Phaser.GameObjects.Graphics
  private trail: { x: number; y: number; age: number }[] = []
  private trailGfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, spawn: Vec, walls: Segment[], loadout: Loadout, world: CombatWorld, spells: SpellSystem, getStatus: (id: string) => StatusDef) {
    this.walls = walls
    this.loadout = loadout
    this.world = world
    this.spells = spells
    this.x = spawn.x
    this.y = spawn.y
    this.maxStamina = this.stamina = loadout.stats.maxStamina
    this.actor = new Combatant({
      vitals: PLAYER_VITALS,
      maxHp: loadout.stats.maxHp,
      getStatus,
      isInvulnerable: () => this.invulnerable,
    })
    this.actor.onStaminaRestored = (n) => (this.stamina = Math.min(this.maxStamina, this.stamina + n))
    this.self = world.add({ actor: this.actor, team: 'player', x: this.x, y: this.y, radius: RADIUS })
    for (const s of loadout.spells) {
      if (s.basic) continue
      const max = s.charges + loadout.stats.extraSpellCharges
      this.maxCharges.set(s.id, max)
      this.charges.set(s.id, max)
    }

    this.trailGfx = scene.add.graphics().setDepth(9)
    this.fx = scene.add.graphics().setDepth(11)
    this.weaponImage = scene.add.image(HAND.x, HAND.y, weaponTextureKey(this.weapon.id))
    this.body = scene.add.image(0, 0, 'player')
    this.root = scene.add.container(this.x, this.y, [this.weaponImage, this.body]).setDepth(10)
    this.showWeapon()
  }

  get levels() {
    return this.loadout.levels
  }

  get weapon(): WeaponDef {
    return this.loadout.weapons[this.weaponIndex]
  }

  get hp() {
    return this.actor.hp
  }

  get maxHp() {
    return this.actor.maxHp
  }

  get inCombat() {
    return this.combatTime > 0
  }

  get invulnerable() {
    if (this.dashInvulnerable) return true
    if (this.state.kind !== 'roll') return false
    const f = this.state.t / MOVE.dodgeDuration
    return f >= MOVE.invulnerabilityStart && f <= MOVE.invulnerabilityEnd
  }

  /** 0..1 while charging a heavy attack. */
  get charge() {
    if (this.state.kind !== 'charging') return 0
    return Math.min(1, this.state.t / CHARGE_TIME)
  }

  /** Remaining skill cooldown as 0..1, or null if the weapon has no skill. */
  get skillCooldown(): number | null {
    const skill = this.weapon.skill
    if (!skill) return null
    return Math.max(0, this.skillReadyAt - this.time) / skill.cooldown
  }

  /** Spells usable with the current weapon: its basic spell, then attuned spells of a school it casts. */
  get castableSpells(): SpellDef[] {
    const cat = this.weapon.catalyst
    if (!cat) return []
    const basic = this.loadout.spells.filter((s) => s.basic && s.id === cat.basicSpell)
    const attuned = this.loadout.spells.filter((s) => !s.basic && (cat.schools.length === 0 || cat.schools.includes(s.school)))
    return [...basic, ...attuned]
  }

  get selectedSpell(): SpellDef | null {
    const list = this.castableSpells
    return list.length ? list[this.spellIndex % list.length] : null
  }

  // ---- Caster -------------------------------------------------------------

  aim() {
    return this.facing
  }

  channelHeld() {
    return this.lightHeld
  }

  dashMove(dx: number, dy: number) {
    const before = { x: this.x, y: this.y }
    this.moveTo(this.x + dx, this.y + dy)
    return Math.hypot(this.x - before.x, this.y - before.y)
  }

  setDashInvulnerable(on: boolean) {
    this.dashInvulnerable = on
  }

  imbue(bonus: DamageMap, duration: number, colour: string) {
    this.imbueState = { bonus, remaining: duration, colour }
  }

  /** Call when an enemy engages or lands a hit, so stamina costs apply. */
  enterCombat() {
    this.combatTime = MOVE.combatExitDelay
  }

  // ---- Update -------------------------------------------------------------

  update(dt: number, intent: PlayerIntent) {
    this.time += dt
    this.lightHeld = intent.lightHeld
    this.combatTime = Math.max(0, this.combatTime - dt)
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt)
    this.regenDelay = Math.max(0, this.regenDelay - dt)
    if (this.imbueState && (this.imbueState.remaining -= dt) <= 0) this.imbueState = null
    this.actor.update(dt)

    if (this.state.kind === 'free') {
      if (intent.cycleWeapon) this.cycleWeapon()
      if (intent.cycleSpell) this.cycleSpell()
    }

    for (const button of intent.pressed) {
      if (button === 'roll') this.rollDownAt = this.time
      else if (button !== 'weapon' && button !== 'spell') this.buffered = { button, at: this.time } // cycling isn't an action
    }
    // Roll fires when a short press is released; a long hold sprints instead.
    const rollHeldFor = this.rollDownAt === null ? 0 : this.time - this.rollDownAt
    if (this.rollDownAt !== null && !intent.rollHeld) {
      if (rollHeldFor < MOVE.sprintHoldThreshold) this.buffered = { button: 'roll', at: this.time }
      this.rollDownAt = null
      this.exhausted = false
    }
    if (this.buffered && this.time - this.buffered.at > MOVE.inputBuffer) this.buffered = null

    const moving = Math.hypot(intent.move.x, intent.move.y) > 0.15
    const moveDir = Math.atan2(intent.move.y, intent.move.x)
    const wantsSprint = this.rollDownAt !== null && rollHeldFor >= MOVE.sprintHoldThreshold && !this.exhausted
    this.sprinting = this.state.kind === 'free' && moving && wantsSprint

    // A channel or dash ends when its delivery does.
    if (this.state.kind === 'channel' && !this.spells.isChannelling(this)) this.state = { kind: 'free' }
    if (this.state.kind === 'dash' && !this.spells.isDashing(this)) this.state = { kind: 'free' }

    switch (this.state.kind) {
      case 'free': {
        if (this.sprinting && this.inCombat) {
          this.spendStamina(MOVE.sprintStaminaPerSecond * dt)
          if (this.stamina <= 0) {
            this.exhausted = true
            this.sprinting = false
          }
        }
        const speed = MOVE.walkSpeed * (this.sprinting ? MOVE.sprintMultiplier : 1) * this.actor.movementMultiplier
        this.locomote(intent.move, speed, dt)
        if (moving) this.facing = moveDir
        this.takeBufferedAction(moving ? moveDir : this.facing)
        break
      }
      case 'roll': {
        const s = this.state
        const before = easeOut(Math.min(1, s.t / MOVE.dodgeDuration))
        s.t += dt
        const after = easeOut(Math.min(1, s.t / MOVE.dodgeDuration))
        const step = (after - before) * MOVE.dodgeDistance
        this.moveTo(this.x + Math.cos(s.dir) * step, this.y + Math.sin(s.dir) * step)
        if (s.t >= MOVE.dodgeDuration) {
          this.vx = this.vy = 0
          this.state = { kind: 'free' }
        } else if (MOVE.dodgeDuration - s.t <= MOVE.inputBuffer && moving) {
          this.facing = moveDir
        }
        break
      }
      case 'heavyHold': {
        this.locomote(intent.move, MOVE.walkSpeed * this.weapon.heavy.movementMultiplier, dt)
        this.state.t += dt
        if (!intent.heavyHeld) this.startSwing('heavy', this.weapon.heavy)
        else if (this.state.t >= this.weapon.heavy.chargeThreshold) this.state = { kind: 'charging', t: 0 }
        break
      }
      case 'charging': {
        this.locomote(intent.move, MOVE.walkSpeed * this.weapon.heavy.movementMultiplier, dt)
        this.state.t += dt
        if (moving) this.facing = moveDir // can still turn while winding up
        if (!intent.heavyHeld || this.state.t >= CHARGE_TIME) this.startSwing('charged', this.weapon.charged)
        break
      }
      case 'swing': {
        const s = this.state
        const a = s.attack
        this.locomote(intent.move, MOVE.walkSpeed * a.movementMultiplier, dt)
        if (a.lungeSpeed > 0 && s.t >= a.windup && s.t < a.windup + a.active) {
          this.moveTo(this.x + Math.cos(this.facing) * a.lungeSpeed * dt, this.y + Math.sin(this.facing) * a.lungeSpeed * dt)
        }
        s.t += dt
        if (s.t >= a.windup && s.t - dt < a.windup + a.active) this.meleeHits(s)
        const duration = a.windup + a.active + a.recovery
        if (s.t >= duration) {
          this.state = { kind: 'free' }
          this.takeBufferedAction(moving ? moveDir : this.facing)
        } else if (s.t >= a.windup + a.active && this.buffered?.button === 'roll') {
          this.takeBufferedAction(moving ? moveDir : this.facing) // rolling cancels recovery
        }
        break
      }
      case 'cast': {
        const s = this.state
        const c = s.spell.cast
        this.locomote(intent.move, MOVE.walkSpeed * c.movementMultiplier, dt)
        s.t += dt
        if (!s.released && s.t >= c.windup) {
          s.released = true
          this.release(s.spell)
        }
        if (s.released && this.spells.isDashing(this)) this.state = { kind: 'dash' }
        else if (s.released && this.spells.isChannelling(this)) this.state = { kind: 'channel' }
        else if (s.t >= c.windup + c.active + c.recovery) this.state = { kind: 'free' }
        break
      }
      case 'channel': {
        const m = this.spells.channelMovement(this) ?? 1
        this.locomote(intent.move, MOVE.walkSpeed * m, dt)
        if (moving) this.facing = moveDir // steer the beam / cone
        if (this.buffered?.button === 'roll') {
          this.spells.cancelChannels(this)
          this.state = { kind: 'free' }
          this.takeBufferedAction(moving ? moveDir : this.facing)
        }
        break
      }
      case 'dash':
        this.vx = this.vy = 0
        break
    }

    this.regenStamina(dt)
    this.self.x = this.x
    this.self.y = this.y
    if (this.notice && this.time > this.notice.until) this.notice = null
    this.render(dt)
  }

  private say(text: string) {
    this.notice = { text, until: this.time + 1.2 }
  }

  private canSpend(cost: number) {
    return !this.inCombat || this.stamina >= Math.max(0, cost)
  }

  /** Stamina is only spent in combat (as in the Godot version). */
  private spendStamina(cost: number, delayRegen = true) {
    if (cost <= 0 || !this.inCombat) return
    this.stamina = Math.max(0, this.stamina - cost)
    if (delayRegen) this.regenDelay = PLAYER_VITALS.staminaRegenerationDelay
  }

  private regenStamina(dt: number) {
    if (this.regenDelay > 0 || !this.actor.alive) return
    if (this.inCombat && (this.state.kind !== 'free' || this.sprinting)) return
    this.stamina = Math.min(this.maxStamina, this.stamina + PLAYER_VITALS.staminaRegeneration * dt)
  }

  private takeBufferedAction(dir: number): boolean {
    const b = this.buffered
    if (!b) return false
    const w = this.weapon

    if (b.button === 'roll') {
      if (this.dodgeCooldown > 0) return false
      this.buffered = null
      if (!this.canSpend(MOVE.dodgeCost)) return this.say('Catch your breath'), false
      this.spendStamina(MOVE.dodgeCost)
      this.dodgeCooldown = MOVE.dodgeCooldown
      this.facing = dir
      this.sprinting = false
      this.state = { kind: 'roll', t: 0, dir }
      return true
    }
    if (b.button === 'art') {
      this.buffered = null
      if (!w.skill) return this.say('No skill'), false
      if (this.time < this.skillReadyAt) return false
      if (!this.canSpend(w.skill.attack.stamina)) return this.say('Catch your breath'), false
      this.skillReadyAt = this.time + w.skill.cooldown
      this.startSwing('skill', w.skill.attack)
      return true
    }
    if (b.button === 'light' && w.catalyst) {
      this.buffered = null
      return this.beginCast()
    }
    if (b.button === 'heavy' && w.catalyst) {
      this.buffered = null // catalysts have no heavy attack
      return false
    }
    if (!meetsRequirements(this.levels, w.requirements)) {
      this.buffered = null
      return this.say('Requirements not met'), false
    }
    // Still cooling down: keep it buffered so a slightly early press still counts.
    if (b.button === 'light' && this.time - this.lastAttackAt.light < w.cooldown.light) return false
    if (b.button === 'heavy' && this.time - this.lastAttackAt.heavy < w.cooldown.heavy) return false
    this.buffered = null
    const attack = b.button === 'light' ? w.light : w.heavy
    if (!this.canSpend(attack.stamina)) return this.say('Catch your breath'), false
    if (b.button === 'light') this.startSwing('light', w.light)
    else this.state = { kind: 'heavyHold', t: 0 }
    return true
  }

  private startSwing(swing: SwingKind, attack: AttackDef) {
    this.spendStamina(attack.stamina, false) // melee doesn't delay regen
    if (swing === 'light') this.lastAttackAt.light = this.time
    if (swing === 'heavy' || swing === 'charged') this.lastAttackAt.heavy = this.time
    this.state = { kind: 'swing', t: 0, swing, attack, side: this.nextSide, hits: new Set() }
    this.nextSide = this.nextSide === 1 ? -1 : 1
  }

  /** Melee contact: a circle at the end of the weapon's reach, within the swing's arc. */
  private meleeHits(s: Extract<State, { kind: 'swing' }>) {
    const a = s.attack
    const r = Math.min(a.hitRadius, a.reach)
    const cx = this.x + Math.cos(this.facing) * Math.max(0, a.reach - r)
    const cy = this.y + Math.sin(this.facing) * Math.max(0, a.reach - r)
    for (const t of this.world.find('hostile', this.self, { x: cx, y: cy }, r)) {
      if (s.hits.has(t)) continue
      const ox = t.x - this.x
      const oy = t.y - this.y
      const len = Math.hypot(ox, oy)
      if (len > 1e-6 && (Math.cos(this.facing) * ox + Math.sin(this.facing) * oy) / len < Math.cos(degToRad(a.arc / 2))) continue
      if (!this.world.visible(this, t)) continue
      s.hits.add(t)
      this.world.hit(t, { attack: a, ctx: { levels: this.levels, bonus: this.imbueState?.bonus ?? null } })
    }
  }

  private beginCast(): boolean {
    const spell = this.selectedSpell
    if (!spell) return this.say('No spell'), false
    if (this.spells.command(spell)) return true // fire orbiting shards that are waiting
    if (!meetsRequirements(this.levels, spell.requirements)) return this.say('Requirements not met'), false
    if (!spell.basic && (this.charges.get(spell.id) ?? 0) <= 0) return this.say('No charges'), false
    if (!this.canSpend(spell.cast.stamina)) return this.say('Catch your breath'), false
    const d = spell.delivery
    if ((d.delivery === 'target' || d.delivery === 'chain' || d.delivery === 'tether') && !this.spellTarget(spell)) {
      return this.say('No target in range'), false
    }
    if (['ground-zone', 'trap', 'barrage', 'summon'].includes(d.delivery) && !this.world.clear(this.placementPoint(spell), 22)) {
      return this.say('No room to place that'), false
    }
    this.spendStamina(spell.cast.stamina)
    if (!spell.basic) this.charges.set(spell.id, (this.charges.get(spell.id) ?? 0) - 1)
    this.state = { kind: 'cast', t: 0, spell, released: false }
    return true
  }

  private release(spell: SpellDef) {
    if (spell.healthRestore > 0) this.actor.heal(spell.healthRestore)
    if (spell.staminaRestore > 0) this.stamina = Math.min(this.maxStamina, this.stamina + spell.staminaRestore)
    this.spells.launch(spell.delivery, {
      caster: this,
      spell,
      attack: spell.cast,
      origin: { x: this.x, y: this.y },
      direction: this.facing,
      point: this.placementPoint(spell),
      target: this.spellTarget(spell),
      depth: 0,
      multiplier: 1,
    })
  }

  /** Where placed spells land: ahead of you, stopping short of walls. */
  private placementPoint(spell: SpellDef): Vec {
    const d = spell.delivery
    const target = this.spellTarget(spell)
    const want = target ?? {
      x: this.x + Math.cos(this.facing) * Math.min(d.placementDistance, d.castRange),
      y: this.y + Math.sin(this.facing) * Math.min(d.placementDistance, d.castRange),
    }
    return this.world.wallEnd(this, want, 25)
  }

  /** Without lock-on: the nearest visible enemy roughly in front, in range. */
  private spellTarget(spell: SpellDef): Target | null {
    const d = spell.delivery
    const range = d.delivery === 'tether' ? Math.min(d.castRange, d.breakRange) : d.castRange
    let best: Target | null = null
    let bestD = range
    for (const t of this.world.find('hostile', this.self, this, range)) {
      const ox = t.x - this.x
      const oy = t.y - this.y
      const len = Math.hypot(ox, oy)
      const inFront = len < 1 || (Math.cos(this.facing) * ox + Math.sin(this.facing) * oy) / len >= Math.cos(degToRad(50))
      if (inFront && len <= bestD && this.world.visible(this, t)) {
        best = t
        bestD = len
      }
    }
    return best
  }

  private cycleWeapon() {
    if (this.loadout.weapons.length < 2) return
    this.weaponIndex = (this.weaponIndex + 1) % this.loadout.weapons.length
    this.spellIndex = 0
    this.showWeapon()
    this.say(this.weapon.name)
  }

  private cycleSpell() {
    const list = this.castableSpells
    if (list.length < 2) return
    this.spellIndex = (this.spellIndex + 1) % list.length
    this.say(this.selectedSpell!.name)
  }

  private showWeapon() {
    const w = this.weapon
    this.weaponImage.setTexture(weaponTextureKey(w.id)).setOrigin(w.art.grip.x / w.art.width, w.art.grip.y / w.art.height)
  }

  /** Walking with the Godot version's acceleration and braking. */
  private locomote(input: Vec, speed: number, dt: number) {
    const tx = input.x * speed
    const ty = input.y * speed
    const braking = tx * tx + ty * ty < this.vx * this.vx + this.vy * this.vy || this.vx * tx + this.vy * ty < 0
    const rate = (braking ? MOVE.deceleration : MOVE.acceleration) * dt
    const dx = tx - this.vx
    const dy = ty - this.vy
    const d = Math.hypot(dx, dy)
    if (d <= rate) {
      this.vx = tx
      this.vy = ty
    } else {
      this.vx += (dx / d) * rate
      this.vy += (dy / d) * rate
    }
    this.moveTo(this.x + this.vx * dt, this.y + this.vy * dt)
  }

  private moveTo(x: number, y: number) {
    // Bodies don't overlap: step out of anyone else we've walked into, then out of walls.
    for (const t of this.world.targets) {
      if (t === this.self || !t.actor.alive) continue
      const dx = x - t.x
      const dy = y - t.y
      const d = Math.hypot(dx, dy)
      const min = RADIUS + t.radius
      if (d < min && d > 1e-6) {
        x = t.x + (dx / d) * min
        y = t.y + (dy / d) * min
      }
    }
    const p = resolveWalls({ x, y }, RADIUS, this.walls)
    // Lose the velocity that went into a wall, so you slide instead of sticking.
    if (p.x !== x || p.y !== y) {
      const nx = p.x - x
      const ny = p.y - y
      const n = Math.hypot(nx, ny) || 1
      const into = (this.vx * nx + this.vy * ny) / n
      if (into < 0) {
        this.vx -= (into * nx) / n
        this.vy -= (into * ny) / n
      }
    }
    this.x = p.x
    this.y = p.y
  }

  // ---- Rendering ----------------------------------------------------------

  private render(dt: number) {
    this.root.setPosition(this.x, this.y).setRotation(this.facing)
    this.fx.clear()

    const rolling = this.state.kind === 'roll'
    this.root.setScale(rolling ? 0.9 : 1)
    this.body.setAlpha(this.invulnerable ? 0.75 : 1)
    if (rolling || this.state.kind === 'dash' || (this.sprinting && Math.random() < 0.35)) this.trail.push({ x: this.x, y: this.y, age: 0 })
    this.trailGfx.clear()
    this.trail = this.trail.filter((g) => (g.age += dt) < 0.22)
    for (const g of this.trail) {
      this.trailGfx.fillStyle(0x38e8ff, 0.18 * (1 - g.age / 0.22))
      this.trailGfx.fillCircle(g.x, g.y, RADIUS + 2)
    }

    if (this.imbueState) this.weaponImage.setTint(parseInt(this.imbueState.colour.slice(1), 16))
    else this.weaponImage.clearTint()

    let weaponAngle = REST_ANGLE
    if (this.state.kind === 'heavyHold' || this.state.kind === 'charging') {
      const pull = this.state.kind === 'charging' ? 1 : Math.min(1, this.state.t / this.weapon.heavy.chargeThreshold)
      weaponAngle = REST_ANGLE + pull * 1.9
      if (this.state.kind === 'charging') this.drawChargeGlow()
    } else if (this.state.kind === 'swing') {
      weaponAngle = this.swingAngle(this.state)
      this.drawSwingArc(this.state)
    } else if (this.state.kind === 'cast' || this.state.kind === 'channel') {
      const t = this.state.kind === 'cast' ? Math.min(1, this.state.t / Math.max(0.01, this.state.spell.cast.windup)) : 1
      weaponAngle = lerp(REST_ANGLE, -0.15, t)
      if (this.state.kind === 'cast' && !this.state.released) this.drawCastGlow(t, this.state.spell.colour)
    }
    this.weaponImage.setRotation(weaponAngle)
  }

  private swingAngle(s: Extract<State, { kind: 'swing' }>) {
    const half = degToRad(s.attack.arc) / 2
    const start = s.side * half
    const end = -s.side * half
    const { windup, active } = s.attack
    if (s.t < windup) return lerp(REST_ANGLE, start, easeOut(s.t / windup))
    if (s.t < windup + active) return lerp(start, end, easeOut((s.t - windup) / active))
    return end
  }

  private drawSwingArc(s: Extract<State, { kind: 'swing' }>) {
    const { windup, active, recovery, reach } = s.attack
    if (s.t < windup) return
    const half = degToRad(s.attack.arc) / 2
    const progress = Math.min(1, (s.t - windup) / active)
    const fade = s.t < windup + active ? 1 : Math.max(0, 1 - (s.t - windup - active) / (recovery * 0.6))
    if (fade <= 0) return
    const from = this.facing + s.side * half
    const to = from - s.side * 2 * half * easeOut(progress)
    const colour = this.imbueState ? parseInt(this.imbueState.colour.slice(1), 16) : s.swing === 'charged' || s.swing === 'skill' ? 0xff3d8b : 0xbff8ff
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
    const art = this.weapon.art
    const tip = this.weaponTip(REST_ANGLE + 1.9, art.width - art.grip.x - 4)
    this.fx.fillStyle(0xff3d8b, 0.15 + 0.25 * c)
    this.fx.fillCircle(tip.x, tip.y, 6 + 12 * c)
    this.fx.lineStyle(2, 0xff3d8b, 0.3 + 0.5 * c)
    this.fx.strokeCircle(this.x, this.y, RADIUS + 10 + 30 * (1 - c))
  }

  private drawCastGlow(progress: number, colour: string) {
    const art = this.weapon.art
    const tip = this.weaponTip(-0.15, art.width - art.grip.x)
    this.fx.fillStyle(parseInt(colour.slice(1), 16), 0.2 + 0.4 * progress)
    this.fx.fillCircle(tip.x, tip.y, 4 + 10 * progress)
  }
}

/** How long a fully charged heavy takes once charging starts. */
const CHARGE_TIME = 0.5

export const weaponTextureKey = (id: string) => `weapon:${id}`
