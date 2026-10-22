import { useEffect, type ReactNode } from 'react'
import { Backdrop } from './Backdrop.tsx'

// Shared shell for the sub-menus (load, new game): backdrop, title, back button, Esc to go back.

/** A stone-dark panel with a faint gilt inner edge. */
export const panel = 'shadow-[inset_0_0_0_3px_var(--color-void),inset_0_0_0_4px_rgba(217,163,91,0.14)]'

export function MenuFrame({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  // The backdrop stays put; only the content scrolls over it.
  return (
    <main className="relative h-full overflow-hidden">
      <Backdrop />
      <div className="relative flex h-full flex-col items-center overflow-y-auto px-4 py-8">
        <div className="flex w-full max-w-3xl flex-col">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h1 className="font-display text-2xl font-bold tracking-[0.18em] text-text uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-3xl">{title}</h1>
            <button
              type="button"
              onClick={onBack}
              className="border border-line bg-hull/90 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
            >
              Back
            </button>
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}
