// The island itself: terrain, where everything stands, and the pre-painted
// ground. Generated from a fixed seed so the island is the same every visit.
//
// Terrain codes: W deep water, s shallow water, a sand, g grass, l lake,
//                p dirt path / plaza, P pier planks (walkable over water)

export const TILE = 32
export const COLS = 72
export const ROWS = 48
export const WORLD_W = COLS * TILE
export const WORLD_H = ROWS * TILE

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// stable per-tile noise for painting (independent of the generator's stream)
export function hash(a, b, k = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}

const WATER = new Set(['W', 's', 'l'])
export const isWater = (ch) => WATER.has(ch)

export function buildWorld(seed = 11) {
  const rand = rng(seed)
  const terrain = Array.from({ length: ROWS }, () => Array(COLS).fill('W'))
  const cx = 36
  const cy = 24
  const rx = 30
  const ry = 19

  const radial = (c, r) => {
    const nx = (c + 0.5 - cx) / rx
    const ny = (r + 0.5 - cy) / ry
    const th = Math.atan2(ny, nx)
    const n = 0.06 * Math.sin(3 * th + 0.7) + 0.045 * Math.sin(5 * th + 2.1) + 0.03 * Math.sin(9 * th + 1)
    return { rr: Math.hypot(nx, ny), n }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { rr, n } = radial(c, r)
      if (rr < 0.93 + n) terrain[r][c] = rr > 0.8 + n * 0.8 ? 'a' : 'g'
      else if (rr < 1.07 + n) terrain[r][c] = 's'
    }
  }
  const land = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && (terrain[r][c] === 'g' || terrain[r][c] === 'a')
  const grass = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && terrain[r][c] === 'g'

  // ---- lake (inland, east) ----
  const lake = { cx: 52, cy: 15, rx: 4.8, ry: 3.2 }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = ((c + 0.5 - lake.cx) / lake.rx) ** 2 + ((r + 0.5 - lake.cy) / lake.ry) ** 2
      if (d < 1 && grass(c, r)) terrain[r][c] = 'l'
    }
  }

  // ---- paths: the plaza and the roads out of it ----
  const plaza = { c0: 33, c1: 39, r0: 22, r1: 26 }
  const pathTiles = new Set()
  const carve = (c0, r0, c1, r1) => {
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
        if (terrain[r][c] === 'g' || terrain[r][c] === 'a') {
          terrain[r][c] = 'p'
          pathTiles.add(`${c},${r}`)
        }
      }
    }
  }
  carve(plaza.c0, plaza.r0, plaza.c1, plaza.r1)
  carve(27, 23, 33, 24) // west road
  carve(27, 20, 28, 24) // up to the player's house door
  carve(39, 23, 45, 24) // east road
  carve(44, 20, 45, 24) // up to the shop
  carve(45, 23, 51, 24) // on to the lake
  carve(50, 18, 51, 24)
  carve(36, 27, 37, 38) // south road to the pier
  carve(21, 25, 33, 25) // road west to Mei's cottage
  carve(21, 25, 22, 30)
  carve(39, 25, 51, 26) // road east to Tori's cottage
  carve(50, 25, 51, 29)
  carve(30, 14, 32, 22) // north trail into the forest
  carve(24, 10, 32, 11)
  carve(18, 31, 22, 31) // Mei's door joins her path
  carve(52, 25, 53, 30) // path round the east side of Tori's cottage
  carve(50, 30, 53, 30) // ...to her door

  // ---- pier (south) ----
  let pierStart = 36
  for (let r = 34; r < ROWS; r++) {
    if (terrain[r][36] === 'a' || terrain[r][36] === 'p') pierStart = r
    else break
  }
  const pier = { c0: 36, c1: 37, r0: pierStart + 1, r1: pierStart + 5 }
  for (let r = pier.r0; r <= pier.r1; r++) for (let c = pier.c0; c <= pier.c1; c++) terrain[r][c] = 'P'

  // ---- buildings (footprint in tiles; door is the walkable tile below) ----
  const buildings = [
    { id: 'house', kind: 'house', c: 25, r: 17, w: 5, h: 3, door: { c: 27, r: 20 }, wall: '#f2dcb0', roof: '#c4553f', label: '내 집' },
    { id: 'shop', kind: 'shop', c: 42, r: 17, w: 5, h: 3, door: { c: 44, r: 20 }, wall: '#f4e6c4', roof: '#3f8a52', label: '상점' },
    { id: 'tori', kind: 'cottage', c: 49, r: 27, w: 4, h: 3, door: { c: 50, r: 30 }, wall: '#cfe4f2', roof: '#5a7fb8', label: '' },
    { id: 'mei', kind: 'cottage', c: 17, r: 28, w: 4, h: 3, door: { c: 18, r: 31 }, wall: '#f6d6d6', roof: '#b8607a', label: '' },
  ]

  const solid = new Uint8Array(ROWS * COLS)
  const setSolid = (c, r, v = 1) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) solid[r * COLS + c] = v
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = terrain[r][c]
      if (ch === 'W' || ch === 's' || ch === 'l') setSolid(c, r)
    }
  }
  for (const b of buildings) {
    for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) setSolid(c, r)
  }
  const blocked = new Set() // tiles reserved by objects while we scatter things
  for (const b of buildings) for (let r = b.r - 1; r <= b.r + b.h + 1; r++) for (let c = b.c - 1; c <= b.c + b.w; c++) blocked.add(`${c},${r}`)
  for (const k of pathTiles) blocked.add(k)

  // ---- plaza props ----
  const props = []
  const addProp = (kind, c, r, w = 1, h = 1, extra = {}) => {
    props.push({ kind, c, r, w, h, x: (c + w / 2) * TILE, y: (r + h) * TILE, ...extra })
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) setSolid(cc, rr)
    for (let rr = r - 1; rr <= r + h; rr++) for (let cc = c - 1; cc <= c + w; cc++) blocked.add(`${cc},${rr}`)
  }
  addProp('fountain', 35, 23, 2, 2)
  addProp('board', 31, 24, 1, 1)
  addProp('lamp', 33, 22)
  addProp('lamp', 39, 22)
  addProp('lamp', 33, 26)
  addProp('lamp', 39, 26)
  addProp('bench', 34, 21, 2, 1)
  addProp('bench', 37, 27, 2, 1)
  addProp('mailbox', 30, 20)
  addProp('lamp', 28, 24)
  addProp('lamp', 46, 24)
  addProp('lamp', 36, 33)
  addProp('sign', 38, 28)
  // pier lamp + barrels
  addProp('barrel', 35, pier.r0 - 1)
  addProp('barrel', 38, pier.r0 - 1)
  // a fence along the flower meadow's north edge, with a gap for the path
  for (let c = 14; c <= 29; c++) {
    if (c >= 16 && c <= 22) continue
    if (terrain[31][c] === 'g') addProp('fence', c, 31)
  }

  // ---- rocks ----
  const rocks = []
  for (let i = 0; i < 400 && rocks.length < 16; i++) {
    const c = 6 + Math.floor(rand() * (COLS - 12))
    const r = 6 + Math.floor(rand() * (ROWS - 12))
    if (!grass(c, r) || blocked.has(`${c},${r}`) || solid[r * COLS + c]) continue
    rocks.push({ c, r, x: (c + 0.5) * TILE, y: (r + 0.95) * TILE, s: 0.8 + rand() * 0.6 })
    setSolid(c, r)
    blocked.add(`${c},${r}`)
  }

  // ---- trees: a dense forest NW, an orchard E/SE, a few scattered ----
  const trees = []
  const inBox = (c, r, b) => c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1
  const forest = { c0: 14, c1: 30, r0: 9, r1: 16 }
  const orchard = { c0: 54, c1: 62, r0: 22, r1: 34 }
  const KINDS = ['apple', 'orange', 'peach']
  for (let attempt = 0; attempt < 6000 && trees.length < 96; attempt++) {
    const c = 4 + Math.floor(rand() * (COLS - 8))
    const r = 4 + Math.floor(rand() * (ROWS - 8))
    if (!grass(c, r) || blocked.has(`${c},${r}`) || solid[r * COLS + c]) continue
    // keep clear of the lake shore and the plaza
    let nearLake = false
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (terrain[r + dr][c + dc] === 'l') nearLake = true
    if (nearLake) continue
    const dens = inBox(c, r, forest) ? 0.5 : inBox(c, r, orchard) ? 0.4 : 0.05
    if (rand() > dens) continue
    if (trees.some((t) => Math.abs(t.c - c) < 2 && Math.abs(t.r - r) < 2)) continue
    const fruiting = inBox(c, r, orchard) ? true : rand() < 0.35
    trees.push({
      id: trees.length,
      c,
      r,
      x: (c + 0.5) * TILE,
      y: (r + 0.95) * TILE,
      kind: fruiting ? KINDS[Math.floor(rand() * KINDS.length)] : 'oak',
      fruiting,
      hasFruit: fruiting,
      woodCharges: fruiting ? 2 : 3,
      shake: 0,
      seed: rand() * 10,
      size: 0.95 + rand() * 0.35,
    })
    setSolid(c, r)
  }

  // ---- flowers to pick: a meadow in the south-west ----
  const meadow = { c0: 14, c1: 29, r0: 32, r1: 38 }
  const flowers = []
  const FLOWER_COLORS = ['#ff8fb0', '#ffd34d', '#b58cff', '#ffffff', '#ff7a59', '#7fc4ff']
  for (let attempt = 0; attempt < 3000 && flowers.length < 34; attempt++) {
    const c = meadow.c0 + Math.floor(rand() * (meadow.c1 - meadow.c0 + 1))
    const r = meadow.r0 + Math.floor(rand() * (meadow.r1 - meadow.r0 + 1))
    if (!grass(c, r) || blocked.has(`${c},${r}`) || solid[r * COLS + c]) continue
    if (flowers.some((f) => f.c === c && f.r === r)) continue
    flowers.push({ c, r, x: (c + 0.5) * TILE, y: (r + 0.7) * TILE, picked: false, color: FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)] })
  }

  // ---- shells: along the whole coast ----
  const shells = []
  for (let attempt = 0; attempt < 5000 && shells.length < 44; attempt++) {
    const c = 3 + Math.floor(rand() * (COLS - 6))
    const r = 3 + Math.floor(rand() * (ROWS - 6))
    if (terrain[r][c] !== 'a') continue
    let coastal = false
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (terrain[r + dr][c + dc] === 's') coastal = true
    if (!coastal) continue
    if (shells.some((s) => Math.abs(s.c - c) + Math.abs(s.r - r) < 3)) continue
    shells.push({ c, r, x: (c + 0.5) * TILE, y: (r + 0.6) * TILE, collected: false })
  }

  const spawn = { x: 36 * TILE + TILE / 2, y: 28 * TILE }

  return {
    terrain,
    solid,
    buildings,
    props,
    rocks,
    trees,
    flowers,
    shells,
    pier,
    plaza,
    lake,
    spawn,
    forest,
    orchard,
    meadow,
    pathTiles,
    isSolid(c, r) {
      return c < 0 || r < 0 || c >= COLS || r >= ROWS || solid[r * COLS + c] === 1
    },
  }
}

// Can a body of half-width `half` stand at (x, y)?
export function canStand(world, x, y, half) {
  for (const [px, py] of [[x - half, y - half * 0.5], [x + half, y - half * 0.5], [x - half, y + 2], [x + half, y + 2]]) {
    if (world.isSolid(Math.floor(px / TILE), Math.floor(py / TILE))) return false
  }
  return true
}

// ---------------------------------------------------------------- ground ----

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Paints every tile of the island once: water, sand, grass, dirt paths,
// cobbled plaza, wildflowers. Shorelines get a wet-sand rim here; the animated
// foam is added each frame on top.
export function renderGround(world) {
  const canvas = makeCanvas(WORLD_W, WORLD_H)
  const ctx = canvas.getContext('2d')
  const { terrain } = world
  const T = TILE
  const at = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS ? 'W' : terrain[r][c])
  const isPathish = (c, r) => at(c, r) === 'p' || at(c, r) === 'P'

  const grasses = ['#5fa353', '#64a957', '#5b9d50', '#68ad5a']
  const sands = ['#ead69c', '#e6d094', '#eed9a2', '#e3cc8e']

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = terrain[r][c]
      const x = c * T
      const y = r * T
      const h = hash(c, r)
      if (ch === 'W') {
        ctx.fillStyle = h > 0.5 ? '#2a6db0' : '#2b72b6'
      } else if (ch === 's') {
        ctx.fillStyle = h > 0.5 ? '#52a9db' : '#4fa5d8'
      } else if (ch === 'l') {
        ctx.fillStyle = h > 0.5 ? '#4ba2d3' : '#4a9fd0'
      } else if (ch === 'a') {
        ctx.fillStyle = sands[Math.floor(h * sands.length)]
      } else {
        ctx.fillStyle = grasses[Math.floor(h * grasses.length)]
      }
      ctx.fillRect(x, y, T, T)
    }
  }

  // shallow-water gradient: lighter near the beach
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = terrain[r][c]
      if (ch === 's') {
        let touchesLand = false
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = at(c + dc, r + dr)
          if (o === 'a' || o === 'g' || o === 'p') touchesLand = true
        }
        if (touchesLand) {
          ctx.fillStyle = 'rgba(190,240,255,0.35)'
          ctx.fillRect(c * T, r * T, T, T)
        }
      }
    }
  }

  // grass tufts + sand speckles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = terrain[r][c]
      if (ch === 'g') {
        for (let i = 0; i < 4; i++) {
          const gx = c * T + hash(c, r, i + 1) * T
          const gy = r * T + hash(c, r, i + 9) * T
          ctx.strokeStyle = i % 2 ? 'rgba(30,85,40,0.45)' : 'rgba(170,225,130,0.5)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(gx - 2, gy)
          ctx.lineTo(gx - 1, gy - 4)
          ctx.moveTo(gx + 1, gy)
          ctx.lineTo(gx + 2, gy - 4)
          ctx.stroke()
        }
      } else if (ch === 'a') {
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(160,130,70,0.35)' : 'rgba(255,248,210,0.55)'
          ctx.fillRect(c * T + hash(c, r, i + 3) * T, r * T + hash(c, r, i + 13) * T, 2, 2)
        }
      }
    }
  }

  // wet-sand rim where sand meets the water
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (terrain[r][c] !== 'a') continue
      const x = c * T
      const y = r * T
      ctx.fillStyle = 'rgba(150,120,60,0.22)'
      if (at(c + 1, r) === 's') ctx.fillRect(x + T - 7, y, 7, T)
      if (at(c - 1, r) === 's') ctx.fillRect(x, y, 7, T)
      if (at(c, r + 1) === 's') ctx.fillRect(x, y + T - 7, T, 7)
      if (at(c, r - 1) === 's') ctx.fillRect(x, y, T, 7)
    }
  }
  // grass-to-sand soft edge
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (terrain[r][c] !== 'g') continue
      const x = c * T
      const y = r * T
      ctx.fillStyle = 'rgba(210,190,120,0.25)'
      if (at(c + 1, r) === 'a') ctx.fillRect(x + T - 5, y, 5, T)
      if (at(c - 1, r) === 'a') ctx.fillRect(x, y, 5, T)
      if (at(c, r + 1) === 'a') ctx.fillRect(x, y + T - 5, T, 5)
      if (at(c, r - 1) === 'a') ctx.fillRect(x, y, T, 5)
    }
  }
  // lake rim: reeds-green bank
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (terrain[r][c] !== 'g') continue
      const x = c * T
      const y = r * T
      ctx.fillStyle = 'rgba(40,110,60,0.3)'
      if (at(c + 1, r) === 'l') ctx.fillRect(x + T - 5, y, 5, T)
      if (at(c - 1, r) === 'l') ctx.fillRect(x, y, 5, T)
      if (at(c, r + 1) === 'l') ctx.fillRect(x, y + T - 5, T, 5)
      if (at(c, r - 1) === 'l') ctx.fillRect(x, y, T, 5)
    }
  }

  // dirt paths (rounded where a corner has no neighbouring path tile)
  for (const pass of [0, 1]) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (terrain[r][c] !== 'p') continue
        const inset = pass === 0 ? 0 : 3
        const x0 = c * T + (isPathish(c - 1, r) ? 0 : inset)
        const y0 = r * T + (isPathish(c, r - 1) ? 0 : inset)
        const x1 = c * T + T - (isPathish(c + 1, r) ? 0 : inset)
        const y1 = r * T + T - (isPathish(c, r + 1) ? 0 : inset)
        const rad = (a, b) => (!isPathish(c + a, r) && !isPathish(c, r + b) ? 12 : 0)
        ctx.fillStyle = pass === 0 ? '#a98856' : '#d2b27a'
        ctx.beginPath()
        ctx.roundRect(x0, y0, x1 - x0, y1 - y0, [rad(-1, -1), rad(1, -1), rad(1, 1), rad(-1, 1)])
        ctx.fill()
      }
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (terrain[r][c] !== 'p') continue
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(120,95,55,0.5)' : 'rgba(240,222,180,0.7)'
        ctx.beginPath()
        ctx.ellipse(c * T + 6 + hash(c, r, 20 + i) * (T - 12), r * T + 6 + hash(c, r, 30 + i) * (T - 12), 2.2, 1.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  // cobbles on the plaza
  const pl = world.plaza
  for (let r = pl.r0; r <= pl.r1; r++) {
    for (let c = pl.c0; c <= pl.c1; c++) {
      const x = c * T
      const y = r * T
      ctx.fillStyle = (c + r) % 2 ? '#cdbd9c' : '#c3b28f'
      ctx.fillRect(x + 1, y + 1, T - 2, T - 2)
      ctx.strokeStyle = 'rgba(90,75,50,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3)
      ctx.beginPath()
      ctx.moveTo(x + T / 2, y + 1)
      ctx.lineTo(x + T / 2, y + T / 2)
      ctx.moveTo(x + 1, y + T / 2)
      ctx.lineTo(x + T - 1, y + T / 2)
      ctx.stroke()
    }
  }
  // pier planks
  const p = world.pier
  for (let r = p.r0; r <= p.r1; r++) {
    for (let c = p.c0; c <= p.c1; c++) {
      const x = c * T
      const y = r * T
      ctx.fillStyle = '#9a6a3a'
      ctx.fillRect(x, y, T, T)
      ctx.strokeStyle = 'rgba(40,24,10,0.55)'
      ctx.lineWidth = 1.2
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath()
        ctx.moveTo(x, y + i * 8)
        ctx.lineTo(x + T, y + i * 8)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect(x, y, T, 3)
    }
  }
  // pier posts
  for (let r = p.r0; r <= p.r1; r += 2) {
    for (const px of [p.c0 * T - 3, (p.c1 + 1) * T - 3]) {
      ctx.fillStyle = '#6b4526'
      ctx.fillRect(px, r * T + 2, 6, 10)
      ctx.fillStyle = '#4a2f18'
      ctx.fillRect(px + 4, r * T + 2, 2, 10)
    }
  }

  // wildflowers sprinkled over open grass (denser in the meadow)
  const petals = ['#ffffff', '#ffd6e8', '#fff3a0', '#d8c8ff', '#ff9aa8']
  const m = world.meadow
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (terrain[r][c] !== 'g') continue
      const inMeadow = c >= m.c0 && c <= m.c1 && r >= m.r0 && r <= m.r1
      if (hash(c, r, 40) > (inMeadow ? 0.5 : 0.1)) continue
      const n = inMeadow ? 3 : 1
      for (let i = 0; i < n; i++) {
        const fx = c * T + 6 + hash(c, r, 50 + i) * (T - 12)
        const fy = r * T + 8 + hash(c, r, 60 + i) * (T - 14)
        ctx.fillStyle = '#2f6b34'
        ctx.fillRect(fx - 0.5, fy, 1, 4)
        ctx.fillStyle = petals[Math.floor(hash(c, r, 70 + i) * petals.length)]
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
          ctx.beginPath()
          ctx.arc(fx + dx, fy + dy, 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = '#ffe066'
        ctx.beginPath()
        ctx.arc(fx, fy, 1.1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  return canvas
}

// A 1-pixel-per-tile map, scaled up by the HUD.
export function renderMinimap(world) {
  const c = makeCanvas(COLS, ROWS)
  const x = c.getContext('2d')
  const colors = { W: '#1f5f9f', s: '#3f93c8', l: '#4ba2d3', a: '#e6d094', g: '#5a9a4e', p: '#b9985f', P: '#8a5a2e' }
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      x.fillStyle = colors[world.terrain[r][col]] || '#000'
      x.fillRect(col, r, 1, 1)
    }
  }
  for (const t of world.trees) {
    x.fillStyle = '#2f7a3d'
    x.fillRect(t.c, t.r, 1, 1)
  }
  for (const b of world.buildings) {
    x.fillStyle = '#c4553f'
    x.fillRect(b.c, b.r, b.w, b.h)
  }
  return c
}
