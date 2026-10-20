// Small procedural "paper doll" character art, built from canvas shapes
// instead of image files. Each draw*() call is centered on (x, y).

function block(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

// `swing` is a small px offset (typically from a caller-computed sine wave)
// that alternates the legs and arms to fake a walk/idle-sway cycle. The
// upper body also bobs with |swing| so the motion reads clearly even at
// small amplitudes, instead of being limited to a couple of tiny blocks.
function humanoid(ctx, x, y, { skin, hair, outfit, boots, swing = 0 }) {
  ctx.save()
  ctx.translate(x, y)

  ctx.fillStyle = boots
  block(ctx, -7, 6 + swing, 5, 8, 2)
  block(ctx, 2, 6 - swing, 5, 8, 2)

  ctx.save()
  ctx.translate(0, -Math.abs(swing) * 0.5)

  ctx.fillStyle = outfit
  block(ctx, -9, -5, 18, 13, 4)

  ctx.fillStyle = skin
  block(ctx, -12, -3 - swing, 4, 9, 2)
  block(ctx, 8, -3 + swing, 4, 9, 2)

  ctx.beginPath()
  ctx.arc(0, -12, 8, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = hair
  ctx.beginPath()
  ctx.arc(0, -15, 8.3, Math.PI, 0)
  ctx.fill()

  ctx.fillStyle = '#1c1c1c'
  ctx.fillRect(-4, -13, 2, 2)
  ctx.fillRect(2, -13, 2, 2)

  ctx.restore()
  ctx.restore()
}

export function drawHero(ctx, x, y, facing = 'down', swing = 0) {
  ctx.save()
  ctx.translate(x, y)
  if (facing === 'left') ctx.scale(-1, 1)
  humanoid(ctx, 0, 0, { skin: '#f2c79b', hair: '#5a3e1b', outfit: '#3f7fd1', boots: '#2b2440', swing })
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
  humanoid(ctx, 0, 0, { skin: '#f2c79b', hair: '#7a2340', outfit: '#e0557a', boots: '#3b2440', swing })
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

export function drawVillager(ctx, x, y, outfit, hair = '#5a3e1b', swing = 0) {
  humanoid(ctx, x, y, { skin: '#f2c79b', hair, outfit, boots: '#3b2a1a', swing })
}

export function drawElder(ctx, x, y, swing = 0) {
  humanoid(ctx, x, y, { skin: '#e8c6a0', hair: '#e8e8e8', outfit: '#6b4fa0', boots: '#3b2a1a', swing })
  ctx.save()
  ctx.translate(x, y)
  // beard
  ctx.fillStyle = '#e8e8e8'
  block(ctx, -4, -9, 8, 5, 2)
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

  ctx.fillStyle = bodyColor
  block(ctx, -9, -2, 18, 13, 5)

  ctx.fillStyle = bellyColor
  block(ctx, -5, 2, 10, 8, 3)

  // ears
  ctx.fillStyle = bodyColor
  ctx.beginPath()
  ctx.moveTo(-7, -9)
  ctx.lineTo(-13, -15)
  ctx.lineTo(-5, -12)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(7, -9)
  ctx.lineTo(13, -15)
  ctx.lineTo(5, -12)
  ctx.closePath()
  ctx.fill()

  // head
  ctx.beginPath()
  ctx.arc(0, -8, 8, 0, Math.PI * 2)
  ctx.fill()

  // eyes
  ctx.fillStyle = '#ff3b3b'
  ctx.beginPath()
  ctx.arc(-3, -9, 1.7, 0, Math.PI * 2)
  ctx.arc(3, -9, 1.7, 0, Math.PI * 2)
  ctx.fill()

  // fangs
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(-2, -4)
  ctx.lineTo(-1, -1)
  ctx.lineTo(-3, -1)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(2, -4)
  ctx.lineTo(1, -1)
  ctx.lineTo(3, -1)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// A bigger, darker goblin chief wearing a crown.
export function drawBoss(ctx, x, y) {
  drawMonster(ctx, x, y, { scale: 1.8, bodyColor: '#6b3fa0', bellyColor: '#9a6fc2' })

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1.8, 1.8)
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.moveTo(-6, -15)
  ctx.lineTo(-6, -21)
  ctx.lineTo(-2, -16)
  ctx.lineTo(0, -22)
  ctx.lineTo(2, -16)
  ctx.lineTo(6, -21)
  ctx.lineTo(6, -15)
  ctx.closePath()
  ctx.fill()
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
