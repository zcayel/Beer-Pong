// ---------------------------------------------------------------------------
// Beer pong — real-world constants.
//
// Everything here is a measured real quantity, not a tuned game number, so the
// sim can be checked against reality. Tune FEEL in throwing.ts; keep this file
// honest.
// ---------------------------------------------------------------------------

// --- Scale --------------------------------------------------------------------
// Declared FIRST because the ball derives from it — `const` is not hoisted, so
// referencing TABLE_SCALE above its declaration is a temporal-dead-zone crash.
//
// Measured relationship (see _debug/scale_study.js) — table size IS the power
// control, because the throw distance sets the speed required:
//   scale 1.0  ->  1.91m throw,  4.4-7.1 m/s  (mid 5.7)   regulation
//   scale 1.5  ->  2.89m throw,  5.8-9.3 m/s  (mid 7.5)
//   scale 2.0  ->  3.88m throw,  6.9-12.2 m/s (mid 9.5)
//   scale 3.0  ->  5.84m throw,  8.8-17.5 m/s (mid 13.1)
// Change this ONE number to retarget, then re-run _debug/debug_test.ts and move
// SPEED_MIN/SPEED_MAX onto the new band or the game becomes unwinnable.
export const TABLE_SCALE = 6

// Cups (and therefore the ball) scale INDEPENDENTLY of the table now. Previously
// one knob drove both, so a bigger table also meant bucket-sized cups and a much
// longer throw. Three separate knobs: TABLE_SCALE = how big the table looks,
// CUP_SCALE = how big the cups and ball are, RACK_DISTANCE = how far you throw.
export const CUP_SCALE = 3

// --- Ball: regulation 40mm table tennis ball, x BALL_SCALE ------------------
// The ball MUST scale with the table. Drag does not care how big your table is:
// DRAG_K = 0.5*rho*Cd*A/m, and area goes as r^2 while mass goes as r^3, so
// DRAG_K falls as 1/r. On a 3x table a regulation 40mm ball needed 11.2-24 m/s
// to reach the cups at all — past its own 8.6 m/s terminal velocity.
// Decoupling these once left a 120mm ball dropping into a 14.25cm cup: a 1.1cm
// make radius instead of 4.1cm, which silently cut the make window to a third.
export const BALL_SCALE = CUP_SCALE // tracks the CUP (make radius), not the table
export const BALL_RADIUS = 0.02 * BALL_SCALE // m (40mm diameter x scale)
export const BALL_MASS = 0.0027 * BALL_SCALE * BALL_SCALE * BALL_SCALE // kg
export const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS // m^2

// --- Air ---------------------------------------------------------------------
export const AIR_DENSITY = 1.225 // kg/m^3 at sea level
export const DRAG_CD = 0.47 // sphere at the Reynolds numbers a thrown ball sees

// Quadratic drag written as an acceleration: a = DRAG_K * v^2, opposing motion.
//   DRAG_K = 0.5 * rho * Cd * A / m = 0.134 /m
// Sanity check: terminal velocity = sqrt(g / DRAG_K) = 8.6 m/s, which matches a
// real ping pong ball (~9 m/s). At a 5 m/s throw this is 3.35 m/s^2 of decel —
// about a third of gravity. Dropping drag makes throws sail long and feel floaty.
export const DRAG_K = (0.5 * AIR_DENSITY * DRAG_CD * BALL_AREA) / BALL_MASS

// Magnus (spin) written as an acceleration: a = MAGNUS_K * (omega x v).
//   MAGNUS_K = 0.5 * rho * A * r / m = 5.70e-3
// Derived from F = 0.5*rho*A*Cl*v^2 with the small-spin-parameter approximation
// Cl ~ S = r*omega/v, which collapses to F = 0.5*rho*A*r*omega*v.
// At omega=100 rad/s and v=5 m/s that is 2.85 m/s^2 ~= 29% of gravity.
// Measured effect (see _debug/debug_test.ts): on clean swish shots backspin barely
// moves the make rate — 7.9% of the throw space at 70 rad/s vs 8.2% at 120. What
// it does change is the power required (55% -> 62%) and the entry angle (58 -> 60
// deg). Its rim-out-killing behaviour lives in the collision path, not here, and
// is NOT yet covered by the sweep — verify that in-engine before trusting it.
export const MAGNUS_K = (0.5 * AIR_DENSITY * BALL_AREA * BALL_RADIUS) / BALL_MASS

export const GRAVITY = -9.81 // m/s^2

// Spin decays in air; ~4 s to lose most of it over a <1.5 s flight it barely matters,
// but it keeps long bounce-shot rallies from spinning forever.
export const SPIN_DECAY = 0.25 // fraction of omega lost per second

// --- Cups: 16 oz Solo cup, x CUP_SCALE ----------------------------------------
export const CUP_RIM_RADIUS = 0.0475 * CUP_SCALE // m (9.5 cm rim diameter)
export const CUP_BASE_RADIUS = 0.03 * CUP_SCALE // m (6.0 cm base diameter)
export const CUP_SPACING = 0.098 * CUP_SCALE // m, centre-to-centre, touching

// --- Cup model (assets/models/bpcup.glb) --------------------------------------
// Bounding box read straight out of the GLB accessors: 2.0635 wide x 2.1421 tall,
// base sitting at Y~0 once the node translation is applied. Not authored at real
// scale, so it is fitted by RIM DIAMETER and its own aspect ratio then sets the
// cup height — that way the physics rim plane is exactly where the mesh rim is
// drawn. Re-measure these two numbers if the model is ever re-exported.
export const CUP_MODEL_DIAMETER = 2.0635
export const CUP_MODEL_HEIGHT = 2.1421
/** Uniform scale that makes the model's rim match CUP_RIM_RADIUS. */
export const CUP_MODEL_SCALE = (CUP_RIM_RADIUS * 2) / CUP_MODEL_DIAMETER
// Derived from the model rather than the real 11.7cm, so drawn rim == physics rim.
export const CUP_HEIGHT = CUP_MODEL_HEIGHT * CUP_MODEL_SCALE

// A cup holds ~2 oz of beer in play. A ball that reaches the liquid stops dead —
// it does not bounce back out. This is why a made cup is unambiguous in real life.
export const CUP_LIQUID_DEPTH = 0.03 // m up from the cup floor

/** Rows of a 10-cup rack sit sqrt(3)/2 * spacing apart (equilateral triangle). */
export const ROW_SPACING = (CUP_SPACING * Math.sqrt(3)) / 2
/** Outer footprint of the rack: 4-cup back row, and apex-to-back-row depth. */
export const RACK_WIDTH = 3 * CUP_SPACING + 2 * CUP_RIM_RADIUS
export const RACK_DEPTH = 3 * ROW_SPACING + 2 * CUP_RIM_RADIUS

// --- Table --------------------------------------------------------------------
// Table HEIGHT is never scaled: 0.70m is real bar-table height, and scaling it up
// puts the surface over the player's head, impossible to throw onto.
export const TABLE_HEIGHT = 0.7 // m (27.5 in), top surface

// ⚠ THE THROW ENVELOPE IS FIXED. DO NOT DERIVE IT FROM THE LAYOUT. ⚠
// SPEED_MIN/SPEED_MAX (further down) are tuned purely for FEEL — a split-second
// tap drops the ball ~1m in front of the player, full power lands just past the
// cups. They were repeatedly re-derived from whatever the cup distance happened
// to be, which meant every table change silently made the throw powerful again.
//
// The dependency now runs the other way: the power is a constant, and the rack is
// placed where that throw can actually reach. 2.0m is the distance the tuned
// envelope lands on. Changing THIS requires re-tuning the feel; changing the
// table's length does not (see TABLE_LENGTH_MULT — extra length is added behind
// the cups and never touches the throw).
export const RACK_DISTANCE = 4.83 // m from the throw line to the rack centre

// LENGTH IS DERIVED so the cups always sit at the FAR end, like a real table.
// Previously length and rack distance were independent, which is how the cups
// ended up bunched at the near end of a 14.6m table with nothing beyond them.
// Now the table is exactly long enough to hold the throw plus the rack plus a
// lip — change RACK_DISTANCE and the table follows. Real regulation is 2.44m,
// so a 2.0m throw lands almost exactly on a real table's dimensions.
export const TABLE_END_MARGIN = 0.3 // m of table behind the back row

/** Minimum length that holds the throw plus the rack plus a lip. */
export const TABLE_LENGTH_MIN =
  RACK_DISTANCE - 0.3 + RACK_DEPTH / 2 + CUP_RIM_RADIUS + TABLE_END_MARGIN

// Extra length is added BEHIND the cups, never in front of them. That is what
// makes the table longer without lengthening the throw — the power stays exactly
// as tuned. The trade is that the cups no longer sit hard against the far edge;
// at 1.5 they end up around 60% along. To put them back at the very end, set this
// to 1.0 and raise RACK_DISTANCE instead — but that DOES cost power control
// (measured: 3.0m -> makes at 67-100% of the bar, 4.0m -> 79-100%).
export const TABLE_LENGTH_MULT = 1.0
export const TABLE_LENGTH = TABLE_LENGTH_MIN * TABLE_LENGTH_MULT

// Width must clear the rack or the back row hangs off both edges. The rack is
// 1.17m wide at CUP_SCALE 3, so the requested 30% of the old width (1.10m) was
// physically too narrow — 40% (1.46m) is the first that fits the cups.
export const TABLE_WIDTH = Math.max(0.61 * TABLE_SCALE * 0.4, RACK_WIDTH + 0.28)

// --- Restitution (measured coefficients) ---------------------------------------
export const RESTITUTION_TABLE = 0.85 // ping pong ball on a hard table
export const RESTITUTION_RIM = 0.6 // on a plastic cup rim — softer, absorbs more
export const RESTITUTION_LIQUID = 0.0 // beer kills it completely
export const FRICTION_TABLE = 0.25

// --- Layout ---------------------------------------------------------------------
// Table centre. Scene is 6 parcels (x 0..32, z 0..48); default spawn is x/z 0..3,
// so this sits a short walk forward of where the player appears.
export const TABLE_CENTER_X = 6

// The NEAR EDGE is the anchor, not the centre. Everything the player interacts
// with — where they stand, where the cups are — hangs off this, so changing the
// table's LENGTH now trims the far end only and never moves the throw or the
// rack. Deriving from the centre meant every resize shifted the whole play area
// and silently re-tuned the shot.
export const TABLE_NEAR_Z = 1.68
export const TABLE_CENTER_Z = TABLE_NEAR_Z + TABLE_LENGTH / 2

// Throw line: behind the near end, where a real player stands.
export const THROW_LINE_Z = TABLE_NEAR_Z - 0.3

// Rack centre. The table length is derived from this, so the cups are always at
// the far end. Raise RACK_DISTANCE for a longer throw AND a longer table — but
// re-run _debug/debug_test.ts afterwards, because a longer throw needs more power
// and narrows the usable part of the bar (measured: 2.0m -> makes at 35-100% of
// the bar, 3.0m -> 67-100%, 4.0m -> 79-100%).
export const RACK_Z = THROW_LINE_Z + RACK_DISTANCE

// --- Throw envelope --------------------------------------------------------------
// Set from the FIXED-ANGLE sweep in _debug/debug_test.ts, not the all-angles band.
// This distinction is the whole ballgame: angle is a held value the player sets,
// so they only ever experience the power window AT ONE ANGLE. The all-angles band
// looks wide (8.8-17.5 m/s here) because it silently trades angle against speed —
// but pin the angle and the real usable span is just 2.34 m/s (8.78-11.12).
// Bracketing the wide band left ~75% of the power bar as pure overshoot, which is
// exactly what "the power is enormous" felt like: everything past the first third
// sailed long. Bracketing the fixed-angle span puts 84% of the bar to work.
//
// After ANY change to TABLE_SCALE, re-run the sweep and take the SPEED_MIN/MAX it
// prints under "USABLE POWER AT A FIXED ANGLE" — not the one under the band above.
// SPEED_MAX is capped by RANGE, not by what makes a shot: a full-power miss must
// not sail off into the parcel. Measured worst case (spin 0, worst angle):
//   8.78 m/s -> lands 7.27m = exactly the table's far edge
//   9.60 m/s -> lands ~8.2m  = 0.9m past the edge   <- chosen
//  11.40 m/s -> lands 10.3m  = 3.0m past the edge   <- previous, too far
// Note how tight this is: the easiest make needs 8.75 m/s, so "always lands on
// the table" and "can score at all" are the SAME number at TABLE_SCALE 3. The
// rack sits only 0.67m from the far edge, so a smaller table is the only way to
// widen this. 8.6-9.6 keeps ~the entire bar useful (makes span 15%-98% of it).
// THE governing constraint, stated once so it stops being rediscovered:
//
//   range grows with speed SQUARED, so the further the cups are, the more of the
//   power bar is simply too weak to reach them.
//
// A "split-second tap lands 1m away" pins SPEED_MIN at 2.25 m/s. With cups 4.1m
// out, scoring needs 6.9-9.95 m/s, so every make lands in the top ~10% of the bar
// — which is exactly what "the throw is too powerful" feels like. Long table, cups
// at the far edge, and a 1m tap are mutually exclusive; measured, keeping the tap:
//   2.67m table -> makes at  35-100% of the bar
//   3.67m       ->           67-100%
//   5.50m       ->           89-100%
//   7.34m       ->           93-100%
//
// Resolution chosen: KEEP the long table and far-edge cups, DROP the 1m tap.
// SPEED_MIN sits just under the easiest make instead of at a tap distance, so the
// whole bar does useful work — 45-49% of it scores at every playable angle, the
// widest window this scene has had. A tap now throws ~3.5m rather than 1m.
// SPEED_MAX is still range-capped: worst case lands 5.9m, just off the far edge.
export const SPEED_MIN = 6.6
export const SPEED_MAX = 8.2

// --- The power CURVE ----------------------------------------------------------
// The "long table vs near tap" tradeoff above was only forced by mapping the bar
// LINEARLY to speed. That was an assumption, not physics. Splitting the bar in two
// dissolves it:
//
//   power 0 .. POWER_KNEE   ->  SPEED_TAP .. SPEED_MIN   (the near-throw ramp)
//   power POWER_KNEE .. 1   ->  SPEED_MIN .. SPEED_MAX   (the scoring band)
//
// A split-second tap sits at ~5-10% power, lands in the first segment and drops
// the ball right in front of the player. The remaining 65% of the travel still
// spreads across the whole scoring band, so control is unchanged. Both at once.
export const SPEED_TAP = 1.8 // m/s at 0% power — the gentlest possible lob
export const POWER_KNEE = 0.35 // fraction of the bar spent on the near-throw ramp

/**
 * Bar position (0..1) -> launch speed. MUST be the single source of truth: the
 * live throw and the _debug sweeps both call it, so the tuning numbers always
 * describe the thing the player is actually holding.
 */
export function speedForPower(power: number): number {
  const p = Math.max(0, Math.min(1, power))
  if (p < POWER_KNEE) {
    return SPEED_TAP + (SPEED_MIN - SPEED_TAP) * (p / POWER_KNEE)
  }
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * ((p - POWER_KNEE) / (1 - POWER_KNEE))
}
// Slower sweep = finer control. At 1.1s the bar crossed the usable band so fast
// that small timing errors became large power errors, which reads as "too
// powerful" even when the range is right.
export const CHARGE_SECONDS = 1.8 // hold time from 0% to 100%

// Longer, flatter throw than regulation, so the useful angles sit lower.
export const PITCH_MIN_DEG = 15
export const PITCH_MAX_DEG = 55

// Backspin range, rad/s. ~120 rad/s is a strong, deliberate backspin.
export const SPIN_MIN = 0
export const SPIN_MAX = 120
export const SPIN_DEFAULT = 70

// Release point, relative to the camera: a little forward and below eye line,
// where a hand actually is.
export const RELEASE_FORWARD = 0.35 // m
export const RELEASE_DOWN = 0.25 // m
