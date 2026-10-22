// Generated from the Godot version (Ashen Vow): data/weapons/pilgrim_spear.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-blade.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'spear',
  name: 'Spear',
  category: 'spear',
  weight: 4,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 88, height: 16, grip: { x: 6, y: 8 } },
  light: {
    name: 'Pilgrim spear thrust',
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
    stamina: 20,
    knockback: 327.27,
    windup: 0.1,
    active: 0.1,
    recovery: 0.18,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 105.45,
    hitRadius: 32.73,
    arc: 68,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  heavy: {
    name: 'Pilgrim impaling thrust',
    damage: {
      physical: 195,
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
    stamina: 30,
    knockback: 327.27,
    windup: 0.24,
    active: 0.14,
    recovery: 0.35,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 127.27,
    hitRadius: 32.73,
    arc: 55,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  charged: {
    name: 'Pilgrim impaling thrust (charged)',
    damage: {
      physical: 263.25,
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
    stamina: 37.5,
    knockback: 327.27,
    windup: 0.06,
    active: 0.14,
    recovery: 0.402,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 142.54,
    hitRadius: 36.66,
    arc: 55,
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
