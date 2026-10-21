// Deterministic overhead starfield + floor grid for the menu backdrop.

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const rand = seeded(73)
const STARS = Array.from({ length: 140 }, () => ({
  x: rand() * 1000,
  y: rand() * 1000,
  r: rand() < 0.9 ? 0.6 + rand() * 0.8 : 1.4 + rand() * 0.9,
  o: 0.25 + rand() * 0.6,
}))

export function Starfield() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Two stacked copies of the same tile scroll upward to loop seamlessly. */}
      <div className="absolute inset-x-0 top-0 h-[200%] animate-[drift_180s_linear_infinite]">
        {[0, 1].map((copy) => (
          <svg
            key={copy}
            className="block h-1/2 w-full"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid slice"
          >
            {STARS.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe9ff" opacity={s.o} />
            ))}
          </svg>
        ))}
      </div>

      {/* Faint deck grid, viewed straight down. */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-neon) 1px, transparent 1px), linear-gradient(90deg, var(--color-neon) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Vignette and scanlines. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--color-void)_100%)]" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.18)_0px,rgba(0,0,0,0.18)_1px,transparent_1px,transparent_3px)]" />
    </div>
  )
}
