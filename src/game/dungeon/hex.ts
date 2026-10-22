// Pointy-top hex grid using axial coordinates (q, r).
// Reference: https://www.redblobgames.com/grids/hexagons/

export interface Hex {
  q: number
  r: number
}

export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export const hexKey = (h: Hex) => `${h.q},${h.r}`
export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r })
export const scale = (h: Hex, k: number): Hex => ({ q: h.q * k, r: h.r * k })

// Rotates 60° clockwise around the origin.
export const rotate60 = (h: Hex): Hex => ({ q: -h.r, r: h.q + h.r })

export const distance = (a: Hex, b: Hex) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2

// Axial <-> "odd-r" offset (column, row), used to define a rectangular grid area.
export const toOffset = (h: Hex) => ({ col: h.q + (h.r - (h.r & 1)) / 2, row: h.r })
export const fromOffset = (col: number, row: number): Hex => ({ q: col - (row - (row & 1)) / 2, r: row })

// Centre of a hex in pixels, for a hex of the given circumradius.
export function hexToPixel(h: Hex, size: number) {
  return { x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r }
}

export function hexCorners(h: Hex, size: number) {
  const { x, y } = hexToPixel(h, size)
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30)
    return { x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) }
  })
}
