// Small top-down action-adventure demo (Zelda-style): one room, real-time
// sword combat, wandering enemies, heart-based HP. No images/audio files -
// everything is drawn with Canvas 2D shapes, same approach as the other
// projects in this repo.

const TILE = 32
const COLS = 20
const ROWS = 15

function floorRow(markers = {}) {
  const chars = Array(COLS).fill('.')
  chars[0] = '#'
  chars[COLS - 1] = '#'
  for (const [col, ch] of Object.entries(markers)) chars[Number(col)] = ch
  return chars.join('')
}

// '#' = outer wall, 'b' = bush (also solid), '.' = floor.
const MAP = [
  '#'.repeat(COLS),
  floorRow(),
  floorRow({ 5: 'b', 14: 'b' }),
  floorRow(),
  floorRow({ 9: 'b' }),
  floorRow(),
  floorRow({ 3: 'b', 16: 'b' }),
  floorRow(),
  floorRow({ 7: 'b', 12: 'b' }),
  floorRow(),
  floorRow({ 10: 'b' }),
  floorRow(),
  floorRow({ 4: 'b', 15: 'b' }),
  floorRow(),
  '#'.repeat(COLS),
]
if (MAP.length !== ROWS) throw new Error('map row count mismatch')

const grid = MAP.map((row) => [...row].map((ch) => (ch === '#' || ch === 'b' ? 1 : 0)))

function canMoveTo(x, y, half) {
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
const FACE_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }

const PLAYER_SPEED = 110
const PLAYER_HALF = 10
const ATTACK_COOLDOWN = 0.35
const ATTACK_DURATION = 0.22
const ATTACK_RANGE = 22
const ATTACK_WIDTH = 24
const INVULN_DURATION = 0.7

const ENEMY_SPAWNS = [
  [6, 6],
  [14, 4],
  [10, 10],
]
const ENEMY_HALF = 9
const ENEMY_MAX_HP = 2
const ENEMY_SPEED = 45
const ENEMY_DAMAGE = 1

let player
let enemies
let phase = 'playing' // 'playing' | 'gameOver'
let message = ''

function resetGame() {
  player = {
    x: TILE * 2,
    y: TILE * 2,
    facing: 'down',
    walking: false,
    walkPhase: 0,
    hp: 3,
    maxHp: 3,
    attackCooldown: 0,
    attackTimer: 0,
    invulnTimer: 0,
  }
  enemies = ENEMY_SPAWNS.map(([col, row]) => ({
    x: col * TILE + TILE / 2,
    y: row * TILE + TILE / 2,
    hp: ENEMY_MAX_HP,
    maxHp: ENEMY_MAX_HP,
    dir: randomDir(),
    wanderTimer: 1 + Math.random(),
  }))
  phase = 'playing'
  message = ''
}

function randomDir() {
  const dirs = ['up', 'down', 'left', 'right']
  return dirs[Math.floor(Math.random() * dirs.length)]
}

// Input
const heldKeys = new Set()
const MOVE_KEYS = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
}
const ATTACK_KEYS = [' ', 'spacebar', 'j']
function held(names) {
  return names.some((k) => heldKeys.has(k))
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  heldKeys.add(key)
  if (phase === 'gameOver') {
    resetGame()
    return
  }
  if (ATTACK_KEYS.includes(key) && player.attackCooldown <= 0) {
    player.attackCooldown = ATTACK_COOLDOWN
    player.attackTimer = ATTACK_DURATION
    const hitbox = attackHitbox()
    for (const e of enemies) {
      if (overlapsHitbox(hitbox, e.x, e.y, ENEMY_HALF)) {
        e.hp -= 1
      }
    }
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

function attackHitbox() {
  const w = ATTACK_WIDTH
  const len = ATTACK_RANGE
  const { x, y, facing } = player
  if (facing === 'up') return { x: x - w / 2, y: y - len - PLAYER_HALF, w, h: len }
  if (facing === 'down') return { x: x - w / 2, y: y + PLAYER_HALF, w, h: len }
  if (facing === 'left') return { x: x - len - PLAYER_HALF, y: y - w / 2, w: len, h: w }
  return { x: x + PLAYER_HALF, y: y - w / 2, w: len, h: w }
}

function overlapsHitbox(rect, mx, my, half) {
  return mx + half > rect.x && mx - half < rect.x + rect.w && my + half > rect.y && my - half < rect.y + rect.h
}

function updatePlayer(dt) {
  if (player.attackCooldown > 0) player.attackCooldown -= dt
  if (player.attackTimer > 0) player.attackTimer -= dt
  if (player.invulnTimer > 0) player.invulnTimer -= dt

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
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]
    if (e.hp <= 0) {
      enemies.splice(i, 1)
      continue
    }
    e.wanderTimer -= dt
    if (e.wanderTimer <= 0) {
      e.dir = Math.random() < 0.3 ? null : randomDir() // sometimes pause
      e.wanderTimer = 0.8 + Math.random() * 1.2
    }
    if (e.dir) {
      const [vx, vy] = DIR_VEC[e.dir]
      const tryX = e.x + vx * ENEMY_SPEED * dt
      const tryY = e.y + vy * ENEMY_SPEED * dt
      if (canMoveTo(tryX, e.y, ENEMY_HALF)) e.x = tryX
      else e.dir = randomDir()
      if (canMoveTo(e.x, tryY, ENEMY_HALF)) e.y = tryY
      else e.dir = randomDir()
    }

    if (
      player.invulnTimer <= 0 &&
      Math.abs(player.x - e.x) < PLAYER_HALF + ENEMY_HALF &&
      Math.abs(player.y - e.y) < PLAYER_HALF + ENEMY_HALF
    ) {
      player.hp -= ENEMY_DAMAGE
      player.invulnTimer = INVULN_DURATION
      if (player.hp <= 0) {
        phase = 'gameOver'
        message = '쓰러졌다... 아무 키나 눌러 다시 시작'
      }
    }
  }

  if (enemies.length === 0 && phase === 'playing') {
    phase = 'gameOver'
    message = '모든 적을 물리쳤다! 아무 키나 눌러 다시 시작'
  }
}

function drawMap() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = MAP[row][col]
      ctx.fillStyle = ch === '#' ? '#3a2f20' : ch === 'b' ? '#2f5233' : '#7fb06a'
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

function drawSlash() {
  if (player.attackTimer <= 0) return
  const progress = 1 - player.attackTimer / ATTACK_DURATION
  const center = FACE_ANGLE[player.facing]
  const sweep = Math.PI * 0.6
  const start = center - sweep / 2
  const reveal = start + sweep * Math.min(1, progress * 1.6)
  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.globalAlpha = Math.max(0, 1 - progress)
  ctx.strokeStyle = '#f5f8ff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, 20, start, reveal)
  ctx.stroke()
  ctx.restore()
}

function drawPlayer() {
  const bob = player.walking ? Math.sin(player.walkPhase) * 1.5 : 0
  ctx.save()
  ctx.globalAlpha = player.invulnTimer > 0 && Math.floor(player.invulnTimer * 12) % 2 === 0 ? 0.4 : 1
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

  // sword, held out along the facing direction while attacking
  if (player.attackTimer > 0) {
    ctx.strokeStyle = '#c9ccd6'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(fx * 16, fy * 16)
    ctx.stroke()
  }

  ctx.restore()
  drawSlash()
}

function drawEnemy(e) {
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.fillStyle = '#c0392b'
  ctx.beginPath()
  ctx.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(-3, -2, 2.2, 0, Math.PI * 2)
  ctx.arc(3, -2, 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(-3, -2, 1, 0, Math.PI * 2)
  ctx.arc(3, -2, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (e.hp < e.maxHp) {
    ctx.fillStyle = '#000'
    ctx.fillRect(e.x - 10, e.y - 16, 20, 3)
    ctx.fillStyle = '#4caf50'
    ctx.fillRect(e.x - 10, e.y - 16, 20 * (e.hp / e.maxHp), 3)
  }
}

function drawHeart(cx, cy, size, filled) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(size / 16, size / 16)
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.bezierCurveTo(0, 2, -2, 0, -4, 0)
  ctx.bezierCurveTo(-7, 0, -7, 4, -7, 4)
  ctx.bezierCurveTo(-7, 7, -4, 9.5, 0, 12)
  ctx.bezierCurveTo(4, 9.5, 7, 7, 7, 4)
  ctx.bezierCurveTo(7, 4, 7, 0, 4, 0)
  ctx.bezierCurveTo(2, 0, 0, 2, 0, 4)
  ctx.closePath()
  ctx.fillStyle = filled ? '#e0304f' : 'rgba(255,255,255,0.2)'
  ctx.fill()
  ctx.strokeStyle = '#5c1020'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

function drawHud() {
  for (let i = 0; i < player.maxHp; i++) {
    drawHeart(20 + i * 22, 18, 16, i < player.hp)
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawMap()
  for (const e of enemies) drawEnemy(e)
  drawPlayer()
  drawHud()

  if (phase === 'gameOver') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 6)
  }
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  if (phase === 'playing') {
    updatePlayer(dt)
    updateEnemies(dt)
  }
  render()
  requestAnimationFrame(loop)
}

resetGame()
requestAnimationFrame(loop)
