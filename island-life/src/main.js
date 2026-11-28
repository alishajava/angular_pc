import { sfx, unlockSfx, toggleMute } from './sfx.js'
import { TILE, COLS, ROWS, WORLD_W, WORLD_H, hash, buildWorld, canStand, renderGround, renderMinimap } from './world.js'
import {
  LOOKS, rodTip, drawPerson, drawCat, drawChicken, drawCrab, drawButterfly, drawGull,
  drawTree, drawRock, drawFlowerSpot, drawShellSpot, drawBuilding, drawProp, drawGlow,
} from './art.js'

// Cozy island life: a big island to wander (forest, orchard, flower meadow,
// lake, plaza, pier), villagers who walk around on their own daily routines,
// animals, a day/night cycle, and a small economy (gather -> sell -> decorate).
// Everything is drawn with Canvas 2D shapes - no image/audio files.

const VIEW_W = 960
const VIEW_H = 600

const canvas = document.getElementById('game')
canvas.width = VIEW_W
canvas.height = VIEW_H
const ctx = canvas.getContext('2d')

const world = buildWorld()
const ground = renderGround(world)
const minimap = renderMinimap(world)

// ------------------------------------------------------------------ data ----

const FURNITURE = [
  { id: 'pot', name: '화분', price: 40, color: '#4caf6a' },
  { id: 'rug', name: '러그', price: 60, color: '#d1795a' },
  { id: 'lamp', name: '램프', price: 80, color: '#f2c94c' },
  { id: 'shelf', name: '책장', price: 100, color: '#8a5a2e' },
  { id: 'clock', name: '벽시계', price: 120, color: '#9aa0c9' },
]
const ITEMS = ['wood', 'fruit', 'fish', 'shell', 'flower']
const ITEM_LABEL = { wood: '나무', fruit: '과일', fish: '물고기', shell: '조개', flower: '꽃' }
const SELL_PRICE = { wood: 8, fruit: 10, fish: 15, shell: 12, flower: 6 }
const ITEM_COLOR = { wood: '#a8703c', fruit: '#e8452e', fish: '#6ab8e8', shell: '#fff3e0', flower: '#ff8fb0' }

const SHOP_OPEN = 7
const SHOP_CLOSE = 20
const DAY_START = 6.5
const HOURS_PER_SEC = 0.0333

const state = {
  phase: 'title', // title -> intro -> play
  room: 'outside', // outside | house
  day: 1,
  tod: 9, // time of day in hours
  bells: 20,
  inv: { wood: 0, fruit: 0, fish: 0, shell: 0, flower: 0 },
  furniture: new Set(),
  furnitureCelebrated: false,
  shopOpen: false,
  task: null,
  fishLeft: 8,
  friend: { tori: 0, mei: 0, moka: 0, bori: 0 },
  rewarded: {},
}

function newTask() {
  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)]
  const amount = item === 'flower' ? 3 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3)
  const bells = 20 + amount * SELL_PRICE[item] + 10 + Math.floor(Math.random() * 20)
  return { item, amount, bells, done: false }
}
state.task = newTask()

// ---------------------------------------------------------------- helpers ----

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)
const tileOf = (v) => Math.floor(v / TILE)
const footX = (c) => (c + 0.5) * TILE
const footY = (r) => (r + 0.8) * TILE

const terrainAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS ? 'W' : world.terrain[r][c])
const isWaterTile = (c, r) => {
  const ch = terrainAt(c, r)
  return ch === 'W' || ch === 's' || ch === 'l'
}

// Breadth-first path over free tiles (4-neighbour). Returns tile-centre points.
function findPath(x0, y0, x1, y1) {
  const sc = tileOf(x0)
  const sr = tileOf(y0)
  const gc = tileOf(x1)
  const gr = tileOf(y1)
  if (sc === gc && sr === gr) return []
  const prev = new Int32Array(COLS * ROWS).fill(-2)
  const q = [sr * COLS + sc]
  prev[sr * COLS + sc] = -1
  const goal = gr * COLS + gc
  for (let i = 0; i < q.length && prev[goal] === -2; i++) {
    const cur = q[i]
    const c = cur % COLS
    const r = (cur - c) / COLS
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue
      const id = nr * COLS + nc
      if (prev[id] !== -2) continue
      if (world.isSolid(nc, nr) && id !== goal) continue
      prev[id] = cur
      q.push(id)
    }
  }
  if (prev[goal] === -2) return null
  const out = []
  for (let id = goal; id !== -1; id = prev[id]) {
    const c = id % COLS
    out.push({ x: footX(c), y: footY((id - c) / COLS) })
  }
  out.pop() // the start tile
  return out.reverse()
}

// spiral outwards to the nearest tile a small body can stand on
function openSpot(c, r, onTerrain) {
  for (let rad = 0; rad < 8; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue
        const cc = c + dc
        const rr = r + dr
        if (onTerrain && terrainAt(cc, rr) !== onTerrain) continue
        if (canStand(world, footX(cc), footY(rr), 7)) return { x: footX(cc), y: footY(rr) }
      }
    }
  }
  return { x: footX(c), y: footY(r) }
}

// ------------------------------------------------------------------ toast ----

const TOAST_DURATION = 3.6
let toastSpeaker = ''
let toastText = ''
let toastTimer = 0
function say(speaker, text) {
  toastSpeaker = speaker
  toastText = text
  toastTimer = TOAST_DURATION
}

const popups = []
function addPop(x, y, text, color = '#fff6c0') {
  popups.push({ x, y, text, color, t: 0 })
}
const rings = [] // water ripples {x,y,t}

// ----------------------------------------------------------------- player ----

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const PLAYER_HALF = 9
const WALK_SPEED = 118
const RUN_SPEED = 190

const player = {
  x: world.spawn.x,
  y: world.spawn.y,
  facing: 'down',
  walk: 0,
  moving: false,
  running: false,
  act: null, // {type, t, dur, onDone}
  fish: null, // fishing state
  emote: null,
}

const cam = { x: 0, y: 0 }
function snapCamera() {
  cam.x = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W)
  cam.y = clamp(player.y - 40 - VIEW_H / 2, 0, WORLD_H - VIEW_H)
}
snapCamera()

// ------------------------------------------------------------------- house ----

const ROOM = { w: 24 * TILE, h: 14 * TILE, ox: 96, oy: 84 }
const ROOM_BOUNDS = { minX: 52, maxX: 716, minY: 156, maxY: 438 }
const ROOM_DOOR_X = 12 * TILE
const BED = { x: 64, y: 134, w: 100, h: 106 }
const BED_SPOT = { x: 114, y: 262 }
const ROOM_SOLIDS = {
  bed: BED,
  shelf: { x: 196, y: 126, w: 110, h: 30 },
  lamp: { x: 628, y: 158, w: 26, h: 18 },
  pot: { x: 684, y: 158, w: 32, h: 18 },
}

function roomBlocked(x, y) {
  const hb = 9
  const rects = [BED]
  if (state.furniture.has('shelf')) rects.push(ROOM_SOLIDS.shelf)
  if (state.furniture.has('lamp')) rects.push(ROOM_SOLIDS.lamp)
  if (state.furniture.has('pot')) rects.push(ROOM_SOLIDS.pot)
  for (const r of rects) {
    if (x + hb > r.x && x - hb < r.x + r.w && y + 2 > r.y && y - 6 < r.y + r.h) return true
  }
  return false
}

function enterHouse() {
  state.room = 'house'
  player.x = ROOM_DOOR_X
  player.y = ROOM_BOUNDS.maxY - 14
  player.facing = 'up'
  player.act = null
  player.fish = null
  sfx.click()
}

function exitHouse() {
  const b = world.buildings[0]
  state.room = 'outside'
  player.x = footX(b.door.c)
  player.y = footY(b.door.r) + 4
  player.facing = 'down'
  snapCamera()
  sfx.click()
}

// ------------------------------------------------------------ day / night ----

const TINT_STOPS = [
  [0, [70, 80, 140]],
  [5, [80, 90, 150]],
  [6.5, [255, 196, 156]],
  [8, [255, 255, 255]],
  [17, [255, 255, 255]],
  [18.6, [255, 196, 150]],
  [20, [160, 135, 195]],
  [21.6, [88, 98, 158]],
  [24, [70, 80, 140]],
]
function skyTint(h) {
  for (let i = 0; i < TINT_STOPS.length - 1; i++) {
    const [h0, c0] = TINT_STOPS[i]
    const [h1, c1] = TINT_STOPS[i + 1]
    if (h >= h0 && h <= h1) {
      const k = (h - h0) / (h1 - h0)
      const col = c0.map((v, j) => Math.round(lerp(v, c1[j], k)))
      const night = clamp((255 - (col[0] + col[1] + col[2]) / 3) / 110, 0, 1)
      return { col, night }
    }
  }
  return { col: [255, 255, 255], night: 0 }
}
const isNightHour = (h) => h >= 20.4 || h < 6.8
function clockText(h) {
  const hh = Math.floor(h) % 24
  const mm = Math.floor((h - Math.floor(h)) * 60)
  return `${String(hh).padStart(2, '0')}:${String(Math.floor(mm / 10) * 10).padStart(2, '0')}`
}

// -------------------------------------------------------------- villagers ----

const buildingById = (id) => world.buildings.find((b) => b.id === id)
const benches = world.props.filter((p) => p.kind === 'bench')
function benchSeat(bench, idx) {
  return {
    c: bench.c + idx,
    r: bench.r + 1, // the tile just south of the bench
    act: 'sit',
    final: { x: footX(bench.c + idx), y: bench.y - 4, sortY: bench.y + 1 },
    dur: [8, 16],
  }
}

const LINES = {
  tori: {
    any: [
      '오늘 날씨 정말 좋다! 산책하기 딱이야.',
      '요즘 조개 줍는 게 취미야. 해안을 따라 걸으면 꽤 많이 보여!',
      '북쪽 숲에는 나무가 엄청 많아. 도끼질 하기 좋지.',
      '분수대 앞 벤치가 내 단골 자리야. 앉아 있으면 마을이 다 보여.',
      '동쪽 과수원에선 사과, 오렌지, 복숭아가 열려. 아침에 가면 싱싱해!',
    ],
    morning: '좋은 아침! 일찍 일어났네? 오늘도 힘내자.',
    evening: '해가 지고 있어… 가로등이 켜지면 광장이 정말 예뻐.',
  },
  mei: {
    any: [
      '남서쪽 꽃밭 가봤어? 꽃을 따서 팔면 용돈벌이가 돼.',
      '꽃은 선물로 최고야! 가까이서 G키를 눌러 줘 봐.',
      '할아버지는 하루 종일 부두에서 낚시만 해. 잡아 오는 걸 본 적이 없지만…',
      '집 꾸미는 건 어떻게 돼가? 상점에 예쁜 가구가 많아.',
    ],
    morning: '아침 이슬 맺힌 꽃이 제일 예뻐! 같이 꽃 따러 갈래?',
    evening: '벌써 어두워지네. 할아버지 저녁 차려 드려야겠다.',
  },
  moka: {
    any: ['어서 오세요! 사고팔 게 있으면 말씀하세요.', '오늘도 좋은 물건 많아요. 천천히 구경하세요!'],
    morning: '좋은 아침이에요! 오늘 첫 손님이시네요.',
    evening: '곧 문 닫을 시간이에요. 필요한 건 서둘러 주세요!',
  },
  bori: {
    any: [
      '쉿… 물고기가 놀라잖니. 부두 끝이 명당이란다.',
      '낚시는 찌가 쑥 들어갈 때 스페이스를 눌러야 해.',
      '우리 손녀 메이는 꽃만 좋아해. 낚시도 가르쳐 주고 싶은데 말이다.',
      '오래 기다리는 사람이 큰 물고기를 잡는 법이지. 허허.',
    ],
    morning: '일찍 일어났구나. 아침 물때가 제일 좋단다.',
    evening: '오늘은 허탕이구나… 내일은 꼭 잡을 거다.',
  },
}
const GIFT_LINES = {
  tori: '꽃이다! 고마워. 집에 가서 꽃병에 꽂아 둘게.',
  mei: '와, 정말 예쁜 꽃이야! 나 이 색깔 제일 좋아해!',
  moka: '어머, 꽃이네요! 가게 카운터에 놓아 둘게요.',
  bori: '허허, 늙은이한테 꽃이라니… 고맙구나. 메이가 부러워하겠어.',
}
const NPC_NAME = { tori: '토리', mei: '메이', moka: '모카', bori: '보리 할아버지' }

function makeNpc(id, look, homeId, startSpot, spots, speed) {
  const home = buildingById(homeId)
  const s = openSpot(startSpot[0], startSpot[1])
  return {
    id,
    look,
    name: NPC_NAME[id],
    home: { c: home.door.c, r: home.door.r },
    x: s.x,
    y: s.y,
    facing: 'down',
    walk: Math.random() * 6,
    moving: false,
    state: 'idle',
    timer: 1 + Math.random() * 3,
    path: [],
    spots,
    spot: null,
    hidden: false,
    pose: null,
    sit: false,
    sortY: null,
    emote: null,
    emoteT: 0,
    greeted: false,
    lineIdx: 0,
    speed,
    t: Math.random() * 10,
    bite: 6 + Math.random() * 8,
  }
}

const pier = world.pier
const npcs = [
  makeNpc('tori', LOOKS.tori, 'tori', [38, 25], [
    { c: 38, r: 25 }, { c: 34, r: 25 }, benchSeat(benches[0], 0), { c: 43, r: 23 }, { c: 48, r: 24 },
    { c: 53, r: 25 }, { c: 51, r: 31 }, { c: 30, r: 23 }, { c: 36, r: 29 },
  ], 56),
  makeNpc('mei', LOOKS.mei, 'mei', [22, 34], [
    { c: 16, r: 34, act: 'pick' }, { c: 20, r: 36, act: 'pick' }, { c: 24, r: 33, act: 'pick' },
    { c: 27, r: 35, act: 'pick' }, { c: 19, r: 33, act: 'pick' }, { c: 22, r: 26 }, { c: 31, r: 26 },
    { c: 25, r: 23 }, { c: 36, r: 29 },
  ], 62),
  makeNpc('moka', LOOKS.moka, 'shop', [44, 21], [
    { c: 44, r: 21 }, { c: 42, r: 21 }, { c: 46, r: 21 }, { c: 44, r: 22 }, { c: 45, r: 23 },
  ], 46),
  makeNpc('bori', LOOKS.bori, 'mei', [36, pier.r0 - 1], [
    { c: pier.c0, r: pier.r1, act: 'fish', final: { x: (pier.c0 + 1) * TILE, y: (pier.r1 + 1) * TILE - 6 }, dur: [26, 46] },
    { c: pier.c1, r: pier.r1, act: 'fish', final: { x: (pier.c1 + 1) * TILE - 8, y: (pier.r1 + 1) * TILE - 6 }, dur: [26, 46] },
    benchSeat(benches[1], 0),
    { c: 36, r: pier.r0 - 3 }, { c: 37, r: 30 },
  ], 40),
]
const npcById = Object.fromEntries(npcs.map((n) => [n.id, n]))

function npcGo(n, spot) {
  n.spot = spot
  if (n.sit) {
    // stand up from a seat: step back onto the free tile
    n.sit = false
    n.sortY = null
    n.pose = null
    n.x = footX(spot.fromC ?? tileOf(n.x))
    n.y = footY(n.leaveR ?? tileOf(n.y) + 1)
  }
  const goalX = footX(spot.c)
  const goalY = footY(spot.r)
  const p = findPath(n.x, n.y, goalX, goalY)
  n.path = p || []
  n.state = 'walk'
}

function npcPickSpot(n) {
  const options = n.spots.filter((s) => s !== n.spot)
  return options[Math.floor(Math.random() * options.length)]
}

function npcArrive(n) {
  const s = n.spot
  n.moving = false
  n.state = 'idle'
  n.timer = 2 + Math.random() * 5
  if (s && s.act === 'sit') {
    n.leaveR = s.r
    n.fromC = s.c
    n.x = s.final.x
    n.y = s.final.y
    n.sortY = s.final.sortY
    n.sit = true
    n.facing = 'down'
    n.timer = lerp(s.dur[0], s.dur[1], Math.random())
  } else if (s && s.act === 'fish') {
    n.leaveR = s.r
    n.fromC = s.c
    n.x = s.final.x
    n.y = s.final.y
    n.sit = true
    n.facing = 'down'
    n.pose = { type: 'fish', p: 0 }
    n.timer = lerp(s.dur[0], s.dur[1], Math.random())
    n.bite = 6 + Math.random() * 8
  } else if (s && s.act === 'pick') {
    n.facing = 'down'
    n.pose = { type: 'pick', p: 0, dur: 1.4, t: 0 }
    n.timer = 1.8
  } else {
    n.facing = ['down', 'left', 'right', 'down'][Math.floor(Math.random() * 4)]
  }
}

function updateNpc(n, dt) {
  n.t += dt
  if (n.emoteT > 0) {
    n.emoteT -= dt
    if (n.emoteT <= 0) n.emote = null
  }
  const night = isNightHour(state.tod)

  if (n.hidden) {
    if (!night) {
      n.hidden = false
      n.sit = false
      n.sortY = null
      n.pose = null
      n.x = footX(n.home.c)
      n.y = footY(n.home.r)
      n.state = 'idle'
      n.timer = 0.5
      n.greeted = false
    }
    return
  }

  // evening: head home and go inside
  if (night && n.state !== 'gohome' && n.state !== 'talk') {
    if (n.sit) {
      n.sit = false
      n.sortY = null
      n.x = footX(n.fromC)
      n.y = footY(n.leaveR)
    }
    n.pose = null
    n.state = 'gohome'
    n.path = findPath(n.x, n.y, footX(n.home.c), footY(n.home.r)) || []
    n.spot = null
  }

  const near = state.room === 'outside' ? dist(n.x, n.y, player.x, player.y) : 9999
  if (near > 240) n.greeted = false

  // a friendly wave when the player first walks up
  if (!n.greeted && near < 96 && n.state !== 'gohome' && n.state !== 'talk' && !night) {
    n.greeted = true
    n.state = 'talk'
    n.timer = 1.5
    n.pose = { type: 'wave', p: 0 }
    n.moving = false
    n.path = []
  }

  if (n.state === 'talk') {
    n.timer -= dt
    n.moving = false
    if (near < 130) {
      const dx = player.x - n.x
      const dy = player.y - n.y
      n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    }
    if (n.timer <= 0) {
      n.pose = n.spot && n.spot.act === 'fish' && n.sit ? { type: 'fish', p: 0 } : null
      if (n.sit && n.spot && n.spot.act === 'fish') n.state = 'idle'
      else {
        n.state = 'idle'
        n.timer = 0.6
      }
    }
    return
  }

  if (n.state === 'idle') {
    n.moving = false
    n.timer -= dt
    if (n.pose && n.pose.type === 'pick') {
      n.pose.t += dt
      n.pose.p = (n.pose.t % n.pose.dur) / n.pose.dur
    }
    if (n.spot && n.spot.act === 'fish' && n.sit) {
      n.bite -= dt
      if (n.bite <= 0) {
        n.bite = 8 + Math.random() * 12
        n.emote = '!'
        n.emoteT = 1.2
        rings.push({ x: n.x + 28, y: n.y + 34, t: 0 })
        sfx.splash()
      }
    }
    if (n.timer <= 0) {
      if (n.state === 'idle' && night) return
      n.pose = null
      npcGo(n, npcPickSpot(n))
    }
    return
  }

  if (n.state === 'walk' || n.state === 'gohome') {
    if (!n.path.length) {
      if (n.state === 'gohome') {
        n.hidden = true
        n.moving = false
        return
      }
      npcArrive(n)
      return
    }
    const tgt = n.path[0]
    const dx = tgt.x - n.x
    const dy = tgt.y - n.y
    const d = Math.hypot(dx, dy)
    const step = n.speed * dt * (n.state === 'gohome' ? 1.3 : 1)
    if (d <= step) {
      n.x = tgt.x
      n.y = tgt.y
      n.path.shift()
    } else {
      n.x += (dx / d) * step
      n.y += (dy / d) * step
      n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    }
    n.moving = true
    n.walk += dt * (n.speed / 7)
  }
}

// --------------------------------------------------------------- animals ----

function makeCat(c, r, color) {
  const p = openSpot(c, r)
  return { x: p.x, y: p.y, hx: p.x, hy: p.y, facing: 'right', state: 'idle', timer: 1 + Math.random() * 3, tx: p.x, ty: p.y, walk: 0, moving: false, sitting: true, color, t: Math.random() * 9, emote: null, emoteT: 0 }
}
const cats = [makeCat(26, 21, '#e8a85a'), makeCat(41, 21, '#b8b8c4'), makeCat(35, 30, '#4a4452')]

const chickens = []
for (let i = 0; i < 6; i++) {
  const p = openSpot(54 + (i % 3) * 2, 31 + Math.floor(i / 3) * 2)
  chickens.push({ x: p.x, y: p.y, hx: p.x, hy: p.y, facing: i % 2 ? 'left' : 'right', timer: Math.random() * 3, tx: p.x, ty: p.y, walk: 0, moving: false, pecking: false, t: Math.random() * 9 })
}

const crabs = []
for (const s of world.shells.filter((_, i) => i % 5 === 2).slice(0, 8)) {
  const p = openSpot(s.c, s.r, 'a')
  crabs.push({ x: p.x, y: p.y, hx: p.x, hy: p.y, timer: Math.random() * 3, tx: p.x, ty: p.y, walk: 0, moving: false, t: Math.random() * 9 })
}

const butterflies = []
const BUTTERFLY_COLORS = ['#ffb0d0', '#ffe066', '#a8d8ff', '#ffffff', '#d8b0ff']
for (let i = 0; i < 12; i++) {
  const m = world.meadow
  butterflies.push({
    x: (m.c0 + Math.random() * (m.c1 - m.c0)) * TILE,
    y: (m.r0 + Math.random() * (m.r1 - m.r0)) * TILE,
    a: Math.random() * 6.28,
    seed: Math.random() * 10,
    h: 18 + Math.random() * 26,
    color: BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length],
    cx: ((i % 2 ? m.c0 : m.c1) + Math.random() * 3) * TILE,
    cy: (m.r0 + 1 + Math.random() * (m.r1 - m.r0 - 2)) * TILE,
  })
}
// a few over the orchard and forest edge too
for (let i = 0; i < 6; i++) {
  const o = world.orchard
  butterflies.push({
    x: (o.c0 + Math.random() * 8) * TILE,
    y: (o.r0 + Math.random() * 10) * TILE,
    a: Math.random() * 6.28,
    seed: Math.random() * 10,
    h: 20 + Math.random() * 24,
    color: BUTTERFLY_COLORS[(i + 2) % BUTTERFLY_COLORS.length],
    cx: (o.c0 + 2 + Math.random() * 5) * TILE,
    cy: (o.r0 + 2 + Math.random() * 8) * TILE,
  })
}

const gulls = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2, sp: 0.07 + (i % 3) * 0.02, rr: 1 + (i % 2) * 0.05, seed: i * 1.7 }))

function wander(a, dt, { speed, radius, half, terr, flee, fleeSpeed }) {
  a.t += dt
  const pd = state.room === 'outside' ? dist(a.x, a.y, player.x, player.y) : 9999
  if (flee && pd < flee) {
    const dx = a.x - player.x
    const dy = a.y - player.y
    const d = Math.hypot(dx, dy) || 1
    a.tx = a.hx + clamp(a.x - a.hx + (dx / d) * 60, -radius, radius)
    a.ty = a.hy + clamp(a.y - a.hy + (dy / d) * 60, -radius, radius)
    a.fleeing = true
    a.timer = 0.6
  } else a.fleeing = false
  const sp = a.fleeing ? fleeSpeed || speed * 2.2 : speed
  const dx = a.tx - a.x
  const dy = a.ty - a.y
  const d = Math.hypot(dx, dy)
  if (d > 3) {
    const step = Math.min(d, sp * dt)
    const nx = a.x + (dx / d) * step
    const ny = a.y + (dy / d) * step
    const ok = (x, y) => canStand(world, x, y, half) && (!terr || terrainAt(tileOf(x), tileOf(y)) === terr)
    let moved = false
    if (ok(nx, a.y)) {
      a.x = nx
      moved = true
    }
    if (ok(a.x, ny)) {
      a.y = ny
      moved = true
    }
    if (!moved) a.timer = 0
    a.moving = true
    a.walk += dt * (sp / 6)
    if (Math.abs(dx) > 1) a.facing = dx > 0 ? 'right' : 'left'
    a.pecking = false
  } else {
    a.moving = false
    a.timer -= dt
    if (a.timer <= 0) {
      a.tx = a.hx + (Math.random() * 2 - 1) * radius
      a.ty = a.hy + (Math.random() * 2 - 1) * radius
      a.timer = 1 + Math.random() * 3.5
      if ('pecking' in a) a.pecking = Math.random() < 0.55
      if ('sitting' in a) a.sitting = Math.random() < 0.4
    }
  }
  if (!a.moving && d <= 3 && a.timer <= 0) a.timer = 0.5
}

function updateAnimals(dt) {
  for (const c of cats) {
    wander(c, dt, { speed: 34, radius: 90, half: 6 })
    if (c.moving) c.sitting = false
    if (c.emoteT > 0) {
      c.emoteT -= dt
      if (c.emoteT <= 0) c.emote = null
    }
  }
  for (const c of chickens) wander(c, dt, { speed: 24, radius: 90, half: 5, flee: 56, fleeSpeed: 90 })
  for (const c of crabs) wander(c, dt, { speed: 22, radius: 70, half: 4, terr: 'a', flee: 58, fleeSpeed: 85 })
  for (const b of butterflies) {
    b.a += (Math.random() - 0.5) * 3 * dt
    b.x += Math.cos(b.a) * 30 * dt
    b.y += Math.sin(b.a) * 22 * dt
    const dx = b.cx - b.x
    const dy = b.cy - b.y
    if (Math.hypot(dx, dy) > 150) b.a = Math.atan2(dy, dx)
  }
  for (const g of gulls) g.a += g.sp * dt
}

// ---------------------------------------------------------------- actions ----

const treeActive = (t) => t.hasFruit || t.woodCharges > 0

function giveItem(kind, x, y, n = 1) {
  state.inv[kind] += n
  addPop(x, y - 60, `+${n} ${ITEM_LABEL[kind]}`, ITEM_COLOR[kind])
}

function faceToward(x, y) {
  const dx = x - player.x
  const dy = y - player.y
  player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

function startAct(type, dur, onDone) {
  player.act = { type, t: 0, dur, onDone }
}

function harvestTree(t) {
  faceToward(t.x, t.y - 20)
  if (t.hasFruit) {
    startAct('pick', 0.7, () => {
      t.hasFruit = false
      t.shake = 0.5
      giveItem('fruit', t.x, t.y - 30)
      sfx.pickup()
      say('알림', '과일을 땄다! (+1 과일)')
    })
    t.shake = 0.6
  } else if (t.woodCharges > 0) {
    startAct('chop', 0.8, () => {
      t.woodCharges -= 1
      t.shake = 0.5
      giveItem('wood', t.x, t.y - 30)
      sfx.build()
      say('알림', t.woodCharges > 0 ? '나무를 베었다! (+1 나무)' : '나무를 베었다! 이 나무는 이제 그루터기만 남았어요.')
    })
    setTimeout(() => (t.shake = 0.5), 450)
  }
}

function pickFlower(f) {
  faceToward(f.x, f.y)
  startAct('pick', 0.55, () => {
    f.picked = true
    giveItem('flower', f.x, f.y - 6)
    sfx.pickup()
    say('알림', '꽃을 땄다! (+1 꽃) · 메이에게 선물하면 좋아해요')
  })
}

function talkTo(n) {
  sfx.click()
  n.state = 'talk'
  n.timer = 3.2
  n.pose = null
  n.moving = false
  n.path = []
  n.greeted = true
  const h = state.tod
  let line
  if (h < 10 && n.lineIdx === 0) line = LINES[n.id].morning
  else if (h >= 18 && n.lineIdx === 0) line = LINES[n.id].evening
  else line = LINES[n.id].any[n.lineIdx % LINES[n.id].any.length]
  n.lineIdx++
  say(n.name, line)
  if (n.id === 'moka') openShop()
}

function giftFlower(n) {
  if (state.inv.flower <= 0) return
  state.inv.flower -= 1
  state.friend[n.id] += 1
  n.state = 'talk'
  n.timer = 2.6
  n.pose = null
  n.moving = false
  n.path = []
  n.emote = '♥'
  n.emoteT = 2.4
  sfx.good()
  say(n.name, GIFT_LINES[n.id] + ` (친밀도 ${'♥'.repeat(Math.min(state.friend[n.id], 5))})`)
  if (state.friend[n.id] >= 3 && !state.rewarded[n.id]) {
    state.rewarded[n.id] = true
    state.bells += 40
    setTimeout(() => {
      sfx.fanfare()
      say(n.name, '꽃을 정말 많이 줬네! 우리 이제 진짜 친구야. 이건 감사의 선물이야 (+40벨)')
      addPop(n.x, n.y - 70, '+40벨', '#ffe066')
    }, 1600)
  }
}

function checkBoard() {
  sfx.click()
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
    sfx.good()
    say('게시판', `부탁을 들어줬다! ${ITEM_LABEL[task.item]} ${task.amount}개를 전달하고 ${task.bells}벨을 받았다.`)
  } else {
    say('게시판', `오늘의 부탁: ${ITEM_LABEL[task.item]} ${task.amount}개 가져오기 (보유 ${have}개) · 완료 보상 ${task.bells}벨`)
  }
}

function sleep(auto) {
  sfx.sleep()
  state.day += 1
  state.tod = DAY_START
  setTimeout(saveGame, 1500)
  for (const t of world.trees) {
    t.hasFruit = t.fruiting
    t.woodCharges = t.fruiting ? 2 : 3
  }
  for (const s of world.shells) s.collected = false
  for (const f of world.flowers) f.picked = false
  state.task = newTask()
  state.fishLeft = 8
  for (const n of npcs) {
    n.hidden = true
    n.state = 'idle'
    n.sit = false
    n.sortY = null
    n.pose = null
    n.path = []
  }
  player.act = null
  player.fish = null
  if (state.room === 'house') exitHouse()
  else {
    const b = world.buildings[0]
    player.x = footX(b.door.c)
    player.y = footY(b.door.r) + 4
    snapCamera()
  }
  say('알림', auto
    ? `너무 졸려서 집으로 돌아와 잠들었어요… Day ${state.day} 아침이에요! 나무·꽃·조개가 다시 채워졌어요.`
    : `포근한 밤을 보내고 Day ${state.day}가 되었습니다. 나무·꽃·조개가 다시 채워졌어요!`)
}

function openShop() {
  if (state.tod < SHOP_OPEN || state.tod >= SHOP_CLOSE) {
    say('모카', '지금은 문을 닫았어요. 아침 7시부터 저녁 8시까지 열어요!')
    return
  }
  state.shopOpen = true
  sfx.click()
}
function closeShop() {
  state.shopOpen = false
  sfx.click()
}

function sellAll(item) {
  const count = state.inv[item]
  if (count <= 0) {
    say('상점', `팔 수 있는 ${ITEM_LABEL[item]}이 없어요.`)
    sfx.bad()
    return
  }
  const earned = count * SELL_PRICE[item]
  state.inv[item] = 0
  state.bells += earned
  sfx.coin()
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
    sfx.bad()
    return
  }
  state.bells -= f.price
  state.furniture.add(f.id)
  sfx.good()
  say('상점', `${f.name}을 구매했다! 집에서 확인해보세요.`)
  if (state.furniture.size === FURNITURE.length && !state.furnitureCelebrated) {
    state.furnitureCelebrated = true
    sfx.fanfare()
    say('알림', '축하합니다! 가구를 모두 모아 집 꾸미기를 완성했어요.')
  }
}

// ---------------------------------------------------------------- fishing ----

function fishingSpot() {
  const [vx, vy] = DIR_VEC[player.facing]
  const px = player.x + vx * 34
  const py = player.y + vy * 34 - 2
  if (isWaterTile(tileOf(px), tileOf(py))) {
    return { x: player.x + vx * 64, y: player.y + vy * 64 - 4 }
  }
  return null
}

function startFishing(spot) {
  if (state.fishLeft <= 0) {
    say('알림', '오늘은 충분히 낚았어요. 내일 다시 해보세요!')
    return
  }
  state.fishLeft -= 1
  sfx.whoosh()
  player.fish = { phase: 'cast', t: 0, wait: 1.6 + Math.random() * 2.6, x: spot.x, y: spot.y }
}

function fishingPress() {
  const f = player.fish
  if (!f) return
  if (f.phase === 'bite') {
    f.phase = 'reel'
    f.t = 0
    sfx.splash()
    const roll = Math.random()
    if (roll < 0.07) {
      state.bells += 30
      sfx.fanfare()
      addPop(player.x, player.y - 70, '황금 물고기! +30벨', '#ffd24a')
      say('알림', '황금 물고기를 낚았다! 보너스 30벨!')
    } else if (roll < 0.2) {
      giveItem('shell', player.x, player.y)
      say('알림', '낚싯줄에 조개가 걸려 올라왔다! (+1 조개)')
    } else {
      const names = ['붕어', '잉어', '도미', '고등어', '메기']
      giveItem('fish', player.x, player.y)
      sfx.pickup()
      say('알림', `${names[Math.floor(Math.random() * names.length)]}를 잡았다! (+1 물고기) · 오늘 남은 낚시 ${state.fishLeft}번`)
    }
  } else if (f.phase === 'wait' || f.phase === 'cast') {
    say('알림', '아직 입질이 없어요. 찌가 쑥 들어가면 스페이스!')
    player.fish = null
  }
}

function updateFishing(dt) {
  const f = player.fish
  if (!f) return
  f.t += dt
  if (f.phase === 'cast' && f.t > 0.5) {
    f.phase = 'wait'
    f.t = 0
    rings.push({ x: f.x, y: f.y, t: 0 })
    sfx.splash()
  } else if (f.phase === 'wait' && f.t > f.wait) {
    f.phase = 'bite'
    f.t = 0
    rings.push({ x: f.x, y: f.y, t: 0 })
    sfx.hit()
  } else if (f.phase === 'bite' && f.t > 1.15) {
    say('알림', `물고기가 도망갔다... · 오늘 남은 낚시 ${state.fishLeft}번`)
    player.fish = null
  } else if (f.phase === 'reel' && f.t > 0.55) {
    player.fish = null
  }
}

// ------------------------------------------------------------ interaction ----

const heldKeys = new Set()
const MOVE_KEYS = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
}
const held = (names) => names.some((k) => heldKeys.has(k))

const SIGN_TEXT = '← 서쪽 마을·꽃밭   ↑ 광장   ↓ 부두 낚시터'

function findNearbyAction() {
  if (state.room === 'house') {
    if (dist(player.x, player.y, BED_SPOT.x, BED_SPOT.y) < 54) return { type: 'bed', label: '잠자기 (다음날로)' }
    return null
  }
  if (player.act || player.fish) return null
  const px = player.x
  const py = player.y
  let best = null
  const consider = (cand, d, reach, bias = 0) => {
    if (d > reach) return
    const score = d + bias
    if (!best || score < best.score) best = { ...cand, score }
  }
  const b0 = world.buildings[0]
  if (tileOf(px) === b0.door.c && tileOf(py) === b0.door.r) return { type: 'door', label: '집에 들어가기' }
  for (const t of world.trees) if (treeActive(t)) consider({ type: 'tree', obj: t, label: t.hasFruit ? '과일 따기' : '나무 베기' }, dist(px, py, t.x, t.y), 46)
  for (const f of world.flowers) if (!f.picked) consider({ type: 'flower', obj: f, label: '꽃 따기' }, dist(px, py, f.x, f.y), 30, -4)
  for (const n of npcs) {
    if (n.hidden) continue
    consider({ type: 'npc', obj: n, label: n.id === 'moka' ? '상점 열기' : '대화하기' }, dist(px, py, n.x, n.y), 56, -12)
  }
  for (const c of cats) consider({ type: 'cat', obj: c, label: '쓰다듬기' }, dist(px, py, c.x, c.y), 40, -6)
  for (const p of world.props) {
    if (p.kind === 'board') consider({ type: 'board', label: '오늘의 부탁 확인' }, dist(px, py, p.x, p.y - 8), 58)
    else if (p.kind === 'fountain') consider({ type: 'fountain', label: '소원 빌기 (1벨)' }, dist(px, py, p.x, p.y - 12), 66, 6)
    else if (p.kind === 'mailbox') consider({ type: 'mailbox', label: '우편함 확인' }, dist(px, py, p.x, p.y - 10), 40)
    else if (p.kind === 'sign') consider({ type: 'sign', label: '표지판 읽기' }, dist(px, py, p.x, p.y - 10), 40)
  }
  if (best) return best
  if (fishingSpot()) return { type: 'fish', label: player.facing === 'down' || player.facing === 'up' ? '낚시하기' : '낚시하기' }
  return null
}

function doInteract(a) {
  if (!a) return
  if (a.type === 'tree') harvestTree(a.obj)
  else if (a.type === 'flower') pickFlower(a.obj)
  else if (a.type === 'npc') {
    faceToward(a.obj.x, a.obj.y)
    talkTo(a.obj)
  } else if (a.type === 'cat') {
    a.obj.emote = '♥'
    a.obj.emoteT = 2
    a.obj.sitting = true
    a.obj.tx = a.obj.x
    a.obj.ty = a.obj.y
    sfx.pickup()
    say('고양이', '야옹~ 골골골… ♥')
  } else if (a.type === 'board') checkBoard()
  else if (a.type === 'fountain') {
    if (state.bells < 1) say('분수대', '던질 동전이 없어요…')
    else {
      state.bells -= 1
      sfx.coin()
      const wishes = ['동전을 던지고 소원을 빌었다… "오늘도 평화롭게!"', '퐁당! 소원이 이루어질지도?', '동전이 반짝이며 가라앉았다.']
      say('분수대', wishes[Math.floor(Math.random() * wishes.length)])
    }
  } else if (a.type === 'mailbox') say('우편함', '편지는 없어요. 섬에는 우체부가 없으니까요.')
  else if (a.type === 'sign') say('표지판', SIGN_TEXT)
  else if (a.type === 'door') enterHouse()
  else if (a.type === 'bed') sleep(false)
  else if (a.type === 'fish') {
    const spot = fishingSpot()
    if (spot) startFishing(spot)
  }
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault()
  if (e.repeat) return
  unlockSfx()
  heldKeys.add(key)

  if (state.phase === 'title') {
    if (key === 'c' && continueGame()) {
      sfx.start()
      return
    }
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
  if (key === 'm' && !state.shopOpen) {
    say('알림', toggleMute() ? '소리 끔 (M으로 다시 켜기)' : '소리 켬')
    return
  }
  if (state.shopOpen) {
    const sell = { 1: 'wood', 2: 'fruit', 3: 'fish', 4: 'shell', 5: 'flower' }
    if (key === 'escape' || key === ' ' || key === 'enter') closeShop()
    else if (sell[key]) sellAll(sell[key])
    else if ('qwert'.includes(key) && key.length === 1) buyFurniture('qwert'.indexOf(key))
    return
  }
  if (player.fish) {
    if (key === ' ' || key === 'enter') fishingPress()
    else if (key === 'escape') player.fish = null
    return
  }
  if (key === 'g' && state.room === 'outside' && !player.act) {
    let near = null
    for (const n of npcs) if (!n.hidden && dist(player.x, player.y, n.x, n.y) < 64 && (!near || dist(player.x, player.y, n.x, n.y) < dist(player.x, player.y, near.x, near.y))) near = n
    if (!near) say('알림', '선물할 사람이 가까이 없어요.')
    else if (state.inv.flower <= 0) say('알림', '선물할 꽃이 없어요. 남서쪽 꽃밭에서 꽃을 따 보세요!')
    else {
      faceToward(near.x, near.y)
      giftFlower(near)
    }
    return
  }
  if ((key === ' ' || key === 'enter') && !player.act) doInteract(findNearbyAction())
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))
window.addEventListener('blur', () => heldKeys.clear())

canvas.addEventListener('click', () => {
  unlockSfx()
  if (state.phase === 'title') {
    state.phase = 'intro'
    sfx.click()
  } else if (state.phase === 'intro') {
    state.phase = 'play'
    sfx.start()
  }
})

// ----------------------------------------------------------------- update ----

function updatePlayer(dt) {
  if (toastTimer > 0) toastTimer -= dt
  if (state.shopOpen) return

  // actions (chop / pick) lock movement until they finish
  if (player.act) {
    const a = player.act
    a.t += dt
    if (a.t >= a.dur) {
      player.act = null
      a.onDone && a.onDone()
    }
    player.moving = false
    return
  }
  if (player.fish) {
    updateFishing(dt)
    player.moving = false
    if (held(MOVE_KEYS.left) || held(MOVE_KEYS.right) || held(MOVE_KEYS.up) || held(MOVE_KEYS.down)) {
      if (player.fish.phase !== 'reel') player.fish = null
    }
    return
  }

  let dx = 0
  let dy = 0
  if (held(MOVE_KEYS.left)) dx -= 1
  if (held(MOVE_KEYS.right)) dx += 1
  if (held(MOVE_KEYS.up)) dy -= 1
  if (held(MOVE_KEYS.down)) dy += 1
  player.moving = dx !== 0 || dy !== 0
  player.running = player.moving && heldKeys.has('shift')
  if (player.moving) {
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2
      dy *= Math.SQRT1_2
    }
    const speed = player.running ? RUN_SPEED : WALK_SPEED
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    player.walk += dt * (player.running ? 15 : 10)
    const tx = player.x + dx * speed * dt
    const ty = player.y + dy * speed * dt
    if (state.room === 'outside') {
      if (canStand(world, tx, player.y, PLAYER_HALF)) player.x = tx
      if (canStand(world, player.x, ty, PLAYER_HALF)) player.y = ty
    } else {
      const okX = tx > ROOM_BOUNDS.minX && tx < ROOM_BOUNDS.maxX && !roomBlocked(tx, player.y)
      if (okX) player.x = tx
      const inDoorGap = Math.abs(player.x - ROOM_DOOR_X) < 30
      const maxY = inDoorGap ? ROOM_BOUNDS.maxY + 6 : ROOM_BOUNDS.maxY
      if (ty > ROOM_BOUNDS.minY && ty < maxY && !roomBlocked(player.x, ty)) player.y = ty
    }
  }

  if (state.room === 'house') {
    if (player.y >= ROOM_BOUNDS.maxY + 4 && Math.abs(player.x - ROOM_DOOR_X) < 30) exitHouse()
    return
  }
  const hd = world.buildings[0].door
  if (dy < 0 && tileOf(player.x) === hd.c && tileOf(player.y) === hd.r) {
    enterHouse()
    return
  }

  for (const s of world.shells) {
    if (s.collected) continue
    if (Math.abs(player.x - s.x) < 18 && Math.abs(player.y - 6 - s.y) < 18) {
      s.collected = true
      sfx.pickup()
      giveItem('shell', s.x, s.y)
      say('알림', '조개를 주웠다! (+1 조개)')
    }
  }
}

function updateWorld(dt) {
  if (state.phase !== 'play') return
  state.tod += dt * HOURS_PER_SEC
  if (state.tod >= 24 && !state.shopOpen) sleep(true)
  else if (state.tod >= 24) state.tod = 23.99
  if (state.shopOpen && (state.tod >= SHOP_CLOSE)) {
    state.shopOpen = false
    say('모카', '이제 문 닫을 시간이에요. 내일 또 오세요!')
  }
  for (const n of npcs) updateNpc(n, dt)
  updateAnimals(dt)
  for (const t of world.trees) if (t.shake > 0) t.shake = Math.max(0, t.shake - dt * 1.4)
  for (const p of popups) p.t += dt
  for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 1.6) popups.splice(i, 1)
  for (const r of rings) r.t += dt
  for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t > 1.2) rings.splice(i, 1)
  if (state.room === 'outside') {
    const tx = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W)
    const ty = clamp(player.y - 40 - VIEW_H / 2, 0, WORLD_H - VIEW_H)
    const k = Math.min(1, dt * 7)
    cam.x = lerp(cam.x, tx, k)
    cam.y = lerp(cam.y, ty, k)
  }
}
function updateCamera() {}

// ------------------------------------------------------------------- draw ----

function txt(str, x, y, { font = '13px sans-serif', color = '#fff', align = 'left', stroke } = {}) {
  ctx.font = font
  ctx.textAlign = align
  if (stroke) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = stroke
    ctx.strokeText(str, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}

function panel(x, y, w, h, r = 10, fill = 'rgba(20,28,22,0.72)') {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawItemIcon(kind, x, y) {
  ctx.save()
  ctx.translate(x, y)
  if (kind === 'wood') {
    ctx.fillStyle = '#a8703c'
    ctx.beginPath()
    ctx.roundRect(-7, -4, 14, 8, 3)
    ctx.fill()
    ctx.fillStyle = '#e0b878'
    ctx.beginPath()
    ctx.ellipse(-6, 0, 2.6, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'fruit') {
    ctx.fillStyle = '#e8452e'
    ctx.beginPath()
    ctx.arc(0, 1, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#4aa352'
    ctx.fillRect(-0.5, -7, 1.6, 4)
    ctx.beginPath()
    ctx.ellipse(3, -5, 3, 1.6, -0.4, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'fish') {
    ctx.fillStyle = '#6ab8e8'
    ctx.beginPath()
    ctx.ellipse(-1, 0, 7, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(5, 0)
    ctx.lineTo(10, -4)
    ctx.lineTo(10, 4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#123'
    ctx.fillRect(-5, -1.5, 1.6, 1.6)
  } else if (kind === 'shell') {
    ctx.fillStyle = '#fff3e0'
    ctx.beginPath()
    ctx.moveTo(-7, 5)
    ctx.quadraticCurveTo(-8, -6, 0, -6)
    ctx.quadraticCurveTo(8, -6, 7, 5)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#d29a86'
    ctx.lineWidth = 1
    for (const dx of [-3, 0, 3]) {
      ctx.beginPath()
      ctx.moveTo(0, 5)
      ctx.lineTo(dx, -4)
      ctx.stroke()
    }
  } else if (kind === 'flower') {
    ctx.fillStyle = '#ff8fb0'
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4 - 1, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.arc(0, -1, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawWaterFx(t) {
  const c0 = Math.max(0, tileOf(cam.x) - 1)
  const c1 = Math.min(COLS - 1, tileOf(cam.x + VIEW_W) + 1)
  const r0 = Math.max(0, tileOf(cam.y) - 1)
  const r1 = Math.min(ROWS - 1, tileOf(cam.y + VIEW_H) + 1)
  ctx.lineCap = 'round'
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const ch = world.terrain[r][c]
      if (ch !== 'W' && ch !== 's' && ch !== 'l') continue
      const h = hash(c, r, 5)
      if (h > 0.62) {
        const ph = (t * (0.35 + h * 0.3) + h * 9) % 1
        const a = Math.sin(ph * Math.PI) * (ch === 'W' ? 0.4 : 0.55)
        const x = c * TILE + 3 + ph * 14
        const y = r * TILE + 6 + h * 20
        ctx.strokeStyle = `rgba(255,255,255,${a})`
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + 6, y - 2.4, x + 12, y)
        ctx.stroke()
      }
      if (ch === 's') {
        // foam where the shallows lap against the land
        const land = (cc, rr) => {
          const o = terrainAt(cc, rr)
          return o === 'a' || o === 'g' || o === 'p'
        }
        const wob = Math.sin(t * 1.5 + (c + r) * 0.8) * 2.2
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 1.5 + (c + r) * 0.8)})`
        ctx.lineWidth = 2.6
        const x = c * TILE
        const y = r * TILE
        if (land(c, r + 1)) { ctx.beginPath(); ctx.moveTo(x, y + TILE - 3 - wob); ctx.lineTo(x + TILE, y + TILE - 3 - wob); ctx.stroke() }
        if (land(c, r - 1)) { ctx.beginPath(); ctx.moveTo(x, y + 3 + wob); ctx.lineTo(x + TILE, y + 3 + wob); ctx.stroke() }
        if (land(c + 1, r)) { ctx.beginPath(); ctx.moveTo(x + TILE - 3 - wob, y); ctx.lineTo(x + TILE - 3 - wob, y + TILE); ctx.stroke() }
        if (land(c - 1, r)) { ctx.beginPath(); ctx.moveTo(x + 3 + wob, y); ctx.lineTo(x + 3 + wob, y + TILE); ctx.stroke() }
      }
    }
  }
  ctx.lineCap = 'butt'
  for (const r of rings) {
    const k = r.t / 1.2
    ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.8})`
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.ellipse(r.x, r.y, 4 + k * 20, 2 + k * 9, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawStump(tr) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(tr.x + 2, tr.y + 1, 14, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6b4a2a'
  ctx.beginPath()
  ctx.roundRect(tr.x - 9, tr.y - 14, 18, 15, 3)
  ctx.fill()
  ctx.fillStyle = '#d9b27a'
  ctx.beginPath()
  ctx.ellipse(tr.x, tr.y - 14, 9, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#a9824e'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(tr.x, tr.y - 14, 5, 2, 0, 0, Math.PI * 2)
  ctx.stroke()
}

function npcPose(n) {
  if (n.pose && n.pose.type === 'wave') {
    return { type: 'wave', p: 0 }
  }
  return n.pose
}

function drawNpc(n, t) {
  drawPerson(ctx, n.x, n.y, n.look, {
    facing: n.facing,
    walk: n.walk,
    moving: n.moving,
    t,
    pose: npcPose(n),
    sit: n.sit,
    emote: n.emote,
  })
  if (n.spot && n.spot.act === 'fish' && n.sit && n.state !== 'walk') {
    // line + bobber down in the water
    const tip = rodTip(n.x, n.y - 4, 'down')
    const bx = n.x + 30
    const by = n.y + 34
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.quadraticCurveTo(tip.x + 12, tip.y + 30, bx, by + Math.sin(t * 2 + n.t) * 1.2)
    ctx.stroke()
    ctx.fillStyle = '#e8452e'
    ctx.beginPath()
    ctx.arc(bx, by + Math.sin(t * 2 + n.t) * 1.2, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillRect(bx - 1.4, by - 3 + Math.sin(t * 2 + n.t) * 1.2, 2.8, 2)
  }
}

function drawPlayerSprite(t) {
  let pose = null
  if (player.act) pose = { type: player.act.type, p: clamp(player.act.t / player.act.dur, 0, 1) }
  else if (player.fish) pose = { type: 'fish', p: 0 }
  drawPerson(ctx, player.x, player.y, LOOKS.player, {
    facing: player.facing,
    walk: player.walk,
    moving: player.moving,
    t,
    pose,
    mood: player.fish && player.fish.phase === 'bite' ? 'o' : undefined,
    emote: player.fish && player.fish.phase === 'bite' ? '!' : null,
  })
  const f = player.fish
  if (f) {
    const tip = rodTip(player.x, player.y, player.facing)
    const dip = f.phase === 'bite' ? 4 + Math.sin(t * 40) * 1.5 : Math.sin(t * 2.4) * 1.2
    let bx = f.x
    let by = f.y + dip
    if (f.phase === 'cast') {
      const k = clamp(f.t / 0.5, 0, 1)
      bx = lerp(tip.x, f.x, k)
      by = lerp(tip.y, f.y, k) - Math.sin(k * Math.PI) * 30
    } else if (f.phase === 'reel') {
      const k = clamp(f.t / 0.55, 0, 1)
      bx = lerp(f.x, player.x, k)
      by = lerp(f.y, player.y - 20, k) - Math.sin(k * Math.PI) * 24
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.quadraticCurveTo((tip.x + bx) / 2, Math.max(tip.y, by) + 6, bx, by)
    ctx.stroke()
    if (f.phase !== 'reel' || f.t < 0.4) {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(bx, by, 3.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e8452e'
      ctx.beginPath()
      ctx.arc(bx, by - 1.4, 3.6, Math.PI, 0)
      ctx.fill()
    }
  }
}

const inView = (x, y, m = 90) => x > cam.x - m && x < cam.x + VIEW_W + m && y > cam.y - m - 120 && y < cam.y + VIEW_H + m + 120

function drawOutside(t, tint) {
  ctx.fillStyle = '#2a6db0'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const cx = Math.round(cam.x)
  const cy = Math.round(cam.y)
  ctx.drawImage(ground, cx, cy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H)

  ctx.save()
  ctx.translate(-cx, -cy)
  drawWaterFx(t)
  for (const s of world.shells) if (!s.collected && inView(s.x, s.y, 20)) drawShellSpot(ctx, s, t)
  for (const f of world.flowers) if (!f.picked && inView(f.x, f.y, 20)) drawFlowerSpot(ctx, f, t)

  // everything standing on the ground, back to front
  const items = []
  for (const tr of world.trees) {
    if (inView(tr.x, tr.y, 60)) items.push({ y: tr.y, f: () => (treeActive(tr) ? drawTree(ctx, tr, t) : drawStump(tr)) })
  }
  for (const r of world.rocks) if (inView(r.x, r.y, 40)) items.push({ y: r.y, f: () => drawRock(ctx, r) })
  for (const b of world.buildings) {
    const by = (b.r + b.h) * TILE
    if (inView(b.c * TILE + (b.w * TILE) / 2, by, 200)) items.push({ y: by, f: () => drawBuilding(ctx, b, t, tint.night) })
  }
  for (const p of world.props) if (inView(p.x, p.y, 60)) items.push({ y: p.y, f: () => drawProp(ctx, p, t, tint.night) })
  for (const n of npcs) if (!n.hidden && inView(n.x, n.y, 60)) items.push({ y: n.sortY ?? n.y, f: () => drawNpc(n, t) })
  for (const c of cats) if (inView(c.x, c.y, 40)) items.push({ y: c.y, f: () => { drawCat(ctx, c.x, c.y, c); if (c.emote) drawEmoteSmall(c.x, c.y - 28, c.emote) } })
  for (const c of chickens) if (inView(c.x, c.y, 40)) items.push({ y: c.y, f: () => drawChicken(ctx, c.x, c.y, c) })
  for (const c of crabs) if (inView(c.x, c.y, 40)) items.push({ y: c.y, f: () => drawCrab(ctx, c.x, c.y, c) })
  items.push({ y: player.y, f: () => drawPlayerSprite(t) })
  items.sort((a, b) => a.y - b.y)
  for (const it of items) it.f()

  // butterflies and gulls fly above everything
  for (const b of butterflies) if (inView(b.x, b.y - b.h, 40)) drawButterfly(ctx, b.x, b.y - b.h, { t, seed: b.seed, color: b.color })
  for (const g of gulls) {
    const gx = WORLD_W / 2 + Math.cos(g.a) * 33 * TILE * g.rr
    const gy = WORLD_H / 2 + Math.sin(g.a) * 21.5 * TILE * g.rr - 40
    if (inView(gx, gy, 40)) drawGull(ctx, gx, gy, t, g.seed)
  }

  // floating "+1" popups
  for (const p of popups) {
    const k = p.t / 1.6
    ctx.globalAlpha = 1 - k * k
    txt(p.text, p.x, p.y - k * 28, { font: 'bold 14px sans-serif', color: p.color, align: 'center', stroke: 'rgba(30,20,10,0.85)' })
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // time-of-day tint, then warm glows for lamps and windows
  if (tint.night > 0.01 || tint.col[0] < 255 || tint.col[2] < 255) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = `rgb(${tint.col[0]},${tint.col[1]},${tint.col[2]})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.globalCompositeOperation = 'source-over'
  }
  if (tint.night > 0.12) {
    ctx.save()
    ctx.translate(-cx, -cy)
    ctx.globalCompositeOperation = 'lighter'
    const a = clamp(tint.night * 1.5, 0, 1)
    for (const p of world.props) if (p.kind === 'lamp' && inView(p.x, p.y, 120)) drawGlow(ctx, p.x, p.y - 56, 96, 0.5 * a)
    for (const b of world.buildings) {
      const bx = b.c * TILE + (b.w * TILE) / 2
      if (inView(bx, (b.r + b.h) * TILE, 160)) drawGlow(ctx, bx, (b.r + b.h) * TILE - 26, 120, 0.3 * a)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  }
}

function drawEmoteSmall(x, y, kind) {
  ctx.fillStyle = kind === '♥' ? '#ff5a7a' : '#fff'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(kind, x, y)
}

function drawHouse(t) {
  const { ox, oy, w, h } = ROOM
  const night = skyTint(state.tod)
  ctx.fillStyle = '#2a2018'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  ctx.save()
  ctx.translate(ox, oy)

  // back wall
  const wallG = ctx.createLinearGradient(0, 0, 0, 4 * TILE)
  wallG.addColorStop(0, '#f0dcb4')
  wallG.addColorStop(1, '#e6cf9c')
  ctx.fillStyle = wallG
  ctx.fillRect(0, 0, w, 4 * TILE)
  ctx.fillStyle = 'rgba(180,130,80,0.18)'
  for (let x = 16; x < w; x += 48) ctx.fillRect(x, 0, 3, 4 * TILE)
  ctx.fillStyle = '#b98c56'
  ctx.fillRect(0, 4 * TILE - 12, w, 12) // skirting board
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(0, 4 * TILE, w, 6)

  // floor
  for (let r = 4; r < 14; r++) {
    for (let c = 0; c < 24; c++) {
      ctx.fillStyle = (c + r) % 2 ? '#d1a96e' : '#c9a164'
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
    }
  }
  ctx.strokeStyle = 'rgba(100,70,30,0.3)'
  ctx.lineWidth = 1
  for (let r = 4; r <= 14; r++) {
    ctx.beginPath()
    ctx.moveTo(0, r * TILE)
    ctx.lineTo(w, r * TILE)
    ctx.stroke()
  }

  // side walls
  ctx.fillStyle = '#8a6a44'
  ctx.fillRect(0, 0, 14, h)
  ctx.fillRect(w - 14, 0, 14, h)

  // window with a real sky
  const wx = 470
  const wy = 26
  const sky = ctx.createLinearGradient(0, wy, 0, wy + 72)
  const dayK = 1 - night.night
  const topC = night.night > 0.5 ? '#16204a' : night.night > 0.15 ? '#c86a58' : '#7ec8f0'
  const botC = night.night > 0.5 ? '#2a3a70' : night.night > 0.15 ? '#ffb07a' : '#cdeeff'
  sky.addColorStop(0, topC)
  sky.addColorStop(1, botC)
  ctx.fillStyle = '#6a4222'
  ctx.fillRect(wx - 6, wy - 6, 104, 84)
  ctx.fillStyle = sky
  ctx.fillRect(wx, wy, 92, 72)
  if (night.night > 0.5) {
    ctx.fillStyle = '#fff'
    for (const [sx, sy] of [[12, 12], [40, 22], [70, 10], [60, 40], [20, 50]]) ctx.fillRect(wx + sx, wy + sy, 2, 2)
    ctx.fillStyle = '#fff6c8'
    ctx.beginPath()
    ctx.arc(wx + 66, wy + 24, 9, 0, Math.PI * 2)
    ctx.fill()
  } else if (dayK > 0.4) {
    ctx.fillStyle = '#fff3a8'
    ctx.beginPath()
    ctx.arc(wx + 24, wy + 22, 9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#4a9a4a'
  ctx.fillRect(wx, wy + 56, 92, 16)
  ctx.fillStyle = '#6a4222'
  ctx.fillRect(wx + 44, wy, 4, 72)
  ctx.fillRect(wx, wy + 34, 92, 4)
  ctx.fillStyle = '#c0553f'
  ctx.fillRect(wx - 10, wy - 8, 12, 90) // curtains
  ctx.fillRect(wx + 90, wy - 8, 12, 90)

  // a picture frame on the wall
  ctx.fillStyle = '#6a4222'
  ctx.fillRect(330, 34, 56, 44)
  ctx.fillStyle = '#9fd6ff'
  ctx.fillRect(335, 39, 46, 34)
  ctx.fillStyle = '#5e9e52'
  ctx.beginPath()
  ctx.moveTo(335, 73)
  ctx.quadraticCurveTo(358, 52, 381, 73)
  ctx.fill()

  // bed
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(BED.x - 2, BED.y + BED.h - 6, BED.w + 6, 10)
  ctx.fillStyle = '#7a4f26'
  ctx.beginPath()
  ctx.roundRect(BED.x, BED.y, BED.w, BED.h, 6)
  ctx.fill()
  ctx.fillStyle = '#f4ead4'
  ctx.beginPath()
  ctx.roundRect(BED.x + 8, BED.y + 10, BED.w - 16, 26, 8)
  ctx.fill()
  ctx.fillStyle = '#5a8ad0'
  ctx.beginPath()
  ctx.roundRect(BED.x + 6, BED.y + 38, BED.w - 12, BED.h - 46, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(BED.x + 6, BED.y + 62, BED.w - 12, 4)
  ctx.fillRect(BED.x + 6, BED.y + 78, BED.w - 12, 4)

  const own = (id) => state.furniture.has(id)
  if (own('rug')) {
    ctx.fillStyle = '#c4553f'
    ctx.beginPath()
    ctx.ellipse(384, 318, 130, 54, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f2d8a0'
    ctx.beginPath()
    ctx.ellipse(384, 318, 108, 40, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#d1795a'
    ctx.beginPath()
    ctx.ellipse(384, 318, 80, 28, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#f2d8a0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(384, 318, 56, 18, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (own('shelf')) {
    const s = ROOM_SOLIDS.shelf
    ctx.fillStyle = '#7a4a22'
    ctx.fillRect(s.x - 4, 40, s.w + 8, 116)
    ctx.fillStyle = '#5c3818'
    for (const y of [40, 80, 118]) ctx.fillRect(s.x - 4, y, s.w + 8, 5)
    const cols = ['#c4553f', '#3f6fb8', '#e8c860', '#5aa86a', '#9a5ac4', '#d1795a']
    for (let row = 0; row < 3; row++) {
      let bx = s.x
      for (let i = 0; i < 7; i++) {
        const bw = 9 + ((i * 5 + row * 3) % 6)
        ctx.fillStyle = cols[(i + row * 2) % cols.length]
        ctx.fillRect(bx, 46 + row * 38 + (row === 2 ? 0 : 2), bw, 30 - (i % 3) * 3)
        bx += bw + 2
        if (bx > s.x + s.w - 12) break
      }
    }
  }
  if (own('clock')) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(640, 56, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = '#6a4a8a'
    ctx.stroke()
    const hr = state.tod % 12
    const mn = (state.tod % 1) * 60
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(640, 56)
    ctx.lineTo(640 + Math.sin((hr / 12) * Math.PI * 2) * 12, 56 - Math.cos((hr / 12) * Math.PI * 2) * 12)
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(640, 56)
    ctx.lineTo(640 + Math.sin((mn / 60) * Math.PI * 2) * 18, 56 - Math.cos((mn / 60) * Math.PI * 2) * 18)
    ctx.stroke()
  }

  // y-sorted: lamp + plant + player
  const stuff = []
  if (own('lamp')) {
    stuff.push({ y: 176, f: () => {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.beginPath()
      ctx.ellipse(641, 176, 16, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#5a4a3a'
      ctx.fillRect(639, 100, 4, 76)
      ctx.fillRect(628, 172, 26, 4)
      ctx.fillStyle = '#f6dc8a'
      ctx.beginPath()
      ctx.moveTo(622, 104)
      ctx.lineTo(660, 104)
      ctx.lineTo(652, 78)
      ctx.lineTo(630, 78)
      ctx.closePath()
      ctx.fill()
    } })
  }
  if (own('pot')) {
    stuff.push({ y: 176, f: () => {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.beginPath()
      ctx.ellipse(700, 176, 18, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c4553f'
      ctx.beginPath()
      ctx.moveTo(686, 150)
      ctx.lineTo(714, 150)
      ctx.lineTo(710, 176)
      ctx.lineTo(690, 176)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#3a9a4a'
      for (const [lx, ly, rot] of [[-12, -24, -0.6], [0, -34, 0], [12, -24, 0.6], [-6, -18, -0.3], [8, -16, 0.3]]) {
        ctx.save()
        ctx.translate(700, 150)
        ctx.rotate(rot)
        ctx.beginPath()
        ctx.ellipse(lx * 0.5, ly * 0.5 - 6, 6, 16, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } })
  }
  stuff.push({ y: player.y, f: () => drawPlayerSprite(t) })
  stuff.sort((a, b) => a.y - b.y)
  for (const s of stuff) s.f()

  // exit door in the bottom wall
  ctx.fillStyle = '#4a2f1a'
  ctx.fillRect(ROOM_DOOR_X - 30, h - 8, 60, 8)
  ctx.fillStyle = '#d9b76a'
  ctx.fillRect(ROOM_DOOR_X - 24, h - 6, 48, 6)
  ctx.fillStyle = '#9a4a3a'
  ctx.beginPath()
  ctx.roundRect(ROOM_DOOR_X - 24, h - 30, 48, 14, 4)
  ctx.fill()

  // all five items: a few sparkles
  if (state.furniture.size === FURNITURE.length) {
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.4 + i * 0.13) % 1
      ctx.fillStyle = `rgba(255,240,170,${Math.sin(ph * Math.PI)})`
      ctx.fillRect(120 + ((i * 83) % 520), 200 + ((i * 47) % 200) - ph * 30, 3, 3)
    }
  }
  ctx.restore()

  // lamp glow / night dim
  if (night.night > 0.2) {
    ctx.fillStyle = `rgba(20,24,70,${night.night * 0.28})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    if (own('lamp')) {
      ctx.globalCompositeOperation = 'lighter'
      drawGlow(ctx, ox + 641, oy + 100, 150, 0.5)
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

function drawHud() {
  ctx.textBaseline = 'alphabetic'
  const task = state.task
  const taskLine = task.done ? '오늘의 부탁: 완료!' : `오늘의 부탁: ${ITEM_LABEL[task.item]} ${task.amount}개 → 게시판 · 보상 ${task.bells}벨`
  ctx.font = '12px sans-serif'
  const w = Math.max(330, ctx.measureText(taskLine).width + 28)
  panel(10, 10, w, 80)
  const h = state.tod
  const sun = h >= 6 && h < 19.5
  // sun / moon badge
  ctx.fillStyle = sun ? '#ffd24a' : '#e8eaff'
  ctx.beginPath()
  ctx.arc(28, 30, 7, 0, Math.PI * 2)
  ctx.fill()
  if (!sun) {
    ctx.fillStyle = 'rgba(20,28,40,0.9)'
    ctx.beginPath()
    ctx.arc(31, 28, 6, 0, Math.PI * 2)
    ctx.fill()
  }
  txt(`Day ${state.day}  ${clockText(state.tod)}`, 44, 35, { font: 'bold 14px sans-serif' })
  txt(`벨 ${state.bells}`, w - 12, 35, { font: 'bold 14px sans-serif', color: '#ffe066', align: 'right' })
  ITEMS.forEach((k, i) => {
    const x = 22 + i * 62
    drawItemIcon(k, x, 54)
    txt(String(state.inv[k]), x + 12, 58, { font: 'bold 13px sans-serif' })
  })
  txt(taskLine, 20, 81, { font: '12px sans-serif', color: task.done ? '#9fe8a8' : '#ffe066' })
  ctx.textAlign = 'right'
  txt(`가구 ${state.furniture.size}/${FURNITURE.length}`, VIEW_W - 12, 22, { font: '12px sans-serif', align: 'right', stroke: 'rgba(0,0,0,0.5)' })
}

function drawMinimap(t) {
  if (state.room !== 'outside') return
  const s = 3
  const w = COLS * s
  const h = ROWS * s
  const x = VIEW_W - w - 12
  const y = VIEW_H - h - 12
  ctx.fillStyle = 'rgba(10,20,30,0.75)'
  ctx.beginPath()
  ctx.roundRect(x - 5, y - 5, w + 10, h + 10, 8)
  ctx.fill()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(minimap, x, y, w, h)
  ctx.imageSmoothingEnabled = true
  const dot = (px, py, color, r = 2.4) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + (px / TILE) * s, y + (py / TILE) * s, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const n of npcs) if (!n.hidden) dot(n.x, n.y, n.look.shirt, 2.2)
  const b = world.props.find((p) => p.kind === 'board')
  dot(b.x, b.y, '#ffe066', 2)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.strokeRect(x + (cam.x / TILE) * s, y + (cam.y / TILE) * s, (VIEW_W / TILE) * s, (VIEW_H / TILE) * s)
  const blink = 0.6 + 0.4 * Math.sin(t * 6)
  ctx.globalAlpha = blink
  dot(player.x, player.y, '#ff4a4a', 3.2)
  ctx.globalAlpha = 1
}

function drawPrompt(a) {
  if (state.shopOpen || !a || toastTimer > TOAST_DURATION - 0.15) return
  let label = `[스페이스] ${a.label}`
  if (a.type === 'door') label = `[스페이스/↑] ${a.label}`
  ctx.font = 'bold 12px sans-serif'
  const hasGift = a.type === 'npc' && state.inv.flower > 0
  const full = hasGift ? `${label}  ·  [G] 꽃 선물` : label
  const w = ctx.measureText(full).width + 18
  let x = player.x - w / 2
  let y = player.y - 66
  if (state.room === 'outside') {
    x -= cam.x
    y -= cam.y
  } else {
    x += ROOM.ox
    y += ROOM.oy
  }
  x = clamp(x, 6, VIEW_W - w - 6)
  y = Math.max(y, 28)
  panel(x, y - 16, w, 22, 6, 'rgba(0,0,0,0.7)')
  txt(full, x + w / 2, y, { font: 'bold 12px sans-serif', align: 'center' })
}

function drawFishingHint() {
  const f = player.fish
  if (!f) return
  let msg = ''
  if (f.phase === 'cast') msg = '낚싯줄을 던지는 중…'
  else if (f.phase === 'wait') msg = '찌를 지켜보세요… (움직이면 취소)'
  else if (f.phase === 'bite') msg = '지금이에요! 스페이스!'
  else msg = '끌어올리는 중!'
  const sx = state.room === 'outside' ? player.x - cam.x : player.x + ROOM.ox
  const sy = state.room === 'outside' ? player.y - cam.y : player.y + ROOM.oy
  const bite = f.phase === 'bite'
  ctx.font = 'bold 13px sans-serif'
  const w = ctx.measureText(msg).width + 22
  panel(sx - w / 2, sy - 100, w, 24, 8, bite ? 'rgba(210,60,40,0.9)' : 'rgba(0,0,0,0.7)')
  txt(msg, sx, sy - 83, { font: 'bold 13px sans-serif', align: 'center' })
}

function drawToast() {
  if (toastTimer <= 0) return
  const w = 600
  const h = 54
  const x = 14
  const y = VIEW_H - h - 12
  ctx.globalAlpha = Math.min(1, toastTimer * 3)
  panel(x, y, w, h, 10, 'rgba(14,18,16,0.85)')
  txt(toastSpeaker, x + 14, y + 20, { font: 'bold 13px sans-serif', color: '#ffe066' })
  ctx.font = '13px sans-serif'
  let line = toastText
  while (ctx.measureText(line).width > w - 28 && line.length > 4) line = line.slice(0, -1)
  if (line.length < toastText.length) {
    // too long for one line: wrap the rest onto a second line
    const rest = toastText.slice(line.length)
    txt(line, x + 14, y + 38, { font: '13px sans-serif' })
    txt(rest, x + 14, y + 53, { font: '13px sans-serif' })
    ctx.globalAlpha = 1
    return
  }
  txt(line, x + 14, y + 38, { font: '13px sans-serif' })
  ctx.globalAlpha = 1
}

function drawShopPanel() {
  if (!state.shopOpen) return
  const w = 660
  const h = 340
  const x = (VIEW_W - w) / 2
  const y = (VIEW_H - h) / 2
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  ctx.fillStyle = 'rgba(30,22,14,0.97)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 12)
  ctx.fill()
  ctx.strokeStyle = '#c9a86a'
  ctx.lineWidth = 2.4
  ctx.stroke()
  txt('모카의 상점', x + 22, y + 32, { font: 'bold 17px sans-serif', color: '#ffe066' })
  txt(`보유 벨 ${state.bells}`, x + w - 22, y + 32, { font: 'bold 14px sans-serif', color: '#ffe066', align: 'right' })
  txt('판매 (숫자 키 · 전부 팔기)', x + 22, y + 64, { font: 'bold 13px sans-serif', color: '#e8d8b0' })
  ITEMS.forEach((k, i) => {
    const yy = y + 92 + i * 36
    ctx.fillStyle = state.inv[k] > 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'
    ctx.beginPath()
    ctx.roundRect(x + 16, yy - 18, 292, 30, 6)
    ctx.fill()
    drawItemIcon(k, x + 36, yy - 3)
    txt(`[${i + 1}] ${ITEM_LABEL[k]}`, x + 54, yy + 2, { font: 'bold 13px sans-serif', color: state.inv[k] > 0 ? '#fff' : '#8a8a8a' })
    txt(`${state.inv[k]}개 · 개당 ${SELL_PRICE[k]}벨`, x + 300, yy + 2, { font: '12px sans-serif', color: state.inv[k] > 0 ? '#cfe8c0' : '#777', align: 'right' })
  })
  txt('구매 (QWERT 키)', x + 336, y + 64, { font: 'bold 13px sans-serif', color: '#e8d8b0' })
  const buyKeys = ['Q', 'W', 'E', 'R', 'T']
  FURNITURE.forEach((f, i) => {
    const yy = y + 92 + i * 36
    const owned = state.furniture.has(f.id)
    ctx.fillStyle = owned ? 'rgba(120,200,120,0.12)' : 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.roundRect(x + 330, yy - 18, 314, 30, 6)
    ctx.fill()
    ctx.fillStyle = f.color
    ctx.beginPath()
    ctx.roundRect(x + 340, yy - 11, 16, 16, 4)
    ctx.fill()
    txt(`[${buyKeys[i]}] ${f.name}`, x + 364, yy + 2, { font: 'bold 13px sans-serif', color: owned ? '#8a9a8a' : '#fff' })
    txt(owned ? '보유 중' : `${f.price}벨`, x + 634, yy + 2, { font: '12px sans-serif', color: owned ? '#9fe8a8' : state.bells >= f.price ? '#ffe066' : '#c88', align: 'right' })
  })
  txt('ESC / 스페이스: 닫기', x + w - 20, y + h - 14, { font: '11px sans-serif', color: '#bbb', align: 'right' })
  // Moka behind the counter
  drawPerson(ctx, x + 70, y + h - 6, LOOKS.moka, { facing: 'down', t: performance.now() / 1000, pose: { type: 'wave', p: 0 } })
}

function drawTitleText(title, subtitle, prompt, cy) {
  const t = performance.now() / 1000
  ctx.textAlign = 'center'
  ctx.font = 'bold 48px sans-serif'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#2f6f4a'
  ctx.lineWidth = 8
  ctx.strokeText(title, VIEW_W / 2, cy)
  ctx.fillStyle = '#fff6d6'
  ctx.fillText(title, VIEW_W / 2, cy)
  ctx.font = 'bold 17px sans-serif'
  ctx.fillStyle = '#2a5a6a'
  ctx.fillText(subtitle, VIEW_W / 2, cy + 34)
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.4
  ctx.font = 'bold 18px sans-serif'
  ctx.fillStyle = '#b0502a'
  ctx.fillText(prompt, VIEW_W / 2, cy + 78)
  ctx.globalAlpha = 1
}

function drawTitle() {
  const W = VIEW_W
  const H = VIEW_H
  const t = performance.now() / 1000
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#7ec8f0')
  sky.addColorStop(0.55, '#cdeeff')
  sky.addColorStop(1, '#ffe9c4')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,240,170,0.35)'
  ctx.beginPath()
  ctx.arc(W - 150, 120, 70 + Math.sin(t * 1.5) * 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff3b0'
  ctx.beginPath()
  ctx.arc(W - 150, 120, 44, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (const [bx, by, s, sp] of [[120, 100, 1, 9], [470, 70, 0.75, 6], [760, 170, 0.6, 12]]) {
    const cx = ((bx + t * sp) % (W + 200)) - 100
    for (const [dx, dy, r] of [[0, 0, 26], [28, 6, 20], [-28, 6, 20], [10, -12, 20]]) {
      ctx.beginPath()
      ctx.arc(cx + dx * s, by + dy * s, r * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const seaY = H * 0.6
  const sea = ctx.createLinearGradient(0, seaY, 0, H)
  sea.addColorStop(0, '#4aa3d8')
  sea.addColorStop(1, '#2f6fa8')
  ctx.fillStyle = sea
  ctx.fillRect(0, seaY, W, H - seaY)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    const wy = seaY + 26 + i * 32
    const off = (t * (14 + i * 3) + i * 70) % 160
    for (let x = -160 + off; x < W; x += 160) {
      ctx.beginPath()
      ctx.moveTo(x, wy)
      ctx.quadraticCurveTo(x + 20, wy - 5, x + 40, wy)
      ctx.stroke()
    }
  }
  const ix = W / 2
  const iy = seaY + 64
  ctx.fillStyle = '#e8d08a'
  ctx.beginPath()
  ctx.ellipse(ix, iy + 14, 380, 66, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5e9e52'
  ctx.beginPath()
  ctx.ellipse(ix, iy, 340, 54, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillRect(ix - 340, iy - 1, 680, 14)
  ctx.beginPath()
  ctx.ellipse(ix, iy + 12, 340, 24, 0, 0, Math.PI)
  ctx.fill()

  for (const [tx, s, fruit] of [[-290, 1.2, true], [-220, 0.9, false], [250, 1.25, true], [190, 0.85, false]]) {
    drawTree(ctx, { x: ix + tx, y: iy - 8, size: s, seed: tx, shake: 0, fruiting: fruit, hasFruit: fruit, kind: 'orange' }, t)
  }
  // the little cottage
  ctx.save()
  ctx.translate(ix + 150, iy - 128)
  ctx.scale(0.85, 0.85)
  drawBuilding(ctx, { id: 'h', kind: 'house', c: 0, r: 0, w: 5, h: 3, door: { c: 2, r: 3 }, wall: '#f2dcb0', roof: '#c4553f', label: '' }, t, 0)
  ctx.restore()

  // the cast
  const hop = Math.abs(Math.sin(t * 2.4)) * 3
  const people = [
    [ix - 150, LOOKS.tori, 0, 'down'],
    [ix - 60, LOOKS.player, hop, 'down'],
    [ix + 30, LOOKS.mei, 0, 'down'],
    [ix + 110, LOOKS.moka, 0, 'down'],
  ]
  for (const [px, look, h, facing] of people) {
    ctx.save()
    ctx.translate(px, iy + 6 - h)
    ctx.scale(2.1, 2.1)
    drawPerson(ctx, 0, 0, look, { facing, t, moving: look === LOOKS.player, walk: t * 5, pose: look === LOOKS.mei ? { type: 'wave', p: 0 } : null })
    ctx.restore()
  }
  drawTitleText('아늑한 섬 생활', '커다란 섬을 거닐며 낚시하고, 꽃을 따고, 이웃과 친해지는 느긋한 하루', '클릭 또는 스페이스를 눌러 시작', 130)
  const sv = readSave()
  if (sv) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 17px sans-serif'
    ctx.fillStyle = '#2f6f4a'
    ctx.fillText(`C 키: 이어하기 (${sv.day}일차)`, VIEW_W / 2, VIEW_H - 28)
  }
}

function drawIntro() {
  ctx.fillStyle = '#1c2a1e'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  txt('섬에서의 하루', VIEW_W / 2, 74, { font: 'bold 22px sans-serif', color: '#ffe066', align: 'center' })
  const lines = [
    '승리나 패배는 없어요. 커다란 섬에서 느긋하게 하루하루를 보내는 게임이에요.',
    '나무를 베고 과일을 따고, 물가에서 낚시하고, 꽃밭의 꽃과 해변의 조개를 모아보세요.',
    '상점의 모카에게 팔아서 번 벨로 가구 5종을 사서 집을 꾸며보세요.',
    '토리·메이·모카·보리 할아버지는 섬을 돌아다니며 각자의 하루를 보내요. 꽃을 선물하면 친해져요!',
    '광장 게시판의 "오늘의 부탁"을 들어주면 보너스 벨! 해가 지면 이웃들은 집에 들어가요.',
    '집 침대에서 잠들면 다음 날이 되고, 나무·꽃·조개가 다시 채워져요.',
    '',
    '이동: 방향키/WASD (Shift = 달리기) · 스페이스 = 상호작용 · G = 꽃 선물 · 지도는 오른쪽 아래',
    '낚시: 물가를 바라보고 스페이스 → 찌가 쑥 들어갈 때 스페이스!',
  ]
  lines.forEach((l, i) => txt(l, VIEW_W / 2, 124 + i * 30, { font: '15px sans-serif', align: 'center' }))
  txt('클릭 또는 스페이스로 시작', VIEW_W / 2, VIEW_H - 40, { font: 'bold 15px sans-serif', color: '#ffe066', align: 'center' })
}

function render(t) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)
  if (state.phase === 'title') return drawTitle()
  if (state.phase === 'intro') return drawIntro()
  if (state.room === 'outside') drawOutside(t, skyTint(state.tod))
  else drawHouse(t)
  const nearby = findNearbyAction()
  drawFishingHint()
  drawHud()
  drawMinimap(t)
  drawPrompt(nearby)
  drawToast()
  drawShopPanel()
}


// ---- 저장 / 이어하기: 15초마다, 하루가 바뀔 때, 창을 닫을 때 자동 저장 ----
const SAVE_KEY = 'island-life-save-v1'
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    const d = raw ? JSON.parse(raw) : null
    return d && d.inv && d.friend && d.day >= 1 ? d : null
  } catch {
    return null
  }
}
function saveGame() {
  if (state.phase !== 'play') return
  try {
    const outside = state.room === 'outside'
    const b = world.buildings[0]
    const pos = outside ? { x: player.x, y: player.y } : { x: footX(b.door.c), y: footY(b.door.r) + 4 }
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        day: state.day, tod: state.tod, bells: state.bells, inv: state.inv, furniture: [...state.furniture],
        furnitureCelebrated: state.furnitureCelebrated, task: state.task, fishLeft: state.fishLeft,
        friend: state.friend, rewarded: state.rewarded, x: pos.x, y: pos.y,
      }),
    )
  } catch { /* 저장 공간 없음 */ }
}
function continueGame() {
  const d = readSave()
  if (!d) return false
  state.day = d.day
  state.tod = d.tod
  state.bells = d.bells
  state.inv = { wood: 0, fruit: 0, fish: 0, shell: 0, flower: 0, ...d.inv }
  state.furniture = new Set(d.furniture || [])
  state.furnitureCelebrated = !!d.furnitureCelebrated
  state.task = d.task || newTask()
  state.fishLeft = d.fishLeft ?? 8
  state.friend = { tori: 0, mei: 0, moka: 0, bori: 0, ...d.friend }
  state.rewarded = d.rewarded || {}
  state.room = 'outside'
  state.shopOpen = false
  player.x = d.x
  player.y = d.y
  player.act = null
  player.fish = null
  state.phase = 'play'
  snapCamera()
  return true
}
setInterval(saveGame, 15000)
window.addEventListener('beforeunload', saveGame)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame() })

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  if (state.phase === 'play') {
    updatePlayer(dt)
    updateWorld(dt)
  }
  render(time / 1000)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
