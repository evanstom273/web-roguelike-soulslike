import type { Floor, Room } from '../dungeon/generateFloor.ts'
import { hexCorners, hexKey, hexToPixel, type Hex } from '../dungeon/hex.ts'

// Turns a generated floor into world-space shapes: floor polygons to draw and wall
// segments to collide with. 1 unit = 1 world pixel.

export const CELL_SIZE = 240 // hex circumradius; each hex side is this long too
export const HALLWAY_WIDTH = 120

export interface Vec {
  x: number
  y: number
}

export interface Segment {
  a: Vec
  b: Vec
}

export interface RoomGeometry {
  room: Room
  cells: Vec[][] // hex polygons
  centre: Vec
}

export interface HallwayGeometry {
  corners: Vec[] // rectangle across the gap between two rooms
}

export interface FloorGeometry {
  rooms: RoomGeometry[]
  hallways: HallwayGeometry[]
  walls: Segment[]
  spawn: Vec
}

// Edge i of a pointy-top hex (corner i -> corner i+1) faces this neighbour.
const EDGE_NEIGHBOURS: Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
]
const edgeFacing = (d: Hex) => EDGE_NEIGHBOURS.findIndex((n) => n.q === d.q && n.r === d.r)

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export function buildFloorGeometry(floor: Floor): FloorGeometry {
  const corners = (h: Hex) => hexCorners(h, CELL_SIZE)

  // Wall edges that a hallway opens through: "cellKey:edgeIndex".
  const doorways = new Set<string>()
  const hallways: HallwayGeometry[] = []
  const walls: Segment[] = []

  for (const h of floor.hallways) {
    const d: Hex = { q: (h.b.q - h.a.q) / 2, r: (h.b.r - h.a.r) / 2 }
    const back: Hex = { q: -d.q, r: -d.r }
    doorways.add(`${hexKey(h.a)}:${edgeFacing(d)}`)
    doorways.add(`${hexKey(h.b)}:${edgeFacing(back)}`)

    // The hallway spans from the edge of cell a to the edge of cell b.
    const a = hexToPixel(h.a, CELL_SIZE)
    const b = hexToPixel(h.b, CELL_SIZE)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const ux = (b.x - a.x) / len
    const uy = (b.y - a.y) / len
    const nx = -uy * (HALLWAY_WIDTH / 2)
    const ny = ux * (HALLWAY_WIDTH / 2)
    const inradius = (CELL_SIZE * Math.sqrt(3)) / 2
    const s = { x: a.x + ux * inradius, y: a.y + uy * inradius }
    const e = { x: b.x - ux * inradius, y: b.y - uy * inradius }
    const rect = [
      { x: s.x + nx, y: s.y + ny },
      { x: e.x + nx, y: e.y + ny },
      { x: e.x - nx, y: e.y - ny },
      { x: s.x - nx, y: s.y - ny },
    ]
    hallways.push({ corners: rect })
    walls.push({ a: rect[0], b: rect[1] }, { a: rect[3], b: rect[2] })
  }

  const rooms: RoomGeometry[] = floor.rooms.map((room) => {
    const own = new Set(room.cells.map(hexKey))
    for (const cell of room.cells) {
      const c = corners(cell)
      EDGE_NEIGHBOURS.forEach((n, i) => {
        if (own.has(hexKey({ q: cell.q + n.q, r: cell.r + n.r }))) return
        const p = c[i]
        const q = c[(i + 1) % 6]
        if (doorways.has(`${hexKey(cell)}:${i}`)) {
          // Leave a gap the width of the hallway in the middle of this edge.
          const gap = HALLWAY_WIDTH / 2 / CELL_SIZE
          walls.push({ a: p, b: lerp(p, q, 0.5 - gap) }, { a: lerp(p, q, 0.5 + gap), b: q })
        } else {
          walls.push({ a: p, b: q })
        }
      })
    }
    const slots = room.slots.map((s) => hexToPixel(s, CELL_SIZE))
    return {
      room,
      cells: room.cells.map(corners),
      centre: {
        x: slots.reduce((t, p) => t + p.x, 0) / slots.length,
        y: slots.reduce((t, p) => t + p.y, 0) / slots.length,
      },
    }
  })

  return { rooms, hallways, walls, spawn: rooms[floor.startRoom].centre }
}

// Pushes a circle out of any walls it overlaps. Returns the corrected position.
export function resolveWalls(pos: Vec, radius: number, walls: Segment[]): Vec {
  let { x, y } = pos
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const w of walls) {
      const dx = w.b.x - w.a.x
      const dy = w.b.y - w.a.y
      const lenSq = dx * dx + dy * dy
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - w.a.x) * dx + (y - w.a.y) * dy) / lenSq))
      const cx = w.a.x + dx * t
      const cy = w.a.y + dy * t
      const ox = x - cx
      const oy = y - cy
      const distSq = ox * ox + oy * oy
      if (distSq < radius * radius && distSq > 1e-9) {
        const dist = Math.sqrt(distSq)
        const push = radius - dist
        x += (ox / dist) * push
        y += (oy / dist) * push
        moved = true
      }
    }
    if (!moved) break
  }
  return { x, y }
}

