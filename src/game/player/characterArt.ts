import type * as Phaser from 'phaser'

// The playable characters are drawn frame by frame (tools/rig poses a 3D model for every
// frame and renders it cel-shaded): one sheet per class holding every animation in all
// eight directions, and for each frame where the hands are, so held weapons can be put in
// them and turned to match.

const SHEETS = import.meta.glob('../art/characters/*/sheet.png', { eager: true, query: '?no-inline', import: 'default' }) as Record<string, string>
const DATA = import.meta.glob('../art/characters/*/frames.json', { eager: true, import: 'default' }) as Record<string, FramesFile>

export type CharacterAnim = 'idle' | 'walk' | 'slash' | 'backslash' | 'lslash' | 'heavy' | 'cast' | 'lcast' | 'roll' | 'hurt'

/** A hand in one frame. */
export interface HandPose {
  /** The grip on screen, relative to the feet. */
  x: number
  y: number
  /** How far south of the body's middle the grip is: towards the camera, so in front. */
  depth: number
  /** The held blade's direction in the world (x east, y south, z up), unit length. */
  dir: Vec3
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Each frame: [x, y on the sheet, then per hand (right, left): grip x, grip y, depth, blade x, y, z]. */
type FrameRow = number[]

interface FramesFile {
  cell: [number, number]
  feet: [number, number]
  dirs: string[]
  anims: Record<CharacterAnim, { times: number[]; loop: boolean; frames: FrameRow[][] }>
}

export const characterTexture = (look: string) => `character:${look}`

export function preloadCharacter(scene: Phaser.Scene, look: string) {
  scene.load.image(characterTexture(look), SHEETS[`../art/characters/${look}/sheet.png`])
}

const hand = (r: FrameRow, at: number): HandPose => ({ x: r[at], y: r[at + 1], depth: r[at + 2], dir: { x: r[at + 3], y: r[at + 4], z: r[at + 5] } })
const RIGHT = 2
const LEFT = 8

/**
 * A direction in the world as drawn: its angle on screen, and how much of its length shows.
 * The characters are drawn with depth (towards or away from the camera) at half length.
 */
export function onScreen(dir: Vec3) {
  const sx = dir.x
  const sy = dir.y * 0.5 - dir.z
  return { angle: Math.atan2(sy, sx), scale: Math.hypot(sx, sy) }
}

export class CharacterArt {
  readonly texture: string
  /** The image origin that puts the feet on the character's position. */
  readonly origin: { x: number; y: number }
  private data: FramesFile

  /** Names every frame on the class's loaded sheet. */
  constructor(scene: Phaser.Scene, look: string) {
    this.data = DATA[`../art/characters/${look}/frames.json`]
    this.texture = characterTexture(look)
    const [w, h] = this.data.cell
    this.origin = { x: this.data.feet[0] / w, y: this.data.feet[1] / h }
    const tex = scene.textures.get(this.texture)
    for (const [anim, a] of Object.entries(this.data.anims)) {
      a.frames.forEach((list, d) => list.forEach((r, i) => tex.has(frameName(anim, d, i)) || tex.add(frameName(anim, d, i), 0, r[0], r[1], w, h)))
    }
  }

  /** The frame showing an animation at t (0..1, wrapping for loops) facing direction d (0 = east, clockwise in eighths). */
  frame(anim: CharacterAnim, d: number, t: number) {
    const a = this.data.anims[anim]
    const i = this.index(anim, t)
    const r = a.frames[d][i]
    return { name: frameName(anim, d, i), right: hand(r, RIGHT), left: hand(r, LEFT) }
  }

  /**
   * A blade held in a hand at t, blended between frames: the points `inner` and `outer`
   * along it from the grip (in px), relative to the feet. Smooths swing trails.
   */
  blade(anim: CharacterAnim, d: number, t: number, which: 'right' | 'left', inner: number, outer: number) {
    const a = this.data.anims[anim]
    const i = this.index(anim, t)
    const j = Math.min(i + 1, a.times.length - 1)
    const k = j === i ? 0 : Math.max(0, Math.min(1, (t - a.times[i]) / (a.times[j] - a.times[i])))
    const at = which === 'right' ? RIGHT : LEFT
    const along = (r: FrameRow, len: number) => {
      const h = hand(r, at)
      const s = onScreen(h.dir)
      return { x: h.x + Math.cos(s.angle) * len * s.scale, y: h.y + Math.sin(s.angle) * len * s.scale }
    }
    const mix = (len: number) => {
      const p = along(a.frames[d][i], len)
      const q = along(a.frames[d][j], len)
      return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }
    }
    return { inner: mix(inner), outer: mix(outer) }
  }

  /** The last frame at or before t. */
  private index(anim: CharacterAnim, t: number) {
    const a = this.data.anims[anim]
    const time = a.loop ? t - Math.floor(t) : t
    let i = 0
    while (i + 1 < a.times.length && a.times[i + 1] <= time + 1e-6) i++
    return i
  }
}

const frameName = (anim: string, d: number, i: number) => `${anim}:${d}:${i}`
