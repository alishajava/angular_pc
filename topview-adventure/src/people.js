// Everything that is drawn as a sprite on the island: people (with a proper
// walk cycle and tool poses), animals, trees, buildings and props.
//
// All functions draw at world coordinates and use the same convention: the
// (x, y) you pass is where the thing stands on the ground (its feet / base).


const OUT = 'rgba(38,24,20,0.7)'

function ell(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function shadow(ctx, x, y, rx, ry = rx * 0.32, a = 0.26) {
  ell(ctx, x, y, rx, ry, `rgba(0,0,0,${a})`)
}

function stroke(ctx, w = 1.4, color = OUT) {
  ctx.lineWidth = w
  ctx.strokeStyle = color
  ctx.lineJoin = 'round'
  ctx.stroke()
}

// ----------------------------------------------------------------- people ----

export const LOOKS = {
  player: { skin: '#f4cba2', hair: '#5a3820', hairStyle: 'messy', shirt: '#3f9fd1', pants: '#3a4a6a', shoes: '#2b2440', eye: '#2f5fa0', outfit: 'tee' },
  tori: { skin: '#f6d2b0', hair: '#2b2440', hairStyle: 'bob', shirt: '#8c9bab', pants: '#4a5570', shoes: '#2a2a38', eye: '#4a6a8a', outfit: 'overalls' },
  mei: { skin: '#e8b48f', hair: '#6b3a1c', hairStyle: 'long', shirt: '#7fb06a', pants: '#6a8a4a', shoes: '#5a3a24', eye: '#3f8f5a', outfit: 'dress', hat: 'straw' },
  moka: { skin: '#f2c79b', hair: '#4a3524', hairStyle: 'bun', shirt: '#d1795a', pants: '#5a4a3a', shoes: '#3a2a1a', eye: '#7a4a2a', outfit: 'apron' },
  bori: { skin: '#dba87c', hair: '#e8e4e0', hairStyle: 'short', shirt: '#4a7a9a', pants: '#3a4a5a', shoes: '#2a2a2a', eye: '#4a6a8a', outfit: 'tee', hat: 'cap', glasses: true },
}

// Where the rod tip is, for drawing the line down to the bobber.
export function rodTip(x, y, facing) {
  const s = facing === 'left' ? -1 : facing === 'right' ? 1 : 0
  return { x: x + (s ? s * 27 : 16), y: y - 46 }
}

function hairBack(ctx, look, view, bob) {
  ctx.fillStyle = look.hair
  if (look.hairStyle === 'long') {
    ctx.beginPath()
    if (view === 'side') ctx.roundRect(-11, -42 + bob, 12, 30, 6)
    else ctx.roundRect(-12, -42 + bob, 24, 32, 8)
    ctx.fill()
    stroke(ctx, 1.2)
  } else if (look.hairStyle === 'bob') {
    ctx.beginPath()
    ctx.roundRect(-11.5, -43 + bob, 23, 20, 8)
    ctx.fill()
    stroke(ctx, 1.2)
  }
}

function hairFront(ctx, look, view, bob) {
  const h = look.hair
  ctx.fillStyle = h
  const cy = -38 + bob
  if (view === 'back') {
    ctx.beginPath()
    ctx.arc(0, cy, 11, 0, Math.PI * 2)
    ctx.fill()
    stroke(ctx, 1.4)
    if (look.hairStyle === 'bun') {
      ell(ctx, 0, cy - 12, 5, 4.5, h)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(-2, cy - 2, 7, Math.PI * 1.1, Math.PI * 1.5)
    ctx.stroke()
    return
  }
  // top cap
  ctx.beginPath()
  ctx.arc(0, cy - 2, 11.5, Math.PI, 0)
  if (view === 'front') {
    // fringe: three soft points over the forehead
    ctx.lineTo(10.5, cy + 1)
    ctx.lineTo(6, cy - 3)
    ctx.lineTo(3, cy + 1)
    ctx.lineTo(0, cy - 4)
    ctx.lineTo(-3, cy + 1)
    ctx.lineTo(-6, cy - 3)
    ctx.lineTo(-10.5, cy + 1)
  } else {
    ctx.lineTo(10, cy)
    ctx.lineTo(4, cy - 3)
    ctx.lineTo(-2, cy + 3)
    ctx.lineTo(-9, cy + 4)
  }
  ctx.closePath()
  ctx.fill()
  stroke(ctx, 1.3)
  if (look.hairStyle === 'messy') {
    ctx.beginPath()
    ctx.moveTo(-7, cy - 11)
    ctx.lineTo(-4, cy - 17)
    ctx.lineTo(0, cy - 12)
    ctx.lineTo(4, cy - 18)
    ctx.lineTo(7, cy - 11)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, 1.2)
  } else if (look.hairStyle === 'bun') {
    ell(ctx, view === 'side' ? -3 : 0, cy - 14, 5.5, 5, h)
    ctx.beginPath()
    ctx.ellipse(view === 'side' ? -3 : 0, cy - 14, 5.5, 5, 0, 0, Math.PI * 2)
    stroke(ctx, 1.2)
  }
  if (look.hairStyle === 'long' || look.hairStyle === 'bob') {
    // side locks
    if (view === 'front') {
      ctx.fillStyle = h
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.roundRect(s * 10.5 - 2.5, cy - 1, 5, look.hairStyle === 'long' ? 18 : 11, 2.5)
        ctx.fill()
        stroke(ctx, 1.1)
      }
    }
  }
  // gloss
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(-1, cy - 3, 8, Math.PI * 1.15, Math.PI * 1.45)
  ctx.stroke()
}

function hat(ctx, look, view, bob) {
  const cy = -38 + bob
  if (look.hat === 'straw') {
    ell(ctx, 0, cy - 7, 17, 4.5, '#e8c878')
    ctx.beginPath()
    ctx.ellipse(0, cy - 7, 17, 4.5, 0, 0, Math.PI * 2)
    stroke(ctx, 1.3)
    ctx.beginPath()
    ctx.roundRect(-9, cy - 17, 18, 11, [8, 8, 2, 2])
    ctx.fillStyle = '#f0d68a'
    ctx.fill()
    stroke(ctx, 1.3)
    ctx.fillStyle = '#d95a5a'
    ctx.fillRect(-9, cy - 10, 18, 3)
  } else if (look.hat === 'cap') {
    ctx.beginPath()
    ctx.arc(0, cy - 3, 11.5, Math.PI, 0)
    ctx.closePath()
    ctx.fillStyle = '#3a5a8a'
    ctx.fill()
    stroke(ctx, 1.3)
    if (view !== 'back') {
      const s = view === 'side' ? 1 : 0
      ctx.beginPath()
      ctx.ellipse(s ? 11 : 0, cy - 2, s ? 7 : 12, 2.6, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#2c4468'
      ctx.fill()
      stroke(ctx, 1.1)
    }
  }
}

function face(ctx, look, view, t, bob, mood) {
  const cy = -38 + bob
  const blink = (t * 0.9 + look.eye.length) % 4 > 3.85
  const ex = view === 'side' ? [3.5, 8] : [-4.2, 4.2]
  for (const [i, x] of ex.entries()) {
    const small = view === 'side' && i === 1 ? 0.7 : 1
    if (blink) {
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(x - 2.2 * small, cy + 1.5)
      ctx.lineTo(x + 2.2 * small, cy + 1.5)
      ctx.stroke()
      continue
    }
    ell(ctx, x, cy + 1, 2.7 * small, 3.3 * small, '#ffffff')
    ell(ctx, x + (view === 'side' ? 0.6 : 0), cy + 1.4, 1.7 * small, 2.4 * small, look.eye)
    ell(ctx, x + (view === 'side' ? 0.6 : 0), cy + 1.6, 0.9 * small, 1.3 * small, '#15101a')
    ctx.fillStyle = '#fff'
    ctx.fillRect(x + 0.2, cy - 0.4, 1.1, 1.1)
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(x - 3 * small, cy - 2.2)
    ctx.lineTo(x + 3 * small, cy - 2.4)
    ctx.stroke()
  }
  // brows
  ctx.strokeStyle = look.hair
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  for (const x of ex) {
    ctx.beginPath()
    ctx.moveTo(x - 2.6, cy - 4.6)
    ctx.lineTo(x + 2.6, cy - 5)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  // cheeks, nose, mouth
  ctx.fillStyle = 'rgba(255,120,120,0.34)'
  if (view === 'front') {
    ell(ctx, -7, cy + 5, 2.4, 1.5, 'rgba(255,120,120,0.34)')
    ell(ctx, 7, cy + 5, 2.4, 1.5, 'rgba(255,120,120,0.34)')
  } else ell(ctx, 6, cy + 5, 2.4, 1.5, 'rgba(255,120,120,0.34)')
  ctx.fillStyle = 'rgba(150,80,60,0.6)'
  if (view === 'front') ctx.fillRect(-0.6, cy + 3, 1.2, 1.6)
  else ctx.fillRect(10.2, cy + 2.4, 1.8, 1.8)
  ctx.strokeStyle = '#8a3b3b'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  const mx = view === 'front' ? 0 : 6.5
  if (mood === 'o') ctx.ellipse(mx, cy + 7, 1.6, 2, 0, 0, Math.PI * 2)
  else ctx.arc(mx, cy + 5.6, 2.6, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  if (look.glasses) {
    ctx.strokeStyle = '#3a3a44'
    ctx.lineWidth = 1.3
    for (const x of ex) {
      ctx.beginPath()
      ctx.arc(x, cy + 1, 3.8, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (view === 'front') {
      ctx.beginPath()
      ctx.moveTo(-0.6, cy + 0.5)
      ctx.lineTo(0.6, cy + 0.5)
      ctx.stroke()
    }
  }
}

// Draws one person. `st`:
//   facing   'down' | 'up' | 'left' | 'right'
//   walk     walk-cycle phase (radians), moving  true while walking
//   t        clock (seconds)
//   pose     { type: 'fish' | 'chop' | 'pick' | 'sit' | 'wave', p: 0..1 }
//   mood     'o' for a surprised mouth
export function drawPerson(ctx, x, y, look, st = {}) {
  const facing = st.facing || 'down'
  const t = st.t ?? performance.now() / 1000
  const moving = !!st.moving
  const view = facing === 'down' ? 'front' : facing === 'up' ? 'back' : 'side'
  const flip = facing === 'left' ? -1 : 1
  const pose = st.pose || null
  const phase = st.walk || 0
  const sw = moving ? Math.sin(phase) : 0
  const bob = moving ? Math.abs(Math.cos(phase)) * -1.6 : Math.sin(t * 2.2 + x * 0.1) * 0.5
  const sit = !!st.sit || (pose && pose.type === 'sit')
  const crouch = pose && pose.type === 'pick' ? 3 * Math.sin(pose.p * Math.PI) : 0

  shadow(ctx, x, y + 1, sit ? 11 : 10)
  ctx.save()
  ctx.translate(x, y + (sit ? -2 : 0))
  ctx.scale(flip, 1)
  const by = bob + crouch // body vertical offset

  hairBack(ctx, look, view, by)

  // ---- legs ----
  const pants = look.pants
  if (sit) {
    // seated on the pier edge: legs hang down over the side
    for (const lx of [-4, 4]) {
      ctx.beginPath()
      ctx.roundRect(lx - 3, -16, 6, 15, 3)
      ctx.fillStyle = pants
      ctx.fill()
      stroke(ctx)
      ctx.beginPath()
      ctx.roundRect(lx - 4, -3, 8, 5, 2.5)
      ctx.fillStyle = look.shoes
      ctx.fill()
      stroke(ctx)
    }
  } else if (look.outfit !== 'dress') {
    for (const s of [-1, 1]) {
      const lift = moving ? Math.max(0, sw * s) * 3 : 0
      const fwd = view === 'side' ? sw * s * 5 : 0
      ctx.beginPath()
      ctx.roundRect((view === 'side' ? -3 : s * 4.4 - 3) + fwd, -15 - lift * 0.3, 6, 14 + lift * 0.3, 3)
      ctx.fillStyle = pants
      ctx.fill()
      stroke(ctx)
      ctx.beginPath()
      ctx.roundRect((view === 'side' ? -3.5 : s * 4.4 - 3.5) + fwd + (view === 'side' ? 1.5 : 0), -3 - lift, 7.5, 5, 2.5)
      ctx.fillStyle = look.shoes
      ctx.fill()
      stroke(ctx)
    }
  } else {
    // bare legs + shoes under the dress
    for (const s of [-1, 1]) {
      const fwd = view === 'side' ? sw * s * 4 : 0
      const lift = moving ? Math.max(0, sw * s) * 2.5 : 0
      ctx.beginPath()
      ctx.roundRect((view === 'side' ? -2 : s * 3.8 - 2) + fwd, -13 - lift, 4, 11, 2)
      ctx.fillStyle = look.skin
      ctx.fill()
      stroke(ctx, 1.1)
      ctx.beginPath()
      ctx.roundRect((view === 'side' ? -3 : s * 3.8 - 3) + fwd + (view === 'side' ? 1 : 0), -3 - lift, 7, 5, 2.5)
      ctx.fillStyle = look.shoes
      ctx.fill()
      stroke(ctx)
    }
  }

  // ---- far arm (behind the body in side view) ----
  const armLen = 12
  const drawArm = (ax, ay, ang, sleeve, hand) => {
    ctx.save()
    ctx.translate(ax, ay)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.roundRect(-2.8, -1, 5.6, armLen, 2.8)
    ctx.fillStyle = sleeve
    ctx.fill()
    stroke(ctx, 1.2)
    ell(ctx, 0, armLen + 0.5, 2.9, 2.9, hand)
    ctx.beginPath()
    ctx.arc(0, armLen + 0.5, 2.9, 0, Math.PI * 2)
    stroke(ctx, 1.1)
    ctx.restore()
  }
  const shoulderY = -27 + by
  if (view === 'side') drawArm(0, shoulderY, -sw * 0.6 + 0.15, shade(look.shirt, 0.82), look.skin)

  // ---- torso ----
  const tw = view === 'side' ? 13 : 19
  const tx = -tw / 2
  const top = -28 + by
  const bottom = -12 + by * 0.4
  if (look.outfit === 'dress') {
    ctx.beginPath()
    ctx.moveTo(tx, top)
    ctx.lineTo(tx + tw, top)
    ctx.lineTo(tx + tw + (view === 'side' ? 3 : 4), bottom + 1)
    ctx.lineTo(tx - (view === 'side' ? 3 : 4), bottom + 1)
    ctx.closePath()
    ctx.fillStyle = look.shirt
    ctx.fill()
    stroke(ctx)
    ctx.fillStyle = 'rgba(255,255,255,0.24)'
    ctx.fillRect(tx - 2, bottom - 3, tw + 4, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(tx - 3, bottom - 1, tw + 6, 3)
  } else {
    ctx.beginPath()
    ctx.roundRect(tx, top, tw, bottom - top, 4)
    ctx.fillStyle = look.outfit === 'overalls' ? '#f4efe4' : look.shirt
    ctx.fill()
    stroke(ctx)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(tx + 2, top + 2, tw * 0.35, 4)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(tx + 1, bottom - 4, tw - 2, 4)
    if (look.outfit === 'overalls') {
      ctx.fillStyle = look.shirt
      ctx.beginPath()
      ctx.roundRect(tx + 2, top + 8, tw - 4, bottom - top - 8, 3)
      ctx.fill()
      if (view === 'front') {
        for (const s of [-1, 1]) ctx.fillRect(s * 5.5 - 1.5, top + 1, 3, 8)
        ctx.fillStyle = '#e8d48a'
        ctx.fillRect(-5.5, top + 9, 2.2, 2.2)
        ctx.fillRect(3.3, top + 9, 2.2, 2.2)
      }
    } else if (look.outfit === 'apron' && view !== 'back') {
      ctx.fillStyle = '#fff9ec'
      ctx.beginPath()
      ctx.roundRect(tx + (view === 'side' ? 3 : 3), top + 6, tw - 6, bottom - top - 6, 3)
      ctx.fill()
      stroke(ctx, 1.1)
    } else if (look.outfit === 'tee' && view === 'front') {
      ctx.fillStyle = 'rgba(255,255,255,0.6)' // little chest stripe
      ctx.fillRect(tx + 1, top + 6, tw - 2, 2)
    }
  }
  // collar
  if (view === 'front') {
    ctx.fillStyle = look.skin
    ctx.beginPath()
    ctx.moveTo(-3.6, top)
    ctx.lineTo(0, top + 4)
    ctx.lineTo(3.6, top)
    ctx.closePath()
    ctx.fill()
  }

  // ---- head ----
  const cy = -38 + by
  // ears (front view)
  if (view === 'front') {
    ell(ctx, -10.8, cy + 2, 2.2, 3, look.skin)
    ell(ctx, 10.8, cy + 2, 2.2, 3, look.skin)
  }
  ctx.beginPath()
  ctx.ellipse(0, cy, 10.6, 9.8, 0, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(-3, cy - 3, 2, 0, cy, 12)
  g.addColorStop(0, look.skin)
  g.addColorStop(1, shade(look.skin, 0.9))
  ctx.fillStyle = g
  ctx.fill()
  stroke(ctx, 1.4)
  if (view === 'side') {
    // nose bump
    ctx.beginPath()
    ctx.moveTo(10, cy + 1)
    ctx.lineTo(13, cy + 3.5)
    ctx.lineTo(10, cy + 5)
    ctx.closePath()
    ctx.fillStyle = look.skin
    ctx.fill()
    stroke(ctx, 1.1)
    ell(ctx, -3, cy + 3, 2.2, 3, shade(look.skin, 0.93))
  }
  if (view !== 'back') face(ctx, look, view, t, by, st.mood)
  hairFront(ctx, look, view, by)
  if (look.hat) hat(ctx, look, view, by)

  // ---- near arm / tool poses ----
  const rod = pose && pose.type === 'fish'
  const chop = pose && pose.type === 'chop'
  const pick = pose && pose.type === 'pick'
  const wave = pose && pose.type === 'wave'
  const sleeve = look.shirt
  if (view === 'side') {
    if (rod) {
      drawArm(3, shoulderY, -1.35, sleeve, look.skin)
      ctx.strokeStyle = '#7a4f2a'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(14, shoulderY + 10)
      ctx.lineTo(27, -46)
      ctx.stroke()
      ctx.lineCap = 'butt'
    } else if (chop) {
      const a = -2.4 + pose.p * 3.2
      drawArm(3, shoulderY, a, sleeve, look.skin)
      ctx.save()
      ctx.translate(3, shoulderY)
      ctx.rotate(a)
      ctx.fillStyle = '#7a4f2a'
      ctx.fillRect(-1.2, armLen - 2, 2.4, 14)
      ctx.fillStyle = '#b8bcc8'
      ctx.beginPath()
      ctx.moveTo(1, armLen + 8)
      ctx.lineTo(8, armLen + 5)
      ctx.lineTo(8, armLen + 12)
      ctx.closePath()
      ctx.fill()
      stroke(ctx, 1)
      ctx.restore()
    } else if (pick) {
      drawArm(3, shoulderY, -2.6 + Math.sin(pose.p * Math.PI) * 0.3, sleeve, look.skin)
    } else if (wave) {
      drawArm(3, shoulderY, -2.4 + Math.sin(t * 12) * 0.35, sleeve, look.skin)
    } else {
      drawArm(0, shoulderY, sw * 0.6 - 0.05, sleeve, look.skin)
    }
  } else {
    const swing = sw * 0.55
    const left = (-tw / 2) - 3
    const right = tw / 2 + 3
    if (rod) {
      drawArm(left, shoulderY, 0.2, sleeve, look.skin)
      drawArm(right, shoulderY, -1.2, sleeve, look.skin)
      ctx.strokeStyle = '#7a4f2a'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(right + 4, shoulderY + 8)
      ctx.lineTo(16, -46)
      ctx.stroke()
      ctx.lineCap = 'butt'
    } else if (pick) {
      drawArm(left, shoulderY, 2.7 - Math.sin(pose.p * Math.PI) * 0.4, sleeve, look.skin)
      drawArm(right, shoulderY, -2.7 + Math.sin(pose.p * Math.PI) * 0.4, sleeve, look.skin)
    } else if (chop) {
      const a = -2.4 + pose.p * 3.2
      drawArm(left, shoulderY, 0.12, sleeve, look.skin)
      drawArm(right, shoulderY, a, sleeve, look.skin)
      ctx.save()
      ctx.translate(right, shoulderY)
      ctx.rotate(a)
      ctx.fillStyle = '#7a4f2a'
      ctx.fillRect(-1.2, armLen - 2, 2.4, 14)
      ctx.fillStyle = '#b8bcc8'
      ctx.fillRect(-1, armLen + 6, 7, 6)
      stroke(ctx, 1)
      ctx.restore()
    } else if (wave) {
      drawArm(left, shoulderY, 0.12, sleeve, look.skin)
      drawArm(right, shoulderY, -2.5 + Math.sin(t * 12) * 0.4, sleeve, look.skin)
    } else {
      drawArm(left, shoulderY, swing + 0.08, sleeve, look.skin)
      drawArm(right, shoulderY, -swing - 0.08, sleeve, look.skin)
    }
  }
  ctx.restore()

  if (st.emote) drawEmote(ctx, x, y - 62 + (st.bob || 0), st.emote, t)
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `rgb(${r},${g},${b})`
}

export function drawEmote(ctx, x, y, kind, t) {
  const pop = 1 + Math.sin(t * 8) * 0.06
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(pop, pop)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.roundRect(-11, -12, 22, 19, 7)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-3, 6)
  ctx.lineTo(3, 6)
  ctx.lineTo(0, 11)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = OUTLINE_SOFT
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.roundRect(-11, -12, 22, 19, 7)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 13px sans-serif'
  if (kind === '!') {
    ctx.fillStyle = '#e04a3a'
    ctx.fillText('!', 0, 3)
  } else if (kind === '♥') {
    ctx.fillStyle = '#ff5a7a'
    ctx.fillText('♥', 0, 3)
  } else if (kind === '...') {
    ctx.fillStyle = '#6a6a74'
    for (const dx of [-5, 0, 5]) {
      ctx.beginPath()
      ctx.arc(dx, -1, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#3a8a5a'
    ctx.fillText(kind, 0, 3)
  }
  ctx.restore()
}
const OUTLINE_SOFT = 'rgba(60,40,30,0.55)'

