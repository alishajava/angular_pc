import { sfx, unlockSfx, toggleMute } from './sfx.js'

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

// 간단 버전: 전기·수도·세금·적자 없음. 도로 옆에 구역을 지정하면 알아서 커진다.
const ROAD_COST = 5
const ZONE_COST = 10
const BULLDOZE_COST = 0
const TICK_SECONDS = 2

const ZONE_COLORS = {
  res: ['#2f4a2b', '#3f7a3d', '#4f9a4a', '#5fc258'],
  com: ['#1f3550', '#2a5a8a', '#3a7ac0', '#4f9ce8'],
  ind: ['#4a3a1f', '#7a5f2a', '#a3802f', '#c9a03a'],
}

const TOOLS = [
  { id: 'road', label: '도로', cost: ROAD_COST, key: '1', color: '#555' },
  { id: 'res', label: '집', cost: ZONE_COST, key: '2', color: ZONE_COLORS.res[1] },
  { id: 'com', label: '가게', cost: ZONE_COST, key: '3', color: ZONE_COLORS.com[1] },
  { id: 'ind', label: '공장', cost: ZONE_COST, key: '4', color: ZONE_COLORS.ind[1] },
  { id: 'bulldoze', label: '철거', cost: BULLDOZE_COST, key: '5', color: '#b04040' },
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
  treasury: 1000,
  month: 0,
  population: 0,
  lastIncome: 0,
  tip: '',
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
let lastBadSfx = 0
function sfxBad() {
  const now = performance.now()
  if (now - lastBadSfx < 700) return
  lastBadSfx = now
  sfx.bad()
}

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

function tick() {
  state.month += 1
  let resCap = 0
  let comCap = 0
  let indCap = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      if (t.type === 'res') resCap += POP_BY_LEVEL[t.level]
      else if (t.type === 'com') comCap += JOBS_BY_LEVEL[t.level]
      else if (t.type === 'ind') indCap += JOBS_BY_LEVEL[t.level]
    }
  }
  state.population = resCap

  // 수입: 사람이 많고 가게·공장이 있을수록 늘어난다 (지출은 없음)
  const income = Math.round(resCap * 0.5 + (comCap + indCap) * 0.4)
  state.treasury += income
  state.lastIncome = income

  // 도로에 붙은 구역은 매달 높은 확률로 한 단계씩 자란다
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      if (t.type !== 'res' && t.type !== 'com' && t.type !== 'ind') continue
      if (t.level >= MAX_LEVEL) continue
      if (!hasRoadAdjacent(r, c)) continue
      if (Math.random() < 0.45) t.level += 1
    }
  }

  // 다음에 뭘 하면 좋을지 알려주는 한 줄 도우미
  let counts = { res: 0, com: 0, ind: 0 }
  let unroaded = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      if (counts[t.type] !== undefined) {
        counts[t.type]++
        if (!hasRoadAdjacent(r, c)) unroaded++
      }
    }
  }
  if (counts.res + counts.com + counts.ind === 0) state.tip = '도로 옆에 집을 지어 보세요!'
  else if (unroaded > 0) state.tip = '빨간 점은 도로가 안 닿았다는 뜻이에요. 옆에 도로를 이어 주세요.'
  else if (counts.com === 0) state.tip = '가게를 지으면 돈이 더 벌려요.'
  else if (counts.ind === 0) state.tip = '공장도 하나 지어 볼까요?'
  else if (state.treasury < 100) state.tip = '돈이 부족하면 잠깐 기다려요. 달마다 수입이 들어와요.'
  else state.tip = '마음껏 도시를 키워 보세요!'

  for (const m of [50, 100, 250, 500, 1000]) {
    if (state.population >= m && !state.milestonesHit.has(m)) {
      state.milestonesHit.add(m)
      sfx.fanfare()
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
      sfxBad()
      return
    }
    state.treasury -= BULLDOZE_COST
    tiles[row][col] = makeTile()
    sfx.whoosh()
    return
  }

  if (t.type !== 'empty') return // all other tools need an empty tile
  const tool = TOOLS.find((x) => x.id === toolId)
  if (state.treasury < tool.cost) {
    say('자금이 부족해요.')
    sfxBad()
    return
  }
  state.treasury -= tool.cost
  sfx.build()
  if (toolId === 'road') tiles[row][col] = { type: 'road', level: 0 }
  else if (toolId === 'res') tiles[row][col] = { type: 'res', level: 0 }
  else if (toolId === 'com') tiles[row][col] = { type: 'com', level: 0 }
  else if (toolId === 'ind') tiles[row][col] = { type: 'ind', level: 0 }
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
  unlockSfx()

  if (state.phase === 'title') {
    if (key === ' ' || key === 'enter') {
      state.phase = 'intro'
      sfx.click()
    }
    return
  }
  if (state.phase === 'intro') {
    if (key === ' ' || key === 'enter') {
      state.phase = 'play'
      sfx.start()
    }
    return
  }

  const toolByKey = TOOLS.find((t) => t.key === key)
  if (toolByKey) {
    state.tool = toolByKey.id
    sfx.click()
  } else if (key === ' ') {
    state.paused = !state.paused
    say(state.paused ? '일시정지' : '재개')
    sfx.click()
  } else if (key === 'm') {
    say(toggleMute() ? '소리 끔 (M으로 다시 켜기)' : '소리 켬')
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
  unlockSfx()
  if (state.phase === 'title') {
    state.phase = 'intro'
    sfx.click()
    return
  }
  if (state.phase === 'intro') {
    state.phase = 'play'
    sfx.start()
    return
  }
  if (y >= VIEW_H) {
    const idx = toolbarIndexAt(x)
    if (idx >= 0) {
      state.tool = TOOLS[idx].id
      sfx.click()
    }
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
const tHash = (a, b, k = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return v - Math.floor(v)
}
const GRASS_SHADES = ['#3f5c38', '#43623b', '#3b5834', '#476a3e']

function drawGrassTile(x, y, r, c, plain = false) {
  ctx.fillStyle = GRASS_SHADES[Math.floor(tHash(r, c) * 4)]
  ctx.fillRect(x, y, TILE, TILE)
  if (plain) return
  const h = tHash(r, c, 3)
  ctx.strokeStyle = 'rgba(160,215,120,0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const gx = x + 3 + tHash(r, c, 10 + i) * (TILE - 6)
    const gy = y + 6 + tHash(r, c, 20 + i) * (TILE - 8)
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx - 1, gy - 3)
    ctx.moveTo(gx + 1, gy)
    ctx.lineTo(gx + 2, gy - 3)
    ctx.stroke()
  }
  if (h > 0.9) {
    // a small tree
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(x + 13, y + 20, 7, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5a4026'
    ctx.fillRect(x + 11, y + 12, 3, 8)
    ctx.fillStyle = '#2f7a3d'
    ctx.beginPath()
    ctx.arc(x + 12.5, y + 10, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#4aa050'
    ctx.beginPath()
    ctx.arc(x + 10.5, y + 8, 3.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (h > 0.8) {
    ctx.fillStyle = ['#ffd6e8', '#fff3a0', '#d8c8ff'][Math.floor(tHash(r, c, 5) * 3)]
    ctx.beginPath()
    ctx.arc(x + 8 + tHash(r, c, 6) * 8, y + 8 + tHash(r, c, 7) * 8, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function roadAt(r, c) {
  return inBounds(r, c) && (tiles[r][c].type === 'road' || tiles[r][c].type === 'cityhall')
}

function drawRoadTile(x, y, r, c) {
  ctx.fillStyle = '#4a4a52'
  ctx.fillRect(x, y, TILE, TILE)
  const n = roadAt(r - 1, c)
  const s2 = roadAt(r + 1, c)
  const w = roadAt(r, c - 1)
  const e = roadAt(r, c + 1)
  ctx.strokeStyle = 'rgba(255,230,140,0.7)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  if (w || e) {
    ctx.moveTo(w ? x : x + TILE / 2, y + TILE / 2)
    ctx.lineTo(e ? x + TILE : x + TILE / 2, y + TILE / 2)
  }
  if (n || s2) {
    ctx.moveTo(x + TILE / 2, n ? y : y + TILE / 2)
    ctx.lineTo(x + TILE / 2, s2 ? y + TILE : y + TILE / 2)
  }
  ctx.stroke()
  ctx.setLineDash([])
  // kerbs on the sides that are not road
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  if (!n) ctx.fillRect(x, y, TILE, 2)
  if (!s2) ctx.fillRect(x, y + TILE - 2, TILE, 2)
  if (!w) ctx.fillRect(x, y, 2, TILE)
  if (!e) ctx.fillRect(x + TILE - 2, y, 2, TILE)
}

function drawZoneTile(x, y, t) {
  const col = ZONE_COLORS[t.type][t.level]
  if (t.level === 0) {
    // zoned but still empty: dashed outline over the grass
    ctx.fillStyle = ZONE_COLORS[t.type][3]
    ctx.globalAlpha = 0.5
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
    ctx.globalAlpha = 1
    ctx.strokeStyle = ZONE_COLORS[t.type][3]
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1.5
    ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5)
    ctx.setLineDash([])
    return
  }
  const lv = t.level
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(x + 3, y + TILE - 4, TILE - 4, 3)
  if (t.type === 'res') {
    // little house(s) that grow with the level
    const hh = 6 + lv * 3
    ctx.fillStyle = '#e8dcc0'
    ctx.fillRect(x + 4, y + TILE - 4 - hh, TILE - 8, hh)
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(x + 2, y + TILE - 4 - hh)
    ctx.lineTo(x + TILE / 2, y + TILE - 4 - hh - 7)
    ctx.lineTo(x + TILE - 2, y + TILE - 4 - hh)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffd86a'
    for (let i = 0; i < lv; i++) ctx.fillRect(x + 6 + i * 5, y + TILE - 4 - hh + 4, 3, 3)
  } else if (t.type === 'com') {
    const hh = 7 + lv * 3
    ctx.fillStyle = col
    ctx.fillRect(x + 3, y + TILE - 4 - hh, TILE - 6, hh)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#d83a3a'
      ctx.fillRect(x + 3 + i * ((TILE - 6) / 4), y + TILE - 4 - hh + 3, (TILE - 6) / 4, 3)
    }
    ctx.fillStyle = 'rgba(200,230,255,0.85)'
    for (let i = 0; i < lv + 1; i++) ctx.fillRect(x + 5 + i * 5, y + TILE - 12, 3, 5)
  } else {
    const hh = 6 + lv * 3
    ctx.fillStyle = col
    ctx.fillRect(x + 3, y + TILE - 4 - hh, TILE - 6, hh)
    ctx.fillStyle = '#3a3a42'
    ctx.fillRect(x + TILE - 9, y + TILE - 4 - hh - 6, 4, 8)
    const ph = (performance.now() / 900 + x * 0.01) % 1
    ctx.fillStyle = `rgba(210,210,220,${(1 - ph) * 0.5})`
    ctx.beginPath()
    ctx.arc(x + TILE - 7 + ph * 4, y + TILE - 4 - hh - 8 - ph * 8, 2 + ph * 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawMap() {
  const startCol = Math.max(0, Math.floor(state.camX / TILE))
  const endCol = Math.min(COLS, Math.ceil((state.camX + VIEW_W) / TILE))
  const startRow = Math.max(0, Math.floor(state.camY / TILE))
  const endRow = Math.min(ROWS, Math.ceil((state.camY + VIEW_H) / TILE))

  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const t = tiles[r][c]
      const x = c * TILE - state.camX
      const y = r * TILE - state.camY
      if (t.type === 'grass' || t.type === undefined || t.type === 'empty') drawGrassTile(x, y, r, c)
      else if (t.type === 'road') drawRoadTile(x, y, r, c)
      else {
        // everything else stands on grass
        drawGrassTile(x, y, r, c, true)
        if (t.type === 'cityhall') {
          ctx.fillStyle = '#c9a86a'
          ctx.fillRect(x, y, TILE, TILE)
        } else if (t.type === 'res' || t.type === 'com' || t.type === 'ind') drawZoneTile(x, y, t)
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)

      if (t.type === 'cityhall') {
        ctx.fillStyle = '#5c431c'
        ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('시청', x + TILE / 2, y + TILE / 2 + 3)
      }

      if (t.type === 'res' || t.type === 'com' || t.type === 'ind') {
        if (!hasRoadAdjacent(r, c)) {
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
}

function drawHud() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, VIEW_W, HUD_H)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(`🪙 ${state.treasury}`, 12, 20)
  ctx.fillText(`👥 인구 ${state.population}`, 120, 20)
  ctx.fillText(`📅 ${state.month}개월`, 250, 20)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#9fe8a0'
  ctx.fillText(`달마다 +${state.lastIncome}`, 350, 20)
  if (state.paused) {
    ctx.fillStyle = '#ffe066'
    ctx.fillText('일시정지 (스페이스)', 470, 20)
  }
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(`💡 ${state.tip || '도로 옆에 집을 지어 보세요!'}`, 12, 38)
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

// Stable pseudo-random so the skyline and its lit windows don't reshuffle
// every frame.
function titleRand(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function drawTitle() {
  const W = canvas.width
  const H = canvas.height
  const t = performance.now() / 1000

  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#0d1230')
  sky.addColorStop(0.6, '#2a2a5a')
  sky.addColorStop(1, '#6a4a6a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // stars + moon
  for (let i = 0; i < 70; i++) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + titleRand(i) * 1.6) + i))
    ctx.fillStyle = `rgba(255,255,255,${tw * 0.8})`
    ctx.fillRect(titleRand(i + 1) * W, titleRand(i + 50) * H * 0.55, 1.6, 1.6)
  }
  ctx.fillStyle = 'rgba(255,246,200,0.18)'
  ctx.beginPath()
  ctx.arc(W - 120, 90, 54, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff6c8'
  ctx.beginPath()
  ctx.arc(W - 120, 90, 34, 0, Math.PI * 2)
  ctx.fill()

  // two skyline layers; the near one has twinkling windows
  const ground = H - 70
  for (const layer of [0, 1]) {
    let x = -10
    let i = layer * 100
    while (x < W) {
      const bw = 34 + titleRand(i) * 46
      const bh = (layer ? 90 : 150) + titleRand(i + 7) * (layer ? 170 : 150)
      ctx.fillStyle = layer ? '#141a33' : '#232a55'
      ctx.fillRect(x, ground - bh, bw, bh)
      if (titleRand(i + 3) > 0.6) ctx.fillRect(x + bw / 2 - 2, ground - bh - 16, 4, 16) // antenna
      if (layer) {
        for (let wy = ground - bh + 10; wy < ground - 10; wy += 14) {
          for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
            const seed = titleRand(wx * 0.37 + wy * 1.91)
            if (seed < 0.45) continue
            const flick = Math.sin(t * (0.3 + seed) + seed * 40) > -0.92
            ctx.fillStyle = flick ? (seed > 0.8 ? '#9fe8ff' : '#ffd97a') : '#2a3055'
            ctx.fillRect(wx, wy, 6, 8)
          }
        }
      }
      x += bw + 3
      i++
    }
  }

  // road with moving headlights
  ctx.fillStyle = '#0c0f1c'
  ctx.fillRect(0, ground, W, H - ground)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  for (let x = (t * 30) % 60 - 60; x < W; x += 60) ctx.fillRect(x, ground + 32, 28, 3)
  for (const [sp, y, col] of [[120, 18, '#fff3b0'], [-90, 46, '#ff6b6b'], [70, 18, '#fff3b0']]) {
    const cx = (((t * sp + y * 31) % (W + 120)) + (W + 120)) % (W + 120) - 60
    ctx.fillStyle = col
    ctx.fillRect(cx, ground + y, 16, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(cx + (sp > 0 ? 16 : -40), ground + y - 3, 40, 11)
  }

  ctx.textAlign = 'center'
  ctx.font = 'bold 44px sans-serif'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(8,10,30,0.85)'
  ctx.lineWidth = 8
  ctx.strokeText('미니시티 빌더', W / 2, 150)
  ctx.fillStyle = '#ffe066'
  ctx.fillText('미니시티 빌더', W / 2, 150)
  ctx.font = '15px sans-serif'
  ctx.fillStyle = '#cfd8ff'
  ctx.fillText('도로를 깔고 집을 지으면 도시가 저절로 자라요', W / 2, 182)
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.45
  ctx.font = 'bold 16px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText('클릭 또는 스페이스를 눌러 시작', W / 2, 228)
  ctx.globalAlpha = 1
}

function drawIntro() {
  ctx.fillStyle = '#1b2420'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('도시를 키워 보세요', canvas.width / 2, 60)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#fff'
  const lines = [
    '어려운 규칙은 없어요. 도로를 깔고, 도로 옆에 집·가게·공장을 지으면',
    '저절로 건물이 커지고 인구가 늘어요. 돈은 달마다 자동으로 들어와요.',
    '',
    '1. 도로를 깔아요   2. 도로 옆에 집을 지어요',
    '3. 가게와 공장도 지어 보세요   4. 잘못 지었으면 철거!',
    '',
    '구역에 빨간 점이 뜨면 도로가 안 닿았다는 뜻이에요.',
    '화면 위쪽 💡 도우미가 다음에 할 일을 알려 줘요.',
    '',
    '조작: 클릭/드래그로 짓기 · 숫자 1-5 또는 하단 버튼으로 도구 선택 · 방향키/WASD 이동 · 스페이스 일시정지',
  ]
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 108 + i * 28))
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
