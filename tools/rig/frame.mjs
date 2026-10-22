import { add, dot, Model, sub, V } from './core.mjs'
import { skeleton } from './skeleton.mjs'

const floors = new Map()

/** The lowest point of a class standing at rest: the ground every frame stands on. */
function floorOf(cls, anim) {
  if (!floors.has(cls.id)) {
    const pose = anim.pose(0, 0, cls.stance)
    const m = new Model()
    cls.build(m, skeleton(pose, cls.shoulder), pose)
    floors.set(cls.id, lowest(m, (p) => p))
  }
  return floors.get(cls.id)
}

function lowest(model, move) {
  let z = Infinity
  for (const m of model.meshes) if (!m.cloth) for (const p of m.verts) z = Math.min(z, move(p).z)
  return z
}

/**
 * Poses and builds one frame. A roll turns the body over about its middle, kept over the
 * feet (the game moves the player) and resting on the ground; cloth is then hung from the
 * turned body so it trails rather than flipping over with it.
 */
export function buildFrame(cls, anim, facing, t, rest) {
  const pose = anim.pose(facing, t, cls.stance)
  const sk = skeleton(pose, cls.shoulder)
  let move = (p) => p
  if (pose.tumble) {
    const probe = new Model()
    cls.build(probe, sk, pose)
    let lo = V(Infinity, Infinity, Infinity)
    let hi = V(-Infinity, -Infinity, -Infinity)
    for (const m of probe.meshes) if (!m.cloth) for (const p of m.verts) {
      lo = V(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z))
      hi = V(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z))
    }
    const c = V((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
    const r = sk.root
    const turned = r.pitch(pose.tumble.angle)
    const ahead = dot(c, r.ex)
    const turn = (p) => {
      const d = sub(p, c)
      return add(add(c, turned.dir(V(dot(d, r.ex), dot(d, r.ey), dot(d, r.ez)))), r.dir(V(-ahead, 0, 0)))
    }
    const drop = floorOf(cls, rest) - lowest(probe, turn)
    move = (p) => add(turn(p), V(0, 0, drop))
    pose.move = move
    pose.floor = floorOf(cls, rest)
  }
  const model = new Model()
  cls.build(model, sk, pose)
  const origin = move(V(0, 0, 0))
  for (const m of model.meshes) {
    if (m.world) continue
    m.verts = m.verts.map(move)
    // Faces remember which way is out (an axis, a centre or a normal): turn those too.
    for (const f of m.faces) {
      if (f.axis) f.axis = f.axis.map(move)
      if (f.centre) f.centre = move(f.centre)
      if (f.normal) f.normal = sub(move(f.normal), origin)
    }
  }
  return { pose, sk, model, move }
}
