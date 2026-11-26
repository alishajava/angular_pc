// 한옥 마을 지도(충돌/소품/상호작용 지점/주민)와 계절별 바닥·소품 그리기
export const TILE = 32
export const COLS = 25
export const ROWS = 18
export const W = COLS * TILE
export const H = ROWS * TILE

const hash = (a, b, k = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return v - Math.floor(v)
}
function rr(g, x, y, w, h, r, fill, stroke, lw = 1.5) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  if (fill) { g.fillStyle = fill; g.fill() }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke() }
}

// ----------------------------------------------------------------- 지도 ----
function buildMap() {
  const m = { solid: Array.from({ length: ROWS }, () => Array(COLS).fill(0)), props: [], stations: [], npcs: [] }
  const rect = (c, r, w, h, v = 1) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (y >= 0 && y < ROWS && x >= 0 && x < COLS) m.solid[y][x] = v
  }
  const prop = (kind, c, r, w = 1, h = 1, extra = {}, solid = true) => {
    m.props.push({ kind, c, r, w, h, ...extra })
    if (solid) rect(c, r, w, h)
  }
  const station = (id, act, x, y, label, radius = 46) => m.stations.push({ id, act, x: x * TILE, y: y * TILE, label, radius })
  const px = (c) => c * TILE
  const py = (r) => r * TILE

  // 바깥 경계: 산(위 2줄), 양옆·아래 숲
  rect(0, 0, COLS, 2)
  rect(0, 0, 1, ROWS)
  rect(COLS - 1, 0, 1, ROWS)
  rect(0, ROWS - 1, COLS, 1)

  // 위쪽 건물 줄 (문은 6번째 줄 쪽)
  prop('hanok', 1, 2, 5, 4, { variant: 'school', label: '서당', roof: '#55688a' })
  prop('hanok', 7, 2, 5, 4, { variant: 'dojo', label: '연무장', roof: '#8a4a3e' })
  prop('hanok', 13, 2, 4, 4, { variant: 'atelier', label: '화실', roof: '#4f7a62' })
  prop('hanok', 18, 2, 6, 4, { variant: 'temple', label: '사찰', roof: '#3f5f66' })
  station('school', 'study', 3.5, 6.35, '서당', 50)
  station('dojo', 'train', 9.5, 6.35, '연무장', 50)
  station('atelier', 'art', 15, 6.35, '화실', 50)
  station('temple', 'pray', 21, 6.35, '사찰', 54)
  // 문 옆 장식
  prop('books', 1, 6, 1, 1, {}, false)
  prop('dummy', 7, 6, 1, 1, {}, true)
  prop('rack', 11, 6, 1, 1, {}, true)
  prop('easel', 13, 6, 1, 1, {}, true)
  prop('lantern', 18, 6, 1, 1, {}, true)
  prop('lantern', 23, 6, 1, 1, {}, true)

  // 길가 나무와 우물
  prop('tree', 3, 9, 1, 1, { v: 0 })
  prop('tree', 9, 9, 1, 1, { v: 1 })
  prop('well', 12, 9, 1, 1)
  prop('tree', 16, 9, 1, 1, { v: 2 })
  prop('tree', 21, 9, 1, 1, { v: 0 })
  prop('pine', 1, 8, 1, 1, { v: 0 })
  prop('pine', 23, 8, 1, 1, { v: 1 })

  // 집 (남서쪽)
  prop('hanok', 1, 11, 6, 4, { variant: 'home', label: '우리 집', roof: '#6a5a52' })
  station('home', 'rest', 4, 15.4, '우리 집', 52)
  prop('jars', 1, 15, 1, 1, {}, true)
  prop('flowers', 6, 15, 1, 1, { v: 1 }, false)
  prop('flowers', 2, 16, 1, 1, { v: 0 }, false)
  prop('smoke', 5, 11, 1, 1, {}, false)
  prop('tree', 7, 12, 1, 1, { v: 1 })
  prop('tree', 7, 15, 1, 1, { v: 2 })

  // 시장 (가운데 아래): 노점 4개, 가운데 통로
  prop('stall', 9, 11, 2, 2, { goods: 'fruit', color: '#d9534f' })
  prop('stall', 11, 11, 2, 2, { goods: 'fish', color: '#4a90c0' })
  prop('stall', 14, 11, 2, 2, { goods: 'cloth', color: '#e0a030' })
  prop('stall', 16, 11, 2, 2, { goods: 'pot', color: '#5aa06a' })
  station('market', 'work', 13.5, 10.45, '시장', 50)
  prop('crate', 9, 14, 1, 1)
  prop('crate', 17, 14, 1, 1)
  prop('haystack', 10, 15, 1, 1)

  // 나루터 (남동쪽 강)
  rect(18, 11, 6, 6) // 물
  for (let r = 13; r <= 14; r++) for (let c = 18; c <= 21; c++) m.solid[r][c] = 0 // 선착장 널빤지
  prop('dock', 17, 13, 5, 2, {}, false)
  prop('boat', 21, 15, 3, 1, {}, false)
  prop('reeds', 18, 11, 1, 1, {}, false)
  prop('reeds', 23, 12, 1, 1, {}, false)
  prop('reeds', 19, 16, 1, 1, {}, false)
  station('dock', 'travel', 21.3, 13.8, '나루터', 54)
  prop('pine', 17, 10, 1, 1, { v: 2 })
  prop('tree', 22, 9, 1, 1, { v: 1 })
  prop('rock', 19, 9, 1, 1)
  prop('flowers', 20, 10, 1, 1, { v: 0 }, false)
  prop('flowers', 14, 9, 1, 1, { v: 1 }, false)
  prop('flowers', 6, 9, 1, 1, { v: 0 }, false)
  prop('flowers', 17, 6, 1, 1, { v: 1 }, false)

  // 사람들
  m.npcs.push(
    { id: 'teacher', name: '훈장님', x: px(2) + 4, y: py(6) + 22, look: 'teacher', facing: 'down', role: 'talk' },
    { id: 'master', name: '무예 사범', x: px(11) + 18, y: py(7) - 2, look: 'master', facing: 'down', role: 'talk' },
    { id: 'painter', name: '화공 선생', x: px(14) + 16, y: py(7) - 2, look: 'painter', facing: 'down', role: 'talk' },
    { id: 'monk', name: '스님', x: px(19) + 6, y: py(6) + 24, look: 'monk', facing: 'down', role: 'talk' },
    { id: 'aunt', name: '시장 아주머니', x: px(10) + 16, y: py(13) + 10, look: 'aunt', facing: 'down', role: 'talk' },
    { id: 'uncle', name: '시장 아저씨', x: px(15) + 16, y: py(13) + 10, look: 'uncle', facing: 'down', role: 'talk' },
    { id: 'boatman', name: '뱃사공', x: px(19) + 8, y: py(13) + 10, look: 'boatman', facing: 'right', role: 'talk' },
    { id: 'granny', name: '이웃 할머니', x: px(6), y: py(7) + 20, look: 'granny', role: 'wander', wander: { x0: 2, x1: 22, y: 7.7 } },
    { id: 'kid', name: '동네 아이', x: px(14), y: py(10) + 8, look: 'kid', role: 'wander', wander: { x0: 2, x1: 22, y: 10.1 } },
  )
  m.spawn = { x: px(7) + 16, y: py(9) + 20 }
  m.doorSpawns = {
    school: { x: px(3) + 16, y: py(7) + 6 },
    dojo: { x: px(9) + 16, y: py(7) + 6 },
    atelier: { x: px(15) - 2, y: py(7) + 6 },
    temple: { x: px(21) - 6, y: py(7) + 6 },
    market: { x: px(13) + 16, y: py(10) + 20 },
    home: { x: px(4) + 16, y: py(15) + 24 },
    dock: { x: px(20) + 16, y: py(13) + 22 },
  }
  return m
}
export const MAP = buildMap()

// ------------------------------------------------------------ 계절 팔레트 ----
export const PAL = [
  { name: '봄', grass: ['#93d07e', '#89c874'], leaf: ['#f9bccf', '#f4a0bc', '#fcd6e2'], green: ['#6fbf5a', '#7fcb62'], mount: ['#8fb4a0', '#76a08a'], sky: '#d9eef9', water: ['#7ec4e8', '#6db6dc'], dirt: '#dcbf8e', tint: null },
  { name: '여름', grass: ['#5fb856', '#56ae4e'], leaf: ['#3f9c4a', '#2f8a3e', '#4cab58'], green: ['#3f9c4a', '#4cab58'], mount: ['#4f8a62', '#3f7a54'], sky: '#bfe3ff', water: ['#4fb4e0', '#3fa6d6'], dirt: '#d4b17c', tint: 'rgba(255,238,140,0.07)' },
  { name: '가을', grass: ['#c4b25a', '#b9a850'], leaf: ['#e0742a', '#d9562a', '#eaa332'], green: ['#d99a3a', '#c9822c'], mount: ['#b0864e', '#9a7242'], sky: '#f2e4cf', water: ['#78b4c8', '#68a6bc'], dirt: '#cfa874', tint: 'rgba(255,150,60,0.1)' },
  { name: '겨울', grass: ['#eef3f7', '#e3ebf2'], leaf: ['#e8eef4', '#dfe8f0'], green: ['#dbe6ee', '#cfdce8'], mount: ['#b4c2d2', '#a2b2c6'], sky: '#e6eef6', water: ['#cfe6f2', '#c0dcec'], dirt: '#d9ccb8', tint: 'rgba(170,205,255,0.13)' },
]

// ----------------------------------------------------------------- 바닥 ----
export function buildGround(season) {
  const P = PAL[season]
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  // 잔디
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    g.fillStyle = P.grass[(r + col) % 2]
    g.fillRect(col * TILE, r * TILE, TILE, TILE)
  }
  for (let i = 0; i < 420; i++) {
    const x = hash(i, 1) * W
    const y = hash(i, 2) * H
    if (season === 3) g.fillStyle = hash(i, 5) > 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(170,195,220,0.35)'
    else g.fillStyle = hash(i, 5) > 0.5 ? 'rgba(40,100,40,0.2)' : 'rgba(210,250,170,0.22)'
    g.fillRect(x, y, 2, 5)
  }
  // 꽃/낙엽 점
  for (let i = 0; i < 90; i++) {
    const x = hash(i, 11) * W
    const y = (2 + hash(i, 12) * 15) * TILE
    if (season === 0) g.fillStyle = ['#ffd3e0', '#fff4a8', '#ffffff'][i % 3]
    else if (season === 1) g.fillStyle = ['#ffe36a', '#ffffff', '#ffb0c8'][i % 3]
    else if (season === 2) g.fillStyle = ['#e0742a', '#c9552a', '#eaa332'][i % 3]
    else continue
    g.beginPath(); g.arc(x, y, 2.1, 0, Math.PI * 2); g.fill()
  }

  // 흙길 / 돌바닥
  const dirt = (c0, r0, w, h, rad = 10) => {
    g.fillStyle = P.dirt
    g.beginPath(); g.roundRect(c0 * TILE, r0 * TILE, w * TILE, h * TILE, rad); g.fill()
    g.strokeStyle = 'rgba(120,80,40,0.2)'
    g.lineWidth = 2
    g.stroke()
  }
  dirt(0.5, 7, COLS - 1, 2.1) // 큰길
  dirt(7, 9, 1.8, 8, 12) // 집으로 가는 길
  dirt(1, 15, 8, 2, 12) // 집 앞마당
  dirt(9, 10, 9, 6, 12) // 시장 바닥
  dirt(17, 9, 5, 2, 10) // 나루터 가는 길
  // 건물 앞 돌바닥
  g.fillStyle = season === 3 ? '#e9e8e4' : '#cdc4ae'
  g.fillRect(TILE, 6 * TILE, 23 * TILE, TILE)
  g.strokeStyle = 'rgba(80,70,50,0.18)'
  g.lineWidth = 1
  for (let x = TILE; x <= 24 * TILE; x += 32) { g.beginPath(); g.moveTo(x, 6 * TILE); g.lineTo(x, 7 * TILE); g.stroke() }
  g.beginPath(); g.moveTo(TILE, 6.5 * TILE); g.lineTo(24 * TILE, 6.5 * TILE); g.stroke()
  // 바퀴 자국
  g.strokeStyle = 'rgba(100,70,40,0.18)'
  g.lineWidth = 2
  for (const yy of [7.45, 8.15]) { g.beginPath(); g.moveTo(TILE, yy * TILE); g.lineTo(24 * TILE, yy * TILE); g.stroke() }
  // 시장 바닥 얼룩
  for (let i = 0; i < 30; i++) {
    g.fillStyle = 'rgba(100,70,40,0.1)'
    g.beginPath(); g.ellipse(9.5 * TILE + hash(i, 21) * 8 * TILE, 10.5 * TILE + hash(i, 22) * 5 * TILE, 10, 4, 0, 0, Math.PI * 2); g.fill()
  }

  // 강
  const wx = 18 * TILE
  const wy = 11 * TILE
  g.fillStyle = P.water[0]
  g.beginPath(); g.roundRect(wx - 6, wy - 4, 6 * TILE + 6, 6 * TILE + 4, 18); g.fill()
  g.fillStyle = P.water[1]
  g.beginPath(); g.roundRect(wx + 4, wy + 6, 6 * TILE - 14, 6 * TILE - 14, 14); g.fill()
  g.strokeStyle = season === 3 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)'
  g.lineWidth = 1.5
  for (let i = 0; i < 14; i++) {
    const x = wx + 6 + hash(i, 31) * (6 * TILE - 24)
    const y = wy + 8 + hash(i, 32) * (6 * TILE - 24)
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 7, y - 3, x + 14, y); g.stroke()
  }
  g.strokeStyle = 'rgba(70,60,40,0.35)'
  g.lineWidth = 3
  g.beginPath(); g.roundRect(wx - 6, wy - 4, 6 * TILE + 6, 6 * TILE + 4, 18); g.stroke()

  // 산 (위 두 줄)
  const sky = g.createLinearGradient(0, 0, 0, 2 * TILE)
  sky.addColorStop(0, P.sky)
  sky.addColorStop(1, '#ffffff')
  g.fillStyle = sky
  g.fillRect(0, 0, W, 2 * TILE)
  for (let layer = 0; layer < 2; layer++) {
    g.fillStyle = P.mount[layer]
    g.beginPath()
    g.moveTo(0, 2 * TILE)
    for (let x = 0; x <= W; x += 16) {
      const hgt = (layer ? 26 : 38) + Math.sin(x * 0.012 + layer * 2) * 12 + hash(Math.floor(x / 16), layer) * 8
      g.lineTo(x, 2 * TILE - hgt + (layer ? 8 : 0))
    }
    g.lineTo(W, 2 * TILE)
    g.closePath()
    g.fill()
  }
  // 숲 띠 (산 아래)
  for (let x = 0; x < W; x += 20) {
    const y = 2 * TILE - 10 + hash(x, 7) * 6
    g.fillStyle = season === 3 ? '#f4f8fb' : P.green[x % 2 ? 0 : 1]
    g.beginPath(); g.arc(x + 10, y, 14, 0, Math.PI * 2); g.fill()
  }
  // 바깥 숲 (양옆·아래)
  for (let y = 2 * TILE; y < H; y += 22) {
    for (const x of [8, W - 8]) {
      g.fillStyle = season === 3 ? '#f2f6fa' : P.green[(y / 22) % 2 ? 0 : 1]
      g.beginPath(); g.arc(x, y + 10, 17, 0, Math.PI * 2); g.fill()
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.stroke()
    }
  }
  for (let x = 0; x < W; x += 22) {
    g.fillStyle = season === 3 ? '#f2f6fa' : P.green[(x / 22) % 2 ? 0 : 1]
    g.beginPath(); g.arc(x + 10, H - 12, 17, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.stroke()
  }
  return c
}

// ----------------------------------------------------------------- 소품 ----
function snowCap(g, x, y, w) {
  g.fillStyle = 'rgba(255,255,255,0.94)'
  for (let i = 0; i < w; i += 9) {
    g.beginPath()
    g.ellipse(x + i + 5, y + Math.sin(i) * 1.5, 7, 4.2, 0, 0, Math.PI * 2)
    g.fill()
  }
}

function drawTree(g, x, y, season, v) {
  const P = PAL[season]
  g.fillStyle = 'rgba(0,0,0,0.2)'
  g.beginPath(); g.ellipse(x, y, 16, 5, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#7a5230'
  g.fillRect(x - 3, y - 20, 6, 20)
  g.strokeStyle = 'rgba(40,25,10,0.5)'
  g.lineWidth = 1
  g.strokeRect(x - 3, y - 20, 6, 20)
  if (season === 3) {
    g.strokeStyle = '#6a4a2c'
    g.lineWidth = 2.5
    for (const [dx, dy] of [[-12, -34], [0, -42], [12, -34], [-6, -30], [7, -28]]) {
      g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + dx, y + dy + 6); g.stroke()
    }
    snowCap(g, x - 18, y - 30, 36)
    return
  }
  const cols = season === 0 && v !== 1 ? P.leaf : season === 0 ? P.green : P.leaf
  const blobs = [[-9, -30, 13], [9, -30, 13], [0, -40, 14], [-3, -26, 12], [6, -24, 11]]
  blobs.forEach(([dx, dy, r], i) => {
    g.fillStyle = cols[i % cols.length]
    g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill()
  })
  g.fillStyle = 'rgba(255,255,255,0.18)'
  g.beginPath(); g.arc(x - 6, y - 44, 6, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.12)'
  g.lineWidth = 1
  blobs.forEach(([dx, dy, r]) => { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.stroke() })
}

function drawPine(g, x, y, season) {
  g.fillStyle = 'rgba(0,0,0,0.2)'
  g.beginPath(); g.ellipse(x, y, 14, 4.5, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#6a4a2c'
  g.fillRect(x - 2.5, y - 12, 5, 12)
  for (let i = 0; i < 3; i++) {
    const w = 17 - i * 3.5
    const ty = y - 12 - i * 13
    g.fillStyle = season === 3 ? '#4f7a62' : '#2f7a4a'
    g.beginPath(); g.moveTo(x - w, ty); g.lineTo(x + w, ty); g.lineTo(x, ty - 20); g.closePath(); g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1; g.stroke()
    if (season === 3) {
      g.fillStyle = 'rgba(255,255,255,0.92)'
      g.beginPath(); g.moveTo(x - w * 0.62, ty - 7); g.lineTo(x + w * 0.62, ty - 7); g.lineTo(x, ty - 20); g.closePath(); g.fill()
    }
  }
}

function drawHanok(g, p, season, t) {
  const x = p.c * TILE
  const y = p.r * TILE
  const w = p.w * TILE
  const h = p.h * TILE
  const v = p.variant
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.2)'
  g.beginPath(); g.ellipse(x + w / 2 + 4, y + h + 2, w * 0.52, 7, 0, 0, Math.PI * 2); g.fill()
  const roofB = y + h * 0.54 // 처마 끝 높이
  // 벽
  rr(g, x + 6, roofB - 6, w - 12, h - (roofB - y) + 2, 2, v === 'home' ? '#efe2c8' : '#f3ead6', 'rgba(80,50,25,0.6)')
  g.fillStyle = '#9a9488' // 기단석
  g.fillRect(x + 4, y + h - 6, w - 8, 6)
  // 기둥
  g.fillStyle = v === 'temple' ? '#b8402e' : '#7a4a28'
  const posts = Math.max(3, p.w + 1)
  for (let i = 0; i <= posts - 1; i++) g.fillRect(x + 6 + (i * (w - 16)) / (posts - 1), roofB - 4, 4, h - (roofB - y) - 4)
  // 문 (한지 격자)
  const dw = 50
  const dx = x + w / 2 - dw / 2
  const dy = roofB + 8
  const dh = y + h - dy - 6
  rr(g, dx, dy, dw, dh, 2, '#fbf6e6', '#5a3a1e', 2)
  g.strokeStyle = '#7a5a3a'
  g.lineWidth = 1.2
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(dx + (dw * i) / 4, dy); g.lineTo(dx + (dw * i) / 4, dy + dh); g.stroke() }
  for (let j = 1; j < 3; j++) { g.beginPath(); g.moveTo(dx, dy + (dh * j) / 3); g.lineTo(dx + dw, dy + (dh * j) / 3); g.stroke() }
  g.beginPath(); g.moveTo(dx + dw / 2, dy); g.lineTo(dx + dw / 2, dy + dh); g.lineWidth = 2; g.stroke()
  // 양옆 창
  for (const wx of [x + 18, x + w - 18 - 22]) {
    if (wx + 22 > dx - 4 && wx < dx + dw + 4) continue
    rr(g, wx, dy + 2, 22, dh - 8, 2, '#fbf6e6', '#5a3a1e', 1.5)
    g.strokeStyle = '#7a5a3a'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(wx + 11, dy + 2); g.lineTo(wx + 11, dy + dh - 6); g.moveTo(wx, dy + dh / 2 - 2); g.lineTo(wx + 22, dy + dh / 2 - 2); g.stroke()
  }
  // 지붕
  const roof = p.roof
  g.beginPath()
  g.moveTo(x + 18, y + 2)
  g.lineTo(x + w - 18, y + 2)
  g.quadraticCurveTo(x + w - 4, y + h * 0.4, x + w + 12, roofB - 2)
  g.quadraticCurveTo(x + w / 2, roofB + 12, x - 12, roofB - 2)
  g.quadraticCurveTo(x + 4, y + h * 0.4, x + 18, y + 2)
  g.closePath()
  g.fillStyle = roof
  g.fill()
  g.save()
  g.clip()
  g.strokeStyle = 'rgba(0,0,0,0.22)'
  g.lineWidth = 1.2
  for (let i = -12; i < w + 14; i += 7) { g.beginPath(); g.moveTo(x + i, y + 2); g.lineTo(x + i + (i - w / 2) * 0.16, roofB + 12); g.stroke() }
  for (let j = y + 10; j < roofB + 12; j += 9) { g.beginPath(); g.moveTo(x - 14, j); g.lineTo(x + w + 14, j); g.stroke() }
  const hl = g.createLinearGradient(0, y, 0, roofB + 12)
  hl.addColorStop(0, 'rgba(255,255,255,0.22)')
  hl.addColorStop(0.5, 'rgba(255,255,255,0)')
  hl.addColorStop(1, 'rgba(0,0,0,0.2)')
  g.fillStyle = hl
  g.fillRect(x - 14, y, w + 28, h)
  g.restore()
  g.strokeStyle = 'rgba(30,20,15,0.65)'
  g.lineWidth = 1.6
  g.stroke()
  // 용마루
  g.fillStyle = 'rgba(30,24,22,0.8)'
  g.beginPath(); g.roundRect(x + 14, y - 1, w - 28, 6, 3); g.fill()
  if (v === 'temple') {
    g.fillStyle = '#e8c04a'
    g.beginPath(); g.arc(x + w / 2, y - 4, 5, 0, Math.PI * 2); g.fill()
    g.fillRect(x + w / 2 - 1, y - 14, 2, 10)
    for (const s of [-1, 1]) { g.beginPath(); g.arc(x + w / 2 + s * (w / 2 - 20), y + 1, 4, 0, Math.PI * 2); g.fill() }
  }
  // 계절 장식 (지붕)
  if (season === 3) {
    snowCap(g, x + 14, y + 4, w - 28)
    snowCap(g, x + 6, y + h * 0.22, w - 12)
  } else if (season === 2) {
    g.fillStyle = '#e0742a'
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + 20 + hash(p.c, i) * (w - 40), y + 12 + hash(p.r, i + 3) * 28, 2.4, 0, Math.PI * 2); g.fill() }
  } else if (season === 0) {
    g.fillStyle = '#ffc6d6'
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + 20 + hash(p.c, i + 9) * (w - 40), y + 12 + hash(p.r, i + 5) * 28, 2.2, 0, Math.PI * 2); g.fill() }
  }
  // 처마 아래 그림자
  g.fillStyle = 'rgba(0,0,0,0.16)'
  g.fillRect(x + 6, roofB + 2, w - 12, 5)
  // 간판
  g.font = 'bold 14px "Apple SD Gothic Neo","Malgun Gothic",sans-serif'
  const tw = g.measureText(p.label).width + 18
  const sx = x + w / 2 - tw / 2
  rr(g, sx, y + h * 0.54 - 16 + 14, tw, 20, 4, v === 'temple' ? '#2a3a3e' : '#3a2a1c', '#e8c878', 1.4)
  g.fillStyle = '#ffe9a8'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(p.label, x + w / 2, y + h * 0.54 - 16 + 24.5)
  g.textBaseline = 'alphabetic'
  // 건물 종류별 포인트
  if (v === 'school') {
    rr(g, x + w - 30, y + h - 22, 18, 14, 2, '#8a5a30', '#4a2a10', 1)
    g.fillStyle = '#e8d8a8'
    g.fillRect(x + w - 27, y + h - 19, 12, 3)
    g.fillStyle = '#6a8ac0'
    g.fillRect(x + w - 27, y + h - 15, 12, 3)
  } else if (v === 'dojo') {
    g.fillStyle = '#e04a3a'
    g.fillRect(x + 10, y + h - 36, 3, 30)
    g.beginPath(); g.moveTo(x + 13, y + h - 36); g.lineTo(x + 30, y + h - 30); g.lineTo(x + 13, y + h - 24); g.closePath(); g.fill()
  } else if (v === 'temple') {
    // 연등
    for (const lx of [x + 28, x + w - 28]) {
      g.strokeStyle = '#5a3a1e'; g.lineWidth = 1.2
      g.beginPath(); g.moveTo(lx, roofB + 2); g.lineTo(lx, roofB + 10); g.stroke()
      g.fillStyle = '#ff6a6a'
      g.beginPath(); g.ellipse(lx, roofB + 17, 6, 8, 0, 0, Math.PI * 2); g.fill()
      g.strokeStyle = 'rgba(80,20,20,0.5)'; g.stroke()
    }
  } else if (v === 'atelier') {
    g.fillStyle = '#fff'
    g.fillRect(x + 12, y + h - 40, 20, 26)
    g.strokeStyle = '#8a5a30'; g.lineWidth = 1.5; g.strokeRect(x + 12, y + h - 40, 20, 26)
    g.fillStyle = '#6aa0d8'; g.fillRect(x + 14, y + h - 38, 16, 8)
    g.fillStyle = '#e07a6a'; g.beginPath(); g.arc(x + 22, y + h - 22, 5, 0, Math.PI * 2); g.fill()
  }
  void t
}

export function drawProp(g, p, t, season) {
  const x = p.c * TILE
  const y = p.r * TILE
  const w = p.w * TILE
  const h = p.h * TILE
  const sh = (ox, oy, rx, ry) => { g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2); g.fill() }
  switch (p.kind) {
    case 'hanok': {
      drawHanok(g, p, season, t)
      if (p.variant === 'home') {
        // 굴뚝 + 연기
        g.fillStyle = '#8a7a6a'
        g.fillRect(x + w - 46, y - 8, 12, 16)
      }
      break
    }
    case 'smoke': {
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.35 + i * 0.25) % 1
        g.fillStyle = `rgba(235,235,240,${0.55 * (1 - k)})`
        g.beginPath(); g.arc(x + 10 + 2 * TILE - 24 + Math.sin(k * 6 + i) * 5, y - 10 - k * 40, 4 + k * 8, 0, Math.PI * 2); g.fill()
      }
      break
    }
    case 'tree': drawTree(g, x + 16, y + 30, season, p.v || 0); break
    case 'pine': drawPine(g, x + 16, y + 30, season); break
    case 'well': {
      sh(x + 18, y + 29, 17, 5)
      g.fillStyle = '#9a948a'
      g.beginPath(); g.ellipse(x + 16, y + 22, 14, 9, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#3a5a78'
      g.beginPath(); g.ellipse(x + 16, y + 21, 10, 6, 0, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#6a645c'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x + 16, y + 22, 14, 9, 0, 0, Math.PI * 2); g.stroke()
      g.fillStyle = '#7a4a28'
      g.fillRect(x + 3, y + 2, 3, 22); g.fillRect(x + 26, y + 2, 3, 22); g.fillRect(x + 2, y + 1, 28, 4)
      g.fillStyle = '#a8662c'; g.fillRect(x + 12, y + 5, 8, 7)
      break
    }
    case 'jars': {
      sh(x + 17, y + 30, 14, 4)
      for (const [dx, s] of [[8, 1], [22, 0.8]]) {
        g.fillStyle = '#9a5a30'
        g.beginPath(); g.ellipse(x + dx, y + 20, 8 * s, 10 * s, 0, 0, Math.PI * 2); g.fill()
        g.fillStyle = '#7a4222'; g.fillRect(x + dx - 5 * s, y + 8 * s + 4, 10 * s, 4)
        g.strokeStyle = 'rgba(40,20,10,0.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + dx, y + 20, 8 * s, 10 * s, 0, 0, Math.PI * 2); g.stroke()
      }
      break
    }
    case 'flowers': {
      const cols = season === 0 ? ['#ff9ec0', '#fff27a', '#ffffff'] : season === 1 ? ['#ff7a7a', '#ffe36a', '#ff9ad8'] : season === 2 ? ['#d9562a', '#eaa332', '#c06a3a'] : ['#ffffff', '#dbe8f4', '#ffffff']
      for (let i = 0; i < 7; i++) {
        const fx = x + 4 + hash(p.c, p.r, i) * 24
        const fy = y + 8 + hash(p.r, p.c, i + 5) * 20
        g.strokeStyle = season === 3 ? '#9ab0c4' : '#3f8a3a'; g.lineWidth = 1.4
        g.beginPath(); g.moveTo(fx, fy + 5); g.lineTo(fx, fy + 1); g.stroke()
        g.fillStyle = cols[i % 3]
        g.beginPath(); g.arc(fx, fy, 2.8, 0, Math.PI * 2); g.fill()
      }
      break
    }
    case 'stall': {
      sh(x + w / 2 + 2, y + h - 2, w * 0.5, 6)
      // 탁자와 물건
      rr(g, x + 3, y + 30, w - 6, 26, 3, '#a8763c', '#5a3a1a', 1.5)
      const gk = p.goods
      for (let i = 0; i < 5; i++) {
        const gx = x + 10 + i * ((w - 22) / 4)
        if (gk === 'fruit') { g.fillStyle = i % 2 ? '#e0453a' : '#f0a030'; g.beginPath(); g.arc(gx, y + 38, 5.5, 0, Math.PI * 2); g.fill() }
        else if (gk === 'fish') { g.fillStyle = '#b8d0e0'; g.beginPath(); g.ellipse(gx, y + 39, 7, 3.4, 0.2, 0, Math.PI * 2); g.fill(); g.fillStyle = '#6a8aa8'; g.beginPath(); g.moveTo(gx + 7, y + 39); g.lineTo(gx + 12, y + 35); g.lineTo(gx + 12, y + 43); g.fill() }
        else if (gk === 'cloth') { g.fillStyle = ['#e0506a', '#5a8ad0', '#f0c040', '#5ab07a', '#c070d0'][i]; g.fillRect(gx - 5, y + 33, 10, 11) }
        else { g.fillStyle = '#c0764a'; g.beginPath(); g.ellipse(gx, y + 40, 5, 6.5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8a4a2a'; g.fillRect(gx - 3, y + 33, 6, 3) }
      }
      // 기둥 + 차양
      g.fillStyle = '#6a4a28'
      g.fillRect(x + 3, y + 8, 3, 24); g.fillRect(x + w - 6, y + 8, 3, 24)
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#fff6e6' : p.color
        g.beginPath()
        g.moveTo(x + (i * w) / 8, y + 4)
        g.lineTo(x + ((i + 1) * w) / 8, y + 4)
        g.lineTo(x + ((i + 1) * w) / 8 + 1, y + 22)
        g.lineTo(x + (i * w) / 8 - 1, y + 22)
        g.closePath(); g.fill()
      }
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.strokeRect(x, y + 4, w, 18)
      if (season === 3) snowCap(g, x + 2, y + 4, w - 4)
      break
    }
    case 'crate': { sh(x + 18, y + 30, 14, 4); rr(g, x + 3, y + 10, 26, 20, 2, '#b8864c', '#5a3a1a', 1.5); g.strokeStyle = '#7a5a2a'; g.beginPath(); g.moveTo(x + 3, y + 20); g.lineTo(x + 29, y + 20); g.stroke(); break }
    case 'haystack': { sh(x + 17, y + 30, 15, 4); g.fillStyle = '#e0c060'; g.beginPath(); g.moveTo(x + 2, y + 30); g.quadraticCurveTo(x + 4, y + 4, x + 16, y + 3); g.quadraticCurveTo(x + 28, y + 4, x + 30, y + 30); g.closePath(); g.fill(); g.strokeStyle = 'rgba(120,80,20,0.5)'; g.lineWidth = 1; g.stroke(); break }
    case 'lantern': {
      sh(x + 17, y + 30, 11, 3)
      g.fillStyle = '#9a948a'; g.fillRect(x + 9, y + 24, 14, 6); g.fillRect(x + 13, y + 14, 6, 10)
      g.fillStyle = '#b4aea4'; g.fillRect(x + 8, y + 5, 16, 9)
      g.fillStyle = '#ffe9a0'; g.fillRect(x + 11, y + 7, 10, 5)
      g.fillStyle = '#8a847a'; g.fillRect(x + 6, y + 2, 20, 4)
      g.strokeStyle = 'rgba(40,40,40,0.4)'; g.lineWidth = 1; g.strokeRect(x + 8, y + 5, 16, 9)
      if (season === 3) snowCap(g, x + 6, y + 2, 20)
      break
    }
    case 'books': {
      sh(x + 16, y + 28, 12, 3)
      const cs = ['#c0504a', '#4a7ac0', '#e0b040', '#5aa070']
      cs.forEach((c, i) => { g.fillStyle = c; g.fillRect(x + 6, y + 24 - i * 5, 20 - (i % 2) * 3, 5); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.8; g.strokeRect(x + 6, y + 24 - i * 5, 20 - (i % 2) * 3, 5) })
      break
    }
    case 'dummy': {
      sh(x + 16, y + 30, 12, 4)
      g.fillStyle = '#7a5230'; g.fillRect(x + 13, y + 6, 6, 24)
      g.fillStyle = '#c0a060'; g.fillRect(x + 6, y + 12, 20, 6)
      g.strokeStyle = '#5a3a1a'; g.lineWidth = 1; g.strokeRect(x + 6, y + 12, 20, 6)
      g.fillStyle = '#e8d0a0'; g.beginPath(); g.arc(x + 16, y + 6, 6, 0, Math.PI * 2); g.fill(); g.stroke()
      break
    }
    case 'rack': {
      sh(x + 16, y + 30, 12, 3)
      g.fillStyle = '#6a4a28'; g.fillRect(x + 4, y + 10, 24, 4); g.fillRect(x + 6, y + 10, 3, 20); g.fillRect(x + 23, y + 10, 3, 20)
      g.strokeStyle = '#c8c8d0'; g.lineWidth = 2.5
      for (const dx of [11, 16, 21]) { g.beginPath(); g.moveTo(x + dx, y + 28); g.lineTo(x + dx + 1, y + 2); g.stroke() }
      break
    }
    case 'easel': {
      sh(x + 16, y + 30, 12, 3)
      g.strokeStyle = '#7a5230'; g.lineWidth = 3
      g.beginPath(); g.moveTo(x + 6, y + 30); g.lineTo(x + 14, y + 6); g.moveTo(x + 26, y + 30); g.lineTo(x + 18, y + 6); g.stroke()
      g.fillStyle = '#fff'; g.fillRect(x + 7, y + 8, 18, 15); g.strokeStyle = '#8a5a30'; g.lineWidth = 1.5; g.strokeRect(x + 7, y + 8, 18, 15)
      g.fillStyle = '#7ab4e8'; g.fillRect(x + 9, y + 10, 14, 6); g.fillStyle = '#6aaa5a'; g.fillRect(x + 9, y + 16, 14, 5)
      break
    }
    case 'rock': { sh(x + 17, y + 29, 14, 4); g.fillStyle = '#9a9ca4'; g.beginPath(); g.ellipse(x + 16, y + 22, 13, 9, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(x + 12, y + 18, 6, 3, 0, 0, Math.PI * 2); g.fill(); if (season === 3) snowCap(g, x + 6, y + 15, 20); break }
    case 'dock': {
      for (let i = 0; i < p.w * 4; i++) {
        g.fillStyle = i % 2 ? '#a8763c' : '#9a6a34'
        g.fillRect(x + 28 + i * 8 - 28 + 0, y + 4, 8, h - 8)
        g.strokeStyle = 'rgba(50,30,10,0.5)'; g.lineWidth = 1; g.strokeRect(x + i * 8, y + 4, 8, h - 8)
      }
      g.fillStyle = '#5a3a1a'
      for (const px2 of [x + 6, x + w - 8]) for (const py2 of [y + 2, y + h - 6]) g.fillRect(px2, py2, 4, 8)
      if (season === 3) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x, y + 4, w, 6) }
      break
    }
    case 'boat': {
      const bob = Math.sin(t * 1.6) * 1.5
      g.fillStyle = '#8a5a30'
      g.beginPath(); g.moveTo(x + 4, y + 8 + bob); g.lineTo(x + w - 4, y + 8 + bob); g.quadraticCurveTo(x + w - 14, y + 28 + bob, x + w / 2, y + 28 + bob); g.quadraticCurveTo(x + 14, y + 28 + bob, x + 4, y + 8 + bob); g.fill()
      g.strokeStyle = '#4a2a10'; g.lineWidth = 1.5; g.stroke()
      g.fillStyle = '#c8a060'; g.fillRect(x + 22, y + 2 + bob, 46, 8)
      g.strokeStyle = '#6a4a28'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w - 14, y - 4 + bob); g.lineTo(x + w + 4, y + 22 + bob); g.stroke()
      break
    }
    case 'reeds': {
      g.strokeStyle = season === 3 ? '#cdb98a' : season === 2 ? '#b89a4a' : '#5a9a4a'; g.lineWidth = 2
      for (let i = 0; i < 6; i++) { const rx = x + 6 + i * 4; g.beginPath(); g.moveTo(rx, y + 30); g.quadraticCurveTo(rx + Math.sin(t + i) * 2, y + 14, rx + (i - 3) * 2, y + 4); g.stroke(); g.fillStyle = '#8a5a30'; g.fillRect(rx + (i - 3) * 2 - 1.5, y + 2, 3, 7) }
      break
    }
    default: break
  }
}
