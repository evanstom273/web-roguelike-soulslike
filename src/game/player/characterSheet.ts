import type * as Phaser from 'phaser'
import { DRAWN } from '../world/projection.ts'

// Packs one character's layers and arm pieces into a single texture once they've loaded.
// Drawing a character from a dozen separate textures made the renderer drop layers on
// some frames (the cape would flicker out); one sheet per character avoids that.

export const CHARACTER_SHEET = 'character-sheet'
export const CHARACTER_PARTS = ['back', 'leg-a', 'leg-b', 'body'] as const
export const characterTextureKey = (look: string, direction: string, part: string) => `char:${look}:${direction}:${part}`

const GAP = 2

export function packCharacter(scene: Phaser.Scene, look: string) {
  const pieces: { key: string; w: number; h: number }[] = []
  for (const part of CHARACTER_PARTS) for (const d of DRAWN) pieces.push({ key: characterTextureKey(look, d, part), w: 96, h: 128 })
  pieces.push({ key: characterTextureKey(look, 'arm', 'upper'), w: 36, h: 18 }, { key: characterTextureKey(look, 'arm', 'fore'), w: 42, h: 18 })

  // One row per layer (five directions across), arms on a row of their own.
  const cols = DRAWN.length
  const width = cols * (96 + GAP)
  const height = CHARACTER_PARTS.length * (128 + GAP) + 18 + GAP
  if (scene.textures.exists(CHARACTER_SHEET)) scene.textures.remove(CHARACTER_SHEET)
  const sheet = scene.textures.createCanvas(CHARACTER_SHEET, width, height)!
  const ctx = sheet.getContext()
  pieces.forEach((p, i) => {
    const arm = i >= CHARACTER_PARTS.length * cols
    const x = arm ? (i - CHARACTER_PARTS.length * cols) * (48 + GAP) : (i % cols) * (96 + GAP)
    const y = arm ? CHARACTER_PARTS.length * (128 + GAP) : Math.floor(i / cols) * (128 + GAP)
    ctx.drawImage(scene.textures.get(p.key).getSourceImage() as CanvasImageSource, x, y, p.w, p.h)
    sheet.add(p.key, 0, x, y, p.w, p.h)
    scene.textures.remove(p.key)
  })
  sheet.refresh()
}
