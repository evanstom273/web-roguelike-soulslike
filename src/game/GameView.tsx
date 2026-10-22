import * as Phaser from 'phaser'
import { useEffect, useMemo, useRef } from 'react'
import { addPlayTime } from '../storage/saves.ts'
import { HudStore } from './hudStore.ts'
import { InputState } from './input.ts'
import { resolveLoadout, type Character } from './player/character.ts'
import { RunScene, type RunSceneData } from './RunScene.ts'
import { biomeForFloor } from './world/biomes.ts'
import { Hud } from './ui/Hud.tsx'
import { TouchControls } from './ui/TouchControls.tsx'

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches

/** `saveId` null = sandbox: nothing is recorded. */
export function GameView({
  seed,
  floor,
  character,
  saveId,
  onQuit,
  onSandboxDepth,
}: {
  seed: string
  floor: number
  character: Character
  saveId: number | null
  onQuit: () => void
  /** Sandbox only: jump to the next biome. */
  onSandboxDepth?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const loadout = useMemo(() => resolveLoadout(character), [character])
  const input = useMemo(() => new InputState(), [])
  const hud = useMemo(() => new HudStore(), [])
  const touch = useMemo(() => isTouchDevice(), [])

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      backgroundColor: '#0a0907',
      scale: { mode: Phaser.Scale.RESIZE },
      banner: false,
    })
    const data: RunSceneData = { seed, floor, loadout, input, hud }
    game.scene.add('run', RunScene, true, data)
    return () => game.destroy(true)
  }, [seed, floor, loadout, input, hud])

  usePlayTime(saveId)

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
      {touch && <TouchControls input={input} />}
      {/* Above the touch layer: it only catches touches on the tappable cross slots. */}
      <Hud store={hud} touch={touch} input={input} />

      <div className={`absolute right-4 flex items-center gap-3 ${touch ? 'top-14' : 'top-4'}`}>
        <span className="text-[0.6rem] tracking-[0.25em] text-dim uppercase">
          {biomeForFloor(floor).name} · Floor {floor}
        </span>
        {onSandboxDepth && (
          <button
            type="button"
            onClick={onSandboxDepth}
            className="border border-line bg-hull/80 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
          >
            Deeper
          </button>
        )}
        <button
          type="button"
          onClick={onQuit}
          className="border border-line bg-hull/80 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
        >
          Quit
        </button>
      </div>

      {!touch && (
        <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[0.6rem] tracking-[0.2em] text-dim uppercase">
          WASD move · Space roll (hold to sprint) · J / LMB light or cast · K / RMB heavy (hold to charge) · U left hand · L / F skill · Tab / MMB hold: lock on/off, tap: switch target · E / R right / left weapon · Q spell · Esc quit
        </p>
      )}
    </main>
  )
}

/**
 * Counts time spent in the run while the page is visible, writing it to the save every
 * 10 seconds and when the run ends or the page is hidden or closed.
 */
function usePlayTime(saveId: number | null) {
  useEffect(() => {
    if (saveId === null) return
    let pending = 0
    let last = performance.now()
    let visible = !document.hidden
    const tick = () => {
      const now = performance.now()
      if (visible) pending += Math.min(now - last, 2000) / 1000 // a stalled tab doesn't count
      last = now
    }
    const flush = () => {
      tick()
      const seconds = pending
      pending = 0
      void addPlayTime(saveId, seconds)
    }
    const onVisibility = () => {
      tick()
      visible = !document.hidden
      if (!visible) flush()
    }
    const ticker = window.setInterval(tick, 1000)
    const saver = window.setInterval(flush, 10_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      window.clearInterval(ticker)
      window.clearInterval(saver)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [saveId])
}
