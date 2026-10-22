// Generated from the Godot version (Ashen Vow): data/statuses/bleed.tres
// Converted to this game's units; edit freely, this file is now the source.
import { defineStatus } from '../types.ts'

export default defineStatus({
  id: 'bleed',
  name: 'Bleed',
  colour: '#ae3845',
  threshold: 100,
  decayPerSecond: 12,
  decayDelay: 2,
  retriggerDelay: 2,
  tags: ['bleed'],
  triggeredEffect: null,
  triggeredAttack: {
    name: 'Bleed',
    damage: {
      physical: 100,
    },
    scaling: null,
    statuses: [],
    maxHealthDrain: null,
    poiseDamage: 0,
    stamina: 22,
    knockback: 0,
    windup: 0.1,
    active: 0.1,
    recovery: 0.18,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 76.36,
    hitRadius: 40,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0,
    cameraShake: 0,
  },
})
