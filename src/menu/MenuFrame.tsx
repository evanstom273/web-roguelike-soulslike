import { useEffect, type ReactNode } from 'react'
import { Starfield } from './Starfield.tsx'

// Shared shell for the sub-menus (load, new game): backdrop, title, back button, Esc to go back.

export const panelClip = '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]'

export function MenuFrame({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <main className="relative flex h-full flex-col items-center overflow-y-auto px-4 py-8">
      <Starfield />
      <div className="relative flex w-full max-w-3xl flex-col">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-extrabold tracking-[0.18em] text-text uppercase sm:text-3xl">{title}</h1>
          <button
            type="button"
            onClick={onBack}
            className="border border-line bg-hull/80 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-neon hover:text-neon"
          >
            Back
          </button>
        </div>
        {children}
      </div>
    </main>
  )
}
