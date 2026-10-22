import { useEffect, useMemo, useState } from 'react'
import { generateFloor, type Floor, type Room } from '../game/dungeon/generateFloor.ts'
import { hexCorners, hexKey, hexToPixel, type Hex } from '../game/dungeon/hex.ts'
import { randomSeed } from '../game/random.ts'

const SIZE = 10 // hex circumradius in debug-view units
const INRADIUS = (SIZE * Math.sqrt(3)) / 2
const HALLWAY_WIDTH = SIZE * 0.7
const GRID_SIZES = [16, 20] as const

// Edge i of a pointy-top hex (corner i -> corner i+1) faces this neighbour.
const EDGE_NEIGHBOURS: Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
]

const FLOOR_FILL: Record<Room['kind'], string> = {
  normal: '#16223a',
  start: '#0f3a44',
  boss: '#45142c',
}
const WALL = '#38e8ff'
const BOSS_WALL = '#ff3d8b'
const LOOP_HALLWAY = '#ffb547'

const points = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

function RoomShapeSvg({ room }: { room: Room }) {
  const cellKeys = new Set(room.cells.map(hexKey))
  const wall = room.kind === 'boss' ? BOSS_WALL : WALL
  const walls: string[] = []
  for (const cell of room.cells) {
    const corners = hexCorners(cell, SIZE)
    EDGE_NEIGHBOURS.forEach((d, i) => {
      if (cellKeys.has(hexKey({ q: cell.q + d.q, r: cell.r + d.r }))) return
      const a = corners[i]
      const b = corners[(i + 1) % 6]
      walls.push(`M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`)
    })
  }
  return (
    <g>
      {room.cells.map((c) => (
        <polygon
          key={hexKey(c)}
          points={points(hexCorners(c, SIZE))}
          fill={FLOOR_FILL[room.kind]}
          stroke={FLOOR_FILL[room.kind]}
          strokeWidth={0.8}
        />
      ))}
      <path d={walls.join('')} stroke={wall} strokeWidth={1.2} strokeLinecap="round" fill="none" />
    </g>
  )
}

function centroid(room: Room) {
  const ps = room.slots.map((s) => hexToPixel(s, SIZE))
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }
}

function FloorSvg({ floor }: { floor: Floor }) {
  const viewBox = useMemo(() => {
    const ps = floor.area.flatMap((h) => hexCorners(h, SIZE))
    const xs = ps.map((p) => p.x)
    const ys = ps.map((p) => p.y)
    const pad = SIZE
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`
  }, [floor.area])

  return (
    <svg viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {/* The whole available grid, faintly. */}
      <g opacity={0.12}>
        {floor.area.map((h) => (
          <polygon key={hexKey(h)} points={points(hexCorners(h, SIZE))} fill="none" stroke="#6f7f99" strokeWidth={0.4} />
        ))}
      </g>

      {floor.rooms.map((room) => (
        <RoomShapeSvg key={room.id} room={room} />
      ))}

      {/* Hallways run across the single cell between two rooms, covering the wall where they meet it. */}
      {floor.hallways.map((h) => {
        const a = hexToPixel(h.a, SIZE)
        const b = hexToPixel(h.b, SIZE)
        const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
        const start = INRADIUS - 0.8
        const length = 2 * INRADIUS + 1.6
        const side = h.loop ? LOOP_HALLWAY : WALL
        return (
          <g key={h.id} transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
            <rect x={start} y={-HALLWAY_WIDTH / 2} width={length} height={HALLWAY_WIDTH} fill="#111a2c" />
            <path
              d={`M${start + 0.8} ${-HALLWAY_WIDTH / 2}h${length - 1.6}M${start + 0.8} ${HALLWAY_WIDTH / 2}h${length - 1.6}`}
              stroke={side}
              strokeWidth={1}
              strokeOpacity={0.85}
            />
          </g>
        )
      })}

      {[floor.rooms[floor.startRoom], floor.rooms[floor.bossRoom]].map((room, i) => {
        if (i === 1 && floor.bossRoom === floor.startRoom) return null
        const c = centroid(room)
        return (
          <text
            key={room.id}
            x={c.x}
            y={c.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={SIZE * 0.9}
            fontFamily="Orbitron, sans-serif"
            fontWeight={800}
            fill={i === 0 ? WALL : BOSS_WALL}
          >
            {i === 0 ? 'S' : 'B'}
          </text>
        )
      })}
    </svg>
  )
}

export function FloorDebug({ onBack }: { onBack: () => void }) {
  const [seedInput, setSeedInput] = useState(() => randomSeed())
  const [seed, setSeed] = useState(seedInput)
  const [gridSize, setGridSize] = useState<number>(16)

  const floor = useMemo(() => generateFloor(seed, { width: gridSize, height: gridSize }), [seed, gridSize])
  const loops = floor.hallways.filter((h) => h.loop).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const generate = () => setSeed(seedInput.trim() || randomSeed())
  const reroll = () => {
    const next = randomSeed()
    setSeedInput(next)
    setSeed(next)
  }

  const button =
    'border border-line bg-hull px-3 py-2 text-xs font-semibold tracking-[0.2em] uppercase text-text transition-colors hover:border-neon hover:text-neon'

  return (
    <main className="flex h-full flex-col bg-void">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-hull/80 px-4 py-3">
        <button type="button" onClick={onBack} className={button}>
          ← Menu
        </button>
        <h1 className="mr-auto font-display text-sm tracking-[0.2em] text-neon uppercase">Floor Generator</h1>

        <form
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault()
            generate()
          }}
        >
          <label className="sr-only" htmlFor="seed">
            Seed
          </label>
          <input
            id="seed"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Seed"
            className="w-full border border-line bg-void px-3 py-2 font-mono text-sm tracking-widest text-text uppercase outline-none focus:border-neon sm:w-40"
          />
          <button type="submit" className={button}>
            Generate
          </button>
          <button type="button" onClick={reroll} className={`${button} border-hazard/60 text-hazard`}>
            Random
          </button>
          <select
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            className="border border-line bg-hull px-2 py-2 text-xs tracking-[0.15em] text-text uppercase"
            aria-label="Grid size"
          >
            {GRID_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </form>
      </header>

      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-[0.7rem] tracking-[0.15em] text-dim uppercase">
        <span>
          Seed <span className="text-text">{floor.seed}</span>
        </span>
        <span>
          Rooms <span className="text-text">{floor.rooms.length}</span>
        </span>
        <span>
          Hallways <span className="text-text">{floor.hallways.length}</span>
        </span>
        <span>
          Loops <span style={{ color: LOOP_HALLWAY }}>{loops}</span>
        </span>
        <span>
          Boss depth <span className="text-hazard">{floor.bossDepth}</span>
        </span>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <FloorSvg floor={floor} />
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[0.65rem] tracking-[0.15em] text-dim uppercase">
        <span>
          <span className="text-neon">S</span> start
        </span>
        <span>
          <span className="text-hazard">B</span> boss (furthest room)
        </span>
        <span>
          <span style={{ color: LOOP_HALLWAY }}>━</span> loop hallway
        </span>
      </footer>
    </main>
  )
}
