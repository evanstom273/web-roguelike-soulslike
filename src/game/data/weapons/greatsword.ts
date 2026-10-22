// Generated from the Godot version (Ashen Vow): data/weapons/sentinel_greatblade.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-blade.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'greatsword',
  name: 'Greatsword',
  category: 'greatsword',
  weight: 11,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 88, height: 16, grip: { x: 6, y: 8 } },
  light: {
    name: 'Sentinel greatblade sweep',
    damage: {
      physical: 110,
    },
    scaling: {
      referenceLevel: 10,
      per: {
        strength: 0.025,
        dexterity: 0.02,
      },
    },
    statuses: [],
    maxHealthDrain: null,
    poiseDamage: 52,
    stamina: 32,
    knockback: 327.27,
    windup: 0.2,
    active: 0.1,
    recovery: 0.36,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 112.73,
    hitRadius: 58.18,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  heavy: {
    name: 'Greatblade sundering sweep',
    damage: {
      physical: 240,
    },
    scaling: {
      referenceLevel: 10,
      per: {
        strength: 0.025,
        dexterity: 0.02,
      },
    },
    statuses: [],
    maxHealthDrain: null,
    poiseDamage: 75,
    stamina: 44,
    knockback: 327.27,
    windup: 0.38,
    active: 0.18,
    recovery: 0.55,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 127.27,
    hitRadius: 61.82,
    arc: 138,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  charged: {
    name: 'Greatblade sundering sweep (charged)',
    damage: {
      physical: 324,
    },
    scaling: {
      referenceLevel: 10,
      per: {
        strength: 0.025,
        dexterity: 0.02,
      },
    },
    statuses: [],
    maxHealthDrain: null,
    poiseDamage: 101.25,
    stamina: 55,
    knockback: 327.27,
    windup: 0.06,
    active: 0.18,
    recovery: 0.632,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 142.54,
    hitRadius: 69.24,
    arc: 138,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 3.25,
  },
  cooldown: {
    light: 0.6,
    heavy: 1.2,
  },
  catalyst: null,
  skill: null,
})
