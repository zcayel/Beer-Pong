# Beer Pong

Physics-driven beer pong for Decentraland SDK7 — a cannon-es simulation with real
v² drag, Magnus backspin, and measured restitution.

Decentraland ships no physics engine: `MeshCollider` gates player movement and
raycasts, but nothing in a scene bounces on its own. The ball here is simulated
with [cannon-es](https://github.com/pmndrs/cannon-es) for collisions, with the
aerodynamics applied by hand each substep.

## Playing

| input | action |
|---|---|
| **Look** | aim left / right |
| **Hold left click** | charge power — release to throw |
| **E / F** | raise / lower the launch angle |
| **1 / 2** | more / less backspin |

Power sweeps up and back down while held, so overholding costs you. A ~80 ms tap
drops the ball about a metre in front of you; the upper two-thirds of the bar
covers the range that actually reaches the cups. Throws are continuous — a ball
pool means you never wait for the previous shot to settle.

## Running it

Open the folder in the Decentraland Creator Hub and hit Preview, or:

```bash
npm install && npm start
```

## How the physics works

The equations are real, so the sim can be checked against reality rather than
tuned by feel:

| | value | real |
|---|---|---|
| drag | Cd 0.47, `a = k·v²` | sphere |
| Magnus | `a = k·(ω × v)` | backspin lift |
| restitution | 0.85 table, 0.6 rim | measured |
| entry angle | 53–55° | ~55° |

A few decisions worth knowing before changing anything:

- **`world.gravity` is zero.** Gravity lives inside `aeroAccel()` along with drag
  and Magnus, so there is exactly one source of truth for the ball's
  acceleration. Two would eventually disagree.
- **Substeps are driven manually** at a fixed 120 Hz via `world.step(dt)` — never
  `world.fixedStep()`, which is the only cannon path that touches
  `performance.now()` and keeps its own wall clock.
- **Cup entry is geometric, not physical.** A swept test runs *before* the solver
  and checks the ball's **bottom** against the rim plane. Testing its centre lets
  the cup's solid top cap deflect shots that should have dropped in.
- **`ballistics.ts` is shared** by the live sim and the on-screen aiming guide, so
  the guide cannot drift from what the ball actually does.

## Layout knobs

Three deliberately independent values in `src/config.ts`. Coupling them is what
makes a table resize silently re-tune the throw:

- `TABLE_SCALE` — how big the table looks
- `CUP_SCALE` — how big the cups and ball are (the ball must track the cups, since
  the make radius is `cupRim − ballRadius`)
- `RACK_DISTANCE` — how far you actually throw, which is what sets required power

Table length is *derived* from `RACK_DISTANCE`, so the cups always sit at the far
end like a real table.

The one constraint worth internalising: **range grows with speed squared**, so the
further the cups are, the more of the power bar is too weak to reach them. The
two-segment power curve (`speedForPower()`) exists to dissolve that — the first
35% of the bar covers near throws, the rest spans the scoring band.

## Retuning

`_debug/` holds headless harnesses that import the real modules rather than
copying them, so their numbers always describe the shipped game. After changing
any layout constant:

```bash
node_modules/@esbuild/win32-x64/esbuild.exe _debug/debug_test.ts --bundle --platform=node --format=cjs --outfile=_debug/debug_test.js
```

then run the output with Node. It reports the geometry, the usable power window at
each angle, where a full-power miss lands, and a recommended `SPEED_MIN`/
`SPEED_MAX`. Take the numbers under **USABLE POWER AT A FIXED ANGLE** — the
all-angles band above it looks wider than it is, because it silently trades angle
against speed.

- `debug_test.ts` — geometry, power windows, range caps, throw envelope
- `scale_study.js` — how required speed varies with table scale
- `gen_sounds.js` — synthesises the rim and cup SFX
- `extract_hit.py` — pulls a single bounce out of an mp3 via Blender's `aud`
  module (run with `blender --background --factory-startup --python`)

## Not built yet

Multiplayer is the real remaining work, and it is harder than the physics. DCL
scenes run client-side with no server authority, so re-simulating a throw on each
client diverges — one player sees a cup sink, another sees a rim-out. The plan is
thrower-authoritative: broadcast the initial state so everyone renders a plausible
arc, then broadcast the *outcome* separately and have everyone snap to it.

Also open: bounce shots, mobile tap controls, and a modelled table (the cups are
already a GLB; the table is still primitives).
