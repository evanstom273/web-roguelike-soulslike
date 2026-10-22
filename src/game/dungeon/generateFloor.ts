import { createRng, pick, randInt, shuffle, weightedPick, type Rng } from '../random.ts'
import { DIRECTIONS, add, fromOffset, hexKey, rotate60, scale, type Hex } from './hex.ts'

// Floor layout on a pointy-top hex grid.
//
// The grid is made of "cells". Rooms are anchored on every other cell (both axial
// coordinates even) — call those "slots". Between any two neighbouring slots sits
// exactly one cell: inside a multi-slot room it's filled in as floor, and between
// two different rooms it's where a narrow hallway can run. So hallways are always
// one cell long.
//
// The boss room is always a big "flower" room, attached last by a single hallway
// to the furthest point it can reach, so it's always a dead end.

export type RoomShape = 'single' | 'pair' | 'bend' | 'line' | 'triangle' | 'flower'
export type RoomKind = 'normal' | 'start' | 'boss'

export interface Room {
  id: number
  shape: RoomShape
  kind: RoomKind
  slots: Hex[] // anchor cells, in cell coordinates
  cells: Hex[] // every floor cell the room covers (slots + the joins between them)
}

export interface Hallway {
  id: number
  from: number // room ids
  to: number
  a: Hex // slot in `from` the hallway leaves from
  b: Hex // slot in `to` it arrives at
  cell: Hex // the cell it runs across
  loop: boolean // true if it was added on top of the spanning tree
}

export interface Floor {
  seed: string
  width: number
  height: number
  area: Hex[] // every cell in the grid, for drawing the backdrop
  rooms: Room[]
  hallways: Hallway[]
  startRoom: number
  bossRoom: number
  bossDepth: number // hallways between start and boss on the shortest route
}

export interface FloorOptions {
  width: number
  height: number
  fill?: number // fraction of slots to fill with rooms
  loopChance?: number // chance each unconnected pair of neighbouring rooms gets an extra hallway
}

// Room footprints in slot steps (one step = one direction from DIRECTIONS).
const SHAPES: Record<RoomShape, Hex[]> = {
  single: [{ q: 0, r: 0 }],
  pair: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
  bend: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: 1 }],
  line: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
  triangle: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }],
  flower: [{ q: 0, r: 0 }, ...DIRECTIONS],
}

const SHAPE_WEIGHTS: { item: RoomShape; weight: number }[] = [
  { item: 'single', weight: 45 },
  { item: 'pair', weight: 18 },
  { item: 'triangle', weight: 12 },
  // Bends and lines are 5-hex strips; too many of them makes floors feel stringy.
  { item: 'bend', weight: 5 },
  { item: 'line', weight: 2 },
  { item: 'flower', weight: 4 },
]
const MAX_FLOWERS = 1 // not counting the boss room

// If a layout leaves no room for a flower boss room, it's regenerated (deterministically,
// from the same seed) up to this many times before settling for a smaller boss room.
const BOSS_LAYOUT_ATTEMPTS = 10
const BOSS_FALLBACK_SHAPES: RoomShape[] = ['flower', 'triangle', 'pair', 'single']

function rotations(shape: Hex[]): Hex[][] {
  const out: Hex[][] = []
  let current = shape
  for (let i = 0; i < 6; i++) {
    out.push(current)
    current = current.map(rotate60)
  }
  return out
}

export function generateFloor(seed: string, options: FloorOptions): Floor {
  for (let attempt = 0; attempt < BOSS_LAYOUT_ATTEMPTS; attempt++) {
    const floor = buildFloor(seed, attempt === 0 ? seed : `${seed}#${attempt}`, options, ['flower'])
    if (floor) return floor
  }
  return buildFloor(seed, `${seed}#fallback`, options, BOSS_FALLBACK_SHAPES)!
}

// Returns null if none of `bossShapes` can be placed.
function buildFloor(seed: string, rngSeed: string, options: FloorOptions, bossShapes: RoomShape[]): Floor | null {
  const { width, height, fill = 0.45, loopChance = 0.25 } = options
  const rng: Rng = createRng(rngSeed)

  const area: Hex[] = []
  const inArea = new Set<string>()
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const h = fromOffset(col, row)
      area.push(h)
      inArea.add(hexKey(h))
    }
  }
  const isSlot = (h: Hex) => h.q % 2 === 0 && h.r % 2 === 0 && inArea.has(hexKey(h))
  const slots = area.filter(isSlot)
  const targetSlots = Math.max(1, Math.round(slots.length * fill))

  const owner = new Map<string, number>() // slot key -> room id
  const rooms: Room[] = []
  const hallways: Hallway[] = []
  const linked = new Set<string>() // "a-b" room id pairs that already share a hallway
  const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const midpoint = (a: Hex, b: Hex): Hex => ({ q: (a.q + b.q) / 2, r: (a.r + b.r) / 2 })

  function placeRoom(shape: RoomShape, roomSlots: Hex[]): Room {
    const id = rooms.length
    const cells = [...roomSlots]
    for (let i = 0; i < roomSlots.length; i++) {
      for (let j = i + 1; j < roomSlots.length; j++) {
        const a = roomSlots[i]
        const b = roomSlots[j]
        const dq = (b.q - a.q) / 2
        const dr = (b.r - a.r) / 2
        if (DIRECTIONS.some((d) => d.q === dq && d.r === dr)) cells.push(midpoint(a, b))
      }
    }
    const room: Room = { id, shape, kind: 'normal', slots: roomSlots, cells }
    rooms.push(room)
    for (const s of roomSlots) owner.set(hexKey(s), id)
    return room
  }

  function connect(fromRoom: number, toRoom: number, a: Hex, b: Hex, loop: boolean) {
    hallways.push({ id: hallways.length, from: fromRoom, to: toRoom, a, b, cell: midpoint(a, b), loop })
    linked.add(pairKey(fromRoom, toRoom))
  }

  // Every way a shape could be rotated and positioned on free slots so that it covers `target`.
  function placementsCovering(shape: RoomShape, target: Hex): Hex[][] {
    const placements: Hex[][] = []
    for (const rotated of rotations(SHAPES[shape])) {
      for (const anchor of rotated) {
        const placed = rotated.map((s) => add(target, scale({ q: s.q - anchor.q, r: s.r - anchor.r }, 2)))
        if (placed.every((s) => isSlot(s) && !owner.has(hexKey(s)))) placements.push(placed)
      }
    }
    return placements
  }

  // Grow the floor outwards from a random start slot, one room at a time.
  // Each new room hangs off an existing one, which guarantees everything is reachable.
  placeRoom('single', [pick(rng, slots)])
  let filled = 1
  let flowers = 0
  for (let attempt = 0; attempt < 4000 && filled < targetSlots; attempt++) {
    const parent = pick(rng, rooms)
    const from = pick(rng, parent.slots)
    const target = add(from, scale(pick(rng, DIRECTIONS), 2))
    if (!isSlot(target) || owner.has(hexKey(target))) continue

    let shape = weightedPick(rng, SHAPE_WEIGHTS)
    if (shape === 'flower' && flowers >= MAX_FLOWERS) shape = 'single'

    const placements = placementsCovering(shape, target)
    const chosen = placements.length > 0 ? pick(rng, placements) : [target]
    if (placements.length === 0) shape = 'single'
    if (shape === 'flower') flowers++

    const room = placeRoom(shape, chosen)
    connect(parent.id, room.id, from, target, false)
    filled += chosen.length
  }

  // Loops: neighbouring rooms that aren't linked yet get a hallway some of the time.
  const candidates = new Map<string, { from: number; to: number; options: [Hex, Hex][] }>()
  for (const room of rooms) {
    for (const s of room.slots) {
      for (const d of DIRECTIONS) {
        const n = add(s, scale(d, 2))
        const other = owner.get(hexKey(n))
        if (other === undefined || other <= room.id) continue
        const key = pairKey(room.id, other)
        if (linked.has(key)) continue
        const entry = candidates.get(key) ?? { from: room.id, to: other, options: [] }
        entry.options.push([s, n])
        candidates.set(key, entry)
      }
    }
  }
  for (const c of shuffle(rng, [...candidates.values()])) {
    if (rng() < loopChance) {
      const [a, b] = c.options[randInt(rng, c.options.length)]
      connect(c.from, c.to, a, b, true)
    }
  }

  // Shortest-route distance (in hallways) from the start room to every room.
  const adjacency = rooms.map(() => [] as number[])
  for (const h of hallways) {
    adjacency[h.from].push(h.to)
    adjacency[h.to].push(h.from)
  }
  const depth = rooms.map(() => -1)
  depth[0] = 0
  const queue = [0]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of adjacency[current]) {
      if (depth[next] === -1) {
        depth[next] = depth[current] + 1
        queue.push(next)
      }
    }
  }

  // Boss room: the biggest shape that fits, hung off the deepest room it can reach.
  // It's added after the loops, with exactly one hallway, so it's always a dead end.
  let bossRoom = 0
  let bossDepth = 0
  for (const shape of bossShapes) {
    let best: { parent: Room; from: Hex; target: Hex; slots: Hex[] }[] = []
    let bestDepth = -1
    for (const room of rooms) {
      if (depth[room.id] < bestDepth) continue
      for (const from of room.slots) {
        for (const d of DIRECTIONS) {
          const target = add(from, scale(d, 2))
          if (!isSlot(target) || owner.has(hexKey(target))) continue
          for (const slots of placementsCovering(shape, target)) {
            if (depth[room.id] > bestDepth) {
              bestDepth = depth[room.id]
              best = []
            }
            best.push({ parent: room, from, target, slots })
          }
        }
      }
    }
    if (best.length === 0) continue
    const choice = pick(rng, best)
    const boss = placeRoom(shape, choice.slots)
    connect(choice.parent.id, boss.id, choice.from, choice.target, false)
    bossRoom = boss.id
    bossDepth = bestDepth + 1
    break
  }
  if (bossRoom === 0) return null

  rooms[0].kind = 'start'
  rooms[bossRoom].kind = 'boss'

  return {
    seed,
    width,
    height,
    area,
    rooms,
    hallways,
    startRoom: 0,
    bossRoom,
    bossDepth,
  }
}
