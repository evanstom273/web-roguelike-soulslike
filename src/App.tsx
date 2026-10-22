import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { FloorDebug } from './debug/FloorDebug.tsx'
import { CLASSES } from './game/data/classes.ts'
import { sandboxCharacter, type Character } from './game/player/character.ts'
import { randomSeed } from './game/random.ts'
import { BIOMES, biomeForFloor } from './game/world/biomes.ts'
import { ClassSelect } from './menu/ClassSelect.tsx'
import { LoadScreen } from './menu/LoadScreen.tsx'
import { MainMenu } from './menu/MainMenu.tsx'
import { createSave, latestSave, type Save } from './storage/saves.ts'

// Phaser is big, so it only loads once a run starts.
const GameView = lazy(() => import('./game/GameView.tsx').then((m) => ({ default: m.GameView })))

type Screen =
  | { name: 'menu' }
  | { name: 'load' }
  | { name: 'new' }
  | { name: 'floor-debug' }
  // saveId null = sandbox: owns everything, nothing is saved.
  | { name: 'run'; saveId: number | null; character: Character; seed: string; floor: number }

// Saves from before characters had their own look fall back to their class.
const runFor = (save: Save): Screen => ({
  name: 'run',
  saveId: save.id,
  character: { ...save.character, appearance: save.character.appearance ?? save.classId },
  seed: save.seed,
  floor: save.floor,
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
  if (screen.name === 'load') return <LoadScreen onLoad={(s) => setScreen(runFor(s))} onBack={toMenu} />
  if (screen.name === 'new') return <ClassSelect onPick={(cls) => void createSave(cls).then((s) => setScreen(runFor(s)))} onBack={toMenu} />
  if (screen.name === 'run') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-xs tracking-[0.4em] text-dim uppercase">Loading</div>}>
        <GameView
          seed={screen.seed}
          floor={screen.floor}
          character={screen.character}
          saveId={screen.saveId}
          onQuit={toMenu}
          // Sandbox: step through the biomes (surface, underground, depths) on fresh floors.
          onSandboxDepth={screen.saveId === null ? () => setScreen({ ...screen, seed: randomSeed(), floor: nextBiomeFloor(screen.floor) }) : undefined}
          onSandboxLook={screen.saveId === null ? () => setScreen({ ...screen, character: { ...screen.character, appearance: nextLook(screen.character.appearance) } }) : undefined}
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
      onContinue={() => latest && setScreen(runFor(latest))}
      onLoad={() => setScreen({ name: 'load' })}
      onNewGame={() => setScreen({ name: 'new' })}
      onSandbox={() => setScreen({ name: 'run', saveId: null, character: sandboxCharacter(), seed: randomSeed(), floor: 1 })}
      onOpenFloorDebug={() => setScreen({ name: 'floor-debug' })}
    />
  )
}
