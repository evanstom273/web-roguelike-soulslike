// Generated from the Godot version (Ashen Vow): data/weapons/court_staff.tres
// Converted to this game's units; edit freely, this file is now the source.
import artUrl from '../../art/placeholder-catalyst.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder art. Heavy = the Godot charged attack; charged = derived from it
// (x1.35 damage/poise, x1.25 stamina, x1.12 reach). Cooldowns are this game's.
export default defineWeapon({
  id: 'staff',
  name: 'Staff',
  category: 'staff',
  weight: 4.5,
  requirements: {
    strength: 10,
    dexterity: 10,
  },
  art: { url: artUrl, width: 72, height: 14, grip: { x: 6, y: 7 } },
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
    name: 'Court staff driving strike',
    damage: {
      physical: 155,
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
    poiseDamage: 40,
    stamina: 28,
    knockback: 327.27,
    windup: 0.24,
    active: 0.14,
    recovery: 0.35,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 116.36,
    hitRadius: 36.36,
    arc: 65,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 2.5,
  },
  charged: {
    name: 'Court staff driving strike (charged)',
    damage: {
      physical: 209.25,
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
    poiseDamage: 54,
    stamina: 35,
    knockback: 327.27,
    windup: 0.06,
    active: 0.14,
    recovery: 0.402,
    movementMultiplier: 0.15,
    uninterruptibleWhileActive: false,
    chargeThreshold: 0.45,
    reach: 130.32,
    hitRadius: 40.72,
    arc: 65,
    lungeSpeed: 0,
    hitStop: 0.04,
    cameraShake: 3.25,
  },
  cooldown: {
    light: 0.6,
    heavy: 1.2,
  },
  catalyst: {
    schools: ['sorcery', 'arcane'],
    basicSpell: 'magic-bolt',
  },
  skill: null,
})
