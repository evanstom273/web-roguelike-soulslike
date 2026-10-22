import type { ClassDef } from '../game/data/classes.ts'
import { classCharacter } from '../game/player/character.ts'
import { randomSeed } from '../game/random.ts'
import { db, type SaveFile } from './db.ts'

// Save files: as many as the player likes, newest first.

export type Save = SaveFile & { id: number }

export async function createSave(cls: ClassDef): Promise<Save> {
  const now = Date.now()
  const save: SaveFile = {
    classId: cls.id,
    createdAt: now,
    updatedAt: now,
    playTime: 0,
    character: classCharacter(cls),
    runes: 0,
    floor: 1,
    deepestFloorCleared: 0,
    seed: randomSeed(),
  }
  const id = await db.saves.add(save)
  return { ...save, id: id as number }
}

export const listSaves = async () => (await db.saves.orderBy('updatedAt').reverse().toArray()) as Save[]

export const latestSave = async () => (await db.saves.orderBy('updatedAt').last()) as Save | undefined

export const getSave = async (id: number) => (await db.saves.get(id)) as Save | undefined

export async function updateSave(id: number, changes: Partial<SaveFile>) {
  await db.saves.update(id, { ...changes, updatedAt: Date.now() })
}

/** Adds play time without a read-modify-write race. */
export async function addPlayTime(id: number, seconds: number) {
  if (seconds <= 0) return
  await db.saves.where('id').equals(id).modify((s) => {
    s.playTime += seconds
    s.updatedAt = Date.now()
  })
}

export const deleteSave = (id: number) => db.saves.delete(id)

/** 3725 -> "01:02:05". Hours keep counting past 99. */
export function formatPlayTime(seconds: number): string {
  const s = Math.floor(seconds)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
