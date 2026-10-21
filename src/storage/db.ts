import Dexie, { type EntityTable } from 'dexie'

// Save data lives in the player's browser (IndexedDB), scoped to this site's URL.
// Tables get added here as game systems are decided; bump the version when the schema changes.

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('web-roguelike-soulslike') as Dexie & {
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  settings: 'key',
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
