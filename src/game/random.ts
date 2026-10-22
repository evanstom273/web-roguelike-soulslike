// Seeded randomness. The same seed always produces the same sequence, so a seed
// fully describes a generated floor.

export type Rng = () => number

// Turns any seed string into a 32-bit number (cyrb53, truncated).
export function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 ^ h1) >>> 0
}

// mulberry32: small, fast, good enough for gameplay randomness.
export function createRng(seed: string): Rng {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randInt = (rng: Rng, maxExclusive: number) => Math.floor(rng() * maxExclusive)

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[randInt(rng, items.length)]

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export function weightedPick<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0)
  let roll = rng() * total
  for (const i of items) {
    roll -= i.weight
    if (roll < 0) return i.item
  }
  return items[items.length - 1].item
}

// Human-friendly seed for the "random seed" button. Skips look-alike characters.
const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomSeed(length = 8): string {
  let s = ''
  for (let i = 0; i < length; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)]
  return s
}
