const app = document.getElementById('app')

const STAT_KEYS = ['chore', 'speed', 'durability', 'precision', 'charm']
const STAT_LABELS = { chore: '가사력', speed: '속도', durability: '내구성', precision: '정밀도', charm: '친화력' }

// --- Part catalog -----------------------------------------------------------
const CHASSIS_OPTIONS = [
  { key: 'slim', label: '슬림형 바디', desc: '가볍고 날렵한 몸체', wFrac: 0.3, flare: 1.3, stats: { chore: 6, speed: 16, durability: 4, precision: 10, charm: 8 } },
  { key: 'standard', label: '스탠다드형 바디', desc: '균형 잡힌 기본형 몸체', wFrac: 0.36, flare: 1.5, stats: { chore: 10, speed: 10, durability: 10, precision: 10, charm: 10 } },
  { key: 'round', label: '볼륨형 바디', desc: '통통하고 안정적인 몸체', wFrac: 0.42, flare: 1.85, stats: { chore: 8, speed: 2, durability: 16, precision: 4, charm: 18 } },
]
const HEAD_OPTIONS = [
  { key: 'ribbon', label: '리본 헤드', desc: '큼직한 리본이 포인트', stats: { charm: 16, precision: 4, chore: 0, speed: 0, durability: 0 } },
  { key: 'headband', label: '메이드 헤어밴드 헤드', desc: '단정한 클래식 메이드 룩', stats: { chore: 12, precision: 8, charm: 0, speed: 0, durability: 0 } },
  { key: 'catear', label: '캣이어 안테나 헤드', desc: '장난기 가득한 고양이 귀 안테나', stats: { speed: 8, charm: 10, chore: 0, precision: 0, durability: 0 } },
]
const ARM_OPTIONS = [
  { key: 'glove', label: '그리퍼 장갑 암', desc: '동글동글 귀여운 장갑형 손', stats: { precision: 10, chore: 6, charm: 0, speed: 0, durability: 0 } },
  { key: 'tray', label: '서빙 트레이 암', desc: '차 한 잔 내올 수 있는 쟁반형', stats: { chore: 16, precision: 2, charm: 0, speed: 0, durability: 0 } },
  { key: 'ribboncuff', label: '리본 커프스 암', desc: '손목의 작은 리본이 매력 포인트', stats: { charm: 10, speed: 4, chore: 0, precision: 0, durability: 0 } },
]
const LEG_OPTIONS = [
  { key: 'apronskirt', label: '에이프런 스커트형', desc: '치마처럼 펼쳐진 사랑스러운 하체', stats: { charm: 14, chore: 6, speed: 0, precision: 0, durability: 0 } },
  { key: 'bipedboots', label: '이족보행 부츠형', desc: '앙증맞은 부츠를 신은 두 다리', stats: { speed: 10, precision: 8, durability: 4, chore: 0, charm: 0 } },
  { key: 'hoverbase', label: '호버링 베이스', desc: '사뿐히 떠다니는 우아한 베이스', stats: { speed: 14, durability: 2, charm: 6, chore: 0, precision: 0 } },
]
const CORE_OPTIONS = [
  { key: 'heart', label: '하트 코어', desc: '사랑스럽게 두근거리는 하트형 동력원', color: '#ff7fa0', shape: 'heart', stats: { charm: 18, chore: 4, speed: 0, precision: 0, durability: 0 } },
  { key: 'star', label: '별 코어', desc: '반짝반짝 빛나는 별형 동력원', color: '#ffd76a', shape: 'star', stats: { precision: 10, speed: 8, chore: 0, charm: 0, durability: 0 } },
  { key: 'ribbonbow', label: '리본 코어', desc: '매듭 모양으로 빛나는 동력원', color: '#c9a6ff', shape: 'bow', stats: { chore: 10, charm: 8, speed: 0, precision: 0, durability: 0 } },
]
const COLOR_OPTIONS = [
  { key: 'pink', label: '페일 핑크', hex: '#f7b8c6' },
  { key: 'mint', label: '민트 그린', hex: '#a8e0cb' },
  { key: 'lavender', label: '라벤더', hex: '#c9b8e8' },
  { key: 'cream', label: '아이보리 크림', hex: '#f3ead9' },
  { key: 'sky', label: '스카이 블루', hex: '#a9d4f0' },
  { key: 'lemon', label: '레몬 옐로우', hex: '#f5e59a' },
]

const STEPS = [
  { key: 'chassis', title: '바디 선택', options: CHASSIS_OPTIONS, kind: 'card' },
  { key: 'head', title: '헤드 선택', options: HEAD_OPTIONS, kind: 'card' },
  { key: 'arm', title: '암 유닛 선택', options: ARM_OPTIONS, kind: 'card' },
  { key: 'leg', title: '하체 선택', options: LEG_OPTIONS, kind: 'card' },
  { key: 'core', title: '코어 선택', options: CORE_OPTIONS, kind: 'card' },
  { key: 'color', title: '도색 선택', options: COLOR_OPTIONS, kind: 'swatch' },
]

// --- Canvas art helpers (flat sticker style: bold outline, flat fills, no gradients) ---
const OUTLINE = '#352c24'
const STROKE_W = 3.4
const DETAIL_W = 2

function tint(hex, amt) {
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

function flatPath(ctx, color, { outline = true, width = STROKE_W } = {}) {
  ctx.fillStyle = color
  ctx.fill()
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = width
    ctx.stroke()
  }
}

function flatRect(ctx, x, y, w, h, r, color, opts) {
  roundRectPath(ctx, x, y, w, h, r)
  flatPath(ctx, color, opts)
}

function shineDot(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function placeholderSlot(ctx, x, y, w, h) {
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 2
  roundRectPath(ctx, x, y, w, h, 8)
  ctx.stroke()
  ctx.restore()
}

function heartPath(ctx, cx, cy, s) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + s * 0.35)
  ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.4, cx - s * 0.5, cy - s * 1.05, cx, cy - s * 0.3)
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 1.05, cx + s * 1.1, cy - s * 0.4, cx, cy + s * 0.35)
  ctx.closePath()
}

function starPath(ctx, cx, cy, outerR, innerR) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function bowPath(ctx, cx, cy, s) {
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx - s, cy - s * 0.6)
  ctx.lineTo(cx - s, cy + s * 0.6)
  ctx.closePath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + s, cy - s * 0.6)
  ctx.lineTo(cx + s, cy + s * 0.6)
  ctx.closePath()
}

function outlinedBand(ctx, cx, cy, r, w, startA, endA, color) {
  ctx.lineCap = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = w + DETAIL_W * 1.4
  ctx.beginPath()
  ctx.arc(cx, cy, r, startA, endA)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.arc(cx, cy, r, startA, endA)
  ctx.stroke()
}

function bodyHalfWidth(chassisKey, W, atBottom) {
  const spec = CHASSIS_OPTIONS.find((c) => c.key === chassisKey) || CHASSIS_OPTIONS[1]
  const topW = W * spec.wFrac
  return ((atBottom ? topW * spec.flare : topW) / 2)
}

// --- Part drawing ---------------------------------------------------------
function drawDressBody(ctx, key, cx, topY, bottomY, paint, W) {
  const spec = CHASSIS_OPTIONS.find((c) => c.key === key)
  const topW = W * spec.wFrac
  const bottomW = topW * spec.flare
  const x1t = cx - topW / 2, x2t = cx + topW / 2
  const x1b = cx - bottomW / 2, x2b = cx + bottomW / 2

  ctx.beginPath()
  ctx.moveTo(x1t + 8, topY)
  ctx.lineTo(x2t - 8, topY)
  ctx.quadraticCurveTo(x2t, topY, x2t + 3, topY + 10)
  ctx.lineTo(x2b, bottomY - 8)
  ctx.quadraticCurveTo(x2b, bottomY, x2b - 8, bottomY)
  ctx.lineTo(x1b + 8, bottomY)
  ctx.quadraticCurveTo(x1b, bottomY, x1b, bottomY - 8)
  ctx.lineTo(x1t - 3, topY + 10)
  ctx.quadraticCurveTo(x1t, topY, x1t + 8, topY)
  ctx.closePath()
  flatPath(ctx, paint)

  // waist seam
  const waistY = topY + (bottomY - topY) * 0.42
  const waistHalfW = (topW + (bottomW - topW) * 0.42) / 2
  ctx.strokeStyle = OUTLINE
  ctx.lineCap = 'round'
  ctx.lineWidth = DETAIL_W
  ctx.beginPath()
  ctx.moveTo(cx - waistHalfW, waistY)
  ctx.lineTo(cx + waistHalfW, waistY)
  ctx.stroke()

  // collar
  ctx.beginPath()
  ctx.moveTo(cx - 12, topY)
  ctx.lineTo(cx, topY + 12)
  ctx.lineTo(cx + 12, topY)
  ctx.lineTo(cx + 16, topY + 3)
  ctx.lineTo(cx, topY + 20)
  ctx.lineTo(cx - 16, topY + 3)
  ctx.closePath()
  flatPath(ctx, '#fbfbfb', { width: DETAIL_W })

  // apron bib
  flatRect(ctx, cx - topW * 0.22, topY + 22, topW * 0.44, (waistY - topY) * 0.65, 4, '#fbfbfb', { width: DETAIL_W })

  // skirt frill hem stitches
  ctx.fillStyle = OUTLINE
  const dots = 6
  for (let i = 0; i <= dots; i++) {
    const t = i / dots
    const hx = x1b + 10 + (x2b - x1b - 20) * t
    ctx.beginPath()
    ctx.arc(hx, bottomY - 7, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }

  return { topW, bottomW, x1t, x2t, x1b, x2b, waistY }
}

function drawHead(ctx, key, cx, cy, paint) {
  const r = 32

  // ears/antenna behind-head accents drawn first for catear
  if (key === 'catear') {
    for (const sign of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + sign * r * 0.55, cy - r * 0.65)
      ctx.lineTo(cx + sign * r * 0.95, cy - r * 1.5)
      ctx.lineTo(cx + sign * r * 0.2, cy - r * 0.9)
      ctx.closePath()
      flatPath(ctx, tint(paint, 0.12), { width: DETAIL_W })
      ctx.beginPath()
      ctx.moveTo(cx + sign * r * 0.56, cy - r * 0.78)
      ctx.lineTo(cx + sign * r * 0.76, cy - r * 1.24)
      ctx.lineTo(cx + sign * r * 0.34, cy - r * 0.9)
      ctx.closePath()
      ctx.fillStyle = '#ffb3c4'
      ctx.fill()
    }
  }

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  flatPath(ctx, paint)

  // eyes
  const eyeDX = r * 0.4, eyeY = cy + r * 0.06, eyeR = r * 0.25
  for (const sx of [-1, 1]) {
    ctx.fillStyle = OUTLINE
    ctx.beginPath()
    ctx.ellipse(cx + sx * eyeDX, eyeY, eyeR * 0.78, eyeR, 0, 0, Math.PI * 2)
    ctx.fill()
    shineDot(ctx, cx + sx * eyeDX - eyeR * 0.3, eyeY - eyeR * 0.4, eyeR * 0.32)
  }

  // mouth
  ctx.strokeStyle = OUTLINE
  ctx.lineCap = 'round'
  ctx.lineWidth = DETAIL_W
  ctx.beginPath()
  ctx.arc(cx, eyeY + r * 0.42, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()

  // blush
  ctx.fillStyle = 'rgba(255,130,155,0.55)'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + sx * r * 0.58, cy + r * 0.28, r * 0.16, r * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  if (key === 'ribbon') {
    bowPath(ctx, cx, cy - r * 1.08, r * 0.34)
    flatPath(ctx, '#ff7fa0', { width: DETAIL_W })
    ctx.fillStyle = OUTLINE
    ctx.beginPath()
    ctx.arc(cx, cy - r * 1.08, r * 0.1, 0, Math.PI * 2)
    ctx.fill()
  } else if (key === 'headband') {
    outlinedBand(ctx, cx, cy - r * 0.1, r * 1.02, r * 0.3, Math.PI * 1.08, Math.PI * 1.92, '#fbfbfb')
  }
}

function drawArms(ctx, key, cx, shoulderY, bodyHalfW, paint) {
  for (const sign of [-1, 1]) {
    const ax = cx + sign * (bodyHalfW + 7)
    flatRect(ctx, ax - 7, shoulderY, 14, 24, 6, paint)
    const handY = shoulderY + 24
    if (key === 'glove') {
      ctx.beginPath()
      ctx.arc(ax, handY + 5, 6.5, 0, Math.PI * 2)
      flatPath(ctx, '#fbfbfb', { width: DETAIL_W })
    } else if (key === 'tray') {
      ctx.beginPath()
      ctx.ellipse(ax, handY + 4, 9, 3.2, 0, 0, Math.PI * 2)
      flatPath(ctx, '#fbfbfb', { width: DETAIL_W })
    } else if (key === 'ribboncuff') {
      ctx.beginPath()
      ctx.arc(ax, handY + 6, 5.5, 0, Math.PI * 2)
      flatPath(ctx, tint(paint, -0.08), { width: DETAIL_W })
      bowPath(ctx, ax, handY - 2, 4.5)
      flatPath(ctx, '#ff7fa0', { width: DETAIL_W })
    }
  }
}

function drawLegs(ctx, key, cx, bodyHalfBottomW, topY, bottomY, paint) {
  if (key === 'apronskirt') {
    const w = bodyHalfBottomW * 2 * 0.82
    const midY = topY + (bottomY - topY) * 0.5
    ctx.beginPath()
    ctx.moveTo(cx - w / 2 + 6, topY - 4)
    ctx.lineTo(cx + w / 2 - 6, topY - 4)
    ctx.quadraticCurveTo(cx + w / 2, topY - 4, cx + w / 2 - 2, midY - 6)
    ctx.quadraticCurveTo(cx + w / 2 - 2, midY, cx + w / 2 - 10, midY)
    ctx.lineTo(cx - w / 2 + 10, midY)
    ctx.quadraticCurveTo(cx - w / 2 + 2, midY, cx - w / 2 + 2, midY - 6)
    ctx.quadraticCurveTo(cx - w / 2, topY - 4, cx - w / 2 + 6, topY - 4)
    ctx.closePath()
    flatPath(ctx, paint)
    for (const sign of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + sign * w * 0.2, bottomY - 4, 7.5, 4.5, 0, 0, Math.PI * 2)
      flatPath(ctx, OUTLINE, { outline: false })
    }
  } else if (key === 'bipedboots') {
    for (const sign of [-1, 1]) {
      const lx = cx + sign * bodyHalfBottomW * 0.4
      flatRect(ctx, lx - 5.5, topY, 11, bottomY - topY - 11, 4, paint)
      ctx.beginPath()
      ctx.ellipse(lx, bottomY - 5, 9.5, 6.5, 0, 0, Math.PI * 2)
      flatPath(ctx, OUTLINE, { outline: false })
      ctx.fillStyle = '#ff9fb6'
      ctx.beginPath()
      ctx.arc(lx, bottomY - 10, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (key === 'hoverbase') {
    const ringY = topY + 16
    ctx.beginPath()
    ctx.ellipse(cx, ringY, 18, 9, 0, 0, Math.PI * 2)
    flatPath(ctx, tint(paint, 0.1), { width: DETAIL_W })
    ctx.beginPath()
    ctx.ellipse(cx, ringY, 9, 4, 0, 0, Math.PI * 2)
    ctx.fillStyle = tint(paint, -0.15)
    ctx.fill()
  }
}

function drawCore(ctx, key, cx, coreY, scale = 1) {
  const spec = CORE_OPTIONS.find((c) => c.key === key)
  ctx.save()
  ctx.translate(cx, coreY)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -coreY)
  if (spec.shape === 'heart') heartPath(ctx, cx, coreY, 8)
  else if (spec.shape === 'star') starPath(ctx, cx, coreY, 9.5, 4.2)
  else bowPath(ctx, cx, coreY, 8)
  flatPath(ctx, spec.color, { width: DETAIL_W })
  if (spec.shape === 'bow') {
    ctx.fillStyle = OUTLINE
    ctx.beginPath()
    ctx.arc(cx, coreY, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
  shineDot(ctx, cx - 2.6, coreY - 2.6, 1.8)
  ctx.restore()
}

function drawRobot(canvas, build) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const cx = W / 2
  const headCenterY = H * 0.18
  const bodyTopY = H * 0.36
  const bodyBottomY = H * 0.66
  const legTopY = bodyBottomY
  const legBottomY = H * 0.92

  const paint = COLOR_OPTIONS.find((c) => c.key === build.colorKey)?.hex || '#f0c7d2'

  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(cx, H * 0.95, W * 0.3, H * 0.02, 0, 0, Math.PI * 2)
  ctx.fill()

  const bodyHalfTopW = bodyHalfWidth(build.chassisKey, W, false)
  const bodyHalfBottomW = bodyHalfWidth(build.chassisKey, W, true)

  if (build.legKey) drawLegs(ctx, build.legKey, cx, bodyHalfBottomW, legTopY, legBottomY, paint)
  else placeholderSlot(ctx, cx - 30, legTopY, 60, legBottomY - legTopY)

  if (build.chassisKey) drawDressBody(ctx, build.chassisKey, cx, bodyTopY, bodyBottomY, paint, W)
  else placeholderSlot(ctx, cx - 36, bodyTopY, 72, bodyBottomY - bodyTopY)

  if (build.coreKey && build.chassisKey) {
    drawCore(ctx, build.coreKey, cx, bodyTopY + (bodyBottomY - bodyTopY) * 0.6, build.poweredOn ? build.pulse ?? 1 : 1)
  }

  if (build.armKey) drawArms(ctx, build.armKey, cx, bodyTopY + 6, bodyHalfTopW, paint)
  else {
    placeholderSlot(ctx, cx - bodyHalfTopW - 24, bodyTopY + 2, 16, 30)
    placeholderSlot(ctx, cx + bodyHalfTopW + 8, bodyTopY + 2, 16, 30)
  }

  if (build.headKey) drawHead(ctx, build.headKey, cx, headCenterY, paint)
  else placeholderSlot(ctx, cx - 32, headCenterY - 32, 64, 64)
}

// --- Stats --------------------------------------------------------------------
function computeStats(build) {
  const totals = { chore: 0, speed: 0, durability: 0, precision: 0, charm: 0 }
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
    return '모든 면에서 사랑스럽고 다재다능한 메이드로봇이 완성되었습니다.'
  }
  const texts = {
    chore: '어떤 집안일도 완벽하게 해내는 살림꾼 메이드로봇이 완성되었습니다.',
    speed: '누구보다 빠릿빠릿하게 움직이는 메이드로봇이 완성되었습니다.',
    durability: '오래도록 튼튼하게 곁을 지켜줄 메이드로봇이 완성되었습니다.',
    precision: '세심하고 꼼꼼한 손길이 돋보이는 메이드로봇이 완성되었습니다.',
    charm: '보고만 있어도 사랑스러운, 누구에게나 사랑받을 메이드로봇이 완성되었습니다.',
  }
  return texts[top[0][0]]
}

// --- State ----------------------------------------------------------------
function freshState() {
  return {
    phase: 'title',
    name: '',
    stepIndex: 0,
    build: { chassisKey: null, headKey: null, armKey: null, legKey: null, coreKey: null, colorKey: 'pink' },
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
      <h1>메이드로봇 만들기 시뮬레이터</h1>
      <div class="subtitle">바디부터 코어까지, 단계별로 부품을 골라 나만의 귀여운 메이드로봇을 직접 조립해 보세요.<br/>고른 부품은 그 자리에서 바로 장착됩니다.</div>
      <div class="field-row">
        <label>로봇 이름</label>
        <input id="name-input" type="text" maxlength="12" placeholder="예: 리본" value="리본" />
      </div>
      <button class="primary-btn" id="start-btn">조립 시작</button>
      <div class="hint">바디 → 헤드 → 암 → 하체 → 코어 → 도색 순서로 6단계를 거쳐 로봇을 완성합니다. 각 부품은 가사력/속도/내구성/정밀도/친화력 능력치에 영향을 줍니다.</div>
    </div>
  `
  document.getElementById('start-btn').onclick = () => {
    const nameInput = document.getElementById('name-input')
    state.name = nameInput.value.trim() || '리본'
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
