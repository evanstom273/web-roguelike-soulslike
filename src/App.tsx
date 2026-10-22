import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { FloorDebug } from './debug/FloorDebug.tsx'
import { CLASSES } from './game/data/classes.ts'
import { sandboxCharacter, upgradeCharacter, type Character } from './game/player/character.ts'
import { randomSeed } from './game/random.ts'
import type { RunProgress } from './game/RunScene.ts'
import { BIOMES, biomeForFloor } from './game/world/biomes.ts'
import { ClassSelect } from './menu/ClassSelect.tsx'
import { DeathScreen, type NextRun } from './menu/DeathScreen.tsx'
import { LoadScreen } from './menu/LoadScreen.tsx'
import { MainMenu } from './menu/MainMenu.tsx'
import { createSave, latestSave, updateSave, type Save } from './storage/saves.ts'

// Phaser is big, so it only loads once a run starts.
const GameView = lazy(() => import('./game/GameView.tsx').then((m) => ({ default: m.GameView })))

/** A run in progress. saveId null = sandbox: owns everything, nothing is saved. */
interface Run {
  saveId: number | null
  character: Character
  seed: string
  floor: number
  runes: number // carried
  runTime: number // seconds since the run began
  deepest: number // deepest floor whose way down was taken
}

type Screen =
  | { name: 'menu' }
  | { name: 'load' }
  | { name: 'new' }
  | { name: 'floor-debug' }
  | ({ name: 'run' } & Run)
  | ({ name: 'death' } & Run) // after dying: spend the runes, then the next run

// Older saves get any fields added since filled in. A save that died goes straight back
// to the post-death screen.
const screenFor = (save: Save): Screen => ({
  name: save.dead ? 'death' : 'run',
  saveId: save.id,
  character: upgradeCharacter(save.character, save.classId),
  seed: save.seed,
  floor: save.floor,
  runes: save.runes,
  runTime: save.runTime ?? 0,
  deepest: save.deepestFloorCleared,
})

/** The run's character with the shards found so far added. */
const withShards = (run: Run, p: RunProgress): Character => ({ ...run.character, shards: run.character.shards + p.shards })

const runOf = (s: Run): Run => ({
  saveId: s.saveId,
  character: s.character,
  seed: s.seed,
  floor: s.floor,
  runes: s.runes,
  runTime: s.runTime,
  deepest: s.deepest,
})

/** First floor of the biome after this one, wrapping back to the surface. */
function nextBiomeFloor(floor: number) {
  const i = BIOMES.indexOf(biomeForFloor(floor))
  return BIOMES[(i + 1) % BIOMES.length].fromFloor
}

/** The next class's look, for trying them all in the sandbox. */
function nextLook(look: string) {
  const i = CLASSES.findIndex((c) => c.id === look)
  return CLASSES[(i + 1) % CLASSES.length].id
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' })
  const [latest, setLatest] = useState<Save | null | undefined>(undefined)
  const toMenu = useCallback(() => setScreen({ name: 'menu' }), [])

  // Re-check saves whenever the main menu comes back, so Continue picks up the last run.
  useEffect(() => {
    if (screen.name !== 'menu') return
    let live = true
    void latestSave().then((s) => live && setLatest(s ?? null))
    return () => {
      live = false
    }
  }, [screen.name])

  if (screen.name === 'floor-debug') return <FloorDebug onBack={toMenu} />
  if (screen.name === 'load') return <LoadScreen onLoad={(s) => setScreen(screenFor(s))} onBack={toMenu} />
  if (screen.name === 'new') return <ClassSelect onPick={(cls) => void createSave(cls).then((s) => setScreen(screenFor(s)))} onBack={toMenu} />
  if (screen.name === 'death') {
    const run = runOf(screen)
    // Leaving the post-death screen: unspent runes are gone and a fresh run begins.
    const begin = (next: NextRun) => {
      const fresh: Run = { ...run, character: next.character, floor: next.startFloor, seed: randomSeed(), runes: 0, runTime: 0 }
      if (run.saveId !== null) {
        void updateSave(run.saveId, { character: fresh.character, floor: fresh.floor, seed: fresh.seed, runes: 0, runTime: 0, dead: false })
      }
      setScreen({ name: 'run', ...fresh })
    }
    return <DeathScreen key={run.seed} character={run.character} runes={run.runes} deepestFloorCleared={run.deepest} onBegin={begin} />
  }
  if (screen.name === 'run') {
    const run = runOf(screen)
    const save = (p: RunProgress, dead: boolean) => {
      if (run.saveId !== null) void updateSave(run.saveId, { runes: p.runes, runTime: p.runTime, character: withShards(run, p), dead })
    }
    const died = (p: RunProgress) => setScreen({ name: 'death', ...run, runes: p.runes, runTime: p.runTime, character: withShards(run, p) })
    const descend = (p: RunProgress) => {
      const next: Run = { ...run, floor: run.floor + 1, seed: randomSeed(), runes: p.runes, runTime: p.runTime, deepest: Math.max(run.deepest, run.floor), character: withShards(run, p) }
      if (run.saveId !== null) {
        void updateSave(run.saveId, { floor: next.floor, seed: next.seed, runes: next.runes, runTime: next.runTime, deepestFloorCleared: next.deepest, character: next.character })
      }
      setScreen({ name: 'run', ...next })
    }
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-xs tracking-[0.4em] text-dim uppercase">Loading</div>}>
        <GameView
          key={run.seed}
          seed={run.seed}
          floor={run.floor}
          character={run.character}
          saveId={run.saveId}
          runes={run.runes}
          runTime={run.runTime}
          onProgress={save}
          onDied={died}
          onDescend={descend}
          onQuit={toMenu}
          // Sandbox: step through the biomes (surface, underground, depths) on fresh floors.
          onSandboxDepth={run.saveId === null ? () => setScreen({ name: 'run', ...run, seed: randomSeed(), floor: nextBiomeFloor(run.floor) }) : undefined}
          onSandboxLook={run.saveId === null ? () => setScreen({ name: 'run', ...run, character: { ...run.character, appearance: nextLook(run.character.appearance) } }) : undefined}
        />
      </Suspense>
    )
  }
  // Wait for the save check (a few ms) so the menu opens on the right item.
  if (latest === undefined) return null
  return (
    <MainMenu
      key={latest ? 'saves' : 'none'}
      hasSaves={latest !== null}
      onContinue={() => latest && setScreen(screenFor(latest))}
      onLoad={() => setScreen({ name: 'load' })}
      onNewGame={() => setScreen({ name: 'new' })}
      onSandbox={() => setScreen({ name: 'run', saveId: null, character: sandboxCharacter(), seed: randomSeed(), floor: 1, runes: 0, runTime: 0, deepest: 0 })}
      onOpenFloorDebug={() => setScreen({ name: 'floor-debug' })}
    />
  )
}
