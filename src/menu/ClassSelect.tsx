import { useEffect, useRef, useState } from 'react'
import { ATTRIBUTE_IDS, ATTRIBUTES, deriveStats } from '../game/data/attributes.ts'
import { CLASSES, type ClassDef } from '../game/data/classes.ts'
import { getSpell, getWeapon } from '../game/data/registry.ts'
import { MenuFrame, panel } from './MenuFrame.tsx'

// New game: pick a starting class. Its attributes and kit are shown in full.

export function ClassSelect({ onPick, onBack }: { onPick: (cls: ClassDef) => void; onBack: () => void }) {
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const cards = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd' || e.key === 's') {
        e.preventDefault()
        setSelected((i) => (i + 1) % CLASSES.length)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a' || e.key === 'w') {
        e.preventDefault()
        setSelected((i) => (i - 1 + CLASSES.length) % CLASSES.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    cards.current[selected]?.focus()
  }, [selected])

  const pick = (cls: ClassDef) => {
    if (busy) return
    setBusy(true)
    onPick(cls)
  }

  return (
    <MenuFrame title="Choose a class" onBack={onBack}>
      <div className="grid gap-4 sm:grid-cols-3">
        {CLASSES.map((cls, i) => {
          const active = i === selected
          const stats = deriveStats(cls.levels)
          return (
            <button
              key={cls.id}
              ref={(el) => {
                cards.current[i] = el
              }}
              type="button"
              onClick={() => pick(cls)}
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              className={`${panel} flex flex-col border p-5 text-left transition-colors outline-none ${active ? 'border-ember bg-panel' : 'border-line bg-hull/90'}`}
            >
              <span className={`font-display text-xl font-bold tracking-[0.2em] uppercase ${active ? 'text-ember' : 'text-text'}`}>{cls.name}</span>
              <span className="mt-1 text-[0.6rem] tracking-[0.25em] text-dim uppercase">Level 1</span>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {ATTRIBUTE_IDS.map((id) => (
                  <div key={id} className="flex justify-between">
                    <dt className="tracking-[0.15em] text-dim">{ATTRIBUTES[id].short}</dt>
                    <dd className="font-semibold text-text tabular-nums">{cls.levels[id]}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex gap-4 text-xs tracking-[0.15em] text-dim uppercase">
                <span>
                  HP <span className="text-text tabular-nums">{stats.maxHp}</span>
                </span>
                <span>
                  Stamina <span className="text-text tabular-nums">{stats.maxStamina}</span>
                </span>
              </div>

              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm text-text/90">
                {cls.weaponIds.map((id) => (
                  <li key={id} className="flex justify-between gap-2">
                    <span>{getWeapon(id).name}</span>
                    <span className="text-[0.6rem] tracking-[0.2em] text-dim uppercase">{id === cls.right ? 'Right' : id === cls.left ? 'Left' : ''}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-sm text-text/80">
                {cls.spellIds.map((id) => (
                  <li key={id} className="flex justify-between gap-2">
                    <span>{getSpell(id).name}</span>
                    <span className="text-[0.6rem] tracking-[0.2em] text-dim uppercase">Spell</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
      <p className="mt-6 text-center text-[0.65rem] tracking-[0.3em] text-dim uppercase">Saves survive death. Unspent runes don't.</p>
    </MenuFrame>
  )
}
