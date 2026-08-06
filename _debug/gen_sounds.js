// Synthesises the ping pong SFX as 16-bit mono WAVs. No ffmpeg on this machine,
// and no sample library, so the clips are generated from a physical description
// of the sound. Deterministic LCG noise so re-runs are byte-identical.
const fs = require('fs')
const path = require('path')

const RATE = 22050

let seed = 1337
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed / 0x7fffffff) * 2 - 1
}

function writeWav(file, samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  // The data chunk SIZE at offset 40. Omitting this wrote a header claiming zero
  // audio bytes — the files looked fine on disk and were completely silent.
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  fs.writeFileSync(file, buf)
  return buf.length
}

// A ping pong bounce is a very short, bright "pock": a hard transient plus a few
// high partials from the hollow shell, decaying in a few tens of milliseconds.
function bounce({ dur, partials, tau, noiseAmt, noiseTau }) {
  const n = Math.floor(RATE * dur)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    let v = 0
    for (const p of partials) v += p.amp * Math.sin(2 * Math.PI * p.f * t) * Math.exp(-t / tau)
    v += rnd() * noiseAmt * Math.exp(-t / noiseTau) // strike transient
    // short fade-in kills the DC click at sample 0
    const atk = Math.min(1, t / 0.0004)
    out[i] = v * atk * 0.8
  }
  return out
}

const dir = path.join(__dirname, '..', 'assets', 'sounds')
fs.mkdirSync(dir, { recursive: true })

// Table bounce — the classic hollow "pock".
const tableHit = bounce({
  dur: 0.09,
  partials: [
    { f: 1750, amp: 0.55 },
    { f: 2610, amp: 0.3 },
    { f: 3900, amp: 0.18 },
    { f: 5200, amp: 0.09 }
  ],
  tau: 0.011,
  noiseAmt: 0.5,
  noiseTau: 0.0016
})

// Cup rim — plastic, duller and shorter than the table.
const rimHit = bounce({
  dur: 0.07,
  partials: [
    { f: 900, amp: 0.5 },
    { f: 1400, amp: 0.28 },
    { f: 2200, amp: 0.12 }
  ],
  tau: 0.009,
  noiseAmt: 0.38,
  noiseTau: 0.0014
})

// Made cup — a low thunk plus a short liquid splash tail.
function splash() {
  const dur = 0.42
  const n = Math.floor(RATE * dur)
  const out = new Float32Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const thunk = 0.55 * Math.sin(2 * Math.PI * 300 * t) * Math.exp(-t / 0.035)
    const body = 0.3 * Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t / 0.06)
    // band-ish noise for the water: one-pole low-pass on white, sweeping down
    const target = rnd()
    lp += (target - lp) * (0.55 - 0.4 * Math.min(1, t / 0.3))
    const wet = lp * 0.42 * Math.exp(-t / 0.13) * (1 - Math.exp(-t / 0.004))
    const atk = Math.min(1, t / 0.0004)
    out[i] = (thunk + body + wet) * atk * 0.85
  }
  return out
}

// pong_table.wav is NOT generated here: it is hit #3 extracted from the user's
// mp3 by _debug/extract_hit.py. Generating it here would silently overwrite it.
const a = 0
const b = writeWav(path.join(dir, 'pong_rim.wav'), rimHit)
const c = writeWav(path.join(dir, 'pong_cup.wav'), splash())
console.log('pong_table.wav  (skipped - owned by extract_hit.py)')
console.log(`pong_rim.wav    ${b} bytes  (${(rimHit.length / RATE * 1000).toFixed(0)}ms)`)
console.log(`pong_cup.wav    ${c} bytes  (420ms)`)
