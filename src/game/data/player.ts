// Generated from the Godot version (Ashen Vow): data/vitals/wanderer_vitals.tres, data/movement/player_movement.tres
// Converted to this game's units; edit freely, this file is now the source.
import type { MovementDef, VitalsDef } from './types.ts'

export const PLAYER_VITALS: VitalsDef = {
  health: 650,
  stamina: 120,
  referenceLevel: 10,
  healthPerVigor: 30,
  staminaPerEndurance: 3,
  staminaRegeneration: 45,
  staminaRegenerationDelay: 0.65,
  poise: 30,
  poiseRegeneration: 15,
  poiseRegenerationDelay: 1.5,
  staggerDuration: 0.22,
  knockbackDeceleration: 1272.73,
  damageInvulnerability: 0.65,
  defence: {},
  statusResistances: {},
  statusImmunities: [],
}

export const PLAYER_MOVEMENT: MovementDef = {
  walkSpeed: 232.73,
  sprintMultiplier: 1.5,
  acceleration: 954.55,
  deceleration: 1727.27,
  sprintStaminaPerSecond: 18,
  sprintHoldThreshold: 0.2,
  combatExitDelay: 3.0,
  dodgeDuration: 0.45,
  dodgeDistance: 159.09,
  dodgeCooldown: 0.55,
  dodgeCost: 24,
  invulnerabilityStart: 0.133333,
  invulnerabilityEnd: 0.755556,
  inputBuffer: 0.12,
  lockOnRadius: 698.18,
}
