// Headless verification of the real ballistics module (imported, not copied).
import { aeroAccel, v3, V3 } from '../src/ballistics'
import * as C from '../src/config'

const ROW_SPACING = (C.CUP_SPACING * Math.sqrt(3)) / 2
const RIM_Y = C.TABLE_HEIGHT + C.CUP_HEIGHT

type Cup = { x: number; z: number; row: number }
const cups: Cup[] = []
for (let row = 0; row < 4; row++) {
  const z = C.RACK_Z - 1.5 * ROW_SPACING + row * ROW_SPACING
  for (let i = 0; i < row + 1; i++) {
    cups.push({ x: C.TABLE_CENTER_X + (i - row / 2) * C.CUP_SPACING, z, row })
  }
}

const EYE = 1.6 // DCL avatar eye height
const origin = v3(C.TABLE_CENTER_X, EYE - C.RELEASE_DOWN, C.THROW_LINE_Z + C.RELEASE_FORWARD)

function spinVec(dir: V3, rate: number): V3 {
  const ax = dir.z
  const az = -dir.x
  const l = Math.hypot(ax, az) || 1
  return v3((ax / l) * rate, 0, (az / l) * rate)
}

type Shot = { made: Cup | null; apex: number; flight: number; entryDeg: number; reach: number }

function simulate(speed: number, pitchDeg: number, spinRate: number, yaw = 0): Shot {
  const p0 = (Math.PI * pitchDeg) / 180
  // Lateral aim matters: rows 1 and 3 have no cup on the centre line, so a
  // centre-only sweep reports them unreachable when they simply weren't aimed at.
  const dir = v3(Math.sin(yaw) * Math.cos(p0), Math.sin(p0), Math.cos(yaw) * Math.cos(p0))
  let p = v3(origin.x, origin.y, origin.z)
  let v = v3(dir.x * speed, dir.y * speed, dir.z * speed)
  let w = spinVec(dir, spinRate)
  const dt = 1 / 240
  let apex = p.y
  let t = 0

  for (let i = 0; i < 240 * 8; i++) {
    const prev = v3(p.x, p.y, p.z)
    const a = aeroAccel(v, w)
    v = v3(v.x + a.x * dt, v.y + a.y * dt, v.z + a.z * dt)
    p = v3(p.x + v.x * dt, p.y + v.y * dt, p.z + v.z * dt)
    const d = 1 - C.SPIN_DECAY * dt
    w = v3(w.x * d, w.y * d, w.z * d)
    t += dt
    if (p.y > apex) apex = p.y

    if (prev.y > RIM_Y && p.y <= RIM_Y && v.y < 0) {
      const f = (prev.y - RIM_Y) / (prev.y - p.y)
      const cx = prev.x + (p.x - prev.x) * f
      const cz = prev.z + (p.z - prev.z) * f
      const entryDeg = (Math.atan2(-v.y, Math.hypot(v.x, v.z)) * 180) / Math.PI
      const reach = cz - origin.z
      for (const cup of cups) {
        if (Math.hypot(cx - cup.x, cz - cup.z) <= C.CUP_RIM_RADIUS - C.BALL_RADIUS) {
          return { made: cup, apex, flight: t, entryDeg, reach }
        }
      }
      return { made: null, apex, flight: t, entryDeg, reach }
    }
    if (p.y < 0) break
  }
  return { made: null, apex, flight: t, entryDeg: 0, reach: p.z - origin.z }
}

console.log('=== PHYSICAL SANITY ===')
console.log(`  DRAG_K              ${C.DRAG_K.toFixed(4)} /m`)
console.log(`  terminal velocity   ${Math.sqrt(9.81 / C.DRAG_K).toFixed(2)} m/s`)
console.log(`  MAGNUS_K            ${C.MAGNUS_K.toFixed(5)}`)

console.log('\n=== GEOMETRY (TABLE_SCALE = ' + C.TABLE_SCALE + ') ===')
console.log(`  table               ${C.TABLE_LENGTH.toFixed(2)}m x ${C.TABLE_WIDTH.toFixed(2)}m, top at ${C.TABLE_HEIGHT}m`)
console.log(`  cup rim radius      ${(C.CUP_RIM_RADIUS * 100).toFixed(1)}cm`)
console.log(`  release point       y=${origin.y.toFixed(2)}m  z=${origin.z.toFixed(2)}`)
console.log(`  rim height          ${RIM_Y.toFixed(3)}m  (release is ${(origin.y - RIM_Y).toFixed(2)}m above it)`)
console.log(`  throw distance      apex cup ${(cups[0].z - origin.z).toFixed(2)}m, back row ${(cups[9].z - origin.z).toFixed(2)}m`)
console.log(`  make radius         ${((C.CUP_RIM_RADIUS - C.BALL_RADIUS) * 100).toFixed(1)}cm`)

// --- What speed does this geometry actually require? --------------------------
// Swept in absolute m/s, independent of SPEED_MIN/MAX, so the config can be set
// from the answer instead of the answer being constrained by the config.
console.log('\n=== REQUIRED SPEED ENVELOPE (spin ' + C.SPIN_DEFAULT + ' rad/s) ===')
let lo = Infinity
let hi = -Infinity
let maxReach = 0
const byRow = new Map<number, { lo: number; hi: number }>()
// Aim at each cup in turn, so every row is actually attempted.
for (const target of cups) {
  const yaw = Math.atan2(target.x - origin.x, target.z - origin.z)
  for (let sp = 2; sp <= 24.001; sp += 0.1) {
    for (let ang = 10; ang <= 75; ang += 1) {
      const r = simulate(sp, ang, C.SPIN_DEFAULT, yaw)
      if (r.reach > maxReach) maxReach = r.reach
      if (r.made) {
        lo = Math.min(lo, sp)
        hi = Math.max(hi, sp)
        const b = byRow.get(r.made.row) ?? { lo: Infinity, hi: -Infinity }
        b.lo = Math.min(b.lo, sp)
        b.hi = Math.max(b.hi, sp)
        byRow.set(r.made.row, b)
      }
    }
  }
}

if (lo === Infinity) {
  console.log(`  NO MAKES ANYWHERE in 2-24 m/s.`)
  console.log(`  furthest the ball ever reached: ${maxReach.toFixed(2)}m`)
  console.log(`  nearest cup needs:              ${(cups[0].z - origin.z).toFixed(2)}m`)
  console.log(`  -> geometry is unreachable for this ball; drag dominates.`)
} else {
  console.log(`  makes possible from ${lo.toFixed(1)} to ${hi.toFixed(1)} m/s`)
  for (const row of [...byRow.keys()].sort()) {
    const b = byRow.get(row)!
    console.log(`    row ${row} (${row === 0 ? 'apex/nearest' : row === 3 ? 'back' : 'middle'}): ${b.lo.toFixed(1)} - ${b.hi.toFixed(1)} m/s`)
  }
  const pad = 0.4
  console.log(`  -> suggested SPEED_MIN ${Math.max(0, lo - pad).toFixed(1)}, SPEED_MAX ${(hi + pad).toFixed(1)}`)
}

// --- Playability at the configured envelope -----------------------------------
let makes = 0
let total = 0
const sample: string[] = []
for (let pw = 0; pw <= 1.0001; pw += 0.01) {
  const speed = C.speedForPower(pw)
  for (let ang = C.PITCH_MIN_DEG; ang <= C.PITCH_MAX_DEG; ang += 1) {
    total++
    const r = simulate(speed, ang, C.SPIN_DEFAULT)
    if (r.made) {
      makes++
      if (sample.length < 3) {
        sample.push(`pw ${(pw * 100).toFixed(0)}% / ${ang}° -> row ${r.made.row}, apex ${r.apex.toFixed(2)}m, ${r.flight.toFixed(2)}s, entry ${r.entryDeg.toFixed(0)}°`)
      }
    }
  }
}
console.log(`\n=== AT CONFIGURED ENVELOPE (${C.SPEED_MIN}-${C.SPEED_MAX} m/s, ${C.PITCH_MIN_DEG}-${C.PITCH_MAX_DEG}°) ===`)
console.log(`  make window: ${makes}/${total} (${((makes / total) * 100).toFixed(1)}%)`)
for (const s of sample) console.log(`    ${s}`)

// --- THE ONE THAT MATTERS NOW -------------------------------------------------
// Angle is a held value the player sets, so they experience the power window AT A
// FIXED ANGLE, not averaged across all of them. A band that looks wide when angle
// is free can be a sliver once angle is pinned — which reads as "power is enormous"
// because everything above the sliver sails long.
console.log('\n=== USABLE POWER AT A FIXED ANGLE (aiming at nearest cup) ===')
const yaw0 = Math.atan2(cups[0].x - origin.x, cups[0].z - origin.z)
let absLo = Infinity
let absHi = -Infinity
for (const ang of [25, 30, 35, 40, 45, 50, 55]) {
  let plo = Infinity
  let phi = -Infinity
  for (let pw = 0; pw <= 1.0001; pw += 0.005) {
    const speed = C.speedForPower(pw)
    if (simulate(speed, ang, C.SPIN_DEFAULT, yaw0).made) {
      plo = Math.min(plo, pw)
      phi = Math.max(phi, pw)
    }
  }
  if (plo === Infinity) {
    console.log(`  ${String(ang).padStart(2)}°:  no make at any power`)
  } else {
    const width = (phi - plo) * 100
    const slo = C.speedForPower(plo)
    const shi = C.speedForPower(phi)
    absLo = Math.min(absLo, slo)
    absHi = Math.max(absHi, shi)
    console.log(
      `  ${String(ang).padStart(2)}°:  ${(plo * 100).toFixed(0)}% - ${(phi * 100).toFixed(0)}% power` +
        `   = ${slo.toFixed(2)} - ${shi.toFixed(2)} m/s   (window ${width.toFixed(0)}% of bar)`
    )
  }
}

if (absLo !== Infinity) {
  // Pad slightly below the easiest make and above the hardest, so 0% just fails
  // short and 100% just sails long — the whole bar then does useful work.
  console.log(
    `\n  -> set SPEED_MIN ${(absLo - 0.15).toFixed(1)}, SPEED_MAX ${(absHi + 0.3).toFixed(1)}` +
      `   (usable span is only ${(absHi - absLo).toFixed(2)} m/s wide)`
  )
}

// --- HOW FAR DOES A FULL-POWER THROW ACTUALLY GO? -----------------------------
// The complaint "max power lands on the other side of the land" is a RANGE cap,
// which none of the sweeps above measure — they only ask where makes happen, never
// how far a miss flies. A flat throw at SPEED_MAX is the worst case.
function groundRange(speed: number, pitchDeg: number, spinRate: number): number {
  const p0 = (Math.PI * pitchDeg) / 180
  const dir = v3(0, Math.sin(p0), Math.cos(p0))
  let p = v3(origin.x, origin.y, origin.z)
  let v = v3(dir.x * speed, dir.y * speed, dir.z * speed)
  let w = spinVec(dir, spinRate)
  const dt = 1 / 240
  for (let i = 0; i < 240 * 15; i++) {
    const a = aeroAccel(v, w)
    v = v3(v.x + a.x * dt, v.y + a.y * dt, v.z + a.z * dt)
    p = v3(p.x + v.x * dt, p.y + v.y * dt, p.z + v.z * dt)
    const d = 1 - C.SPIN_DECAY * dt
    w = v3(w.x * d, w.y * d, w.z * d)
    if (p.y <= 0) break
  }
  return p.z - origin.z
}

console.log('\n=== RANGE AT FULL POWER (where a missed max-power throw lands) ===')
const backRow = cups[9].z - origin.z
let worst = 0
let worstAng = 0
for (let ang = C.PITCH_MIN_DEG; ang <= C.PITCH_MAX_DEG; ang += 5) {
  const r = groundRange(C.SPEED_MAX, ang, C.SPIN_DEFAULT)
  if (r > worst) {
    worst = r
    worstAng = ang
  }
  console.log(`  ${String(ang).padStart(2)}° @ ${C.SPEED_MAX} m/s -> lands ${r.toFixed(1)}m out   (${(r / backRow).toFixed(1)}x the back row)`)
}
console.log(`\n  WORST CASE: ${worst.toFixed(1)}m at ${worstAng}°  — back row is only ${backRow.toFixed(2)}m out.`)
console.log(`  Table is ${C.TABLE_LENGTH.toFixed(1)}m long; the scene is 32m x 48m.`)

console.log('\n=== RANGE vs SPIN (worst angle, full power) ===')
console.log('  spin | magnus @ SPEED_MAX      | worst-case landing')
console.log('  -----|-------------------------|-------------------')
for (const sp of [0, 40, 70, 100, 120]) {
  let w = 0
  for (let ang = C.PITCH_MIN_DEG; ang <= C.PITCH_MAX_DEG; ang += 5) {
    const r = groundRange(C.SPEED_MAX, ang, sp)
    if (r > w) w = r
  }
  const mag = C.MAGNUS_K * sp * C.SPEED_MAX
  console.log(
    `  ${String(sp).padStart(4)} | ${mag.toFixed(2)} m/s^2 = ${((mag / 9.81) * 100).toFixed(0).padStart(3)}% of g | ${w.toFixed(1)}m`
  )
}

// --- Solve SPEED_MAX for a bounded landing ------------------------------------
// "Max power must not sail off the land" is a hard constraint on range, so solve
// for it directly instead of tuning by feel. Worst case is spin 0 (backspin
// shortens range), swept over every legal angle.
function worstRange(speed: number): number {
  let w = 0
  for (let ang = C.PITCH_MIN_DEG; ang <= C.PITCH_MAX_DEG; ang += 2) {
    const r = groundRange(speed, ang, 0)
    if (r > w) w = r
  }
  return w
}

const tableEdge = C.TABLE_LENGTH / 2 + C.TABLE_CENTER_Z - origin.z
console.log('\n=== SOLVING SPEED_MAX FOR A BOUNDED LANDING ===')
console.log(`  back row at ${backRow.toFixed(2)}m, table far edge at ${tableEdge.toFixed(2)}m`)
for (const target of [tableEdge, tableEdge + 0.5, tableEdge + 1.5]) {
  let lo = 5
  let hi = 16
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (worstRange(mid) > target) hi = mid
    else lo = mid
  }
  console.log(`  land within ${target.toFixed(2)}m  ->  SPEED_MAX ${lo.toFixed(2)} m/s`)
}
console.log(`  (SPEED_MAX must stay above the scoring minimum — see RECOMMENDED ENVELOPE below)`)

// --- RECOMMENDED ENVELOPE (self-contained; never edit config to run this) -----
console.log('\n=== RECOMMENDED ENVELOPE ===')
{
  const backRowD = cups[9].z - origin.z
  const apexD = cups[0].z - origin.z

  // SPEED_MIN: a split-second hold should drop the ball ~1m in front of you.
  let lo = 0.2, hi = 12
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (groundRange(mid, 45, C.SPIN_DEFAULT) > 1.0) hi = mid
    else lo = mid
  }
  const sMin = lo

  // SPEED_MAX: a full-power miss must not fly far past the rack.
  const cap = backRowD + 1.0
  let lo2 = 1, hi2 = 20
  for (let i = 0; i < 50; i++) {
    const mid = (lo2 + hi2) / 2
    if (worstRange(mid) > cap) hi2 = mid
    else lo2 = mid
  }
  const sMax = lo2

  // What speeds actually score?
  let mlo = Infinity, mhi = -Infinity
  const yawA = Math.atan2(cups[0].x - origin.x, cups[0].z - origin.z)
  for (const target of cups) {
    const yw = Math.atan2(target.x - origin.x, target.z - origin.z)
    for (let sp = 1; sp <= 20; sp += 0.05) {
      for (let ang = 20; ang <= 60; ang += 2) {
        if (simulate(sp, ang, C.SPIN_DEFAULT, yw).made) {
          mlo = Math.min(mlo, sp); mhi = Math.max(mhi, sp)
        }
      }
    }
  }

  console.log(`  throw distance   apex ${apexD.toFixed(2)}m, back row ${backRowD.toFixed(2)}m`)
  console.log(`  1m drop needs    ${sMin.toFixed(2)} m/s   <- SPEED_MIN`)
  console.log(`  scoring needs    ${mlo.toFixed(2)} - ${mhi.toFixed(2)} m/s`)
  console.log(`  stays within ${cap.toFixed(1)}m at ${sMax.toFixed(2)} m/s   <- SPEED_MAX`)
  if (sMax > mlo) {
    const f = (s: number) => (((s - sMin) / (sMax - sMin)) * 100).toFixed(0)
    console.log(`  => SPEED_MIN ${sMin.toFixed(1)}, SPEED_MAX ${sMax.toFixed(1)}`)
    console.log(`     makes land at ${f(mlo)}% - ${f(Math.min(mhi, sMax))}% of the bar`)
  } else {
    console.log(`  !! range cap (${sMax.toFixed(2)}) is below the scoring minimum (${mlo.toFixed(2)})`)
  }
}

// --- Which RACK_DISTANCE puts makes in a controllable part of the bar? --------
console.log('\n=== RACK_DISTANCE SWEEP ===')
console.log('  dist | scoring needs   | SPEED_MAX (cap) | makes at % of bar')
console.log('  -----|-----------------|-----------------|------------------')
{
  const sMin = 2.25 // solved above: 1m drop
  for (const rd of [2.0, 3.0, 4.0, 5.0, 6.0, 6.67]) {
    const rackZ = C.THROW_LINE_Z + rd
    const cs: Cup[] = []
    for (let row = 0; row < 4; row++) {
      const z = rackZ - 1.5 * ROW_SPACING + row * ROW_SPACING
      for (let i = 0; i < row + 1; i++) {
        cs.push({ x: C.TABLE_CENTER_X + (i - row / 2) * C.CUP_SPACING, z, row })
      }
    }
    const madeIn = (speed: number, ang: number, yw: number) => {
      const r = simulate(speed, ang, C.SPIN_DEFAULT, yw)
      if (!r.made) return false
      return true
    }
    // reuse simulate()'s own cup list by temporarily pointing it at cs
    cups.length = 0
    for (const c of cs) cups.push(c)

    let mlo = Infinity, mhi = -Infinity
    for (const t of cs) {
      const yw = Math.atan2(t.x - origin.x, t.z - origin.z)
      for (let sp = 1; sp <= 16; sp += 0.05) {
        for (let ang = 20; ang <= 60; ang += 2) {
          if (madeIn(sp, ang, yw)) { mlo = Math.min(mlo, sp); mhi = Math.max(mhi, sp) }
        }
      }
    }
    const backD = cs[9].z - origin.z
    const cap = backD + 1.2
    let lo2 = 1, hi2 = 20
    for (let i = 0; i < 45; i++) {
      const mid = (lo2 + hi2) / 2
      if (worstRange(mid) > cap) hi2 = mid; else lo2 = mid
    }
    const sMax = lo2
    const pct = (s: number) => Math.round(((s - sMin) / (sMax - sMin)) * 100)
    const band = mlo === Infinity ? 'none' : `${pct(mlo)}% - ${pct(Math.min(mhi, sMax))}%`
    console.log(
      `  ${rd.toFixed(1)}m | ${mlo.toFixed(2)}-${mhi.toFixed(2)} m/s | ${sMax.toFixed(2)} m/s      | ${band}`
    )
  }
}

console.log('\n=== TAP DISTANCE (how near a quick hold lands) ===')
for (const holdMs of [80, 120, 200, 300, 500]) {
  const pw = Math.min(1, holdMs / 1000 / C.CHARGE_SECONDS)
  const sp = C.speedForPower(pw)
  const r = groundRange(sp, 45, C.SPIN_DEFAULT)
  console.log(`  hold ${String(holdMs).padStart(3)}ms -> ${(pw*100).toFixed(0).padStart(2)}% power = ${sp.toFixed(2)} m/s -> lands ${r.toFixed(2)}m from the player`)
}

console.log('\n=== PHYSICAL REALISM CHECK ===')
console.log(`  ball            ${(C.BALL_RADIUS*2000).toFixed(0)}mm, ${(C.BALL_MASS*1000).toFixed(1)}g   (regulation: 40mm, 2.7g)`)
console.log(`  cup rim         ${(C.CUP_RIM_RADIUS*2000).toFixed(0)}mm dia          (regulation: 95mm)`)
console.log(`  table           ${C.TABLE_LENGTH.toFixed(2)}m               (regulation: 2.44m)`)
console.log(`  DRAG_K          ${C.DRAG_K.toFixed(4)} /m   -> terminal velocity ${Math.sqrt(9.81/C.DRAG_K).toFixed(1)} m/s`)
console.log(`  restitution     table ${C.RESTITUTION_TABLE}, rim ${C.RESTITUTION_RIM}   (measured real values)`)
// A real beer pong lob: ~0.6s flight, apex a bit above head height, ~55 deg entry.
{
  let best: any = null
  const yaw0 = Math.atan2(cups[0].x - origin.x, cups[0].z - origin.z)
  for (let pw = 0; pw <= 1; pw += 0.005) {
    for (let ang = 25; ang <= 60; ang += 1) {
      const r = simulate(C.speedForPower(pw), ang, C.SPIN_DEFAULT, yaw0)
      if (r.made && (!best || r.entryDeg > best.entryDeg)) best = r
    }
  }
  if (best) {
    console.log(`  a made shot     ${best.flight.toFixed(2)}s flight, apex ${best.apex.toFixed(2)}m, entry ${best.entryDeg.toFixed(0)} deg`)
    console.log(`  real beer pong  ~0.6s flight, apex ~1.6m (just over head), entry ~55 deg`)
  }
}
