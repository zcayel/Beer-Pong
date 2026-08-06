# Handoff notes

Things that cost real time to discover. The README explains how the game works;
this is the list of traps that will bite you if nobody warns you.

## Environment

There is **no `node` or `npm` on PATH** on the machine this was built on — the
Creator Hub bundles both. To install a package:

```
ELECTRON_RUN_AS_NODE=1 "<creator-hub>/Decentraland Creator Hub.exe" \
  "<creator-hub>/resources/app.asar.unpacked/node_modules/npm/bin/npm-cli.js" \
  install --prefix "<scene dir>" <pkg> --save
```

To run a headless script against the scene's own source, bundle it with the
**native** esbuild binary (`node_modules/@esbuild/win32-x64/esbuild.exe`) and run
the output the same way. `node_modules/esbuild/lib/main.js` is the JS API, not a
CLI — invoking it produces no output and exits 1 silently.

## The two failure modes that look like code bugs

1. **Torn bundles.** `npm install` does not rebuild `bin/index.js`, but
   `sdk-commands build`/`start` does. If a Preview watcher rebuilds while a file
   is half-saved, the scene dies at startup with things like
   `ReferenceError: MeshCollider is not defined`. It is not a real bug. Fully quit
   Creator Hub — not just the Preview window — and rebuild.
2. **Hot-reload storms.** After a long edit session the watcher thrashes and the
   Explorer log fills with `UnityOpsApi initialized` repeated dozens of times.
   State goes stale and behaviour stops matching the source. Restart the app.

**When the scene "won't load", get the native Explorer's error log first.** It
names the failing function directly. Do not theorise or revert before you have it.

## cannon-es in the DCL sandbox

It works, it is 82 KB minified, and it has no dependencies. WASM engines (rapier,
ammo) cannot run here — the scene sandbox exposes no `WebAssembly`.

- **Never call `world.fixedStep()`.** It is the only path that touches
  `performance.now()` and keeps its own wall clock. Drive substeps yourself with
  `world.step(dt)`; every `performance.now()` inside `internalStep` is behind
  `doProfiling`, which defaults false.
- `cannon-es` **`Cylinder` is Y-axis aligned**, matching DCL's primitive. Classic
  cannon.js was Z-aligned — do not "fix" a rotation that isn't broken.
- Its `.d.ts` references `HTMLImageElement` and **will fail the typechecker**.
  That is what `"skipLibCheck": true` in `tsconfig.json` is for; don't remove it.
- `collide` is dispatched on **first contact only** (gated on
  `collisionMatrixPrevious`), so a listener fires once per bounce, not per frame.

## DCL gotchas

- **`MeshRenderer.setCylinder(entity, radiusBottom, radiusTop)` — bottom first.**
  Reversing these renders every cup upside down.
- **Every DCL primitive is a closed solid.** There is no open-ended tube, which is
  why the cups are a GLB. A cylinder always draws a top cap and reads as a lid.
- **A cannon body stops the ball; `MeshCollider` stops the player.** They are
  separate systems. Any solid prop needs both.
- **Audio must go through `AudioSource.playSound()`.** Setting `playing = true` by
  hand only fires on a genuine false→true edge, so calling it when already true is
  a silent no-op. `playSound` always emits a CRDT PUT with `currentTime: 0`.
  There is no 2D audio — every clip needs a pooled entity at the event position.
- Runtime `Material.setPbrMaterial` flashes white. Pool entities and materials up
  front, then toggle `VisibilityComponent`.

## Tuning

**The governing constraint: range grows with speed squared.** The further the cups
are, the more of the power bar is too weak to reach them. A long table, cups at
the far edge, and a very short minimum throw are close to mutually exclusive —
`speedForPower()`'s two-segment curve is what makes the current values coexist.

Re-run `_debug/debug_test.ts` after changing **any** layout constant, and take the
numbers under **USABLE POWER AT A FIXED ANGLE**. The all-angles band printed above
it looks much wider than it is, because it silently trades angle against speed;
tuning to that band is what repeatedly produced a bar where only the top tenth
could score.

Do parametric sweeps inside `_debug` scripts with their own local constants —
never by temporarily editing `config.ts`. A watcher can compile a throwaway value
into a live build.

## What's next

**Multiplayer, and it is harder than the physics.** DCL scenes run client-side
with no server authority, so if each client re-simulates a throw from a broadcast
velocity, float drift and differing substep accumulation make them disagree — one
player sees a cup sink, another sees a rim-out.

Do not sync the trajectory. Make the thrower authoritative: broadcast the initial
state so everyone renders a plausible arc, then broadcast the **outcome** (cup
index, or miss) separately and have every client snap to it. Turn order and cup
state need a single owner too, plus a timeout, because people wander out of the
scene mid-game.

Smaller open items: bounce shots, mobile tap controls, a modelled table (the cups
are already a GLB), and verifying that backspin actually kills rim-outs — that
effect lives in the collision path and is the one physics claim the sweeps do
**not** cover.
