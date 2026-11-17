import { sfx, unlockSfx, toggleMute } from './sfx.js'

const canvas = document.getElementById('game')
canvas.width = 900
canvas.height = 600
const ctx = canvas.getContext('2d')

const TAU = Math.PI * 2
function angleDelta(from, to) {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
function deg(r) { return (r * 180) / Math.PI }
function rad(d) { return (d * Math.PI) / 180 }

// Piecewise-linear speed-vs-sail-angle curve: 0deg is pointed straight into
// the wind ("in irons", barely any drive), ~90deg (beam reach) is fastest,
// and dead downwind (180deg) is slower again - a simplified but real shape
// for how a sailboat's speed depends on its angle to the wind.
function lerpTable(x, table) {
  if (x <= table[0][0]) return table[0][1]
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i]
    const [x1, y1] = table[i + 1]
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0)
      return y0 + (y1 - y0) * t
    }
  }
  return table[table.length - 1][1]
}
const SAIL_CURVE = [
  [0, 0.05],
  [30, 0.1],
  [45, 0.55],
  [70, 0.95],
  [90, 1.0],
  [120, 0.9],
  [150, 0.75],
  [180, 0.55],
]

const ISLANDS = [
  { x: 380, y: 120, r: 55 },
  { x: -150, y: -80, r: 50 },
]

// Ports sit just outside the islands' coastline (plus one in open water near
// the start) so a pier can be drawn jutting out from solid ground without
// overlapping the island collision circle.
const PORTS = [
  {
    id: 'home', x: 60, y: 300, name: '기항지',
    mult: { 목재: 1.0, 향신료: 1.35, 곡물: 0.7, 도자기: 1.3, 모피: 1.15 },
    npc: { name: '마르코', title: '부두장', skin: '#e0b48c', hat: '#3b5b8c', hair: '#7a7a7a' },
  },
  {
    id: 'north', x: 380, y: 200, name: '북쪽 항구',
    mult: { 목재: 0.65, 향신료: 1.2, 곡물: 1.2, 도자기: 0.8, 모피: 1.1 },
    npc: { name: '이사벨라', title: '상인 길드장', skin: '#f0cfae', hat: '#a03a5a', hair: '#3a2418' },
  },
  {
    id: 'west', x: -150, y: -5, name: '서쪽 항구',
    mult: { 목재: 1.3, 향신료: 0.7, 곡물: 1.25, 도자기: 1.05, 모피: 0.75 },
    npc: { name: '하루', title: '선술집 주인', skin: '#d9a878', hat: '#6a5a2a', hair: '#1c1c24' },
  },
]
const DOCK_RADIUS = 42
// 상품: base는 기준 시세. 항구마다 mult가 달라 싼 곳에서 사서 비싼 곳에 팔면 차익이 남는다.
const GOODS = [
  { id: '목재', icon: '🪵', base: 30 },
  { id: '향신료', icon: '🌶️', base: 80 },
  { id: '곡물', icon: '🌾', base: 20 },
  { id: '도자기', icon: '🏺', base: 60 },
  { id: '모피', icon: '🦊', base: 100 },
]
const PRICE_IMPACT = 0.03 // 한 개 사고팔 때마다 시세가 움직이는 비율
const MAX_REP = 9
const REP_PER_LEVEL = 3
const UPGRADES = [
  { id: 'sail', name: '돛 강화', icon: '⛵', max: 3, costs: [180, 360, 640], desc: (lv) => `속도 +${lv * 8}% → +${(lv + 1) * 8}%` },
  { id: 'hull', name: '선체 보강', icon: '🛡️', max: 3, costs: [150, 300, 500], desc: (lv) => `최대 선체 ${100 + lv * 25} → ${125 + lv * 25}` },
  { id: 'hold', name: '화물칸 확장', icon: '📦', max: 3, costs: [120, 240, 420], desc: (lv) => `적재량 ${6 + lv * 4} → ${10 + lv * 4}` },
]
const REPAIR_COST_PER_HP = 2
const STORM_HULL_DAMAGE = 2.2 // 태풍 안에서 초당 선체 피해
const ISLAND_HIT_DAMAGE = 5

const START = { x: 0, y: 300 }
// A loop course: checkpoint 2 sits almost directly upwind of checkpoint 1
// (wind blows from the north), forcing the player to tack rather than
// just point-and-go the whole way. FINISH closes the loop back at START.
const CHECKPOINTS = [
  { x: 280, y: 300, label: '1' },
  { x: 280, y: -50, label: '2' },
  { x: -80, y: -220, label: '3' },
  { x: -320, y: 150, label: '4' },
  { x: 0, y: 300, label: 'FINISH' },
]

const BASE_WIND_FROM = 0 // degrees; wind blows from the north, toward the south
const WIND_OSC_AMOUNT = 20
const WIND_OSC_RATE = 0.06

// Typhoons: periodic moving storms. Inside one, the wind swings wildly
// (so sail trim keeps getting blown off), overall speed is dragged down
// regardless of trim, and the boat gets buffeted off its heading. Carrying
// cargo through one risks losing it overboard. A wider warn ring lets the
// player see one coming and route around it.
const TYPHOON_RADIUS = 130
const TYPHOON_WARN_RADIUS = 260
const TYPHOON_LIFETIME = 40
const TYPHOON_FIRST_AT = 16
const TYPHOON_INTERVAL = 42
const TYPHOON_WIND_CHAOS = rad(130) // extra wind-direction swing while inside
const TYPHOON_SPEED_DRAG = 0.6 // overall speed multiplier while inside, on top of sail trim
const TYPHOON_GUST_STRENGTH = 55 // px/s of chaotic buffeting drift while inside
const TYPHOON_PULL_STRENGTH = 25 // px/s drawing the boat toward the eye, so it can't just drift out
const TYPHOON_SPAWN_BOUNDS = { minX: -380, maxX: 420, minY: -260, maxY: 340 }
const CARGO_LOSS_CHECK_INTERVAL = 4
const CARGO_LOSS_CHANCE = 0.25

const BASE_SPEED = 150
const TURN_RATE = 1.6
const BOAT_RADIUS = 14
const CHECKPOINT_RADIUS = 45

const BEST_TIME_KEY = 'sailing-sim-best-time'

function readBestTime() {
  try {
    const v = localStorage.getItem(BEST_TIME_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
function writeBestTime(v) {
  try {
    localStorage.setItem(BEST_TIME_KEY, String(v))
  } catch {
    // private mode / blocked storage - best time just won't persist
  }
}

function makeInitialState() {
  return {
    phase: 'racing', // 'racing' | 'finished'
    boat: { x: START.x, y: START.y, heading: Math.PI / 2, speed: 0 },
    wake: [],
    checkpointIndex: 0,
    elapsed: 0,
    windTime: 0,
    finishTime: null,
    isNewBest: false,
    gold: 150,
    hull: 100,
    upgrades: { sail: 0, hull: 0, hold: 0 },
    hold: {}, // 상품 id -> 수량
    market: makeMarket(),
    known: {}, // 방문/소문으로 알게 된 항구별 시세 { portId: { good: price } }
    rep: { home: 0, north: 0, west: 0 },
    offers: {}, // 항구별 의뢰 제안
    contract: null, // { good, qty, toId, reward, fromId }
    hitCooldown: 0,
    ui: null, // 항구 메뉴 { portId, tab, sel, say, sayAt, talked, rumorIdx }
    dockedPortId: null,
    toast: null, // { text, until(실제 시간 초) }
    typhoons: [],
    nextTyphoonAt: TYPHOON_FIRST_AT,
    activeTyphoon: null,
    wasInStorm: false,
    stormCargoTimer: 0,
  }
}
let state = makeInitialState()
state.phase = 'title' // 첫 화면에서는 시작 입력을 기다린다 (R 재시작은 바로 레이스)

function startFromTitle() {
  if (state.phase !== 'title') return false
  state.phase = 'racing'
  sfx.start()
  showToast('항구(⚓)에 정박하고 E를 누르면 시장·대화·정비 메뉴가 열려요')
  return true
}

let lastResetPress = -9999
const heldKeys = new Set()
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  unlockSfx()
  if (state.phase === 'title') {
    if (!e.repeat && key.length === 1 || key === 'enter' || key.startsWith('arrow')) startFromTitle()
    return
  }
  if (state.ui) { handleMenuKey(e, key); return }
  if (key === 'e' && !e.repeat && state.phase === 'racing' && state.dockedPortId) { openPort(state.dockedPortId); return }
  heldKeys.add(key)
  if (key === 'm' && !e.repeat) showToast(toggleMute() ? '소리 끔 (M으로 다시 켜기)' : '소리 켬')
  if (key === 'r' && !e.repeat) {
    // 진행 중에 실수로 눌러 기록이 날아가지 않도록 한 번 더 확인한다
    const now = performance.now()
    if (state.phase === 'finished' || state.elapsed < 3 || now - lastResetPress < 2000) {
      state = makeInitialState()
      lastResetPress = -9999
    } else {
      lastResetPress = now
      showToast('R을 한 번 더 누르면 처음부터 다시 시작합니다')
    }
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))
window.addEventListener('pointerdown', (e) => {
  unlockSfx()
  if (startFromTitle()) return
  Object.assign(mouse, canvasPos(e))
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]
    if (mouse.x >= h.x && mouse.x <= h.x + h.w && mouse.y >= h.y && mouse.y <= h.y + h.h) { h.fn(); break }
  }
})
function held(names) { return names.some((k) => heldKeys.has(k)) }

function currentWindFrom() {
  let wind = rad(BASE_WIND_FROM + Math.sin(state.windTime * WIND_OSC_RATE) * WIND_OSC_AMOUNT)
  const t = state.activeTyphoon
  if (t) wind += Math.sin(state.elapsed * 2.3 + t.phase) * TYPHOON_WIND_CHAOS
  return wind
}

function findActiveTyphoon(x, y) {
  let nearest = null
  let nearestDist = Infinity
  for (const t of state.typhoons) {
    const dist = Math.hypot(x - t.x, y - t.y)
    if (dist <= TYPHOON_RADIUS && dist < nearestDist) {
      nearest = t
      nearestDist = dist
    }
  }
  return nearest
}

function nearestTyphoonInfo(x, y) {
  let best = null
  let bestDist = Infinity
  for (const t of state.typhoons) {
    const dist = Math.hypot(x - t.x, y - t.y)
    if (dist < bestDist) {
      best = t
      bestDist = dist
    }
  }
  return best ? { typhoon: best, dist: bestDist } : null
}

function spawnTyphoonsIfDue() {
  if (state.elapsed < state.nextTyphoonAt) return
  const b = TYPHOON_SPAWN_BOUNDS
  const dir = Math.random() * TAU
  const speed = 14 + Math.random() * 10
  // 배 바로 옆에서 생기면 피할 틈이 없으므로, 배와 충분히 떨어진 곳에서만 생성한다
  let sx = 0
  let sy = 0
  for (let tries = 0; tries < 30; tries++) {
    sx = b.minX + Math.random() * (b.maxX - b.minX)
    sy = b.minY + Math.random() * (b.maxY - b.minY)
    if (Math.hypot(sx - state.boat.x, sy - state.boat.y) >= TYPHOON_RADIUS + 220) break
  }
  state.typhoons.push({
    x: sx,
    y: sy,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    bornAt: state.elapsed,
    phase: Math.random() * TAU,
  })
  state.nextTyphoonAt = state.elapsed + TYPHOON_INTERVAL
  showToast('태풍 발생! 소용돌이 구름을 피해 항해하세요')
  sfx.alarm()
}

function updateTyphoons(dt) {
  for (const t of state.typhoons) {
    t.x += t.vx * dt
    t.y += t.vy * dt
  }
  state.typhoons = state.typhoons.filter((t) => state.elapsed - t.bornAt < TYPHOON_LIFETIME)
}

function pointOfSailInfo() {
  const windFrom = currentWindFrom()
  const sailAngleDeg = deg(Math.abs(angleDelta(state.boat.heading, windFrom)))
  const mult = lerpTable(sailAngleDeg, SAIL_CURVE)
  let label, color
  if (sailAngleDeg < 35) { label = '역풍 (in irons)'; color = '#ff5c5c' }
  else if (sailAngleDeg < 50) { label = '클로즈홀드'; color = '#ffb84d' }
  else if (sailAngleDeg < 110) { label = '빔 리치'; color = '#5cff8f' }
  else if (sailAngleDeg < 155) { label = '브로드 리치'; color = '#5cc9ff' }
  else { label = '러닝'; color = '#9f8cff' }
  return { windFrom, sailAngleDeg, mult, label, color }
}

// Circle-vs-circle push-out, same pattern as the 3D prototype's NPC
// collision: resolved every frame after free movement so it can neither
// trap the boat nor be tunnelled through.
function resolveIslandCollisions() {
  let hit = false
  for (const isl of ISLANDS) {
    const dx = state.boat.x - isl.x
    const dy = state.boat.y - isl.y
    const dist = Math.hypot(dx, dy)
    const minDist = isl.r + BOAT_RADIUS
    if (dist >= minDist) continue
    const push = minDist - dist
    const [nx, ny] = dist > 0.0001 ? [dx / dist, dy / dist] : [1, 0]
    state.boat.x += nx * push
    state.boat.y += ny * push
    hit = true
  }
  if (hit && state.hitCooldown <= 0 && state.boat.speed > 40) {
    state.hitCooldown = 0.9
    state.hull -= ISLAND_HIT_DAMAGE
    sfx.hit()
    showToast('섬에 부딪혔다! 선체가 손상됐다')
  }
}

function updateRacing(dt) {
  state.elapsed += dt
  state.windTime += dt
  state.hitCooldown = Math.max(0, state.hitCooldown - dt)
  updateMarket(dt)

  spawnTyphoonsIfDue()
  updateTyphoons(dt)
  state.activeTyphoon = findActiveTyphoon(state.boat.x, state.boat.y)
  const inStorm = !!state.activeTyphoon
  if (inStorm !== state.wasInStorm) {
    showToast(inStorm ? '태풍 속으로 진입! 조타가 불안정해집니다' : '태풍을 빠져나왔다')
    if (inStorm) sfx.bad()
    else sfx.good()
    state.wasInStorm = inStorm
  }

  if (held(['a', 'arrowleft'])) state.boat.heading -= TURN_RATE * dt
  if (held(['d', 'arrowright'])) state.boat.heading += TURN_RATE * dt

  const { mult } = pointOfSailInfo()
  const dragMult = inStorm ? TYPHOON_SPEED_DRAG : 1
  const sailMult = 1 + 0.08 * state.upgrades.sail
  const leakMult = state.hull < maxHull() * 0.3 ? 0.78 : 1
  state.boat.speed = BASE_SPEED * sailMult * leakMult * mult * dragMult
  state.boat.x += Math.sin(state.boat.heading) * state.boat.speed * dt
  state.boat.y += -Math.cos(state.boat.heading) * state.boat.speed * dt

  if (inStorm) {
    const t = state.activeTyphoon
    const toCenterX = t.x - state.boat.x
    const toCenterY = t.y - state.boat.y
    const centerDist = Math.hypot(toCenterX, toCenterY) || 1
    state.boat.x += (toCenterX / centerDist) * TYPHOON_PULL_STRENGTH * dt
    state.boat.y += (toCenterY / centerDist) * TYPHOON_PULL_STRENGTH * dt

    const gustAngle = state.elapsed * 1.7 + t.phase
    state.boat.x += Math.cos(gustAngle) * TYPHOON_GUST_STRENGTH * dt
    state.boat.y += Math.sin(gustAngle) * TYPHOON_GUST_STRENGTH * dt

    state.hull -= STORM_HULL_DAMAGE * dt
    if (holdCount() > 0) {
      state.stormCargoTimer += dt
      if (state.stormCargoTimer >= CARGO_LOSS_CHECK_INTERVAL) {
        state.stormCargoTimer = 0
        if (Math.random() < CARGO_LOSS_CHANCE) {
          const owned = GOODS.filter((g) => (state.hold[g.id] || 0) > 0)
          const g = owned[Math.floor(Math.random() * owned.length)]
          const lost = Math.min(state.hold[g.id], 1 + Math.floor(Math.random() * 2))
          state.hold[g.id] -= lost
          showToast(`태풍에 ${g.id} ${lost}개를 잃어버렸다!`)
          sfx.bad()
        }
      }
    }
  } else {
    state.stormCargoTimer = 0
  }

  resolveIslandCollisions()
  if (state.hull <= 0) sinkAndTow()

  state.wake.push({ x: state.boat.x, y: state.boat.y, t: state.elapsed })
  if (state.wake.length > 60) state.wake.shift()

  const target = CHECKPOINTS[state.checkpointIndex]
  const dist = Math.hypot(state.boat.x - target.x, state.boat.y - target.y)
  if (dist < CHECKPOINT_RADIUS) {
    state.checkpointIndex += 1
    sfx.pickup()
    if (state.checkpointIndex >= CHECKPOINTS.length) {
      state.phase = 'finished'
      sfx.fanfare()
      state.finishTime = state.elapsed
      const best = readBestTime()
      if (!best || state.finishTime < best) {
        writeBestTime(state.finishTime)
        state.isNewBest = true
      }
    }
  }
}

function nowSec() { return performance.now() / 1000 }
function showToast(text) {
  state.toast = { text, until: nowSec() + 2.5 }
}

// ───────────────────────── 항구: 시장 / 대화 / 정비 ─────────────────────────
// 항구에 들어서면 메뉴가 열리고(시간은 멈춘다), E로 다시 열 수 있다.
function portById(id) { return PORTS.find((p) => p.id === id) }
function goodById(id) { return GOODS.find((g) => g.id === id) }
function holdCount() { return GOODS.reduce((n, g) => n + (state.hold[g.id] || 0), 0) }
function holdCap() { return 6 + 4 * state.upgrades.hold }
function maxHull() { return 100 + 25 * state.upgrades.hull }
function repLevel(portId) { return Math.min(3, Math.floor(state.rep[portId] / REP_PER_LEVEL)) }

function eqPrice(port, good, t) {
  const pi = PORTS.indexOf(port)
  const gi = GOODS.indexOf(good)
  return good.base * port.mult[good.id] * (1 + 0.1 * Math.sin(t * 0.045 + pi * 2.1 + gi * 1.3))
}
function makeMarket() {
  const m = {}
  for (const port of PORTS) {
    m[port.id] = {}
    for (const g of GOODS) m[port.id][g.id] = eqPrice(port, g, 0)
  }
  return m
}
// 시세는 천천히 균형가로 돌아오고, 균형가 자체도 시간에 따라 출렁인다.
function updateMarket(dt) {
  for (const port of PORTS) {
    for (const g of GOODS) {
      const eq = eqPrice(port, g, state.elapsed)
      const cur = state.market[port.id][g.id]
      state.market[port.id][g.id] = cur + (eq - cur) * Math.min(1, dt * 0.04)
    }
  }
}
function buyPrice(portId, goodId) {
  return Math.max(1, Math.round(state.market[portId][goodId] * (1.08 - 0.02 * repLevel(portId))))
}
function sellPrice(portId, goodId) {
  return Math.max(1, Math.round(state.market[portId][goodId] * (0.92 + 0.02 * repLevel(portId))))
}
function recordKnown(portId) {
  state.known[portId] = state.known[portId] || {}
  for (const g of GOODS) state.known[portId][g.id] = Math.round(state.market[portId][g.id])
}

function openPort(portId) {
  const port = portById(portId)
  recordKnown(portId)
  const lv = Math.min(2, repLevel(portId))
  state.ui = { portId, tab: 'market', sel: 0, say: GREETINGS[portId][lv], sayAt: nowSec(), talked: false, rumorIdx: 0 }
  sfx.click()
  showToast(`${port.name}에 정박했다`)
}
function closePort() {
  state.ui = null
  sfx.click()
}
function setTab(tab) {
  const ui = state.ui
  if (ui.tab === tab) return
  ui.tab = tab
  ui.sel = 0
  sfx.click()
}
function say(text) {
  state.ui.say = text
  state.ui.sayAt = nowSec()
}
function fail(msg) {
  showToast(msg)
  sfx.bad()
}
function addRep(portId, n) {
  const before = repLevel(portId)
  state.rep[portId] = Math.min(MAX_REP, state.rep[portId] + n)
  if (repLevel(portId) > before) {
    showToast(`${portById(portId).npc.name}와(과) 더 친해졌다 ♥ (거래 조건이 좋아져요)`)
    sfx.good()
  }
}

function buyGood(goodId) {
  const portId = state.ui.portId
  const price = buyPrice(portId, goodId)
  if (holdCount() >= holdCap()) return fail('화물칸이 가득 찼다')
  if (state.gold < price) return fail('골드가 부족하다')
  state.gold -= price
  state.hold[goodId] = (state.hold[goodId] || 0) + 1
  state.market[portId][goodId] *= 1 + PRICE_IMPACT
  recordKnown(portId)
  sfx.click()
}
function sellGood(goodId, all = false) {
  const portId = state.ui.portId
  let n = all ? state.hold[goodId] || 0 : Math.min(1, state.hold[goodId] || 0)
  if (n <= 0) return fail(`${goodId}이(가) 없다`)
  let total = 0
  for (let i = 0; i < n; i++) {
    total += sellPrice(portId, goodId)
    state.market[portId][goodId] *= 1 - PRICE_IMPACT
  }
  state.hold[goodId] -= n
  state.gold += total
  recordKnown(portId)
  sfx.coin()
  showToast(`${goodId} ${n}개 판매 +${total} 골드`)
}

function repairCost(portId, hp) {
  return Math.ceil(hp * REPAIR_COST_PER_HP * (1 - 0.03 * repLevel(portId)))
}
function yardAction(i) {
  const portId = state.ui.portId
  if (i === 0 || i === 1) {
    const missing = Math.ceil(maxHull() - state.hull)
    if (missing <= 0) return fail('선체는 이미 멀쩡하다')
    let hp = i === 0 ? Math.min(10, missing) : missing
    let cost = repairCost(portId, hp)
    if (state.gold < cost) {
      // 가진 돈만큼만이라도 수리
      hp = Math.floor(state.gold / (REPAIR_COST_PER_HP * (1 - 0.03 * repLevel(portId))))
      if (hp <= 0) return fail('골드가 부족하다')
      cost = repairCost(portId, hp)
    }
    state.gold -= cost
    state.hull = Math.min(maxHull(), state.hull + hp)
    sfx.build()
    showToast(`선체 +${hp} 수리 (-${cost} 골드)`)
    return
  }
  const up = UPGRADES[i - 2]
  const lv = state.upgrades[up.id]
  if (lv >= up.max) return fail('이미 최대 강화다')
  const cost = up.costs[lv]
  if (state.gold < cost) return fail('골드가 부족하다')
  state.gold -= cost
  state.upgrades[up.id] = lv + 1
  if (up.id === 'hull') state.hull += 25
  sfx.fanfare()
  showToast(`${up.name} Lv.${lv + 1} 완료!`)
}

// 의뢰: 한 번에 하나. 상품은 시장에서 직접 사 와서 목적지 항구 NPC에게 납품한다.
function ensureOffer(port) {
  if (state.offers[port.id]) return state.offers[port.id]
  const g = GOODS[Math.floor(Math.random() * GOODS.length)]
  const dests = PORTS.filter((p) => p.id !== port.id)
  const dest = dests[Math.floor(Math.random() * dests.length)]
  const qty = 2 + Math.floor(Math.random() * 4)
  const ref = g.base * Math.max(port.mult[g.id], dest.mult[g.id])
  const reward = Math.round((qty * ref * 1.35) / 5) * 5 + 20
  state.offers[port.id] = { good: g.id, qty, toId: dest.id, reward, fromId: port.id }
  return state.offers[port.id]
}
function contractLabel(c) {
  return `${c.good} ${c.qty}개 → ${portById(c.toId).name} (+${c.reward}G)`
}

const DIRS = ['동', '남동', '남', '남서', '서', '북서', '북', '북동']
function dirText(dx, dy) {
  const a = Math.atan2(dy, dx) // 화면 좌표: y+가 남쪽
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]
}

function bestRoute() {
  let best = null
  for (const from of PORTS) {
    for (const to of PORTS) {
      if (from === to) continue
      for (const g of GOODS) {
        const profit = sellPrice(to.id, g.id) - buyPrice(from.id, g.id)
        if (!best || profit > best.profit) best = { from, to, good: g.id, profit }
      }
    }
  }
  return best
}

const GREETINGS = {
  home: [
    '어서 와, 선장. 이 부두는 언제나 자네 배를 기다린다네.',
    '또 왔군! 오늘은 돛이 팽팽해 보이는걸.',
    '우리 부두의 자랑이 돌아왔구먼! 오늘은 특별히 잘 쳐주지.',
  ],
  north: [
    '어서 오세요. 북쪽 항구 상인 길드입니다. 좋은 거래 하시길.',
    '다시 뵙네요, 선장님. 저번 거래 덕분에 길드에서 평판이 좋아요.',
    '선장님이라면 언제든 환영이죠. 우대 시세로 모시겠습니다!',
  ],
  west: [
    '어이, 처음 보는 얼굴이군. 한잔 걸치고 가게나.',
    '왔나, 단골 선장! 자네 얘기라면 이 술집에서도 자자하다네.',
    '내 술집의 VIP가 왔구먼! 소문이든 뭐든 다 풀어놓지.',
  ],
}
const FLAVOR = {
  home: [
    '북풍이 계속 부는 철이야. 북쪽으로 가려면 지그재그로 올라가야 하지.',
    '돛을 바람에 너무 붙이면 배가 서 버려. 45도쯤이 한계라네.',
    '태풍은 한가운데로 빨아들이니, 점선 밖으로 크게 돌아가게나.',
  ],
  north: [
    '거래를 많이 할수록 시세가 움직입니다. 한 곳에 몰아 팔면 손해예요.',
    '시세는 시간이 지나면 제자리로 돌아와요. 너무 서두르지 마세요.',
    '의뢰는 한 번에 하나만 받을 수 있어요. 납품은 목적지 항구에서!',
  ],
  west: [
    '배가 삐걱거리면 정비소에 들르게. 선체가 약해지면 속도도 떨어지니까.',
    '섬 해안에 바짝 붙지 말게나. 암초에 긁히면 수리비가 만만치 않아.',
    '화물칸을 늘리면 한 번에 더 많이 나를 수 있지. 돈 될 때 투자하게!',
  ],
}
function nextRumor(port) {
  const ui = state.ui
  const kind = ui.rumorIdx++ % 3
  if (kind === 0) {
    // 다른 항구의 시세 소문 (실제 시세를 알려 준다)
    const others = PORTS.filter((p) => p.id !== port.id)
    let pick = null
    for (const o of others) {
      for (const g of GOODS) {
        const ratio = state.market[o.id][g.id] / (g.base * 1.0)
        if (!pick || ratio > pick.ratio) pick = { o, g, ratio }
      }
    }
    state.known[pick.o.id] = state.known[pick.o.id] || {}
    state.known[pick.o.id][pick.g.id] = Math.round(state.market[pick.o.id][pick.g.id])
    return `${pick.o.name}에서는 ${pick.g.id} 값이 ${Math.round(state.market[pick.o.id][pick.g.id])}골드까지 올랐다더군. 장부에 적어 두게.`
  }
  if (kind === 1) {
    if (state.typhoons.length) {
      const t = state.typhoons.reduce((a, b) =>
        Math.hypot(a.x - port.x, a.y - port.y) < Math.hypot(b.x - port.x, b.y - port.y) ? a : b)
      const d = Math.round(Math.hypot(t.x - port.x, t.y - port.y))
      return `이 항구 ${dirText(t.x - port.x, t.y - port.y)}쪽 ${d}m 바다에 태풍이 도사리고 있어. 조심하게!`
    }
    return '요즘 바다는 잠잠하네. 하지만 태풍은 예고 없이 생기는 법이지.'
  }
  return FLAVOR[port.id][Math.floor(ui.rumorIdx / 3) % 3]
}

function talkOptions(port) {
  const c = state.contract
  let contractOpt
  if (c && c.toId === port.id) {
    const have = state.hold[c.good] || 0
    contractOpt = { label: `의뢰 납품: ${c.good} ${c.qty}개 (보유 ${have})`, enabled: true }
  } else if (c) {
    contractOpt = { label: `진행 중인 의뢰: ${contractLabel(c)}`, enabled: true }
  } else {
    const o = ensureOffer(port)
    contractOpt = { label: `의뢰 받기: ${contractLabel(o)}`, enabled: true }
  }
  return [
    { label: '소문 듣기', enabled: true },
    contractOpt,
    { label: '술 한 잔 대접하기 (-15G, 친밀도 +2)', enabled: state.gold >= 15 },
  ]
}
function talkAction(i) {
  const port = portById(state.ui.portId)
  const ui = state.ui
  if (i === 0) {
    say(nextRumor(port))
    if (!ui.talked) { ui.talked = true; addRep(port.id, 1) }
    sfx.click()
  } else if (i === 1) {
    const c = state.contract
    if (c && c.toId === port.id) {
      if ((state.hold[c.good] || 0) < c.qty) {
        say(`${c.good}이(가) ${c.qty}개 필요하다고 했잖나. 아직 ${c.qty - (state.hold[c.good] || 0)}개 모자라네.`)
        sfx.bad()
      } else {
        state.hold[c.good] -= c.qty
        state.gold += c.reward
        addRep(port.id, 3)
        say(`오오, 틀림없군! 약속한 ${c.reward}골드일세. 다음에도 부탁하지.`)
        showToast(`의뢰 완료! +${c.reward} 골드`)
        sfx.fanfare()
        state.contract = null
      }
    } else if (c) {
      say(`${portById(c.toId).name}으로 ${c.good} ${c.qty}개를 가져가는 일을 먼저 끝내게. 한 번에 하나씩이야.`)
      sfx.click()
    } else {
      const o = ensureOffer(port)
      state.contract = { ...o }
      state.offers[port.id] = null
      say(`${o.good} ${o.qty}개를 ${portById(o.toId).name}까지 가져다 주게. 보수는 ${o.reward}골드! 상품은 시장에서 직접 구해 오게나.`)
      sfx.pickup()
    }
  } else {
    if (state.gold < 15) return fail('골드가 부족하다')
    state.gold -= 15
    addRep(port.id, 2)
    const r = bestRoute()
    say(`고맙네! 답례로 하나 알려주지. ${r.from.name}에서 ${r.good}을(를) 사다 ${r.to.name}에 팔면 개당 ${r.profit}골드쯤 남을 걸세.`)
    recordKnown(r.to.id)
    sfx.coin()
  }
}

// 선체가 0이 되면 가까운 항구로 예인된다: 화물과 골드 일부를 잃는다.
function sinkAndTow() {
  let near = PORTS[0]
  for (const p of PORTS) {
    if (Math.hypot(p.x - state.boat.x, p.y - state.boat.y) < Math.hypot(near.x - state.boat.x, near.y - state.boat.y)) near = p
  }
  state.boat.x = near.x
  state.boat.y = near.y + 30
  state.hull = maxHull() * 0.3
  state.hold = {}
  const fee = Math.floor(state.gold * 0.2)
  state.gold -= fee
  state.dockedPortId = null
  state.wake.length = 0
  sfx.lose()
  showToast(`배가 침몰 직전! ${near.name}로 예인됐다 (화물 손실, 예인료 -${fee}G)`)
}

// 정박 감지: 항구 반경에 들어서면 안내가 뜨고, E(또는 클릭)로 메뉴를 연다.
// (홈 항구가 코스 위에 있어서, 지나갈 때마다 메뉴가 레이스를 끊지 않도록 자동으로 열지는 않는다.)
function updateDock() {
  let here = null
  for (const port of PORTS) {
    if (Math.hypot(state.boat.x - port.x, state.boat.y - port.y) < DOCK_RADIUS) {
      here = port
      break
    }
  }
  const hereId = here ? here.id : null
  if (hereId === state.dockedPortId) return
  state.dockedPortId = hereId
  if (here) {
    sfx.click()
    showToast(`${here.name} 정박 — E 키로 항구 메뉴 (시장·대화·정비)`)
  }
}

function worldToScreen(x, y) {
  return { x: canvas.width / 2 + (x - state.boat.x), y: canvas.height / 2 + (y - state.boat.y) }
}

function drawSea() {
  ctx.fillStyle = '#1b5c8c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  const spacing = 60
  const offX = ((state.boat.x % spacing) + spacing) % spacing
  const offY = ((state.boat.y % spacing) + spacing) % spacing
  ctx.beginPath()
  for (let x = -offX; x < canvas.width + spacing; x += spacing) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
  }
  for (let y = -offY; y < canvas.height + spacing; y += spacing) {
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
  }
  ctx.stroke()
}

function drawIslands() {
  for (const isl of ISLANDS) {
    const p = worldToScreen(isl.x, isl.y)
    if (p.x < -isl.r || p.x > canvas.width + isl.r || p.y < -isl.r || p.y > canvas.height + isl.r) continue
    ctx.fillStyle = '#3f8f4f'
    ctx.beginPath()
    ctx.arc(p.x, p.y, isl.r, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#2a5f35'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#2a5f35'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y - isl.r * 0.5)
    ctx.lineTo(p.x - 10, p.y - isl.r * 0.15)
    ctx.lineTo(p.x + 10, p.y - isl.r * 0.15)
    ctx.closePath()
    ctx.fill()
  }
}

// ───────────────────────── 항구 메뉴 UI ─────────────────────────
const mouse = { x: -1, y: -1 }
let hits = [] // 이번 프레임에 그려진 클릭 영역 { x, y, w, h, fn }

function canvasPos(e) {
  const r = canvas.getBoundingClientRect()
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height }
}
window.addEventListener('pointermove', (e) => Object.assign(mouse, canvasPos(e)))

const TABS = [
  { id: 'market', label: '시장', icon: '⚖️', rows: GOODS.length },
  { id: 'talk', label: '대화', icon: '💬', rows: 3 },
  { id: 'yard', label: '정비', icon: '🔧', rows: 1 + 1 + UPGRADES.length },
]
function rowCount(tab) {
  return tab === 'market' ? GOODS.length : tab === 'talk' ? 3 : 2 + UPGRADES.length
}
function activate(ui) {
  if (ui.tab === 'market') buyGood(GOODS[ui.sel].id)
  else if (ui.tab === 'talk') talkAction(ui.sel)
  else yardAction(ui.sel)
}
function handleMenuKey(e, key) {
  const ui = state.ui
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab', ' ', 'enter'].includes(key)) e.preventDefault()
  if (e.repeat && key !== 'arrowup' && key !== 'arrowdown') return
  if (key === 'escape' || key === 'e') return closePort()
  if (key === '1') return setTab('market')
  if (key === '2') return setTab('talk')
  if (key === '3') return setTab('yard')
  if (key === 'tab' || key === 'arrowright' || key === 'arrowleft') {
    const i = TABS.findIndex((t) => t.id === ui.tab)
    const d = key === 'arrowleft' ? -1 : 1
    return setTab(TABS[(i + d + TABS.length) % TABS.length].id)
  }
  const n = rowCount(ui.tab)
  if (key === 'arrowup') ui.sel = (ui.sel + n - 1) % n
  else if (key === 'arrowdown') ui.sel = (ui.sel + 1) % n
  else if (key === 'enter' || key === ' ') activate(ui)
  else if (ui.tab === 'market') {
    if (key === 'b') buyGood(GOODS[ui.sel].id)
    else if (key === 's') sellGood(GOODS[ui.sel].id)
    else if (key === 'x') sellGood(GOODS[ui.sel].id, true)
  }
}

function uiBtn(x, y, w, h, label, onClick, { enabled = true, color = '#2f6f9f', font = 'bold 14px sans-serif', align = 'center' } = {}) {
  const hover = enabled && mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h
  ctx.fillStyle = !enabled ? 'rgba(255,255,255,0.08)' : hover ? '#4d9fd6' : color
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()
  ctx.fillStyle = enabled ? '#fff' : 'rgba(255,255,255,0.4)'
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = align
  ctx.fillText(label, align === 'center' ? x + w / 2 : x + 14, y + h / 2 + 1)
  if (enabled) hits.push({ x, y, w, h, fn: onClick })
}
function wrapText(text, maxW, font) {
  ctx.font = font
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch.trimStart() } else line += ch
  }
  if (line) lines.push(line)
  return lines
}
function drawNpc(cx, cy, npc, t) {
  const bob = Math.sin(t * 2) * 1.5
  ctx.save()
  ctx.translate(cx, cy + bob)
  ctx.fillStyle = npc.hat // 몸(외투)
  ctx.beginPath()
  ctx.roundRect(-42, 38, 84, 70, [26, 26, 6, 6])
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(-6, 42, 12, 40)
  ctx.fillStyle = npc.skin // 얼굴
  ctx.beginPath()
  ctx.arc(0, 0, 36, 0, TAU)
  ctx.fill()
  ctx.fillStyle = npc.hair // 머리/수염
  ctx.beginPath()
  ctx.arc(0, -4, 37, Math.PI * 1.02, Math.PI * 1.98)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, 24, 20, 11, 0, 0, Math.PI)
  ctx.fill()
  ctx.fillStyle = npc.hat // 모자
  ctx.beginPath()
  ctx.ellipse(0, -22, 46, 9, 0, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(-28, -48, 56, 28, [14, 14, 2, 2])
  ctx.fill()
  ctx.fillStyle = '#2b1a10' // 눈
  const blink = Math.sin(t * 0.9) > 0.97 ? 1 : 5
  ctx.fillRect(-16, -4, 8, blink)
  ctx.fillRect(8, -4, 8, blink)
  ctx.fillStyle = '#b04a3a'
  ctx.fillRect(-7, 10, 14, 3)
  ctx.restore()
}
function hullBar(x, y, w, h) {
  const frac = Math.max(0, Math.min(1, state.hull / maxHull()))
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = frac > 0.5 ? '#5cff8f' : frac > 0.3 ? '#ffb84d' : '#ff5c5c'
  ctx.fillRect(x, y, w * frac, h)
}

function drawPortMenu() {
  const ui = state.ui
  const port = portById(ui.portId)
  const t = nowSec()
  const W = canvas.width
  ctx.fillStyle = 'rgba(4,12,24,0.6)'
  ctx.fillRect(0, 0, W, canvas.height)

  const PX = 50, PY = 56, PW = 800, PH = 500
  ctx.fillStyle = '#10243a'
  ctx.beginPath()
  ctx.roundRect(PX, PY, PW, PH, 14)
  ctx.fill()
  ctx.strokeStyle = '#2f5f8a'
  ctx.lineWidth = 2
  ctx.stroke()

  // 헤더
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffd23f'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(`⚓ ${port.name}`, PX + 20, PY + 28)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#ffd23f'
  ctx.fillText(`💰 ${state.gold} 골드`, PX + 200, PY + 28)
  ctx.fillStyle = holdCount() >= holdCap() ? '#ff9a5c' : '#cfe8ff'
  ctx.fillText(`📦 화물 ${holdCount()}/${holdCap()}`, PX + 330, PY + 28)
  ctx.fillStyle = '#cfe8ff'
  ctx.fillText('🛠 선체', PX + 450, PY + 28)
  hullBar(PX + 506, PY + 21, 90, 14)
  ctx.fillStyle = '#cfe8ff'
  ctx.fillText(`${Math.ceil(state.hull)}/${maxHull()}`, PX + 604, PY + 28)
  uiBtn(PX + PW - 110, PY + 10, 96, 36, '출항 (E)', closePort, { color: '#b5532f' })

  // 탭
  const ty = PY + 62
  TABS.forEach((tab, i) => {
    const active = ui.tab === tab.id
    const x = PX + 20 + i * 150
    ctx.fillStyle = active ? '#2f6f9f' : 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.roundRect(x, ty, 140, 38, [10, 10, 0, 0])
    ctx.fill()
    ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.65)'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${tab.icon} ${tab.label} (${i + 1})`, x + 70, ty + 20)
    hits.push({ x, y: ty, w: 140, h: 38, fn: () => setTab(tab.id) })
  })
  ctx.fillStyle = '#2f6f9f'
  ctx.fillRect(PX + 20, ty + 38, PW - 40, 3)

  const cy = ty + 56
  if (ui.tab === 'market') drawMarketTab(port, ui, PX, cy, PW)
  else if (ui.tab === 'talk') drawTalkTab(port, ui, PX, cy, PW, t)
  else drawYardTab(port, ui, PX, cy, PW)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  const hint = ui.tab === 'market' ? '↑↓ 선택 · B/Enter 사기 · S 팔기 · X 모두 팔기 · 1/2/3 탭 · E/Esc 출항'
    : ui.tab === 'talk' ? '↑↓ 선택 · Enter 고르기 · 1/2/3 탭 · E/Esc 출항'
    : '↑↓ 선택 · Enter 수리/강화 · 1/2/3 탭 · E/Esc 출항'
  ctx.fillText(hint, PX + PW / 2, PY + PH - 14)
}

function drawMarketTab(port, ui, PX, y0, PW) {
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.fillText('상품', PX + 80, y0 - 8)
  ctx.fillText('매입가 / 매도가', PX + 190, y0 - 8)
  ctx.fillText('시세', PX + 340, y0 - 8)
  ctx.fillText('보유', PX + 420, y0 - 8)
  ctx.fillText('다른 항구 최고 매도가(아는 범위)', PX + 470, y0 - 8)
  const rowH = 54
  GOODS.forEach((g, i) => {
    const y = y0 + 6 + i * rowH
    const sel = ui.sel === i
    ctx.fillStyle = sel ? 'rgba(77,159,214,0.28)' : i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.roundRect(PX + 20, y, PW - 40, rowH - 6, 8)
    ctx.fill()
    hits.push({ x: PX + 20, y, w: 480, h: rowH - 6, fn: () => { ui.sel = i } })
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = '26px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(g.icon, PX + 34, y + 24)
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(g.id, PX + 80, y + 24)
    const buy = buyPrice(port.id, g.id)
    const sell = sellPrice(port.id, g.id)
    ctx.font = '15px sans-serif'
    ctx.fillStyle = '#ffd23f'
    ctx.fillText(`${buy} / ${sell}`, PX + 190, y + 24)
    const ratio = state.market[port.id][g.id] / (g.base * port.mult[g.id])
    const base = g.base
    const cheap = state.market[port.id][g.id] < base * 0.9
    const dear = state.market[port.id][g.id] > base * 1.1
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = cheap ? '#5cff8f' : dear ? '#ff8a6a' : '#cfe8ff'
    ctx.fillText(cheap ? '▼ 저렴' : dear ? '▲ 비쌈' : '● 보통', PX + 340, y + 24)
    void ratio
    ctx.font = '15px sans-serif'
    ctx.fillStyle = (state.hold[g.id] || 0) > 0 ? '#fff' : 'rgba(255,255,255,0.4)'
    ctx.fillText(`${state.hold[g.id] || 0}개`, PX + 420, y + 24)
    // 다른 항구 최고가
    let best = null
    for (const o of PORTS) {
      if (o.id === port.id) continue
      const kp = state.known[o.id] && state.known[o.id][g.id]
      if (kp && (!best || kp > best.price)) best = { o, price: kp }
    }
    ctx.font = '13px sans-serif'
    if (best) {
      ctx.fillStyle = best.price > sell ? '#5cff8f' : 'rgba(255,255,255,0.6)'
      ctx.fillText(`${best.o.name} ${best.price}`, PX + 470, y + 24)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillText('? (아직 모름)', PX + 470, y + 24)
    }
    const canBuy = holdCount() < holdCap() && state.gold >= buy
    uiBtn(PX + 626, y + 6, 72, 34, '사기', () => { ui.sel = i; buyGood(g.id) }, { enabled: canBuy, color: '#2f8f5f' })
    uiBtn(PX + 706, y + 6, 72, 34, '팔기', () => { ui.sel = i; sellGood(g.id) }, { enabled: (state.hold[g.id] || 0) > 0, color: '#9f5f2f' })
  })
  ctx.textAlign = 'left'
  ctx.font = '13px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.textBaseline = 'middle'
  const lv = repLevel(port.id)
  ctx.fillText(`친밀도 ${'♥'.repeat(lv)}${'♡'.repeat(3 - lv)} — 친해질수록 싸게 사고 비싸게 팔아요. 거래하면 시세가 움직입니다.`, PX + 24, y0 + 6 + GOODS.length * rowH + 12)
  if (state.contract) {
    ctx.fillStyle = '#5cc9ff'
    ctx.fillText(`📜 의뢰: ${contractLabel(state.contract)}`, PX + 24, y0 + 6 + GOODS.length * rowH + 34)
  }
}

function drawTalkTab(port, ui, PX, y0, PW, t) {
  // 왼쪽 NPC
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.roundRect(PX + 20, y0 - 6, 200, 300, 12)
  ctx.fill()
  drawNpc(PX + 120, y0 + 80, port.npc, t)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 17px sans-serif'
  ctx.fillText(port.npc.name, PX + 120, y0 + 200)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#cfe8ff'
  ctx.fillText(port.npc.title, PX + 120, y0 + 224)
  const lv = repLevel(port.id)
  ctx.fillStyle = '#ff7a9a'
  ctx.font = '16px sans-serif'
  ctx.fillText(`${'♥'.repeat(lv)}${'♡'.repeat(3 - lv)}`, PX + 120, y0 + 252)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px sans-serif'
  ctx.fillText(`친밀도 ${state.rep[port.id]}/${MAX_REP}`, PX + 120, y0 + 274)

  // 말풍선
  const bx = PX + 244, bw = PW - 264
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.beginPath()
  ctx.roundRect(bx, y0 - 6, bw, 130, 12)
  ctx.fill()
  const shown = Math.floor((nowSec() - ui.sayAt) * 45)
  const lines = wrapText(ui.say, bw - 40, '16px sans-serif')
  ctx.fillStyle = '#1b2433'
  ctx.font = '16px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let left = shown
  lines.forEach((ln, i) => {
    if (left <= 0) return
    ctx.fillText(ln.slice(0, left), bx + 20, y0 + 10 + i * 26)
    left -= ln.length
  })

  // 선택지
  const opts = talkOptions(port)
  opts.forEach((o, i) => {
    const y = y0 + 144 + i * 50
    const sel = ui.sel === i
    uiBtn(bx, y, bw, 42, `${i + 1}. ${o.label}`, () => { ui.sel = i; talkAction(i) }, {
      enabled: o.enabled, color: sel ? '#3d82b8' : '#25496b', font: '15px sans-serif', align: 'left',
    })
    if (sel) {
      ctx.strokeStyle = '#ffd23f'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(bx, y, bw, 42, 8)
      ctx.stroke()
    }
  })
}

function drawYardTab(port, ui, PX, y0, PW) {
  const rowH = 66
  const rows = [
    { icon: '🔧', name: '응급 수리', sub: '선체 +10', cost: repairCost(port.id, Math.min(10, Math.max(0, Math.ceil(maxHull() - state.hull)))), btn: '수리' },
    { icon: '🛠️', name: '전체 수리', sub: `선체 +${Math.max(0, Math.ceil(maxHull() - state.hull))}`, cost: repairCost(port.id, Math.max(0, Math.ceil(maxHull() - state.hull))), btn: '전부 수리' },
    ...UPGRADES.map((u) => {
      const lv = state.upgrades[u.id]
      return { icon: u.icon, name: `${u.name}  Lv.${lv}/${u.max}`, sub: lv >= u.max ? '최대 강화 완료' : u.desc(lv), cost: lv >= u.max ? null : u.costs[lv], btn: lv >= u.max ? 'MAX' : '강화', upgrade: u }
    }),
  ]
  rows.forEach((r, i) => {
    const y = y0 - 6 + i * rowH
    const sel = ui.sel === i
    ctx.fillStyle = sel ? 'rgba(77,159,214,0.28)' : i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'
    ctx.beginPath()
    ctx.roundRect(PX + 20, y, PW - 40, rowH - 8, 8)
    ctx.fill()
    hits.push({ x: PX + 20, y, w: 560, h: rowH - 8, fn: () => { ui.sel = i } })
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = '26px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(r.icon, PX + 34, y + 28)
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(r.name, PX + 80, y + 20)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#cfe8ff'
    ctx.fillText(r.sub, PX + 80, y + 42)
    if (r.upgrade) {
      const lv = state.upgrades[r.upgrade.id]
      for (let k = 0; k < r.upgrade.max; k++) {
        ctx.fillStyle = k < lv ? '#ffd23f' : 'rgba(255,255,255,0.18)'
        ctx.fillRect(PX + 330 + k * 22, y + 16, 18, 10)
      }
    }
    if (i < 2) {
      hullBar(PX + 330, y + 18, 120, 10)
      ctx.fillStyle = '#cfe8ff'
      ctx.font = '12px sans-serif'
      ctx.fillText(`${Math.ceil(state.hull)}/${maxHull()}`, PX + 460, y + 23)
    }
    const costTxt = r.cost == null ? '' : r.cost === 0 ? '-' : `${r.cost}G`
    ctx.font = 'bold 15px sans-serif'
    ctx.fillStyle = r.cost != null && state.gold >= r.cost ? '#ffd23f' : '#ff8a6a'
    ctx.textAlign = 'right'
    ctx.fillText(costTxt, PX + 640, y + 28)
    const enabled = i < 2 ? state.hull < maxHull() - 0.01 && state.gold > 0 : r.cost != null && state.gold >= r.cost
    uiBtn(PX + 660, y + 8, 110, 38, r.btn, () => { ui.sel = i; yardAction(i) }, { enabled, color: i < 2 ? '#2f8f5f' : '#7a4fb5' })
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '13px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  const lv = repLevel(port.id)
  ctx.fillText(`수리비 개당 ${Math.round(REPAIR_COST_PER_HP * (1 - 0.03 * lv) * 10) / 10}G (친밀도 할인 ${lv * 3}%) · 선체 30% 미만이면 배가 새서 느려지고, 0이 되면 침몰합니다.`, PX + 24, y0 - 6 + rows.length * rowH + 12)
}

function drawToast() {
  const now = nowSec()
  if (!state.toast || now >= state.toast.until) return
  const alpha = Math.min(1, (state.toast.until - now) / 0.5)
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(10,20,30,0.85)'
  ctx.font = 'bold 15px sans-serif'
  const w = ctx.measureText(state.toast.text).width + 32
  ctx.textAlign = 'center'
  ctx.fillRect(canvas.width / 2 - w / 2, 12, w, 32)
  ctx.fillStyle = '#ffd23f'
  ctx.textBaseline = 'middle'
  ctx.fillText(state.toast.text, canvas.width / 2, 28)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1
}

function drawPorts() {
  for (const port of PORTS) {
    const p = worldToScreen(port.x, port.y)
    if (p.x < -60 || p.x > canvas.width + 60 || p.y < -60 || p.y > canvas.height + 60) continue
    const isDocked = state.dockedPortId === port.id
    const isCargoDest = state.contract && state.contract.toId === port.id

    // Pier: a short wooden deck jutting from the dock point toward the boat.
    ctx.strokeStyle = '#a9733f'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x, p.y + 26)
    ctx.stroke()
    ctx.strokeStyle = '#7a4e26'
    ctx.lineWidth = 2
    for (let i = -4; i <= 4; i += 4) {
      ctx.beginPath()
      ctx.moveTo(p.x + i, p.y)
      ctx.lineTo(p.x + i, p.y + 26)
      ctx.stroke()
    }

    ctx.fillStyle = isDocked ? '#ffd23f' : isCargoDest ? '#5cc9ff' : '#e8c27a'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 11, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#5a3a18'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#3a2410'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⚓', p.x, p.y + 4)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(port.name, p.x, p.y - 18)
    if (isDocked && !state.ui) {
      const pulse = 0.8 + Math.sin(nowSec() * 5) * 0.2
      ctx.globalAlpha = pulse
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath()
      ctx.roundRect(p.x - 58, p.y + 36, 116, 26, 13)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#3a2410'
      ctx.font = 'bold 13px sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText('E · 항구 메뉴', p.x, p.y + 50)
      ctx.textBaseline = 'alphabetic'
      hits.push({ x: p.x - 58, y: p.y + 36, w: 116, h: 26, fn: () => openPort(port.id) })
    }
  }
}

function drawCheckpoints() {
  for (let i = state.checkpointIndex; i < CHECKPOINTS.length; i++) {
    const cp = CHECKPOINTS[i]
    const p = worldToScreen(cp.x, cp.y)
    const isCurrent = i === state.checkpointIndex
    const pulse = isCurrent ? 1 + Math.sin(state.elapsed * 4) * 0.08 : 1
    const radius = (isCurrent ? 16 : 10) * pulse
    ctx.fillStyle = isCurrent ? '#ffd23f' : 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#8a5a00'
    ctx.lineWidth = 2
    ctx.stroke()
    if (isCurrent) {
      ctx.fillStyle = '#231a05'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(cp.label === 'FINISH' ? '\u{1F3C1}' : cp.label, p.x, p.y)
    }
  }
}

function drawTyphoons() {
  for (const t of state.typhoons) {
    const p = worldToScreen(t.x, t.y)
    if (p.x < -TYPHOON_WARN_RADIUS || p.x > canvas.width + TYPHOON_WARN_RADIUS) continue
    if (p.y < -TYPHOON_WARN_RADIUS || p.y > canvas.height + TYPHOON_WARN_RADIUS) continue

    ctx.strokeStyle = 'rgba(255,90,90,0.35)'
    ctx.setLineDash([6, 8])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, TYPHOON_WARN_RADIUS, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(30,30,40,0.55)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, TYPHOON_RADIUS, 0, TAU)
    ctx.fill()

    ctx.strokeStyle = 'rgba(220,220,230,0.6)'
    ctx.lineWidth = 3
    for (let arm = 0; arm < 3; arm++) {
      const baseAngle = t.phase + (arm / 3) * TAU
      ctx.beginPath()
      for (let i = 0; i <= 20; i++) {
        const frac = i / 20
        const ang = baseAngle + state.elapsed * 1.2 + frac * 3.2
        const r = frac * TYPHOON_RADIUS * 0.85
        const x = p.x + Math.cos(ang) * r
        const y = p.y + Math.sin(ang) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
}

function drawWake() {
  for (const w of state.wake) {
    const age = state.elapsed - w.t
    const alpha = Math.max(0, 1 - age / 1.2)
    if (alpha <= 0) continue
    const p = worldToScreen(w.x, w.y)
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawBoat() {
  const p = worldToScreen(state.boat.x, state.boat.y)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(state.boat.heading)
  ctx.fillStyle = '#8b5a2b'
  ctx.beginPath()
  ctx.moveTo(0, -16)
  ctx.lineTo(8, 10)
  ctx.lineTo(-8, 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f2f2f2'
  ctx.beginPath()
  ctx.moveTo(0, -12)
  ctx.lineTo(10, 4)
  ctx.lineTo(0, 4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Rain streaks + a dark vignette, drawn over everything (outside the
// shaken world transform) so the warning stays legible while the world
// itself is being buffeted.
function drawStormOverlay() {
  ctx.fillStyle = 'rgba(10,10,20,0.3)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(200,210,230,0.35)'
  ctx.lineWidth = 1.5
  const spacing = 26
  const slant = 14
  const scroll = (state.elapsed * 420) % spacing
  ctx.beginPath()
  for (let x = -spacing * 2; x < canvas.width + spacing * 2; x += spacing) {
    const sx = x + scroll
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx - slant, canvas.height)
  }
  ctx.stroke()
}

function drawStormRadar() {
  const info = nearestTyphoonInfo(state.boat.x, state.boat.y)
  if (!info) return
  if (state.activeTyphoon) {
    ctx.fillStyle = '#ff5c5c'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('⚠ 태풍 속! 조타 불안정 · 선체 손상', 16, 164)
    return
  }
  if (info.dist > TYPHOON_WARN_RADIUS * 2.2) return
  const angle = Math.atan2(info.typhoon.y - state.boat.y, info.typhoon.x - state.boat.x)
  const cx = canvas.width - 70
  const cy = 170
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 26, 0, TAU)
  ctx.stroke()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle + Math.PI / 2)
  ctx.fillStyle = info.dist < TYPHOON_WARN_RADIUS ? '#ff5c5c' : '#ffb84d'
  ctx.beginPath()
  ctx.moveTo(0, -22)
  ctx.lineTo(6, -8)
  ctx.lineTo(-6, -8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = '#fff'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`태풍 ${Math.round(info.dist)}m`, cx, cy + 42)
  ctx.textAlign = 'left'
}

function formatTime(t) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function drawWindCompass(info) {
  const cx = canvas.width - 70
  const cy = 70
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 40, 0, TAU)
  ctx.stroke()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(info.windFrom)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(0, -34)
  ctx.lineTo(7, -14)
  ctx.lineTo(-7, -14)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = '#fff'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('바람', cx, cy + 54)
}

function drawHud() {
  const info = pointOfSailInfo()
  // a soft panel behind the readout so it stays legible over ports and islands
  ctx.fillStyle = 'rgba(6,16,32,0.62)'
  ctx.beginPath()
  ctx.roundRect(8, 8, 392, 150, 10)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(`시간 ${formatTime(state.elapsed)}`, 16, 16)

  ctx.font = '14px sans-serif'
  const cpIdx = Math.min(state.checkpointIndex, CHECKPOINTS.length - 1)
  const cpLabel = CHECKPOINTS[cpIdx].label
  ctx.fillText(
    `체크포인트 ${Math.min(state.checkpointIndex + 1, CHECKPOINTS.length)} / ${CHECKPOINTS.length} (목표: ${cpLabel === 'FINISH' ? '결승선' : cpLabel + '번'})`,
    16,
    42,
  )
  const best = readBestTime()
  ctx.fillText(`최고 기록: ${best ? formatTime(best) : '-'}`, 16, 64)

  ctx.fillStyle = info.color
  ctx.fillText(`풍각: ${info.label} (${Math.round(info.sailAngleDeg)}°) 속도 ${(info.mult * 100).toFixed(0)}%`, 16, 90)

  ctx.fillStyle = '#ffd23f'
  ctx.fillText(`골드: ${state.gold}`, 16, 112)
  ctx.fillStyle = '#cfe8ff'
  ctx.fillText('선체', 120, 112)
  hullBar(158, 115, 110, 12)
  ctx.fillStyle = state.hull < maxHull() * 0.3 ? '#ff5c5c' : '#cfe8ff'
  ctx.fillText(`${Math.max(0, Math.ceil(state.hull))}/${maxHull()}`, 276, 112)
  const c = state.contract
  ctx.fillStyle = c ? '#5cc9ff' : 'rgba(255,255,255,0.6)'
  ctx.fillText(
    c ? `화물 ${holdCount()}/${holdCap()} · 의뢰: ${contractLabel(c)}` : `화물 ${holdCount()}/${holdCap()} · 항구에서 사고팔고 의뢰를 받아 보세요`,
    16,
    134,
  )

  drawWindCompass(info)
  drawStormRadar()
}

function drawFinishOverlay() {
  ctx.fillStyle = 'rgba(10,20,30,0.75)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 32px sans-serif'
  ctx.fillText('\u{1F3C1} 완주!', canvas.width / 2, canvas.height / 2 - 60)
  ctx.font = '22px sans-serif'
  ctx.fillText(`기록: ${formatTime(state.finishTime)}`, canvas.width / 2, canvas.height / 2 - 10)
  if (state.isNewBest) {
    ctx.fillStyle = '#ffd23f'
    ctx.fillText('신기록!', canvas.width / 2, canvas.height / 2 + 25)
  }
  ctx.fillStyle = '#ffd23f'
  ctx.font = '18px sans-serif'
  ctx.fillText(`보유 골드 ${state.gold} · 선체 ${Math.ceil(state.hull)}/${maxHull()}`, canvas.width / 2, canvas.height / 2 + 48)
  ctx.fillStyle = '#ccc'
  ctx.font = '16px sans-serif'
  ctx.fillText('R 키를 눌러 다시 시작', canvas.width / 2, canvas.height / 2 + 84)
}

function drawTitleOverlay() {
  const W = canvas.width
  const H = canvas.height
  const t = performance.now() / 1000
  const shade = ctx.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(6,24,44,0.86)')
  shade.addColorStop(1, 'rgba(6,24,44,0.55)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)

  // big sailboat riding a swell
  const bx = W / 2
  const by = H * 0.56 + Math.sin(t * 1.6) * 6
  ctx.save()
  ctx.translate(bx, by)
  ctx.rotate(Math.sin(t * 1.6 + 0.6) * 0.05)
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.moveTo(-90, 0)
  ctx.quadraticCurveTo(-70, 36, 0, 38)
  ctx.quadraticCurveTo(70, 36, 100, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#6b4322'
  ctx.fillRect(-84, 0, 178, 6)
  ctx.fillStyle = '#4a3320'
  ctx.fillRect(-3, -150, 6, 152)
  const billow = 18 + Math.sin(t * 2.2) * 5
  ctx.fillStyle = '#fdfaf0'
  ctx.beginPath()
  ctx.moveTo(4, -146)
  ctx.quadraticCurveTo(70 + billow, -90, 84, -12)
  ctx.lineTo(4, -12)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffd23f'
  ctx.beginPath()
  ctx.moveTo(-4, -130)
  ctx.quadraticCurveTo(-46 - billow * 0.5, -80, -62, -14)
  ctx.lineTo(-4, -14)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e04a4a'
  ctx.beginPath()
  ctx.moveTo(3, -150)
  ctx.lineTo(30 + Math.sin(t * 6) * 4, -158)
  ctx.lineTo(3, -166)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 3
  for (let i = 0; i < 3; i++) {
    const wy = H * 0.56 + 44 + i * 16
    ctx.beginPath()
    for (let x = bx - 190; x <= bx + 190; x += 10) {
      const y = wy + Math.sin(x * 0.045 + t * 2.4 + i) * 5
      if (x === bx - 190) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.font = 'bold 52px sans-serif'
  ctx.strokeStyle = 'rgba(4,16,30,0.9)'
  ctx.lineWidth = 8
  ctx.strokeText('항해 시뮬레이션', W / 2, H * 0.2)
  ctx.fillStyle = '#ffd23f'
  ctx.fillText('항해 시뮬레이션', W / 2, H * 0.2)
  ctx.font = '16px sans-serif'
  ctx.fillStyle = '#cfe8ff'
  ctx.fillText('바람을 읽어 체크포인트를 돌고, 항구에서 사고팔고 · 대화하고 · 정비하세요', W / 2, H * 0.2 + 32)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText('A/D 또는 ←/→ 조타 · 항구에서 E 메뉴 · R 재시작 · M 소리 켜기/끄기', W / 2, H * 0.86)
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.45
  ctx.font = 'bold 18px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText('아무 키나 누르거나 클릭해서 출항', W / 2, H * 0.93)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  hits = []
  if (state.phase === 'racing' && !state.ui) updateRacing(dt)
  if (state.phase === 'racing' && !state.ui) updateDock()

  const inStorm = !!state.activeTyphoon && !state.ui
  ctx.save()
  if (inStorm) {
    ctx.translate(Math.sin(state.elapsed * 37) * 2.5, Math.cos(state.elapsed * 29) * 2.5)
  }
  drawSea()
  drawIslands()
  drawPorts()
  drawCheckpoints()
  drawTyphoons()
  drawWake()
  drawBoat()
  ctx.restore()
  if (inStorm) drawStormOverlay()
  drawHud()
  if (state.phase === 'finished') drawFinishOverlay()
  if (state.ui) drawPortMenu()
  if (state.phase === 'title') drawTitleOverlay()
  drawToast()

  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
