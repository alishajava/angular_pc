// Tiny WebAudio sound effects - synthesized blips, no audio files. Browsers
// block audio until the first user gesture, so the context is created
// lazily by unlockSfx() (called from the first key/pointer event).
let ac = null
let muted = false

export function unlockSfx() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)()
    else if (ac.state === 'suspended') ac.resume()
  } catch {
    ac = null
  }
}

export function toggleMute() {
  muted = !muted
  return muted
}

export function isMuted() {
  return muted
}

function tone(freq, dur, { type = 'sine', vol = 0.1, to = null, delay = 0 } = {}) {
  if (!ac || muted) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur, { vol = 0.12, freq = 1200, delay = 0 } = {}) {
  if (!ac || muted) return
  const t0 = ac.currentTime + delay
  const len = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = freq
  const gain = ac.createGain()
  gain.gain.value = vol
  src.connect(filter).connect(gain).connect(ac.destination)
  src.start(t0)
}

export const sfx = {
  click: () => tone(520, 0.06, { type: 'triangle', vol: 0.07 }),
  start: () => { tone(392, 0.1, { type: 'triangle' }); tone(523, 0.1, { type: 'triangle', delay: 0.09 }); tone(784, 0.18, { type: 'triangle', delay: 0.18 }) },
  pickup: () => { tone(660, 0.07, { type: 'square', vol: 0.05 }); tone(990, 0.1, { type: 'square', vol: 0.05, delay: 0.06 }) },
  coin: () => { tone(988, 0.06, { type: 'square', vol: 0.05 }); tone(1319, 0.16, { type: 'square', vol: 0.05, delay: 0.06 }) },
  good: () => { tone(523, 0.09, { type: 'triangle' }); tone(659, 0.09, { type: 'triangle', delay: 0.08 }); tone(784, 0.16, { type: 'triangle', delay: 0.16 }) },
  bad: () => tone(220, 0.22, { type: 'sawtooth', vol: 0.06, to: 130 }),
  hit: () => { noise(0.08, { vol: 0.16, freq: 1800 }); tone(160, 0.08, { type: 'square', vol: 0.06, to: 90 }) },
  heavy: () => { noise(0.16, { vol: 0.2, freq: 900 }); tone(110, 0.16, { type: 'square', vol: 0.08, to: 55 }) },
  hurt: () => tone(300, 0.16, { type: 'sawtooth', vol: 0.07, to: 120 }),
  whoosh: () => noise(0.12, { vol: 0.07, freq: 2600 }),
  jump: () => tone(320, 0.14, { type: 'square', vol: 0.045, to: 640 }),
  build: () => { noise(0.05, { vol: 0.1, freq: 700 }); tone(240, 0.06, { type: 'square', vol: 0.04 }) },
  splash: () => noise(0.22, { vol: 0.09, freq: 1500 }),
  sleep: () => { tone(523, 0.2, { vol: 0.07 }); tone(440, 0.2, { vol: 0.07, delay: 0.18 }); tone(349, 0.36, { vol: 0.07, delay: 0.36 }) },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.12 })); tone(1319, 0.4, { type: 'triangle', delay: 0.5 }) },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.08, delay: i * 0.16 })) },
  alarm: () => { tone(880, 0.12, { type: 'square', vol: 0.05 }); tone(660, 0.12, { type: 'square', vol: 0.05, delay: 0.14 }) },
}
