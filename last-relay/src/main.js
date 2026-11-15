// Last Relay — real-time top-down action RPG.
// Tile/room architecture (grid rooms, edge exits) follows the same shape
// as topview-adventure, extended with real-time combat: enemies, HP,
// a melee swing, enemy projectiles, and pickups that grow the player's
// stats as they clear rooms.

import { sfx, unlockSfx, toggleMute } from './sfx.js'

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
  const fx = { flash: 0, kx: 0, ky: 0, t: Math.random() * 6, ang: 0, windup: 0 }
  if (type === 'd') return { type, x, y, hp: 18, maxHp: 18, speed: 70, contactDamage: 8, aggro: 220, phase: 1, ...fx }
  if (type === 't') return { type, x, y, hp: 24, maxHp: 24, speed: 0, fireTimer: 1, fireInterval: 1.6, damage: 10, range: 260, phase: 1, ...fx }
  return { type: 'B', x, y, hp: 140, maxHp: 140, speed: 55, contactDamage: 14, fireTimer: 1.5, fireInterval: 2.2, damage: 12, range: 999, phase: 1, ...fx }
}

// --- Juice: particles, damage numbers, screen shake -----------------------
const particles = []
const popups = []
const shake = { t: 0, mag: 0 }
let hurtFlash = 0
let flashWhite = 0
function burst(x, y, color, n = 10, speed = 120, life = 0.5, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.4 + Math.random() * 0.8)
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * (0.6 + Math.random() * 0.8) })
  }
}
function popup(x, y, text, color = '#fff') {
  popups.push({ x, y, text, color, t: 0 })
}
function addShake(mag, t = 0.2) {
  shake.mag = Math.max(shake.mag, mag)
  shake.t = Math.max(shake.t, t)
}

const projectiles = []

function fireProjectile(from, damage, speed) {
  sfx.hit()
  const dx = player.x - from.x
  const dy = player.y - from.y
  const len = Math.hypot(dx, dy) || 1
  projectiles.push({ x: from.x, y: from.y, vx: (dx / len) * speed, vy: (dy / len) * speed, damage, life: 2.5 })
}

function fireSpread(from, damage, speed, count) {
  sfx.heavy()
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
    e.t += dt
    if (e.flash > 0) e.flash -= dt
    e.ang = Math.atan2(player.y - e.y, player.x - e.x)
    if (e.kx || e.ky) {
      const nx = e.x + e.kx * dt
      const ny = e.y + e.ky * dt
      if (canMoveTo(nx, e.y, 8)) e.x = nx
      if (canMoveTo(e.x, ny, 8)) e.y = ny
      const k = Math.pow(0.0008, dt)
      e.kx *= k
      e.ky *= k
      if (Math.abs(e.kx) + Math.abs(e.ky) < 6) e.kx = e.ky = 0
    }
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
      e.windup = e.fireTimer < 0.45 && dist < e.range ? 1 - e.fireTimer / 0.45 : 0
      if (e.fireTimer <= 0 && dist < e.range) {
        fireProjectile(e, e.damage, 180)
        e.fireTimer = e.fireInterval
      }
    } else if (e.type === 'B') {
      updateBoss(e, dt)
    }
  }
  for (const e of r.enemies) {
    if (e.hp > 0) continue
    const big = e.type === 'B'
    burst(e.x, e.y, big ? '#ff6bd0' : '#ffb34a', big ? 60 : 16, big ? 260 : 150, big ? 1 : 0.55, big ? 5 : 3)
    burst(e.x, e.y, '#fff', big ? 20 : 6, 90, 0.35, 2)
    popup(e.x, e.y - 20, big ? '코어 함락!' : '격파', '#ffd23f')
    addShake(big ? 9 : 3, big ? 0.6 : 0.15)
    big ? sfx.fanfare() : sfx.heavy()
    if (big) flashWhite = 0.6
  }
  const wasCleared = r.cleared
  r.enemies = r.enemies.filter((e) => e.hp > 0)
  if (r.enemies.length === 0) r.cleared = true
  if (r.cleared && !wasCleared && r.doors.some((d) => d.type === 'R')) {
    sfx.good()
    say('구역 정리 완료 — 다음 문이 열렸다')
    for (const d of r.doors) if (d.type === 'R') burst(d.x, d.y, '#5cffc8', 18, 90, 0.7, 3)
  }

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
    sfx.alarm()
    addShake(6, 0.5)
    flashWhite = 0.35
    burst(e.x, e.y, '#ff3b3b', 30, 200, 0.7, 4)
    say('코어 가디언이 폭주한다!')
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
  e.windup = e.fireTimer < 0.5 ? 1 - e.fireTimer / 0.5 : 0
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
  swingSide: 1,
}

function damagePlayer(amount) {
  player.hp = Math.max(0, player.hp - amount)
  player.invuln = INVULN_DURATION
  hurtFlash = 0.35
  addShake(4, 0.2)
  burst(player.x, player.y, '#ff5c5c', 10, 120, 0.4, 3)
  popup(player.x, player.y - 22, `-${amount}`, '#ff6b6b')
  sfx.hurt()
  if (player.hp <= 0) {
    phase = 'gameover'
    sfx.lose()
  }
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
  sfx.click()
  projectiles.length = 0
  currentRoomKey = key
  player.x = ENTRY_COL[side] * TILE + TILE / 2
  player.y = DOOR_ROW * TILE + TILE / 2
}

function triggerAttack() {
  if (player.attackCooldown > 0) return
  player.attackTimer = ATTACK_DURATION
  player.attackCooldown = ATTACK_COOLDOWN
  player.hitEnemiesThisSwing = new Set()
  player.swingSide *= -1
  sfx.whoosh()
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
    e.flash = 0.12
    const kb = e.type === 'B' ? 40 : e.type === 't' ? 0 : 230
    e.kx = (dx / (dist || 1)) * kb
    e.ky = (dy / (dist || 1)) * kb
    player.hitEnemiesThisSwing.add(e)
    burst(e.x, e.y, '#ffe9a0', 7, 140, 0.3, 2.5)
    popup(e.x + (Math.random() - 0.5) * 10, e.y - 16, String(player.atk), '#fff')
    addShake(e.type === 'B' ? 2.5 : 1.5, 0.08)
    e.hp > 0 ? sfx.hit() : null
  }
}

function collectItem(item) {
  item.collected = true
  sfx.pickup()
  burst(item.x, item.y, item.type === 'h' ? '#5cff8f' : '#ff8f5c', 16, 130, 0.5, 3)
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
      if (!toast || elapsed > toast.until - 1.2) sfx.bad()
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
      endingT = 0
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
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault()
  unlockSfx()
  heldKeys.add(key)
  if (key === 'm') {
    say(toggleMute() ? '소리 끔 (M)' : '소리 켬 (M)')
    return
  }
  if (key === 'r') {
    restart()
    return
  }
  if (e.repeat) return
  if (phase === 'title' && (key === 'enter' || key === ' ')) {
    phase = 'intro'
    sfx.click()
  } else if (phase === 'intro' && (key === 'enter' || key === ' ')) {
    phase = 'playing'
    sfx.start()
  } else if (phase === 'playing' && key === ' ') triggerAttack()
  else if (phase === 'ending' && (key === '1' || key === '2')) {
    endingChoice = key
    phase = 'outro'
    endingT = 0
    sfx.good()
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

let phase = 'title'
let elapsed = 0
let endingChoice = null
let endingT = 0

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
  particles.length = 0
  popups.length = 0
  hurtFlash = 0
  toast = null
  endingChoice = null
  phase = 'title'
}

// --- Rendering ---------------------------------------------------------
const canvas = document.getElementById('game')
canvas.width = canvasW()
canvas.height = canvasH()
const ctx = canvas.getContext('2d')

const THEMES = {
  platform: { floor: ['#26324a', '#2a3752'], wall: '#161d2d', accent: '#4fa8ff', glow: '79,168,255', fog: '10,18,36' },
  vault: { floor: ['#1f3b3d', '#234346'], wall: '#12262a', accent: '#5cffc8', glow: '92,255,200', fog: '6,22,24' },
  core: { floor: ['#3a2338', '#43283f'], wall: '#241320', accent: '#ff5c9a', glow: '255,92,154', fog: '30,8,22' },
}
const themeOf = (key) => (key.startsWith('platform') ? THEMES.platform : key.startsWith('vault') ? THEMES.vault : THEMES.core)
const hash2 = (a, b, k = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}
const roomOrder = ['platformA', 'platformB', 'vaultA', 'vaultB', 'core']

// Floor, walls and scenery never change, so each room is painted once.
const staticCache = {}
function buildStatic(key) {
  const r = ROOMS[key]
  const th = themeOf(key)
  const c = document.createElement('canvas')
  c.width = canvas.width
  c.height = canvas.height
  const g = c.getContext('2d')
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = r.mapRows[row][col]
      const x = col * TILE
      const y = row * TILE
      if (ch === '#') continue
      g.fillStyle = th.floor[(col + row) % 2]
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = 'rgba(255,255,255,0.04)'
      g.fillRect(x, y, TILE, 2)
      g.fillRect(x, y, 2, TILE)
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(x, y + TILE - 2, TILE, 2)
      g.fillRect(x + TILE - 2, y, 2, TILE)
      const h = hash2(col, row)
      if (h > 0.9) {
        // floor vent
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(x + 6, y + 8, 20, 16)
        g.fillStyle = 'rgba(255,255,255,0.12)'
        for (let i = 0; i < 4; i++) g.fillRect(x + 8, y + 10 + i * 4, 16, 1.5)
      } else if (h > 0.82) {
        // scorch / crack
        g.strokeStyle = 'rgba(0,0,0,0.4)'
        g.lineWidth = 1.4
        g.beginPath()
        g.moveTo(x + 4 + h * 10, y + 4)
        g.lineTo(x + 14, y + 14)
        g.lineTo(x + 10 + h * 8, y + 28)
        g.stroke()
      } else if (h < 0.07) {
        // painted guide marking
        g.fillStyle = `rgba(${th.glow},0.12)`
        g.fillRect(x + 14, y, 4, TILE)
      }
    }
  }
  // walls
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (r.mapRows[row][col] !== '#') continue
      const x = col * TILE
      const y = row * TILE
      g.fillStyle = th.wall
      g.fillRect(x, y, TILE, TILE)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      g.fillRect(x, y, TILE, 3)
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(x, y + TILE - 3, TILE, 3)
      g.fillRect(x + TILE - 1, y, 1, TILE)
      g.fillStyle = 'rgba(255,255,255,0.1)'
      for (const [dx, dy] of [[4, 4], [TILE - 5, 4], [4, TILE - 6], [TILE - 5, TILE - 6]]) g.fillRect(x + dx, y + dy, 2, 2)
    }
  }
  // accent light strip along the inside of the top and bottom walls
  for (const y of [TILE - 2, (ROWS - 1) * TILE]) {
    g.fillStyle = `rgba(${th.glow},0.55)`
    g.fillRect(TILE, y, canvas.width - TILE * 2, 2)
  }
  // a few wall-mounted panels with tiny status lights
  for (let col = 2; col < COLS - 2; col += 4) {
    if (hash2(col, 0, 3) < 0.5) continue
    g.fillStyle = 'rgba(0,0,0,0.4)'
    g.fillRect(col * TILE, 4, TILE * 2 - 4, TILE - 10)
    g.fillStyle = `rgba(${th.glow},0.8)`
    for (let i = 0; i < 4; i++) g.fillRect(col * TILE + 6 + i * 12, 10 + (i % 2) * 6, 6, 3)
  }
  // vault: server racks along the back wall; core: reactor conduits
  if (key.startsWith('vault')) {
    for (let col = 3; col < COLS - 3; col += 5) {
      g.fillStyle = '#0d1a1d'
      g.fillRect(col * TILE, TILE, TILE * 2, TILE * 1.6)
      g.strokeStyle = 'rgba(92,255,200,0.4)'
      g.strokeRect(col * TILE + 0.5, TILE + 0.5, TILE * 2 - 1, TILE * 1.6 - 1)
      for (let i = 0; i < 6; i++) {
        g.fillStyle = hash2(col, i, 9) > 0.5 ? '#5cffc8' : '#2a6a5a'
        g.fillRect(col * TILE + 6, TILE + 6 + i * 7, 5, 3)
        g.fillStyle = 'rgba(255,255,255,0.12)'
        g.fillRect(col * TILE + 16, TILE + 6 + i * 7, 38, 3)
      }
    }
  } else if (key === 'core') {
    for (const cx of [4, COLS - 5]) {
      g.fillStyle = 'rgba(255,92,154,0.25)'
      g.fillRect(cx * TILE, TILE, 8, (ROWS - 2) * TILE)
      g.fillRect(cx * TILE + 14, TILE, 3, (ROWS - 2) * TILE)
    }
  }
  return c
}

function drawMap() {
  const key = currentRoomKey
  if (!staticCache[key]) staticCache[key] = buildStatic(key)
  ctx.drawImage(staticCache[key], 0, 0)
  const r = room()
  const th = themeOf(key)
  for (const d of r.doors) {
    const x = d.col * TILE
    const y = d.row * TILE
    const locked = d.type === 'R' && !r.cleared
    const col = locked ? '255,80,80' : '92,255,160'
    ctx.fillStyle = '#0b1018'
    ctx.fillRect(x, y - TILE, TILE, TILE * 3)
    // hazard stripes at the frame
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#e8c040' : '#222'
      ctx.fillRect(d.type === 'L' ? x + TILE - 5 : x, y - TILE + i * 16, 5, 16)
    }
    const pulse = 0.55 + Math.sin(elapsed * (locked ? 6 : 3)) * 0.25
    ctx.fillStyle = `rgba(${col},${locked ? pulse * 0.45 : 0.22})`
    ctx.fillRect(x, y - 8, TILE, TILE + 16)
    ctx.strokeStyle = `rgba(${col},${pulse})`
    ctx.lineWidth = 2
    ctx.strokeRect(x + 3, y - 6, TILE - 6, TILE + 12)
    ctx.fillStyle = `rgb(${col})`
    if (locked) {
      ctx.beginPath()
      ctx.roundRect(x + 10, y + 12, 12, 10, 2)
      ctx.fill()
      ctx.strokeStyle = `rgb(${col})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x + 16, y + 11, 4, Math.PI, 0)
      ctx.stroke()
    } else {
      const dir = d.type === 'R' ? 1 : -1
      for (let i = 0; i < 2; i++) {
        const ox = ((elapsed * 18 + i * 10) % 20) - 10
        ctx.globalAlpha = 0.8 - Math.abs(ox) / 14
        ctx.beginPath()
        ctx.moveTo(x + 16 + dir * (ox - 4), y + 8)
        ctx.lineTo(x + 16 + dir * (ox + 4), y + 16)
        ctx.lineTo(x + 16 + dir * (ox - 4), y + 24)
        ctx.lineTo(x + 16 + dir * (ox - 1), y + 16)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }
  void th
}

function drawSigns() {
  for (const s of room().signs) {
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 12, 12, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a3550'
    ctx.beginPath()
    ctx.roundRect(-11, -14, 22, 24, 3)
    ctx.fill()
    ctx.strokeStyle = '#5a7ab0'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#071018'
    ctx.fillRect(-8, -11, 16, 11)
    ctx.fillStyle = '#7fe0ff'
    for (let i = 0; i < 3; i++) {
      const w = 5 + ((Math.floor(elapsed * 3) + i * 7) % 6)
      ctx.fillRect(-6, -9 + i * 3.4, w, 1.6)
    }
    ctx.fillStyle = '#ffd23f'
    ctx.fillRect(-6, 4, 3, 2)
    ctx.fillStyle = '#5cffc8'
    ctx.fillRect(-1, 4, 3, 2)
    ctx.restore()
  }
}

function drawItems() {
  for (const item of room().items) {
    if (item.collected) continue
    const hp = item.type === 'h'
    const c = hp ? '92,255,143' : '255,143,92'
    const bob = Math.sin(elapsed * 4 + item.x) * 3
    ctx.save()
    ctx.translate(item.x, item.y)
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26)
    g.addColorStop(0, `rgba(${c},0.45)`)
    g.addColorStop(1, `rgba(${c},0)`)
    ctx.fillStyle = g
    ctx.fillRect(-26, -26, 52, 52)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 11, 9, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.translate(0, bob - 2)
    ctx.rotate(Math.sin(elapsed * 2) * 0.15)
    // chip module
    ctx.fillStyle = '#1b2230'
    ctx.beginPath()
    ctx.roundRect(-9, -9, 18, 18, 3)
    ctx.fill()
    ctx.strokeStyle = `rgb(${c})`
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = `rgb(${c})`
    ctx.fillRect(-5, -1.5, 10, 3)
    if (hp) ctx.fillRect(-1.5, -5, 3, 10)
    else {
      ctx.beginPath()
      ctx.moveTo(-1, -6)
      ctx.lineTo(4, -1)
      ctx.lineTo(0, -1)
      ctx.lineTo(1, 6)
      ctx.lineTo(-4, 0)
      ctx.lineTo(0, 0)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawHpBar(x, y, w, hp, maxHp, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.beginPath()
  ctx.roundRect(x - 1, y - 1, w + 2, 7, 3)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(0, w * Math.max(0, hp / maxHp)), 5, 2)
  ctx.fill()
}

function shadow(x, y, rx, a = 0.3) {
  ctx.fillStyle = `rgba(0,0,0,${a})`
  ctx.beginPath()
  ctx.ellipse(x, y, rx, rx * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawDrone(e) {
  const bob = Math.sin(e.t * 5) * 2.5
  shadow(e.x, e.y + 14, 10, 0.28)
  ctx.save()
  ctx.translate(e.x, e.y - 4 + bob)
  const flash = e.flash > 0
  // rotors
  for (const s of [-1, 1]) {
    ctx.fillStyle = 'rgba(200,220,255,0.35)'
    ctx.beginPath()
    ctx.ellipse(s * 13, -8, 8 * Math.abs(Math.cos(e.t * 40 + s)), 2.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3a4258'
    ctx.fillRect(s * 13 - 1, -8, 2, 6)
  }
  const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13)
  g.addColorStop(0, flash ? '#fff' : '#d8dde8')
  g.addColorStop(1, flash ? '#fff' : '#6a7288')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1b2030'
  ctx.lineWidth = 1.6
  ctx.stroke()
  // red stripe + eye tracking the player
  ctx.fillStyle = '#d1553f'
  ctx.fillRect(-10, -1, 20, 3)
  ctx.fillStyle = '#10141c'
  ctx.beginPath()
  ctx.arc(Math.cos(e.ang) * 3, Math.sin(e.ang) * 3, 5.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = flash ? '#fff' : '#ff4a3a'
  ctx.beginPath()
  ctx.arc(Math.cos(e.ang) * 4.4, Math.sin(e.ang) * 4.4, 2.6 + Math.sin(e.t * 8) * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawTurret(e) {
  shadow(e.x, e.y + 12, 13, 0.3)
  ctx.save()
  ctx.translate(e.x, e.y)
  const flash = e.flash > 0
  ctx.fillStyle = '#2a2f44'
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14 + 2)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#12151f'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = flash ? '#fff' : '#7a5fd1'
  ctx.beginPath()
  ctx.arc(0, -3, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.rotate(e.ang)
  ctx.fillStyle = '#3a3f58'
  ctx.fillRect(2, -4, 18, 8)
  ctx.fillStyle = `rgb(${Math.round(120 + e.windup * 135)},${Math.round(100 - e.windup * 60)},${Math.round(210 - e.windup * 140)})`
  ctx.fillRect(16, -3, 5, 6)
  ctx.restore()
  if (e.windup > 0) {
    const g = ctx.createRadialGradient(e.x + Math.cos(e.ang) * 20, e.y - 3 + Math.sin(e.ang) * 20, 1, e.x + Math.cos(e.ang) * 20, e.y - 3 + Math.sin(e.ang) * 20, 14)
    g.addColorStop(0, `rgba(255,220,100,${e.windup})`)
    g.addColorStop(1, 'rgba(255,220,100,0)')
    ctx.fillStyle = g
    ctx.fillRect(e.x + Math.cos(e.ang) * 20 - 14, e.y - 3 + Math.sin(e.ang) * 20 - 14, 28, 28)
  }
}

function drawBoss(e) {
  const rage = e.phase === 2
  const c = rage ? '255,70,70' : '190,90,255'
  shadow(e.x, e.y + 30, 30, 0.35)
  ctx.save()
  ctx.translate(e.x, e.y - 6 + Math.sin(e.t * 2.4) * 3)
  const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, 52)
  aura.addColorStop(0, `rgba(${c},${0.3 + e.windup * 0.3})`)
  aura.addColorStop(1, `rgba(${c},0)`)
  ctx.fillStyle = aura
  ctx.fillRect(-52, -52, 104, 104)
  // orbiting rings
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.rotate(e.t * (rage ? 2.4 : 1.2) * (i % 2 ? -1 : 1) + i)
    ctx.strokeStyle = `rgba(${c},0.8)`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(0, 0, 30 + i * 5, 11 + i * 2, i * 0.7, 0, Math.PI * 1.4)
    ctx.stroke()
    ctx.restore()
  }
  // armoured core body
  const flash = e.flash > 0
  ctx.fillStyle = flash ? '#fff' : '#262a3c'
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const r = i % 2 ? 24 : 27
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = `rgb(${c})`
  ctx.lineWidth = 2.5
  ctx.stroke()
  if (rage) {
    ctx.fillStyle = '#ff4646'
    for (let i = 0; i < 8; i++) {
      ctx.save()
      ctx.rotate((i / 8) * Math.PI * 2 + e.t)
      ctx.beginPath()
      ctx.moveTo(26, -3)
      ctx.lineTo(36, 0)
      ctx.lineTo(26, 3)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }
  // the eye
  ctx.fillStyle = '#0a0c14'
  ctx.beginPath()
  ctx.arc(0, 0, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = flash ? '#fff' : `rgb(${c})`
  ctx.beginPath()
  ctx.arc(Math.cos(e.ang) * 4, Math.sin(e.ang) * 4, 8 + e.windup * 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(Math.cos(e.ang) * 6 - 2, Math.sin(e.ang) * 6 - 2, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawProjectiles() {
  for (const p of projectiles) {
    const ang = Math.atan2(p.vy, p.vx)
    ctx.save()
    ctx.translate(p.x, p.y)
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 12)
    g.addColorStop(0, 'rgba(255,220,100,0.8)')
    g.addColorStop(1, 'rgba(255,160,40,0)')
    ctx.fillStyle = g
    ctx.fillRect(-12, -12, 24, 24)
    ctx.rotate(ang)
    ctx.fillStyle = 'rgba(255,200,80,0.35)'
    ctx.beginPath()
    ctx.ellipse(-8, 0, 10, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff6c0'
    ctx.beginPath()
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// The repairer: orange work suit, helmet with a teal visor, tool backpack and
// a big wrench that swings in an arc.
function drawPlayer() {
  const moving = player.walking
  const bob = moving ? Math.abs(Math.sin(player.walkPhase)) * -1.8 : 0
  const swing = moving ? Math.sin(player.walkPhase) : 0
  const f = player.facing
  const side = f === 'left' || f === 'right'
  const flip = f === 'left' ? -1 : 1
  shadow(player.x, player.y + 12, 10, 0.3)
  ctx.save()
  ctx.translate(player.x, player.y + bob)
  ctx.globalAlpha = player.invuln > 0 && Math.floor(elapsed * 20) % 2 === 0 ? 0.4 : 1

  // wrench swing trail (behind the body when attacking upwards)
  const [fx, fy] = DIR_VEC[f]
  const facingAngle = Math.atan2(fy, fx)
  const attacking = player.attackTimer > 0
  const drawSwing = () => {
    if (!attacking) return
    const k = 1 - player.attackTimer / ATTACK_DURATION
    const a0 = facingAngle - ATTACK_ARC / 2
    const a = a0 + k * ATTACK_ARC * (player.swingSide > 0 ? 1 : 1)
    ctx.save()
    ctx.translate(0, -2)
    ctx.strokeStyle = 'rgba(200,240,255,0.55)'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, 0, ATTACK_RANGE - 7, a0, a)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, ATTACK_RANGE - 7, Math.max(a0, a - 0.7), a)
    ctx.stroke()
    ctx.rotate(a)
    ctx.fillStyle = '#c9ced8'
    ctx.fillRect(ATTACK_RANGE - 20, -2, 18, 4)
    ctx.beginPath()
    ctx.arc(ATTACK_RANGE - 1, 0, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#e8ecf4'
    ctx.fill()
    ctx.restore()
    ctx.lineCap = 'butt'
  }
  if (f === 'up') drawSwing()

  // legs
  ctx.fillStyle = '#2a3250'
  if (side) {
    ctx.fillRect(-3 + swing * 4 * flip - 1, 4, 6, 8)
    ctx.fillRect(-3 - swing * 4 * flip - 1, 4, 6, 8)
  } else {
    ctx.fillRect(-7, 4 + swing * 2, 5.5, 8)
    ctx.fillRect(1.5, 4 - swing * 2, 5.5, 8)
  }
  ctx.fillStyle = '#12161f'
  if (side) {
    ctx.fillRect(-4 + swing * 4 * flip, 10, 8, 3)
    ctx.fillRect(-4 - swing * 4 * flip, 10, 8, 3)
  } else {
    ctx.fillRect(-8, 10 + swing * 2, 7, 3)
    ctx.fillRect(1, 10 - swing * 2, 7, 3)
  }
  // backpack (visible from behind and the side)
  if (f !== 'down') {
    ctx.fillStyle = '#6a7388'
    ctx.beginPath()
    ctx.roundRect(side ? -flip * 10 - 4 : -7, -8, side ? 8 : 14, 13, 3)
    ctx.fill()
    ctx.fillStyle = '#e8c040'
    ctx.fillRect(side ? -flip * 10 - 2 : -5, -5, side ? 4 : 10, 2)
  }
  // torso
  ctx.fillStyle = '#f08a2a'
  ctx.beginPath()
  ctx.roundRect(-8, -11, 16, 17, 4)
  ctx.fill()
  ctx.strokeStyle = '#7a3f10'
  ctx.lineWidth = 1.3
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(-6, -9, 5, 3)
  ctx.fillStyle = '#e8e0c8'
  ctx.fillRect(-8, 0, 16, 2.4) // reflective strip
  // arms
  ctx.fillStyle = '#d9781f'
  if (side) {
    ctx.fillRect(-2 - swing * 3 * flip, -9, 5, 11)
  } else {
    ctx.fillRect(-12, -9 + swing * 2, 4.5, 11)
    ctx.fillRect(7.5, -9 - swing * 2, 4.5, 11)
  }
  ctx.fillStyle = '#2a2f3a'
  if (!side) {
    ctx.fillRect(-12, 1 + swing * 2, 4.5, 3.5)
    ctx.fillRect(7.5, 1 - swing * 2, 4.5, 3.5)
  }
  // helmet
  ctx.fillStyle = '#f4f0e6'
  ctx.beginPath()
  ctx.arc(0, -15, 9.5, Math.PI, 0)
  ctx.lineTo(9.5, -11)
  ctx.lineTo(-9.5, -11)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#6a6a70'
  ctx.lineWidth = 1.3
  ctx.stroke()
  // head + visor
  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.ellipse(0, -11, 7, 5.5, 0, 0, Math.PI * 2)
  ctx.fill()
  if (f !== 'up') {
    ctx.fillStyle = '#14202c'
    const vx = side ? flip * 2 : 0
    ctx.beginPath()
    ctx.roundRect(vx - (side ? 3 : 7), -17, side ? 11 : 14, 8, 3)
    ctx.fill()
    ctx.fillStyle = '#5cf0ff'
    ctx.fillRect(vx - (side ? 1 : 5), -15, side ? 7 : 10, 2.5)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(vx - (side ? 1 : 5), -16, 3, 1.2)
  }
  ctx.fillStyle = '#d83a2a'
  ctx.fillRect(-9, -15.5, 18, 2) // helmet stripe
  // wrench in hand while idle
  if (!attacking) {
    ctx.save()
    ctx.translate(side ? flip * 6 : 10, -2)
    ctx.rotate(f === 'up' ? -2.4 : 0.9)
    ctx.fillStyle = '#c9ced8'
    ctx.fillRect(-1.2, 0, 2.4, 13)
    ctx.fillRect(-3, 11, 6, 4)
    ctx.restore()
  }
  if (f !== 'up') drawSwing()
  ctx.restore()
}

function drawEntities() {
  const list = []
  for (const e of room().enemies) list.push({ y: e.y, f: () => (e.type === 'd' ? drawDrone(e) : e.type === 't' ? drawTurret(e) : drawBoss(e)) })
  list.push({ y: player.y + 12, f: drawPlayer })
  list.sort((a, b) => a.y - b.y)
  for (const it of list) it.f()
  for (const e of room().enemies) {
    if (e.type === 'B') continue
    drawHpBar(e.x - 11, e.y - 26, 22, e.hp, e.maxHp, '#ff5c5c')
  }
}

function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of popups) {
    const k = p.t / 0.8
    ctx.globalAlpha = Math.max(0, 1 - k * k)
    ctx.font = 'bold 14px sans-serif'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.strokeText(p.text, p.x, p.y - k * 24)
    ctx.fillStyle = p.color
    ctx.fillText(p.text, p.x, p.y - k * 24)
  }
  ctx.globalAlpha = 1
}

function drawLighting() {
  const th = themeOf(currentRoomKey)
  // soft vignette + a little light around the player
  const g = ctx.createRadialGradient(player.x, player.y, 60, canvas.width / 2, canvas.height / 2, 420)
  g.addColorStop(0, `rgba(${th.fog},0)`)
  g.addColorStop(1, `rgba(${th.fog},0.62)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'lighter'
  const pg = ctx.createRadialGradient(player.x, player.y, 2, player.x, player.y, 70)
  pg.addColorStop(0, `rgba(${th.glow},0.12)`)
  pg.addColorStop(1, `rgba(${th.glow},0)`)
  ctx.fillStyle = pg
  ctx.fillRect(player.x - 70, player.y - 70, 140, 140)
  for (const s of room().signs) {
    const sg = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 50)
    sg.addColorStop(0, 'rgba(120,220,255,0.22)')
    sg.addColorStop(1, 'rgba(120,220,255,0)')
    ctx.fillStyle = sg
    ctx.fillRect(s.x - 50, s.y - 50, 100, 100)
  }
  ctx.globalCompositeOperation = 'source-over'
  if (hurtFlash > 0) {
    const hg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 180, canvas.width / 2, canvas.height / 2, 400)
    hg.addColorStop(0, 'rgba(255,40,40,0)')
    hg.addColorStop(1, `rgba(255,40,40,${hurtFlash * 1.4})`)
    ctx.fillStyle = hg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  if (flashWhite > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashWhite})`
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
}

function panelBox(x, y, w, h, r = 8, fill = 'rgba(8,12,20,0.78)', stroke = 'rgba(120,180,255,0.35)') {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.2
  ctx.stroke()
}

function wrapText(text, maxW) {
  const out = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      out.push(line)
      line = ch
    } else line += ch
  }
  if (line) out.push(line)
  return out
}

function drawHud() {
  const th = themeOf(currentRoomKey)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  panelBox(8, 8, 190, 62)
  ctx.fillStyle = th.accent
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(AREA_NAME[currentRoomKey], 18, 26)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 11px sans-serif'
  ctx.fillText(`HP ${Math.ceil(player.hp)}/${player.maxHp}`, 18, 44)
  ctx.fillStyle = '#ffb34a'
  ctx.textAlign = 'right'
  ctx.fillText(`공격력 ${player.atk}`, 188, 44)
  ctx.textAlign = 'left'
  const lowHp = player.hp / player.maxHp < 0.3
  drawHpBar(18, 52, 170, player.hp, player.maxHp, lowHp && Math.floor(elapsed * 4) % 2 ? '#ff5c5c' : '#5cff8f')

  // route map: five rooms in a row, current one highlighted
  const mx = canvas.width - 8 - 5 * 18
  panelBox(mx - 8, 8, 5 * 18 + 14, 28)
  roomOrder.forEach((k, i) => {
    const here = k === currentRoomKey
    ctx.fillStyle = ROOMS[k].cleared ? (here ? '#5cffc8' : '#2a8a6a') : here ? '#ffd23f' : '#3a4258'
    ctx.beginPath()
    ctx.roundRect(mx + i * 18, 16, 14, 12, 3)
    ctx.fill()
    if (k === 'core') {
      ctx.fillStyle = '#ff5c9a'
      ctx.fillRect(mx + i * 18 + 5, 20, 4, 4)
    }
  })

  // boss bar
  const boss = room().enemies.find((e) => e.type === 'B')
  if (boss) {
    const w = 300
    const x = canvas.width / 2 - w / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = boss.phase === 2 ? '#ff6b6b' : '#d9a8ff'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(boss.phase === 2 ? '코어 가디언 · 폭주' : '코어 가디언', canvas.width / 2, canvas.height - 30)
    drawHpBar(x, canvas.height - 24, w, boss.hp, boss.maxHp, boss.phase === 2 ? '#ff4646' : '#b23bff')
    ctx.textAlign = 'left'
  }

  // lore terminal
  const near = room().signs.find((s) => Math.hypot(s.x - player.x, s.y - player.y) < 44)
  if (near && near.text) {
    ctx.font = '13px sans-serif'
    const lines = wrapText(near.text, 520)
    const h = 22 + lines.length * 19
    const y = canvas.height - h - 38
    panelBox(canvas.width / 2 - 280, y, 560, h, 8, 'rgba(6,16,26,0.9)', 'rgba(120,220,255,0.6)')
    ctx.fillStyle = '#7fe0ff'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('▌터미널', canvas.width / 2 - 266, y + 15)
    ctx.fillStyle = '#e6f6ff'
    ctx.font = '13px sans-serif'
    lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2 - 266, y + 34 + i * 19))
  }

  if (toast && elapsed < toast.until) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px sans-serif'
    const w = ctx.measureText(toast.text).width + 30
    panelBox(canvas.width / 2 - w / 2, 46, w, 26, 13, 'rgba(8,12,20,0.85)', 'rgba(255,210,63,0.6)')
    ctx.fillStyle = '#ffd23f'
    ctx.textBaseline = 'middle'
    ctx.fillText(toast.text, canvas.width / 2, 60)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }
}

// ----- title / intro / endings --------------------------------------------

const stars = Array.from({ length: 90 }, (_, i) => ({ x: hash2(i, 1) * 640, y: hash2(i, 2) * 300, s: 0.6 + hash2(i, 3) * 1.6, p: hash2(i, 4) * 6 }))

function drawSpaceBackdrop(t, dim = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
  g.addColorStop(0, '#04060f')
  g.addColorStop(0.7, '#0d1530')
  g.addColorStop(1, '#1a1a38')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const s of stars) {
    ctx.globalAlpha = (0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.p))) * dim
    ctx.fillStyle = '#fff'
    ctx.fillRect(s.x, s.y, s.s, s.s)
  }
  ctx.globalAlpha = 1
  // a ringed planet
  ctx.save()
  ctx.translate(500, 110)
  const pg = ctx.createRadialGradient(-14, -14, 6, 0, 0, 50)
  pg.addColorStop(0, '#6a7ad0')
  pg.addColorStop(1, '#1c2260')
  ctx.fillStyle = pg
  ctx.beginPath()
  ctx.arc(0, 0, 48, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,210,255,0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(0, 4, 82, 16, -0.3, Math.PI * 0.05, Math.PI * 0.95)
  ctx.stroke()
  ctx.restore()
  // barren ground
  ctx.fillStyle = '#0b0f1c'
  ctx.beginPath()
  ctx.moveTo(0, canvas.height)
  ctx.lineTo(0, 360)
  ctx.quadraticCurveTo(160, 330, 320, 372)
  ctx.quadraticCurveTo(480, 410, 640, 350)
  ctx.lineTo(640, canvas.height)
  ctx.closePath()
  ctx.fill()
}

function drawRelayTower(x, y, t) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = '#3a4668'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-26, 0)
  ctx.lineTo(0, -150)
  ctx.lineTo(26, 0)
  ctx.moveTo(-18, -40)
  ctx.lineTo(18, -40)
  ctx.moveTo(-12, -80)
  ctx.lineTo(12, -80)
  ctx.moveTo(-26, 0)
  ctx.lineTo(12, -80)
  ctx.moveTo(26, 0)
  ctx.lineTo(-12, -80)
  ctx.stroke()
  // dish
  ctx.fillStyle = '#4a5578'
  ctx.beginPath()
  ctx.ellipse(18, -112, 22, 9, -0.5, 0, Math.PI * 2)
  ctx.fill()
  // dying beacon
  const on = Math.sin(t * 2.2) > 0.75
  ctx.fillStyle = on ? '#ff5c5c' : '#4a2a2a'
  ctx.beginPath()
  ctx.arc(0, -154, 4, 0, Math.PI * 2)
  ctx.fill()
  if (on) {
    const g = ctx.createRadialGradient(0, -154, 1, 0, -154, 28)
    g.addColorStop(0, 'rgba(255,80,80,0.6)')
    g.addColorStop(1, 'rgba(255,80,80,0)')
    ctx.fillStyle = g
    ctx.fillRect(-28, -182, 56, 56)
  }
  ctx.restore()
}

function titleText(title, sub, t) {
  ctx.textAlign = 'center'
  ctx.font = 'bold 46px sans-serif'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(30,70,120,0.9)'
  ctx.strokeText(title, canvas.width / 2, 108)
  const g = ctx.createLinearGradient(0, 70, 0, 112)
  g.addColorStop(0, '#e8f6ff')
  g.addColorStop(1, '#7fc0ff')
  ctx.fillStyle = g
  ctx.fillText(title, canvas.width / 2, 108)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#9fb8d8'
  sub.forEach((l, i) => ctx.fillText(l, canvas.width / 2, 140 + i * 20))
  ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.5
  ctx.font = 'bold 15px sans-serif'
  ctx.fillStyle = '#ffd23f'
  ctx.fillText('Enter 또는 Space로 시작', canvas.width / 2, canvas.height - 34)
  ctx.globalAlpha = 1
}

function drawTitle() {
  const t = performance.now() / 1000
  drawSpaceBackdrop(t)
  drawRelayTower(150, 372, t)
  // the repairer, tiny, walking toward the tower
  const prevPlayer = { x: player.x, y: player.y, facing: player.facing, walking: player.walking, walkPhase: player.walkPhase, invuln: player.invuln, attackTimer: player.attackTimer }
  player.x = 90 + ((t * 14) % 40)
  player.y = 394
  player.facing = 'right'
  player.walking = true
  player.walkPhase = t * 9
  player.invuln = 0
  player.attackTimer = 0
  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.scale(1.4, 1.4)
  ctx.translate(-player.x, -player.y)
  drawPlayer()
  ctx.restore()
  Object.assign(player, prevPlayer)
  // signal rings from the tower
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.35 + i / 3) % 1
    ctx.strokeStyle = `rgba(255,92,92,${(1 - ph) * 0.35})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(150, 218, 10 + ph * 90, -Math.PI * 0.85, -Math.PI * 0.15)
    ctx.stroke()
  }
  titleText('마지막 중계소', ['인류가 떠난 지 오래된 외딴 행성계.', '중계소들이 하나둘 침묵한 이유를 조사하러 왔다.'], t)
}

function drawIntro() {
  const t = performance.now() / 1000
  ctx.fillStyle = 'rgba(4,6,14,0.82)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  panelBox(80, 110, 480, 228, 12, 'rgba(10,16,30,0.95)', 'rgba(120,180,255,0.5)')
  ctx.textAlign = 'center'
  ctx.fillStyle = '#7fc0ff'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText('임무 개시', canvas.width / 2, 150)
  ctx.fillStyle = '#e6eefc'
  ctx.font = '14px sans-serif'
  ;['당신은 프리랜서 리페어러.', '버려진 중계소를 돌며 부품과 데이터를 모아 스스로를 강화한다.', '각 구역의 적을 정리해야 다음 문이 열린다.'].forEach((l, i) => ctx.fillText(l, canvas.width / 2, 186 + i * 26))
  ctx.fillStyle = '#9fb8d8'
  ctx.font = '13px sans-serif'
  ctx.fillText('WASD 이동 · Space 렌치 휘두르기 · M 소리', canvas.width / 2, 286)
  ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.5
  ctx.fillStyle = '#ffd23f'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('Enter 또는 Space로 진행', canvas.width / 2, 322)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(30,4,6,0.85)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ff6b6b'
  ctx.font = 'bold 34px sans-serif'
  ctx.fillText('교신 두절', canvas.width / 2, canvas.height / 2 - 20)
  ctx.fillStyle = '#e0c0c0'
  ctx.font = '15px sans-serif'
  ctx.fillText('신호가 끊겼다...', canvas.width / 2, canvas.height / 2 + 14)
  ctx.fillStyle = '#ffd23f'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('R 키로 다시 시작', canvas.width / 2, canvas.height / 2 + 60)
  ctx.textAlign = 'left'
}

function drawEnding() {
  ctx.fillStyle = 'rgba(4,6,14,0.82)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  panelBox(60, 100, 520, 250, 12, 'rgba(10,16,30,0.95)', 'rgba(255,92,154,0.55)')
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ff8cc0'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('코어 함락', canvas.width / 2, 142)
  ctx.fillStyle = '#e6eefc'
  ctx.font = '14px sans-serif'
  ctx.fillText('코어 AI가 침묵한다. 이제 당신의 선택에 달렸다.', canvas.width / 2, 184)
  const opts = ['1  코어를 파괴하고 네트워크를 강제로 재가동한다', '2  AI를 설득해 공존을 시도한다']
  opts.forEach((o, i) => {
    panelBox(100, 214 + i * 54, 440, 40, 8, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.25)')
    ctx.fillStyle = '#ffd23f'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(o.slice(0, 1), 118, 239 + i * 54)
    ctx.fillStyle = '#fff'
    ctx.font = '14px sans-serif'
    ctx.fillText(o.slice(3), 144, 239 + i * 54)
  })
  ctx.textAlign = 'left'
}

function drawOutro() {
  const t = performance.now() / 1000
  const good = endingChoice === '2'
  drawSpaceBackdrop(t, 1)
  drawRelayTower(320, 372, t)
  // the tower wakes: green rings if the AI answered, grey static otherwise
  for (let i = 0; i < 4; i++) {
    const ph = (endingT * 0.3 + i / 4) % 1
    ctx.strokeStyle = good ? `rgba(92,255,200,${(1 - ph) * 0.6})` : `rgba(200,200,220,${(1 - ph) * 0.25})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(320, 218, 12 + ph * 160, -Math.PI * 0.9, -Math.PI * 0.1)
    ctx.stroke()
  }
  if (good) {
    ctx.fillStyle = '#5cffc8'
    ctx.beginPath()
    ctx.arc(320, 218, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  const text = good
    ? ['코어는 오랜 침묵 끝에 입을 열었다.', '"...당신이라면, 다시 응답할 이유가 될지도."', '중계소는 다시, 아주 조금씩 깨어나기 시작했다.']
    : ['코어를 파괴하자 네트워크가 비틀거리며 재가동됐다.', '신호는 돌아왔지만, 그 끝에 있던 목소리는 더 이상 없다.']
  const shown = Math.min(text.length, Math.floor(endingT / 1.6) + 1)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e6eefc'
  ctx.font = '15px sans-serif'
  text.slice(0, shown).forEach((l, i) => {
    ctx.globalAlpha = Math.min(1, endingT - i * 1.6)
    ctx.fillText(l, canvas.width / 2, 70 + i * 28)
  })
  ctx.globalAlpha = 1
  if (endingT > text.length * 1.6) {
    ctx.fillStyle = good ? '#5cffc8' : '#c0c8d8'
    ctx.font = 'bold 20px sans-serif'
    ctx.fillText(good ? 'ENDING: 다시 듣는 신호' : 'ENDING: 침묵 속의 재개', canvas.width / 2, 190)
    ctx.fillStyle = '#ffd23f'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('R 키로 다시 시작', canvas.width / 2, canvas.height - 34)
  }
  ctx.textAlign = 'left'
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (phase === 'title') {
    drawTitle()
    return
  }
  if (phase === 'outro') {
    drawOutro()
    return
  }
  ctx.save()
  if (shake.t > 0) ctx.translate((Math.random() - 0.5) * shake.mag, (Math.random() - 0.5) * shake.mag)
  drawMap()
  drawSigns()
  drawItems()
  drawProjectiles()
  drawEntities()
  drawFx()
  ctx.restore()
  drawLighting()
  drawHud()
  if (phase === 'intro') drawIntro()
  else if (phase === 'gameover') drawGameOver()
  else if (phase === 'ending') drawEnding()
}

function updateFx(dt) {
  for (const p of particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= Math.pow(0.05, dt)
    p.vy *= Math.pow(0.05, dt)
    p.life -= dt
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
  for (const p of popups) p.t += dt
  for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 0.8) popups.splice(i, 1)
  if (shake.t > 0) {
    shake.t -= dt
    if (shake.t <= 0) shake.mag = 0
  }
  if (hurtFlash > 0) hurtFlash -= dt
  if (flashWhite > 0) flashWhite -= dt
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  elapsed += dt

  if (phase === 'playing') {
    updatePlayer(dt)
    updateEnemies(dt)
  } else if (phase === 'outro' || phase === 'ending') endingT += dt
  updateFx(dt)

  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
