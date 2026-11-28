import { sfx, unlockSfx, toggleMute } from './sfx.js'

const canvas = document.getElementById('scene')
const ctx = canvas.getContext('2d')
const W = canvas.width
const H = canvas.height

const ITEMS = {
  key: { name: '녹슨 열쇠', color: '#c9a227', examine: '오래된 녹슨 열쇠. 문 자물쇠에 맞을 것 같다.' },
  pipe: { name: '녹슨 파이프', color: '#9a9a9a', examine: '지렛대로 쓸 수 있을 만큼 튼튼해 보이는 파이프.' },
  note: {
    name: '낡은 쪽지',
    color: '#e8dcb5',
    examine: '"...충돌 당일 기록된 마지막 두 자리 숫자는 08." 나머지는 번져서 읽을 수 없다.',
  },
  card: { name: '전자 출입카드', color: '#4da6ff', examine: '엘리베이터용 출입카드로 보인다.' },
}

const ENDING_TEXT =
  '장치가 가늘게 진동하며 빛을 뿜어낸다.\n\n중앙 모니터에 글자가 떠오른다 — 1908년의 "사고"는 사고가 아니라, 처음부터 계획된 통신 시도였다는 기록.\n\n그리고 마지막 줄: "만약 이 메시지를 읽고 있다면, 당신은 이미 한 번 이걸 발견했었다. - 미래의 당신으로부터."\n\n알렉스는 한참을 그 자리에 서 있었다.\n\n— 퉁구스카의 비밀, 끝 —'

const SCENES = {
  entrance: {
    title: '눈 덮인 입구',
    draw: drawEntranceBg,
    hotspots: [
      { id: 'door', x: 610, y: 150, w: 150, h: 320 },
      { id: 'pot', x: 140, y: 420, w: 100, h: 90 },
      { id: 'pipe', x: 790, y: 420, w: 70, h: 120 },
    ],
  },
  lobby: {
    title: '낡은 로비',
    draw: drawLobbyBg,
    hotspots: [
      { id: 'desk', x: 330, y: 380, w: 200, h: 110 },
      { id: 'photo', x: 616, y: 136, w: 118, h: 92 },
      { id: 'safe', x: 100, y: 230, w: 120, h: 160 },
      { id: 'elevator', x: 760, y: 150, w: 160, h: 360 },
    ],
  },
  lab: {
    title: '지하 실험실',
    draw: drawLabBg,
    hotspots: [{ id: 'device', x: 370, y: 190, w: 220, h: 240 }],
  },
}

function makeInitialState() {
  return {
    scene: 'entrance',
    inventory: [],
    activeItem: null,
    flags: {
      keyTaken: false,
      pipeTaken: false,
      doorUnlocked: false,
      drawerOpened: false,
      clue1Found: false,
      clue2Found: false,
      safeOpened: false,
      elevatorPowered: false,
    },
    message: '눈보라 속, 버려진 소련 연구 기지의 입구에 도착했다.',
    started: false,
    completed: false,
    hoveredHotspot: null,
  }
}
const mouse = { x: -99, y: -99 }
let state = makeInitialState()

// ---- 저장 / 이어하기: 단서를 누를 때마다 자동 저장 ----
const SAVE_KEY = 'tunguska-save-v1'
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    const d = raw ? JSON.parse(raw) : null
    return d && d.scene && Array.isArray(d.inventory) && d.flags ? d : null
  } catch {
    return null
  }
}
function saveGame() {
  if (!state.started) return
  try {
    if (state.completed) return localStorage.removeItem(SAVE_KEY)
    const scene = fade.target || state.scene
    localStorage.setItem(SAVE_KEY, JSON.stringify({ scene, inventory: state.inventory, flags: state.flags, message: state.message }))
  } catch { /* 저장 공간 없음 */ }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* noop */ }
}
function continueGame() {
  const d = readSave()
  if (!d) return false
  state = { ...makeInitialState(), scene: d.scene, inventory: d.inventory, flags: { ...makeInitialState().flags, ...d.flags }, message: d.message || '', started: true }
  fade.t = 1
  fade.target = null
  syncUI()
  return true
}
window.addEventListener('keydown', (e) => {
  if (!state.started && e.code === 'KeyC' && continueGame()) sfx.start()
})
window.addEventListener('beforeunload', saveGame)

function addItem(id) {
  if (!state.inventory.includes(id)) state.inventory.push(id)
}
function setMessage(msg) { state.message = msg }
function clearActiveItem() { state.activeItem = null }
function goToScene(id) {
  // fade out, swap the scene in the middle, fade back in
  fade.t = 0
  fade.target = id
  state.hoveredHotspot = null
}
const fade = { t: 1, target: null } // t runs 0 -> 1; the scene swaps at 0.5

function examineItem(id) {
  setMessage(ITEMS[id].examine)
  if (id === 'note') state.flags.clue2Found = true
}

const HOTSPOT_HANDLERS = {
  'entrance:pot': () => {
    if (!state.flags.keyTaken) {
      state.flags.keyTaken = true
      addItem('key')
      setMessage('화분 속 얼어붙은 흙더미에서 녹슨 열쇠를 발견했다.')
    } else {
      setMessage('이미 다 뒤져본 화분이다.')
    }
  },
  'entrance:pipe': () => {
    if (!state.flags.pipeTaken) {
      state.flags.pipeTaken = true
      addItem('pipe')
      setMessage('벽에 기대어 있던 녹슨 파이프를 챙겼다.')
    } else {
      setMessage('더 가져갈 것은 없다.')
    }
  },
  'entrance:door': () => {
    if (state.flags.doorUnlocked) {
      setMessage('문을 열고 안으로 들어간다.')
      goToScene('lobby')
      return
    }
    if (state.activeItem === 'key') {
      state.flags.doorUnlocked = true
      clearActiveItem()
      setMessage('녹슨 열쇠로 문을 열었다. 안으로 들어간다.')
      goToScene('lobby')
    } else {
      setMessage('육중한 철문이다. 자물쇠가 걸려 있다. 열쇠가 필요해 보인다.')
    }
  },
  'lobby:photo': () => {
    state.flags.clue1Found = true
    setMessage('빛바랜 사진 속, 낡은 표지판에 숫자가 새겨져 있다: "19■■"')
  },
  'lobby:desk': () => {
    if (state.flags.drawerOpened) {
      setMessage('이미 열어본 서랍이다.')
      return
    }
    if (state.activeItem === 'pipe') {
      state.flags.drawerOpened = true
      clearActiveItem()
      addItem('note')
      setMessage('파이프를 지렛대 삼아 서랍을 비집어 열었다. 낡은 쪽지를 발견했다.')
    } else {
      setMessage('서랍이 뻑뻑하게 걸려 있다. 뭔가로 비집어야 할 것 같다.')
    }
  },
  'lobby:safe': () => {
    if (state.flags.safeOpened) {
      setMessage('이미 열려 있는 금고다.')
      return
    }
    if (!state.flags.clue1Found || !state.flags.clue2Found) {
      setMessage('숫자 자물쇠가 달린 금고다. 아직 단서가 부족하다.')
      return
    }
    openCodeModal()
  },
  'lobby:elevator': () => {
    if (state.flags.elevatorPowered) {
      setMessage('엘리베이터를 타고 아래로 내려간다.')
      goToScene('lab')
      return
    }
    if (state.activeItem === 'card') {
      state.flags.elevatorPowered = true
      clearActiveItem()
      setMessage('카드를 인식기에 대자 엘리베이터에 불이 들어온다. 아래로 내려간다.')
      goToScene('lab')
    } else {
      setMessage('고장 난 엘리베이터. 카드 인식기가 달려 있다.')
    }
  },
  'lab:device': () => {
    state.completed = true
    setMessage(ENDING_TEXT)
  },
}

function handleHotspotClick(id) {
  const key = `${state.scene}:${id}`
  const handler = HOTSPOT_HANDLERS[key]
  const before = { inv: state.inventory.length, scene: fade.target, done: state.completed }
  if (handler) handler()
  if (state.completed && !before.done) sfx.fanfare()
  else if (state.inventory.length > before.inv) sfx.pickup()
  else if (fade.target !== before.scene) sfx.door()
  else if (/필요|걸려|부족|뻑뻑|고장/.test(state.message)) sfx.bad()
  else sfx.click()
  syncUI()
  saveGame()
}

canvas.addEventListener('click', (e) => {
  unlockSfx()
  if (!state.started) {
    state.started = true
    sfx.start()
    return
  }
  if (fade.t < 1) return
  if (state.completed) {
    restart()
    return
  }
  const rect = canvas.getBoundingClientRect()
  const scaleX = W / rect.width
  const scaleY = H / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY
  const scene = SCENES[state.scene]
  const hit = scene.hotspots.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)
  if (hit) handleHotspotClick(hit.id)
})

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const scaleX = W / rect.width
  const scaleY = H / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY
  mouse.x = x
  mouse.y = y
  const scene = SCENES[state.scene]
  const hit = scene.hotspots.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && hotspotVisible(h.id))
  state.hoveredHotspot = hit ? hit.id : null
})

function onInventoryClick(id) {
  if (state.activeItem === id) {
    examineItem(id)
    state.activeItem = null
  } else {
    state.activeItem = id
    setMessage(`${ITEMS[id].name}을(를) 선택했다. 사용할 곳을 클릭하세요.`)
  }
  syncUI()
}

function renderInventory() {
  const el = document.getElementById('inventory')
  el.innerHTML = ''
  for (const id of state.inventory) {
    const btn = document.createElement('button')
    btn.className = 'item-btn' + (state.activeItem === id ? ' active' : '')
    btn.textContent = ITEMS[id].name
    btn.dataset.item = id
    btn.onclick = () => onInventoryClick(id)
    el.appendChild(btn)
  }
}

let typedFor = ''
let typed = 0
function syncUI() {
  renderInventory()
  if (typedFor !== state.message) {
    typedFor = state.message
    typed = 0
  }
  document.getElementById('scene-title').textContent = SCENES[state.scene].title
}

// --- Code-entry modal ---
let codeInput = ''
function openCodeModal() {
  codeInput = ''
  updateCodeDisplay()
  document.getElementById('modal').classList.remove('hidden')
}
function closeCodeModal() {
  document.getElementById('modal').classList.add('hidden')
}
function updateCodeDisplay() {
  document.getElementById('code-display').textContent = codeInput.padEnd(4, '_').split('').join(' ')
}
function onDigit(d) {
  sfx.blip(300 + d * 40)
  if (codeInput.length >= 4) return
  codeInput += String(d)
  updateCodeDisplay()
}
function onConfirmCode() {
  if (codeInput === '1908') {
    state.flags.safeOpened = true
    addItem('card')
    setMessage('금고가 열렸다! 안에서 전자 출입카드를 발견했다.')
    sfx.good()
    closeCodeModal()
  } else {
    setMessage('맞지 않는 번호다...')
    sfx.bad()
    codeInput = ''
    updateCodeDisplay()
  }
  syncUI()
}
function buildKeypad() {
  const el = document.getElementById('keypad')
  for (let i = 0; i <= 9; i++) {
    const btn = document.createElement('button')
    btn.textContent = String(i)
    btn.dataset.digit = String(i)
    btn.onclick = () => onDigit(i)
    el.appendChild(btn)
  }
  const confirmBtn = document.createElement('button')
  confirmBtn.id = 'code-confirm'
  confirmBtn.textContent = '확인'
  confirmBtn.onclick = onConfirmCode
  el.appendChild(confirmBtn)
}
buildKeypad()
document.getElementById('code-cancel').onclick = closeCodeModal

function restart() {
  clearSave()
  const started = state.started
  state = makeInitialState()
  state.started = started
  fade.t = 1
  fade.target = null
  closeCodeModal()
  syncUI()
}
document.getElementById('restart-btn').onclick = restart

// --- Backgrounds (procedural canvas art, no external assets) ---

const hotspotVisible = () => true
const HOTSPOT_LABEL = {
  'entrance:door': '철문',
  'entrance:pot': '화분',
  'entrance:pipe': '녹슨 파이프',
  'lobby:desk': '책상',
  'lobby:photo': '사진',
  'lobby:safe': '금고',
  'lobby:elevator': '엘리베이터',
  'lab:device': '정체불명의 장치',
}
const hash = (a, b = 0, k = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}
const T = () => performance.now() / 1000

function rr(x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}
function rivets(x, y, w, h, step = 28, color = 'rgba(255,255,255,0.18)') {
  ctx.fillStyle = color
  for (let xx = x + 8; xx < x + w - 4; xx += step) {
    ctx.fillRect(xx, y + 6, 3, 3)
    ctx.fillRect(xx, y + h - 9, 3, 3)
  }
}

// A hovered hotspot gets a soft glow and a label; idle ones draw nothing so
// the scenery reads as a picture rather than a diagram.
function drawHotspotHighlights() {
  const scene = SCENES[state.scene]
  const t = T()
  for (const h of scene.hotspots) {
    if (state.hoveredHotspot !== h.id) continue
    const pulse = 0.65 + Math.sin(t * 1.8) * 0.1
    ctx.save()
    ctx.shadowColor = 'rgba(95,200,230,0.9)'
    ctx.shadowBlur = 18
    ctx.strokeStyle = `rgba(150,225,245,${pulse})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.roundRect(h.x - 2, h.y - 2, h.w + 4, h.h + 4, 8)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = 'rgba(150,225,245,0.07)'
    ctx.fillRect(h.x, h.y, h.w, h.h)
    const label = HOTSPOT_LABEL[`${state.scene}:${h.id}`] || ''
    ctx.font = 'bold 14px sans-serif'
    const w = ctx.measureText(label).width + 20
    const lx = Math.max(8, Math.min(W - w - 8, mouse.x + 14))
    const ly = Math.max(8, Math.min(H - 40, mouse.y - 34))
    rr(lx, ly, w, 26, 8, 'rgba(8,14,20,0.9)', 'rgba(150,225,245,0.7)', 1.5)
    ctx.fillStyle = '#d8f4ff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + w / 2, ly + 14)
    ctx.textBaseline = 'alphabetic'
  }
}

function skyGradient(topColor, bottomColor, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, bottom)
  g.addColorStop(0, topColor)
  g.addColorStop(1, bottomColor)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, bottom)
}

// Three layers of snow at different speeds + wind streaks.
const flakes = Array.from({ length: 170 }, (_, i) => ({ x: hash(i, 1) * W, y: hash(i, 2) * H, z: hash(i, 3), p: hash(i, 4) * 6 }))
function drawSnow(t, strength = 1) {
  for (const f of flakes) {
    const sp = 24 + f.z * 70
    const x = (f.x + t * (30 + f.z * 90) * strength + Math.sin(t + f.p) * 10) % (W + 20)
    const y = (f.y + t * sp) % (H + 10)
    ctx.fillStyle = `rgba(255,255,255,${0.35 + f.z * 0.5})`
    ctx.beginPath()
    ctx.arc(x - 10, y, 0.8 + f.z * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 9; i++) {
    const y = hash(i, 9) * H * 0.9
    const x = ((t * 260 * (0.6 + hash(i, 5)) + hash(i, 7) * W) % (W + 200)) - 100
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 90, y - 8)
    ctx.stroke()
  }
}

function vignette(a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${a})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function pine(x, y, s, col) {
  ctx.fillStyle = col
  for (let i = 0; i < 4; i++) {
    const w = (26 - i * 5) * s
    const yy = y - i * 16 * s
    ctx.beginPath()
    ctx.moveTo(x - w, yy)
    ctx.lineTo(x, yy - 26 * s)
    ctx.lineTo(x + w, yy)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (let i = 0; i < 4; i++) {
    const w = (26 - i * 5) * s
    const yy = y - i * 16 * s
    ctx.beginPath()
    ctx.moveTo(x - w * 0.6, yy - 9 * s)
    ctx.lineTo(x, yy - 26 * s)
    ctx.lineTo(x + w * 0.6, yy - 9 * s)
    ctx.closePath()
    ctx.fill()
  }
}

function drawEntranceBg() {
  const t = T()
  skyGradient('#18222e', '#566877', 330)
  // far ridge + pines fading into the storm
  ctx.fillStyle = '#3a4856'
  ctx.beginPath()
  ctx.moveTo(0, 300)
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 250 + Math.sin(x * 0.011) * 28 + Math.sin(x * 0.037) * 10)
  ctx.lineTo(W, 330)
  ctx.lineTo(0, 330)
  ctx.fill()
  for (const [x, s] of [[40, 1.1], [110, 0.8], [190, 1.0], [420, 0.7], [480, 0.9]]) pine(x, 322, s, '#27323c')
  // snowfield
  const g = ctx.createLinearGradient(0, 300, 0, H)
  g.addColorStop(0, '#aebdc8')
  g.addColorStop(1, '#dfe8ee')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, 318)
  for (let x = 0; x <= W; x += 30) ctx.lineTo(x, 316 + Math.sin(x * 0.02) * 6)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.fill()
  ctx.fillStyle = 'rgba(120,150,175,0.25)'
  for (const [x, y, w] of [[60, 470, 220], [340, 520, 260], [640, 540, 280], [30, 360, 160]]) {
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y, w / 2, 14, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // footprints leading to the door
  ctx.fillStyle = 'rgba(110,135,160,0.5)'
  for (let i = 0; i < 9; i++) {
    const px = 330 + i * 34
    const py = 500 - i * 7 + (i % 2 ? 5 : -5)
    ctx.beginPath()
    ctx.ellipse(px, py, 8, 4.5, -0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // concrete bunker facade
  const x0 = 540
  const y0 = 100
  rr(x0 - 12, y0 - 18, 324, 30, 4, '#58636e')
  ctx.fillStyle = '#4a5560'
  ctx.fillRect(x0, y0, 300, 400)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < 5; i++) ctx.fillRect(x0, y0 + i * 80, 300, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  for (let i = 1; i < 5; i++) ctx.fillRect(x0, y0 + i * 80 - 2, 300, 2)
  ctx.fillRect(x0 + 100, y0, 2, 400)
  ctx.fillRect(x0 + 200, y0, 2, 400)
  rivets(x0, y0, 300, 400, 30)
  // faded star plaque and hazard stripes
  ctx.fillStyle = '#7a2a28'
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 9 : 22
    ctx.lineTo(x0 + 60 + Math.cos(a) * r, y0 + 62 + Math.sin(a) * r)
  }
  ctx.fill()
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#d8b83a' : '#2a2a2a'
    ctx.fillRect(x0 + 160 + i * 16, y0 + 40, 16, 12)
  }
  // dead vent with a thin plume
  ctx.fillStyle = '#2a3036'
  ctx.fillRect(x0 + 236, y0 + 80, 40, 30)
  ctx.fillStyle = '#3c444c'
  for (let i = 0; i < 4; i++) ctx.fillRect(x0 + 240, y0 + 84 + i * 7, 32, 3)
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.25 + i * 0.25) % 1
    ctx.fillStyle = `rgba(225,232,240,${(1 - ph) * 0.4})`
    ctx.beginPath()
    ctx.arc(x0 + 256 + ph * 30, y0 + 74 - ph * 44, 5 + ph * 9, 0, Math.PI * 2)
    ctx.fill()
  }
  // door
  rr(600, 140, 170, 340, 4, '#2c343c')
  rr(610, 150, 150, 320, 3, '#3a4550')
  rr(620, 160, 130, 300, 3, '#2a3238', '#12171b', 4)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(620, 160, 130, 8)
  rivets(620, 160, 130, 300, 22, 'rgba(255,255,255,0.22)')
  ctx.strokeStyle = '#1c2227'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(685, 160)
  ctx.lineTo(685, 460)
  ctx.stroke()
  // wheel lock
  ctx.strokeStyle = '#6a7580'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(725, 310, 18, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    ctx.beginPath()
    ctx.moveTo(725, 310)
    ctx.lineTo(725 + Math.cos(a) * 18, 310 + Math.sin(a) * 18)
    ctx.stroke()
  }
  // padlock
  const unlocked = state.flags.doorUnlocked
  ctx.fillStyle = '#9a8420'
  rr(703, 346, 24, 20, 3, unlocked ? '#4a4a4a' : '#c9a227', '#3a2e08', 1.5)
  ctx.strokeStyle = unlocked ? '#4a4a4a' : '#9a8a40'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(715, unlocked ? 336 : 346, 7, Math.PI, 0)
  ctx.stroke()
  // icicles over the door
  ctx.fillStyle = 'rgba(210,235,250,0.85)'
  for (let i = 0; i < 9; i++) {
    const ix = 604 + i * 19 + hash(i, 2) * 6
    const il = 10 + hash(i, 6) * 22
    ctx.beginPath()
    ctx.moveTo(ix, 142)
    ctx.lineTo(ix + 5, 142)
    ctx.lineTo(ix + 2.5, 142 + il)
    ctx.closePath()
    ctx.fill()
  }
  // floodlight above the door (steady)
  const flick = 0.9
  ctx.fillStyle = '#2a2f34'
  rr(675, 96, 44, 14, 4, '#2a2f34')
  const cone = ctx.createLinearGradient(0, 110, 0, 330)
  cone.addColorStop(0, `rgba(255,235,170,${0.38 * flick})`)
  cone.addColorStop(1, 'rgba(255,235,170,0)')
  ctx.fillStyle = cone
  ctx.beginPath()
  ctx.moveTo(682, 108)
  ctx.lineTo(712, 108)
  ctx.lineTo(790, 360)
  ctx.lineTo(604, 360)
  ctx.fill()
  ctx.fillStyle = `rgba(255,240,190,${flick})`
  ctx.fillRect(685, 104, 24, 5)

  // frozen flower pot (with a dead stalk and a hint of metal in the soil)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(196, 512, 62, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9a5a3a'
  ctx.beginPath()
  ctx.moveTo(152, 450)
  ctx.lineTo(240, 450)
  ctx.lineTo(228, 510)
  ctx.lineTo(164, 510)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#4a2a1c'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = '#b86c48'
  ctx.fillRect(148, 440, 96, 14)
  ctx.strokeRect(148, 440, 96, 14)
  ctx.fillStyle = '#eef4f6'
  ctx.beginPath()
  ctx.ellipse(196, 438, 44, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#5a4a3a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(190, 436)
  ctx.quadraticCurveTo(184, 410, 198, 396)
  ctx.moveTo(196, 424)
  ctx.quadraticCurveTo(212, 412, 220, 398)
  ctx.stroke()
  if (!state.flags.keyTaken) {
    const k = (Math.sin(t * 1.2) + 1) / 2
    ctx.fillStyle = `rgba(255,236,150,${0.65 + k * 0.3})`
    ctx.fillRect(205, 430, 3, 3)
    ctx.fillRect(203, 432, 7, 1)
    ctx.fillRect(206, 428, 1, 7)
  }

  // rusty pipe leaning on the wall
  if (!state.flags.pipeTaken) {
    ctx.save()
    ctx.translate(826, 524)
    ctx.rotate(-0.2)
    const pg = ctx.createLinearGradient(-10, 0, 10, 0)
    pg.addColorStop(0, '#6a3f26')
    pg.addColorStop(0.45, '#b87a4a')
    pg.addColorStop(1, '#5a341f')
    ctx.fillStyle = pg
    ctx.fillRect(-10, -118, 20, 118)
    ctx.fillStyle = '#4a2a18'
    ctx.fillRect(-12, -122, 24, 8)
    ctx.fillRect(-12, -30, 24, 6)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(90,110,125,0.25)'
    ctx.fillRect(812, 420, 6, 100)
  }
  // snowdrift against the wall base
  ctx.fillStyle = '#e6eef3'
  ctx.beginPath()
  ctx.moveTo(520, 500)
  for (let x = 520; x <= 900; x += 20) ctx.lineTo(x, 486 + Math.sin(x * 0.05) * 6)
  ctx.lineTo(900, 520)
  ctx.lineTo(520, 520)
  ctx.fill()

  drawSnow(t)
  vignette(0.5)
}

function drawLobbyBg() {
  const t = T()
  // back wall: green-grey paint, peeling, with a dark wainscot
  skyGradient('#2e3228', '#3c4234', 470)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 3, 470)
  ctx.fillStyle = '#2a2a22'
  ctx.fillRect(0, 330, W, 140)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, 330, W, 3)
  for (let x = 0; x < W; x += 96) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 8, 344, 80, 112)
  }
  // peeling patches
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = 'rgba(70,64,48,0.55)'
    ctx.beginPath()
    ctx.ellipse(60 + hash(i, 1) * 840, 40 + hash(i, 2) * 240, 18 + hash(i, 3) * 26, 10 + hash(i, 4) * 14, hash(i, 5), 0, Math.PI * 2)
    ctx.fill()
  }
  // floor tiles in perspective
  const fg = ctx.createLinearGradient(0, 470, 0, H)
  fg.addColorStop(0, '#4a4636')
  fg.addColorStop(1, '#2a281e')
  ctx.fillStyle = fg
  ctx.fillRect(0, 470, W, H - 470)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 5; i++) {
    const y = 470 + i * i * 4 + i * 12
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  for (let i = -8; i <= 18; i++) {
    ctx.beginPath()
    ctx.moveTo(480 + (i - 5) * 30, 470)
    ctx.lineTo(480 + (i - 5) * 90, H)
    ctx.stroke()
  }
  // red banner
  ctx.fillStyle = '#7a2424'
  ctx.fillRect(470, 30, 110, 150)
  ctx.fillStyle = '#5a1818'
  ctx.beginPath()
  ctx.moveTo(470, 180)
  ctx.lineTo(525, 160)
  ctx.lineTo(580, 180)
  ctx.lineTo(580, 190)
  ctx.lineTo(470, 190)
  ctx.fill()
  ctx.fillStyle = '#d8b83a'
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 9 : 22
    ctx.lineTo(525 + Math.cos(a) * r, 90 + Math.sin(a) * r)
  }
  ctx.fill()

  // hanging lamp (steady)
  const fl = 1
  ctx.strokeStyle = '#1a1a16'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(330, 0)
  ctx.lineTo(330, 60)
  ctx.stroke()
  ctx.fillStyle = '#3a3a30'
  ctx.beginPath()
  ctx.moveTo(310, 78)
  ctx.lineTo(350, 78)
  ctx.lineTo(342, 60)
  ctx.lineTo(318, 60)
  ctx.fill()
  const lg = ctx.createRadialGradient(330, 84, 4, 330, 200, 260)
  lg.addColorStop(0, `rgba(255,225,150,${0.55 * fl})`)
  lg.addColorStop(1, 'rgba(255,225,150,0)')
  ctx.fillStyle = lg
  ctx.fillRect(60, 60, 540, 440)
  ctx.fillStyle = `rgba(255,240,190,${fl})`
  ctx.fillRect(320, 78, 20, 5)

  // desk + drawer + lamp
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(430, 498, 120, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  rr(320, 400, 220, 14, 3, '#6a4a30', '#2a1a10', 1.5)
  ctx.fillStyle = '#5a3f2a'
  ctx.fillRect(330, 414, 200, 76)
  ctx.strokeStyle = '#2a1a10'
  ctx.lineWidth = 2
  ctx.strokeRect(330, 414, 200, 76)
  const open = state.flags.drawerOpened
  ctx.fillStyle = open ? '#1a0f08' : '#4a3220'
  ctx.fillRect(350, 430, 160, 34)
  ctx.strokeRect(350, 430, 160, 34)
  if (open) {
    ctx.fillStyle = '#3a2818'
    ctx.fillRect(350, 462, 160, 8)
  }
  ctx.fillStyle = '#c9a227'
  ctx.beginPath()
  ctx.arc(430, 447, 4, 0, Math.PI * 2)
  ctx.fill()
  // papers, mug and a banker's lamp on the desk
  ctx.fillStyle = '#d8d0b0'
  ctx.save()
  ctx.translate(380, 398)
  ctx.rotate(-0.08)
  ctx.fillRect(-24, -6, 48, 8)
  ctx.restore()
  rr(470, 382, 14, 18, 3, '#9a9aa4')
  ctx.fillStyle = '#2a3a2a'
  ctx.fillRect(500, 396, 26, 6)
  ctx.beginPath()
  ctx.moveTo(500, 396)
  ctx.quadraticCurveTo(512, 366, 528, 372)
  ctx.lineTo(522, 380)
  ctx.quadraticCurveTo(512, 378, 508, 396)
  ctx.fill()
  // chair
  ctx.fillStyle = '#3a2a1c'
  ctx.fillRect(405, 470, 50, 8)
  ctx.fillRect(425, 478, 10, 20)

  // photograph frame: a signpost with a half-erased year
  ctx.save()
  ctx.translate(616, 136)
  ctx.scale(0.85, 0.85)
  ctx.translate(-656, -136)
  rr(656, 136, 138, 108, 4, '#2a2016', '#120c06')
  ctx.fillStyle = '#b8a888'
  ctx.fillRect(666, 146, 118, 88)
  const pg = ctx.createLinearGradient(0, 146, 0, 234)
  pg.addColorStop(0, '#a8b8c0')
  pg.addColorStop(1, '#7a8a8a')
  ctx.fillStyle = pg
  ctx.fillRect(666, 146, 118, 60)
  ctx.fillStyle = '#4a5a4a'
  for (const x of [680, 764]) pine(x, 206, 0.45, '#3a4a40')
  ctx.fillStyle = '#6a5a3a'
  ctx.fillRect(722, 178, 4, 30)
  rr(698, 160, 52, 24, 2, '#d8d0b0', '#4a3a20', 1.5)
  ctx.fillStyle = '#3a2a1a'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('19■■', 724, 177)
  ctx.fillStyle = '#7a6a48'
  ctx.fillRect(666, 206, 118, 28)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(666, 146, 118, 6)

  ctx.restore()

  // safe
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(160, 392, 70, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  const sg = ctx.createLinearGradient(100, 0, 220, 0)
  sg.addColorStop(0, '#3a424c')
  sg.addColorStop(0.5, '#4e5864')
  sg.addColorStop(1, '#2e353d')
  rr(100, 230, 120, 160, 6, sg, '#0e1216', 3)
  rr(110, 240, 100, 140, 4, null, 'rgba(255,255,255,0.12)', 1.5)
  if (state.flags.safeOpened) {
    ctx.fillStyle = '#0e1216'
    ctx.fillRect(110, 240, 100, 140)
    ctx.fillStyle = '#1a2026'
    ctx.beginPath()
    ctx.moveTo(110, 240)
    ctx.lineTo(80, 262)
    ctx.lineTo(80, 368)
    ctx.lineTo(110, 380)
    ctx.fill()
  } else {
    ctx.fillStyle = '#6a7580'
    ctx.beginPath()
    ctx.arc(160, 300, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1e242a'
    ctx.lineWidth = 2
    ctx.stroke()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(160 + Math.cos(a) * 20, 300 + Math.sin(a) * 20)
      ctx.lineTo(160 + Math.cos(a) * 25, 300 + Math.sin(a) * 25)
      ctx.stroke()
    }
    ctx.fillStyle = '#2a3038'
    ctx.beginPath()
    ctx.arc(160, 300, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d83a2a'
    ctx.fillRect(158, 276, 4, 8)
    // keypad plate
    rr(130, 336, 60, 34, 3, '#1e242a', '#555')
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#8a95a0'
      ctx.fillRect(136 + (i % 3) * 18, 341 + Math.floor(i / 3) * 13, 12, 8)
    }
  }

  // elevator
  rr(750, 140, 180, 380, 4, '#454e55', '#1a1e22', 3)
  rr(766, 158, 148, 340, 2, '#242a2e', '#141719', 2)
  const powered = state.flags.elevatorPowered
  const ex = powered ? 28 : 0
  ctx.fillStyle = '#3c454c'
  ctx.fillRect(768, 160, 72 - ex, 336)
  ctx.fillRect(840 + ex, 160, 72 - ex, 336)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(768, 160, 6, 336)
  ctx.fillRect(840 + ex, 160, 6, 336)
  ctx.strokeStyle = '#141719'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(840, 160)
  ctx.lineTo(840, 496)
  ctx.stroke()
  // call panel + card reader + floor lights
  rr(932, 280, 20, 60, 3, '#2a3036', '#111')
  const blink = powered ? '#4dff88' : '#e04545'
  ctx.fillStyle = blink
  ctx.beginPath()
  ctx.arc(942, 296, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4da6ff'
  ctx.fillRect(936, 312, 12, 16)
  rr(838, 118, 40, 18, 3, '#14181c', '#555', 1.5)
  ctx.fillStyle = powered ? '#4dff88' : '#7a2a2a'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(powered ? 'B1' : '--', 858, 131)

  // dust motes in the lamp light
  for (let i = 0; i < 26; i++) {
    const x = 120 + hash(i, 1) * 420 + Math.sin(t * 0.4 + i) * 14
    const y = (hash(i, 2) * 400 + t * (6 + hash(i, 3) * 6)) % 400 + 80
    ctx.fillStyle = `rgba(255,240,200,${0.15 + hash(i, 4) * 0.3})`
    ctx.fillRect(x, y, 2, 2)
  }
  vignette(0.6)
}

function drawLabBg() {
  const t = T()
  skyGradient('#08171a', '#122c2c', H)
  // ribbed ceiling, pipes and hanging cables
  ctx.fillStyle = '#0a1a1c'
  ctx.fillRect(0, 0, W, 70)
  ctx.strokeStyle = '#1e3c3a'
  ctx.lineWidth = 3
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 70)
    ctx.stroke()
  }
  ctx.strokeStyle = '#2a4a46'
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(0, 96)
  ctx.lineTo(W, 96)
  ctx.moveTo(70, 96)
  ctx.lineTo(70, 500)
  ctx.moveTo(890, 96)
  ctx.lineTo(890, 500)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 92)
  ctx.lineTo(W, 92)
  ctx.stroke()
  ctx.strokeStyle = '#0a1214'
  ctx.lineWidth = 3
  for (const [x, len] of [[200, 80], [330, 120], [640, 100], [760, 70]]) {
    ctx.beginPath()
    ctx.moveTo(x, 100)
    ctx.quadraticCurveTo(x + 14, 100 + len * 0.6 + Math.sin(t + x) * 3, x + 4, 100 + len)
    ctx.stroke()
  }
  // wall monitors with scrolling text
  for (const [x, y, w, h] of [[130, 150, 130, 90], [700, 150, 130, 90], [130, 300, 130, 70], [700, 300, 130, 70]]) {
    rr(x - 6, y - 6, w + 12, h + 12, 4, '#1a2a2a', '#3a5a56', 1.5)
    ctx.fillStyle = '#04100e'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(100,255,200,0.7)'
    for (let i = 0; i < 6; i++) {
      const ly = y + 8 + ((i * 14 + t * 20) % (h - 8))
      const lw = 20 + hash(i, x) * (w - 50)
      ctx.fillRect(x + 8, ly, lw, 2.4)
    }
    ctx.fillStyle = 'rgba(100,255,200,0.06)'
    ctx.fillRect(x, y, w, h)
  }
  // floor with a glowing ring
  const fg = ctx.createLinearGradient(0, 470, 0, H)
  fg.addColorStop(0, '#12302c')
  fg.addColorStop(1, '#0a1c1a')
  ctx.fillStyle = fg
  ctx.fillRect(0, 470, W, H - 470)
  ctx.strokeStyle = 'rgba(100,255,210,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(480, 470, 170, 28, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(100,255,210,0.15)'
  ctx.beginPath()
  ctx.ellipse(480, 470, 210, 36, 0, 0, Math.PI * 2)
  ctx.stroke()

  // central device
  const pulse = 0.85 + Math.sin(t * 0.9) * 0.08
  const glow = ctx.createRadialGradient(480, 300, 10, 480, 300, 220)
  glow.addColorStop(0, `rgba(120,255,220,${0.6 * pulse})`)
  glow.addColorStop(1, 'rgba(120,255,220,0)')
  ctx.fillStyle = glow
  ctx.fillRect(250, 80, 460, 420)
  rr(396, 380, 168, 90, 6, '#243634', '#0a1412', 3)
  ctx.fillStyle = '#10201e'
  ctx.fillRect(410, 392, 140, 14)
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i === Math.floor(t * 3) % 7 ? '#7dffd4' : '#2a5a4c'
    ctx.fillRect(418 + i * 19, 396, 11, 6)
  }
  ctx.fillStyle = '#2a403c'
  ctx.fillRect(468, 300, 24, 82)
  ctx.save()
  ctx.translate(480, 262)
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.rotate(t * (0.8 + i * 0.5) * (i % 2 ? -1 : 1) + i)
    ctx.strokeStyle = `rgba(125,255,212,${0.75 - i * 0.12})`
    ctx.lineWidth = 4 - i
    ctx.beginPath()
    ctx.ellipse(0, 0, 70 - i * 10, 24 + i * 12, 0, 0, Math.PI * 1.55)
    ctx.stroke()
    ctx.restore()
  }
  const og = ctx.createRadialGradient(0, 0, 2, 0, 0, 34)
  og.addColorStop(0, '#ffffff')
  og.addColorStop(0.3, '#9dffe2')
  og.addColorStop(1, 'rgba(60,200,170,0)')
  ctx.fillStyle = og
  ctx.beginPath()
  ctx.arc(0, 0, 30 + Math.sin(t * 1.2) * 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // sparks
  for (let i = 0; i < 12; i++) {
    const ph = (t * 0.8 + hash(i, 1)) % 1
    const a = hash(i, 2) * Math.PI * 2
    ctx.fillStyle = `rgba(160,255,230,${1 - ph})`
    ctx.fillRect(480 + Math.cos(a) * (30 + ph * 90), 262 + Math.sin(a) * (20 + ph * 60), 2.5, 2.5)
  }
  // steam from the floor grates
  for (const gx of [220, 740]) {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.3 + i * 0.25 + gx) % 1
      ctx.fillStyle = `rgba(200,240,235,${(1 - ph) * 0.18})`
      ctx.beginPath()
      ctx.arc(gx + Math.sin(ph * 5 + i) * 10, 500 - ph * 120, 10 + ph * 22, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  vignette(0.6)
}

function drawCompletedOverlay() {
  if (!state.completed) return
  ctx.fillStyle = 'rgba(4,10,10,0.86)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#e8fff8'
  ctx.textAlign = 'center'
  ctx.font = 'bold 16px sans-serif'
  const lines = ENDING_TEXT.split('\n')
  let y = 110
  for (const line of lines) {
    ctx.fillText(line, W / 2, y)
    y += 27
  }
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#9fd4e0'
  ctx.fillText('(화면을 클릭하면 다시 시작합니다)', W / 2, H - 30)
}

function drawTitleCard() {
  if (state.started) return
  const t = T()
  ctx.fillStyle = 'rgba(4,8,14,0.72)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.font = 'bold 60px sans-serif'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 9
  ctx.strokeStyle = 'rgba(8,40,60,0.9)'
  ctx.strokeText('퉁구스카의 비밀', W / 2, 232)
  const g = ctx.createLinearGradient(0, 180, 0, 240)
  g.addColorStop(0, '#f2fcff')
  g.addColorStop(1, '#7fcbe8')
  ctx.fillStyle = g
  ctx.fillText('퉁구스카의 비밀', W / 2, 232)
  ctx.font = '17px sans-serif'
  ctx.fillStyle = '#b8d8e4'
  ctx.fillText('1908년 시베리아, 하늘에서 떨어진 "그것"의 기록.', W / 2, 278)
  ctx.fillText('눈보라 속 버려진 소련 연구 기지에 들어가 진실을 찾아라.', W / 2, 304)
  ctx.globalAlpha = 0.75 + Math.sin(t * 1.5) * 0.25
  ctx.font = 'bold 19px sans-serif'
  ctx.fillStyle = '#ffd86a'
  ctx.fillText('화면을 클릭해 시작', W / 2, 376)
  ctx.globalAlpha = 1
  if (readSave()) {
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = '#9fe8c8'
    ctx.fillText('C 키: 이어하기', W / 2, 410)
  }
}

function render() {
  const t = T()
  // scene swap in the middle of a fade
  if (fade.t < 1) {
    const prev = fade.t
    fade.t = Math.min(1, fade.t + 1 / 30)
    if (prev < 0.5 && fade.t >= 0.5 && fade.target) {
      state.scene = fade.target
      fade.target = null
      syncUI()
    }
  }
  // typewriter for the message box
  if (typed < state.message.length) {
    const before = Math.floor(typed)
    typed = Math.min(state.message.length, typed + 1.1)
    if (Math.floor(typed) > before && Math.floor(typed) % 3 === 0) sfx.blip(340)
    document.getElementById('message').textContent = state.message.slice(0, Math.floor(typed))
  }
  const scene = SCENES[state.scene]
  scene.draw()
  if (state.started) drawHotspotHighlights()
  drawCompletedOverlay()
  drawTitleCard()
  if (fade.t < 1) {
    const a = fade.t < 0.5 ? fade.t * 2 : (1 - fade.t) * 2
    ctx.fillStyle = `rgba(0,0,0,${a})`
    ctx.fillRect(0, 0, W, H)
  }
  void t
  requestAnimationFrame(render)
}

syncUI()
requestAnimationFrame(render)

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'm') {
    unlockSfx()
    const muted = toggleMute()
    setMessage(muted ? '소리 끔 (M으로 다시 켜기)' : '소리 켬')
    syncUI()
  }
})
