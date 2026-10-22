import * as Phaser from 'phaser'
import { meetsRequirements } from '../data/attributes.ts'
import { scalingMultiplier } from '../data/damage.ts'
import type { DamageMap } from '../data/damageTypes.ts'
import { PLAYER_MOVEMENT as MOVE, PLAYER_VITALS } from '../data/player.ts'
import type { AttackDef, SpellDef, StatusDef, WeaponDef } from '../data/types.ts'
import { Combatant } from '../combat/Combatant.ts'
import type { CombatWorld, Target } from '../combat/CombatWorld.ts'
import type { Caster, SpellSystem } from '../combat/SpellSystem.ts'
import type { ActionButton } from '../input.ts'
import { resolveWalls, type Segment, type Vec } from '../world/floorGeometry.ts'
import { facing8, LAYER, standingDepth } from '../world/projection.ts'
import type { Loadout } from './character.ts'
import { CharacterArt, onScreen, type CharacterAnim, type HandPose, type Vec3 } from './characterArt.ts'

// The player character: movement, dodge, melee, casting. Feel and numbers follow the
// Godot version (data/player.ts); weapons and spells come from the loadout's data.

export interface PlayerIntent {
  move: Vec // length 0..1
  pressed: Set<ActionButton>
  lightHeld: boolean
  heavyHeld: boolean
  leftHeld: boolean
  rollHeld: boolean
  cycleWeapon: boolean
  cycleLeftWeapon: boolean
  cycleSpell: boolean
  lock: boolean
  lockHeld: boolean
}

type SwingKind = 'light' | 'heavy' | 'charged' | 'skill'
export type Hand = 'right' | 'left'
const other = (h: Hand): Hand => (h === 'right' ? 'left' : 'right')

type State =
  | { kind: 'free' }
  | { kind: 'roll'; t: number; dir: number }
  | { kind: 'heavyHold'; t: number } // heavy pressed; becomes a charge if held long enough
  | { kind: 'charging'; t: number }
  | { kind: 'swing'; t: number; swing: SwingKind; attack: AttackDef; side: 1 | -1; hits: Set<Target>; hand: Hand; from: number }
  | { kind: 'cast'; t: number; spell: SpellDef; released: boolean; hand: Hand }
  | { kind: 'channel' } // a beam / tether / held cone is running
  | { kind: 'dash' } // a dash spell is moving us

const RADIUS = 30 // collision circle
// Walking plays one full stride (both feet) per this many px travelled; idle breathes over
// this many seconds.
const STRIDE = 110
const IDLE_PERIOD = 2.4
// The drawn attacks wind up over the first 35% of their animation and strike until 60%; the
// rest is recovery (see tools/rig/poses.mjs). A held heavy rests on the last windup frame.
const STRIKE_START = 0.35
const STRIKE_END = 0.6
const HELD_WINDUP = 0.3
const HURT_TIME = 0.18
// Animations where a weapon with its own resting angle (art.rest) is held at it.
const RESTING = new Set<CharacterAnim>(['idle', 'walk', 'hurt'])
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
  rightId: string
  leftId: string | null
  spellIndex = 0
  /** Casts used per spell id this run (basic spells don't use charges). */
  private chargesUsed = new Map<string, number>()

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
  private lastAttackAt = { light: -Infinity, heavy: -Infinity, left: -Infinity }
  private skillReadyAt = 0
  private dashInvulnerable = false
  /** Weapon imbues, per hand. */
  private imbues: Record<Hand, { bonus: DamageMap; remaining: number; colour: string } | null> = { right: null, left: null }
  private lightHeld = false
  private leftHeld = false
  /** The hand the current / last spell was cast from. */
  private castHand: Hand = 'right'
  /** Locked-on target: you face it, and attacks and spells aim at it. */
  lockedTarget: Target | null = null
  /** Targets in the order they were in when lock-on started, for stepping through. */
  private lockCycle: Target[] = []
  private lockDownAt: number | null = null
  private lockHoldFired = false

  private root: Phaser.GameObjects.Container
  private art: CharacterArt
  /** The drawn character, one frame at a time; weapons are held in its hands. */
  private body: Phaser.GameObjects.Image
  private shadow: Phaser.GameObjects.Ellipse
  private hurt = 0
  private weaponImages: Record<Hand, Phaser.GameObjects.Image>
  private fx: Phaser.GameObjects.Graphics
  private trail: { x: number; y: number; age: number }[] = []
  private trailGfx: Phaser.GameObjects.Graphics
  private walkPhase = 0

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
    this.actor.onDamaged = (_n, periodic) => {
      if (!periodic) this.hurt = HURT_TIME
    }
    this.self = world.add({ actor: this.actor, team: 'player', x: this.x, y: this.y, radius: RADIUS })

    this.trailGfx = scene.add.graphics().setDepth(LAYER.trail)
    this.fx = scene.add.graphics().setDepth(LAYER.fx)
    this.rightId = loadout.right.id
    this.leftId = loadout.left?.id ?? null
    this.weaponImages = {
      right: scene.add.image(0, 0, weaponTextureKey(loadout.right.id)),
      left: scene.add.image(0, 0, weaponTextureKey(loadout.right.id)),
    }
    this.art = new CharacterArt(scene, loadout.appearance)
    this.body = scene.add.image(0, 0, this.art.texture, this.art.frame('idle', 2, 0).name).setOrigin(this.art.origin.x, this.art.origin.y)
    this.shadow = scene.add.ellipse(0, 0, 58, 16, 0x000000, 0.4)
    this.root = scene.add.container(this.x, this.y, [this.shadow, this.weaponImages.right, this.weaponImages.left, this.body]).setDepth(standingDepth(this.y))
    this.showWeapon('right')
    this.showWeapon('left')
  }

  get levels() {
    return this.loadout.levels
  }

  /** The right-hand weapon. */
  get weapon(): WeaponDef {
    return this.held('right')!
  }

  get leftWeapon(): WeaponDef | null {
    return this.held('left')
  }

  private held(hand: Hand): WeaponDef | null {
    const id = hand === 'right' ? this.rightId : this.leftId
    return this.loadout.weapons.find((w) => w.id === id) ?? null
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

  /** Spells usable with either hand's catalyst: their basic spells, then attuned spells of a school one casts. */
  get castableSpells(): SpellDef[] {
    return this.loadout.spells.filter((s) => this.canCastWith('right', s) || this.canCastWith('left', s))
  }

  private canCastWith(hand: Hand, spell: SpellDef) {
    const cat = this.held(hand)?.catalyst
    if (!cat) return false
    return spell.basic ? spell.id === cat.basicSpell : cat.schools.length === 0 || cat.schools.includes(spell.school)
  }

  get selectedSpell(): SpellDef | null {
    const list = this.castableSpells
    return list.length ? list[this.spellIndex % list.length] : null
  }

  // ---- Caster -------------------------------------------------------------

  aim() {
    const t = this.lockedTarget
    return t ? Math.atan2(t.y - this.y, t.x - this.x) : this.facing
  }

  /** Lockable targets: visible and in range, nearest and most in front first. */
  private lockCandidates(): Target[] {
    return this.world
      .find('hostile', this.self, this, MOVE.lockOnRadius)
      .filter((t) => this.world.visible(this, t))
      .map((t) => {
        const d = Math.hypot(t.x - this.x, t.y - this.y)
        const a = Math.atan2(t.y - this.y, t.x - this.x)
        const angle = Math.abs(Math.atan2(Math.sin(a - this.facing), Math.cos(a - this.facing)))
        return { t, score: d * (1 + angle) } // nearer and more in front scores lower
      })
      .sort((a, b) => a.score - b.score)
      .map((c) => c.t)
  }

  /** Hold: lock onto the best target, or let go. */
  private toggleLock() {
    if (this.lockedTarget) {
      this.lockedTarget = null
      this.lockCycle = []
      return
    }
    this.lockCycle = this.lockCandidates()
    this.lockedTarget = this.lockCycle[0] ?? null
    if (!this.lockedTarget) this.say('No target')
  }

  /** Tap: switch to the next target, wrapping round. Never lets go. */
  private switchLock() {
    if (!this.lockedTarget) return this.say('Hold to lock on')
    const candidates = this.lockCandidates()
    // Keep the order from when the lock started so it doesn't reshuffle as you turn;
    // drop targets that are gone and add any new ones at the end.
    this.lockCycle = [...this.lockCycle.filter((t) => candidates.includes(t)), ...candidates.filter((t) => !this.lockCycle.includes(t))]
    if (!this.lockCycle.includes(this.lockedTarget)) this.lockCycle.unshift(this.lockedTarget)
    const i = this.lockCycle.indexOf(this.lockedTarget)
    this.lockedTarget = this.lockCycle[(i + 1) % this.lockCycle.length]
  }

  channelHeld() {
    return this.castHand === 'left' ? this.leftHeld : this.lightHeld
  }

  dashMove(dx: number, dy: number) {
    const before = { x: this.x, y: this.y }
    this.moveTo(this.x + dx, this.y + dy)
    return Math.hypot(this.x - before.x, this.y - before.y)
  }

  setDashInvulnerable(on: boolean) {
    this.dashInvulnerable = on
  }

  /** Imbues the weapon in the hand opposite the one that cast it (as in the Godot version). */
  imbue(bonus: DamageMap, duration: number, colour: string) {
    this.imbues[other(this.castHand)] = { bonus, remaining: duration, colour }
  }

  /** Call when an enemy engages or lands a hit, so stamina costs apply. */
  enterCombat() {
    this.combatTime = MOVE.combatExitDelay
  }

  // ---- Update -------------------------------------------------------------

  update(dt: number, intent: PlayerIntent) {
    this.time += dt
    this.lightHeld = intent.lightHeld
    this.leftHeld = intent.leftHeld
    this.combatTime = Math.max(0, this.combatTime - dt)
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt)
    this.regenDelay = Math.max(0, this.regenDelay - dt)
    for (const h of ['right', 'left'] as const) {
      const im = this.imbues[h]
      if (im && (im.remaining -= dt) <= 0) this.imbues[h] = null
    }
    this.actor.update(dt)

    if (this.state.kind === 'free') {
      if (intent.cycleWeapon) this.cycleWeapon('right')
      if (intent.cycleLeftWeapon) this.cycleWeapon('left')
      if (intent.cycleSpell) this.cycleSpell()
    }
    // Lock button: hold to lock on / off, tap to switch target.
    if (intent.lock) {
      this.lockDownAt = this.time
      this.lockHoldFired = false
    }
    if (this.lockDownAt !== null) {
      if (!this.lockHoldFired && this.time - this.lockDownAt >= LOCK_HOLD) {
        this.lockHoldFired = true
        this.toggleLock()
      }
      if (!intent.lockHeld) {
        if (!this.lockHoldFired) this.switchLock()
        this.lockDownAt = null
      }
    }
    if (this.lockedTarget && (!this.lockedTarget.actor.alive || !this.world.targets.has(this.lockedTarget))) this.lockedTarget = null

    for (const button of intent.pressed) {
      if (button === 'roll') this.rollDownAt = this.time
      else if (!['weapon', 'leftWeapon', 'spell', 'lock'].includes(button)) this.buffered = { button, at: this.time } // these aren't actions
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

    // Locked on: face the target whatever you're doing, except mid-roll or mid-dash.
    if (this.lockedTarget && this.state.kind !== 'roll' && this.state.kind !== 'dash') this.facing = this.aim()

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
    if (b.button === 'left') return this.leftAction()
    if (b.button === 'light' && w.catalyst) {
      this.buffered = null
      return this.beginCast('right')
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

  /** The left hand's attack: a light attack, or a cast if it holds a catalyst. */
  private leftAction(): boolean {
    const w = this.leftWeapon
    if (!w) {
      this.buffered = null
      return false
    }
    if (w.catalyst) {
      this.buffered = null
      return this.beginCast('left')
    }
    if (!meetsRequirements(this.levels, w.requirements)) {
      this.buffered = null
      return this.say('Requirements not met'), false
    }
    if (this.time - this.lastAttackAt.left < w.cooldown.light) return false // stays buffered
    this.buffered = null
    if (!this.canSpend(w.light.stamina)) return this.say('Catch your breath'), false
    this.startSwing('light', w.light, 'left')
    return true
  }

  private startSwing(swing: SwingKind, attack: AttackDef, hand: Hand = 'right') {
    this.spendStamina(attack.stamina, false) // melee doesn't delay regen
    if (swing === 'light' && hand === 'right') this.lastAttackAt.light = this.time
    if (swing === 'light' && hand === 'left') this.lastAttackAt.left = this.time
    if (swing === 'heavy' || swing === 'charged') this.lastAttackAt.heavy = this.time
    // A heavy that was held carries on from as far as it had drawn back.
    this.state = { kind: 'swing', t: 0, swing, attack, side: this.nextSide, hits: new Set(), hand, from: this.heavyWindup() }
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
      this.world.hit(t, { attack: a, ctx: { levels: this.levels, bonus: this.imbues[s.hand]?.bonus ?? null } })
    }
  }

  private beginCast(hand: Hand): boolean {
    const spell = this.selectedSpell
    if (!spell) return this.say('No spell'), false
    if (!this.canCastWith(hand, spell)) return this.say(`Can't cast that with the ${hand} hand`), false
    this.castHand = hand
    if (this.spells.command(spell)) return true // fire orbiting shards that are waiting
    if (!meetsRequirements(this.levels, spell.requirements)) return this.say('Requirements not met'), false
    if (!spell.basic && this.chargesLeft(spell) <= 0) return this.say('No charges'), false
    if (!this.canSpend(spell.cast.stamina)) return this.say('Catch your breath'), false
    const d = spell.delivery
    if ((d.delivery === 'target' || d.delivery === 'chain' || d.delivery === 'tether') && !this.spellTarget(spell)) {
      return this.say('No target in range'), false
    }
    if (['ground-zone', 'trap', 'barrage', 'summon'].includes(d.delivery) && !this.world.clear(this.placementPoint(spell), 22)) {
      return this.say('No room to place that'), false
    }
    this.spendStamina(spell.cast.stamina)
    if (!spell.basic) this.chargesUsed.set(spell.id, (this.chargesUsed.get(spell.id) ?? 0) + 1)
    this.state = { kind: 'cast', t: 0, spell, released: false, hand }
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
      multiplier: this.spellPower(this.castHand),
    })
  }

  /**
   * Uses a spell has: its base, plus Intelligence, plus the best charge bonus among the
   * catalysts in hand. Swapping catalysts changes it straight away.
   */
  maxCharges(spell: SpellDef): number {
    const bonus = Math.max(0, ...(['right', 'left'] as const).map((h) => this.held(h)?.catalyst?.extraCharges ?? 0))
    return spell.charges + this.loadout.stats.extraSpellCharges + bonus
  }

  chargesLeft(spell: SpellDef): number {
    return Math.max(0, this.maxCharges(spell) - (this.chargesUsed.get(spell.id) ?? 0))
  }

  /** Spell damage multiplier from the casting hand's catalyst: its power times its scaling bonus. */
  private spellPower(hand: Hand): number {
    const cat = this.held(hand)?.catalyst
    return cat ? cat.power * scalingMultiplier(cat.scaling, this.levels) : 1
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

  /** The locked target if it's in range and visible; otherwise the nearest visible enemy roughly in front. */
  private spellTarget(spell: SpellDef): Target | null {
    const d = spell.delivery
    const range = d.delivery === 'tether' ? Math.min(d.castRange, d.breakRange) : d.castRange
    const lock = this.lockedTarget
    if (lock) return Math.hypot(lock.x - this.x, lock.y - this.y) <= range && this.world.visible(this, lock) ? lock : null
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

  /** Next weapon for a hand, skipping whatever the other hand holds. The left hand can also be empty. */
  private cycleWeapon(hand: Hand) {
    const otherId = hand === 'right' ? this.leftId : this.rightId
    const options: (string | null)[] = [...(hand === 'left' ? [null] : []), ...this.loadout.weapons.map((w) => w.id).filter((id) => id !== otherId)]
    if (options.length < 2) return
    const current = hand === 'right' ? this.rightId : this.leftId
    const next = options[(options.indexOf(current) + 1) % options.length]
    if (hand === 'right') this.rightId = next!
    else this.leftId = next
    this.imbues[hand] = null
    this.spellIndex = 0
    this.showWeapon(hand)
    this.say(`${hand === 'right' ? 'Right' : 'Left'}: ${this.held(hand)?.name ?? 'empty'}`)
  }

  private cycleSpell() {
    const list = this.castableSpells
    if (list.length < 2) return
    this.spellIndex = (this.spellIndex + 1) % list.length
    this.say(this.selectedSpell!.name)
  }

  private showWeapon(hand: Hand) {
    const w = this.held(hand)
    const img = this.weaponImages[hand]
    img.setVisible(!!w)
    if (w) img.setTexture(weaponTextureKey(w.id)).setOrigin(w.art.grip.x / w.art.width, w.art.grip.y / w.art.height)
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
    this.root.setPosition(this.x, this.y).setDepth(standingDepth(this.y))
    this.fx.clear()
    this.hurt = Math.max(0, this.hurt - dt)
    const { anim, t } = this.animation(dt)
    const d = facing8(this.facing).index
    const frame = this.art.frame(anim, d, t)
    const rolling = this.state.kind === 'roll'
    this.body.setFrame(frame.name).setAlpha(this.invulnerable && !rolling ? 0.75 : 1)
    if (this.hurt > 0.1) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
    this.shadow.setScale(rolling ? 0.8 : 1)

    if (rolling || this.state.kind === 'dash' || (this.sprinting && Math.random() < 0.35)) this.trail.push({ x: this.x, y: this.y, age: 0 })
    this.trailGfx.clear()
    this.trail = this.trail.filter((g) => (g.age += dt) < 0.22)
    for (const g of this.trail) {
      this.trailGfx.fillStyle(0xd9c8a0, 0.14 * (1 - g.age / 0.22))
      this.trailGfx.fillEllipse(g.x, g.y - 50, RADIUS * 2.2, 110)
    }

    for (const h of ['right', 'left'] as const) {
      const im = this.imbues[h]
      if (im) this.weaponImages[h].setTint(parseInt(im.colour.slice(1), 16))
      else this.weaponImages[h].clearTint()
    }
    // Weapons go in the drawn hands, behind or in front of the body as the hands are.
    const rightFront = this.placeWeapon('right', frame.right, rolling, d, anim)
    const leftFront = this.placeWeapon('left', frame.left, rolling, d, anim)
    const behind: Phaser.GameObjects.GameObject[] = []
    const front: Phaser.GameObjects.GameObject[] = []
    for (const [h, inFront] of [['right', rightFront], ['left', leftFront]] as const) (inFront ? front : behind).push(this.weaponImages[h])
    // Only re-stack when the order actually changes: rebuilding a container every frame
    // makes Phaser drop children from some frames.
    const order = [this.shadow, ...behind, this.body, ...front]
    if (order.some((o, i) => this.root.list[i] !== o)) {
      this.root.removeAll(false)
      this.root.add(order)
    }

    if (this.state.kind === 'swing') this.drawSwingArc(this.state, anim, d, t)
    else if (this.state.kind === 'charging') this.drawChargeGlow(frame.right)
    else if (this.state.kind === 'cast' && !this.state.released) {
      this.drawCastGlow(this.castHand === 'right' ? frame.right : frame.left, Math.min(1, this.state.t / Math.max(0.01, this.state.spell.cast.windup)), this.state.spell.colour)
    }
  }

  /** Which animation the body shows, and how far through it (0..1). */
  private animation(dt: number): { anim: CharacterAnim; t: number } {
    const s = this.state
    switch (s.kind) {
      case 'roll':
        return { anim: 'roll', t: s.t / MOVE.dodgeDuration }
      case 'heavyHold':
      case 'charging':
        return { anim: 'heavy', t: this.heavyWindup() }
      case 'swing': {
        const anim = s.swing !== 'light' ? 'heavy' : s.hand === 'left' ? 'lslash' : s.side === 1 ? 'slash' : 'backslash'
        return { anim, t: this.attackTime(s) }
      }
      case 'cast': {
        // Raise the hand through the windup, hold it while the spell goes, lower it after.
        const c = s.spell.cast
        const t = s.t < c.windup ? s.t / c.windup : s.t < c.windup + c.active ? 1 : 1 - (s.t - c.windup - c.active) / Math.max(0.01, c.recovery)
        return { anim: s.hand === 'left' ? 'lcast' : 'cast', t: Math.max(0, Math.min(1, t)) }
      }
      case 'channel':
      case 'dash':
        return { anim: this.castHand === 'left' ? 'lcast' : 'cast', t: 1 }
    }
    if (this.hurt > 0) return { anim: 'hurt', t: this.hurt > HURT_TIME / 2 ? 1 : 0.5 }
    const speed = Math.hypot(this.vx, this.vy)
    if (speed > 20) {
      this.walkPhase += (dt * speed) / STRIDE
      return { anim: 'walk', t: this.walkPhase }
    }
    this.walkPhase = 0
    return { anim: 'idle', t: this.time / IDLE_PERIOD }
  }

  /** Swing time to animation time: windup, strike and recovery each have their stretch. */
  private attackTime(s: Extract<State, { kind: 'swing' }>) {
    const { windup, active, recovery } = s.attack
    if (s.t < windup) return lerp(s.from, STRIKE_START, s.t / windup)
    if (s.t < windup + active) return lerp(STRIKE_START, STRIKE_END, (s.t - windup) / active)
    return lerp(STRIKE_END, 1, Math.min(1, (s.t - windup - active) / Math.max(0.01, recovery)))
  }

  /** How far into the heavy attack's windup a held heavy has drawn back, as animation time. */
  private heavyWindup() {
    if (this.state.kind === 'charging') return HELD_WINDUP
    if (this.state.kind === 'heavyHold') return HELD_WINDUP * Math.min(1, this.state.t / this.weapon.heavy.chargeThreshold)
    return 0
  }

  /** Puts a weapon in its hand as drawn in this frame. Returns whether it's in front of the body. */
  private placeWeapon(hand: Hand, h: HandPose, hidden: boolean, d: number, anim: CharacterAnim): boolean {
    const img = this.weaponImages[hand]
    const w = this.held(hand)
    img.setVisible(!!w && !hidden)
    if (!w || hidden) return false
    img.setPosition(h.x, h.y)
    if (w.art.upright) {
      // Shields stay upright, facing the way the body does: narrow side-on.
      img.setRotation(0).setScale(Math.max(0.4, Math.abs(Math.sin((d * Math.PI) / 4))), 1).setFlipY(false)
      return h.depth > 0
    }
    // Blades turn and foreshorten with the drawn arm. Pointing left they're flipped so the
    // edge and the baked light stay the right way up.
    const dir = this.bladeDir(hand, h, d, anim)
    const { angle, scale } = onScreen(dir)
    img.setRotation(angle).setScale(Math.max(0.25, scale), 1).setFlipY(Math.cos(angle) < 0)
    // In front of the body when the hand, or enough of the blade, is on the camera's side of it.
    return h.depth + dir.y * (w.art.width - w.art.grip.x) * 0.3 > 0
  }

  /**
   * Which way a held blade points: as drawn, except that a weapon with its own resting angle
   * is held level at that angle while idle or walking.
   */
  private bladeDir(hand: Hand, h: HandPose, d: number, anim: CharacterAnim): Vec3 {
    const rest = this.held(hand)?.art.rest
    if (rest === undefined || !RESTING.has(anim)) return h.dir
    const a = (d * Math.PI) / 4 + degToRad(hand === 'right' ? rest : -rest)
    return { x: Math.cos(a) * 0.97, y: Math.sin(a) * 0.97, z: -0.24 }
  }

  /** Where a held weapon's tip is on screen (a shield's: its top). */
  private tip(h: HandPose, art: WeaponDef['art'], inset = 0) {
    if (art.upright) return { x: this.x + h.x, y: this.y + h.y - art.height / 2 }
    const { angle, scale } = onScreen(h.dir)
    const len = (art.width - art.grip.x - inset) * Math.max(0.25, scale)
    return { x: this.x + h.x + Math.cos(angle) * len, y: this.y + h.y + Math.sin(angle) * len }
  }

  /**
   * The swing's smear: a ribbon along the blade's path from where the strike began to where
   * it is now, fading towards its tail and out through the recovery.
   */
  private drawSwingArc(s: Extract<State, { kind: 'swing' }>, anim: CharacterAnim, d: number, t: number) {
    const { windup, active, recovery } = s.attack
    if (s.t < windup) return
    const fade = s.t < windup + active ? 1 : Math.max(0, 1 - (s.t - windup - active) / (recovery * 0.35))
    if (fade <= 0) return
    const w = this.held(s.hand)
    if (!w || w.art.upright) return
    const len = w.art.width - w.art.grip.x
    const im = this.imbues[s.hand]
    const colour = im ? parseInt(im.colour.slice(1), 16) : s.swing === 'charged' || s.swing === 'skill' ? 0xffa04a : 0xf2ead8
    const steps = 14
    const end = Math.min(t, STRIKE_END)
    const path = Array.from({ length: steps + 1 }, (_, i) => {
      const b = this.art.blade(anim, d, lerp(STRIKE_START, end, i / steps), s.hand, len * 0.45, len)
      return { inner: new Phaser.Math.Vector2(this.x + b.inner.x, this.y + b.inner.y), outer: new Phaser.Math.Vector2(this.x + b.outer.x, this.y + b.outer.y) }
    })
    for (let i = 0; i < steps; i++) {
      const k = (i + 1) / steps // brighter towards the blade
      this.fx.fillStyle(colour, 0.42 * k * k * fade)
      this.fx.fillPoints([path[i].inner, path[i].outer, path[i + 1].outer, path[i + 1].inner], true)
    }
    // A bright edge along the path of the tip.
    this.fx.lineStyle(2, 0xffffff, 0.55 * fade)
    this.fx.beginPath()
    const first = Math.floor(steps * 0.4)
    this.fx.moveTo(path[first].outer.x, path[first].outer.y)
    for (let i = first + 1; i <= steps; i++) this.fx.lineTo(path[i].outer.x, path[i].outer.y)
    this.fx.strokePath()
  }

  private drawChargeGlow(h: HandPose) {
    const c = this.charge
    const tip = this.tip(h, this.weapon.art, 6)
    this.fx.fillStyle(0xffa04a, 0.15 + 0.25 * c)
    this.fx.fillCircle(tip.x, tip.y, 6 + 12 * c)
    this.fx.lineStyle(2, 0xffa04a, 0.3 + 0.5 * c)
    this.fx.strokeEllipse(this.x, this.y, (RADIUS + 10 + 30 * (1 - c)) * 2, (RADIUS + 10 + 30 * (1 - c)) * 1.2)
  }

  private drawCastGlow(h: HandPose, progress: number, colour: string) {
    const tip = this.tip(h, (this.held(this.castHand) ?? this.weapon).art)
    this.fx.fillStyle(parseInt(colour.slice(1), 16), 0.2 + 0.4 * progress)
    this.fx.fillCircle(tip.x, tip.y, 4 + 10 * progress)
  }
}

/** Holding the lock button this long locks on / off; anything shorter is a tap. */
const LOCK_HOLD = 0.35

/** How long a fully charged heavy takes once charging starts. */
const CHARGE_TIME = 0.5

export const weaponTextureKey = (id: string) => `weapon:${id}`
