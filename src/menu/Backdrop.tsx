import { useMemo } from 'react'
import { BIOMES } from '../game/world/biomes.ts'

// Title-screen backdrop: a ruined courtyard on the surface in the game's three-quarter
// view, built from the same art as the game: a back wall with torches, braziers burning,
// embers rising and the jungle closing in.

const SQ3 = Math.sqrt(3)
const R = 720 // hex circumradius, as in the game
const HEX_W = R * SQ3
const surface = BIOMES[0]

// Courtyard cells (pointy-top hex offsets) and which floor variant each uses. The back
// wall crosses the top of the centre row.
const CELLS: [number, number, number][] = [
  [0, 0, 0],
  [-HEX_W, 0, 2],
  [HEX_W, 0, 3],
  [-HEX_W / 2, R * 1.5, 1],
  [HEX_W / 2, R * 1.5, 2],
]

const corner = (cx: number, cy: number, i: number) => {
  const a = ((60 * i - 30) * Math.PI) / 180
  return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const
}

// Braziers in a ring around the centrepiece (bar the one that would be behind the wall).
const BRAZIERS = [0, 1, 2, 3, 4].map((i) => {
  const [x, y] = corner(0, 0, i)
  return [x * 0.72, y * 0.72] as const
})

const foliage = surface.decals.find((d) => d.key.endsWith('foliage'))!

// The back wall runs across the top of the view; its foot is at WALL_Y.
const WALL_Y = -360
const WALL_H = 140
const COLUMNS = [-1400, -840, -280, 280, 840, 1400]
const TORCHES = [-560, 560]
const FLAME_Y = -46 // flame height above a standing brazier's foot

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function Backdrop() {
  const embers = useMemo(() => {
    const rand = seeded(11)
    return Array.from({ length: 36 }, () => {
      const [bx, by] = BRAZIERS[Math.floor(rand() * BRAZIERS.length)]
      const a = rand() * Math.PI * 2
      return {
        x: bx + (rand() - 0.5) * 30,
        y: by + FLAME_Y + (rand() - 0.5) * 20,
        dx: Math.cos(a) * (30 + rand() * 80) + 40, // a light breeze from the west
        dy: -(160 + rand() * 260), // rising off the fire
        r: 2 + rand() * 3,
        delay: rand() * 6,
        duration: 3 + rand() * 4,
      }
    })
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-void" aria-hidden>
      <svg className="absolute inset-0 h-full w-full animate-[pan_40s_ease-in-out_infinite_alternate]" viewBox="-1500 -780 3000 1900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="jungle" width="512" height="512" patternUnits="userSpaceOnUse">
            <image href={surface.outside} width="512" height="512" />
          </pattern>
          <pattern id="coping" width="192" height="40" patternUnits="userSpaceOnUse" y={WALL_Y - WALL_H - 20}>
            <image href={surface.wall} width="192" height="40" />
          </pattern>
          <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5d6052" />
            <stop offset="1" stopColor="#3a3c32" />
          </linearGradient>
          <radialGradient id="firelight">
            <stop offset="0" stopColor="#ffb35c" stopOpacity="0.55" />
            <stop offset="0.4" stopColor="#ff8a3a" stopOpacity="0.2" />
            <stop offset="1" stopColor="#ff8a3a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="0.35" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        <rect x="-3000" y="-2000" width="6000" height="4000" fill="url(#jungle)" />
        {CELLS.map(([cx, cy, v], i) => (
          <image key={i} href={surface.floor[v]} x={cx - HEX_W / 2} y={cy - R} width={HEX_W} height={R * 2} />
        ))}
        {/* Beyond the back wall, only jungle. */}
        <rect x="-3000" y="-2000" width="6000" height={2000 + WALL_Y - WALL_H} fill="url(#jungle)" />
        {/* The back wall: masonry face, coping on top, columns and two torches. */}
        <rect x="-1700" y={WALL_Y - WALL_H} width="3400" height={WALL_H} fill="url(#face)" />
        <g stroke="#14150f" strokeWidth="2" opacity="0.85">
          {[1, 2, 3, 4].map((k) => (
            <line key={k} x1="-1700" x2="1700" y1={WALL_Y - k * 28} y2={WALL_Y - k * 28} />
          ))}
          {Array.from({ length: 5 * 50 }, (_, i) => {
            const k = i % 5
            const x = -1700 + Math.floor(i / 5) * 70 + (k % 2 ? 35 : 0)
            return <line key={i} x1={x} x2={x} y1={WALL_Y - k * 28} y2={WALL_Y - (k + 1) * 28} />
          })}
        </g>
        <rect x="-1700" y={WALL_Y - 14} width="3400" height="14" fill="#000" opacity="0.35" />
        <rect x="-1700" y={WALL_Y - WALL_H - 20} width="3400" height="40" fill="url(#coping)" />
        {TORCHES.map((x) => (
          <image key={x} href={surface.torch} x={x - 14} y={WALL_Y - 50 - 64} width="28" height="64" />
        ))}
        {COLUMNS.map((x) => (
          <image key={x} href={surface.column} x={x - 30} y={WALL_Y + 6 - 170} width="60" height="170" />
        ))}
        {BRAZIERS.map(([x, y], i) => (
          <image key={i} href={surface.brazierStand} x={x - 32} y={y - 91} width="64" height="96" />
        ))}
        {[
          [-1300, -620, 0],
          [1250, 700, 1],
          [700, -900, 2],
          [-760, 980, 3],
        ].map(([x, y, i]) => (
          <image key={i} href={foliage.url} x={x - 130} y={y - 130} width="260" height="260" />
        ))}

        {/* Night over the ruins, firelight cutting through it. */}
        <rect x="-3000" y="-2000" width="6000" height="4000" fill="#000" opacity="0.5" />
        {[...BRAZIERS.map(([x, y]) => [x, y + FLAME_Y] as const), ...TORCHES.map((x) => [x, WALL_Y - 100] as const)].map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="380"
            fill="url(#firelight)"
            className="animate-[firelight_3.1s_ease-in-out_infinite] [transform-box:fill-box] [transform-origin:center] mix-blend-screen"
            style={{ animationDelay: `${-i * 0.7}s` }}
          />
        ))}
        {embers.map((e, i) => (
          <circle
            key={i}
            cx={e.x}
            cy={e.y}
            r={e.r}
            fill="#ffc46b"
            className="animate-[ember-drift_linear_infinite] [transform-box:fill-box] [transform-origin:center]"
            style={{ animationDuration: `${e.duration}s`, animationDelay: `${-e.delay}s`, ['--dx' as string]: `${e.dx}px`, ['--dy' as string]: `${e.dy}px` }}
          />
        ))}
        <rect x="-1500" y="-780" width="3000" height="1900" fill="url(#vignette)" />
      </svg>
    </div>
  )
}
