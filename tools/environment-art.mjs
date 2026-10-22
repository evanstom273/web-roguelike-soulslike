// Generates the environment SVGs in src/game/art/environment/<biome>/.
// Run with `npm run art:env`. Deterministic: the same script always writes the same files.
// Ground pieces (floors, fills, paths, decals) are drawn flat as seen from above; standing
// pieces (columns, braziers, torches) are drawn in three-quarter view with their foot at the
// bottom centre. Lit from the top-left, 1 SVG unit = 1 world px.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/game/art/environment')

// ---------------------------------------------------------------------------
// Helpers

function rngFrom(seed) {
  let a = 0
  for (const ch of seed) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let rnd = rngFrom('x')
const R = (lo, hi) => lo + rnd() * (hi - lo)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const f = (n) => (Math.round(n * 10) / 10).toString()
const pts = (ps) => ps.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')
const pathOf = (ps) => `M${ps.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}Z`

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Shrinks a polygon towards its centroid by roughly `d` px. */
function inset(ps, d) {
  const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length
  const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length
  return ps.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const l = Math.hypot(dx, dy) || 1
    return [x - (dx / l) * d, y - (dy / l) * d]
  })
}

/** A wobbly closed blob around (cx, cy). */
function blob(cx, cy, r, wobble = 0.3, n = 12) {
  const ps = []
  const phase = R(0, 6.28)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r * (1 + wobble * (Math.sin(a * 3 + phase) * 0.5 + R(-0.5, 0.5)))
    ps.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  // Smooth with quadratic curves through midpoints.
  let d = ''
  for (let i = 0; i < n; i++) {
    const p = ps[i]
    const q = ps[(i + 1) % n]
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    d += i === 0 ? `M${f(m[0])} ${f(m[1])}` : ''
    const nx = ps[(i + 1) % n]
    const m2 = [(nx[0] + ps[(i + 2) % n][0]) / 2, (nx[1] + ps[(i + 2) % n][1]) / 2]
    d += ` Q${f(nx[0])} ${f(nx[1])} ${f(m2[0])} ${f(m2[1])}`
  }
  return d + 'Z'
}

const svg = (w, h, body, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${viewBox}">\n${body}\n</svg>\n`

// Shared defs: a sheen for the top-left light and soft shadows.
const COMMON_DEFS = `
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>
    <radialGradient id="soft" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`

/** A shaded stone: base fill, sheen, bevel highlights (top/left) and shadows (bottom/right). */
function stone(ps, colour, opts = {}) {
  const d = pathOf(ps)
  let s = `<path d="${d}" fill="${colour}"/><path d="${d}" fill="url(#sheen)"/>`
  const n = ps.length
  for (let i = 0; i < n; i++) {
    const a = ps[i]
    const b = ps[(i + 1) % n]
    // Edge normal pointing outward; edges facing up/left catch the light.
    const nx = b[1] - a[1]
    const ny = -(b[0] - a[0])
    const facing = (-nx - ny) / (Math.hypot(nx, ny) || 1)
    if (facing > 0.25) s += `<path d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" stroke="#fff" stroke-opacity="${f(0.1 + 0.12 * facing)}" stroke-width="2" fill="none"/>`
    else if (facing < -0.25) s += `<path d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}" stroke="#000" stroke-opacity="${f(0.2 + 0.25 * -facing)}" stroke-width="2.5" fill="none"/>`
  }
  if (opts.crack) s += crack(ps)
  return s
}

function crack(ps) {
  const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length
  const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length
  const a = pick(ps)
  const line = [a]
  const steps = 4
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    line.push([a[0] + (cx - a[0]) * t * 1.3 + R(-8, 8), a[1] + (cy - a[1]) * t * 1.3 + R(-8, 8)])
  }
  const d = `M${line.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}`
  return `<path d="${d}" stroke="#000" stroke-opacity="0.55" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="${d}" transform="translate(1.2 1.2)" stroke="#fff" stroke-opacity="0.12" stroke-width="1" fill="none"/>`
}

function speckles(xr, yr, count, inside, colourDark = '#000', colourLight = '#fff') {
  let s = ''
  for (let i = 0; i < count; i++) {
    const x = R(xr[0], xr[1])
    const y = R(yr[0], yr[1])
    if (inside && !inside(x, y)) continue
    const light = rnd() < 0.35
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R(0.8, 2.6))}" fill="${light ? colourLight : colourDark}" fill-opacity="${f(light ? R(0.05, 0.12) : R(0.1, 0.25))}"/>`
  }
  return s
}

// ---------------------------------------------------------------------------
// Biome palettes

const BIOMES = {
  surface: {
    stones: ['#6c6f62', '#63675a', '#75786a', '#5c6054', '#686a5c'],
    band: '#585b4e',
    grout: '#20231b',
    dirt: '#3d3224',
    moss: ['#3c5622', '#4f6f2b', '#67873a'],
    mossAmount: 0.55,
    outside: 'jungle',
    path: ['#6f6f60', '#666757', '#78786a'],
    wall: ['#6e7062', '#64665a', '#76786a'],
    brazierFire: ['#fff1c2', '#ffb347', '#d9531e'],
  },
  underground: {
    stones: ['#6a5c49', '#5f5342', '#726452', '#57493a', '#645644'],
    band: '#524638',
    grout: '#1a150f',
    dirt: '#2f251a',
    moss: ['#334019', '#435224'],
    mossAmount: 0.15,
    outside: 'rock',
    path: ['#6b5c48', '#625441', '#736350'],
    wall: ['#6a5b47', '#605240', '#74644f'],
    brazierFire: ['#fff1c2', '#ffb347', '#d9531e'],
  },
  depths: {
    stones: ['#4b5058', '#444950', '#535961', '#3d4249', '#484d55'],
    band: '#3a3e45',
    grout: '#0b0c0f',
    dirt: '#17191d',
    moss: [],
    mossAmount: 0,
    vein: '#3fbfb0',
    outside: 'abyss',
    path: ['#43474e', '#3c4047', '#4a4e56'],
    wall: ['#41454c', '#3a3e45', '#484c54'],
    brazierFire: ['#eaffff', '#7fe7ff', '#2a7fbf'],
  },
}

// ---------------------------------------------------------------------------
// Floor hex: a paved hexagon with a carved border band. Pointy-top, circumradius 720.

const HEX_R = 720
const SQ3 = Math.sqrt(3)
const hexPts = (r) => Array.from({ length: 6 }, (_, i) => {
  const a = ((60 * i - 30) * Math.PI) / 180
  return [r * Math.cos(a), r * Math.sin(a)]
})
function insideHex(x, y, r) {
  // Pointy-top hex: |x| <= r*sqrt3/2 and |x|*0.5 + |y|*sqrt3/2 <= r*sqrt3/2
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const ir = (r * SQ3) / 2
  return ax <= ir && ax * 0.5 + ay * (SQ3 / 2) <= ir
}

function moss(cx, cy, r, b) {
  if (!b.moss.length) return ''
  let s = `<path d="${blob(cx, cy, r, 0.45, 14)}" fill="${b.moss[0]}" fill-opacity="0.9"/>`
  s += `<path d="${blob(cx - r * 0.12, cy - r * 0.12, r * 0.7, 0.4, 12)}" fill="${b.moss[1]}" fill-opacity="0.85"/>`
  if (b.moss[2]) s += `<path d="${blob(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0.4, 10)}" fill="${b.moss[2]}" fill-opacity="0.8"/>`
  for (let i = 0; i < r / 3; i++) {
    const a = R(0, 6.28)
    const d = R(0, r)
    s += `<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d)}" r="${f(R(1, 2.5))}" fill="${pick(b.moss)}" fill-opacity="0.9"/>`
  }
  return s
}

function floorHex(b, variant) {
  rnd = rngFrom(`floor-${b.name}-${variant}`)
  const BAND = 64
  const innerR = HEX_R - (BAND * 2) / SQ3
  const outer = hexPts(HEX_R)
  const inner = hexPts(innerR)
  let body = `<defs>${COMMON_DEFS}
    <clipPath id="hex"><polygon points="${pts(outer)}"/></clipPath>
    <clipPath id="inner"><polygon points="${pts(hexPts(innerR - 4))}"/></clipPath>
  </defs>
  <g clip-path="url(#hex)">
  <polygon points="${pts(outer)}" fill="${b.grout}"/>`

  // Border band: carved blocks along each edge, with a groove running through them.
  for (let i = 0; i < 6; i++) {
    const [o1, o2, i1, i2] = [outer[i], outer[(i + 1) % 6], inner[i], inner[(i + 1) % 6]]
    const n = 5
    const cuts = [0]
    for (let k = 1; k < n; k++) cuts.push(k / n + R(-0.04, 0.04))
    cuts.push(1)
    for (let k = 0; k < n; k++) {
      const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      const quad = [lerp(o1, o2, cuts[k]), lerp(o1, o2, cuts[k + 1]), lerp(i1, i2, cuts[k + 1]), lerp(i1, i2, cuts[k])]
      body += stone(inset(quad, 3), shade(b.band, R(-0.06, 0.06)), { crack: rnd() < 0.2 })
    }
  }
  const groove = hexPts(HEX_R - BAND / SQ3)
  body += `<polygon points="${pts(groove)}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="3"/>`
  body += `<polygon points="${pts(groove.map(([x, y]) => [x + 1.5, y + 1.5]))}" fill="none" stroke="#fff" stroke-opacity="0.1" stroke-width="1.2"/>`

  // Paving: running-bond flagstones inside the band.
  body += `<g clip-path="url(#inner)">`
  const broken = variant === 'b' ? { x: R(-150, 150), y: R(-150, 150), r: R(230, 290) } : null
  const medallion = variant === 'a'
  for (let y = -innerR; y < innerR; ) {
    const h = R(58, 78)
    const offset = R(-60, 0)
    for (let x = -innerR + offset; x < innerR; ) {
      const w = R(70, 130)
      const cx = x + w / 2
      const cy = y + h / 2
      const near = insideHex(cx, cy, innerR + 120)
      const holed = broken && Math.hypot(cx - broken.x, cy - broken.y) < broken.r * R(0.6, 1)
      if (near) {
        const j = () => R(-4, 4)
        const quad = inset([[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]], 3)
        if (holed) {
          if (rnd() < 0.5) {
            // A tilted, broken slab half-sunk in the dirt.
            const piece = inset(quad, R(10, 30)).map(([px, py]) => [px + R(-10, 10), py + R(-10, 10)])
            body += `<path d="${pathOf(quad)}" fill="${b.dirt}"/>` + stone(piece, shade(pick(b.stones), -0.15), { crack: true })
          } else body += `<path d="${pathOf(quad)}" fill="${b.dirt}"/>` + speckles([x, x + w], [y, y + h], 10, null, '#000', shade(b.dirt, 0.3))
        } else {
          body += stone(quad, shade(pick(b.stones), R(-0.05, 0.05)), { crack: rnd() < 0.1 })
        }
      }
      x += w
    }
    y += h
  }
  body += speckles([-innerR, innerR], [-innerR, innerR], 160, (x, y) => insideHex(x, y, innerR))

  if (medallion) {
    // A carved ring of curved blocks around a sunken disc with a worn rune.
    body += `<circle r="234" fill="${b.grout}"/><circle r="240" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="8"/>`
    const n = 12
    const r1 = 225
    const r0 = 150
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + 0.02
      const a1 = ((k + 1) / n) * Math.PI * 2 - 0.02
      const arc = []
      for (let t = 0; t <= 4; t++) arc.push([Math.cos(a0 + ((a1 - a0) * t) / 4) * r1, Math.sin(a0 + ((a1 - a0) * t) / 4) * r1])
      for (let t = 4; t >= 0; t--) arc.push([Math.cos(a0 + ((a1 - a0) * t) / 4) * r0, Math.sin(a0 + ((a1 - a0) * t) / 4) * r0])
      body += stone(arc, shade(b.band, R(-0.04, 0.06)))
    }
    body += `<circle r="${r0 - 4}" fill="${shade(b.band, -0.18)}"/><circle r="${r0 - 4}" fill="url(#sheen)"/>`
    body += `<circle r="${r0 - 4}" fill="none" stroke="#000" stroke-opacity="0.4" stroke-width="3"/>`
    const rune = []
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      rune.push(`M${f(Math.cos(a) * 30)} ${f(Math.sin(a) * 30)}L${f(Math.cos(a) * 110)} ${f(Math.sin(a) * 110)}`)
    }
    body += `<g stroke="#000" stroke-opacity="0.5" stroke-width="5" fill="none" stroke-linecap="round"><path d="${rune.join('')}"/><circle r="30"/><circle r="80" stroke-dasharray="20 14"/></g>`
    body += `<g stroke="#fff" stroke-opacity="0.08" stroke-width="2" fill="none" transform="translate(1.5 1.5)"><path d="${rune.join('')}"/><circle r="30"/></g>`
  }

  // Overgrowth, damp or mineral veins depending on depth.
  if (b.moss.length) {
    const count = Math.round(R(3, 7) * b.mossAmount * 2)
    for (let i = 0; i < count; i++) {
      const a = R(0, 6.28)
      const d = R(innerR * 0.2, innerR * 0.95)
      body += moss(Math.cos(a) * d, Math.sin(a) * d, R(30, 80), b)
    }
  }
  if (b.vein) {
    for (let i = 0; i < 3; i++) {
      let x = R(-innerR, innerR) * 0.7
      let y = R(-innerR, innerR) * 0.7
      let d = `M${f(x)} ${f(y)}`
      let a = R(0, 6.28)
      for (let k = 0; k < 9; k++) {
        a += R(-0.7, 0.7)
        x += Math.cos(a) * R(30, 60)
        y += Math.sin(a) * R(30, 60)
        d += ` L${f(x)} ${f(y)}`
      }
      body += `<path d="${d}" stroke="#000" stroke-opacity="0.6" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="${d}" stroke="${b.vein}" stroke-opacity="0.35" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`
    }
  }
  body += `</g></g>`
  const w = HEX_R * SQ3
  return svg(w, HEX_R * 2, body, `${f(-w / 2)} ${-HEX_R} ${f(w)} ${HEX_R * 2}`)
}

// ---------------------------------------------------------------------------
// Outside: seamless 512 tiles for whatever surrounds the rooms.

const T = 512
/** Draws `fn(x, y)` at a point and its wrapped copies so the tile repeats seamlessly. */
function wrapped(x, y, reach, fn) {
  let s = ''
  for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
    const px = x + dx
    const py = y + dy
    if (px > -reach && px < T + reach && py > -reach && py < T + reach) s += fn(px, py)
  }
  return s
}

function leaf(x, y, len, wid, angle, fill, rib) {
  const d = `M0 0 C${f(wid)} ${f(-len * 0.25)} ${f(wid * 0.8)} ${f(-len * 0.8)} 0 ${f(-len)} C${f(-wid * 0.8)} ${f(-len * 0.8)} ${f(-wid)} ${f(-len * 0.25)} 0 0Z`
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})"><path d="${d}" fill="${fill}"/><path d="${d}" fill="url(#leafsheen)"/><path d="M0 0 L0 ${f(-len * 0.92)}" stroke="${rib}" stroke-width="${f(Math.max(1, wid * 0.12))}" stroke-opacity="0.7"/></g>`
}

function outsideTile(b) {
  rnd = rngFrom(`outside-${b.name}`)
  let body = `<defs>${COMMON_DEFS}
    <linearGradient id="leafsheen" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.18"/></linearGradient>
  </defs>`
  if (b.outside === 'jungle') {
    body += `<rect width="${T}" height="${T}" fill="#0c140a"/>`
    // Three layers of canopy: dark undergrowth, mid leaves, a few bright top leaves.
    const layers = [
      { n: 140, len: [40, 80], fill: ['#14220f', '#182a12', '#112010'], rib: '#0a1208' },
      { n: 90, len: [55, 100], fill: ['#1f3517', '#24401b', '#1b3015'], rib: '#10200c' },
      { n: 40, len: [60, 110], fill: ['#2d4d1f', '#355a24', '#2a481c'], rib: '#183010' },
    ]
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const x = R(0, T)
        const y = R(0, T)
        const len = R(L.len[0], L.len[1])
        const angle = R(0, 360)
        const fill = pick(L.fill)
        body += wrapped(x, y, len, (px, py) => leaf(px, py, len, len * R(0.28, 0.4), angle, fill, L.rib))
      }
    }
    body += wrapped(0, 0, 0, () => '')
  } else if (b.outside === 'rock') {
    body += `<rect width="${T}" height="${T}" fill="#15110d"/>`
    for (let i = 0; i < 70; i++) {
      const x = R(0, T)
      const y = R(0, T)
      const r = R(25, 70)
      const c = pick(['#1d1813', '#221c16', '#191510', '#261f18'])
      const d = blob(0, 0, r, 0.35, 7)
      body += wrapped(x, y, r * 1.4, (px, py) => `<g transform="translate(${f(px)} ${f(py)})"><path d="${d}" fill="${c}"/><path d="${d}" fill="url(#sheen)"/></g>`)
    }
    for (let i = 0; i < 18; i++) {
      let x = R(0, T)
      let y = R(0, T)
      let d = `M${f(x)} ${f(y)}`
      for (let k = 0; k < 5; k++) {
        x += R(-40, 40)
        y += R(-40, 40)
        d += ` L${f(x)} ${f(y)}`
      }
      body += `<path d="${d}" stroke="#000" stroke-opacity="0.55" stroke-width="2" fill="none"/>`
    }
  } else {
    body += `<rect width="${T}" height="${T}" fill="#06070a"/>`
    for (let i = 0; i < 40; i++) {
      const x = R(0, T)
      const y = R(0, T)
      const r = R(30, 90)
      const d = blob(0, 0, r, 0.4, 7)
      body += wrapped(x, y, r * 1.4, (px, py) => `<g transform="translate(${f(px)} ${f(py)})"><path d="${d}" fill="${pick(['#0b0d11', '#0d1014', '#090b0e'])}"/><path d="${d}" fill="url(#sheen)" opacity="0.6"/></g>`)
    }
    for (let i = 0; i < 26; i++) {
      const x = R(0, T)
      const y = R(0, T)
      body += wrapped(x, y, 4, (px, py) => `<circle cx="${f(px)}" cy="${f(py)}" r="${f(R(0.8, 1.8))}" fill="${b.vein}" fill-opacity="${f(R(0.15, 0.45))}"/>`)
    }
  }
  return svg(T, T, body)
}

// ---------------------------------------------------------------------------
// Hallway paving: tiles along x, exactly one hallway (180) wide.

function pathTile(b) {
  rnd = rngFrom(`path-${b.name}`)
  const W = 256
  const H = 180
  let body = `<defs>${COMMON_DEFS}</defs><rect width="${W}" height="${H}" fill="${b.grout}"/>`
  // Kerb stones along both edges.
  for (const [y0, y1] of [[0, 30], [H - 30, H]]) {
    let x = 0
    const lens = [64, 64, 64, 64]
    for (const l of lens) {
      body += stone(inset([[x, y0], [x + l, y0], [x + l, y1], [x, y1]], 2.5), shade(b.band ?? b.path[0], R(-0.05, 0.03)))
      x += l
    }
  }
  // Cobbles between, wrapped at the tile's ends.
  for (let row = 0; row < 3; row++) {
    const y0 = 30 + row * 40
    let x = row % 2 ? -24 : 0
    while (x < W) {
      const l = R(38, 58)
      const make = (ox) => stone(inset([[x + ox + R(-2, 2), y0 + R(-2, 2)], [x + l + ox, y0], [x + l + ox, y0 + 40], [x + ox, y0 + 40]], 3), shade(pick(b.path), R(-0.05, 0.05)), { crack: rnd() < 0.12 })
      body += make(0)
      if (x < 0) body += make(W)
      if (x + l > W) body += make(-W)
      x += l
    }
  }
  if (b.moss.length) for (let i = 0; i < 3; i++) body += moss(R(20, W - 20), R(40, H - 40), R(10, 22), b)
  body += speckles([0, W], [0, H], 90)
  return svg(W, H, body)
}

// ---------------------------------------------------------------------------
// Wall tops: coping stones seen from above, tiling along x. 40 thick, centred on the wall line.

function wallTile(b) {
  rnd = rngFrom(`wall-${b.name}`)
  const W = 192
  const H = 40
  let body = `<defs>${COMMON_DEFS}</defs><rect width="${W}" height="${H}" fill="${b.grout}"/>`
  let x = 0
  for (const l of [52, 44, 56, 40]) {
    body += stone(inset([[x, 0], [x + l, 0], [x + l, H], [x, H]], 2.5), shade(pick(b.wall), R(-0.04, 0.05)), { crack: rnd() < 0.3 })
    x += l
  }
  if (b.moss.length) for (let i = 0; i < 2; i++) body += moss(R(10, W - 10), R(8, H - 8), R(6, 12), b)
  body += speckles([0, W], [0, H], 30)
  return svg(W, H, body)
}

/** A column capital at wall corners, seen from directly above. */
function pillar(b) {
  rnd = rngFrom(`pillar-${b.name}`)
  const S = 72
  const c = S / 2
  const base = b.wall[0]
  let body = `<defs>${COMMON_DEFS}
    <radialGradient id="cap" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="${shade(base, 0.18)}"/><stop offset="1" stop-color="${shade(base, -0.35)}"/></radialGradient></defs>`
  const oct = (r) => Array.from({ length: 8 }, (_, i) => [c + r * Math.cos((i * Math.PI) / 4 + Math.PI / 8), c + r * Math.sin((i * Math.PI) / 4 + Math.PI / 8)])
  body += `<circle cx="${c + 3}" cy="${c + 4}" r="${c - 2}" fill="url(#soft)"/>`
  body += stone(oct(c - 3), shade(base, -0.1))
  body += `<polygon points="${pts(oct(c - 11))}" fill="url(#cap)" stroke="#000" stroke-opacity="0.45" stroke-width="2"/>`
  body += `<circle cx="${c}" cy="${c}" r="${c - 22}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>`
  body += `<circle cx="${c - 1}" cy="${c - 1}" r="${c - 22}" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="1"/>`
  if (b.moss.length) body += moss(c + R(-10, 10), c + R(-10, 10), 9, b)
  return svg(S, S, body)
}

// ---------------------------------------------------------------------------
// Standing pieces, three-quarter view. WALL_H must match the game's wall height.

const WALL_H = 140

/** A fluted column the height of the walls, with a square capital and base. */
function column(b) {
  rnd = rngFrom(`column-${b.name}`)
  const W = 60
  const H = WALL_H + 30
  const base = b.wall[0]
  const x0 = 12
  const x1 = W - 12
  let body = `<defs>${COMMON_DEFS}
    <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(base, 0.15)}"/><stop offset="0.35" stop-color="${shade(base, 0.05)}"/><stop offset="1" stop-color="${shade(base, -0.45)}"/></linearGradient>
    <linearGradient id="block" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(base, 0.1)}"/><stop offset="1" stop-color="${shade(base, -0.35)}"/></linearGradient></defs>`
  body += `<ellipse cx="${W / 2 + 6}" cy="${H - 4}" rx="${W / 2}" ry="7" fill="url(#soft)"/>`
  // Base block, shaft with flutes, capital block with its top face showing.
  body += `<path d="M6 ${H - 16} L${W - 6} ${H - 16} L${W - 6} ${H - 2} L6 ${H - 2} Z" fill="url(#block)" stroke="#000" stroke-opacity="0.5" stroke-width="1.5"/>`
  body += `<path d="M${x0} 26 L${x1} 26 L${x1} ${H - 16} L${x0} ${H - 16} Z" fill="url(#shaft)" stroke="#000" stroke-opacity="0.5" stroke-width="1.5"/>`
  for (let i = 1; i < 5; i++) {
    const x = x0 + ((x1 - x0) * i) / 5
    body += `<path d="M${f(x)} 30 L${f(x)} ${H - 20}" stroke="#000" stroke-opacity="0.28" stroke-width="2"/><path d="M${f(x - 1.5)} 30 L${f(x - 1.5)} ${H - 20}" stroke="#fff" stroke-opacity="0.1" stroke-width="1"/>`
  }
  for (let i = 0; i < 3; i++) body += crack([[x0, R(40, H - 40)], [x1, R(40, H - 40)], [R(x0, x1), R(40, H - 40)]])
  body += `<path d="M4 14 L${W - 4} 14 L${W - 4} 28 L4 28 Z" fill="url(#block)" stroke="#000" stroke-opacity="0.5" stroke-width="1.5"/>`
  body += `<path d="M4 14 L12 4 L${W - 4} 4 L${W - 4} 14 Z" fill="${shade(base, 0.12)}" stroke="#000" stroke-opacity="0.45" stroke-width="1.5"/>`
  body += `<path d="M14 5.5 L${W - 6} 5.5" stroke="#fff" stroke-opacity="0.25" stroke-width="1"/>`
  if (b.moss.length) {
    body += moss(x0 + 6, H - 22, 8, b) + moss(W - 12, 10, 6, b)
  }
  return svg(W, H, body)
}

/** A standing iron brazier on three legs, burning. */
function brazierStand(b) {
  rnd = rngFrom(`brazier-stand-${b.name}`)
  const W = 64
  const H = 96
  const [core, mid, outer] = b.brazierFire
  let body = `<defs>${COMMON_DEFS}
    <linearGradient id="iron" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a5048"/><stop offset="1" stop-color="#191512"/></linearGradient>
    <radialGradient id="flame" cx="50%" cy="80%" r="70%"><stop offset="0" stop-color="${core}"/><stop offset="0.45" stop-color="${mid}"/><stop offset="1" stop-color="${outer}" stop-opacity="0"/></radialGradient></defs>`
  body += `<ellipse cx="${W / 2 + 4}" cy="${H - 5}" rx="24" ry="6" fill="url(#soft)"/>`
  body += `<g stroke="#0d0b09" stroke-width="2" stroke-linecap="round" fill="none"><path d="M${W / 2} 50 L14 ${H - 4}"/><path d="M${W / 2} 50 L${W - 14} ${H - 4}"/><path d="M${W / 2} 50 L${W / 2 + 2} ${H - 2}"/></g>`
  body += `<g stroke="url(#iron)" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M${W / 2} 50 L14 ${H - 4}"/><path d="M${W / 2} 50 L${W - 14} ${H - 4}"/><path d="M${W / 2} 50 L${W / 2 + 2} ${H - 2}"/></g>`
  body += `<path d="M8 40 C10 54 54 54 56 40 Z" fill="url(#iron)" stroke="#0d0b09" stroke-width="2"/>`
  body += `<ellipse cx="${W / 2}" cy="40" rx="24" ry="6" fill="#120d09" stroke="#0d0b09" stroke-width="2"/>`
  for (let i = 0; i < 10; i++) body += `<circle cx="${f(W / 2 + R(-18, 18))}" cy="${f(40 + R(-3, 3))}" r="${f(R(2, 3.5))}" fill="${pick([outer, mid, '#3a1a0c'])}"/>`
  body += `<path d="M14 40 C14 26 24 16 30 2 C33 14 38 18 42 8 C45 20 52 28 50 40 Z" fill="url(#flame)"/>`
  body += `<path d="M24 40 C24 32 29 26 32 18 C35 26 40 32 40 40 Z" fill="${core}" fill-opacity="0.8"/>`
  body += `<path d="M10 43 C16 47 26 48 32 48" stroke="#fff" stroke-opacity="0.18" stroke-width="1.5" fill="none"/>`
  return svg(W, H, body)
}

/** A torch in an iron bracket, for fixing to a wall face. Flame at the top. */
function torch(b) {
  rnd = rngFrom(`torch-${b.name}`)
  const W = 28
  const H = 64
  const [core, mid, outer] = b.brazierFire
  let body = `<defs><radialGradient id="tflame" cx="50%" cy="80%" r="70%"><stop offset="0" stop-color="${core}"/><stop offset="0.5" stop-color="${mid}"/><stop offset="1" stop-color="${outer}" stop-opacity="0"/></radialGradient></defs>`
  body += `<path d="M10 ${H - 6} L18 ${H - 6} L17 ${H} L11 ${H} Z" fill="#2a2420" stroke="#0d0b09" stroke-width="1.5"/>`
  body += `<path d="M14 ${H - 6} L14 ${H - 14}" stroke="#2a2420" stroke-width="3"/>`
  body += `<path d="M11 24 L17 24 L16 ${H - 12} L12 ${H - 12} Z" fill="#5a3a20" stroke="#140d07" stroke-width="1.5"/>`
  body += `<path d="M9 22 L19 22 L18 28 L10 28 Z" fill="#3a2a1a" stroke="#140d07" stroke-width="1.5"/>`
  body += `<path d="M5 24 C5 14 10 10 14 0 C16 8 20 10 22 6 C24 14 24 20 23 24 Z" fill="url(#tflame)"/>`
  body += `<path d="M10 24 C10 18 13 14 14 8 C16 14 18 18 18 24 Z" fill="${core}" fill-opacity="0.85"/>`
  return svg(W, H, body)
}

// ---------------------------------------------------------------------------
// Props and decals

function brazier(b) {
  rnd = rngFrom(`brazier-${b.name}`)
  const S = 96
  const c = S / 2
  const [core, mid, outer] = b.brazierFire
  let body = `<defs>${COMMON_DEFS}
    <radialGradient id="bowl" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#6b5a45"/><stop offset="1" stop-color="#211a12"/></radialGradient>
    <radialGradient id="fire" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${core}"/><stop offset="0.45" stop-color="${mid}"/><stop offset="1" stop-color="${outer}" stop-opacity="0"/></radialGradient>
  </defs>`
  body += `<circle cx="${c + 4}" cy="${c + 5}" r="40" fill="url(#soft)"/>`
  // Three stone feet, a metal bowl, embers and a flame seen from above.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5
    body += `<circle cx="${f(c + Math.cos(a) * 34)}" cy="${f(c + Math.sin(a) * 34)}" r="7" fill="${shade(b.wall[0], -0.2)}" stroke="#000" stroke-opacity="0.5" stroke-width="1.5"/>`
  }
  body += `<circle cx="${c}" cy="${c}" r="30" fill="url(#bowl)" stroke="#141110" stroke-width="2.5"/>`
  body += `<circle cx="${c}" cy="${c}" r="23" fill="#120d09"/>`
  for (let i = 0; i < 18; i++) {
    const a = R(0, 6.28)
    const d = R(0, 19)
    body += `<circle cx="${f(c + Math.cos(a) * d)}" cy="${f(c + Math.sin(a) * d)}" r="${f(R(2, 4))}" fill="${pick([outer, mid, '#3a1a0c'])}"/>`
  }
  body += `<circle cx="${c}" cy="${c}" r="20" fill="url(#fire)"/>`
  body += `<path d="${blob(c, c, 9, 0.5, 9)}" fill="${core}" fill-opacity="0.9"/>`
  body += `<path d="M${c - 22} ${c - 14} A26 26 0 0 1 ${c + 8} ${c - 25}" stroke="#fff" stroke-opacity="0.25" stroke-width="2" fill="none"/>`
  return svg(S, S, body)
}

function rubble(b) {
  rnd = rngFrom(`rubble-${b.name}`)
  const S = 160
  let body = `<defs>${COMMON_DEFS}</defs>`
  for (let i = 0; i < 9; i++) {
    const x = R(30, S - 30)
    const y = R(30, S - 30)
    const r = R(8, 22)
    const n = 5 + Math.floor(R(0, 3))
    const ps = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + R(-0.3, 0.3)
      return [x + Math.cos(a) * r * R(0.7, 1.1), y + Math.sin(a) * r * R(0.7, 1.1)]
    })
    body += `<ellipse cx="${f(x + 3)}" cy="${f(y + 4)}" rx="${f(r)}" ry="${f(r * 0.9)}" fill="url(#soft)"/>`
    body += stone(ps, shade(pick(b.stones), R(-0.1, 0.05)))
  }
  return svg(S, S, body)
}

function puddle(b) {
  rnd = rngFrom(`puddle-${b.name}`)
  const W = 220
  const H = 150
  const water = b.vein ? '#0a1416' : b.outside === 'jungle' ? '#16221d' : '#141614'
  const glint = b.vein ? b.vein : '#c9d6d0'
  const d = blob(W / 2, H / 2, 58, 0.25, 14)
  let body = `<defs><radialGradient id="pw" cx="40%" cy="38%" r="65%"><stop offset="0" stop-color="${shade(water, 0.25)}"/><stop offset="1" stop-color="${water}"/></radialGradient></defs>`
  body += `<path d="${d}" fill="#000" fill-opacity="0.35" transform="translate(0 0) scale(1.06) translate(${f(-W * 0.03)} ${f(-H * 0.03)})"/>`
  body += `<g transform="translate(${W / 2} ${H / 2}) scale(1.5 1) translate(${-W / 2} ${-H / 2})"><path d="${d}" fill="url(#pw)" fill-opacity="0.92"/>`
  body += `<path d="M${W / 2 - 30} ${H / 2 - 22} q 20 -10 44 -4" stroke="${glint}" stroke-opacity="0.35" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`
  return svg(W, H, body)
}

function vines(b) {
  rnd = rngFrom(`vines-${b.name}`)
  const W = 360
  const H = 110
  let body = `<defs><linearGradient id="leafsheen" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0.15"/></linearGradient></defs>`
  for (let s = 0; s < 2; s++) {
    let x = 10
    let y = H / 2 + R(-15, 15)
    let d = `M${f(x)} ${f(y)}`
    const nodes = []
    while (x < W - 20) {
      const nx = x + R(30, 50)
      const ny = H / 2 + R(-28, 28)
      d += ` Q${f((x + nx) / 2)} ${f(y + R(-25, 25))} ${f(nx)} ${f(ny)}`
      nodes.push([nx, ny])
      x = nx
      y = ny
    }
    body += `<path d="${d}" stroke="#1b2a10" stroke-width="5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#4a6a2a" stroke-width="2" fill="none" stroke-linecap="round" transform="translate(-0.8 -0.8)"/>`
    for (const [nx, ny] of nodes) {
      body += leaf(nx, ny, R(16, 26), R(6, 10), R(0, 360), pick(['#3f6a25', '#4d7a2c', '#355a20']), '#1d3312')
    }
  }
  return svg(W, H, body)
}

function foliage(b) {
  rnd = rngFrom(`foliage-${b.name}`)
  const S = 260
  const c = S / 2
  let body = `<defs><linearGradient id="leafsheen" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.2"/></linearGradient>
    <radialGradient id="fsoft" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`
  body += `<circle cx="${c + 10}" cy="${c + 12}" r="${c - 10}" fill="url(#fsoft)"/>`
  // A clump of broad leaves radiating from a hidden stem, with a few monstera-style splits.
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + R(-15, 15)
    const len = R(80, 118)
    const wid = len * R(0.36, 0.46)
    const fill = pick(['#2f5220', '#386226', '#2a4a1c', '#41702b'])
    body += leaf(c, c, len, wid, a, fill, '#173010')
    // Splits: dark notches cut into the leaf edge.
    const rad = ((a - 90) * Math.PI) / 180
    for (let k = 1; k <= 3; k++) {
      const t = 0.3 + k * 0.17
      const px = c + Math.cos(rad) * len * t
      const py = c + Math.sin(rad) * len * t
      const side = k % 2 ? 1 : -1
      const qx = px + Math.cos(rad + side * 1.3) * wid * 0.55
      const qy = py + Math.sin(rad + side * 1.3) * wid * 0.55
      body += `<path d="M${f(px)} ${f(py)} L${f(qx)} ${f(qy)}" stroke="#0c160a" stroke-width="3" stroke-linecap="round"/>`
    }
  }
  return svg(S, S, body)
}

function roots(b) {
  rnd = rngFrom(`roots-${b.name}`)
  const W = 380
  const H = 200
  let body = ''
  const branch = (x, y, a, w, depth) => {
    let d = `M${f(x)} ${f(y)}`
    let s = ''
    for (let k = 0; k < 5; k++) {
      a += R(-0.35, 0.35)
      const nx = x + Math.cos(a) * R(25, 40)
      const ny = y + Math.sin(a) * R(25, 40)
      d += ` Q${f(x + R(-8, 8))} ${f(y + R(-8, 8))} ${f(nx)} ${f(ny)}`
      x = nx
      y = ny
      if (depth < 2 && rnd() < 0.35) s += branch(x, y, a + R(-1, 1), w * 0.6, depth + 1)
    }
    return `<path d="${d}" stroke="#000" stroke-opacity="0.45" stroke-width="${f(w + 3)}" fill="none" stroke-linecap="round" transform="translate(2 3)"/><path d="${d}" stroke="#3a2a1a" stroke-width="${f(w)}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#6b5236" stroke-opacity="0.6" stroke-width="${f(Math.max(1, w * 0.3))}" fill="none" stroke-linecap="round" transform="translate(-1 -1)"/>` + s
  }
  body += branch(10, H / 2, 0, 12, 0) + branch(10, H / 2 + 20, 0.3, 8, 1)
  return svg(W, H, body)
}

function threshold(b) {
  rnd = rngFrom(`threshold-${b.name}`)
  const W = 72
  const H = 196
  let body = `<defs>${COMMON_DEFS}</defs>`
  body += stone(inset([[0, 0], [W, 0], [W, H], [0, H]], 3), shade(b.band, 0.04), { crack: true })
  body += `<line x1="${W / 2}" y1="10" x2="${W / 2}" y2="${H - 10}" stroke="#000" stroke-opacity="0.35" stroke-width="3"/>`
  return svg(W, H, body)
}

function light() {
  const S = 256
  return svg(S, S, `<defs><radialGradient id="l" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="128" fill="url(#l)"/>`)
}

// ---------------------------------------------------------------------------

function write(rel, content) {
  const p = join(OUT, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
}

for (const [name, b] of Object.entries(BIOMES)) {
  b.name = name
  for (const v of ['a', 'b', 'c', 'd']) write(`${name}/floor-${v}.svg`, floorHex(b, v))
  write(`${name}/outside.svg`, outsideTile(b))
  write(`${name}/path.svg`, pathTile(b))
  write(`${name}/wall.svg`, wallTile(b))
  write(`${name}/pillar.svg`, pillar(b))
  write(`${name}/brazier.svg`, brazier(b))
  write(`${name}/rubble.svg`, rubble(b))
  write(`${name}/puddle.svg`, puddle(b))
  write(`${name}/threshold.svg`, threshold(b))
  write(`${name}/column.svg`, column(b))
  write(`${name}/brazier-stand.svg`, brazierStand(b))
  write(`${name}/torch.svg`, torch(b))
  if (name === 'surface') {
    write(`${name}/vines.svg`, vines(b))
    write(`${name}/foliage.svg`, foliage(b))
  }
  if (name === 'underground') write(`${name}/roots.svg`, roots(b))
}
write('light.svg', light())
console.log('environment art written to', OUT)
