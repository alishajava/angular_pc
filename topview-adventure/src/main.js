// Top-down exploration/puzzle adventure, Sierra-style (King's Quest /
// Leisure Suit Larry era): walk between a few connected rooms, talk to
// people, pick up an item, use it to get past a locked gate. No combat,
// no images/audio files - everything is drawn with Canvas 2D shapes.

const TILE = 32
const COLS = 25
const ROWS = 18

function floorRow(markers = {}) {
  const chars = Array(COLS).fill('.')
  chars[0] = '#'
  chars[COLS - 1] = '#'
  for (const [col, ch] of Object.entries(markers)) chars[Number(col)] = ch
  return chars.join('')
}

const DOOR_ROW = 9 // the row an edge exit opens a gap on

// Letters: '#' wall, 'b' bush (solid), '.' floor, 'L'/'R' exits to the
// room on that side, 'V'/'W' villagers, 'C' a readable sign/chest,
// 'K' the key pickup, 'T' the treasure (win condition).
const ROOM_A = [
  '#'.repeat(COLS),
  floorRow(),
  floorRow({ 6: 'b' }),
  floorRow(),
  floorRow({ 18: 'b' }),
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
  floorRow(),
  floorRow(),
  '#'.repeat(COLS),
]

const ROOM_B = [
  '#'.repeat(COLS),
  floorRow(),
  floorRow({ 5: 'b', 19: 'b' }),
  floorRow(),
  floorRow({ 12: 'b' }),
  floorRow(),
  floorRow({ 3: 'b', 21: 'b' }),
  floorRow(),
  floorRow({ 16: 'W' }),
  floorRow({ 0: 'L', [COLS - 1]: 'R' }),
  floorRow(),
  floorRow({ 9: 'b' }),
  floorRow(),
  floorRow({ 6: 'b', 17: 'b' }),
  floorRow(),
  floorRow(),
  floorRow(),
  '#'.repeat(COLS),
]

const ROOM_C = [
  '#'.repeat(COLS),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ 0: 'L', 12: 'T' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  '#'.repeat(COLS),
]

for (const m of [ROOM_A, ROOM_B, ROOM_C]) {
  if (m.length !== ROWS) throw new Error('room row count mismatch')
}

const SOLID = new Set(['#', 'b'])

const DIALOGUE = {
  V: { speaker: '마을 사람', text: '숲속에 보물이 있다는 소문이 있어. 하지만 문이 잠겨있을 거야.' },
  W: { speaker: '숲지기', text: '동쪽 문은 오래전에 잠겼지. 열쇠를 가진 자만 지나갈 수 있어.' },
  C: { speaker: '팻말', text: '"조심하시오. 숲의 문은 열쇠 없이 열리지 않는다."' },
}

function buildInteractables(mapRows) {
  const list = []
  for (let row = 0; row < mapRows.length; row++) {
    for (let col = 0; col < mapRows[row].length; col++) {
      const ch = mapRows[row][col]
      if (!'VWCKTLR'.includes(ch)) continue
      list.push({
        type: ch,
        x: col * TILE + TILE / 2,
        y: row * TILE + TILE / 2,
        col,
        row,
        collected: false,
        touching: false,
      })
    }
  }
  return list
}

function makeRoom(mapRows, name) {
  const grid = mapRows.map((row) => [...row].map((ch) => (SOLID.has(ch) ? 1 : 0)))
  return { name, mapRows, grid, interactables: buildInteractables(mapRows) }
}

const ROOMS = {
  village: makeRoom(ROOM_A, 'village'),
  forest: makeRoom(ROOM_B, 'forest'),
  grove: makeRoom(ROOM_C, 'grove'),
}
// which room an exit leads to, and which column to enter at
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

function canMoveTo(x, y, half) {
  const grid = room().grid
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ]
  for (const [cx, cy] of corners) {
    const col = Math.floor(cx / TILE)
    const row = Math.floor(cy / TILE)
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false
    if (grid[row][col] === 1) return false
  }
  return true
}

const canvas = document.getElementById('game')
canvas.width = COLS * TILE
canvas.height = ROWS * TILE
const ctx = canvas.getContext('2d')

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

const PLAYER_SPEED = 120
const PLAYER_HALF = 10
const DIALOGUE_DURATION = 3.2

const player = {
  x: TILE * 2,
  y: DOOR_ROW * TILE + TILE / 2,
  facing: 'down',
  walking: false,
  walkPhase: 0,
}
const inventory = []
let dialogueSpeaker = ''
let dialogueText = ''
let dialogueTimer = 0

function enterRoom(key, side) {
  currentRoomKey = key
  player.x = ENTRY_COL[side] * TILE + TILE / 2
  player.y = DOOR_ROW * TILE + TILE / 2
  for (const it of room().interactables) it.touching = false
}

function say(speaker, text) {
  dialogueSpeaker = speaker
  dialogueText = text
  dialogueTimer = DIALOGUE_DURATION
}

function triggerInteraction(item) {
  if (item.type === 'V' || item.type === 'W' || item.type === 'C') {
    const line = DIALOGUE[item.type]
    say(line.speaker, line.text)
    return
  }
  if (item.type === 'K') {
    if (item.collected) return
    item.collected = true
    inventory.push('key')
    say('시스템', '열쇠를 주웠다!')
    return
  }
  if (item.type === 'T') {
    say('???', '보물 상자다! 반짝이는 보석이 가득하다. 모험 완료!')
    return
  }
  if (item.type === 'L' || item.type === 'R') {
    const exit = EXITS[currentRoomKey][item.type]
    if (!exit) return
    if (currentRoomKey === 'forest' && item.type === 'R' && !inventory.includes('key')) {
      say('???', '문이 굳게 잠겨 있다. 열쇠가 필요할 것 같다.')
      return
    }
    enterRoom(exit.room, exit.side)
  }
}

// Input
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
window.addEventListener('keydown', (e) => heldKeys.add(e.key.toLowerCase()))
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

function updatePlayer(dt) {
  if (dialogueTimer > 0) dialogueTimer -= dt

  let dx = 0
  let dy = 0
  if (held(MOVE_KEYS.left)) dx -= 1
  if (held(MOVE_KEYS.right)) dx += 1
  if (held(MOVE_KEYS.up)) dy -= 1
  if (held(MOVE_KEYS.down)) dy += 1
  player.walking = dx !== 0 || dy !== 0
  if (player.walking) {
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2
      dy *= Math.SQRT1_2
    }
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    player.walkPhase += dt * 10
    const tryX = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(tryX, player.y, PLAYER_HALF)) player.x = tryX
    const tryY = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(player.x, tryY, PLAYER_HALF)) player.y = tryY
  }

  for (const item of room().interactables) {
    if (item.type === 'K' && item.collected) continue
    const overlapping = Math.abs(player.x - item.x) < PLAYER_HALF + 14 && Math.abs(player.y - item.y) < PLAYER_HALF + 14
    if (overlapping && !item.touching) {
      item.touching = true
      triggerInteraction(item)
    } else if (!overlapping) {
      item.touching = false
    }
  }
}

function drawMap() {
  const mapRows = room().mapRows
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = mapRows[row][col]
      const isDoor = ch === 'L' || ch === 'R'
      ctx.fillStyle = ch === '#' ? '#3a2f20' : ch === 'b' ? '#2f5233' : isDoor ? '#6b4a2f' : '#7fb06a'
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      if (ch === 'b') {
        ctx.fillStyle = '#3f6b45'
        ctx.beginPath()
        ctx.arc(col * TILE + TILE / 2, row * TILE + TILE / 2, TILE * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

function drawVillager(x, y, outfit) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#2b2440'
  ctx.fillRect(-7, 6, 4, 6)
  ctx.fillRect(3, 6, 4, 6)
  ctx.fillStyle = outfit
  ctx.beginPath()
  ctx.roundRect(-9, -9, 18, 18, 4)
  ctx.fill()
  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSign(x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#8a6a2e'
  ctx.fillRect(-2, 0, 4, 12)
  ctx.fillStyle = '#c9a86a'
  ctx.beginPath()
  ctx.roundRect(-12, -14, 24, 16, 2)
  ctx.fill()
  ctx.strokeStyle = '#5c431c'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function drawKey(x, y) {
  ctx.save()
  ctx.translate(x, y + Math.sin(performance.now() / 300) * 2)
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(-4, 0, 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(6, 0)
  ctx.lineTo(6, 4)
  ctx.moveTo(9, 0)
  ctx.lineTo(9, 4)
  ctx.stroke()
  ctx.restore()
}

function drawTreasure(x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.roundRect(-14, -4, 28, 14, 3)
  ctx.fill()
  ctx.fillStyle = '#c9a86a'
  ctx.beginPath()
  ctx.ellipse(0, -4, 14, 6, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.arc(0, -2, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawInteractables() {
  for (const item of room().interactables) {
    if (item.type === 'V') drawVillager(item.x, item.y, '#8c9bab')
    else if (item.type === 'W') drawVillager(item.x, item.y, '#5a8f5a')
    else if (item.type === 'C') drawSign(item.x, item.y)
    else if (item.type === 'K' && !item.collected) drawKey(item.x, item.y)
    else if (item.type === 'T') drawTreasure(item.x, item.y)
  }
}

function drawPlayer() {
  const bob = player.walking ? Math.sin(player.walkPhase) * 1.5 : 0
  ctx.save()
  ctx.translate(player.x, player.y + bob)

  const footOffset = player.walking ? Math.sin(player.walkPhase) * 3 : 0
  ctx.fillStyle = '#2b2440'
  ctx.fillRect(-7, 6 + footOffset, 4, 5)
  ctx.fillRect(3, 6 - footOffset, 4, 5)

  ctx.fillStyle = '#3f7fd1'
  ctx.beginPath()
  ctx.roundRect(-9, -9, 18, 18, 4)
  ctx.fill()

  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()

  const [fx, fy] = DIR_VEC[player.facing]
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(fx * 4, fy * 4, 1.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawInventory() {
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('소지품:', 10, 20)
  if (inventory.includes('key')) {
    ctx.save()
    ctx.translate(70, 14)
    drawKey(0, 0)
    ctx.restore()
  }
}

function drawDialogue() {
  if (dialogueTimer <= 0) return
  const h = 54
  const y = canvas.height - h
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(0, y, canvas.width, h)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(dialogueSpeaker, 14, y + 20)
  ctx.fillStyle = '#fff'
  ctx.font = '13px sans-serif'
  ctx.fillText(dialogueText, 14, y + 40)
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawMap()
  drawInteractables()
  drawPlayer()
  drawInventory()
  drawDialogue()
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  updatePlayer(dt)
  render()
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)
