import * as Phaser from 'phaser'
import { useEffect, useMemo, useRef } from 'react'
import { HudStore } from './hudStore.ts'
import { InputState } from './input.ts'
import { RunScene, type RunSceneData } from './RunScene.ts'
import { Hud } from './ui/Hud.tsx'
import { TouchControls } from './ui/TouchControls.tsx'

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches

export function GameView({ seed, onQuit }: { seed: string; onQuit: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const input = useMemo(() => new InputState(), [])
  const hud = useMemo(() => new HudStore(), [])
  const touch = useMemo(() => isTouchDevice(), [])

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      backgroundColor: '#05070d',
      scale: { mode: Phaser.Scale.RESIZE },
      banner: false,
    })
    const data: RunSceneData = { seed, input, hud }
    game.scene.add('run', RunScene, true, data)
    return () => game.destroy(true)
  }, [seed, input, hud])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onQuit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onQuit])

  return (
    <main className="relative h-full touch-none overflow-hidden bg-void">
      <div ref={host} className="absolute inset-0" />
      <Hud store={hud} touch={touch} />
      {touch && <TouchControls input={input} />}

      <div className={`absolute right-4 flex items-center gap-3 ${touch ? 'top-14' : 'top-4'}`}>
        <span className="text-[0.6rem] tracking-[0.25em] text-dim uppercase">Seed {seed}</span>
        <button
          type="button"
          onClick={onQuit}
          className="border border-line bg-hull/80 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-neon hover:text-neon"
        >
          Quit
        </button>
      </div>

      {!touch && (
        <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[0.6rem] tracking-[0.2em] text-dim uppercase">
          WASD move · Space roll · J / LMB light · K / RMB heavy (hold to charge) · L / F skill · Esc quit
        </p>
      )}
    </main>
  )
}
