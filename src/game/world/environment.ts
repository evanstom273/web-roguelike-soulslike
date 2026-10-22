import * as Phaser from 'phaser'
import { hexToPixel } from '../dungeon/hex.ts'
import type { Floor } from '../dungeon/generateFloor.ts'
import { createRng, pick, type Rng } from '../random.ts'
import { LIGHT_URL, type BiomeDef, type DecalDef } from './biomes.ts'
import { CELL_SIZE, HALLWAY_WIDTH, type FloorGeometry, type Vec } from './floorGeometry.ts'

// Lays out a floor's art: outside fill, paved room cells, hallway causeways, walls with
// pillars at the joints, decals, braziers and lighting. Purely visual; collision is the
// wall segments in FloorGeometry.

const HEX_W = CELL_SIZE * Math.sqrt(3)
const HEX_H = CELL_SIZE * 2
const WALL = { w: 192, h: 40 }
const PATH = { w: 256, h: HALLWAY_WIDTH }
const LIGHT_SIZE = 640

// Depths, bottom to top. Characters sit at 8-11.
export const DEPTH = {
  outside: 0,
  floor: 1,
  threshold: 1.5,
  decal: 2,
  prop: 2.5,
  shadow: 3,
  wall: 4,
  pillar: 4.5,
  overgrowth: 5,
  dark: 6,
  light: 6.5,
} as const

const key = (biome: BiomeDef, part: string) => `env-${biome.id}-${part}`

export function preloadEnvironment(scene: Phaser.Scene, b: BiomeDef) {
  const svg = (k: string, url: string, width: number, height: number) => scene.load.svg(k, url, { width, height })
  b.floor.forEach((url, i) => svg(key(b, `floor${i}`), url, HEX_W, HEX_H))
  svg(key(b, 'outside'), b.outside, 512, 512)
  svg(key(b, 'path'), b.path, PATH.w, PATH.h)
  svg(key(b, 'wall'), b.wall, WALL.w, WALL.h)
  svg(key(b, 'pillar'), b.pillar, 72, 72)
  svg(key(b, 'brazier'), b.brazier, 96, 96)
  svg(key(b, 'threshold'), b.threshold, 72, 196)
  for (const d of b.decals) svg(d.key, d.url, d.width, d.height)
  svg('env-light', LIGHT_URL, LIGHT_SIZE, LIGHT_SIZE)
}

export interface Environment {
  /** Flickers the brazier light; call every frame. */
  update(time: number): void
  /** Positions the player's own soft light. */
  follow(p: Vec): void
}

export function buildEnvironment(scene: Phaser.Scene, floor: Floor, g: FloorGeometry, b: BiomeDef): Environment {
  const rng = createRng(`${floor.seed}-art`)
  const r = (lo: number, hi: number) => lo + rng() * (hi - lo)
  scene.cameras.main.setBackgroundColor(b.background)

  // Everything outside the rooms: one seamless, world-aligned fill under the whole area.
  const centres = floor.area.map((h) => hexToPixel(h, CELL_SIZE))
  const minX = Math.min(...centres.map((c) => c.x)) - HEX_W * 2
  const maxX = Math.max(...centres.map((c) => c.x)) + HEX_W * 2
  const minY = Math.min(...centres.map((c) => c.y)) - HEX_H * 2
  const maxY = Math.max(...centres.map((c) => c.y)) + HEX_H * 2
  scene.add.tileSprite(minX, minY, maxX - minX, maxY - minY, key(b, 'outside')).setOrigin(0).setDepth(DEPTH.outside)

  // Room cells. The centrepiece variant shows up at most once per room.
  const cells: Vec[] = []
  for (const room of g.rooms) {
    let centrepiece = room.room.kind !== 'start' && rng() < 0.6
    for (const cell of room.room.cells) {
      const c = hexToPixel(cell, CELL_SIZE)
      cells.push(c)
      let v = 1 + Math.floor(rng() * (b.floor.length - 1))
      if (centrepiece && rng() < 0.5) {
        v = 0
        centrepiece = false
      }
      scene.add.image(c.x, c.y, key(b, `floor${v}`)).setDepth(DEPTH.floor)
    }
  }

  // Hallways: a paved causeway with a threshold slab at each end.
  for (const h of g.hallways) {
    const [p0, p1, p2, p3] = h.corners
    const s = mid(p0, p3)
    const e = mid(p1, p2)
    const angle = Math.atan2(e.y - s.y, e.x - s.x)
    const len = Math.hypot(e.x - s.x, e.y - s.y)
    const m = mid(s, e)
    const path = scene.add.tileSprite(m.x, m.y, len, PATH.h, key(b, 'path')).setRotation(angle).setDepth(DEPTH.floor)
    path.tilePositionX = Math.floor(rng() * PATH.w)
    for (const end of [s, e]) scene.add.image(end.x, end.y, key(b, 'threshold')).setRotation(angle).setDepth(DEPTH.threshold)
  }

  const insideRoom = (p: Vec) => cells.some((c) => insideHex(p.x - c.x, p.y - c.y, CELL_SIZE))

  // Contact shadow along every wall, then the wall tops, then pillars at the joints.
  const shadow = scene.add.graphics().setDepth(DEPTH.shadow)
  for (const w of g.walls) {
    shadow.lineStyle(84, 0x000000, 0.22)
    shadow.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y)
    shadow.lineStyle(56, 0x000000, 0.25)
    shadow.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y)
  }
  const joints = new Map<string, Vec>()
  for (const w of g.walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
    const m = mid(w.a, w.b)
    const wall = scene.add.tileSprite(m.x, m.y, len, WALL.h, key(b, 'wall')).setRotation(Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)).setDepth(DEPTH.wall)
    wall.tilePositionX = Math.floor(rng() * WALL.w)
    for (const p of [w.a, w.b]) joints.set(`${Math.round(p.x)},${Math.round(p.y)}`, p)
  }
  for (const p of joints.values()) scene.add.image(p.x, p.y, key(b, 'pillar')).setDepth(DEPTH.pillar)

  // Decals: scattered on room floors, or tied to the walls.
  const floorDecals = b.decals.filter((d) => d.place === 'floor')
  const wallDecals = b.decals.filter((d) => d.place !== 'floor')
  const turn = (d: DecalDef) => Phaser.Math.DegToRad(r(-d.turn, d.turn))
  for (const c of cells) {
    const n = Math.round(r(b.decalsPerCell[0], b.decalsPerCell[1]))
    for (let i = 0; i < n && floorDecals.length; i++) {
      const d = weighted(rng, floorDecals)
      const p = pointInHex(rng, c, CELL_SIZE * 0.72)
      scene.add.image(p.x, p.y, d.key).setRotation(turn(d)).setDepth(DEPTH.decal)
    }
  }
  if (wallDecals.length) {
    for (const w of g.walls) {
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
      if (len < 200 || rng() > 0.45) continue
      const d = weighted(rng, wallDecals)
      const along = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
      const t = r(0.25, 0.75)
      const p = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }
      let nx = -Math.sin(along)
      let ny = Math.cos(along)
      if (!insideRoom({ x: p.x + nx * 60, y: p.y + ny * 60 })) {
        nx = -nx
        ny = -ny
      }
      if (d.place === 'wall-inside') {
        // Lying along the foot of the wall, on the room side.
        const off = 20 + d.height / 2
        scene.add.image(p.x + nx * off, p.y + ny * off, d.key).setRotation(along).setDepth(DEPTH.decal)
      } else {
        // Spilling over the top of the wall from outside.
        const off = -d.height * 0.22
        scene.add.image(p.x + nx * off, p.y + ny * off, d.key).setRotation(turn(d)).setDepth(DEPTH.overgrowth)
      }
    }
  }

  // Darkness over the environment (not the characters), with lights cutting through it.
  scene.add.rectangle(minX, minY, maxX - minX, maxY - minY, 0x000000, b.darkness).setOrigin(0).setDepth(DEPTH.dark)
  const lights: { img: Phaser.GameObjects.Image; phase: number; base: number }[] = []
  const addLight = (p: Vec, scale: number, alpha: number) => {
    const img = scene.add.image(p.x, p.y, 'env-light').setTint(b.lightColour).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(alpha).setDepth(DEPTH.light)
    lights.push({ img, phase: rng() * 10, base: alpha })
    return img
  }

  // Braziers in the corners of some cells, away from doorways and the spawn.
  for (const room of g.rooms) {
    for (const cell of room.room.cells) {
      if (rng() > 0.55) continue
      const c = hexToPixel(cell, CELL_SIZE)
      const corner = Math.floor(rng() * 6)
      const a = Phaser.Math.DegToRad(60 * corner - 30)
      const p = { x: c.x + Math.cos(a) * CELL_SIZE * 0.72, y: c.y + Math.sin(a) * CELL_SIZE * 0.72 }
      scene.add.image(p.x, p.y, key(b, 'brazier')).setDepth(DEPTH.prop)
      addLight(p, 1, 0.7)
    }
  }
  // The player's own faint light, stronger the darker it gets.
  const own = scene.add.image(0, 0, 'env-light').setTint(0xfff1d6).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8).setAlpha(0.14 + b.darkness * 0.22).setDepth(DEPTH.light)

  scene.cameras.main.filters.external.addVignette(0.5, 0.5, 0.75, 0.35 + b.darkness * 0.3)

  return {
    update(time) {
      for (const l of lights) {
        const t = time / 1000 + l.phase
        const flicker = 1 + Math.sin(t * 9.3) * 0.04 + Math.sin(t * 23.1) * 0.03
        l.img.setAlpha(l.base * flicker).setScale(flicker)
      }
    },
    follow(p) {
      own.setPosition(p.x, p.y)
    },
  }
}

const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function insideHex(x: number, y: number, r: number) {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const ir = (r * Math.sqrt(3)) / 2
  return ax <= ir && ax * 0.5 + ay * (Math.sqrt(3) / 2) <= ir
}

function pointInHex(rng: Rng, c: Vec, r: number): Vec {
  for (;;) {
    const x = (rng() * 2 - 1) * r
    const y = (rng() * 2 - 1) * r
    if (insideHex(x, y, r)) return { x: c.x + x, y: c.y + y }
  }
}

function weighted(rng: Rng, items: DecalDef[]): DecalDef {
  const total = items.reduce((s, d) => s + d.weight, 0)
  let roll = rng() * total
  for (const d of items) {
    roll -= d.weight
    if (roll < 0) return d
  }
  return pick(rng, items)
}

