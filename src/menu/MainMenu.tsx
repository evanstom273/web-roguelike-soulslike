import { useEffect, useRef, useState } from 'react'
import { Backdrop } from './Backdrop.tsx'

interface MenuItem {
  id: string
  label: string
  enabled: boolean
  tag?: string
}

export interface MainMenuActions {
  onContinue: () => void
  onLoad: () => void
  onNewGame: () => void
  onSandbox: () => void
  onOpenFloorDebug: () => void
}

// Continue and Load need a save to exist. Settings is a placeholder for now.
const menuItems = (hasSaves: boolean): MenuItem[] => [
  { id: 'continue', label: 'Continue', enabled: hasSaves },
  { id: 'load', label: 'Load', enabled: hasSaves },
  { id: 'new', label: 'New Game', enabled: true },
  { id: 'settings', label: 'Settings', enabled: false },
  { id: 'sandbox', label: 'Sandbox', enabled: true, tag: 'Debug' },
  { id: 'floor-debug', label: 'Floor Gen', enabled: true, tag: 'Debug' },
]

export function MainMenu({ hasSaves, ...a }: MainMenuActions & { hasSaves: boolean }) {
  const actions: Record<string, (() => void) | undefined> = {
    continue: a.onContinue,
    load: a.onLoad,
    new: a.onNewGame,
    sandbox: a.onSandbox,
    'floor-debug': a.onOpenFloorDebug,
  }
  const ITEMS = menuItems(hasSaves)
  // Start on Continue when there's something to continue, otherwise New Game.
  const [selected, setSelected] = useState(hasSaves ? 0 : 2)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 's') {
        e.preventDefault()
        setSelected((i) => (i + 1) % ITEMS.length)
      } else if (e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault()
        setSelected((i) => (i - 1 + ITEMS.length) % ITEMS.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ITEMS.length])

  useEffect(() => {
    buttons.current[selected]?.focus()
  }, [selected])

  return (
    <main className="relative flex h-full flex-col items-center justify-center px-4">
      <Backdrop />

      <div className="relative flex w-full max-w-md flex-col items-center">
        <p className="mb-3 text-xs tracking-[0.5em] text-dim uppercase">Working title</p>
        <h1 className="text-center font-display text-4xl font-black tracking-[0.1em] text-text uppercase drop-shadow-[0_2px_18px_rgba(0,0,0,0.9)] sm:text-6xl">
          Roguelike
          <span className="block text-ember drop-shadow-[0_0_22px_rgba(217,163,91,0.35)]">Soulslike</span>
        </h1>
        <div className="mt-6 flex items-center gap-3 text-ember/80" aria-hidden>
          <span className="h-px w-20 bg-gradient-to-r from-transparent to-ember/70" />
          <span className="text-[0.6rem]">◆</span>
          <span className="h-px w-20 bg-gradient-to-l from-transparent to-ember/70" />
        </div>

        <nav className="mt-12 flex w-full max-w-xs flex-col gap-3" aria-label="Main menu">
          {ITEMS.map((item, i) => {
            const active = i === selected
            return (
              <button
                key={item.id}
                ref={(el) => {
                  buttons.current[i] = el
                }}
                type="button"
                aria-disabled={!item.enabled}
                onClick={item.enabled ? actions[item.id] : undefined}
                onMouseEnter={() => setSelected(i)}
                onFocus={() => setSelected(i)}
                className={[
                  'group relative flex items-center justify-between border px-5 py-3 text-left font-display text-base font-bold tracking-[0.22em] uppercase transition-colors outline-none',
                  'shadow-[inset_0_0_0_3px_var(--color-void),inset_0_0_0_4px_rgba(217,163,91,0.14)]',
                  !item.enabled
                    ? 'border-line/60 bg-hull/70 text-text/35'
                    : active
                      ? 'border-ember bg-panel/95 text-ember'
                      : 'border-line bg-hull/85 text-text/85',
                ].join(' ')}
              >
                <span className="flex items-center gap-3">
                  <span className={`text-[0.6rem] ${active && item.enabled ? 'text-ember' : 'text-transparent'}`}>◆</span>
                  {item.label}
                </span>
                {(item.tag || !item.enabled) && (
                  <span className={`text-[0.6rem] tracking-[0.25em] ${item.tag ? 'text-blood/80' : 'text-dim'}`}>
                    {item.tag ?? 'Sealed'}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 flex justify-between px-4 text-[0.65rem] tracking-[0.3em] text-dim uppercase">
        <span>Build {__BUILD_ID__}</span>
        <span className="hidden sm:inline">↑ ↓ to navigate</span>
      </footer>
    </main>
  )
}
