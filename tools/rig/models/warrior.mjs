import { box, loft, V } from '../core.mjs'
import { arms, fist, hanging, legs } from './common.mjs'

// The warrior: great helm, plate, pauldrons, fur mantle, mail skirt and a red cape.

export const warrior = {
  id: 'warrior',
  shoulder: 15,
  stance: 'shield',
  materials: {
    steel: { light: '#dde1e4', base: '#959aa0', shadow: '#53575c', spec: '#ffffff' },
    steelD: { light: '#aeb3b8', base: '#6f7479', shadow: '#3a3d41', spec: '#dde1e4' },
    mail: { light: '#a2a7ac', base: '#686d72', shadow: '#3c3f43' },
    cape: { light: '#b8402f', base: '#8e211d', shadow: '#5e1412', back: '#3d0b0c', cut: 0.5 },
    fur: { light: '#a08a6a', base: '#735e47', shadow: '#47392b' },
    furD: { light: '#8a7458', base: '#5f4c39', shadow: '#3b2f23' },
    leather: { light: '#8e6844', base: '#62442b', shadow: '#382411' },
    gold: { light: '#f3d98e', base: '#c9a24a', shadow: '#7a5a1c' },
    black: { light: '#0b0c0d', base: '#0b0c0d', shadow: '#0b0c0d' },
  },
  build(m, sk, pose) {
    legs(m, sk, { thigh: 'steelD', shin: 'steelD', foot: 'steelD', knee: 'steel' })

    loft(m, 'skirt', sk.pelvis, [{ z: -12, rx: 15, ry: 17 }, { z: -4, rx: 13.5, ry: 16 }, { z: 6, rx: 11, ry: 14.5 }, { z: 11, rx: 10, ry: 14 }], 14, 'mail', { capBottom: 'mail' })
    box(m, 'tasset', sk.pelvis, V(12.5, 6.5, -3), V(2, 10, 13), 'steel')
    box(m, 'tasset', sk.pelvis, V(12.5, -6.5, -3), V(2, 10, 13), 'steel')
    loft(m, 'belt', sk.pelvis, [{ z: 8, rx: 11.2, ry: 14.8 }, { z: 12, rx: 10.8, ry: 14.4 }], 14, 'leather')
    box(m, 'buckle', sk.pelvis, V(11.6, 0, 10), V(1.5, 5, 4.4), 'gold')

    hanging(m, 'cape', sk, pose, { top: (u) => V(-9 + Math.abs(u) * 2, u * 13, 25), width: 14, length: 70, mat: 'cape' })

    loft(m, 'breast', sk.chest, [{ z: 0, rx: 9.5, ry: 14 }, { z: 8, rx: 10.8, ry: 15.5 }, { z: 16, rx: 11.6, ry: 16 }, { z: 22, rx: 10.6, ry: 15 }, { z: 26, rx: 7.5, ry: 10.5 }, { z: 28, rx: 5, ry: 7 }], 16, 'steel', { capTop: 'steel' })
    box(m, 'ridge', sk.chest, V(11.4, 0, 13), V(1.2, 1.4, 18), 'steelD')
    loft(m, 'fur', sk.chest, [{ z: 20, rx: 12.5, ry: 17.5 }, { z: 24.5, rx: 11, ry: 15 }, { z: 28, rx: 7, ry: 9.5 }], 16, (i, j) => (j % 2 ? 'fur' : 'furD'))

    const slit = (i, j, a) => (i === 2 && Math.cos(a) > 0.25 ? 'black' : 'steel')
    loft(m, 'helm', sk.head, [{ z: 0, rx: 8, ry: 8 }, { z: 3, rx: 10.4, ry: 10.4 }, { z: 15.5, rx: 11, ry: 11 }, { z: 18.5, rx: 11, ry: 11 }, { z: 26, rx: 10.9, ry: 10.9 }, { z: 28, rx: 10.2, ry: 10.2 }], 16, slit, { capTop: 'steel', capBottom: 'black' })
    box(m, 'helm-ridge', sk.head, V(10.9, 0, 9), V(1.2, 1.6, 12), 'steelD')
    for (const [dy, dz] of [[4, 8], [6.5, 8], [4, 5.5], [6.5, 5.5]]) box(m, 'breath', sk.head, V(10.6, dy, dz), V(0.8, 1.3, 1.3), 'black')

    for (const side of [1, -1]) {
      const c = sk.chest.moved(V(0, 16.5 * side, 21))
      loft(m, 'pauldron', c, [{ z: -9, rx: 9, ry: 8.4 }, { z: -4.5, rx: 9.8, ry: 9.2 }, { z: -4, rx: 9.2, ry: 8.6 }, { z: 1.5, rx: 9.2, ry: 8.6 }, { z: 5, rx: 6.5, ry: 6 }, { z: 6.5, rx: 2, ry: 2 }], 14, 'steel', { capBottom: 'steelD' })
      box(m, 'rivet', c, V(0, 0, 4.5), V(1.4, 1.4, 1.4), 'gold')
    }

    arms(m, sk, { upper: 'steel', fore: 'steelD', elbow: 'steel', hand: fist('steelD') })
  },
}
