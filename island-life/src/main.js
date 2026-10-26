// Cozy life-sim (Animal Crossing-style): wander a small island, gather
// wood/fruit/fish/shells, sell them at the shop, buy furniture to decorate
// your house, chat with villagers, and fulfil the bulletin board's daily
// request. Sleeping in bed advances the day and refills resources.
// Everything is drawn with Canvas 2D shapes - no images/audio files.

const TILE = 32
const COLS = 28
const ROWS = 18

const SOLID = new Set(['#', 'T', '~', 'M', 'V', 'W', 'B'])

function blankGrid(fill = '.') {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill))
}

function put(grid, row, col, ch) {
  grid[row][col] = ch
}

function fillRect(grid, r0, r1, c0, c1, ch) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = ch
}

// ---------- Outside map ----------
const outsideChars = blankGrid('.')
for (let c = 0; c < COLS; c++) {
  put(outsideChars, 0, c, 'T')
  put(outsideChars, ROWS - 1, c, 'T')
}
for (let r = 0; r < ROWS; r++) {
  put(outsideChars, r, 0, 'T')
  put(outsideChars, r, COLS - 1, 'T')
}
fillRect(outsideChars, 12, 16, 18, 25, 'a') // sand
fillRect(outsideChars, 13, 15, 19, 24, '~') // pond
for (const [r, c] of [
  [12, 19],
  [12, 23],
  [16, 21],
]) put(outsideChars, r, c, 'S')

put(outsideChars, 3, 3, 'H') // house door
put(outsideChars, 3, 23, 'M') // shopkeeper
put(outsideChars, 9, 13, 'B') // bulletin board
put(outsideChars, 9, 10, 'V') // villager 토리
put(outsideChars, 9, 16, 'W') // villager 메이

const TREE_SPOTS = [
  [2, 8], [2, 19], [4, 6], [4, 21], [6, 9], [6, 24],
  [9, 4], [9, 23], [13, 4], [13, 9], [15, 4], [15, 9],
]
for (const [r, c] of TREE_SPOTS) put(outsideChars, r, c, 'T')

// ---------- House interior map ----------
const houseChars = blankGrid('#')
fillRect(houseChars, 4, 13, 8, 19, '.')
put(houseChars, 5, 10, 'Z') // bed
put(houseChars, 13, 14, 'L') // exit door

function makeRoom(chars) {
  const grid = chars.map((row) => row.map((ch) => (SOLID.has(ch) ? 1 : 0)))
  return { chars, grid }
}

const ROOMS = { outside: makeRoom(outsideChars), house: makeRoom(houseChars) }

function tileCenter(row, col) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 }
}

// ---------- Resources / interactables (outside) ----------
const trees = TREE_SPOTS.map(([row, col]) => ({ ...tileCenter(row, col), row, col, hasFruit: true, woodCharges: 2 }))
const shells = [
  [12, 19],
  [12, 23],
  [16, 21],
].map(([row, col]) => ({ ...tileCenter(row, col), row, col, collected: false }))

const VILLAGER_LINES = {
  tori: [
    '오늘 날씨 정말 좋다! 산책하기 딱이야.',
    '요즘 조개 줍는 게 취미야. 밟기만 하면 자동으로 주워져!',
    '우리 섬에 온 걸 환영해!',
  ],
  mei: [
    '나무는 하루에 조금씩만 베어야 다음날 또 자라.',
    '낚시는 물가 근처에서 스페이스를 누르면 돼. 생각보다 잘 잡혀.',
    '집 꾸미는 거 다 됐어? 상점 가서 가구 사봐!',
  ],
}
let toriLine = 0
let meiLine = 0

const doors = []
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const ch = outsideChars[row][col]
    if (ch === 'H') doors.push({ ...tileCenter(row, col), to: 'house', touching: false })
  }
}
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    if (houseChars[row][col] === 'L') doors.push({ ...tileCenter(row, col), to: 'outside', touching: false, inHouse: true })
  }
}

const shopPos = tileCenter(3, 23)
const boardPos = tileCenter(9, 13)
const toriPos = tileCenter(9, 10)
const meiPos = tileCenter(9, 16)
const bedPos = tileCenter(5, 10)

// ---------- Furniture ----------
const FURNITURE = [
  { id: 'pot', name: '화분', price: 40, color: '#4caf6a' },
  { id: 'rug', name: '러그', price: 60, color: '#d1795a' },
  { id: 'lamp', name: '램프', price: 80, color: '#f2c94c' },
  { id: 'shelf', name: '책장', price: 100, color: '#8a5a2e' },
  { id: 'clock', name: '벽시계', price: 120, color: '#9aa0c9' },
]
const FURNITURE_SLOT_ROW = 11
const FURNITURE_SLOT_COLS = [10, 12, 14, 16, 18]

const ITEM_LABEL = { wood: '나무', fruit: '과일', fish: '물고기', shell: '조개' }
const SELL_PRICE = { wood: 8, fruit: 10, fish: 15, shell: 12 }

// ---------- Game state ----------
const state = {
  phase: 'title', // title -> intro -> play
  room: 'outside',
  day: 1,
  bells: 20,
  inv: { wood: 0, fruit: 0, fish: 0, shell: 0 },
  furniture: new Set(),
  furnitureCelebrated: false,
  shopOpen: false,
  task: null,
}

function newTask() {
  const items = Object.keys(ITEM_LABEL)
  const item = items[Math.floor(Math.random() * items.length)]
  const amount = 2 + Math.floor(Math.random() * 3)
  const bells = 20 + amount * 10 + Math.floor(Math.random() * 20)
  return { item, amount, bells, done: false }
}
state.task = newTask()

function room() {
  return ROOMS[state.room]
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

// ---------- Player ----------
const canvas = document.getElementById('game')
canvas.width = COLS * TILE
canvas.height = ROWS * TILE
const ctx = canvas.getContext('2d')

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const PLAYER_SPEED = 120
const PLAYER_HALF = 10
const TOAST_DURATION = 3.4

const player = {
  ...tileCenter(8, 13),
  facing: 'down',
  walking: false,
  walkPhase: 0,
}

let toastSpeaker = ''
let toastText = ''
let toastTimer = 0
function say(speaker, text) {
  toastSpeaker = speaker
  toastText = text
  toastTimer = TOAST_DURATION
}

function enterRoom(to) {
  if (to === 'house') {
    state.room = 'house'
    const p = tileCenter(11, 14)
    player.x = p.x
    player.y = p.y
  } else {
    state.room = 'outside'
    const p = tileCenter(4, 3)
    player.x = p.x
    player.y = p.y
  }
  for (const d of doors) d.touching = false
}

function treeDepleted(t) {
  return !t.hasFruit && t.woodCharges <= 0
}

function harvestTree(t) {
  if (t.hasFruit) {
    t.hasFruit = false
    state.inv.fruit += 1
    say('알림', '과일을 땄다! (+1 과일)')
  } else if (t.woodCharges > 0) {
    t.woodCharges -= 1
    state.inv.wood += 1
    say('알림', '나무를 베었다! (+1 나무)')
  } else {
    say('알림', '이 나무는 오늘 더 얻을 게 없어요. 내일 다시 와보세요.')
  }
}

function attemptFish() {
  if (Math.random() < 0.7) {
    state.inv.fish += 1
    say('알림', '물고기를 잡았다! (+1 물고기)')
  } else {
    say('알림', '물고기가 도망갔다... 다시 시도해보세요.')
  }
}

function talkTo(who) {
  if (who === 'tori') {
    say('토리', VILLAGER_LINES.tori[toriLine])
    toriLine = (toriLine + 1) % VILLAGER_LINES.tori.length
  } else {
    say('메이', VILLAGER_LINES.mei[meiLine])
    meiLine = (meiLine + 1) % VILLAGER_LINES.mei.length
  }
}

function checkBoard() {
  const task = state.task
  if (task.done) {
    say('게시판', '오늘의 부탁은 이미 끝냈어요! 내일 또 새로운 부탁이 붙을 거예요.')
    return
  }
  const have = state.inv[task.item]
  if (have >= task.amount) {
    state.inv[task.item] -= task.amount
    state.bells += task.bells
    task.done = true
    say('게시판', `부탁을 들어줬다! ${ITEM_LABEL[task.item]} ${task.amount}개를 전달하고 ${task.bells}벨을 받았다.`)
  } else {
    say(
      '게시판',
      `오늘의 부탁: ${ITEM_LABEL[task.item]} ${task.amount}개 가져오기 (보유 ${have}개) · 완료 보상 ${task.bells}벨`,
    )
  }
}

function sleep() {
  state.day += 1
  for (const t of trees) {
    t.hasFruit = true
    t.woodCharges = 2
  }
  for (const s of shells) s.collected = false
  state.task = newTask()
  say('알림', `포근한 밤을 보내고 Day ${state.day}가 되었습니다. 나무와 조개가 다시 채워졌어요!`)
  enterRoom('outside')
}

function openShop() {
  state.shopOpen = true
}
function closeShop() {
  state.shopOpen = false
}

function sellAll(item) {
  const count = state.inv[item]
  if (count <= 0) {
    say('상점', `팔 수 있는 ${ITEM_LABEL[item]}이 없어요.`)
    return
  }
  const earned = count * SELL_PRICE[item]
  state.inv[item] = 0
  state.bells += earned
  say('상점', `${ITEM_LABEL[item]} ${count}개를 팔고 ${earned}벨을 받았다.`)
}

function buyFurniture(index) {
  const f = FURNITURE[index]
  if (!f) return
  if (state.furniture.has(f.id)) {
    say('상점', `${f.name}은 이미 가지고 있어요.`)
    return
  }
  if (state.bells < f.price) {
    say('상점', `벨이 부족해요. ${f.name}은 ${f.price}벨이 필요해요.`)
    return
  }
  state.bells -= f.price
  state.furniture.add(f.id)
  say('상점', `${f.name}을 구매했다! 집에서 확인해보세요.`)
  if (state.furniture.size === FURNITURE.length && !state.furnitureCelebrated) {
    state.furnitureCelebrated = true
    say('알림', '축하합니다! 가구를 모두 모아 집 꾸미기를 완성했어요.')
  }
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

function findNearbyAction() {
  if (state.room === 'house') {
    if (Math.hypot(player.x - bedPos.x, player.y - bedPos.y) < TILE * 1.1) return { type: 'bed' }
    return null
  }
  for (const t of trees) {
    if (treeDepleted(t)) continue
    if (Math.hypot(player.x - t.x, player.y - t.y) < TILE * 1.0) return { type: 'tree', obj: t }
  }
  if (Math.hypot(player.x - toriPos.x, player.y - toriPos.y) < TILE * 1.0) return { type: 'tori' }
  if (Math.hypot(player.x - meiPos.x, player.y - meiPos.y) < TILE * 1.0) return { type: 'mei' }
  if (Math.hypot(player.x - boardPos.x, player.y - boardPos.y) < TILE * 1.0) return { type: 'board' }
  if (Math.hypot(player.x - shopPos.x, player.y - shopPos.y) < TILE * 1.0) return { type: 'shop' }
  const col = Math.floor(player.x / TILE)
  const row = Math.floor(player.y / TILE)
  const neighbors = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
  for (const [r, c] of neighbors) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && outsideChars[r][c] === '~') return { type: 'fish' }
  }
  return null
}

const ACTION_LABEL = {
  tree: '상호작용',
  tori: '대화하기',
  mei: '대화하기',
  board: '오늘의 부탁 확인',
  shop: '상점 열기',
  fish: '낚시하기',
  bed: '잠자기 (다음날로)',
}

function doInteract(nearby) {
  if (!nearby) return
  if (nearby.type === 'tree') harvestTree(nearby.obj)
  else if (nearby.type === 'tori') talkTo('tori')
  else if (nearby.type === 'mei') talkTo('mei')
  else if (nearby.type === 'board') checkBoard()
  else if (nearby.type === 'shop') openShop()
  else if (nearby.type === 'fish') attemptFish()
  else if (nearby.type === 'bed') sleep()
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

  if (state.shopOpen) {
    if (key === 'escape' || key === ' ' || key === 'enter') closeShop()
    else if (key === '1') sellAll('wood')
    else if (key === '2') sellAll('fruit')
    else if (key === '3') sellAll('fish')
    else if (key === '4') sellAll('shell')
    else if (key === 'q') buyFurniture(0)
    else if (key === 'w') buyFurniture(1)
    else if (key === 'e') buyFurniture(2)
    else if (key === 'r') buyFurniture(3)
    else if (key === 't') buyFurniture(4)
    return
  }

  if (key === ' ' || key === 'enter') {
    doInteract(findNearbyAction())
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

canvas.addEventListener('click', () => {
  if (state.phase === 'title') state.phase = 'intro'
  else if (state.phase === 'intro') state.phase = 'play'
})

// ---------- Update ----------
function updatePlayer(dt) {
  if (toastTimer > 0) toastTimer -= dt
  if (state.shopOpen) return

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

  if (state.room === 'outside') {
    for (const s of shells) {
      if (s.collected) continue
      if (Math.abs(player.x - s.x) < PLAYER_HALF + 14 && Math.abs(player.y - s.y) < PLAYER_HALF + 14) {
        s.collected = true
        state.inv.shell += 1
        say('알림', '조개를 주웠다! (+1 조개)')
      }
    }
  }

  for (const d of doors) {
    if ((d.inHouse && state.room !== 'house') || (!d.inHouse && state.room !== 'outside')) continue
    const overlapping = Math.abs(player.x - d.x) < PLAYER_HALF + 14 && Math.abs(player.y - d.y) < PLAYER_HALF + 14
    if (overlapping && !d.touching) {
      d.touching = true
      enterRoom(d.to)
    } else if (!overlapping) {
      d.touching = false
    }
  }
}

// ---------- Draw ----------
function drawOutside() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = outsideChars[row][col]
      let color = '#5e9e52'
      if (ch === 'T') color = '#315c2e'
      else if (ch === '~') color = '#3f7fc1'
      else if (ch === 'a') color = '#dfc77e'
      ctx.fillStyle = color
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
      if (ch === 'T') {
        ctx.fillStyle = '#2f7a3d'
        ctx.beginPath()
        ctx.arc(col * TILE + TILE / 2, row * TILE + TILE / 2 - 2, TILE * 0.38, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

function drawTreeFruit(t) {
  if (!t.hasFruit) return
  ctx.fillStyle = '#e4572e'
  for (const [ox, oy] of [[-8, -4], [7, -8], [1, 6]]) {
    ctx.beginPath()
    ctx.arc(t.x + ox, t.y + oy - 6, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawShell(s) {
  if (s.collected) return
  ctx.save()
  ctx.translate(s.x, s.y + Math.sin(performance.now() / 260 + s.col) * 1.5)
  ctx.fillStyle = '#f2e3c9'
  ctx.beginPath()
  ctx.arc(0, 0, 6, Math.PI, 0)
  ctx.fill()
  ctx.strokeStyle = '#c9a86a'
  ctx.lineWidth = 1
  for (const a of [0.3, 1, 1.7, 2.4, 3.0]) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(Math.PI + a) * 6, Math.sin(Math.PI + a) * 6)
    ctx.stroke()
  }
  ctx.restore()
}

function drawPerson(x, y, shirt, hair) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#2b2440'
  ctx.fillRect(-7, 6, 4, 6)
  ctx.fillRect(3, 6, 4, 6)
  ctx.fillStyle = shirt
  ctx.beginPath()
  ctx.roundRect(-9, -9, 18, 18, 4)
  ctx.fill()
  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = hair
  ctx.beginPath()
  ctx.arc(0, -3, 6.5, Math.PI, 0)
  ctx.fill()
  ctx.restore()
}

function drawBoard(x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#8a6a2e'
  ctx.fillRect(-2, 0, 4, 12)
  ctx.fillStyle = '#c9a86a'
  ctx.beginPath()
  ctx.roundRect(-13, -16, 26, 18, 2)
  ctx.fill()
  ctx.strokeStyle = '#5c431c'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#5c431c'
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('부탁', 0, -5)
  ctx.restore()
}

function drawShop(x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#b5742e'
  ctx.beginPath()
  ctx.moveTo(-16, -6)
  ctx.lineTo(0, -20)
  ctx.lineTo(16, -6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e3c88a'
  ctx.fillRect(-14, -6, 28, 14)
  ctx.restore()
  drawPerson(x, y + 6, '#d1795a', '#4a3524')
}

function drawDoor(x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.roundRect(-11, -14, 22, 24, 3)
  ctx.fill()
  ctx.fillStyle = '#d9b76a'
  ctx.beginPath()
  ctx.arc(0, -20, 10, Math.PI, 0)
  ctx.fill()
  ctx.restore()
}

function drawPlayer() {
  const bob = player.walking ? Math.sin(player.walkPhase) * 1.5 : 0
  ctx.save()
  ctx.translate(player.x, player.y + bob)
  const footOffset = player.walking ? Math.sin(player.walkPhase) * 3 : 0
  ctx.fillStyle = '#2b2440'
  ctx.fillRect(-7, 6 + footOffset, 4, 5)
  ctx.fillRect(3, 6 - footOffset, 4, 5)
  ctx.fillStyle = '#3f9fd1'
  ctx.beginPath()
  ctx.roundRect(-9, -9, 18, 18, 4)
  ctx.fill()
  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5c3a1e'
  ctx.beginPath()
  ctx.arc(0, -3, 6.5, Math.PI, 0)
  ctx.fill()
  const [fx, fy] = DIR_VEC[player.facing]
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(fx * 4, fy * 4, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHouse() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = houseChars[row][col]
      ctx.fillStyle = ch === '#' ? '#4a3a26' : '#caa66b'
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
  const bed = tileCenter(5, 10)
  ctx.save()
  ctx.translate(bed.x, bed.y)
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.roundRect(-18, -14, 36, 28, 4)
  ctx.fill()
  ctx.fillStyle = '#f2e3c9'
  ctx.fillRect(-15, -11, 30, 10)
  ctx.restore()

  FURNITURE.forEach((f, i) => {
    if (!state.furniture.has(f.id)) return
    const col = FURNITURE_SLOT_COLS[i]
    const p = tileCenter(FURNITURE_SLOT_ROW, col)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.fillStyle = f.color
    ctx.beginPath()
    ctx.roundRect(-10, -10, 20, 20, 4)
    ctx.fill()
    ctx.fillStyle = '#2b2440'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(f.name, 0, 24)
    ctx.restore()
  })

  const door = tileCenter(13, 14)
  drawDoor(door.x, door.y)
}

function drawHud() {
  ctx.textAlign = 'left'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(`Day ${state.day}`, 10, 20)
  ctx.fillText(`벨 ${state.bells}`, 90, 20)
  ctx.font = '12px sans-serif'
  ctx.fillText(
    `나무 ${state.inv.wood} · 과일 ${state.inv.fruit} · 물고기 ${state.inv.fish} · 조개 ${state.inv.shell}`,
    170,
    20,
  )
  ctx.textAlign = 'right'
  ctx.fillText(`가구 ${state.furniture.size}/${FURNITURE.length}`, canvas.width - 10, 20)

  ctx.textAlign = 'left'
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#ffe066'
  const task = state.task
  const taskLine = task.done
    ? '오늘의 부탁: 완료!'
    : `오늘의 부탁: ${ITEM_LABEL[task.item]} ${task.amount}개 전달 (게시판) · 보상 ${task.bells}벨`
  ctx.fillText(taskLine, 10, 40)
}

function drawPrompt() {
  if (state.shopOpen || toastTimer > TOAST_DURATION - 0.15) return
  const nearby = findNearbyAction()
  if (!nearby) return
  const label = `[스페이스] ${ACTION_LABEL[nearby.type]}`
  ctx.font = 'bold 12px sans-serif'
  const w = ctx.measureText(label).width + 16
  const x = player.x - w / 2
  const y = player.y - 34
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.beginPath()
  ctx.roundRect(x, y - 16, w, 20, 5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.fillText(label, x + w / 2, y - 2)
}

function drawToast() {
  if (toastTimer <= 0) return
  const h = 50
  const y = canvas.height - h
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(0, y, canvas.width, h)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(toastSpeaker, 14, y + 20)
  ctx.fillStyle = '#fff'
  ctx.font = '13px sans-serif'
  ctx.fillText(toastText, 14, y + 38)
}

function drawShopPanel() {
  if (!state.shopOpen) return
  const w = canvas.width - 80
  const h = 300
  const x = 40
  const y = (canvas.height - h) / 2
  ctx.fillStyle = 'rgba(20,16,10,0.95)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 10)
  ctx.fill()
  ctx.strokeStyle = '#c9a86a'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('상점', x + 18, y + 26)

  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText('판매 (숫자 키)', x + 18, y + 50)
  const sellKeys = ['1', '2', '3', '4']
  const sellItems = ['wood', 'fruit', 'fish', 'shell']
  sellItems.forEach((item, i) => {
    ctx.fillText(
      `[${sellKeys[i]}] ${ITEM_LABEL[item]} 팔기 (보유 ${state.inv[item]}개 · 개당 ${SELL_PRICE[item]}벨)`,
      x + 18,
      y + 70 + i * 18,
    )
  })

  ctx.fillStyle = '#fff'
  ctx.fillText('구매 (QWERT 키)', x + 18, y + 150)
  const buyKeys = ['Q', 'W', 'E', 'R', 'T']
  FURNITURE.forEach((f, i) => {
    const owned = state.furniture.has(f.id)
    ctx.fillStyle = owned ? '#8a8a8a' : '#fff'
    ctx.fillText(`[${buyKeys[i]}] ${f.name} ${owned ? '(보유)' : f.price + '벨'}`, x + 18, y + 172 + i * 18)
  })

  ctx.fillStyle = '#ccc'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('ESC/SPACE: 닫기', x + w - 14, y + h - 12)
}

function drawTitle() {
  ctx.fillStyle = '#1c2a1e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 36px sans-serif'
  ctx.fillText('아늑한 섬 생활', canvas.width / 2, canvas.height / 2 - 20)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.fillText('클릭 또는 스페이스를 눌러 시작', canvas.width / 2, canvas.height / 2 + 24)
}

function drawIntro() {
  ctx.fillStyle = '#1c2a1e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('섬에서의 하루', canvas.width / 2, 70)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#fff'
  const lines = [
    '승리나 패배는 없어요. 작은 섬에서 평화롭게 하루하루를 보내는 게임이에요.',
    '나무를 베거나 과일을 따고, 물가에서 낚시를 하고, 조개를 밟아서 모아보세요.',
    '상점(상점 주인)에게 가서 모은 재료를 팔고, 번 벨로 가구 5종을 사서 집을 꾸며보세요.',
    '마을 사람 토리/메이와 대화하고, 게시판의 "오늘의 부탁"을 들어주면 보너스 벨을 받아요.',
    '집에 들어가 침대에서 스페이스를 누르면 잠을 자고 다음 날이 되며, 나무와 조개가 다시 채워져요.',
    '',
    '조작: 방향키/WASD 이동 · 스페이스 = 상호작용(나무/낚시/대화/상점/잠자기) · 조개는 밟으면 자동 획득',
  ]
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 110 + i * 26))
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('클릭 또는 스페이스로 시작', canvas.width / 2, canvas.height - 36)
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

  if (state.room === 'outside') {
    drawOutside()
    for (const t of trees) drawTreeFruit(t)
    for (const s of shells) drawShell(s)
    drawBoard(boardPos.x, boardPos.y)
    drawShop(shopPos.x, shopPos.y)
    drawPerson(toriPos.x, toriPos.y, '#8c9bab', '#2b2440')
    drawPerson(meiPos.x, meiPos.y, '#7fb06a', '#5c3a1e')
    drawDoor(tileCenter(3, 3).x, tileCenter(3, 3).y)
  } else {
    drawHouse()
  }

  drawPlayer()
  drawPrompt()
  drawHud()
  drawToast()
  drawShopPanel()
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  if (state.phase === 'play') updatePlayer(dt)
  render()
  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)
