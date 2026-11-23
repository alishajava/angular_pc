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
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x7a8a60, 1.0))
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2)
  sun.position.set(COLS / 2 + 22, 32, ROWS / 2 - 14)
  sun.target.position.set(COLS / 2, 0, ROWS / 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera
  sc.left = -34; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90
  sun.shadow.bias = -0.0004
  scene.add(sun, sun.target)

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
    const g = cv.getContext('2d')
    g.fillStyle = tint; g.fillRect(0, 0, S, S)
    let sd = seed
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      g.fillStyle = 'rgba(20,30,50,0.85)'
      g.fillRect(x * cell + cell * 0.22, y * cell + cell * 0.2, cell * 0.56, cell * 0.6)
      g.fillStyle = rnd() < lit ? '#ffe9a8' : '#a9d4f0'
      g.fillRect(x * cell + cell * 0.26, y * cell + cell * 0.24, cell * 0.48, cell * 0.52)
    }
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  const std = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  const matFacade = (tex, rx, ry) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }) }
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
    const tex = arr[Math.floor(hash(r, c, 2) * arr.length)]
    return matFacade(tex, Math.max(1, Math.round(w * 1.5)), Math.max(1, Math.round(h * 2.2)))
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
  function render(now, dt) {
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
    renderer.render(scene, camera)
  }
  // 파괴된 건물의 연기 목록 정리
  function pruneSmokers() { for (let i = smokers.length - 1; i >= 0; i--) if (!smokers[i].group.parent) smokers.splice(i, 1) }

  repaintAll()
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = tiles[r][c]
    if (t.level > 0 || treeAt[key(r, c)] !== undefined) refreshTile(r, c)
  }
  trunkMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceMatrix.needsUpdate = true
  applyCamera()

  return { view, refreshTile, setHover, pick, project, render, pruneSmokers, repaintAll }
}
