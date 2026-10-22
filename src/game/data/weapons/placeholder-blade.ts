import artUrl from './placeholder-blade.svg?no-inline'
import { defineWeapon } from '../types.ts'

// Placeholder so the player has something to swing. Not a designed weapon.
export default defineWeapon({
  id: 'placeholder-blade',
  name: 'Placeholder Blade',
  kind: 'melee',
  art: { url: artUrl, width: 88, height: 16, grip: { x: 6, y: 8 } },
  scaling: {},
  light: { damage: { physical: 10 }, stamina: 12, windup: 0.1, active: 0.12, recovery: 0.24, lunge: 22, arc: 120, reach: 92 },
  heavy: { damage: { physical: 18 }, stamina: 24, windup: 0.34, active: 0.16, recovery: 0.42, lunge: 34, arc: 160, reach: 108 },
  charged: { damage: { physical: 28 }, stamina: 32, windup: 0.06, active: 0.2, recovery: 0.5, lunge: 50, arc: 200, reach: 128 },
  charge: { holdToCharge: 0.22, maxCharge: 0.9 },
  cooldown: { light: 0.6, heavy: 1.2 },
})
