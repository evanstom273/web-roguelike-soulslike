import { useSyncExternalStore } from 'react'
import { SHARD_NAME } from '../data/progression.ts'
import { WEAPONS } from '../data/registry.ts'
import type { WeaponDef } from '../data/types.ts'
import type { HudStore } from '../hudStore.ts'
import type { ActionButton, InputState } from '../input.ts'

// Elden Ring-style HUD: bars top-left, equipment cross bottom-left, runes bottom-right.

// Bars grow with their maximum, like the Souls games (px per point).
const HP_SCALE = 0.4
const STAMINA_SCALE = 2

function Bar({ value, max, scale, colour, lag }: { value: number; max: number; scale: number; colour: string; lag?: boolean }) {
  const pct = `${Math.max(0, Math.min(100, (value / max) * 100))}%`
  return (
    <div
      className="relative h-[9px] max-w-[70vw] border border-black/80 bg-black/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ width: max * scale }}
    >
      {/* The pale bar that drains after a hit, as in Elden Ring. */}
      {lag && <div className="absolute inset-y-0 left-0 bg-[#d8c690] transition-[width] delay-300 duration-700" style={{ width: pct }} />}
      <div className="absolute inset-y-0 left-0" style={{ width: pct, background: colour }} />
      <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
    </div>
  )
}

function Slot({ children, className = '', onTap, label }: { children?: React.ReactNode; className?: string; onTap?: () => void; label?: string }) {
  return (
    <div
      role={onTap ? 'button' : undefined}
      aria-label={label}
      onPointerDown={(e) => {
        if (!onTap) return
        e.stopPropagation()
        onTap()
      }}
      className={`flex size-11 items-center justify-center border border-[#b9a77a]/45 bg-black/45 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] sm:size-14 ${onTap ? 'pointer-events-auto cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

// A weapon's own art, laid diagonally across its slot (shields stand upright).
function WeaponArt({ weapon }: { weapon: WeaponDef }) {
  const upright = weapon.art.upright
  return (
    <img
      src={weapon.art.url}
      alt={weapon.name}
      className={`max-w-none ${upright ? '' : '-rotate-45'}`}
      style={{ width: upright ? '62%' : '130%', aspectRatio: `${weapon.art.width} / ${weapon.art.height}` }}
      draggable={false}
    />
  )
}

export function Hud({ store, touch, input }: { store: HudStore; touch: boolean; input: InputState }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const weapon = WEAPONS.get(s.weaponId)
  const leftWeapon = s.leftWeaponId ? WEAPONS.get(s.leftWeaponId) : undefined
  const tap = (button: ActionButton) => () => {
    input.pressTouch(button)
    input.releaseTouch(button)
  }

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute top-4 left-4 flex flex-col gap-1.5">
        <Bar value={s.hp} max={s.maxHp} scale={HP_SCALE} colour="linear-gradient(#c43a32, #7c1712)" lag />
        <Bar value={s.stamina} max={s.maxStamina} scale={STAMINA_SCALE} colour="linear-gradient(#4f9a3e, #275a1d)" />
        {/* Status buildup on the player, and anything currently affecting them. */}
        {s.statuses.map((st) => (
          <div key={st.id} className="flex items-center gap-2">
            <div className="h-1 w-24 bg-black/60">
              <div className="h-full" style={{ width: `${st.fill * 100}%`, background: st.colour, opacity: st.triggered ? 0.5 : 1 }} />
            </div>
            <span className="text-[0.55rem] tracking-[0.2em] uppercase" style={{ color: st.colour }}>
              {st.name}
            </span>
          </div>
        ))}
        {s.effects.length > 0 && <div className="text-[0.55rem] tracking-[0.2em] text-text/70 uppercase">{s.effects.join(' · ')}</div>}
      </div>

      {/* Equipment cross: spell (up), left hand, right hand, quick item (down). Up and right cycle. */}
      <div className={`absolute left-4 grid grid-cols-3 gap-1 ${touch ? 'bottom-4 opacity-80' : 'bottom-5'}`}>
        <span />
        <Slot className="relative" onTap={tap('spell')} label="Next spell">
          {s.spellName && (
            <>
              <span className="px-0.5 text-center text-[0.5rem] leading-tight tracking-wider text-text/80 uppercase">{s.spellName}</span>
              {/* DS1-style uses left */}
              <span className="absolute right-0.5 bottom-0 text-xs text-[#e9dfc0] tabular-nums">{s.spellCharges < 0 ? '∞' : s.spellCharges}</span>
            </>
          )}
        </Slot>
        <span />
        <Slot className="relative overflow-hidden" onTap={tap('leftWeapon')} label="Next left-hand weapon">
          {leftWeapon && <WeaponArt weapon={leftWeapon} />}
        </Slot>
        <span />
        <Slot className="relative overflow-hidden" onTap={tap('weapon')} label="Next weapon">
          {weapon && <WeaponArt weapon={weapon} />}
          {/* Skill cooldown: a dark shade that drains as the skill recharges. */}
          {s.skillCooldown > 0 && <div className="absolute inset-x-0 bottom-0 bg-black/65" style={{ height: `${s.skillCooldown * 100}%` }} />}
        </Slot>
        <span />
        <Slot />
        <span />
      </div>
      <div className={`absolute left-4 flex flex-col text-[0.6rem] tracking-[0.25em] text-text/70 uppercase ${touch ? 'bottom-[13.5rem]' : 'bottom-[14rem]'}`}>
        <span>R · {weapon?.name ?? 'empty'}</span>
        <span>L · {leftWeapon?.name ?? 'empty'}</span>
      </div>

      <div
        className={`absolute right-4 flex items-center gap-2 border border-[#b9a77a]/40 bg-black/50 px-3 py-1.5 ${touch ? 'top-4' : 'bottom-5'}`}
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
          <path d="M10 1 L16 10 L10 19 L4 10 Z" fill="none" stroke="#d8c690" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2.2" fill="#d8c690" />
        </svg>
        <span className="font-ui text-sm tracking-[0.15em] text-[#e9dfc0] tabular-nums">{s.runes}</span>
        {s.shards > 0 && (
          <span className="ml-2 flex items-center gap-1 border-l border-[#b9a77a]/30 pl-2" title={`${SHARD_NAME}s found this run`}>
            <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden>
              <path d="M7 2 L14 6 L12 18 L5 13 Z" fill="#9fd3e0" stroke="#e6f4f7" strokeWidth="1" />
            </svg>
            <span className="font-ui text-sm text-[#cfe9ef] tabular-nums">{s.shards}</span>
          </span>
        )}
      </div>

      {s.atExit && (
        <button
          type="button"
          onClick={() => input.requestDescend()}
          className="pointer-events-auto absolute bottom-[40%] left-1/2 flex -translate-x-1/2 flex-col items-center border border-ember bg-black/70 px-6 py-2.5 hover:bg-ember/20"
        >
          <span className="font-display text-sm font-bold tracking-[0.3em] text-ember uppercase">Descend</span>
          {!touch && <span className="text-[0.55rem] tracking-[0.25em] text-dim uppercase">Enter</span>}
        </button>
      )}

      {s.notice && (
        <div className="absolute bottom-[38%] left-1/2 -translate-x-1/2 bg-black/60 px-4 py-1 text-xs tracking-[0.3em] text-[#e9dfc0] uppercase">
          {s.notice}
        </div>
      )}
    </div>
  )
}
