import { V } from './core.mjs'

// Every animation as a function of time, for any class. A pose gives the facing, how the
// hips, chest and head turn and lean, where the hands and feet are (character space:
// x forward, y right, z up) and which way each hand's weapon points.
//
// stance 'shield' holds the off hand up in front of the chest (warrior); 'free' lets it
// hang like the weapon hand.

const ease = (t) => 1 - (1 - t) * (1 - t)
const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const lerpV = (a, b, t) => V(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t))
const deg = (d) => (d * Math.PI) / 180
const orbit = (a, r, h) => V(Math.cos(a) * r, Math.sin(a) * r, h)

const REST_R = V(7, 19, 33)
const BLADE_R = V(0.85, 0.35, -0.45)
const REST = {
  shield: { l: V(12, -15, 44), bladeL: V(1, -0.35, 0) },
  free: { l: V(7, -19, 33), bladeL: V(0.85, -0.35, -0.45) },
}
const FEET = { r: V(1, 7, 0), l: V(-1, -7, 0) }

const base = (facing, stance) => ({
  facing,
  hands: { r: REST_R, l: REST[stance].l },
  feet: FEET,
  blade: BLADE_R,
  bladeL: REST[stance].bladeL,
})

/** Puts one hand's movement on the given hand (k = 1 right, -1 left), the other at rest. */
function withHand(pose, hand, at, blade) {
  if (hand === 'r') return { ...pose, hands: { ...pose.hands, r: at }, blade }
  return { ...pose, hands: { ...pose.hands, l: at }, bladeL: blade }
}

/** Splits t into the attack's wind-up (0-0.35), strike (0.35-0.6) and recovery. */
function phases(t, wind, hit, rest) {
  if (t < 0.35) return { from: rest, to: wind, k: ease(t / 0.35), step: 0 }
  if (t < 0.6) {
    const k = ease((t - 0.35) / 0.25)
    return { from: wind, to: hit, k, step: k }
  }
  const k = smooth((t - 0.6) / 0.4)
  return { from: hit, to: rest, k, step: 1 - k }
}
const mix = (p) => {
  const o = {}
  for (const key of Object.keys(p.from)) o[key] = lerp(p.from[key], p.to[key], p.k)
  return o
}

export function idle(facing, t, stance) {
  const b = Math.sin(t * Math.PI * 2)
  const p = base(facing, stance)
  return { ...p, bob: b * 0.6, hands: { r: V(REST_R.x, REST_R.y, REST_R.z + b * 0.4), l: V(p.hands.l.x, p.hands.l.y, p.hands.l.z + b * 0.5) }, cape: { flare: 0.12 + b * 0.02 } }
}

export function walk(facing, phase, stance) {
  const p = phase * Math.PI * 2
  const s = Math.sin(p)
  const c = Math.cos(p)
  const b = base(facing, stance)
  const swingL = stance === 'free' ? 7 * s : 3 * s
  return {
    ...b,
    bob: Math.cos(p * 2) * 1.4 - 0.6,
    pelvisTwist: deg(6) * s,
    chestTwist: -deg(4) * s,
    lean: deg(4),
    hands: { r: V(7 - 7 * s, 19, 34), l: V(b.hands.l.x + swingL, b.hands.l.y, b.hands.l.z) },
    feet: { r: V(11 * s, 7, Math.max(0, c) * 6), l: V(-11 * s, -7, Math.max(0, -c) * 6) },
    cape: { flare: 0.4 + 0.06 * Math.sin(p * 2), sway: -deg(4) * s },
  }
}

/**
 * A light slash with one hand. side 1 starts on that hand's side and cuts across (forehand),
 * -1 starts across the body (backhand).
 */
export function slash(facing, t, side, hand, stance) {
  const k = hand === 'r' ? 1 : -1
  const restA = Math.atan2(19 * k, 7)
  const rest = { a: restA, r: 21, h: 33, twist: 0, lift: -0.45, lean: 0 }
  const wind = { a: deg(105) * side * k, r: 23, h: 60, twist: deg(38) * side * k, lift: 0.75, lean: -deg(4) }
  const hit = { a: -deg(85) * side * k, r: 27, h: 46, twist: -deg(36) * side * k, lift: -0.05, lean: deg(12) }
  const ph = phases(t, wind, hit, rest)
  const m = mix(ph)
  const p = withHand(base(facing, stance), hand, orbit(m.a, m.r, m.h), V(Math.cos(m.a), Math.sin(m.a), m.lift))
  return {
    ...p,
    bob: -ph.step * 2,
    pelvisTwist: m.twist * 0.35,
    chestTwist: m.twist * 0.65,
    lean: m.lean,
    feet: { r: V(-2 + ph.step * 2, 8, 0), l: V(5 + ph.step * 4, -7, 0) },
    cape: { flare: 0.2 + ph.step * 0.15, sway: -m.twist * 0.3 },
  }
}

/** A heavy two-handed-feeling chop: raised over the shoulder, brought down in front. */
export function heavy(facing, t, hand, stance) {
  const k = hand === 'r' ? 1 : -1
  const rest = { x: 7, y: 19 * k, z: 33, bx: 0.85, by: 0.35 * k, bz: -0.45, twist: 0, lean: 0 }
  const wind = { x: -5, y: 11 * k, z: 84, bx: -0.55, by: 0.25 * k, bz: 1, twist: deg(22) * k, lean: -deg(9) }
  const hit = { x: 27, y: 5 * k, z: 34, bx: 1, by: 0.05 * k, bz: -0.6, twist: -deg(10) * k, lean: deg(20) }
  const ph = phases(t, wind, hit, rest)
  const m = mix(ph)
  const p = withHand(base(facing, stance), hand, V(m.x, m.y, m.z), V(m.bx, m.by, m.bz))
  // The off hand comes up to help on the way down.
  const help = stance === 'free' ? withHand(p, hand === 'r' ? 'l' : 'r', lerpV(p.hands[hand === 'r' ? 'l' : 'r'], V(m.x - 4, m.y - 9 * k, m.z - 2), 0.5 * ph.k * (t < 0.6 ? 1 : 1 - ph.k)), hand === 'r' ? p.bladeL : p.blade) : p
  return {
    ...help,
    bob: -ph.step * 4,
    pelvisTwist: m.twist * 0.4,
    chestTwist: m.twist * 0.6,
    lean: m.lean,
    feet: { r: V(-3 + ph.step * 3, 8, 0), l: V(6 + ph.step * 6, -7, 0) },
    cape: { flare: 0.25 + ph.step * 0.2 },
  }
}

/** Raising a hand to cast; t 0..1 over the cast's wind-up, held at 1 while channelling. */
export function cast(facing, t, hand, stance) {
  const k = hand === 'r' ? 1 : -1
  const e = ease(t)
  const from = hand === 'r' ? REST_R : REST[stance].l
  const p = withHand(base(facing, stance), hand, lerpV(from, V(21, 8 * k, 58), e), lerpV(hand === 'r' ? BLADE_R : REST[stance].bladeL, V(0.9, 0.1 * k, 0.55), e))
  return { ...p, chestTwist: deg(12) * k * e, pelvisTwist: deg(5) * k * e, lean: -deg(3) * e, feet: { r: V(-1, 8, 0), l: V(4 * e, -7, 0) }, cape: { flare: 0.15 + 0.1 * e } }
}

/** A forward roll: curl into a ball, tumble over once, come up. t: 0..1. */
export function roll(facing, t, stance) {
  const k = smooth(t)
  const tuck = Math.min(1, Math.sin(Math.PI * t) * 1.6)
  const p = base(facing, stance)
  return {
    ...p,
    bob: -tuck * 18,
    lean: deg(75) * tuck,
    headTurn: 0,
    hands: { r: V(12 - tuck * 2, 8, 34 - tuck * 14), l: V(12 - tuck * 2, -8, 34 - tuck * 14) },
    feet: { r: V(6 * tuck, 7, tuck * 16), l: V(4 * tuck, -7, tuck * 14) },
    cape: { flare: 0.25 + tuck * 0.2 },
    tumble: { angle: Math.PI * 2 * k, tuck },
  }
}

/** Flinching from a hit. */
export function hurt(facing, t, stance) {
  const k = Math.sin(Math.PI * Math.min(1, t))
  const p = base(facing, stance)
  return {
    ...p,
    bob: -k,
    lean: -deg(14) * k,
    chestTwist: deg(6) * k,
    headTurn: -deg(8) * k,
    hands: { r: lerpV(p.hands.r, V(1, 23, 40), k), l: lerpV(p.hands.l, V(4, -21, 44), k) },
    feet: { r: V(-3 * k, 8, 0), l: V(-1, -7, 0) },
    cape: { flare: 0.15 + 0.15 * k },
  }
}

/** Killed: the knees go, the arms drop, and the body tips back to lie on the floor. */
export function death(facing, t, stance) {
  const k = smooth(Math.min(1, t / 0.45))
  const fall = Math.min(1, Math.max(0, (t - 0.2) / 0.8)) ** 2
  const p = base(facing, stance)
  return {
    ...p,
    bob: -k * 10,
    lean: -deg(18) * k,
    headTurn: deg(12) * k,
    hands: { r: lerpV(p.hands.r, V(-3, 24, 30), k), l: lerpV(p.hands.l, V(-3, -24, 30), k) },
    blade: lerpV(p.blade, V(0.2, 0.7, -0.7), k),
    bladeL: lerpV(p.bladeL, V(0.2, -0.7, -0.7), k),
    feet: { r: V(5 * k, 9, 0), l: V(-2, -8, 0) },
    cape: { flare: 0.1 },
    tumble: { angle: -deg(88) * fall, tuck: 0 },
  }
}

// What gets rendered: each animation's frame times (0..1).
const ATTACK = [0, 0.1, 0.2, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.72, 0.86, 1]
export const ANIMATIONS = {
  idle: { times: [0, 0.25, 0.5, 0.75], loop: true, pose: (f, t, s) => idle(f, t, s) },
  walk: { times: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8), loop: true, pose: (f, t, s) => walk(f, t, s) },
  slash: { times: ATTACK, pose: (f, t, s) => slash(f, t, 1, 'r', s) },
  backslash: { times: ATTACK, pose: (f, t, s) => slash(f, t, -1, 'r', s) },
  lslash: { times: ATTACK, pose: (f, t, s) => slash(f, t, 1, 'l', s) },
  heavy: { times: ATTACK, pose: (f, t, s) => heavy(f, t, 'r', s) },
  cast: { times: [0, 0.2, 0.4, 0.6, 0.8, 1], pose: (f, t, s) => cast(f, t, 'r', s) },
  lcast: { times: [0, 0.2, 0.4, 0.6, 0.8, 1], pose: (f, t, s) => cast(f, t, 'l', s) },
  roll: { times: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8), pose: (f, t, s) => roll(f, t, s) },
  hurt: { times: [0.5, 1], pose: (f, t, s) => hurt(f, t * 0.5, s) },
  death: { times: [0, 0.2, 0.4, 0.6, 0.8, 1], pose: (f, t, s) => death(f, t, s) },
}
