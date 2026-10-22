import type { AttributeLevels } from './attributes.ts'

// Starting classes: attribute spread (65 points each) and starting kit. Every class
// starts with two weapons and a catalyst; catalysts bring Magic Bolt with them.
// Starting spells aren't decided yet.

export interface ClassDef {
  id: string
  name: string
  levels: AttributeLevels
  weaponIds: string[]
  right: string
  left: string | null
  spellIds: string[]
}

const levels = (vigor: number, endurance: number, strength: number, dexterity: number, intelligence: number, arcane: number): AttributeLevels => ({
  vigor,
  endurance,
  strength,
  dexterity,
  intelligence,
  arcane,
})

export const CLASSES: ClassDef[] = [
  {
    // Seal: highest base power with light INT scaling, the strongest catalyst at low INT.
    id: 'warrior',
    name: 'Warrior',
    levels: levels(14, 11, 16, 9, 7, 8),
    weaponIds: ['greatsword', 'shield', 'seal'],
    right: 'greatsword',
    left: 'shield',
    spellIds: [],
  },
  {
    // Staff: middling damage, the most spell charges.
    id: 'dex',
    name: 'Dex',
    levels: levels(11, 13, 9, 16, 8, 8),
    weaponIds: ['katana', 'dagger', 'staff'],
    right: 'katana',
    left: 'dagger',
    spellIds: [],
  },
  {
    // Wand: INT *** scaling, overtakes the seal from about INT 16 and keeps pulling away.
    id: 'magic',
    name: 'Magic',
    levels: levels(9, 10, 8, 11, 16, 11),
    weaponIds: ['straight-sword', 'dagger', 'wand'],
    right: 'straight-sword',
    left: 'wand',
    spellIds: [],
  },
]
