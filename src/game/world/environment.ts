import * as Phaser from 'phaser'
import type { Floor } from '../dungeon/generateFloor.ts'
import { hexToPixel } from '../dungeon/hex.ts'
import { createRng, pick, type Rng } from '../random.ts'
import { LIGHT_URL, type BiomeDef, type DecalDef } from './biomes.ts'
import { CELL_SIZE, HALLWAY_WIDTH, type FloorGeometry, type Segment, type Vec } from './floorGeometry.ts'
import { LAYER, LOW_WALL_HEIGHT, standingDepth, WALL_HEIGHT } from './projection.ts'

// Lays out a floor's art in three-quarter view: the outside fill, paved room cells,
// hallway causeways and decals lie flat; walls stand up. Walls whose face looks into a
// room are tall, with torches; walls between the player and the camera are kept low.
// Purely visual: collision is the wall segments in FloorGeometry.

const HEX_W = CELL_SIZE * Math.sqrt(3)
const HEX_H = CELL_SIZE * 2
const WALL = { w: 192, h: 40 }
const PATH = { w: 256, h: HALLWAY_WIDTH }
const LIGHT_SIZE = 640
const COURSE = 28 // masonry course height on wall faces

// Flat layers, under the walls.
const FLAT = { outside: 0, floor: 1, threshold: 1.5, decal: 2, shadow: 3 } as const

const key = (biome: BiomeDef, part: string) => `env-${biome.id}-${part}`

export function preloadEnvironment(scene: Phaser.Scene, b: BiomeDef) {
  const svg = (k: string, url: string, width: number, height: number) => scene.load.svg(k, url, { width, height })
  b.floor.forEach((url, i) => svg(key(b, `floor${i}`), url, HEX_W, HEX_H))
  svg(key(b, 'outside'), b.outside, 512, 512)
  svg(key(b, 'path'), b.path, PATH.w, PATH.h)
  svg(key(b, 'wall'), b.wall, WALL.w, WALL.h)
  svg(key(b, 'pillar'), b.pillar, 72, 72)
  svg(key(b, 'column'), b.column, 60, WALL_HEIGHT + 30)
  svg(key(b, 'brazier'), b.brazierStand, 64, 96)
  svg(key(b, 'torch'), b.torch, 28, 64)
  svg(key(b, 'threshold'), b.threshold, 72, 196)
  for (const d of b.decals) svg(d.key, d.url, d.width, d.height)
  svg('env-light', LIGHT_URL, LIGHT_SIZE, LIGHT_SIZE)
}

export interface Environment {
  /** Flickers the firelight; call every frame. */
  update(time: number): void
  /** Positions the player's own soft light. */
  follow(p: Vec): void
}

interface Wall extends Segment {
  tall: boolean
  /** Unit normal pointing down the screen (towards the camera). */
  n: Vec
  len: number
}

export function buildEnvironment(scene: Phaser.Scene, floor: Floor, g: FloorGeometry, b: BiomeDef): Environment {
  const rng = createRng(`${floor.seed}-art`)
  const r = (lo: number, hi: number) => lo + rng() * (hi - lo)
  scene.cameras.main.setBackgroundColor(b.background)
  // Unlit stone is dimmed by tinting it; characters and effects aren't.
  const dim = grey(1 - b.darkness)

  // Everything outside the rooms: one seamless, world-aligned fill under the whole area.
  const centres = floor.area.map((h) => hexToPixel(h, CELL_SIZE))
  const minX = Math.min(...centres.map((c) => c.x)) - HEX_W * 2
  const maxX = Math.max(...centres.map((c) => c.x)) + HEX_W * 2
  const minY = Math.min(...centres.map((c) => c.y)) - HEX_H * 2
  const maxY = Math.max(...centres.map((c) => c.y)) + HEX_H * 2
  scene.add.tileSprite(minX, minY, maxX - minX, maxY - minY, key(b, 'outside')).setOrigin(0).setDepth(FLAT.outside).setTint(dim)

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
      scene.add.image(c.x, c.y, key(b, `floor${v}`)).setDepth(FLAT.floor).setTint(dim)
    }
  }

  // Hallways: a paved causeway with a threshold slab at each end.
  for (const h of g.hallways) {
    const [p0, p1, p2, p3] = h.corners
    const s = mid(p0, p3)
    const e = mid(p1, p2)
    const angle = Math.atan2(e.y - s.y, e.x - s.x)
    const m = mid(s, e)
    const path = scene.add.tileSprite(m.x, m.y, Math.hypot(e.x - s.x, e.y - s.y), PATH.h, key(b, 'path')).setRotation(angle).setDepth(FLAT.floor).setTint(dim)
    path.tilePositionX = Math.floor(rng() * PATH.w)
    for (const end of [s, e]) scene.add.image(end.x, end.y, key(b, 'threshold')).setRotation(angle).setDepth(FLAT.threshold).setTint(dim)
  }

  const walkable = (p: Vec) =>
    cells.some((c) => insideHex(p.x - c.x, p.y - c.y, CELL_SIZE)) || g.hallways.some((h) => insidePolygon(p, h.corners))

  // Classify walls: tall if we look at the face inside the room, low if it stands between us and the room.
  const walls: Wall[] = g.walls.map((w) => {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const len = Math.hypot(dx, dy)
    let n = { x: -dy / len, y: dx / len }
    if (n.y < 0 || (n.y === 0 && n.x > 0)) n = { x: -n.x, y: -n.y }
    const m = mid(w.a, w.b)
    const facesRoom = Math.abs(n.y) < 0.05 || walkable({ x: m.x + n.x * 50, y: m.y + n.y * 50 })
    return { ...w, n, len, tall: facesRoom }
  })

  // Contact shadow along the foot of every wall, on the floor.
  const shadow = scene.add.graphics().setDepth(FLAT.shadow)
  for (const w of walls) {
    shadow.lineStyle(84, 0x000000, 0.2)
    shadow.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y)
    shadow.lineStyle(52, 0x000000, 0.22)
    shadow.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y)
  }

  // Wall faces (masonry drawn as vector shapes) and their coping stones on top.
  const backFaces = scene.add.graphics().setDepth(LAYER.backWall)
  const lowFaces = scene.add.graphics().setDepth(LAYER.lowWall)
  for (const w of walls) {
    const height = w.tall ? WALL_HEIGHT : LOW_WALL_HEIGHT
    drawFace(w.tall ? backFaces : lowFaces, w, height, b, rng)
    const m = mid(w.a, w.b)
    const top = scene.add
      .tileSprite(m.x, m.y - height, w.len, WALL.h, key(b, 'wall'))
      .setRotation(Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x))
      .setDepth(w.tall ? LAYER.backWall + 0.1 : LAYER.lowWall + 0.1)
      .setTint(dim)
    top.tilePositionX = Math.floor(rng() * WALL.w)
  }

  // Joints: full columns where a tall wall meets another, low caps between low walls.
  const joints = new Map<string, { p: Vec; tall: boolean }>()
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const k = `${Math.round(p.x)},${Math.round(p.y)}`
      const j = joints.get(k)
      joints.set(k, { p, tall: (j?.tall ?? false) || w.tall })
    }
  }
  for (const { p, tall } of joints.values()) {
    if (tall) scene.add.image(p.x, p.y + 6, key(b, 'column')).setOrigin(0.5, 1).setDepth(standingDepth(p.y)).setTint(dim)
    else scene.add.image(p.x, p.y - LOW_WALL_HEIGHT, key(b, 'pillar')).setDepth(LAYER.lowWall + 0.2).setTint(dim)
  }

  // Decals: scattered on room floors, or tied to the walls.
  const floorDecals = b.decals.filter((d) => d.place === 'floor')
  const wallDecals = b.decals.filter((d) => d.place !== 'floor')
  const turn = (d: DecalDef) => Phaser.Math.DegToRad(r(-d.turn, d.turn))
  for (const c of cells) {
    const n = Math.round(r(b.decalsPerCell[0], b.decalsPerCell[1]))
    for (let i = 0; i < n && floorDecals.length; i++) {
      const d = weighted(rng, floorDecals)
      const p = pointInHex(rng, c, CELL_SIZE * 0.72)
      scene.add.image(p.x, p.y, d.key).setRotation(turn(d)).setDepth(FLAT.decal).setTint(dim)
    }
  }
  if (wallDecals.length) {
    for (const w of walls) {
      if (w.len < 200 || rng() > 0.45) continue
      const d = weighted(rng, wallDecals)
      const along = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
      const t = r(0.25, 0.75)
      const p = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }
      // Which side of the wall is the room?
      let nx = -Math.sin(along)
      let ny = Math.cos(along)
      if (!walkable({ x: p.x + nx * 60, y: p.y + ny * 60 })) {
        nx = -nx
        ny = -ny
      }
      if (d.place === 'wall-inside') {
        const off = 20 + d.height / 2
        scene.add.image(p.x + nx * off, p.y + ny * off, d.key).setRotation(along).setDepth(FLAT.decal).setTint(dim)
      } else if (w.tall) {
        // Spilling over the top of a tall wall from outside.
        scene.add.image(p.x - nx * 30, p.y - ny * 30 - WALL_HEIGHT, d.key).setRotation(turn(d)).setDepth(LAYER.backWall + 0.3).setTint(dim)
      }
    }
  }

  // Firelight: torches on long tall walls, braziers standing in some rooms.
  const lights: { img: Phaser.GameObjects.Image; phase: number; base: number }[] = []
  const addLight = (p: Vec, alpha: number) => {
    const img = scene.add.image(p.x, p.y, 'env-light').setTint(b.lightColour).setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha).setDepth(LAYER.light)
    lights.push({ img, phase: rng() * 10, base: alpha })
  }
  for (const w of walls) {
    if (!w.tall || Math.abs(w.n.y) < 0.05 || w.len < 400 || rng() > 0.6) continue
    const m = mid(w.a, w.b)
    scene.add.image(m.x, m.y - 50, key(b, 'torch')).setOrigin(0.5, 1).setDepth(LAYER.backWall + 0.2)
    addLight({ x: m.x, y: m.y - 100 }, 0.55)
  }
  for (const room of g.rooms) {
    for (const cell of room.room.cells) {
      if (rng() > 0.4) continue
      const c = hexToPixel(cell, CELL_SIZE)
      // A corner on the lower half, so the brazier stands in the open rather than against a back wall.
      const corner = pick(rng, [0, 1, 2])
      const a = Phaser.Math.DegToRad(60 * corner - 30 + 30)
      const p = { x: c.x + Math.cos(a) * CELL_SIZE * 0.6, y: c.y + Math.sin(a) * CELL_SIZE * 0.6 }
      scene.add.image(p.x, p.y, key(b, 'brazier')).setOrigin(0.5, 0.95).setDepth(standingDepth(p.y))
      addLight({ x: p.x, y: p.y - 70 }, 0.7)
    }
  }
  const own = scene.add
    .image(0, 0, 'env-light')
    .setTint(0xfff1d6)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.8)
    .setAlpha(0.12 + b.darkness * 0.2)
    .setDepth(LAYER.light)

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
      own.setPosition(p.x, p.y - 50)
    },
  }
}

/** A wall face: masonry courses running along the wall, staggered joints, damp at the foot. */
function drawFace(gfx: Phaser.GameObjects.Graphics, w: Wall, height: number, b: BiomeDef, rng: Rng) {
  if (Math.abs(w.n.y) < 0.05) return // seen edge-on
  const { a, b: e } = w
  const up = (p: Vec, h: number) => ({ x: p.x, y: p.y - h })
  // Light from the top-left: faces turned west are brighter.
  const light = 0.92 - w.n.x * 0.14
  const stone = multiply(b.wallFace.stone, light * (1 - b.darkness * 0.6))
  const mortar = multiply(b.wallFace.mortar, 1 - b.darkness * 0.4)
  gfx.fillStyle(stone, 1)
  gfx.fillPoints([a, e, up(e, height), up(a, height)].map((p) => new Phaser.Math.Vector2(p.x, p.y)), true)
  // Courses and joints.
  const courses = Math.max(1, Math.round(height / COURSE))
  const ch = height / courses
  gfx.lineStyle(2, mortar, 0.9)
  for (let k = 1; k < courses; k++) gfx.lineBetween(a.x, a.y - k * ch, e.x, e.y - k * ch)
  for (let k = 0; k < courses; k++) {
    let t = (k % 2 ? 0.5 : 0) * (48 / w.len)
    while (t < 1) {
      const p = { x: a.x + (e.x - a.x) * t, y: a.y + (e.y - a.y) * t }
      gfx.lineBetween(p.x, p.y - k * ch, p.x, p.y - (k + 1) * ch)
      t += (40 + rng() * 30) / w.len
    }
    // A worn highlight along the top of each course.
    gfx.lineStyle(1, 0xffffff, 0.06)
    gfx.lineBetween(a.x, a.y - (k + 1) * ch + 2, e.x, e.y - (k + 1) * ch + 2)
    gfx.lineStyle(2, mortar, 0.9)
  }
  // Damp and moss creeping up from the floor, and the outline.
  gfx.fillStyle(0x000000, 0.3)
  gfx.fillPoints([a, e, up(e, 14), up(a, 14)].map((p) => new Phaser.Math.Vector2(p.x, p.y)), true)
  if (b.wallFace.moss !== null && height > 40) {
    gfx.fillStyle(multiply(b.wallFace.moss, 1 - b.darkness * 0.5), 0.85)
    for (let t = rng() * 0.2; t < 1; t += 0.15 + rng() * 0.25) {
      const p = { x: a.x + (e.x - a.x) * t, y: a.y + (e.y - a.y) * t }
      gfx.fillEllipse(p.x, p.y - 6, 30 + rng() * 40, 12 + rng() * 16)
    }
  }
  gfx.lineStyle(2, 0x000000, 0.6)
  gfx.strokePoints([a, e, up(e, height), up(a, height)].map((p) => new Phaser.Math.Vector2(p.x, p.y)), true)
}

const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const grey = (k: number) => {
  const v = Math.round(Math.max(0, Math.min(1, k)) * 255)
  return (v << 16) | (v << 8) | v
}
function multiply(colour: number, k: number) {
  const c = (s: number) => Math.round(Math.max(0, Math.min(255, ((colour >> s) & 255) * k)))
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

function insideHex(x: number, y: number, r: number) {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const ir = (r * Math.sqrt(3)) / 2
  return ax <= ir && ax * 0.5 + ay * (Math.sqrt(3) / 2) <= ir
}

function insidePolygon(p: Vec, poly: Vec[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const c = poly[j]
    if (a.y > p.y !== c.y > p.y && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y) + a.x) inside = !inside
  }
  return inside
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
