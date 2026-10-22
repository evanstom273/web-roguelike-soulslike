import { useMemo, useState } from 'react'
import { ATTRIBUTE_IDS, ATTRIBUTES, characterLevel, deriveStats, type AttributeId, type AttributeLevels } from '../game/data/attributes.ts'
import { totalDamage } from '../game/data/damage.ts'
import { spellPrice, weaponPrice } from '../game/data/prices.ts'
import { checkpointCost, levelCost, MAX_UPGRADE, SHARD_NAME, upgradeCost, upgradeShards } from '../game/data/progression.ts'
import { getStatus, getWeapon, SPELLS, WEAPONS } from '../game/data/registry.ts'
import type { Requirements, Scaling, SpellDef, WeaponDef } from '../game/data/types.ts'
import type { Character } from '../game/player/character.ts'
import { biomeForFloor } from '../game/world/biomes.ts'
import { Backdrop } from './Backdrop.tsx'
import { panel } from './MenuFrame.tsx'

// After death: spend the runes you were carrying on levels, weapon upgrades, new weapons
// and spells, or a checkpoint start for the next run. Whatever isn't spent is lost when
// you leave.
// Nothing is bought until you leave, so every choice here can be taken back.

const ATTRIBUTE_CAP = 99

type Tab = 'levels' | 'upgrade' | 'shop' | 'loadout' | 'checkpoint'

export interface NextRun {
  character: Character
  startFloor: number
}

/** Runes for every level from `from` up to (not including) `to`. */
const levelsCost = (from: number, to: number) => {
  let total = 0
  for (let l = from; l < to; l++) total += levelCost(l)
  return total
}

/** Runes and shards to take a weapon from one upgrade level to another. */
const upgradesCost = (from: number, to: number) => {
  let runes = 0
  let shards = 0
  for (let n = from + 1; n <= to; n++) {
    runes += upgradeCost(n)
    shards += upgradeShards(n)
  }
  return { runes, shards }
}

export function DeathScreen({
  character,
  runes,
  deepestFloorCleared,
  onBegin,
}: {
  character: Character
  runes: number
  deepestFloorCleared: number
  onBegin: (next: NextRun) => void
}) {
  const [tab, setTab] = useState<Tab>('levels')
  const [levels, setLevels] = useState<AttributeLevels>(character.levels)
  const [upgrades, setUpgrades] = useState<Record<string, number>>(character.weaponLevels)
  const [startFloor, setStartFloor] = useState(1)
  const [boughtWeapons, setBoughtWeapons] = useState<string[]>([])
  const [boughtSpells, setBoughtSpells] = useState<string[]>([])
  const [right, setRight] = useState(character.right)
  const [left, setLeft] = useState<string | null>(character.left)
  const [confirming, setConfirming] = useState(false)

  const baseLevel = characterLevel(character.levels)
  const level = characterLevel(levels)
  const levelSpend = levelsCost(baseLevel, level)
  const owned = [...character.weaponIds, ...boughtWeapons]
  const upgradeSpend = useMemo(() => {
    let runes = 0
    let shards = 0
    for (const id of [...character.weaponIds, ...boughtWeapons]) {
      const c = upgradesCost(character.weaponLevels[id] ?? 0, upgrades[id] ?? 0)
      runes += c.runes
      shards += c.shards
    }
    return { runes, shards }
  }, [character, upgrades, boughtWeapons])
  const checkpointSpend = startFloor > 1 ? checkpointCost(startFloor) : 0
  const shopSpend = boughtWeapons.reduce((t, id) => t + weaponPrice(getWeapon(id)), 0) + boughtSpells.reduce((t, id) => t + spellPrice(SPELLS.get(id)!), 0)
  const runesLeft = runes - levelSpend - upgradeSpend.runes - checkpointSpend - shopSpend
  const shardsLeft = character.shards - upgradeSpend.shards

  const before = deriveStats(character.levels)
  const after = deriveStats(levels)

  const raise = (id: AttributeId) => {
    if (levels[id] >= ATTRIBUTE_CAP || levelCost(level) > runesLeft) return
    setLevels({ ...levels, [id]: levels[id] + 1 })
    setConfirming(false)
  }
  const lower = (id: AttributeId) => {
    if (levels[id] <= character.levels[id]) return
    setLevels({ ...levels, [id]: levels[id] - 1 })
    setConfirming(false)
  }
  const upgrade = (id: string) => {
    const next = (upgrades[id] ?? 0) + 1
    if (next > MAX_UPGRADE || upgradeCost(next) > runesLeft || upgradeShards(next) > shardsLeft) return
    setUpgrades({ ...upgrades, [id]: next })
    setConfirming(false)
  }
  const downgrade = (id: string) => {
    if ((upgrades[id] ?? 0) <= (character.weaponLevels[id] ?? 0)) return
    setUpgrades({ ...upgrades, [id]: (upgrades[id] ?? 0) - 1 })
    setConfirming(false)
  }
  const buyWeapon = (w: WeaponDef) => {
    if (boughtWeapons.includes(w.id)) {
      // Taking a purchase back also takes back any upgrades made to it, and unequips it.
      setBoughtWeapons(boughtWeapons.filter((id) => id !== w.id))
      setUpgrades(Object.fromEntries(Object.entries(upgrades).filter(([id]) => id !== w.id)))
      if (right === w.id) setRight(character.right)
      if (left === w.id) setLeft(character.left)
    } else if (weaponPrice(w) <= runesLeft) {
      setBoughtWeapons([...boughtWeapons, w.id])
    }
    setConfirming(false)
  }
  const buySpell = (sp: SpellDef) => {
    if (boughtSpells.includes(sp.id)) setBoughtSpells(boughtSpells.filter((id) => id !== sp.id))
    else if (spellPrice(sp) <= runesLeft) setBoughtSpells([...boughtSpells, sp.id])
    setConfirming(false)
  }
  const chooseStart = (floor: number) => {
    // Swapping one checkpoint for another refunds the first.
    if (floor > 1 && checkpointCost(floor) > runesLeft + checkpointSpend) return
    setStartFloor(floor)
    setConfirming(false)
  }

  const begin = () => {
    if (runesLeft > 0 && !confirming) return setConfirming(true)
    onBegin({
      character: {
        ...character,
        levels,
        weaponIds: owned,
        right,
        left,
        spellIds: [...character.spellIds, ...boughtSpells],
        weaponLevels: Object.fromEntries(Object.entries(upgrades).filter(([, l]) => l > 0)),
        shards: shardsLeft,
      },
      startFloor,
    })
  }

  const floors = Array.from({ length: deepestFloorCleared + 1 }, (_, i) => i + 1)
  const forSaleWeapons = [...WEAPONS.values()].filter((w) => !character.weaponIds.includes(w.id)).sort((a, b) => weaponPrice(a) - weaponPrice(b))
  const forSaleSpells = [...SPELLS.values()].filter((sp) => !sp.basic && !character.spellIds.includes(sp.id)).sort((a, b) => spellPrice(a) - spellPrice(b))

  // Runes, tabs and the begin button stay on screen; long lists scroll in their panel.
  return (
    <main className="relative h-full overflow-hidden">
      <Backdrop />
      <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6">
        <h1 className="font-display text-2xl font-bold tracking-[0.18em] text-text uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-3xl">Spend your runes</h1>
        <p className="mt-2 text-[0.65rem] tracking-[0.25em] text-dim uppercase">Whatever you don't spend is lost when the next run begins.</p>

        <div className={`${panel} mt-6 flex flex-wrap items-center justify-between gap-3 border border-line bg-hull/90 px-4 py-3`}>
          <Runes amount={runesLeft} of={runes} />
          <span className="text-xs tracking-[0.2em] text-dim uppercase">
            {SHARD_NAME}s <span className="text-text tabular-nums">{shardsLeft}</span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1">
          {(
            [
              ['levels', 'Level up'],
              ['upgrade', 'Upgrade'],
              ['shop', 'Shop'],
              ['loadout', 'Loadout'],
              ['checkpoint', 'Start'],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border px-0.5 py-2 text-[0.55rem] font-semibold tracking-[0.08em] uppercase sm:text-[0.65rem] sm:tracking-[0.18em] ${tab === id ? 'border-ember bg-panel text-ember' : 'border-line bg-hull/90 text-text hover:border-ember/60'}`}
            >
              {name}
            </button>
          ))}
        </div>

        <section className={`${panel} mt-3 min-h-0 overflow-y-auto overscroll-contain border border-line bg-hull/90 p-4`}>
          {tab === 'levels' && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-lg tracking-[0.15em] text-text uppercase">
                  Level <span className="tabular-nums">{baseLevel}</span>
                  {level > baseLevel && <span className="text-ember tabular-nums"> → {level}</span>}
                </span>
                <span className="text-xs tracking-[0.15em] text-dim uppercase">
                  Next level <span className={`tabular-nums ${levelCost(level) > runesLeft ? 'text-blood' : 'text-text'}`}>{levelCost(level)}</span> runes
                </span>
              </div>
              <ul className="mt-4 divide-y divide-line">
                {ATTRIBUTE_IDS.map((id) => (
                  <li key={id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm tracking-[0.12em] text-text uppercase">{ATTRIBUTES[id].name}</div>
                      <div className="truncate text-xs text-dim">{ATTRIBUTES[id].description}</div>
                    </div>
                    <span className="w-14 text-right text-sm tabular-nums">
                      {levels[id] > character.levels[id] ? <span className="text-ember">{levels[id]}</span> : <span className="text-text">{levels[id]}</span>}
                    </span>
                    <Step label={`Lower ${ATTRIBUTES[id].name}`} disabled={levels[id] <= character.levels[id]} onClick={() => lower(id)}>
                      −
                    </Step>
                    <Step label={`Raise ${ATTRIBUTES[id].name}`} disabled={levels[id] >= ATTRIBUTE_CAP || levelCost(level) > runesLeft} onClick={() => raise(id)}>
                      +
                    </Step>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs tracking-[0.15em] text-dim uppercase">
                <Derived name="HP" from={before.maxHp} to={after.maxHp} />
                <Derived name="Stamina" from={before.maxStamina} to={after.maxStamina} />
                <Derived name="Extra spell charges" from={before.extraSpellCharges} to={after.extraSpellCharges} />
              </div>
            </>
          )}

          {tab === 'upgrade' && (
            <>
              <p className="text-xs text-dim">Each level adds 8% to a weapon's damage, or to the spells a catalyst casts. Up to +{MAX_UPGRADE}.</p>
              <ul className="mt-3 divide-y divide-line">
                {owned.map((id) => {
                  const now = character.weaponLevels[id] ?? 0
                  const draft = upgrades[id] ?? 0
                  const next = draft + 1
                  const maxed = next > MAX_UPGRADE
                  const affordable = !maxed && upgradeCost(next) <= runesLeft && upgradeShards(next) <= shardsLeft
                  return (
                    <li key={id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm tracking-[0.12em] text-text uppercase">
                          {getWeapon(id).name} <span className="tabular-nums">+{now}</span>
                          {draft > now && <span className="text-ember tabular-nums"> → +{draft}</span>}
                        </div>
                        <div className="text-xs text-dim">
                          {maxed ? (
                            'Fully upgraded'
                          ) : (
                            <>
                              Next: <span className={upgradeCost(next) > runesLeft ? 'text-blood' : 'text-text'}>{upgradeCost(next)}</span> runes ·{' '}
                              <span className={upgradeShards(next) > shardsLeft ? 'text-blood' : 'text-text'}>{upgradeShards(next)}</span> {upgradeShards(next) === 1 ? 'shard' : 'shards'}
                            </>
                          )}
                        </div>
                      </div>
                      <Step label={`Undo upgrade to ${getWeapon(id).name}`} disabled={draft <= now} onClick={() => downgrade(id)}>
                        −
                      </Step>
                      <Step label={`Upgrade ${getWeapon(id).name}`} disabled={!affordable} onClick={() => upgrade(id)}>
                        +
                      </Step>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {tab === 'shop' && (
            <>
              <p className="text-xs text-dim">Anything bought is yours for good, and can be equipped from the next run on.</p>
              <h2 className="mt-4 text-[0.65rem] tracking-[0.25em] text-dim uppercase">Weapons</h2>
              <ul className="mt-1 divide-y divide-line">
                {forSaleWeapons.map((w) => (
                  <ShopRow
                    key={w.id}
                    name={w.name}
                    detail={w.catalyst ? `Catalyst · spell power ${Math.round(w.catalyst.power * 100)}% · ${scalingText(w.catalyst.scaling)}` : `${damageText(w.light.damage)} · ${scalingText(w.light.scaling)}${w.light.statuses.length ? ` · ${w.light.statuses.map((s) => getStatus(s.status).name).join(', ')}` : ''}`}
                    requirements={w.requirements}
                    levels={levels}
                    price={weaponPrice(w)}
                    bought={boughtWeapons.includes(w.id)}
                    affordable={weaponPrice(w) <= runesLeft}
                    onClick={() => buyWeapon(w)}
                  />
                ))}
                {forSaleWeapons.length === 0 && <li className="py-2 text-xs text-dim">You own every weapon.</li>}
              </ul>
              <h2 className="mt-5 text-[0.65rem] tracking-[0.25em] text-dim uppercase">Spells</h2>
              <ul className="mt-1 divide-y divide-line">
                {forSaleSpells.map((sp) => (
                  <ShopRow
                    key={sp.id}
                    name={sp.name}
                    detail={`${spellText(sp)} · ${sp.charges} charges`}
                    requirements={sp.requirements}
                    levels={levels}
                    price={spellPrice(sp)}
                    bought={boughtSpells.includes(sp.id)}
                    affordable={spellPrice(sp) <= runesLeft}
                    onClick={() => buySpell(sp)}
                  />
                ))}
                {forSaleSpells.length === 0 && <li className="py-2 text-xs text-dim">You know every spell.</li>}
              </ul>
            </>
          )}

          {tab === 'loadout' && (
            <>
              <p className="text-xs text-dim">What you start the run holding. Everything else you own can still be swapped in during the run.</p>
              {(
                [
                  ['Right hand', right, (id: string | null) => setRight(id!), left],
                  ['Left hand', left, (id: string | null) => setLeft(id), right],
                ] as const
              ).map(([hand, held, choose, other]) => (
                <div key={hand} className="mt-4">
                  <h2 className="text-[0.65rem] tracking-[0.25em] text-dim uppercase">{hand}</h2>
                  <ul className="mt-1 space-y-1">
                    {[...(hand === 'Left hand' ? [null] : []), ...owned].map((id) => {
                      const w = id ? getWeapon(id) : null
                      const inOther = id !== null && id === other
                      const unmet = w ? Object.entries(w.requirements).filter(([a, n]) => levels[a as AttributeId] < n!) : []
                      return (
                        <li key={id ?? 'empty'}>
                          <button
                            type="button"
                            disabled={inOther}
                            onClick={() => {
                              choose(id)
                              setConfirming(false)
                            }}
                            className={`flex w-full items-center justify-between gap-3 border px-3 py-2 text-left disabled:opacity-35 ${held === id ? 'border-ember bg-panel' : 'border-line bg-void/40 hover:border-ember/60'}`}
                          >
                            <span className={`text-sm tracking-[0.12em] uppercase ${held === id ? 'text-ember' : 'text-text'}`}>
                              {w ? `${w.name} +${upgrades[w.id] ?? 0}` : 'Empty'}
                            </span>
                            <span className="text-xs text-dim">
                              {inOther
                                ? `In the ${hand === 'Right hand' ? 'left' : 'right'} hand`
                                : unmet.length > 0 && <span className="text-blood">Needs {unmet.map(([a, n]) => `${ATTRIBUTES[a as AttributeId].short} ${n}`).join(', ')}</span>}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}

          {tab === 'checkpoint' && (
            <>
              <p className="text-xs text-dim">
                Pay once to begin the next run further down, at the start of a floor you've reached. {deepestFloorCleared === 0 && 'Take a way down first to open checkpoints.'}
              </p>
              <ul className="mt-3 space-y-2">
                {floors.map((f) => {
                  const cost = f > 1 ? checkpointCost(f) : 0
                  const chosen = startFloor === f
                  const affordable = cost <= runesLeft + checkpointSpend
                  return (
                    <li key={f}>
                      <button
                        type="button"
                        onClick={() => chooseStart(f)}
                        disabled={!affordable}
                        className={`flex w-full items-center justify-between gap-3 border px-3 py-2 text-left disabled:opacity-40 ${chosen ? 'border-ember bg-panel' : 'border-line bg-void/40 hover:border-ember/60'}`}
                      >
                        <span className="text-sm tracking-[0.12em] uppercase">
                          <span className={chosen ? 'text-ember' : 'text-text'}>Floor {f}</span> <span className="text-xs text-dim">· {biomeForFloor(f).name}</span>
                        </span>
                        <span className="text-xs tracking-[0.15em] text-dim uppercase">{cost === 0 ? 'Free' : <span className="tabular-nums text-text">{cost} runes</span>}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <div className="mt-4 flex shrink-0 flex-col items-center gap-2">
          <button
            type="button"
            onClick={begin}
            className="border border-ember bg-panel px-6 py-3 font-display text-sm font-bold tracking-[0.25em] text-ember uppercase hover:bg-ember hover:text-void"
          >
            {confirming ? `Lose ${runesLeft} runes and begin` : `Begin at floor ${startFloor}`}
          </button>
          {confirming && <p className="text-[0.65rem] tracking-[0.2em] text-dim uppercase">You still have runes to spend. Tap again to leave them.</p>}
        </div>
      </div>
    </main>
  )
}

function Runes({ amount, of }: { amount: number; of: number }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
        <path d="M10 1 L16 10 L10 19 L4 10 Z" fill="none" stroke="#d8c690" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.2" fill="#d8c690" />
      </svg>
      <span className="font-ui text-base tracking-[0.15em] text-[#e9dfc0] tabular-nums">{amount}</span>
      {amount !== of && <span className="text-xs text-dim tabular-nums">of {of}</span>}
    </span>
  )
}

function Step({ children, label, disabled, onClick }: { children: string; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-9 shrink-0 border border-line bg-void/50 text-lg leading-none text-text hover:border-ember hover:text-ember disabled:opacity-30 disabled:hover:border-line disabled:hover:text-text"
    >
      {children}
    </button>
  )
}

function Derived({ name, from, to }: { name: string; from: number; to: number }) {
  return (
    <span>
      {name} <span className="text-text tabular-nums">{Math.round(from)}</span>
      {to !== from && <span className="text-ember tabular-nums"> → {Math.round(to)}</span>}
    </span>
  )
}

const TYPE_NAMES: Record<string, string> = { physical: 'Physical', magic: 'Magic', fire: 'Fire', lightning: 'Lightning', holy: 'Holy' }

const damageText = (d: Record<string, number | undefined>) =>
  Object.entries(d)
    .filter(([, n]) => n)
    .map(([t, n]) => `${TYPE_NAMES[t] ?? t} ${n}`)
    .join(' + ')

const scalingText = (s: Scaling | null) => {
  const parts = Object.entries(s ?? {})
    .filter(([, n]) => n)
    .map(([id, n]) => `${ATTRIBUTES[id as AttributeId].short} ${'★'.repeat(n!)}`)
  return parts.length ? parts.join(' ') : 'no scaling'
}

function spellText(sp: SpellDef) {
  const own = 'attack' in sp.delivery && sp.delivery.attack ? sp.delivery.attack.damage : null
  const dmg = own && totalDamage(own) > totalDamage(sp.cast.damage) ? own : sp.cast.damage
  if (totalDamage(dmg) > 0) return damageText(dmg)
  if (sp.healthRestore > 0) return `Heals ${sp.healthRestore}`
  return 'Support'
}

function ShopRow({
  name,
  detail,
  requirements,
  levels,
  price,
  bought,
  affordable,
  onClick,
}: {
  name: string
  detail: string
  requirements: Requirements
  levels: AttributeLevels
  price: number
  bought: boolean
  affordable: boolean
  onClick: () => void
}) {
  const reqs = Object.entries(requirements).filter(([, n]) => n)
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className={`text-sm tracking-[0.12em] uppercase ${bought ? 'text-ember' : 'text-text'}`}>{name}</div>
        <div className="text-xs text-dim">{detail}</div>
        {reqs.length > 0 && (
          <div className="text-xs text-dim">
            Needs{' '}
            {reqs.map(([id, n], i) => (
              <span key={id} className={levels[id as AttributeId] >= n! ? 'text-text' : 'text-blood'}>
                {i > 0 && ', '}
                {ATTRIBUTES[id as AttributeId].short} {n}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className={`text-xs tabular-nums ${bought ? 'text-ember' : affordable ? 'text-text' : 'text-blood'}`}>{price}</span>
      <button
        type="button"
        onClick={onClick}
        disabled={!bought && !affordable}
        className={`w-16 shrink-0 border px-2 py-1.5 text-[0.6rem] font-semibold tracking-[0.15em] uppercase disabled:opacity-30 ${bought ? 'border-ember text-ember hover:bg-ember/10' : 'border-line text-text hover:border-ember hover:text-ember'}`}
      >
        {bought ? 'Undo' : 'Buy'}
      </button>
    </li>
  )
}
