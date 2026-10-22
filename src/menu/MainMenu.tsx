import { useEffect, useRef, useState } from 'react'
import { Starfield } from './Starfield.tsx'

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
      <Starfield />

      <div className="relative flex w-full max-w-md flex-col items-center">
        <p className="mb-3 text-xs tracking-[0.5em] text-dim uppercase">Working title</p>
        <h1 className="text-center font-display text-3xl font-extrabold tracking-[0.12em] text-text uppercase drop-shadow-[0_0_14px_rgba(56,232,255,0.35)] sm:text-5xl animate-[flicker_7s_linear_infinite]">
          Roguelike
          <span className="block text-neon">Soulslike</span>
        </h1>
        <div className="mt-6 h-px w-48 bg-gradient-to-r from-transparent via-hazard to-transparent" />

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
                  'group relative flex items-center justify-between border px-5 py-3 text-left text-lg font-semibold tracking-[0.2em] uppercase transition-colors outline-none',
                  '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]',
                  active
                    ? 'border-neon bg-panel text-neon'
                    : 'border-line bg-hull/80 text-text/80',
                ].join(' ')}
              >
                <span className="flex items-center gap-3">
                  <span className={active ? 'text-hazard' : 'text-transparent'}>▸</span>
                  {item.label}
                </span>
                {(item.tag || !item.enabled) && (
                  <span className={`text-[0.6rem] tracking-[0.25em] ${item.tag ? 'text-hazard/80' : 'text-dim'}`}>
                    {item.tag ?? 'Offline'}
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
