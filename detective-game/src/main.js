// 모순 탐정 - a case begins, the detective and the cast investigate the scene,
// the witness is cross-examined, and the contradiction exposes the culprit.
// Own story and characters; the *format* (investigate -> deduce -> reveal) is
// the only thing borrowed from the genre.

import { drawCharacter, drawBust, CAST } from './characters.js'

const CANVAS_W = 900
const CANVAS_H = 600

const canvas = document.getElementById('game')
canvas.width = CANVAS_W
canvas.height = CANVAS_H
const ctx = canvas.getContext('2d')

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ---------- Audio ----------
// Loud on purpose: a compressor on the master bus lets us push the gain well
// past the old level without the stacked tones clipping.
let audioCtx = null
let masterGain = null
let muted = false
const MASTER_VOLUME = 1.0

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume()
    return audioCtx
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = muted ? 0 : MASTER_VOLUME
  const comp = audioCtx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 5
  masterGain.connect(comp)
  comp.connect(audioCtx.destination)
  return audioCtx
}
function toggleMute() {
  muted = !muted
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOLUME
  return muted
}
function playTone({ freqFrom, freqTo, duration, type = 'sawtooth', gain = 0.3, delay = 0 }) {
  if (!audioCtx || muted) return
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
// Each character "talks" at their own pitch while their line types out.
function playVoice(pitch) {
  const wobble = 1 + (Math.random() - 0.5) * 0.12
  playTone({ freqFrom: pitch * wobble, freqTo: pitch * wobble * 0.97, duration: 0.05, type: 'square', gain: 0.17 })
}
function playClueSound() {
  playTone({ freqFrom: 500, freqTo: 900, duration: 0.16, type: 'sine', gain: 0.4 })
  playTone({ freqFrom: 900, freqTo: 1350, duration: 0.14, type: 'sine', gain: 0.3, delay: 0.1 })
}
function playTalkSound() {
  playTone({ freqFrom: 700, freqTo: 1000, duration: 0.07, type: 'triangle', gain: 0.35 })
  playTone({ freqFrom: 1000, freqTo: 1400, duration: 0.09, type: 'triangle', gain: 0.3, delay: 0.07 })
}
function playObjectionSound() {
  playTone({ freqFrom: 1200, freqTo: 180, duration: 0.4, type: 'sawtooth', gain: 0.5 })
  playTone({ freqFrom: 900, freqTo: 900, duration: 0.12, type: 'square', gain: 0.32, delay: 0.1 })
  playTone({ freqFrom: 160, freqTo: 60, duration: 0.5, type: 'sine', gain: 0.55, delay: 0.02 })
}
function playCorrectSound() {
  playTone({ freqFrom: 523, freqTo: 523, duration: 0.14, type: 'sine', gain: 0.45 })
  playTone({ freqFrom: 659, freqTo: 659, duration: 0.14, type: 'sine', gain: 0.45, delay: 0.13 })
  playTone({ freqFrom: 784, freqTo: 784, duration: 0.3, type: 'sine', gain: 0.5, delay: 0.26 })
}
function playStarSound(i) {
  playTone({ freqFrom: 880 * (1 + i * 0.25), freqTo: 880 * (1 + i * 0.25), duration: 0.22, type: 'triangle', gain: 0.4, delay: i * 0.18 })
}
function playClickSound() {
  playTone({ freqFrom: 520, freqTo: 520, duration: 0.05, type: 'triangle', gain: 0.25 })
}

// ---------- Case data ----------
// The story is told as lines spoken by the cast. `mood` picks the speaker's
// expression in the dialogue portrait and on stage.
const INTRO = [
  { who: 'hana', mood: 'worried', text: '탐정님, 큰일이에요! 새벽에 최도윤 사장님의 사무실에 누군가 침입했대요!' },
  { who: 'seojin', mood: 'determined', text: '침입이라... 일단 현장부터 보자, 하나. 사소한 단서도 놓치면 안 돼.' },
  { who: 'park', mood: 'neutral', text: '오, 한 탐정 왔군. 금고는 멀쩡한데 서류만 헤집어 놨어. 목격자도 한 명 있으니 현장을 본 뒤에 이야기해 보게.' },
  { who: 'seojin', mood: 'determined', text: '거짓말은 반드시 어딘가에 모순을 남기는 법이지... 시작하자.' },
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

// The people at the scene. Talking to them is optional but adds to the final
// deduction score; each click moves on to what they say next.
const PEOPLE = [
  { id: 'minji', x: 60, scale: 0.95, talked: false, next: 0, mood: 'smile' },
  { id: 'park', x: 215, scale: 0.95, talked: false, next: 0, mood: 'neutral' },
  { id: 'hana', x: 410, scale: 0.95, talked: false, next: 0, mood: 'smile' },
  { id: 'seojin', x: 505, scale: 0.95, talked: false, next: 0, mood: 'determined', isPlayer: true },
  { id: 'choi', x: 845, scale: 0.95, talked: false, next: 0, mood: 'worried' },
]
const PEOPLE_BASE_Y = 448

const TALK = {
  minji: [
    { mood: 'smile', text: '그날 밤요? 10시 15분쯤이었어요. 한 아저씨가 급하게 들어와서 우산을 사 갔어요. 비가 막 쏟아질 때라서요.' },
    { mood: 'cheer', text: '사진 속 분이 맞는 것 같아요! 계산하면서 계속 시계만 쳐다보더라고요. 뭔가 쫓기는 사람처럼요.' },
  ],
  park: [
    { mood: 'neutral', text: '새벽 2시경 침입이 있었네. 물건을 훔치려는 게 아니라... 뭔가를 찾으려던 것 같아. 서류 더미가 전부 뒤집혀 있었거든.' },
    { mood: 'neutral', text: '용의자는 아직 없어. 다만 사건 전날 밤 이 근처에서 서성이던 남자가 있었다는 제보는 있었지.' },
  ],
  hana: [
    { mood: 'cheer', text: '탐정님! 수상한 곳은 노랗게 빛나고 있어요. 하나씩 눌러서 조사해 봐요!' },
    { mood: 'smile', text: '저는 수첩에 다 적고 있어요. 책상, 창문, CCTV, 그리고 우산... 하나도 놓치지 마세요!' },
  ],
  hanaDone: { mood: 'cheer', text: '단서는 다 모인 것 같아요! 이제 목격자 김수한 씨를 심문하러 가요!' },
  choi: [
    { mood: 'worried', text: '제 사무실이... 엉망이 됐어요. 이마는 몸싸움 중에 다쳤습니다. 어두워서 얼굴은 보지 못했어요.' },
    { mood: 'worried', text: '그러고 보니... 얼마 전 김수한 그 친구와 돈 문제로 크게 다퉜습니다. 설마 그 사람이...?' },
  ],
  seojin: [
    { mood: 'determined', text: '...사건 당일 밤의 동선만 밝혀내면 된다. 거짓말은 시간표를 어긋나게 만들지.' },
    { mood: 'determined', text: '단서는 이미 이 방 안에 있어. 남은 건 모순을 찾아내는 것뿐이야.' },
  ],
}

const WITNESS_ID = 'suhan'
const TESTIMONY = '저는 사건이 일어난 밤 10시, 계속 집에서 혼자 TV를 보고 있었습니다. 아무 데도 나가지 않았어요.'
const EVIDENCE = {
  name: '편의점 CCTV 사진',
  desc: '사건 당일 밤 10시 15분, 현장 근처 편의점에서 찍힌 사진. 김수한이 우산을 사고 있다.',
}

// After the objection: the deduction, the confession, and the cast's reactions.
const RESULT = [
  { who: 'seojin', mood: 'determined', text: '하지만 이 사진에는 사건 당일 밤 10시 15분, 현장 근처 편의점에 있는 당신이 찍혀 있습니다.\n"계속 집에 있었다"는 증언과 맞지 않습니다!' },
  { who: 'seojin', mood: 'determined', text: '당신의 알리바이는 거짓이었습니다. 사건 현장 근처에 있었다는 사실이 이제 증거로 드러났습니다.\n범인은 바로 당신, 김수한입니다!' },
  { who: 'suhan', mood: 'defeated', text: '...그래요, 제가 그랬습니다. 최 사장에게 빚 독촉을 받다가, 사무실에서 차용증을 없애려고... 우산은 비를 피하려고 급하게 산 거였어요.' },
  { who: 'park', mood: 'angry', text: '수한 씨, 서까지 동행하시죠. 한 탐정, 이번에도 신세를 졌네.' },
  { who: 'minji', mood: 'cheer', text: '제가 본 그 아저씨가 맞았네요! 도움이 됐다니 다행이에요!' },
  { who: 'hana', mood: 'cheer', text: '역시 우리 탐정님! 모순을 딱 짚어내셨어요! 오늘도 사건 해결이에요!' },
]

const state = {
  phase: 'title', // title | intro | investigate | testimony | evidencePick | objection | result
  introLine: 0,
  resultLine: 0,
  line: { who: 'seojin', mood: 'determined', text: '현장을 둘러보자. 수상한 곳이나 사람을 클릭해보자.', shown: 999 },
  objectionTimer: 0,
  hover: false,
  stars: 0,
  starTimer: 0,
}

function say(who, text, mood = 'neutral') {
  state.line = { who, mood, text, shown: 0 }
}
function lineDone() {
  return state.line.shown >= state.line.text.length
}
function finishLine() {
  state.line.shown = state.line.text.length
}
const IDLE_LINE = '현장을 둘러보자. 수상한 곳이나 사람을 클릭해보자.'

function allHotspotsExamined() {
  return HOTSPOTS.every((h) => h.examined)
}
function talkedCount() {
  return PEOPLE.filter((p) => p.talked && !p.isPlayer).length
}
function resetCase() {
  state.phase = 'title'
  state.introLine = 0
  state.resultLine = 0
  state.line = { who: 'seojin', mood: 'determined', text: IDLE_LINE, shown: 999 }
  state.objectionTimer = 0
  state.stars = 0
  state.starTimer = 0
  for (const h of HOTSPOTS) h.examined = false
  for (const p of PEOPLE) {
    p.talked = false
    p.next = 0
  }
}

// ---------- Input ----------
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect()
  return {
    mx: ((e.clientX - rect.left) * canvas.width) / rect.width,
    my: ((e.clientY - rect.top) * canvas.height) / rect.height,
  }
}
function inRect(mx, my, r) {
  return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
}
function personRect(p) {
  const w = 44 * p.scale
  return { x: p.x - w, y: PEOPLE_BASE_Y - 178 * p.scale, w: w * 2, h: 178 * p.scale }
}
function personAt(mx, my) {
  return PEOPLE.find((p) => inRect(mx, my, personRect(p)))
}
function hotspotAt(mx, my) {
  return HOTSPOTS.find((h) => inRect(mx, my, h.rect))
}

canvas.addEventListener('mousemove', (e) => {
  const { mx, my } = canvasPoint(e)
  let hover = false
  if (state.phase === 'investigate') {
    hover = !!personAt(mx, my) || !!hotspotAt(mx, my) || (allHotspotsExamined() && inRect(mx, my, proceedButtonRect()))
  } else if (state.phase === 'testimony') {
    hover = lineDone() && inRect(mx, my, presentButtonRect())
  } else if (state.phase === 'evidencePick') {
    hover = inRect(mx, my, evidenceCardRect())
  } else if (state.phase === 'title' || state.phase === 'intro' || state.phase === 'result') {
    hover = true
  }
  state.hover = hover
  canvas.style.cursor = hover ? 'pointer' : 'default'
})

function talkTo(p) {
  const hanaDone = p.id === 'hana' && allHotspotsExamined()
  const entry = hanaDone ? TALK.hanaDone : TALK[p.id][p.next % TALK[p.id].length]
  if (!hanaDone) p.next += 1
  const first = !p.talked
  p.talked = true
  say(p.id, entry.text, entry.mood)
  if (first && !p.isPlayer) playTalkSound()
  else playClickSound()
}

function startTestimony() {
  state.phase = 'testimony'
  say(WITNESS_ID, TESTIMONY, 'nervous')
}

canvas.addEventListener('click', (e) => {
  ensureAudio()
  const { mx, my } = canvasPoint(e)

  if (state.phase === 'title') {
    state.phase = 'intro'
    state.introLine = 0
    const l = INTRO[0]
    say(l.who, l.text, l.mood)
    playClickSound()
    return
  }
  if (state.phase === 'intro') {
    if (!lineDone()) {
      finishLine()
      return
    }
    if (state.introLine < INTRO.length - 1) {
      state.introLine += 1
      const l = INTRO[state.introLine]
      say(l.who, l.text, l.mood)
      playClickSound()
    } else {
      state.phase = 'investigate'
      state.line = { who: 'seojin', mood: 'determined', text: IDLE_LINE, shown: 999 }
      playClickSound()
    }
    return
  }
  if (state.phase === 'investigate') {
    if (!lineDone()) finishLine() // skip the typing, but still handle the click below
    if (allHotspotsExamined() && inRect(mx, my, proceedButtonRect())) {
      startTestimony()
      playClickSound()
      return
    }
    const person = personAt(mx, my)
    if (person) {
      talkTo(person)
      return
    }
    const hit = hotspotAt(mx, my)
    if (hit) {
      hit.examined = true
      say('seojin', hit.text, 'determined')
      playClueSound()
    }
    return
  }
  if (state.phase === 'testimony') {
    if (!lineDone()) {
      finishLine()
      return
    }
    if (inRect(mx, my, presentButtonRect())) {
      state.phase = 'evidencePick'
      playClickSound()
    }
    return
  }
  if (state.phase === 'evidencePick') {
    if (inRect(mx, my, evidenceCardRect())) {
      state.phase = 'objection'
      state.objectionTimer = 1.1
      playObjectionSound()
    }
    return
  }
  if (state.phase === 'result') {
    if (!lineDone()) {
      finishLine()
      return
    }
    if (state.resultLine < RESULT.length - 1) {
      state.resultLine += 1
      const l = RESULT[state.resultLine]
      say(l.who, l.text, l.mood)
      playClickSound()
    }
  }
})

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (key === 'r') resetCase()
  if (key === 'm') {
    toggleMute()
    state.muteNoticeUntil = performance.now() + 1600
  }
})

function presentButtonRect() {
  return { x: CANVAS_W - 220, y: CANVAS_H - 30 - 118 - 52, w: 180, h: 40 }
}
function evidenceCardRect() {
  return { x: CANVAS_W / 2 - 170, y: CANVAS_H / 2 - 130, w: 340, h: 250 }
}
function proceedButtonRect() {
  return { x: CANVAS_W - 250, y: 196, w: 220, h: 42 }
}

// ---------- Backdrops ----------
function drawCourtroomBackdrop(t) {
  // panelled back wall
  const wall = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  wall.addColorStop(0, '#2b3650')
  wall.addColorStop(1, '#171f31')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 2
  for (let x = 0; x <= CANVAS_W; x += 112) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 330)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  for (let x = 14; x < CANVAS_W; x += 112) ctx.fillRect(x, 24, 84, 280)

  // tall windows with moonlight
  for (const wx of [90, CANVAS_W - 190]) {
    ctx.fillStyle = '#0e1424'
    ctx.fillRect(wx, 40, 100, 200)
    const sky = ctx.createLinearGradient(0, 40, 0, 240)
    sky.addColorStop(0, '#34507e')
    sky.addColorStop(1, '#1c2a48')
    ctx.fillStyle = sky
    ctx.fillRect(wx + 6, 46, 88, 188)
    ctx.fillStyle = '#0e1424'
    ctx.fillRect(wx + 48, 46, 4, 188)
    ctx.fillRect(wx + 6, 136, 88, 4)
    ctx.fillStyle = 'rgba(200,215,255,0.9)'
    ctx.beginPath()
    ctx.arc(wx + 74, 74, 9, 0, Math.PI * 2)
    ctx.fill()
    // curtains
    ctx.fillStyle = '#7a2a3a'
    ctx.beginPath()
    ctx.moveTo(wx - 14, 36)
    ctx.quadraticCurveTo(wx + 8, 130, wx - 6, 250)
    ctx.lineTo(wx - 20, 250)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(wx + 114, 36)
    ctx.quadraticCurveTo(wx + 92, 130, wx + 106, 250)
    ctx.lineTo(wx + 120, 250)
    ctx.closePath()
    ctx.fill()
  }

  // judge's bench + scales-of-justice emblem
  ctx.fillStyle = '#3a2618'
  ctx.fillRect(CANVAS_W / 2 - 190, 150, 380, 110)
  ctx.fillStyle = '#4c331f'
  ctx.fillRect(CANVAS_W / 2 - 200, 140, 400, 16)
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 2
  for (let x = CANVAS_W / 2 - 160; x < CANVAS_W / 2 + 170; x += 80) {
    ctx.strokeRect(x, 168, 60, 80)
  }
  ctx.strokeStyle = '#d4af37'
  ctx.lineWidth = 3
  const ex = CANVAS_W / 2
  ctx.beginPath()
  ctx.moveTo(ex, 52); ctx.lineTo(ex, 118)
  ctx.moveTo(ex - 36, 74); ctx.lineTo(ex + 36, 74)
  ctx.moveTo(ex - 36, 74); ctx.lineTo(ex - 46, 96); ctx.moveTo(ex - 36, 74); ctx.lineTo(ex - 26, 96)
  ctx.moveTo(ex + 36, 74); ctx.lineTo(ex + 26, 96); ctx.moveTo(ex + 36, 74); ctx.lineTo(ex + 46, 96)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(ex - 36, 98, 12, 0, Math.PI)
  ctx.arc(ex + 36, 98, 12, 0, Math.PI)
  ctx.stroke()

  // floor
  const floor = ctx.createLinearGradient(0, CANVAS_H - 220, 0, CANVAS_H)
  floor.addColorStop(0, '#5a4130')
  floor.addColorStop(1, '#3a2a1e')
  ctx.fillStyle = floor
  ctx.fillRect(0, CANVAS_H - 220, CANVAS_W, 220)
  ctx.fillStyle = '#6b4f3a'
  ctx.fillRect(0, CANVAS_H - 220, CANVAS_W, 10)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 2
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath()
    ctx.moveTo(CANVAS_W / 2 + i * 40, CANVAS_H - 210)
    ctx.lineTo(CANVAS_W / 2 + i * 150, CANVAS_H)
    ctx.stroke()
  }
  // ceiling light cones
  for (const lx of [CANVAS_W * 0.25, CANVAS_W * 0.75]) {
    const g = ctx.createRadialGradient(lx, 0, 4, lx, 150, 260)
    g.addColorStop(0, `rgba(255,236,180,${0.22 + Math.sin(t * 1.3 + lx) * 0.02})`)
    g.addColorStop(1, 'rgba(255,236,180,0)')
    ctx.fillStyle = g
    ctx.fillRect(lx - 260, 0, 520, 420)
  }
}

function drawWitnessStand(x, baseY) {
  ctx.fillStyle = '#4c331f'
  ctx.beginPath()
  ctx.roundRect(x - 120, baseY - 46, 240, 80, 6)
  ctx.fill()
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#6b4a2e'
  ctx.fillRect(x - 126, baseY - 52, 252, 12)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2
  for (const dx of [-60, 0, 60]) ctx.strokeRect(x + dx - 24, baseY - 30, 48, 52)
}

function drawRoomBackdrop(t) {
  // striped wallpaper over a warm gradient
  const wallGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  wallGrad.addColorStop(0, '#46523f')
  wallGrad.addColorStop(1, '#27301f')
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = 'rgba(255,255,255,0.035)'
  for (let x = 0; x < CANVAS_W; x += 60) ctx.fillRect(x, 0, 28, 440)
  // wainscot
  ctx.fillStyle = '#3a2c20'
  ctx.fillRect(0, 372, CANVAS_W, 68)
  ctx.fillStyle = '#4c3a2a'
  ctx.fillRect(0, 368, CANVAS_W, 8)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2
  for (let x = 20; x < CANVAS_W; x += 120) ctx.strokeRect(x, 384, 96, 44)

  // floor planks
  ctx.fillStyle = '#5a4632'
  ctx.fillRect(0, 440, CANVAS_W, CANVAS_H - 440)
  ctx.fillStyle = '#6b5440'
  ctx.fillRect(0, 440, CANVAS_W, 8)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = 2
  for (let y = 470; y < CANVAS_H; y += 30) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_W, y)
    ctx.stroke()
  }

  // wall clock showing 2:07 (the small hours)
  const cx = 455
  const cy = 70
  ctx.fillStyle = '#f2ead4'
  ctx.beginPath()
  ctx.arc(cx, cy, 30, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#3a2618'
  ctx.stroke()
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(-Math.PI / 2 + (2 + 7 / 60) * (Math.PI / 6)) * 15, cy + Math.sin(-Math.PI / 2 + (2 + 7 / 60) * (Math.PI / 6)) * 15)
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(-Math.PI / 2 + (7 / 60) * Math.PI * 2) * 22, cy + Math.sin(-Math.PI / 2 + (7 / 60) * Math.PI * 2) * 22)
  ctx.stroke()
  // framed certificate
  ctx.fillStyle = '#4c3a2a'
  ctx.fillRect(330, 40, 74, 56)
  ctx.fillStyle = '#e8dcbb'
  ctx.fillRect(336, 46, 62, 44)
  ctx.fillStyle = '#9c8a5c'
  for (let i = 0; i < 4; i++) ctx.fillRect(342, 54 + i * 8, 50 - (i % 2) * 14, 2)
  // hanging lamp
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(300, 0)
  ctx.lineTo(300, 34)
  ctx.stroke()
  ctx.fillStyle = '#d4a23a'
  ctx.beginPath()
  ctx.moveTo(280, 54)
  ctx.lineTo(320, 54)
  ctx.lineTo(310, 34)
  ctx.lineTo(290, 34)
  ctx.closePath()
  ctx.fill()
  const lamp = ctx.createRadialGradient(300, 60, 4, 300, 120, 220)
  lamp.addColorStop(0, `rgba(255,230,160,${0.28 + Math.sin(t * 2) * 0.02})`)
  lamp.addColorStop(1, 'rgba(255,230,160,0)')
  ctx.fillStyle = lamp
  ctx.fillRect(60, 0, 480, 400)
}

function drawIntroBackdrop(t) {
  // night street in front of the office building
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  sky.addColorStop(0, '#0b1020')
  sky.addColorStop(1, '#1d2740')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * 0.8 + i))})`
    ctx.fillRect((Math.sin(i * 91.7) * 0.5 + 0.5) * CANVAS_W, (Math.sin(i * 47.3) * 0.5 + 0.5) * 220, 1.6, 1.6)
  }
  // the office building
  ctx.fillStyle = '#18203a'
  ctx.fillRect(140, 120, 620, 330)
  ctx.fillStyle = '#0f1526'
  ctx.fillRect(140, 112, 620, 12)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const x = 170 + c * 98
      const y = 150 + r * 90
      const lit = (r === 1 && c === 3) || (r === 0 && c === 1)
      ctx.fillStyle = lit ? '#f0cf7a' : '#202b4a'
      ctx.fillRect(x, y, 64, 56)
      ctx.fillStyle = '#0f1526'
      ctx.fillRect(x + 30, y, 4, 56)
      ctx.fillRect(x, y + 26, 64, 4)
    }
  }
  // patrol-car lights washing the wall red/blue
  const flash = Math.floor(t * 3) % 2
  const g = ctx.createRadialGradient(flash ? 220 : 680, 440, 10, flash ? 220 : 680, 440, 340)
  g.addColorStop(0, flash ? 'rgba(255,60,60,0.35)' : 'rgba(70,120,255,0.35)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  // street
  ctx.fillStyle = '#10141f'
  ctx.fillRect(0, 440, CANVAS_W, 160)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let x = 20; x < CANVAS_W; x += 100) ctx.fillRect(x, 520, 50, 5)
  // police tape
  ctx.save()
  ctx.translate(0, 410)
  ctx.rotate(-0.025)
  ctx.fillStyle = '#f2c230'
  ctx.fillRect(-10, 0, CANVAS_W + 20, 22)
  ctx.fillStyle = '#1f1620'
  for (let x = -10; x < CANVAS_W + 20; x += 36) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 18, 0)
    ctx.lineTo(x + 8, 22)
    ctx.lineTo(x - 10, 22)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

// ---------- Hotspots ----------
function drawHotspots(t) {
  for (const h of HOTSPOTS) {
    const { x, y, w, h: hh } = h.rect
    if (h.id === 'desk') {
      ctx.fillStyle = lgrad(y, y + hh, '#7a5636', '#583a22')
      ctx.fillRect(x, y, w, hh)
      ctx.strokeStyle = '#2a1c10'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, hh)
      ctx.fillStyle = '#4a3220'
      ctx.fillRect(x + 8, y + 40, 80, 62)
      ctx.strokeRect(x + 8, y + 40, 80, 62)
      ctx.fillRect(x + w - 88, y + 40, 80, 62)
      ctx.strokeRect(x + w - 88, y + 40, 80, 62)
      ctx.fillStyle = '#d4af37'
      ctx.fillRect(x + 42, y + 66, 12, 4)
      ctx.fillRect(x + w - 54, y + 66, 12, 4)
      // scattered papers + a lamp
      for (const [px, py, rot] of [[x + 24, y + 10, -0.1], [x + 80, y + 14, 0.18], [x + 128, y + 8, -0.05]]) {
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rot)
        ctx.fillStyle = '#efe6c8'
        ctx.fillRect(0, 0, 54, 24)
        ctx.strokeStyle = '#2a1c10'
        ctx.lineWidth = 1.4
        ctx.strokeRect(0, 0, 54, 24)
        ctx.fillStyle = '#9c8a5c'
        ctx.fillRect(6, 6, 34, 2)
        ctx.fillRect(6, 12, 24, 2)
        ctx.restore()
      }
      ctx.fillStyle = '#2a2a33'
      ctx.fillRect(x + w - 36, y - 24, 4, 26)
      ctx.beginPath()
      ctx.moveTo(x + w - 50, y - 22)
      ctx.lineTo(x + w - 20, y - 22)
      ctx.lineTo(x + w - 28, y - 38)
      ctx.lineTo(x + w - 42, y - 38)
      ctx.closePath()
      ctx.fillStyle = '#3fae5c'
      ctx.fill()
    } else if (h.id === 'window') {
      ctx.fillStyle = '#5c4630'
      ctx.fillRect(x - 8, y - 8, w + 16, hh + 16)
      const pane = ctx.createLinearGradient(0, y, 0, y + hh)
      pane.addColorStop(0, h.examined ? '#243247' : '#3d5f88')
      pane.addColorStop(1, h.examined ? '#15202f' : '#26405f')
      ctx.fillStyle = pane
      ctx.fillRect(x, y, w, hh)
      // convenience-store glow outside
      ctx.fillStyle = 'rgba(120,255,180,0.55)'
      ctx.fillRect(x + 100, y + 96, 50, 26)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(x + 108, y + 102, 34, 4)
      ctx.strokeStyle = '#2a1c10'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, hh)
      ctx.beginPath()
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(x + w / 2, y + hh)
      ctx.moveTo(x, y + hh / 2)
      ctx.lineTo(x + w, y + hh / 2)
      ctx.stroke()
      // rain streaks on the glass
      ctx.strokeStyle = 'rgba(190,215,255,0.4)'
      ctx.lineWidth = 1.2
      for (let i = 0; i < 10; i++) {
        const rx = x + 8 + ((i * 37 + t * 60) % (w - 16))
        const ry = y + ((i * 53 + t * 220) % hh)
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx - 3, ry + 10)
        ctx.stroke()
      }
    } else if (h.id === 'cctv') {
      ctx.fillStyle = '#2a2a2f'
      ctx.fillRect(x, y, w, hh)
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, hh)
      ctx.fillStyle = h.examined ? '#1f4a30' : '#2f8a4a'
      ctx.fillRect(x + 8, y + 8, w - 16, hh - 22)
      // scanlines + a blinking REC
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      for (let ly = y + 8; ly < y + hh - 14; ly += 4) ctx.fillRect(x + 8, ly, w - 16, 1.5)
      ctx.fillStyle = 'rgba(220,255,230,0.75)'
      ctx.beginPath()
      ctx.arc(x + 24, y + 28, 7, 0, Math.PI * 2)
      ctx.fillRect(x + 18, y + 36, 12, 18)
      ctx.fill()
      if (Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = '#ff3b3b'
        ctx.beginPath()
        ctx.arc(x + w - 20, y + 18, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#9ad6ae'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('CAM-02  22:15', x + 40, y + hh - 18)
    } else if (h.id === 'umbrella') {
      const ux = x + w / 2
      ctx.beginPath()
      ctx.moveTo(ux, y + 6)
      ctx.lineTo(ux + 16, y + 34)
      ctx.lineTo(ux + 6, y + hh - 22)
      ctx.lineTo(ux - 6, y + hh - 22)
      ctx.lineTo(ux - 16, y + 34)
      ctx.closePath()
      ctx.fillStyle = h.examined ? '#7a2e2e' : '#d24a43'
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
      // water puddle under it
      ctx.fillStyle = 'rgba(120,170,230,0.35)'
      ctx.beginPath()
      ctx.ellipse(ux, y + hh + 4, 30, 6, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!h.examined) {
      const glow = 0.4 + Math.sin(t * 3.3) * 0.3
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

function lgrad(y0, y1, c0, c1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  return g
}

// ---------- Dialogue ----------
// A speaker portrait on the left, a typed-out line on the right.
function drawDialogueBox(boxH = 118) {
  const line = state.line
  const meta = CAST[line.who]
  const boxX = 30
  const boxY = CANVAS_H - 30 - boxH
  const boxW = CANVAS_W - 60
  const t = performance.now() / 1000

  ctx.fillStyle = 'rgba(14, 11, 20, 0.94)'
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, 12)
  ctx.fill()
  ctx.strokeStyle = '#c9a85c'
  ctx.lineWidth = 2
  ctx.stroke()

  const pSize = 96
  drawBust(ctx, line.who, boxX + 14, boxY + (boxH - pSize) / 2, pSize, line.mood, t)

  const tx = boxX + pSize + 34
  ctx.textAlign = 'left'
  ctx.fillStyle = meta.color
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText(meta.name, tx, boxY + 28)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText(meta.role, tx + ctx.measureText(meta.name).width * 1.12 + 10, boxY + 28)

  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  wrapText(line.text.slice(0, Math.floor(line.shown)), tx, boxY + 54, boxW - (tx - boxX) - 22, 22)

  if (lineDone() && (state.phase === 'intro' || state.phase === 'result')) {
    ctx.fillStyle = `rgba(255,211,107,${0.5 + Math.sin(t * 5) * 0.4})`
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('▼', boxX + boxW - 18, boxY + boxH - 12)
  }
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

// Types the current line out, blipping in the speaker's own voice.
function tickLine() {
  const line = state.line
  if (line.shown >= line.text.length) return
  const before = Math.floor(line.shown)
  line.shown = Math.min(line.text.length, line.shown + 0.7)
  const after = Math.floor(line.shown)
  if (after !== before && after % 2 === 0) {
    const ch = line.text[after - 1]
    if (ch && ch !== ' ' && ch !== '\n') playVoice(CAST[line.who].pitch)
  }
}

function drawButton(rect, label, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10)
  ctx.fill()
  ctx.strokeStyle = '#ffd36b'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5)
}

// ---------- Scenes ----------
function drawTitle(t) {
  const W = CANVAS_W
  const H = CANVAS_H

  // night alley: sky, brick wall, wet pavement
  ctx.fillStyle = '#0c1018'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#161c28'
  ctx.fillRect(0, 150, W, 290)
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'
  ctx.lineWidth = 1
  for (let y = 150; y < 440; y += 22) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
    for (let x = (y / 22) % 2 ? 0 : 30; x < W; x += 60) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + 22)
      ctx.stroke()
    }
  }
  // lit window with a silhouette
  ctx.fillStyle = '#e8c86a'
  ctx.fillRect(120, 210, 70, 90)
  ctx.fillStyle = '#161c28'
  ctx.fillRect(153, 210, 4, 90)
  ctx.fillRect(120, 252, 70, 4)
  ctx.fillStyle = 'rgba(20,20,30,0.85)'
  ctx.beginPath()
  ctx.arc(170, 262, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(158, 272, 24, 28)
  ctx.fillStyle = '#10141c'
  ctx.fillRect(0, 440, W, H - 440)

  // street lamp + light cone
  const lx = W - 250
  ctx.strokeStyle = '#05070a'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(lx, 470)
  ctx.lineTo(lx, 190)
  ctx.quadraticCurveTo(lx, 168, lx - 40, 168)
  ctx.stroke()
  const flick = 0.85 + Math.sin(t * 13) * 0.03 + (Math.sin(t * 2.3) > 0.97 ? -0.3 : 0)
  const cone = ctx.createLinearGradient(0, 176, 0, 480)
  cone.addColorStop(0, `rgba(255,220,140,${0.42 * flick})`)
  cone.addColorStop(1, 'rgba(255,220,140,0)')
  ctx.fillStyle = cone
  ctx.beginPath()
  ctx.moveTo(lx - 52, 176)
  ctx.lineTo(lx - 28, 176)
  ctx.lineTo(lx + 150, 480)
  ctx.lineTo(lx - 230, 480)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = `rgba(255,236,170,${flick})`
  ctx.beginPath()
  ctx.ellipse(lx - 40, 174, 14, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `rgba(255,220,140,${0.16 * flick})`
  ctx.beginPath()
  ctx.ellipse(lx - 40, 470, 190, 16, 0, 0, Math.PI * 2)
  ctx.fill()

  // the detective and his assistant under the lamp
  drawCharacter(ctx, 'hana', lx - 150, 462, { scale: 1.2, mood: 'cheer', pose: 'cheer', t })
  drawCharacter(ctx, 'seojin', lx - 30, 468, { scale: 1.5, mood: 'determined', pose: 'pockets', t })

  // rain
  ctx.strokeStyle = 'rgba(170,200,255,0.3)'
  ctx.lineWidth = 1.2
  for (let i = 0; i < 90; i++) {
    const rx = ((i * 97.3 + t * 90) % (W + 60)) - 30
    const ry = (i * 53.7 + t * (520 + (i % 5) * 60)) % H
    ctx.beginPath()
    ctx.moveTo(rx, ry)
    ctx.lineTo(rx - 5, ry + 16)
    ctx.stroke()
  }

  // title with a magnifying glass
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.font = 'bold 64px serif'
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'
  ctx.lineWidth = 9
  ctx.strokeText('모순 탐정', W / 2 - 40, 110)
  ctx.fillStyle = '#ffd36b'
  ctx.fillText('모순 탐정', W / 2 - 40, 110)
  ctx.strokeStyle = '#ffd36b'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(W / 2 + 150, 84, 24, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(159,200,255,0.22)'
  ctx.fill()
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(W / 2 + 168, 102)
  ctx.lineTo(W / 2 + 190, 126)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#9fb3d9'
  ctx.font = '15px sans-serif'
  ctx.fillText('현장을 조사하고, 증언 속 거짓을 찾아 범인을 밝혀내라', W / 2 - 40, 144)
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.45
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('클릭하여 시작', W / 2 - 40, 560)
  ctx.globalAlpha = 1
}

function drawIntroScene(t) {
  drawIntroBackdrop(t)
  const l = INTRO[state.introLine]
  const cast = [
    { id: 'seojin', x: 300, pose: 'pockets' },
    { id: 'hana', x: 160, pose: 'idle' },
    { id: 'park', x: 640, pose: 'idle' },
  ]
  for (const c of cast) {
    const speaking = c.id === l.who
    ctx.globalAlpha = speaking ? 1 : 0.78
    drawCharacter(ctx, c.id, c.x, 440, {
      scale: speaking ? 1.62 : 1.5,
      mood: speaking ? l.mood : undefined,
      pose: speaking && c.id === 'hana' && l.mood === 'cheer' ? 'cheer' : c.pose,
      t,
    })
    ctx.globalAlpha = 1
    if (speaking) {
      ctx.fillStyle = CAST[c.id].color
      const ay = 440 - 190 * 1.62 - 6 + Math.sin(t * 6) * 3
      ctx.beginPath()
      ctx.moveTo(c.x - 8, ay)
      ctx.lineTo(c.x + 8, ay)
      ctx.lineTo(c.x, ay + 10)
      ctx.closePath()
      ctx.fill()
    }
  }
  drawDialogueBox()
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText(`${state.introLine + 1} / ${INTRO.length}`, 36, 30)
}

function drawInvestigateScene(t) {
  drawRoomBackdrop(t)
  drawHotspots(t)
  // everybody stands along the floor line; the speaker gets a name tag marker
  for (const p of PEOPLE) {
    const speaking = state.line.who === p.id && !(state.line.shown >= 999)
    drawCharacter(ctx, p.id, p.x, PEOPLE_BASE_Y, {
      scale: p.scale,
      mood: speaking ? state.line.mood : p.mood,
      pose: p.id === 'seojin' ? 'pockets' : 'idle',
      t,
    })
    if (!p.talked && !p.isPlayer) {
      // "talk to me" bubble
      const bx = p.x
      const by = PEOPLE_BASE_Y - 186 * p.scale + Math.sin(t * 3 + p.x) * 2
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.roundRect(bx - 15, by - 22, 30, 20, 8)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(bx - 4, by - 3)
      ctx.lineTo(bx + 4, by - 3)
      ctx.lineTo(bx, by + 4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#2a2017'
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath()
        ctx.arc(bx + dx, by - 12, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const examinedCount = HOTSPOTS.filter((h) => h.examined).length
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(`조사한 단서: ${examinedCount}/${HOTSPOTS.length}`, 20, 30)
  ctx.fillStyle = '#9fe0c0'
  ctx.fillText(`나눈 대화: ${talkedCount()}/${PEOPLE.length - 1}`, 20, 52)

  drawDialogueBox()

  if (allHotspotsExamined()) {
    const btn = proceedButtonRect()
    const pulse = 0.85 + Math.sin(t * 5) * 0.15
    ctx.globalAlpha = pulse
    drawButton(btn, '증인을 심문하러 가기', '#2e6b4a')
    ctx.globalAlpha = 1
  }
}

function drawTestimonyScene(t) {
  drawCourtroomBackdrop(t)
  // the courtroom audience, small, behind the witness
  drawCharacter(ctx, 'seojin', 160, 410, { scale: 1.15, mood: 'determined', pose: 'pockets', t })
  drawCharacter(ctx, 'hana', 290, 408, { scale: 1.05, mood: 'worried', t })
  drawCharacter(ctx, 'park', 740, 410, { scale: 1.1, mood: 'neutral', t })
  drawCharacter(ctx, 'choi', 850, 408, { scale: 1.0, mood: 'worried', t })
  drawCharacter(ctx, WITNESS_ID, CANVAS_W / 2, 412, { scale: 1.5, mood: 'nervous', t })
  drawWitnessStand(CANVAS_W / 2, 412)
  drawDialogueBox()

  if (lineDone()) drawButton(presentButtonRect(), '증거 제출', '#7a2e2e')
}

// The evidence photo: a grainy night shot of the witness buying an umbrella.
function drawEvidencePhoto(x, y, w, h, t) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const bg = ctx.createLinearGradient(0, y, 0, y + h)
  bg.addColorStop(0, '#1b2a3c')
  bg.addColorStop(1, '#2d3a4c')
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  // store front
  ctx.fillStyle = '#2a3a4e'
  ctx.fillRect(x + 12, y + 16, w - 24, h - 30)
  ctx.fillStyle = '#d6f2e2'
  ctx.fillRect(x + 22, y + 44, w - 44, h - 74)
  ctx.fillStyle = '#38b27c'
  ctx.fillRect(x + 12, y + 16, w - 24, 22)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('24 MART', x + w / 2, y + 32)
  // shelves in the window
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 22, y + 66 + i * 26, w - 44, 3)
  // the culprit, mid-purchase
  drawCharacter(ctx, WITNESS_ID, x + w / 2 - 6, y + h - 6, { scale: 0.62, mood: 'nervous', t })
  // the umbrella in his hand
  const ux = x + w / 2 + 40
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(ux - 4, y + h - 82)
  ctx.lineTo(ux + 12, y + h - 36)
  ctx.stroke()
  ctx.strokeStyle = '#d24a43'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(ux - 4, y + h - 82)
  ctx.lineTo(ux + 12, y + h - 36)
  ctx.stroke()
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(ux + 12, y + h - 36)
  ctx.arc(ux + 18, y + h - 36, 6, Math.PI, 0, true)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // film grain + tint + vignette
  ctx.fillStyle = 'rgba(80,120,160,0.12)'
  ctx.fillRect(x, y, w, h)
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + ((i * 7) % 10) * 0.008})`
    ctx.fillRect(x + ((i * 53 + Math.floor(t * 10) * 17) % w), y + ((i * 91 + Math.floor(t * 10) * 29) % h), 2, 2)
  }
  const v = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, h * 0.9)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = v
  ctx.fillRect(x, y, w, h)
  // timestamp
  ctx.fillStyle = '#ffb347'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'right'
  ctx.fillText('22:15:08  CAM-02', x + w - 8, y + h - 8)
  ctx.restore()
  ctx.strokeStyle = '#2a2017'
  ctx.lineWidth = 3
  ctx.strokeRect(x, y, w, h)
}

function drawEvidencePickScene(t) {
  drawCourtroomBackdrop(t)
  drawCharacter(ctx, WITNESS_ID, CANVAS_W / 2, 412, { scale: 1.5, mood: 'nervous', t })
  drawWitnessStand(CANVAS_W / 2, 412)
  ctx.fillStyle = 'rgba(10, 8, 6, 0.72)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 17px sans-serif'
  ctx.fillText('증거품을 선택해 제출하세요', CANVAS_W / 2, CANVAS_H / 2 - 150)

  const card = evidenceCardRect()
  const hover = state.hover
  ctx.save()
  ctx.translate(card.x + card.w / 2, card.y + card.h / 2)
  const wob = Math.sin(t * 2.2) * 0.012
  ctx.rotate(wob)
  ctx.translate(-(card.x + card.w / 2), -(card.y + card.h / 2))
  ctx.fillStyle = '#e8dcbb'
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, 8)
  ctx.fill()
  ctx.strokeStyle = hover ? '#ffd36b' : '#2a2017'
  ctx.lineWidth = 3
  ctx.stroke()
  drawEvidencePhoto(card.x + 16, card.y + 16, card.w - 32, 150, t)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#2b2317'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(EVIDENCE.name, card.x + card.w / 2, card.y + card.h - 52)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#5a4a30'
  wrapTextCentered(EVIDENCE.desc, card.x + card.w / 2, card.y + card.h - 34, card.w - 36, 15)
  ctx.restore()
}

function wrapTextCentered(text, cx, y, maxWidth, lineHeight) {
  let line = ''
  let cy = y
  for (const ch of text) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line, cx, cy)
      line = ch
      cy += lineHeight
    } else {
      line = test
    }
  }
  ctx.fillText(line, cx, cy)
}

function drawObjectionScene(t) {
  const p = 1 - clamp(state.objectionTimer / 1.1, 0, 1)
  ctx.save()
  // a short screen shake as the objection lands
  if (p < 0.35) ctx.translate((Math.random() - 0.5) * 10 * (1 - p / 0.35), (Math.random() - 0.5) * 8 * (1 - p / 0.35))
  drawCourtroomBackdrop(t)
  drawCharacter(ctx, 'seojin', 200, 420, { scale: 1.6, mood: 'determined', pose: 'point', t })
  drawCharacter(ctx, WITNESS_ID, 640, 420, { scale: 1.6, mood: 'shocked', t })

  // flash + speed lines
  if (p < 0.2) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - p / 0.2)})`
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }
  const sc = p < 0.3 ? 1.6 - p * 2 : 1
  ctx.save()
  ctx.translate(CANVAS_W / 2, 96)
  ctx.scale(sc, sc)
  ctx.fillStyle = 'rgba(200, 30, 30, 0.92)'
  ctx.fillRect(-CANVAS_W / 2, -58, CANVAS_W, 116)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let i = 0; i < 7; i++) ctx.fillRect(-CANVAS_W / 2, -52 + i * 15, CANVAS_W, 3)
  ctx.lineJoin = 'round'
  ctx.font = 'bold 60px sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 9
  ctx.strokeText('이의있음!', 0, 20)
  ctx.fillStyle = '#fff'
  ctx.fillText('이의있음!', 0, 20)
  ctx.restore()
  ctx.restore()
}

function drawStars() {
  const total = 1 + (talkedCount() >= 2 ? 1 : 0) + (talkedCount() >= PEOPLE.length - 1 ? 1 : 0)
  const panelW = 330
  const panelH = 150
  const px = CANVAS_W / 2 - panelW / 2
  const py = CANVAS_H - 30 - panelH
  ctx.fillStyle = 'rgba(14,11,20,0.93)'
  ctx.beginPath()
  ctx.roundRect(px, py, panelW, panelH, 14)
  ctx.fill()
  ctx.strokeStyle = '#ffd36b'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('사건 해결!', CANVAS_W / 2, py + 38)
  for (let i = 0; i < 3; i++) {
    const sx = CANVAS_W / 2 + (i - 1) * 54
    const sy = py + 78
    const earned = i < total
    const reveal = state.starTimer > 0.4 + i * 0.4
    ctx.save()
    ctx.translate(sx, sy)
    const pop = earned && reveal ? 1 + Math.max(0, 0.4 - (state.starTimer - 0.4 - i * 0.4)) : 1
    ctx.scale(pop, pop)
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const r = k % 2 ? 11 : 24
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fillStyle = earned && reveal ? '#ffd24a' : 'rgba(255,255,255,0.14)'
    ctx.fill()
    ctx.lineWidth = 2.4
    ctx.strokeStyle = earned && reveal ? '#a07d00' : 'rgba(255,255,255,0.3)'
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = '#cfd8ff'
  ctx.font = '13px sans-serif'
  const grade = total === 3 ? '완벽한 추리!' : total === 2 ? '훌륭한 추리' : '사건은 해결했지만... 증언을 더 들어볼걸!'
  ctx.fillText(`${grade}  (단서 ${HOTSPOTS.length}/${HOTSPOTS.length} · 대화 ${talkedCount()}/${PEOPLE.length - 1})`, CANVAS_W / 2, py + 122)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '12px sans-serif'
  ctx.fillText('R 키: 처음부터 다시', CANVAS_W / 2, py + 140)
}

function drawResultScene(t) {
  drawCourtroomBackdrop(t)
  const l = RESULT[state.resultLine]
  // curtain call: the whole cast around the exposed culprit
  const cast = [
    { id: 'minji', x: 90, mood: 'cheer', pose: 'idle', scale: 1.1 },
    { id: 'seojin', x: 250, mood: 'determined', pose: 'point', scale: 1.28 },
    { id: 'suhan', x: 470, mood: 'defeated', pose: 'idle', scale: 1.3 },
    { id: 'park', x: 660, mood: 'angry', pose: 'idle', scale: 1.2 },
    { id: 'hana', x: 800, mood: 'cheer', pose: 'cheer', scale: 1.1 },
  ]
  for (const c of cast) {
    const speaking = c.id === l.who
    drawCharacter(ctx, c.id, c.x, 392, { scale: c.scale, mood: speaking ? l.mood : c.mood, pose: c.pose, t })
  }
  // once the last line has been read, the score card takes the dialogue box's place
  if (state.resultLine >= RESULT.length - 1 && lineDone()) drawStars()
  else drawDialogueBox()
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText(`${state.resultLine + 1} / ${RESULT.length}`, 36, 30)
}

function drawMuteNotice() {
  if (state.muteNoticeUntil && performance.now() < state.muteNoticeUntil) {
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(muted ? '소리 끔 (M)' : '소리 켬 (M)', CANVAS_W - 16, 24)
  }
}

function render() {
  const t = performance.now() / 1000
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  tickLine()

  if (state.phase === 'title') drawTitle(t)
  else if (state.phase === 'intro') drawIntroScene(t)
  else if (state.phase === 'investigate') drawInvestigateScene(t)
  else if (state.phase === 'testimony') drawTestimonyScene(t)
  else if (state.phase === 'evidencePick') drawEvidencePickScene(t)
  else if (state.phase === 'objection') {
    drawObjectionScene(t)
    state.objectionTimer -= 1 / 60
    if (state.objectionTimer <= 0) {
      state.phase = 'result'
      state.resultLine = 0
      const l = RESULT[0]
      say(l.who, l.text, l.mood)
      state.starTimer = 0
      playCorrectSound()
    }
  } else if (state.phase === 'result') {
    drawResultScene(t)
    if (state.resultLine >= RESULT.length - 1 && lineDone()) {
      const before = state.starTimer
      state.starTimer += 1 / 60
      for (let i = 0; i < 3; i++) {
        const at = 0.4 + i * 0.4
        const earned = i < 1 + (talkedCount() >= 2 ? 1 : 0) + (talkedCount() >= PEOPLE.length - 1 ? 1 : 0)
        if (before < at && state.starTimer >= at && earned) playStarSound(i)
      }
    }
  }
  drawMuteNotice()
}

function loop() {
  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
