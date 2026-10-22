import type { Floor } from './dungeon/generateFloor.ts'
import type { FloorGeometry, Vec } from './world/floorGeometry.ts'

// The floor as the map shows it: every room's outline and hallway, which rooms you've been
// in, and where you are. The game scene fills it in; the minimap and full map read it.

export interface MapRoom {
  id: number
  cells: Vec[][] // hex outlines
  kind: 'normal' | 'start' | 'boss'
}

export interface MapHallway {
  from: number
  to: number
  corners: Vec[]
}

export interface MapState {
  rooms: MapRoom[]
  hallways: MapHallway[]
  exit: Vec | null
  explored: ReadonlySet<number>
  current: number | null // the room you're in, if any
  player: Vec
  facing: number
}

const EMPTY: MapState = { rooms: [], hallways: [], exit: null, explored: new Set(), current: null, player: { x: 0, y: 0 }, facing: 0 }

/** True if p is inside the convex polygon (either winding). */
function inside(p: Vec, poly: Vec[]) {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return true
}

export class MapStore {
  private state = EMPTY
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  setFloor(floor: Floor, geometry: FloorGeometry, exit: Vec) {
    this.state = {
      rooms: geometry.rooms.map((r) => ({ id: r.room.id, cells: r.cells, kind: r.room.kind })),
      hallways: geometry.hallways.map((h, i) => ({ from: floor.hallways[i].from, to: floor.hallways[i].to, corners: h.corners })),
      exit,
      explored: new Set(),
      current: null,
      player: geometry.spawn,
      facing: 0,
    }
    this.notify()
  }

  /**
   * Where the player is now. Entering a room reveals it. Only notifies when something on
   * the map visibly changed, so React isn't redrawing it every frame.
   */
  track(player: Vec, facing: number) {
    const s = this.state
    let current = s.current
    const room = current === null ? undefined : s.rooms.find((r) => r.id === current)
    if (!room || !room.cells.some((c) => inside(player, c))) {
      current = s.rooms.find((r) => r.cells.some((c) => inside(player, c)))?.id ?? null
    }
    const revealed = current !== null && !s.explored.has(current)
    const moved = Math.hypot(player.x - s.player.x, player.y - s.player.y) > 15 || Math.abs(facing - s.facing) > 0.2
    if (!revealed && !moved && current === s.current) return
    this.state = {
      ...s,
      explored: revealed ? new Set([...s.explored, current!]) : s.explored,
      current,
      player: { x: player.x, y: player.y },
      facing,
    }
    this.notify()
  }

  private notify() {
    for (const l of this.listeners) l()
  }
}
