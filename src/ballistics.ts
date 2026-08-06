// ---------------------------------------------------------------------------
// The aerodynamic model, kept in one place.
//
// Both the live cannon-es simulation AND the on-screen trajectory preview call
// aeroAccel(). That is deliberate: if the preview used a simpler model than the
// sim, the guide line would lie to the player and the game would feel broken in
// a way that is very hard to diagnose. One model, two consumers.
// ---------------------------------------------------------------------------

import { DRAG_K, MAGNUS_K, GRAVITY, SPIN_DECAY } from './config'

export type V3 = { x: number; y: number; z: number }

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z })

export function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }
}

export function length(a: V3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

/**
 * Total acceleration on the ball in flight: gravity + quadratic drag + Magnus.
 *
 *   drag   = -DRAG_K * |v| * v          (opposes motion, grows with v^2)
 *   magnus = MAGNUS_K * (omega x v)     (perpendicular to both spin and motion)
 *
 * With backspin (omega pointing left, i.e. -X, for a throw along +Z) the cross
 * product points upward, so the ball floats then drops steeply — exactly the
 * arc a real player produces, and the reason rim hits fall in instead of out.
 */
export function aeroAccel(vel: V3, spin: V3): V3 {
  const speed = length(vel)
  if (speed < 1e-6) return v3(0, GRAVITY, 0)

  const dragMag = DRAG_K * speed
  const m = cross(spin, vel)

  return v3(
    -dragMag * vel.x + MAGNUS_K * m.x,
    -dragMag * vel.y + MAGNUS_K * m.y + GRAVITY,
    -dragMag * vel.z + MAGNUS_K * m.z
  )
}

/** Spin bleeds off in air. Called once per step by both sim and preview. */
export function decaySpin(spin: V3, dt: number): V3 {
  const f = Math.max(0, 1 - SPIN_DECAY * dt)
  return v3(spin.x * f, spin.y * f, spin.z * f)
}

/**
 * Integrate the free-flight arc forward for the aiming guide. Semi-implicit
 * Euler at a fixed step, same as the live sim uses.
 *
 * Stops early at stopY (the table top, or the floor) so the guide ends where
 * the ball would actually first make contact rather than sailing through it.
 */
export function predictPath(
  origin: V3,
  vel: V3,
  spin: V3,
  opts: { steps: number; dt: number; stopY: number }
): V3[] {
  const pts: V3[] = []
  let p = v3(origin.x, origin.y, origin.z)
  let v = v3(vel.x, vel.y, vel.z)
  let w = v3(spin.x, spin.y, spin.z)

  for (let i = 0; i < opts.steps; i++) {
    const a = aeroAccel(v, w)
    v = v3(v.x + a.x * opts.dt, v.y + a.y * opts.dt, v.z + a.z * opts.dt)
    p = v3(p.x + v.x * opts.dt, p.y + v.y * opts.dt, p.z + v.z * opts.dt)
    w = decaySpin(w, opts.dt)
    pts.push(v3(p.x, p.y, p.z))
    if (p.y <= opts.stopY) break
  }
  return pts
}
