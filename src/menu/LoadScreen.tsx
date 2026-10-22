import { useEffect, useState } from 'react'
import { characterLevel } from '../game/data/attributes.ts'
import { CLASSES } from '../game/data/classes.ts'
import { deleteSave, formatPlayTime, listSaves, type Save } from '../storage/saves.ts'
import { MenuFrame, panelClip } from './MenuFrame.tsx'

// Every save, most recently played first, with play time, level and floor.

const playedOn = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function LoadScreen({ onLoad, onBack }: { onLoad: (save: Save) => void; onBack: () => void }) {
  const [saves, setSaves] = useState<Save[] | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    void listSaves().then((s) => live && setSaves(s))
    return () => {
      live = false
    }
  }, [])

  const remove = async (id: number) => {
    await deleteSave(id)
    setConfirming(null)
    setSaves(await listSaves())
  }

  return (
    <MenuFrame title="Load" onBack={onBack}>
      {saves === null ? (
        <p className="text-center text-xs tracking-[0.4em] text-dim uppercase">Loading</p>
      ) : saves.length === 0 ? (
        <p className="text-center text-xs tracking-[0.3em] text-dim uppercase">No saves yet</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {saves.map((save, i) => {
            const cls = CLASSES.find((c) => c.id === save.classId)
            return (
              <li key={save.id} className={`${panelClip} flex items-stretch border border-line bg-hull/80 focus-within:border-neon hover:border-neon`}>
                <button type="button" autoFocus={i === 0} onClick={() => onLoad(save)} className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 text-left outline-none">
                  <span className="min-w-28 font-display text-lg font-bold tracking-[0.15em] text-text uppercase">{cls?.name ?? save.classId}</span>
                  <span className="text-sm tracking-[0.15em] text-dim uppercase">
                    Level <span className="font-semibold text-text tabular-nums">{characterLevel(save.character.levels)}</span>
                  </span>
                  <span className="text-sm tracking-[0.15em] text-dim uppercase">
                    Floor <span className="font-semibold text-text tabular-nums">{save.floor}</span>
                  </span>
                  <span className="font-semibold text-neon tabular-nums">{formatPlayTime(save.playTime)}</span>
                  <span className="w-full text-[0.6rem] tracking-[0.2em] text-dim uppercase sm:ml-auto sm:w-auto">{playedOn(save.updatedAt)}</span>
                </button>
                {confirming === save.id ? (
                  <div className="flex items-center gap-2 pr-4">
                    <button type="button" onClick={() => void remove(save.id)} className="border border-hazard px-2 py-1 text-[0.6rem] font-semibold tracking-[0.2em] text-hazard uppercase">
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="px-2 py-1 text-[0.6rem] tracking-[0.2em] text-dim uppercase hover:text-text">
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="Delete save"
                    onClick={() => setConfirming(save.id)}
                    className="px-4 text-[0.6rem] tracking-[0.2em] text-dim uppercase hover:text-hazard"
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </MenuFrame>
  )
}
