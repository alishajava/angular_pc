// Everything that is drawn as a sprite on the island: people (with a proper
// walk cycle and tool poses), animals, trees, buildings and props.
//
// All functions draw at world coordinates and use the same convention: the
// (x, y) you pass is where the thing stands on the ground (its feet / base).

import { TILE } from './world.js'

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

function shade(hex, f) {
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

// ---------------------------------------------------------------- animals ----

export function drawCat(ctx, x, y, st) {
  const sitting = st.sitting
  const s = st.facing === 'left' ? -1 : 1
  const t = st.t
  shadow(ctx, x, y + 1, 9)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, 1)
  const fur = st.color || '#e8a85a'
  const dark = shade(fur, 0.78)
  // tail
  ctx.strokeStyle = fur
  ctx.lineWidth = 3.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-8, -5)
  ctx.quadraticCurveTo(-15, -10 + Math.sin(t * 3) * 3, -12, -18 + Math.sin(t * 3) * 3)
  ctx.stroke()
  ctx.lineCap = 'butt'
  if (sitting) {
    ctx.beginPath()
    ctx.ellipse(-1, -7, 7, 8, 0, 0, Math.PI * 2)
    ctx.fillStyle = fur
    ctx.fill()
    stroke(ctx, 1.2)
  } else {
    const leg = st.moving ? Math.sin(st.walk) * 2.5 : 0
    ctx.fillStyle = dark
    for (const lx of [-6, -2, 3, 7]) ctx.fillRect(lx - 1, -4 + (lx > 0 ? leg : -leg) * 0.5, 2.6, 5)
    ctx.beginPath()
    ctx.ellipse(0, -8, 10, 5.6, 0, 0, Math.PI * 2)
    ctx.fillStyle = fur
    ctx.fill()
    stroke(ctx, 1.2)
  }
  // head
  const hx = sitting ? 4 : 10
  const hy = sitting ? -17 : -12
  ctx.beginPath()
  ctx.arc(hx, hy, 5.6, 0, Math.PI * 2)
  ctx.fillStyle = fur
  ctx.fill()
  stroke(ctx, 1.2)
  ctx.fillStyle = fur
  for (const ex of [-3.6, 3.6]) {
    ctx.beginPath()
    ctx.moveTo(hx + ex - 2, hy - 3.5)
    ctx.lineTo(hx + ex, hy - 9)
    ctx.lineTo(hx + ex + 2.4, hy - 3.5)
    ctx.closePath()
    ctx.fill()
    stroke(ctx, 1)
  }
  ctx.fillStyle = '#1a1a22'
  ell(ctx, hx - 1.8, hy - 0.5, 1, 1.5, '#1a1a22')
  ell(ctx, hx + 2.6, hy - 0.5, 1, 1.5, '#1a1a22')
  ctx.fillStyle = '#e07a8a'
  ctx.fillRect(hx + 0.2, hy + 1.2, 1.4, 1)
  ctx.restore()
}

export function drawChicken(ctx, x, y, st) {
  const s = st.facing === 'left' ? -1 : 1
  shadow(ctx, x, y + 1, 7)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, 1)
  const peck = st.pecking ? Math.max(0, Math.sin(st.t * 9)) * 4 : 0
  const leg = st.moving ? Math.sin(st.walk) * 2 : 0
  ctx.strokeStyle = '#e0a030'
  ctx.lineWidth = 1.6
  for (const lx of [-2, 2]) {
    ctx.beginPath()
    ctx.moveTo(lx, -5)
    ctx.lineTo(lx + (lx > 0 ? leg : -leg) * 0.5, 0)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.ellipse(0, -9, 7.5, 6.4, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#fffaf0'
  ctx.fill()
  stroke(ctx, 1.2)
  ctx.beginPath()
  ctx.moveTo(-6, -10)
  ctx.lineTo(-11, -14)
  ctx.lineTo(-7, -6)
  ctx.closePath()
  ctx.fillStyle = '#f0e6d0'
  ctx.fill()
  stroke(ctx, 1)
  const hx = 6
  const hy = -15 + peck
  ctx.beginPath()
  ctx.arc(hx, hy, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#fffaf0'
  ctx.fill()
  stroke(ctx, 1.1)
  ctx.fillStyle = '#e04a3a'
  ctx.beginPath()
  ctx.arc(hx - 1, hy - 4, 1.8, 0, Math.PI * 2)
  ctx.arc(hx + 1.4, hy - 4, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f0a020'
  ctx.beginPath()
  ctx.moveTo(hx + 3.5, hy - 1)
  ctx.lineTo(hx + 7.5, hy + 0.5)
  ctx.lineTo(hx + 3.5, hy + 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#1a1a22'
  ctx.fillRect(hx + 0.8, hy - 1.4, 1.4, 1.6)
  ctx.restore()
}

export function drawCrab(ctx, x, y, st) {
  shadow(ctx, x, y + 1, 7)
  ctx.save()
  ctx.translate(x, y)
  const leg = st.moving ? Math.sin(st.walk * 1.5) * 2 : 0
  ctx.strokeStyle = '#d8553a'
  ctx.lineWidth = 1.5
  for (const s of [-1, 1]) {
    for (const k of [0, 1, 2]) {
      ctx.beginPath()
      ctx.moveTo(s * 4, -4)
      ctx.lineTo(s * (8 + k), -2 + leg * (k % 2 ? 1 : -1) * 0.5 + k)
      ctx.stroke()
    }
  }
  ctx.beginPath()
  ctx.ellipse(0, -5, 6.5, 4.6, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#ec6a48'
  ctx.fill()
  stroke(ctx, 1.1)
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(s * 9, -9 - Math.abs(Math.sin(st.t * 4)) * 1.5, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = '#ec6a48'
    ctx.fill()
    stroke(ctx, 1)
    ctx.fillStyle = '#fff'
    ctx.fillRect(s * 2.4 - 0.8, -11, 1.6, 3)
    ctx.fillStyle = '#111'
    ctx.fillRect(s * 2.4 - 0.5, -11, 1, 1.4)
  }
  ctx.restore()
}

export function drawButterfly(ctx, x, y, st) {
  const flap = Math.abs(Math.sin(st.t * 13 + st.seed)) * 4 + 1
  ctx.fillStyle = st.color
  ctx.beginPath()
  ctx.ellipse(x - flap / 2 - 1, y, flap / 2 + 1, 3.2, -0.3, 0, Math.PI * 2)
  ctx.ellipse(x + flap / 2 + 1, y, flap / 2 + 1, 3.2, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a2a30'
  ctx.fillRect(x - 0.5, y - 2, 1, 4)
}

export function drawGull(ctx, x, y, t, seed) {
  const f = Math.sin(t * 5 + seed) * 3
  ctx.strokeStyle = '#fafafa'
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - 9, y + f * 0.4)
  ctx.quadraticCurveTo(x - 4, y - 5 - f, x, y)
  ctx.quadraticCurveTo(x + 4, y - 5 - f, x + 9, y + f * 0.4)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

// ------------------------------------------------------------------ trees ----

const FRUIT_COLORS = { apple: '#e8452e', orange: '#ff9a2a', peach: '#ffb0a0' }

export function drawTree(ctx, tr, t) {
  const s = tr.size
  const sway = Math.sin(t * 1.3 + tr.seed) * 1.6 + tr.shake * Math.sin(t * 40) * 3
  const x = tr.x
  const y = tr.y
  shadow(ctx, x + 2, y + 1, 18 * s, 6 * s, 0.24)
  // trunk
  ctx.fillStyle = '#6b4a2a'
  ctx.beginPath()
  ctx.moveTo(x - 5 * s, y)
  ctx.lineTo(x - 3 * s, y - 24 * s)
  ctx.lineTo(x + 3 * s, y - 24 * s)
  ctx.lineTo(x + 5 * s, y)
  ctx.closePath()
  ctx.fill()
  stroke(ctx, 1.2)
  ctx.fillStyle = '#573a20'
  ctx.fillRect(x + 1 * s, y - 22 * s, 3 * s, 22 * s)
  // canopy: three lobes + highlight, swaying with the wind
  const dark = tr.fruiting ? '#3a8a44' : '#2c6b34'
  const mid = tr.fruiting ? '#4aa352' : '#3a8a42'
  const cx = x + sway
  const cy = y - 38 * s
  ell(ctx, cx - 14 * s, cy + 8 * s, 15 * s, 13 * s, dark)
  ell(ctx, cx + 14 * s, cy + 7 * s, 15 * s, 13 * s, dark)
  ell(ctx, cx, cy - 3 * s, 19 * s, 17 * s, dark)
  ell(ctx, cx - 6 * s, cy + 1 * s, 12 * s, 11 * s, mid)
  ell(ctx, cx + 8 * s, cy - 4 * s, 10 * s, 9 * s, mid)
  ell(ctx, cx - 5 * s, cy - 9 * s, 6 * s, 5 * s, 'rgba(200,240,160,0.55)')
  ctx.beginPath()
  ctx.ellipse(cx, cy - 3 * s, 19 * s, 17 * s, 0, 0, Math.PI * 2)
  stroke(ctx, 1.3, 'rgba(20,50,25,0.5)')
  if (tr.hasFruit) {
    ctx.fillStyle = FRUIT_COLORS[tr.kind] || '#e8452e'
    for (const [ox, oy] of [[-11, 4], [7, -2], [13, 10], [-3, 12], [2, -10]]) {
      ctx.beginPath()
      ctx.arc(cx + ox * s, cy + oy * s, 3.6 * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(cx + ox * s - 1.2, cy + oy * s - 1.8, 1.6, 1.6)
      ctx.fillStyle = FRUIT_COLORS[tr.kind] || '#e8452e'
    }
  }
}

// ------------------------------------------------------------- scenery bits ----

export function drawRock(ctx, r) {
  const s = r.s
  shadow(ctx, r.x + 2, r.y, 11 * s, 4 * s)
  ctx.beginPath()
  ctx.moveTo(r.x - 11 * s, r.y)
  ctx.quadraticCurveTo(r.x - 13 * s, r.y - 10 * s, r.x - 3 * s, r.y - 14 * s)
  ctx.quadraticCurveTo(r.x + 9 * s, r.y - 15 * s, r.x + 12 * s, r.y - 4 * s)
  ctx.lineTo(r.x + 11 * s, r.y)
  ctx.closePath()
  ctx.fillStyle = '#9a9aa6'
  ctx.fill()
  stroke(ctx, 1.3)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(r.x - 3 * s, r.y - 9 * s, 4 * s, 2.4 * s, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(60,120,60,0.55)'
  ctx.beginPath()
  ctx.ellipse(r.x + 7 * s, r.y - 1 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2)
  ctx.fill()
}

export function drawFlowerSpot(ctx, f, t) {
  if (f.picked) return
  const sway = Math.sin(t * 2 + f.c) * 1.2
  ctx.strokeStyle = '#2f6b34'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(f.x, f.y)
  ctx.quadraticCurveTo(f.x + sway * 0.5, f.y - 7, f.x + sway, f.y - 12)
  ctx.stroke()
  ctx.fillStyle = '#4a9a4a'
  ctx.beginPath()
  ctx.ellipse(f.x - 4, f.y - 4, 4, 1.8, -0.5, 0, Math.PI * 2)
  ctx.fill()
  const px = f.x + sway
  const py = f.y - 13
  ctx.fillStyle = f.color
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(px + Math.cos(a) * 3.6, py + Math.sin(a) * 3.6, 2.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffe066'
  ctx.beginPath()
  ctx.arc(px, py, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

export function drawShellSpot(ctx, s, t) {
  if (s.collected) return
  const bob = Math.sin(t * 2.2 + s.c) * 1.2
  ctx.save()
  ctx.translate(s.x, s.y + bob)
  shadow(ctx, 1, 4, 6, 2)
  ctx.fillStyle = '#fff3e0'
  ctx.beginPath()
  ctx.moveTo(-7, 3)
  ctx.quadraticCurveTo(-8, -7, 0, -8)
  ctx.quadraticCurveTo(8, -7, 7, 3)
  ctx.closePath()
  ctx.fill()
  stroke(ctx, 1.2)
  ctx.strokeStyle = 'rgba(200,140,120,0.8)'
  ctx.lineWidth = 1.1
  for (const dx of [-4, 0, 4]) {
    ctx.beginPath()
    ctx.moveTo(0, 3)
    ctx.lineTo(dx, -6)
    ctx.stroke()
  }
  // sparkle
  const k = (Math.sin(t * 4 + s.c * 2) + 1) / 2
  ctx.fillStyle = `rgba(255,255,255,${k})`
  ctx.fillRect(5, -9, 2, 2)
  ctx.restore()
}

// ---------------------------------------------------------------- buildings ----

function drawWindow(ctx, x, y, w, h, lit, t) {
  ctx.fillStyle = '#5a3a20'
  ctx.fillRect(x - w / 2 - 2.5, y - h / 2 - 2.5, w + 5, h + 5)
  ctx.fillStyle = lit ? '#ffe9a0' : '#9fd6ff'
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  if (!lit) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(x - w / 2, y + h / 2)
    ctx.lineTo(x - w / 2 + 6, y - h / 2)
    ctx.lineTo(x - w / 2 + 11, y - h / 2)
    ctx.lineTo(x - w / 2 + 5, y + h / 2)
    ctx.fill()
  }
  ctx.fillStyle = '#5a3a20'
  ctx.fillRect(x - 0.8, y - h / 2, 1.6, h)
  ctx.fillRect(x - w / 2, y - 0.8, w, 1.6)
}

function drawDoor(ctx, x, bottom, w = 24, h = 34) {
  ctx.fillStyle = '#4a2f1a'
  ctx.beginPath()
  ctx.roundRect(x - w / 2 - 2, bottom - h - 2, w + 4, h + 2, [w / 2 + 2, w / 2 + 2, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#8a5a30'
  ctx.beginPath()
  ctx.roundRect(x - w / 2, bottom - h, w, h, [w / 2, w / 2, 0, 0])
  ctx.fill()
  ctx.strokeStyle = 'rgba(40,24,10,0.5)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x, bottom - h + 4)
  ctx.lineTo(x, bottom)
  ctx.stroke()
  ctx.fillStyle = '#ffd24a'
  ctx.beginPath()
  ctx.arc(x + 5, bottom - h * 0.45, 1.8, 0, Math.PI * 2)
  ctx.fill()
}

// `night` is 0..1: windows glow and chimney smoke only matter visually.
export function drawBuilding(ctx, b, t, night) {
  const T = TILE
  const x0 = b.c * T
  const bw = b.w * T
  const bottom = (b.r + b.h) * T
  const wallTop = b.r * T - 10
  const lit = night > 0.25

  shadow(ctx, x0 + bw / 2 + 6, bottom + 2, bw * 0.55, 8, 0.2)

  if (b.kind === 'cottage' || b.kind === 'house' || b.kind === 'shop') {
    // chimney (behind the roof)
    const chx = x0 + bw - 38
    if (b.kind !== 'shop') {
      ctx.fillStyle = '#8a7a6a'
      ctx.fillRect(chx, wallTop - 62, 14, 40)
      ctx.fillStyle = '#6a5a4c'
      ctx.fillRect(chx - 2, wallTop - 66, 18, 6)
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.3 + i * 0.25) % 1
        ctx.fillStyle = `rgba(235,235,240,${(1 - ph) * 0.5})`
        ctx.beginPath()
        ctx.arc(chx + 7 + Math.sin(t + i * 2) * 4 + ph * 12, wallTop - 70 - ph * 38, 4 + ph * 7, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // wall
    ctx.fillStyle = b.wall
    ctx.fillRect(x0 + 4, wallTop, bw - 8, bottom - wallTop)
    ctx.fillStyle = 'rgba(0,0,0,0.1)'
    ctx.fillRect(x0 + 4, bottom - 9, bw - 8, 9)
    ctx.strokeStyle = 'rgba(90,60,30,0.25)'
    ctx.lineWidth = 1
    for (let ly = wallTop + 12; ly < bottom - 9; ly += 12) {
      ctx.beginPath()
      ctx.moveTo(x0 + 4, ly)
      ctx.lineTo(x0 + bw - 4, ly)
      ctx.stroke()
    }
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.6
    ctx.strokeRect(x0 + 4, wallTop, bw - 8, bottom - wallTop)
    // timber corners
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(x0 + 4, wallTop, 6, bottom - wallTop)
    ctx.fillRect(x0 + bw - 10, wallTop, 6, bottom - wallTop)

    // roof
    const roofH = 56
    ctx.beginPath()
    ctx.moveTo(x0 - 12, wallTop + 6)
    ctx.lineTo(x0 + 22, wallTop - roofH)
    ctx.lineTo(x0 + bw - 22, wallTop - roofH)
    ctx.lineTo(x0 + bw + 12, wallTop + 6)
    ctx.closePath()
    const rg = ctx.createLinearGradient(0, wallTop - roofH, 0, wallTop + 6)
    rg.addColorStop(0, b.roof)
    rg.addColorStop(1, shade(b.roof, 0.78))
    ctx.fillStyle = rg
    ctx.fill()
    stroke(ctx, 1.8)
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1.5
    for (let i = 1; i < 5; i++) {
      const ry = wallTop - roofH + (roofH * i) / 5
      const inset = 22 - (34 * i) / 5
      ctx.beginPath()
      ctx.moveTo(x0 + inset, ry)
      ctx.lineTo(x0 + bw - inset, ry)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x0 + 22, wallTop - roofH, bw - 44, 3)
    ctx.fillStyle = shade(b.roof, 0.62)
    ctx.fillRect(x0 - 12, wallTop + 3, bw + 24, 5)

    // door + windows
    const doorX = b.door.c * T + T / 2
    drawDoor(ctx, doorX, bottom, 26, 36)
    const winY = wallTop + 36
    if (b.kind === 'shop') {
      // big shop window with shelves + a striped awning
      ctx.fillStyle = '#5a3a20'
      ctx.fillRect(x0 + 18, winY - 12, 60, 40)
      ctx.fillStyle = lit ? '#ffe9a0' : '#bfe6ff'
      ctx.fillRect(x0 + 21, winY - 9, 54, 34)
      ctx.fillStyle = 'rgba(90,60,30,0.5)'
      ctx.fillRect(x0 + 21, winY + 6, 54, 2)
      for (const [dx, c] of [[28, '#e8452e'], [40, '#ffb02a'], [52, '#7fc26b'], [64, '#d58cff']]) {
        ctx.fillStyle = c
        ctx.fillRect(x0 + dx, winY - 4, 8, 10)
        ctx.fillRect(x0 + dx, winY + 10, 8, 10)
      }
      drawWindow(ctx, x0 + bw - 46, winY + 6, 28, 26, lit, t)
      // awning
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? '#fff6e8' : '#e0553f'
        ctx.beginPath()
        ctx.moveTo(x0 + 8 + i * ((bw - 16) / 9), winY - 22)
        ctx.lineTo(x0 + 8 + (i + 1) * ((bw - 16) / 9), winY - 22)
        ctx.lineTo(x0 + 14 + (i + 1) * ((bw - 28) / 9) - 2, winY - 8)
        ctx.lineTo(x0 + 14 + i * ((bw - 28) / 9) - 2, winY - 8)
        ctx.closePath()
        ctx.fill()
      }
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.2
      ctx.strokeRect(x0 + 8, winY - 22, bw - 16, 14)
      // hanging sign
      ctx.fillStyle = '#4a2f1a'
      ctx.fillRect(doorX - 1, wallTop + 6, 2, 8)
      ctx.fillStyle = '#e8d3a0'
      ctx.beginPath()
      ctx.roundRect(doorX - 22, wallTop + 12, 44, 16, 4)
      ctx.fill()
      stroke(ctx, 1.3)
      ctx.fillStyle = '#4a2f1a'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('상점', doorX, wallTop + 24)
      // crates out front
      for (const [cx, cy] of [[x0 + 8, bottom - 2], [x0 + bw - 24, bottom - 2]]) {
        ctx.fillStyle = '#b8864a'
        ctx.fillRect(cx, cy - 16, 18, 16)
        ctx.strokeStyle = '#6a4a22'
        ctx.lineWidth = 1.4
        ctx.strokeRect(cx, cy - 16, 18, 16)
        ctx.beginPath()
        ctx.moveTo(cx, cy - 16)
        ctx.lineTo(cx + 18, cy)
        ctx.stroke()
      }
    } else {
      drawWindow(ctx, x0 + 36, winY + 8, 26, 24, lit, t)
      drawWindow(ctx, x0 + bw - 36, winY + 8, 26, 24, lit, t)
      // flower boxes under the windows
      for (const wx of [x0 + 36, x0 + bw - 36]) {
        ctx.fillStyle = '#7a4a26'
        ctx.fillRect(wx - 16, winY + 22, 32, 7)
        for (const [dx, c] of [[-10, '#ff8fb0'], [-3, '#ffd34d'], [4, '#b58cff'], [11, '#ff7a59']]) {
          ctx.fillStyle = c
          ctx.beginPath()
          ctx.arc(wx + dx, winY + 20, 3.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      if (b.label) {
        ctx.fillStyle = '#e8d3a0'
        ctx.beginPath()
        ctx.roundRect(doorX + 18, bottom - 34, 34, 15, 4)
        ctx.fill()
        stroke(ctx, 1.2)
        ctx.fillStyle = '#4a2f1a'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(b.label, doorX + 35, bottom - 23)
      }
    }
    // doormat
    ctx.fillStyle = '#9a4a3a'
    ctx.beginPath()
    ctx.roundRect(doorX - 17, bottom + 1, 34, 8, 3)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(doorX - 13, bottom + 3, 26, 1.5)
  }
}

// -------------------------------------------------------------------- props ----

export function drawProp(ctx, p, t, night) {
  const x = p.x
  const y = p.y
  if (p.kind === 'fountain') {
    shadow(ctx, x, y + 2, 36, 10, 0.22)
    ctx.beginPath()
    ctx.ellipse(x, y - 8, 33, 18, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#b9b3a8'
    ctx.fill()
    stroke(ctx, 1.6)
    ctx.beginPath()
    ctx.ellipse(x, y - 11, 27, 13, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#6ab8e8'
    ctx.fill()
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + i * 0.33) % 1
      ctx.strokeStyle = `rgba(255,255,255,${(1 - ph) * 0.7})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.ellipse(x, y - 11, 6 + ph * 18, 3 + ph * 8, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = '#a8a298'
    ctx.fillRect(x - 5, y - 38, 10, 28)
    stroke(ctx, 1.2)
    ctx.beginPath()
    ctx.ellipse(x, y - 40, 10, 5, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#b9b3a8'
    ctx.fill()
    stroke(ctx, 1.2)
    // spouting water
    ctx.strokeStyle = 'rgba(200,235,255,0.85)'
    ctx.lineWidth = 2
    for (const s of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(x, y - 44)
      ctx.quadraticCurveTo(x + s * 12, y - 58 - Math.sin(t * 6 + s) * 2, x + s * 22, y - 26)
      ctx.stroke()
    }
  } else if (p.kind === 'lamp') {
    shadow(ctx, x, y + 1, 7, 2.5)
    ctx.fillStyle = '#2b2b33'
    ctx.fillRect(x - 2, y - 46, 4, 46)
    ctx.fillRect(x - 6, y - 2, 12, 3)
    ctx.beginPath()
    ctx.roundRect(x - 7, y - 60, 14, 16, 3)
    ctx.fill()
    ctx.fillStyle = night > 0.15 ? '#fff0a8' : '#d6c88a'
    ctx.fillRect(x - 4.5, y - 57, 9, 10)
    ctx.fillStyle = '#2b2b33'
    ctx.beginPath()
    ctx.moveTo(x - 9, y - 60)
    ctx.lineTo(x, y - 68)
    ctx.lineTo(x + 9, y - 60)
    ctx.closePath()
    ctx.fill()
  } else if (p.kind === 'bench') {
    const w = p.w * TILE
    const x0 = p.c * TILE
    shadow(ctx, x, y + 1, w * 0.45, 4, 0.22)
    ctx.fillStyle = '#8a5a30'
    ctx.fillRect(x0 + 4, y - 22, w - 8, 6)
    ctx.fillRect(x0 + 4, y - 14, w - 8, 6)
    ctx.fillStyle = '#6a4222'
    ctx.fillRect(x0 + 6, y - 22, 4, 22)
    ctx.fillRect(x0 + w - 10, y - 22, 4, 22)
    ctx.fillStyle = '#a8703c'
    ctx.fillRect(x0 + 4, y - 9, w - 8, 5)
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.2
    ctx.strokeRect(x0 + 4, y - 9, w - 8, 5)
  } else if (p.kind === 'board') {
    shadow(ctx, x, y + 1, 18, 5, 0.22)
    ctx.fillStyle = '#6a4222'
    ctx.fillRect(x - 15, y - 40, 4, 40)
    ctx.fillRect(x + 11, y - 40, 4, 40)
    ctx.fillStyle = '#c9a86a'
    ctx.beginPath()
    ctx.roundRect(x - 22, y - 62, 44, 34, 3)
    ctx.fill()
    ctx.strokeStyle = '#5c431c'
    ctx.lineWidth = 2.2
    ctx.stroke()
    for (const [dx, dy, c, r] of [[-12, -57, '#fff6d8', -0.1], [2, -55, '#d6ecff', 0.08], [-4, -44, '#ffe0e0', 0.05]]) {
      ctx.save()
      ctx.translate(x + dx, y + dy)
      ctx.rotate(r)
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 15, 12)
      ctx.strokeStyle = 'rgba(80,60,30,0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(0, 0, 15, 12)
      ctx.fillStyle = '#e04a3a'
      ctx.beginPath()
      ctx.arc(7.5, 1.5, 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = '#5c431c'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('부탁', x, y - 66)
  } else if (p.kind === 'mailbox') {
    shadow(ctx, x, y + 1, 7, 2.5)
    ctx.fillStyle = '#6a4222'
    ctx.fillRect(x - 2, y - 22, 4, 22)
    ctx.fillStyle = '#d6524a'
    ctx.beginPath()
    ctx.roundRect(x - 10, y - 36, 20, 15, [9, 9, 2, 2])
    ctx.fill()
    stroke(ctx, 1.3)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 5, y - 30, 10, 3)
  } else if (p.kind === 'sign') {
    shadow(ctx, x, y + 1, 7, 2.5)
    ctx.fillStyle = '#6a4222'
    ctx.fillRect(x - 2, y - 34, 4, 34)
    ctx.fillStyle = '#d8b878'
    for (const [dy, dir] of [[-34, 1], [-24, -1]]) {
      ctx.beginPath()
      ctx.moveTo(x - dir * 16, y + dy)
      ctx.lineTo(x + dir * 14, y + dy)
      ctx.lineTo(x + dir * 20, y + dy + 5)
      ctx.lineTo(x + dir * 14, y + dy + 10)
      ctx.lineTo(x - dir * 16, y + dy + 10)
      ctx.closePath()
      ctx.fill()
      stroke(ctx, 1.2)
    }
  } else if (p.kind === 'barrel') {
    shadow(ctx, x, y + 1, 11, 3.5)
    ctx.fillStyle = '#8a5a2e'
    ctx.beginPath()
    ctx.roundRect(x - 11, y - 26, 22, 26, 6)
    ctx.fill()
    stroke(ctx, 1.3)
    ctx.fillStyle = '#5a5a66'
    ctx.fillRect(x - 11, y - 20, 22, 2.5)
    ctx.fillRect(x - 11, y - 8, 22, 2.5)
    ell(ctx, x, y - 26, 10.5, 3.2, '#a06a38')
  } else if (p.kind === 'fence') {
    ctx.fillStyle = '#c8a46a'
    ctx.fillRect(p.c * TILE, y - 18, TILE, 4)
    ctx.fillRect(p.c * TILE, y - 9, TILE, 4)
    ctx.fillStyle = '#b08850'
    for (const px of [p.c * TILE + 4, p.c * TILE + TILE - 8]) {
      ctx.fillRect(px, y - 24, 5, 24)
      ctx.beginPath()
      ctx.moveTo(px, y - 24)
      ctx.lineTo(px + 2.5, y - 28)
      ctx.lineTo(px + 5, y - 24)
      ctx.fill()
    }
  }
}

// A soft glow for lamps and windows at night (drawn additively by the caller).
export function drawGlow(ctx, x, y, r, a) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, r)
  g.addColorStop(0, `rgba(255,226,150,${a})`)
  g.addColorStop(1, 'rgba(255,226,150,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}
