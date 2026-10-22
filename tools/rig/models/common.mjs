import { add, box, ellipsoid, Frame, frameAlong, len, lerpV, limb, mul, norm, sheet, sub, V } from '../core.mjs'

/** Cloth hanging from the chest (capes, scarf tails), swinging back with movement. */
export function hanging(m, name, sk, pose, { top, width, spread = 7, length, back = 11, rows = 8, cols = 7, folds = 2.5, mat }) {
  const flare = pose.cape?.flare ?? 0.15
  const sway = pose.cape?.sway ?? 0
  const hangFrame = sk.root.yaw((pose.pelvisTwist ?? 0) * 0.6 + sway)
  // Mid-roll the body is turned about by pose.move; the cloth then hangs from where its top
  // has been carried to, trailing behind and falling to the ground rather than turning over.
  const move = pose.move
  const grid = []
  for (let i = 0; i <= rows; i++) {
    const v = i / rows
    const row = []
    for (let j = 0; j < cols; j++) {
      const u = (j / (cols - 1)) * 2 - 1
      const fold = Math.cos(u * Math.PI * folds) * (1.2 + v * 2.2)
      let t = sk.chest.at(top(u))
      let hang = hangFrame.at(V(-back - flare * length * 0.5 * v ** 1.3 - fold - (1 - u * u) * 2, u * (width + spread * v), t.z - length * v + flare * length * 0.25 * v * v))
      if (move) {
        t = move(t)
        const trail = add(t, sk.root.dir(V(-length * v * 0.6 - fold * 0.5, u * (width * 0.5 + spread * v), -length * v * 0.9)))
        trail.z = Math.max(trail.z, pose.floor + 0.5)
        hang = lerpV(move(hang), trail, pose.tumble.tuck)
      }
      row.push(i === 0 ? t : lerpV(t, hang, Math.min(1, v * 2.2)))
    }
    grid.push(row)
  }
  const mesh = sheet(m, name, grid, mat)
  mesh.cloth = true
  mesh.world = !!move
}

/** Both legs: thigh, shin and foot, in the given materials. */
export function legs(m, sk, { thigh, shin, foot, knee, boot, rThigh = 5.6, rShin = 4.9 }) {
  for (const k of ['r', 'l']) {
    const { hip, knee: kn, ankle } = sk.legs[k]
    limb(m, 'thigh', hip, kn, rThigh, rThigh - 0.6, thigh, sk.root.ex)
    limb(m, 'shin', kn, ankle, rShin, rShin - 0.8, shin, sk.root.ex)
    if (knee) ellipsoid(m, 'knee', frameAlong(hip, kn, sk.root.ex), V(1.5, 0, len(sub(kn, hip))), 4.6, 4.2, 4.2, knee, 10, 5)
    if (boot) limb(m, 'boot', add(ankle, V(0, 0, 8)), ankle, rShin - 0.2, rShin - 0.4, boot, sk.root.ex)
    box(m, 'foot', new Frame(ankle, sk.root.ex, sk.root.ey, sk.root.ez), V(2.5, 0, -1.5), V(12.5, 8, 6), foot)
  }
}

/** Both arms: upper arm, forearm (optionally in two materials) and hand. */
export function arms(m, sk, { upper, fore, wrist, hand, rUpper = 4.4, rFore = 4.1, elbow, bell }) {
  for (const k of ['r', 'l']) {
    const { shoulder, elbow: el, hand: h } = sk.arms[k]
    limb(m, 'upper', shoulder, el, rUpper, rUpper - 0.3, upper, sk.root.ex)
    if (elbow) ellipsoid(m, 'elbow', frameAlong(shoulder, el, sk.root.ex), V(0, 0, len(sub(el, shoulder))), 4, 4, 4, elbow, 10, 5)
    if (bell) {
      bell(m, el, h)
    } else if (wrist) {
      const mid = add(el, mul(sub(h, el), 0.45))
      limb(m, 'fore', el, mid, rFore, rFore - 0.2, fore, sk.root.ex)
      limb(m, 'wrist', mid, h, rFore + 0.1, rFore - 0.5, wrist, sk.root.ex)
    } else {
      limb(m, 'fore', el, h, rFore, rFore - 0.6, fore, sk.root.ex)
    }
    hand(m, frameAlong(el, h, sk.root.ez), len(sub(h, el)))
  }
}

export const fist = (mat, size = V(6.5, 7, 6.5)) => (m, f, l) => box(m, 'hand', f, V(0, 0, l + 2.5), size, mat)
export const norm3 = norm
