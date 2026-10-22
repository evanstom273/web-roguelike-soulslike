// Values the React HUD shows, published by the game scene. Only notifies when
// something visible changed, so React isn't re-rendering every frame for nothing.

export interface HudState {
  hp: number
  maxHp: number
  fp: number
  maxFp: number
  stamina: number
  maxStamina: number
  runes: number
  charge: number // 0..1 while charging a heavy attack
  notice: string | null // short message, e.g. pressing weapon art with no skill
}

export class HudStore {
  private state: HudState = {
    hp: 0,
    maxHp: 1,
    fp: 0,
    maxFp: 1,
    stamina: 0,
    maxStamina: 1,
    runes: 0,
    charge: 0,
    notice: null,
  }
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  update(next: HudState) {
    const prev = this.state
    const changed = (Object.keys(next) as (keyof HudState)[]).some((k) => {
      const a = prev[k]
      const b = next[k]
      const epsilon = k === 'charge' ? 0.02 : 0.25
      return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > epsilon : a !== b
    })
    if (!changed) return
    this.state = next
    for (const l of this.listeners) l()
  }
}
