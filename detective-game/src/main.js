// 모순 탐정 - step 1: one witness, one testimony, one piece of evidence.
// Courtroom cross-examination format (an original case/characters), not a
// recreation of any specific existing game's story, art, or branding.

const CANVAS_W = 900
const CANVAS_H = 600

const canvas = document.getElementById('game')
canvas.width = CANVAS_W
canvas.height = CANVAS_H
const ctx = canvas.getContext('2d')

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ---------- Audio ----------
let audioCtx = null
let masterGain = null
function ensureAudio() {
  if (audioCtx) return audioCtx
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0.4
  masterGain.connect(audioCtx.destination)
  return audioCtx
}
function playTone({ freqFrom, freqTo, duration, type = 'sawtooth', gain = 0.3, delay = 0 }) {
  if (!audioCtx) return
  const t0 = audioCtx.currentTime + delay
  const osc = audioCtx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(20, freqFrom), t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + duration)
  const g = audioCtx.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.connect(g)
  g.connect(masterGain)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}
function playBlip() {
  playTone({ freqFrom: 1400, freqTo: 1400, duration: 0.03, type: 'square', gain: 0.07 })
}
function playObjectionSound() {
  playTone({ freqFrom: 1200, freqTo: 180, duration: 0.35, type: 'sawtooth', gain: 0.25 })
  playTone({ freqFrom: 900, freqTo: 900, duration: 0.1, type: 'square', gain: 0.15, delay: 0.1 })
}
function playCorrectSound() {
  playTone({ freqFrom: 523, freqTo: 523, duration: 0.12, type: 'sine', gain: 0.2 })
  playTone({ freqFrom: 784, freqTo: 784, duration: 0.18, type: 'sine', gain: 0.22, delay: 0.13 })
}

// ---------- Case data ----------
const WITNESS_NAME = '목격자 김수한'
const TESTIMONY = '저는 사건이 일어난 밤 10시, 계속 집에서 혼자 TV를 보고 있었습니다. 아무 데도 나가지 않았어요.'
const EVIDENCE = {
  name: '편의점 CCTV 사진',
  desc: '사건 당일 밤 10시 15분, 현장 근처 편의점에서 찍힌 사진. 김수한이 우산을 사고 있다.',
}
const CONTRADICTION_TEXT =
  '하지만 이 사진에는 사건 당일 밤 10시 15분, 현장 근처 편의점에 있는 당신이 찍혀 있습니다.\n"계속 집에 있었다"는 증언과 맞지 않습니다!'

const state = {
  phase: 'title', // title | testimony | evidencePick | objection | result
  revealChars: 0,
  objectionTimer: 0,
}

function fullTestimonyLength() {
  return TESTIMONY.length
}

// ---------- Input ----------
canvas.addEventListener('click', (e) => {
  ensureAudio()
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY

  if (state.phase === 'title') {
    state.phase = 'testimony'
    return
  }
  if (state.phase === 'testimony') {
    if (state.revealChars < fullTestimonyLength()) {
      state.revealChars = fullTestimonyLength()
      return
    }
    const btn = presentButtonRect()
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      state.phase = 'evidencePick'
    }
    return
  }
  if (state.phase === 'evidencePick') {
    const card = evidenceCardRect()
    if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
      state.phase = 'objection'
      state.objectionTimer = 0.9
      playObjectionSound()
    }
    return
  }
  if (state.phase === 'result') {
    return
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') {
    state.phase = 'title'
    state.revealChars = 0
    state.objectionTimer = 0
  }
})

function presentButtonRect() {
  return { x: CANVAS_W / 2 - 90, y: CANVAS_H - 70, w: 180, h: 40 }
}
function evidenceCardRect() {
  return { x: CANVAS_W / 2 - 140, y: CANVAS_H / 2 - 60, w: 280, h: 120 }
}

// ---------- Flat-sticker witness character ----------
function drawWitness(cx, baseY) {
  const OUTLINE = '#241a14'

  ctx.beginPath()
  ctx.moveTo(cx - 50, baseY + 20)
  ctx.lineTo(cx - 36, baseY - 70)
  ctx.lineTo(cx + 36, baseY - 70)
  ctx.lineTo(cx + 50, baseY + 20)
  ctx.closePath()
  ctx.fillStyle = '#4a6fa5'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - 14, baseY - 66)
  ctx.lineTo(cx, baseY - 46)
  ctx.lineTo(cx + 14, baseY - 66)
  ctx.strokeStyle = '#e8e0d0'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, baseY - 96, 26, 0, Math.PI * 2)
  ctx.fillStyle = '#e8b98a'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, baseY - 104, 26, Math.PI, Math.PI * 2)
  ctx.fillStyle = '#2b2118'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - 26, baseY - 104)
  ctx.lineTo(cx - 30, baseY - 80)
  ctx.lineTo(cx - 18, baseY - 92)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx + 26, baseY - 104)
  ctx.lineTo(cx + 30, baseY - 80)
  ctx.lineTo(cx + 18, baseY - 92)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = OUTLINE
  ctx.beginPath(); ctx.arc(cx - 9, baseY - 96, 2.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 9, baseY - 96, 2.4, 0, Math.PI * 2); ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx - 8, baseY - 85)
  ctx.quadraticCurveTo(cx, baseY - 80, cx + 8, baseY - 85)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2
  ctx.stroke()

  const sweatWobble = Math.sin(performance.now() / 180) * 1.5
  ctx.beginPath()
  ctx.moveTo(cx + 30, baseY - 118 + sweatWobble)
  ctx.quadraticCurveTo(cx + 36, baseY - 108 + sweatWobble, cx + 30, baseY - 100 + sweatWobble)
  ctx.quadraticCurveTo(cx + 24, baseY - 108 + sweatWobble, cx + 30, baseY - 118 + sweatWobble)
  ctx.fillStyle = '#8fd0ff'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
}

// ---------- Scenes ----------
function drawCourtroomBackdrop() {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  skyGrad.addColorStop(0, '#30405a')
  skyGrad.addColorStop(1, '#1c2535')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.fillStyle = '#4a3425'
  ctx.fillRect(0, CANVAS_H - 220, CANVAS_W, 220)
  ctx.fillStyle = '#5c4330'
  ctx.fillRect(0, CANVAS_H - 220, CANVAS_W, 10)

  ctx.fillStyle = '#3a2a1c'
  ctx.fillRect(CANVAS_W / 2 - 70, CANVAS_H - 200, 140, 180)
  ctx.strokeStyle = '#2a1e14'
  ctx.lineWidth = 3
  ctx.strokeRect(CANVAS_W / 2 - 70, CANVAS_H - 200, 140, 180)
}

function drawTitle() {
  ctx.fillStyle = '#14181f'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 42px sans-serif'
  ctx.fillText('모순 탐정', CANVAS_W / 2, CANVAS_H / 2 - 30)
  ctx.fillStyle = '#9fb3d9'
  ctx.font = '14px sans-serif'
  ctx.fillText('증언 속 거짓을 찾아 증거로 반박하라', CANVAS_W / 2, CANVAS_H / 2 + 6)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.fillText('클릭하여 시작', CANVAS_W / 2, CANVAS_H / 2 + 50)
}

function drawDialogueBox(name, text) {
  const boxX = 40
  const boxY = CANVAS_H - 150
  const boxW = CANVAS_W - 80
  const boxH = 110

  ctx.fillStyle = 'rgba(15, 12, 10, 0.92)'
  ctx.fillRect(boxX, boxY, boxW, boxH)
  ctx.strokeStyle = '#c9a85c'
  ctx.lineWidth = 2
  ctx.strokeRect(boxX, boxY, boxW, boxH)

  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(name, boxX + 18, boxY + 26)

  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  wrapText(text, boxX + 18, boxY + 52, boxW - 36, 22)
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const paragraphs = text.split('\n')
  let cy = y
  for (const para of paragraphs) {
    let line = ''
    for (const ch of para) {
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, cy)
        line = ch
        cy += lineHeight
      } else {
        line = test
      }
    }
    ctx.fillText(line, x, cy)
    cy += lineHeight
  }
}

function drawTestimonyScene() {
  drawCourtroomBackdrop()
  drawWitness(CANVAS_W / 2, CANVAS_H - 200)

  const revealed = TESTIMONY.slice(0, Math.floor(state.revealChars))
  drawDialogueBox(WITNESS_NAME, revealed)

  if (state.revealChars >= fullTestimonyLength()) {
    const btn = presentButtonRect()
    ctx.fillStyle = '#7a2e2e'
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h)
    ctx.strokeStyle = '#ffd36b'
    ctx.lineWidth = 2
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('증거 제출', btn.x + btn.w / 2, btn.y + btn.h / 2 + 5)
  }
}

function drawEvidencePickScene() {
  drawCourtroomBackdrop()
  drawWitness(CANVAS_W / 2, CANVAS_H - 200)
  ctx.fillStyle = 'rgba(10, 8, 6, 0.65)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('증거품을 선택해 제출하세요', CANVAS_W / 2, CANVAS_H / 2 - 90)

  const card = evidenceCardRect()
  ctx.fillStyle = '#e8dcbb'
  ctx.fillRect(card.x, card.y, card.w, card.h)
  ctx.strokeStyle = '#2a2017'
  ctx.lineWidth = 3
  ctx.strokeRect(card.x, card.y, card.w, card.h)

  ctx.fillStyle = '#9c8a5c'
  ctx.fillRect(card.x + 16, card.y + 16, card.w - 32, 60)
  ctx.strokeStyle = '#2a2017'
  ctx.lineWidth = 2
  ctx.strokeRect(card.x + 16, card.y + 16, card.w - 32, 60)
  ctx.fillStyle = '#2a2017'
  ctx.font = '11px sans-serif'
  ctx.fillText('[사진]', card.x + card.w / 2, card.y + 50)

  ctx.fillStyle = '#2b2317'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(EVIDENCE.name, card.x + card.w / 2, card.y + card.h - 14)
}

function drawObjectionScene() {
  drawCourtroomBackdrop()
  drawWitness(CANVAS_W / 2, CANVAS_H - 200)

  const t = 1 - clamp(state.objectionTimer / 0.9, 0, 1)
  const scale = t < 0.3 ? 1.6 - t * 2 : 1
  ctx.save()
  ctx.translate(CANVAS_W / 2, CANVAS_H / 2)
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(200, 30, 30, 0.85)'
  ctx.fillRect(-CANVAS_W / 2, -70, CANVAS_W, 140)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 56px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('이의있음!', 0, 18)
  ctx.restore()
}

function drawResultScene() {
  drawCourtroomBackdrop()
  drawWitness(CANVAS_W / 2, CANVAS_H - 200)
  drawDialogueBox('탐정', CONTRADICTION_TEXT)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('모순 발견!', CANVAS_W / 2, 50)
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  if (state.phase === 'title') {
    drawTitle()
    return
  }

  if (state.phase === 'testimony') {
    if (state.revealChars < fullTestimonyLength()) {
      state.revealChars += 0.6
      if (Math.floor(state.revealChars) % 2 === 0) playBlip()
    }
    drawTestimonyScene()
    return
  }

  if (state.phase === 'evidencePick') {
    drawEvidencePickScene()
    return
  }

  if (state.phase === 'objection') {
    drawObjectionScene()
    state.objectionTimer -= 1 / 60
    if (state.objectionTimer <= 0) {
      state.phase = 'result'
      playCorrectSound()
    }
    return
  }

  if (state.phase === 'result') {
    drawResultScene()
  }
}

function loop() {
  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
