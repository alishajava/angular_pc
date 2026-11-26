// 딸의 초상화(캔버스 절차 그리기) - 얼굴 표정은 피로도에 따라 달라진다
// --- Portrait drawing (canvas, procedural - no external art assets) -------
// Detailed face painter shared by every portrait stage: layered eyes (white,
// iris, pupil, two highlights, lash line), shaped brows, nose, cheeks and a
// mouth with lips - all driven by the mood so the expression changes with
// stress. Drawn after the hair/head so it always sits on top.
function drawFaceDetail(ctx, cx, headY, headR, moodKey, { eyeHex = '#4a332b', lashes = false, eyeScale = 1, browHex = '#3a2a22', skinHex = '#ffd9b8', lines = 0 } = {}) {
  const eyeY = headY + headR * 0.08
  const eyeDX = headR * 0.38
  const sleepy = moodKey === 'tired' || moodKey === 'sick'
  const R = headR

  // cheeks
  ctx.fillStyle = moodKey === 'sick' ? 'rgba(224,99,63,0.45)' : 'rgba(255,130,130,0.32)'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + sx * R * 0.58, headY + R * 0.36, R * 0.15, R * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const sx of [-1, 1]) {
    const ex = cx + sx * eyeDX
    const rx = R * 0.16 * eyeScale
    const ry = (sleepy ? R * 0.1 : R * 0.17) * eyeScale

    ctx.beginPath()
    ctx.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    const ir = R * 0.115 * eyeScale
    const iy = eyeY + (sleepy ? ry * 0.1 : ry * 0.08)
    const grad = ctx.createRadialGradient(ex, iy - ir * 0.3, ir * 0.15, ex, iy, ir)
    grad.addColorStop(0, '#a8805f')
    grad.addColorStop(0.45, eyeHex)
    grad.addColorStop(1, '#1d1210')
    ctx.fillStyle = eyeHex
    ctx.beginPath()
    ctx.arc(ex, iy, ir, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#120a08'
    ctx.beginPath()
    ctx.arc(ex, iy, ir * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex + ir * 0.38, iy - ir * 0.4, ir * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex - ir * 0.35, iy + ir * 0.4, ir * 0.15, 0, Math.PI * 2)
    ctx.fill()
    if (sleepy) {
      // heavy lid drawn over the upper half of the eye
      ctx.fillStyle = skinHex
      ctx.fillRect(ex - rx - 1, eyeY - ry - 1, rx * 2 + 2, ry * 1.05)
    }
    ctx.restore()

    // upper lash line (+ outer flicks)
    ctx.strokeStyle = '#2a1c18'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    if (sleepy) {
      ctx.moveTo(ex - rx, eyeY - ry * 0.1)
      ctx.quadraticCurveTo(ex, eyeY + ry * 0.05, ex + rx, eyeY - ry * 0.1)
    } else {
      ctx.ellipse(ex, eyeY, rx, ry, 0, Math.PI * 1.07, Math.PI * 1.93)
    }
    ctx.stroke()
    if (lashes && !sleepy) {
      ctx.lineWidth = Math.max(1.2, R * 0.035)
      for (const k of [0, 1, 2]) {
        ctx.beginPath()
        ctx.moveTo(ex + sx * rx * 0.9, eyeY - ry * (0.5 - k * 0.3))
        ctx.lineTo(ex + sx * (rx + R * 0.09), eyeY - ry * (0.85 - k * 0.3))
        ctx.stroke()
      }
    }
    if (moodKey === 'tired' || moodKey === 'sick') {
      ctx.strokeStyle = 'rgba(120,80,110,0.45)'
      ctx.lineWidth = Math.max(1.2, R * 0.04)
      ctx.beginPath()
      ctx.arc(ex, eyeY + ry * 0.3, rx * 0.95, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
    }

    // brow
    const by = eyeY - ry - R * (moodKey === 'bright' ? 0.2 : 0.14)
    let tiltIn = 0
    let tiltOut = 0
    if (moodKey === 'sick') { tiltIn = -R * 0.1; tiltOut = R * 0.04 }
    else if (moodKey === 'tired') { tiltIn = R * 0.02; tiltOut = R * 0.05 }
    else if (moodKey === 'bright') { tiltIn = 0; tiltOut = -R * 0.02 }
    ctx.strokeStyle = browHex
    ctx.lineWidth = Math.max(2, R * 0.07)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ex - sx * rx * 1.05, by + tiltIn)
    ctx.quadraticCurveTo(ex + sx * rx * 0.1, by - R * 0.07 + (tiltIn + tiltOut) / 2, ex + sx * rx * 1.15, by + tiltOut)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // nose
  ctx.strokeStyle = 'rgba(150,90,70,0.65)'
  ctx.lineWidth = Math.max(1.4, R * 0.04)
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.02, headY + R * 0.14)
  ctx.quadraticCurveTo(cx - R * 0.09, headY + R * 0.33, cx + R * 0.02, headY + R * 0.34)
  ctx.stroke()

  // mouth
  const my = headY + R * 0.56
  ctx.lineCap = 'round'
  if (moodKey === 'bright') {
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.24, my - R * 0.04)
    ctx.quadraticCurveTo(cx, my + R * 0.3, cx + R * 0.24, my - R * 0.04)
    ctx.quadraticCurveTo(cx, my + R * 0.02, cx - R * 0.24, my - R * 0.04)
    ctx.fillStyle = '#9c3f46'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.2, my - R * 0.03)
    ctx.quadraticCurveTo(cx, my + R * 0.04, cx + R * 0.2, my - R * 0.03)
    ctx.quadraticCurveTo(cx, my + R * 0.1, cx - R * 0.2, my - R * 0.03)
    ctx.fill()
    ctx.strokeStyle = '#7a2f38'
    ctx.lineWidth = Math.max(1.4, R * 0.04)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.24, my - R * 0.04)
    ctx.quadraticCurveTo(cx, my + R * 0.3, cx + R * 0.24, my - R * 0.04)
    ctx.stroke()
  } else if (moodKey === 'sick') {
    ctx.strokeStyle = '#a85a46'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.18, my + R * 0.06)
    ctx.quadraticCurveTo(cx - R * 0.06, my - R * 0.04, cx, my + R * 0.03)
    ctx.quadraticCurveTo(cx + R * 0.06, my + R * 0.1, cx + R * 0.18, my + R * 0.02)
    ctx.stroke()
  } else if (moodKey === 'tired') {
    ctx.strokeStyle = '#a85a46'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.16, my + R * 0.02)
    ctx.quadraticCurveTo(cx, my - R * 0.01, cx + R * 0.16, my + R * 0.03)
    ctx.stroke()
  } else {
    ctx.strokeStyle = '#a85a46'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.17, my)
    ctx.quadraticCurveTo(cx, my + R * 0.14, cx + R * 0.17, my)
    ctx.stroke()
    ctx.fillStyle = 'rgba(214,110,110,0.55)'
    ctx.beginPath()
    ctx.ellipse(cx, my + R * 0.075, R * 0.07, R * 0.03, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'butt'

  // age lines for senior ranks
  if (lines) {
    ctx.strokeStyle = 'rgba(120,80,60,0.4)'
    ctx.lineWidth = Math.max(1, R * 0.03)
    for (const sx of [-1, 1]) {
      for (let i = 0; i < lines; i++) {
        ctx.beginPath()
        ctx.arc(cx + sx * R * 0.33, headY + R * 0.4, R * (0.2 + i * 0.05), sx > 0 ? -0.5 : Math.PI - 1.4 + 0.9, sx > 0 ? 0.6 : Math.PI + 0.1)
        ctx.stroke()
      }
    }
  }
}

export function drawPortrait(canvas, { stageKey, moodKey, hairHex }) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  const proportions = {
    child: { headR: 0.32, headY: 0.33, bodyTop: 0.56, bodyW: 0.5, shoulderW: 0.62 },
    teen: { headR: 0.27, headY: 0.3, bodyTop: 0.52, bodyW: 0.46, shoulderW: 0.58 },
    lady: { headR: 0.23, headY: 0.27, bodyTop: 0.46, bodyW: 0.42, shoulderW: 0.56 },
  }
  const p = proportions[stageKey] || proportions.teen
  const headR = H * p.headR
  const headY = H * p.headY

  // Outfit / shoulders
  const outfitColors = { child: '#ffb199', teen: '#ff9b7a', lady: '#f08a7a' }
  ctx.fillStyle = outfitColors[stageKey] || '#ff9b7a'
  ctx.beginPath()
  ctx.moveTo(cx - W * p.shoulderW * 0.5, H)
  ctx.quadraticCurveTo(cx - W * p.bodyW * 0.5, H * p.bodyTop, cx, H * (p.bodyTop - 0.02))
  ctx.quadraticCurveTo(cx + W * p.bodyW * 0.5, H * p.bodyTop, cx + W * p.shoulderW * 0.5, H)
  ctx.closePath()
  ctx.fill()

  // Neck
  ctx.fillStyle = '#ffd9b8'
  ctx.fillRect(cx - headR * 0.3, headY + headR * 0.75, headR * 0.6, headR * 0.5)

  // Back hair (behind head), longer for older stages
  const hairLen = { child: 0.12, teen: 0.3, lady: 0.46 }[stageKey] || 0.3
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.ellipse(cx, headY + headR * 0.1, headR * 1.08, headR * (1.1 + hairLen), 0, 0, Math.PI * 2)
  ctx.fill()

  // Face
  ctx.fillStyle = '#ffd9b8'
  ctx.beginPath()
  ctx.arc(cx, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  // Front hair / bangs
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.moveTo(cx - headR, headY - headR * 0.1)
  ctx.quadraticCurveTo(cx - headR * 0.6, headY - headR * 1.25, cx, headY - headR * 1.1)
  ctx.quadraticCurveTo(cx + headR * 0.6, headY - headR * 1.25, cx + headR, headY - headR * 0.1)
  ctx.quadraticCurveTo(cx, headY - headR * 0.55, cx - headR, headY - headR * 0.1)
  ctx.fill()
  // a little fringe texture
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = Math.max(1, headR * 0.03)
  for (const dx of [-0.35, -0.1, 0.15, 0.4]) {
    ctx.beginPath()
    ctx.moveTo(cx + headR * dx, headY - headR * 0.75)
    ctx.lineTo(cx + headR * dx * 1.15, headY - headR * 0.25)
    ctx.stroke()
  }

  // Lady stage: small ribbon/tiara accent
  if (stageKey === 'lady') {
    ctx.fillStyle = '#e06ba6'
    ctx.beginPath()
    ctx.arc(cx + headR * 0.55, headY - headR * 0.85, headR * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }

  drawFaceDetail(ctx, cx, headY, headR, moodKey, { eyeHex: '#6a3f2a', lashes: stageKey !== 'child', eyeScale: stageKey === 'child' ? 1.18 : stageKey === 'teen' ? 1.05 : 1, browHex: hairHex })

  // Sweat drop if sick
  if (moodKey === 'sick') {
    ctx.fillStyle = '#7fc4e8'
    ctx.beginPath()
    ctx.moveTo(cx + headR * 0.85, headY - headR * 0.3)
    ctx.quadraticCurveTo(cx + headR * 0.95, headY - headR * 0.05, cx + headR * 0.85, headY + headR * 0.05)
    ctx.quadraticCurveTo(cx + headR * 0.75, headY - headR * 0.05, cx + headR * 0.85, headY - headR * 0.3)
    ctx.fill()
  }
}
