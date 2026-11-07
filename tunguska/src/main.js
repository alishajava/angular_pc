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
      { id: 'photo', x: 660, y: 140, w: 130, h: 100 },
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
    completed: false,
    hoveredHotspot: null,
  }
}
let state = makeInitialState()

function addItem(id) {
  if (!state.inventory.includes(id)) state.inventory.push(id)
}
function setMessage(msg) { state.message = msg }
function clearActiveItem() { state.activeItem = null }
function goToScene(id) {
  state.scene = id
  state.hoveredHotspot = null
}

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
  if (handler) handler()
  syncUI()
}

canvas.addEventListener('click', (e) => {
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
  const scene = SCENES[state.scene]
  const hit = scene.hotspots.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)
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

function syncUI() {
  renderInventory()
  document.getElementById('message').textContent = state.message
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
  if (codeInput.length >= 4) return
  codeInput += String(d)
  updateCodeDisplay()
}
function onConfirmCode() {
  if (codeInput === '1908') {
    state.flags.safeOpened = true
    addItem('card')
    setMessage('금고가 열렸다! 안에서 전자 출입카드를 발견했다.')
    closeCodeModal()
  } else {
    setMessage('맞지 않는 번호다...')
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
  state = makeInitialState()
  closeCodeModal()
  syncUI()
}
document.getElementById('restart-btn').onclick = restart

// --- Backgrounds (procedural canvas art, no external assets) ---

function drawHotspotOutlines() {
  const scene = SCENES[state.scene]
  for (const h of scene.hotspots) {
    const hovered = state.hoveredHotspot === h.id
    ctx.strokeStyle = hovered ? 'rgba(95,184,217,0.85)' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = hovered ? 3 : 1.5
    ctx.strokeRect(h.x, h.y, h.w, h.h)
  }
}

function skyGradient(topColor, bottomColor, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, bottom)
  g.addColorStop(0, topColor)
  g.addColorStop(1, bottomColor)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, bottom)
}

function drawEntranceBg() {
  skyGradient('#2b3a4a', '#5c6f7e', 300)
  ctx.fillStyle = '#c9d4da'
  ctx.fillRect(0, 300, W, H - 300)

  // concrete bunker facade
  ctx.fillStyle = '#4a5560'
  ctx.fillRect(540, 100, 300, 400)
  ctx.fillStyle = '#3a4550'
  ctx.fillRect(610, 150, 150, 320) // door frame recess
  ctx.fillStyle = '#2a3238'
  ctx.fillRect(620, 160, 130, 300) // door
  ctx.strokeStyle = '#1a2024'
  ctx.lineWidth = 4
  ctx.strokeRect(620, 160, 130, 300)
  ctx.fillStyle = '#6a7580'
  ctx.beginPath()
  ctx.arc(730, 310, 6, 0, Math.PI * 2)
  ctx.fill()

  // frozen flower pot
  ctx.fillStyle = '#7a4a3a'
  ctx.fillRect(150, 460, 80, 50)
  ctx.fillStyle = '#e8f0f2'
  ctx.beginPath()
  ctx.ellipse(190, 455, 50, 18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#3a2a20'
  ctx.lineWidth = 2
  ctx.strokeRect(150, 460, 80, 50)

  // rusty pipe leaning on the wall
  ctx.save()
  ctx.translate(825, 520)
  ctx.rotate(-0.2)
  ctx.fillStyle = '#8a5a3a'
  ctx.fillRect(-10, -110, 20, 110)
  ctx.restore()

  drawSnow()
}

let snowDots = null
function drawSnow() {
  if (!snowDots) {
    snowDots = []
    for (let i = 0; i < 60; i++) {
      snowDots.push({ x: Math.random() * W, y: Math.random() * 300, r: 1 + Math.random() * 2 })
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (const d of snowDots) {
    ctx.beginPath()
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawLobbyBg() {
  skyGradient('#2b2418', '#4a4330', H)
  ctx.fillStyle = '#5a5238'
  ctx.fillRect(0, 480, W, H - 480)

  // desk + drawer
  ctx.fillStyle = '#5a3f2a'
  ctx.fillRect(330, 420, 200, 70)
  ctx.fillStyle = '#3a2818'
  ctx.fillRect(350, 440, 160, 30)
  ctx.fillStyle = '#c9a227'
  ctx.beginPath()
  ctx.arc(430, 455, 4, 0, Math.PI * 2)
  ctx.fill()

  // photograph frame
  ctx.fillStyle = '#2a2016'
  ctx.fillRect(660, 140, 130, 100)
  ctx.fillStyle = '#b8a888'
  ctx.fillRect(670, 150, 110, 80)
  ctx.fillStyle = '#8a7a5a'
  ctx.fillRect(685, 195, 80, 20)

  // safe
  ctx.fillStyle = '#2a3038'
  ctx.fillRect(100, 230, 120, 160)
  ctx.strokeStyle = '#111519'
  ctx.lineWidth = 3
  ctx.strokeRect(100, 230, 120, 160)
  ctx.fillStyle = '#6a7580'
  ctx.beginPath()
  ctx.arc(160, 300, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2a3038'
  ctx.beginPath()
  ctx.arc(160, 300, 8, 0, Math.PI * 2)
  ctx.fill()

  // elevator
  ctx.fillStyle = '#3a4248'
  ctx.fillRect(760, 150, 160, 360)
  ctx.fillStyle = '#242a2e'
  ctx.fillRect(775, 165, 130, 330)
  ctx.strokeStyle = '#141719'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(840, 165)
  ctx.lineTo(840, 495)
  ctx.stroke()
  ctx.fillStyle = state.flags.elevatorPowered ? '#4dff88' : '#ff4d4d'
  ctx.beginPath()
  ctx.arc(900, 200, 6, 0, Math.PI * 2)
  ctx.fill()
}

function drawLabBg() {
  skyGradient('#0e2622', '#1c3a32', H)
  ctx.fillStyle = '#16302a'
  ctx.fillRect(0, 480, W, H - 480)

  // pipes decoration
  ctx.strokeStyle = '#2a4a40'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(0, 80)
  ctx.lineTo(W, 80)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(60, 80)
  ctx.lineTo(60, 480)
  ctx.stroke()

  // central device
  const glow = ctx.createRadialGradient(480, 310, 10, 480, 310, 160)
  glow.addColorStop(0, 'rgba(120,255,220,0.55)')
  glow.addColorStop(1, 'rgba(120,255,220,0)')
  ctx.fillStyle = glow
  ctx.fillRect(320, 150, 320, 320)

  ctx.fillStyle = '#3a4a48'
  ctx.fillRect(400, 300, 160, 120)
  ctx.fillStyle = '#2a3a38'
  ctx.beginPath()
  ctx.arc(480, 280, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#7dffd4'
  ctx.beginPath()
  ctx.arc(480, 280, 26, 0, Math.PI * 2)
  ctx.fill()
}

function drawCompletedOverlay() {
  if (!state.completed) return
  ctx.fillStyle = 'rgba(5,10,10,0.82)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px sans-serif'
  const lines = ENDING_TEXT.split('\n')
  let y = 120
  for (const line of lines) {
    ctx.fillText(line, W / 2, y)
    y += 26
  }
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#9fd4e0'
  ctx.fillText('(화면을 클릭하면 다시 시작합니다)', W / 2, H - 30)
}

function render() {
  const scene = SCENES[state.scene]
  scene.draw()
  drawHotspotOutlines()
  drawCompletedOverlay()
  requestAnimationFrame(render)
}

syncUI()
requestAnimationFrame(render)
