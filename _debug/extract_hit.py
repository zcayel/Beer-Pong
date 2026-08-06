# Decode the ping-pong mp3 via Blender's bundled `aud` module (no ffmpeg on this
# machine), find the discrete ball hits by onset detection, and write the Nth one
# out as a WAV for the table-bounce SFX.
import os
import sys
import wave
import struct
import math

import aud

SRC = sys.argv[sys.argv.index('--') + 1]
OUT = sys.argv[sys.argv.index('--') + 2]
WHICH = int(sys.argv[sys.argv.index('--') + 3])  # 1-based hit index

RATE = 22050
tmp = os.path.join(os.path.dirname(OUT), '_decoded_tmp.wav')

snd = aud.Sound.file(SRC)
snd = snd.rechannel(1).resample(RATE)
snd.write(tmp, RATE, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_WAV, aud.CODEC_PCM)

with wave.open(tmp, 'rb') as w:
    n = w.getnframes()
    raw = w.readframes(n)
samples = list(struct.unpack('<%dh' % n, raw))
peak = max(1, max(abs(s) for s in samples))
norm = [s / peak for s in samples]
print('decoded %d samples (%.2fs) @ %dHz' % (n, n / RATE, RATE))

# Envelope: rectify + one-pole smoothing, then find rising edges above a
# threshold with a refractory gap so one hit is not counted several times.
env = []
e = 0.0
for s in norm:
    a = abs(s)
    e = a if a > e else e * 0.9993
    env.append(e)

# Hysteresis, not a fixed refractory window. Re-arming purely on a time gap
# double-counted every hit: the onset is walked BACK from the crossing, so after
# skipping the gap the test `i - onsets[-1] > GAP` was already true again and the
# same strike fired twice (visible as pairs exactly GAP apart). Requiring the
# envelope to fall back below a lower threshold first fixes it properly.
THRESH_ON = 0.16
THRESH_OFF = 0.05
MIN_GAP = int(0.05 * RATE)
onsets = []
armed = True
i = 0
while i < len(env):
    if armed and env[i] > THRESH_ON:
        j = i
        while j > 0 and env[j] > 0.02 and i - j < int(0.01 * RATE):
            j -= 1
        if not onsets or j - onsets[-1] > MIN_GAP:
            onsets.append(j)
        armed = False
    elif not armed and env[i] < THRESH_OFF:
        armed = True
    i += 1

print('found %d hits at: %s' % (len(onsets), ', '.join('%.3fs' % (o / RATE) for o in onsets)))
if len(onsets) < WHICH:
    print('ERROR: only %d hits, wanted #%d' % (len(onsets), WHICH))
    sys.exit(1)

start = onsets[WHICH - 1]
end = onsets[WHICH] if WHICH < len(onsets) else len(samples)
end = min(end, start + int(0.22 * RATE))  # bounce SFX fires often; keep it tight or repeats turn to mud

clip = samples[start:end]
# Trim trailing near-silence, then apply a short fade in/out to kill clicks.
tail = len(clip)
while tail > int(0.02 * RATE) and abs(clip[tail - 1]) < peak * 0.01:
    tail -= 1
clip = clip[:tail]

fi = min(int(0.0005 * RATE), len(clip) // 8)
fo = min(int(0.010 * RATE), len(clip) // 3)
for k in range(fi):
    clip[k] = int(clip[k] * (k / fi))
for k in range(fo):
    clip[len(clip) - 1 - k] = int(clip[len(clip) - 1 - k] * (k / fo))

# Normalise to a consistent level so it sits with the other SFX.
cpk = max(1, max(abs(c) for c in clip))
gain = (0.89 * 32767) / cpk
clip = [max(-32768, min(32767, int(c * gain))) for c in clip]

with wave.open(OUT, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(struct.pack('<%dh' % len(clip), *clip))

os.remove(tmp)
print('wrote %s: hit #%d, %.0fms, %d bytes' % (OUT, WHICH, len(clip) / RATE * 1000, os.path.getsize(OUT)))
