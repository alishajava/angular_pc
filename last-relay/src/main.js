// Last Relay — real-time top-down action RPG.
// Tile/room architecture (grid rooms, edge exits) follows the same shape
// as topview-adventure, extended with real-time combat: enemies, HP,
// a melee swing, enemy projectiles, and pickups that grow the player's
// stats as they clear rooms.

const TILE = 32
const COLS = 20
const ROWS = 14
const DOOR_ROW = 7

function floorRow(markers = {}) {
  const chars = Array(COLS).fill('.')
  chars[0] = '#'
  chars[COLS - 1] = '#'
  for (const [col, ch] of Object.entries(markers)) chars[Number(col)] = ch
  return chars.join('')
}
const WALL_ROW = '#'.repeat(COLS)

// --- Room layouts ------------------------------------------------------
// d = drone (melee chaser), t = turret (stationary ranged), B = boss
// h = +HP module pickup, a = +ATK module pickup, S = lore terminal
// L/R = exits to the neighboring room

const PLATFORM_A = [
  WALL_ROW,
  floorRow(),
  floorRow({ 10: 'S' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ [COLS - 1]: 'R' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  WALL_ROW,
]

const PLATFORM_B = [
  WALL_ROW,
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ 6: 'd' }),
  floorRow(),
  floorRow({ 10: 'h' }),
  floorRow({ 0: 'L', [COLS - 1]: 'R' }),
  floorRow(),
  floorRow({ 13: 'd' }),
  floorRow(),
  floorRow(),
  floorRow(),
  WALL_ROW,
]

const VAULT_A = [
  WALL_ROW,
  floorRow(),
  floorRow(),
  floorRow({ 5: 'd' }),
  floorRow(),
  floorRow({ 16: 'd' }),
  floorRow(),
  floorRow({ 0: 'L', [COLS - 1]: 'R' }),
  floorRow(),
  floorRow({ 4: 'a' }),
  floorRow({ 15: 't' }),
  floorRow(),
  floorRow(),
  WALL_ROW,
]

const VAULT_B = [
  WALL_ROW,
  floorRow(),
  floorRow(),
  floorRow({ 5: 't', 14: 'd' }),
  floorRow(),
  floorRow({ 10: 'S' }),
  floorRow(),
  floorRow({ 0: 'L', [COLS - 1]: 'R' }),
  floorRow(),
  floorRow(),
  floorRow({ 5: 'd', 14: 'h' }),
  floorRow(),
  floorRow(),
  WALL_ROW,
]

const CORE = [
  WALL_ROW,
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ 14: 'B' }),
  floorRow({ 0: 'L' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow(),
  WALL_ROW,
]

for (const m of [PLATFORM_A, PLATFORM_B, VAULT_A, VAULT_B, CORE]) {
  if (m.length !== ROWS) throw new Error('room row count mismatch')
}

const SOLID = new Set(['#'])
const ENEMY_CHARS = new Set(['d', 't', 'B'])
const ITEM_CHARS = new Set(['h', 'a'])

const LORE = {
  platform_0: '데이터 조각: "...신호 가치 없음. 재개 보류." — 마지막 로그, 타임스탬프 불명',
  vault_0: '데이터 조각: "우리는 더 이상 응답할 이유를 찾지 못했다." — 코어 관리 AI 로그',
}

function buildRoom(mapRows, name, loreKey) {
  const grid = mapRows.map((row) => [...row].map((ch) => (SOLID.has(ch) ? 1 : 0)))
  const enemies = []
  const items = []
  const signs = []
  const doors = []
  for (let row = 0; row < mapRows.length; row++) {
    for (let col = 0; col < mapRows[row].length; col++) {
      const ch = mapRows[row][col]
      const x = col * TILE + TILE / 2
      const y = row * TILE + TILE / 2
      if (ENEMY_CHARS.has(ch)) enemies.push(makeEnemy(ch, x, y))
      else if (ITEM_CHARS.has(ch)) items.push({ type: ch, x, y, collected: false })
      else if (ch === 'S') signs.push({ x, y, text: LORE[loreKey] || '' })
      else if (ch === 'L' || ch === 'R') doors.push({ type: ch, x, y, col, row })
    }
  }
  return { name, mapRows, grid, enemies, items, signs, doors, cleared: enemies.length === 0 }
}

const ROOMS = {
  platformA: buildRoom(PLATFORM_A, 'platformA', 'platform_0'),
  platformB: buildRoom(PLATFORM_B, 'platformB'),
  vaultA: buildRoom(VAULT_A, 'vaultA'),
  vaultB: buildRoom(VAULT_B, 'vaultB', 'vault_0'),
  core: buildRoom(CORE, 'core'),
}
const AREA_NAME = {
  platformA: '1지역 · 궤도 승강장',
  platformB: '1지역 · 궤도 승강장',
  vaultA: '2지역 · 지하 데이터 저장소',
  vaultB: '2지역 · 지하 데이터 저장소',
  core: '3지역 · 중계소 코어',
}
const EXITS = {
  platformA: { R: { room: 'platformB', side: 'L' } },
  platformB: { L: { room: 'platformA', side: 'R' }, R: { room: 'vaultA', side: 'L' } },
  vaultA: { L: { room: 'platformB', side: 'R' }, R: { room: 'vaultB', side: 'L' } },
  vaultB: { L: { room: 'vaultA', side: 'R' }, R: { room: 'core', side: 'L' } },
  core: { L: { room: 'vaultB', side: 'R' } },
}
const ENTRY_COL = { L: 1, R: COLS - 2 }

let currentRoomKey = 'platformA'
function room() {
  return ROOMS[currentRoomKey]
}

// --- Enemies -------------------------------------------------------------
function makeEnemy(type, x, y) {
  if (type === 'd') return { type, x, y, hp: 18, maxHp: 18, speed: 70, contactDamage: 8, aggro: 220, phase: 1 }
  if (type === 't') return { type, x, y, hp: 24, maxHp: 24, speed: 0, fireTimer: 1, fireInterval: 1.6, damage: 10, range: 260, phase: 1 }
  return { type: 'B', x, y, hp: 140, maxHp: 140, speed: 55, contactDamage: 14, fireTimer: 1.5, fireInterval: 2.2, damage: 12, range: 999, phase: 1 }
}

const projectiles = []

function fireProjectile(from, damage, speed) {
  const dx = player.x - from.x
  const dy = player.y - from.y
  const len = Math.hypot(dx, dy) || 1
  projectiles.push({ x: from.x, y: from.y, vx: (dx / len) * speed, vy: (dy / len) * speed, damage, life: 2.5 })
}

function fireSpread(from, damage, speed, count) {
  const baseAngle = Math.atan2(player.y - from.y, player.x - from.x)
  const spread = 0.35
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5
    const angle = baseAngle + t * spread * 2
    projectiles.push({ x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, life: 2.5 })
  }
}

function updateEnemies(dt) {
  const r = room()
  for (const e of r.enemies) {
    if (e.type === 'd') {
      const dx = player.x - e.x
      const dy = player.y - e.y
      const dist = Math.hypot(dx, dy)
      if (dist < e.aggro && dist > 0.01) {
        e.x += (dx / dist) * e.speed * dt
        e.y += (dy / dist) * e.speed * dt
      }
      if (dist < 16 && player.invuln <= 0) damagePlayer(e.contactDamage)
    } else if (e.type === 't') {
      e.fireTimer -= dt
      const dist = Math.hypot(player.x - e.x, player.y - e.y)
      if (e.fireTimer <= 0 && dist < e.range) {
        fireProjectile(e, e.damage, 180)
        e.fireTimer = e.fireInterval
      }
    } else if (e.type === 'B') {
      updateBoss(e, dt)
    }
  }
  r.enemies = r.enemies.filter((e) => e.hp > 0)
  if (r.enemies.length === 0) r.cleared = true

  for (const p of projectiles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt
    if (player.invuln <= 0 && Math.hypot(p.x - player.x, p.y - player.y) < 12) {
      damagePlayer(p.damage)
      p.life = 0
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    if (p.life <= 0 || p.x < 0 || p.x > canvasW() || p.y < 0 || p.y > canvasH()) projectiles.splice(i, 1)
  }
}

function updateBoss(e, dt) {
  if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
    e.phase = 2
    e.speed = 75
    e.fireInterval = 1.3
  }
  const dx = player.x - e.x
  const dy = player.y - e.y
  const dist = Math.hypot(dx, dy)
  if (dist > 60) {
    e.x += (dx / dist) * e.speed * dt
    e.y += (dy / dist) * e.speed * dt
  }
  if (dist < 26 && player.invuln <= 0) damagePlayer(e.contactDamage)
  e.fireTimer -= dt
  if (e.fireTimer <= 0) {
    fireSpread(e, e.damage, 150, e.phase === 2 ? 5 : 3)
    e.fireTimer = e.fireInterval
  }
}

// --- Player --------------------------------------------------------------
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const PLAYER_SPEED = 130
const PLAYER_HALF = 10
const ATTACK_RANGE = 34
const ATTACK_ARC = Math.PI / 2.1
const ATTACK_DURATION = 0.18
const ATTACK_COOLDOWN = 0.35
const INVULN_DURATION = 0.6

const player = {
  x: TILE * 2,
  y: DOOR_ROW * TILE + TILE / 2,
  facing: 'down',
  walking: false,
  walkPhase: 0,
  hp: 60,
  maxHp: 60,
  atk: 8,
  attackTimer: 0,
  attackCooldown: 0,
  invuln: 0,
  hitEnemiesThisSwing: null,
}

function damagePlayer(amount) {
  player.hp = Math.max(0, player.hp - amount)
  player.invuln = INVULN_DURATION
  if (player.hp <= 0) phase = 'gameover'
}

function canvasW() {
  return COLS * TILE
}
function canvasH() {
  return ROWS * TILE
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

function enterRoom(key, side) {
  currentRoomKey = key
  player.x = ENTRY_COL[side] * TILE + TILE / 2
  player.y = DOOR_ROW * TILE + TILE / 2
}

function triggerAttack() {
  if (player.attackCooldown > 0) return
  player.attackTimer = ATTACK_DURATION
  player.attackCooldown = ATTACK_COOLDOWN
  player.hitEnemiesThisSwing = new Set()
}

function resolveAttackHits() {
  if (player.attackTimer <= 0) return
  const [fx, fy] = DIR_VEC[player.facing]
  const facingAngle = Math.atan2(fy, fx)
  for (const e of room().enemies) {
    if (player.hitEnemiesThisSwing.has(e)) continue
    const dx = e.x - player.x
    const dy = e.y - player.y
    const dist = Math.hypot(dx, dy)
    if (dist > ATTACK_RANGE) continue
    const angle = Math.atan2(dy, dx)
    let diff = angle - facingAngle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    if (Math.abs(diff) > ATTACK_ARC / 2) continue
    e.hp -= player.atk
    player.hitEnemiesThisSwing.add(e)
  }
}

function collectItem(item) {
  item.collected = true
  if (item.type === 'h') {
    player.maxHp += 25
    player.hp = player.maxHp
    say('+25 최대 HP 모듈 장착')
  } else {
    player.atk += 5
    say('+5 공격력 모듈 장착')
  }
}

let toast = null
function say(text) {
  toast = { text, until: elapsed + 2 }
}

function updatePlayer(dt) {
  if (player.invuln > 0) player.invuln -= dt
  if (player.attackCooldown > 0) player.attackCooldown -= dt
  if (player.attackTimer > 0) {
    resolveAttackHits()
    player.attackTimer -= dt
  }

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

  const r = room()
  for (const item of r.items) {
    if (item.collected) continue
    if (Math.abs(player.x - item.x) < PLAYER_HALF + 14 && Math.abs(player.y - item.y) < PLAYER_HALF + 14) {
      collectItem(item)
    }
  }
  for (const door of r.doors) {
    const overlapping = Math.abs(player.x - door.x) < PLAYER_HALF + 10 && Math.abs(player.y - door.y) < PLAYER_HALF + 10
    if (!overlapping) continue
    if (door.type === 'R' && !r.cleared) {
      say('방을 정리해야 다음 구역으로 갈 수 있다')
      continue
    }
    const exit = EXITS[currentRoomKey][door.type]
    if (exit) enterRoom(exit.room, exit.side)
  }

  if (currentRoomKey === 'core') {
    // Use a fresh room() lookup, not the `r` captured at the top of this
    // function - a door transition earlier in this same call can change
    // currentRoomKey to 'core' while `r` still points at the room just
    // left, which has no boss and would fire the ending immediately.
    const core = room()
    const boss = core.enemies.find((e) => e.type === 'B')
    if (!boss && core.hadBoss !== false) {
      core.hadBoss = false
      phase = 'ending'
    } else if (boss) {
      core.hadBoss = true
    }
  }
}

// --- Input -----------------------------------------------------------------
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
  if (key === 'r') restart()
  if (phase === 'title' && (key === 'enter' || key === ' ')) phase = 'intro'
  else if (phase === 'intro' && key === 'enter') phase = 'playing'
  else if (phase === 'playing' && key === ' ') triggerAttack()
  else if (phase === 'ending' && (key === '1' || key === '2')) {
    endingChoice = key
    phase = 'outro'
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

let phase = 'title'
let elapsed = 0
let endingChoice = null

function restart() {
  currentRoomKey = 'platformA'
  for (const key of Object.keys(ROOMS)) {
    const fresh = buildRoom(ROOMS[key].mapRows, key, key === 'platformA' ? 'platform_0' : key === 'vaultB' ? 'vault_0' : undefined)
    ROOMS[key] = fresh
  }
  player.x = TILE * 2
  player.y = DOOR_ROW * TILE + TILE / 2
  player.facing = 'down'
  player.hp = 60
  player.maxHp = 60
  player.atk = 8
  player.attackTimer = 0
  player.attackCooldown = 0
  player.invuln = 0
  projectiles.length = 0
  toast = null
  endingChoice = null
  phase = 'title'
}

// --- Rendering ---------------------------------------------------------
const canvas = document.getElementById('game')
canvas.width = canvasW()
canvas.height = canvasH()
const ctx = canvas.getContext('2d')

function drawMap() {
  const r = room()
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = r.mapRows[row][col]
      const isDoor = ch === 'L' || ch === 'R'
      ctx.fillStyle = ch === '#' ? '#1b2230' : isDoor ? (ch === 'R' && !r.cleared ? '#5a2a2a' : '#2f7a6b') : '#232c3d'
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
  ctx.strokeStyle = 'rgba(120,180,255,0.05)'
  ctx.lineWidth = 1
  for (let col = 1; col < COLS; col++) {
    ctx.beginPath()
    ctx.moveTo(col * TILE, 0)
    ctx.lineTo(col * TILE, canvas.height)
    ctx.stroke()
  }
  for (let row = 1; row < ROWS; row++) {
    ctx.beginPath()
    ctx.moveTo(0, row * TILE)
    ctx.lineTo(canvas.width, row * TILE)
    ctx.stroke()
  }
}

function drawSigns() {
  for (const s of room().signs) {
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.fillStyle = '#4a5a7a'
    ctx.beginPath()
    ctx.roundRect(-10, -10, 20, 20, 3)
    ctx.fill()
    ctx.fillStyle = '#9fd8ff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('i', 0, 0)
    ctx.restore()
  }
}

function drawItems() {
  for (const item of room().items) {
    if (item.collected) continue
    ctx.save()
    ctx.translate(item.x, item.y + Math.sin(elapsed * 4) * 2)
    ctx.fillStyle = item.type === 'h' ? '#5cff8f' : '#ff8f5c'
    ctx.beginPath()
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#10140f'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.type === 'h' ? '+' : '!', 0, 0)
    ctx.restore()
  }
}

function drawHpBar(x, y, w, hp, maxHp, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(x, y, w, 5)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * Math.max(0, hp / maxHp), 5)
}

function drawEnemies() {
  for (const e of room().enemies) {
    ctx.save()
    ctx.translate(e.x, e.y)
    if (e.type === 'd') {
      ctx.fillStyle = '#d1553f'
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, Math.PI * 2)
      ctx.fill()
    } else if (e.type === 't') {
      ctx.fillStyle = '#8a5fd1'
      ctx.beginPath()
      ctx.roundRect(-10, -10, 20, 20, 4)
      ctx.fill()
    } else {
      ctx.fillStyle = e.phase === 2 ? '#ff3b3b' : '#b23bff'
      ctx.beginPath()
      ctx.arc(0, 0, 22, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    const w = e.type === 'B' ? 48 : 20
    drawHpBar(e.x - w / 2, e.y - (e.type === 'B' ? 32 : 18), w, e.hp, e.maxHp, '#ff5c5c')
  }
}

function drawProjectiles() {
  ctx.fillStyle = '#ffd23f'
  for (const p of projectiles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPlayer() {
  const bob = player.walking ? Math.sin(player.walkPhase) * 1.5 : 0
  ctx.save()
  ctx.translate(player.x, player.y + bob)
  ctx.globalAlpha = player.invuln > 0 && Math.floor(elapsed * 20) % 2 === 0 ? 0.4 : 1

  const footOffset = player.walking ? Math.sin(player.walkPhase) * 3 : 0
  ctx.fillStyle = '#1a2030'
  ctx.fillRect(-7, 6 + footOffset, 4, 5)
  ctx.fillRect(3, 6 - footOffset, 4, 5)

  ctx.fillStyle = '#4fa8ff'
  ctx.beginPath()
  ctx.roundRect(-9, -9, 18, 18, 4)
  ctx.fill()

  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()

  const [fx, fy] = DIR_VEC[player.facing]
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(fx * 4, fy * 4, 1.6, 0, Math.PI * 2)
  ctx.fill()

  if (player.attackTimer > 0) {
    const facingAngle = Math.atan2(fy, fx)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, ATTACK_RANGE, facingAngle - ATTACK_ARC / 2, facingAngle + ATTACK_ARC / 2)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

function drawHud() {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#9fd8ff'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(AREA_NAME[currentRoomKey], 10, 8)

  ctx.font = 'bold 11px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(`HP ${Math.ceil(player.hp)}/${player.maxHp}`, 10, 26)
  drawHpBar(10, 40, 120, player.hp, player.maxHp, '#5cff8f')
  ctx.fillText(`공격력 ${player.atk}`, 10, 50)

  if (toast && elapsed < toast.until) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    const w = ctx.measureText(toast.text).width + 28
    ctx.fillRect(canvas.width / 2 - w / 2, 10, w, 24)
    ctx.fillStyle = '#ffd23f'
    ctx.fillText(toast.text, canvas.width / 2, 16)
    ctx.textAlign = 'left'
  }
}

function drawOverlay(lines, opts = {}) {
  ctx.fillStyle = 'rgba(5,8,14,0.88)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#9fd8ff'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(opts.title || '', canvas.width / 2, canvas.height / 2 - 90)
  ctx.fillStyle = '#fff'
  ctx.font = '14px sans-serif'
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 30 + i * 24)
  })
  if (opts.footer) {
    ctx.fillStyle = '#ccc'
    ctx.font = '13px sans-serif'
    ctx.fillText(opts.footer, canvas.width / 2, canvas.height - 40)
  }
  ctx.textAlign = 'left'
}

function drawTitle() {
  drawOverlay(
    [
      '인류가 떠난 지 오래된 외딴 행성계.',
      '중계소들이 하나둘 침묵한 이유를 조사하러 왔다.',
    ],
    { title: '마지막 중계소', footer: 'Enter 또는 Space로 시작' },
  )
}

function drawIntro() {
  drawOverlay(
    [
      '당신은 프리랜서 리페어러.',
      '버려진 중계소를 돌며 부품과 데이터를 모아 스스로를 강화한다.',
      '각 구역을 정리해야 다음으로 나아갈 수 있다.',
    ],
    { title: '임무 개시', footer: 'Enter로 진행' },
  )
}

function drawGameOver() {
  drawOverlay(['신호가 끊겼다...'], { title: '교신 두절', footer: 'R 키로 다시 시작' })
}

function drawEnding() {
  drawOverlay(
    ['코어 AI가 침묵한다. 이제 당신의 선택에 달렸다.', '', '1: 코어를 파괴하고 네트워크를 강제로 재가동한다', '2: AI를 설득해 공존을 시도한다'],
    { title: '코어 함락' },
  )
}

function drawOutro() {
  const text =
    endingChoice === '1'
      ? [
          '코어를 파괴하자 네트워크가 비틀거리며 재가동됐다.',
          '신호는 돌아왔지만, 그 끝에 있던 목소리는 더 이상 없다.',
          '',
          '— ENDING: 침묵 속의 재개 —',
        ]
      : [
          '코어는 오랜 침묵 끝에 입을 열었다.',
          '"...당신이라면, 다시 응답할 이유가 될지도."',
          '중계소는 다시, 아주 조금씩 깨어나기 시작했다.',
          '',
          '— ENDING: 다시 듣는 신호 —',
        ]
  drawOverlay(text, { title: '임무 완료', footer: 'R 키로 다시 시작' })
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (phase === 'title') {
    drawTitle()
    return
  }
  drawMap()
  drawSigns()
  drawItems()
  drawEnemies()
  drawProjectiles()
  drawPlayer()
  drawHud()
  if (phase === 'intro') drawIntro()
  else if (phase === 'gameover') drawGameOver()
  else if (phase === 'ending') drawEnding()
  else if (phase === 'outro') drawOutro()
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  elapsed += dt

  if (phase === 'playing') {
    updatePlayer(dt)
    updateEnemies(dt)
  }

  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
