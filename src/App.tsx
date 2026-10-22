import { useState } from 'react'
import { FloorDebug } from './debug/FloorDebug.tsx'
import { MainMenu } from './menu/MainMenu.tsx'

type Screen = 'menu' | 'floor-debug'

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')

  if (screen === 'floor-debug') return <FloorDebug onBack={() => setScreen('menu')} />
  return <MainMenu onOpenFloorDebug={() => setScreen('floor-debug')} />
}
