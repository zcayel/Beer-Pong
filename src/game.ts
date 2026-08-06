// ---------------------------------------------------------------------------
// The throw: aim, power, angle, spin, flight, and the make/miss ruling.
//
// cannon-es owns collisions (table bounces, rim deflections). Aerodynamics are
// applied by hand each substep, because cannon's linearDamping is velocity-
// proportional and a ball in flight needs v^2 drag plus a Magnus term.
//
// Balls come from a pool so the player can throw continuously — a new shot never
// waits on the previous one to settle.
// ---------------------------------------------------------------------------

import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  VisibilityComponent,
  AudioSource,
  Entity,
  inputSystem,
  InputAction
} from '@dcl/sdk/ecs'
import {
  World,
  Body,
  Sphere,
  Box,
  Plane,
  Cylinder,
  Vec3,
  Material as CMaterial,
  ContactMaterial
} from 'cannon-es'
import {
  BALL_RADIUS,
  BALL_MASS,
  SPEED_MIN,
  speedForPower,
  SPEED_MAX,
  CHARGE_SECONDS,
  PITCH_MIN_DEG,
  PITCH_MAX_DEG,
  SPIN_MIN,
  SPIN_MAX,
  SPIN_DEFAULT,
  SPIN_DECAY,
  RELEASE_FORWARD,
  RELEASE_DOWN,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TABLE_LENGTH,
  TABLE_CENTER_X,
  TABLE_CENTER_Z,
  CUP_RIM_RADIUS,
  CUP_HEIGHT,
  RESTITUTION_TABLE,
  RESTITUTION_RIM,
  FRICTION_TABLE
} from './config'
import { aeroAccel, predictPath, v3, V3, cross, length } from './ballistics'
import { cups, sinkCup, cupsRemaining, buildRack } from './table'

const FIXED_DT = 1 / 120
const MAX_SUBSTEPS = 8
const PREVIEW_DOTS = 28
const BALL_POOL = 8 // in-flight shots allowed at once
const MAX_FLIGHT = 8 // s before a ball is reclaimed regardless
const ANGLE_RATE = 22 // deg/s while E or F is held

export type ThrowState = 'ready' | 'charging'

type Ball = {
  body: Body
  entity: Entity
  active: boolean
  flight: number
  prev: V3
  age: number // release order, for recycling the oldest
}

export const hud = {
  state: 'ready' as ThrowState,
  power: 0,
  angleDeg: 40, // held value, driven by E/F — not read off the camera

  spin: SPIN_DEFAULT,
  made: 0,
  thrown: 0,
  lastResult: '' as string,
  inFlight: 0
}

let world: World
let ballMat: CMaterial
const balls: Ball[] = []
const cupBodies = new Map<number, Body>()
const previewDots: Entity[] = []

let accumulator = 0
let chargeT = 0
let chargeDir = 1
let releaseCounter = 0

// --- Audio -------------------------------------------------------------------
// DCL has no 2D audio, so every clip needs an entity at the event position.
//
// Retriggering MUST go through AudioSource.playSound(). Setting `playing = true`
// by hand only fires if the flag genuinely transitions false->true; calling it
// when it is already true is a silent no-op, which is why an earlier hand-rolled
// version was almost completely inaudible. playSound() always emits a CRDT PUT
// and forces currentTime back to 0, so it replays every single time. It spreads
// the existing component first, so a volume set just before it is preserved.
type AudioPool = { entities: Entity[]; clip: string; idx: number }

function makeAudioPool(clip: string, n: number, volume: number): AudioPool {
  const entities: Entity[] = []
  for (let i = 0; i < n; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -20, 0) })
    AudioSource.create(e, { audioClipUrl: clip, playing: false, loop: false, volume })
    entities.push(e)
  }
  return { entities, clip, idx: 0 }
}

function playAt(pool: AudioPool, x: number, y: number, z: number, volume?: number) {
  const e = pool.entities[pool.idx]
  pool.idx = (pool.idx + 1) % pool.entities.length
  Transform.getMutable(e).position = Vector3.create(x, y, z)
  if (volume !== undefined) {
    const src = AudioSource.getMutableOrNull(e)
    if (src) src.volume = volume
  }
  AudioSource.playSound(e, pool.clip)
}

let sfxTable: AudioPool
let sfxRim: AudioPool
let sfxCup: AudioPool
let tableBody: Body
let groundBody: Body

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

export function initGame() {
  buildWorld()


  sfxTable = makeAudioPool('assets/sounds/pong_table.wav', 6, 1)
  sfxRim = makeAudioPool('assets/sounds/pong_rim.wav', 6, 1)
  sfxCup = makeAudioPool('assets/sounds/pong_cup.wav', 4, 1)
  buildBallPool()
  buildPreviewDots()
  engine.addSystem(gameSystem)
}

function buildWorld() {
  // Gravity is applied by hand inside aeroAccel(), so the world itself has none.
  // One source of truth for a ball's acceleration beats two that can disagree.
  world = new World({ gravity: new Vec3(0, 0, 0) })

  ballMat = new CMaterial('ball')
  const tableMat = new CMaterial('table')
  const cupMat = new CMaterial('cup')

  world.addContactMaterial(
    new ContactMaterial(ballMat, tableMat, {
      restitution: RESTITUTION_TABLE,
      friction: FRICTION_TABLE
    })
  )
  world.addContactMaterial(
    new ContactMaterial(ballMat, cupMat, { restitution: RESTITUTION_RIM, friction: 0.4 })
  )
  // Balls pass through each other — two shots colliding mid-air would be a
  // novelty, not a feature, and it makes continuous throwing feel random.
  world.addContactMaterial(new ContactMaterial(ballMat, ballMat, { restitution: 0, friction: 0 }))

  groundBody = new Body({ mass: 0, shape: new Plane(), material: tableMat })
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)

  tableBody = new Body({
    mass: 0,
    material: tableMat,
    shape: new Box(new Vec3(TABLE_WIDTH / 2, 0.02, TABLE_LENGTH / 2)),
    position: new Vec3(TABLE_CENTER_X, TABLE_HEIGHT - 0.02, TABLE_CENTER_Z)
  })
  world.addBody(tableBody)

  addCupBodies(cupMat)
}

function addCupBodies(mat?: CMaterial) {
  cups.forEach((cup, i) => {
    // cannon-es cylinders are Y-aligned, same as DCL's primitive — no fixup.
    const b = new Body({
      mass: 0,
      material: mat,
      shape: new Cylinder(CUP_RIM_RADIUS, CUP_RIM_RADIUS * 0.63, CUP_HEIGHT, 12),
      position: new Vec3(cup.x, TABLE_HEIGHT + CUP_HEIGHT / 2, cup.z)
    })
    world.addBody(b)
    cupBodies.set(i, b)
  })
}

function buildBallPool() {
  for (let i = 0; i < BALL_POOL; i++) {
    const body = new Body({
      mass: BALL_MASS,
      material: ballMat,
      shape: new Sphere(BALL_RADIUS),
      position: new Vec3(0, -10 - i, 0)
    })
    body.allowSleep = false
    body.collisionResponse = false // parked balls must not interact with anything
    world.addBody(body)

    // Bounce SFX, keyed off real contacts and scaled by impact speed so a hard
    // bounce is loud and a dying roll is not. Below the threshold we stay silent,
    // otherwise a settling ball machine-guns the pool with micro-contacts.
    body.addEventListener('collide', (ev: any) => {
      // cannon dispatches 'collide' on FIRST contact only (it is gated on
      // collisionMatrixPrevious), so this fires once per bounce, not per frame —
      // the threshold only needs to reject the faintest grazes. It was 0.7, which
      // swallowed most real bounces; 0.3 catches everything audible.
      const impact = Math.abs(ev?.contact?.getImpactVelocityAlongNormal?.() ?? 0)
      if (impact < 0.3) return
      const vol = Math.min(1, 0.45 + impact / 5)
      const p = body.position
      const onTable = ev.body === tableBody || ev.body === groundBody
      playAt(onTable ? sfxTable : sfxRim, p.x, p.y, p.z, vol)
    })

    const entity = engine.addEntity()
    Transform.create(entity, {
      position: Vector3.create(0, -10, 0),
      scale: Vector3.create(BALL_RADIUS * 2, BALL_RADIUS * 2, BALL_RADIUS * 2)
    })
    MeshRenderer.setSphere(entity)
    Material.setPbrMaterial(entity, { albedoColor: Color4.create(1, 0.62, 0.1, 1) })
    VisibilityComponent.create(entity, { visible: false })

    balls.push({ body, entity, active: false, flight: 0, prev: v3(0, 0, 0), age: 0 })
  }
}

function buildPreviewDots() {
  for (let i = 0; i < PREVIEW_DOTS; i++) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(0, -10, 0),
      scale: Vector3.create(0.03, 0.03, 0.03)
    })
    MeshRenderer.setSphere(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(1, 1, 1, 0.6),
      emissiveColor: Color4.create(0.7, 0.9, 1, 1),
      emissiveIntensity: 1.5
    })
    VisibilityComponent.create(e, { visible: false })
    previewDots.push(e)
  }
}

// -----------------------------------------------------------------------------
// Aim
// -----------------------------------------------------------------------------

type Aim = { origin: V3; dir: V3; pitchDeg: number }

function currentAim(): Aim {
  const cam = Transform.get(engine.CameraEntity)
  const fwd = Vector3.rotate(Vector3.Forward(), cam.rotation)

  // Yaw (left/right) comes from where the player is looking. Elevation is its own
  // held value driven by E/F rather than camera pitch: DCL's mouse-look is far too
  // coarse to hold a 2-degree window steady, and the whole game lives in that window.
  const yaw = Math.atan2(fwd.x, fwd.z)
  const pitch = (hud.angleDeg * Math.PI) / 180

  const dir = v3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  const origin = v3(
    cam.position.x + fwd.x * RELEASE_FORWARD,
    cam.position.y - RELEASE_DOWN,
    cam.position.z + fwd.z * RELEASE_FORWARD
  )
  return { origin, dir, pitchDeg: hud.angleDeg }
}

// Shared with the _debug sweeps — see speedForPower() in config.ts. Deliberately
// not re-implemented here: a local copy is how the aiming guide and the sim drift.
const speedFor = speedForPower

/** Backspin axis: horizontal, perpendicular to travel, left of the throw. */
function spinVector(dir: V3, rate: number): V3 {
  const axis = cross(dir, v3(0, 1, 0))
  const len = length(axis)
  if (len < 1e-6) return v3(0, 0, 0)
  return v3((axis.x / len) * rate, (axis.y / len) * rate, (axis.z / len) * rate)
}

// -----------------------------------------------------------------------------
// Main loop
// -----------------------------------------------------------------------------

function gameSystem(dt: number) {

  const held = inputSystem.isPressed(InputAction.IA_POINTER)

  // Angle on E/F — the primary skill control, so it gets the reachable keys.
  if (inputSystem.isPressed(InputAction.IA_PRIMARY)) {
    hud.angleDeg = Math.min(PITCH_MAX_DEG, hud.angleDeg + ANGLE_RATE * dt)
  }
  if (inputSystem.isPressed(InputAction.IA_SECONDARY)) {
    hud.angleDeg = Math.max(PITCH_MIN_DEG, hud.angleDeg - ANGLE_RATE * dt)
  }
  // Spin on 1/2.
  if (inputSystem.isPressed(InputAction.IA_ACTION_3)) {
    hud.spin = Math.min(SPIN_MAX, hud.spin + 40 * dt)
  }
  if (inputSystem.isPressed(InputAction.IA_ACTION_4)) {
    hud.spin = Math.max(SPIN_MIN, hud.spin - 40 * dt)
  }

  // Aiming is always available — never gated on a ball being in flight.
  const aim = currentAim()

  if (held) {
    hud.state = 'charging'
    chargeT += (chargeDir * dt) / CHARGE_SECONDS
    if (chargeT >= 1) {
      chargeT = 1
      chargeDir = -1
    } else if (chargeT <= 0) {
      chargeT = 0
      chargeDir = 1
    }
    hud.power = chargeT
    drawPreview(aim, hud.power)
  } else {
    if (hud.state === 'charging') release(aim)
    hidePreview()
  }

  stepFlight(dt)
}

/** Next free ball, or the oldest in-flight one if the pool is saturated. */
function acquireBall(): Ball {
  for (const b of balls) if (!b.active) return b
  let oldest = balls[0]
  for (const b of balls) if (b.age < oldest.age) oldest = b
  retire(oldest)
  return oldest
}

function release(aim: Aim) {
  const ball = acquireBall()
  const speed = speedFor(hud.power)
  const spin = spinVector(aim.dir, hud.spin)

  ball.body.position.set(aim.origin.x, aim.origin.y, aim.origin.z)
  ball.body.velocity.set(aim.dir.x * speed, aim.dir.y * speed, aim.dir.z * speed)
  ball.body.angularVelocity.set(spin.x, spin.y, spin.z)
  ball.body.force.setZero()
  ball.body.torque.setZero()
  ball.body.collisionResponse = true

  ball.active = true
  ball.flight = 0
  ball.prev = v3(aim.origin.x, aim.origin.y, aim.origin.z)
  ball.age = ++releaseCounter

  VisibilityComponent.createOrReplace(ball.entity, { visible: true })

  hud.thrown++
  hud.state = 'ready'
  chargeT = 0
  chargeDir = 1
  hud.power = 0
}

function stepFlight(dt: number) {
  const anyActive = balls.some((b) => b.active)
  if (!anyActive) {
    accumulator = 0
    hud.inFlight = 0
    return
  }

  accumulator += Math.min(dt, 0.1) // clamp so a frame hitch cannot explode the sim
  let steps = 0

  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    for (const ball of balls) {
      if (!ball.active) continue
      const vel = v3(ball.body.velocity.x, ball.body.velocity.y, ball.body.velocity.z)
      const spin = v3(
        ball.body.angularVelocity.x,
        ball.body.angularVelocity.y,
        ball.body.angularVelocity.z
      )
      const a = aeroAccel(vel, spin)
      ball.body.applyForce(new Vec3(a.x * BALL_MASS, a.y * BALL_MASS, a.z * BALL_MASS))

      // Rule on cup entry BEFORE the solver runs, from the position the ball is
      // about to reach. Otherwise the solid cup cylinder deflects a ball that
      // should have dropped in, and clean shots read as rim-outs.
      checkCupEntry(ball, vel)
    }

    world.step(FIXED_DT)

    for (const ball of balls) {
      if (!ball.active) continue
      const d = 1 - SPIN_DECAY * FIXED_DT
      ball.body.angularVelocity.scale(d, ball.body.angularVelocity)
      ball.prev = v3(ball.body.position.x, ball.body.position.y, ball.body.position.z)
    }

    accumulator -= FIXED_DT
    steps++
  }

  let live = 0
  for (const ball of balls) {
    if (!ball.active) continue
    live++

    const t = Transform.getMutable(ball.entity)
    t.position = Vector3.create(ball.body.position.x, ball.body.position.y, ball.body.position.z)
    t.rotation = Quaternion.create(
      ball.body.quaternion.x,
      ball.body.quaternion.y,
      ball.body.quaternion.z,
      ball.body.quaternion.w
    )

    ball.flight += dt
    const speed = length(v3(ball.body.velocity.x, ball.body.velocity.y, ball.body.velocity.z))
    const settled = ball.flight > 1.2 && speed < 0.35
    const gone = ball.body.position.y < -1 || ball.flight > MAX_FLIGHT
    if (settled || gone) {
      retire(ball)
      live--
      if (!hud.lastResult) hud.lastResult = 'MISS'
    }
  }
  hud.inFlight = live
}

/**
 * Swept rim-plane test. A make is: crossing the rim plane downward, inside the
 * rim radius. Resolved geometrically rather than by physics so it can never
 * jitter, tunnel, or disagree with what the player saw.
 */
function checkCupEntry(ball: Ball, vel: V3) {
  if (vel.y >= 0) return

  const next = v3(
    ball.body.position.x + vel.x * FIXED_DT,
    ball.body.position.y + vel.y * FIXED_DT,
    ball.body.position.z + vel.z * FIXED_DT
  )

  // Test the ball's BOTTOM against the rim, not its centre. The cup body is a
  // solid cylinder with a top cap at rimY, so cannon registers contact the moment
  // the ball's underside reaches that plane — a full ball-radius before the centre
  // does. Testing the centre meant that on any slow descent the solver bounced the
  // ball off the cap first and the cup behaved as if it were lidded.
  const prevBottom = ball.prev.y - BALL_RADIUS
  const nextBottom = next.y - BALL_RADIUS

  for (let i = 0; i < cups.length; i++) {
    const cup = cups[i]
    if (!cup.standing) continue
    if (!(prevBottom > cup.rimY && nextBottom <= cup.rimY)) continue

    const span = prevBottom - nextBottom
    const f = span > 1e-9 ? (prevBottom - cup.rimY) / span : 0
    const cx = ball.prev.x + (next.x - ball.prev.x) * f
    const cz = ball.prev.z + (next.z - ball.prev.z) * f
    const dx = cx - cup.x
    const dz = cz - cup.z

    // Ball centre must clear the rim by its own radius to actually drop in.
    if (Math.sqrt(dx * dx + dz * dz) <= CUP_RIM_RADIUS - BALL_RADIUS) {
      sinkCup(cup)
      const body = cupBodies.get(i)
      if (body) {
        world.removeBody(body)
        cupBodies.delete(i)
      }
      hud.made++
      hud.lastResult = 'CUP!'
      playAt(sfxCup, cup.x, cup.rimY, cup.z)
      retire(ball)
      if (cupsRemaining() === 0) resetRack()
      return
    }
  }
}

function retire(ball: Ball) {
  ball.active = false
  ball.body.collisionResponse = false
  ball.body.position.set(0, -20, 0)
  ball.body.velocity.setZero()
  ball.body.angularVelocity.setZero()
  ball.body.force.setZero()
  ball.body.torque.setZero()
  VisibilityComponent.createOrReplace(ball.entity, { visible: false })
}

function resetRack() {
  buildRack()
  for (const [, b] of cupBodies) world.removeBody(b)
  cupBodies.clear()
  addCupBodies()
}

// -----------------------------------------------------------------------------
// Aiming guide — same model as the sim, so it never lies
// -----------------------------------------------------------------------------

function drawPreview(aim: Aim, power: number) {
  const speed = speedFor(power)
  const vel = v3(aim.dir.x * speed, aim.dir.y * speed, aim.dir.z * speed)
  const spin = spinVector(aim.dir, hud.spin)

  const EVERY_N = 3
  const path = predictPath(aim.origin, vel, spin, {
    steps: PREVIEW_DOTS * EVERY_N,
    dt: 1 / 60,
    stopY: TABLE_HEIGHT - 0.02
  })

  for (let i = 0; i < previewDots.length; i++) {
    const dot = previewDots[i]
    const p = path[i * EVERY_N]
    if (p) {
      Transform.getMutable(dot).position = Vector3.create(p.x, p.y, p.z)
      VisibilityComponent.createOrReplace(dot, { visible: true })
    } else {
      VisibilityComponent.createOrReplace(dot, { visible: false })
    }
  }
}

function hidePreview() {
  for (const d of previewDots) VisibilityComponent.createOrReplace(d, { visible: false })
}
