// Parametric study: how does required throw speed vary with TABLE_SCALE?
// Standalone by necessity — it sweeps hypothetical scales, so the constants must
// be recomputed per scale rather than imported. Formulas mirror src/config.ts.
const RHO = 1.225
const CD = 0.47
const G = -9.81
const SPIN_DECAY = 0.25
const EYE = 1.6
const RELEASE_DOWN = 0.25
const RELEASE_FORWARD = 0.35
const TABLE_CENTER_X = 6
const TABLE_CENTER_Z = 7
const TABLE_HEIGHT = 0.7 // never scaled — must stay below chest height

function makeWorld(scale) {
  const r = 0.02 * scale
  const m = 0.0027 * scale ** 3
  const A = Math.PI * r * r
  const dragK = (0.5 * RHO * CD * A) / m
  const magnusK = (0.5 * RHO * A * r) / m

  const tableLen = 2.44 * scale
  const cupRim = 0.0475 * scale
  const cupH = 0.117 * scale
  const spacing = 0.098 * scale
  const rowSpacing = (spacing * Math.sqrt(3)) / 2
  const rackZ = TABLE_CENTER_Z + tableLen / 2 - 0.35 * scale
  const throwZ = TABLE_CENTER_Z - tableLen / 2 - 0.3

  const cups = []
  for (let row = 0; row < 4; row++) {
    const z = rackZ - 1.5 * rowSpacing + row * rowSpacing
    for (let i = 0; i < row + 1; i++) {
      cups.push({ x: TABLE_CENTER_X + (i - row / 2) * spacing, z, row })
    }
  }
  return {
    r, m, dragK, magnusK, cupRim, tableLen,
    rimY: TABLE_HEIGHT + cupH,
    origin: { x: TABLE_CENTER_X, y: EYE - RELEASE_DOWN, z: throwZ + RELEASE_FORWARD },
    cups
  }
}

function shoot(W, speed, pitchDeg, yaw, spinRate) {
  const p0 = (Math.PI * pitchDeg) / 180
  const dir = {
    x: Math.sin(yaw) * Math.cos(p0),
    y: Math.sin(p0),
    z: Math.cos(yaw) * Math.cos(p0)
  }
  let p = { ...W.origin }
  let v = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }
  const ax = dir.z, az = -dir.x
  const l = Math.hypot(ax, az) || 1
  let w = { x: (ax / l) * spinRate, y: 0, z: (az / l) * spinRate }
  const dt = 1 / 240

  for (let i = 0; i < 240 * 8; i++) {
    const prev = { ...p }
    const sp = Math.hypot(v.x, v.y, v.z)
    if (sp < 1e-6) break
    const dm = W.dragK * sp
    const mx = w.y * v.z - w.z * v.y
    const my = w.z * v.x - w.x * v.z
    const mz = w.x * v.y - w.y * v.x
    v = {
      x: v.x + (-dm * v.x + W.magnusK * mx) * dt,
      y: v.y + (-dm * v.y + W.magnusK * my + G) * dt,
      z: v.z + (-dm * v.z + W.magnusK * mz) * dt
    }
    p = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt }
    const d = 1 - SPIN_DECAY * dt
    w = { x: w.x * d, y: w.y * d, z: w.z * d }

    if (prev.y > W.rimY && p.y <= W.rimY && v.y < 0) {
      const f = (prev.y - W.rimY) / (prev.y - p.y)
      const cx = prev.x + (p.x - prev.x) * f
      const cz = prev.z + (p.z - prev.z) * f
      for (const cup of W.cups) {
        if (Math.hypot(cx - cup.x, cz - cup.z) <= W.cupRim - W.r) return true
      }
      return false
    }
    if (p.y < 0) break
  }
  return false
}

console.log('scale | table      | ball   | throw  | make band      | mid')
console.log('------|------------|--------|--------|----------------|------')
for (const scale of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
  const W = makeWorld(scale)
  let lo = Infinity, hi = -Infinity
  for (const target of W.cups) {
    const yaw = Math.atan2(target.x - W.origin.x, target.z - W.origin.z)
    for (let sp = 1.5; sp <= 24.001; sp += 0.1) {
      for (let ang = 10; ang <= 75; ang += 2) {
        if (shoot(W, sp, ang, yaw, 70)) {
          if (sp < lo) lo = sp
          if (sp > hi) hi = sp
        }
      }
    }
  }
  const dist = W.cups[0].z - W.origin.z
  const band = lo === Infinity ? 'none' : `${lo.toFixed(1)}-${hi.toFixed(1)} m/s`
  const mid = lo === Infinity ? '-' : `${((lo + hi) / 2).toFixed(1)}`
  console.log(
    `${scale.toFixed(2).padStart(5)} | ${W.tableLen.toFixed(2)}m long | ${(W.r * 200).toFixed(0)}mm  | ${dist.toFixed(2)}m  | ${band.padEnd(14)} | ${mid}`
  )
}
