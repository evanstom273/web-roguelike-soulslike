import type { AttributeId } from './attributes.ts'
import type { DamageMap } from './damageTypes.ts'

// Definition schemas: the data-driven "resources" for weapons, spells, statuses and
// enemies. Each content file in data/<kind>/ default-exports one definition made with
// the matching define* helper, and is picked up automatically by the registry.
//
// The model and the numbers are ported from the Godot version (Ashen Vow), converted to
// this game's units: world px, seconds, degrees. See data/README.md.

/** Damage bonus per attribute point above `referenceLevel`, e.g. { strength: 0.025 }. */
export interface Scaling {
  referenceLevel: number
  per: Partial<Record<AttributeId, number>>
}

/** Percentage damage negation per damage type; negative values are weaknesses. */
export type Defence = DamageMap

/** Art drawn at native size (1 SVG unit = 1 world px). */
export interface SvgArt {
  url: string // import it with `?no-inline`
  width: number
  height: number
}

/** Attribute minimums to use something. */
export type Requirements = Partial<Record<AttributeId, number>>

// ---------------------------------------------------------------------------
// Attacks, effects and statuses

/**
 * The percentage max-HP burn (the black flame mechanic). Total damage, not per tick;
 * the total and duration grow with Intelligence along a log curve.
 */
export interface MaxHealthDrainDef {
  id: string // the same id refreshes rather than stacking
  startingLevel: number
  levelCap: number
  curvature: number
  startingFraction: number
  cappedFraction: number
  startingDuration: number
  cappedDuration: number
}

export interface StatusApplication {
  status: string // a status id from data/statuses
  buildup: number
}

/**
 * Everything one hit or swing carries: damage, scaling, statuses, and its timing and
 * shape when it's a melee swing or a spell cast.
 */
export interface AttackDef {
  name: string
  damage: DamageMap
  scaling: Scaling | null
  statuses: StatusApplication[]
  maxHealthDrain: MaxHealthDrainDef | null
  poiseDamage: number
  stamina: number
  knockback: number // px/s of recoil given to the receiver
  windup: number
  active: number
  recovery: number
  /** Fraction of walk speed you can still move at while doing this. */
  movementMultiplier: number
  uninterruptibleWhileActive: boolean
  /** Melee: hold longer than this to charge (for the heavy button). */
  chargeThreshold: number
  // Melee geometry
  reach: number
  hitRadius: number
  arc: number
  lungeSpeed: number
  // Feel
  hitStop: number
  cameraShake: number
}

/** A timed buff/debuff or instant restore, from spells or status procs. */
export interface EffectDef {
  id: string // the same id refreshes instead of stacking
  name: string
  tags: string[]
  negative: boolean
  cleanseTags: string[] // removes statuses / negative effects with these tags
  healthRestore: number
  staminaRestore: number
  duration: number // 0 = instant only
  interval: number
  periodicAttack: AttackDef | null
  periodicHeal: number
  movementMultiplier: number
  defenceBonus: Defence | null
}

/**
 * Builds up on a meter; when it fills the meter resets, the status can't build again for
 * `retriggerDelay`, and its effect and/or attack fire.
 */
export interface StatusDef {
  id: string
  name: string
  colour: string
  threshold: number
  decayPerSecond: number
  decayDelay: number
  retriggerDelay: number
  tags: string[]
  triggeredEffect: EffectDef | null
  triggeredAttack: AttackDef | null
}

// ---------------------------------------------------------------------------
// Weapons

/** A weapon skill / Ash of War. Reusable, gated by a long cooldown and a big stamina cost. */
export interface SkillDef {
  name: string
  description?: string
  cooldown: number
  attack: AttackDef // its stamina is the skill's stamina cost
}

export type WeaponCategory =
  | 'straight-sword'
  | 'greatsword'
  | 'dagger'
  | 'spear'
  | 'axe'
  | 'hammer'
  | 'staff'
  | 'seal'
  | 'wand'
  | 'shield'

export type SpellSchool = 'sorcery' | 'incantation' | 'arcane'

export interface WeaponDef {
  id: string
  name: string
  description?: string
  category: WeaponCategory
  weight: number
  requirements: Requirements
  art: SvgArt & { grip: { x: number; y: number } } // grip = the point held in the hand
  light: AttackDef
  heavy: AttackDef
  /** Hold heavy past `heavy.chargeThreshold` to charge this. */
  charged: AttackDef
  /** Minimum time between starts of the same kind of attack. Charged shares heavy's. */
  cooldown: { light: number; heavy: number }
  /** Catalysts cast the selected spell from the light button instead of swinging. */
  catalyst: { schools: SpellSchool[] /* empty = all */; basicSpell: string | null } | null
  skill: SkillDef | null
}

// ---------------------------------------------------------------------------
// Spells
//
// A spell is a cast (timing, stamina, how much you can move) plus one delivery. A
// delivery's own `attack` overrides the cast's as the hit payload. Lengths and speeds
// are world px; turn rates are degrees per second.

export type TargetFilter = 'hostile' | 'friendly' | 'caster'

interface DeliveryBase {
  attack: AttackDef | null
  effects: EffectDef[]
  duration: number
  tickInterval: number
  castRange: number
  placementDistance: number
  maxInstances: number
  targetFilter: TargetFilter
}

export interface ProjectileDelivery extends DeliveryBase {
  delivery: 'projectile'
  speed: number
  radius: number
  homing: boolean
  turnRate: number
  pierce: number
}
export interface AreaDelivery extends DeliveryBase {
  delivery: 'area'
  radius: number
  atCaster: boolean
  wallOcclusion: boolean
}
export interface SelfDelivery extends DeliveryBase {
  delivery: 'self'
}
export interface TargetDelivery extends DeliveryBase {
  delivery: 'target'
  requireLineOfSight: boolean
}
export interface BeamDelivery extends DeliveryBase {
  delivery: 'beam'
  length: number
  width: number
  turnRate: number
  movementMultiplier: number
  piercing: boolean
}
export interface ImbueDelivery extends DeliveryBase {
  delivery: 'weapon-imbue'
  bonusDamage: DamageMap // added to weapon hits, unscaled
  weaponColour: string
}
export interface ConeDelivery extends DeliveryBase {
  delivery: 'cone'
  radius: number
  angle: number
  held: boolean // channelled while the button is held, hitting every tick
  turnRate: number
  movementMultiplier: number
}
export interface WaveDelivery extends DeliveryBase {
  delivery: 'wave'
  speed: number
  distance: number
  width: number
  thickness: number
  curvature: number // degrees per second it bends
}
export interface GroundZoneDelivery extends DeliveryBase {
  delivery: 'ground-zone'
  radius: number
  initialDelay: number
}
export interface ChainDelivery extends DeliveryBase {
  delivery: 'chain'
  targetCount: number
  jumpRadius: number
  jumpDelay: number
  damageFalloff: number // multiplier per jump
  requireLineOfSight: boolean
}
export interface OrbitingDelivery extends DeliveryBase {
  delivery: 'orbiting'
  count: number
  orbitRadius: number
  orbitSpeed: number // degrees per second
  automatic: boolean // fire at targets by themselves, rather than on the next cast press
  fireInterval: number
  child: SpellDelivery
}
export interface TrapDelivery extends DeliveryBase {
  delivery: 'trap'
  armingDelay: number
  triggerRadius: number
  triggerCount: number
  rearmInterval: number
  child: SpellDelivery
}
export interface BarrageDelivery extends DeliveryBase {
  delivery: 'barrage'
  count: number
  scatterRadius: number
  impactRadius: number
  impactInterval: number
  telegraphDuration: number
}
export interface SummonDef {
  mobile: boolean
  health: number
  defence: Defence | null
  speed: number
  followDistance: number
  acquisitionRange: number
  attackRange: number
  attackInterval: number
  acquisitionInterval: number
  delivery: SpellDelivery // what it attacks with
}
export interface SummonDelivery extends DeliveryBase {
  delivery: 'summon'
  count: number
  summon: SummonDef
}
export interface AuraDelivery extends DeliveryBase {
  delivery: 'aura'
  radius: number
}
export interface DashDelivery extends DeliveryBase {
  delivery: 'dash'
  distance: number
  steering: number // degrees per second you can steer
  hitWidth: number
  invulnerable: boolean
  invulnerabilityStart: number // fractions of the dash
  invulnerabilityEnd: number
}
export interface TetherDelivery extends DeliveryBase {
  delivery: 'tether'
  breakRange: number
  lineOfSightGrace: number
  movementMultiplier: number
  completionAttack: AttackDef | null // lands if the tether lasts the full duration
  completionEffects: EffectDef[]
}

export type SpellDelivery =
  | ProjectileDelivery
  | AreaDelivery
  | SelfDelivery
  | TargetDelivery
  | BeamDelivery
  | ImbueDelivery
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
  school: SpellSchool
  requirements: Requirements
  /** Basic spells come free with their catalyst: unlimited uses. */
  basic: boolean
  /** Uses per run before Intelligence bonuses (DS1-style charges, no FP). */
  charges: number
  healthRestore: number
  staminaRestore: number
  cast: AttackDef
  delivery: SpellDelivery
  colour: string // tint for placeholder visuals
}

// ---------------------------------------------------------------------------
// Characters

/** Health, stamina, poise and defence for anything that fights, at reference attributes. */
export interface VitalsDef {
  health: number
  stamina: number
  referenceLevel: number
  healthPerVigor: number
  staminaPerEndurance: number
  staminaRegeneration: number
  staminaRegenerationDelay: number
  poise: number
  poiseRegeneration: number
  poiseRegenerationDelay: number
  staggerDuration: number
  knockbackDeceleration: number
  /** Seconds of protection after a hit lands (not counting damage over time). */
  damageInvulnerability: number
  defence: Defence
  statusResistances: Record<string, number> // threshold multipliers by status id
  statusImmunities: string[]
}

export interface MovementDef {
  walkSpeed: number
  sprintMultiplier: number
  acceleration: number
  deceleration: number
  sprintStaminaPerSecond: number
  sprintHoldThreshold: number
  /** Stamina is only spent in combat; combat lasts this long after the last exchange. */
  combatExitDelay: number
  dodgeDuration: number
  dodgeDistance: number
  dodgeCooldown: number
  dodgeCost: number
  invulnerabilityStart: number // fractions of the roll
  invulnerabilityEnd: number
  inputBuffer: number
}

// Identity helpers: they only exist so content files get full type checking.
export const defineWeapon = (def: WeaponDef): WeaponDef => def
export const defineSpell = (def: SpellDef): SpellDef => def
export const defineStatus = (def: StatusDef): StatusDef => def
