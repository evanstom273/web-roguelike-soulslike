// Generates the playable characters in src/game/art/characters/<class>/<dir>-<part>.svg.
// Run with `npm run art:characters`. Three-quarter view, light from the top-left.
//
// Every character shares one skeleton so weapons and animation fit them all:
//   96 x 128 canvas, feet at (48, 118), hips at y 86.
//   Hands (right, left): s (28,86) (68,86) · se (39.5,92) (68,78) · e (56,92) (56,72)
//                        ne (68,86) (39.5,72) · n (68,78) (28,78)
// Each direction is split into layers the game animates separately, back to front:
//   back  - capes, scarf tails and far limbs behind the legs
//   leg-a - the leg on screen left (in side views, the far leg)
//   leg-b - the other leg
//   body  - everything else
// Westward directions are these mirrored in the game.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/game/art/characters')
const DIRS = ['s', 'se', 'e', 'ne', 'n']

const DEFS = `<defs>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3c7cb"/><stop offset="0.45" stop-color="#7f8489"/><stop offset="1" stop-color="#3a3e42"/></linearGradient>
    <linearGradient id="steelD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d9297"/><stop offset="1" stop-color="#2b2e32"/></linearGradient>
    <linearGradient id="helmG" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#d2d6d9"/><stop offset="0.5" stop-color="#868b90"/><stop offset="1" stop-color="#34373b"/></linearGradient>
    <linearGradient id="capeG" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#8e1f1c"/><stop offset="0.6" stop-color="#651414"/><stop offset="1" stop-color="#3a0b0c"/></linearGradient>
    <linearGradient id="furG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#806b53"/><stop offset="1" stop-color="#3b2f24"/></linearGradient>
    <linearGradient id="leatherG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b4a2e"/><stop offset="1" stop-color="#33220f"/></linearGradient>
    <linearGradient id="quiltG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d6a4f"/><stop offset="1" stop-color="#3a2d1e"/></linearGradient>
    <linearGradient id="hoodG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4e4438"/><stop offset="0.6" stop-color="#2c251d"/><stop offset="1" stop-color="#16120d"/></linearGradient>
    <linearGradient id="scarfG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f8a8a"/><stop offset="0.6" stop-color="#245a5e"/><stop offset="1" stop-color="#123236"/></linearGradient>
    <linearGradient id="trouserG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a3f34"/><stop offset="1" stop-color="#231c15"/></linearGradient>
    <linearGradient id="robeG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f3e80"/><stop offset="0.55" stop-color="#2e2350"/><stop offset="1" stop-color="#150f28"/></linearGradient>
    <linearGradient id="robeD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#352a5c"/><stop offset="1" stop-color="#110c22"/></linearGradient>
    <linearGradient id="hatG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a4d42"/><stop offset="0.6" stop-color="#2e251e"/><stop offset="1" stop-color="#15110d"/></linearGradient>
    <linearGradient id="skinG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2cfb0"/><stop offset="1" stop-color="#9c8466"/></linearGradient>
    <pattern id="mail" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#3d4145"/><circle cx="1.5" cy="1.5" r="0.9" fill="#80858a"/></pattern>
  </defs>`

const svg = (comment, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128" width="96" height="128">\n  <!-- ${comment} -->\n  ${DEFS}\n  <g stroke="#16181a" stroke-width="1.2" stroke-linejoin="round">\n${body}  </g>\n</svg>\n`

const P = (d, fill, extra = '') => `    <path d="${d}" fill="${fill}"${extra}/>\n`
const line = (d, stroke, w = 1, op = 1) => `    <path d="${d}" stroke="${stroke}" stroke-width="${w}" stroke-opacity="${op}" fill="none"/>\n`
const circ = (x, y, r, fill, extra = '') => `    <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${extra}/>\n`

// ---------------------------------------------------------------------------
// Shared pieces

/** A glove or gauntlet centred on a hand point. */
const hand = (x, y, fill) => P(`M${x - 5} ${y - 5} L${x + 5} ${y - 5} L${x + 5} ${y + 3} C${x + 2} ${y + 5.5} ${x - 2} ${y + 5.5} ${x - 5} ${y + 3} Z`, fill) + line(`M${x - 3.5} ${y - 1} L${x + 3.5} ${y - 1}`, '#16181a', 0.7)
const bareHand = (x, y) => P(`M${x - 4} ${y - 4} C${x - 1} ${y - 6} ${x + 3} ${y - 5} ${x + 4.5} ${y - 2} C${x + 4.5} ${y + 2} ${x + 2} ${y + 4.5} ${x - 1} ${y + 4} C${x - 4} ${y + 3} ${x - 5} ${y} ${x - 4} ${y - 4} Z`, 'url(#skinG)', ' stroke="#3a2c1e"')

/** A leg from the hip (y 86) to the foot (y 118), x0..x1 wide. */
function leg(x0, x1, kind, dark = false) {
  const m = (x0 + x1) / 2
  if (kind === 'plate') {
    return P(`M${x0} 86 L${x1} 86 L${x1 - 0.5} 111 L${x0 + 0.5} 111 Z`, dark ? '#2f3236' : 'url(#steelD)') + circ(m, 98, 4, dark ? 'url(#steelD)' : 'url(#steel)') + P(`M${x0 - 2} 109 L${x1 + 1} 109 L${x1 + 2} 118 C${m + 3} 119.5 ${m - 3} 119.5 ${x0 - 3} 118 Z`, dark ? '#1f2225' : '#2a2d30')
  }
  if (kind === 'cloth') {
    return P(`M${x0} 86 L${x1} 86 L${x1 - 0.5} 104 L${x0 + 0.5} 104 Z`, dark ? '#211a14' : 'url(#trouserG)') + line(`M${m} 90 L${m} 102`, '#000', 0.8, 0.4) + P(`M${x0 - 1} 101 L${x1 + 1} 101 L${x1 + 1.5} 112 L${x1 + 2.5} 118 C${m + 3} 119.5 ${m - 3} 119.5 ${x0 - 2.5} 118 L${x0 - 0.5} 112 Z`, dark ? '#1d130a' : 'url(#leatherG)') + line(`M${x0} 104 L${x1} 104`, '#8a6440', 1, dark ? 0.2 : 0.6)
  }
  // Robed: only a boot shows under the hem.
  return P(`M${x0 - 1} 108 L${x1 + 1} 108 L${x1 + 2} 118 C${m + 3} 119.5 ${m - 3} 119.5 ${x0 - 2} 118 Z`, dark ? '#120e0a' : '#2a2018')
}

const legsFor = (dir, kind) => {
  if (dir === 'e') return [leg(41, 49, kind, true), leg(47, 56, kind)]
  if (dir === 'n' || dir === 'ne') return [leg(37, 46, kind, dir === 'ne'), leg(50, 59, kind, true)]
  const dx = dir === 'se' ? -1 : 0
  return [leg(37 + dx, 47 + dx, kind), leg(49 + dx, 59 + dx, kind, true)]
}

// ---------------------------------------------------------------------------
// Warrior: great helm, plate, fur mantle, red cape.

function helm(cx, slit, back = false, bx = 6) {
  let s = P(`M${cx - 12} 17 C${cx - 12} 12.5 ${cx - 7} 10 ${cx} 10 C${cx + 7} 10 ${cx + 12} 12.5 ${cx + 12} 17 L${cx + 12.5} 37 C${cx + 8} 40.5 ${cx - 8} 40.5 ${cx - 12.5} 37 Z`, 'url(#helmG)')
  s += `    <ellipse cx="${cx}" cy="12.5" rx="11.5" ry="3" fill="#dfe2e5" stroke-width="0.9"/>\n`
  s += line(`M${cx - 10} 15.5 C${cx - 9.5} 26 ${cx - 9.5} 32 ${cx - 9.5} 35`, '#fff', 1.2, 0.45)
  if (back) {
    s += line(`M${cx - 12} 27 C${cx - 6} 29 ${cx + 6} 29 ${cx + 12} 27`, '#4a4e52', 2.2)
    for (const dx of [-8, 0, 8]) s += circ(cx + dx, dx ? 28 : 28.8, 0.9, '#d6d9dc', ' stroke-width="0.4"')
  } else {
    const [x0, x1, ridge] = slit
    s += P(`M${ridge - 1} 13 L${ridge + 1} 13 L${ridge + 1.3} 38.5 L${ridge - 0.7} 38.5 Z`, '#5d6267', ' stroke-width="0.6"')
    s += `    <rect x="${x0}" y="22" width="${x1 - x0}" height="3" fill="#0b0c0d" stroke="none"/>\n`
    for (const [dx, dy] of [[0, 31], [2.5, 31], [0, 33.5], [2.5, 33.5]]) s += circ(ridge + bx + dx, dy, 0.8, '#0b0c0d', ' stroke="none"')
  }
  return s
}
function pauldron(cx, k, f1 = 'url(#steel)', f2 = 'url(#steelD)', light = true) {
  let s = P(`M${cx - 2 * k} 53 C${cx - 4 * k} 43 ${cx + 4 * k} 36.5 ${cx + 17 * k} 38 C${cx + 21.5 * k} 40 ${cx + 21.5 * k} 46 ${cx + 18.5 * k} 50 C${cx + 11 * k} 53 ${cx + 4 * k} 54 ${cx - 2 * k} 53 Z`, f1)
  s += P(`M${cx - k} 53 C${cx + 5 * k} 55.5 ${cx + 13 * k} 55.5 ${cx + 18.5 * k} 51.5 L${cx + 18 * k} 56 C${cx + 12 * k} 58.5 ${cx + 4.5 * k} 58.5 ${cx - 0.5 * k} 56.5 Z`, f2)
  s += P(`M${cx} 56.5 C${cx + 5 * k} 59 ${cx + 12 * k} 59 ${cx + 17.5 * k} 56 L${cx + 17 * k} 60 C${cx + 11.5 * k} 62 ${cx + 5 * k} 62 ${cx + 0.5 * k} 60 Z`, f2)
  if (light) s += line(`M${cx + k} 46 C${cx + 4 * k} 41 ${cx + 10 * k} 39 ${cx + 15 * k} 39.5`, '#f4f6f7', 1, 0.8)
  return s
}
function fur(x0, x1) {
  const w = x1 - x0
  const p = (t) => +(x0 + w * t).toFixed(1)
  return P(`M${p(0)} 43 C${p(0.11)} 36 ${p(0.89)} 36 ${p(1)} 43 L${p(0.94)} 47.5 L${p(0.83)} 45 L${p(0.72)} 48.5 L${p(0.61)} 45.5 L${p(0.5)} 49 L${p(0.39)} 45.5 L${p(0.28)} 48.5 L${p(0.17)} 45 L${p(0.06)} 47.5 Z`, 'url(#furG)')
}

const WARRIOR = {
  legs: 'plate',
  s: {
    back: P('M30 46 C23 62 19 90 17 116 L24 113 L29 117 L35 113 L61 113 L67 117 L72 113 L79 116 C77 90 73 62 66 46 Z', 'url(#capeG)'),
    body:
      P('M32 73 L64 73 L66 89 C55 91 41 91 30 89 Z', 'url(#mail)') + P('M33.5 73 L47 73 L46.5 85 L33 84 Z', 'url(#steel)') + P('M49 73 L62.5 73 L63 84 L49.5 85 Z', 'url(#steelD)') +
      P('M32 44 C40 40.5 56 40.5 64 44 L65.5 66 C60 73 36 73 30.5 66 Z', 'url(#steel)') + line('M48 44 L48 70', '#2a2d30') + line('M36 47 C40 45 44 44.5 46 44.5', '#eef0f2', 1, 0.8) +
      P('M30.5 70 L65.5 70 L65.5 75 L30.5 75 Z', 'url(#leatherG)') + `    <rect x="45.5" y="70.5" width="5" height="4" fill="#b08a3e" stroke-width="0.7"/>\n` +
      P('M23 50 L32 50 L33 71 L24 71 Z', 'url(#steel)') + P('M64 50 L73 50 L72 71 L63 71 Z', 'url(#steelD)') + circ(28, 67, 3.4, 'url(#steel)') + circ(68, 67, 3.4, 'url(#steelD)') +
      P('M23.5 70 L32.5 70 L32 80 L24.5 80 Z', 'url(#steelD)') + P('M63.5 70 L72.5 70 L71.5 80 L64 80 Z', 'url(#steelD)') +
      hand(28, 84, 'url(#steel)') + hand(68, 84, 'url(#steelD)') + pauldron(17, 1) + pauldron(79, -1, 'url(#steelD)', 'url(#steelD)', false) + fur(30, 66) + helm(48, [37.5, 58.5, 48]),
  },
  se: {
    back: P('M62 52 L70 52 L70 70 L63 72 Z', '#3a3e42') + hand(68, 76, '#3a3e42') + P('M36 44 C27 58 21 86 18 115 L25 112 L30 116 L36 112 L44 112 L46 60 Z', 'url(#capeG)') + line('M33 52 C27 70 24 92 23 110', '#3a0b0c', 1.2),
    body:
      P('M33 73 L63 73 L64 89 C54 91 42 91 32 89 Z', 'url(#mail)') + P('M35 73 L48 73 L47.5 85 L34.5 84 Z', 'url(#steel)') + P('M50 73 L61.5 73 L62 84 L50.5 85 Z', 'url(#steelD)') +
      P('M34 44 C41 40.5 55 40.5 62 44.5 C64.5 52 64.5 60 63 67 C57.5 73 39 73 33 67 Z', 'url(#steel)') + line('M52 44 L53.5 70', '#2a2d30') + line('M38 47 C42 45 46 44.5 49 44.5', '#eef0f2', 1, 0.8) +
      P('M33 70 L63.5 70 L63.5 75 L33 75 Z', 'url(#leatherG)') + `    <rect x="50" y="70.5" width="5" height="4" fill="#b08a3e" stroke-width="0.7"/>\n` +
      P('M30 51 L39 51 L41 73 L33 74 Z', 'url(#steel)') + circ(36.5, 70, 3.4, 'url(#steel)') + P('M33 73 L41 72 L42 87 L35 88 Z', 'url(#steelD)') + hand(39.5, 90, 'url(#steel)') +
      pauldron(24, 1) + pauldron(75, -1, 'url(#steelD)', '#33373b', false) + fur(33, 64) + helm(51, [42, 62, 55], false, 3),
  },
  e: {
    back: P('M52 52 L58 52 L60 68 L55 70 Z', '#34373b') + hand(57, 71, '#3a3e42') + P('M44 42 C34 46 24 62 18 84 C15 96 14 108 14 116 L21 112 L25 117 L31 112 L36 116 L44 111 L46 62 Z', 'url(#capeG)') + line('M38 48 C30 62 26 84 24 110 M42 52 C37 70 34 90 33 110', '#3a0b0c', 1.2),
    body:
      P('M38 73 L60 73 L62 89 C54 91 44 91 37 89 Z', 'url(#mail)') + P('M47 73 L60 73 L61 85 L48 86 Z', 'url(#steel)') +
      P('M40 44 C46 40.5 55 41 61 45 C63.5 52 63.5 61 61.5 68 C56 73 44 73 39 68 C37.5 60 37.5 51 40 44 Z', 'url(#steel)') + line('M43 47 C47 44.5 52 44.2 56 45', '#eef0f2', 1, 0.8) +
      P('M38.5 70 L62 70 L62 75 L38.5 75 Z', 'url(#leatherG)') + P('M44 54 L52 54 L54 74 L47 75 Z', 'url(#steel)') + circ(50, 72, 3.3, 'url(#steel)') + P('M47 74 L54 73 L57 86 L51 88 Z', 'url(#steelD)') + hand(56, 90, 'url(#steel)') +
      P('M36 52 C33 42 40 36 52 37.5 C57 39 58 45 55 49.5 C48 52.5 41 53.5 36 52 Z', 'url(#steel)') + P('M37 52 C43 54.5 50 54.5 55 51 L54.5 55.5 C49 58 42 58 37.5 56 Z', 'url(#steelD)') + line('M39 45 C42 40.6 47 39 51 39.4', '#f4f6f7', 1, 0.8) +
      fur(42, 60) + helm(51, [55, 63, 60], false, -6),
  },
  ne: {
    back: hand(40, 71, '#33373b'),
    body:
      P('M60 52 L69 52 L71 74 L63 76 Z', 'url(#steelD)') + circ(67, 73, 3.3, 'url(#steelD)') + hand(68, 84, 'url(#steelD)') +
      pauldron(20, 1, 'url(#steelD)', 'url(#steelD)') + pauldron(77, -1, 'url(#steelD)', '#33373b', false) +
      P('M30 41 C40 37 54 37 63 41 C67 56 70 80 73 110 L67 107 L61 112 L55 107 L49 112 L43 107 L37 112 L31 107 L24 110 C26 80 27 56 30 41 Z', 'url(#capeG)') +
      line('M38 44 C36 64 34 86 33 108 M47 44 L48 106 M56 44 C58 64 61 86 63 108', '#3a0b0c', 1.6) + line('M33 44 C31 56 30 66 29 74', '#b33a32', 1, 0.6) +
      fur(30, 64) + helm(47, null, true) + `    <path d="M57 22 L59.5 22 L59.5 25 L57.3 25 Z" fill="#0b0c0d" stroke="none"/>\n`,
  },
  n: {
    back: hand(28, 77, 'url(#steelD)') + hand(68, 77, '#3a3e42') + P('M22 50 L31 50 L31 74 L23 74 Z', 'url(#steelD)') + P('M65 50 L74 50 L73 74 L65 74 Z', '#33373b'),
    body:
      pauldron(17, 1, 'url(#steelD)', 'url(#steelD)') + pauldron(79, -1, '#3a3e42', '#33373b', false) +
      P('M30 41 C40 37 56 37 66 41 C70 56 74 80 78 110 L72 107 L66 112 L60 107 L54 112 L48 107 L42 112 L36 107 L30 112 L24 107 L18 110 C22 80 26 56 30 41 Z', 'url(#capeG)') +
      line('M38 44 C35 64 32 86 30 108 M48 44 L48 106 M58 44 C61 64 64 86 66 108', '#3a0b0c', 1.6) + line('M33 44 C31 56 29 66 28 74', '#b33a32', 1, 0.6) +
      fur(29, 67) + helm(48, null, true),
  },
}

// ---------------------------------------------------------------------------
// Dex: hooded skirmisher in a quilted gambeson, crossed belts, one leather pauldron,
// teal scarf over the mouth with tails streaming behind.

/** Hood with the face lost in shadow and the scarf over the mouth. turn: -1..1 (0 = facing us). */
function hood(cx, turn, back = false) {
  let s = P(`M${cx - 13} 34 C${cx - 15} 22 ${cx - 9} 9 ${cx + 1} 8 C${cx + 11} 8.5 ${cx + 15} 20 ${cx + 13} 34 C${cx + 8} 40 ${cx - 8} 40 ${cx - 13} 34 Z`, 'url(#hoodG)')
  s += line(`M${cx - 10} 30 C${cx - 11} 21 ${cx - 7} 13 ${cx - 1} 11`, '#8a7a62', 1, 0.5)
  if (back) {
    s += line(`M${cx} 9 C${cx + 1} 18 ${cx} 28 ${cx - 1} 38`, '#0d0a07', 1, 0.6)
    return s
  }
  // The opening: a dark oval shifted with the turn, two faint eye-glints, scarf below.
  const ox = cx + turn * 5
  s += P(`M${ox - 7 + turn * 2} 20 C${ox - 7} 15 ${ox + 7} 15 ${ox + 7 - turn * 2} 20 L${ox + 6} 30 C${ox + 2} 32 ${ox - 2} 32 ${ox - 6} 30 Z`, '#0b0908')
  s += circ(ox - 3 + turn, 22.5, 0.7, '#cfe6e3', ' stroke="none"') + circ(ox + 3 + turn, 22.5, 0.7, '#cfe6e3', ' stroke="none"')
  s += P(`M${ox - 8} 27 C${ox - 4} 25 ${ox + 4} 25 ${ox + 8} 27 L${ox + 9} 35 C${ox + 3} 38 ${ox - 3} 38 ${ox - 9} 35 Z`, 'url(#scarfG)')
  s += line(`M${ox - 6} 29 C${ox - 2} 28 ${ox + 2} 28 ${ox + 6} 29`, '#6fc0bc', 0.8, 0.6)
  s += line(`M${cx - 13} 34 C${cx - 15} 22 ${cx - 9} 9 ${cx + 1} 8`, '#3f8a8a', 1.2, 0.7) // teal edging
  return s
}
const gambeson = (x0, x1, top = 44) => {
  const m = (x0 + x1) / 2
  let s = P(`M${x0 + 2} ${top} C${m - 6} ${top - 3} ${m + 6} ${top - 3} ${x1 - 2} ${top} L${x1} 76 L${x1 + 2} 90 C${m + 8} 92 ${m - 8} 92 ${x0 - 2} 90 L${x0} 76 Z`, 'url(#quiltG)')
  for (const t of [0.25, 0.5, 0.75]) s += line(`M${x0 + (x1 - x0) * t} ${top + 2} L${x0 + (x1 - x0) * t} 88`, '#2a1f14', 0.8, 0.5)
  s += line(`M${x0 + 3} ${top + 3} C${m - 4} ${top} ${m} ${top} ${m + 2} ${top + 0.5}`, '#c2a882', 0.9, 0.5)
  return s
}
const belts = (x0, x1) => P(`M${x0} 46 L${x0 + 4} 45 L${x1} 70 L${x1 - 4} 72 Z`, 'url(#leatherG)', ' stroke-width="0.9"') + P(`M${x1} 46 L${x1 - 4} 45 L${x0} 70 L${x0 + 4} 72 Z`, 'url(#leatherG)', ' stroke-width="0.9"') + P(`M${x0 - 1} 74 L${x1 + 1} 74 L${x1 + 1} 78 L${x0 - 1} 78 Z`, 'url(#leatherG)') + `    <rect x="${(x0 + x1) / 2 - 2}" y="${74.5}" width="4" height="3" fill="#b08a3e" stroke-width="0.6"/>\n`
const sleeve = (sx, sy, hx, hy, fill = 'url(#quiltG)') => P(`M${sx - 4.5} ${sy} L${sx + 4.5} ${sy} L${hx + 4} ${hy - 12} L${hx - 4} ${hy - 12} Z`, fill) + P(`M${hx - 4.5} ${hy - 13} L${hx + 4.5} ${hy - 13} L${hx + 4} ${hy - 4} L${hx - 4} ${hy - 4} Z`, 'url(#leatherG)') + circ(hx, hy - 9, 0.8, '#c9cdd1', ' stroke-width="0.4"')
const leatherPauldron = (cx, k) => P(`M${cx - 2 * k} 52 C${cx - 3 * k} 44 ${cx + 4 * k} 38.5 ${cx + 14 * k} 40 C${cx + 18 * k} 42 ${cx + 18 * k} 47 ${cx + 15 * k} 50.5 C${cx + 9 * k} 53 ${cx + 3 * k} 53.5 ${cx - 2 * k} 52 Z`, 'url(#leatherG)') + line(`M${cx + k} 46 C${cx + 4 * k} 42 ${cx + 9 * k} 40.5 ${cx + 13 * k} 41`, '#a37a52', 0.8, 0.6) + circ(cx + 4 * k, 49, 0.8, '#c9cdd1', ' stroke-width="0.4"') + circ(cx + 10 * k, 49.5, 0.8, '#c9cdd1', ' stroke-width="0.4"')
const scarfTail = (d) => P(d, 'url(#scarfG)', ' stroke="#0b1d1f"')

const DEX = {
  legs: 'cloth',
  s: {
    back: scarfTail('M58 40 C66 46 72 56 76 70 L72 69 L74 74 C68 62 62 52 55 46 Z'),
    body: sleeve(29, 50, 28, 86) + sleeve(67, 50, 68, 86) + hand(28, 85, '#3a2716') + hand(68, 85, '#2c1d10') + gambeson(35, 61) + belts(36, 60) + leatherPauldron(62, 1) + hood(48, 0),
  },
  se: {
    back: sleeve(64, 50, 68, 78, '#3a2d1e') + hand(68, 77, '#2c1d10') + scarfTail('M40 40 C32 46 26 56 22 70 L26 69 L24 74 C30 62 36 52 43 46 Z'),
    body: gambeson(36, 61) + belts(37, 60) + sleeve(35, 50, 39.5, 92) + hand(39.5, 91, '#3a2716') + leatherPauldron(61, 1) + hood(50, 0.5),
  },
  e: {
    back: sleeve(52, 50, 56, 72, '#3a2d1e') + hand(56, 71, '#2c1d10') + scarfTail('M44 38 C34 40 24 46 14 52 L17 54 L12 58 C24 54 34 50 44 46 Z') + scarfTail('M44 42 C36 48 28 56 20 66 L23 66 L20 71 C28 62 36 54 45 49 Z'),
    body: gambeson(40, 60) + P('M40 74 L60 74 L60 78 L40 78 Z', 'url(#leatherG)') + P('M43 46 L47 45 L58 70 L54 72 Z', 'url(#leatherG)', ' stroke-width="0.9"') + sleeve(50, 50, 56, 92) + hand(56, 91, '#3a2716') + leatherPauldron(42, 1) + hood(51, 1),
  },
  ne: {
    back: hand(40, 71, '#2c1d10'),
    body: gambeson(36, 60) + P('M38 46 L42 45 L58 70 L54 72 Z', 'url(#leatherG)', ' stroke-width="0.9"') + belts(36, 60).split('\n').slice(2).join('\n') + sleeve(64, 50, 68, 86) + hand(68, 85, '#2c1d10') + scarfTail('M42 40 C40 50 40 62 42 76 L38 74 L37 80 C34 66 35 52 38 42 Z') + hood(46, 0, true) + leatherPauldron(34, -1),
  },
  n: {
    back: sleeve(29, 50, 28, 78, '#3a2d1e') + sleeve(67, 50, 68, 78, '#3a2d1e') + hand(28, 77, '#2c1d10') + hand(68, 77, '#2c1d10'),
    body: gambeson(35, 61) + P('M35 74 L61 74 L61 78 L35 78 Z', 'url(#leatherG)') + scarfTail('M44 40 C42 50 42 62 44 78 L40 76 L39 82 C36 68 37 52 40 42 Z') + scarfTail('M52 40 C56 50 57 60 56 72 L59 70 L60 76 C61 62 60 50 55 42 Z') + leatherPauldron(34, -1) + hood(48, 0, true),
  },
}

// ---------------------------------------------------------------------------
// Magic: broad-brimmed pointed hat, indigo robe with gold trim, mantle and clasp, wide
// sleeves, bare hands.

/** A face half-shadowed by the hat brim. turn: -1..1 (0 = facing us). */
function face(cx, turn) {
  const fx = cx + turn * 3
  let s = P(`M${fx - 6} 33 C${fx - 6.5} 39 ${fx - 3} 44 ${fx} 44 C${fx + 3} 44 ${fx + 6.5} 39 ${fx + 6} 33 Z`, 'url(#skinG)', ' stroke="#3a2c1e"')
  s += P(`M${fx - 6} 33 C${fx - 3} 36.5 ${fx + 3} 36.5 ${fx + 6} 33 L${fx + 6} 35.5 C${fx + 3} 38.5 ${fx - 3} 38.5 ${fx - 6} 35.5 Z`, '#000', ' fill-opacity="0.45" stroke="none"')
  s += circ(fx - 2.5 + turn, 37, 0.8, '#2a1d12', ' stroke="none"') + circ(fx + 2.5 + turn, 37, 0.8, '#2a1d12', ' stroke="none"')
  s += line(`M${fx - 2} 41 C${fx - 0.5} 41.8 ${fx + 0.5} 41.8 ${fx + 2} 41`, '#6b4a34', 0.8, 0.8)
  return s
}

/** Hat: brim ellipse at y 30, crown rising and its tip slumping towards `lean`. */
function hat(cx, lean, back = false) {
  let s = `    <ellipse cx="${cx}" cy="31" rx="25" ry="7.5" fill="url(#hatG)"/>\n`
  s += line(`M${cx - 22} 29 C${cx - 14} 25 ${cx - 4} 24 ${cx + 6} 24.5`, '#8a7a68', 1, 0.5)
  if (!back) s += P(`M${cx - 9} 33 C${cx - 5} 38 ${cx + 5} 38 ${cx + 9} 33 C${cx + 5} 34.5 ${cx - 5} 34.5 ${cx - 9} 33 Z`, '#0a0806') // shadow under the brim
  const tip = cx + lean * 14
  s += P(`M${cx - 11} 30 C${cx - 10} 20 ${cx - 6} 12 ${cx + lean * 4} 6 C${tip - lean * 2} 3 ${tip} 6 ${tip + lean * 3} 12 C${tip - lean * 2} 11 ${cx + lean * 6} 12 ${cx + 6} 16 C${cx + 9} 21 ${cx + 11} 25 ${cx + 11} 30 C${cx + 5} 32 ${cx - 5} 32 ${cx - 11} 30 Z`, 'url(#hatG)')
  s += P(`M${cx - 11} 27 C${cx - 5} 29 ${cx + 5} 29 ${cx + 11} 27 L${cx + 11} 30 C${cx + 5} 32 ${cx - 5} 32 ${cx - 11} 30 Z`, '#6b5530', ' stroke-width="0.8"') // band
  s += line(`M${cx - 8} 25 C${cx - 7} 18 ${cx - 4} 12 ${cx} 8`, '#9a8a78', 0.9, 0.5)
  return s
}
const robe = (x0, x1, hem0, hem1, fill = 'url(#robeG)') => {
  const m = (x0 + x1) / 2
  return P(`M${x0} 44 C${m - 6} 41 ${m + 6} 41 ${x1} 44 C${x1 + 3} 70 ${hem1 - 2} 96 ${hem1} 112 C${m + 10} 115 ${m - 10} 115 ${hem0} 112 C${hem0 + 2} 96 ${x0 - 3} 70 ${x0} 44 Z`, fill) +
    line(`M${hem0 + 1} 110.5 C${m - 10} 113.5 ${m + 10} 113.5 ${hem1 - 1} 110.5`, '#c9a24a', 1.6) +
    P(`M${x0 - 0.5} 70 C${m - 6} 72 ${m + 6} 72 ${x1 + 0.5} 70 L${x1 + 1} 74.5 C${m + 6} 76.5 ${m - 6} 76.5 ${x0 - 1} 74.5 Z`, '#5a1f2a', ' stroke-width="0.9"') +
    line(`M${x0 + 3} 47 C${x0 + 1} 66 ${hem0 + 6} 92 ${hem0 + 4} 108`, '#7a68b0', 0.9, 0.45)
}
const mantle = (x0, x1, clasp) => {
  const m = (x0 + x1) / 2
  let s = P(`M${x0 - 4} 52 C${x0 - 3} 45 ${m - 6} 42 ${m} 42 C${m + 6} 42 ${x1 + 3} 45 ${x1 + 4} 52 C${x1 - 3} 56 ${m + 6} 57 ${m} 57 C${m - 6} 57 ${x0 + 3} 56 ${x0 - 4} 52 Z`, 'url(#robeD)')
  s += line(`M${x0 - 3} 53 C${x0 + 3} 55.5 ${m - 5} 56.5 ${m} 56.5 C${m + 5} 56.5 ${x1 - 3} 55.5 ${x1 + 3} 53`, '#c9a24a', 1.2)
  if (clasp !== null) s += circ(clasp, 45, 2.2, '#d6b45a', ' stroke="#4a3410" stroke-width="0.7"')
  return s
}
const bellSleeve = (sx, sy, hx, hy, fill = 'url(#robeG)') => P(`M${sx - 4} ${sy} L${sx + 4} ${sy} L${hx + 7} ${hy - 4} C${hx + 3} ${hy - 1} ${hx - 3} ${hy - 1} ${hx - 7} ${hy - 4} Z`, fill) + line(`M${hx - 6.5} ${hy - 3.5} C${hx - 3} ${hy - 1.5} ${hx + 3} ${hy - 1.5} ${hx + 6.5} ${hy - 3.5}`, '#c9a24a', 1.1)

const MAGIC = {
  legs: 'robe',
  s: {
    back: '',
    body: robe(34, 62, 28, 68) + line('M48 61 L48 110', '#c9a24a', 1.2) + bellSleeve(31, 50, 28, 86) + bellSleeve(65, 50, 68, 86) + bareHand(28, 86) + bareHand(68, 86) + mantle(34, 62, 48) + face(48, 0) + hat(48, 0.6),
  },
  se: {
    back: bellSleeve(63, 50, 68, 78, 'url(#robeD)') + bareHand(68, 78),
    body: robe(35, 61, 29, 66) + line('M52 61 L54 110', '#c9a24a', 1.2) + bellSleeve(36, 50, 39.5, 92) + bareHand(39.5, 92) + mantle(35, 61, 53) + face(50, 0.5) + hat(50, -0.8),
  },
  e: {
    back: bellSleeve(52, 50, 56, 72, 'url(#robeD)') + bareHand(56, 72) + P('M40 60 C32 76 24 96 18 114 L28 112 L40 104 Z', 'url(#robeD)'),
    body: robe(40, 60, 32, 64) + line('M58 62 L62 110', '#c9a24a', 1.2) + bellSleeve(50, 50, 56, 92) + bareHand(56, 92) + mantle(40, 60, 59) + face(52, 1) + hat(51, -1),
  },
  ne: {
    back: bareHand(40, 72),
    body: robe(35, 61, 28, 67) + bellSleeve(63, 50, 68, 86) + bareHand(68, 86) + mantle(35, 61, null) + hat(47, -0.8, true),
  },
  n: {
    back: bareHand(28, 78) + bareHand(68, 78),
    body: robe(34, 62, 27, 69) + bellSleeve(31, 50, 28, 78) + bellSleeve(65, 50, 68, 78) + mantle(34, 62, null) + hat(48, 0.6, true),
  },
}

// ---------------------------------------------------------------------------

const CLASSES = { warrior: WARRIOR, dex: DEX, magic: MAGIC }
for (const [name, c] of Object.entries(CLASSES)) {
  mkdirSync(join(OUT, name), { recursive: true })
  for (const dir of DIRS) {
    const [a, b] = legsFor(dir, c.legs)
    const parts = { back: c[dir].back, 'leg-a': a, 'leg-b': b, body: c[dir].body }
    for (const [part, body] of Object.entries(parts)) {
      writeFileSync(join(OUT, name, `${dir}-${part}.svg`), svg(`${name}, facing ${dir}: ${part}. Feet at (48, 118).`, body))
    }
  }
}
console.log('characters written to', OUT)
