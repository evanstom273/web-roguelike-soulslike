import { ATTRIBUTE_IDS, ATTRIBUTES, characterLevel } from '../data/attributes.ts'
import { SHARD_NAME } from '../data/progression.ts'
import type { Loadout } from '../player/character.ts'
import type { HeldStatus } from '../player/Player.ts'
import type { RunStatus } from '../RunScene.ts'
import { biomeForFloor } from '../world/biomes.ts'
import { formatPlayTime } from '../../storage/saves.ts'

// The in-run status screen: level and attributes, what they come to, what you're holding
// and how hard it hits, your spells' charges, and how the run is going. The game is paused
// while it's open.

export function StatusScreen({ loadout, status, floor, onClose }: { loadout: Loadout; status: RunStatus; floor: number; onClose: () => void }) {
  const { levels, stats } = loadout
  return (
    <div className="absolute inset-0 overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold tracking-[0.18em] text-text uppercase">Status</h2>
          <button
            type="button"
            onClick={onClose}
            className="border border-line bg-hull/90 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.2em] text-text uppercase hover:border-ember hover:text-ember"
          >
            Close
          </button>
        </div>

        <section className="grid grid-cols-2 gap-x-6 gap-y-1 border border-line bg-hull/90 p-4 text-sm sm:grid-cols-3">
          <Fact name="Level" value={characterLevel(levels)} />
          <Fact name="Runes" value={status.runes} />
          <Fact name={`${SHARD_NAME}s`} value={status.shards} note="found this run" />
          <Fact name="Floor" value={floor} note={biomeForFloor(floor).name} />
          <Fact name="Run time" value={formatPlayTime(status.runTime)} />
        </section>

        <section className="border border-line bg-hull/90 p-4">
          <h3 className="text-[0.65rem] tracking-[0.25em] text-dim uppercase">Attributes</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {ATTRIBUTE_IDS.map((id) => (
              <div key={id} className="flex justify-between">
                <dt className="tracking-[0.12em] text-dim uppercase">{ATTRIBUTES[id].name}</dt>
                <dd className="font-semibold text-text tabular-nums">{levels[id]}</dd>
              </div>
            ))}
          </dl>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line pt-3 text-sm sm:grid-cols-3">
            <Fact name="HP" value={`${Math.ceil(status.hp)} / ${status.maxHp}`} />
            <Fact name="Stamina" value={Math.round(status.maxStamina)} />
            <Fact name="Extra spell charges" value={stats.extraSpellCharges} />
            <Fact name="Loot luck" value={`×${stats.lootLuck.toFixed(2)}`} />
          </dl>
        </section>

        <section className="border border-line bg-hull/90 p-4">
          <h3 className="text-[0.65rem] tracking-[0.25em] text-dim uppercase">Equipment</h3>
          <Held hand="Right" held={status.right} />
          <Held hand="Left" held={status.left} />
          <p className="mt-2 text-xs text-dim">Attack ratings are before the target's defences.</p>
        </section>

        <section className="border border-line bg-hull/90 p-4">
          <h3 className="text-[0.65rem] tracking-[0.25em] text-dim uppercase">Spells</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {status.spells.map((sp) => (
              <li key={sp.name} className={`flex justify-between gap-3 ${sp.castable ? 'text-text' : 'text-dim'}`}>
                <span>
                  {sp.name}
                  {!sp.castable && <span className="ml-2 text-xs">(needs a catalyst in hand)</span>}
                </span>
                <span className="tabular-nums">{sp.basic ? '∞' : `${sp.left} / ${sp.max}`}</span>
              </li>
            ))}
            {status.spells.length === 0 && <li className="text-dim">None</li>}
          </ul>
        </section>

        {status.effects.length > 0 && (
          <section className="border border-line bg-hull/90 p-4">
            <h3 className="text-[0.65rem] tracking-[0.25em] text-dim uppercase">Effects</h3>
            <p className="mt-2 text-sm text-text">{status.effects.join(' · ')}</p>
          </section>
        )}
      </div>
    </div>
  )
}

function Fact({ name, value, note }: { name: string; value: string | number; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="tracking-[0.12em] text-dim uppercase">{name}</span>
      <span className="text-right font-semibold text-text tabular-nums">
        {value}
        {note && <span className="ml-1 text-xs font-normal text-dim">{note}</span>}
      </span>
    </div>
  )
}

function Held({ hand, held }: { hand: string; held: HeldStatus | null }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line/60 pb-2 text-sm last-of-type:border-0">
      <span>
        <span className="mr-2 text-[0.6rem] tracking-[0.2em] text-dim uppercase">{hand}</span>
        <span className="text-text">{held ? `${held.name} +${held.upgrade}` : 'Empty'}</span>
        {held && !held.usable && <span className="ml-2 text-xs text-blood">Requirements not met</span>}
      </span>
      {held && (
        <span className="text-xs tracking-[0.12em] text-dim uppercase">
          {held.spellPower !== null ? (
            <>
              Spell power <span className="text-text tabular-nums">{held.spellPower}%</span>
            </>
          ) : (
            <>
              Light <span className="text-text tabular-nums">{held.light}</span> · Heavy <span className="text-text tabular-nums">{held.heavy}</span>
            </>
          )}
        </span>
      )}
    </div>
  )
}
