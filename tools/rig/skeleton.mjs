import { add, Frame, mul, norm, solveIK, sub, V } from './core.mjs'

// The shared skeleton: where the body's frames and joints are for a pose. Every class uses
// it, so poses (poses.mjs) work for all of them; models only differ in what they hang on it.
// Character space: x forward, y right, z up, feet at the origin.

export const BODY = {
  pelvisZ: 34, // hip height
  waist: 10, // pelvis to chest frame
  neck: 28, // chest frame to the base of the head
  shoulderZ: 19, // shoulder height above the chest frame
  hip: 7,
  thigh: 17,
  shin: 16,
  upper: 19,
  fore: 18,
}

/** Builds the frames and joints for a pose, with the given shoulder half-width. */
export function skeleton(pose, shoulder = 15) {
  const root = new Frame().yaw(pose.facing)
  const pelvis = root.moved(V(0, 0, BODY.pelvisZ + (pose.bob ?? 0))).yaw(pose.pelvisTwist ?? 0)
  const chest = pelvis.moved(V(0, 0, BODY.waist)).yaw(pose.chestTwist ?? 0).pitch(pose.lean ?? 0).roll(pose.sideLean ?? 0)
  const head = chest.moved(V(0, 0, BODY.neck)).yaw(pose.headTurn ?? -(pose.chestTwist ?? 0) * 0.6).pitch(-(pose.lean ?? 0) * 0.5)
  const legs = {}
  const arms = {}
  for (const side of [1, -1]) {
    const k = side > 0 ? 'r' : 'l'
    const hip = pelvis.at(V(0, BODY.hip * side, 0))
    const foot = root.at(add(pose.feet[k], V(0, 0, 4)))
    const leg = solveIK(hip, foot, BODY.thigh, BODY.shin, root.dir(V(1, 0, 0.2)))
    legs[k] = { hip, knee: leg.mid, ankle: leg.end }
    const s = chest.at(V(0, shoulder * side, BODY.shoulderZ))
    const arm = solveIK(s, root.at(pose.hands[k]), BODY.upper, BODY.fore, root.dir(V(-0.6, side * 1.1, -0.5)))
    const along = norm(sub(arm.end, arm.mid))
    // The grip: where a held weapon's handle sits, just past the wrist.
    arms[k] = { shoulder: s, elbow: arm.mid, hand: arm.end, grip: add(arm.end, mul(along, 2.5)), along }
  }
  return { root, pelvis, chest, head, legs, arms }
}
