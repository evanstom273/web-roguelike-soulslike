import { add, box, ellipsoid, frameAlong, len, loft, loftPoints, mul, sub, V } from '../core.mjs'
import { arms, legs } from './common.mjs'

// The mage: a broad, battered pointed hat whose tip has slumped back, a face half in its
// shadow, an indigo robe with gold trim whose hem swings with the feet, a mantle with a
// gilt clasp, a burgundy sash and bell sleeves over bare hands.

const SEGS = 20

export const magic = {
  id: 'magic',
  shoulder: 14,
  stance: 'free',
  materials: {
    robe: { light: '#6a55a6', base: '#3f3170', shadow: '#221a40', back: '#140f26' },
    robeD: { light: '#4e3f80', base: '#2e2454', shadow: '#181230', back: '#100c20' },
    gold: { light: '#f3d98e', base: '#c9a24a', shadow: '#7a5a1c' },
    sash: { light: '#8e3a48', base: '#5e1f2a', shadow: '#36111a' },
    hat: { light: '#54463a', base: '#3a3027', shadow: '#211b15' },
    hatD: { light: '#3e332a', base: '#2a221b', shadow: '#17120e' },
    band: { light: '#9a7a44', base: '#6b5530', shadow: '#3e3018' },
    skin: { light: '#efdcc0', base: '#c9ad8a', shadow: '#8a7154' },
    skinShade: { light: '#7a6550', base: '#5e4d3c', shadow: '#42362a' },
    boot: { light: '#4a3a2c', base: '#2e241b', shadow: '#1a140f' },
    dark: { light: '#2a1d12', base: '#2a1d12', shadow: '#2a1d12' },
  },
  build(m, sk, pose) {
    // Legs barely show: boots under the hem.
    legs(m, sk, { thigh: 'robeD', shin: 'robeD', foot: 'boot', rThigh: 4.4, rShin: 4 })

    // The robe's skirt runs from the waist to a hem that follows the feet as they stride.
    const ring = (f, c, rx, ry) => Array.from({ length: SEGS }, (_, j) => {
      const a = (j / SEGS) * Math.PI * 2
      return f.at(V(c.x + rx * Math.cos(a), c.y + ry * Math.sin(a), c.z))
    })
    const fr = pose.feet.r
    const fl = pose.feet.l
    const stride = Math.abs(fr.x - fl.x)
    const hemC = V((fr.x + fl.x) * 0.35, 0, 3)
    const hemFrame = sk.root.yaw((pose.pelvisTwist ?? 0) * 0.5)
    const waist = ring(sk.pelvis, V(0, 0, 11), 9.6, 13)
    const hips = ring(sk.pelvis, V(0, 0, 0), 12.5, 15)
    const hem = ring(hemFrame, hemC, 16 + stride * 0.45, 18)
    const trim = ring(hemFrame, add(hemC, V(0, 0, 3.5)), 15.6 + stride * 0.45, 17.6)
    const knee = hips.map((p, j) => add(mul(p, 0.45), mul(trim[j], 0.55)))
    loftPoints(m, 'robe-skirt', [hem, trim, knee, hips, waist], (i, j) => (i === 0 ? 'gold' : j === 0 || j === SEGS - 1 ? 'robeD' : 'robe'))

    loft(m, 'sash', sk.pelvis, [{ z: 8, rx: 10.2, ry: 13.6 }, { z: 12, rx: 9.8, ry: 13.2 }], SEGS, 'sash')
    loft(m, 'robe-body', sk.chest, [{ z: 0, rx: 9.5, ry: 13.2 }, { z: 10, rx: 10, ry: 14 }, { z: 20, rx: 10, ry: 14.2 }, { z: 26, rx: 7, ry: 9.5 }, { z: 28, rx: 4.5, ry: 6 }], SEGS, (i, j) => (j === 0 ? 'gold' : 'robe'), { capTop: 'robe' })

    // Mantle over the shoulders, gold-edged, with a clasp at the collar.
    loft(m, 'mantle', sk.chest, [{ z: 12.5, rx: 12.4, ry: 16.2 }, { z: 14, rx: 12.4, ry: 16.2 }, { z: 21, rx: 11, ry: 14.8 }, { z: 26.5, rx: 7.4, ry: 9.8 }, { z: 29, rx: 5, ry: 6.5 }], SEGS, (i) => (i === 0 ? 'gold' : 'robeD'))
    box(m, 'clasp', sk.chest, V(8.2, 0, 24.5), V(1.6, 4, 4), 'gold')

    // Face, half in the hat's shadow.
    const face = (i) => (i >= 3 ? 'skinShade' : 'skin')
    loft(m, 'face', sk.head, [{ z: 1, rx: 5, ry: 5.5 }, { z: 4, rx: 6.6, ry: 6.8 }, { z: 9, rx: 7.2, ry: 7.2 }, { z: 13, rx: 7, ry: 7 }, { z: 15, rx: 6.5, ry: 6.5 }, { z: 16.5, rx: 5.5, ry: 5.5 }], 14, face, { capTop: 'skinShade' })
    for (const dy of [-2.6, 2.6]) box(m, 'eye', sk.head, V(7.1, dy, 11), V(0.6, 1.2, 1), 'dark')

    // Hat: a broad brim, worn tipped back so the face shows beneath it, then a crown
    // rising and slumping back and to the side at the tip.
    const hat = sk.head.moved(V(-0.6, 0, 14.8)).pitch(-0.17)
    loft(m, 'brim', hat, [{ z: -0.8, rx: 21.5, ry: 21 }, { z: 0.6, rx: 21.5, ry: 21 }, { z: 1.2, rx: 10.4, ry: 10.4 }], 22, (i) => (i === 0 ? 'hatD' : 'hat'), { capBottom: 'hatD' })
    loft(m, 'crown', hat, [
      { z: 1, rx: 10, ry: 10 },
      { z: 4.1, rx: 9.6, ry: 9.6 },
      { z: 5.1, rx: 9.4, ry: 9.4 },
      { z: 11.6, rx: 7.6, ry: 7.6, x: -0.6 },
      { z: 17.6, rx: 5.4, ry: 5.4, x: -2, y: -0.8 },
      { z: 21.6, rx: 3.6, ry: 3.6, x: -4, y: -2.6 },
      { z: 23.1, rx: 2.2, ry: 2.2, x: -7, y: -6 },
      { z: 21.1, rx: 0.8, ry: 0.8, x: -9, y: -9.5 },
    ], 14, (i) => (i === 1 ? 'band' : 'hat'))

    // Bell sleeves: narrow at the elbow, flaring to a gold cuff, bare hands below.
    const bell = (mm, el, h) => {
      const f = frameAlong(el, h, sk.root.ez)
      const l = len(sub(h, el))
      loft(mm, 'sleeve', f, [{ z: 0, rx: 4.3, ry: 4.3 }, { z: l * 0.55, rx: 5.6, ry: 5.6 }, { z: l - 1, rx: 7, ry: 7 }, { z: l + 0.4, rx: 7, ry: 7 }], 12, (i) => (i === 2 ? 'gold' : 'robe'), { twoSided: true })
    }
    const hand = (mm, f, l) => ellipsoid(mm, 'hand', f, V(0, 0, l + 2.4), 2.9, 3.1, 3.4, 'skin', 10, 5)
    arms(m, sk, { upper: 'robe', rUpper: 4.3, bell, hand })
  },
}
