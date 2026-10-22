// Generated from the Godot version (Ashen Vow): data/spells/vow_spear.tres
// Converted to this game's units; edit freely, this file is now the source.
import { defineSpell } from '../types.ts'

export default defineSpell({
  id: 'holy-spear',
  name: 'Holy Spear',
  school: 'arcane',
  requirements: {
    intelligence: 10,
  },
  basic: false,
  charges: 10,
  healthRestore: 0,
  staminaRestore: 0,
  cast: {
    name: 'Holy Spear',
    damage: {
      holy: 240,
    },
    scaling: {
      referenceLevel: 10,
      per: {
        intelligence: 0.035,
      },
    },
    statuses: [],
    maxHealthDrain: null,
    poiseDamage: 25,
    stamina: 22,
    knockback: 181.82,
    windup: 0.22,
    active: 0.1,
    recovery: 0.25,
    movementMultiplier: 0.35,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 872.73,
    hitRadius: 40,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  delivery: {
    delivery: 'projectile',
    attack: null,
    effects: [],
    duration: 2,
    tickInterval: 0.3,
    castRange: 727.27,
    placementDistance: 327.27,
    maxInstances: 1,
    targetFilter: 'hostile',
    speed: 690.91,
    radius: 18.18,
    homing: false,
    turnRate: 171.89,
    pierce: 1,
  },
  colour: '#ffe9b0',
})
