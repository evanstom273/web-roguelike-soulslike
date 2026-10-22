// Three-quarter (oblique) view: the ground plane is drawn as-is, 1 world px = 1 screen px,
// and height goes straight up the screen. Game logic stays on the ground plane; only
// drawing knows about height.

/** How high a hand, a held weapon or a flying spell sits above the ground. */
export const HAND_HEIGHT = 36
/** Wall height for walls you see the face of. */
export const WALL_HEIGHT = 140
/** Walls between you and the camera are kept low so they never hide you. */
export const LOW_WALL_HEIGHT = 24

/**
 * Draw order for anything standing on the ground: further down the screen is nearer the
 * camera, so it draws on top. Stays within 10..12 for any reachable y.
 */
export const standingDepth = (y: number) => 10 + Math.max(0, Math.min(2, (y + 20000) / 40000))

// Layers above and below the standing band.
export const LAYER = {
  backWall: 5, // wall faces behind everything that stands
  vfxGround: 9, // spell zones and telegraphs, on the floor under characters
  trail: 9.5,
  lowWall: 12.5, // short walls in front of characters
  light: 13,
  fx: 13.5, // swing arcs, charge glows
  vfxAir: 14,
  reticle: 15,
  overhead: 16, // health bars above heads
  text: 20,
} as const

/** The eight directions a character is drawn facing, clockwise from east. */
export type Facing8 = 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'n' | 'ne'
const FACINGS: Facing8[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']

/** The nearest of the eight drawn directions to an angle (0 = east, +pi/2 = south). */
export function facing8(angle: number) {
  const index = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
  return { facing: FACINGS[index], index, angle: (index * Math.PI) / 4 }
}
