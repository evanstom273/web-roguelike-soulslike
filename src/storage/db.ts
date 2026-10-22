import Dexie, { type EntityTable } from 'dexie'
import type { Character } from '../game/player/character.ts'

// Save data lives in the player's browser (IndexedDB), scoped to this site's URL.
// Tables get added here as game systems are decided; bump the version when the schema changes.

export interface Setting {
  key: string
  value: unknown
}

/**
 * One save file: a character and where they are. Saves survive death; death only
 * costs the runes that aren't spent on the post-death screen.
 * Only indexed fields are listed in the schema below, so adding plain fields later
 * (weapon upgrades and so on) doesn't need a version bump.
 */
export interface SaveFile {
  id?: number
  classId: string
  createdAt: number // ms since epoch
  updatedAt: number // last played
  playTime: number // seconds actually spent in runs
  character: Character
  runes: number // carried right now; lost if not spent after death
  floor: number // the floor the current run is on
  deepestFloorCleared: number // furthest boss beaten, for checkpoint starts
  seed: string // the current floor's seed
}

export const db = new Dexie('web-roguelike-soulslike') as Dexie & {
  settings: EntityTable<Setting, 'key'>
  saves: EntityTable<SaveFile, 'id'>
}

db.version(1).stores({
  settings: 'key',
})
db.version(2).stores({
  settings: 'key',
  saves: '++id, updatedAt',
})

// Ask the browser not to evict our storage under pressure (Safari is the usual culprit).
// Not guaranteed to be granted, so failures are ignored.
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
