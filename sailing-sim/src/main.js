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
  { id: 'home', x: 60, y: 300, name: '기항지' },
  { id: 'north', x: 380, y: 200, name: '북쪽 항구' },
  { id: 'west', x: -150, y: -5, name: '서쪽 항구' },
]
const DOCK_RADIUS = 42
const CARGO_GOODS = ['목재', '향신료', '곡물', '도자기', '모피']

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
const TYPHOON_PULL_STRENGTH = 45 // px/s drawing the boat toward the eye, so it can't just drift out
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
    gold: 0,
    cargo: null, // { good, fromId, toId, reward }
    dockedPortId: null,
    toast: null, // { text, until }
    typhoons: [],
    nextTyphoonAt: TYPHOON_FIRST_AT,
    activeTyphoon: null,
    wasInStorm: false,
    stormCargoTimer: 0,
  }
}
let state = makeInitialState()

const heldKeys = new Set()
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  heldKeys.add(key)
  if (key === 'r') state = makeInitialState()
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))
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
  state.typhoons.push({
    x: b.minX + Math.random() * (b.maxX - b.minX),
    y: b.minY + Math.random() * (b.maxY - b.minY),
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    bornAt: state.elapsed,
    phase: Math.random() * TAU,
  })
  state.nextTyphoonAt = state.elapsed + TYPHOON_INTERVAL
  showToast('태풍 발생! 소용돌이 구름을 피해 항해하세요')
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
  }
}

function updateRacing(dt) {
  state.elapsed += dt
  state.windTime += dt

  spawnTyphoonsIfDue()
  updateTyphoons(dt)
  state.activeTyphoon = findActiveTyphoon(state.boat.x, state.boat.y)
  const inStorm = !!state.activeTyphoon
  if (inStorm !== state.wasInStorm) {
    showToast(inStorm ? '태풍 속으로 진입! 조타가 불안정해집니다' : '태풍을 빠져나왔다')
    state.wasInStorm = inStorm
  }

  if (held(['a', 'arrowleft'])) state.boat.heading -= TURN_RATE * dt
  if (held(['d', 'arrowright'])) state.boat.heading += TURN_RATE * dt

  const { mult } = pointOfSailInfo()
  const dragMult = inStorm ? TYPHOON_SPEED_DRAG : 1
  state.boat.speed = BASE_SPEED * mult * dragMult
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

    if (state.cargo) {
      state.stormCargoTimer += dt
      if (state.stormCargoTimer >= CARGO_LOSS_CHECK_INTERVAL) {
        state.stormCargoTimer = 0
        if (Math.random() < CARGO_LOSS_CHANCE) {
          showToast(`태풍에 ${state.cargo.good}을(를) 잃어버렸다!`)
          state.cargo = null
        }
      }
    }
  } else {
    state.stormCargoTimer = 0
  }

  resolveIslandCollisions()

  state.wake.push({ x: state.boat.x, y: state.boat.y, t: state.elapsed })
  if (state.wake.length > 60) state.wake.shift()

  const target = CHECKPOINTS[state.checkpointIndex]
  const dist = Math.hypot(state.boat.x - target.x, state.boat.y - target.y)
  if (dist < CHECKPOINT_RADIUS) {
    state.checkpointIndex += 1
    if (state.checkpointIndex >= CHECKPOINTS.length) {
      state.phase = 'finished'
      state.finishTime = state.elapsed
      const best = readBestTime()
      if (!best || state.finishTime < best) {
        writeBestTime(state.finishTime)
        state.isNewBest = true
      }
    }
  }
}

function showToast(text) {
  state.toast = { text, until: state.elapsed + 2.5 }
}

// Pickup/delivery triggers on the frame the boat *enters* a port's dock
// radius, not every frame it sits inside - dockedPortId tracks "which port
// (if any) am I currently docked at" so re-entering the same port without
// leaving doesn't re-fire the same event.
function updateCargo() {
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
  if (!here) return

  if (state.cargo && state.cargo.toId === here.id) {
    state.gold += state.cargo.reward
    showToast(`배달 완료! ${state.cargo.good} 운송 +${state.cargo.reward} 골드`)
    state.cargo = null
    return
  }
  if (!state.cargo) {
    const destinations = PORTS.filter((p) => p.id !== here.id)
    const dest = destinations[Math.floor(Math.random() * destinations.length)]
    const good = CARGO_GOODS[Math.floor(Math.random() * CARGO_GOODS.length)]
    const reward = 40 + Math.floor(Math.random() * 40)
    state.cargo = { good, fromId: here.id, toId: dest.id, reward }
    showToast(`${good} 선적 완료 → ${dest.name}로 배달하세요`)
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

function drawPorts() {
  for (const port of PORTS) {
    const p = worldToScreen(port.x, port.y)
    if (p.x < -60 || p.x > canvas.width + 60 || p.y < -60 || p.y > canvas.height + 60) continue
    const isDocked = state.dockedPortId === port.id
    const isCargoDest = state.cargo && state.cargo.toId === port.id

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
    ctx.fillText('⚠ 태풍 속! 조타 불안정', 16, 156)
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
  ctx.fillStyle = state.cargo ? '#5cc9ff' : 'rgba(255,255,255,0.6)'
  const destName = state.cargo ? PORTS.find((p) => p.id === state.cargo.toId).name : null
  ctx.fillText(
    state.cargo ? `화물: ${state.cargo.good} → ${destName} (+${state.cargo.reward})` : '화물: 없음 (항구에 정박해서 수령)',
    16,
    134,
  )

  drawWindCompass(info)
  drawStormRadar()

  if (state.toast && state.elapsed < state.toast.until) {
    const alpha = Math.min(1, (state.toast.until - state.elapsed) / 0.5)
    ctx.globalAlpha = alpha
    ctx.fillStyle = 'rgba(10,20,30,0.78)'
    ctx.font = 'bold 15px sans-serif'
    const w = ctx.measureText(state.toast.text).width + 32
    ctx.textAlign = 'center'
    ctx.fillRect(canvas.width / 2 - w / 2, 16, w, 32)
    ctx.fillStyle = '#ffd23f'
    ctx.fillText(state.toast.text, canvas.width / 2, 32)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  }
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
  ctx.fillStyle = '#ccc'
  ctx.font = '16px sans-serif'
  ctx.fillText('R 키를 눌러 다시 시작', canvas.width / 2, canvas.height / 2 + 70)
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  if (state.phase === 'racing') updateRacing(dt)
  updateCargo()

  const inStorm = !!state.activeTyphoon
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

  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
