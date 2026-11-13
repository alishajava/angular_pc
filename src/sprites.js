// Small procedural "paper doll" character art, built from canvas shapes
// instead of image files. Each draw*() call is centered on (x, y).

function block(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `rgb(${r},${g},${b})`
}

// `swing` is a small px offset (typically from a caller-computed sine wave)
// that alternates the legs and arms to fake a walk/idle-sway cycle. The
// upper body also bobs with |swing| so the motion reads clearly even at
// small amplitudes, instead of being limited to a couple of tiny blocks.
// Face details (eyes with highlights, brows, nose, mouth, ears, blush) and
// soft shading are drawn at this tiny scale so characters read as people
// rather than blobs; `mood` swaps the mouth, `eye` sets the iris colour.
function humanoid(ctx, x, y, { skin, hair, outfit, boots, pants = '#3a3f55', eye = '#2b2430', mood = 'smile', swing = 0 }) {
  ctx.save()
  ctx.translate(x, y)

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(0, 15, 9, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  // legs: trousers + boots
  ctx.fillStyle = pants
  block(ctx, -7, 2 + swing * 0.5, 5, 7, 2)
  block(ctx, 2, 2 - swing * 0.5, 5, 7, 2)
  ctx.fillStyle = boots
  block(ctx, -8, 8 + swing, 6, 6, 2)
  block(ctx, 2, 8 - swing, 6, 6, 2)

  ctx.save()
  ctx.translate(0, -Math.abs(swing) * 0.5)

  // arms: sleeve + hand
  ctx.fillStyle = outfit
  block(ctx, -12, -4 - swing, 4, 8, 2)
  block(ctx, 8, -4 + swing, 4, 8, 2)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(-10, 5 - swing, 2.2, 0, Math.PI * 2)
  ctx.arc(10, 5 + swing, 2.2, 0, Math.PI * 2)
  ctx.fill()

  // torso with a darker lower edge and a collar notch
  ctx.fillStyle = outfit
  block(ctx, -9, -5, 18, 13, 4)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  block(ctx, -9, 4, 18, 4, 3)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  block(ctx, -7, -4, 6, 4, 2)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.moveTo(-3, -5)
  ctx.lineTo(0, -1)
  ctx.lineTo(3, -5)
  ctx.closePath()
  ctx.fill()

  // ears
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(-8, -11, 1.8, 0, Math.PI * 2)
  ctx.arc(8, -11, 1.8, 0, Math.PI * 2)
  ctx.fill()

  // head (soft outline so it pops against the grass)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(0, -12, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,30,20,0.35)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // hair: cap + fringe + side locks + shine
  ctx.fillStyle = hair
  ctx.beginPath()
  ctx.arc(0, -14.5, 8.4, Math.PI, 0)
  ctx.lineTo(7.6, -12)
  ctx.lineTo(5, -14)
  ctx.lineTo(2.5, -12.2)
  ctx.lineTo(0, -14.4)
  ctx.lineTo(-2.5, -12.2)
  ctx.lineTo(-5, -14)
  ctx.lineTo(-7.6, -12)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(-8.4, -15, 1.8, 6)
  ctx.fillRect(6.6, -15, 1.8, 6)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, -14.5, 6.4, Math.PI * 1.15, Math.PI * 1.45)
  ctx.stroke()

  // eyes: white, iris, highlight
  for (const sx of [-1, 1]) {
    const ex = sx * 3.2
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(ex, -10.6, 2, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = eye
    ctx.beginPath()
    ctx.ellipse(ex, -10.4, 1.25, 1.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(ex + 0.1, -11.4, 0.9, 0.9)
    ctx.strokeStyle = 'rgba(30,20,20,0.8)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(ex - 2, -12.9 + (sx > 0 ? 0.2 : 0))
    ctx.lineTo(ex + 2, -12.9 + (sx > 0 ? 0 : 0.2))
    ctx.stroke()
  }

  // cheeks, nose, mouth
  ctx.fillStyle = 'rgba(255,120,120,0.32)'
  ctx.beginPath()
  ctx.ellipse(-5.2, -8, 1.7, 1.1, 0, 0, Math.PI * 2)
  ctx.ellipse(5.2, -8, 1.7, 1.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(150,80,60,0.55)'
  ctx.fillRect(-0.4, -9, 0.9, 1.3)
  ctx.strokeStyle = '#8a3b3b'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  if (mood === 'flat') {
    ctx.moveTo(-1.6, -6.4)
    ctx.lineTo(1.6, -6.4)
  } else {
    ctx.arc(0, -7.4, 2, 0.2 * Math.PI, 0.8 * Math.PI)
  }
  ctx.stroke()

  ctx.restore()
  ctx.restore()
}

export function drawHero(ctx, x, y, facing = 'down', swing = 0) {
  ctx.save()
  ctx.translate(x, y)
  if (facing === 'left') ctx.scale(-1, 1)
  humanoid(ctx, 0, 0, { skin: '#f2c79b', hair: '#5a3e1b', outfit: '#3f7fd1', boots: '#2b2440', eye: '#2f5fa0', swing })
  // spiky tuft + headband
  ctx.save()
  ctx.translate(0, -Math.abs(swing) * 0.5)
  ctx.fillStyle = '#5a3e1b'
  for (const [tx, tw] of [[-4, 3], [0, 4], [4, 3]]) {
    ctx.beginPath()
    ctx.moveTo(tx - tw / 2, -21)
    ctx.lineTo(tx, -26 + (tx === 0 ? -1 : 0))
    ctx.lineTo(tx + tw / 2, -21)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#e04a4a'
  ctx.fillRect(-8.4, -17.2, 16.8, 2)
  ctx.fillRect(7.6, -17, 4, 1.4)
  ctx.restore()
  // belt
  ctx.fillStyle = '#5a3e1b'
  ctx.fillRect(-9, 4, 18, 3)
  // tiny sword at the hip
  ctx.fillStyle = '#c9ccd6'
  ctx.fillRect(9, -2, 2, 10)
  ctx.fillStyle = '#8a6a2e'
  ctx.fillRect(7, 6, 6, 2)
  ctx.restore()
}

export function drawHeroine(ctx, x, y, facing = 'down', swing = 0) {
  ctx.save()
  ctx.translate(x, y)
  if (facing === 'left') ctx.scale(-1, 1)
  humanoid(ctx, 0, 0, { skin: '#f2c79b', hair: '#7a2340', outfit: '#e0557a', boots: '#3b2440', eye: '#b0386a', swing })
  // twin tails
  ctx.fillStyle = '#7a2340'
  block(ctx, -11, -14, 4, 12, 2)
  block(ctx, 7, -14, 4, 12, 2)
  // hair ribbon
  ctx.fillStyle = '#ffe066'
  ctx.fillRect(-3, -19, 6, 2)
  // small dagger at the hip
  ctx.fillStyle = '#c9ccd6'
  ctx.fillRect(-11, -2, 2, 9)
  ctx.fillStyle = '#8a6a2e'
  ctx.fillRect(-13, 5, 6, 2)
  ctx.restore()
}

export function drawVillager(ctx, x, y, outfit, hair = '#5a3e1b', swing = 0, facing = 'right') {
  ctx.save()
  ctx.translate(x, y)
  if (facing === 'left') ctx.scale(-1, 1)
  humanoid(ctx, 0, 0, { skin: '#f2c79b', hair, outfit, boots: '#3b2a1a', swing })
  ctx.restore()
}

export function drawElder(ctx, x, y, swing = 0, facing = 'right') {
  ctx.save()
  ctx.translate(x, y)
  if (facing === 'left') ctx.scale(-1, 1)
  humanoid(ctx, 0, 0, { skin: '#e8c6a0', hair: '#e8e8e8', outfit: '#6b4fa0', boots: '#3b2a1a', eye: '#4a6a8a', mood: 'flat', swing })
  // bushy brows, moustache and beard
  ctx.save()
  ctx.translate(0, -Math.abs(swing) * 0.5)
  ctx.fillStyle = '#f2f2f2'
  block(ctx, -6, -14, 5, 1.8, 1)
  block(ctx, 1, -14, 5, 1.8, 1)
  block(ctx, -3.5, -9, 7, 2, 1)
  ctx.beginPath()
  ctx.moveTo(-5, -8)
  ctx.quadraticCurveTo(0, 2, 5, -8)
  ctx.quadraticCurveTo(0, -5, -5, -8)
  ctx.fill()
  ctx.restore()
  // staff
  ctx.strokeStyle = '#8a6a2e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(12, -10)
  ctx.lineTo(12, 10)
  ctx.stroke()
  ctx.fillStyle = '#9fd6ff'
  ctx.beginPath()
  ctx.arc(12, -12, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawMonster(ctx, x, y, { scale = 1, bodyColor = '#5a9b4a', bellyColor = '#7fc26b' } = {}) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  const edge = darken(bodyColor, 0.6)

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(0, 12, 10, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  // feet with claws
  ctx.fillStyle = darken(bodyColor, 0.8)
  block(ctx, -8, 8, 6, 4, 2)
  block(ctx, 2, 8, 6, 4, 2)
  ctx.fillStyle = '#f2efe0'
  for (const fx of [-7, -5, 3, 5]) ctx.fillRect(fx, 11, 1, 2)

  // body + belly with ridges
  ctx.fillStyle = bodyColor
  block(ctx, -9, -2, 18, 13, 5)
  ctx.strokeStyle = edge
  ctx.lineWidth = 0.9
  ctx.stroke()
  ctx.fillStyle = bellyColor
  block(ctx, -5, 2, 10, 8, 3)
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 0.7
  for (const by of [4.5, 7]) {
    ctx.beginPath()
    ctx.moveTo(-4, by)
    ctx.quadraticCurveTo(0, by + 1.2, 4, by)
    ctx.stroke()
  }

  // arms with claws
  ctx.fillStyle = bodyColor
  block(ctx, -12, -1, 4, 8, 2)
  block(ctx, 8, -1, 4, 8, 2)
  ctx.fillStyle = '#f2efe0'
  for (const cx of [-12, -10.5, 8.5, 10]) ctx.fillRect(cx, 6.5, 1, 2)

  // ears (with inner shading)
  for (const s of [-1, 1]) {
    ctx.fillStyle = bodyColor
    ctx.beginPath()
    ctx.moveTo(s * 7, -9)
    ctx.lineTo(s * 14, -16)
    ctx.lineTo(s * 5, -12)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = edge
    ctx.stroke()
    ctx.fillStyle = '#d98a8a'
    ctx.beginPath()
    ctx.moveTo(s * 7, -10)
    ctx.lineTo(s * 11.5, -14)
    ctx.lineTo(s * 6, -11.8)
    ctx.closePath()
    ctx.fill()
  }

  // head
  ctx.fillStyle = bodyColor
  ctx.beginPath()
  ctx.arc(0, -8, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 0.9
  ctx.stroke()

  // angry brows
  ctx.strokeStyle = darken(bodyColor, 0.35)
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-6, -12.6)
  ctx.lineTo(-1.5, -10.8)
  ctx.moveTo(6, -12.6)
  ctx.lineTo(1.5, -10.8)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // glowing eyes with slit pupils
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#ffe36b'
    ctx.beginPath()
    ctx.ellipse(sx * 3.3, -9, 2.1, 1.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff3b3b'
    ctx.beginPath()
    ctx.arc(sx * 3.3, -9, 1.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1a0a0a'
    ctx.fillRect(sx * 3.3 - 0.35, -10.4, 0.7, 2.8)
  }

  // nostrils + snout shadow
  ctx.fillStyle = darken(bodyColor, 0.45)
  ctx.fillRect(-1.4, -6.4, 0.9, 0.9)
  ctx.fillRect(0.5, -6.4, 0.9, 0.9)

  // jagged mouth with fangs
  ctx.fillStyle = '#4a1218'
  ctx.beginPath()
  ctx.moveTo(-4.5, -4.6)
  ctx.quadraticCurveTo(0, -2, 4.5, -4.6)
  ctx.lineTo(3.5, -3)
  ctx.quadraticCurveTo(0, -0.6, -3.5, -3)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  for (const fx of [-3.2, -1, 1, 3.2]) {
    const up = Math.abs(fx) > 2
    ctx.beginPath()
    ctx.moveTo(fx - 0.9, -4)
    ctx.lineTo(fx + 0.9, -4)
    ctx.lineTo(fx, up ? -1.8 : -2.6)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

// A bigger, darker goblin chief wearing a crown.
export function drawBoss(ctx, x, y) {
  drawMonster(ctx, x, y, { scale: 1.8, bodyColor: '#6b3fa0', bellyColor: '#9a6fc2' })

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1.8, 1.8)
  // crown: band, points, jewels
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.moveTo(-6, -15)
  ctx.lineTo(-6, -21)
  ctx.lineTo(-2, -16.5)
  ctx.lineTo(0, -22.5)
  ctx.lineTo(2, -16.5)
  ctx.lineTo(6, -21)
  ctx.lineTo(6, -15)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#a07d00'
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.fillStyle = '#a07d00'
  ctx.fillRect(-6, -16.2, 12, 1.2)
  for (const [jx, jc] of [[-3.5, '#ff4d6a'], [0, '#6ad0ff'], [3.5, '#ff4d6a']]) {
    ctx.fillStyle = jc
    ctx.beginPath()
    ctx.arc(jx, -15.6, 0.9, 0, Math.PI * 2)
    ctx.fill()
  }
  // battle scar over the left eye
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(-5, -12)
  ctx.lineTo(-2.4, -6.5)
  ctx.stroke()
  ctx.restore()
}

export function drawGate(ctx, x, y) {
  ctx.save()
  ctx.translate(x, y)

  ctx.fillStyle = '#4a4a55'
  block(ctx, -14, -16, 8, 32, 2)
  block(ctx, 6, -16, 8, 32, 2)
  block(ctx, -14, -20, 28, 8, 2)

  const glow = ctx.createRadialGradient(0, 2, 2, 0, 2, 12)
  glow.addColorStop(0, '#d7f8ff')
  glow.addColorStop(1, 'rgba(79, 209, 255, 0.15)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.ellipse(0, 2, 9, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// Facing direction -> angle (radians) the sword swing sweeps around.
export const FACE_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }

// A sword-slash swipe: a fading crescent trail plus a small blade that
// travels along the arc as `progress` goes from 0 (swing start) to 1 (end).
export function drawSlash(ctx, x, y, angle, progress) {
  const innerR = 13
  const outerR = 29
  const sweep = Math.PI * 0.55
  const start = angle - sweep / 2
  const reveal = start + sweep * Math.min(1, progress * 1.6)
  const alpha = progress < 0.7 ? 1 : Math.max(0, 1 - (progress - 0.7) / 0.3)

  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = alpha

  ctx.fillStyle = '#f5f8ff'
  ctx.beginPath()
  ctx.arc(0, 0, outerR, start, reveal)
  ctx.arc(0, 0, innerR, reveal, start, true)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, outerR, start, reveal)
  ctx.stroke()

  // the blade itself, riding the tip of the swing
  ctx.translate(Math.cos(reveal) * 21, Math.sin(reveal) * 21)
  ctx.rotate(reveal + Math.PI / 2)
  ctx.fillStyle = '#e8ecf5'
  ctx.fillRect(-2, -15, 4, 20)
  ctx.fillStyle = '#c9a227'
  ctx.fillRect(-6, 4, 12, 3)
  ctx.fillStyle = '#5a3e1b'
  ctx.fillRect(-2, 7, 4, 6)

  ctx.restore()
}

export function drawFireball(ctx, x, y) {
  ctx.save()
  const glow = ctx.createRadialGradient(x, y, 1, x, y, 14)
  glow.addColorStop(0, '#fff3c4')
  glow.addColorStop(0.5, '#ff9f43')
  glow.addColorStop(1, 'rgba(255, 87, 34, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 14, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff3c4'
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
