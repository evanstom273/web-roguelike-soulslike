// Generated from the Godot version (Ashen Vow): data/weapons/ashen_dagger.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-blade.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'dagger',
  name: 'Dagger',
  category: 'dagger',
  weight: 1.5,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 88, height: 16, grip: { x: 6, y: 8 } },
  light: {
    name: 'Ashen dagger thrust',
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
    poiseDamage: 30,
    stamina: 12,
    knockback: 327.27,
    windup: 0.06,
    active: 0.07,
    recovery: 0.12,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.3,
    reach: 61.82,
    hitRadius: 27.27,
    arc: 70,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  heavy: {
    name: 'Ashen dagger lunge',
    damage: {
      physical: 145,
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
    poiseDamage: 28,
    stamina: 24,
    knockback: 327.27,
    windup: 0.12,
    active: 0.1,
    recovery: 0.24,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.3,
    reach: 65.45,
    hitRadius: 25.45,
    arc: 70,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  charged: {
    name: 'Ashen dagger lunge (charged)',
    damage: {
      physical: 195.75,
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
    poiseDamage: 37.8,
    stamina: 30,
    knockback: 327.27,
    windup: 0.06,
    active: 0.1,
    recovery: 0.276,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.3,
    reach: 73.3,
    hitRadius: 28.5,
    arc: 70,
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
