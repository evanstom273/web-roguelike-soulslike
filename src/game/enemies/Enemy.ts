import * as Phaser from 'phaser'
import { Combatant } from '../combat/Combatant.ts'
import type { CombatWorld, Target } from '../combat/CombatWorld.ts'
import type { Caster, SpellSystem } from '../combat/SpellSystem.ts'
import { baseLevels } from '../data/attributes.ts'
import type { Threat } from '../data/difficulty.ts'
import { getSpell, getWeapon } from '../data/registry.ts'
import type { AttackDef, EnemyDef, EnemyMove, SpellDef, StatusDef, WeaponDef } from '../data/types.ts'
import { CharacterArt, holdWeapon, type CharacterAnim } from '../player/characterArt.ts'
import { weaponTextureKey } from '../player/Player.ts'
import { resolveWalls, type Segment, type Vec } from '../world/floorGeometry.ts'
import { facing8, LAYER, standingDepth } from '../world/projection.ts'

// An enemy: notices you, closes in (or keeps its distance), and uses its moves, following
// the Godot version's enemy mind. Drawn from its own frame sheet, like the player.

type State =
  | { kind: 'idle' }
  | { kind: 'chase' }
  | { kind: 'search'; t: number }
  | { kind: 'home' }
  | { kind: 'attack'; t: number; move: EnemyMove; attack: AttackDef; spell: SpellDef | null; done: boolean }
  | { kind: 'stagger'; t: number; vx: number; vy: number }
  | { kind: 'dead'; t: number }

/** Who it's after: the player. */
export interface Quarry {
  self: Target
  x: number
  y: number
  /** Told when an enemy engages, so stamina costs apply. */
  enterCombat(): void
}

// Drawn attacks wind up until 35% of their animation and strike until 60% (tools/rig).
const STRIKE_START = 0.35
const STRIKE_END = 0.6
const STRIDE = 110 // px walked per full stride
const IDLE_PERIOD = 2.4
const TURN_RATE = 9 // radians per second
const LOOK_INTERVAL = 0.2 // seconds between sight checks
const CORPSE_TIME = 2.5 // a body lies this long, then fades
const FADE_TIME = 0.8
const BAR_WIDTH = 64
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const angleTo = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x)

export class Enemy implements Caster {
  readonly def: EnemyDef
  readonly self: Target
  readonly actor: Combatant
  readonly levels = baseLevels()
  x: number
  y: number
  facing = Math.PI / 2
  /** Faded out after dying; can be dropped. */
  removed = false
  /** Not looking for you yet: woken when you come into its room, or by being hit. */
  dormant = false
  onKilled: ((e: Enemy) => void) | null = null

  private world: CombatWorld
  private spells: SpellSystem
  private walls: Segment[]
  private quarry: Quarry
  private home: Vec
  private damageScale: number
  private state: State = { kind: 'idle' }
  private lastSeen: Vec | null = null
  private sinceSeen = 0
  private seesQuarry = false
  private lookIn = Math.random() * LOOK_INTERVAL
  private cooldowns = new Map<string, number>()
  private time = Math.random() * IDLE_PERIOD // so a room of them doesn't breathe in step
  private walkPhase = 0
  private speedNow = 0
  private flash = 0

  private art: CharacterArt
  private root: Phaser.GameObjects.Container
  private body: Phaser.GameObjects.Image
  private shadow: Phaser.GameObjects.Ellipse
  private weapon: WeaponDef | null
  private weaponImg: Phaser.GameObjects.Image | null
  private bars: Phaser.GameObjects.Graphics

  constructor(
    scene: Phaser.Scene,
    def: EnemyDef,
    at: Vec,
    threat: Threat,
    world: CombatWorld,
    spells: SpellSystem,
    walls: Segment[],
    quarry: Quarry,
    getStatus: (id: string) => StatusDef,
  ) {
    this.def = def
    this.world = world
    this.spells = spells
    this.walls = walls
    this.quarry = quarry
    this.x = at.x
    this.y = at.y
    this.home = { ...at }
    this.facing = Math.random() * Math.PI * 2
    this.damageScale = threat.damage
    this.actor = new Combatant({ vitals: def.vitals, maxHp: Math.round(def.vitals.health * threat.health), getStatus })
    this.actor.onDamaged = (_n, periodic) => {
      if (!periodic) this.flash = 0.1
      this.provoked()
    }
    this.actor.onStagger = (knockback, source) => this.stagger(knockback, source)
    this.self = world.add({ actor: this.actor, team: 'enemy', x: this.x, y: this.y, radius: def.radius })

    this.art = new CharacterArt(scene, def.look)
    this.body = scene.add.image(0, 0, this.art.texture, this.art.frame('idle', 2, 0).name).setOrigin(this.art.origin.x, this.art.origin.y)
    this.shadow = scene.add.ellipse(0, 0, 58, 16, 0x000000, 0.4)
    this.weapon = def.weapon ? getWeapon(def.weapon) : null
    this.weaponImg = this.weapon
      ? scene.add.image(0, 0, weaponTextureKey(this.weapon.id)).setOrigin(this.weapon.art.grip.x / this.weapon.art.width, this.weapon.art.grip.y / this.weapon.art.height)
      : null
    this.root = scene.add.container(this.x, this.y, [this.shadow, ...(this.weaponImg ? [this.weaponImg] : []), this.body])
    this.bars = scene.add.graphics().setDepth(LAYER.overhead)
  }

  get dead() {
    return this.state.kind === 'dead'
  }

  // ---- Caster (for moves that cast spells) -----------------------------------

  aim() {
    return angleTo(this, this.quarry)
  }

  channelHeld() {
    return false
  }

  dashMove(dx: number, dy: number) {
    const before = { x: this.x, y: this.y }
    this.moveTo(this.x + dx, this.y + dy)
    return Math.hypot(this.x - before.x, this.y - before.y)
  }

  setDashInvulnerable() {}

  imbue() {}

  // ---- Update -----------------------------------------------------------------

  update(dt: number) {
    this.time += dt
    this.flash = Math.max(0, this.flash - dt)
    this.actor.update(dt)
    if (!this.actor.alive && this.state.kind !== 'dead') this.die()
    if (this.state.kind !== 'dead') this.look(dt)

    const before = { x: this.x, y: this.y }
    switch (this.state.kind) {
      case 'idle':
        if (this.seesQuarry) this.state = { kind: 'chase' }
        break
      case 'chase':
        this.chase(dt)
        break
      case 'search': {
        const s = this.state
        s.t += dt
        this.facing += dt * 0.8 // looking about
        if (this.seesQuarry) this.state = { kind: 'chase' }
        else if (s.t >= this.def.perception.search) this.state = { kind: 'home' }
        break
      }
      case 'home':
        if (this.seesQuarry) this.state = { kind: 'chase' }
        else if (this.walkTowards(this.home, dt, 8)) this.state = { kind: 'idle' }
        break
      case 'attack':
        this.attack(this.state, dt)
        break
      case 'stagger': {
        const s = this.state
        const left = 1 - s.t / Math.max(0.01, this.def.vitals.staggerDuration)
        this.moveTo(this.x + s.vx * left * dt, this.y + s.vy * left * dt)
        s.t += dt
        if (s.t >= this.def.vitals.staggerDuration) this.state = { kind: 'chase' }
        break
      }
      case 'dead': {
        const s = this.state
        s.t += dt
        if (s.t >= CORPSE_TIME + FADE_TIME) this.destroy()
        break
      }
    }
    this.speedNow = dt > 0 ? Math.hypot(this.x - before.x, this.y - before.y) / dt : 0
    this.self.x = this.x
    this.self.y = this.y
    if (!this.removed) this.render(dt)
  }

  /** Sight: within range, with nothing in the way. Checked a few times a second. */
  private look(dt: number) {
    if (this.dormant) return
    this.lookIn -= dt
    if (this.lookIn <= 0) {
      this.lookIn = LOOK_INTERVAL
      const q = this.quarry
      const d = Math.hypot(q.x - this.x, q.y - this.y)
      this.seesQuarry = q.self.actor.alive && d <= this.def.perception.sight && this.world.visible(this, q)
    }
    if (this.seesQuarry) {
      this.lastSeen = { x: this.quarry.x, y: this.quarry.y }
      this.sinceSeen = 0
    } else {
      this.sinceSeen += dt
    }
  }

  /** Starts looking for you. */
  wake() {
    this.dormant = false
    this.lookIn = 0
  }

  /** Hit by something: come and find out who did it. */
  private provoked() {
    this.dormant = false
    if (!this.quarry.self.actor.alive) return
    this.lastSeen = { x: this.quarry.x, y: this.quarry.y }
    this.sinceSeen = 0
    const k = this.state.kind
    if (k === 'idle' || k === 'search' || k === 'home') this.state = { kind: 'chase' }
  }

  private chase(dt: number) {
    if (!this.lastSeen || this.sinceSeen > this.def.perception.memory) {
      this.state = { kind: 'search', t: 0 }
      return
    }
    const q = this.quarry
    const d = Math.hypot(q.x - this.x, q.y - this.y)
    if (this.seesQuarry) {
      q.enterCombat()
      const move = this.chooseMove(d)
      if (move) return this.startMove(move)
    }
    // Ranged: hold about the preferred distance, backing off if you close in.
    const pref = this.def.preferredDistance
    if (pref > 0 && this.seesQuarry) {
      this.turnTowards(angleTo(this, q), dt)
      if (d < pref * 0.65) {
        const away = angleTo(q, this)
        this.moveTo(this.x + Math.cos(away) * this.speed * 0.7 * dt, this.y + Math.sin(away) * this.speed * 0.7 * dt)
      } else if (d > pref) {
        this.walkTowards(q, dt, pref)
      }
      return
    }
    // Close in to just inside the shortest reach, then wait for a move to come off cooldown.
    const stop = Math.min(...this.def.moves.map((m) => m.maxRange)) * 0.85
    if (this.seesQuarry && d <= stop) this.turnTowards(angleTo(this, q), dt)
    else if (this.walkTowards(this.lastSeen, dt, this.seesQuarry ? stop : 10) && !this.seesQuarry) this.state = { kind: 'search', t: 0 }
  }

  private get speed() {
    return this.def.speed * this.actor.movementMultiplier
  }

  /** The best move for this distance that's off cooldown, if any. */
  private chooseMove(d: number): EnemyMove | null {
    let best: EnemyMove | null = null
    for (const m of this.def.moves) {
      if ((this.cooldowns.get(m.id) ?? 0) > this.time) continue
      if (d < m.minRange || d > m.maxRange) continue
      if (!best || m.priority > best.priority) best = m
    }
    return best
  }

  private startMove(move: EnemyMove) {
    const spell = move.spell ? getSpell(move.spell) : null
    const attack = move.attack ?? spell!.cast
    this.state = { kind: 'attack', t: 0, move, attack, spell, done: false }
    this.cooldowns.set(move.id, this.time + move.cooldown + attack.windup + attack.active + attack.recovery)
  }

  private attack(s: Extract<State, { kind: 'attack' }>, dt: number) {
    const a = s.attack
    // Tracks you for the first part of the windup, then commits to the swing.
    if (s.t < a.windup * s.move.trackWindup) this.turnTowards(angleTo(this, this.quarry), dt)
    if (a.lungeSpeed > 0 && s.t >= a.windup && s.t < a.windup + a.active) {
      this.moveTo(this.x + Math.cos(this.facing) * a.lungeSpeed * dt, this.y + Math.sin(this.facing) * a.lungeSpeed * dt)
    }
    s.t += dt
    if (!s.done && s.t >= a.windup) {
      if (s.spell) {
        this.cast(s.spell)
        s.done = true
      } else if (s.t < a.windup + a.active) {
        s.done = this.strike(a)
      } else {
        s.done = true
      }
    }
    if (s.t >= a.windup + a.active + a.recovery) this.state = { kind: 'chase' }
  }

  /** A melee blow: lands if you're within reach and inside its arc. Returns whether it hit. */
  private strike(a: AttackDef): boolean {
    const t = this.quarry.self
    const d = Math.hypot(t.x - this.x, t.y - this.y)
    if (d > a.reach + t.radius) return false
    const off = Math.abs(Math.atan2(Math.sin(angleTo(this, t) - this.facing), Math.cos(angleTo(this, t) - this.facing)))
    if (d > t.radius && off > ((a.arc / 2) * Math.PI) / 180) return false
    if (!this.world.visible(this, t)) return false
    return this.world.hit(t, { attack: a, ctx: { levels: null, multiplier: this.damageScale }, source: { x: this.x, y: this.y } }).accepted
  }

  private cast(spell: SpellDef) {
    const q = this.quarry
    this.spells.launch(spell.delivery, {
      caster: this,
      spell,
      attack: spell.cast,
      origin: { x: this.x, y: this.y },
      direction: this.facing,
      point: this.world.wallEnd(this, q, 25),
      target: q.self,
      depth: 0,
      multiplier: this.damageScale,
    })
  }

  private stagger(knockback: number, source: Vec | undefined) {
    if (this.state.kind === 'dead') return
    if (this.state.kind === 'attack' && this.state.attack.uninterruptibleWhileActive) {
      const a = this.state.attack
      if (this.state.t >= a.windup && this.state.t < a.windup + a.active) return
    }
    const from = source ?? this.quarry
    const away = angleTo(from, this)
    const speed = (this.def.staggerRecoil * knockback) / 180
    this.state = { kind: 'stagger', t: 0, vx: Math.cos(away) * speed, vy: Math.sin(away) * speed }
  }

  private die() {
    this.state = { kind: 'dead', t: 0 }
    this.onKilled?.(this)
  }

  private destroy() {
    this.removed = true
    this.world.remove(this.self)
    this.root.destroy()
    this.bars.destroy()
  }

  // ---- Movement -----------------------------------------------------------------

  private turnTowards(angle: number, dt: number) {
    const diff = Math.atan2(Math.sin(angle - this.facing), Math.cos(angle - this.facing))
    const step = TURN_RATE * dt
    this.facing += Math.max(-step, Math.min(step, diff))
  }

  /** Walks towards a point, stopping `stop` short of it. Returns true once there. */
  private walkTowards(to: Vec, dt: number, stop: number): boolean {
    const d = Math.hypot(to.x - this.x, to.y - this.y)
    if (d <= stop) return true
    const a = angleTo(this, to)
    this.turnTowards(a, dt)
    const step = Math.min(this.speed * dt, d - stop)
    this.moveTo(this.x + Math.cos(a) * step, this.y + Math.sin(a) * step)
    return false
  }

  private moveTo(x: number, y: number) {
    // Bodies don't overlap: step out of anyone else, then out of walls.
    for (const t of this.world.targets) {
      if (t === this.self || !t.actor.alive) continue
      const dx = x - t.x
      const dy = y - t.y
      const d = Math.hypot(dx, dy)
      const min = this.def.radius + t.radius
      if (d < min && d > 1e-6) {
        x = t.x + (dx / d) * min
        y = t.y + (dy / d) * min
      }
    }
    const p = resolveWalls({ x, y }, this.def.radius, this.walls)
    this.x = p.x
    this.y = p.y
  }

  // ---- Rendering ----------------------------------------------------------------

  private render(dt: number) {
    const d = facing8(this.facing).index
    const { anim, t } = this.animation(dt)
    const frame = this.art.frame(anim, d, t)
    const s = this.state
    const fade = s.kind === 'dead' ? Math.max(0, 1 - (s.t - CORPSE_TIME) / FADE_TIME) : 1
    this.root.setPosition(this.x, this.y).setDepth(standingDepth(this.y)).setAlpha(Math.min(1, fade))
    this.body.setFrame(frame.name)
    if (this.flash > 0) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
    this.shadow.setVisible(s.kind !== 'dead')

    if (this.weapon && this.weaponImg) {
      const front = holdWeapon(this.weaponImg, this.weapon, frame.right, frame.right.dir, d)
      // Only re-stack when the order changes: rebuilding a container every frame makes
      // Phaser drop children from some frames.
      const order = front ? [this.shadow, this.body, this.weaponImg] : [this.shadow, this.weaponImg, this.body]
      if (order.some((o, i) => this.root.list[i] !== o)) {
        this.root.removeAll(false)
        this.root.add(order)
      }
    }
    this.drawBars()
  }

  /** Which animation the body shows, and how far through it (0..1). */
  private animation(dt: number): { anim: CharacterAnim; t: number } {
    const s = this.state
    if (s.kind === 'dead') return { anim: 'death', t: Math.min(1, s.t / 0.9) }
    if (s.kind === 'stagger') return { anim: 'hurt', t: s.t < this.def.vitals.staggerDuration / 2 ? 1 : 0.5 }
    if (s.kind === 'attack') {
      const { windup, active, recovery } = s.attack
      if (s.move.anim === 'cast') {
        const t = s.t < windup ? s.t / windup : s.t < windup + active ? 1 : 1 - (s.t - windup - active) / Math.max(0.01, recovery)
        return { anim: 'cast', t: Math.max(0, Math.min(1, t)) }
      }
      const t =
        s.t < windup ? lerp(0, STRIKE_START, s.t / windup) : s.t < windup + active ? lerp(STRIKE_START, STRIKE_END, (s.t - windup) / active) : lerp(STRIKE_END, 1, Math.min(1, (s.t - windup - active) / Math.max(0.01, recovery)))
      return { anim: s.move.anim, t }
    }
    if (this.speedNow > 20) {
      this.walkPhase += (dt * this.speedNow) / STRIDE
      return { anim: 'walk', t: this.walkPhase }
    }
    this.walkPhase = 0
    return { anim: 'idle', t: this.time / IDLE_PERIOD }
  }

  /** Health (and any status building up) above its head, once it's been hurt. */
  private drawBars() {
    const g = this.bars
    g.clear()
    const a = this.actor
    if (this.state.kind === 'dead' || (a.hp >= a.maxHp && a.meters.size === 0)) return
    const top = this.y - 142
    const left = this.x - BAR_WIDTH / 2
    g.fillStyle(0x000000, 0.6)
    g.fillRect(left - 1, top - 1, BAR_WIDTH + 2, 7)
    g.fillStyle(0xc43a32, 1)
    g.fillRect(left, top, (BAR_WIDTH * a.hp) / a.maxHp, 5)
    let row = 0
    for (const m of a.meters.values()) {
      const by = top + 9 + row++ * 5
      g.fillStyle(0x000000, 0.6)
      g.fillRect(left, by, BAR_WIDTH, 3)
      g.fillStyle(parseInt(m.status.colour.slice(1), 16), m.cooldown > 0 ? 0.4 : 1)
      g.fillRect(left, by, m.cooldown > 0 ? BAR_WIDTH : (BAR_WIDTH * m.value) / m.threshold, 3)
    }
  }
}
