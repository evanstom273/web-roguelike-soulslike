// Generated from the Godot version (Ashen Vow): data/weapons/ashen_seal.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-catalyst.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'seal',
  name: 'Seal',
  category: 'seal',
  weight: 0.8,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 72, height: 14, grip: { x: 6, y: 7 } },
  light: {
    name: 'Court bash',
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
    poiseDamage: 48,
    stamina: 18,
    knockback: 436.36,
    windup: 0.1,
    active: 0.1,
    recovery: 0.18,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 69.09,
    hitRadius: 47.27,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  heavy: {
    name: 'Charged court bash',
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
    poiseDamage: 90,
    stamina: 34,
    knockback: 763.64,
    windup: 0.24,
    active: 0.14,
    recovery: 0.34,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 80,
    hitRadius: 54.55,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  charged: {
    name: 'Charged court bash (charged)',
    damage: {
      physical: 148.5,
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
    poiseDamage: 121.5,
    stamina: 42.5,
    knockback: 763.64,
    windup: 0.06,
    active: 0.14,
    recovery: 0.391,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 89.6,
    hitRadius: 61.1,
    arc: 112,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 3.25,
  },
  cooldown: {
    light: 0.6,
    heavy: 1.2,
  },
  catalyst: {
    schools: ['incantation', 'arcane'],
    basicSpell: 'holy-spark',
  },
  skill: null,
})
