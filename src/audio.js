let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function unlockAudio() {
  getCtx()
  ensureMusic()
}

function tone({ freq, duration, type = 'square', volume = 0.15, freqEnd, delay = 0 }) {
  const audioCtx = getCtx()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  const startTime = audioCtx.currentTime + delay
  osc.frequency.setValueAtTime(freq, startTime)
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), startTime + duration)
  gain.gain.setValueAtTime(volume, startTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}

function noiseBurst({ duration = 0.2, volume = 0.2 }) {
  const audioCtx = getCtx()
  const bufferSize = Math.floor(audioCtx.sampleRate * duration)
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }
  const noise = audioCtx.createBufferSource()
  noise.buffer = buffer
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(volume, audioCtx.currentTime)
  noise.connect(gain)
  gain.connect(audioCtx.destination)
  noise.start()
}

export function playAttackSwing() {
  tone({ freq: 500, freqEnd: 200, duration: 0.08, type: 'square', volume: 0.08 })
}

export function playFireball() {
  tone({ freq: 220, freqEnd: 660, duration: 0.18, type: 'sawtooth', volume: 0.1 })
  noiseBurst({ duration: 0.1, volume: 0.06 })
}

export function playMonsterDown() {
  noiseBurst({ duration: 0.18, volume: 0.15 })
  tone({ freq: 160, freqEnd: 40, duration: 0.18, type: 'sawtooth', volume: 0.08 })
}

export function playPlayerHit() {
  tone({ freq: 300, freqEnd: 80, duration: 0.35, type: 'sawtooth', volume: 0.18 })
}

export function playPickup() {
  tone({ freq: 660, duration: 0.09, type: 'triangle', volume: 0.12 })
  tone({ freq: 990, duration: 0.09, type: 'triangle', volume: 0.12, delay: 0.09 })
}

export function playLevelUp() {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => tone({ freq, duration: 0.15, type: 'square', volume: 0.1, delay: i * 0.1 }))
}

export function playGameOver() {
  const notes = [392, 349.23, 293.66, 196]
  notes.forEach((freq, i) => tone({ freq, duration: 0.3, type: 'sawtooth', volume: 0.14, delay: i * 0.18 }))
}

// Looping background music: a short melody + a low bass note under each
// step, rescheduled note-by-note with setTimeout for as long as it's on.
// Two tracks (town / dungeon) so the mood changes with the scene.
const MUSIC_TOWN = [
  { freq: 392, bass: 196, dur: 0.45 },
  { freq: 440, bass: 196, dur: 0.45 },
  { freq: 523.25, bass: 261.63, dur: 0.45 },
  { freq: 440, bass: 261.63, dur: 0.45 },
  { freq: 392, bass: 174.61, dur: 0.45 },
  { freq: 349.23, bass: 174.61, dur: 0.45 },
  { freq: 392, bass: 196, dur: 0.9 },
  { freq: 440, bass: 220, dur: 0.45 },
  { freq: 523.25, bass: 220, dur: 0.45 },
  { freq: 587.33, bass: 293.66, dur: 0.45 },
  { freq: 523.25, bass: 293.66, dur: 0.45 },
  { freq: 440, bass: 174.61, dur: 0.45 },
  { freq: 392, bass: 174.61, dur: 0.45 },
  { freq: 349.23, bass: 196, dur: 0.9 },
]

const MUSIC_DUNGEON = [
  { freq: 293.66, bass: 146.83, dur: 0.35 },
  { freq: 349.23, bass: 146.83, dur: 0.35 },
  { freq: 293.66, bass: 174.61, dur: 0.35 },
  { freq: 261.63, bass: 174.61, dur: 0.35 },
  { freq: 293.66, bass: 146.83, dur: 0.7 },
  { freq: 349.23, bass: 164.81, dur: 0.35 },
  { freq: 392, bass: 164.81, dur: 0.35 },
  { freq: 349.23, bass: 146.83, dur: 0.35 },
  { freq: 293.66, bass: 146.83, dur: 0.35 },
  { freq: 261.63, bass: 130.81, dur: 0.7 },
]

const MUSIC_FOREST = [
  { freq: 329.63, bass: 164.81, dur: 0.5 },
  { freq: 392, bass: 164.81, dur: 0.5 },
  { freq: 440, bass: 196, dur: 0.5 },
  { freq: 392, bass: 196, dur: 0.5 },
  { freq: 329.63, bass: 130.81, dur: 1.0 },
  { freq: 293.66, bass: 146.83, dur: 0.5 },
  { freq: 329.63, bass: 146.83, dur: 0.5 },
  { freq: 392, bass: 174.61, dur: 0.5 },
  { freq: 329.63, bass: 130.81, dur: 1.0 },
]

const TRACKS = {
  forest: { melody: MUSIC_FOREST, lead: 'triangle', leadVolume: 0.045, bassVolume: 0.04 },
  town: { melody: MUSIC_TOWN, lead: 'triangle', leadVolume: 0.05, bassVolume: 0.04 },
  dungeon: { melody: MUSIC_DUNGEON, lead: 'sawtooth', leadVolume: 0.045, bassVolume: 0.05 },
}

let currentTrack = 'town'
const MUSIC_PREF_KEY = 'dungeon-rpg-music'
// 음악 켬/끔은 기억해 둔다. 처음 방문 때는 켜져 있다 (브라우저가 소리를 막는 동안은 첫 키 입력 때 시작).
function readMusicPref() {
  try {
    const v = localStorage.getItem(MUSIC_PREF_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}
function writeMusicPref(on) {
  try {
    localStorage.setItem(MUSIC_PREF_KEY, on ? '1' : '0')
  } catch {
    // 저장소를 못 쓰면 이번 방문 동안만 유지
  }
}
let musicEnabled = readMusicPref()
let musicTimeoutId = null

function scheduleMusic(index) {
  if (!musicEnabled) return
  // 브라우저가 소리를 아직 막고 있으면(첫 키 입력 전) 음을 쌓아 두지 않고 기다린다
  if (!ctx || ctx.state !== 'running') {
    try {
      if (ctx) ctx.resume()
    } catch {
      // 재생 허용 전
    }
    musicTimeoutId = setTimeout(() => scheduleMusic(index), 300)
    return
  }
  const track = TRACKS[currentTrack] || TRACKS.town
  const step = track.melody[index % track.melody.length]
  // 한 음에서 오류가 나더라도 음악 흐름이 끊기지 않게 한다
  try {
    tone({ freq: step.freq, duration: step.dur * 0.9, type: track.lead, volume: track.leadVolume })
    tone({ freq: step.bass, duration: step.dur * 0.9, type: 'sine', volume: track.bassVolume })
  } catch {
    // 오디오를 아직 쓸 수 없음
  }
  musicTimeoutId = setTimeout(() => scheduleMusic(index + 1), step.dur * 1000)
}

// 음악이 켜져 있는데 흐름이 멈춰 있으면 (장면 전환·첫 입력 직후 등) 다시 시작한다
export function ensureMusic() {
  if (musicEnabled && !musicTimeoutId) scheduleMusic(0)
}

export function setMusicTrack(name) {
  if (currentTrack === name) {
    ensureMusic()
    return
  }
  currentTrack = name
  if (musicEnabled) {
    clearTimeout(musicTimeoutId)
    scheduleMusic(0)
  }
}

export function setMusicEnabled(enabled) {
  musicEnabled = enabled
  if (musicTimeoutId) {
    clearTimeout(musicTimeoutId)
    musicTimeoutId = null
  }
  if (musicEnabled) scheduleMusic(0)
}

export function toggleMusic() {
  setMusicEnabled(!musicEnabled)
  writeMusicPref(musicEnabled)
  return musicEnabled
}

export function isMusicEnabled() {
  return musicEnabled
}
