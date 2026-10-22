import { lazy, Suspense, useState } from 'react'
import { FloorDebug } from './debug/FloorDebug.tsx'
import { randomSeed } from './game/random.ts'
import { MainMenu } from './menu/MainMenu.tsx'

// Phaser is big, so it only loads once a run starts.
const GameView = lazy(() => import('./game/GameView.tsx').then((m) => ({ default: m.GameView })))

type Screen = { name: 'menu' } | { name: 'floor-debug' } | { name: 'run'; seed: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' })
  const toMenu = () => setScreen({ name: 'menu' })

  if (screen.name === 'floor-debug') return <FloorDebug onBack={toMenu} />
  if (screen.name === 'run') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-xs tracking-[0.4em] text-dim uppercase">Loading</div>}>
        <GameView seed={screen.seed} onQuit={toMenu} />
      </Suspense>
    )
  }
  return (
    <MainMenu
      onStartRun={() => setScreen({ name: 'run', seed: randomSeed() })}
      onOpenFloorDebug={() => setScreen({ name: 'floor-debug' })}
    />
  )
}
