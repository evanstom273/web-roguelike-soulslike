import * as Phaser from 'phaser'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addPlayTime } from '../storage/saves.ts'
import { HudStore } from './hudStore.ts'
import { InputState } from './input.ts'
import { MapStore } from './mapStore.ts'
import { resolveLoadout, type Character } from './player/character.ts'
import { RunScene, type RunEvents, type RunProgress, type RunSceneData, type RunStatus } from './RunScene.ts'
import { biomeForFloor } from './world/biomes.ts'
import { Hud } from './ui/Hud.tsx'
import { MapView } from './ui/MapView.tsx'
import { StatusScreen } from './ui/StatusScreen.tsx'
import { TouchControls } from './ui/TouchControls.tsx'

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches

// After dying, the death message holds this long before the post-death screen.
const DEATH_HOLD_MS = 4200

/** `saveId` null = sandbox: nothing is recorded. */
export function GameView({
  seed,
  floor,
  character,
  saveId,
  runes,
  runTime,
  onProgress,
  onDied,
  onDescend,
  onQuit,
  onSandboxDepth,
  onSandboxLook,
}: {
  seed: string
  floor: number
  character: Character
  saveId: number | null
  /** Runes carried and seconds into the run, carried over from earlier floors. */
  runes: number
  runTime: number
  /** Worth saving: a kill, every few seconds, and the moment of death (dead = true). */
  onProgress: (p: RunProgress, dead: boolean) => void
  /** Died: shown once the death message has held for a moment. */
  onDied: (p: RunProgress) => void
  /** Took the way down to the next floor. */
  onDescend: (p: RunProgress) => void
  onQuit: () => void
  /** Sandbox only: jump to the next biome. */
  onSandboxDepth?: () => void
  /** Sandbox only: switch to the next class's look. */
  onSandboxLook?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const loadout = useMemo(() => resolveLoadout(character), [character])
  const input = useMemo(() => new InputState(), [])
  const hud = useMemo(() => new HudStore(), [])
  const map = useMemo(() => new MapStore(), [])
  const touch = useMemo(() => isTouchDevice(), [])
  const [died, setDied] = useState(false)
  // The status screen or the full map; the game is paused while either is open.
  const [overlay, setOverlay] = useState<{ kind: 'status'; status: RunStatus } | { kind: 'map' } | null>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  // The scene outlives renders, so it calls through to whatever the latest handlers are.
  const handlers = useRef({ onProgress, onDied, onDescend })
  useEffect(() => {
    handlers.current = { onProgress, onDied, onDescend }
  })
  const deathTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(deathTimer.current), [])
  const events = useMemo<RunEvents>(
    () => ({
      onProgress: (p) => handlers.current.onProgress(p, false),
      onDied: (p) => {
        handlers.current.onProgress(p, true)
        setDied(true)
        deathTimer.current = window.setTimeout(() => handlers.current.onDied(p), DEATH_HOLD_MS)
      },
      onDescend: (p) => handlers.current.onDescend(p),
    }),
    [],
  )
  // Captured once per game: changing them mid-run would restart the scene.
  const start = useRef({ runes, runTime })

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      backgroundColor: '#0a0907',
      scale: { mode: Phaser.Scale.RESIZE },
      banner: false,
    })
    const data: RunSceneData = { seed, floor, loadout, input, hud, map, sandbox: saveId === null, ...start.current, events }
    game.scene.add('run', RunScene, true, data)
    gameRef.current = game
    return () => {
      gameRef.current = null
      game.destroy(true)
    }
  }, [seed, floor, loadout, input, hud, map, saveId, events])

  usePlayTime(saveId)

  const open = (kind: 'status' | 'map') => {
    const scene = gameRef.current?.scene.getScene('run') as RunScene | undefined
    if (!scene || died) return
    scene.scene.pause()
    setOverlay(kind === 'status' ? { kind, status: scene.status() } : { kind })
  }
  const close = () => {
    ;(gameRef.current?.scene.getScene('run') as RunScene | undefined)?.scene.resume()
    setOverlay(null)
  }
  const keys = useRef({ open, close, overlay, onQuit })
  useEffect(() => {
    keys.current = { open, close, overlay, onQuit }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current
      if (e.key === 'Escape') {
        if (k.overlay) k.close()
        else k.onQuit()
      } else if (e.key === 'c' || e.key === 'm') {
        const kind = e.key === 'c' ? 'status' : 'map'
        if (k.overlay?.kind === kind) k.close()
        else if (!k.overlay) k.open(kind)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="relative h-full touch-none overflow-hidden bg-void">
      <div ref={host} className="absolute inset-0" />
      {touch && <TouchControls input={input} />}
      {/* Above the touch layer: it only catches touches on the tappable cross slots. */}
      <Hud store={hud} touch={touch} input={input} />

      {died && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35),rgba(0,0,0,0.85))] animate-[you-died_1.6s_ease-out_both]">
          <span className="font-display text-4xl font-bold tracking-[0.35em] text-blood uppercase drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)] sm:text-6xl">You died</span>
        </div>
      )}

      <div className={`absolute right-4 flex flex-col items-end gap-2 ${touch ? 'top-14' : 'top-4'}`}>
        <div className="flex items-center gap-3">
          <span className="text-[0.6rem] tracking-[0.25em] text-dim uppercase">
            {biomeForFloor(floor).name} · Floor {floor}
          </span>
          {onSandboxLook && (
            <button
              type="button"
              onClick={onSandboxLook}
              className="border border-line bg-hull/80 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
            >
              Look
            </button>
          )}
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
        <button type="button" onClick={() => open('map')} aria-label="Map" className="size-28 overflow-hidden border border-[#b9a77a]/45 bg-black/55 sm:size-32">
          <MapView store={map} />
        </button>
        <button
          type="button"
          onClick={() => open('status')}
          className="border border-line bg-hull/80 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
        >
          Status
        </button>
      </div>

      {overlay?.kind === 'status' && <StatusScreen loadout={loadout} status={overlay.status} floor={floor} onClose={close} />}
      {overlay?.kind === 'map' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-4">
          <div className="aspect-square w-full max-w-[min(90vw,80vh)] border border-[#b9a77a]/45 bg-black/60">
            <MapView store={map} full />
          </div>
          <button
            type="button"
            onClick={close}
            className="border border-line bg-hull/90 px-4 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
          >
            Close
          </button>
        </div>
      )}

      {!touch && (
        <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[0.6rem] tracking-[0.2em] text-dim uppercase">
          WASD move · Space roll (hold to sprint) · J / LMB light or cast · K / RMB heavy (hold to charge) · U left hand · L / F skill · Tab / MMB hold: lock on/off, tap: switch target · E / R right / left weapon · Q spell · C status · M map · Esc quit
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
