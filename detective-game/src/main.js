// 모순 탐정 - step 2: a case begins, the detective investigates the scene,
// then confronts the witness and reveals the culprit. Own story/characters,
// not a recreation of any specific existing game's assets or branding.

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
function playClueSound() {
  playTone({ freqFrom: 500, freqTo: 900, duration: 0.14, type: 'sine', gain: 0.16 })
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
const CASE_INTRO = [
  '어느 새벽, 조용한 주택가의 한 사무실에서 침입 사건이 발생했다.',
  '신고를 받은 탐정이 현장에 도착했다.',
]

const HOTSPOTS = [
  {
    id: 'desk',
    label: '책상',
    rect: { x: 560, y: 380, w: 220, h: 110 },
    text: '서류가 어지럽게 흩어져 있다. 몸싸움이 있었던 흔적일까?',
    examined: false,
  },
  {
    id: 'window',
    label: '창문',
    rect: { x: 110, y: 120, w: 160, h: 150 },
    text: '창문이 살짝 열려 있다. 바깥으로는 골목길과 편의점 불빛이 보인다.',
    examined: false,
  },
  {
    id: 'cctv',
    label: 'CCTV 모니터',
    rect: { x: 640, y: 90, w: 130, h: 80 },
    text: '보안 카메라 영상을 되돌려 보니, 사건 당일 밤 10시 15분경 편의점 앞을 지나가는 한 남자가 찍혀 있다. 왠지 낯이 익다...',
    examined: false,
    givesEvidence: true,
  },
  {
    id: 'umbrella',
    label: '우산',
    rect: { x: 300, y: 310, w: 70, h: 130 },
    text: '문 옆에 젖은 우산이 세워져 있다. 편의점 가격표가 아직 붙어 있다. 사건 당일 밤에 산 것일까?',
    examined: false,
  },
]

const WITNESS_NAME = '목격자 김수한'
const TESTIMONY = '저는 사건이 일어난 밤 10시, 계속 집에서 혼자 TV를 보고 있었습니다. 아무 데도 나가지 않았어요.'
const EVIDENCE = {
  name: '편의점 CCTV 사진',
  desc: '사건 당일 밤 10시 15분, 현장 근처 편의점에서 찍힌 사진. 김수한이 우산을 사고 있다.',
}
const CONTRADICTION_TEXT =
  '하지만 이 사진에는 사건 당일 밤 10시 15분, 현장 근처 편의점에 있는 당신이 찍혀 있습니다.\n"계속 집에 있었다"는 증언과 맞지 않습니다!'
const REVEAL_TEXT = '당신의 알리바이는 거짓이었습니다. 사건 현장 근처에 있었다는 사실이 이제 증거로 드러났습니다.\n범인은 바로 당신, 김수한입니다!'

const state = {
  phase: 'title', // title | intro | investigate | testimony | evidencePick | objection | result
  introLine: 0,
  activeClueText: '현장을 둘러보자. 수상한 곳을 클릭해보자.',
  revealChars: 0,
  objectionTimer: 0,
}

function fullTestimonyLength() {
  return TESTIMONY.length
}
function allHotspotsExamined() {
  return HOTSPOTS.every((h) => h.examined)
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
    state.phase = 'intro'
    return
  }
  if (state.phase === 'intro') {
    if (state.introLine < CASE_INTRO.length - 1) {
      state.introLine += 1
    } else {
      state.phase = 'investigate'
    }
    return
  }
  if (state.phase === 'investigate') {
    const hit = HOTSPOTS.find(
      (h) => mx >= h.rect.x && mx <= h.rect.x + h.rect.w && my >= h.rect.y && my <= h.rect.y + h.rect.h,
    )
    if (hit) {
      hit.examined = true
      state.activeClueText = hit.text
      playClueSound()
      return
    }
    if (allHotspotsExamined()) {
      const btn = proceedButtonRect()
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        state.phase = 'testimony'
      }
    }
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
    state.introLine = 0
    state.activeClueText = '현장을 둘러보자. 수상한 곳을 클릭해보자.'
    state.revealChars = 0
    state.objectionTimer = 0
    for (const h of HOTSPOTS) h.examined = false
  }
})

function presentButtonRect() {
  return { x: CANVAS_W / 2 - 90, y: CANVAS_H - 70, w: 180, h: 40 }
}
function evidenceCardRect() {
  return { x: CANVAS_W / 2 - 140, y: CANVAS_H / 2 - 60, w: 280, h: 120 }
}
function proceedButtonRect() {
  return { x: CANVAS_W / 2 - 110, y: CANVAS_H - 70, w: 220, h: 40 }
}

// ---------- Flat-sticker characters ----------
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

function drawDetective(cx, baseY) {
  const OUTLINE = '#1c1710'

  ctx.beginPath()
  ctx.moveTo(cx - 44, baseY + 20)
  ctx.lineTo(cx - 32, baseY - 66)
  ctx.lineTo(cx + 32, baseY - 66)
  ctx.lineTo(cx + 44, baseY + 20)
  ctx.closePath()
  ctx.fillStyle = '#4a4538'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - 10, baseY - 62)
  ctx.lineTo(cx, baseY - 44)
  ctx.lineTo(cx + 10, baseY - 62)
  ctx.strokeStyle = '#d8cfa8'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, baseY - 90, 23, 0, Math.PI * 2)
  ctx.fillStyle = '#d9a876'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  ctx.fillStyle = OUTLINE
  ctx.beginPath(); ctx.arc(cx - 8, baseY - 90, 2.2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 8, baseY - 90, 2.2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - 7, baseY - 81)
  ctx.lineTo(cx + 7, baseY - 81)
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.ellipse(cx, baseY - 108, 30, 9, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#2e2a22'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 16, baseY - 108)
  ctx.lineTo(cx - 14, baseY - 128)
  ctx.lineTo(cx + 14, baseY - 128)
  ctx.lineTo(cx + 16, baseY - 108)
  ctx.closePath()
  ctx.fillStyle = '#3a3528'
  ctx.fill()
  ctx.lineWidth = 2.5
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

function drawRoomBackdrop() {
  const wallGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  wallGrad.addColorStop(0, '#3c4738')
  wallGrad.addColorStop(1, '#232b1e')
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.fillStyle = '#5a4632'
  ctx.fillRect(0, CANVAS_H - 160, CANVAS_W, 160)
  ctx.fillStyle = '#6b5440'
  ctx.fillRect(0, CANVAS_H - 160, CANVAS_W, 8)
}

function drawHotspots() {
  for (const h of HOTSPOTS) {
    const { x, y, w, h: hh } = h.rect
    if (h.id === 'desk') {
      ctx.fillStyle = '#6b4a2e'
      ctx.fillRect(x, y, w, hh)
      ctx.strokeStyle = '#2a1c10'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, hh)
      ctx.fillStyle = '#e8dcbb'
      ctx.fillRect(x + 20, y + 14, 70, 30)
      ctx.strokeStyle = '#2a1c10'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 20, y + 14, 70, 30)
    } else if (h.id === 'window') {
      ctx.fillStyle = '#5c4630'
      ctx.fillRect(x - 8, y - 8, w + 16, hh + 16)
      ctx.fillStyle = h.examined ? '#2b3a50' : '#4d6f95'
      ctx.fillRect(x, y, w, hh)
      ctx.strokeStyle = '#2a1c10'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, hh)
      ctx.beginPath()
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(x + w / 2, y + hh)
      ctx.moveTo(x, y + hh / 2)
      ctx.lineTo(x + w, y + hh / 2)
      ctx.lineWidth = 3
      ctx.stroke()
    } else if (h.id === 'cctv') {
      ctx.fillStyle = '#2a2a2a'
      ctx.fillRect(x, y, w, hh)
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, hh)
      ctx.fillStyle = h.examined ? '#2a5a3a' : '#3fae5c'
      ctx.fillRect(x + 8, y + 8, w - 16, hh - 16)
    } else if (h.id === 'umbrella') {
      const ux = x + w / 2
      ctx.beginPath()
      ctx.moveTo(ux, y + 6)
      ctx.lineTo(ux + 16, y + 34)
      ctx.lineTo(ux + 6, y + hh - 22)
      ctx.lineTo(ux - 6, y + hh - 22)
      ctx.lineTo(ux - 16, y + 34)
      ctx.closePath()
      ctx.fillStyle = h.examined ? '#7a2e2e' : '#c0453f'
      ctx.fill()
      ctx.strokeStyle = '#2a1c10'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ux, y + hh - 22)
      ctx.lineTo(ux, y + hh - 8)
      ctx.arc(ux + 7, y + hh - 8, 7, Math.PI, 0, true)
      ctx.stroke()
      ctx.fillStyle = '#e8dcbb'
      ctx.fillRect(ux + 8, y + 44, 14, 10)
      ctx.lineWidth = 1.5
      ctx.strokeRect(ux + 8, y + 44, 14, 10)
    }

    if (!h.examined) {
      const glow = 0.4 + Math.sin(performance.now() / 300) * 0.3
      ctx.strokeStyle = `rgba(255, 230, 120, ${glow})`
      ctx.lineWidth = 3
      ctx.strokeRect(x - 4, y - 4, w + 8, hh + 8)
    } else {
      ctx.fillStyle = '#ffd36b'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('✓', x + w - 10, y + 16)
    }
  }
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
  ctx.fillText('현장을 조사하고, 증언 속 거짓을 찾아 범인을 밝혀내라', CANVAS_W / 2, CANVAS_H / 2 + 6)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.fillText('클릭하여 시작', CANVAS_W / 2, CANVAS_H / 2 + 50)
}

function drawIntroScene() {
  ctx.fillStyle = '#14181f'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = '17px sans-serif'
  ctx.fillText(CASE_INTRO[state.introLine], CANVAS_W / 2, CANVAS_H / 2)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText('(클릭하여 계속)', CANVAS_W / 2, CANVAS_H / 2 + 50)
}

function drawDialogueBox(name, text, boxH = 110) {
  const boxX = 40
  const boxY = CANVAS_H - 40 - boxH
  const boxW = CANVAS_W - 80

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

function drawInvestigateScene() {
  drawRoomBackdrop()
  drawDetective(CANVAS_W / 2, CANVAS_H - 150)
  drawHotspots()

  const examinedCount = HOTSPOTS.filter((h) => h.examined).length
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(`조사한 단서: ${examinedCount}/${HOTSPOTS.length}`, 20, 30)

  drawDialogueBox('탐정', state.activeClueText)

  if (allHotspotsExamined()) {
    const btn = proceedButtonRect()
    ctx.fillStyle = '#2e6b4a'
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h)
    ctx.strokeStyle = '#ffd36b'
    ctx.lineWidth = 2
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('증인을 심문하러 가기', btn.x + btn.w / 2, btn.y + btn.h / 2 + 5)
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
  drawDialogueBox('탐정', `${CONTRADICTION_TEXT}\n\n${REVEAL_TEXT}`, 190)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('사건 해결!', CANVAS_W / 2, 50)
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  if (state.phase === 'title') {
    drawTitle()
    return
  }

  if (state.phase === 'intro') {
    drawIntroScene()
    return
  }

  if (state.phase === 'investigate') {
    drawInvestigateScene()
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
