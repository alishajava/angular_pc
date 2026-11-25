import { TILE, COLS, ROWS, W, H } from './maps.js'

export const LOOKS = {
  junior_f: { skin: '#f6d2b0', hair: '#3a2a22', hairStyle: 'bob', shirt: '#e8b0c0', pants: '#4a4a5a', shoes: '#2a2a38', eye: '#4a3a2a', outfit: 'tee' },
  peer_m: { skin: '#e8b48f', hair: '#2b2320', hairStyle: 'short', shirt: '#6a8fc0', pants: '#3a3f4f', shoes: '#2a2a2a', eye: '#3a2a22', outfit: 'tee' },
  senior_m: { skin: '#f2c79b', hair: '#4a3524', hairStyle: 'short', shirt: '#4a5a7a', jacket: '#4a5a7a', pants: '#3a3a44', shoes: '#2a2224', eye: '#3a2a22', outfit: 'suit', tie: '#e0a93f', glasses: true },
  manager_f: { skin: '#f4cba2', hair: '#2a2024', hairStyle: 'long', shirt: '#5a4a68', pants: '#3a3340', shoes: '#2a2228', eye: '#3a2a22', outfit: 'suit', tie: '#d86a8a' },
  staff_f: { skin: '#e8b48f', hair: '#5a3a28', hairStyle: 'bun', shirt: '#8aa890', pants: '#4a5048', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'tee' },
  director_m: { skin: '#dba87c', hair: '#8a8a8a', hairStyle: 'short', shirt: '#3a3f50', jacket: '#3a3f50', pants: '#2c2f3a', shoes: '#1c1c22', eye: '#3a2a22', outfit: 'suit', tie: '#2f6fb0', glasses: true },
  boss_m: { skin: '#e8b48f', hair: '#2a2a30', hairStyle: 'short', shirt: '#22262e', jacket: '#22262e', pants: '#1c1e24', shoes: '#101014', eye: '#3a2a22', outfit: 'suit', tie: '#7a1e2a' },
  hr_f: { skin: '#f4cba2', hair: '#7a4a2a', hairStyle: 'long', shirt: '#c85a5a', pants: '#3a3a44', shoes: '#2a2228', eye: '#4a3a2a', outfit: 'tee' },
  walker_a: { skin: '#e8b48f', hair: '#6b3a1c', hairStyle: 'long', shirt: '#e0a84a', pants: '#4a5a6a', shoes: '#4a3a24', eye: '#3f8f5a', outfit: 'tee' },
  walker_b: { skin: '#f2c79b', hair: '#2b2440', hairStyle: 'short', shirt: '#5a9a6a', pants: '#3a4a5a', shoes: '#2a2a2a', eye: '#3a2a22', outfit: 'tee' },
}

const hash = (a, b, k = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return v - Math.floor(v)
}
function rr(g, x, y, w, h, r, fill, stroke) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  if (fill) { g.fillStyle = fill; g.fill() }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke() }
}

export const THEMES = {
  mid: { carpet: ['#8d9db8', '#8695b0'], wall: '#d8dfec', accent: '#3f6fd1' },
  big: { carpet: ['#9a9ca4', '#93959d'], wall: '#e4e4ea', accent: '#2a3a5a' },
  startup: { carpet: ['#e9cf8a', '#e2c47a'], wall: '#fff2d0', accent: '#e0633f' },
  foreign: { carpet: ['#6f7f8f', '#68788a'], wall: '#cfd8e0', accent: '#2f9a8a' },
  public: { carpet: ['#c8b898', '#c2b290'], wall: '#efe6d0', accent: '#7a5a2a' },
}

// ---------------------------------------------------------------- ground ----
export function buildGround(key, company) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (key === 'office') groundOffice(g, THEMES[company.arch] || THEMES.mid, company.name)
  else if (key === 'street') groundStreet(g)
  else groundHome(g)
  return c
}

function groundOffice(g, th, companyName) {
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    g.fillStyle = th.carpet[(r + col) % 2]
    g.fillRect(col * TILE, r * TILE, TILE, TILE)
    if (hash(col, r) > 0.8) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(col * TILE + 6, r * TILE + 6, 8, 8) }
  }
  // 방 바닥: 상사실(원목), 회의실(회색), 탕비실(타일), 자료실(원목)
  const floor = (c0, r0, w, h, color, line) => {
    g.fillStyle = color
    g.fillRect(c0 * TILE, r0 * TILE, w * TILE, h * TILE)
    g.strokeStyle = line
    g.lineWidth = 1
    for (let x = c0 * TILE; x <= (c0 + w) * TILE; x += 32) { g.beginPath(); g.moveTo(x, r0 * TILE); g.lineTo(x, (r0 + h) * TILE); g.stroke() }
    for (let y = r0 * TILE; y <= (r0 + h) * TILE; y += 16) { g.beginPath(); g.moveTo(c0 * TILE, y); g.lineTo((c0 + w) * TILE, y); g.stroke() }
  }
  floor(18, 2, 6, 5, '#b98a5a', 'rgba(90,50,20,0.25)')
  floor(1, 2, 8, 5, '#cfd2d8', 'rgba(60,70,90,0.18)')
  floor(10, 2, 7, 4, '#e8e4da', 'rgba(60,60,60,0.15)')
  floor(1, 11, 5, 6, '#b98a5a', 'rgba(90,50,20,0.22)')
  floor(7, 15, 8, 2, '#8aa890', 'rgba(255,255,255,0.18)')
  floor(17, 14, 7, 3, '#d4cfc4', 'rgba(60,60,60,0.12)')
  // 위쪽 벽 (창문)
  g.fillStyle = th.wall
  g.fillRect(0, 0, W, 2 * TILE)
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillRect(0, 2 * TILE - 8, W, 8)
  for (let x = 40; x < W - 60; x += 96) {
    rr(g, x, 8, 64, 36, 4, '#bfe4ff', '#6a7a90')
    g.fillStyle = 'rgba(255,255,255,0.5)'
    g.fillRect(x + 4, 12, 20, 28)
    g.strokeStyle = '#6a7a90'
    g.beginPath(); g.moveTo(x + 32, 8); g.lineTo(x + 32, 44); g.stroke()
  }
  // 회사 간판 (중앙 벽)
  rr(g, W / 2 - 120, 14, 240, 30, 8, th.accent)
  g.fillStyle = '#fff'
  g.font = 'bold 18px sans-serif'
  g.textAlign = 'center'
  g.fillText(companyName, W / 2, 36)
  // 옆/아래 벽
  g.fillStyle = '#6a7690'
  g.fillRect(0, 2 * TILE, TILE, H - 2 * TILE)
  g.fillRect(W - TILE, 2 * TILE, TILE, H - 2 * TILE)
  g.fillRect(0, H - TILE, W, TILE)
  g.fillStyle = 'rgba(255,255,255,0.15)'
  g.fillRect(TILE - 3, 2 * TILE, 3, H - 3 * TILE)
  g.fillRect(W - TILE, 2 * TILE, 3, H - 3 * TILE)
  g.fillRect(0, H - TILE, W, 3)
  // 방 이름표
  g.font = 'bold 11px sans-serif'
  const tag = (x, y, t) => { g.fillStyle = 'rgba(30,40,60,0.55)'; g.fillRect(x - 28, y - 10, 56, 15); g.fillStyle = '#fff'; g.fillText(t, x, y + 1) }
  tag(5 * TILE + 16, 2 * TILE + 24, '회의실')
  tag(21 * TILE, 2 * TILE + 22, '이사실')
  tag(13 * TILE, 2 * TILE + 12, '탕비실')
  tag(3 * TILE + 16, 11 * TILE + 8, '자료실')
  tag(11 * TILE, 15 * TILE + 4, '휴게·동아리')
  tag(20 * TILE + 16, 14 * TILE + 8, '인사팀')
  // 엘리베이터 문 (아래쪽 벽)
  rr(g, 12 * TILE, H - TILE - 4, 2 * TILE, TILE + 4, 3, '#b8bcc6', '#4a5060')
  g.fillStyle = '#8a8f9a'
  g.fillRect(13 * TILE - 1, H - TILE, 2, TILE)
  g.fillStyle = '#6a7080'
  g.font = 'bold 10px sans-serif'
  g.fillText('▲ ▼', 13 * TILE, H - TILE - 8)
}

function groundStreet(g) {
  g.fillStyle = '#7fb069'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 260; i++) {
    g.fillStyle = hash(i, 1) > 0.5 ? 'rgba(60,120,50,0.25)' : 'rgba(190,240,150,0.25)'
    g.fillRect(hash(i, 2) * W, hash(i, 3) * H, 2, 5)
  }
  // 보도
  g.fillStyle = '#cfcdc6'
  g.fillRect(0, 5 * TILE, W, 2 * TILE)
  g.fillRect(0, 11 * TILE, W, 1 * TILE)
  g.strokeStyle = 'rgba(0,0,0,0.1)'
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 5 * TILE); g.lineTo(x, 7 * TILE); g.stroke(); g.beginPath(); g.moveTo(x, 11 * TILE); g.lineTo(x, 12 * TILE); g.stroke() }
  // 도로 (4차선)
  g.fillStyle = '#4a4d56'
  g.fillRect(0, 7 * TILE, W, 4 * TILE)
  g.fillStyle = 'rgba(255,255,255,0.8)'
  for (let x = 0; x < W; x += 64) g.fillRect(x + 8, 9 * TILE - 2, 36, 4)
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.fillRect(0, 7 * TILE + 2, W, 2)
  g.fillRect(0, 11 * TILE - 4, W, 2)
  // 횡단보도 (집 앞)
  g.fillStyle = 'rgba(255,255,255,0.85)'
  for (let y = 7 * TILE + 4; y < 11 * TILE - 4; y += 12) g.fillRect(6 * TILE, y, 3 * TILE, 7)
  // 공원 잔디 + 길
  g.fillStyle = '#6fa85a'
  g.fillRect(10 * TILE, 12 * TILE, 8 * TILE, 5 * TILE)
  g.fillStyle = '#d8bd86'
  g.beginPath()
  g.roundRect(13.5 * TILE, 12 * TILE, 1.2 * TILE, 5 * TILE, 8)
  g.fill()
  g.fillStyle = '#9aa0a8'
  g.fillRect(0, (ROWS - 1) * TILE, W, TILE)
  g.fillRect(0, 0, W, TILE)
  g.fillRect(0, 0, TILE, H)
  g.fillRect(W - TILE, 0, TILE, H)
}

function groundHome(g) {
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    const sh = hash(col, r, 3)
    g.fillStyle = ['#c79a62', '#c29458', '#cca06a'][Math.floor(sh * 3)]
    g.fillRect(col * TILE, r * TILE, TILE, TILE)
    g.strokeStyle = 'rgba(70,40,15,0.25)'
    g.strokeRect(col * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1)
  }
  g.fillStyle = '#ece0c8'
  g.fillRect(0, 0, W, 3 * TILE)
  g.fillStyle = '#8a5a30'
  g.fillRect(0, 3 * TILE - 8, W, 8)
  for (const x of [5 * TILE, 18 * TILE]) {
    rr(g, x, 14, 64, 44, 4, '#bfe4ff', '#5a3a1e')
    g.strokeStyle = '#5a3a1e'
    g.beginPath(); g.moveTo(x + 32, 14); g.lineTo(x + 32, 58); g.stroke()
  }
  g.fillStyle = '#7a4e28'
  g.fillRect(0, 3 * TILE, TILE, H - 3 * TILE)
  g.fillRect(W - TILE, 3 * TILE, TILE, H - 3 * TILE)
  g.fillRect(0, H - TILE, W, TILE)
  rr(g, 12 * TILE - 4, H - TILE - 4, 2 * TILE + 8, TILE + 4, 3, '#5a3a1e')
  g.fillStyle = '#8a5a30'
  g.fillRect(12 * TILE, H - TILE, 2 * TILE, TILE)
}

// ------------------------------------------------------------------ props ----
export function drawProp(ctx, p, t, env) {
  const x = p.c * TILE
  const y = p.r * TILE
  const w = p.w * TILE
  const h = p.h * TILE
  const sh = (ox, oy, rx, ry) => { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2); ctx.fill() }
  switch (p.kind) {
    case 'deskpod': {
      sh(x + w / 2 + 3, y + h + 1, w * 0.5, 6)
      rr(ctx, x + 2, y + 6, w - 4, h - 2, 4, p.mine ? '#e8c48a' : '#d8b883', '#8a6a3a')
      // 모니터
      rr(ctx, x + w / 2 - 14, y + 1, 28, 16, 3, '#2a2f3a')
      ctx.fillStyle = env.night ? '#9fe8ff' : '#7ac0ff'
      ctx.fillRect(x + w / 2 - 12, y + 3, 24, 11)
      ctx.fillStyle = '#4a4f5a'
      ctx.fillRect(x + w / 2 - 3, y + 17, 6, 3)
      // 키보드 · 머그 · 서류
      ctx.fillStyle = '#f0f0f4'
      ctx.fillRect(x + w / 2 - 10, y + 22, 20, 5)
      ctx.fillStyle = '#e0633f'
      ctx.fillRect(x + 6, y + 18, 6, 7)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + w - 16, y + 16, 9, 11)
      if (p.mine) {
        ctx.fillStyle = '#ffd24a'
        ctx.beginPath(); ctx.moveTo(x + w / 2, y - 12 + Math.sin(env.t * 4) * 2); ctx.lineTo(x + w / 2 - 6, y - 20 + Math.sin(env.t * 4) * 2); ctx.lineTo(x + w / 2 + 6, y - 20 + Math.sin(env.t * 4) * 2); ctx.closePath(); ctx.fill()
      }
      break
    }
    case 'chair':
      rr(ctx, x + 8, y + 4, 16, 16, 7, '#3a4256', '#1c2230')
      rr(ctx, x + 10, y + 2, 12, 6, 3, '#4a5470')
      break
    case 'glass':
      ctx.fillStyle = 'rgba(160,210,240,0.35)'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = 'rgba(80,130,170,0.85)'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(x + 3, y + 3, Math.min(w, 8), h - 6)
      break
    case 'bossdesk':
      sh(x + w / 2, y + h + 2, w * 0.5, 7)
      rr(ctx, x, y + 2, w, h + 4, 5, '#7a4a28', '#3a2210')
      rr(ctx, x + w / 2 - 14, y - 4, 28, 14, 3, '#2a2f3a')
      ctx.fillStyle = '#7ac0ff'
      ctx.fillRect(x + w / 2 - 12, y - 2, 24, 9)
      ctx.fillStyle = '#ffd24a'
      ctx.fillRect(x + 8, y + 12, 22, 7)
      break
    case 'plant':
      sh(x + 16, y + 28, 11, 4)
      ctx.fillStyle = '#b8603a'
      ctx.beginPath(); ctx.moveTo(x + 9, y + 18); ctx.lineTo(x + 23, y + 18); ctx.lineTo(x + 20, y + 30); ctx.lineTo(x + 12, y + 30); ctx.closePath(); ctx.fill()
      for (const [dx, dy, r, c] of [[-6, -4, 7, '#3f8a45'], [6, -5, 7, '#4a9a50'], [0, -13, 9, '#56a85a']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 16 + dx, y + 18 + dy, r, 0, Math.PI * 2); ctx.fill()
      }
      break
    case 'shelf': {
      const cols = ['#c9606e', '#5f86b8', '#e0b84a', '#6aa86a', '#9a6ab8', '#d98a4a']
      rr(ctx, x + 1, y, w - 2, h - 2, 3, '#6a4424')
      rr(ctx, x + 4, y + 3, w - 8, h - 8, 2, '#3a2410')
      let k = 0
      for (let yy = y + 4; yy < y + h - 14; yy += 18) {
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x + 4, yy + 15, w - 8, 3)
        for (let bx = x + 7; bx < x + w - 10; bx += 7) { ctx.fillStyle = cols[(k++) % 6]; ctx.fillRect(bx, yy + 3 + (k % 3), 5, 12 - (k % 3)) }
      }
      break
    }
    case 'meetingtable':
      sh(x + w / 2, y + h + 3, w * 0.5, 8)
      for (let i = 0; i < 4; i++) { rr(ctx, x + 8 + i * 28, y - 10, 18, 14, 5, '#3a4256'); rr(ctx, x + 8 + i * 28, y + h - 2, 18, 14, 5, '#3a4256') }
      rr(ctx, x, y, w, h, 8, '#9a6a3a', '#4a2a10')
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(x + 6, y + 5, w - 12, 5)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 18, y + 22, 14, 10); ctx.fillRect(x + w - 40, y + 22, 14, 10)
      break
    case 'whiteboard':
      rr(ctx, x, y + 4, w, 24, 3, '#fff', '#8a90a0')
      ctx.strokeStyle = '#3f6fd1'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x + 8, y + 22); ctx.lineTo(x + 24, y + 12); ctx.lineTo(x + 40, y + 18); ctx.lineTo(x + 64, y + 8); ctx.stroke()
      break
    case 'counter':
      rr(ctx, x, y + 4, w, h + 6, 4, '#c8ccd4', '#6a7080')
      ctx.fillStyle = '#4a5060'
      ctx.fillRect(x + 12, y - 6, 18, 14)
      ctx.fillStyle = '#e0633f'
      ctx.fillRect(x + 16, y + 2, 4, 4)
      rr(ctx, x + w - 34, y + 8, 22, 12, 4, '#9aa6b4')
      ctx.fillStyle = '#bfe0ff'
      ctx.fillRect(x + 62, y - 8, 12, 18)
      break
    case 'copier':
      sh(x + w / 2, y + h + 2, w * 0.5, 6)
      rr(ctx, x + 2, y - 4, w - 4, h + 6, 4, '#d8dce6', '#6a7080')
      rr(ctx, x + 8, y - 8, w - 16, 8, 3, '#8a90a0')
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 10, y + 4, w - 20, 5)
      break
    case 'readtable':
      sh(x + w / 2, y + h + 2, w * 0.5, 6)
      rr(ctx, x, y + 4, w, h, 5, '#9a6a3a', '#4a2a10')
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 8, y + 10, 16, 12); ctx.fillStyle = '#5f86b8'; ctx.fillRect(x + 36, y + 10, 14, 12)
      break
    case 'sofa':
      sh(x + w / 2, y + h + 1, w * 0.5, 6)
      rr(ctx, x, y - 6, w, h + 6, 8, '#d8707e', '#7a3040')
      rr(ctx, x + 4, y + 2, w - 8, h - 8, 5, '#e88a96')
      break
    case 'pingpong':
      sh(x + w / 2, y + h + 3, w * 0.5, 8)
      rr(ctx, x + 2, y + 4, w - 4, h - 8, 4, '#2f8a6a', '#1a4a3a')
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + 6, y + h / 2); ctx.lineTo(x + w - 6, y + h / 2); ctx.stroke()
      break
    case 'hrdesk':
      sh(x + w / 2, y + h + 2, w * 0.5, 6)
      rr(ctx, x, y, w, h + 4, 4, '#cfd2d8', '#6a7080')
      for (const dx of [14, w - 40]) { rr(ctx, x + dx, y - 6, 26, 14, 3, '#2a2f3a'); ctx.fillStyle = '#7ac0ff'; ctx.fillRect(x + dx + 2, y - 4, 22, 9) }
      break
    case 'elevator': break
    case 'bed':
      sh(x + w / 2, y + h + 2, w * 0.5, 8)
      rr(ctx, x, y, w, h, 8, '#6a4424', '#3a2210')
      rr(ctx, x + 5, y + 5, w - 10, h - 10, 6, '#f4ead4')
      rr(ctx, x + 10, y + 10, w - 20, 22, 8, '#fffaf0')
      rr(ctx, x + 5, y + 40, w - 10, h - 45, [0, 0, 6, 6], '#5f86b8')
      break
    case 'homepc':
      rr(ctx, x, y + 2, w, h + 6, 4, '#9a6a3a', '#4a2a10')
      rr(ctx, x + w / 2 - 16, y - 8, 32, 18, 3, '#2a2f3a')
      ctx.fillStyle = '#7ac0ff'; ctx.fillRect(x + w / 2 - 14, y - 6, 28, 13)
      break
    case 'kitchen':
      rr(ctx, x, y, w, h + 6, 4, '#e0e2e8', '#8a90a0')
      ctx.fillStyle = '#4a5060'
      for (const dx of [16, 44, 72]) ctx.fillRect(x + dx, y + 6, 18, 14)
      rr(ctx, x + w - 44, y + 4, 34, 16, 4, '#9aa6b4')
      break
    case 'tvsofa':
      sh(x + w / 2, y + h + 2, w * 0.5, 8)
      rr(ctx, x, y + 28, w, h - 28, 10, '#5a6a8a', '#2a3248')
      rr(ctx, x + 8, y + 36, w - 16, h - 48, 8, '#7a8aaa')
      rr(ctx, x + w / 2 - 36, y - 24, 72, 28, 3, '#1a1c24')
      ctx.fillStyle = '#4a6a9a'; ctx.fillRect(x + w / 2 - 33, y - 21, 66, 22)
      break
    case 'rug':
      ctx.globalAlpha = 0.9
      rr(ctx, x, y, w, h, 14, '#7a9ac0', '#e8dcb8')
      ctx.globalAlpha = 1
      break
    case 'homedoor': break
    case 'shop': {
      const south = !!p.south
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(x + 4, y + h - 2, w, 6)
      rr(ctx, x, y, w, h, 6, '#ece6d8', '#5a4a3a')
      // 지붕/차양 + 간판
      rr(ctx, x, south ? y : y, w, 22, [6, 6, 0, 0], p.color)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${p.icon} ${p.label}`, x + w / 2, y + 16)
      // 창문과 문
      const wy = south ? y + 36 : y + 34
      for (let i = 0; i < Math.max(1, Math.floor(p.w / 2)); i++) {
        const wx = x + 14 + i * ((w - 28) / Math.max(1, Math.floor(p.w / 2)))
        rr(ctx, wx, wy, 34, 26, 3, '#bfe4ff', '#5a4a3a')
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(wx + 3, wy + 3, 10, 20)
      }
      const dx = x + w / 2 - 14
      const dy = south ? y + 22 : y + h - 38
      rr(ctx, dx, dy, 28, 38, [14, 14, 0, 0], '#5a3a1e')
      rr(ctx, dx + 3, dy + 3, 22, 35, [11, 11, 0, 0], env.night ? '#ffd98a' : '#8a5a30')
      break
    }
    case 'tree':
      sh(x + 19, y + 28, 16, 6)
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x + 13, y + 6, 6, 22)
      for (const [dx, dy, r, c] of [[-9, 2, 12, '#2f7a3d'], [9, 0, 12, '#2f7a3d'], [0, -8, 15, '#3f9a4d'], [-3, -12, 8, '#56b05a']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 16 + dx, y + 8 + dy, r, 0, Math.PI * 2); ctx.fill() }
      break
    case 'bench':
      rr(ctx, x + 2, y + 8, w - 4, 10, 3, '#8a5a30', '#4a2a10')
      ctx.fillStyle = '#6a4424'; ctx.fillRect(x + 6, y + 18, 4, 8); ctx.fillRect(x + w - 10, y + 18, 4, 8)
      break
    case 'pond':
      ctx.fillStyle = '#7a8a6a'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 + 6, h / 2 + 6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#4a9ad0'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.ellipse(x + w / 2 - 14 + Math.sin(env.t) * 4, y + h / 2, 10, 4, 0, 0, Math.PI * 2); ctx.stroke()
      break
    case 'lamp':
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(x + 14, y - 22, 4, 48)
      ctx.fillStyle = env.night ? '#ffe9a0' : '#cfcab0'; ctx.beginPath(); ctx.arc(x + 16, y - 24, 6, 0, Math.PI * 2); ctx.fill()
      if (env.night) { const gr = ctx.createRadialGradient(x + 16, y - 24, 2, x + 16, y - 24, 52); gr.addColorStop(0, 'rgba(255,226,150,0.45)'); gr.addColorStop(1, 'rgba(255,226,150,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 40, y - 76, 112, 112) }
      break
    default: break
  }
}
