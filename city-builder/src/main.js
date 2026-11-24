import { sfx, unlockSfx, toggleMute } from './sfx.js'
import { createWorld3D } from './world3d.js'

// Small SimCity-style city builder: zone residential/commercial/industrial
// blocks, connect them with roads, keep them powered and watered, and
// balance the tax rate against upkeep. Zoned tiles grow into buildings on
// their own every "month" based on city-wide demand. No images/audio -
// everything is Canvas 2D shapes.

const TILE = 24
const COLS = 50
const ROWS = 34

const VIEW_W = 900
const VIEW_H = 520
const TOOLBAR_H = 88
const HUD_H = 54

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
const MM = 3 // 미니맵 한 칸 크기(px)

const ZONE_COLORS = {
  res: ['#2f4a2b', '#3f7a3d', '#4f9a4a', '#5fc258'],
  com: ['#1f3550', '#2a5a8a', '#3a7ac0', '#4f9ce8'],
  ind: ['#4a3a1f', '#7a5f2a', '#a3802f', '#c9a03a'],
}

const TOOLS = [
  { id: 'road', label: '도로', cost: ROAD_COST, key: '1', color: '#555', desc: '길을 깔아요. 집·가게·공장은 도로 옆에 있어야 자라요. (드래그로 쭉 깔기)' },
  { id: 'res', label: '집', cost: ZONE_COST, key: '2', color: ZONE_COLORS.res[1], desc: '주민이 살 집이에요. 인구가 늘수록 돈을 많이 벌어요.' },
  { id: 'com', label: '가게', cost: ZONE_COST, key: '3', color: ZONE_COLORS.com[1], desc: '가게가 있으면 달마다 들어오는 돈이 늘어요.' },
  { id: 'ind', label: '공장', cost: ZONE_COST, key: '4', color: ZONE_COLORS.ind[1], desc: '공장도 수입을 올려 줘요. 연기가 폴폴 나요.' },
  { id: 'bulldoze', label: '철거', cost: BULLDOZE_COST, key: '5', color: '#b04040', desc: '잘못 지은 걸 치워요. 공짜예요! (시청은 철거 불가)' },
]

function makeTile() {
  return { type: 'empty', level: 0 }
}

const tiles = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => makeTile()))

const CENTER_ROW = 17
const CENTER_COL = 25
function resetTiles() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) tiles[r][c] = makeTile()
  tiles[CENTER_ROW][CENTER_COL] = { type: 'cityhall', level: 0 }
  for (let c = CENTER_COL - 3; c <= CENTER_COL + 3; c++) tiles[CENTER_ROW + 1][c] = { type: 'road', level: 0 }
}
resetTiles()

const state = {
  phase: 'title', // title -> intro -> play
  tool: 'road', // null이면 선택 없음 (Esc로 취소)
  treasury: 1000,
  month: 0,
  population: 0,
  lastIncome: 0,
  tip: '',
  speed: 1,
  paused: false,
  milestonesHit: new Set(),
  hover: null, // { row, col } in map viewport, or null
  painting: false,
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}


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
let ctx = canvas.getContext('2d') // 지형 텍스처를 그릴 때 잠깐 바꿔 끼운다
const worldCanvas = document.getElementById('world')

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

// ---------- UI 상태 / 이펙트 ----------
const nowS = () => performance.now() / 1000
const ui = {
  hits: [], // 이번 프레임의 클릭 영역 { x, y, w, h, fn }
  mouse: { x: -1, y: -1 },
  floaters: [], // 떠오르는 숫자 (화면 좌표 x,y 또는 월드 좌표 wx,wy)
  parts: [], // 월드 좌표 먼지/반짝이
  pan: null,
  mmDrag: false,
}
function burst(wx, wy, color, n) {
  const sp = world.project(wx / TILE, 0.4, wy / TILE)
  if (!sp.visible) return
  wx = sp.x
  wy = sp.y
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 20 + Math.random() * 50
    ui.parts.push({ x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, life: 0.6, max: 0.6, color, size: 2 + Math.random() * 2.5 })
  }
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
  if (income > 0) ui.floaters.push({ x: 118, y: 50, text: `+${income}`, color: '#9fe8a0', t: 0 })

  // 도로에 붙은 구역은 매달 높은 확률로 한 단계씩 자란다
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      if (t.type !== 'res' && t.type !== 'com' && t.type !== 'ind') continue
      if (t.level >= MAX_LEVEL) continue
      if (!hasRoadAdjacent(r, c)) continue
      if (Math.random() < 0.45) {
        t.level += 1
        t.born = nowS()
        world.refreshTile(r, c)
        burst(c * TILE + TILE / 2, r * TILE + TILE / 2, '#ffe066', 8)
      }
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
  if (!toolId || !inBounds(row, col)) return
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
    burst(col * TILE + TILE / 2, row * TILE + TILE / 2, '#b8b0a0', 8)
    world.refreshTile(row, col)
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
  ui.floaters.push({ wx: col * TILE + TILE / 2, wy: row * TILE, text: `-${tool.cost}`, color: '#ffb0a0', t: 0 })
  burst(col * TILE + TILE / 2, row * TILE + TILE - 4, '#e8dcc0', 5)
  if (toolId === 'road') tiles[row][col] = { type: 'road', level: 0 }
  else if (toolId === 'res') tiles[row][col] = { type: 'res', level: 0 }
  else if (toolId === 'com') tiles[row][col] = { type: 'com', level: 0 }
  else if (toolId === 'ind') tiles[row][col] = { type: 'ind', level: 0 }
  tiles[row][col].born = nowS()
  world.refreshTile(row, col)
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
      if (hasSave() && loadGame()) startPlay()
      else {
        state.phase = 'intro'
        sfx.click()
      }
    }
    if (key === 'n' && hasSave()) {
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

  if (key === 'escape') {
    if (ui.menuOpen) ui.menuOpen = false
    else if (state.tool) {
      state.tool = null
      say('선택을 취소했어요 (숫자 1~5로 다시 고르기)')
    }
    sfx.click()
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
  const v = world.view
  let fx = 0
  let rx = 0
  if (held(MOVE_KEYS.up)) fx += 1
  if (held(MOVE_KEYS.down)) fx -= 1
  if (held(MOVE_KEYS.right)) rx += 1
  if (held(MOVE_KEYS.left)) rx -= 1
  if (held(['q'])) v.yaw -= 1.6 * dt
  if (held(['e'])) v.yaw += 1.6 * dt
  if (fx === 0 && rx === 0) return
  const sp = v.dist * 0.75 * dt
  // 화면 기준 앞/오른쪽 방향 (yaw 회전 반영)
  v.cx = clamp(v.cx + (-Math.sin(v.yaw) * fx + Math.cos(v.yaw) * rx) * sp, 0, COLS)
  v.cz = clamp(v.cz + (-Math.cos(v.yaw) * fx - Math.sin(v.yaw) * rx) * sp, 0, ROWS)
}

function eventPos(e) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

function inRect(x, y, h) {
  return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h
}
const MM_X = () => VIEW_W - COLS * MM - 14
const MM_Y = () => VIEW_H - ROWS * MM - 14
function minimapJump(x, y) {
  world.view.cx = clamp((x - MM_X()) / MM, 0, COLS)
  world.view.cz = clamp((y - MM_Y()) / MM, 0, ROWS)
}
function overMinimap(x, y) {
  return x >= MM_X() && x <= MM_X() + COLS * MM && y >= MM_Y() && y <= MM_Y() + ROWS * MM
}

function handlePointerDown(e) {
  const { x, y } = eventPos(e)
  unlockSfx()
  if (state.phase === 'title') {
    for (let i = ui.hits.length - 1; i >= 0; i--) {
      if (inRect(x, y, ui.hits[i])) {
        ui.hits[i].fn()
        return
      }
    }
    if (!hasSave()) {
      state.phase = 'intro'
      sfx.click()
    }
    return
  }
  if (state.phase === 'intro') {
    state.phase = 'play'
    sfx.start()
    return
  }
  // 우클릭/휠클릭 드래그로 화면 이동
  if (e.button === 1 || e.button === 2) {
    const v = world.view
    ui.pan = { kind: e.button === 2 ? 'rotate' : 'pan', x, y, yaw: v.yaw, pitch: v.pitch, cx: v.cx, cz: v.cz }
    return
  }
  // 버튼류(속도, 도구 막대)
  for (let i = ui.hits.length - 1; i >= 0; i--) {
    if (inRect(x, y, ui.hits[i])) {
      ui.hits[i].fn()
      return
    }
  }
  if (ui.menuOpen) {
    ui.menuOpen = false
    return
  }
  if (y >= VIEW_H) return
  if (overMinimap(x, y)) {
    ui.mmDrag = true
    minimapJump(x, y)
    return
  }
  state.painting = true
  const hit = world.pick(x, y)
  if (hit) place(hit.row, hit.col, state.tool)
}

function handlePointerMove(e) {
  const { x, y } = eventPos(e)
  ui.mouse.x = x
  ui.mouse.y = y
  if (ui.pan) {
    const v = world.view
    if (ui.pan.kind === 'rotate') {
      v.yaw = ui.pan.yaw - (x - ui.pan.x) * 0.008
      v.pitch = clamp(ui.pan.pitch + (y - ui.pan.y) * 0.005, 0.45, 1.35)
    } else {
      const k = v.dist * 0.0022
      const dx = -(x - ui.pan.x) * k
      const dy = -(y - ui.pan.y) * k
      v.cx = clamp(ui.pan.cx + Math.cos(v.yaw) * dx + Math.sin(v.yaw) * dy, 0, COLS)
      v.cz = clamp(ui.pan.cz - Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dy, 0, ROWS)
    }
    return
  }
  if (ui.mmDrag) {
    minimapJump(x, y)
    return
  }
  if (y >= VIEW_H || state.phase !== 'play' || overMinimap(x, y)) {
    state.hover = null
  } else {
    const hit = world.pick(x, y)
    state.hover = hit
    if (state.painting && hit) place(hit.row, hit.col, state.tool)
  }
}

function handlePointerUp(e) {
  if (ui.pan && ui.pan.kind === 'rotate' && e && e.button === 2) {
    const p = eventPos(e)
    // 우클릭을 끌지 않고 짧게 누르면 선택한 도구를 취소한다
    if (Math.hypot(p.x - ui.pan.x, p.y - ui.pan.y) < 5 && state.tool) {
      state.tool = null
      say('선택을 취소했어요 (숫자 1~5로 다시 고르기)')
    }
  }
  state.painting = false
  ui.pan = null
  ui.mmDrag = false
}

canvas.addEventListener('mousedown', handlePointerDown)
canvas.addEventListener('mousemove', handlePointerMove)
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener('wheel', (e) => {
  if (state.phase !== 'play') return
  e.preventDefault()
  world.view.dist = clamp(world.view.dist * (1 + e.deltaY * 0.001), 9, 42)
}, { passive: false })
window.addEventListener('mouseup', handlePointerUp)
canvas.addEventListener('mouseleave', () => {
  state.hover = null
  ui.mouse.x = ui.mouse.y = -1
})

// ---------- Draw ----------
const tHash = (a, b, k = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return v - Math.floor(v)
}
const GRASS_SHADES = ['#3f5c38', '#43623b', '#3b5834', '#476a3e']

function drawGrassTile(x, y, r, c, plain = false, skipTree = false) {
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
  if (h > 0.9 && skipTree) {
    // 나무는 3D 인스턴스로 따로 세운다
  } else if (h > 0.9) {
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

// 지형 한 칸을 3D 땅 텍스처에 그린다 (2D 타일 그리기 함수를 그대로 재사용)
function paintTile(tctx, r, c) {
  const prev = ctx
  ctx = tctx
  const t = tiles[r][c]
  const x = c * TILE
  const y = r * TILE
  if (t.type === 'road') drawRoadTile(x, y, r, c)
  else if (t.type === 'cityhall') {
    drawGrassTile(x, y, r, c, true)
    ctx.fillStyle = '#d8c898'
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
  } else if (t.type === 'res' || t.type === 'com' || t.type === 'ind') {
    drawGrassTile(x, y, r, c, true)
    if (t.level === 0) drawZoneTile(x, y, t)
    else {
      ctx.fillStyle = 'rgba(190,180,160,0.6)'
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4)
    }
  } else drawGrassTile(x, y, r, c, false, true)
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
  ctx = prev
}

// 도로가 안 닿은 구역 위에 말풍선 표시
function drawWarnings() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      if ((t.type !== 'res' && t.type !== 'com' && t.type !== 'ind') || hasRoadAdjacent(r, c)) continue
      const p = world.project(c + 0.5, 0.35 + [0, 0.5, 0.95, 1.7][t.level], r + 0.5)
      if (!p.visible || p.y < HUD_H || p.y > VIEW_H) continue
      ctx.fillStyle = '#ff5050'
      ctx.beginPath()
      ctx.arc(p.x, p.y - 8, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('!', p.x, p.y - 7.5)
      ctx.textBaseline = 'alphabetic'
    }
  }
}

// ---- 도구 아이콘 (도구 막대와 커서 미리보기에 같이 쓴다) ----
function drawToolIcon(id, cx, cy, s = 1) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  if (id === 'road') {
    ctx.fillStyle = '#5a5a64'
    ctx.beginPath()
    ctx.roundRect(-15, -15, 30, 30, 5)
    ctx.fill()
    ctx.fillStyle = '#ffe28a'
    for (const y of [-11, -2, 7]) ctx.fillRect(-1.5, y, 3, 5)
  } else if (id === 'res') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(-13, 12, 26, 3)
    ctx.fillStyle = '#f3e6c8'
    ctx.fillRect(-11, -3, 22, 16)
    ctx.fillStyle = '#d9604a'
    ctx.beginPath()
    ctx.moveTo(-15, -2)
    ctx.lineTo(0, -15)
    ctx.lineTo(15, -2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#8a5a30'
    ctx.fillRect(-3, 4, 7, 9)
    ctx.fillStyle = '#a8dcff'
    ctx.fillRect(-9, 1, 5, 5)
    ctx.fillRect(5, 1, 5, 5)
  } else if (id === 'com') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(-13, 12, 26, 3)
    ctx.fillStyle = '#4f86c8'
    ctx.fillRect(-12, -6, 24, 19)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#e04a4a'
      ctx.fillRect(-13 + i * 4.4, -11, 4.4, 7)
    }
    ctx.fillStyle = '#d6efff'
    ctx.fillRect(-9, 0, 9, 8)
    ctx.fillStyle = '#7a4a26'
    ctx.fillRect(3, 2, 6, 11)
  } else if (id === 'ind') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(-13, 12, 26, 3)
    ctx.fillStyle = '#b8903a'
    ctx.fillRect(-13, -3, 26, 16)
    ctx.fillStyle = '#8a6a22'
    ctx.beginPath()
    ctx.moveTo(-13, -3)
    ctx.lineTo(-13, -10)
    ctx.lineTo(-4, -3)
    ctx.lineTo(-4, -10)
    ctx.lineTo(5, -3)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#4a4a54'
    ctx.fillRect(7, -15, 6, 13)
    ctx.fillStyle = 'rgba(220,220,230,0.7)'
    ctx.beginPath()
    ctx.arc(11, -17, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe28a'
    ctx.fillRect(-9, 3, 5, 4)
    ctx.fillRect(-1, 3, 5, 4)
  } else {
    ctx.fillStyle = '#c24a4a'
    ctx.beginPath()
    ctx.roundRect(-14, -14, 28, 28, 6)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-7, -7)
    ctx.lineTo(7, 7)
    ctx.moveTo(7, -7)
    ctx.lineTo(-7, 7)
    ctx.stroke()
  }
  ctx.restore()
}

function drawHoverPreview() {
  if (!state.hover || state.phase !== 'play') {
    world.setHover(null)
    return
  }
  const { row, col } = state.hover
  const tile = tiles[row][col]
  if (!state.tool) {
    // 선택한 도구가 없으면 칸 정보만 보여 준다
    world.setHover(row, col, 0xffffff, 0)
    const names = { empty: '빈 땅', road: '도로', cityhall: '시청', res: '집', com: '가게', ind: '공장' }
    const zone = tile.type === 'res' || tile.type === 'com' || tile.type === 'ind'
    const info = names[tile.type] + (zone ? ` Lv.${tile.level}${hasRoadAdjacent(row, col) ? '' : ' · 도로 필요'}` : '')
    const sp0 = world.project(col + 0.5, 0.9, row + 0.5)
    if (!sp0.visible) return
    ctx.font = 'bold 11px sans-serif'
    const w0 = ctx.measureText(info).width + 14
    const lx0 = clamp(sp0.x + 18, 4, VIEW_W - w0 - 4)
    const ly0 = clamp(sp0.y - 12, HUD_H + 4, VIEW_H - 28)
    ctx.fillStyle = 'rgba(10,14,10,0.82)'
    ctx.beginPath()
    ctx.roundRect(lx0, ly0, w0, 20, 10)
    ctx.fill()
    ctx.fillStyle = '#d8e8d0'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(info, lx0 + 7, ly0 + 10.5)
    ctx.textBaseline = 'alphabetic'
    return
  }
  const tool = TOOLS.find((t) => t.id === state.tool)
  const bulldoze = state.tool === 'bulldoze'
  const blocked = bulldoze ? tile.type === 'empty' || tile.type === 'cityhall' : tile.type !== 'empty'
  const broke = state.treasury < tool.cost
  const bad = blocked || broke
  const color = bad ? 0xff5050 : bulldoze ? 0xffb0a0 : 0xfff6c0
  world.setHover(row, col, color, !bad && !bulldoze && state.tool !== 'road' ? 0.7 : 0)
  // 커서 옆 비용 표시
  const sp = world.project(col + 0.5, 0.9, row + 0.5)
  if (!sp.visible) return
  const label = blocked ? (bulldoze ? '치울 게 없어요' : '이미 뭔가 있어요') : broke ? '돈이 부족해요' : tool.cost === 0 ? '무료' : `🪙 -${tool.cost}`
  ctx.font = 'bold 11px sans-serif'
  const w = ctx.measureText(label).width + 14
  const lx = clamp(sp.x + 18, 4, VIEW_W - w - 4)
  const ly = clamp(sp.y - 12, HUD_H + 4, VIEW_H - 28)
  ctx.fillStyle = 'rgba(10,14,10,0.82)'
  ctx.beginPath()
  ctx.roundRect(lx, ly, w, 20, 10)
  ctx.fill()
  ctx.fillStyle = bad ? '#ff9a8a' : '#ffe9a8'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx + 7, ly + 10.5)
  ctx.textBaseline = 'alphabetic'
}

function uiButton(x, y, w, h, fn, active = false) {
  const hover = ui.mouse.x >= x && ui.mouse.x <= x + w && ui.mouse.y >= y && ui.mouse.y <= y + h
  ctx.fillStyle = active ? 'rgba(255,224,102,0.9)' : hover ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 9)
  ctx.fill()
  ui.hits.push({ x, y, w, h, fn })
  return hover
}

const GOALS = [50, 100, 250, 500, 1000]
function drawHud() {
  // 상단 바
  const g = ctx.createLinearGradient(0, 0, 0, HUD_H)
  g.addColorStop(0, 'rgba(14,20,14,0.88)')
  g.addColorStop(1, 'rgba(14,20,14,0.6)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, VIEW_W, HUD_H)
  ctx.fillStyle = 'rgba(255,224,150,0.25)'
  ctx.fillRect(0, HUD_H - 1, VIEW_W, 1)

  const pill = (x, label, value, color) => {
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.roundRect(x, 10, 136, 34, 17)
    ctx.fill()
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = '18px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(label, x + 12, 28)
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = color
    ctx.fillText(value, x + 40, 28.5)
  }
  pill(12, '🪙', state.treasury.toLocaleString(), '#ffe066')
  pill(156, '👥', `${state.population.toLocaleString()}명`, '#a8e8a8')
  pill(300, '📅', `${state.month}개월`, '#bcd8ff')
  ctx.textBaseline = 'alphabetic'

  // 수입 표시 + 다음 목표 진행바
  ctx.textAlign = 'left'
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#9fe8a0'
  ctx.fillText(`달마다 +${state.lastIncome}`, 448, 22)
  const next = GOALS.find((m) => state.population < m)
  ctx.fillStyle = '#d8e0c8'
  ctx.fillText(next ? `🎯 목표: 인구 ${next}명` : '🏆 모든 목표 달성!', 448, 38)
  if (next) {
    const prev = GOALS[GOALS.indexOf(next) - 1] || 0
    const f = clamp((state.population - prev) / (next - prev), 0, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath()
    ctx.roundRect(588, 31, 90, 9, 5)
    ctx.fill()
    ctx.fillStyle = '#ffd24a'
    ctx.beginPath()
    ctx.roundRect(588, 31, Math.max(9, 90 * f), 9, 5)
    ctx.fill()
  }

  // 속도 버튼
  const btn = (x, label, speed, kind) => {
    const active = kind === 'pause' ? state.paused : !state.paused && state.speed === speed
    uiButton(x, 11, 40, 32, () => {
      if (kind === 'pause') state.paused = !state.paused
      else {
        state.paused = false
        state.speed = speed
      }
      sfx.click()
    }, active)
    ctx.fillStyle = active ? '#3a2a08' : '#fff'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 20, 28)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.textAlign = 'right'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillStyle = '#d8e8ff'
  ctx.fillText(`${world.isNight() ? '🌙' : '☀️'} ${world.hourText()}`, VIEW_W - 152, 32)
  btn(VIEW_W - 138, '⏸', 0, 'pause')
  btn(VIEW_W - 94, '▶', 1, 'speed')
  btn(VIEW_W - 50, '⏩', 3, 'speed')

  // 💡 도우미 말풍선
  const tip = `💡 ${state.tip || '도로 옆에 집을 지어 보세요!'}`
  ctx.font = 'bold 13px sans-serif'
  const w = ctx.measureText(tip).width + 28
  ctx.fillStyle = 'rgba(255,248,214,0.92)'
  ctx.beginPath()
  ctx.roundRect(12, HUD_H + 10, w, 28, 14)
  ctx.fill()
  ctx.fillStyle = '#4a3410'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(tip, 26, HUD_H + 25)
  ctx.textBaseline = 'alphabetic'
  if (state.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.roundRect(VIEW_W / 2 - 70, HUD_H + 10, 140, 28, 14)
    ctx.fill()
    ctx.fillStyle = '#ffe066'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⏸ 일시정지 중', VIEW_W / 2, HUD_H + 29)
  }
}

function drawMinimap() {
  const x0 = MM_X()
  const y0 = MM_Y()
  const w = COLS * MM
  const h = ROWS * MM
  ctx.fillStyle = 'rgba(10,16,10,0.75)'
  ctx.beginPath()
  ctx.roundRect(x0 - 5, y0 - 5, w + 10, h + 10, 8)
  ctx.fill()
  ctx.fillStyle = '#3f5c38'
  ctx.fillRect(x0, y0, w, h)
  const colors = { road: '#9a9aa6', cityhall: '#e8c878', res: '#5fc258', com: '#4f9ce8', ind: '#d9b03a' }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      const col = colors[t.type]
      if (!col) continue
      ctx.fillStyle = col
      ctx.globalAlpha = t.level === 0 && (t.type === 'res' || t.type === 'com' || t.type === 'ind') ? 0.55 : 1
      ctx.fillRect(x0 + c * MM, y0 + r * MM, MM, MM)
    }
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#ffe066'
  ctx.lineWidth = 1.5
  const v = world.view
  const mx = x0 + v.cx * MM
  const my = y0 + v.cz * MM
  // 보고 있는 방향(부채꼴)과 중심점
  ctx.fillStyle = 'rgba(255,224,102,0.35)'
  ctx.beginPath()
  ctx.moveTo(mx, my)
  const a0 = Math.atan2(-Math.cos(v.yaw), -Math.sin(v.yaw))
  ctx.arc(mx, my, 22, a0 - 0.6, a0 + 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffe066'
  ctx.beginPath()
  ctx.arc(mx, my, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawFloaters(dt) {
  for (const f of ui.floaters) f.t += dt
  ui.floaters = ui.floaters.filter((f) => f.t < 1.1)
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  for (const f of ui.floaters) {
    const a = 1 - f.t / 1.1
    let x = f.x
    let y = f.y
    if (f.wx !== undefined) {
      const sp = world.project(f.wx / TILE, 0.9, f.wy / TILE + 0.5)
      if (!sp.visible) continue
      x = sp.x
      y = sp.y
    }
    y -= f.t * 30
    ctx.globalAlpha = Math.max(0, a)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.strokeText(f.text, x, y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, x, y)
  }
  ctx.globalAlpha = 1
}

function drawParts(dt) {
  for (const p of ui.parts) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 120 * dt
    p.life -= dt
  }
  ui.parts = ui.parts.filter((p) => p.life > 0)
  for (const p of ui.parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
}

function drawToast() {
  if (toastTimer <= 0) return
  ctx.font = 'bold 14px sans-serif'
  const w = ctx.measureText(toastText).width + 36
  const x = VIEW_W / 2 - w / 2
  const y = VIEW_H - 44
  ctx.globalAlpha = Math.min(1, toastTimer / 0.4)
  ctx.fillStyle = 'rgba(20,16,8,0.9)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, 32, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,224,102,0.7)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#ffe066'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(toastText, VIEW_W / 2, y + 17)
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = 1
}

function drawToolbar() {
  const y0 = VIEW_H
  const bg = ctx.createLinearGradient(0, y0, 0, y0 + TOOLBAR_H)
  bg.addColorStop(0, '#2a3324')
  bg.addColorStop(1, '#1a2016')
  ctx.fillStyle = bg
  ctx.fillRect(0, y0, VIEW_W, TOOLBAR_H)
  ctx.fillStyle = 'rgba(255,224,150,0.3)'
  ctx.fillRect(0, y0, VIEW_W, 1.5)
  const gap = 8
  const btnW = (VIEW_W - gap * (TOOLS.length + 1)) / TOOLS.length
  let hoverTool = null
  TOOLS.forEach((t, i) => {
    const x = gap + i * (btnW + gap)
    const y = y0 + 8
    const h = TOOLBAR_H - 16
    const selected = state.tool === t.id
    const hover = ui.mouse.x >= x && ui.mouse.x <= x + btnW && ui.mouse.y >= y && ui.mouse.y <= y + h
    if (hover) hoverTool = t
    const afford = state.treasury >= t.cost
    ctx.save()
    if (selected) {
      ctx.shadowColor = 'rgba(255,224,102,0.7)'
      ctx.shadowBlur = 14
    }
    ctx.fillStyle = selected ? '#4a5c38' : hover ? '#3a4830' : '#2e3a28'
    ctx.beginPath()
    ctx.roundRect(x, selected ? y - 3 : y, btnW, h, 12)
    ctx.fill()
    ctx.restore()
    if (selected) {
      ctx.strokeStyle = '#ffe066'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.roundRect(x, y - 3, btnW, h, 12)
      ctx.stroke()
    }
    const oy = selected ? -3 : 0
    ctx.globalAlpha = afford || t.cost === 0 ? 1 : 0.45
    drawToolIcon(t.id, x + 34, y + h / 2 + oy, 1.15)
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(t.label, x + 62, y + 28 + oy)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = afford || t.cost === 0 ? '#ffe9a8' : '#ff8a7a'
    ctx.fillText(t.cost === 0 ? '무료' : `🪙 ${t.cost}`, x + 62, y + 48 + oy)
    // 단축키 배지
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.roundRect(x + 6, y + 5 + oy, 18, 16, 5)
    ctx.fill()
    ctx.fillStyle = '#ffe9b0'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(t.key, x + 15, y + 17 + oy)
    ui.hits.push({ x, y, w: btnW, h, fn: () => { state.tool = t.id; sfx.click() } })
  })
  // 설명 말풍선 (마우스를 올렸거나 선택된 도구)
  const tip = hoverTool || TOOLS.find((t) => t.id === state.tool) || { desc: '도구를 골라 보세요 (숫자 1~5) · Esc 또는 우클릭으로 선택 취소' }
  ctx.font = '12px sans-serif'
  const w = ctx.measureText(tip.desc).width + 28
  const bx = VIEW_W / 2 - w / 2
  const by = y0 - 30
  if (!state.hover) {
    ctx.fillStyle = 'rgba(14,18,10,0.85)'
    ctx.beginPath()
    ctx.roundRect(bx, by - (toastTimer > 0 ? 36 : 0), w, 24, 12)
    ctx.fill()
    ctx.fillStyle = '#e8e0c0'
    ctx.textAlign = 'center'
    ctx.fillText(tip.desc, VIEW_W / 2, by + 16 - (toastTimer > 0 ? 36 : 0))
  }
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
  const sv = readSave()
  if (sv) {
    ctx.fillStyle = 'rgba(8,10,30,0.6)'
    ctx.beginPath()
    ctx.roundRect(W / 2 - 190, 218, 380, 176, 18)
    ctx.fill()
    const btn = (y, label, sub, primary, fn) => {
      const bw = 340
      const bx = W / 2 - bw / 2
      const hover = ui.mouse.x >= bx && ui.mouse.x <= bx + bw && ui.mouse.y >= y && ui.mouse.y <= y + 52
      ctx.fillStyle = primary ? (hover ? '#ffd24a' : '#f0b92e') : hover ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.16)'
      ctx.beginPath()
      ctx.roundRect(bx, y, bw, 52, 14)
      ctx.fill()
      ctx.fillStyle = primary ? '#3a2a08' : '#fff'
      ctx.font = 'bold 17px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, W / 2, y + 22)
      ctx.font = '12px sans-serif'
      ctx.fillStyle = primary ? '#6a4c10' : '#c8d0e8'
      ctx.fillText(sub, W / 2, y + 40)
      ui.hits.push({ x: bx, y, w: bw, h: 52, fn })
    }
    btn(232, '▶ 이어하기', `${sv.month}개월차 · 인구 ${sv.population || 0}명 · 🪙 ${sv.treasury}`, true, () => { if (loadGame()) startPlay() })
    btn(294, '✨ 새로 시작', '처음부터 새 도시를 만들어요', false, () => { state.phase = 'intro'; sfx.click() })
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#aab4d8'
    ctx.fillText('스페이스: 이어하기 · N: 새로 시작', W / 2, 372)
  } else {
    ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.45
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText('클릭 또는 스페이스를 눌러 시작', W / 2, 228)
    ctx.globalAlpha = 1
  }
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
    '조작: 클릭/드래그로 짓기 · 숫자 1-5 또는 아래 버튼으로 도구 선택',
    '화면: WASD/방향키 이동 · Q/E나 우클릭 드래그로 회전 · 휠 확대/축소 · 미니맵 클릭으로 이동',
    'Esc(또는 우클릭 짧게)로 선택한 도구 취소 · 스페이스 일시정지 · 💾 메뉴에서 저장/불러오기 (자동 저장도 돼요)',
  ]
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 108 + i * 28))
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('클릭 또는 스페이스로 시작', canvas.width / 2, canvas.height - 30)
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (state.phase === 'title') {
    ui.hits = []
    drawTitle()
    return
  }
  if (state.phase === 'intro') {
    drawIntro()
    return
  }
  ui.hits = []
  world.render(nowS(), frameDt, state.paused ? 0 : state.speed)
  drawHoverPreview()
  drawWarnings()
  drawParts(frameDt)
  drawHud()
  drawMenu()
  drawFloaters(frameDt)
  drawMinimap()
  drawToolbar()
  drawToast()
}

// ---------- 3D 월드 ----------
const world = createWorld3D({ canvas: worldCanvas, tiles, COLS, ROWS, TILE, VIEW_W, VIEW_H, paintTile })
world.view.cx = CENTER_COL + 0.5
world.view.cz = CENTER_ROW + 1.2
setInterval(() => world.pruneSmokers(), 4000)

// ---------- 저장 / 불러오기 ----------
const SAVE_KEY = 'citybuilder-save-v1'
const T2C = { empty: 'e', road: 'r', cityhall: 'h', res: 'R', com: 'C', ind: 'I' }
const C2T = Object.fromEntries(Object.entries(T2C).map(([k, v]) => [v, k]))
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function hasSave() {
  return !!readSave()
}
function saveGame(manual = false) {
  const v = world.view
  const data = {
    v: 1,
    tiles: tiles.map((row) => row.map((t) => (T2C[t.type] || 'e') + t.level).join('')).join('|'),
    treasury: state.treasury,
    month: state.month,
    population: state.population,
    speed: state.speed,
    milestones: [...state.milestonesHit],
    view: { cx: v.cx, cz: v.cz, yaw: v.yaw, pitch: v.pitch, dist: v.dist },
    tod: world.getTime(),
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    ui.lastSave = data.savedAt
    if (manual) {
      say('💾 저장했어요')
      sfx.pickup()
    }
    return true
  } catch {
    if (manual) say('저장하지 못했어요 (브라우저 저장 공간을 쓸 수 없어요)')
    return false
  }
}
function loadGame() {
  const d = readSave()
  if (!d || typeof d.tiles !== 'string') return false
  const rows = d.tiles.split('|')
  if (rows.length !== ROWS || rows.some((r) => r.length !== COLS * 2)) return false
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = C2T[rows[r][c * 2]] || 'empty'
      const level = Math.max(0, Math.min(MAX_LEVEL, Number(rows[r][c * 2 + 1]) || 0))
      tiles[r][c] = { type, level }
    }
  }
  state.treasury = Number.isFinite(d.treasury) ? d.treasury : 1000
  state.month = d.month || 0
  state.population = d.population || 0
  state.speed = [1, 3].includes(d.speed) ? d.speed : 1
  state.paused = false
  state.milestonesHit = new Set(d.milestones || [])
  state.tip = ''
  world.rebuildAll()
  if (d.view) Object.assign(world.view, d.view)
  if (typeof d.tod === 'number') world.setTime(d.tod)
  ui.lastSave = d.savedAt
  return true
}
function newGame() {
  resetTiles()
  state.treasury = 1000
  state.month = 0
  state.population = 0
  state.speed = 1
  state.paused = false
  state.milestonesHit = new Set()
  state.tip = ''
  state.tool = 'road'
  world.rebuildAll()
  Object.assign(world.view, { cx: CENTER_COL + 0.5, cz: CENTER_ROW + 1.2, yaw: 0.65, pitch: 0.95, dist: 22 })
  world.setTime(0.33)
}
function startPlay() {
  state.phase = 'play'
  sfx.start()
  say('도시를 불러왔어요')
}
setInterval(() => {
  if (state.phase === 'play') saveGame(false)
}, 15000)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'play') saveGame(false)
})
window.addEventListener('beforeunload', () => {
  if (state.phase === 'play') saveGame(false)
})

// 메뉴 (💾 버튼) — 저장하기 / 불러오기 / 새로 시작
function drawMenu() {
  const bx = VIEW_W - 100
  const by = HUD_H + 8
  uiButton(bx, by, 92, 28, () => { ui.menuOpen = !ui.menuOpen; sfx.click() }, ui.menuOpen)
  ctx.fillStyle = ui.menuOpen ? '#3a2a08' : '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('💾 메뉴', bx + 46, by + 15)
  ctx.textBaseline = 'alphabetic'
  if (!ui.menuOpen) return
  const px = VIEW_W - 214
  const py = by + 36
  ctx.fillStyle = 'rgba(16,22,14,0.95)'
  ctx.beginPath()
  ctx.roundRect(px, py, 206, 172, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,224,150,0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ui.hits.push({ x: px, y: py, w: 206, h: 172, fn: () => {} }) // 패널 안 클릭은 닫히지 않게
  const save = readSave()
  const rows = [
    ['💾 저장하기', true, () => saveGame(true)],
    ['📂 불러오기' + (save ? '' : ' (저장 없음)'), !!save, () => {
      if (loadGame()) say('📂 불러왔어요')
      else say('불러올 저장이 없어요')
      ui.menuOpen = false
    }],
    [ui.confirmNew && nowS() - ui.confirmNew < 3 ? '⚠ 정말요? 한 번 더!' : '🆕 새로 시작', true, () => {
      if (ui.confirmNew && nowS() - ui.confirmNew < 3) {
        newGame()
        say('새 도시를 시작했어요')
        ui.confirmNew = 0
        ui.menuOpen = false
      } else ui.confirmNew = nowS()
    }],
  ]
  rows.forEach(([label, enabled, fn], i) => {
    const y = py + 10 + i * 44
    const hover = enabled && ui.mouse.x >= px + 10 && ui.mouse.x <= px + 196 && ui.mouse.y >= y && ui.mouse.y <= y + 38
    ctx.fillStyle = !enabled ? 'rgba(255,255,255,0.06)' : hover ? 'rgba(255,224,102,0.35)' : 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(px + 10, y, 186, 38, 9)
    ctx.fill()
    ctx.fillStyle = enabled ? '#fff' : '#8a8f84'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, px + 22, y + 20)
    ctx.textBaseline = 'alphabetic'
    if (enabled) ui.hits.push({ x: px + 10, y, w: 186, h: 38, fn: () => { fn(); sfx.click() } })
  })
  ctx.fillStyle = '#b8b098'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  const t = ui.lastSave ? new Date(ui.lastSave) : null
  ctx.fillText(t ? `마지막 저장 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} · 15초마다 자동 저장` : '15초마다 자동 저장돼요', px + 103, py + 156)
}

// ---------- Loop ----------
let lastTime = performance.now()
let tickAccum = 0
let frameDt = 0
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  frameDt = dt

  if (toastTimer > 0) toastTimer -= dt

  if (state.phase === 'play') {
    updateCamera(dt)
    if (!state.paused) {
      tickAccum += dt * state.speed
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
