// Values the React HUD shows, published by the game scene. Only notifies when
// something visible changed, so React isn't re-rendering every frame for nothing.

export interface HudStatus {
  id: string
  name: string
  colour: string
  fill: number // 0..1 of the threshold
  triggered: boolean // proc'd; on cooldown before it can build again
}

export interface HudState {
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  runes: number
  charge: number // 0..1 while charging a heavy attack
  weaponId: string
  spellName: string | null // selected spell, if the weapon can cast
  spellCharges: number // -1 = unlimited (basic spell)
  skillCooldown: number // 0..1 of the cooldown remaining; -1 when the weapon has no skill
  inCombat: boolean
  statuses: HudStatus[]
  effects: string[]
  notice: string | null // short message, e.g. "No charges"
}

// Round before comparing so tiny per-frame changes don't trigger re-renders.
const signature = (s: HudState) =>
  JSON.stringify(s, (key, v) => (typeof v === 'number' ? (key === 'charge' || key === 'skillCooldown' ? Math.round(v * 50) : Math.round(v)) : v))

export class HudStore {
  private state: HudState = {
    hp: 0,
    maxHp: 1,
    stamina: 0,
    maxStamina: 1,
    runes: 0,
    charge: 0,
    weaponId: '',
    spellName: null,
    spellCharges: 0,
    skillCooldown: -1,
    inCombat: false,
    statuses: [],
    effects: [],
    notice: null,
  }
  private key = signature(this.state)
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  update(next: HudState) {
    const key = signature(next)
    if (key === this.key) return
    this.key = key
    this.state = next
    for (const l of this.listeners) l()
  }
}
