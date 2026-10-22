// Placeholder combat numbers so the player can move and fight. None of these are
// design decisions yet; they're here to be tuned. Times in seconds, distances in world px.

export const PLAYER = {
  radius: 20, // collision circle
  walkSpeed: 230,
  maxHp: 100,
  maxFp: 60,
  maxStamina: 100,
  staminaRegen: 55, // per second
  staminaRegenDelay: 0.55, // after spending stamina
  inputBuffer: 0.25, // how early a press is remembered before the current action can take it
}

export const ROLL = {
  stamina: 18,
  duration: 0.42,
  distance: 200,
  invulnerable: [0.04, 0.3] as const, // i-frame window within the roll
  recovery: 0.1, // after the roll before acting again
}

export interface SwingTuning {
  stamina: number
  windup: number
  active: number
  recovery: number
  lunge: number // distance stepped forward during the swing
  arc: number // degrees
  reach: number
}

export const LIGHT: SwingTuning = { stamina: 12, windup: 0.1, active: 0.12, recovery: 0.24, lunge: 22, arc: 120, reach: 92 }
export const HEAVY: SwingTuning = { stamina: 24, windup: 0.34, active: 0.16, recovery: 0.42, lunge: 34, arc: 160, reach: 108 }
export const CHARGED: SwingTuning = { stamina: 32, windup: 0.06, active: 0.2, recovery: 0.5, lunge: 50, arc: 200, reach: 128 }

export const CHARGE = {
  holdToCharge: 0.22, // holding heavy longer than this starts a charged attack
  maxCharge: 0.9, // releases automatically at full charge
}
