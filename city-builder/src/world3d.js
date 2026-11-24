import * as THREE from 'three'

// 미니시티 빌더의 3D 월드. 시뮬레이션(타일 격자)은 main.js가 그대로 맡고,
// 여기서는 타일 상태를 읽어 3D로 보여 주기만 한다. 1타일 = 월드 1유닛 (x=열, z=행).
export function createWorld3D({ canvas, tiles, COLS, ROWS, TILE, VIEW_W, VIEW_H, paintTile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(VIEW_W, VIEW_H, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const SKY = 0xbfe3ff
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, 45, 120)
  const camera = new THREE.PerspectiveCamera(45, VIEW_W / VIEW_H, 0.5, 250)

  const view = { cx: 25.5, cz: 18.5, yaw: 0.65, pitch: 0.95, dist: 22 }
  function applyCamera() {
    const { cx, cz, yaw, pitch, dist } = view
    camera.position.set(cx + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, cz + Math.cos(yaw) * Math.cos(pitch) * dist)
    camera.lookAt(cx, 0, cz)
  }

  // ---- 조명 ----
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x7a8a60, 1.0)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2)
  sun.position.set(COLS / 2 + 22, 32, ROWS / 2 - 14)
  sun.target.position.set(COLS / 2, 0, ROWS / 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera
  sc.left = -34; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90
  sun.shadow.bias = -0.0004
  scene.add(sun, sun.target)
  const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0)
  moonLight.target.position.set(COLS / 2, 0, ROWS / 2)
  scene.add(moonLight, moonLight.target)

  // ---- 땅: 타일 그림 텍스처(2D 캔버스) + 두께 있는 섬 + 바다 ----
  const terrainCanvas = document.createElement('canvas')
  terrainCanvas.width = COLS * TILE
  terrainCanvas.height = ROWS * TILE
  const tctx = terrainCanvas.getContext('2d')
  const terrainTex = new THREE.CanvasTexture(terrainCanvas)
  terrainTex.colorSpace = THREE.SRGBColorSpace
  terrainTex.anisotropy = 8
  const land = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), new THREE.MeshStandardMaterial({ map: terrainTex, roughness: 1 }))
  land.rotation.x = -Math.PI / 2
  land.position.set(COLS / 2, 0, ROWS / 2)
  land.receiveShadow = true
  scene.add(land)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(COLS, 0.7, ROWS), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }))
  slab.position.set(COLS / 2, -0.36, ROWS / 2)
  scene.add(slab)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3a86c8, roughness: 0.35, metalness: 0.1 }))
  water.rotation.x = -Math.PI / 2
  water.position.set(COLS / 2, -0.55, ROWS / 2)
  scene.add(water)

  let terrainDirty = true
  let lampsDirty = true
  function repaintTerrainTile(r, c) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return
    paintTile(tctx, r, c)
    terrainDirty = true
  }
  function repaintAll() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) paintTile(tctx, r, c)
    terrainDirty = true
  }

  // ---- 나무 (비어 있는 타일에 인스턴스로) ----
  const hash = (a, b, k = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v) }
  const treeSlots = []
  const treeAt = {}
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
    if (hash(r, c, 3) > 0.84) { treeAt[r * COLS + c] = treeSlots.length; treeSlots.push([r, c]) }
  }
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2a }), treeSlots.length)
  const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 0.75, 7), new THREE.MeshStandardMaterial({ color: 0x3f9a4d, roughness: 0.9 }), treeSlots.length)
  const dummy = new THREE.Object3D()
  const leafColor = new THREE.Color()
  function placeTree(i, visible) {
    const [r, c] = treeSlots[i]
    const s = visible ? 0.8 + hash(r, c, 9) * 0.5 : 0.0001
    const ox = (hash(r, c, 5) - 0.5) * 0.3, oz = (hash(r, c, 6) - 0.5) * 0.3
    dummy.rotation.set(0, 0, 0)
    dummy.position.set(c + 0.5 + ox, 0.17 * s, r + 0.5 + oz)
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    trunkMesh.setMatrixAt(i, dummy.matrix)
    dummy.position.y = (0.35 + 0.34) * s
    dummy.updateMatrix()
    leafMesh.setMatrixAt(i, dummy.matrix)
    leafMesh.setColorAt(i, leafColor.setHex(hash(r, c, 8) > 0.5 ? 0x3f9a4d : 0x2f7a3d))
  }
  treeSlots.forEach((_, i) => placeTree(i, true))
  trunkMesh.castShadow = leafMesh.castShadow = true
  scene.add(trunkMesh, leafMesh)

  // ---- 건물 ----
  function facade(tint, seed, lit = 0.35) {
    const N = 4, S = 128, cell = S / N
    const cv = document.createElement('canvas'); cv.width = cv.height = S
    const gl = document.createElement('canvas'); gl.width = gl.height = S
    const g = cv.getContext('2d')
    const gg = gl.getContext('2d')
    gg.fillStyle = '#000'; gg.fillRect(0, 0, S, S)
    g.fillStyle = tint; g.fillRect(0, 0, S, S)
    let sd = seed
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      g.fillStyle = 'rgba(20,30,50,0.85)'
      g.fillRect(x * cell + cell * 0.22, y * cell + cell * 0.2, cell * 0.56, cell * 0.6)
      const on = rnd() < lit
      g.fillStyle = on ? '#ffe9a8' : '#a9d4f0'
      g.fillRect(x * cell + cell * 0.26, y * cell + cell * 0.24, cell * 0.48, cell * 0.52)
      if (on) {
        gg.fillStyle = '#ffd98a'
        gg.fillRect(x * cell + cell * 0.26, y * cell + cell * 0.24, cell * 0.48, cell * 0.52)
      }
    }
    const mk = (cvs) => {
      const t = new THREE.CanvasTexture(cvs)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    }
    return { map: mk(cv), glow: mk(gl) }
  }
  const stdCache = new Map()
  const std = (color) => {
    if (!stdCache.has(color)) stdCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }))
    return stdCache.get(color)
  }
  // 창문 재질은 (모양, 반복 수)별로 하나만 만들어 공유한다. 밤에는 켜진 창이 빛난다.
  const glowMats = []
  const facadeCache = new Map()
  const matFacade = (fac, id, rx, ry) => {
    const k = `${id}|${rx}|${ry}`
    if (!facadeCache.has(k)) {
      const map = fac.map.clone(); map.needsUpdate = true; map.repeat.set(rx, ry)
      const glow = fac.glow.clone(); glow.needsUpdate = true; glow.repeat.set(rx, ry)
      const m = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0, roughness: 0.8 })
      glowMats.push(m)
      facadeCache.set(k, m)
    }
    return facadeCache.get(k)
  }
  const FAC = {
    res: [facade('#efe3c8', 3), facade('#e6d6b4', 7), facade('#d8e4ee', 11)],
    com: [facade('#8fb4e0', 5, 0.5), facade('#9fc0e6', 9, 0.5), facade('#7aa2d4', 13, 0.5)],
    ind: [facade('#c9b27a', 17, 0.2), facade('#b8a070', 21, 0.2)],
  }
  const ROOF = { res: [0xd9604a, 0x4a7ac0, 0x6a9a50], com: [0x4a5a6a], ind: [0x6a6a74] }
  const awningTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8
    const g = cv.getContext('2d')
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e04a4a'; g.fillRect(i * 8, 0, 8, 8) }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
  })()
  const smokers = []

  function addBox(group, w, h, d, x, y, z, mat, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y + h / 2, z)
    m.castShadow = shadow; m.receiveShadow = true
    group.add(m)
    return m
  }
  function sideMat(type, r, c, w, h) {
    const arr = FAC[type]
    const idx = Math.floor(hash(r, c, 2) * arr.length)
    return matFacade(arr[idx], `${type}${idx}`, Math.max(1, Math.round(w * 1.5)), Math.max(1, Math.round(h * 2.2)))
  }

  function buildBuilding(t, r, c) {
    const g = new THREE.Group()
    g.position.set(c + 0.5, 0, r + 0.5)
    g.rotation.y = Math.floor(hash(r, c, 4) * 4) * (Math.PI / 2)
    const lv = t.level
    const roof = ROOF[t.type][Math.floor(hash(r, c, 1) * ROOF[t.type].length)]
    if (t.type === 'res') {
      if (lv === 1) {
        addBox(g, 0.62, 0.38, 0.62, 0, 0, 0, sideMat('res', r, c, 0.62, 0.38))
        const rf = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.34, 4), std(roof)); rf.position.y = 0.38 + 0.17; rf.rotation.y = Math.PI / 4; rf.castShadow = true; g.add(rf)
        addBox(g, 0.14, 0.2, 0.04, 0, 0, 0.32, std(0x7a4a26), false)
      } else if (lv === 2) {
        addBox(g, 0.7, 0.8, 0.7, 0, 0, 0, sideMat('res', r, c, 0.7, 0.8))
        const rf = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.36, 4), std(roof)); rf.position.y = 0.8 + 0.18; rf.rotation.y = Math.PI / 4; rf.castShadow = true; g.add(rf)
        addBox(g, 0.1, 0.22, 0.1, 0.2, 0.9, 0.1, std(0x8a7a6a))
      } else {
        addBox(g, 0.8, 1.55, 0.8, 0, 0, 0, sideMat('res', r, c, 0.8, 1.55))
        addBox(g, 0.86, 0.06, 0.86, 0, 1.55, 0, std(0xb8b2a6))
        addBox(g, 0.24, 0.16, 0.24, 0.18, 1.61, -0.12, std(0x8a8a92))
      }
    } else if (t.type === 'com') {
      if (lv === 1) {
        addBox(g, 0.8, 0.42, 0.68, 0, 0, 0, sideMat('com', r, c, 0.8, 0.42))
        const aw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.22), new THREE.MeshStandardMaterial({ map: awningTex }))
        aw.position.set(0, 0.26, 0.42); aw.rotation.x = 0.35; aw.castShadow = true; g.add(aw)
      } else if (lv === 2) {
        addBox(g, 0.82, 0.95, 0.8, 0, 0, 0, sideMat('com', r, c, 0.82, 0.95))
        addBox(g, 0.86, 0.06, 0.84, 0, 0.95, 0, std(0x4a5a6a))
      } else {
        addBox(g, 0.84, 1.9, 0.84, 0, 0, 0, sideMat('com', r, c, 0.84, 1.9))
        addBox(g, 0.5, 0.35, 0.5, 0, 1.9, 0, sideMat('com', r, c, 0.5, 0.35))
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.5, 5), std(0x55606c)); ant.position.y = 2.5; g.add(ant)
      }
    } else {
      const wall = sideMat('ind', r, c, 0.9, 0.5)
      if (lv === 1) {
        addBox(g, 0.86, 0.42, 0.74, 0, 0, 0, wall)
        addBox(g, 0.86, 0.05, 0.74, 0, 0.42, 0, std(0x6a6a74))
        addChimney(g, 0.28, 0.42, 0.18, 0.55, 0.07)
      } else if (lv === 2) {
        addBox(g, 0.9, 0.7, 0.8, 0, 0, 0, wall)
        addBox(g, 0.9, 0.05, 0.8, 0, 0.7, 0, std(0x6a6a74))
        addChimney(g, 0.3, 0.7, -0.2, 0.7, 0.08)
        addChimney(g, 0.3, 0.7, 0.2, 0.55, 0.07)
      } else {
        addBox(g, 0.92, 0.95, 0.9, 0, 0, 0, wall)
        addBox(g, 0.92, 0.05, 0.9, 0, 0.95, 0, std(0x6a6a74))
        addChimney(g, 0.33, 0.95, -0.25, 0.85, 0.09)
        addChimney(g, 0.33, 0.95, 0.0, 0.7, 0.08)
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 12), std(0xcfd4da)); tank.position.set(0.26, 1.28, 0.22); tank.castShadow = true; g.add(tank)
      }
    }
    return g
  }
  function addChimney(g, x, y0, z, h, r) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, h, 8), std(0x5a5a64))
    m.position.set(x, y0 + h / 2, z)
    m.castShadow = true
    g.add(m)
    const puffs = []
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.6, depthWrite: false }))
      g.add(p)
      puffs.push(p)
    }
    smokers.push({ group: g, x, y: y0 + h, z, puffs, phase: Math.random() })
  }

  const meshes = new Map() // 타일 키 -> 그룹
  const cityHall = new THREE.Group()
  ;(() => {
    const g = cityHall
    g.position.set(25.5, 0, 17.5)
    addBox(g, 0.95, 0.5, 0.95, 0, 0, 0, std(0xe0cfa0))
    addBox(g, 0.7, 0.5, 0.7, 0, 0.5, 0, std(0xefe0b0))
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x4a8a7a)); dome.position.y = 1.0; dome.castShadow = true; g.add(dome)
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), std(0x444444)); flag.position.y = 1.5; g.add(flag)
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13), new THREE.MeshBasicMaterial({ color: 0xe04a4a, side: THREE.DoubleSide })); cloth.position.set(0.12, 1.6, 0); g.add(cloth)
    for (const x of [-0.3, -0.1, 0.1, 0.3]) addBox(g, 0.06, 0.4, 0.06, x, 0.02, 0.5, std(0xf4f0e0))
    scene.add(g)
  })()

  const key = (r, c) => r * COLS + c
  function refreshTile(r, c) {
    const k = key(r, c)
    const old = meshes.get(k)
    if (old) { scene.remove(old.group); meshes.delete(k) }
    const t = tiles[r][c]
    const ti = treeAt[k]
    if (ti !== undefined) {
      placeTree(ti, t.type === 'empty')
      trunkMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceMatrix.needsUpdate = true
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
    }
    if ((t.type === 'res' || t.type === 'com' || t.type === 'ind') && t.level > 0) {
      const group = buildBuilding(t, r, c)
      scene.add(group)
      meshes.set(k, { group, born: t.born || 0 })
    }
    for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) repaintTerrainTile(r + dr, c + dc)
    lampsDirty = true
  }

  // ---- 가로등 (밤에 켜짐) ----
  const MAX_LAMPS = 700
  const lampPost = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }), MAX_LAMPS)
  const lampBulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0x665a3a }), MAX_LAMPS)
  lampPost.count = lampBulb.count = 0
  scene.add(lampPost, lampBulb)
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const g = cv.getContext('2d')
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,226,150,1)'); gr.addColorStop(1, 'rgba(255,226,150,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(cv)
  })()
  const lampGlow = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: glowTex, size: 0.9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  scene.add(lampGlow)
  const isRoad = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && tiles[r][c].type === 'road'
  function rebuildLamps() {
    lampsDirty = false
    const pts = []
    let n = 0
    for (let r = 0; r < ROWS && n < MAX_LAMPS; r++) for (let c = 0; c < COLS && n < MAX_LAMPS; c++) {
      if (!isRoad(r, c) || (r * 3 + c * 5) % 4 !== 0) continue
      // 도로 옆 빈 쪽 가장자리에 세운다
      const sides = [[0, 1, 0.46, 0], [0, -1, -0.46, 0], [1, 0, 0, 0.46], [-1, 0, 0, -0.46]]
      const side = sides.find(([dr, dc]) => !isRoad(r + dr, c + dc) && r + dr >= 0 && c + dc >= 0 && r + dr < ROWS && c + dc < COLS && tiles[r + dr][c + dc].type === 'empty')
      if (!side) continue
      const x = c + 0.5 + side[2] * 0.94
      const z = r + 0.5 + side[3] * 0.94
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1)
      dummy.position.set(x, 0.25, z); dummy.updateMatrix(); lampPost.setMatrixAt(n, dummy.matrix)
      dummy.position.set(x, 0.52, z); dummy.updateMatrix(); lampBulb.setMatrixAt(n, dummy.matrix)
      pts.push(x, 0.52, z)
      n++
    }
    lampPost.count = lampBulb.count = n
    lampPost.instanceMatrix.needsUpdate = lampBulb.instanceMatrix.needsUpdate = true
    lampGlow.geometry.dispose()
    lampGlow.geometry = new THREE.BufferGeometry()
    lampGlow.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  }

  // ---- 별과 달 ----
  const starPos = []
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2
    const e = 0.15 + Math.random() * 1.3
    starPos.push(COLS / 2 + Math.cos(a) * Math.cos(e) * 160, Math.sin(e) * 160, ROWS / 2 + Math.sin(a) * Math.cos(e) * 160)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
  scene.add(stars)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }))
  scene.add(moon)

  // ---- 자동차 (도로를 따라 오른쪽 차선으로 달린다) ----
  const MAX_CARS = 36
  const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.09, 0.34), new THREE.MeshStandardMaterial({ roughness: 0.5 }), MAX_CARS)
  const carCabin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.08, 0.16), new THREE.MeshStandardMaterial({ color: 0xcfe6f5, roughness: 0.3 }), MAX_CARS)
  const carLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), MAX_CARS * 2)
  carBody.castShadow = carCabin.castShadow = true
  carBody.count = carCabin.count = 0
  carLights.count = 0
  scene.add(carBody, carCabin, carLights)
  const CAR_COLORS = [0xe04a4a, 0x4a7ac0, 0xf0c040, 0xf2f2f2, 0x3a3f4a, 0x4aa86a, 0xc46bd6, 0xe0843a]
  const cars = []
  const roadNeighbors = (r, c) => [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dr, dc]) => isRoad(r + dr, c + dc))
  function spawnCar() {
    const roads = []
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isRoad(r, c) && roadNeighbors(r, c).length) roads.push([r, c])
    if (!roads.length) return false
    const [r, c] = roads[Math.floor(Math.random() * roads.length)]
    const nb = roadNeighbors(r, c)
    const [dr, dc] = nb[Math.floor(Math.random() * nb.length)]
    const car = { r, c, nr: r + dr, nc: c + dc, pr: -1, pc: -1, t: Math.random(), speed: 1.1 + Math.random() * 0.8, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], ox: 0, oz: 0, heading: 0 }
    cars.push(car)
    return true
  }
  function stepCar(car) {
    // 한 칸 도착: 다음 칸 고르기 (직진 우선, 막다른 길이면 되돌아감)
    const prevR = car.r, prevC = car.c
    car.pr = prevR; car.pc = prevC
    car.r = car.nr; car.c = car.nc
    const dr = car.r - prevR, dc = car.c - prevC
    const opts = roadNeighbors(car.r, car.c).filter(([a, b]) => !(car.r + a === prevR && car.c + b === prevC))
    let pick
    if (!opts.length) pick = [-dr, -dc]
    else {
      const straight = opts.find(([a, b]) => a === dr && b === dc)
      pick = straight && Math.random() < 0.65 ? straight : opts[Math.floor(Math.random() * opts.length)]
    }
    car.nr = car.r + pick[0]; car.nc = car.c + pick[1]
    car.t -= 1
  }
  let carTimer = 0
  const tmpCol = new THREE.Color()
  function updateCars(dt, night, now) {
    carTimer -= dt
    if (carTimer <= 0) {
      carTimer = 1
      let roadCount = 0
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tiles[r][c].type === 'road') roadCount++
      const want = Math.min(MAX_CARS, Math.floor(roadCount / 3))
      while (cars.length < want && spawnCar()) { /* 도로 위에 새로 나타남 */ }
      while (cars.length > want) cars.pop()
    }
    let n = 0
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i]
      // 철거된 도로 위에 있으면 사라지고 새로 나타난다
      if (!isRoad(car.r, car.c) || !isRoad(car.nr, car.nc)) { cars.splice(i, 1); continue }
    }
    for (const car of cars) {
      car.t += car.speed * dt
      while (car.t >= 1) {
        stepCar(car)
        if (!isRoad(car.nr, car.nc)) { car.nr = car.pr; car.nc = car.pc }
      }
      const fx = car.nc - car.c, fz = car.nr - car.r
      const bx = car.c + 0.5 + fx * car.t, bz = car.r + 0.5 + fz * car.t
      const rx = -fz, rz = fx // 진행 방향의 오른쪽
      car.ox += (rx * 0.17 - car.ox) * Math.min(1, dt * 7)
      car.oz += (rz * 0.17 - car.oz) * Math.min(1, dt * 7)
      const target = Math.atan2(fx, fz)
      let d = target - car.heading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      car.heading += d * Math.min(1, dt * 9)
      const x = bx + car.ox, z = bz + car.oz
      dummy.scale.setScalar(1)
      dummy.rotation.set(0, car.heading, 0)
      dummy.position.set(x, 0.07, z); dummy.updateMatrix(); carBody.setMatrixAt(n, dummy.matrix)
      carBody.setColorAt(n, tmpCol.setHex(car.color))
      dummy.position.set(x - Math.sin(car.heading) * 0.02, 0.145, z - Math.cos(car.heading) * 0.02); dummy.updateMatrix(); carCabin.setMatrixAt(n, dummy.matrix)
      // 앞등 두 개
      for (const side of [-1, 1]) {
        const lx = x + Math.sin(car.heading) * 0.175 + Math.cos(car.heading) * 0.055 * side
        const lz = z + Math.cos(car.heading) * 0.175 - Math.sin(car.heading) * 0.055 * side
        dummy.position.set(lx, 0.075, lz); dummy.updateMatrix(); carLights.setMatrixAt(n * 2 + (side > 0 ? 1 : 0), dummy.matrix)
      }
      n++
    }
    carBody.count = carCabin.count = n
    carLights.count = n * 2
    carBody.instanceMatrix.needsUpdate = carCabin.instanceMatrix.needsUpdate = carLights.instanceMatrix.needsUpdate = true
    if (carBody.instanceColor) carBody.instanceColor.needsUpdate = true
    carLights.material.color.setRGB(0.35 + 0.65 * night, 0.32 + 0.6 * night, 0.2 + 0.4 * night)
  }

  // ---- 낮밤 ----
  const state = { tod: 0.33 } // 0=자정, 0.25=해뜸, 0.5=정오, 0.75=해짐
  const cDay = new THREE.Color(0xbfe3ff), cNight = new THREE.Color(0x0b1226), cDusk = new THREE.Color(0xf0a070)
  const sky = new THREE.Color()
  const sunCol = new THREE.Color()
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  let lastNight = -1
  function applyTime() {
    const a = 2 * Math.PI * (state.tod - 0.25)
    const elev = Math.sin(a)
    const day = smooth(-0.12, 0.3, elev)
    const night = 1 - day
    const twilight = Math.max(0, 1 - Math.abs(elev) / 0.28) * 0.65
    sky.copy(cNight).lerp(cDay, day).lerp(cDusk, twilight)
    scene.background.copy(sky)
    scene.fog.color.copy(sky)
    sun.position.set(COLS / 2 + Math.cos(a) * 30, Math.sin(a) * 32 + 1, ROWS / 2 - 9)
    sun.intensity = 2.3 * smooth(-0.02, 0.35, elev)
    sunCol.setHex(0xfff0d0).lerp(new THREE.Color(0xff9a50), Math.max(0, 1 - elev * 3) * (elev < 0.35 ? 1 : 0))
    sun.color.copy(sunCol)
    sun.castShadow = elev > 0.02
    moonLight.position.set(COLS / 2 - Math.cos(a) * 30, -Math.sin(a) * 32 + 1, ROWS / 2 + 9)
    moonLight.intensity = 0.55 * night
    hemi.intensity = 0.22 + 0.8 * day
    hemi.color.setHex(0xdff0ff).lerp(new THREE.Color(0x6a7cc8), night * 0.8)
    water.material.color.setHex(0x3a86c8).lerp(new THREE.Color(0x0e2a52), night * 0.85)
    moon.position.set(COLS / 2 - Math.cos(a) * 110, -Math.sin(a) * 110, ROWS / 2 + 30)
    moon.visible = -Math.sin(a) > 0.05
    stars.material.opacity = Math.max(0, night - 0.25) * 1.2
    if (Math.abs(night - lastNight) > 0.01) {
      lastNight = night
      const glow = Math.min(1.2, night * 1.3 + twilight * 0.4)
      for (const m of glowMats) m.emissiveIntensity = glow
      lampBulb.material.color.setRGB(0.4 + 0.6 * night, 0.36 + 0.55 * night, 0.22 + 0.3 * night)
      lampGlow.material.opacity = Math.min(1, night * 1.2)
    }
    return night
  }
  function hourText() {
    const h = Math.floor(state.tod * 24) % 24
    const m = Math.floor((state.tod * 24 * 60) % 60)
    return `${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`
  }

  // ---- 호버 표시 ----
  const hoverPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.45, depthWrite: false }))
  hoverPlane.rotation.x = -Math.PI / 2
  hoverPlane.position.y = 0.03
  hoverPlane.visible = false
  const hoverGhost = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.35, depthWrite: false }))
  hoverGhost.visible = false
  const hoverEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffe066 }))
  hoverEdge.rotation.x = -Math.PI / 2
  hoverEdge.position.y = 0.04
  scene.add(hoverPlane, hoverGhost, hoverEdge)
  hoverEdge.visible = false
  function setHover(r, c, color, ghostH) {
    if (r === null) { hoverPlane.visible = hoverGhost.visible = hoverEdge.visible = false; return }
    hoverPlane.visible = hoverEdge.visible = true
    hoverPlane.position.x = hoverEdge.position.x = c + 0.5
    hoverPlane.position.z = hoverEdge.position.z = r + 0.5
    hoverPlane.material.color.setHex(color)
    hoverEdge.material.color.setHex(color === 0xff5050 ? 0xff3030 : 0xffe066)
    hoverGhost.visible = ghostH > 0
    if (ghostH > 0) {
      hoverGhost.scale.y = ghostH / 0.8
      hoverGhost.position.set(c + 0.5, ghostH / 2, r + 0.5)
      hoverGhost.material.color.setHex(color)
    }
  }

  // ---- 투영 / 피킹 ----
  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()
  function pick(sx, sy) {
    applyCamera(); camera.updateMatrixWorld()
    ray.setFromCamera(new THREE.Vector2((sx / VIEW_W) * 2 - 1, -(sy / VIEW_H) * 2 + 1), camera)
    if (!ray.ray.intersectPlane(plane, hit)) return null
    const c = Math.floor(hit.x), r = Math.floor(hit.z)
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? { row: r, col: c } : null
  }
  const pv = new THREE.Vector3()
  function project(tx, ty, tz) {
    pv.set(tx, ty, tz).project(camera)
    return { x: (pv.x * 0.5 + 0.5) * VIEW_W, y: (-pv.y * 0.5 + 0.5) * VIEW_H, visible: pv.z < 1 && pv.z > -1 }
  }

  // ---- 매 프레임 ----
  function render(now, dt, scale = 1) {
    applyCamera()
    camera.updateMatrixWorld()
    if (terrainDirty) { terrainTex.needsUpdate = true; terrainDirty = false }
    // 지을 때 통통 튀기
    for (const { group, born } of meshes.values()) {
      const age = now - born
      if (age < 0.45) {
        const k = age / 0.45
        group.scale.set(1 + 0.12 * Math.sin(Math.PI * k), Math.max(0.05, k < 0.5 ? k * 2.4 : 1 + 0.2 * Math.sin(Math.PI * (k - 0.5) * 2)), 1 + 0.12 * Math.sin(Math.PI * k))
      } else if (group.scale.y !== 1) group.scale.set(1, 1, 1)
    }
    // 굴뚝 연기
    for (const s of smokers) {
      if (!s.group.parent) continue
      s.puffs.forEach((p, i) => {
        const ph = (now * 0.35 + s.phase + i / 3) % 1
        p.position.set(s.x + ph * 0.18, s.y + 0.05 + ph * 0.7, s.z)
        p.scale.setScalar(0.6 + ph * 1.6)
        p.material.opacity = 0.55 * (1 - ph)
      })
    }
    water.position.y = -0.55 + Math.sin(now * 0.8) * 0.02
    if (scale > 0) state.tod = (state.tod + (dt * scale) / 150) % 1 // 하루 = 150초(1배속)
    const night = applyTime()
    if (lampsDirty) rebuildLamps()
    updateCars(dt * scale, night, now)
    renderer.render(scene, camera)
  }
  // 파괴된 건물의 연기 목록 정리
  function pruneSmokers() { for (let i = smokers.length - 1; i >= 0; i--) if (!smokers[i].group.parent) smokers.splice(i, 1) }

  // 저장 불러오기/새로 시작: 타일 상태 전체를 3D에 다시 반영
  function rebuildAll() {
    for (const m of meshes.values()) scene.remove(m.group)
    meshes.clear()
    smokers.length = 0
    cars.length = 0
    treeSlots.forEach((_, i) => placeTree(i, true))
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = tiles[r][c]
      const k = key(r, c)
      const ti = treeAt[k]
      if (ti !== undefined && t.type !== 'empty') placeTree(ti, false)
      if ((t.type === 'res' || t.type === 'com' || t.type === 'ind') && t.level > 0) {
        const group = buildBuilding(t, r, c)
        scene.add(group)
        meshes.set(k, { group, born: 0 })
      }
    }
    trunkMesh.instanceMatrix.needsUpdate = true
    leafMesh.instanceMatrix.needsUpdate = true
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
    repaintAll()
    lampsDirty = true
  }
  rebuildAll()
  trunkMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceMatrix.needsUpdate = true
  applyCamera()

  return { view, refreshTile, setHover, pick, project, render, pruneSmokers, repaintAll, rebuildAll, getTime: () => state.tod, hourText, setTime: (t) => { state.tod = t }, isNight: () => lastNight > 0.5 }
}
