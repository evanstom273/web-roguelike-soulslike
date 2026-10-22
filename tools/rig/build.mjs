// Renders the playable characters: every animation in eight directions, frame by frame.
// Run with `npm run art:characters`. For each class this writes, into
// src/game/art/characters/<class>/:
//   sheet.png    every frame in a grid, each 96 x 128 with the feet at (48, 118)
//   frames.json  per animation and direction, each frame's place on the sheet and where its
//                hands are: [x, y, then for the right hand and the left: grip x, grip y on
//                screen from the feet, grip south of the body's middle, blade direction x y z]
//
// Models live in models/, poses in poses.mjs, the renderer in core.mjs. Frames are drawn as
// SVG and rasterised with resvg, so the game loads one image per class, not hundreds of SVGs.

import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { norm, render } from './core.mjs'
import { buildFrame } from './frame.mjs'
import { dex } from './models/dex.mjs'
import { magic } from './models/magic.mjs'
import { warrior } from './models/warrior.mjs'
import { ANIMATIONS } from './poses.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../src/game/art/characters')
const CLASSES = [warrior, dex, magic]
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] // facing = index * 45 degrees
const W = 96
const H = 128
const CELL_W = W + 2
const CELL_H = H + 2
const COLS = 41 // one sheet per class, at most 4096 px wide

const only = process.argv.slice(2)
const r1 = (n) => Math.round(n * 10) / 10
const r3 = (n) => Math.round(n * 1000) / 1000

/** A hand: its grip on screen from the feet, how far it is towards the camera, and the held blade's direction. */
function handInfo(sk, pose, key, move) {
  const g = move(sk.arms[key].grip)
  const b = norm(sk.root.dir(key === 'r' ? pose.blade : pose.bladeL))
  return [r1(g.x), r1(g.y * 0.5 - g.z), r1(g.y), r3(b.x), r3(b.y), r3(b.z)]
}

for (const cls of CLASSES) {
  if (only.length && !only.includes(cls.id)) continue
  const dir = join(OUT, cls.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const cells = []
  const anims = {}
  for (const [name, anim] of Object.entries(ANIMATIONS)) {
    const frames = DIRS.map((_, d) => anim.times.map((t) => {
      const { pose, sk, model, move } = buildFrame(cls, anim, (d * Math.PI) / 4, t, ANIMATIONS.idle)
      const k = cells.length
      cells.push(render(model, cls.materials))
      return [(k % COLS) * CELL_W, Math.floor(k / COLS) * CELL_H, ...handInfo(sk, pose, 'r', move), ...handInfo(sk, pose, 'l', move)]
    }))
    anims[name] = { times: anim.times, loop: !!anim.loop, frames }
  }
  const width = COLS * CELL_W
  const height = Math.ceil(cells.length / COLS) * CELL_H
  const body = cells.map((c, k) => `<svg x="${(k % COLS) * CELL_W}" y="${Math.floor(k / COLS) * CELL_H}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="hidden">${c}</svg>`).join('')
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
  // Quantised to a palette: cel shading has few colours, and it's a quarter of the size.
  const png = new Resvg(svgText, { fitTo: { mode: 'original' } }).render().asPng()
  await sharp(png).png({ palette: true, quality: 100, effort: 10, dither: 0.5 }).toFile(join(dir, 'sheet.png'))
  writeFileSync(join(dir, 'frames.json'), JSON.stringify({ cell: [W, H], feet: [48, 118], dirs: DIRS, anims }))
  console.log(`${cls.id}: ${cells.length} frames, ${width} x ${height}`)
}
