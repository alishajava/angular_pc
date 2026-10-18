let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function unlockAudio() {
  getCtx()
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

const TRACKS = {
  town: { melody: MUSIC_TOWN, lead: 'triangle', leadVolume: 0.05, bassVolume: 0.04 },
  dungeon: { melody: MUSIC_DUNGEON, lead: 'sawtooth', leadVolume: 0.045, bassVolume: 0.05 },
}

let currentTrack = 'town'
let musicEnabled = false
let musicTimeoutId = null

function scheduleMusic(index) {
  if (!musicEnabled) return
  const track = TRACKS[currentTrack]
  const step = track.melody[index % track.melody.length]
  tone({ freq: step.freq, duration: step.dur * 0.9, type: track.lead, volume: track.leadVolume })
  tone({ freq: step.bass, duration: step.dur * 0.9, type: 'sine', volume: track.bassVolume })
  musicTimeoutId = setTimeout(() => scheduleMusic(index + 1), step.dur * 1000)
}

export function setMusicTrack(name) {
  if (currentTrack === name) return
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
  return musicEnabled
}

export function isMusicEnabled() {
  return musicEnabled
}
