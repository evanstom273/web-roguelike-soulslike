import { useSyncExternalStore } from 'react'
import type { MapState, MapStore } from '../mapStore.ts'
import type { Vec } from '../world/floorGeometry.ts'

// The floor map: rooms you've been in (and the hallways leading out of them), where you
// are, and the way down once you've found it. As a minimap it follows you; full-size it
// shows everything explored.

const MINI_RADIUS = 2600 // world px from the player to the minimap's edge

const points = (poly: Vec[]) => poly.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')

function visible(s: MapState) {
  const rooms = s.rooms.filter((r) => s.explored.has(r.id))
  const hallways = s.hallways.filter((h) => s.explored.has(h.from) || s.explored.has(h.to))
  const boss = rooms.find((r) => r.kind === 'boss')
  return { rooms, hallways, exit: boss ? s.exit : null }
}

/** The explored part of the floor, framed with a margin, for the full map. */
function bounds(s: MapState, rooms: MapState['rooms']) {
  const all = [...rooms.flatMap((r) => r.cells.flat()), s.player]
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const pad = 500
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  const w = Math.max(...xs) + pad - x
  const h = Math.max(...ys) + pad - y
  const side = Math.max(w, h)
  return `${x - (side - w) / 2} ${y - (side - h) / 2} ${side} ${side}`
}

export function MapView({ store, full = false }: { store: MapStore; full?: boolean }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { rooms, hallways, exit } = visible(s)
  const viewBox = full ? bounds(s, rooms) : `${s.player.x - MINI_RADIUS} ${s.player.y - MINI_RADIUS} ${MINI_RADIUS * 2} ${MINI_RADIUS * 2}`
  const unit = full ? Number(viewBox.split(' ')[2]) / 600 : (MINI_RADIUS * 2) / 120 // world px per screen px, roughly

  const shapes = [...hallways.map((h) => h.corners), ...rooms.flatMap((r) => r.cells)]
  const arrow = 9 * unit
  const a = s.facing
  const tip = { x: s.player.x + Math.cos(a) * arrow, y: s.player.y + Math.sin(a) * arrow }
  const back = (side: number) => ({ x: s.player.x + Math.cos(a + side * 2.5) * arrow * 0.8, y: s.player.y + Math.sin(a + side * 2.5) * arrow * 0.8 })

  return (
    <svg viewBox={viewBox} className="block size-full" aria-label="Map">
      {/* Outline: every shape stroked, then filled over, so only the outer edges show. */}
      <g stroke="#b9a77a" strokeWidth={3} vectorEffect="non-scaling-stroke" fill="#b9a77a" strokeLinejoin="round">
        {shapes.map((p, i) => (
          <polygon key={i} points={points(p)} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <g fill="#2a2319">
        {shapes.map((p, i) => (
          <polygon key={i} points={points(p)} />
        ))}
      </g>
      <g fill="#d9a35b" opacity={0.18}>
        {rooms
          .filter((r) => r.id === s.current)
          .flatMap((r) => r.cells)
          .map((p, i) => (
            <polygon key={i} points={points(p)} />
          ))}
      </g>
      {exit && (
        <g transform={`translate(${exit.x} ${exit.y}) scale(${unit})`}>
          <rect x={-7} y={-5} width={14} height={10} fill="#0b0a08" stroke="#d9a35b" strokeWidth={1.5} />
          <path d="M-5 -1.5 H5 M-5 1.5 H5" stroke="#d9a35b" strokeWidth={1} />
        </g>
      )}
      <polygon points={points([tip, back(1), back(-1)])} fill="#f4ead2" stroke="#0a0907" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
