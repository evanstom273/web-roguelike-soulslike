// A tiny 3D renderer for the character rig: builds simple models out of lofts, boxes and
// sheets, and draws them as cel-shaded SVG with ink outlines.
// World: x east, y south, z up, units = px, the character's feet at the origin.
// Camera: the game's three-quarter (oblique) view: screen = (x, y * 0.5 - z).

export const V = (x = 0, y = 0, z = 0) => ({ x, y, z })
export const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z)
export const mul = (a, k) => V(a.x * k, a.y * k, a.z * k)
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const len = (a) => Math.hypot(a.x, a.y, a.z)
export const norm = (a) => mul(a, 1 / (len(a) || 1))
export const lerpV = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)

const DEPTH = 0.5
/** Towards the camera: points along this line project to the same spot. */
export const CAM = norm(V(0, 1 / DEPTH, 1))
/** Towards the light: top-left of the screen, a little in front. */
export const LIGHT = norm(V(-0.55, -0.15, 0.82))

/** A coordinate frame: origin and three unit axes (x forward, y right, z up). */
export class Frame {
  constructor(o = V(), ex = V(1, 0, 0), ey = V(0, 1, 0), ez = V(0, 0, 1)) {
    Object.assign(this, { o, ex, ey, ez })
  }
  at(p) {
    return add(add(add(this.o, mul(this.ex, p.x)), mul(this.ey, p.y)), mul(this.ez, p.z))
  }
  dir(d) {
    return add(add(mul(this.ex, d.x), mul(this.ey, d.y)), mul(this.ez, d.z))
  }
  moved(p) {
    return new Frame(this.at(p), this.ex, this.ey, this.ez)
  }
  /** Turn about the frame's own up axis (x towards y). */
  yaw(a) {
    const c = Math.cos(a), s = Math.sin(a)
    return new Frame(this.o, add(mul(this.ex, c), mul(this.ey, s)), add(mul(this.ex, -s), mul(this.ey, c)), this.ez)
  }
  /** Tip forwards about the right axis (up towards forward). */
  pitch(a) {
    const c = Math.cos(a), s = Math.sin(a)
    return new Frame(this.o, add(mul(this.ex, c), mul(this.ez, -s)), this.ey, add(mul(this.ez, c), mul(this.ex, s)))
  }
  /** Lean sideways about the forward axis (up towards right). */
  roll(a) {
    const c = Math.cos(a), s = Math.sin(a)
    return new Frame(this.o, this.ex, add(mul(this.ey, c), mul(this.ez, -s)), add(mul(this.ez, c), mul(this.ey, s)))
  }
}

/** A frame whose z axis runs from a to b (for limbs), x kept as close to `hint` as possible. */
export function frameAlong(a, b, hint = V(1, 0, 0)) {
  const ez = norm(sub(b, a))
  let ex = sub(hint, mul(ez, dot(hint, ez)))
  if (len(ex) < 1e-3) ex = sub(V(0, 1, 0), mul(ez, dot(V(0, 1, 0), ez)))
  ex = norm(ex)
  return new Frame(a, ex, cross(ez, ex), ez)
}

// ---------------------------------------------------------------------------
// Meshes: lists of world-space polygons with a material each.

export class Model {
  constructor() {
    this.meshes = []
  }
  mesh(name) {
    const m = { name, verts: [], faces: [] }
    this.meshes.push(m)
    return m
  }
}

/**
 * A lofted surface: rings of ellipses stacked along a frame's z axis. mat(ring, seg, angle)
 * picks a material per face (ring i joins ring i and i+1).
 */
export function loft(model, name, f, rings, segs, mat, opts = {}) {
  const m = model.mesh(name)
  const start = opts.start ?? 0
  const sweep = opts.sweep ?? Math.PI * 2
  const closed = sweep >= Math.PI * 2 - 1e-6
  const cols = closed ? segs : segs + 1
  for (const r of rings) {
    for (let j = 0; j < cols; j++) {
      const a = start + (sweep * j) / segs
      m.verts.push(f.at(V((r.x ?? 0) + r.rx * Math.cos(a), (r.y ?? 0) + r.ry * Math.sin(a), r.z)))
    }
  }
  const matFn = typeof mat === 'function' ? mat : () => mat
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < segs; j++) {
      const j1 = closed ? (j + 1) % segs : j + 1
      const a = start + (sweep * (j + 0.5)) / segs
      const axis = [f.at(V(rings[i].x ?? 0, rings[i].y ?? 0, rings[i].z)), f.at(V(rings[i + 1].x ?? 0, rings[i + 1].y ?? 0, rings[i + 1].z))]
      m.faces.push({ idx: [i * cols + j, i * cols + j1, (i + 1) * cols + j1, (i + 1) * cols + j], mat: matFn(i, j, a), axis, twoSided: opts.twoSided })
    }
  }
  if (opts.capTop) m.faces.push({ idx: Array.from({ length: segs }, (_, j) => (rings.length - 1) * cols + j), mat: opts.capTop, normal: f.ez })
  if (opts.capBottom) m.faces.push({ idx: Array.from({ length: segs }, (_, j) => j).reverse(), mat: opts.capBottom, normal: mul(f.ez, -1) })
  return m
}

/**
 * A surface through rings of world points (all the same length, closed loops), for shapes
 * that don't follow one frame, like a robe whose hem follows the feet. mat(ring, seg).
 */
export function loftPoints(model, name, rings, mat, opts = {}) {
  const m = model.mesh(name)
  const n = rings[0].length
  for (const r of rings) m.verts.push(...r)
  const centres = rings.map((r) => mul(r.reduce((s, p) => add(s, p), V()), 1 / r.length))
  const matFn = typeof mat === 'function' ? mat : () => mat
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n
      m.faces.push({ idx: [i * n + j, i * n + j1, (i + 1) * n + j1, (i + 1) * n + j], mat: matFn(i, j), axis: [centres[i], centres[i + 1]], twoSided: opts.twoSided })
    }
  }
  return m
}

/** An ellipsoid centred at c in frame f. */
export function ellipsoid(model, name, f, c, rx, ry, rz, mat, segs = 12, bands = 6) {
  const rings = []
  for (let k = 0; k <= bands; k++) {
    const phi = -Math.PI / 2 + (Math.PI * k) / bands
    const s = Math.max(0.04, Math.cos(phi))
    rings.push({ z: c.z + rz * Math.sin(phi), rx: rx * s, ry: ry * s, x: c.x, y: c.y })
  }
  return loft(model, name, f, rings, segs, mat)
}

/** A tapered capsule-ish cylinder between two points. */
export function limb(model, name, a, b, ra, rb, mat, hint, segs = 10) {
  const f = frameAlong(a, b, hint)
  const l = len(sub(b, a))
  return loft(model, name, f, [{ z: 0, rx: ra, ry: ra }, { z: l, rx: rb, ry: rb }], segs, mat, { capTop: mat, capBottom: mat })
}

/** A box in frame f, centred at c with size s (x, y, z). */
export function box(model, name, f, c, s, mat) {
  const m = model.mesh(name)
  const hx = s.x / 2, hy = s.y / 2, hz = s.z / 2
  for (const z of [-hz, hz]) for (const y of [-hy, hy]) for (const x of [-hx, hx]) m.verts.push(f.at(V(c.x + x, c.y + y, c.z + z)))
  // Vertex index = x + 2y + 4z (each 0/1). Faces wound outward.
  const F = [
    [0, 2, 3, 1], // bottom
    [4, 5, 7, 6], // top
    [0, 1, 5, 4], // -y
    [2, 6, 7, 3], // +y
    [0, 4, 6, 2], // -x
    [1, 3, 7, 5], // +x
  ]
  const centre = f.at(c)
  for (const idx of F) m.faces.push({ idx, mat, centre })
  return m
}

/** A two-sided sheet from a grid of world points [row][col]. */
export function sheet(model, name, grid, mat) {
  const m = model.mesh(name)
  const cols = grid[0].length
  for (const row of grid) for (const p of row) m.verts.push(p)
  for (let i = 0; i + 1 < grid.length; i++) {
    for (let j = 0; j + 1 < cols; j++) m.faces.push({ idx: [i * cols + j, i * cols + j + 1, (i + 1) * cols + j + 1, (i + 1) * cols + j], mat, twoSided: true })
  }
  return m
}

/** Two-bone IK: the elbow/knee for a joint chain from s towards t, bending towards `pole`. */
export function solveIK(s, t, a, b, pole) {
  const d0 = sub(t, s)
  const d = Math.min(len(d0), a + b - 0.01)
  const dir = norm(d0)
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))
  const p = norm(sub(pole, mul(dir, dot(pole, dir))))
  const mid = add(add(s, mul(dir, a * cosA)), mul(p, a * Math.sqrt(1 - cosA * cosA)))
  const end = add(s, mul(dir, d))
  return { mid, end }
}

// ---------------------------------------------------------------------------
// Rendering

/** Screen position in a 96 x 128 frame with the feet at (48, 118). */
export const project = (p) => ({ x: 48 + p.x, y: 118 + p.y * DEPTH - p.z })
export const depthOf = (p) => dot(p, CAM)

/**
 * Materials: { light, base, shadow, spec?, back? } colours. Faces are cel-shaded into those
 * bands by how they face the light; edges between faces facing the camera and faces facing
 * away are inked as the outline.
 */
export function render(model, materials) {
  const prims = []
  for (const m of model.meshes) {
    const faceInfo = m.faces.map((f) => {
      const pts = f.idx.map((i) => m.verts[i])
      const c = mul(pts.reduce((s, p) => add(s, p), V()), 1 / pts.length)
      let n = f.normal ?? norm(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0])))
      if (len(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0]))) < 1e-6 && pts.length > 3) n = norm(cross(sub(pts[2], pts[1]), sub(pts[0], pts[1])))
      // Face normals point away from the shape's middle.
      const ref = f.centre ?? (f.axis ? closestOnSegment(c, f.axis[0], f.axis[1]) : null)
      if (ref && dot(n, sub(c, ref)) < 0) n = mul(n, -1)
      let facing = dot(n, CAM) > 0
      let back = false
      if (!facing && f.twoSided) {
        n = mul(n, -1)
        facing = true
        back = true
      }
      return { pts, c, n, facing, back, f }
    })
    // Edges between a front and a back face (or a face and nothing) are silhouette lines.
    const edges = new Map()
    faceInfo.forEach((fi, k) => {
      const idx = fi.f.idx
      for (let e = 0; e < idx.length; e++) {
        const a = idx[e], b = idx[(e + 1) % idx.length]
        const key = a < b ? `${a},${b}` : `${b},${a}`
        const list = edges.get(key) ?? []
        list.push(k)
        edges.set(key, list)
      }
    })
    for (const fi of faceInfo) {
      if (!fi.facing) continue
      const mat = materials[fi.f.mat]
      if (!mat) throw new Error(`missing material ${fi.f.mat}`)
      const lit = dot(fi.n, LIGHT)
      let colour = fi.back ? (mat.back ?? mat.shadow) : lit > (mat.cut ?? 0.58) ? mat.light : lit > (mat.cutLow ?? 0.05) ? mat.base : mat.shadow
      if (!fi.back && mat.spec && dot(fi.n, norm(add(LIGHT, CAM))) > (mat.specCut ?? 0.93)) colour = mat.spec
      prims.push({ kind: 'face', depth: depthOf(fi.c), pts: fi.pts.map(project), colour })
    }
    for (const [key, list] of edges) {
      const [a, b] = key.split(',').map(Number)
      const fronts = list.filter((k) => faceInfo[k].facing).length
      const edge = fronts === 1 && (list.length === 1 || fronts < list.length) ? 'outline' : null
      // Hard creases between two visible faces (box edges, rims) get a fine line.
      let crease = false
      if (!edge && fronts === 2 && list.length === 2) {
        const [f1, f2] = list.map((k) => faceInfo[k])
        crease = dot(f1.n, f2.n) < 0.35 || f1.f.mat !== f2.f.mat
      }
      if (!edge && !crease) continue
      // Some materials (eye glints) are never inked.
      if (list.every((k) => materials[faceInfo[k].f.mat].ink === false)) continue
      const pa = m.verts[a], pb = m.verts[b]
      prims.push({ kind: 'edge', depth: depthOf(lerpV(pa, pb, 0.5)) + 0.6, a: project(pa), b: project(pb), width: edge ? 1.15 : 0.55, colour: edge ? '#141618' : 'rgba(20,22,24,0.55)' })
    }
  }
  prims.sort((p, q) => p.depth - q.depth)
  const f1 = (n) => Math.round(n * 10) / 10
  let out = ''
  for (const p of prims) {
    if (p.kind === 'face') {
      out += `<polygon points="${p.pts.map((q) => `${f1(q.x)},${f1(q.y)}`).join(' ')}" fill="${p.colour}" stroke="${p.colour}" stroke-width="0.45" stroke-linejoin="round"/>`
    } else {
      out += `<line x1="${f1(p.a.x)}" y1="${f1(p.a.y)}" x2="${f1(p.b.x)}" y2="${f1(p.b.y)}" stroke="${p.colour}" stroke-width="${p.width}" stroke-linecap="round"/>`
    }
  }
  return out
}

function closestOnSegment(p, a, b) {
  const ab = sub(b, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)))
  return add(a, mul(ab, t))
}
