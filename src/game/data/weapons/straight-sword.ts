// Generated from the Godot version (Ashen Vow): data/weapons/wanderer_sword.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-blade.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'straight-sword',
  name: 'Straight Sword',
  category: 'straight-sword',
  weight: 3,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 88, height: 16, grip: { x: 6, y: 8 } },
  light: {
    name: 'Wanderer slash',
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
    stamina: 22,
    knockback: 327.27,
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
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  heavy: {
    name: 'Wanderer cleave',
    damage: {
      physical: 185,
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
    poiseDamage: 45,
    stamina: 32,
    knockback: 327.27,
    windup: 0.24,
    active: 0.16,
    recovery: 0.38,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 87.27,
    hitRadius: 43.64,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 5,
  },
  charged: {
    name: 'Wanderer cleave (charged)',
    damage: {
      physical: 249.75,
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
    poiseDamage: 60.75,
    stamina: 40,
    knockback: 327.27,
    windup: 0.06,
    active: 0.16,
    recovery: 0.437,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 97.74,
    hitRadius: 48.88,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 6.5,
  },
  cooldown: {
    light: 0.6,
    heavy: 1.2,
  },
  catalyst: null,
  skill: null,
})
