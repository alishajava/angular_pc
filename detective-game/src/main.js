// 모순 탐정 - a three-act case: collect evidence at the scene, cross-examine
// two witnesses statement by statement, and present the evidence that exposes
// each lie. Own story and characters; only the *format* (investigate ->
// cross-examine -> present evidence) is borrowed from the genre.

import { drawCharacter, drawBust, CAST } from './characters.js'
import {
  INTRO,
  CLUES,
  EVIDENCE,
  CLUE_EVIDENCE,
  TALK,
  BEFORE_KIM,
  EXAM_KIM,
  KIM_CLEAR,
  EXAM_CHOI,
  CHOI_CLEAR,
} from './story.js'

const CANVAS_W = 900
const CANVAS_H = 600
const MAX_HEARTS = 5

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
function playEvidenceSound() {
  playTone({ freqFrom: 660, freqTo: 990, duration: 0.12, type: 'triangle', gain: 0.45 })
  playTone({ freqFrom: 990, freqTo: 1320, duration: 0.12, type: 'triangle', gain: 0.4, delay: 0.1 })
  playTone({ freqFrom: 1320, freqTo: 1980, duration: 0.22, type: 'triangle', gain: 0.35, delay: 0.2 })
}
function playBuzzSound() {
  playTone({ freqFrom: 220, freqTo: 110, duration: 0.3, type: 'sawtooth', gain: 0.5 })
  playTone({ freqFrom: 165, freqTo: 82, duration: 0.34, type: 'square', gain: 0.3, delay: 0.04 })
}
function playLoseSound() {
  for (const [i, f] of [392, 330, 262, 196].entries()) playTone({ freqFrom: f, freqTo: f * 0.98, duration: 0.3, type: 'triangle', gain: 0.45, delay: i * 0.22 })
}
function playClickSound() {
  playTone({ freqFrom: 520, freqTo: 520, duration: 0.05, type: 'triangle', gain: 0.25 })
}

// ---------- Case state ----------
const EXAMS = { kim: EXAM_KIM, choi: EXAM_CHOI }

// Where the clickable clues sit in the office (the art is in drawHotspots).
const HOTSPOTS = [
  { id: 'desk', label: '책상', rect: { x: 560, y: 380, w: 220, h: 110 }, examined: false },
  { id: 'window', label: '창문', rect: { x: 110, y: 120, w: 160, h: 150 }, examined: false },
  { id: 'cctv', label: 'CCTV 모니터', rect: { x: 640, y: 90, w: 130, h: 80 }, examined: false },
  { id: 'umbrella', label: '우산', rect: { x: 300, y: 310, w: 70, h: 130 }, examined: false },
  { id: 'keycard', label: '출입 단말기', rect: { x: 300, y: 190, w: 56, h: 84 }, examined: false },
  { id: 'safe', label: '금고', rect: { x: 520, y: 130, w: 90, h: 90 }, examined: false },
]

// The people at the scene. Talking to them is optional but adds to the score;
// each click moves on to what they say next.
const PEOPLE = [
  { id: 'minji', x: 60, scale: 0.95, talked: false, next: 0, mood: 'smile' },
  { id: 'park', x: 215, scale: 0.95, talked: false, next: 0, mood: 'neutral' },
  { id: 'hana', x: 410, scale: 0.95, talked: false, next: 0, mood: 'smile' },
  { id: 'seojin', x: 505, scale: 0.95, talked: false, next: 0, mood: 'determined', isPlayer: true },
  { id: 'choi', x: 858, scale: 0.95, talked: false, next: 0, mood: 'worried' },
]
const PEOPLE_BASE_Y = 448
const IDLE_LINE = '현장을 둘러보자. 수상한 곳이나 사람을 클릭해보자.'

const state = {
  phase: 'title', // title | seq | investigate | exam | objection | gameover | ending
  line: { who: 'seojin', mood: 'determined', text: IDLE_LINE, shown: 999 },
  hover: false,
  popup: null, // { id, until } - "evidence acquired" banner
  filePanel: null, // { sel } while the evidence file is open in the investigation
  evidence: [], // collected evidence ids, in the order they were found
  seq: null, // { lines, index, scene, onEnd }
  exam: null, // see startExam
  hearts: MAX_HEARTS,
  objection: { timer: 0, witness: 'suhan' },
  flash: 0,
  starTimer: 0,
  muteNoticeUntil: 0,
}

function say(who, text, mood = 'neutral') {
  state.line = { who, mood, text, shown: 0 }
}
function sayFull(who, text, mood = 'neutral') {
  state.line = { who, mood, text, shown: text.length }
}
function lineDone() {
  return state.line.shown >= state.line.text.length
}
function finishLine() {
  state.line.shown = state.line.text.length
}

function allHotspotsExamined() {
  return HOTSPOTS.every((h) => h.examined)
}
function talkedCount() {
  return PEOPLE.filter((p) => p.talked && !p.isPlayer).length
}
function talkTargets() {
  return PEOPLE.filter((p) => !p.isPlayer).length
}

function resetCase() {
  state.phase = 'title'
  state.line = { who: 'seojin', mood: 'determined', text: IDLE_LINE, shown: 999 }
  state.popup = null
  state.filePanel = null
  state.evidence = []
  state.seq = null
  state.exam = null
  state.hearts = MAX_HEARTS
  state.flash = 0
  state.starTimer = 0
  for (const h of HOTSPOTS) h.examined = false
  for (const p of PEOPLE) {
    p.talked = false
    p.next = 0
  }
}

function giveEvidence(id) {
  if (!id || state.evidence.includes(id)) return
  state.evidence.push(id)
  state.popup = { id, until: performance.now() + 2800 }
  playEvidenceSound()
}

// ---------- Sequences (scripted dialogue over a stage) ----------
function startSequence(lines, scene, onEnd) {
  state.phase = 'seq'
  state.seq = { lines, index: 0, scene, onEnd }
  const l = lines[0]
  say(l.who, l.text, l.mood)
}
function advanceSequence() {
  const s = state.seq
  if (!lineDone()) {
    finishLine()
    return
  }
  playClickSound()
  if (s.index < s.lines.length - 1) {
    s.index += 1
    const l = s.lines[s.index]
    say(l.who, l.text, l.mood)
  } else {
    s.onEnd()
  }
}

// ---------- Cross-examination ----------
function startExam(id) {
  const def = EXAMS[id]
  state.phase = 'exam'
  state.exam = {
    id,
    def,
    idx: 0,
    broken: new Set(),
    mode: 'listen', // listen | react | picker
    after: null, // what happens when the current reaction line is read
    sel: null,
    pressCount: def.statements.map(() => 0),
  }
  showStatement()
}
function currentStatement() {
  return state.exam.def.statements[state.exam.idx]
}
function showStatement(full = false) {
  const ex = state.exam
  const st = currentStatement()
  if (full) sayFull(ex.def.witness, st.text, 'nervous')
  else say(ex.def.witness, st.text, 'nervous')
}
function gotoStatement(i) {
  const ex = state.exam
  const n = ex.def.statements.length
  ex.idx = (i + n) % n
  showStatement()
  playClickSound()
}
function pressStatement() {
  const ex = state.exam
  const st = currentStatement()
  const lines = st.press
  const line = lines[ex.pressCount[ex.idx] % lines.length]
  ex.pressCount[ex.idx] += 1
  say(ex.def.witness, line.text, line.mood)
  ex.mode = 'react'
  ex.after = 'restore'
  playTalkSound()
  if (st.unlock && !state.evidence.includes(st.unlock)) giveEvidence(st.unlock)
}
function presentEvidence(evId) {
  const ex = state.exam
  const st = currentStatement()
  ex.mode = 'listen'
  ex.sel = null
  if (st.valid.includes(evId)) {
    if (ex.broken.has(ex.idx)) {
      say('hana', '그 모순은 이미 짚어냈어요, 탐정님! 다른 증언을 살펴봐요.', 'smile')
      ex.mode = 'react'
      ex.after = 'restore'
      return
    }
    ex.broken.add(ex.idx)
    state.phase = 'objection'
    state.objection = { timer: 1.15, witness: ex.def.witness }
    playObjectionSound()
    return
  }
  // wrong evidence: the witness shrugs it off and the court's trust drops
  state.hearts -= 1
  state.flash = 0.45
  playBuzzSound()
  const w = ex.def.wrong[Math.floor(Math.random() * ex.def.wrong.length)]
  say(ex.def.witness, w.text, w.mood)
  ex.mode = 'react'
  ex.after = state.hearts <= 0 ? 'gameover' : 'restore'
}
function afterObjection() {
  const ex = state.exam
  const st = currentStatement()
  state.phase = 'exam'
  say(ex.def.witness, st.react.text, st.react.mood)
  ex.mode = 'react'
  ex.after = ex.broken.size >= ex.def.needed ? 'clear' : 'restore'
}
function finishReaction() {
  const ex = state.exam
  const after = ex.after
  ex.mode = 'listen'
  ex.after = null
  if (after === 'restore') showStatement(true)
  else if (after === 'gameover') {
    state.phase = 'gameover'
    playLoseSound()
  } else if (after === 'clear') {
    playCorrectSound()
    if (ex.id === 'kim') startSequence(KIM_CLEAR, 'courtKim', () => startExam('choi'))
    else
      startSequence(CHOI_CLEAR, 'finale', () => {
        state.phase = 'ending'
        state.starTimer = 0
      })
  }
}
function retryExam() {
  state.hearts = MAX_HEARTS
  startExam(state.exam.id)
}

function startInvestigation() {
  state.phase = 'investigate'
  state.line = { who: 'seojin', mood: 'determined', text: IDLE_LINE, shown: 999 }
}

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

function examineHotspot(h) {
  const first = !h.examined
  h.examined = true
  say('seojin', CLUES[h.id].text, 'determined')
  playClueSound()
  if (first) giveEvidence(CLUE_EVIDENCE[h.id])
}

// ---------- Layout ----------
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
function proceedButtonRect() {
  return { x: CANVAS_W - 250, y: 196, w: 220, h: 42 }
}
function fileButtonRect() {
  return { x: CANVAS_W - 138, y: 10, w: 126, h: 30 }
}
function examButtons() {
  return {
    prev: { x: 40, y: 404, w: 56, h: 38 },
    next: { x: 104, y: 404, w: 56, h: 38 },
    press: { x: 566, y: 404, w: 130, h: 38 },
    present: { x: 706, y: 404, w: 160, h: 38 },
  }
}
// The evidence file / "present evidence" overlay.
function pickerLayout() {
  const cols = 4
  const cw = 150
  const ch = 96
  const gap = 12
  const x0 = (CANVAS_W - (cols * cw + (cols - 1) * gap)) / 2
  const cards = state.evidence.map((id, i) => ({
    id,
    x: x0 + (i % cols) * (cw + gap),
    y: 92 + Math.floor(i / cols) * (ch + gap),
    w: cw,
    h: ch,
  }))
  return {
    cards,
    close: { x: x0, y: 460, w: 120, h: 40 },
    submit: { x: x0 + cols * cw + (cols - 1) * gap - 150, y: 460, w: 150, h: 40 },
  }
}
function pickerOpen() {
  return !!state.filePanel || (state.phase === 'exam' && state.exam && state.exam.mode === 'picker')
}
function pickerSel() {
  return state.filePanel ? state.filePanel.sel : state.exam.sel
}
function setPickerSel(id) {
  if (state.filePanel) state.filePanel.sel = id
  else state.exam.sel = id
}
function closePicker() {
  if (state.filePanel) state.filePanel = null
  else if (state.exam) {
    state.exam.mode = 'listen'
    state.exam.sel = null
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

canvas.addEventListener('mousemove', (e) => {
  const { mx, my } = canvasPoint(e)
  let hover = false
  if (pickerOpen()) {
    const lay = pickerLayout()
    const present = !state.filePanel
    hover = lay.cards.some((c) => inRect(mx, my, c)) || inRect(mx, my, lay.close) || (present && !!pickerSel() && inRect(mx, my, lay.submit))
  } else if (state.phase === 'investigate') {
    hover =
      !!personAt(mx, my) ||
      !!hotspotAt(mx, my) ||
      inRect(mx, my, fileButtonRect()) ||
      (allHotspotsExamined() && inRect(mx, my, proceedButtonRect()))
  } else if (state.phase === 'exam' && state.exam.mode === 'listen') {
    const b = examButtons()
    hover = Object.values(b).some((r) => inRect(mx, my, r)) || inRect(mx, my, fileButtonRect())
  } else if (['title', 'seq', 'ending', 'gameover'].includes(state.phase)) {
    hover = true
  }
  state.hover = hover
  canvas.style.cursor = hover ? 'pointer' : 'default'
})

function clickPicker(mx, my) {
  const lay = pickerLayout()
  const card = lay.cards.find((c) => inRect(mx, my, c))
  if (card) {
    setPickerSel(card.id)
    playClickSound()
    return
  }
  if (inRect(mx, my, lay.close)) {
    closePicker()
    playClickSound()
    return
  }
  if (!state.filePanel && pickerSel() && inRect(mx, my, lay.submit)) {
    const id = pickerSel()
    presentEvidence(id)
  }
}

canvas.addEventListener('click', (e) => {
  ensureAudio()
  const { mx, my } = canvasPoint(e)

  if (state.phase === 'title') {
    playClickSound()
    startSequence(INTRO, 'intro', startInvestigation)
    return
  }
  if (pickerOpen()) {
    clickPicker(mx, my)
    return
  }
  if (state.phase === 'seq') {
    advanceSequence()
    return
  }
  if (state.phase === 'investigate') {
    if (inRect(mx, my, fileButtonRect())) {
      if (state.evidence.length) state.filePanel = { sel: state.evidence[0] }
      playClickSound()
      return
    }
    if (!lineDone()) finishLine() // skip the typing, but still handle the click below
    if (allHotspotsExamined() && inRect(mx, my, proceedButtonRect())) {
      playClickSound()
      startSequence(BEFORE_KIM, 'courtKim', () => startExam('kim'))
      return
    }
    const person = personAt(mx, my)
    if (person) {
      talkTo(person)
      return
    }
    const hit = hotspotAt(mx, my)
    if (hit) examineHotspot(hit)
    return
  }
  if (state.phase === 'exam') {
    const ex = state.exam
    if (ex.mode === 'react') {
      if (!lineDone()) finishLine()
      else finishReaction()
      return
    }
    if (inRect(mx, my, fileButtonRect())) {
      if (state.evidence.length) state.filePanel = { sel: state.evidence[0] }
      playClickSound()
      return
    }
    const b = examButtons()
    if (!lineDone()) {
      finishLine()
      if (!Object.values(b).some((r) => inRect(mx, my, r))) return
    }
    if (inRect(mx, my, b.prev)) gotoStatement(ex.idx - 1)
    else if (inRect(mx, my, b.next)) gotoStatement(ex.idx + 1)
    else if (inRect(mx, my, b.press)) pressStatement()
    else if (inRect(mx, my, b.present)) {
      ex.mode = 'picker'
      ex.sel = state.evidence[0] || null
      playClickSound()
    }
    return
  }
  if (state.phase === 'gameover') {
    retryExam()
    playClickSound()
  }
})

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (key === 'r') resetCase()
  if (key === 'm') {
    toggleMute()
    state.muteNoticeUntil = performance.now() + 1600
  }
  if (key === 'escape' && pickerOpen()) closePicker()
  if (state.phase === 'exam' && state.exam.mode === 'listen') {
    if (key === 'arrowleft') gotoStatement(state.exam.idx - 1)
    if (key === 'arrowright') gotoStatement(state.exam.idx + 1)
  }
})

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
function lgrad(y0, y1, c0, c1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  return g
}

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
      // papers swept to one side, the way the clue says
      for (const [px, py, rot] of [[x + 118, y + 10, 0.22], [x + 142, y + 8, 0.12], [x + 162, y + 6, 0.05]]) {
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rot)
        ctx.fillStyle = '#efe6c8'
        ctx.fillRect(0, 0, 50, 24)
        ctx.strokeStyle = '#2a1c10'
        ctx.lineWidth = 1.4
        ctx.strokeRect(0, 0, 50, 24)
        ctx.fillStyle = '#9c8a5c'
        ctx.fillRect(6, 6, 30, 2)
        ctx.fillRect(6, 12, 22, 2)
        ctx.restore()
      }
      ctx.fillStyle = '#2a2a33'
      ctx.fillRect(x + 26, y - 24, 4, 26)
      ctx.beginPath()
      ctx.moveTo(x + 12, y - 22)
      ctx.lineTo(x + 42, y - 22)
      ctx.lineTo(x + 34, y - 38)
      ctx.lineTo(x + 20, y - 38)
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
      // the latch is intact - a small brass hook on the inside
      ctx.fillStyle = '#d4af37'
      ctx.fillRect(x + w / 2 - 12, y + hh / 2 - 4, 8, 8)
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
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      for (let ly = y + 8; ly < y + hh - 14; ly += 4) ctx.fillRect(x + 8, ly, w - 16, 1.5)
      ctx.fillStyle = 'rgba(220,255,230,0.75)'
      ctx.beginPath()
      ctx.arc(x + 24, y + 28, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(x + 18, y + 36, 12, 18)
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
      ctx.fillStyle = 'rgba(120,170,230,0.35)'
      ctx.beginPath()
      ctx.ellipse(ux, y + hh + 4, 30, 6, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (h.id === 'keycard') {
      // wall-mounted access terminal: little screen, card slot, status light
      ctx.fillStyle = '#2b2f3a'
      ctx.beginPath()
      ctx.roundRect(x, y, w, hh, 6)
      ctx.fill()
      ctx.strokeStyle = '#11131a'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = h.examined ? '#1d4a3a' : '#2f8a6a'
      ctx.fillRect(x + 7, y + 8, w - 14, 28)
      ctx.fillStyle = '#c8ffe8'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('01:58', x + w / 2, y + 20)
      ctx.font = '8px monospace'
      ctx.fillText('ACCESS OK', x + w / 2, y + 31)
      ctx.fillStyle = '#0c0e14'
      ctx.fillRect(x + 10, y + 46, w - 20, 5)
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        ctx.fillStyle = '#4a4f5e'
        ctx.fillRect(x + 10 + c * 13, y + 58 + r * 11, 10, 8)
      }
      ctx.fillStyle = Math.floor(t * 1.5) % 2 ? '#3fe08a' : '#1f6a43'
      ctx.beginPath()
      ctx.arc(x + w - 11, y + hh - 9, 3, 0, Math.PI * 2)
      ctx.fill()
    } else if (h.id === 'safe') {
      ctx.fillStyle = lgrad(y, y + hh, '#7b8190', '#4d5260')
      ctx.beginPath()
      ctx.roundRect(x, y, w, hh, 6)
      ctx.fill()
      ctx.strokeStyle = '#1a1d26'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 8, y + 8, w - 16, hh - 16)
      if (h.examined) {
        // door swung open, a policy sticking out
        ctx.fillStyle = '#12141c'
        ctx.fillRect(x + 10, y + 10, w - 20, hh - 20)
        ctx.fillStyle = '#f2ead0'
        ctx.fillRect(x + 20, y + 20, 38, 46)
        ctx.strokeStyle = '#2a2017'
        ctx.lineWidth = 1.4
        ctx.strokeRect(x + 20, y + 20, 38, 46)
        ctx.fillStyle = '#9c3a3a'
        ctx.fillRect(x + 25, y + 26, 28, 5)
        ctx.fillStyle = '#9c8a5c'
        ctx.fillRect(x + 25, y + 36, 24, 2)
        ctx.fillRect(x + 25, y + 42, 18, 2)
      } else {
        // dial + handle + a key left in the lock
        ctx.fillStyle = '#c9ccd6'
        ctx.beginPath()
        ctx.arc(x + w / 2, y + hh / 2 - 6, 17, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#1a1d26'
        ctx.lineWidth = 2.4
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x + w / 2, y + hh / 2 - 6)
        ctx.lineTo(x + w / 2 + 11, y + hh / 2 - 14)
        ctx.stroke()
        ctx.fillStyle = '#d4af37'
        ctx.fillRect(x + w - 24, y + hh - 24, 6, 14)
        ctx.beginPath()
        ctx.arc(x + w - 21, y + hh - 26, 5, 0, Math.PI * 2)
        ctx.fill()
      }
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
  const nameW = ctx.measureText(meta.name).width
  ctx.fillText(meta.name, tx, boxY + 28)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText(meta.role, tx + nameW + 10, boxY + 28)

  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  wrapText(line.text.slice(0, Math.floor(line.shown)), tx, boxY + 54, boxW - (tx - boxX) - 22, 22)

  if (lineDone() && (state.phase === 'seq' || (state.phase === 'exam' && state.exam && state.exam.mode === 'react'))) {
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

function drawButton(rect, label, fill, { enabled = true, font = 'bold 15px sans-serif' } = {}) {
  ctx.save()
  ctx.globalAlpha = enabled ? 1 : 0.45
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10)
  ctx.fill()
  ctx.strokeStyle = '#ffd36b'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5)
  ctx.restore()
}

// ---------- Evidence art ----------
// Little pictograms for each kind of evidence, centred on (cx, cy) in a
// roughly 64px box. Used by the evidence file and the "acquired" banner.
function drawEvidenceIcon(kind, cx, cy, s = 1) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  const ol = () => {
    ctx.lineWidth = 2.2
    ctx.strokeStyle = '#1f1620'
    ctx.stroke()
  }
  if (kind === 'photo') {
    ctx.fillStyle = '#f2ead0'
    ctx.beginPath()
    ctx.roundRect(-26, -22, 52, 44, 3)
    ctx.fill()
    ol()
    ctx.fillStyle = '#2a3a4e'
    ctx.fillRect(-21, -17, 42, 28)
    ctx.fillStyle = '#38b27c'
    ctx.fillRect(-21, -17, 42, 7)
    ctx.fillStyle = '#d6f2e2'
    ctx.fillRect(-16, -8, 32, 17)
    ctx.fillStyle = '#2c3a5a'
    ctx.beginPath()
    ctx.arc(0, -2, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(-4, 2, 8, 8)
    ctx.fillStyle = '#d24a43'
    ctx.fillRect(9, 0, 3, 10)
  } else if (kind === 'receipt') {
    ctx.fillStyle = '#fbf6e6'
    ctx.beginPath()
    ctx.moveTo(-17, -26)
    ctx.lineTo(17, -26)
    ctx.lineTo(17, 24)
    for (let i = 0; i < 6; i++) ctx.lineTo(17 - (i + 1) * 5.6, i % 2 ? 24 : 29)
    ctx.lineTo(-17, 24)
    ctx.closePath()
    ctx.fill()
    ol()
    ctx.fillStyle = '#6a5a3a'
    for (const [i, w] of [[0, 24], [1, 18], [2, 24], [3, 14]]) ctx.fillRect(-12, -18 + i * 8, w, 2.4)
    ctx.fillStyle = '#d24a43'
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('22:15', 0, 20)
  } else if (kind === 'papers') {
    for (const [dx, dy, r] of [[-8, 2, -0.2], [2, 0, 0.1], [10, -2, 0.28]]) {
      ctx.save()
      ctx.translate(dx, dy)
      ctx.rotate(r)
      ctx.fillStyle = '#f2ead0'
      ctx.fillRect(-14, -20, 28, 38)
      ol()
      ctx.strokeRect(-14, -20, 28, 38)
      ctx.fillStyle = '#9c8a5c'
      ctx.fillRect(-9, -13, 18, 2)
      ctx.fillRect(-9, -7, 14, 2)
      ctx.restore()
    }
    ctx.strokeStyle = '#c0392f'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-26, 20)
    ctx.lineTo(24, 20)
    ctx.moveTo(18, 14)
    ctx.lineTo(24, 20)
    ctx.lineTo(18, 26)
    ctx.stroke()
    ctx.lineCap = 'butt'
  } else if (kind === 'window') {
    ctx.fillStyle = '#5c4630'
    ctx.fillRect(-24, -26, 48, 52)
    ol()
    ctx.fillStyle = '#4d6f95'
    ctx.fillRect(-19, -21, 38, 42)
    ctx.fillStyle = '#2a1c10'
    ctx.fillRect(-1, -21, 2, 42)
    ctx.fillRect(-19, -1, 38, 2)
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(-9, -4, 7, 7)
    ctx.strokeStyle = '#1f1620'
    ctx.lineWidth = 1.2
    ctx.strokeRect(-9, -4, 7, 7)
  } else if (kind === 'card') {
    ctx.fillStyle = '#e8ecf4'
    ctx.beginPath()
    ctx.roundRect(-28, -17, 56, 36, 5)
    ctx.fill()
    ol()
    ctx.fillStyle = '#3a4a78'
    ctx.fillRect(-28, -9, 56, 8)
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(-22, 6, 14, 10)
    ctx.fillStyle = '#6a7080'
    ctx.fillRect(0, 7, 22, 3)
    ctx.fillRect(0, 13, 14, 3)
    ctx.fillStyle = '#1f6a43'
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('01:58', -22, -13)
  } else if (kind === 'policy') {
    ctx.fillStyle = '#f2ead0'
    ctx.fillRect(-20, -26, 40, 52)
    ol()
    ctx.strokeStyle = '#9c3a3a'
    ctx.lineWidth = 2.4
    ctx.strokeRect(-16, -22, 32, 44)
    ctx.fillStyle = '#9c3a3a'
    ctx.fillRect(-11, -16, 22, 5)
    ctx.fillStyle = '#9c8a5c'
    ctx.fillRect(-11, -6, 22, 2)
    ctx.fillRect(-11, 0, 16, 2)
    ctx.fillStyle = '#d4af37'
    ctx.beginPath()
    ctx.arc(8, 14, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#7a5a10'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('₩', 8, 17)
  } else if (kind === 'phone') {
    ctx.fillStyle = '#23262f'
    ctx.beginPath()
    ctx.roundRect(-15, -27, 30, 54, 6)
    ctx.fill()
    ol()
    ctx.fillStyle = '#bfe2ff'
    ctx.fillRect(-11, -20, 22, 36)
    ctx.fillStyle = '#2f6fd1'
    ctx.beginPath()
    ctx.roundRect(-9, -17, 17, 8, 3)
    ctx.fill()
    ctx.fillStyle = '#e8ecf4'
    ctx.beginPath()
    ctx.roundRect(-3, -6, 13, 8, 3)
    ctx.fill()
    ctx.fillStyle = '#2f6fd1'
    ctx.beginPath()
    ctx.roundRect(-9, 5, 17, 8, 3)
    ctx.fill()
  }
  ctx.restore()
}

function drawHearts(rightX, y) {
  for (let i = 0; i < MAX_HEARTS; i++) {
    const x = rightX - (MAX_HEARTS - i) * 26 + 12
    const alive = i < state.hearts
    ctx.save()
    ctx.translate(x, y)
    const pulse = alive && state.hearts === 1 ? 1 + Math.sin(performance.now() / 120) * 0.12 : 1
    ctx.scale(pulse, pulse)
    ctx.beginPath()
    ctx.moveTo(0, 7)
    ctx.bezierCurveTo(-13, -2, -7, -11, 0, -4)
    ctx.bezierCurveTo(7, -11, 13, -2, 0, 7)
    ctx.fillStyle = alive ? '#ff5a7a' : 'rgba(255,255,255,0.14)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = alive ? '#7a1830' : 'rgba(255,255,255,0.3)'
    ctx.stroke()
    ctx.restore()
  }
}

function drawFileButton() {
  const r = fileButtonRect()
  drawButton(r, `증거 파일 ${state.evidence.length}`, '#3a4258', { font: 'bold 13px sans-serif', enabled: state.evidence.length > 0 })
}

// "Evidence acquired!" banner that slides down for a moment.
function drawPopup() {
  const p = state.popup
  if (!p) return
  const left = p.until - performance.now()
  if (left <= 0) {
    state.popup = null
    return
  }
  const k = Math.min(1, (2800 - left) / 260, left / 260)
  const ev = EVIDENCE[p.id]
  const w = 380
  const h = 70
  const x = CANVAS_W / 2 - w / 2
  const y = -h + (h + 56) * clamp(k, 0, 1)
  ctx.fillStyle = 'rgba(14, 11, 20, 0.96)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 12)
  ctx.fill()
  ctx.strokeStyle = '#ffd36b'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.roundRect(x + 10, y + 8, 54, 54, 8)
  ctx.fill()
  drawEvidenceIcon(ev.icon, x + 37, y + 35, 0.9)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('증거 입수!', x + 78, y + 28)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 17px sans-serif'
  ctx.fillText(ev.name, x + 78, y + 52)
}

// The evidence file (investigation) or the "present evidence" chooser (cross-examination).
function drawPicker(t) {
  const present = !state.filePanel
  ctx.fillStyle = 'rgba(8, 6, 12, 0.84)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(present ? '제출할 증거를 선택하세요' : '증거 파일', CANVAS_W / 2, 56)
  if (present) {
    ctx.fillStyle = '#cfd8ff'
    ctx.font = '13px sans-serif'
    ctx.fillText('증언과 모순되는 증거를 골라 제출합니다. 틀리면 신뢰도가 깎여요.', CANVAS_W / 2, 78)
  }

  const lay = pickerLayout()
  const sel = pickerSel()
  for (const c of lay.cards) {
    const ev = EVIDENCE[c.id]
    const on = c.id === sel
    ctx.fillStyle = on ? '#f4e9c4' : '#e0d3ad'
    ctx.beginPath()
    ctx.roundRect(c.x, c.y, c.w, c.h, 8)
    ctx.fill()
    ctx.strokeStyle = on ? '#ffd36b' : '#2a2017'
    ctx.lineWidth = on ? 4 : 2.5
    ctx.stroke()
    drawEvidenceIcon(ev.icon, c.x + c.w / 2, c.y + 40, 0.95)
    ctx.fillStyle = '#2b2317'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(ev.name, c.x + c.w / 2, c.y + c.h - 9)
  }

  // detail panel for the selected item
  const dx = lay.cards.length ? lay.cards[0].x : 130
  const dw = CANVAS_W - dx * 2
  const dy = 364
  ctx.fillStyle = 'rgba(14, 11, 20, 0.96)'
  ctx.beginPath()
  ctx.roundRect(dx, dy, dw, 82, 10)
  ctx.fill()
  ctx.strokeStyle = '#c9a85c'
  ctx.lineWidth = 2
  ctx.stroke()
  if (sel) {
    const ev = EVIDENCE[sel]
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffd36b'
    ctx.font = 'bold 15px sans-serif'
    ctx.fillText(ev.name, dx + 16, dy + 26)
    ctx.fillStyle = '#fff'
    ctx.font = '14px sans-serif'
    wrapText(ev.desc, dx + 16, dy + 50, dw - 32, 20)
  } else {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '14px sans-serif'
    ctx.fillText('증거를 선택하세요', CANVAS_W / 2, dy + 46)
  }

  drawButton(lay.close, present ? '취소' : '닫기', '#3a4258')
  if (present) drawButton(lay.submit, '이 증거를 제출!', '#7a2e2e', { enabled: !!sel })
}

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

// ---------- Scenes ----------
// Casts standing in the courtroom around the witness stand.
const COURT_CASTS = {
  kim: [
    { id: 'seojin', x: 160, s: 1.15, mood: 'determined', pose: 'pockets' },
    { id: 'hana', x: 290, s: 1.05, mood: 'worried' },
    { id: 'park', x: 740, s: 1.1, mood: 'neutral' },
    { id: 'choi', x: 850, s: 1.0, mood: 'worried' },
  ],
  choi: [
    { id: 'seojin', x: 160, s: 1.15, mood: 'determined', pose: 'pockets' },
    { id: 'hana', x: 290, s: 1.05, mood: 'worried' },
    { id: 'park', x: 740, s: 1.1, mood: 'neutral' },
    { id: 'suhan', x: 850, s: 1.0, mood: 'defeated' },
  ],
}
const FINALE_CAST = [
  { id: 'minji', x: 70, s: 1.1, mood: 'cheer', pose: 'idle' },
  { id: 'seojin', x: 215, s: 1.28, mood: 'determined', pose: 'point' },
  { id: 'choi', x: 430, s: 1.3, mood: 'defeated', pose: 'idle' },
  { id: 'park', x: 610, s: 1.2, mood: 'angry', pose: 'idle' },
  { id: 'suhan', x: 735, s: 1.1, mood: 'cheer', pose: 'idle' },
  { id: 'hana', x: 835, s: 1.1, mood: 'cheer', pose: 'cheer' },
]

function drawCast(cast, t, baseY) {
  for (const c of cast) {
    const speaking = state.line.who === c.id && state.line.shown < 999
    drawCharacter(ctx, c.id, c.x, baseY, { scale: c.s, mood: speaking ? state.line.mood : c.mood, pose: c.pose, t })
  }
}

function drawExamStage(t, witnessId, witnessMood) {
  drawCourtroomBackdrop(t)
  const ex = state.exam
  drawCast(COURT_CASTS[ex ? ex.id : 'kim'], t, 395)
  drawCharacter(ctx, witnessId, CANVAS_W / 2, 412, { scale: 1.5, mood: witnessMood, t })
  drawWitnessStand(CANVAS_W / 2, 412)
}

function drawSeqScene(t) {
  const s = state.seq
  const l = s.lines[s.index]
  if (s.scene === 'intro') {
    drawIntroBackdrop(t)
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
  } else if (s.scene === 'courtKim') {
    // the witness already on the stand
    const kimTurn = s.lines === BEFORE_KIM || s.lines === KIM_CLEAR
    drawCourtroomBackdrop(t)
    drawCast(COURT_CASTS.kim, t, 395)
    const who = s.lines === KIM_CLEAR ? 'suhan' : 'suhan'
    const speaking = l.who === who
    drawCharacter(ctx, who, CANVAS_W / 2, 412, { scale: 1.5, mood: speaking ? l.mood : s.lines === KIM_CLEAR ? 'defeated' : 'nervous', t })
    drawWitnessStand(CANVAS_W / 2, 412)
    void kimTurn
  } else if (s.scene === 'finale') {
    drawCourtroomBackdrop(t)
    drawCast(FINALE_CAST, t, 392)
  }
  drawDialogueBox()
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText(`${s.index + 1} / ${s.lines.length}`, 36, 30)
}

function drawInvestigateScene(t) {
  drawRoomBackdrop(t)
  drawHotspots(t)
  for (const p of PEOPLE) {
    const speaking = state.line.who === p.id && state.line.shown < 999
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
  ctx.fillText(`나눈 대화: ${talkedCount()}/${talkTargets()}`, 20, 52)
  drawFileButton()

  drawDialogueBox()

  if (allHotspotsExamined()) {
    const btn = proceedButtonRect()
    const pulse = 0.85 + Math.sin(t * 5) * 0.15
    ctx.globalAlpha = pulse
    drawButton(btn, '증인을 심문하러 가기', '#2e6b4a')
    ctx.globalAlpha = 1
  }
}

function drawExamScene(t) {
  const ex = state.exam
  const def = ex.def
  const st = currentStatement()
  const speaking = state.line.who === def.witness
  drawExamStage(t, def.witness, speaking ? state.line.mood : 'nervous')

  // header: whose testimony, which statement, how far the cross-examination has come
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText(def.title, 20, 30)
  for (let i = 0; i < def.statements.length; i++) {
    const cx = 28 + i * 24
    const broken = ex.broken.has(i)
    const cur = i === ex.idx
    ctx.beginPath()
    ctx.arc(cx, 52, 8, 0, Math.PI * 2)
    ctx.fillStyle = broken ? '#3fae5c' : 'rgba(255,255,255,0.16)'
    ctx.fill()
    ctx.lineWidth = cur ? 3 : 1.5
    ctx.strokeStyle = cur ? '#ffd36b' : 'rgba(255,255,255,0.4)'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(broken ? '✓' : String(i + 1), cx, 56)
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#cfd8ff'
  ctx.font = '12px sans-serif'
  ctx.fillText(`모순 지적 ${ex.broken.size}/${def.needed}`, 20, 80)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(20, 86, 120, 6)
  ctx.fillStyle = '#3fae5c'
  ctx.fillRect(20, 86, 120 * clamp(ex.broken.size / def.needed, 0, 1), 6)

  drawHearts(CANVAS_W - 12, 62)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '11px sans-serif'
  ctx.fillText('신뢰도', CANVAS_W - 12, 82)
  drawFileButton()

  drawDialogueBox()
  // statement tag over the dialogue box
  const label = `증언 ${ex.idx + 1}/${def.statements.length}${ex.broken.has(ex.idx) ? '  ✓ 모순 지적 완료' : ''}`
  ctx.textAlign = 'right'
  ctx.fillStyle = ex.broken.has(ex.idx) ? '#7fe0a0' : '#ffd36b'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(label, CANVAS_W - 46, CANVAS_H - 30 - 118 + 22)

  // controls
  const b = examButtons()
  const idle = ex.mode === 'listen'
  const hasEv = state.evidence.length > 0
  drawButton(b.prev, '◀', '#3a4258', { enabled: idle })
  drawButton(b.next, '▶', '#3a4258', { enabled: idle })
  drawButton(b.press, '추궁!', '#2f5fa0', { enabled: idle })
  drawButton(b.present, '증거 제출', '#7a2e2e', { enabled: idle && hasEv })
  if (idle) {
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '12px sans-serif'
    ctx.fillText('← → 키로도 증언을 넘길 수 있어요', 172, 428)
  }
  void st
}

function drawObjectionScene(t) {
  const o = state.objection
  const p = 1 - clamp(o.timer / 1.15, 0, 1)
  ctx.save()
  if (p < 0.35) ctx.translate((Math.random() - 0.5) * 10 * (1 - p / 0.35), (Math.random() - 0.5) * 8 * (1 - p / 0.35))
  drawCourtroomBackdrop(t)
  drawCharacter(ctx, 'seojin', 200, 420, { scale: 1.6, mood: 'determined', pose: 'point', t })
  drawCharacter(ctx, o.witness, 640, 420, { scale: 1.6, mood: 'shocked', t })

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

function starTotal() {
  const score = Math.max(0, state.hearts) + talkedCount()
  return score >= 7 ? 3 : score >= 4 ? 2 : 1
}

function drawEnding(t) {
  drawCourtroomBackdrop(t)
  drawCast(FINALE_CAST, t, 392)

  const total = starTotal()
  const panelW = 380
  const panelH = 168
  const px = CANVAS_W / 2 - panelW / 2
  const py = CANVAS_H - 30 - panelH
  ctx.fillStyle = 'rgba(14,11,20,0.94)'
  ctx.beginPath()
  ctx.roundRect(px, py, panelW, panelH, 14)
  ctx.fill()
  ctx.strokeStyle = '#ffd36b'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('사건 해결!', CANVAS_W / 2, py + 36)
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
  const grade = total === 3 ? '완벽한 추리!' : total === 2 ? '훌륭한 추리' : '해결은 했지만... 조금 아슬아슬했어요'
  ctx.fillText(grade, CANVAS_W / 2, py + 120)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(`남은 신뢰도 ${Math.max(0, state.hearts)}/${MAX_HEARTS}  ·  나눈 대화 ${talkedCount()}/${talkTargets()}  ·  증거 ${state.evidence.length}/${Object.keys(EVIDENCE).length}`, CANVAS_W / 2, py + 142)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText('R 키: 처음부터 다시', CANVAS_W / 2, py + 160)
}

function drawGameOver(t) {
  drawExamStage(t, state.exam.def.witness, 'smile')
  ctx.fillStyle = 'rgba(8,6,12,0.82)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.font = 'bold 48px sans-serif'
  ctx.strokeStyle = '#1f1620'
  ctx.lineWidth = 8
  ctx.strokeText('추리 실패...', CANVAS_W / 2, 230)
  ctx.fillStyle = '#ff7a8a'
  ctx.fillText('추리 실패...', CANVAS_W / 2, 230)
  ctx.fillStyle = '#cfd8ff'
  ctx.font = '16px sans-serif'
  ctx.fillText('법정의 신뢰를 모두 잃고 말았다. 증거를 다시 살펴보고 도전해 보자.', CANVAS_W / 2, 280)
  drawHearts(CANVAS_W / 2 + 70, 330)
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.45
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText('클릭하여 이 증언부터 다시 도전', CANVAS_W / 2, 400)
  ctx.globalAlpha = 1
}

function drawMuteNotice() {
  if (state.muteNoticeUntil && performance.now() < state.muteNoticeUntil) {
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(muted ? '소리 끔 (M)' : '소리 켬 (M)', CANVAS_W - 16, 56)
  }
}

function render() {
  const t = performance.now() / 1000
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  tickLine()

  if (state.phase === 'title') drawTitle(t)
  else if (state.phase === 'seq') drawSeqScene(t)
  else if (state.phase === 'investigate') drawInvestigateScene(t)
  else if (state.phase === 'exam') drawExamScene(t)
  else if (state.phase === 'objection') {
    drawObjectionScene(t)
    state.objection.timer -= 1 / 60
    if (state.objection.timer <= 0) afterObjection()
  } else if (state.phase === 'gameover') drawGameOver(t)
  else if (state.phase === 'ending') {
    drawEnding(t)
    const before = state.starTimer
    state.starTimer += 1 / 60
    for (let i = 0; i < 3; i++) {
      const at = 0.4 + i * 0.4
      if (before < at && state.starTimer >= at && i < starTotal()) playStarSound(i)
    }
  }

  if (pickerOpen()) drawPicker(t)
  if (!pickerOpen()) drawPopup()
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,40,60,${clamp(state.flash, 0, 0.45) * 0.9})`
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    state.flash -= 1 / 60
  }
  drawMuteNotice()
}

function loop() {
  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
