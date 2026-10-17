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

export function playShoot() {
  tone({ freq: 880, freqEnd: 1400, duration: 0.08, type: 'square', volume: 0.07 })
}

export function playExplosion() {
  noiseBurst({ duration: 0.18, volume: 0.15 })
  tone({ freq: 160, freqEnd: 40, duration: 0.18, type: 'sawtooth', volume: 0.08 })
}

export function playPlayerHit() {
  tone({ freq: 300, freqEnd: 80, duration: 0.35, type: 'sawtooth', volume: 0.18 })
}

export function playWaveClear() {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => tone({ freq, duration: 0.15, type: 'square', volume: 0.1, delay: i * 0.1 }))
}

export function playGameOver() {
  const notes = [392, 349.23, 293.66, 196]
  notes.forEach((freq, i) => tone({ freq, duration: 0.3, type: 'sawtooth', volume: 0.14, delay: i * 0.18 }))
}
