import { useMemo } from 'react'
import { BIOMES } from '../game/world/biomes.ts'

// Title-screen backdrop: looking straight down into a ruined courtyard on the surface,
// built from the same art as the game, with braziers burning and the jungle closing in.

const SQ3 = Math.sqrt(3)
const R = 720 // hex circumradius, as in the game
const HEX_W = R * SQ3
const surface = BIOMES[0]

// Courtyard cells (pointy-top hex offsets) and which floor variant each uses.
const CELLS: [number, number, number][] = [
  [0, 0, 0],
  [-HEX_W, 0, 2],
  [HEX_W, 0, 3],
  [-HEX_W / 2, -R * 1.5, 1],
  [HEX_W / 2, R * 1.5, 2],
]

const corner = (cx: number, cy: number, i: number) => {
  const a = ((60 * i - 30) * Math.PI) / 180
  return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const
}

// Braziers in a ring around the centrepiece.
const BRAZIERS = [0, 1, 2, 3, 4, 5].map((i) => {
  const [x, y] = corner(0, 0, i)
  return [x * 0.72, y * 0.72] as const
})

const foliage = surface.decals.find((d) => d.key.endsWith('foliage'))!

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
        y: by + (rand() - 0.5) * 30,
        dx: Math.cos(a) * (60 + rand() * 160) + 60, // a light breeze from the west
        dy: Math.sin(a) * (60 + rand() * 160) - 30,
        r: 2 + rand() * 3,
        delay: rand() * 6,
        duration: 3 + rand() * 4,
      }
    })
  }, [])

  // Pillars at the courtyard's outer corners, and jungle spilling in between.
  const pillars = useMemo(() => {
    const seen = new Map<string, readonly [number, number]>()
    for (const [cx, cy] of CELLS) for (let i = 0; i < 6; i++) {
      const p = corner(cx, cy, i)
      seen.set(`${Math.round(p[0])},${Math.round(p[1])}`, p)
    }
    return [...seen.values()]
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-void" aria-hidden>
      <svg className="absolute inset-0 h-full w-full animate-[pan_40s_ease-in-out_infinite_alternate]" viewBox="-1500 -950 3000 1900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="jungle" width="512" height="512" patternUnits="userSpaceOnUse">
            <image href={surface.outside} width="512" height="512" />
          </pattern>
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
        {pillars.map(([x, y], i) => (
          <image key={i} href={surface.pillar} x={x - 36} y={y - 36} width="72" height="72" />
        ))}
        {BRAZIERS.map(([x, y], i) => (
          <image key={i} href={surface.brazier} x={x - 48} y={y - 48} width="96" height="96" />
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
        {BRAZIERS.map(([x, y], i) => (
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
        <rect x="-1500" y="-950" width="3000" height="1900" fill="url(#vignette)" />
      </svg>
    </div>
  )
}
