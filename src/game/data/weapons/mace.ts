// Generated from the Godot version (Ashen Vow): data/weapons/heavy_iron_mace.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-blade.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'mace',
  name: 'Mace',
  category: 'hammer',
  weight: 9,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 88, height: 16, grip: { x: 6, y: 8 } },
  light: {
    name: 'Iron mace swing',
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
    poiseDamage: 58,
    stamina: 27,
    knockback: 327.27,
    windup: 0.2,
    active: 0.1,
    recovery: 0.3,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 87.27,
    hitRadius: 49.09,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  heavy: {
    name: 'Iron mace crush',
    damage: {
      physical: 210,
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
    poiseDamage: 85,
    stamina: 40,
    knockback: 327.27,
    windup: 0.32,
    active: 0.16,
    recovery: 0.48,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 94.55,
    hitRadius: 52.73,
    arc: 105,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  charged: {
    name: 'Iron mace crush (charged)',
    damage: {
      physical: 283.5,
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
    poiseDamage: 114.75,
    stamina: 50,
    knockback: 327.27,
    windup: 0.06,
    active: 0.16,
    recovery: 0.552,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 105.9,
    hitRadius: 59.06,
    arc: 105,
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
