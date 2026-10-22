import { useSyncExternalStore } from 'react'
import type { HudStore } from '../hudStore.ts'

// Elden Ring-style HUD: bars top-left, equipment cross bottom-left, runes bottom-right.

const PX_PER_POINT = 2.4 // bars grow with their maximum, like the Souls games

function Bar({ value, max, colour, lag }: { value: number; max: number; colour: string; lag?: boolean }) {
  const pct = `${Math.max(0, Math.min(100, (value / max) * 100))}%`
  return (
    <div
      className="relative h-[9px] max-w-[70vw] border border-black/80 bg-black/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ width: max * PX_PER_POINT }}
    >
      {/* The pale bar that drains after a hit, as in Elden Ring. */}
      {lag && <div className="absolute inset-y-0 left-0 bg-[#d8c690] transition-[width] delay-300 duration-700" style={{ width: pct }} />}
      <div className="absolute inset-y-0 left-0" style={{ width: pct, background: colour }} />
      <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
    </div>
  )
}

function Slot({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex size-11 items-center justify-center border border-[#b9a77a]/45 bg-black/45 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] sm:size-14 ${className}`}
    >
      {children}
    </div>
  )
}

function BladeIcon() {
  return (
    <svg viewBox="0 0 40 40" className="size-8 sm:size-10" aria-label="Right-hand weapon">
      <path d="M8 32 L12 28" stroke="#3a4250" strokeWidth="4" strokeLinecap="round" />
      <path d="M9.5 25.5 L14.5 30.5" stroke="#8d97a6" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12.5 27.5 L33 7 L34 6 L33.5 8 Z" fill="#c9d3e0" stroke="#5f6a7a" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

export function Hud({ store, touch }: { store: HudStore; touch: boolean }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute top-4 left-4 flex flex-col gap-1.5">
        <Bar value={s.hp} max={s.maxHp} colour="linear-gradient(#c43a32, #7c1712)" lag />
        <Bar value={s.fp} max={s.maxFp} colour="linear-gradient(#3f6fd1, #1d3a86)" />
        <Bar value={s.stamina} max={s.maxStamina} colour="linear-gradient(#4f9a3e, #275a1d)" />
      </div>

      {/* Equipment cross: spell (up), left hand, right hand, quick item (down). */}
      <div className={`absolute left-4 grid grid-cols-3 gap-1 ${touch ? 'bottom-4 opacity-80' : 'bottom-5'}`}>
        <span />
        <Slot />
        <span />
        <Slot />
        <span />
        <Slot>
          <BladeIcon />
        </Slot>
        <span />
        <Slot />
        <span />
      </div>

      <div
        className={`absolute right-4 flex items-center gap-2 border border-[#b9a77a]/40 bg-black/50 px-3 py-1.5 ${touch ? 'top-4' : 'bottom-5'}`}
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
          <path d="M10 1 L16 10 L10 19 L4 10 Z" fill="none" stroke="#d8c690" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2.2" fill="#d8c690" />
        </svg>
        <span className="font-ui text-sm tracking-[0.15em] text-[#e9dfc0] tabular-nums">{s.runes}</span>
      </div>

      {s.notice && (
        <div className="absolute bottom-[38%] left-1/2 -translate-x-1/2 bg-black/60 px-4 py-1 text-xs tracking-[0.3em] text-[#e9dfc0] uppercase">
          {s.notice}
        </div>
      )}
    </div>
  )
}
