// Generated from the Godot version (Ashen Vow): data/spells/cinder_lance.tres
// Converted to this game's units; edit freely, this file is now the source.
import { defineSpell } from '../types.ts'

export default defineSpell({
  id: 'fire-lance',
  name: 'Fire Lance',
  school: 'incantation',
  requirements: {
    intelligence: 10,
  },
  basic: false,
  charges: 16,
  healthRestore: 0,
  staminaRestore: 0,
  cast: {
    name: 'Fire Lance',
    damage: {
      fire: 180,
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
    stamina: 16,
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
    speed: 800,
    radius: 10.91,
    homing: false,
    turnRate: 171.89,
    pierce: 0,
  },
  colour: '#ff8a3d',
})
