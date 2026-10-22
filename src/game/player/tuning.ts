// Placeholder movement numbers shared by every character, whatever they're holding.
// Weapon moves live in the weapon definitions (data/weapons) and health/stamina come
// from attributes (data/attributes.ts). Times in seconds, distances in world px.

export const PLAYER = {
  radius: 20, // collision circle
  walkSpeed: 230,
  staminaRegen: 55, // per second
  staminaRegenDelay: 0.55, // after spending stamina
  inputBuffer: 0.25, // how early a press is remembered before the current action can take it
}

// Like Elden Ring: tap the roll button to roll (on release), hold it to sprint.
export const SPRINT = {
  holdThreshold: 0.22, // holding roll longer than this sprints instead of rolling
  speed: 360,
  stamina: 24, // per second while sprinting
}

export const ROLL = {
  stamina: 18,
  duration: 0.42,
  distance: 200,
  invulnerable: [0.04, 0.3] as const, // i-frame window within the roll
  recovery: 0.1, // after the roll before acting again
}
