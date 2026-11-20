// The cast of 모순 탐정, drawn with canvas shapes in a glossy "sticker" style:
// outlined shapes, gradient shading, rim light, big expressive eyes.
//
// Every character is drawn in the same local coordinate system - feet at
// (0, 0), head centre at (0, HEAD_Y), head radius HEAD_R - so scenes can
// place and scale anyone the same way, and drawBust() can frame a
// character's face for the dialogue portraits.

const OUTLINE = '#1f1620'
export const HEAD_Y = -132
export const HEAD_R = 30

// name / voice pitch (for the dialogue blips) / label colour
export const CAST = {
  seojin: { name: '한서진', role: '탐정', pitch: 980, color: '#ffd36b' },
  hana: { name: '윤하나', role: '조수', pitch: 1650, color: '#ffb44d' },
  park: { name: '박 반장', role: '형사', pitch: 640, color: '#8fb4ff' },
  choi: { name: '최도윤 사장', role: '피해자', pitch: 820, color: '#d9c7a0' },
  minji: { name: '이민지', role: '편의점 점원', pitch: 1850, color: '#7fe0b0' },
  suhan: { name: '김수한', role: '목격자', pitch: 1180, color: '#ff9a9a' },
}

// ------------------------------------------------------------ helpers ----

function lg(ctx, x0, y0, x1, y1, ...stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c))
  return g
}

function poly(ctx, pts) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

function outline(ctx, w = 2.4) {
  ctx.lineWidth = w
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function shadowAt(ctx, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 3, rx, 8, 0, 0, Math.PI * 2)
  ctx.fill()
}

function legs(ctx, { pants, shoe, spread = 11, w = 15, shoeLen = 22 }) {
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.roundRect(s * spread - w / 2, -58, w, 52, 4)
    ctx.fillStyle = pants
    ctx.fill()
    outline(ctx, 2)
    ctx.beginPath()
    ctx.roundRect(s * spread - w / 2 - 2, -9, shoeLen, 11, [5, 6, 3, 3])
    ctx.fillStyle = shoe
    ctx.fill()
    outline(ctx, 2)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(s * spread - w / 2 + 1, -7, shoeLen - 6, 2)
  }
}

// Thick outlined limb with a hand at the end.
function limb(ctx, pts, w, sleeve, hand) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const trace = () => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  }
  trace()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = w + 4
  ctx.stroke()
  trace()
  ctx.strokeStyle = sleeve
  ctx.lineWidth = w
  ctx.stroke()
  const [hx, hy] = pts[pts.length - 1]
  ctx.beginPath()
  ctx.arc(hx, hy, w * 0.58, 0, Math.PI * 2)
  ctx.fillStyle = hand
  ctx.fill()
  outline(ctx, 1.8)
  ctx.lineCap = 'butt'
}

// Arm poses shared by everyone. `sx` is the shoulder half-width.
function arms(ctx, pose, { sx, sy = -98, w = 13, sleeve, hand, t = 0 }) {
  const sway = Math.sin(t * 1.6) * 1.5
  if (pose === 'point') {
    limb(ctx, [[-sx, sy + 4], [-sx - 4, sy + 30], [-sx - 3, sy + 44]], w, sleeve, hand)
    limb(ctx, [[sx, sy + 4], [sx + 30, sy - 2], [sx + 58, sy - 16]], w, sleeve, hand)
    // pointing finger
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(sx + 58, sy - 16)
    ctx.lineTo(sx + 78, sy - 24)
    ctx.stroke()
    ctx.strokeStyle = hand
    ctx.lineWidth = 3.4
    ctx.beginPath()
    ctx.moveTo(sx + 58, sy - 16)
    ctx.lineTo(sx + 78, sy - 24)
    ctx.stroke()
    ctx.lineCap = 'butt'
  } else if (pose === 'cheer') {
    const up = Math.sin(t * 7) * 3
    limb(ctx, [[-sx, sy + 4], [-sx - 22, sy - 12], [-sx - 28, sy - 40 + up]], w, sleeve, hand)
    limb(ctx, [[sx, sy + 4], [sx + 22, sy - 12], [sx + 28, sy - 40 - up]], w, sleeve, hand)
  } else if (pose === 'think') {
    limb(ctx, [[-sx, sy + 4], [-sx - 4, sy + 30], [-sx - 3, sy + 44]], w, sleeve, hand)
    limb(ctx, [[sx, sy + 4], [sx + 10, sy + 30], [8, sy - 8]], w, sleeve, hand)
  } else if (pose === 'pockets') {
    limb(ctx, [[-sx, sy + 4], [-sx - 3, sy + 28], [-sx + 12, sy + 48]], w, sleeve, hand)
    limb(ctx, [[sx, sy + 4], [sx + 3, sy + 28], [sx - 12, sy + 48]], w, sleeve, hand)
  } else {
    limb(ctx, [[-sx, sy + 4], [-sx - 4, sy + 28 + sway], [-sx - 3, sy + 46 + sway]], w, sleeve, hand)
    limb(ctx, [[sx, sy + 4], [sx + 4, sy + 28 - sway], [sx + 3, sy + 46 - sway]], w, sleeve, hand)
  }
}

// Head shape with soft shading, ears and a subtle jaw.
function head(ctx, skin, shade, { ears = true } = {}) {
  const r = HEAD_R
  if (ears) {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(s * r * 0.93, HEAD_Y + 5, 5.5, 8, 0, 0, Math.PI * 2)
      ctx.fillStyle = skin
      ctx.fill()
      outline(ctx, 2)
      ctx.fillStyle = shade
      ctx.beginPath()
      ctx.ellipse(s * r * 0.95, HEAD_Y + 5, 2.4, 4.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.beginPath()
  ctx.ellipse(0, HEAD_Y, r * 0.93, r, 0, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(-r * 0.3, HEAD_Y - r * 0.35, 3, 0, HEAD_Y, r * 1.1)
  g.addColorStop(0, skin)
  g.addColorStop(1, shade)
  ctx.fillStyle = g
  ctx.fill()
  outline(ctx, 2.6)
}

function neck(ctx, skin, shade) {
  ctx.beginPath()
  ctx.roundRect(-8, HEAD_Y + 22, 16, 22, 3)
  ctx.fillStyle = skin
  ctx.fill()
  ctx.fillStyle = shade
  ctx.fillRect(-8, HEAD_Y + 22, 16, 7)
  outline(ctx, 2)
}

// Expressive face. mood: neutral | smile | cheer | nervous | shocked |
// defeated | determined | worried | angry
function face(ctx, t, o) {
  const { mood = 'neutral', eye = '#4a3a2a', lashes = false, halfLid = 0, phase = 0, brow = '#2a1c18', lip = '#c4566a', cheek = 0.3, tired = false } = o
  const r = HEAD_R
  const ex = r * 0.4
  const ey = HEAD_Y + r * 0.08
  const blinking = ((t + phase) % 4.4) > 4.25
  const shocked = mood === 'shocked'

  // cheeks
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(s * r * 0.58, HEAD_Y + r * 0.42, r * 0.17, r * 0.1, 0, 0, Math.PI * 2)
    ctx.fillStyle = mood === 'nervous' ? 'rgba(255,100,100,0.5)' : `rgba(255,125,125,${cheek})`
    ctx.fill()
  }

  for (const s of [-1, 1]) {
    const x = s * ex
    if (blinking) {
      ctx.beginPath()
      ctx.moveTo(x - r * 0.19, ey + 1)
      ctx.quadraticCurveTo(x, ey + r * 0.1, x + r * 0.19, ey + 1)
      ctx.lineWidth = 2.2
      ctx.strokeStyle = OUTLINE
      ctx.stroke()
      continue
    }
    const rx = r * (shocked ? 0.23 : 0.2)
    const ry = r * (shocked ? 0.31 : 0.26)
    ctx.beginPath()
    ctx.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    const look = mood === 'nervous' ? Math.sin(t * 3 + phase) * r * 0.06 : -s * r * 0.02
    const ir = r * (shocked ? 0.11 : 0.17)
    const iy = ey + ry * 0.12
    const ig = ctx.createRadialGradient(x + look, iy - ir * 0.5, ir * 0.1, x + look, iy, ir)
    ig.addColorStop(0, '#ffffff55')
    ig.addColorStop(0.25, eye)
    ig.addColorStop(1, '#14100e')
    ctx.fillStyle = eye
    ctx.beginPath()
    ctx.arc(x + look, iy, ir, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ig
    ctx.fill()
    ctx.fillStyle = '#0e0a0a'
    ctx.beginPath()
    ctx.arc(x + look, iy, ir * 0.48, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x + look + ir * 0.42, iy - ir * 0.42, ir * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + look - ir * 0.38, iy + ir * 0.42, ir * 0.16, 0, Math.PI * 2)
    ctx.fill()
    if (halfLid) {
      ctx.fillStyle = 'rgba(0,0,0,0.001)'
    }
    ctx.restore()

    // lid line (heavier on top), optional half-closed lid in skin tone shadow
    ctx.beginPath()
    ctx.ellipse(x, ey, rx, ry, 0, Math.PI * 1.06, Math.PI * 1.94)
    ctx.lineWidth = 2.8
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    if (halfLid) {
      ctx.beginPath()
      ctx.moveTo(x - rx, ey - ry * (1 - halfLid * 2) * 0.1)
      ctx.lineTo(x + rx, ey - ry * (1 - halfLid * 2) * 0.1)
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = 'rgba(40,20,20,0.16)'
      ctx.fillRect(x - rx, ey - ry, rx * 2, ry * halfLid * 1.6)
    }
    if (lashes) {
      ctx.lineWidth = 2
      ctx.strokeStyle = OUTLINE
      ctx.lineCap = 'round'
      for (const k of [0, 1, 2]) {
        ctx.beginPath()
        ctx.moveTo(x + s * rx * (0.65 + k * 0.12), ey - ry * (0.78 - k * 0.1))
        ctx.lineTo(x + s * (rx + 3 + k * 0.6), ey - ry * (1.02 - k * 0.22) - 1)
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
    }
    if (tired) {
      ctx.strokeStyle = 'rgba(110,70,90,0.5)'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(x, ey + ry * 0.55, rx * 0.95, Math.PI * 0.12, Math.PI * 0.88)
      ctx.stroke()
    }
  }

  // brows
  const by = ey - r * (shocked ? 0.62 : 0.5)
  for (const s of [-1, 1]) {
    const x = s * ex
    let inner = 0
    let outer = 0
    if (mood === 'nervous' || mood === 'worried') { inner = -r * 0.14; outer = r * 0.05 }
    else if (mood === 'determined' || mood === 'angry') { inner = r * 0.12; outer = -r * 0.05 }
    else if (mood === 'defeated') { inner = -r * 0.16; outer = r * 0.08 }
    else if (mood === 'cheer' || mood === 'smile') { inner = r * 0.02; outer = -r * 0.04 }
    ctx.beginPath()
    ctx.moveTo(x - s * r * 0.22, by + inner)
    ctx.quadraticCurveTo(x, by - r * 0.1 + (inner + outer) / 2, x + s * r * 0.24, by + outer)
    ctx.lineWidth = mood === 'angry' || mood === 'determined' ? 4 : 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = brow
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // nose
  ctx.beginPath()
  ctx.moveTo(-1, HEAD_Y + r * 0.2)
  ctx.quadraticCurveTo(-r * 0.1, HEAD_Y + r * 0.4, r * 0.03, HEAD_Y + r * 0.4)
  ctx.lineWidth = 1.8
  ctx.strokeStyle = 'rgba(120,70,60,0.8)'
  ctx.stroke()

  // mouth
  const my = HEAD_Y + r * 0.64
  ctx.lineCap = 'round'
  ctx.lineWidth = 2.2
  ctx.strokeStyle = OUTLINE
  if (mood === 'cheer') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.3, my - r * 0.05)
    ctx.quadraticCurveTo(0, my + r * 0.42, r * 0.3, my - r * 0.05)
    ctx.closePath()
    ctx.fillStyle = '#7a2230'
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.fillRect(-r * 0.24, my - r * 0.04, r * 0.48, r * 0.1)
    ctx.fillStyle = '#e8707e'
    ctx.beginPath()
    ctx.ellipse(0, my + r * 0.2, r * 0.13, r * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (mood === 'shocked') {
    ctx.beginPath()
    ctx.ellipse(0, my + r * 0.06, r * 0.13, r * 0.19, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#5a1a22'
    ctx.fill()
    ctx.stroke()
  } else if (mood === 'smile') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.24, my - r * 0.02)
    ctx.quadraticCurveTo(0, my + r * 0.26, r * 0.24, my - r * 0.02)
    ctx.strokeStyle = lip
    ctx.lineWidth = 2.8
    ctx.stroke()
  } else if (mood === 'nervous') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.24, my + r * 0.04)
    for (let i = 1; i <= 4; i++) ctx.lineTo(-r * 0.24 + i * r * 0.12, my + (i % 2 ? -r * 0.05 : r * 0.06))
    ctx.stroke()
  } else if (mood === 'defeated' || mood === 'worried') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.22, my + r * 0.1)
    ctx.quadraticCurveTo(0, my - r * 0.1, r * 0.22, my + r * 0.1)
    ctx.stroke()
  } else if (mood === 'determined') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.22, my)
    ctx.quadraticCurveTo(0, my + r * 0.08, r * 0.24, my - r * 0.06)
    ctx.stroke()
  } else if (mood === 'angry') {
    ctx.beginPath()
    ctx.roundRect(-r * 0.22, my - r * 0.04, r * 0.44, r * 0.16, 3)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, my - r * 0.04)
    ctx.lineTo(0, my + r * 0.12)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(-r * 0.2, my)
    ctx.quadraticCurveTo(0, my + r * 0.06, r * 0.2, my)
    ctx.strokeStyle = lip
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
}

// Strand lines + a glossy highlight over a hair shape that is already the
// current path's fill.
function hairShine(ctx, x, y, r, a0, a1) {
  ctx.beginPath()
  ctx.arc(x, y, r, a0, a1)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'
  ctx.stroke()
  ctx.lineCap = 'butt'
}

// ------------------------------------------------------------ characters ----

function seojin(ctx, t, o) {
  const pose = o.pose || 'pockets'
  const mood = o.mood || 'determined'
  legs(ctx, { pants: '#2b2a33', shoe: '#5a3a24', spread: 10, w: 14 })

  // long trench coat
  poly(ctx, [[-30, -102], [30, -102], [38, -30], [-38, -30]])
  ctx.fillStyle = lg(ctx, 0, -102, 0, -30, '#5a5963', '#3a3942')
  ctx.fill()
  outline(ctx)
  // lapels + double-breasted buttons + belt
  poly(ctx, [[-4, -100], [-24, -100], [-10, -66], [-4, -76]])
  ctx.fillStyle = '#6a6974'
  ctx.fill()
  outline(ctx, 1.8)
  poly(ctx, [[4, -100], [24, -100], [10, -66], [4, -76]])
  ctx.fill()
  outline(ctx, 1.8)
  ctx.fillStyle = '#c9b46a'
  for (const by of [-82, -66, -50]) for (const bx of [-9, 9]) {
    ctx.beginPath()
    ctx.arc(bx, by, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#2a2018'
  ctx.fillRect(-35, -64, 70, 7)
  ctx.fillStyle = '#d2b56a'
  ctx.fillRect(-6, -65, 12, 9)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  poly(ctx, [[-28, -100], [-20, -100], [-30, -34], [-36, -34]])
  ctx.fill()

  neck(ctx, '#f0c9a4', '#d9ab84')
  // shirt + tie
  poly(ctx, [[-10, -98], [10, -98], [0, -76]])
  ctx.fillStyle = '#f4f0e6'
  ctx.fill()
  outline(ctx, 1.6)
  poly(ctx, [[-3, -92], [3, -92], [4.5, -70], [0, -64], [-4.5, -70]])
  ctx.fillStyle = '#7a2230'
  ctx.fill()
  outline(ctx, 1.4)
  // popped collar
  for (const s of [-1, 1]) {
    poly(ctx, [[s * 7, -100], [s * 26, -108], [s * 24, -86]])
    ctx.fillStyle = '#6a6974'
    ctx.fill()
    outline(ctx, 2)
  }
  // scarf with a tail that sways
  const sw = Math.sin(t * 2.2) * 3
  ctx.beginPath()
  ctx.ellipse(0, -96, 17, 7, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#c0392f'
  ctx.fill()
  outline(ctx, 2)
  poly(ctx, [[8, -94], [18, -92], [30 + sw, -62], [24 + sw, -54], [14, -80]])
  ctx.fillStyle = '#d4493b'
  ctx.fill()
  outline(ctx, 2)

  arms(ctx, pose, { sx: 32, sleeve: '#4a4953', hand: '#f0c9a4', t })

  head(ctx, '#f6d5b2', '#e1b690')
  // swept dark-navy hair with a long fringe over one eye
  const hairG = lg(ctx, -30, HEAD_Y - 36, 20, HEAD_Y + 10, '#2c3658', '#171c33')
  ctx.beginPath()
  ctx.moveTo(-31, HEAD_Y + 8)
  ctx.quadraticCurveTo(-36, HEAD_Y - 30, -8, HEAD_Y - 34)
  ctx.quadraticCurveTo(26, HEAD_Y - 38, 31, HEAD_Y - 2)
  ctx.lineTo(28, HEAD_Y + 12)
  ctx.quadraticCurveTo(26, HEAD_Y - 14, 10, HEAD_Y - 16)
  ctx.quadraticCurveTo(-4, HEAD_Y - 12, -14, HEAD_Y + 2) // fringe sweeping across the brow
  ctx.quadraticCurveTo(-20, HEAD_Y - 6, -26, HEAD_Y + 4)
  ctx.closePath()
  ctx.fillStyle = hairG
  ctx.fill()
  outline(ctx, 2.2)
  hairShine(ctx, -2, HEAD_Y - 10, 24, Math.PI * 1.2, Math.PI * 1.5)
  face(ctx, t, { mood, eye: '#4f7fb0', halfLid: 0.12, brow: '#171c33', phase: o.phase || 0, cheek: 0.16 })

  // tilted fedora over the hair
  ctx.save()
  ctx.translate(0, HEAD_Y - 22)
  ctx.rotate(-0.1)
  ctx.beginPath()
  ctx.ellipse(0, 6, 44, 10, 0, 0, Math.PI * 2)
  ctx.fillStyle = lg(ctx, 0, -4, 0, 16, '#3c3a44', '#22212a')
  ctx.fill()
  outline(ctx, 2.4)
  ctx.beginPath()
  ctx.moveTo(-23, 4)
  ctx.quadraticCurveTo(-25, -26, -8, -28)
  ctx.quadraticCurveTo(0, -22, 8, -28)
  ctx.quadraticCurveTo(25, -26, 23, 4)
  ctx.closePath()
  ctx.fillStyle = lg(ctx, -24, -28, 24, 4, '#4a4854', '#2a2931')
  ctx.fill()
  outline(ctx, 2.4)
  ctx.fillStyle = '#8a2a35'
  ctx.fillRect(-23.5, -8, 47, 7)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.2
  ctx.strokeRect(-23.5, -8, 47, 7)
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(-18, -24, 10, 3)
  ctx.restore()
}

function hana(ctx, t, o) {
  const pose = o.pose || 'idle'
  const mood = o.mood || 'smile'
  const sway = Math.sin(t * 2) * 4
  legs(ctx, { pants: '#f1d3b4', shoe: '#f4f1ea', spread: 9, w: 12, shoeLen: 21 })
  // ponytail behind the head
  ctx.beginPath()
  ctx.moveTo(14, HEAD_Y - 26)
  ctx.quadraticCurveTo(52 + sway, HEAD_Y - 36, 46 + sway * 1.4, HEAD_Y + 20 + sway)
  ctx.quadraticCurveTo(36 + sway, HEAD_Y + 4, 24, HEAD_Y - 6)
  ctx.closePath()
  ctx.fillStyle = lg(ctx, 14, HEAD_Y - 30, 46, HEAD_Y + 20, '#d1693a', '#9a3f20')
  ctx.fill()
  outline(ctx, 2.2)

  // navy skirt
  poly(ctx, [[-27, -62], [27, -62], [34, -34], [-34, -34]])
  ctx.fillStyle = lg(ctx, 0, -62, 0, -34, '#3a4a78', '#26325a')
  ctx.fill()
  outline(ctx)
  // mustard jacket over a white blouse
  poly(ctx, [[-27, -102], [27, -102], [30, -58], [-30, -58]])
  ctx.fillStyle = lg(ctx, 0, -102, 0, -58, '#ffc94a', '#e89b24')
  ctx.fill()
  outline(ctx)
  poly(ctx, [[-9, -100], [9, -100], [4, -62], [-4, -62]])
  ctx.fillStyle = '#fff8ec'
  ctx.fill()
  outline(ctx, 1.6)
  ctx.fillStyle = '#c0392f' // neck ribbon
  poly(ctx, [[-9, -98], [0, -92], [9, -98], [6, -88], [0, -92], [-6, -88]])
  ctx.fill()
  outline(ctx, 1.4)
  // shoulder bag strap
  ctx.strokeStyle = '#7a4a2a'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(-22, -102)
  ctx.lineTo(26, -60)
  ctx.stroke()
  ctx.fillStyle = '#8a5a34'
  ctx.beginPath()
  ctx.roundRect(18, -64, 22, 18, 4)
  ctx.fill()
  outline(ctx, 2)

  neck(ctx, '#fcdcc2', '#eebd9d')
  arms(ctx, pose, { sx: 29, sleeve: '#f2ae35', hand: '#fcdcc2', w: 12, t })
  if (pose === 'idle') {
    // notebook held in front
    ctx.save()
    ctx.translate(-33, -54)
    ctx.rotate(-0.15)
    ctx.fillStyle = '#e8473f'
    ctx.fillRect(-7, -10, 15, 20)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.8
    ctx.strokeRect(-7, -10, 15, 20)
    ctx.fillStyle = '#fff'
    ctx.fillRect(-4, -6, 9, 2)
    ctx.restore()
  }

  head(ctx, '#ffe0c8', '#f0bf9f')
  // hair: cap + side bangs + highlight
  const hg = lg(ctx, -30, HEAD_Y - 36, 26, HEAD_Y + 14, '#d9784a', '#a9461f')
  ctx.beginPath()
  ctx.moveTo(-32, HEAD_Y + 14)
  ctx.quadraticCurveTo(-38, HEAD_Y - 30, -4, HEAD_Y - 36)
  ctx.quadraticCurveTo(34, HEAD_Y - 34, 32, HEAD_Y + 12)
  ctx.lineTo(26, HEAD_Y + 2)
  ctx.quadraticCurveTo(22, HEAD_Y - 14, 6, HEAD_Y - 10) // side-swept bangs
  ctx.quadraticCurveTo(-8, HEAD_Y - 22, -20, HEAD_Y - 6)
  ctx.quadraticCurveTo(-24, HEAD_Y, -26, HEAD_Y + 8)
  ctx.closePath()
  ctx.fillStyle = hg
  ctx.fill()
  outline(ctx, 2.2)
  hairShine(ctx, 0, HEAD_Y - 14, 26, Math.PI * 1.15, Math.PI * 1.45)
  face(ctx, t, { mood, eye: '#2f9a5e', lashes: true, brow: '#8a3a1c', lip: '#e0506a', cheek: 0.42, phase: 1.3 })
  // ribbon at the base of the ponytail
  ctx.fillStyle = '#e8473f'
  poly(ctx, [[18, HEAD_Y - 28], [34, HEAD_Y - 38], [30, HEAD_Y - 24], [36, HEAD_Y - 14], [20, HEAD_Y - 22]])
  ctx.fill()
  outline(ctx, 1.8)
}

function park(ctx, t, o) {
  const pose = o.pose || 'idle'
  const mood = o.mood || 'neutral'
  legs(ctx, { pants: '#1f2840', shoe: '#17151c', spread: 13, w: 18, shoeLen: 24 })
  // broad uniform torso
  poly(ctx, [[-38, -102], [38, -102], [42, -52], [-42, -52]])
  ctx.fillStyle = lg(ctx, 0, -102, 0, -52, '#34456e', '#232f50')
  ctx.fill()
  outline(ctx)
  ctx.fillStyle = '#17151c'
  ctx.fillRect(-42, -60, 84, 8)
  ctx.fillStyle = '#d4af37'
  ctx.fillRect(-7, -61, 14, 10)
  // shirt, tie, buttons, badge, epaulettes
  poly(ctx, [[-10, -100], [10, -100], [0, -80]])
  ctx.fillStyle = '#e8eef8'
  ctx.fill()
  outline(ctx, 1.6)
  ctx.fillStyle = '#17151c'
  poly(ctx, [[-3, -94], [3, -94], [4, -66], [0, -62], [-4, -66]])
  ctx.fill()
  ctx.fillStyle = '#d4af37'
  for (const by of [-78, -68]) {
    ctx.beginPath()
    ctx.arc(0, by, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#17151c'
    ctx.fillRect(s * 30 - 8, -104, 16, 7)
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(s * 30 - 8, -99, 16, 2)
  }
  ctx.fillStyle = '#d4af37'
  poly(ctx, [[-30, -88], [-22, -88], [-20, -78], [-26, -73], [-32, -78]])
  ctx.fill()
  outline(ctx, 1.4)

  neck(ctx, '#e4b88e', '#c99a72')
  arms(ctx, pose, { sx: 42, sleeve: '#2c3b62', hand: '#e4b88e', w: 15, t })
  if (pose === 'idle') {
    // notepad
    ctx.fillStyle = '#f2ead0'
    ctx.fillRect(-60, -62, 17, 22)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.8
    ctx.strokeRect(-60, -62, 17, 22)
    ctx.fillStyle = '#6a5a3a'
    ctx.fillRect(-57, -57, 11, 1.6)
    ctx.fillRect(-57, -52, 11, 1.6)
  }

  head(ctx, '#ebc197', '#cd9f77')
  // grey sideburns + peaked police cap
  ctx.fillStyle = '#9a9aa4'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.roundRect(s * 26 - 3, HEAD_Y - 12, 6, 22, 3)
    ctx.fill()
    outline(ctx, 1.6)
  }
  face(ctx, t, { mood, eye: '#4a3a30', halfLid: 0.28, brow: '#6a6a74', tired: true, cheek: 0.14, phase: 0.6, lip: '#a85a50' })
  // handlebar moustache
  ctx.fillStyle = '#8a8a94'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, HEAD_Y + 17)
    ctx.quadraticCurveTo(s * 12, HEAD_Y + 12, s * 21, HEAD_Y + 20)
    ctx.quadraticCurveTo(s * 12, HEAD_Y + 24, 0, HEAD_Y + 22)
    ctx.fill()
    outline(ctx, 1.4)
  }
  // laugh lines
  ctx.strokeStyle = 'rgba(110,70,50,0.45)'
  ctx.lineWidth = 1.4
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(s * 13, HEAD_Y + 12, 11, s > 0 ? -0.6 : Math.PI - 0.2 - 0.4, s > 0 ? 0.5 : Math.PI + 0.6)
    ctx.stroke()
  }
  // cap
  ctx.beginPath()
  ctx.moveTo(-30, HEAD_Y - 14)
  ctx.quadraticCurveTo(-34, HEAD_Y - 44, 0, HEAD_Y - 46)
  ctx.quadraticCurveTo(34, HEAD_Y - 44, 30, HEAD_Y - 14)
  ctx.closePath()
  ctx.fillStyle = lg(ctx, 0, HEAD_Y - 46, 0, HEAD_Y - 14, '#34456e', '#1f2a4a')
  ctx.fill()
  outline(ctx, 2.4)
  ctx.beginPath()
  ctx.ellipse(0, HEAD_Y - 13, 36, 7, 0, 0, Math.PI)
  ctx.fillStyle = '#14131a'
  ctx.fill()
  outline(ctx, 2.2)
  ctx.fillStyle = '#17151c'
  ctx.fillRect(-30, HEAD_Y - 22, 60, 7)
  ctx.fillStyle = '#d4af37'
  ctx.beginPath()
  ctx.moveTo(0, HEAD_Y - 38)
  ctx.lineTo(7, HEAD_Y - 28)
  ctx.lineTo(0, HEAD_Y - 18)
  ctx.lineTo(-7, HEAD_Y - 28)
  ctx.closePath()
  ctx.fill()
  outline(ctx, 1.4)
}

function choi(ctx, t, o) {
  const pose = o.pose || 'idle'
  const mood = o.mood || 'worried'
  legs(ctx, { pants: '#55535c', shoe: '#2a2420', spread: 11, w: 16, shoeLen: 23 })
  // rumpled grey suit, round belly, loosened tie
  poly(ctx, [[-33, -102], [33, -102], [40, -52], [-40, -52]])
  ctx.fillStyle = lg(ctx, 0, -102, 0, -52, '#9a9890', '#74726b')
  ctx.fill()
  outline(ctx)
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(-18, -70); ctx.lineTo(-8, -64); ctx.moveTo(14, -86); ctx.lineTo(24, -76)
  ctx.stroke()
  poly(ctx, [[-12, -100], [12, -100], [0, -66]])
  ctx.fillStyle = '#f2efe6'
  ctx.fill()
  outline(ctx, 1.6)
  ctx.fillStyle = '#b8403a'
  poly(ctx, [[-4, -92], [4, -92], [6, -62], [0, -55], [-6, -62]])
  ctx.fill()
  outline(ctx, 1.4)
  for (const s of [-1, 1]) {
    poly(ctx, [[s * 6, -100], [s * 26, -96], [s * 16, -66]])
    ctx.fillStyle = '#8a8880'
    ctx.fill()
    outline(ctx, 1.8)
  }

  neck(ctx, '#e2b890', '#c79a74')
  arms(ctx, pose, { sx: 36, sleeve: '#86847c', hand: '#e2b890', w: 14, t })

  head(ctx, '#e9c19a', '#cda07a')
  // slicked-back hair with a receding hairline, greying at the temples
  ctx.beginPath()
  ctx.moveTo(-28, HEAD_Y + 2)
  ctx.quadraticCurveTo(-30, HEAD_Y - 24, -8, HEAD_Y - 30)
  ctx.quadraticCurveTo(22, HEAD_Y - 32, 28, HEAD_Y + 2)
  ctx.lineTo(22, HEAD_Y - 8)
  ctx.quadraticCurveTo(10, HEAD_Y - 18, -10, HEAD_Y - 16)
  ctx.quadraticCurveTo(-22, HEAD_Y - 14, -28, HEAD_Y + 2)
  ctx.closePath()
  ctx.fillStyle = lg(ctx, -28, HEAD_Y - 30, 28, HEAD_Y, '#3a322c', '#1c1714')
  ctx.fill()
  outline(ctx, 2.2)
  ctx.fillStyle = '#a8a8b0'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.roundRect(s * 24 - 3, HEAD_Y - 6, 5, 12, 2)
    ctx.fill()
  }
  face(ctx, t, { mood, eye: '#4a3626', brow: '#2a2420', tired: true, cheek: 0.14, phase: 2.1, lip: '#a85a50' })
  // round glasses
  ctx.strokeStyle = '#5a4a2a'
  ctx.lineWidth = 2.4
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(s * 12, HEAD_Y + 2.5, 9.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(200,225,255,0.16)'
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-3, HEAD_Y + 1)
  ctx.quadraticCurveTo(0, HEAD_Y - 2, 3, HEAD_Y + 1)
  ctx.stroke()
  // bandage on the forehead
  ctx.save()
  ctx.translate(14, HEAD_Y - 17)
  ctx.rotate(-0.25)
  ctx.fillStyle = '#f6efe0'
  ctx.fillRect(-9, -4, 18, 8)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.5
  ctx.strokeRect(-9, -4, 18, 8)
  ctx.fillStyle = '#d9a8a0'
  ctx.fillRect(-3, -3, 6, 6)
  ctx.restore()
}

function minji(ctx, t, o) {
  const pose = o.pose || 'idle'
  const mood = o.mood || 'smile'
  legs(ctx, { pants: '#c8b48a', shoe: '#f2f0e8', spread: 9, w: 13, shoeLen: 21 })
  // striped store polo + apron
  poly(ctx, [[-27, -102], [27, -102], [30, -54], [-30, -54]])
  ctx.fillStyle = lg(ctx, 0, -102, 0, -54, '#38b27c', '#23895a')
  ctx.fill()
  outline(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(-28, -82, 56, 5)
  ctx.fillRect(-29, -70, 58, 5)
  poly(ctx, [[-17, -66], [17, -66], [20, -42], [-20, -42]])
  ctx.fillStyle = '#f7f4ea'
  ctx.fill()
  outline(ctx, 1.8)
  // name tag
  ctx.fillStyle = '#fff'
  ctx.fillRect(8, -96, 15, 8)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.4
  ctx.strokeRect(8, -96, 15, 8)
  ctx.fillStyle = '#23895a'
  ctx.fillRect(10, -93, 11, 1.6)
  ctx.fillRect(10, -90, 7, 1.6)
  // collar
  poly(ctx, [[-9, -102], [0, -92], [9, -102], [14, -98], [0, -86], [-14, -98]])
  ctx.fillStyle = '#e9fff4'
  ctx.fill()
  outline(ctx, 1.6)

  neck(ctx, '#fcdcc4', '#efbf9f')
  arms(ctx, pose, { sx: 29, sleeve: '#2f9d6a', hand: '#fcdcc4', w: 12, t })

  head(ctx, '#ffe2cc', '#f1c3a3')
  // light-brown bob
  const hg = lg(ctx, -32, HEAD_Y - 36, 26, HEAD_Y + 20, '#c4906a', '#8e5f3c')
  ctx.beginPath()
  ctx.moveTo(-34, HEAD_Y + 22)
  ctx.quadraticCurveTo(-42, HEAD_Y - 28, -2, HEAD_Y - 36)
  ctx.quadraticCurveTo(42, HEAD_Y - 28, 34, HEAD_Y + 22)
  ctx.quadraticCurveTo(28, HEAD_Y + 20, 27, HEAD_Y + 6)
  ctx.quadraticCurveTo(22, HEAD_Y - 14, 0, HEAD_Y - 14)
  ctx.quadraticCurveTo(-22, HEAD_Y - 14, -27, HEAD_Y + 6)
  ctx.quadraticCurveTo(-28, HEAD_Y + 20, -34, HEAD_Y + 22)
  ctx.closePath()
  ctx.fillStyle = hg
  ctx.fill()
  outline(ctx, 2.2)
  hairShine(ctx, 0, HEAD_Y - 14, 27, Math.PI * 1.15, Math.PI * 1.45)
  face(ctx, t, { mood, eye: '#6a4430', lashes: true, brow: '#7a4e30', lip: '#e0607a', cheek: 0.4, phase: 3.2 })
  // green visor cap
  ctx.beginPath()
  ctx.moveTo(-30, HEAD_Y - 18)
  ctx.quadraticCurveTo(-30, HEAD_Y - 38, 0, HEAD_Y - 38)
  ctx.quadraticCurveTo(30, HEAD_Y - 38, 30, HEAD_Y - 18)
  ctx.closePath()
  ctx.fillStyle = lg(ctx, 0, HEAD_Y - 38, 0, HEAD_Y - 18, '#38b27c', '#23895a')
  ctx.fill()
  outline(ctx, 2.2)
  poly(ctx, [[-30, HEAD_Y - 18], [30, HEAD_Y - 18], [40, HEAD_Y - 12], [-40, HEAD_Y - 12]])
  ctx.fillStyle = '#1c6b46'
  ctx.fill()
  outline(ctx, 2)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(0, HEAD_Y - 29, 4.5, 0, Math.PI * 2)
  ctx.fill()
}

function suhan(ctx, t, o) {
  const pose = o.pose || 'idle'
  const mood = o.mood || 'nervous'
  legs(ctx, { pants: '#2e3447', shoe: '#1c1a22', spread: 11, w: 15 })
  // blue jacket, white shirt, crooked tie
  poly(ctx, [[-30, -102], [30, -102], [36, -50], [-36, -50]])
  ctx.fillStyle = lg(ctx, 0, -102, 0, -50, '#5a82bc', '#3d5f95')
  ctx.fill()
  outline(ctx)
  poly(ctx, [[-10, -100], [10, -100], [0, -72]])
  ctx.fillStyle = '#f2f0e8'
  ctx.fill()
  outline(ctx, 1.6)
  for (const s of [-1, 1]) {
    poly(ctx, [[s * 6, -100], [s * 24, -100], [s * 8, -64], [s * 3, -74]])
    ctx.fillStyle = '#4a6fa5'
    ctx.fill()
    outline(ctx, 1.8)
  }
  ctx.fillStyle = '#b84a4a'
  poly(ctx, [[-3, -94], [3, -94], [7, -66], [2, -60], [-2, -68]])
  ctx.fill()
  outline(ctx, 1.4)
  ctx.fillStyle = '#e8e0d0'
  for (const by of [-54, -44]) {
    ctx.beginPath()
    ctx.arc(0, by, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  neck(ctx, '#e6b88c', '#cb9a70')
  arms(ctx, pose, { sx: 33, sleeve: '#4a6fa5', hand: '#e6b88c', w: 13, t })

  head(ctx, '#eac09a', '#cfa27c')
  // black side-parted hair, glossy
  ctx.beginPath()
  ctx.moveTo(-30, HEAD_Y + 6)
  ctx.quadraticCurveTo(-33, HEAD_Y - 30, -4, HEAD_Y - 34)
  ctx.quadraticCurveTo(28, HEAD_Y - 32, 30, HEAD_Y + 6)
  ctx.lineTo(25, HEAD_Y - 6)
  ctx.quadraticCurveTo(8, HEAD_Y - 22, -14, HEAD_Y - 8)
  ctx.quadraticCurveTo(-22, HEAD_Y - 4, -30, HEAD_Y + 6)
  ctx.closePath()
  ctx.fillStyle = lg(ctx, -30, HEAD_Y - 34, 26, HEAD_Y, '#3a3036', '#171216')
  ctx.fill()
  outline(ctx, 2.2)
  hairShine(ctx, -2, HEAD_Y - 10, 25, Math.PI * 1.2, Math.PI * 1.5)
  face(ctx, t, { mood, eye: '#3a2a22', brow: '#171216', tired: true, cheek: 0.2, phase: 4.1, lip: '#a85a50' })
  // stubble + a sweat drop
  ctx.fillStyle = 'rgba(30,22,26,0.4)'
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI
    ctx.fillRect(Math.cos(a) * 17 - 0.5, HEAD_Y + 24 + Math.sin(a) * 6 + (i % 3) * 1.6, 1.4, 1.4)
  }
  if (mood === 'nervous' || mood === 'shocked') {
    const w = Math.sin(t * 5.5) * 1.5
    ctx.beginPath()
    ctx.moveTo(34, HEAD_Y - 16 + w)
    ctx.quadraticCurveTo(41, HEAD_Y - 6 + w, 34, HEAD_Y + 2 + w)
    ctx.quadraticCurveTo(27, HEAD_Y - 6 + w, 34, HEAD_Y - 16 + w)
    ctx.fillStyle = '#8fd0ff'
    ctx.fill()
    outline(ctx, 1.4)
  }
}

const DRAWERS = { seojin, hana, park, choi, minji, suhan }

// ---------------------------------------------------------------- public ----

// Draw `id` standing at (x, baseY), optionally scaled / mirrored.
//   opts: { mood, pose, scale = 1, flip = false, t }
export function drawCharacter(ctx, id, x, baseY, opts = {}) {
  const fn = DRAWERS[id]
  if (!fn) return
  const t = opts.t ?? performance.now() / 1000
  const s = opts.scale ?? 1
  ctx.save()
  ctx.translate(x, baseY)
  // a gentle idle bob, so nobody stands perfectly frozen
  const bob = Math.sin(t * 1.7 + (id.length * 1.3)) * 1.2 * s
  ctx.translate(0, bob)
  ctx.scale(opts.flip ? -s : s, s)
  shadowAt(ctx, 38)
  fn(ctx, t, opts)
  ctx.restore()
}

// A framed face-and-shoulders portrait for the dialogue box.
export function drawBust(ctx, id, x, y, size, mood, t) {
  const meta = CAST[id]
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 10)
  ctx.clip()
  ctx.fillStyle = lg(ctx, x, y, x, y + size, '#3a4258', '#1c2132')
  ctx.fillRect(x, y, size, size)
  // soft spotlight behind the head
  const g = ctx.createRadialGradient(x + size / 2, y + size * 0.42, 4, x + size / 2, y + size * 0.42, size * 0.7)
  g.addColorStop(0, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, size, size)
  const k = size / 112
  ctx.translate(x + size / 2, y + size * 0.52 - HEAD_Y * k)
  ctx.scale(k, k)
  const fn = DRAWERS[id]
  if (fn) fn(ctx, t ?? performance.now() / 1000, { mood, pose: 'idle' })
  ctx.restore()
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 10)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = meta ? meta.color : '#c9a85c'
  ctx.stroke()
}
