// Top-down investigation mode for 모순 탐정: walk the detective around the
// rainy crime scene (corridor, office, safe room, lobby), look for the six
// clues and talk to everyone. It plugs into the same evidence/dialogue
// machinery as the classic click-to-investigate scene.

import { drawPerson, drawEmote } from './people.js'

const T = 32
const COLS = 44
const ROWS = 28
const WORLD_W = COLS * T
const WORLD_H = ROWS * T

const hash = (a, b, k = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

const LOOKS = {
  seojin: { skin: '#f4cba2', hair: '#2a2a32', hairStyle: 'messy', shirt: '#b79a6a', pants: '#3a3a46', shoes: '#2a2020', eye: '#3a5a8a', outfit: 'coat', coatLegs: '#3a3a46', hat: 'fedora' },
  hana: { skin: '#f6d2b0', hair: '#c8782a', hairStyle: 'bun', shirt: '#ffb44d', pants: '#6a4a3a', shoes: '#4a3020', eye: '#7a4a2a', outfit: 'dress' },
  minji: { skin: '#f2c79b', hair: '#4a2a24', hairStyle: 'bob', shirt: '#4fae7a', pants: '#3a4a5a', shoes: '#2a2a2a', eye: '#3f8f5a', outfit: 'apron' },
  park: { skin: '#e8b48f', hair: '#6a6a70', hairStyle: 'short', shirt: '#2f3f66', pants: '#2a2f3a', shoes: '#1a1a1a', eye: '#4a4a4a', outfit: 'coat', coatLegs: '#2a2f3a' },
  choi: { skin: '#f0c9a0', hair: '#8a8a90', hairStyle: 'short', shirt: '#8a6a4a', pants: '#3a3030', shoes: '#2a2020', eye: '#4a3a2a', outfit: 'coat', coatLegs: '#3a3030', glasses: true },
}

// ------------------------------------------------------------------ world ----
// Rooms are carved out of solid wall. kind decides the floor art.
const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1))
const kindAt = Array.from({ length: ROWS }, () => Array(COLS).fill(''))
function carve(c0, r0, c1, r1, kind) {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      grid[r][c] = 0
      kindAt[r][c] = kind
    }
}
carve(1, 2, 8, 26, 'corr') // west corridor
carve(10, 2, 30, 19, 'office')
carve(32, 2, 42, 13, 'safe')
carve(10, 21, 42, 26, 'lobby')
carve(9, 9, 9, 10, 'corr') // corridor <-> office
carve(9, 23, 9, 24, 'corr') // corridor <-> lobby
carve(31, 8, 31, 9, 'office') // office <-> safe room
carve(18, 20, 19, 20, 'office') // office <-> lobby

// Furniture. `hot` marks clue props; solid ones block walking.
const PROPS = [
  // office
  { kind: 'mainDesk', c: 18, r: 8, w: 6, h: 3, hot: 'desk' },
  { kind: 'desk', c: 12, r: 5, w: 3, h: 2 },
  { kind: 'desk', c: 12, r: 12, w: 3, h: 2 },
  { kind: 'desk', c: 26, r: 12, w: 3, h: 2 },
  { kind: 'cctvDesk', c: 25, r: 3, w: 4, h: 2, hot: 'cctv' },
  { kind: 'cabinet', c: 11, r: 3, w: 2, h: 1 },
  { kind: 'plant', c: 29, r: 18, w: 1, h: 1 },
  { kind: 'plant', c: 10, r: 18, w: 1, h: 1 },
  { kind: 'sofa', c: 23, r: 16, w: 4, h: 2 },
  // corridor
  { kind: 'umbrella', c: 7, r: 12, w: 1, h: 1, hot: 'umbrella' },
  { kind: 'bench', c: 2, r: 15, w: 1, h: 3 },
  { kind: 'plant', c: 2, r: 4, w: 1, h: 1 },
  { kind: 'bin', c: 7, r: 18, w: 1, h: 1 },
  { kind: 'elevator', c: 2, r: 25, w: 3, h: 1, decor: true },
  // safe room
  { kind: 'safe', c: 36, r: 2, w: 3, h: 2, hot: 'safe' },
  { kind: 'boxes', c: 33, r: 10, w: 2, h: 2 },
  { kind: 'shelf', c: 40, r: 3, w: 2, h: 1 },
  { kind: 'desk', c: 38, r: 9, w: 3, h: 2 },
  // lobby
  { kind: 'bench', c: 14, r: 22, w: 3, h: 1 },
  { kind: 'vending', c: 40, r: 22, w: 2, h: 1 },
  { kind: 'plant', c: 12, r: 25, w: 1, h: 1 },
  { kind: 'plant', c: 41, r: 25, w: 1, h: 1 },
]
for (const p of PROPS) {
  if (p.decor) continue
  for (let r = p.r; r < p.r + p.h; r++) for (let c = p.c; c < p.c + p.w; c++) grid[r][c] = 1
}

// Wall-mounted clues (the wall tile itself is solid, you stand next to it).
const WALL_CLUES = {
  window: { x: 14.5 * T, y: 2.4 * T, stand: { x: 14.5 * T, y: 3.6 * T } },
  keycard: { x: 9.5 * T, y: 7.5 * T, stand: { x: 8.2 * T, y: 7.5 * T } },
}

// where the player/people can interact with each clue
function clueSpot(id) {
  if (WALL_CLUES[id]) return WALL_CLUES[id].stand
  const p = PROPS.find((q) => q.hot === id)
  return { x: (p.c + p.w / 2) * T, y: (p.r + p.h + 0.6) * T }
}

const LAMPS = [
  { x: 4.5 * T, y: 6 * T, r: 140 },
  { x: 4.5 * T, y: 14 * T, r: 140 },
  { x: 4.5 * T, y: 22 * T, r: 140 },
  { x: 16 * T, y: 6 * T, r: 190 },
  { x: 24 * T, y: 11 * T, r: 210 },
  { x: 27 * T, y: 5 * T, r: 150 },
  { x: 20 * T, y: 17 * T, r: 170 },
  { x: 37 * T, y: 6 * T, r: 170 },
  { x: 36 * T, y: 11 * T, r: 120 },
  { x: 16 * T, y: 23.5 * T, r: 170 },
  { x: 28 * T, y: 23.5 * T, r: 190 },
  { x: 40 * T, y: 23.5 * T, r: 150 },
]

function canStand(x, y, half = 9) {
  for (const [px, py] of [[x - half, y - 6], [x + half, y - 6], [x - half, y + 2], [x + half, y + 2]]) {
    const c = Math.floor(px / T)
    const r = Math.floor(py / T)
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS || grid[r][c]) return false
  }
  return true
}

// ------------------------------------------------------------ static art ----
let ground = null
function buildGround() {
  const c = document.createElement('canvas')
  c.width = WORLD_W
  c.height = WORLD_H
  const g = c.getContext('2d')
  g.fillStyle = '#0a0d14'
  g.fillRect(0, 0, WORLD_W, WORLD_H)
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * T
      const y = r * T
      const k = kindAt[r][col]
      if (!grid[r][col]) {
        const h = hash(col, r)
        if (k === 'corr') {
          g.fillStyle = (col + r) % 2 ? '#8a8f98' : '#838891'
          g.fillRect(x, y, T, T)
          g.strokeStyle = 'rgba(0,0,0,0.18)'
          g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)
        } else if (k === 'office') {
          g.fillStyle = h > 0.5 ? '#5a6a86' : '#566680'
          g.fillRect(x, y, T, T)
          g.fillStyle = 'rgba(255,255,255,0.04)'
          g.fillRect(x, y, T, 2)
        } else if (k === 'safe') {
          g.fillStyle = (col + r) % 2 ? '#4a4d58' : '#44474f'
          g.fillRect(x, y, T, T)
          g.strokeStyle = 'rgba(0,0,0,0.3)'
          g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)
        } else {
          g.fillStyle = (col + r) % 2 ? '#a89a82' : '#9e9078'
          g.fillRect(x, y, T, T)
          g.strokeStyle = 'rgba(70,50,20,0.25)'
          g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)
        }
        // soft wall shadow along the north edge of a room
        if (grid[r - 1] && grid[r - 1][col]) {
          g.fillStyle = 'rgba(0,0,0,0.28)'
          g.fillRect(x, y, T, 8)
        }
      } else {
        // wall: the face you can see (open floor to the south) is lighter
        const faceVisible = r + 1 < ROWS && !grid[r + 1][col]
        g.fillStyle = faceVisible ? '#2e3648' : '#1a1f2c'
        g.fillRect(x, y, T, T)
        if (faceVisible) {
          g.fillStyle = 'rgba(255,255,255,0.06)'
          g.fillRect(x, y, T, 3)
          g.fillStyle = 'rgba(0,0,0,0.35)'
          g.fillRect(x, y + T - 6, T, 6)
          g.strokeStyle = 'rgba(255,255,255,0.05)'
          g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)
        }
      }
    }
  }
  // office rug
  g.fillStyle = 'rgba(120,60,70,0.55)'
  g.beginPath()
  g.roundRect(16 * T, 6 * T, 9 * T, 8 * T, 18)
  g.fill()
  g.strokeStyle = 'rgba(255,230,200,0.25)'
  g.lineWidth = 3
  g.strokeRect(16.4 * T, 6.4 * T, 8.2 * T, 7.2 * T)
  // door mats / thresholds
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.fillRect(9 * T, 9 * T, 3, 2 * T)
  g.fillRect(31 * T, 8 * T, 3, 2 * T)
  // hazard tape on the safe room door (a crime scene!)
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? '#e8c040' : '#222'
    g.fillRect(31 * T - 2, 8 * T + i * 11, 6, 11)
  }
  // dark stain near the desk: where the "burglar" went through the papers
  g.fillStyle = 'rgba(30,20,30,0.18)'
  g.beginPath()
  g.ellipse(21 * T, 12 * T, 70, 28, 0.2, 0, Math.PI * 2)
  g.fill()
  // window glass in the north office wall
  g.fillStyle = '#1c2a44'
  g.fillRect(13 * T, 1 * T + 4, 4 * T, T - 10)
  g.fillStyle = 'rgba(160,200,255,0.25)'
  g.fillRect(13 * T, 1 * T + 4, 4 * T, 5)
  g.fillStyle = '#10151f'
  for (const x of [14 * T, 15 * T, 16 * T]) g.fillRect(x - 1, 1 * T + 4, 3, T - 10)
  // security-door label
  g.fillStyle = '#e8c86a'
  g.font = 'bold 11px sans-serif'
  g.textAlign = 'center'
  g.fillText('사무실', 9.5 * T, 8.6 * T)
  g.fillText('금고실', 31.5 * T, 7.6 * T)
  g.fillText('복도', 4.5 * T, 2.7 * T)
  return c
}

function shadowRect(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.roundRect(x + 4, y + 6, w, h, 6)
  ctx.fill()
}

// A piece of furniture seen from slightly above: a top face and a front face.
function slab(ctx, x, y, w, h, depth, topC, frontC, edge = 'rgba(0,0,0,0.5)') {
  ctx.fillStyle = frontC
  ctx.fillRect(x, y + h - depth, w, depth)
  ctx.fillStyle = topC
  ctx.beginPath()
  ctx.roundRect(x, y - depth, w, h, 4)
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.4
  ctx.strokeRect(x, y - depth, w, h + depth)
}

function drawProp(ctx, p, t, ex) {
  const x = p.c * T
  const y = p.r * T
  const w = p.w * T
  const h = p.h * T
  switch (p.kind) {
    case 'desk': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 2, y + 6, w - 4, h - 8, 12, '#a07a4c', '#7a5834')
      ctx.fillStyle = '#10151f'
      ctx.fillRect(x + w * 0.5 - 12, y - 14, 24, 14)
      ctx.fillStyle = '#4a8ad8'
      ctx.fillRect(x + w * 0.5 - 10, y - 12, 20, 10)
      ctx.fillStyle = '#e8e4d8'
      ctx.fillRect(x + 8, y - 4, 14, 9)
      ctx.fillStyle = '#c0392b'
      ctx.fillRect(x + w - 16, y, 6, 6)
      break
    }
    case 'mainDesk': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 2, y + 8, w - 4, h - 10, 16, '#b88a56', '#8a6238')
      // papers: swept off to one side, a few fallen on the floor
      ctx.fillStyle = '#f2efe4'
      for (let i = 0; i < 7; i++) {
        ctx.save()
        ctx.translate(x + w - 26 - (i % 3) * 8, y - 2 + i * 3)
        ctx.rotate(0.3 + i * 0.12)
        ctx.fillRect(-9, -6, 18, 12)
        ctx.restore()
      }
      for (let i = 0; i < 3; i++) {
        ctx.save()
        ctx.translate(x + w + 6 + i * 10, y + h - 6 + i * 6)
        ctx.rotate(0.6 - i * 0.5)
        ctx.fillStyle = '#e6e2d6'
        ctx.fillRect(-9, -6, 18, 12)
        ctx.restore()
      }
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x + 28, y - 4, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#6a4a38'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#10151f'
      ctx.fillRect(x + 56, y - 22, 34, 20)
      ctx.fillStyle = '#5a9ae8'
      ctx.fillRect(x + 58, y - 20, 30, 14)
      break
    }
    case 'cctvDesk': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x, y + 4, w, h - 6, 12, '#454c5a', '#2c313c')
      for (const [mx, c] of [[x + 8, 0], [x + w / 2 + 2, 1]]) {
        ctx.fillStyle = '#10141a'
        ctx.fillRect(mx, y - 30, w / 2 - 12, 26)
        ctx.fillStyle = '#9ad0b0'
        const flick = Math.sin(t * 9 + c) > 0.94 ? 0.5 : 0.9
        ctx.globalAlpha = flick
        ctx.fillRect(mx + 2, y - 28, w / 2 - 16, 22)
        ctx.globalAlpha = 1
        // grainy shelves and a tiny figure: the convenience store feed
        ctx.fillStyle = 'rgba(20,60,40,0.7)'
        ctx.fillRect(mx + 5, y - 24, w / 2 - 22, 3)
        ctx.fillRect(mx + 5, y - 16, w / 2 - 22, 3)
        ctx.fillRect(mx + 18 + ((t * 8) % 14), y - 24, 4, 14)
      }
      ctx.fillStyle = '#e04a3a'
      ctx.beginPath()
      ctx.arc(x + w - 10, y + 6, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'cabinet': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 2, y + 4, w - 4, h - 4, 22, '#7a8290', '#5a6270')
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(x + 6 + i * ((w - 12) / 4), y - 18, (w - 12) / 4 - 2, 20)
        ctx.fillStyle = '#c8ced8'
        ctx.fillRect(x + 12 + i * ((w - 12) / 4), y - 8, 8, 2)
      }
      break
    }
    case 'plant': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(x + 18, y + 28, 14, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#9a5a3a'
      ctx.fillRect(x + 8, y + 12, 18, 16)
      ctx.fillStyle = '#2f7a3d'
      for (const [dx, dy, r] of [[0, -6, 10], [-8, 0, 8], [8, 0, 8], [0, 4, 8]]) {
        ctx.beginPath()
        ctx.arc(x + 17 + dx, y + 8 + dy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'sofa': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x, y + 6, w, h - 8, 16, '#7a4a58', '#5a3340')
      ctx.fillStyle = '#8a5a68'
      ctx.beginPath()
      ctx.roundRect(x + 4, y - 20, w - 8, 14, 6)
      ctx.fill()
      break
    }
    case 'umbrella': {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.beginPath()
      ctx.ellipse(x + 16, y + 28, 14, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#5a6270'
      ctx.beginPath()
      ctx.roundRect(x + 6, y + 8, 20, 20, 4)
      ctx.fill()
      ctx.strokeStyle = '#2a3040'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // wet umbrellas
      ctx.strokeStyle = '#3a6ac8'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x + 14, y + 10)
      ctx.lineTo(x + 10, y - 14)
      ctx.stroke()
      ctx.strokeStyle = '#2a2a30'
      ctx.beginPath()
      ctx.moveTo(x + 20, y + 10)
      ctx.lineTo(x + 24, y - 10)
      ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.fillStyle = 'rgba(120,180,255,0.55)'
      ctx.beginPath()
      ctx.ellipse(x + 16, y + 30, 8 + Math.sin(t * 2) * 0.6, 2.5, 0, 0, Math.PI * 2)
      ctx.fill()
      // receipt stuck on the handle
      ctx.fillStyle = '#fffbe8'
      ctx.fillRect(x + 21, y - 6, 6, 9)
      break
    }
    case 'bench': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 4, y + 6, w - 8, h - 10, 10, '#8a5a30', '#6a4222')
      break
    }
    case 'bin': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(x + 17, y + 28, 12, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#4a5260'
      ctx.beginPath()
      ctx.roundRect(x + 8, y + 8, 18, 20, 4)
      ctx.fill()
      ctx.strokeStyle = '#2a3040'
      ctx.stroke()
      break
    }
    case 'elevator': {
      ctx.fillStyle = '#4a5260'
      ctx.fillRect(x, y - 2, w, T + 6)
      ctx.fillStyle = '#2a3040'
      ctx.fillRect(x + 8, y, w / 2 - 10, T)
      ctx.fillRect(x + w / 2 + 2, y, w / 2 - 10, T)
      ctx.fillStyle = '#4dff88'
      ctx.fillRect(x + w / 2 - 4, y - 8, 8, 4)
      break
    }
    case 'safe': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 6, y + 10, w - 12, h - 12, 22, '#6a7480', '#454e58')
      // dial and the key left in the lock
      ctx.fillStyle = '#2a3038'
      ctx.beginPath()
      ctx.arc(x + w / 2, y - 6, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#9aa4b0'
      ctx.beginPath()
      ctx.arc(x + w / 2, y - 6, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#d83a2a'
      ctx.fillRect(x + w / 2 - 1, y - 14, 2, 6)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + w - 24, y + 2, 10, 4)
      ctx.fillRect(x + w - 16, y + 2, 3, 8)
      break
    }
    case 'boxes': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 2, y + 6, w / 2 - 2, h / 2, 14, '#b8905a', '#8a6a3a')
      slab(ctx, x + w / 2 + 4, y + h / 2 + 8, w / 2 - 6, h / 2 - 4, 14, '#c89a60', '#9a7440')
      break
    }
    case 'shelf': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 2, y + 4, w - 4, h - 4, 26, '#6a5a48', '#4a3e30')
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = ['#c4553f', '#4a7ab8', '#e8c860', '#5aa86a', '#9a5ac4'][i]
        ctx.fillRect(x + 6 + i * 11, y - 22, 8, 16)
      }
      break
    }
    case 'vending': {
      shadowRect(ctx, x, y, w, h)
      slab(ctx, x + 2, y + 4, w - 4, h - 4, 34, '#d85a5a', '#a03a3a')
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(x + 8, y - 28, w - 20, 22)
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ['#e8452e', '#4a8ad8', '#ffb02a'][i % 3]
        ctx.fillRect(x + 10 + (i % 3) * 14, y - 26 + Math.floor(i / 3) * 10, 8, 8)
      }
      break
    }
  }
  void ex
}

// ------------------------------------------------------------ controller ----
export function createTopview(env) {
  const { ctx, W, H, state, HOTSPOTS, PEOPLE, sounds } = env
  ground = ground || buildGround()

  const tv = {
    x: 4.5 * T,
    y: 24.2 * T,
    facing: 'up',
    walk: 0,
    moving: false,
    cam: { x: 0, y: 0 },
    talking: false,
    near: null,
    held: new Set(),
    last: performance.now(),
    stepT: 0,
    lightning: 0,
    nextLightning: 6,
    npc: {},
    started: false,
  }

  function initNpcs() {
    const place = {
      hana: { x: 5.8 * T, y: 22.2 * T },
      minji: { x: 15.5 * T, y: 24.2 * T },
      park: { x: 6.6 * T, y: 9.8 * T },
      choi: { x: 22.5 * T, y: 14.5 * T },
    }
    for (const [id, p] of Object.entries(place)) {
      tv.npc[id] = { id, x: p.x, y: p.y, hx: p.x, hy: p.y, facing: 'down', walk: 0, moving: false, tx: p.x, ty: p.y, timer: Math.random() * 3 }
    }
    tv.npc.hana.facing = 'up'
    tv.npc.park.facing = 'right'
  }
  initNpcs()

  const minimap = (() => {
    const c = document.createElement('canvas')
    c.width = COLS
    c.height = ROWS
    const g = c.getContext('2d')
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++) {
        const k = kindAt[r][col]
        g.fillStyle = grid[r][col] ? '#0e121b' : k === 'office' ? '#5a6a86' : k === 'safe' ? '#4a4d58' : k === 'lobby' ? '#a89a82' : '#838891'
        g.fillRect(col, r, 1, 1)
      }
    for (const p of PROPS) {
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(p.c, p.r, p.w, p.h)
    }
    return c
  })()

  function reset() {
    tv.x = 4.5 * T
    tv.y = 24.2 * T
    tv.facing = 'up'
    tv.talking = false
    tv.near = null
    initNpcs()
  }

  // ------------------------------------------------------------- input ----
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    tv.held.add(k)
    if (!active()) return
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault()
    if (e.repeat) return
    if (k === ' ' || k === 'e' || k === 'enter') interact()
    else if (k === 'q') think()
  })
  window.addEventListener('keyup', (e) => tv.held.delete(e.key.toLowerCase()))
  window.addEventListener('blur', () => tv.held.clear())

  const active = () => state.phase === 'investigate' && state.invMode === 'top'
  const held = (...ks) => ks.some((k) => tv.held.has(k))

  function think() {
    if (tv.talking) return
    const me = PEOPLE.find((p) => p.isPlayer)
    env.talkTo(me)
    tv.talking = true
  }

  function interact() {
    if (state.filePanel) return
    if (tv.talking) {
      if (!env.lineDone()) env.finishLine()
      else tv.talking = false
      sounds.click()
      return
    }
    const n = tv.near
    if (!n) return
    if (n.type === 'clue') env.examineHotspot(n.obj)
    else env.talkTo(n.obj)
    tv.talking = true
    // people turn to look at the detective
    if (n.type === 'person') {
      const npc = tv.npc[n.obj.id]
      const dx = tv.x - npc.x
      const dy = tv.y - npc.y
      npc.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    }
  }

  // ------------------------------------------------------------ update ----
  function findNear() {
    let best = null
    for (const h of HOTSPOTS) {
      const s = clueSpot(h.id)
      const d = Math.hypot(tv.x - s.x, tv.y - s.y)
      if (d < 58 && (!best || d < best.d)) best = { type: 'clue', obj: h, d }
    }
    for (const p of PEOPLE) {
      if (p.isPlayer) continue
      const npc = tv.npc[p.id]
      const d = Math.hypot(tv.x - npc.x, tv.y - npc.y)
      if (d < 54 && (!best || d - 14 < best.d)) best = { type: 'person', obj: p, d: d - 14 }
    }
    return best
  }

  function update(dt) {
    // wandering people
    for (const npc of Object.values(tv.npc)) {
      if (npc.id === 'choi') {
        npc.timer -= dt
        if (npc.timer <= 0) {
          npc.tx = npc.hx + (Math.random() * 2 - 1) * 90
          npc.ty = npc.hy + (Math.random() * 2 - 1) * 40
          npc.timer = 2 + Math.random() * 3
        }
        const dx = npc.tx - npc.x
        const dy = npc.ty - npc.y
        const d = Math.hypot(dx, dy)
        const talking = tv.talking && tv.near && tv.near.obj.id === 'choi'
        if (d > 3 && !talking) {
          const nx = npc.x + (dx / d) * 36 * dt
          const ny = npc.y + (dy / d) * 36 * dt
          if (canStand(nx, ny, 8) && Math.hypot(nx - tv.x, ny - tv.y) > 22) {
            npc.x = nx
            npc.y = ny
            npc.moving = true
            npc.walk += dt * 6
            npc.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
          } else npc.moving = false
        } else npc.moving = false
      } else if (!(tv.talking && tv.near && tv.near.obj && tv.near.obj.id === npc.id)) {
        const d = Math.hypot(tv.x - npc.x, tv.y - npc.y)
        if (d < 110) {
          const dx = tv.x - npc.x
          const dy = tv.y - npc.y
          npc.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        }
      }
    }

    // the detective
    let dx = 0
    let dy = 0
    const locked = tv.talking || !!state.filePanel
    if (!locked) {
      if (held('a', 'arrowleft')) dx -= 1
      if (held('d', 'arrowright')) dx += 1
      if (held('w', 'arrowup')) dy -= 1
      if (held('s', 'arrowdown')) dy += 1
    }
    tv.moving = dx !== 0 || dy !== 0
    if (tv.moving) {
      if (dx && dy) {
        dx *= Math.SQRT1_2
        dy *= Math.SQRT1_2
      }
      const run = held('shift')
      const sp = run ? 210 : 135
      tv.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      tv.walk += dt * (run ? 14 : 10)
      const nx = tv.x + dx * sp * dt
      const ny = tv.y + dy * sp * dt
      const blockedBy = (x, y) => Object.values(tv.npc).some((n) => Math.hypot(x - n.x, y - n.y) < 18)
      if (canStand(nx, tv.y) && !blockedBy(nx, tv.y)) tv.x = nx
      if (canStand(tv.x, ny) && !blockedBy(tv.x, ny)) tv.y = ny
      tv.stepT += dt * (run ? 14 : 10)
      if (tv.stepT > Math.PI) {
        tv.stepT -= Math.PI
        sounds.step()
      }
    }
    tv.near = locked ? tv.near : findNear()

    // camera
    const tx = Math.max(0, Math.min(WORLD_W - W, tv.x - W / 2))
    const ty = Math.max(0, Math.min(WORLD_H - H, tv.y - H / 2 + 60))
    if (!tv.started) {
      tv.cam.x = tx
      tv.cam.y = ty
      tv.started = true
    }
    const k = Math.min(1, dt * 7)
    tv.cam.x += (tx - tv.cam.x) * k
    tv.cam.y += (ty - tv.cam.y) * k

    // lightning
    tv.nextLightning -= dt
    if (tv.nextLightning <= 0) {
      tv.lightning = 0.55
      tv.nextLightning = 7 + Math.random() * 10
      sounds.thunder()
    }
    if (tv.lightning > 0) tv.lightning = Math.max(0, tv.lightning - dt * 1.6)
  }

  // -------------------------------------------------------------- draw ----
  const dark = document.createElement('canvas')
  dark.width = W
  dark.height = H
  const dctx = dark.getContext('2d')

  function sparkleAt(x, y, t) {
    const k = (Math.sin(t * 4 + x) + 1) / 2
    ctx.save()
    ctx.translate(x, y - 8 + Math.sin(t * 3 + x) * 2)
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26)
    g.addColorStop(0, `rgba(255,222,100,${0.5 + k * 0.3})`)
    g.addColorStop(1, 'rgba(255,222,100,0)')
    ctx.fillStyle = g
    ctx.fillRect(-26, -26, 52, 52)
    ctx.fillStyle = `rgba(255,248,200,${0.7 + k * 0.3})`
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 ? 2.6 : 8
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  function draw(t) {
    const cx = Math.round(tv.cam.x)
    const cy = Math.round(tv.cam.y)
    ctx.fillStyle = '#05070c'
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate(-cx, -cy)
    ctx.drawImage(ground, 0, 0)

    // rain on the office window + a wet trail near the door
    ctx.strokeStyle = 'rgba(190,220,255,0.55)'
    ctx.lineWidth = 1.2
    for (let i = 0; i < 16; i++) {
      const x = 13 * T + ((i * 37) % (4 * T))
      const y = 1 * T + 6 + ((t * 70 + i * 23) % (T - 14))
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 1, y + 7)
      ctx.stroke()
    }
    // wet footprints leading in from the corridor, a clue for the sharp-eyed
    ctx.fillStyle = 'rgba(110,160,230,0.22)'
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.ellipse(8.2 * T + i * 15, 9.7 * T + (i % 2 ? 6 : -4), 4, 7, 0.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // keycard terminal on the corridor wall
    ctx.fillStyle = '#10151f'
    ctx.beginPath()
    ctx.roundRect(8.62 * T, 6.6 * T, 14, 26, 3)
    ctx.fill()
    ctx.fillStyle = '#2a3a4a'
    ctx.fillRect(8.62 * T + 2, 6.6 * T + 3, 10, 8)
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#e04a3a' : '#5a2a2a'
    ctx.beginPath()
    ctx.arc(8.62 * T + 7, 6.6 * T + 19, 2.6, 0, Math.PI * 2)
    ctx.fill()

    // everything standing on the floor, back to front
    const items = []
    for (const p of PROPS) items.push({ y: (p.r + p.h) * T, f: () => drawProp(ctx, p, t, null) })
    for (const p of PEOPLE) {
      if (p.isPlayer) continue
      const n = tv.npc[p.id]
      items.push({ y: n.y, f: () => drawNpc(n, p, t) })
    }
    items.push({ y: tv.y, f: () => drawDetective(t) })
    items.sort((a, b) => a.y - b.y)
    for (const it of items) it.f()

    // clue glints
    for (const h of HOTSPOTS) {
      const s = WALL_CLUES[h.id] ? WALL_CLUES[h.id] : (() => { const sp = clueSpot(h.id); const p = PROPS.find((q) => q.hot === h.id); return { x: (p.c + p.w / 2) * T, y: p.r * T + 10, sp } })()
      if (!h.examined) sparkleAt(s.x, s.y, t)
      else {
        ctx.fillStyle = 'rgba(80,220,140,0.9)'
        ctx.beginPath()
        ctx.arc(s.x, s.y - 14, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(s.x - 4, s.y - 14)
        ctx.lineTo(s.x - 1, s.y - 10)
        ctx.lineTo(s.x + 5, s.y - 18)
        ctx.stroke()
      }
    }
    ctx.restore()

    // darkness with pools of light: a rainy night, only the lamps and the
    // detective's own lantern show the way
    dctx.globalCompositeOperation = 'source-over'
    dctx.clearRect(0, 0, W, H)
    dctx.fillStyle = `rgba(6,10,24,${0.55 - tv.lightning * 0.3})`
    dctx.fillRect(0, 0, W, H)
    dctx.globalCompositeOperation = 'destination-out'
    const lamp = (x, y, r, a = 1) => {
      const g = dctx.createRadialGradient(x - cx, y - cy, 4, x - cx, y - cy, r)
      g.addColorStop(0, `rgba(0,0,0,${a})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      dctx.fillStyle = g
      dctx.fillRect(x - cx - r, y - cy - r, r * 2, r * 2)
    }
    for (const l of LAMPS) {
      const flick = l.x < 9 * T ? 0.85 + Math.sin(t * 11 + l.y) * 0.05 + (Math.sin(t * 2.3 + l.y) > 0.97 ? -0.3 : 0) : 1
      lamp(l.x, l.y, l.r, 0.78 * flick)
    }
    lamp(tv.x, tv.y - 20, 150, 0.95)
    ctx.drawImage(dark, 0, 0)
    // warm tint where the lamps are
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.translate(-cx, -cy)
    for (const l of LAMPS) {
      const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.r * 0.8)
      g.addColorStop(0, 'rgba(255,214,150,0.12)')
      g.addColorStop(1, 'rgba(255,214,150,0)')
      ctx.fillStyle = g
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
    }
    ctx.restore()
    if (tv.lightning > 0) {
      ctx.fillStyle = `rgba(210,225,255,${tv.lightning * 0.28})`
      ctx.fillRect(0, 0, W, H)
    }

    drawMinimap(t, cx, cy)
    // prompt above the detective
    if (tv.near && !tv.talking && !state.filePanel) {
      const n = tv.near
      const label = n.type === 'clue' ? (n.obj.examined ? '다시 살펴보기' : '조사하기') : n.obj.talked ? '다시 대화하기' : '대화하기'
      const txt = `[Space] ${label}${n.type === 'clue' ? ' · ' + n.obj.label : ''}`
      ctx.font = 'bold 13px sans-serif'
      const w = ctx.measureText(txt).width + 22
      const px = Math.max(8, Math.min(W - w - 8, tv.x - cx - w / 2))
      const py = tv.y - cy - 78
      ctx.fillStyle = 'rgba(8,10,16,0.85)'
      ctx.beginPath()
      ctx.roundRect(px, py, w, 24, 8)
      ctx.fill()
      ctx.strokeStyle = '#ffd36b'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#ffe9a8'
      ctx.textAlign = 'center'
      ctx.fillText(txt, px + w / 2, py + 16)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '12px sans-serif'
    ctx.fillText('WASD 이동 · Shift 달리기 · Space 조사/대화 · Q 생각하기', 20, 76)
  }

  function drawMinimap(t, cx, cy) {
    const s = 3
    const w = COLS * s
    const h = ROWS * s
    const x = W - w - 14
    const y = 52
    ctx.fillStyle = 'rgba(8,10,16,0.78)'
    ctx.beginPath()
    ctx.roundRect(x - 5, y - 5, w + 10, h + 10, 8)
    ctx.fill()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(minimap, x, y, w, h)
    ctx.imageSmoothingEnabled = true
    const dot = (px, py, c, r = 2.4) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(x + (px / T) * s, y + (py / T) * s, r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const hs of HOTSPOTS) {
      if (hs.examined) continue
      const sp = clueSpot(hs.id)
      dot(sp.x, sp.y, '#ffd36b', 2.6)
    }
    for (const p of PEOPLE) {
      if (p.isPlayer) continue
      const n = tv.npc[p.id]
      dot(n.x, n.y, p.talked ? '#6a7a8a' : '#ffffff', 2)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + (cx / T) * s, y + (cy / T) * s, (W / T) * s, (H / T) * s)
    ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.4
    dot(tv.x, tv.y, '#ff5a5a', 3.2)
    ctx.globalAlpha = 1
  }

  function drawDetective(t) {
    drawPerson(ctx, tv.x, tv.y, LOOKS.seojin, { facing: tv.facing, walk: tv.walk, moving: tv.moving, t })
  }

  function drawNpc(n, p, t) {
    drawPerson(ctx, n.x, n.y, LOOKS[p.id], { facing: n.facing, walk: n.walk, moving: n.moving, t, pose: null })
    if (!p.talked) {
      const bob = Math.sin(t * 3 + n.x) * 2
      drawEmote(ctx, n.x, n.y - 62 + bob, '...', t)
    }
  }

  return { _state: tv, draw, update, reset, active, get talking() { return tv.talking }, set talking(v) { tv.talking = v }, closeTalk: () => (tv.talking = false) }
}
