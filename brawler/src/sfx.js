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
  startMusic()
}

export function toggleMute() {
  muted = !muted
  if (musicGain && ac) musicGain.gain.setTargetAtTime(muted ? 0 : MUSIC_VOL, ac.currentTime, 0.05)
  return muted
}

// ---- 배경음악: 어두운 도시 느낌의 비트 있는 루프 (Am - F - C - G, 8분음표 16스텝 x 4마디) ----
const MUSIC_VOL = 0.5
let musicGain = null
let musicTimer = null
let musicStep = 0
let musicNext = 0
const BPM = 128
const STEP = 60 / BPM / 2
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12)
// 마디별 베이스 루트(MIDI)와 코드 구성음
const BARS = [
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [53, 57, 60] }, // F
  { root: 48, chord: [55, 60, 64] }, // C
  { root: 43, chord: [55, 59, 62] }, // G
]
const LEAD = [ // 마디당 8스텝(8분음표 x 8 = 1마디 4/4), 0 = 쉼표 — 스텝 2개가 1박
  [76, 0, 72, 0, 74, 76, 0, 79],
  [77, 0, 74, 0, 72, 74, 0, 77],
  [79, 0, 76, 0, 72, 76, 0, 84],
  [83, 0, 79, 0, 74, 79, 0, 78],
]

function mTone(freq, t0, dur, type, vol) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(musicGain)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}
function mNoise(t0, dur, vol, hp) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ac.createBufferSource()
  src.buffer = buf
  const f = ac.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = hp
  const g = ac.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(musicGain)
  src.start(t0)
}

function scheduleStep(i, t0) {
  const bar = BARS[Math.floor(i / 8) % 4]
  const s = i % 8
  // 킥: 매 박 / 스네어: 2,4박 / 하이햇: 스텝마다
  if (s % 2 === 0) mTone(120, t0, 0.14, 'sine', 0.55)
  if (s === 2 || s === 6) mNoise(t0, 0.12, 0.2, 1800)
  mNoise(t0, 0.03, s % 2 ? 0.07 : 0.045, 7000)
  // 베이스: 옥타브 오르내리는 8분음표
  mTone(hz(bar.root + (s % 4 === 3 ? 12 : 0)), t0, STEP * 0.9, 'sawtooth', 0.11)
  // 코드 스탭 (오프비트)
  if (s % 2 === 1) for (const n of bar.chord) mTone(hz(n), t0, STEP * 0.8, 'square', 0.025)
  // 리드 멜로디
  const note = LEAD[Math.floor(i / 8) % 4][s]
  if (note) mTone(hz(note), t0, STEP * 1.6, 'triangle', 0.1)
}

function musicTick() {
  if (!ac) return
  if (ac.state === 'running') {
    if (musicNext < ac.currentTime) musicNext = ac.currentTime + 0.05
    while (musicNext < ac.currentTime + 0.35) {
      scheduleStep(musicStep, musicNext)
      musicNext += STEP
      musicStep = (musicStep + 1) % 32
    }
  }
  musicTimer = setTimeout(musicTick, 90)
}

function startMusic() {
  if (!ac || musicTimer) return
  try {
    musicGain = ac.createGain()
    musicGain.gain.value = muted ? 0 : MUSIC_VOL
    musicGain.connect(ac.destination)
    musicTick()
  } catch {
    musicTimer = null
  }
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
