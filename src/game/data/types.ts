import type { AttributeId } from './attributes.ts'

// Definition schemas: the data-driven "resources" for weapons, spells and enemies.
// Each content file in data/weapons, data/spells or data/enemies default-exports one
// definition made with defineWeapon / defineSpell / defineEnemy, and is picked up
// automatically by the registry. Times are in seconds, distances in world px.

/** How much each attribute adds to damage, e.g. { strength: 0.6 }. */
export type Scaling = Partial<Record<AttributeId, number>>

/** Art drawn at native size (1 SVG unit = 1 world px). */
export interface SvgArt {
  url: string // import it with `?no-inline`
  width: number
  height: number
}

/** One swing: light, heavy, charged, or a skill. */
export interface MoveDef {
  damage: number
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

export interface ProjectileEffect {
  kind: 'projectile'
  speed: number
  radius: number
  range: number
}

export type SpellEffect = ProjectileEffect

export interface SpellDef {
  id: string
  name: string
  description?: string
  /** Uses per attunement before Intelligence bonuses (DS1-style charges, no FP). */
  charges: number
  castTime: number
  recovery: number
  damage: number
  scaling: Scaling
  effect: SpellEffect
  art?: SvgArt
}

export interface EnemyAttackDef {
  id: string
  damage: number
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
  behaviour: 'melee-chaser' // grows as behaviours are added
  attacks: EnemyAttackDef[]
  runes: number // base runes dropped, before run-time scaling
  loot?: { chance: number; table: LootEntry[] }
  art: SvgArt
}

// Identity helpers: they only exist so content files get full type checking.
export const defineWeapon = <T extends WeaponDef>(def: T): T => def
export const defineSpell = (def: SpellDef): SpellDef => def
export const defineEnemy = (def: EnemyDef): EnemyDef => def
