// Every kind of damage in the game. Weapons, spells, statuses and enemy attacks deal
// some mix of these, and enemies can resist each one separately.
//
// Only `physical` exists so far, because the placeholder blade needs something to deal.
// Add the rest here: the id is what definitions refer to, the colour tints effects.

export const DAMAGE_TYPES = {
  physical: { name: 'Physical', colour: '#d7e2f2' },
} as const satisfies Record<string, { name: string; colour: string }>

export type DamageTypeId = keyof typeof DAMAGE_TYPES

/** Damage split by type, e.g. { physical: 10 }. */
export type DamageMap = Partial<Record<DamageTypeId, number>>
