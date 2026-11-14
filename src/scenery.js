// Hand-painted (procedural) backdrops for the town, the dungeon and the
// tavern. Each make*Backdrop() paints the static scenery once into an
// offscreen canvas - the scenes then blit that every frame and call the
// matching draw*Life() for the few things that move (water, smoke, flames,
// lamp glow), so the richer art costs almost nothing per frame.

// Deterministic "random" from tile coordinates, so scenery never reshuffles.
function rnd(a, b, k = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function ell(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

// A round leafy tree; (x, y) is where the trunk meets the ground.
function drawTree(ctx, x, y, s = 1, seed = 0) {
  ell(ctx, x, y + 2 * s, 17 * s, 6 * s, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = '#6b4a2a'
  ctx.fillRect(x - 4 * s, y - 16 * s, 8 * s, 18 * s)
  ctx.fillStyle = '#573a20'
  ctx.fillRect(x + 1 * s, y - 16 * s, 3 * s, 18 * s)
  const dark = seed % 2 ? '#2c6b34' : '#2f7438'
  const mid = seed % 2 ? '#3a8a42' : '#3f9448'
  ell(ctx, x - 9 * s, y - 22 * s, 13 * s, 12 * s, dark)
  ell(ctx, x + 10 * s, y - 23 * s, 13 * s, 12 * s, dark)
  ell(ctx, x, y - 32 * s, 15 * s, 14 * s, dark)
  ell(ctx, x - 6 * s, y - 27 * s, 10 * s, 9 * s, mid)
  ell(ctx, x + 6 * s, y - 33 * s, 9 * s, 8 * s, mid)
  ell(ctx, x - 3 * s, y - 37 * s, 5 * s, 4 * s, 'rgba(190,235,150,0.55)')
}

function drawFlower(ctx, x, y, color) {
  ctx.fillStyle = '#2f6b34'
  ctx.fillRect(x - 0.5, y, 1, 4)
  ctx.fillStyle = color
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
    ctx.beginPath()
    ctx.arc(x + dx, y + dy, 1.7, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffe066'
  ctx.beginPath()
  ctx.arc(x, y, 1.2, 0, Math.PI * 2)
  ctx.fill()
}

// ---------------------------------------------------------------- town ----

// A front-facing cottage: tiled roof on top, timbered wall, door, windows.
function drawHouse(ctx, x, y, w, h, { wall, wallShade, roof, roofShade, doorX, timber = true, stone = false }) {
  const roofH = h * 0.46
  const wallY = y + roofH - 4
  const bottom = y + h

  // wall
  ctx.fillStyle = wall
  ctx.fillRect(x + 6, wallY, w - 12, bottom - wallY)
  ctx.fillStyle = wallShade
  ctx.fillRect(x + 6, bottom - 7, w - 12, 7)
  if (stone) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 1
    for (let ry = wallY + 9; ry < bottom - 6; ry += 9) {
      ctx.beginPath()
      ctx.moveTo(x + 6, ry)
      ctx.lineTo(x + w - 6, ry)
      ctx.stroke()
      for (let rx = x + 12 + (((ry - wallY) / 9) % 2) * 9; rx < x + w - 8; rx += 18) {
        ctx.beginPath()
        ctx.moveTo(rx, ry - 9)
        ctx.lineTo(rx, ry)
        ctx.stroke()
      }
    }
  }
  if (timber) {
    ctx.fillStyle = '#5a3e24'
    ctx.fillRect(x + 6, wallY, 4, bottom - wallY)
    ctx.fillRect(x + w - 10, wallY, 4, bottom - wallY)
    ctx.fillRect(x + 6, wallY + 2, w - 12, 3)
  }

  // roof (trapezoid with shingle rows)
  ctx.fillStyle = roof
  ctx.beginPath()
  ctx.moveTo(x - 4, y + roofH)
  ctx.lineTo(x + 14, y)
  ctx.lineTo(x + w - 14, y)
  ctx.lineTo(x + w + 4, y + roofH)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = roofShade
  ctx.lineWidth = 1.5
  for (let i = 1; i < 5; i++) {
    const ry = y + (roofH * i) / 5
    const inset = 14 - (18 * i) / 5
    ctx.beginPath()
    ctx.moveTo(x + inset, ry)
    ctx.lineTo(x + w - inset, ry)
    ctx.stroke()
  }
  ctx.fillStyle = roofShade
  ctx.fillRect(x - 4, y + roofH - 3, w + 8, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(x + 14, y, w - 28, 2)

  // door
  if (doorX !== undefined) {
    ctx.fillStyle = '#4a2f1a'
    ctx.beginPath()
    ctx.roundRect(doorX - 11, bottom - 34, 22, 34, [10, 10, 0, 0])
    ctx.fill()
    ctx.fillStyle = '#7a4f2a'
    ctx.beginPath()
    ctx.roundRect(doorX - 8, bottom - 31, 16, 31, [8, 8, 0, 0])
    ctx.fill()
    ctx.fillStyle = '#ffd24a'
    ctx.beginPath()
    ctx.arc(doorX + 4, bottom - 15, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWindow(ctx, x, y, w = 16, h = 16, lit = '#ffe9a0') {
  ctx.fillStyle = '#4a2f1a'
  ctx.fillRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4)
  ctx.fillStyle = lit
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.fillStyle = '#4a2f1a'
  ctx.fillRect(x - 1, y - h / 2, 2, h)
  ctx.fillRect(x - w / 2, y - 1, w, 2)
}

function drawSign(ctx, x, y, icon) {
  ctx.fillStyle = '#4a2f1a'
  ctx.fillRect(x - 1, y - 12, 2, 6)
  ctx.fillStyle = '#e8d3a0'
  ctx.beginPath()
  ctx.roundRect(x - 12, y - 7, 24, 16, 3)
  ctx.fill()
  ctx.strokeStyle = '#4a2f1a'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (icon === 'anvil') {
    ctx.fillStyle = '#4a4a55'
    ctx.fillRect(x - 7, y - 3, 14, 4)
    ctx.fillRect(x - 3, y + 1, 6, 3)
    ctx.fillRect(x - 6, y + 4, 12, 2)
    ctx.beginPath()
    ctx.moveTo(x + 7, y - 3)
    ctx.lineTo(x + 11, y - 2)
    ctx.lineTo(x + 7, y + 1)
    ctx.fill()
  } else if (icon === 'leaf') {
    ctx.fillStyle = '#3f9448'
    ctx.beginPath()
    ctx.ellipse(x, y + 1, 7, 4, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1f5a2a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - 6, y + 4)
    ctx.lineTo(x + 6, y - 2)
    ctx.stroke()
  } else {
    // mug
    ctx.fillStyle = '#d9a52a'
    ctx.fillRect(x - 5, y - 3, 9, 10)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 5, y - 4, 9, 3)
    ctx.strokeStyle = '#d9a52a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x + 5, y + 2, 3, -Math.PI / 2, Math.PI / 2)
    ctx.stroke()
  }
}

function drawBarrel(ctx, x, y) {
  ell(ctx, x, y + 1, 9, 3, 'rgba(0,0,0,0.25)')
  ctx.fillStyle = '#8a5a2e'
  ctx.beginPath()
  ctx.roundRect(x - 8, y - 18, 16, 19, 4)
  ctx.fill()
  ctx.fillStyle = '#5a5a66'
  ctx.fillRect(x - 8, y - 14, 16, 2)
  ctx.fillRect(x - 8, y - 5, 16, 2)
  ell(ctx, x, y - 18, 8, 2.5, '#a06a38')
}

function drawLampPost(ctx, x, y) {
  ell(ctx, x, y + 1, 6, 2, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = '#2b2b33'
  ctx.fillRect(x - 1.5, y - 30, 3, 31)
  ctx.fillRect(x - 5, y - 1, 10, 3)
  ctx.fillStyle = '#2b2b33'
  ctx.beginPath()
  ctx.roundRect(x - 5, y - 40, 10, 11, 2)
  ctx.fill()
  ctx.fillStyle = '#ffe9a0'
  ctx.fillRect(x - 3, y - 38, 6, 7)
}

export function makeTownBackdrop({ grid, cols, rows, tile: T, scenery }) {
  const canvas = makeCanvas(cols * T, rows * T)
  const ctx = canvas.getContext('2d')
  const pathSet = new Set(scenery.paths.map(([c, r]) => `${c},${r}`))
  const isPath = (c, r) => pathSet.has(`${c},${r}`)
  const isBorder = (c, r) => r === 0 || r === rows - 1 || c === 0 || c === cols - 1

  // 1) grass with tonal patches and little tufts
  const greens = ['#4f8f47', '#559649', '#4b8a44', '#52924a']
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = isBorder(c, r) ? '#356b34' : greens[Math.floor(rnd(c, r) * greens.length)]
      ctx.fillRect(c * T, r * T, T, T)
      for (let i = 0; i < 5; i++) {
        const gx = c * T + rnd(c, r, i + 1) * T
        const gy = r * T + rnd(c, r, i + 9) * T
        ctx.strokeStyle = i % 2 ? 'rgba(30,80,35,0.5)' : 'rgba(150,210,120,0.45)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(gx - 2, gy)
        ctx.lineTo(gx - 1, gy - 4)
        ctx.moveTo(gx + 1, gy)
        ctx.lineTo(gx + 2, gy - 4)
        ctx.stroke()
      }
    }
  }

  // 2) dirt paths: rounded where a corner has no neighbouring path tile
  const corner = (c, r, dc, dr) => (!isPath(c + dc, r) && !isPath(c, r + dr) ? 16 : 0)
  for (const pass of [0, 1]) {
    for (const [c, r] of scenery.paths) {
      const radii = [corner(c, r, -1, -1), corner(c, r, 1, -1), corner(c, r, 1, 1), corner(c, r, -1, 1)]
      ctx.fillStyle = pass === 0 ? '#9a7a4a' : '#cdaa72'
      const inset = pass === 0 ? 1 : 4
      // tiles that continue into a neighbour extend past the inset so the road stays unbroken
      const x0 = c * T + (isPath(c - 1, r) ? -1 : inset)
      const y0 = r * T + (isPath(c, r - 1) ? -1 : inset)
      const x1 = c * T + T - (isPath(c + 1, r) ? -1 : inset)
      const y1 = r * T + T - (isPath(c, r + 1) ? -1 : inset)
      ctx.beginPath()
      ctx.roundRect(x0, y0, x1 - x0, y1 - y0, radii)
      ctx.fill()
    }
  }
  for (const [c, r] of scenery.paths) {
    for (let i = 0; i < 4; i++) {
      const px = c * T + 8 + rnd(c, r, i + 20) * (T - 16)
      const py = r * T + 8 + rnd(c, r, i + 30) * (T - 16)
      ell(ctx, px, py, 2.4, 1.6, i % 2 ? 'rgba(120,95,60,0.6)' : 'rgba(235,215,170,0.7)')
    }
  }

  // 3) wildflowers on open grass
  const petals = ['#ffffff', '#ffd6e8', '#fff3a0', '#d8c8ff', '#ff9aa8']
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (isPath(c, r) || grid[r][c] === 1 || rnd(c, r, 40) > 0.42) continue
      const n = 2 + Math.floor(rnd(c, r, 41) * 3)
      for (let i = 0; i < n; i++) {
        drawFlower(ctx, c * T + 8 + rnd(c, r, 50 + i) * (T - 16), r * T + 10 + rnd(c, r, 60 + i) * (T - 20), petals[Math.floor(rnd(c, r, 70 + i) * petals.length)])
      }
    }
  }

  // 4) pond
  const p = scenery.pond
  const px = p.col * T + 3
  const py = p.row * T + 3
  const pw = p.w * T - 6
  const ph = p.h * T - 6
  ctx.fillStyle = '#d9c68a'
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, 34)
  ctx.fill()
  const water = ctx.createLinearGradient(0, py, 0, py + ph)
  water.addColorStop(0, '#5ab4e0')
  water.addColorStop(1, '#2f7fb8')
  ctx.fillStyle = water
  ctx.beginPath()
  ctx.roundRect(px + 7, py + 7, pw - 14, ph - 14, 28)
  ctx.fill()
  for (const [lx, ly, lr] of [[0.3, 0.35, 8], [0.68, 0.62, 7], [0.42, 0.72, 5]]) {
    const x = px + pw * lx
    const y = py + ph * ly
    ctx.fillStyle = '#3f9448'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.arc(x, y, lr, 0.4, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
  }
  ell(ctx, px + pw * 0.68, py + ph * 0.62, 2.6, 2.6, '#ff9aa8')
  for (const [rx, ry] of [[0.12, 0.2], [0.17, 0.28], [0.86, 0.78]]) {
    const x = px + pw * rx
    const y = py + ph * ry
    ctx.fillStyle = '#3a7a3a'
    ctx.fillRect(x - 0.8, y - 14, 1.6, 16)
    ctx.fillStyle = '#6b4a2a'
    ctx.beginPath()
    ctx.roundRect(x - 2, y - 20, 4, 9, 2)
    ctx.fill()
  }
  ell(ctx, px + pw * 0.9, py + ph * 0.18, 6, 4, '#9a9aa6')
  ell(ctx, px + pw * 0.83, py + ph * 0.12, 4, 3, '#b4b4be')

  // 5) forest border: top row first so nearer rows overlap farther ones
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isBorder(c, r)) continue
      const s = 1.05 + rnd(c, r, 3) * 0.3
      drawTree(ctx, c * T + T / 2 + (rnd(c, r, 4) - 0.5) * 12, r * T + T * 0.86, s, Math.floor(rnd(c, r, 5) * 4))
    }
  }

  // 6) buildings
  const sm = scenery.smithy
  const smx = sm.col * T
  const smy = sm.row * T - 36
  // chimney behind the roof
  ctx.fillStyle = '#6b6b75'
  ctx.fillRect(smx + sm.w * T - 44, smy - 12, 16, 30)
  ctx.fillStyle = '#4a4a55'
  ctx.fillRect(smx + sm.w * T - 47, smy - 15, 22, 6)
  drawHouse(ctx, smx, smy, sm.w * T, T + 36, { wall: '#9a958e', wallShade: '#7d7872', roof: '#8a3f30', roofShade: '#6b2d22', doorX: smx + sm.w * T * 0.5, timber: false, stone: true })
  drawWindow(ctx, smx + 34, smy + 62, 16, 14, '#ff9a3c') // forge glow
  drawWindow(ctx, smx + sm.w * T - 34, smy + 62)
  drawSign(ctx, smx + sm.w * T * 0.5, smy + 44, 'anvil')
  drawBarrel(ctx, smx + sm.w * T - 12, sm.row * T + T - 2)

  const hb = scenery.herbShop
  const hbx = hb.col * T
  const hby = hb.row * T - 36
  drawHouse(ctx, hbx, hby, hb.w * T, T + 36, { wall: '#efe3c6', wallShade: '#d4c6a2', roof: '#3f8a52', roofShade: '#2c6b3c', doorX: hbx + hb.w * T * 0.5 })
  drawWindow(ctx, hbx + 34, hby + 62)
  drawWindow(ctx, hbx + hb.w * T - 34, hby + 62)
  drawSign(ctx, hbx + hb.w * T * 0.5, hby + 44, 'leaf')
  for (const wx of [hbx + 34, hbx + hb.w * T - 34]) {
    ctx.fillStyle = '#7a4f2a'
    ctx.fillRect(wx - 11, hby + 72, 22, 5)
    for (const [dx, col] of [[-6, '#ff9aa8'], [0, '#fff3a0'], [6, '#d8c8ff']]) ell(ctx, wx + dx, hby + 70, 3, 3, col)
  }

  const tv = scenery.tavern
  const tvx = tv.col * T
  const tvy = tv.row * T - 14
  const doorX = tv.doorCol * T + T / 2
  drawHouse(ctx, tvx, tvy, tv.w * T, tv.h * T + 14, { wall: '#e0bd8a', wallShade: '#c29c68', roof: '#a8562e', roofShade: '#7d3d1e', doorX })
  drawWindow(ctx, tvx + 30, tvy + 84, 18, 18)
  drawWindow(ctx, tvx + tv.w * T - 30, tvy + 84, 18, 18)
  drawSign(ctx, doorX, tvy + 62, 'mug')
  drawBarrel(ctx, tvx + 14, tvy + tv.h * T + 12)
  // doormat on the walkable door tile
  ctx.fillStyle = '#8a3f30'
  ctx.beginPath()
  ctx.roundRect(doorX - 14, tv.doorRow * T + T - 8, 28, 7, 2)
  ctx.fill()

  // 7) free-standing trees, lamp posts
  for (const [c, r] of scenery.trees) drawTree(ctx, c * T + T / 2, r * T + T * 0.86, 1.15, c + r)
  for (const [lc, lr] of scenery.lamps) drawLampPost(ctx, lc * T, lr * T)

  return canvas
}

// The moving bits of the town, drawn over the backdrop each frame.
export function drawTownLife(ctx, t, { tile: T, scenery }) {
  // pond shimmer
  const p = scenery.pond
  const cx = (p.col + p.w / 2) * T
  const cy = (p.row + p.h / 2) * T
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.6 + i * 0.33) % 1
    ctx.globalAlpha = (1 - ph) * 0.6
    ctx.beginPath()
    ctx.ellipse(cx - 12 + i * 14, cy - 8 + i * 9, 6 + ph * 14, 2 + ph * 4, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // smithy chimney smoke
  const sm = scenery.smithy
  const sx = sm.col * T + sm.w * T - 36
  const sy = sm.row * T - 50
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.35 + i * 0.25) % 1
    ctx.fillStyle = `rgba(230,230,235,${(1 - ph) * 0.45})`
    ctx.beginPath()
    ctx.arc(sx + Math.sin(t + i * 2) * 4 + ph * 10, sy - ph * 34, 4 + ph * 7, 0, Math.PI * 2)
    ctx.fill()
  }

  // lamp glow
  for (const [lc, lr] of scenery.lamps) {
    const x = lc * T
    const y = lr * T - 34
    const g = ctx.createRadialGradient(x, y, 1, x, y, 26)
    g.addColorStop(0, `rgba(255,233,160,${0.4 + Math.sin(t * 3 + lc) * 0.06})`)
    g.addColorStop(1, 'rgba(255,233,160,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 26, y - 26, 52, 52)
  }

  // two butterflies wandering over the flowers
  for (const [bx, by, col, k] of [[5.5 * T, 7.8 * T, '#ffd6e8', 0], [11.5 * T, 4.2 * T, '#fff3a0', 2.1]]) {
    const x = bx + Math.sin(t * 0.7 + k) * 46 + Math.sin(t * 2.3 + k) * 8
    const y = by + Math.cos(t * 0.9 + k) * 22
    const flap = Math.abs(Math.sin(t * 14 + k)) * 4 + 1
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.ellipse(x - flap / 2, y, flap / 2, 3, 0, 0, Math.PI * 2)
    ctx.ellipse(x + flap / 2, y, flap / 2, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// -------------------------------------------------------------- dungeon ----

export function makeDungeonBackdrop({ grid, cols, rows, tile: T }) {
  const canvas = makeCanvas(cols * T, rows * T)
  const ctx = canvas.getContext('2d')
  const wall = (c, r) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] === 1
  const torches = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * T
      const y = r * T
      if (!wall(c, r)) {
        // flagstone floor: four slabs per tile with slight tone shifts
        const base = ['#4b4563', '#474160', '#4f4968', '#45405c'][Math.floor(rnd(c, r) * 4)]
        ctx.fillStyle = base
        ctx.fillRect(x, y, T, T)
        const ox = 20 + Math.floor(rnd(c, r, 1) * 12)
        const oy = 20 + Math.floor(rnd(c, r, 2) * 12)
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        ctx.fillRect(x + 1, y + 1, ox - 2, oy - 2)
        ctx.fillRect(x + ox + 1, y + oy + 1, T - ox - 2, T - oy - 2)
        ctx.strokeStyle = 'rgba(20,16,32,0.75)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)
        ctx.beginPath()
        ctx.moveTo(x + ox, y)
        ctx.lineTo(x + ox, y + T)
        ctx.moveTo(x, y + oy)
        ctx.lineTo(x + T, y + oy)
        ctx.stroke()
        // details: cracks, moss, pebbles, the odd bone
        const d = rnd(c, r, 5)
        if (d < 0.22) {
          ctx.strokeStyle = 'rgba(15,12,25,0.8)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x + 8 + rnd(c, r, 6) * 20, y + 6)
          ctx.lineTo(x + 18 + rnd(c, r, 7) * 14, y + 22)
          ctx.lineTo(x + 12 + rnd(c, r, 8) * 20, y + 38)
          ctx.stroke()
        } else if (d < 0.36) {
          ell(ctx, x + 12 + rnd(c, r, 6) * 26, y + 12 + rnd(c, r, 7) * 26, 7, 4, 'rgba(70,120,70,0.45)')
          ell(ctx, x + 16 + rnd(c, r, 8) * 22, y + 16 + rnd(c, r, 9) * 22, 4, 3, 'rgba(90,150,90,0.4)')
        } else if (d < 0.42) {
          const bx = x + 14 + rnd(c, r, 6) * 20
          const by = y + 16 + rnd(c, r, 7) * 20
          ctx.strokeStyle = '#d8d2c0'
          ctx.lineWidth = 2.4
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(bx - 6, by - 3)
          ctx.lineTo(bx + 6, by + 3)
          ctx.stroke()
          ctx.lineCap = 'butt'
          ell(ctx, bx - 7, by - 4, 2, 2, '#d8d2c0')
          ell(ctx, bx + 7, by + 4, 2, 2, '#d8d2c0')
        } else if (d < 0.5) {
          ell(ctx, x + 14 + rnd(c, r, 6) * 24, y + 14 + rnd(c, r, 7) * 24, 2.5, 2, '#2e2940')
          ell(ctx, x + 10 + rnd(c, r, 8) * 30, y + 10 + rnd(c, r, 9) * 30, 1.8, 1.5, '#5d5778')
        }
        // shadow cast by a wall directly above
        if (wall(c, r - 1)) {
          const sh = ctx.createLinearGradient(0, y, 0, y + 16)
          sh.addColorStop(0, 'rgba(0,0,0,0.45)')
          sh.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = sh
          ctx.fillRect(x, y, T, 16)
        }
      } else {
        // wall: dark top, with a lit brick face where it meets floor below
        ctx.fillStyle = '#211c30'
        ctx.fillRect(x, y, T, T)
        ctx.fillStyle = 'rgba(255,255,255,0.03)'
        ctx.fillRect(x + 3, y + 3, T - 6, T - 6)
        if (!wall(c, r + 1)) {
          const fy = y + T * 0.42
          ctx.fillStyle = '#3a3350'
          ctx.fillRect(x, fy, T, T - T * 0.42)
          ctx.strokeStyle = 'rgba(15,12,25,0.85)'
          ctx.lineWidth = 1.2
          for (let i = 0; i < 3; i++) {
            const by = fy + i * 10
            ctx.beginPath()
            ctx.moveTo(x, by)
            ctx.lineTo(x + T, by)
            ctx.stroke()
            for (let bx = x + (i % 2 ? 13 : 0); bx <= x + T; bx += 26) {
              ctx.beginPath()
              ctx.moveTo(bx, by)
              ctx.lineTo(bx, by + 10)
              ctx.stroke()
            }
          }
          ctx.fillStyle = '#5a5278'
          ctx.fillRect(x, fy - 3, T, 3)
          if (rnd(c, r, 11) < 0.3) torches.push({ x: x + T / 2, y: fy + 10 })
          else if (rnd(c, r, 12) < 0.25) {
            // hanging moss
            ctx.fillStyle = 'rgba(80,140,80,0.6)'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 11, fy, 4, 6 + rnd(c, r, 13 + i) * 12)
          }
        }
      }
    }
  }

  // torch brackets (flames are animated in drawDungeonLife)
  for (const t of torches) {
    ctx.fillStyle = '#2b2b33'
    ctx.fillRect(t.x - 2, t.y - 2, 4, 12)
    ctx.fillStyle = '#6b4a2a'
    ctx.fillRect(t.x - 3, t.y - 6, 6, 6)
  }

  return { canvas, torches }
}

// Flickering torch flames + their warm pools of light (world coordinates).
export function drawDungeonLife(ctx, t, torches) {
  for (const [i, tc] of torches.entries()) {
    const f = 1 + Math.sin(t * 11 + i * 1.7) * 0.14 + Math.sin(t * 23 + i) * 0.06
    const g = ctx.createRadialGradient(tc.x, tc.y + 6, 2, tc.x, tc.y + 6, 70 * f)
    g.addColorStop(0, 'rgba(255,170,70,0.34)')
    g.addColorStop(1, 'rgba(255,170,70,0)')
    ctx.fillStyle = g
    ctx.fillRect(tc.x - 80, tc.y - 74, 160, 160)
    ctx.fillStyle = '#ff9a3c'
    ctx.beginPath()
    ctx.moveTo(tc.x - 5, tc.y - 5)
    ctx.quadraticCurveTo(tc.x - 6, tc.y - 14, tc.x + Math.sin(t * 9 + i) * 2, tc.y - 5 - 13 * f)
    ctx.quadraticCurveTo(tc.x + 6, tc.y - 14, tc.x + 5, tc.y - 5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.ellipse(tc.x, tc.y - 8, 2.2, 4.5 * f, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Darkness closing in around the party (screen coordinates).
export function drawDungeonDarkness(ctx, px, py, w, h) {
  const g = ctx.createRadialGradient(px, py, 70, px, py, 330)
  g.addColorStop(0, 'rgba(8,6,16,0)')
  g.addColorStop(1, 'rgba(8,6,16,0.5)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

// Backdrop for the turn-based battle screen: a torch-lit chamber with a
// brick back wall and a flagstone floor receding toward it.
export function drawBattleBackdrop(ctx, w, h, t) {
  const horizon = h * 0.42
  ctx.fillStyle = '#231d36'
  ctx.fillRect(0, 0, w, horizon)
  ctx.strokeStyle = 'rgba(10,8,20,0.8)'
  ctx.lineWidth = 1.5
  for (let i = 0; i * 22 < horizon; i++) {
    const y = i * 22
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    for (let x = i % 2 ? 26 : 0; x <= w; x += 52) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + 22)
      ctx.stroke()
    }
  }
  // archway behind the monster
  ctx.fillStyle = '#120e20'
  ctx.beginPath()
  ctx.roundRect(w / 2 - 80, horizon - 150, 160, 150, [80, 80, 0, 0])
  ctx.fill()
  ctx.strokeStyle = '#4a4266'
  ctx.lineWidth = 6
  ctx.stroke()

  // floor
  const floor = ctx.createLinearGradient(0, horizon, 0, h)
  floor.addColorStop(0, '#3a3352')
  floor.addColorStop(1, '#575075')
  ctx.fillStyle = floor
  ctx.fillRect(0, horizon, w, h - horizon)
  ctx.strokeStyle = 'rgba(15,12,28,0.6)'
  ctx.lineWidth = 1.5
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath()
    ctx.moveTo(w / 2 + i * 34, horizon)
    ctx.lineTo(w / 2 + i * 130, h)
    ctx.stroke()
  }
  for (const k of [0.08, 0.22, 0.42, 0.7]) {
    const y = horizon + (h - horizon) * k
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.fillStyle = '#5a5278'
  ctx.fillRect(0, horizon - 4, w, 5)

  // wall torches
  for (const [i, tx] of [w * 0.2, w * 0.8].entries()) {
    const ty = horizon - 70
    const f = 1 + Math.sin(t * 11 + i * 2) * 0.14 + Math.sin(t * 23 + i) * 0.06
    const g = ctx.createRadialGradient(tx, ty, 3, tx, ty, 130 * f)
    g.addColorStop(0, 'rgba(255,170,70,0.4)')
    g.addColorStop(1, 'rgba(255,170,70,0)')
    ctx.fillStyle = g
    ctx.fillRect(tx - 140, ty - 140, 280, 280)
    ctx.fillStyle = '#2b2b33'
    ctx.fillRect(tx - 3, ty, 6, 22)
    ctx.fillStyle = '#ff9a3c'
    ctx.beginPath()
    ctx.moveTo(tx - 8, ty + 2)
    ctx.quadraticCurveTo(tx - 10, ty - 14, tx + Math.sin(t * 9 + i) * 3, ty - 26 * f)
    ctx.quadraticCurveTo(tx + 10, ty - 14, tx + 8, ty + 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    ctx.ellipse(tx, ty - 5, 3.5, 8 * f, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // vignette
  const v = ctx.createRadialGradient(w / 2, h * 0.4, h * 0.25, w / 2, h * 0.4, h * 0.85)
  v.addColorStop(0, 'rgba(8,6,16,0)')
  v.addColorStop(1, 'rgba(8,6,16,0.6)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, w, h)
}

// A corked potion bottle with a soft glow, bobbing a little.
export function drawPotion(ctx, x, y, t) {
  const bob = Math.sin(t * 3 + x * 0.05) * 2
  const g = ctx.createRadialGradient(x, y + bob, 2, x, y + bob, 18)
  g.addColorStop(0, 'rgba(255,107,157,0.45)')
  g.addColorStop(1, 'rgba(255,107,157,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - 18, y - 18 + bob, 36, 36)
  ell(ctx, x, y + 10, 7, 2.2, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = '#dfe9f5'
  ctx.fillRect(x - 2.5, y - 10 + bob, 5, 5)
  ctx.fillStyle = '#8a5a2e'
  ctx.fillRect(x - 3, y - 12 + bob, 6, 3)
  ctx.fillStyle = '#ff6b9d'
  ctx.beginPath()
  ctx.arc(x, y + 1 + bob, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.beginPath()
  ctx.arc(x - 2.5, y - 1.5 + bob, 2, 0, Math.PI * 2)
  ctx.fill()
}

// --------------------------------------------------------------- tavern ----

export function makeTavernBackdrop({ grid, cols, rows, tile: T, door, tables = [] }) {
  const canvas = makeCanvas(cols * T, rows * T)
  const ctx = canvas.getContext('2d')
  const tableSet = new Set(tables.map(([c, r]) => `${c},${r}`))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * T
      const y = r * T
      const solid = grid[r][c] === 1 && !tableSet.has(`${c},${r}`)
      if (!solid) {
        // plank floor
        ctx.fillStyle = ['#8a5f38', '#83592f', '#8f6540'][Math.floor(rnd(c, r) * 3)]
        ctx.fillRect(x, y, T, T)
        ctx.strokeStyle = 'rgba(40,24,12,0.55)'
        ctx.lineWidth = 1.2
        for (let i = 0; i <= 4; i++) {
          ctx.beginPath()
          ctx.moveTo(x, y + i * 13)
          ctx.lineTo(x + T, y + i * 13)
          ctx.stroke()
        }
        for (let i = 0; i < 4; i++) {
          const jx = x + ((c * 17 + i * 23 + r * 7) % T)
          ctx.beginPath()
          ctx.moveTo(jx, y + i * 13)
          ctx.lineTo(jx, y + i * 13 + 13)
          ctx.stroke()
          ctx.fillStyle = 'rgba(30,18,8,0.6)'
          ctx.fillRect(jx + 3, y + i * 13 + 5, 1.5, 1.5)
        }
      } else {
        // log wall
        ctx.fillStyle = '#3a2616'
        ctx.fillRect(x, y, T, T)
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? '#4a321e' : '#523822'
          ctx.beginPath()
          ctx.roundRect(x, y + i * 13, T, 12, 5)
          ctx.fill()
        }
      }
    }
  }

  // back wall (row 0): shelves of bottles, a window, a mounted keg
  for (let c = 1; c < cols - 1; c++) {
    const x = c * T
    if (c === Math.floor(cols / 2)) {
      ctx.fillStyle = '#2b1d12'
      ctx.fillRect(x + 8, 8, T - 16, 32)
      ctx.fillStyle = '#28324f'
      ctx.fillRect(x + 11, 11, T - 22, 26)
      ctx.fillStyle = '#fff6c8'
      ctx.beginPath()
      ctx.arc(x + T - 20, 19, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2b1d12'
      ctx.fillRect(x + T / 2 - 1, 11, 2, 26)
      continue
    }
    ctx.fillStyle = '#2b1d12'
    ctx.fillRect(x + 4, 22, T - 8, 3)
    ctx.fillRect(x + 4, 42, T - 8, 3)
    const cols4 = ['#7fc26b', '#d98a4a', '#6aa3d8', '#c46a9a']
    for (let i = 0; i < 4; i++) {
      const bx = x + 9 + i * 10
      ctx.fillStyle = cols4[(i + c) % 4]
      ctx.fillRect(bx, 11, 5, 11)
      ctx.fillRect(bx + 1.5, 7, 2, 5)
      ctx.fillStyle = cols4[(i + c + 2) % 4]
      ctx.fillRect(bx, 31, 5, 11)
      ctx.fillRect(bx + 1.5, 27, 2, 5)
    }
  }

  // fireplace on the left wall (flames animated in drawTavernLife)
  ctx.fillStyle = '#6b6b75'
  ctx.beginPath()
  ctx.roundRect(4, T * 2.2, T - 8, T * 1.3, [10, 10, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#1a1210'
  ctx.beginPath()
  ctx.roundRect(11, T * 2.2 + 12, T - 22, T * 1.3 - 12, [8, 8, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#4a4a55'
  ctx.fillRect(0, T * 2.2 - 4, T, 6)

  // barrels along the right wall
  for (const ry of [1.9, 3.1]) drawBarrel(ctx, cols * T - T / 2, T * ry + 14)

  // rug
  ctx.fillStyle = '#8a3040'
  ctx.beginPath()
  ctx.roundRect(T * 2.6, T * 3.1, T * 2.8, T * 1.2, 8)
  ctx.fill()
  ctx.strokeStyle = '#e0b060'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(T * 2.6 + 6, T * 3.1 + 6, T * 2.8 - 12, T * 1.2 - 12, 5)
  ctx.stroke()

  // tables with stools and mugs (solid tiles)
  for (const [c, r] of tables) {
    const x = c * T + T / 2
    const y = r * T + T / 2
    ell(ctx, x, y + 6, 21, 8, 'rgba(0,0,0,0.3)')
    for (const [dx, dy] of [[-19, 6], [19, 6]]) ell(ctx, x + dx, y + dy, 6, 4, '#6b4a2a')
    ell(ctx, x, y, 19, 14, '#a8743e')
    ell(ctx, x, y - 1, 16, 11, '#b98448')
    ctx.fillStyle = '#d9a52a'
    ctx.fillRect(x - 8, y - 7, 5, 7)
    ctx.fillRect(x + 4, y - 3, 5, 7)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 8, y - 8, 5, 2)
    ctx.fillRect(x + 4, y - 4, 5, 2)
  }

  // exit: door set into the bottom wall + a doormat
  const dx = door.x
  const dy = door.y
  ctx.fillStyle = '#2b1d12'
  ctx.fillRect(dx - T / 2, dy - T / 2, T, T)
  ctx.fillStyle = '#7a4f2a'
  ctx.beginPath()
  ctx.roundRect(dx - 15, dy - 20, 30, 46, [12, 12, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#5a381c'
  ctx.fillRect(dx - 1, dy - 20, 2, 46)
  ctx.fillStyle = '#ffd24a'
  ctx.beginPath()
  ctx.arc(dx + 8, dy + 4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,224,102,0.9)'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('출구', dx, dy - 24)

  return canvas
}

export function drawTavernLife(ctx, t, { tile: T }) {
  // fire in the hearth + warm light spilling onto the floor
  const fx = T / 2
  const fy = T * 3.4
  const f = 1 + Math.sin(t * 10) * 0.15 + Math.sin(t * 23) * 0.07
  const g = ctx.createRadialGradient(fx + 20, fy, 4, fx + 20, fy, 150 * f)
  g.addColorStop(0, 'rgba(255,160,70,0.3)')
  g.addColorStop(1, 'rgba(255,160,70,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, fy - 160, 240, 320)
  for (const [dx, s, col] of [[-6, 0.8, '#ff7a2c'], [5, 1, '#ff9a3c'], [0, 0.7, '#ffe066']]) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(fx + dx - 6 * s, fy)
    ctx.quadraticCurveTo(fx + dx - 7 * s, fy - 12 * s, fx + dx + Math.sin(t * 8 + dx) * 2, fy - 22 * s * f)
    ctx.quadraticCurveTo(fx + dx + 7 * s, fy - 12 * s, fx + dx + 6 * s, fy)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#3a2616'
  ctx.fillRect(fx - 12, fy - 2, 24, 5)
}
