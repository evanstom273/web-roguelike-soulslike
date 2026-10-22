import { box, ellipsoid, frameAlong, len, loft, sub, V } from '../core.mjs'
import { arms, fist, legs } from './common.mjs'

// The stand-in enemy: a jointed wooden figure, deliberately plain, holding a sword until
// the real roster is designed.

export const standIn = {
  id: 'stand-in',
  shoulder: 14,
  stance: 'free',
  animations: ['idle', 'walk', 'slash', 'backslash', 'heavy', 'cast', 'hurt', 'death'],
  materials: {
    wood: { light: '#9c8a74', base: '#6e5f4e', shadow: '#40372d' },
    joint: { light: '#6b5c4b', base: '#4a3f33', shadow: '#2a241d' },
    band: { light: '#7a7f84', base: '#4f5357', shadow: '#2c2f32', spec: '#c9cdd1' },
    wrap: { light: '#7b3a30', base: '#56241e', shadow: '#331410' },
    dark: { light: '#1a1612', base: '#1a1612', shadow: '#1a1612' },
  },
  build(m, sk) {
    legs(m, sk, { thigh: 'wood', shin: 'wood', foot: 'joint', knee: 'joint', rThigh: 4.6, rShin: 4 })

    // Pelvis block, a waist joint and a tapered chest with an iron band.
    loft(m, 'pelvis', sk.pelvis, [{ z: -5, rx: 8.5, ry: 11.5 }, { z: 3, rx: 9, ry: 12 }, { z: 8, rx: 7, ry: 9 }], 12, 'wood', { capBottom: 'joint', capTop: 'joint' })
    ellipsoid(m, 'waist', sk.pelvis, V(0, 0, 9.5), 6, 7.5, 4, 'joint', 12, 5)
    loft(m, 'chest', sk.chest, [{ z: 0, rx: 7.5, ry: 10 }, { z: 9, rx: 9.5, ry: 13.5 }, { z: 18, rx: 10, ry: 15 }, { z: 22, rx: 8.5, ry: 13 }, { z: 24, rx: 6, ry: 8.5 }], 14, (i) => (i === 1 ? 'band' : 'wood'), { capTop: 'wood' })
    // A strip of cloth tied round the chest, so it reads as hostile rather than a dummy.
    loft(m, 'wrap', sk.chest, [{ z: 4, rx: 8.3, ry: 11.3 }, { z: 7, rx: 9, ry: 12.6 }], 14, 'wrap')
    for (const side of [1, -1]) ellipsoid(m, 'shoulder', sk.chest, V(0, 14 * side, 19), 4.8, 4.8, 4.8, 'joint', 10, 5)

    // Neck peg and a blank egg of a head, with a scored line for a face.
    const neck = sk.chest.at(V(0, 0, 24))
    const headBase = sk.head.at(V(0, 0, 1))
    loft(m, 'neck', frameAlong(neck, headBase, sk.root.ex), [{ z: 0, rx: 3.2, ry: 3.2 }, { z: len(sub(headBase, neck)) + 1, rx: 3, ry: 3 }], 8, 'joint')
    ellipsoid(m, 'head', sk.head, V(0, 0, 11), 8.5, 8, 11, 'wood', 14, 7)
    box(m, 'face', sk.head, V(8.2, 0, 12), V(0.8, 8, 1.1), 'dark')

    arms(m, sk, { upper: 'wood', fore: 'wood', rUpper: 3.8, rFore: 3.5, elbow: 'joint', hand: fist('joint', V(5.5, 6, 5.5)) })
  },
}
