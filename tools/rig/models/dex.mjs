import { add, box, loft, loftPoints, mul, sheet, sub, V } from '../core.mjs'
import { arms, fist, hanging, legs } from './common.mjs'

// The Dex: a hooded skirmisher. Deep hood with the face lost in shadow, a teal-edged cowl,
// a teal scarf over the mouth with its tails streaming behind, quilted gambeson, crossed
// belts and a single leather pauldron.

export const dex = {
  id: 'dex',
  shoulder: 13,
  stance: 'free',
  materials: {
    quilt: { light: '#9a8463', base: '#6f5d44', shadow: '#43372a' },
    quiltD: { light: '#857053', base: '#5c4c37', shadow: '#382d21' },
    trouser: { light: '#5e5144', base: '#41372d', shadow: '#26201a' },
    leather: { light: '#8e6844', base: '#62442b', shadow: '#382411' },
    leatherD: { light: '#5e4630', base: '#3e2c1c', shadow: '#22170d' },
    hood: { light: '#5c5143', base: '#3d342a', shadow: '#221d17', back: '#0b0908' },
    trim: { light: '#55a8a4', base: '#3d342a', shadow: '#221d17', back: '#0b0908' },
    teal: { light: '#55a8a4', base: '#2f7472', shadow: '#173e40', back: '#12302f' },
    void: { light: '#0b0908', base: '#0b0908', shadow: '#0b0908' },
    glint: { light: '#e4f2f0', base: '#e4f2f0', shadow: '#e4f2f0', ink: false },
    gold: { light: '#f3d98e', base: '#c9a24a', shadow: '#7a5a1c' },
    rivet: { light: '#e2e5e8', base: '#a9adb1', shadow: '#6a6e72' },
  },
  build(m, sk, pose) {
    legs(m, sk, { thigh: 'trouser', shin: 'trouser', foot: 'leatherD', boot: 'leather', rThigh: 4.9, rShin: 4.4 })

    // Gambeson skirt and body, quilted in vertical channels.
    const quilt = (i, j) => (j % 3 === 0 ? 'quiltD' : 'quilt')
    loft(m, 'skirt', sk.pelvis, [{ z: -13, rx: 12.5, ry: 15 }, { z: -4, rx: 11.5, ry: 14 }, { z: 6, rx: 10, ry: 13 }, { z: 11, rx: 9.4, ry: 12.8 }], 18, quilt, { capBottom: 'quiltD' })
    loft(m, 'belt', sk.pelvis, [{ z: 8, rx: 10.2, ry: 13.6 }, { z: 11.5, rx: 9.8, ry: 13.2 }], 18, 'leather')
    box(m, 'buckle', sk.pelvis, V(10.4, 0, 9.8), V(1.4, 4, 3.6), 'gold')
    loft(m, 'gambeson', sk.chest, [{ z: 0, rx: 9, ry: 12.8 }, { z: 8, rx: 9.8, ry: 13.8 }, { z: 16, rx: 10.2, ry: 14.2 }, { z: 22, rx: 9.4, ry: 13.2 }, { z: 26, rx: 6.5, ry: 9 }, { z: 28, rx: 4.5, ry: 6 }], 18, quilt, { capTop: 'quilt' })

    // Crossed belts lying on the chest: strips following the gambeson's front.
    for (const dir of [1, -1]) {
      const grid = []
      for (let i = 0; i <= 6; i++) {
        const t = i / 6
        const y = dir * (10 - 20 * t)
        const z = 13 - 12 * t
        const ry = 13.8
        const x = 10.4 * Math.sqrt(Math.max(0.05, 1 - (y / ry) ** 2)) + 0.6
        const across = V(0, 1.6, 1.6 * dir)
        grid.push([sk.chest.at(sub(V(x, y, z), mul(across, 0.5))), sk.chest.at(add(V(x, y, z), mul(across, 0.5)))])
      }
      sheet(m, 'baldric', grid, 'leather')
    }

    // Scarf tails behind, then the leather pauldron on the off-hand shoulder.
    hanging(m, 'scarf', sk, pose, { top: (u) => V(-7, u * 2.5 + 2, 26), width: 2.5, spread: 2, length: 34, back: 9, cols: 3, rows: 7, folds: 1, mat: 'teal' })
    const pc = sk.chest.moved(V(0, -17, 13))
    loft(m, 'pauldron', pc, [{ z: -6.5, rx: 7.6, ry: 7 }, { z: -2, rx: 8.2, ry: 7.6 }, { z: 3, rx: 6.2, ry: 5.6 }, { z: 5, rx: 1.6, ry: 1.6 }], 12, 'leather', { capBottom: 'leatherD' })
    for (const dx of [-3, 3]) box(m, 'rivet', pc, V(dx, -2, 3.5), V(1.2, 1.2, 1.2), 'rivet')

    // The cowl drapes from the hood over the shoulders; its hem is edged in teal.
    loft(m, 'cowl', sk.chest, [{ z: 11, rx: 13.6, ry: 20 }, { z: 12.6, rx: 13.6, ry: 19.8 }, { z: 19, rx: 12.2, ry: 17.4 }, { z: 25, rx: 8.2, ry: 11 }, { z: 29, rx: 5, ry: 6.5 }], 20, (i) => (i === 0 ? 'teal' : 'hood'))

    // Hood: deep, with a point at the back. The opening is set back from the hood's edge, so
    // the brow overhangs a dark recess; two glints for eyes; the scarf covers the mouth.
    const HOOD = [{ z: -1, rx: 7.5, ry: 8.5 }, { z: 3.5, rx: 10.4, ry: 10.8 }, { z: 10.5, rx: 11.2, ry: 11 }, { z: 17, rx: 11, ry: 10.6, x: 1 }, { z: 22, rx: 8.6, ry: 8.8, x: -0.6 }, { z: 26, rx: 5.8, ry: 6.2, x: -2.2 }, { z: 28.5, rx: 1.5, ry: 1.5, x: -4.5 }]
    const SEG = 20
    const FACE = 6.2
    const rings = HOOD.map((r, i) => Array.from({ length: SEG }, (_, j) => {
      const a = (j / SEG) * Math.PI * 2
      const x = (r.x ?? 0) + r.rx * Math.cos(a)
      return sk.head.at(V(i === 1 || i === 2 ? Math.min(x, FACE) : x, r.ry * Math.sin(a), r.z))
    }))
    const opening = (i, j) => {
      const c = Math.cos(((j + 0.5) / SEG) * Math.PI * 2)
      if (i === 1 && c > 0.5) return 'void'
      if ((i === 1 || i === 2) && c > 0.3) return 'trim'
      return 'hood'
    }
    loftPoints(m, 'hood', rings, opening, { twoSided: true })
    for (const dy of [-2.7, 2.7]) box(m, 'eye', sk.head, V(FACE + 0.3, dy, 9.3), V(0.6, 1.6, 1.1), 'glint')
    loft(m, 'mask', sk.head, [{ z: 1.5, rx: 7, ry: 9.6 }, { z: 7.8, rx: 7.3, ry: 9.8 }], 14, 'teal', { start: -Math.PI * 0.5, sweep: Math.PI, twoSided: true })

    arms(m, sk, { upper: 'quilt', fore: 'quilt', wrist: 'leather', rUpper: 4, rFore: 3.8, hand: fist('leatherD', V(6, 6.5, 6)) })
  },
}
