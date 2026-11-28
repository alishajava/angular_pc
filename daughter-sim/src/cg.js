// 이벤트 CG 10장: 전부 캔버스로 그린 일러스트(이미지 파일 없음). 시간 t(초)에 따라 살짝 움직인다.
// drawCG(ctx, id, t, W, H, who)  who = { look(딸의 외형), hairHex, name }
import { drawPerson, drawEmote } from './people.js'

export const CG_LIST = [
  { id: 'street_show', title: '거리 공연' },
  { id: 'praise', title: '선생님의 칭찬' },
  { id: 'night_book', title: '밤새 읽은 책' },
  { id: 'festival', title: '동네 축제' },
  { id: 'puppy', title: '강아지와의 만남' },
  { id: 'stage_song', title: '무대 위의 노래' },
  { id: 'champion', title: '대회 우승' },
  { id: 'meditation', title: '새벽 명상' },
  { id: 'sleep_in', title: '달콤한 늦잠' },
  { id: 'new_clothes', title: '새 옷' },
]

const TAU = Math.PI * 2
const hash = (a, k = 0) => {
  const x = Math.sin(a * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const lerp = (a, b, k) => a + (b - a) * k
const clamp01 = (v) => Math.max(0, Math.min(1, v))

// ------------------------------------------------------------------ 소품 ----
function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  stops.forEach(([o, c]) => g.addColorStop(o, c))
  return g
}
function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(${rgb},${a})`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}
function star(ctx, x, y, r, rot, color, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    const rr = i % 2 ? r * 0.35 : r
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
function heart(ctx, x, y, s, color, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 6)
  ctx.bezierCurveTo(-12, -2, -8, -12, 0, -6)
  ctx.bezierCurveTo(8, -12, 12, -2, 0, 6)
  ctx.fill()
  ctx.restore()
}
function note(ctx, x, y, s, color, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.ellipse(0, 0, 6, 4.5, -0.4, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.moveTo(5, -1); ctx.lineTo(5, -20); ctx.lineTo(13, -16); ctx.stroke()
  ctx.restore()
}
function lantern(ctx, x, y, r, color, t = 0) {
  glow(ctx, x, y, r * 3.2, '255,200,120', 0.35)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.2, 0, 0, TAU); ctx.fill()
  ctx.strokeStyle = 'rgba(60,20,10,0.45)'
  ctx.lineWidth = 1.2
  for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(x, y, r * Math.abs(k || 0.05), r * 1.2, 0, 0, TAU); ctx.stroke() }
  ctx.fillStyle = '#4a2a14'
  ctx.fillRect(x - r * 0.45, y - r * 1.35, r * 0.9, r * 0.28)
  ctx.fillRect(x - r * 0.45, y + r * 1.08, r * 0.9, r * 0.28)
  ctx.strokeStyle = '#4a2a14'
  ctx.beginPath(); ctx.moveTo(x, y + r * 1.36); ctx.lineTo(x + Math.sin(t * 2 + x) * 2, y + r * 2.2); ctx.stroke()
}
function lanternString(ctx, t, W, y, sag, n, colors) {
  ctx.strokeStyle = 'rgba(40,20,10,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= 20; i++) {
    const x = (i / 20) * W
    const yy = y + Math.sin((i / 20) * Math.PI) * sag
    i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)
  }
  ctx.stroke()
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n
    lantern(ctx, k * W, y + Math.sin(k * Math.PI) * sag + 16, 11 + (i % 2) * 2, colors[i % colors.length], t)
  }
}
function confetti(ctx, t, W, H, n, seed, colors, speed = 60) {
  for (let i = 0; i < n; i++) {
    const x = (hash(i, seed) * W + Math.sin(t * 1.2 + i) * 20) % W
    const y = (hash(i, seed + 7) * H + t * speed * (0.6 + hash(i, seed + 3))) % H
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(t * 2 + i)
    ctx.fillStyle = colors[i % colors.length]
    ctx.fillRect(-3, -1.6, 6, 3.2)
    ctx.restore()
  }
}
function twinkles(ctx, t, n, seed, x0, y0, w, h, color = '#fff6c0') {
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.7 + hash(i, seed)) % 1
    const a = Math.sin(ph * Math.PI)
    star(ctx, x0 + hash(i, seed + 2) * w, y0 + hash(i, seed + 5) * h, 4 + hash(i, seed + 9) * 8, ph * 2, color, a)
  }
}
function hanokSil(ctx, x, y, w, h, color) {
  ctx.fillStyle = color
  ctx.fillRect(x + w * 0.08, y - h * 0.45, w * 0.84, h * 0.45)
  ctx.beginPath()
  ctx.moveTo(x - w * 0.05, y - h * 0.42)
  ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.5, x + w * 0.3, y - h)
  ctx.lineTo(x + w * 0.7, y - h)
  ctx.quadraticCurveTo(x + w * 0.8, y - h * 0.5, x + w * 1.05, y - h * 0.42)
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.3, x - w * 0.05, y - h * 0.42)
  ctx.fill()
}
function person(ctx, look, x, y, s, st = {}) {
  s *= 1.18 // CG에서는 인물을 조금 크게
  y -= 24 // 아래 자막 칸에 발이 덜 가리도록 조금 올린다
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  drawPerson(ctx, 0, 0, look, { t: st.t ?? 0, ...st })
  ctx.restore()
}
function vignette(ctx, W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}
// 조연들의 외형
const NPC = {
  master: { skin: '#dba87c', hair: '#1c1512', hairStyle: 'short', shirt: '#9a3a32', pants: '#2a2a32', shoes: '#1c1c22', eye: '#3a2a22', outfit: 'tee' },
  teacher: { skin: '#e8c8a0', hair: '#d8d8d8', hairStyle: 'short', shirt: '#3f5a8a', pants: '#2c3446', shoes: '#2a2224', eye: '#3a2a22', outfit: 'tee', hat: 'gat', glasses: true },
  monk: { skin: '#e8b48f', hair: '#e8b48f', hairStyle: 'short', shirt: '#8a8f7a', pants: '#6a6f5a', shoes: '#4a3a2a', eye: '#3a2a22', outfit: 'tee' },
  aunt: { skin: '#e8b48f', hair: '#5a3a28', hairStyle: 'bun', shirt: '#c0705a', pants: '#5a4a3a', shoes: '#3a2a1a', eye: '#3a2a22', outfit: 'apron' },
  kid: { skin: '#f2c79b', hair: '#2b2320', hairStyle: 'bob', shirt: '#6ab0e0', pants: '#4a5a6a', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'tee' },
}

function dog(ctx, x, y, s, t, flip = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s * flip, s)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath(); ctx.ellipse(0, 4, 30, 7, 0, 0, TAU); ctx.fill()
  const body = '#d9a066'
  const dark = '#9a6a3a'
  // 꼬리 (흔들흔들)
  ctx.save(); ctx.translate(-26, -22); ctx.rotate(-0.6 + Math.sin(t * 14) * 0.5)
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-8, 0, 12, 4.5, 0, 0, TAU); ctx.fill(); ctx.restore()
  ctx.fillStyle = body
  ctx.beginPath(); ctx.ellipse(0, -20, 28, 16, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = '#f6e2c0'
  ctx.beginPath(); ctx.ellipse(6, -14, 18, 9, 0, 0, TAU); ctx.fill()
  for (const lx of [-16, 14]) { ctx.fillStyle = body; ctx.fillRect(lx, -10, 8, 14); ctx.fillStyle = '#f6e2c0'; ctx.fillRect(lx, 0, 8, 5) }
  // 머리
  ctx.fillStyle = body
  ctx.beginPath(); ctx.arc(26, -34, 16, 0, TAU); ctx.fill()
  ctx.fillStyle = dark
  ctx.beginPath(); ctx.ellipse(16, -40, 6, 12, 0.3, 0, TAU); ctx.fill()
  ctx.fillStyle = '#f6e2c0'
  ctx.beginPath(); ctx.ellipse(34, -29, 10, 8, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = '#2a1a14'
  ctx.beginPath(); ctx.ellipse(41, -33, 3.6, 2.8, 0, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.arc(29, -38, 2.6, 0, TAU); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(29.8, -38.8, 0.9, 0, TAU); ctx.fill()
  ctx.fillStyle = '#ff8a9a'
  ctx.beginPath(); ctx.ellipse(36, -22 + Math.sin(t * 8) * 1.5, 3, 5, 0, 0, TAU); ctx.fill()
  ctx.restore()
}

// ------------------------------------------------------------------ 장면 ----
const SCENES = {
  // 1. 거리 공연: 해 질 녘 장터, 저글링 광대와 구경꾼, 눈을 반짝이는 딸
  street_show(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.62, [[0, '#3a2a5a'], [0.55, '#c0587a'], [1, '#ffc27a']])
    ctx.fillRect(0, 0, W, H)
    glow(ctx, W * 0.72, H * 0.5, 220, '255,200,140', 0.5)
    for (let i = 0; i < 6; i++) hanokSil(ctx, -30 + i * 150, H * 0.62, 150, 120 + hash(i) * 40, i % 2 ? '#4a2a4a' : '#5a3050')
    ctx.fillStyle = '#6a5240'
    ctx.fillRect(0, H * 0.62, W, H * 0.4)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    for (let i = 0; i < 14; i++) ctx.fillRect(i * 62 - ((t * 6) % 62), H * 0.66, 30, 4)
    lanternString(ctx, t, W, 40, 34, 9, ['#e8453c', '#f2b630', '#e8453c', '#ff8a4a'])
    // 무대
    ctx.fillStyle = '#7a4e2a'
    ctx.fillRect(430, 350, 300, 26)
    ctx.fillStyle = '#5a361c'
    for (let i = 0; i < 12; i++) ctx.fillRect(432 + i * 25, 352, 2, 22)
    // 저글링 하는 사범
    person(ctx, NPC.master, 580, 352, 2.5, { facing: 'left', t, pose: { type: 'wave', p: 0 } })
    const cols = ['#ff5a5a', '#ffd23f', '#5ab8ff']
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.6 + i / 3) % 1
      const bx = 580 + Math.sin(ph * Math.PI) * 0 + (i - 1) * 38 * Math.cos(ph * TAU)
      const by = 300 - Math.sin(ph * Math.PI) * 120
      glow(ctx, bx, by, 24, '255,240,180', 0.5)
      ctx.fillStyle = cols[i]
      ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(bx - 3, by - 4, 3.5, 0, TAU); ctx.fill()
    }
    // 구경꾼 그림자
    ctx.fillStyle = '#2a1830'
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * 70 + (i > 3 ? 160 : 0)
      const bob = Math.abs(Math.sin(t * 3 + i)) * 4
      ctx.beginPath(); ctx.arc(x, 470 - bob, 20, 0, TAU); ctx.fill()
      ctx.fillRect(x - 22, 474 - bob, 44, 120)
    }
    person(ctx, who.look, 250, 520, 3.3, { facing: 'right', t })
    drawEmote(ctx, 250, 520 - 190, '!', t)
    twinkles(ctx, t, 16, 4, 180, 300, 160, 160, '#fff0a0')
    confetti(ctx, t, W, H, 26, 2, ['#ff7a8a', '#ffd23f', '#7ad0ff'])
  },

  // 2. 선생님의 칭찬: 서당, 붉은 도장과 별
  praise(ctx, t, W, H, who) {
    ctx.fillStyle = '#ecdcbc'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = grad(ctx, 0, H * 0.6, 0, H, [[0, '#b88a54'], [1, '#8a5a30']])
    ctx.fillRect(0, H * 0.6, W, H * 0.4)
    ctx.strokeStyle = 'rgba(60,30,10,0.3)'
    ctx.lineWidth = 2
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 110 - 30, H * 0.6); ctx.lineTo(i * 150 - 140, H); ctx.stroke() }
    // 창문과 햇살
    ctx.fillStyle = '#fff8e0'
    ctx.fillRect(60, 70, 150, 190)
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 5
    ctx.strokeRect(60, 70, 150, 190)
    ctx.lineWidth = 2
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(60 + i * 37.5, 70); ctx.lineTo(60 + i * 37.5, 260); ctx.stroke() }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(60, 70 + i * 38); ctx.lineTo(210, 70 + i * 38); ctx.stroke() }
    ctx.fillStyle = 'rgba(255,240,180,0.28)'
    ctx.beginPath(); ctx.moveTo(60, 260); ctx.lineTo(210, 260); ctx.lineTo(430, 480); ctx.lineTo(180, 480); ctx.closePath(); ctx.fill()
    // 족자
    ctx.fillStyle = '#f6efde'
    ctx.fillRect(500, 60, 130, 220)
    ctx.fillStyle = '#7a3a2a'; ctx.fillRect(494, 54, 142, 10); ctx.fillRect(494, 276, 142, 10)
    ctx.fillStyle = '#2a1a14'
    ctx.font = 'bold 84px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('學', 565, 168)
    // 책상
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(130, 420, 270, 18); ctx.fillRect(150, 436, 14, 70); ctx.fillRect(366, 436, 14, 70)
    ctx.fillStyle = '#f4ead0'; ctx.fillRect(210, 400, 80, 22)
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.5; ctx.strokeRect(210, 400, 80, 22)
    person(ctx, NPC.teacher, 600, 520, 3.4, { facing: 'left', t })
    person(ctx, who.look, 330, 540, 3.4, { facing: 'right', t, sit: false })
    drawEmote(ctx, 330, 540 - 200, '♥', t)
    // 붉은 도장 (톡 찍히는 연출)
    const p = clamp01(((t * 0.8) % 2) / 0.3)
    const sc = lerp(1.8, 1, p)
    ctx.save()
    ctx.translate(400, 210)
    ctx.rotate(-0.2)
    ctx.scale(sc, sc)
    ctx.globalAlpha = Math.min(1, 0.3 + p)
    ctx.strokeStyle = '#d6342a'; ctx.lineWidth = 7
    ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.stroke()
    ctx.fillStyle = '#d6342a'
    ctx.font = 'bold 30px sans-serif'
    ctx.fillText('참 잘했어요', 0, 4)
    ctx.restore()
    twinkles(ctx, t, 14, 8, 250, 100, 300, 220, '#ffe066')
  },

  // 3. 밤새 읽은 책: 촛불 아래 책 더미
  night_book(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#0b1024'], [1, '#1c2040']])
    ctx.fillRect(0, 0, W, H)
    // 달빛 창
    ctx.fillStyle = '#2a3a6a'
    ctx.fillRect(560, 70, 150, 190)
    glow(ctx, 640, 150, 180, '170,200,255', 0.35)
    ctx.fillStyle = '#e8f0ff'
    ctx.beginPath(); ctx.arc(650, 130, 26, 0, TAU); ctx.fill()
    ctx.strokeStyle = '#0b1024'; ctx.lineWidth = 6
    ctx.strokeRect(560, 70, 150, 190)
    ctx.beginPath(); ctx.moveTo(635, 70); ctx.lineTo(635, 260); ctx.moveTo(560, 165); ctx.lineTo(710, 165); ctx.stroke()
    ctx.fillStyle = 'rgba(170,200,255,0.09)'
    ctx.beginPath(); ctx.moveTo(560, 260); ctx.lineTo(710, 260); ctx.lineTo(500, 520); ctx.lineTo(260, 520); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#1a1424'; ctx.fillRect(0, 470, W, 106)
    // 책상과 책 더미
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(120, 430, 520, 20); ctx.fillRect(150, 450, 16, 90); ctx.fillRect(600, 450, 16, 90)
    const colors = ['#8a3a3a', '#3a5a8a', '#6a7a3a', '#7a4a8a', '#8a6a3a']
    for (let i = 0; i < 5; i++) { ctx.fillStyle = colors[i]; ctx.fillRect(460 + (i % 2) * 6, 410 - i * 20, 130, 18); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(466 + (i % 2) * 6, 414 - i * 20, 118, 3) }
    // 촛불
    const fl = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.07
    glow(ctx, 270, 340, 330 * fl, '255,190,100', 0.55)
    ctx.fillStyle = '#f2ead0'; ctx.fillRect(262, 360, 16, 70)
    ctx.fillStyle = '#ffb347'
    ctx.beginPath(); ctx.ellipse(270, 346, 8 * fl, 16 * fl, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = '#fff6c0'
    ctx.beginPath(); ctx.ellipse(270, 350, 4, 9 * fl, 0, 0, TAU); ctx.fill()
    // 펼친 책
    ctx.fillStyle = '#f2e6c4'
    ctx.beginPath(); ctx.moveTo(310, 428); ctx.lineTo(380, 408); ctx.lineTo(450, 428); ctx.lineTo(380, 440); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.2
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(326 + i * 3, 424 + i * 2); ctx.lineTo(372 + i * 2, 414 + i * 2); ctx.stroke() }
    person(ctx, who.look, 390, 520, 3.3, { facing: 'left', t, sit: false })
    // 먼지와 졸음
    for (let i = 0; i < 20; i++) {
      const x = (hash(i, 1) * W + t * 10) % W
      const y = (hash(i, 2) * 440 + Math.sin(t + i) * 20) % 440
      ctx.fillStyle = `rgba(255,230,180,${0.2 + hash(i, 3) * 0.3})`
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill()
    }
    twinkles(ctx, t, 8, 12, 300, 300, 240, 120, '#ffd9a0')
  },

  // 4. 동네 축제: 밤하늘 불꽃놀이와 등불
  festival(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#070b24'], [0.6, '#232a62'], [1, '#6a3a6a']])
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 40; i++) star(ctx, hash(i, 1) * W, hash(i, 2) * H * 0.5, 1.6, 0, '#fff', 0.4 + 0.5 * Math.abs(Math.sin(t + i)))
    for (let k = 0; k < 4; k++) {
      const p = (t * 0.45 + k * 0.27) % 1
      const cx = 140 + hash(k, 4) * (W - 280)
      const cy = 110 + hash(k, 5) * 130
      const col = ['255,120,160', '255,220,110', '120,220,255', '170,255,150'][k]
      if (p < 0.85) {
        const r = Math.pow(p / 0.85, 0.6) * 120
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * TAU
          const px = cx + Math.cos(a) * r
          const py = cy + Math.sin(a) * r + p * p * 40
          ctx.fillStyle = `rgba(${col},${1 - p / 0.85})`
          ctx.beginPath(); ctx.arc(px, py, 3 - p * 1.5, 0, TAU); ctx.fill()
        }
        glow(ctx, cx, cy, 90 * (1 - p), col, 0.25)
      } else {
        ctx.fillStyle = `rgba(${col},${(p - 0.85) * 3})`
        ctx.beginPath(); ctx.arc(cx, cy + 40 - (p - 0.85) * 700 * 0, 3, 0, TAU); ctx.fill()
      }
    }
    lanternString(ctx, t, W, 36, 40, 11, ['#e8453c', '#f2b630', '#ff8a4a', '#e85a8a'])
    lanternString(ctx, t, W, 150, 30, 9, ['#f2b630', '#e8453c', '#ff8a4a'])
    // 먼 지붕과 노점
    for (let i = 0; i < 5; i++) hanokSil(ctx, -20 + i * 190, H * 0.74, 190, 120, '#1a1230')
    ctx.fillStyle = '#2a1a30'; ctx.fillRect(0, H * 0.74, W, H * 0.3)
    for (const x of [90, 690]) {
      glow(ctx, x, 440, 130, '255,180,90', 0.45)
      ctx.fillStyle = '#7a3a2a'; ctx.fillRect(x - 60, 420, 120, 18)
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff0d8' : '#e8453c'; ctx.fillRect(x - 60 + i * 20, 394, 20, 26) }
    }
    person(ctx, who.look, 400, 540, 3.5, { facing: 'up', t })
    person(ctx, NPC.kid, 520, 548, 2.7, { facing: 'up', t })
    twinkles(ctx, t, 18, 21, 0, 0, W, 260, '#ffe9a0')
  },

  // 5. 강아지와의 만남: 노을 마당, 꼬리 흔드는 강아지와 하트
  puppy(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.7, [[0, '#ffd9a0'], [0.6, '#ffb07a'], [1, '#ff9a7a']])
    ctx.fillRect(0, 0, W, H)
    glow(ctx, 640, 190, 260, '255,230,170', 0.6)
    ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(640, 190, 54, 0, TAU); ctx.fill()
    // 담장과 한옥
    hanokSil(ctx, 40, H * 0.52, 260, 200, '#8a4a3a')
    ctx.fillStyle = '#b8845a'
    for (let i = 0; i < 12; i++) ctx.fillRect(i * 72, H * 0.52, 54, 90)
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(0, H * 0.52 + 10, W, 8)
    ctx.fillStyle = grad(ctx, 0, H * 0.6, 0, H, [[0, '#9ac060'], [1, '#5a8a3a']])
    ctx.fillRect(0, H * 0.6, W, H * 0.4)
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 1) * W
      const y = H * 0.64 + hash(i, 2) * H * 0.34
      ctx.fillStyle = ['#ffd2e0', '#fff4a8', '#ffffff'][i % 3]
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill()
    }
    person(ctx, who.look, 300, 500, 3.4, { facing: 'right', t, sit: true })
    dog(ctx, 520, 520, 2.3, t, -1)
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.5 + i / 6) % 1
      heart(ctx, 420 + Math.sin(ph * 6 + i) * 30, 400 - ph * 190, 1.2 + ph * 0.8, i % 2 ? '#ff6a8a' : '#ff9ab0', 1 - ph)
    }
    twinkles(ctx, t, 12, 31, 240, 260, 340, 200, '#fff6c0')
  },

  // 6. 무대 위의 노래: 붉은 커튼과 스포트라이트
  stage_song(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#2a0a14'], [1, '#5a1a24']])
    ctx.fillRect(0, 0, W, H)
    // 스포트라이트
    ctx.fillStyle = 'rgba(255,240,190,0.2)'
    ctx.beginPath(); ctx.moveTo(380, 0); ctx.lineTo(420, 0); ctx.lineTo(560, 470); ctx.lineTo(240, 470); ctx.closePath(); ctx.fill()
    // 무대 바닥
    ctx.fillStyle = grad(ctx, 0, 440, 0, H, [[0, '#a8743a'], [1, '#5a3a1a']])
    ctx.beginPath(); ctx.moveTo(60, 440); ctx.lineTo(740, 440); ctx.lineTo(W, 520); ctx.lineTo(0, 520); ctx.closePath(); ctx.fill()
    glow(ctx, 400, 460, 230, '255,230,160', 0.5)
    // 커튼
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W
      ctx.fillStyle = '#a82030'
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 - side * 210, 0)
      ctx.quadraticCurveTo(x0 - side * 120, 240, x0 - side * 70, 500); ctx.lineTo(x0, 500); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(60,0,10,0.4)'; ctx.lineWidth = 3
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x0 - side * i * 34, 0); ctx.quadraticCurveTo(x0 - side * (i * 20 + 20), 240, x0 - side * (i * 12 + 10), 500); ctx.stroke() }
    }
    ctx.fillStyle = '#7a1420'; ctx.fillRect(0, 0, W, 50)
    ctx.fillStyle = '#d8a030'; for (let i = 0; i < 16; i++) ctx.fillRect(i * 52 + 10, 46, 30, 8)
    person(ctx, who.look, 400, 480, 3.6, { facing: 'down', t, pose: { type: 'wave', p: 0 } })
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.45 + i / 7) % 1
      note(ctx, 400 + (i % 2 ? 1 : -1) * (60 + ph * 190) + Math.sin(ph * 8 + i) * 12, 330 - ph * 230, 1.3, ['#ffd23f', '#ff8ab0', '#8ad8ff'][i % 3], 1 - ph)
    }
    // 객석: 박수 치는 손
    ctx.fillStyle = '#1a0810'
    for (let i = 0; i < 12; i++) {
      const x = 30 + i * 66
      const bob = Math.abs(Math.sin(t * 5 + i)) * 7
      ctx.beginPath(); ctx.arc(x, 560 - bob, 26, 0, TAU); ctx.fill()
      ctx.fillRect(x - 30, 566 - bob, 60, 40)
      ctx.strokeStyle = '#1a0810'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.moveTo(x - 20, 546 - bob); ctx.lineTo(x - 8 + Math.sin(t * 9 + i) * 4, 512 - bob); ctx.stroke()
    }
    confetti(ctx, t, W, H, 36, 6, ['#ffd23f', '#ff6a8a', '#6ad0ff', '#ffffff'], 70)
    twinkles(ctx, t, 16, 5, 200, 80, 400, 340, '#fff2b0')
  },

  // 7. 대회 우승: 트로피와 색종이
  champion(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.7, [[0, '#6ac0ff'], [1, '#e8f6ff']])
    ctx.fillRect(0, 0, W, H)
    ctx.save(); ctx.translate(400, 150); ctx.rotate(t * 0.12)
    for (let i = 0; i < 14; i++) {
      ctx.rotate(TAU / 14)
      ctx.fillStyle = 'rgba(255,240,170,0.2)'
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -700); ctx.lineTo(40, -700); ctx.closePath(); ctx.fill()
    }
    ctx.restore()
    // 구름
    for (let i = 0; i < 4; i++) {
      const x = ((i * 240 + t * 10) % (W + 240)) - 120
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath(); ctx.arc(x, 90 + i * 30, 36, 0, TAU); ctx.arc(x + 40, 100 + i * 30, 30, 0, TAU); ctx.arc(x - 38, 104 + i * 30, 26, 0, TAU); ctx.fill()
    }
    // 연무장 모래
    ctx.fillStyle = grad(ctx, 0, H * 0.62, 0, H, [[0, '#e8cc88'], [1, '#c8a060']])
    ctx.fillRect(0, H * 0.62, W, H * 0.4)
    ctx.strokeStyle = 'rgba(120,80,30,0.25)'; ctx.lineWidth = 2
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, H * 0.66 + i * 28); ctx.lineTo(W, H * 0.66 + i * 28); ctx.stroke() }
    // 깃발
    for (const [x, c] of [[90, '#e8453c'], [710, '#3a78d8']]) {
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x - 3, 190, 6, 300)
      ctx.fillStyle = c
      ctx.beginPath(); ctx.moveTo(x + 3, 196); ctx.quadraticCurveTo(x + 50, 190 + Math.sin(t * 3) * 10, x + 90, 200 + Math.sin(t * 3 + 1) * 8); ctx.lineTo(x + 90, 270); ctx.quadraticCurveTo(x + 50, 262 + Math.sin(t * 3) * 10, x + 3, 272); ctx.fill()
    }
    person(ctx, NPC.master, 620, 540, 3, { facing: 'left', t, pose: { type: 'wave', p: 0 } })
    person(ctx, who.look, 380, 540, 3.5, { facing: 'down', t, pose: { type: 'wave', p: 0 } })
    // 트로피
    const bob = Math.sin(t * 3) * 4
    ctx.save()
    ctx.translate(470, 270 + bob)
    glow(ctx, 0, 0, 90, '255,230,130', 0.6)
    ctx.fillStyle = '#e8b83a'
    ctx.beginPath(); ctx.moveTo(-34, -40); ctx.lineTo(34, -40); ctx.quadraticCurveTo(30, 12, 0, 20); ctx.quadraticCurveTo(-30, 12, -34, -40); ctx.fill()
    ctx.strokeStyle = '#e8b83a'; ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(-36, -22, 15, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke()
    ctx.beginPath(); ctx.arc(36, -22, 15, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke()
    ctx.fillStyle = '#d09a22'; ctx.fillRect(-6, 18, 12, 18); ctx.fillRect(-24, 34, 48, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-22, -34, 7, 36)
    ctx.restore()
    star(ctx, 450 + Math.sin(t * 2) * 30, 215, 12, t * 3, '#fff6c0')
    confetti(ctx, t, W, H, 60, 9, ['#ff5a7a', '#ffd23f', '#5ac8ff', '#7aff9a', '#ffffff'], 90)
    twinkles(ctx, t, 14, 15, 300, 160, 340, 220, '#ffffff')
  },

  // 8. 새벽 명상: 해 뜨는 산사
  meditation(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H * 0.7, [[0, '#2a2a5a'], [0.5, '#d9708a'], [1, '#ffd89a']])
    ctx.fillRect(0, 0, W, H)
    const rise = Math.min(1, t / 6)
    glow(ctx, 400, 360 - rise * 40, 330, '255,220,150', 0.65)
    ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(400, 340 - rise * 40, 62, 0, TAU); ctx.fill()
    const ridge = (base, amp, color, seed) => {
      ctx.fillStyle = color
      ctx.beginPath(); ctx.moveTo(0, H)
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, base - Math.abs(Math.sin(x * 0.008 + seed)) * amp)
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
    }
    ridge(400, 150, '#7a4a6a', 1)
    // 탑
    ctx.fillStyle = '#4a2a4a'
    for (let i = 0; i < 4; i++) {
      const w = 90 - i * 18
      ctx.beginPath(); ctx.moveTo(150 - w / 2 - 12, 400 - i * 36); ctx.quadraticCurveTo(150, 382 - i * 36, 150 + w / 2 + 12, 400 - i * 36); ctx.lineTo(150 + w / 2, 372 - i * 36); ctx.lineTo(150 - w / 2, 372 - i * 36); ctx.fill()
    }
    ridge(450, 90, '#4a2a4a', 4)
    // 안개
    for (let i = 0; i < 4; i++) {
      const x = ((i * 260 + t * 14) % (W + 360)) - 180
      const g = ctx.createRadialGradient(x, 440 + i * 14, 10, x, 440 + i * 14, 180)
      g.addColorStop(0, 'rgba(255,240,230,0.35)'); g.addColorStop(1, 'rgba(255,240,230,0)')
      ctx.fillStyle = g; ctx.fillRect(x - 180, 380 + i * 14, 360, 120)
    }
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(0, 480, W, H - 480)
    ctx.fillStyle = '#8a7a64'
    ctx.beginPath(); ctx.ellipse(330, 546, 130, 26, 0, 0, TAU); ctx.fill()
    // 기운(오라)
    for (let i = 0; i < 3; i++) {
      const r = 100 + ((t * 40 + i * 50) % 150)
      ctx.strokeStyle = `rgba(255,240,180,${0.45 - (r - 100) / 360})`
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(330, 430, r, 0, TAU); ctx.stroke()
    }
    glow(ctx, 330, 430, 160, '255,236,170', 0.35 + Math.sin(t * 2) * 0.08)
    person(ctx, NPC.monk, 520, 540, 3.1, { facing: 'up', t, sit: true })
    person(ctx, who.look, 330, 548, 3.5, { facing: 'up', t, sit: true })
    for (let i = 0; i < 10; i++) {
      const ph = (t * 0.2 + i / 10) % 1
      ctx.save(); ctx.translate(hash(i, 3) * W + Math.sin(ph * 7 + i) * 20, ph * H); ctx.rotate(ph * 6 + i)
      ctx.fillStyle = 'rgba(255,190,210,0.85)'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.4, 0, 0, TAU); ctx.fill(); ctx.restore()
    }
    twinkles(ctx, t, 12, 17, 200, 200, 400, 260, '#fff0b0')
  },

  // 9. 달콤한 늦잠: 아침 햇살이 드는 이불 속
  sleep_in(ctx, t, W, H, who) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#ffe9c8'], [1, '#f0c8a0']])
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#c8956a'; ctx.fillRect(0, 440, W, H - 440)
    // 창문 + 빛줄기
    ctx.fillStyle = '#fffbe8'; ctx.fillRect(520, 60, 190, 220)
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 6; ctx.strokeRect(520, 60, 190, 220)
    ctx.lineWidth = 2
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(520 + i * 47.5, 60); ctx.lineTo(520 + i * 47.5, 280); ctx.stroke() }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(520, 60 + i * 44); ctx.lineTo(710, 60 + i * 44); ctx.stroke() }
    glow(ctx, 615, 170, 300, '255,240,190', 0.55)
    for (const [a, b] of [[0, 0.16], [0.3, 0.42], [0.7, 0.85]]) {
      ctx.fillStyle = 'rgba(255,245,200,0.2)'
      ctx.beginPath(); ctx.moveTo(520 + a * 190, 280); ctx.lineTo(520 + b * 190, 280); ctx.lineTo(260 + b * 190, 560); ctx.lineTo(100 + a * 190, 560); ctx.closePath(); ctx.fill()
    }
    // 침대
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(60, 360, 640, 60); ctx.fillRect(60, 300, 24, 240); ctx.fillRect(676, 340, 24, 200)
    ctx.fillStyle = '#fff6ec'; ctx.beginPath(); ctx.roundRect(92, 330, 590, 90, 28); ctx.fill()
    ctx.fillStyle = '#ffe8f0'; ctx.beginPath(); ctx.roundRect(110, 306, 150, 64, 26); ctx.fill()
    // 얼굴
    const bx = 190
    ctx.fillStyle = who.hairHex
    ctx.beginPath(); ctx.ellipse(bx - 8, 330, 62, 40, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = who.look.skin
    ctx.beginPath(); ctx.arc(bx, 334, 40, 0, TAU); ctx.fill()
    ctx.fillStyle = who.hairHex
    ctx.beginPath(); ctx.arc(bx, 330, 41, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(bx + 36, 322); ctx.quadraticCurveTo(bx, 306, bx - 38, 324); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'
    for (const dx of [-14, 14]) { ctx.beginPath(); ctx.arc(bx + dx, 336, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke() }
    ctx.fillStyle = 'rgba(255,130,140,0.4)'
    for (const dx of [-24, 24]) { ctx.beginPath(); ctx.ellipse(bx + dx, 348, 8, 5, 0, 0, TAU); ctx.fill() }
    ctx.strokeStyle = '#a85a46'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(bx, 350, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke()
    // 이불
    const br = Math.sin(t * 1.6) * 3
    ctx.fillStyle = '#ff9ab0'
    ctx.beginPath(); ctx.roundRect(150, 366 - br, 540, 80, [26, 26, 12, 12]); ctx.fill()
    ctx.fillStyle = '#ffc2d0'
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(190 + i * 58, 392 - br + (i % 2) * 18, 9, 0, TAU); ctx.fill() }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(160, 372 - br, 520, 6)
    // 고양이
    ctx.fillStyle = '#f2e6d4'
    ctx.beginPath(); ctx.ellipse(590, 362 - br, 44, 22 + Math.sin(t * 3) * 1.5, 0, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.arc(552, 358 - br, 17, 0, TAU); ctx.fill()
    ctx.beginPath(); ctx.moveTo(540, 346 - br); ctx.lineTo(544, 330 - br); ctx.lineTo(554, 343 - br); ctx.fill()
    ctx.beginPath(); ctx.moveTo(556, 343 - br); ctx.lineTo(564, 330 - br); ctx.lineTo(566, 348 - br); ctx.fill()
    ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.arc(547, 358 - br, 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke()
    ctx.beginPath(); ctx.arc(558, 358 - br, 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke()
    // zZz
    ctx.fillStyle = '#7a6a9a'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.4 + i / 3) % 1
      ctx.globalAlpha = Math.sin(ph * Math.PI)
      ctx.font = `bold ${22 + i * 8}px sans-serif`
      ctx.fillText(i === 1 ? 'Z' : 'z', 250 + ph * 70 + i * 16, 290 - ph * 130)
    }
    ctx.globalAlpha = 1
    for (let i = 0; i < 24; i++) {
      const x = (hash(i, 1) * 500 + 150 + Math.sin(t * 0.7 + i) * 18) % W
      const y = (hash(i, 2) * 440 + t * 8) % 440
      ctx.fillStyle = `rgba(255,240,190,${0.25 + hash(i, 4) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill()
    }
  },

  // 10. 새 옷: 거울 앞에서 한 바퀴
  new_clothes(ctx, t, W, H, who) {
    ctx.fillStyle = '#f2e2c8'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = grad(ctx, 0, 430, 0, H, [[0, '#c8956a'], [1, '#8a5a30']]); ctx.fillRect(0, 430, W, H - 430)
    // 한지 창
    ctx.fillStyle = '#fffbe8'; ctx.fillRect(50, 70, 140, 200)
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 5; ctx.strokeRect(50, 70, 140, 200)
    ctx.lineWidth = 2
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(50 + i * 35, 70); ctx.lineTo(50 + i * 35, 270); ctx.stroke() }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(50, 70 + i * 40); ctx.lineTo(190, 70 + i * 40); ctx.stroke() }
    // 옷감
    const cloth = ['#e8453c', '#3a78d8', '#f2b630', '#5ab878']
    cloth.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(40 + i * 24, 380 - i * 4, 22, 90 + i * 4); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(44 + i * 24, 384 - i * 4, 4, 80) })
    // 거울
    ctx.fillStyle = '#7a4e2a'; ctx.beginPath(); ctx.roundRect(560, 90, 190, 420, 14); ctx.fill()
    ctx.fillStyle = grad(ctx, 570, 100, 740, 500, [[0, '#dcecf6'], [1, '#bcd4e6']])
    ctx.beginPath(); ctx.roundRect(574, 104, 162, 392, 8); ctx.fill()
    ctx.save()
    ctx.beginPath(); ctx.roundRect(574, 104, 162, 392, 8); ctx.clip()
    const bright = { ...who.look, shirt: '#7a5ad8', jeogori: '#fff0a0', ribbon: '#ffd23f' } // 새로 지은 보랏빛 한복
    const spin = Math.sin(t * 1.4)
    const face = spin > 0.35 ? 'right' : spin < -0.35 ? 'left' : 'down'
    ctx.translate(655, 480); ctx.scale(-1, 1)
    person(ctx, bright, 0, 0, 2.5, { facing: face, t })
    ctx.restore()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath(); ctx.moveTo(588, 110); ctx.lineTo(620, 110); ctx.lineTo(590, 190); ctx.closePath(); ctx.fill()
    person(ctx, NPC.aunt, 170, 540, 3, { facing: 'right', t, pose: { type: 'wave', p: 0 } })
    person(ctx, bright, 390, 548, 3.5, { facing: face === 'left' ? 'right' : face, t })
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.6 + i / 8) % 1
      heart(ctx, 330 + hash(i, 5) * 130, 440 - ph * 200, 1 + ph * 0.5, '#ff8aaa', 1 - ph)
    }
    twinkles(ctx, t, 18, 25, 260, 220, 260, 300, '#fff0b0')
    glow(ctx, 390, 400, 240, '255,230,200', 0.3)
  },
}

export function drawCG(ctx, id, t, W, H, who) {
  const fn = SCENES[id]
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  ctx.lineCap = 'butt'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (fn) fn(ctx, t, W, H, who)
  else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H) }
  vignette(ctx, W, H)
  ctx.restore()
}
