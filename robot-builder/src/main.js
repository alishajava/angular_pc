import { sfx, unlockSfx, toggleMute } from './sfx.js'

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

let eyesClosed = false
// ---- Maid robot art -------------------------------------------------------
// Logical canvas is 230x280 (the real canvas is 2x for crisp edges). Soft
// two-tone shading, thin outlines, frills and big anime eyes.
const LW = 2.3

function lgrad(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  return g
}
function paintShape(ctx, fill, lw = LW) {
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = lw
  ctx.stroke()
}
// a row of scallops hanging below y, left to right
function scallops(ctx, x0, x1, y, n) {
  const w = (x1 - x0) / n
  for (let i = 0; i < n; i++) ctx.arc(x0 + w * (i + 0.5), y, w / 2, Math.PI, 0, true)
}
function ruffleBand(ctx, x0, x1, y, h, n, fill = '#fffdfb') {
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x0, y + h * 0.25)
  scallops(ctx, x0, x1, y + h * 0.25, n)
  ctx.lineTo(x1, y)
  ctx.closePath()
  paintShape(ctx, fill, 1.8)
  // soft shadow under the frill and tiny stitch dots
  ctx.fillStyle = 'rgba(160,120,130,0.18)'
  ctx.fillRect(x0 + 2, y, x1 - x0 - 4, 2.2)
}
function satinBow(ctx, x, y, s, color, tilt = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  for (const sg of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(sg * s * 0.9, -s * 0.95, sg * s * 1.5, -s * 0.5, sg * s * 1.35, s * 0.15)
    ctx.bezierCurveTo(sg * s * 1.3, s * 0.85, sg * s * 0.7, s * 0.8, 0, 0)
    ctx.closePath()
    paintShape(ctx, lgrad(ctx, 0, -s, 0, s, tint(color, 0.25), tint(color, -0.12)), 1.8)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(sg * s * 0.45, -s * 0.28)
    ctx.quadraticCurveTo(sg * s * 0.9, -s * 0.45, sg * s * 1.05, -s * 0.1)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.28, s * 0.3, 0, 0, Math.PI * 2)
  paintShape(ctx, tint(color, -0.1), 1.8)
  ctx.restore()
}

function bodyHalfWidth(chassisKey, W, atBottom) {
  const spec = CHASSIS_OPTIONS.find((c) => c.key === chassisKey) || CHASSIS_OPTIONS[1]
  const topW = W * spec.wFrac
  return (atBottom ? topW * spec.flare : topW) / 2
}

const BODY = { neck: 118, shoulder: 126, waist: 160 }

function drawCore(ctx, key, cx, cy, scale = 1) {
  const spec = CORE_OPTIONS.find((c) => c.key === key)
  ctx.save()
  // soft glow
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26 * scale)
  g.addColorStop(0, spec.color + 'aa')
  g.addColorStop(1, spec.color + '00')
  ctx.fillStyle = g
  ctx.fillRect(cx - 28, cy - 28, 56, 56)
  // brooch frame
  ctx.beginPath()
  ctx.arc(cx, cy, 12, 0, Math.PI * 2)
  paintShape(ctx, lgrad(ctx, cx - 12, cy - 12, cx + 12, cy + 12, '#fff0b8', '#d9a83a'), 1.8)
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.fillStyle = '#fffaf0'
  ctx.fill()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  if (spec.shape === 'heart') heartPath(ctx, cx, cy + 1, 6.5)
  else if (spec.shape === 'star') starPath(ctx, cx, cy, 8, 3.6)
  else bowPath(ctx, cx, cy, 7)
  ctx.fillStyle = spec.color
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  ctx.stroke()
  shineDot(ctx, cx - 2.4, cy - 2.6, 1.7)
  ctx.restore()
}

function drawDressBody(ctx, key, cx, paint, accent) {
  const spec = CHASSIS_OPTIONS.find((c) => c.key === key)
  const topW = 230 * spec.wFrac
  const hemW = topW * spec.flare
  const waistW = topW * 0.78
  const hemY = 206
  const { shoulder, waist } = BODY
  const light = tint(paint, 0.2)
  const dark = tint(paint, -0.14)

  // skirt (bell), then bodice on top
  ctx.beginPath()
  ctx.moveTo(cx - waistW / 2, waist - 2)
  ctx.quadraticCurveTo(cx - hemW * 0.5, waist + 14, cx - hemW / 2, hemY)
  ctx.lineTo(cx + hemW / 2, hemY)
  ctx.quadraticCurveTo(cx + hemW * 0.5, waist + 14, cx + waistW / 2, waist - 2)
  ctx.closePath()
  paintShape(ctx, lgrad(ctx, cx - hemW / 2, 0, cx + hemW / 2, 0, light, dark))
  // folds
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'
  ctx.lineWidth = 1.6
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * waistW * 0.13, waist)
    ctx.quadraticCurveTo(cx + i * hemW * 0.12, waist + 24, cx + i * hemW * 0.155, hemY - 2)
    ctx.stroke()
  }
  // petticoat frill at the hem
  ruffleBand(ctx, cx - hemW / 2 - 3, cx + hemW / 2 + 3, hemY - 2, 14, Math.round(hemW / 14), '#fffdfb')

  // bodice with puffed shoulders
  ctx.beginPath()
  ctx.moveTo(cx - topW / 2, shoulder + 6)
  ctx.quadraticCurveTo(cx - topW / 2, shoulder - 4, cx - topW / 2 + 12, shoulder - 4)
  ctx.lineTo(cx + topW / 2 - 12, shoulder - 4)
  ctx.quadraticCurveTo(cx + topW / 2, shoulder - 4, cx + topW / 2, shoulder + 6)
  ctx.lineTo(cx + waistW / 2, waist + 2)
  ctx.lineTo(cx - waistW / 2, waist + 2)
  ctx.closePath()
  paintShape(ctx, lgrad(ctx, cx - topW / 2, 0, cx + topW / 2, 0, light, dark))
  // princess seams
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1.5
  for (const sg of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + sg * topW * 0.24, shoulder)
    ctx.quadraticCurveTo(cx + sg * topW * 0.32, waist - 18, cx + sg * waistW * 0.3, waist)
    ctx.stroke()
  }

  // white apron: bib + front panel with frilled edges
  const bibW = topW * 0.4
  ctx.beginPath()
  ctx.moveTo(cx - bibW / 2, shoulder + 2)
  ctx.lineTo(cx + bibW / 2, shoulder + 2)
  ctx.lineTo(cx + waistW * 0.3, waist)
  ctx.lineTo(cx - waistW * 0.3, waist)
  ctx.closePath()
  paintShape(ctx, lgrad(ctx, cx - bibW, 0, cx + bibW, 0, '#ffffff', '#f1e9ee'), 1.9)
  const panelW = hemW * 0.5
  ctx.beginPath()
  ctx.moveTo(cx - waistW * 0.3, waist - 1)
  ctx.lineTo(cx + waistW * 0.3, waist - 1)
  ctx.lineTo(cx + panelW / 2, hemY - 6)
  ctx.lineTo(cx - panelW / 2, hemY - 6)
  ctx.closePath()
  paintShape(ctx, lgrad(ctx, cx - panelW / 2, 0, cx + panelW / 2, 0, '#ffffff', '#f3ebf0'), 1.9)
  ruffleBand(ctx, cx - panelW / 2 - 2, cx + panelW / 2 + 2, hemY - 10, 10, Math.max(4, Math.round(panelW / 11)), '#ffffff')
  // frill along the apron's top edge and waist ribbon
  ctx.fillStyle = tint(accent, 0.15)
  ctx.beginPath()
  ctx.roundRect(cx - waistW * 0.34, waist - 4, waistW * 0.68, 7, 3)
  paintShape(ctx, tint(accent, 0.1), 1.6)

  return { topW, hemW, waistW }
}

function drawCollarAndBow(ctx, cx, accent, topW) {
  // round white collar and a satin neck bow
  ctx.beginPath()
  ctx.ellipse(cx, BODY.shoulder - 1, topW * 0.34, 11, 0, 0, Math.PI * 2)
  paintShape(ctx, lgrad(ctx, cx - 30, 0, cx + 30, 0, '#ffffff', '#efe6ec'), 1.9)
  ctx.beginPath()
  ctx.moveTo(cx - topW * 0.3, BODY.shoulder + 3)
  scallops(ctx, cx - topW * 0.3, cx + topW * 0.3, BODY.shoulder + 3, 7)
  ctx.closePath()
  paintShape(ctx, '#ffffff', 1.5)
  satinBow(ctx, cx, BODY.shoulder + 4, 9, accent)
}

function drawArms(ctx, key, cx, topW, paint, accent, t) {
  const sw = Math.sin(t * 2.2)
  for (const sg of [-1, 1]) {
    const sx = cx + sg * (topW / 2 + 3)
    const sy = BODY.shoulder + 6
    const swing = sw * 0.05 * sg
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(sg * 0.16 + swing)
    // upper sleeve: a puffed ball with a frilled cuff
    ctx.beginPath()
    ctx.ellipse(0, 4, 12.5, 12, 0, 0, Math.PI * 2)
    paintShape(ctx, lgrad(ctx, -12, 0, 12, 0, tint(paint, 0.22), tint(paint, -0.1)))
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(-3, 0, 7, Math.PI * 1.05, Math.PI * 1.55)
    ctx.stroke()
    // forearm (porcelain-white robot limb with a tiny joint ring)
    ctx.beginPath()
    ctx.roundRect(-5, 12, 10, 26, 5)
    paintShape(ctx, lgrad(ctx, -5, 0, 5, 0, '#ffffff', '#e9e2e6'), 2)
    ctx.beginPath()
    ctx.ellipse(0, 22, 5.6, 2.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fill()
    // frill cuff
    ruffleBand(ctx, -8, 8, 14, 6, 3, '#ffffff')
    const hy = 40
    if (key === 'glove') {
      ctx.beginPath()
      ctx.arc(0, hy, 8, 0, Math.PI * 2)
      paintShape(ctx, lgrad(ctx, -8, hy - 8, 8, hy + 8, '#ffffff', '#ecdfe6'), 2)
      ctx.beginPath()
      ctx.ellipse(sg * 7, hy - 1, 3.2, 4.4, sg * 0.5, 0, Math.PI * 2)
      paintShape(ctx, '#ffffff', 1.7)
      shineDot(ctx, -2.5, hy - 3, 1.7)
    } else if (key === 'tray') {
      ctx.beginPath()
      ctx.arc(0, hy, 6.5, 0, Math.PI * 2)
      paintShape(ctx, '#ffffff', 2)
      // silver tray + teacup held at the side
      ctx.save()
      ctx.translate(sg * 6, hy + 4)
      ctx.rotate(-sg * 0.1)
      ctx.beginPath()
      ctx.ellipse(0, 0, 17, 4.6, 0, 0, Math.PI * 2)
      paintShape(ctx, lgrad(ctx, -17, 0, 17, 0, '#f4f6fa', '#aab2c0'), 1.9)
      ctx.beginPath()
      ctx.moveTo(-6, -2)
      ctx.lineTo(6, -2)
      ctx.lineTo(4.5, -11)
      ctx.lineTo(-4.5, -11)
      ctx.closePath()
      paintShape(ctx, '#ffffff', 1.7)
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-5.4, -7)
      ctx.lineTo(5.4, -7)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(sg * 7, -7, 3, -Math.PI / 2, Math.PI / 2, sg < 0)
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 1.5
      ctx.stroke()
      // wisp of steam
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(0, -12)
      ctx.quadraticCurveTo(-3 + Math.sin(t * 3) * 2, -18, 1, -23)
      ctx.stroke()
      ctx.restore()
    } else if (key === 'ribboncuff') {
      ctx.beginPath()
      ctx.arc(0, hy, 7.5, 0, Math.PI * 2)
      paintShape(ctx, lgrad(ctx, -7, hy - 7, 7, hy + 7, '#ffffff', '#ecdfe6'), 2)
      shineDot(ctx, -2.4, hy - 2.8, 1.6)
      satinBow(ctx, 0, 28, 5.2, accent, sg * 0.15)
    }
    ctx.restore()
  }
}

function drawLegs(ctx, key, cx, hemW, paint, accent, t) {
  const hemY = 206
  if (key === 'apronskirt') {
    // a second, longer tier of skirt with its own frill and tiny shoes
    const w = hemW * 1.12
    ctx.beginPath()
    ctx.moveTo(cx - hemW / 2, hemY - 6)
    ctx.quadraticCurveTo(cx - w * 0.52, hemY + 14, cx - w / 2, hemY + 36)
    ctx.lineTo(cx + w / 2, hemY + 36)
    ctx.quadraticCurveTo(cx + w * 0.52, hemY + 14, cx + hemW / 2, hemY - 6)
    ctx.closePath()
    paintShape(ctx, lgrad(ctx, cx - w / 2, 0, cx + w / 2, 0, tint(paint, 0.12), tint(paint, -0.18)))
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'
    ctx.lineWidth = 1.5
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(cx + i * hemW * 0.1, hemY + 6)
      ctx.lineTo(cx + i * w * 0.13, hemY + 34)
      ctx.stroke()
    }
    ruffleBand(ctx, cx - w / 2 - 3, cx + w / 2 + 3, hemY + 33, 14, Math.round(w / 14), '#fffdfb')
    for (const sg of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + sg * 15, hemY + 54, 9, 4.6, 0, 0, Math.PI * 2)
      paintShape(ctx, '#3a2f3a', 1.6)
      shineDot(ctx, cx + sg * 15 - 2, hemY + 52.5, 1.2)
    }
  } else if (key === 'bipedboots') {
    for (const sg of [-1, 1]) {
      const lx = cx + sg * Math.min(26, hemW * 0.22)
      // white stocking
      ctx.beginPath()
      ctx.roundRect(lx - 6, hemY, 12, 28, 5)
      paintShape(ctx, lgrad(ctx, lx - 6, 0, lx + 6, 0, '#ffffff', '#ebe3e8'), 1.9)
      // lace band
      ctx.fillStyle = accent
      ctx.fillRect(lx - 6, hemY + 6, 12, 3.2)
      // boot with a strap and a little heel
      ctx.beginPath()
      ctx.moveTo(lx - 7.5, hemY + 26)
      ctx.lineTo(lx + 7.5, hemY + 26)
      ctx.lineTo(lx + 8.5, hemY + 40)
      ctx.quadraticCurveTo(lx + 17, hemY + 40, lx + 16, hemY + 47)
      ctx.lineTo(lx - 10, hemY + 47)
      ctx.lineTo(lx - 9, hemY + 40)
      ctx.closePath()
      paintShape(ctx, lgrad(ctx, lx - 10, 0, lx + 16, 0, '#6a4a5a', '#3a2a34'), 1.9)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillRect(lx - 5, hemY + 29, 3, 8)
      ctx.strokeStyle = tint(accent, 0.1)
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.moveTo(lx - 8, hemY + 32)
      ctx.lineTo(lx + 8, hemY + 32)
      ctx.stroke()
      satinBow(ctx, lx, hemY + 32, 3.6, accent)
    }
  } else if (key === 'hoverbase') {
    const bob = Math.sin(t * 3) * 1.5
    const cy = hemY + 24 + bob
    // thruster glow
    const g = ctx.createRadialGradient(cx, cy + 14, 2, cx, cy + 14, 46)
    g.addColorStop(0, 'rgba(255,190,220,0.8)')
    g.addColorStop(1, 'rgba(255,190,220,0)')
    ctx.fillStyle = g
    ctx.fillRect(cx - 50, cy - 30, 100, 90)
    ctx.beginPath()
    ctx.moveTo(cx - 20, hemY + 2)
    ctx.lineTo(cx + 20, hemY + 2)
    ctx.lineTo(cx + 26, cy + 2)
    ctx.quadraticCurveTo(cx, cy + 14, cx - 26, cy + 2)
    ctx.closePath()
    paintShape(ctx, lgrad(ctx, cx - 26, 0, cx + 26, 0, tint(paint, 0.15), tint(paint, -0.2)))
    ctx.beginPath()
    ctx.ellipse(cx, cy + 6, 34, 9, 0, 0, Math.PI * 2)
    paintShape(ctx, lgrad(ctx, cx - 34, 0, cx + 34, 0, '#fffafc', '#cdb8c4'))
    ctx.beginPath()
    ctx.ellipse(cx, cy + 9, 22, 4.6, 0, 0, Math.PI * 2)
    ctx.fillStyle = tint(accent, 0.2)
    ctx.fill()
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 5) * 0.3})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(cx, cy + 20 + Math.sin(t * 4) * 2, 28 + Math.sin(t * 4) * 3, 5, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawHead(ctx, key, cx, cy, paint, accent) {
  const HAIR = { pink: '#c9607e', mint: '#3f9a86', lavender: '#7a5fb4', cream: '#b98a58', sky: '#4a82c4', lemon: '#d9a02e' }
  const hairBase = HAIR[COLOR_OPTIONS.find((c) => c.hex === paint)?.key] || '#c9607e'
  const hair = tint(hairBase, -0.12)
  const hairHi = tint(hairBase, 0.2)
  const face = lgrad(ctx, cx - 36, cy - 30, cx + 36, cy + 34, '#fffbf9', tint(paint, 0.78))

  // back hair: a bob that falls past the jaw
  ctx.beginPath()
  ctx.ellipse(cx, cy - 2, 47, 43, 0, 0, Math.PI * 2)
  ctx.moveTo(cx - 47, cy)
  ctx.lineTo(cx - 47, cy + 40)
  ctx.quadraticCurveTo(cx - 42, cy + 50, cx - 30, cy + 44)
  ctx.lineTo(cx - 24, cy + 16)
  ctx.lineTo(cx + 24, cy + 16)
  ctx.lineTo(cx + 30, cy + 44)
  ctx.quadraticCurveTo(cx + 42, cy + 50, cx + 47, cy + 40)
  ctx.lineTo(cx + 47, cy)
  paintShape(ctx, lgrad(ctx, cx - 47, 0, cx + 47, 0, hairHi, hair))

  // cat-ear antennae sit behind the fringe
  if (key === 'catear') {
    for (const sg of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + sg * 14, cy - 36)
      ctx.lineTo(cx + sg * 36, cy - 66)
      ctx.lineTo(cx + sg * 44, cy - 26)
      ctx.closePath()
      paintShape(ctx, lgrad(ctx, 0, cy - 66, 0, cy - 26, hairHi, hair))
      ctx.beginPath()
      ctx.moveTo(cx + sg * 22, cy - 38)
      ctx.lineTo(cx + sg * 35, cy - 56)
      ctx.lineTo(cx + sg * 39, cy - 34)
      ctx.closePath()
      ctx.fillStyle = '#ffc3d4'
      ctx.fill()
      // glowing antenna tip
      const tip = 0.6 + Math.sin(performance.now() / 300 + sg) * 0.4
      ctx.fillStyle = `rgba(255,236,150,${tip})`
      ctx.beginPath()
      ctx.arc(cx + sg * 36, cy - 66, 3.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 1.4
      ctx.stroke()
    }
  }

  // ear modules
  for (const sg of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(cx + sg * 39, cy + 6, 9.5, 0, Math.PI * 2)
    paintShape(ctx, lgrad(ctx, cx + sg * 30, cy, cx + sg * 48, cy, '#ffffff', tint(paint, -0.05)), 1.9)
    ctx.beginPath()
    ctx.arc(cx + sg * 39, cy + 6, 4.4, 0, Math.PI * 2)
    ctx.fillStyle = accent
    ctx.fill()
    shineDot(ctx, cx + sg * 39 - 1.2, cy + 4.6, 1.2)
  }

  // face plate
  ctx.beginPath()
  ctx.ellipse(cx, cy + 6, 36, 33, 0, 0, Math.PI * 2)
  paintShape(ctx, face, 2.3)

  // eyes
  const eyeY = cy + 10
  for (const sg of [-1, 1]) {
    const ex = cx + sg * 15
    if (eyesClosed) {
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 2.6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(ex, eyeY + 1, 8, 0.1 * Math.PI, 0.9 * Math.PI)
      ctx.stroke()
      continue
    }
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, 9.2, 11.4, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, 9.2, 11.4, 0, 0, Math.PI * 2)
    ctx.clip()
    const ig = ctx.createLinearGradient(0, eyeY - 11, 0, eyeY + 11)
    ig.addColorStop(0, tint(accent, -0.55))
    ig.addColorStop(0.55, accent)
    ig.addColorStop(1, tint(accent, 0.55))
    ctx.fillStyle = ig
    ctx.beginPath()
    ctx.ellipse(ex + sg * 0.5, eyeY + 1.5, 7.6, 9.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a1e2a'
    ctx.beginPath()
    ctx.ellipse(ex + sg * 0.5, eyeY + 1.5, 3.6, 5.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    shineDot(ctx, ex - 3, eyeY - 3.8, 2.8)
    shineDot(ctx, ex + 3, eyeY + 4.6, 1.4)
    // thick upper lash line with a little flick
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, 9.4, 11.6, 0, Math.PI * 1.08, Math.PI * 1.92)
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ex + sg * 8.6, eyeY - 5)
    ctx.lineTo(ex + sg * 12.4, eyeY - 7.6)
    ctx.stroke()
  }
  // brows, blush, nose dot, smile
  ctx.strokeStyle = hair
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  for (const sg of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + sg * 8, cy - 7)
    ctx.quadraticCurveTo(cx + sg * 15, cy - 11, cx + sg * 22, cy - 8)
    ctx.stroke()
  }
  for (const sg of [-1, 1]) {
    const bx = cx + sg * 26
    const by = cy + 24
    ctx.fillStyle = 'rgba(255,128,150,0.5)'
    ctx.beginPath()
    ctx.ellipse(bx, by, 7, 4.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1.1
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(bx + i * 2.6 - 1, by + 2.4)
      ctx.lineTo(bx + i * 2.6 + 1, by - 2.4)
      ctx.stroke()
    }
  }
  ctx.strokeStyle = '#a8445a'
  ctx.lineWidth = 1.9
  ctx.beginPath()
  ctx.moveTo(cx - 6, cy + 27)
  ctx.quadraticCurveTo(cx - 3, cy + 31, cx, cy + 27)
  ctx.quadraticCurveTo(cx + 3, cy + 31, cx + 6, cy + 27)
  ctx.stroke()
  ctx.fillStyle = 'rgba(160,100,110,0.5)'
  ctx.fillRect(cx - 0.8, cy + 21, 1.6, 1.6)

  // fringe (bangs): soft rounded locks, side locks hanging past the cheeks
  ctx.beginPath()
  ctx.moveTo(cx - 44, cy + 8)
  ctx.bezierCurveTo(cx - 48, cy - 46, cx + 48, cy - 46, cx + 44, cy + 8)
  ctx.quadraticCurveTo(cx + 44, cy + 24, cx + 38, cy + 26)
  ctx.quadraticCurveTo(cx + 33, cy + 14, cx + 31, cy - 3)
  const tips = [cx + 31, cx + 15, cx, cx - 15, cx - 31]
  for (let i = 1; i < tips.length; i++) {
    ctx.quadraticCurveTo((tips[i - 1] + tips[i]) / 2, cy - 13, tips[i], cy - 3)
  }
  ctx.quadraticCurveTo(cx - 33, cy + 14, cx - 38, cy + 26)
  ctx.quadraticCurveTo(cx - 44, cy + 24, cx - 44, cy + 8)
  ctx.closePath()
  paintShape(ctx, lgrad(ctx, cx - 40, cy - 40, cx + 40, cy + 6, hairHi, hair))
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx - 6, cy - 4, 36, Math.PI * 1.12, Math.PI * 1.45)
  ctx.stroke()

  // head accessories
  if (key === 'ribbon') {
    satinBow(ctx, cx + 24, cy - 36, 16, accent, 0.35)
  } else if (key === 'headband') {
    // frilled maid headdress
    ctx.beginPath()
    ctx.moveTo(cx - 40, cy - 8)
    ctx.bezierCurveTo(cx - 40, cy - 40, cx + 40, cy - 40, cx + 40, cy - 8)
    ctx.lineTo(cx + 34, cy - 6)
    ctx.bezierCurveTo(cx + 32, cy - 30, cx - 32, cy - 30, cx - 34, cy - 6)
    ctx.closePath()
    paintShape(ctx, '#ffffff', 1.9)
    ruffleBand(ctx, cx - 34, cx + 34, cy - 31, 12, 7, '#ffffff')
    satinBow(ctx, cx - 26, cy - 30, 8, accent, -0.4)
  } else if (key === 'catear') {
    ctx.beginPath()
    ctx.arc(cx, cy - 36, 3, 0, Math.PI * 2)
    paintShape(ctx, accent, 1.5)
  }
}

function drawStage(ctx, W, H, t, glowColor) {
  const g = ctx.createRadialGradient(W / 2, H * 0.58, 10, W / 2, H * 0.58, W * 0.5)
  g.addColorStop(0, glowColor)
  g.addColorStop(1, 'rgba(255,143,171,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.translate(W / 2, H * 0.94)
  ctx.scale(1, 0.17)
  ctx.strokeStyle = 'rgba(255,170,195,0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, W * 0.4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([10, 10])
  ctx.lineDashOffset = -t * 20
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(0, 0, W * 0.34, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawRobot(canvas, build, fx = {}) {
  const ctx = canvas.getContext('2d')
  const S = canvas.width / 230
  const W = 230
  const H = 280
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(S, 0, 0, S, 0, 0)
  const t = fx.t || 0
  drawStage(ctx, W, H, t, 'rgba(255,143,171,0.22)')
  eyesClosed = !!fx.blink
  const bob = fx.bob || 0
  const squash = fx.squash || 0
  const cx = W / 2
  const paint = COLOR_OPTIONS.find((c) => c.key === build.colorKey)?.hex || '#f7b8c6'
  const coreSpec = CORE_OPTIONS.find((c) => c.key === build.coreKey)
  const accent = coreSpec ? coreSpec.color : '#ff8fab'

  // contact shadow stays on the floor while the body bobs
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(cx, H * 0.94, W * (build.legKey === 'hoverbase' ? 0.2 : 0.3), 6, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(cx, H * 0.94)
  ctx.scale(1 + squash * 0.06, 1 - squash * 0.05)
  ctx.translate(-cx, -H * 0.94 + bob)

  const spec = CHASSIS_OPTIONS.find((c) => c.key === build.chassisKey) || CHASSIS_OPTIONS[1]
  const topW = W * spec.wFrac
  const hemW = topW * spec.flare

  if (build.legKey) drawLegs(ctx, build.legKey, cx, hemW, paint, accent, t)
  else placeholderSlot(ctx, cx - 34, 214, 68, 40)

  if (build.chassisKey) {
    drawDressBody(ctx, build.chassisKey, cx, paint, accent)
    drawCollarAndBow(ctx, cx, accent, topW)
  } else placeholderSlot(ctx, cx - 36, 122, 72, 84)

  if (build.coreKey && build.chassisKey) drawCore(ctx, build.coreKey, cx, 143, build.poweredOn ? build.pulse ?? 1 : 1)

  if (build.armKey && build.chassisKey) drawArms(ctx, build.armKey, cx, topW, paint, accent, t)
  else if (build.armKey) drawArms(ctx, build.armKey, cx, 83, paint, accent, t)
  else {
    placeholderSlot(ctx, cx - topW / 2 - 24, 128, 18, 40)
    placeholderSlot(ctx, cx + topW / 2 + 6, 128, 18, 40)
  }

  const headY = 76 + Math.sin(t * 2.2 + 1) * 1.2
  if (build.headKey) drawHead(ctx, build.headKey, cx, headY, paint, accent)
  else placeholderSlot(ctx, cx - 40, 36, 80, 78)
  ctx.restore()
}

// Where each part sits on the canvas, for sparkle bursts when it is fitted.
function slotPoint(slot) {
  return {
    head: [115, 70],
    chassis: [115, 160],
    arm: [115, 165],
    leg: [115, 235],
    core: [115, 143],
    color: [115, 150],
  }[slot] || [115, 140]
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
function stopResultAnimation() {}

// --- Animation engine: one loop draws whichever robot canvas is on screen ---
const fx = { squash: 0, particles: [], resultT0: 0, lastHeart: 0 }
const DEMO_BUILD = { chassisKey: 'standard', headKey: 'ribbon', armKey: 'tray', legKey: 'apronskirt', coreKey: 'heart', colorKey: 'pink' }

function burst(slot, canvas, kind = 'spark') {
  const [x, y] = slotPoint(slot)
  const colors = ['#ffd76a', '#ff9fb6', '#fff', '#c9a6ff', '#a8e0cb']
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 40 + Math.random() * 110
    fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.9, max: 0.9, color: colors[i % colors.length], size: 2 + Math.random() * 3, kind })
  }
}
function confetti(canvas) {
  const colors = ['#ff9fb6', '#ffd76a', '#a8e0cb', '#c9a6ff', '#9fd4f0', '#fff']
  for (let i = 0; i < 80; i++) {
    fx.particles.push({
      x: Math.random() * 230,
      y: -10 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 60,
      vy: 60 + Math.random() * 120,
      life: 2.6,
      max: 2.6,
      color: colors[i % colors.length],
      size: 4 + Math.random() * 4,
      kind: 'confetti',
      rot: Math.random() * 6,
    })
  }
}
function drawParticles(ctx) {
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.4))
    ctx.fillStyle = p.color
    if (p.kind === 'heart') {
      heartPath(ctx, p.x, p.y, p.size)
      ctx.fill()
    } else if (p.kind === 'confetti') {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot + p.life * 4)
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    } else {
      starPath(ctx, p.x, p.y, p.size, p.size * 0.45)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}
function stepParticles(dt) {
  for (const p of fx.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.kind !== 'confetti') p.vy += 90 * dt
    p.vx *= Math.pow(0.4, dt)
    p.life -= dt
  }
  fx.particles = fx.particles.filter((p) => p.life > 0)
}

let lastFrame = performance.now()
function animationLoop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  const t = now / 1000
  if (fx.squash > 0) fx.squash = Math.max(0, fx.squash - dt * 4)
  const blink = (t * 0.8) % 4 > 3.82
  const bob = Math.sin(t * 2.2) * 2.2
  const preview = document.getElementById('preview-canvas')
  const result = document.getElementById('result-canvas')
  const title = document.getElementById('title-canvas')
  if (preview) {
    drawRobot(preview, state.build, { t, blink, bob, squash: fx.squash })
    drawParticles(preview.getContext('2d'))
  } else if (result) {
    const since = (now - fx.resultT0) / 1000
    const booting = since < 0.9
    const pulse = booting ? 1 : 0.85 + Math.sin(since * 4) * 0.22
    drawRobot(result, { ...state.build, poweredOn: !booting, pulse }, { t, blink: booting || blink, bob: booting ? 0 : bob * 1.4, squash: fx.squash })
    if (!booting && now - fx.lastHeart > 700) {
      fx.lastHeart = now
      const hx = 115 + (Math.random() - 0.5) * 90
      fx.particles.push({ x: hx, y: 56, vx: (Math.random() - 0.5) * 20, vy: -50, life: 1.5, max: 1.5, color: '#ff8fab', size: 5 + Math.random() * 3, kind: 'heart' })
    }
    drawParticles(result.getContext('2d'))
  } else if (title) {
    drawRobot(title, DEMO_BUILD, { t, blink, bob })
  }
  stepParticles(dt)
  requestAnimationFrame(animationLoop)
}
requestAnimationFrame(animationLoop)
window.addEventListener('pointerdown', unlockSfx)
window.addEventListener('keydown', (e) => {
  unlockSfx()
  if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) toggleMute()
})
function statBar(v) {
  return `<span class="bar"><i style="width:${Math.min(100, v * 2.2)}%"></i></span>`
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
      <canvas id="title-canvas" width="460" height="560" style="width:150px;height:183px"></canvas>
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
    sfx.start()
    state.phase = 'build'
    state.stepIndex = 0
    render()
  }
}

function miniStatGrid(stats) {
  return `
    <div class="stat-mini-grid">
      ${STAT_KEYS.map((k) => `<div class="stat-mini"><span>${STAT_LABELS[k]}</span><b>${stats[k]}</b>${statBar(stats[k])}</div>`).join('')}
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
          <canvas id="preview-canvas" width="460" height="560"></canvas>
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
      sfx.build()
      setTimeout(() => sfx.pickup(), 90)
      fx.squash = 1
      render()
      burst(step.key, document.getElementById('preview-canvas'))
    }
  })
  document.getElementById('prev-btn').onclick = () => {
    if (state.stepIndex > 0) {
      sfx.click()
      state.stepIndex -= 1
      render()
    }
  }
  document.getElementById('next-btn').onclick = () => {
    if (!state.build[step.key + 'Key']) return
    if (state.stepIndex < STEPS.length - 1) {
      sfx.click()
      state.stepIndex += 1
      render()
    } else {
      state.phase = 'result'
      fx.resultT0 = performance.now()
      fx.particles.length = 0
      sfx.fanfare()
      render()
      confetti(document.getElementById('result-canvas'))
    }
  }
}

function renderResult() {
  const stats = computeStats(state.build)
  const verdict = computeVerdict(stats)
  app.innerHTML = `
    <div class="result-wrap">
      <canvas id="result-canvas" width="460" height="560"></canvas>
      <h2 class="result-title">${state.name} 가동 시작</h2>
      <div class="result-verdict">${verdict}</div>
      <div class="result-stats">
        ${STAT_KEYS.map((k) => `<div class="result-stat"><div class="label">${STAT_LABELS[k]}</div><div class="value">${stats[k]}</div>${statBar(stats[k])}</div>`).join('')}
      </div>
      <button class="restart-btn" id="restart-btn">새 로봇 만들기</button>
    </div>
  `
  document.getElementById('restart-btn').onclick = () => {
    sfx.click()
    state = freshState()
    render()
  }
}

render()
