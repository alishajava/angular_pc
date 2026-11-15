import { sfx, unlockSfx, toggleMute } from './sfx.js'
import { drawPerson, drawEmote } from './people.js'

// Top-down exploration/puzzle adventure, Sierra-style (King's Quest /
// Leisure Suit Larry era): walk between a few connected rooms, talk to
// people, pick up an item, use it to get past a locked gate. No combat,
// no images/audio files - everything is drawn with Canvas 2D shapes.

const TILE = 32
const COLS = 25
const ROWS = 18
const W = COLS * TILE
const H = ROWS * TILE
const DOOR_ROW = 9 // the row an edge exit opens a gap on

function floorRow(markers = {}) {
  const chars = Array(COLS).fill('.')
  chars[0] = '#'
  chars[COLS - 1] = '#'
  for (const [col, ch] of Object.entries(markers)) chars[Number(col)] = ch
  return chars.join('')
}
const WALL = '#'.repeat(COLS)

// Letters: '#' wall, 'b' bush/rock (solid), '.' floor, 'L'/'R' exits,
// 'V'/'W' villagers, 'C' a readable sign, 'K' the key, 'T' the treasure,
// 'F' a flavour object you can read, 'H' house tiles (solid scenery).
const ROOM_A = [
  WALL,
  floorRow({ 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 17: 'H', 18: 'H', 19: 'H', 20: 'H', 21: 'H' }),
  floorRow({ 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 17: 'H', 18: 'H', 19: 'H', 20: 'H', 21: 'H' }),
  floorRow({ 2: 'H', 3: 'H', 4: 'H', 5: 'H', 6: 'H', 17: 'H', 18: 'H', 19: 'H', 20: 'H', 21: 'H', 12: 'F' }),
  floorRow(),
  floorRow(),
  floorRow({ 10: 'V' }),
  floorRow(),
  floorRow({ 4: 'C' }),
  floorRow({ [COLS - 1]: 'R' }),
  floorRow(),
  floorRow({ 14: 'K' }),
  floorRow(),
  floorRow({ 8: 'b', 20: 'b' }),
  floorRow(),
  floorRow({ 3: 'b' }),
  floorRow(),
  WALL,
]

const ROOM_B = [
  WALL,
  floorRow(),
  floorRow({ 5: 'b', 19: 'b' }),
  floorRow(),
  floorRow({ 12: 'b' }),
  floorRow(),
  floorRow({ 3: 'b', 21: 'b' }),
  floorRow({ 8: 'F' }),
  floorRow({ 16: 'W' }),
  floorRow({ 0: 'L', [COLS - 1]: 'R' }),
  floorRow(),
  floorRow({ 9: 'b' }),
  floorRow(),
  floorRow({ 6: 'b', 17: 'b' }),
  floorRow(),
  floorRow(),
  floorRow(),
  WALL,
]

const ROOM_C = [
  WALL,
  floorRow({ 5: 'b', 19: 'b' }),
  floorRow(),
  floorRow({ 8: 'b', 16: 'b' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ 0: 'L', 12: 'T' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ 8: 'b', 16: 'b' }),
  floorRow(),
  floorRow({ 5: 'b', 19: 'b' }),
  floorRow(),
  WALL,
]

for (const m of [ROOM_A, ROOM_B, ROOM_C]) {
  if (m.length !== ROWS) throw new Error('room row count mismatch')
}

const SOLID = new Set(['#', 'b', 'H', 'F'])

const DIALOGUE = {
  V: {
    speaker: '정신없는 마을 사람',
    text: '어? 또 오셨어요? ...아, 처음이시구나. 모험가들이 다 비슷하게 생겨서. 아무튼 숲에 전설의 보물이 있다던데요.',
  },
  W: {
    speaker: '심심한 숲지기',
    text: '열쇠 찾으러 오셨죠? 사실 이 문 비밀번호만 알면 그냥 열려요. 근데 다들 열쇠 열쇠 노래를 부르길래 그냥 놔뒀어요. 재밌잖아요.',
  },
  C: {
    speaker: '낡은 팻말',
    text: '누가 세웠는지도 모르는 팻말. "열쇠 없이는 절대 못 지나감... 진짜임... 농담 아님."',
  },
}
const FLAVOR = {
  village: { speaker: '우물', text: '들여다보니 메아리가 돌아온다. "...열쇠는 오른쪽 아래..." 누군가 장난치고 있다.' },
  forest: { speaker: '버섯', text: '수상하게 빛나는 버섯. 먹으면 안 될 것 같다. 아니, 절대 먹으면 안 된다.' },
}

// People: where they idle and how they look.
const LOOK_PLAYER = { skin: '#f4cba2', hair: '#5a3820', hairStyle: 'messy', shirt: '#3f9fd1', pants: '#3a4a6a', shoes: '#2b2440', eye: '#2f5fa0', outfit: 'tee' }
const LOOK_V = { skin: '#f6d2b0', hair: '#8a8f9a', hairStyle: 'bun', shirt: '#8c9bab', pants: '#6a5a4a', shoes: '#3a2a1a', eye: '#4a6a8a', outfit: 'apron' }
const LOOK_W = { skin: '#e8b48f', hair: '#6b3a1c', hairStyle: 'short', shirt: '#5a8f5a', pants: '#4a5a3a', shoes: '#4a3a24', eye: '#3f8f5a', outfit: 'tee', hat: 'cap' }

function buildInteractables(mapRows, roomName) {
  const list = []
  for (let row = 0; row < mapRows.length; row++) {
    for (let col = 0; col < mapRows[row].length; col++) {
      const ch = mapRows[row][col]
      if (!'VWCKTLRF'.includes(ch)) continue
      const x = col * TILE + TILE / 2
      const y = row * TILE + TILE / 2
      list.push({
        type: ch,
        x,
        y,
        hx: x,
        hy: y,
        col,
        row,
        collected: false,
        touching: false,
        facing: 'down',
        walk: 0,
        moving: false,
        tx: x,
        ty: y,
        timer: Math.random() * 3,
        emote: null,
        emoteT: 0,
        open: 0,
        roomName,
      })
    }
  }
  return list
}

function makeRoom(mapRows, name) {
  const grid = mapRows.map((row) => [...row].map((ch) => (SOLID.has(ch) ? 1 : 0)))
  return { name, mapRows, grid, interactables: buildInteractables(mapRows, name), ground: null }
}

const ROOMS = {
  village: makeRoom(ROOM_A, 'village'),
  forest: makeRoom(ROOM_B, 'forest'),
  grove: makeRoom(ROOM_C, 'grove'),
}
const ROOM_TITLE = { village: '조용한 마을', forest: '수상한 숲', grove: '고요한 숲속 빈터' }
const EXITS = {
  village: { R: { room: 'forest', side: 'L' } },
  forest: { L: { room: 'village', side: 'R' }, R: { room: 'grove', side: 'L' } },
  grove: { L: { room: 'forest', side: 'R' } },
}
const ENTRY_COL = { L: 1, R: COLS - 2 }

let currentRoomKey = 'village'
function room() {
  return ROOMS[currentRoomKey]
}

const hash = (a, b, k = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

function canMoveTo(x, y, half) {
  const grid = room().grid
  for (const [cx, cy] of [[x - half, y - half + 6], [x + half, y - half + 6], [x - half, y + half], [x + half, y + half]]) {
    const col = Math.floor(cx / TILE)
    const row = Math.floor(cy / TILE)
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false
    if (grid[row][col] === 1) return false
  }
  // people are solid too
  for (const it of room().interactables) {
    if (it.type !== 'V' && it.type !== 'W') continue
    if (Math.hypot(x - it.x, y - it.y) < 17) return false
  }
  return true
}

const canvas = document.getElementById('game')
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d')

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const PLAYER_SPEED = 120
const PLAYER_HALF = 9

const player = { x: TILE * 2, y: DOOR_ROW * TILE + TILE / 2, facing: 'right', moving: false, walk: 0 }
const inventory = []
const state = { phase: 'title', ending: false, endT: 0, steps: 0 }
let elapsed = 0

// ------------------------------------------------------------- dialogue ----

const dlg = { active: false, speaker: '', text: '', shown: 0, onClose: null, tick: 0 }
function say(speaker, text, onClose = null) {
  dlg.active = true
  dlg.speaker = speaker
  dlg.text = text
  dlg.shown = 0
  dlg.onClose = onClose
  dlg.tick = 0
}
function advanceDialogue() {
  if (!dlg.active) return
  if (dlg.shown < dlg.text.length) {
    dlg.shown = dlg.text.length
    return
  }
  dlg.active = false
  sfx.click()
  const cb = dlg.onClose
  dlg.onClose = null
  cb && cb()
}
function updateDialogue(dt) {
  if (!dlg.active || dlg.shown >= dlg.text.length) return
  const before = Math.floor(dlg.shown)
  dlg.shown = Math.min(dlg.text.length, dlg.shown + dt * 46)
  const after = Math.floor(dlg.shown)
  if (after > before && after % 2 === 0 && dlg.text[after - 1] !== ' ') sfx.blip(dlg.speaker.includes('팻말') || dlg.speaker.includes('우물') || dlg.speaker.includes('버섯') ? 300 : 380 + (dlg.speaker.length % 5) * 30)
}

// ------------------------------------------------------------- transitions ----

const fade = { t: 0, dir: 0, mid: null } // dir 1: fading to black, -1: fading in
function transition(cb) {
  fade.dir = 1
  fade.t = 0
  fade.mid = cb
}
function updateFade(dt) {
  if (!fade.dir) return
  fade.t += dt * 4.5
  if (fade.dir === 1 && fade.t >= 1) {
    fade.mid && fade.mid()
    fade.mid = null
    fade.dir = -1
    fade.t = 1
  } else if (fade.dir === -1) {
    fade.t -= dt * 4.5 * 2 // fade in faster than out
    if (fade.t <= 0) {
      fade.dir = 0
      fade.t = 0
    }
  }
}

function enterRoom(key, side) {
  currentRoomKey = key
  player.x = ENTRY_COL[side] * TILE + TILE / 2
  player.y = DOOR_ROW * TILE + TILE / 2
  player.facing = side === 'L' ? 'right' : 'left'
  for (const it of room().interactables) it.touching = true
  particles.length = 0
}

// ---------------------------------------------------------- interactions ----

const particles = []
function sparkle(x, y, color = '#ffe066', n = 12, speed = 70) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.3 + Math.random() * 0.9)
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.8, max: 0.8, color, size: 2 + Math.random() * 2 })
  }
}

function faceToward(it) {
  const dx = player.x - it.x
  const dy = player.y - it.y
  it.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

function triggerInteraction(item) {
  if (item.type === 'V' || item.type === 'W' || item.type === 'C') {
    const line = DIALOGUE[item.type]
    if (item.type !== 'C') {
      faceToward(item)
      item.emote = '!'
      item.emoteT = 1.2
    }
    sfx.click()
    say(line.speaker, line.text)
    return
  }
  if (item.type === 'F') {
    const f = FLAVOR[currentRoomKey]
    sfx.click()
    say(f.speaker, f.text)
    return
  }
  if (item.type === 'K') {
    if (item.collected) return
    item.collected = true
    inventory.push('key')
    sfx.pickup()
    sparkle(item.x, item.y, '#ffe066', 18)
    say('시스템', '낡은 열쇠를 주웠다. 손잡이에 "창고용"이라고 새겨져 있다.')
    return
  }
  if (item.type === 'T') {
    if (item.open > 0) return
    item.open = 0.001
    sfx.unlock()
    return
  }
  if (item.type === 'L' || item.type === 'R') {
    const exit = EXITS[currentRoomKey][item.type]
    if (!exit) return
    const gate = currentRoomKey === 'forest' && item.type === 'R'
    if (gate && !inventory.includes('key')) {
      const w = room().interactables.find((it) => it.type === 'W')
      if (w) {
        faceToward(w)
        w.emote = '...'
        w.emoteT = 2
      }
      sfx.bad()
      say('심심한 숲지기', '아무튼 열쇠부터 가져와 보세요. 구경 좀 하게.')
      return
    }
    if (gate) {
      item.open = 0.001
      sfx.unlock()
      say('심심한 숲지기', '오, 진짜 가져왔네? 대단하시네. 들어가세요, 재밌으셨길.', () => go(exit))
      return
    }
    go(exit)
  }
}
function go(exit) {
  sfx.door()
  transition(() => enterRoom(exit.room, exit.side))
}

// ---------------------------------------------------------------- input ----

const heldKeys = new Set()
const MOVE_KEYS = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
}
const held = (names) => names.some((k) => heldKeys.has(k))

function restart() {
  location.reload()
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault()
  unlockSfx()
  heldKeys.add(key)
  if (e.repeat) return
  if (key === 'm') {
    toggleMute()
    return
  }
  if (key === 'r' && state.ending) return restart()
  if (state.phase === 'title') {
    if (key === ' ' || key === 'enter') {
      state.phase = 'play'
      sfx.start()
    }
    return
  }
  if (key === ' ' || key === 'enter' || key === 'e') {
    if (dlg.active) return advanceDialogue()
    if (state.ending) return
    // talk again to whoever is close
    let best = null
    for (const it of room().interactables) {
      if (!'VWCF'.includes(it.type)) continue
      const d = Math.hypot(player.x - it.x, player.y - it.y)
      if (d < 46 && (!best || d < best.d)) best = { it, d }
    }
    if (best) triggerInteraction(best.it)
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))
canvas.addEventListener('click', () => {
  unlockSfx()
  if (state.phase === 'title') {
    state.phase = 'play'
    sfx.start()
  } else if (dlg.active) advanceDialogue()
})
window.addEventListener('blur', () => heldKeys.clear())

// --------------------------------------------------------------- update ----

function updatePlayer(dt) {
  let dx = 0
  let dy = 0
  const locked = dlg.active || fade.dir !== 0 || state.ending
  if (!locked) {
    if (held(MOVE_KEYS.left)) dx -= 1
    if (held(MOVE_KEYS.right)) dx += 1
    if (held(MOVE_KEYS.up)) dy -= 1
    if (held(MOVE_KEYS.down)) dy += 1
  }
  player.moving = dx !== 0 || dy !== 0
  if (player.moving) {
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2
      dy *= Math.SQRT1_2
    }
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    player.walk += dt * 10
    const tx = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(tx, player.y, PLAYER_HALF)) player.x = tx
    const ty = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(player.x, ty, PLAYER_HALF)) player.y = ty
  }

  if (locked) return
  for (const item of room().interactables) {
    if (item.type === 'K' && item.collected) continue
    if (item.type === 'F') continue
    const near = Math.abs(player.x - item.x) < PLAYER_HALF + 14 && Math.abs(player.y - item.y) < PLAYER_HALF + 14
    const reach = item.type === 'V' || item.type === 'W' ? Math.hypot(player.x - item.x, player.y - item.y) < 30 : near
    if (reach && !item.touching) {
      item.touching = true
      triggerInteraction(item)
    } else if (!reach && !(item.type === 'V' || item.type === 'W') ? true : !reach && Math.hypot(player.x - item.x, player.y - item.y) > 52) {
      item.touching = false
    }
  }
}

function updatePeople(dt) {
  for (const it of room().interactables) {
    if (it.emoteT > 0) {
      it.emoteT -= dt
      if (it.emoteT <= 0) it.emote = null
    }
    if (it.type === 'T' && it.open > 0 && it.open < 1) {
      it.open = Math.min(1, it.open + dt * 1.6)
      if (it.open >= 1) {
        sparkle(it.x, it.y - 10, '#ffe066', 30, 110)
        sfx.fanfare()
        say(
          '???',
          '보물 상자를 발견했다! 두근거리는 마음으로 열어보니... 낡은 양말 한 짝과 메모: "먼저 다녀감. 진짜 보물은 내가 가져감. 수고~" 모험 끝. (뻔하지 않죠?)',
          () => {
            state.ending = true
            state.endT = 0
          },
        )
      }
    }
    if (it.type === 'R' && it.open > 0 && it.open < 1) it.open = Math.min(1, it.open + dt * 2)
    if (it.type !== 'V' && it.type !== 'W') continue
    const near = Math.hypot(player.x - it.x, player.y - it.y)
    // villagers shuffle around their spot; the ranger mostly just sits
    if (it.type === 'V') {
      const dx = it.tx - it.x
      const dy = it.ty - it.y
      const d = Math.hypot(dx, dy)
      if (dlg.active && near < 60) {
        it.moving = false
      } else if (d > 2) {
        const nx = it.x + (dx / d) * 28 * dt
        const ny = it.y + (dy / d) * 28 * dt
        const ok = (x, y) => {
          const c = Math.floor(x / TILE)
          const r = Math.floor((y + 8) / TILE)
          return !(room().grid[r] && room().grid[r][c]) && Math.hypot(x - player.x, y - player.y) > 20
        }
        if (ok(nx, it.y)) it.x = nx
        if (ok(it.x, ny)) it.y = ny
        it.moving = true
        it.walk += dt * 6
        it.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      } else {
        it.moving = false
        it.timer -= dt
        if (it.timer <= 0) {
          it.tx = it.hx + (Math.random() * 2 - 1) * 56
          it.ty = it.hy + (Math.random() * 2 - 1) * 40
          it.timer = 1.5 + Math.random() * 3
        }
      }
    } else if (near < 90 && !dlg.active) {
      faceToward(it)
    }
  }
}

function updateFx(dt) {
  for (const p of particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += (p.grav ?? 60) * dt
    p.life -= dt
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
  // ambient motes
  const key = currentRoomKey
  if (key === 'forest' && Math.random() < dt * 3) particles.push({ x: Math.random() * W, y: -6, vx: 10 + Math.random() * 14, vy: 20 + Math.random() * 20, grav: 0, life: 14, max: 14, color: Math.random() < 0.5 ? '#d9b84a' : '#a8c85a', size: 3, leaf: true })
  if (key === 'grove' && Math.random() < dt * 5) particles.push({ x: Math.random() * W, y: H * (0.3 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 8, vy: -8 - Math.random() * 8, grav: 0, life: 4, max: 4, color: '#9ff0ff', size: 2.2 })
  if (key === 'village' && Math.random() < dt * 0.8) particles.push({ x: Math.random() * W, y: H * (0.4 + Math.random() * 0.4), vx: 16 + Math.random() * 10, vy: -10 + Math.random() * 20, grav: 0, life: 6, max: 6, color: ['#ffb0d0', '#fff', '#ffe066'][Math.floor(Math.random() * 3)], size: 3, fly: true })
  if (state.ending) state.endT += dt
}

// ------------------------------------------------------------- drawing ----

function ell(x, y, rx, ry, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

const THEME = {
  village: { grass: ['#78b865', '#7dbd69', '#72b05f', '#80c06c'], path: '#d8bd86', pathEdge: '#b49458', sky: '255,240,200' },
  forest: { grass: ['#4f8f4a', '#549650', '#4a8745', '#589a52'], path: '#b8996a', pathEdge: '#8e7248', sky: '210,255,200' },
  grove: { grass: ['#5b8a6a', '#609070', '#56826a', '#659476'], path: '#9aa0a6', pathEdge: '#6e747a', sky: '170,230,255' },
}

function tree(x, y, s = 1, dark = false) {
  ell(x + 3, y + 2, 17 * s, 6 * s, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = '#6b4a2a'
  ctx.beginPath()
  ctx.moveTo(x - 5 * s, y)
  ctx.lineTo(x - 3 * s, y - 24 * s)
  ctx.lineTo(x + 3 * s, y - 24 * s)
  ctx.lineTo(x + 5 * s, y)
  ctx.fill()
  const c1 = dark ? '#245a30' : '#2f7a3d'
  const c2 = dark ? '#2f6e3a' : '#3f9a4d'
  ell(x - 13 * s, y - 28 * s, 14 * s, 12 * s, c1)
  ell(x + 13 * s, y - 29 * s, 14 * s, 12 * s, c1)
  ell(x, y - 40 * s, 18 * s, 16 * s, c1)
  ell(x - 5 * s, y - 36 * s, 11 * s, 10 * s, c2)
  ell(x + 8 * s, y - 42 * s, 8 * s, 7 * s, c2)
  ell(x - 6 * s, y - 47 * s, 5 * s, 4 * s, 'rgba(210,245,170,0.5)')
}

function bush(x, y, color = '#3f7a45') {
  ell(x + 2, y + 3, 14, 5, 'rgba(0,0,0,0.25)')
  ell(x - 8, y - 4, 10, 9, color)
  ell(x + 8, y - 4, 10, 9, color)
  ell(x, y - 9, 12, 11, '#4a9050')
  ell(x - 3, y - 12, 5, 4, 'rgba(210,245,170,0.45)')
}

function rock(x, y) {
  ell(x + 2, y + 3, 15, 5, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = '#8f949e'
  ctx.beginPath()
  ctx.moveTo(x - 14, y + 2)
  ctx.quadraticCurveTo(x - 15, y - 12, x - 3, y - 15)
  ctx.quadraticCurveTo(x + 11, y - 15, x + 14, y - 2)
  ctx.lineTo(x + 12, y + 3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x - 6, y - 11, 8, 3)
  ctx.fillStyle = 'rgba(70,130,70,0.6)'
  ctx.beginPath()
  ctx.ellipse(x + 7, y, 5, 2.4, 0, 0, Math.PI * 2)
  ctx.fill()
}

function house(col, row, wall, roof) {
  const x0 = col * TILE
  const w = 5 * TILE
  const bottom = (row + 3) * TILE
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(x0 + w / 2 + 6, bottom + 2, w * 0.55, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = wall
  ctx.fillRect(x0 + 4, bottom - 78, w - 8, 78)
  ctx.strokeStyle = 'rgba(90,60,30,0.3)'
  ctx.lineWidth = 1
  for (let y = bottom - 66; y < bottom; y += 12) {
    ctx.beginPath()
    ctx.moveTo(x0 + 4, y)
    ctx.lineTo(x0 + w - 4, y)
    ctx.stroke()
  }
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x0 + 4, bottom - 78, 6, 78)
  ctx.fillRect(x0 + w - 10, bottom - 78, 6, 78)
  ctx.beginPath()
  ctx.moveTo(x0 - 10, bottom - 72)
  ctx.lineTo(x0 + 24, bottom - 128)
  ctx.lineTo(x0 + w - 24, bottom - 128)
  ctx.lineTo(x0 + w + 10, bottom - 72)
  ctx.closePath()
  ctx.fillStyle = roof
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  for (let i = 1; i < 5; i++) {
    const ry = bottom - 128 + i * 11
    ctx.beginPath()
    ctx.moveTo(x0 + 24 - i * 7, ry)
    ctx.lineTo(x0 + w - 24 + i * 7, ry)
    ctx.stroke()
  }
  // chimney + smoke
  ctx.fillStyle = '#8a7a6a'
  ctx.fillRect(x0 + w - 44, bottom - 142, 14, 30)
  for (let i = 0; i < 3; i++) {
    const ph = (elapsed * 0.4 + i * 0.33) % 1
    ctx.fillStyle = `rgba(235,235,240,${(1 - ph) * 0.45})`
    ctx.beginPath()
    ctx.arc(x0 + w - 37 + ph * 10, bottom - 146 - ph * 30, 4 + ph * 6, 0, Math.PI * 2)
    ctx.fill()
  }
  // door and windows
  ctx.fillStyle = '#5a3a1e'
  ctx.beginPath()
  ctx.roundRect(x0 + w / 2 - 14, bottom - 40, 28, 40, [14, 14, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#8a5a30'
  ctx.beginPath()
  ctx.roundRect(x0 + w / 2 - 11, bottom - 37, 22, 37, [11, 11, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#ffd24a'
  ctx.fillRect(x0 + w / 2 + 5, bottom - 20, 3, 3)
  for (const wx of [x0 + 30, x0 + w - 30]) {
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(wx - 13, bottom - 52, 26, 24)
    ctx.fillStyle = '#a8dcff'
    ctx.fillRect(wx - 10, bottom - 49, 20, 18)
    ctx.fillStyle = '#5a3a1e'
    ctx.fillRect(wx - 1, bottom - 49, 2, 18)
    ctx.fillRect(wx - 10, bottom - 41, 20, 2)
    ctx.fillStyle = '#7a4a26'
    ctx.fillRect(wx - 14, bottom - 27, 28, 6)
    for (const [dx, c] of [[-8, '#ff8fb0'], [0, '#ffd34d'], [8, '#b58cff']]) {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(wx + dx, bottom - 29, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function well(x, y) {
  ell(x + 2, y + 2, 20, 7, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = '#9a9aa4'
  ctx.beginPath()
  ctx.roundRect(x - 16, y - 18, 32, 20, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1.4
  ctx.stroke()
  ell(x, y - 18, 16, 6, '#2a4a6a')
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x - 17, y - 42, 4, 26)
  ctx.fillRect(x + 13, y - 42, 4, 26)
  ctx.fillStyle = '#b8503a'
  ctx.beginPath()
  ctx.moveTo(x - 22, y - 40)
  ctx.lineTo(x, y - 54)
  ctx.lineTo(x + 22, y - 40)
  ctx.closePath()
  ctx.fill()
}

function mushrooms(x, y) {
  ell(x, y + 2, 12, 4, 'rgba(0,0,0,0.25)')
  for (const [dx, s, c] of [[-6, 1, '#e8452e'], [5, 0.75, '#d58cff'], [0, 0.6, '#ffb02a']]) {
    ctx.fillStyle = '#f0e6d0'
    ctx.fillRect(x + dx - 2 * s, y - 8 * s, 4 * s, 9 * s)
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.ellipse(x + dx, y - 9 * s, 8 * s, 6 * s, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillRect(x + dx - 3 * s, y - 12 * s, 2 * s, 2 * s)
    ctx.fillRect(x + dx + 1 * s, y - 11 * s, 2 * s, 2 * s)
  }
  // faint glow
  const g = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 26)
  g.addColorStop(0, 'rgba(255,200,255,0.25)')
  g.addColorStop(1, 'rgba(255,200,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - 26, y - 32, 52, 52)
}

function pillar(x, y, broken) {
  ell(x + 2, y + 2, 17, 6, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = '#9aa0aa'
  const h = broken ? 26 : 48
  ctx.fillRect(x - 11, y - h, 22, h)
  ctx.fillStyle = '#b8bec8'
  ctx.fillRect(x - 11, y - h, 8, h)
  ctx.fillStyle = '#7a808a'
  ctx.fillRect(x - 14, y - 6, 28, 6)
  if (!broken) ctx.fillRect(x - 14, y - h - 5, 28, 6)
  else {
    ctx.beginPath()
    ctx.moveTo(x - 11, y - h)
    ctx.lineTo(x - 3, y - h - 8)
    ctx.lineTo(x + 3, y - h - 2)
    ctx.lineTo(x + 11, y - h - 7)
    ctx.lineTo(x + 11, y - h)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(70,130,80,0.7)'
  ctx.fillRect(x - 11, y - 14, 22, 5)
  // rune glow
  ctx.fillStyle = 'rgba(120,230,255,0.7)'
  ctx.fillRect(x + 1, y - h * 0.6, 3, 8)
}

// Ground, paths and border are static, so each room is painted once.
function buildGround(key) {
  const th = THEME[key]
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const prev = ctx
  // draw with the shared helpers by temporarily swapping the context
  return { canvas: c, g, th, prev }
}

const groundCache = {}
function getGround(key) {
  if (groundCache[key]) return groundCache[key]
  const th = THEME[key]
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      g.fillStyle = th.grass[Math.floor(hash(col, r) * th.grass.length)]
      g.fillRect(col * TILE, r * TILE, TILE, TILE)
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      for (let i = 0; i < 3; i++) {
        const gx = col * TILE + hash(col, r, i + 1) * TILE
        const gy = r * TILE + hash(col, r, i + 9) * TILE
        g.strokeStyle = i % 2 ? 'rgba(20,70,30,0.35)' : 'rgba(190,240,150,0.4)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(gx - 2, gy)
        g.lineTo(gx - 1, gy - 4)
        g.moveTo(gx + 1, gy)
        g.lineTo(gx + 2, gy - 4)
        g.stroke()
      }
    }
  }
  // dirt road along the exit row (and on to key places)
  const roadRows = [DOOR_ROW - 0.5, DOOR_ROW + 0.5]
  g.fillStyle = th.pathEdge
  g.beginPath()
  g.roundRect(0, (DOOR_ROW - 0.5) * TILE - 3, W, TILE + 6, 10)
  g.fill()
  g.fillStyle = th.path
  g.beginPath()
  g.roundRect(0, (DOOR_ROW - 0.5) * TILE, W, TILE, 8)
  g.fill()
  void roadRows
  for (let i = 0; i < 70; i++) {
    g.fillStyle = i % 2 ? 'rgba(100,80,50,0.35)' : 'rgba(255,240,200,0.5)'
    g.beginPath()
    g.ellipse(hash(i, 3) * W, (DOOR_ROW - 0.5) * TILE + 4 + hash(i, 5) * (TILE - 8), 2.5, 1.6, 0, 0, Math.PI * 2)
    g.fill()
  }
  if (key === 'village') {
    // a path from the road up to the plaza + flowers
    g.fillStyle = th.pathEdge
    g.beginPath()
    g.roundRect(11 * TILE - 3, 3.5 * TILE, TILE + 6, 5.5 * TILE, 8)
    g.fill()
    g.fillStyle = th.path
    g.beginPath()
    g.roundRect(11 * TILE, 3.5 * TILE, TILE, 5.5 * TILE, 8)
    g.fill()
  }
  if (key === 'grove') {
    // stone circle around the treasure
    g.fillStyle = '#8f959c'
    g.beginPath()
    g.arc(12.5 * TILE, 9.5 * TILE, 70, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#a6acb4'
    g.beginPath()
    g.arc(12.5 * TILE, 9.5 * TILE, 62, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(80,90,100,0.6)'
    g.lineWidth = 1.5
    for (let a = 0; a < 12; a++) {
      g.beginPath()
      g.moveTo(12.5 * TILE + Math.cos((a / 12) * Math.PI * 2) * 30, 9.5 * TILE + Math.sin((a / 12) * Math.PI * 2) * 30)
      g.lineTo(12.5 * TILE + Math.cos((a / 12) * Math.PI * 2) * 62, 9.5 * TILE + Math.sin((a / 12) * Math.PI * 2) * 62)
      g.stroke()
    }
    g.strokeStyle = 'rgba(120,230,255,0.5)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(12.5 * TILE, 9.5 * TILE, 46, 0, Math.PI * 2)
    g.stroke()
  }
  // wildflowers
  const fl = ['#ffffff', '#ffd6e8', '#fff3a0', '#d8c8ff']
  for (let r = 1; r < ROWS - 1; r++) {
    for (let col = 1; col < COLS - 1; col++) {
      if (hash(col, r, 40) > (key === 'village' ? 0.22 : key === 'forest' ? 0.1 : 0.06)) continue
      const fx = col * TILE + 6 + hash(col, r, 50) * 20
      const fy = r * TILE + 8 + hash(col, r, 60) * 18
      g.fillStyle = '#2f6b34'
      g.fillRect(fx - 0.5, fy, 1, 4)
      g.fillStyle = fl[Math.floor(hash(col, r, 70) * fl.length)]
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
        g.beginPath()
        g.arc(fx + dx, fy + dy, 1.5, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#ffe066'
      g.beginPath()
      g.arc(fx, fy, 1.1, 0, Math.PI * 2)
      g.fill()
    }
  }
  groundCache[key] = c
  return c
}

// Everything standing on the ground, as {y, draw} so it can be depth-sorted.
function sceneObjects() {
  const key = currentRoomKey
  const r = room()
  const objs = []
  const isExit = (c, rw) => r.mapRows[rw][c] === 'L' || r.mapRows[rw][c] === 'R'
  for (let rw = 0; rw < ROWS; rw++) {
    for (let c = 0; c < COLS; c++) {
      const ch = r.mapRows[rw][c]
      const x = c * TILE + TILE / 2
      const y = (rw + 1) * TILE - 4
      if (ch === '#') {
        if (key === 'grove') {
          objs.push({ y, f: () => ruinWall(c, rw) })
        } else if (rw > 0 || c % 1 === 0) {
          const nearExit = (c === 0 || c === COLS - 1) && Math.abs(rw - DOOR_ROW) <= 1
          objs.push({ y: y + 2, f: () => (key === 'village' && rw === 0 ? fence(c, rw) : tree(x + ((c * 7 + rw * 3) % 5) - 2, y, 1.15 + ((c + rw) % 3) * 0.08, key === 'forest')) })
          void nearExit
        }
      } else if (ch === 'b') {
        if (key === 'village') objs.push({ y, f: () => (c % 2 ? bush(x, y) : rock(x, y)) })
        else if (key === 'forest') objs.push({ y, f: () => (c % 3 === 0 ? rock(x, y) : bush(x, y, '#2f6a3a')) })
        else objs.push({ y, f: () => pillar(x, y, (c + rw) % 2 === 0) })
      } else if (ch === 'F') {
        if (key === 'village') objs.push({ y, f: () => well(x, y) })
        else objs.push({ y, f: () => mushrooms(x, y) })
      }
    }
  }
  if (key === 'village') {
    objs.push({ y: 4 * TILE, f: () => house(2, 1, '#f2dcb0', '#c4553f') })
    objs.push({ y: 4 * TILE, f: () => house(17, 1, '#cfe4f2', '#5a7fb8') })
  }
  for (const it of r.interactables) {
    if (it.type === 'V') objs.push({ y: it.y + 6, f: () => drawNpc(it, LOOK_V) })
    else if (it.type === 'W') objs.push({ y: it.y + 6, f: () => drawNpc(it, LOOK_W, true) })
    else if (it.type === 'C') objs.push({ y: it.y + 12, f: () => drawSign(it.x, it.y) })
    else if (it.type === 'K' && !it.collected) objs.push({ y: it.y, f: () => drawKey(it.x, it.y) })
    else if (it.type === 'T') objs.push({ y: it.y + 10, f: () => drawTreasure(it) })
    else if ((it.type === 'R' || it.type === 'L') && key === 'forest' && it.type === 'R') objs.push({ y: it.y + 20, f: () => drawGate(it) })
  }
  objs.push({ y: player.y + 10, f: drawPlayer })
  objs.sort((a, b) => a.y - b.y)
  return objs
}

function fence(c, rw) {
  const x = c * TILE
  const y = rw * TILE
  ctx.fillStyle = '#c8a46a'
  ctx.fillRect(x, y + 14, TILE, 4)
  ctx.fillRect(x, y + 22, TILE, 4)
  ctx.fillStyle = '#b08850'
  ctx.fillRect(x + 4, y + 8, 5, 24)
  ctx.beginPath()
  ctx.moveTo(x + 4, y + 8)
  ctx.lineTo(x + 6.5, y + 4)
  ctx.lineTo(x + 9, y + 8)
  ctx.fill()
}

function ruinWall(c, rw) {
  const x = c * TILE
  const y = rw * TILE
  ctx.fillStyle = (c + rw) % 2 ? '#585e6a' : '#4f5561'
  ctx.fillRect(x, y, TILE, TILE)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1.2
  ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
  ctx.beginPath()
  ctx.moveTo(x, y + TILE / 2)
  ctx.lineTo(x + TILE, y + TILE / 2)
  ctx.moveTo(x + TILE / 2, y)
  ctx.lineTo(x + TILE / 2, y + TILE / 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(x, y, TILE, 3)
  if (hash(c, rw, 2) > 0.6) {
    ctx.fillStyle = 'rgba(70,140,80,0.75)'
    ctx.beginPath()
    ctx.ellipse(x + 8 + hash(c, rw, 4) * 14, y + 6, 8, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (hash(c, rw, 8) > 0.82) {
    ctx.fillStyle = 'rgba(120,230,255,0.8)'
    ctx.fillRect(x + 12, y + 12, 3, 8)
  }
}

function drawNpc(it, look, sitting = false) {
  const t = elapsed
  drawPerson(ctx, it.x, it.y + 6, look, {
    facing: it.facing,
    walk: it.walk,
    moving: it.moving,
    t,
    sit: sitting,
    pose: it.emote === '!' ? { type: 'wave', p: 0 } : null,
    emote: it.emote,
  })
  if (sitting) {
    // the ranger lounges on a stump
    ctx.fillStyle = '#6b4a2a'
    ctx.beginPath()
    ctx.roundRect(it.x - 11, it.y + 4, 22, 12, 3)
    ctx.fill()
    ctx.fillStyle = '#d9b27a'
    ctx.beginPath()
    ctx.ellipse(it.x, it.y + 4, 11, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSign(x, y) {
  ell(x + 2, y + 12, 12, 4, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x - 2.5, y - 8, 5, 20)
  ctx.fillStyle = '#d8b878'
  ctx.beginPath()
  ctx.roundRect(x - 15, y - 26, 30, 22, 3)
  ctx.fill()
  ctx.strokeStyle = '#5c431c'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.strokeStyle = 'rgba(92,67,28,0.6)'
  ctx.lineWidth = 1.5
  for (const yy of [-20, -15, -10]) {
    ctx.beginPath()
    ctx.moveTo(x - 10, y + yy)
    ctx.lineTo(x + 10 - (yy === -10 ? 6 : 0), y + yy)
    ctx.stroke()
  }
}

function drawKey(x, y) {
  const bob = Math.sin(elapsed * 3) * 2.5
  const g = ctx.createRadialGradient(x, y, 2, x, y, 26)
  g.addColorStop(0, 'rgba(255,225,100,0.5)')
  g.addColorStop(1, 'rgba(255,225,100,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - 26, y - 26, 52, 52)
  ell(x, y + 12, 9, 3, 'rgba(0,0,0,0.25)')
  ctx.save()
  ctx.translate(x, y + bob - 2)
  ctx.rotate(-0.5)
  ctx.strokeStyle = '#7a5a10'
  ctx.lineWidth = 5.5
  ctx.beginPath()
  ctx.arc(-6, 0, 5, 0, Math.PI * 2)
  ctx.moveTo(-1, 0)
  ctx.lineTo(12, 0)
  ctx.moveTo(8, 0)
  ctx.lineTo(8, 5)
  ctx.moveTo(12, 0)
  ctx.lineTo(12, 5)
  ctx.stroke()
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()
  // twinkle
  const k = (Math.sin(elapsed * 5) + 1) / 2
  ctx.fillStyle = `rgba(255,255,255,${k})`
  ctx.fillRect(x + 8, y - 14, 2, 2)
}

function drawTreasure(it) {
  const { x, y, open } = it
  const glow = ctx.createRadialGradient(x, y - 6, 4, x, y - 6, 70)
  glow.addColorStop(0, `rgba(255,230,120,${0.25 + open * 0.4})`)
  glow.addColorStop(1, 'rgba(255,230,120,0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 70, y - 76, 140, 140)
  ell(x + 2, y + 12, 22, 7, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = '#7a4a22'
  ctx.beginPath()
  ctx.roundRect(x - 18, y - 6, 36, 20, 3)
  ctx.fill()
  ctx.strokeStyle = '#3a2210'
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.fillStyle = '#c9a040'
  ctx.fillRect(x - 18, y + 2, 36, 3)
  ctx.fillRect(x - 3, y - 6, 6, 20)
  // lid
  ctx.save()
  ctx.translate(x, y - 6)
  ctx.rotate(-open * 1.1)
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.roundRect(-18, -12, 36, 12, [8, 8, 0, 0])
  ctx.fill()
  ctx.strokeStyle = '#3a2210'
  ctx.stroke()
  ctx.fillStyle = '#c9a040'
  ctx.fillRect(-3, -12, 6, 12)
  ctx.restore()
  if (open > 0.3) {
    ctx.fillStyle = '#ffe066'
    ctx.fillRect(x - 12, y - 8, 24, 4)
  }
  if (open === 0) {
    const k = (Math.sin(elapsed * 4) + 1) / 2
    ctx.fillStyle = `rgba(255,255,255,${k})`
    ctx.fillRect(x + 12, y - 14, 3, 3)
  }
}

function drawGate(it) {
  const x = it.col * TILE
  const y = it.row * TILE
  const locked = !inventory.includes('key')
  ctx.fillStyle = '#5a3a1e'
  ctx.fillRect(x - 6, y - 36, 10, 76)
  ctx.fillRect(x + 28, y - 36, 10, 76)
  ctx.fillStyle = '#7a5230'
  ctx.fillRect(x - 8, y - 40, 14, 6)
  ctx.fillRect(x + 26, y - 40, 14, 6)
  // swinging door panel
  ctx.save()
  ctx.translate(x - 2, y + 16)
  ctx.rotate(-it.open * 1.3)
  ctx.fillStyle = '#8a5a30'
  ctx.fillRect(0, -24, 24, 48)
  ctx.strokeStyle = '#3a2210'
  ctx.lineWidth = 1.6
  ctx.strokeRect(0.5, -23.5, 23, 47)
  for (const yy of [-12, 0, 12]) {
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(24, yy)
    ctx.stroke()
  }
  ctx.restore()
  if (locked && it.open === 0) {
    ctx.fillStyle = '#ffd24a'
    ctx.beginPath()
    ctx.roundRect(x + 4, y + 8, 16, 13, 3)
    ctx.fill()
    ctx.strokeStyle = '#ffd24a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x + 12, y + 8, 5, Math.PI, 0)
    ctx.stroke()
    ctx.fillStyle = '#3a2a10'
    ctx.fillRect(x + 11, y + 12, 2, 5)
  }
}

function drawPlayer() {
  drawPerson(ctx, player.x, player.y + 8, LOOK_PLAYER, { facing: player.facing, walk: player.walk, moving: player.moving, t: elapsed })
}

function keyIcon(x, y, s = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.rotate(-0.5)
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(-6, 0, 4.5, 0, Math.PI * 2)
  ctx.moveTo(-1.5, 0)
  ctx.lineTo(10, 0)
  ctx.moveTo(7, 0)
  ctx.lineTo(7, 4)
  ctx.moveTo(10, 0)
  ctx.lineTo(10, 4)
  ctx.stroke()
  ctx.restore()
}

function panel(x, y, w, h, r = 8, fill = 'rgba(18,14,8,0.78)', stroke = 'rgba(255,224,150,0.4)') {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.4
  ctx.stroke()
}

function drawInventory() {
  panel(10, 10, 156, 40)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe9b0'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText('소지품', 20, 34)
  for (let i = 0; i < 1; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.roundRect(80 + i * 34, 17, 28, 26, 5)
    ctx.fill()
    if (inventory[i] === 'key') keyIcon(94, 30, 1.1)
  }
  panel(W - 190, 10, 180, 28)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe9b0'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(ROOM_TITLE[currentRoomKey], W - 100, 29)
}

function wrapLines(text, maxW) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line)
      line = ch === ' ' ? '' : ch
    } else line += ch
  }
  if (line) lines.push(line)
  return lines
}

function drawDialogue() {
  if (!dlg.active) return
  const x = 16
  const w = W - 32
  ctx.font = '15px sans-serif'
  const lines = wrapLines(dlg.text.slice(0, Math.floor(dlg.shown)), w - 36)
  const full = wrapLines(dlg.text, w - 36).length
  const h = 40 + full * 22
  const y = H - h - 14
  panel(x, y, w, h, 12, 'rgba(14,10,6,0.9)', 'rgba(255,224,150,0.65)')
  // name tag
  ctx.font = 'bold 13px sans-serif'
  const nw = ctx.measureText(dlg.speaker).width + 24
  panel(x + 16, y - 14, nw, 26, 8, '#3a2a14', 'rgba(255,224,150,0.7)')
  ctx.fillStyle = '#ffe066'
  ctx.textAlign = 'left'
  ctx.fillText(dlg.speaker, x + 28, y + 4)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  lines.forEach((l, i) => ctx.fillText(l, x + 18, y + 38 + i * 22))
  if (dlg.shown >= dlg.text.length) {
    const b = Math.sin(elapsed * 6) * 2
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.moveTo(x + w - 30, y + h - 22 + b)
    ctx.lineTo(x + w - 18, y + h - 22 + b)
    ctx.lineTo(x + w - 24, y + h - 14 + b)
    ctx.closePath()
    ctx.fill()
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#b8a888'
    ctx.fillText('Space', x + w - 36, y + h - 12 + b)
  }
}

function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    if (p.leaf) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.life * 2)
      ctx.fillRect(-2.5, -1.5, 5, 3)
      ctx.restore()
    } else if (p.fly) {
      const f = Math.abs(Math.sin(elapsed * 13 + p.x)) * 3 + 1
      ctx.fillRect(p.x - f, p.y - 1.5, f, 3)
      ctx.fillRect(p.x, p.y - 1.5, f, 3)
    } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
}

function drawAtmosphere() {
  const key = currentRoomKey
  if (key === 'forest') {
    // sun shafts through the canopy
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 4; i++) {
      const x = 120 + i * 190 + Math.sin(elapsed * 0.3 + i) * 10
      const g = ctx.createLinearGradient(x, 0, x - 70, H)
      g.addColorStop(0, 'rgba(255,240,170,0.16)')
      g.addColorStop(1, 'rgba(255,240,170,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(x - 20, 0)
      ctx.lineTo(x + 24, 0)
      ctx.lineTo(x - 40, H)
      ctx.lineTo(x - 110, H)
      ctx.fill()
    }
    ctx.restore()
    ctx.fillStyle = 'rgba(10,40,20,0.18)'
    ctx.fillRect(0, 0, W, H)
  } else if (key === 'grove') {
    ctx.fillStyle = 'rgba(10,30,60,0.28)'
    ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 9.5 * TILE, 40, W / 2, 9.5 * TILE, 360)
    g.addColorStop(0, 'rgba(150,230,255,0.14)')
    g.addColorStop(1, 'rgba(150,230,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  // soft vignette for everyone
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
}

function drawTitle() {
  // the village as a backdrop, a little traveller wandering through it
  const prevKey = currentRoomKey
  currentRoomKey = 'village'
  const px = player.x
  const py = player.y
  const pf = player.facing
  const pm = player.moving
  const pw = player.walk
  player.x = 80 + ((elapsed * 40) % (W - 160))
  player.y = DOOR_ROW * TILE + 12
  player.facing = 'right'
  player.moving = true
  player.walk = elapsed * 9
  drawScene()
  player.x = px
  player.y = py
  player.facing = pf
  player.moving = pm
  player.walk = pw
  currentRoomKey = prevKey
  ctx.fillStyle = 'rgba(10,8,4,0.55)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.font = 'bold 56px sans-serif'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 9
  ctx.strokeStyle = '#4a2a0a'
  ctx.strokeText('탑뷰 어드벤처', W / 2, 190)
  const g = ctx.createLinearGradient(0, 140, 0, 195)
  g.addColorStop(0, '#fff1b8')
  g.addColorStop(1, '#ffc24a')
  ctx.fillStyle = g
  ctx.fillText('탑뷰 어드벤처', W / 2, 190)
  ctx.font = '17px sans-serif'
  ctx.fillStyle = '#ffe9c8'
  ctx.fillText('열쇠를 찾아 숲속 전설의 보물을 손에 넣어라 — 과연 진짜일까?', W / 2, 232)
  ctx.globalAlpha = 0.55 + Math.sin(elapsed * 3) * 0.45
  ctx.font = 'bold 19px sans-serif'
  ctx.fillStyle = '#ffd24a'
  ctx.fillText('클릭 또는 Space로 시작', W / 2, 330)
  ctx.globalAlpha = 1
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#c8b898'
  ctx.fillText('WASD/방향키 이동 · 사람에게 다가가면 대화 · Space로 넘기기 · M 소리', W / 2, 366)
}

function drawScene() {
  ctx.drawImage(getGround(currentRoomKey), 0, 0)
  // gate shadow in the exit row and cleared exits
  for (const o of sceneObjects()) o.f()
  drawFx()
  drawAtmosphere()
}

function drawEnding() {
  const k = Math.min(1, state.endT / 1.2)
  ctx.fillStyle = `rgba(8,6,2,${0.82 * k})`
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = k
  ctx.textAlign = 'center'
  ctx.font = 'bold 44px sans-serif'
  ctx.fillStyle = '#ffd24a'
  ctx.fillText('— END —', W / 2, 220)
  ctx.font = '18px sans-serif'
  ctx.fillStyle = '#ffe9c8'
  ctx.fillText('낡은 양말 한 짝을 얻었다. (보물은 이미 누군가 가져갔다)', W / 2, 270)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#b8a888'
  ctx.fillText('R 키로 처음부터 다시', W / 2, 320)
  ctx.globalAlpha = 1
}

function render() {
  ctx.clearRect(0, 0, W, H)
  if (state.phase === 'title') {
    drawTitle()
    return
  }
  drawScene()
  drawInventory()
  drawDialogue()
  if (state.ending && !dlg.active) drawEnding()
  if (fade.dir) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade.t)})`
    ctx.fillRect(0, 0, W, H)
  }
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  elapsed += dt
  if (state.phase === 'play') {
    updateDialogue(dt)
    updateFade(dt)
    updatePlayer(dt)
    updatePeople(dt)
  }
  updateFx(dt)
  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
