// Small SimCity-style city builder: zone residential/commercial/industrial
// blocks, connect them with roads, keep them powered and watered, and
// balance the tax rate against upkeep. Zoned tiles grow into buildings on
// their own every "month" based on city-wide demand. No images/audio -
// everything is Canvas 2D shapes.

const TILE = 24
const COLS = 50
const ROWS = 34

const VIEW_W = 720
const VIEW_H = 480
const TOOLBAR_H = 80
const HUD_H = 46

const WORLD_W = COLS * TILE
const WORLD_H = ROWS * TILE

const POP_BY_LEVEL = [0, 12, 28, 50]
const JOBS_BY_LEVEL = [0, 10, 22, 40]
const MAX_LEVEL = POP_BY_LEVEL.length - 1

const ROAD_COST = 10
const ZONE_COST = 20
const POWER_COST = 600
const WATER_COST = 350
const BULLDOZE_COST = 5
const POWER_RADIUS = 9
const WATER_RADIUS = 7
const TICK_SECONDS = 3
const DEFICIT_FREEZE = -500

const ZONE_COLORS = {
  res: ['#2f4a2b', '#3f7a3d', '#4f9a4a', '#5fc258'],
  com: ['#1f3550', '#2a5a8a', '#3a7ac0', '#4f9ce8'],
  ind: ['#4a3a1f', '#7a5f2a', '#a3802f', '#c9a03a'],
}

const TOOLS = [
  { id: 'road', label: '도로', cost: ROAD_COST, key: '1', color: '#555' },
  { id: 'res', label: '주거구역', cost: ZONE_COST, key: '2', color: ZONE_COLORS.res[1] },
  { id: 'com', label: '상업구역', cost: ZONE_COST, key: '3', color: ZONE_COLORS.com[1] },
  { id: 'ind', label: '공업구역', cost: ZONE_COST, key: '4', color: ZONE_COLORS.ind[1] },
  { id: 'power', label: '발전소', cost: POWER_COST, key: '5', color: '#e0c040' },
  { id: 'water', label: '급수탑', cost: WATER_COST, key: '6', color: '#4098d0' },
  { id: 'bulldoze', label: '철거', cost: BULLDOZE_COST, key: '7', color: '#b04040' },
]

function makeTile() {
  return { type: 'empty', level: 0 }
}

const tiles = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => makeTile()))

const CENTER_ROW = 17
const CENTER_COL = 25
tiles[CENTER_ROW][CENTER_COL] = { type: 'cityhall', level: 0 }
for (let c = CENTER_COL - 3; c <= CENTER_COL + 3; c++) tiles[CENTER_ROW + 1][c] = { type: 'road', level: 0 }

const state = {
  phase: 'title', // title -> intro -> play
  camX: Math.max(0, CENTER_COL * TILE - VIEW_W / 2),
  camY: Math.max(0, CENTER_ROW * TILE - VIEW_H / 2),
  tool: 'road',
  treasury: 5000,
  taxRate: 9,
  month: 0,
  population: 0,
  demand: { res: 20, com: 10, ind: 10 },
  lastIncome: 0,
  lastExpense: 0,
  paused: false,
  milestonesHit: new Set(),
  hover: null, // { row, col } in map viewport, or null
  painting: false,
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

state.camX = clamp(state.camX, 0, WORLD_W - VIEW_W)
state.camY = clamp(state.camY, 0, WORLD_H - VIEW_H)

// ---------- Toast ----------
let toastText = ''
let toastTimer = 0
const TOAST_DURATION = 2.8
function say(text) {
  toastText = text
  toastTimer = TOAST_DURATION
}

// ---------- Canvas ----------
const canvas = document.getElementById('game')
canvas.width = VIEW_W
canvas.height = VIEW_H + TOOLBAR_H
const ctx = canvas.getContext('2d')

// ---------- Sim helpers ----------
function inBounds(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS
}

function hasRoadAdjacent(row, col) {
  const nbs = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
  for (const [r, c] of nbs) {
    if (inBounds(r, c) && tiles[r][c].type === 'road') return true
  }
  return false
}

function collectBuildings(type) {
  const list = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tiles[r][c].type === type) list.push({ row: r, col: c })
    }
  }
  return list
}

function isCovered(row, col, buildings, radius) {
  for (const b of buildings) {
    const d = Math.hypot(b.row - row, b.col - col)
    if (d <= radius) return true
  }
  return false
}

function tick() {
  state.month += 1
  let resCap = 0
  let comCap = 0
  let indCap = 0
  let roadCount = 0
  const powerPlants = collectBuildings('power')
  const waterTowers = collectBuildings('water')

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      if (t.type === 'road') roadCount++
      else if (t.type === 'res') resCap += POP_BY_LEVEL[t.level]
      else if (t.type === 'com') comCap += JOBS_BY_LEVEL[t.level]
      else if (t.type === 'ind') indCap += JOBS_BY_LEVEL[t.level]
    }
  }

  state.population = resCap
  const jobs = comCap + indCap
  state.demand = {
    res: clamp(jobs - resCap + 20 - state.taxRate * 1.5, -100, 100),
    com: clamp(resCap * 0.5 - comCap * 2 + 10 - state.taxRate, -100, 100),
    ind: clamp(resCap * 0.5 - indCap * 2 + 10 - state.taxRate, -100, 100),
  }

  const income = Math.round((resCap * 1.2 + comCap + indCap) * (state.taxRate / 100))
  const expense = Math.round(roadCount * 0.5 + powerPlants.length * 40 + waterTowers.length * 25)
  state.treasury += income - expense
  state.lastIncome = income
  state.lastExpense = expense

  const frozen = state.treasury < DEFICIT_FREEZE
  if (!frozen) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = tiles[r][c]
        if (t.type !== 'res' && t.type !== 'com' && t.type !== 'ind') continue
        if (t.level >= MAX_LEVEL) continue
        const demand = state.demand[t.type]
        if (demand <= 0) continue
        if (!hasRoadAdjacent(r, c)) continue
        if (!isCovered(r, c, powerPlants, POWER_RADIUS)) continue
        if (!isCovered(r, c, waterTowers, WATER_RADIUS)) continue
        const chance = clamp(demand / 100, 0, 1) * 0.35
        if (Math.random() < chance) t.level += 1
      }
    }
  }

  for (const m of [50, 100, 250, 500, 1000]) {
    if (state.population >= m && !state.milestonesHit.has(m)) {
      state.milestonesHit.add(m)
      say(`인구 ${m}명을 달성했습니다!`)
    }
  }
}

// ---------- Placement ----------
function place(row, col, toolId) {
  if (!inBounds(row, col)) return
  const t = tiles[row][col]
  if (t.type === 'cityhall') {
    say('시청은 철거할 수 없어요.')
    return
  }

  if (toolId === 'bulldoze') {
    if (t.type === 'empty') return
    if (state.treasury < BULLDOZE_COST) {
      say('자금이 부족해요.')
      return
    }
    state.treasury -= BULLDOZE_COST
    tiles[row][col] = makeTile()
    return
  }

  if (t.type !== 'empty') return // all other tools need an empty tile
  const tool = TOOLS.find((x) => x.id === toolId)
  if (state.treasury < tool.cost) {
    say('자금이 부족해요.')
    return
  }
  state.treasury -= tool.cost
  if (toolId === 'road') tiles[row][col] = { type: 'road', level: 0 }
  else if (toolId === 'res') tiles[row][col] = { type: 'res', level: 0 }
  else if (toolId === 'com') tiles[row][col] = { type: 'com', level: 0 }
  else if (toolId === 'ind') tiles[row][col] = { type: 'ind', level: 0 }
  else if (toolId === 'power') tiles[row][col] = { type: 'power', level: 0 }
  else if (toolId === 'water') tiles[row][col] = { type: 'water', level: 0 }
}

// ---------- Input ----------
const heldKeys = new Set()
const MOVE_KEYS = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
}
function held(names) {
  return names.some((k) => heldKeys.has(k))
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  heldKeys.add(key)

  if (state.phase === 'title') {
    if (key === ' ' || key === 'enter') state.phase = 'intro'
    return
  }
  if (state.phase === 'intro') {
    if (key === ' ' || key === 'enter') state.phase = 'play'
    return
  }

  const toolByKey = TOOLS.find((t) => t.key === key)
  if (toolByKey) state.tool = toolByKey.id
  else if (key === ' ') {
    state.paused = !state.paused
    say(state.paused ? '일시정지' : '재개')
  } else if (key === '-' || key === '_') {
    state.taxRate = clamp(state.taxRate - 1, 0, 20)
  } else if (key === '=' || key === '+') {
    state.taxRate = clamp(state.taxRate + 1, 0, 20)
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

function updateCamera(dt) {
  let dx = 0
  let dy = 0
  if (held(MOVE_KEYS.left)) dx -= 1
  if (held(MOVE_KEYS.right)) dx += 1
  if (held(MOVE_KEYS.up)) dy -= 1
  if (held(MOVE_KEYS.down)) dy += 1
  if (dx === 0 && dy === 0) return
  const speed = 320
  state.camX = clamp(state.camX + dx * speed * dt, 0, Math.max(0, WORLD_W - VIEW_W))
  state.camY = clamp(state.camY + dy * speed * dt, 0, Math.max(0, WORLD_H - VIEW_H))
}

function eventPos(e) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

function toolbarIndexAt(x) {
  const idx = Math.floor(x / (VIEW_W / TOOLS.length))
  return idx >= 0 && idx < TOOLS.length ? idx : -1
}

function handlePointerDown(e) {
  const { x, y } = eventPos(e)
  if (state.phase === 'title') {
    state.phase = 'intro'
    return
  }
  if (state.phase === 'intro') {
    state.phase = 'play'
    return
  }
  if (y >= VIEW_H) {
    const idx = toolbarIndexAt(x)
    if (idx >= 0) state.tool = TOOLS[idx].id
    return
  }
  state.painting = true
  const col = Math.floor((x + state.camX) / TILE)
  const row = Math.floor((y + state.camY) / TILE)
  place(row, col, state.tool)
}

function handlePointerMove(e) {
  const { x, y } = eventPos(e)
  if (y >= VIEW_H || state.phase !== 'play') {
    state.hover = null
  } else {
    const col = Math.floor((x + state.camX) / TILE)
    const row = Math.floor((y + state.camY) / TILE)
    state.hover = inBounds(row, col) ? { row, col } : null
    if (state.painting) place(row, col, state.tool)
  }
}

function handlePointerUp() {
  state.painting = false
}

canvas.addEventListener('mousedown', handlePointerDown)
canvas.addEventListener('mousemove', handlePointerMove)
window.addEventListener('mouseup', handlePointerUp)
canvas.addEventListener('mouseleave', () => {
  state.hover = null
})

// ---------- Draw ----------
function drawMap() {
  const startCol = Math.max(0, Math.floor(state.camX / TILE))
  const endCol = Math.min(COLS, Math.ceil((state.camX + VIEW_W) / TILE))
  const startRow = Math.max(0, Math.floor(state.camY / TILE))
  const endRow = Math.min(ROWS, Math.ceil((state.camY + VIEW_H) / TILE))

  const powerPlants = collectBuildings('power')
  const waterTowers = collectBuildings('water')

  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const t = tiles[r][c]
      const x = c * TILE - state.camX
      const y = r * TILE - state.camY
      let color = '#3f5c38'
      if (t.type === 'road') color = '#555555'
      else if (t.type === 'cityhall') color = '#c9a86a'
      else if (t.type === 'power') color = '#e0c040'
      else if (t.type === 'water') color = '#4098d0'
      else if (t.type === 'res') color = ZONE_COLORS.res[t.level]
      else if (t.type === 'com') color = ZONE_COLORS.com[t.level]
      else if (t.type === 'ind') color = ZONE_COLORS.ind[t.level]
      ctx.fillStyle = color
      ctx.fillRect(x, y, TILE, TILE)
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)

      if (t.type === 'cityhall') {
        ctx.fillStyle = '#5c431c'
        ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('시청', x + TILE / 2, y + TILE / 2 + 3)
      } else if (t.type === 'power') {
        ctx.fillStyle = '#5c431c'
        ctx.beginPath()
        ctx.moveTo(x + TILE / 2, y + 2)
        ctx.lineTo(x + TILE - 4, y + TILE / 2)
        ctx.lineTo(x + TILE / 2 + 2, y + TILE / 2)
        ctx.lineTo(x + TILE / 2, y + TILE - 2)
        ctx.lineTo(x + 4, y + TILE / 2)
        ctx.lineTo(x + TILE / 2 - 2, y + TILE / 2)
        ctx.closePath()
        ctx.fill()
      } else if (t.type === 'water') {
        ctx.fillStyle = '#1c5a85'
        ctx.beginPath()
        ctx.arc(x + TILE / 2, y + TILE / 2, TILE * 0.3, 0, Math.PI * 2)
        ctx.fill()
      } else if ((t.type === 'res' || t.type === 'com' || t.type === 'ind') && t.level > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        const h = 4 + t.level * 4
        ctx.fillRect(x + 4, y + TILE - h - 2, TILE - 8, h)
      }

      if (t.type === 'res' || t.type === 'com' || t.type === 'ind') {
        const powered = isCovered(r, c, powerPlants, POWER_RADIUS)
        const watered = isCovered(r, c, waterTowers, WATER_RADIUS)
        const roaded = hasRoadAdjacent(r, c)
        if (!powered || !watered || !roaded) {
          ctx.fillStyle = '#ff5050'
          ctx.beginPath()
          ctx.arc(x + TILE - 5, y + 5, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }
}

function drawHoverPreview() {
  if (!state.hover) return
  const { row, col } = state.hover
  const x = col * TILE - state.camX
  const y = row * TILE - state.camY
  ctx.strokeStyle = '#ffe066'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2)

  if (state.tool === 'power' || state.tool === 'water') {
    const radius = state.tool === 'power' ? POWER_RADIUS : WATER_RADIUS
    ctx.strokeStyle = state.tool === 'power' ? 'rgba(224,192,64,0.6)' : 'rgba(64,152,208,0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x + TILE / 2, y + TILE / 2, radius * TILE, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawDemandBar(label, value, x, y, w, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(x, y, w, 8)
  const mid = x + w / 2
  const half = (w / 2) * clamp(value / 100, -1, 1)
  ctx.fillStyle = color
  if (half >= 0) ctx.fillRect(mid, y, half, 8)
  else ctx.fillRect(mid + half, y, -half, 8)
  ctx.fillStyle = '#fff'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(label, x, y - 2)
}

function drawHud() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, VIEW_W, HUD_H)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(`${state.month}개월차`, 10, 18)
  ctx.fillText(`자금 ${state.treasury}`, 90, 18)
  ctx.fillText(`인구 ${state.population}`, 190, 18)
  ctx.font = '12px sans-serif'
  ctx.fillText(`세율 ${state.taxRate}% ( -/= 로 조절 )`, 270, 18)
  if (state.paused) {
    ctx.fillStyle = '#ffe066'
    ctx.fillText('일시정지중 (스페이스)', 430, 18)
  }
  if (state.treasury < DEFICIT_FREEZE) {
    ctx.fillStyle = '#ff6060'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('재정 적자! 개발이 멈췄습니다. 세율을 올리거나 지출을 줄이세요.', 10, 34)
  } else {
    ctx.fillStyle = '#ccc'
    ctx.font = '11px sans-serif'
    ctx.fillText(`이번 달 수입 +${state.lastIncome} · 지출 -${state.lastExpense}`, 10, 34)
  }

  drawDemandBar('R', state.demand.res, 480, 10, 70, '#5fc258')
  drawDemandBar('C', state.demand.com, 560, 10, 70, '#4f9ce8')
  drawDemandBar('I', state.demand.ind, 640, 10, 70, '#c9a03a')
}

function drawToast() {
  if (toastTimer <= 0) return
  const h = 30
  const y = VIEW_H - h
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(0, y, VIEW_W, h)
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(toastText, 12, y + 20)
}

function drawToolbar() {
  const y0 = VIEW_H
  ctx.fillStyle = '#20241d'
  ctx.fillRect(0, y0, VIEW_W, TOOLBAR_H)
  const btnW = VIEW_W / TOOLS.length
  TOOLS.forEach((t, i) => {
    const x = i * btnW
    const selected = state.tool === t.id
    ctx.fillStyle = selected ? '#3a4a30' : '#2a2e24'
    ctx.fillRect(x + 2, y0 + 4, btnW - 4, TOOLBAR_H - 8)
    if (selected) {
      ctx.strokeStyle = '#ffe066'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 3, y0 + 5, btnW - 6, TOOLBAR_H - 10)
    }
    ctx.fillStyle = t.color
    ctx.beginPath()
    ctx.roundRect(x + btnW / 2 - 8, y0 + 10, 16, 16, 3)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`[${t.key}] ${t.label}`, x + btnW / 2, y0 + 44)
    ctx.fillStyle = '#ccc'
    ctx.font = '10px sans-serif'
    ctx.fillText(`${t.cost}`, x + btnW / 2, y0 + 60)
  })
}

function drawTitle() {
  ctx.fillStyle = '#1b2420'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 32px sans-serif'
  ctx.fillText('미니시티 빌더', canvas.width / 2, canvas.height / 2 - 20)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.fillText('클릭 또는 스페이스를 눌러 시작', canvas.width / 2, canvas.height / 2 + 24)
}

function drawIntro() {
  ctx.fillStyle = '#1b2420'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('도시를 운영해보세요', canvas.width / 2, 60)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#fff'
  const lines = [
    '승리 조건은 없어요. 세율과 지출의 균형을 잡으며 도시를 키워가는 게임이에요.',
    '하단 도구에서 도로/주거/상업/공업 구역, 발전소, 급수탑, 철거를 골라 지도를 클릭(드래그 가능)해 배치하세요.',
    '구역은 도로에 붙어 있고, 발전소/급수탑 범위 안에 있어야 수요에 따라 저절로 건물이 들어서고 커집니다.',
    '구역에 빨간 점이 떠 있으면 도로·전기·수도 중 하나가 빠졌다는 뜻이에요.',
    '세율을 올리면 수입은 늘지만 수요(R/C/I 막대)가 줄어요. 지출(발전소·급수탑·도로 유지비)이 수입보다 크면 적자가 쌓여요.',
    '적자가 너무 커지면 개발이 멈춰요. 세율을 조정하거나 지출을 줄여 회복하세요.',
    '',
    '조작: 방향키/WASD 카메라 이동 · 숫자 1-7 또는 하단 버튼으로 도구 선택 · [-]/[=] 세율 · 스페이스 일시정지',
  ]
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 100 + i * 26))
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('클릭 또는 스페이스로 시작', canvas.width / 2, canvas.height - 30)
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (state.phase === 'title') {
    drawTitle()
    return
  }
  if (state.phase === 'intro') {
    drawIntro()
    return
  }
  drawMap()
  drawHoverPreview()
  drawHud()
  drawToast()
  drawToolbar()
}

// ---------- Loop ----------
let lastTime = performance.now()
let tickAccum = 0
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  if (toastTimer > 0) toastTimer -= dt

  if (state.phase === 'play') {
    updateCamera(dt)
    if (!state.paused) {
      tickAccum += dt
      if (tickAccum >= TICK_SECONDS) {
        tickAccum -= TICK_SECONDS
        tick()
      }
    }
  }

  render()
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)
