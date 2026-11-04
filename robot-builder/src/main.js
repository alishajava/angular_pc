const app = document.getElementById('app')

const STAT_KEYS = ['power', 'speed', 'durability', 'precision', 'efficiency']
const STAT_LABELS = { power: '파워', speed: '속도', durability: '내구성', precision: '정밀도', efficiency: '효율' }

// --- Part catalog -----------------------------------------------------------
const CHASSIS_OPTIONS = [
  { key: 'light', label: '경량형 프레임', desc: '가볍고 민첩하지만 장갑이 얇다', wFrac: 0.34, stats: { power: 4, speed: 18, durability: 4, precision: 10, efficiency: 12 } },
  { key: 'standard', label: '표준형 프레임', desc: '모든 면에서 무난한 균형형', wFrac: 0.4, stats: { power: 10, speed: 10, durability: 10, precision: 10, efficiency: 10 } },
  { key: 'heavy', label: '중장갑형 프레임', desc: '느리지만 압도적인 내구성', wFrac: 0.5, stats: { power: 16, speed: 2, durability: 20, precision: 4, efficiency: 4 } },
]
const HEAD_OPTIONS = [
  { key: 'scout', label: '정찰형 카메라 헤드', desc: '단일 렌즈로 정밀 관측에 특화', stats: { precision: 14, efficiency: 6, power: 0, speed: 0, durability: 0 } },
  { key: 'visor', label: '휴머노이드 바이저 헤드', desc: '균형 잡힌 범용 센서 구조', stats: { precision: 8, power: 4, speed: 4, durability: 0, efficiency: 0 } },
  { key: 'sensorarray', label: '다중 센서 헤드', desc: '폭넓은 인식 범위, 정밀도 특화', stats: { precision: 18, power: 2, speed: 0, durability: 0, efficiency: 0 } },
]
const ARM_OPTIONS = [
  { key: 'gripper', label: '그리퍼 암', desc: '정교한 작업에 적합한 집게형', stats: { precision: 10, power: 4, speed: 0, durability: 0, efficiency: 0 } },
  { key: 'blade', label: '블레이드 암', desc: '강력한 공격력의 블레이드형', stats: { power: 16, precision: 2, durability: 4, speed: 0, efficiency: 0 } },
  { key: 'multitool', label: '다용도 암', desc: '다양한 작업 도구가 결합된 형태', stats: { efficiency: 12, precision: 6, power: 0, speed: 0, durability: 0 } },
]
const LEG_OPTIONS = [
  { key: 'wheels', label: '바퀴형 하체', desc: '빠른 기동력, 험지에는 약함', stats: { speed: 18, efficiency: 8, durability: 2, power: 0, precision: 0 } },
  { key: 'biped', label: '이족보행형 다리', desc: '다양한 지형에 대응하는 범용 보행', stats: { speed: 8, precision: 8, durability: 6, power: 0, efficiency: 0 } },
  { key: 'treads', label: '트랙형 하체', desc: '험지에서도 안정적인 강인한 주행', stats: { durability: 16, power: 6, speed: 2, precision: 0, efficiency: 0 } },
]
const CORE_OPTIONS = [
  { key: 'standard', label: '표준 배터리 코어', desc: '안정적이고 무난한 기본 동력원', color: '#3fd0c9', stats: { efficiency: 14, power: 4, speed: 0, durability: 0, precision: 0 } },
  { key: 'highpower', label: '고출력 코어', desc: '강력한 파워, 효율은 다소 낮음', color: '#ff8a3f', stats: { power: 18, efficiency: 2, speed: 0, durability: 0, precision: 0 } },
  { key: 'eco', label: '친환경 코어', desc: '뛰어난 효율과 지속 가동력', color: '#5fe07a', stats: { efficiency: 20, durability: 4, power: 0, speed: 0, precision: 0 } },
]
const COLOR_OPTIONS = [
  { key: 'steel', label: '스틸 그레이', hex: '#8a94a0' },
  { key: 'crimson', label: '크림슨 레드', hex: '#d9503f' },
  { key: 'azure', label: '아주어 블루', hex: '#3f7fd9' },
  { key: 'amber', label: '앰버 오렌지', hex: '#e8822a' },
  { key: 'onyx', label: '오닉스 블랙', hex: '#2b2f35' },
  { key: 'ivory', label: '아이보리 화이트', hex: '#d8dde3' },
]

const STEPS = [
  { key: 'chassis', title: '프레임 선택', options: CHASSIS_OPTIONS, kind: 'card' },
  { key: 'head', title: '헤드 선택', options: HEAD_OPTIONS, kind: 'card' },
  { key: 'arm', title: '암 유닛 선택', options: ARM_OPTIONS, kind: 'card' },
  { key: 'leg', title: '하체 선택', options: LEG_OPTIONS, kind: 'card' },
  { key: 'core', title: '코어 선택', options: CORE_OPTIONS, kind: 'card' },
  { key: 'color', title: '도색 선택', options: COLOR_OPTIONS, kind: 'swatch' },
]

// --- Canvas art helpers -------------------------------------------------------
function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16)
  let r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
  if (amt >= 0) {
    r += (255 - r) * amt
    g += (255 - g) * amt
    b += (255 - b) * amt
  } else {
    r *= 1 + amt
    g *= 1 + amt
    b *= 1 + amt
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function metalFill(ctx, x, y, w, h, r, baseColor) {
  roundRectPath(ctx, x, y, w, h, r)
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, shade(baseColor, 0.42))
  grad.addColorStop(0.45, shade(baseColor, 0.04))
  grad.addColorStop(1, shade(baseColor, -0.3))
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1.4
  ctx.stroke()
}

function rivet(ctx, x, y, baseColor, r = 2.1) {
  ctx.fillStyle = shade(baseColor, -0.45)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = shade(baseColor, 0.35)
  ctx.beginPath()
  ctx.arc(x - 0.5, y - 0.5, r * 0.4, 0, Math.PI * 2)
  ctx.fill()
}

function glow(ctx, x, y, radius, color, intensity = 1) {
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.13 * i * intensity
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, radius * (1 + i * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = Math.min(1, intensity)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

function placeholderSlot(ctx, x, y, w, h) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1.5
  roundRectPath(ctx, x, y, w, h, 8)
  ctx.stroke()
  ctx.restore()
}

function bodyHalfWidth(chassisKey, W) {
  const spec = CHASSIS_OPTIONS.find((c) => c.key === chassisKey)
  return (W * (spec ? spec.wFrac : 0.4)) / 2
}

function drawChassis(ctx, key, cx, topY, bottomY, paint, W) {
  const spec = CHASSIS_OPTIONS.find((c) => c.key === key)
  const w = W * spec.wFrac
  const h = bottomY - topY
  const x = cx - w / 2
  metalFill(ctx, x, topY, w, h, 10, paint)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + 6, topY + h * 0.42)
  ctx.lineTo(x + w - 6, topY + h * 0.42)
  ctx.stroke()
  rivet(ctx, x + 7, topY + 7, paint)
  rivet(ctx, x + w - 7, topY + 7, paint)
  rivet(ctx, x + 7, bottomY - 7, paint)
  rivet(ctx, x + w - 7, bottomY - 7, paint)
  if (key === 'heavy') {
    metalFill(ctx, x - 10, topY + 2, 12, h * 0.4, 4, shade(paint, -0.08))
    metalFill(ctx, x + w - 2, topY + 2, 12, h * 0.4, 4, shade(paint, -0.08))
  }
  return { x, w, h }
}

function drawHead(ctx, key, cx, centerY, paint) {
  const baseW = 56, baseH = 44
  const x = cx - baseW / 2, y = centerY - baseH / 2
  metalFill(ctx, x, y, baseW, baseH, 10, paint)
  if (key === 'scout') {
    ctx.strokeStyle = shade(paint, -0.2)
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(cx, y)
    ctx.lineTo(cx, y - 9)
    ctx.stroke()
    ctx.fillStyle = '#ff5a4d'
    ctx.beginPath()
    ctx.arc(cx, y - 11, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, centerY + 2, 10, 0, Math.PI * 2)
    ctx.stroke()
    glow(ctx, cx, centerY + 2, 7.5, '#5fd0ff', 1)
  } else if (key === 'visor') {
    ctx.fillStyle = '#0d1114'
    roundRectPath(ctx, x + 6, centerY - 8, baseW - 12, 13, 4)
    ctx.fill()
    const grad = ctx.createLinearGradient(x + 6, 0, x + baseW - 6, 0)
    grad.addColorStop(0, 'rgba(95,208,255,0)')
    grad.addColorStop(0.5, 'rgba(95,208,255,0.95)')
    grad.addColorStop(1, 'rgba(95,208,255,0)')
    ctx.fillStyle = grad
    roundRectPath(ctx, x + 9, centerY - 4, baseW - 18, 6, 3)
    ctx.fill()
  } else if (key === 'sensorarray') {
    for (const dx of [-14, 0, 14]) glow(ctx, cx + dx, centerY + 2, 3.6, '#5fd0ff', 0.95)
  }
}

function drawArms(ctx, key, cx, shoulderY, bodyHalfW, paint) {
  for (const sign of [-1, 1]) {
    const ax = cx + sign * (bodyHalfW + 9)
    metalFill(ctx, ax - 8, shoulderY, 16, 32, 5, paint)
    const handY = shoulderY + 32
    if (key === 'gripper') {
      ctx.strokeStyle = shade(paint, -0.25)
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(ax - 6, handY)
      ctx.lineTo(ax - 10, handY + 9)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ax + 6, handY)
      ctx.lineTo(ax + 10, handY + 9)
      ctx.stroke()
    } else if (key === 'blade') {
      ctx.fillStyle = '#c7ccd1'
      ctx.beginPath()
      ctx.moveTo(ax - 5, handY)
      ctx.lineTo(ax + 5, handY)
      ctx.lineTo(ax + sign * 3, handY + 22)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else if (key === 'multitool') {
      for (const dx of [-5, 0, 5]) {
        ctx.fillStyle = shade(paint, -0.2)
        ctx.fillRect(ax + dx - 1.4, handY, 2.8, 9)
      }
    }
  }
}

function drawLegs(ctx, key, cx, bodyHalfW, topY, bottomY, paint) {
  if (key === 'wheels') {
    for (const sign of [-1, 1]) {
      const wx = cx + sign * bodyHalfW * 0.5
      const wy = (topY + bottomY) / 2
      const r = ((bottomY - topY) / 2) * 0.9
      ctx.fillStyle = '#1b1f24'
      ctx.beginPath()
      ctx.arc(wx, wy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.strokeStyle = paint
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(wx, wy, r * 0.55, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (key === 'biped') {
    for (const sign of [-1, 1]) {
      const lx = cx + sign * bodyHalfW * 0.45
      metalFill(ctx, lx - 6, topY, 12, bottomY - topY - 8, 4, paint)
      metalFill(ctx, lx - 9, bottomY - 8, 18, 8, 3, shade(paint, -0.15))
    }
  } else if (key === 'treads') {
    const w = bodyHalfW * 2 + 14
    metalFill(ctx, cx - w / 2, topY + 4, w, bottomY - topY - 4, 8, '#1b1f24')
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(cx - w / 2 + 6 + i * ((w - 12) / 6), topY + 7, 3.5, bottomY - topY - 10)
    }
  }
}

function drawCore(ctx, key, cx, coreY, intensity = 1) {
  const spec = CORE_OPTIONS.find((c) => c.key === key)
  glow(ctx, cx, coreY, 7 + (spec.key === 'highpower' ? 2 : 0), spec.color, intensity)
}

function drawRobot(canvas, build) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const cx = W / 2
  const headCenterY = H * 0.17
  const bodyTopY = H * 0.3
  const bodyBottomY = H * 0.64
  const legTopY = bodyBottomY
  const legBottomY = H * 0.92

  const paint = COLOR_OPTIONS.find((c) => c.key === build.colorKey)?.hex || '#8a94a0'

  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(cx, H * 0.95, W * 0.3, H * 0.022, 0, 0, Math.PI * 2)
  ctx.fill()

  const bodyHalfW = bodyHalfWidth(build.chassisKey, W)

  if (build.legKey) drawLegs(ctx, build.legKey, cx, bodyHalfW, legTopY, legBottomY, paint)
  else placeholderSlot(ctx, cx - 30, legTopY, 60, legBottomY - legTopY)

  if (build.chassisKey) drawChassis(ctx, build.chassisKey, cx, bodyTopY, bodyBottomY, paint, W)
  else placeholderSlot(ctx, cx - 36, bodyTopY, 72, bodyBottomY - bodyTopY)

  if (build.coreKey && build.chassisKey) {
    drawCore(ctx, build.coreKey, cx, bodyTopY + (bodyBottomY - bodyTopY) * 0.45, build.poweredOn ? build.pulse ?? 1 : 1)
  }

  if (build.armKey) drawArms(ctx, build.armKey, cx, bodyTopY + 4, bodyHalfW, paint)
  else {
    placeholderSlot(ctx, cx - bodyHalfW - 26, bodyTopY, 18, 38)
    placeholderSlot(ctx, cx + bodyHalfW + 8, bodyTopY, 18, 38)
  }

  if (build.headKey) drawHead(ctx, build.headKey, cx, headCenterY, paint)
  else placeholderSlot(ctx, cx - 28, headCenterY - 22, 56, 44)
}

// --- Stats --------------------------------------------------------------------
function computeStats(build) {
  const totals = { power: 0, speed: 0, durability: 0, precision: 0, efficiency: 0 }
  const parts = [
    CHASSIS_OPTIONS.find((o) => o.key === build.chassisKey),
    HEAD_OPTIONS.find((o) => o.key === build.headKey),
    ARM_OPTIONS.find((o) => o.key === build.armKey),
    LEG_OPTIONS.find((o) => o.key === build.legKey),
    CORE_OPTIONS.find((o) => o.key === build.coreKey),
  ]
  for (const p of parts) {
    if (!p) continue
    for (const k of STAT_KEYS) totals[k] += p.stats[k] || 0
  }
  return totals
}

function computeVerdict(stats) {
  const entries = STAT_KEYS.map((k) => [k, stats[k]])
  const max = Math.max(...entries.map((e) => e[1]))
  const min = Math.min(...entries.map((e) => e[1]))
  const top = entries.filter(([, v]) => v === max)
  if (top.length >= 3 || max - min < 8) {
    return '모든 능력이 고르게 균형 잡힌 다목적 로봇이 완성되었습니다.'
  }
  const texts = {
    power: '압도적인 화력을 갖춘 전투형 로봇이 완성되었습니다.',
    speed: '누구보다 빠르게 움직이는 정찰·기동형 로봇이 완성되었습니다.',
    durability: '무엇에도 쉽게 쓰러지지 않는 견고한 로봇이 완성되었습니다.',
    precision: '정밀한 작업에 특화된 섬세한 로봇이 완성되었습니다.',
    efficiency: '오래도록 안정적으로 가동되는 효율적인 로봇이 완성되었습니다.',
  }
  return texts[top[0][0]]
}

// --- State ----------------------------------------------------------------
function freshState() {
  return {
    phase: 'title',
    name: '',
    stepIndex: 0,
    build: { chassisKey: null, headKey: null, armKey: null, legKey: null, coreKey: null, colorKey: 'steel' },
  }
}
let state = freshState()
let animFrameId = null

function stopResultAnimation() {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  animFrameId = null
}

// --- Render -----------------------------------------------------------------
function render() {
  if (state.phase === 'title') return renderTitle()
  if (state.phase === 'build') return renderBuild()
  if (state.phase === 'result') return renderResult()
}

function renderTitle() {
  stopResultAnimation()
  app.innerHTML = `
    <div class="title-wrap">
      <h1>로봇 만들기 시뮬레이터</h1>
      <div class="subtitle">프레임부터 코어까지, 단계별로 부품을 골라 나만의 로봇을 직접 조립해 보세요.<br/>고른 부품은 그 자리에서 바로 로봇에 장착됩니다.</div>
      <div class="field-row">
        <label>로봇 이름</label>
        <input id="name-input" type="text" maxlength="12" placeholder="예: RX-01" value="RX-01" />
      </div>
      <button class="primary-btn" id="start-btn">조립 시작</button>
      <div class="hint">프레임 → 헤드 → 암 → 하체 → 코어 → 도색 순서로 6단계를 거쳐 로봇을 완성합니다. 각 부품은 파워/속도/내구성/정밀도/효율 능력치에 영향을 줍니다.</div>
    </div>
  `
  document.getElementById('start-btn').onclick = () => {
    const nameInput = document.getElementById('name-input')
    state.name = nameInput.value.trim() || 'RX-01'
    state.phase = 'build'
    state.stepIndex = 0
    render()
  }
}

function miniStatGrid(stats) {
  return `
    <div class="stat-mini-grid">
      ${STAT_KEYS.map((k) => `<div class="stat-mini"><span>${STAT_LABELS[k]}</span><b>${stats[k]}</b></div>`).join('')}
    </div>
  `
}

function renderBuild() {
  stopResultAnimation()
  const step = STEPS[state.stepIndex]
  const stats = computeStats(state.build)
  const canSize = 230
  app.innerHTML = `
    <div class="build-wrap">
      <div class="topbar">
        <span class="step-tag">STEP ${state.stepIndex + 1} / ${STEPS.length}</span>
        <span>${step.title}</span>
      </div>
      <div class="body-row">
        <div class="preview-col">
          <canvas id="preview-canvas" width="${canSize}" height="280"></canvas>
          <div class="robot-name">${state.name}</div>
          ${miniStatGrid(stats)}
        </div>
        <div class="option-col">
          <h2>${step.title}</h2>
          ${
            step.kind === 'card'
              ? step.options
                  .map(
                    (o) => `<button class="option-card ${state.build[step.key + 'Key'] === o.key ? 'selected' : ''}" data-key="${o.key}">
                      <span class="opt-name">${o.label}</span>
                      <span class="opt-desc">${o.desc}</span>
                    </button>`,
                  )
                  .join('')
              : `<div class="swatch-grid">
                  ${step.options
                    .map(
                      (o) => `<div class="swatch ${state.build.colorKey === o.key ? 'selected' : ''}" data-key="${o.key}" style="background:${o.hex}" title="${o.label}"></div>`,
                    )
                    .join('')}
                </div>`
          }
          <div class="wizard-nav">
            <button class="nav-btn" id="prev-btn" ${state.stepIndex === 0 ? 'disabled' : ''}>이전</button>
            <button class="nav-btn primary" id="next-btn" ${state.build[step.key + 'Key'] ? '' : 'disabled'}>
              ${state.stepIndex === STEPS.length - 1 ? '조립 완료' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
  const canvas = document.getElementById('preview-canvas')
  drawRobot(canvas, state.build)

  const selectors = step.kind === 'card' ? '.option-card' : '.swatch'
  document.querySelectorAll(selectors).forEach((el) => {
    el.onclick = () => {
      state.build[step.key + 'Key'] = el.dataset.key
      render()
    }
  })
  document.getElementById('prev-btn').onclick = () => {
    if (state.stepIndex > 0) {
      state.stepIndex -= 1
      render()
    }
  }
  document.getElementById('next-btn').onclick = () => {
    if (!state.build[step.key + 'Key']) return
    if (state.stepIndex < STEPS.length - 1) {
      state.stepIndex += 1
      render()
    } else {
      state.phase = 'result'
      render()
    }
  }
}

function renderResult() {
  const stats = computeStats(state.build)
  const verdict = computeVerdict(stats)
  app.innerHTML = `
    <div class="result-wrap">
      <canvas id="result-canvas" width="240" height="300"></canvas>
      <h2 class="result-title">${state.name} 가동 시작</h2>
      <div class="result-verdict">${verdict}</div>
      <div class="result-stats">
        ${STAT_KEYS.map((k) => `<div class="result-stat"><div class="label">${STAT_LABELS[k]}</div><div class="value">${stats[k]}</div></div>`).join('')}
      </div>
      <button class="restart-btn" id="restart-btn">새 로봇 만들기</button>
    </div>
  `
  const canvas = document.getElementById('result-canvas')
  const start = performance.now()
  function loop(t) {
    const elapsed = (t - start) / 1000
    const pulse = 0.85 + Math.sin(elapsed * 2.2) * 0.2
    drawRobot(canvas, { ...state.build, poweredOn: true, pulse })
    animFrameId = requestAnimationFrame(loop)
  }
  animFrameId = requestAnimationFrame(loop)

  document.getElementById('restart-btn').onclick = () => {
    stopResultAnimation()
    state = freshState()
    render()
  }
}

render()
