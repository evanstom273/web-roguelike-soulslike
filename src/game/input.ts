// Shared input state. Keyboard/mouse (in the Phaser scene) and the touch overlay
// (in React) both write into it; the player reads the merged result each frame.

export type ActionButton = 'light' | 'heavy' | 'roll' | 'art'

export class InputState {
  // Touch joystick vector, length 0..1.
  touchMove = { x: 0, y: 0 }

  setTouchMove(x: number, y: number) {
    this.touchMove = { x, y }
  }
  private touchHeld = new Set<ActionButton>()
  private touchPressed = new Set<ActionButton>()

  pressTouch(button: ActionButton) {
    if (!this.touchHeld.has(button)) this.touchPressed.add(button)
    this.touchHeld.add(button)
  }

  releaseTouch(button: ActionButton) {
    this.touchHeld.delete(button)
  }

  isTouchHeld(button: ActionButton) {
    return this.touchHeld.has(button)
  }

  // Presses since the last frame; cleared once read.
  takeTouchPresses(): Set<ActionButton> {
    const pressed = this.touchPressed
    this.touchPressed = new Set()
    return pressed
  }
}
