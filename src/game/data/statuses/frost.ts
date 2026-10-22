// Generated from the Godot version (Ashen Vow): data/statuses/frost.tres
// Converted to this game's units; edit freely, this file is now the source.
import { defineStatus } from '../types.ts'

export default defineStatus({
  id: 'frost',
  name: 'Frost',
  colour: '#93ccdb',
  threshold: 100,
  decayPerSecond: 12,
  decayDelay: 2,
  retriggerDelay: 6,
  tags: ['frost'],
  triggeredEffect: {
    id: 'frost',
    name: 'Frostbound',
    tags: ['frost'],
    negative: true,
    cleanseTags: [],
    healthRestore: 0,
    staminaRestore: 0,
    duration: 6,
    interval: 1,
    periodicAttack: null,
    periodicHeal: 0,
    movementMultiplier: 0.7,
    defenceBonus: {
      physical: -10,
      magic: -10,
    },
  },
  triggeredAttack: null,
})
