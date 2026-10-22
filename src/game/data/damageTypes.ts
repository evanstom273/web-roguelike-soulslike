// Every kind of damage. Attacks deal a mix of these; defences negate each separately.
// Ported from the Godot version's five damage channels.

export const DAMAGE_TYPES = {
  physical: { name: 'Physical', colour: '#d7e2f2' },
  magic: { name: 'Magic', colour: '#7fb8ff' },
  fire: { name: 'Fire', colour: '#ff8a3d' },
  lightning: { name: 'Lightning', colour: '#ffe066' },
  holy: { name: 'Holy', colour: '#ffe9b0' },
} as const satisfies Record<string, { name: string; colour: string }>

export type DamageTypeId = keyof typeof DAMAGE_TYPES

export const DAMAGE_TYPE_IDS = Object.keys(DAMAGE_TYPES) as DamageTypeId[]

/** Amount per damage type, e.g. { physical: 110 }. */
export type DamageMap = Partial<Record<DamageTypeId, number>>
