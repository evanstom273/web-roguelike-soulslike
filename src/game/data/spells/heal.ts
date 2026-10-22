// Generated from the Godot version (Ashen Vow): data/spells/mending_light.tres
// Converted to this game's units; edit freely, this file is now the source.
import { defineSpell } from '../types.ts'

export default defineSpell({
  id: 'heal',
  name: 'Heal',
  school: 'arcane',
  requirements: {
    intelligence: 10,
  },
  basic: false,
  charges: 8,
  healthRestore: 180,
  staminaRestore: 0,
  cast: {
    name: 'Heal',
    damage: {},
    scaling: {
      referenceLevel: 10,
      per: {
        intelligence: 0.035,
      },
    },
    statuses: [],
    maxHealthDrain: null,
    poiseDamage: 0,
    stamina: 18,
    knockback: 0,
    windup: 0.55,
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
    delivery: 'self',
    attack: null,
    effects: [],
    duration: 6,
    tickInterval: 0.3,
    castRange: 727.27,
    placementDistance: 327.27,
    maxInstances: 1,
    targetFilter: 'caster',
  },
  colour: '#9ff2c8',
})
