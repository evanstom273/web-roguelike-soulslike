import type { AttributeId } from './attributes.ts'
import type { DamageMap } from './damageTypes.ts'

// Definition schemas: the data-driven "resources" for weapons, spells, statuses and
// enemies. Each content file in data/<kind>/ default-exports one definition made with
// the matching define* helper, and is picked up automatically by the registry.
// Times are in seconds, distances in world px, angles in degrees.

/** How much each attribute adds to damage, e.g. { strength: 0.6 }. */
export type Scaling = Partial<Record<AttributeId, number>>

/** Art drawn at native size (1 SVG unit = 1 world px). */
export interface SvgArt {
  url: string // import it with `?no-inline`
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Hits and statuses

/**
 * A status inflicted by a hit. For statuses with a buildup meter, `buildup` is how much
 * this hit adds; statuses without one apply on every hit and ignore it.
 */
export interface StatusApplication {
  status: string // a status id from data/statuses
  buildup?: number
}

/** What landing a hit does: typed damage plus any statuses. */
export interface HitDef {
  damage: DamageMap
  statuses?: StatusApplication[]
}

export type StatusEffect =
  /** Damage every `interval` for `duration` (burns, poisons, black flame-style). */
  | { kind: 'dot'; duration: number; interval: number; damage?: DamageMap; percentMaxHp?: number }
  /** One-off damage when the status lands or procs (bleed-style). */
  | { kind: 'burst'; damage?: DamageMap; percentMaxHp?: number }
  /** Movement speed multiplier, e.g. 0.6. */
  | { kind: 'slow'; duration: number; multiplier: number }
  /** Damage taken multiplier, e.g. 1.2. */
  | { kind: 'vulnerability'; duration: number; multiplier: number }

export interface StatusDef {
  id: string
  name: string
  description?: string
  colour: string
  /**
   * With a meter, hits add buildup and the effects fire when it fills (then it resets).
   * Without one, the effects fire on every hit that carries this status.
   */
  buildup?: { threshold: number; decayPerSecond: number }
  /** What re-applying does while it's already active. */
  stacking: 'refresh' | 'stack' | 'ignore'
  maxStacks?: number // for 'stack'
  effects: StatusEffect[]
}

// ---------------------------------------------------------------------------
// Weapons

/** One swing: light, heavy, charged, or a skill. */
export interface MoveDef extends HitDef {
  stamina: number
  windup: number
  active: number
  recovery: number
  lunge: number // distance stepped forward during the active part
  arc: number // degrees swept
  reach: number
}

/** A weapon skill / Ash of War. Reusable, gated by a long cooldown and a big stamina cost. */
export interface SkillDef {
  name: string
  description?: string
  cooldown: number
  move: MoveDef // its stamina is the skill's stamina cost
}

interface WeaponBase {
  id: string
  name: string
  description?: string
  art: SvgArt & { grip: { x: number; y: number } } // grip = the point held in the hand
  scaling: Scaling
  skill?: SkillDef
}

export interface MeleeWeaponDef extends WeaponBase {
  kind: 'melee'
  light: MoveDef
  heavy: MoveDef
  charged: MoveDef
  charge: {
    holdToCharge: number // holding heavy longer than this starts the charged attack
    maxCharge: number // releases automatically after this long
  }
  /** Minimum time between starts of the same kind of attack. Charged shares heavy's. */
  cooldown: { light: number; heavy: number }
}

/** Casting tool: the light attack button casts the selected spell. */
export interface CatalystWeaponDef extends WeaponBase {
  kind: 'catalyst'
  castSpeed: number // multiplier on spells' cast times; 1 = as written
}

export type WeaponDef = MeleeWeaponDef | CatalystWeaponDef

// ---------------------------------------------------------------------------
// Spells
//
// A spell is one or more deliveries that all fire when the cast completes. `at: 'aim'`
// places something `distance` ahead of the caster (stopping short of walls); `'self'`
// places it on the caster.

type Placement = { at: 'self' | 'aim'; distance?: number }

export interface ProjectileDelivery {
  delivery: 'projectile'
  hit: HitDef
  speed: number
  radius: number
  range: number
  count?: number // several at once, fanned across `spread` degrees
  spread?: number
  pierce?: number // extra targets it passes through
  homing?: number // degrees per second it turns towards the nearest target
  /** A burst where it stops, e.g. an explosion. */
  onImpact?: { hit: HitDef; radius: number }
}

/** An instant burst. */
export interface AreaDelivery extends Placement {
  delivery: 'area'
  hit: HitDef
  radius: number
  delay?: number // warning time before it goes off
}

/** Healing and/or statuses on the caster. */
export interface SelfDelivery {
  delivery: 'self'
  heal?: number
  statuses?: StatusApplication[]
}

/** Strikes the nearest target in front of the caster directly. */
export interface TargetDelivery {
  delivery: 'target'
  hit: HitDef
  range: number
  arc?: number // how wide in front to look for a target, degrees (default 60)
  delay?: number
}

/** A continuous line from the caster, hitting every `interval`. Roots the caster while it lasts. */
export interface BeamDelivery {
  delivery: 'beam'
  hit: HitDef
  length: number
  width: number
  duration: number
  interval: number
  turnRate?: number // degrees per second the caster can steer it
}

/** Adds damage and/or statuses to the caster's weapon hits for a while. */
export interface WeaponImbueDelivery {
  delivery: 'weapon-imbue'
  hit: HitDef
  duration: number
}

/** An instant hit across a wedge in front of the caster. */
export interface ConeDelivery {
  delivery: 'cone'
  hit: HitDef
  range: number
  arc: number
}

/** An expanding arc travelling outwards from the caster. */
export interface WaveDelivery {
  delivery: 'wave'
  hit: HitDef
  speed: number
  range: number
  arc: number
  thickness: number
}

/** A lingering area that hits everything inside every `interval`. */
export interface GroundZoneDelivery extends Placement {
  delivery: 'ground-zone'
  hit: HitDef
  radius: number
  duration: number
  interval: number
  delay?: number
}

/** Hits a target, then jumps to the next nearest, and so on. */
export interface ChainDelivery {
  delivery: 'chain'
  hit: HitDef
  range: number // reach to the first target
  jumps: number
  jumpRange: number
  falloff?: number // damage multiplier per jump, e.g. 0.8
}

/** Objects circling the caster, hitting what they touch. */
export interface OrbitingDelivery {
  delivery: 'orbiting'
  hit: HitDef
  count: number
  orbitRadius: number
  radius: number
  speed: number // degrees per second
  duration: number
  rehit: number // seconds before the same target can be hit again
}

/** Placed on the ground; goes off when an enemy comes close. */
export interface TrapDelivery extends Placement {
  delivery: 'trap'
  hit: HitDef
  radius: number // blast radius
  triggerRadius: number
  armTime: number
  lifetime: number
}

/** Many strikes landing at random spots over an area, one after another. */
export interface BarrageDelivery extends Placement {
  delivery: 'barrage'
  hit: HitDef
  count: number
  interval: number
  spread: number // radius of the area they land in
  radius: number // each strike's radius
  delay?: number // warning time per strike
}

/** Calls an ally to fight alongside the caster. */
export interface SummonDelivery {
  delivery: 'summon'
  ally: string // an enemy id from data/enemies, fighting for the caster
  count: number
  duration: number
}

/** A field around the caster that follows them, hitting nearby enemies every `interval`. */
export interface AuraDelivery {
  delivery: 'aura'
  hit: HitDef
  radius: number
  duration: number
  interval: number
}

/** Moves the caster, optionally hitting everything along the way. */
export interface DashDelivery {
  delivery: 'dash'
  distance: number
  duration: number
  invulnerable?: boolean
  hit?: HitDef
  width?: number // hit width along the path
}

/** Latches onto the nearest target, hitting every `interval` until it gets too far away. */
export interface TetherDelivery {
  delivery: 'tether'
  hit: HitDef
  range: number // reach to latch on
  breakRange: number
  duration: number
  interval: number
}

export type SpellDelivery =
  | ProjectileDelivery
  | AreaDelivery
  | SelfDelivery
  | TargetDelivery
  | BeamDelivery
  | WeaponImbueDelivery
  | ConeDelivery
  | WaveDelivery
  | GroundZoneDelivery
  | ChainDelivery
  | OrbitingDelivery
  | TrapDelivery
  | BarrageDelivery
  | SummonDelivery
  | AuraDelivery
  | DashDelivery
  | TetherDelivery

export interface SpellDef {
  id: string
  name: string
  description?: string
  /** Uses per attunement before Intelligence bonuses (DS1-style charges, no FP). */
  charges: number
  castTime: number
  recovery: number
  /** Applies to every damage number in the spell's deliveries. */
  scaling: Scaling
  /** All fire together when the cast completes. */
  deliveries: SpellDelivery[]
  colour?: string // tint for the effects; defaults to the first damage type's colour
  art?: SvgArt // projectile sprite, if it shouldn't be a plain glowing orb
}

// ---------------------------------------------------------------------------
// Enemies

export interface EnemyAttackDef extends HitDef {
  id: string
  windup: number
  active: number
  recovery: number
  arc: number
  reach: number
  cooldown: number
}

/** Something a loot roll can produce. Arcane's loot luck weights the rarer entries up. */
export interface LootEntry {
  item: { kind: 'weapon'; id: string } | { kind: 'spell'; id: string }
  weight: number
  rarity: 'common' | 'uncommon' | 'rare'
}

export interface EnemyDef {
  id: string
  name: string
  /**
   * Bosses have fixed difficulty and never scale with run time (GDD §4);
   * regular enemies scale with both floor and run time.
   */
  boss: boolean
  hp: number
  radius: number
  moveSpeed: number
  /** Damage taken multiplier per type: 0.5 = half damage, 1.5 = weak to it. */
  resistances?: DamageMap
  /** Statuses it's immune to. */
  immune?: string[]
  behaviour: 'melee-chaser' // grows as behaviours are added
  attacks: EnemyAttackDef[]
  runes: number // base runes dropped, before run-time scaling
  loot?: { chance: number; table: LootEntry[] }
  art: SvgArt
}

// Identity helpers: they only exist so content files get full type checking.
export const defineWeapon = <T extends WeaponDef>(def: T): T => def
export const defineSpell = (def: SpellDef): SpellDef => def
export const defineStatus = (def: StatusDef): StatusDef => def
export const defineEnemy = (def: EnemyDef): EnemyDef => def
