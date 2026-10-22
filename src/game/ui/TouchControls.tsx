import { useRef, useState } from 'react'
import type { ActionButton, InputState } from '../input.ts'

const STICK_RADIUS = 56

// Floating joystick on the left half of the screen, action buttons on the right.
export function TouchControls({ input }: { input: InputState }) {
  const [stick, setStick] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null)
  const stickPointer = useRef<number | null>(null)

  const onStickDown = (e: React.PointerEvent) => {
    if (stickPointer.current !== null) return
    stickPointer.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    setStick({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0 })
  }
  const onStickMove = (e: React.PointerEvent) => {
    if (e.pointerId !== stickPointer.current || !stick) return
    let dx = e.clientX - stick.ox
    let dy = e.clientY - stick.oy
    const len = Math.hypot(dx, dy)
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS
      dy = (dy / len) * STICK_RADIUS
    }
    input.setTouchMove(dx / STICK_RADIUS, dy / STICK_RADIUS)
    setStick({ ...stick, kx: dx, ky: dy })
  }
  const onStickUp = (e: React.PointerEvent) => {
    if (e.pointerId !== stickPointer.current) return
    stickPointer.current = null
    input.setTouchMove(0, 0)
    setStick(null)
  }

  return (
    <div className="absolute inset-0 touch-none select-none">
      <div
        className="absolute inset-y-0 left-0 w-1/2"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        {stick && (
          <div
            className="pointer-events-none absolute rounded-full border border-white/20 bg-white/5"
            style={{ left: stick.ox - STICK_RADIUS, top: stick.oy - STICK_RADIUS, width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
          >
            <div
              className="absolute size-12 rounded-full border border-neon/60 bg-neon/20"
              style={{ left: STICK_RADIUS - 24 + stick.kx, top: STICK_RADIUS - 24 + stick.ky }}
            />
          </div>
        )}
      </div>

      <ActionPad input={input} button="roll" label="Roll" sub="hold: sprint" className="right-5 bottom-6 size-20" />
      <ActionPad input={input} button="light" label="Light" className="right-28 bottom-8 size-16" />
      <ActionPad input={input} button="heavy" label="Heavy" sub="hold" className="right-8 bottom-30 size-16" />
      <ActionPad input={input} button="art" label="Skill" className="right-28 bottom-28 size-12 text-[0.55rem]" />
    </div>
  )
}

function ActionPad({
  input,
  button,
  label,
  sub,
  className,
}: {
  input: InputState
  button: ActionButton
  label: string
  sub?: string
  className: string
}) {
  const [down, setDown] = useState(false)
  const press = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    input.pressTouch(button)
    setDown(true)
  }
  const release = () => {
    input.releaseTouch(button)
    setDown(false)
  }
  return (
    <button
      type="button"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute flex flex-col items-center justify-center rounded-full border text-[0.65rem] font-semibold tracking-[0.15em] uppercase transition-colors ${
        down ? 'border-neon bg-neon/25 text-neon' : 'border-white/25 bg-black/35 text-text/80'
      } ${className}`}
    >
      {label}
      {sub && <span className="text-[0.5rem] tracking-[0.1em] text-dim normal-case">{sub}</span>}
    </button>
  )
}
