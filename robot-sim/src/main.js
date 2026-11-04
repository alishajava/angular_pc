import * as THREE from 'three'

// --- DOM refs ---------------------------------------------------------------
const titleScreen = document.getElementById('title-screen')
const startBtn = document.getElementById('start-btn')
const hud = document.getElementById('hud')
const endScreen = document.getElementById('end-screen')
const endTitleEl = document.getElementById('end-title')
const endStatsEl = document.getElementById('end-stats')
const retryBtn = document.getElementById('retry-btn')
const pauseOverlay = document.getElementById('pause-overlay')
const hpFill = document.getElementById('hp-fill')
const heatFill = document.getElementById('heat-fill')
const energyFill = document.getElementById('energy-fill')
const overheatTag = document.getElementById('overheat-tag')
const waveNumEl = document.getElementById('wave-num')
const waveTotalEl = document.getElementById('wave-total')
const killCountEl = document.getElementById('kill-count')
const missileCountEl = document.getElementById('missile-count')
const hitFlashEl = document.getElementById('hit-flash')
const waveBannerEl = document.getElementById('wave-banner')
const radarCanvas = document.getElementById('radar')
const radarCtx = radarCanvas.getContext('2d')

// --- Constants ----------------------------------------------------------------
const WAVE_TOTAL = 5
const ARENA_RADIUS = 55

const MOVE_SPEED = 9
const BOOST_MULT = 1.9
const BOOST_DRAIN = 35
const ENERGY_REGEN = 18
const ENERGY_MAX = 100

const YAW_SENS = 0.0022
const PITCH_SENS = 0.0018
const PITCH_MIN = -0.45
const PITCH_MAX = 0.55

const CAM_DIST = 7
const CAM_HEIGHT = 3.2

const BLASTER_RANGE = 90
const BLASTER_DAMAGE = 8
const BLASTER_INTERVAL = 0.11
const BLASTER_HEAT_PER_SHOT = 8
const HEAT_MAX = 100
const HEAT_DECAY_IDLE = 32
const HEAT_DECAY_FIRING = 9
const OVERHEAT_LOCK = 2.4

const MISSILE_MAX = 6
const MISSILE_DAMAGE = 34
const MISSILE_SPLASH = 4
const MISSILE_COOLDOWN = 1.0
const MISSILE_REGEN_TIME = 7
const MISSILE_SPEED = 30
const MISSILE_TURN_RATE = 2.4
const MISSILE_LIFETIME = 4

const PLAYER_HP_MAX = 100
const PLAYER_RADIUS = 1.6

const ENEMY_HP_BASE = 36
const ENEMY_SPEED = 4.2
const ENEMY_ENGAGE_RANGE = 24
const ENEMY_STOP_RANGE = 16
const ENEMY_FIRE_MIN = 1.6
const ENEMY_FIRE_MAX = 2.8
const ENEMY_PROJ_SPEED = 20
const ENEMY_RADIUS = 1.8

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const rand = (min, max) => Math.random() * (max - min) + min

waveTotalEl.textContent = String(WAVE_TOTAL)

// --- Scene setup ----------------------------------------------------------------
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05070c)
scene.fog = new THREE.Fog(0x0a1220, 55, 160)

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)
const canvas = renderer.domElement

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x1a2638, 1.5)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xdfeaff, 1.8)
sun.position.set(30, 45, 20)
scene.add(sun)
const fill = new THREE.DirectionalLight(0x4d8bff, 0.5)
fill.position.set(-25, 20, -30)
scene.add(fill)

const groundMat = new THREE.MeshStandardMaterial({ color: 0x162236, metalness: 0.1, roughness: 0.95 })
const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS * 1.4, 48), groundMat)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const grid = new THREE.GridHelper(ARENA_RADIUS * 2, 44, 0x2a5a8a, 0x152536)
grid.position.y = 0.02
scene.add(grid)

const boundaryRing = new THREE.Mesh(
  new THREE.RingGeometry(ARENA_RADIUS - 0.4, ARENA_RADIUS, 64),
  new THREE.MeshBasicMaterial({ color: 0x3fa6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
)
boundaryRing.rotation.x = -Math.PI / 2
boundaryRing.position.y = 0.03
scene.add(boundaryRing)

const obstacles = []
for (let i = 0; i < 10; i++) {
  const angle = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2)
  const r = 16 + Math.random() * 30
  const x = Math.sin(angle) * r
  const z = Math.cos(angle) * r
  const h = 3 + Math.random() * 4
  const w = 2 + Math.random() * 1.4
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, w),
    new THREE.MeshStandardMaterial({ color: 0x1b2430, metalness: 0.25, roughness: 0.8 }),
  )
  mesh.position.set(x, h / 2, z)
  scene.add(mesh)
  obstacles.push({ x, z, radius: w * 0.75 })
}

// --- Mech model builder -----------------------------------------------------
function createMechMesh({ bodyColor, accentColor, visorColor, scale = 1 }) {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.45, roughness: 0.5 })
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.5, roughness: 0.4 })
  const visorMat = new THREE.MeshStandardMaterial({ color: visorColor, emissive: visorColor, emissiveIntensity: 1.4, roughness: 0.3 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.3, roughness: 0.7 })

  const legPivotL = new THREE.Group()
  legPivotL.position.set(-0.5, 1.5, 0)
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 1.5, 8), darkMat)
  legL.position.set(0, -0.75, 0)
  legPivotL.add(legL)
  const legPivotR = new THREE.Group()
  legPivotR.position.set(0.5, 1.5, 0)
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 1.5, 8), darkMat)
  legR.position.set(0, -0.75, 0)
  legPivotR.add(legR)
  group.add(legPivotL, legPivotR)

  const hip = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.5, 0.8), bodyMat)
  hip.position.set(0, 1.5, 0)
  group.add(hip)

  const upperBody = new THREE.Group()
  upperBody.position.set(0, 1.75, 0)
  group.add(upperBody)

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.9), bodyMat)
  torso.position.set(0, 0.55, 0)
  upperBody.add(torso)

  const chestAccent = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.14), accentMat)
  chestAccent.position.set(0, 0.65, 0.48)
  upperBody.add(chestAccent)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), bodyMat)
  head.position.set(0, 1.35, 0)
  upperBody.add(head)

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), visorMat)
  visor.position.set(0, 1.35, 0.29)
  upperBody.add(visor)

  function buildArm(sign) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), accentMat)
    shoulder.position.set(sign * 0.95, 1.0, 0)
    upperBody.add(shoulder)
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.7, 8), bodyMat)
    upperArm.position.set(sign * 0.95, 0.55, 0)
    upperBody.add(upperArm)
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8), darkMat)
    gun.rotation.x = Math.PI / 2
    gun.position.set(sign * 0.95, 0.25, 0.55)
    upperBody.add(gun)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(sign * 0.95, 0.25, 1.0)
    upperBody.add(muzzle)
    return { shoulder, upperArm, gun, muzzle }
  }
  const armL = buildArm(-1)
  const armR = buildArm(1)

  const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), accentMat)
  pod.position.set(0.95, 1.55, -0.15)
  upperBody.add(pod)
  const missileMuzzle = new THREE.Object3D()
  missileMuzzle.position.set(0.95, 1.55, 0.25)
  upperBody.add(missileMuzzle)

  group.scale.setScalar(scale)

  return { group, legPivotL, legPivotR, upperBody, armL, armR, missileMuzzle, visor }
}

function worldPos(obj3d) {
  const v = new THREE.Vector3()
  obj3d.getWorldPosition(v)
  return v
}

function getAimDirection(yaw, pitch) {
  const dir = new THREE.Vector3(0, 0, 1)
  const euler = new THREE.Euler(-pitch, yaw, 0, 'YXZ')
  dir.applyEuler(euler)
  return dir
}

// --- Effects (beams / flashes / explosions) ---------------------------------
const effects = []
function spawnEffect(mesh, { duration, fromOpacity, toOpacity, fromScale = 1, toScale = 1 }) {
  mesh.material.transparent = true
  mesh.material.opacity = fromOpacity
  mesh.scale.setScalar(fromScale)
  scene.add(mesh)
  effects.push({ mesh, start: clock.elapsedTime, duration, fromOpacity, toOpacity, fromScale, toScale })
}
function spawnBeam(from, to) {
  const dir = to.clone().sub(from)
  const len = Math.max(0.05, dir.length())
  const geo = new THREE.CylinderGeometry(0.035, 0.035, len, 6, 1, true)
  const mat = new THREE.MeshBasicMaterial({ color: 0x7fe0ff })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(from).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  spawnEffect(mesh, { duration: 0.08, fromOpacity: 0.9, toOpacity: 0 })
  spawnFlash(from)
}
function spawnFlash(pos) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xaee9ff }))
  mesh.position.copy(pos)
  spawnEffect(mesh, { duration: 0.15, fromOpacity: 1, toOpacity: 0, fromScale: 0.5, toScale: 1.3 })
}
function spawnExplosion(pos) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffa94d }))
  mesh.position.copy(pos)
  spawnEffect(mesh, { duration: 0.5, fromOpacity: 0.9, toOpacity: 0, fromScale: 0.3, toScale: 2.4 })
}
function updateEffects() {
  const t = clock.elapsedTime
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]
    const f = Math.min(1, (t - e.start) / e.duration)
    e.mesh.material.opacity = THREE.MathUtils.lerp(e.fromOpacity, e.toOpacity, f)
    e.mesh.scale.setScalar(THREE.MathUtils.lerp(e.fromScale, e.toScale, f))
    if (f >= 1) {
      scene.remove(e.mesh)
      e.mesh.geometry.dispose()
      e.mesh.material.dispose()
      effects.splice(i, 1)
    }
  }
}

// --- Player -------------------------------------------------------------------
const playerBuild = createMechMesh({ bodyColor: 0x3a4958, accentColor: 0x4dd2ff, visorColor: 0x7fe0ff, scale: 1 })
scene.add(playerBuild.group)

const player = {
  pos: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  hp: PLAYER_HP_MAX,
  heat: 0,
  overheatUntil: 0,
  energy: ENERGY_MAX,
  missiles: MISSILE_MAX,
  missileCooldown: 0,
  missileRegenTimer: MISSILE_REGEN_TIME,
  blasterCooldown: 0,
  walkCycle: 0,
  moving: false,
  parts: playerBuild,
}

const raycaster = new THREE.Raycaster()
let lastGun = 'R'

// --- Enemies --------------------------------------------------------------------
const enemies = []
const enemyHitboxes = []
const enemyProjectiles = []
const missiles = []

function spawnEnemy(waveN) {
  const angle = Math.random() * Math.PI * 2
  const r = ARENA_RADIUS * 0.78
  const pos = new THREE.Vector3(Math.sin(angle) * r, 0, Math.cos(angle) * r)
  const hpMax = ENEMY_HP_BASE + (waveN - 1) * 6
  const built = createMechMesh({ bodyColor: 0x3a2628, accentColor: 0xff5a3a, visorColor: 0xff6b4d, scale: 0.92 })
  scene.add(built.group)
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  hitbox.position.y = 1.5
  built.group.add(hitbox)
  const enemy = {
    group: built.group,
    parts: built,
    pos: pos.clone(),
    yaw: 0,
    hp: hpMax,
    hpMax,
    fireTimer: rand(0.6, 1.8),
    moving: false,
    walkCycle: Math.random() * 10,
    hitbox,
    dead: false,
  }
  hitbox.userData.enemyRef = enemy
  enemies.push(enemy)
  enemyHitboxes.push(hitbox)
  return enemy
}

function enemyFire(en) {
  const dir = player.pos.clone().sub(en.pos)
  dir.y = 0
  dir.normalize()
  const muzzlePos = worldPos(en.parts.armR.muzzle)
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff6b4d }))
  mesh.position.copy(muzzlePos)
  scene.add(mesh)
  enemyProjectiles.push({
    mesh,
    pos: muzzlePos.clone(),
    vel: dir.multiplyScalar(ENEMY_PROJ_SPEED),
    life: 4,
    damage: rand(8, 14),
  })
}

function damageEnemy(enemy, dmg) {
  if (enemy.dead) return
  enemy.hp -= dmg
  if (enemy.hp <= 0) killEnemy(enemy)
}

function killEnemy(enemy) {
  if (enemy.dead) return
  enemy.dead = true
  spawnExplosion(enemy.pos.clone().add(new THREE.Vector3(0, 1.3, 0)))
  scene.remove(enemy.group)
  const idx = enemies.indexOf(enemy)
  if (idx >= 0) enemies.splice(idx, 1)
  const hidx = enemyHitboxes.indexOf(enemy.hitbox)
  if (hidx >= 0) enemyHitboxes.splice(hidx, 1)
  state.kills += 1
  checkWaveClear()
}

function updateEnemies(dt) {
  for (const en of enemies) {
    const toPlayer = player.pos.clone().sub(en.pos)
    toPlayer.y = 0
    const dist = toPlayer.length()
    if (dist > ENEMY_STOP_RANGE) {
      const dir = toPlayer.clone().normalize()
      en.pos.addScaledVector(dir, ENEMY_SPEED * dt)
      en.yaw = Math.atan2(dir.x, dir.z)
      en.moving = true
      en.walkCycle += dt * 8
    } else {
      en.moving = false
      if (dist > 0.01) en.yaw = Math.atan2(toPlayer.x, toPlayer.z)
    }
    en.fireTimer -= dt
    if (dist <= ENEMY_ENGAGE_RANGE && en.fireTimer <= 0) {
      enemyFire(en)
      en.fireTimer = rand(ENEMY_FIRE_MIN, ENEMY_FIRE_MAX)
    }
    resolveCircleObstacles(en.pos, ENEMY_RADIUS)
    if (en.pos.length() > ARENA_RADIUS - 1) en.pos.setLength(ARENA_RADIUS - 1)

    en.group.position.copy(en.pos)
    en.group.rotation.y = en.yaw
    if (en.moving) {
      en.parts.legPivotL.rotation.x = Math.sin(en.walkCycle) * 0.5
      en.parts.legPivotR.rotation.x = Math.sin(en.walkCycle + Math.PI) * 0.5
    } else {
      en.parts.legPivotL.rotation.x = THREE.MathUtils.lerp(en.parts.legPivotL.rotation.x, 0, 0.2)
      en.parts.legPivotR.rotation.x = THREE.MathUtils.lerp(en.parts.legPivotR.rotation.x, 0, 0.2)
    }
  }

  // player <-> enemy separation
  for (const en of enemies) {
    const d = player.pos.distanceTo(en.pos)
    const minDist = PLAYER_RADIUS + ENEMY_RADIUS
    if (d < minDist && d > 0.0001) {
      const push = minDist - d
      const dir = player.pos.clone().sub(en.pos).normalize()
      player.pos.addScaledVector(dir, push * 0.5)
      en.pos.addScaledVector(dir, -push * 0.5)
    }
  }
  // enemy <-> enemy separation
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i]
      const b = enemies[j]
      const d = a.pos.distanceTo(b.pos)
      const minDist = ENEMY_RADIUS * 2
      if (d < minDist && d > 0.0001) {
        const push = (minDist - d) * 0.5
        const dir = a.pos.clone().sub(b.pos).normalize()
        a.pos.addScaledVector(dir, push)
        b.pos.addScaledVector(dir, -push)
      }
    }
  }
}

function updateEnemyProjectiles(dt) {
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const p = enemyProjectiles[i]
    p.life -= dt
    p.pos.addScaledVector(p.vel, dt)
    p.mesh.position.copy(p.pos)
    const target = player.pos.clone().add(new THREE.Vector3(0, 1.3, 0))
    const d = p.pos.distanceTo(target)
    if (d < 1.6) {
      damagePlayer(p.damage)
      scene.remove(p.mesh)
      enemyProjectiles.splice(i, 1)
      continue
    }
    if (p.life <= 0) {
      scene.remove(p.mesh)
      enemyProjectiles.splice(i, 1)
    }
  }
}

// --- Obstacle collision -------------------------------------------------------
function resolveCircleObstacles(pos, radius) {
  for (const ob of obstacles) {
    const dx = pos.x - ob.x
    const dz = pos.z - ob.z
    const d = Math.hypot(dx, dz)
    const minDist = radius + ob.radius
    if (d < minDist && d > 0.0001) {
      const push = minDist - d
      pos.x += (dx / d) * push
      pos.z += (dz / d) * push
    }
  }
}

// --- Weapons: player ----------------------------------------------------------
function fireBlaster() {
  player.blasterCooldown = BLASTER_INTERVAL
  player.heat = Math.min(HEAT_MAX, player.heat + BLASTER_HEAT_PER_SHOT)
  if (player.heat >= HEAT_MAX) player.overheatUntil = clock.elapsedTime + OVERHEAT_LOCK

  const aimDir = getAimDirection(player.yaw, player.pitch)
  const headPos = new THREE.Vector3(player.pos.x, player.pos.y + 1.9, player.pos.z)
  raycaster.set(headPos, aimDir)
  raycaster.far = BLASTER_RANGE
  const hits = raycaster.intersectObjects(enemyHitboxes, false)
  let hitPoint
  if (hits.length) {
    hitPoint = hits[0].point
    const enemy = hits[0].object.userData.enemyRef
    damageEnemy(enemy, BLASTER_DAMAGE)
  } else {
    hitPoint = headPos.clone().addScaledVector(aimDir, BLASTER_RANGE)
  }

  const gunPart = lastGun === 'L' ? player.parts.armL.muzzle : player.parts.armR.muzzle
  lastGun = lastGun === 'L' ? 'R' : 'L'
  spawnBeam(worldPos(gunPart), hitPoint)
}

function createMissileMesh() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 }),
  )
  body.rotation.x = Math.PI / 2
  g.add(body)
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.22, 6),
    new THREE.MeshStandardMaterial({ color: 0xff6b4d, emissive: 0xff6b4d, emissiveIntensity: 1.2 }),
  )
  tip.rotation.x = Math.PI / 2
  tip.position.z = 0.4
  g.add(tip)
  return g
}

function fireMissile() {
  if (state.phase !== 'playing') return
  if (player.missiles <= 0 || player.missileCooldown > 0) return
  player.missiles -= 1
  player.missileCooldown = MISSILE_COOLDOWN
  const aimDir = getAimDirection(player.yaw, player.pitch)
  const startPos = worldPos(player.parts.missileMuzzle)
  const mesh = createMissileMesh()
  mesh.position.copy(startPos)
  scene.add(mesh)
  missiles.push({ mesh, pos: startPos.clone(), vel: aimDir.clone().multiplyScalar(MISSILE_SPEED), life: MISSILE_LIFETIME, target: null })
}

function findMissileTarget(pos, vel) {
  const dir = vel.clone().normalize()
  let best = null
  let bestDot = 0.5
  for (const en of enemies) {
    const toE = en.pos.clone().sub(pos)
    const dist = toE.length()
    if (dist > 55) continue
    const dot = toE.normalize().dot(dir)
    if (dot > bestDot) {
      bestDot = dot
      best = en
    }
  }
  return best
}

function explodeMissile(pos) {
  for (const en of [...enemies]) {
    if (en.pos.distanceTo(pos) <= MISSILE_SPLASH) damageEnemy(en, MISSILE_DAMAGE)
  }
  spawnExplosion(pos)
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i]
    m.life -= dt
    if (!m.target || m.target.dead) m.target = findMissileTarget(m.pos, m.vel)
    if (m.target && !m.target.dead) {
      const toTarget = m.target.pos.clone().sub(m.pos).normalize()
      const curDir = m.vel.clone().normalize()
      const newDir = curDir.lerp(toTarget, Math.min(1, MISSILE_TURN_RATE * dt)).normalize()
      m.vel.copy(newDir.multiplyScalar(MISSILE_SPEED))
    }
    m.pos.addScaledVector(m.vel, dt)
    m.mesh.position.copy(m.pos)
    m.mesh.lookAt(m.pos.clone().add(m.vel))

    let exploded = false
    for (const en of enemies) {
      if (en.pos.distanceTo(m.pos) < 2.2) {
        explodeMissile(m.pos)
        exploded = true
        break
      }
    }
    if (!exploded && m.life <= 0) {
      scene.remove(m.mesh)
      missiles.splice(i, 1)
      continue
    }
    if (exploded) {
      scene.remove(m.mesh)
      missiles.splice(i, 1)
    }
  }
}

// --- Player damage / state ---------------------------------------------------
function damagePlayer(dmg) {
  if (state.phase !== 'playing') return
  player.hp = Math.max(0, player.hp - dmg)
  flashHit()
  if (player.hp <= 0) triggerEnd(false)
}
function flashHit() {
  hitFlashEl.style.transition = 'none'
  hitFlashEl.style.opacity = '0.6'
  requestAnimationFrame(() => {
    hitFlashEl.style.transition = 'opacity 0.4s'
    hitFlashEl.style.opacity = '0'
  })
}

// --- Movement / camera ---------------------------------------------------------
const keys = new Set()
let boosting = false
let blasterHeld = false
let pausedForPointer = false

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boosting = true
})
window.addEventListener('keyup', (e) => {
  keys.delete(e.code)
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boosting = false
})

canvas.addEventListener('mousedown', (e) => {
  if (state.phase !== 'playing') return
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock()
    return
  }
  if (e.button === 0) blasterHeld = true
  if (e.button === 2) fireMissile()
})
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) blasterHeld = false
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return
  player.yaw -= e.movementX * YAW_SENS
  player.pitch = clamp(player.pitch - e.movementY * PITCH_SENS, PITCH_MIN, PITCH_MAX)
})

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) {
    blasterHeld = false
    if (state.phase === 'playing') {
      pausedForPointer = true
      pauseOverlay.style.display = 'flex'
    }
  } else {
    pausedForPointer = false
    pauseOverlay.style.display = 'none'
  }
})
pauseOverlay.addEventListener('click', () => {
  if (state.phase === 'playing') canvas.requestPointerLock()
})

function updateMovement(dt) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw))
  const right = new THREE.Vector3(Math.sin(player.yaw + Math.PI / 2), 0, Math.cos(player.yaw + Math.PI / 2))
  let moveX = 0
  let moveZ = 0
  if (keys.has('KeyW')) { moveX += forward.x; moveZ += forward.z }
  if (keys.has('KeyS')) { moveX -= forward.x; moveZ -= forward.z }
  if (keys.has('KeyD')) { moveX += right.x; moveZ += right.z }
  if (keys.has('KeyA')) { moveX -= right.x; moveZ -= right.z }
  const moving = moveX !== 0 || moveZ !== 0
  let speed = MOVE_SPEED
  const wantBoost = boosting && moving && player.energy > 0
  if (wantBoost) {
    speed *= BOOST_MULT
    player.energy = Math.max(0, player.energy - BOOST_DRAIN * dt)
  } else {
    player.energy = Math.min(ENERGY_MAX, player.energy + ENERGY_REGEN * dt)
  }
  if (moving) {
    const len = Math.hypot(moveX, moveZ)
    player.pos.x += (moveX / len) * speed * dt
    player.pos.z += (moveZ / len) * speed * dt
    player.walkCycle += dt * (wantBoost ? 14 : 9)
  }
  player.moving = moving

  resolveCircleObstacles(player.pos, PLAYER_RADIUS)
  if (player.pos.length() > ARENA_RADIUS - 1) player.pos.setLength(ARENA_RADIUS - 1)

  playerBuild.group.position.copy(player.pos)
  playerBuild.group.rotation.y = player.yaw
  playerBuild.upperBody.rotation.x = -player.pitch * 0.6

  if (moving) {
    playerBuild.legPivotL.rotation.x = Math.sin(player.walkCycle) * 0.5
    playerBuild.legPivotR.rotation.x = Math.sin(player.walkCycle + Math.PI) * 0.5
  } else {
    playerBuild.legPivotL.rotation.x = THREE.MathUtils.lerp(playerBuild.legPivotL.rotation.x, 0, 0.2)
    playerBuild.legPivotR.rotation.x = THREE.MathUtils.lerp(playerBuild.legPivotR.rotation.x, 0, 0.2)
  }
}

function updateCamera() {
  const yawDir = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw))
  const aimDir = getAimDirection(player.yaw, player.pitch)
  const headPos = new THREE.Vector3(player.pos.x, player.pos.y + 2.6, player.pos.z)
  const camPos = headPos.clone().addScaledVector(yawDir, -CAM_DIST).add(new THREE.Vector3(0, CAM_HEIGHT, 0))
  camera.position.copy(camPos)
  const lookTarget = headPos.clone().addScaledVector(aimDir, 25)
  camera.lookAt(lookTarget)
}

// --- Weapon timers --------------------------------------------------------------
function updateWeapons(dt) {
  player.blasterCooldown = Math.max(0, player.blasterCooldown - dt)
  const overheated = clock.elapsedTime < player.overheatUntil
  if (blasterHeld && !overheated && player.blasterCooldown <= 0) fireBlaster()
  const firingNow = blasterHeld && !overheated
  player.heat = Math.max(0, player.heat - (firingNow ? HEAT_DECAY_FIRING : HEAT_DECAY_IDLE) * dt)

  player.missileCooldown = Math.max(0, player.missileCooldown - dt)
  player.missileRegenTimer -= dt
  if (player.missileRegenTimer <= 0 && player.missiles < MISSILE_MAX) {
    player.missiles += 1
    player.missileRegenTimer = MISSILE_REGEN_TIME
  }
}

// --- Waves ----------------------------------------------------------------------
const state = {
  phase: 'title',
  wave: 0,
  kills: 0,
  waveTransition: false,
  victoryPending: false,
  nextWaveTime: 0,
}

function startWave(n) {
  state.wave = n
  const count = Math.min(2 + n, 9)
  for (let i = 0; i < count; i++) spawnEnemy(n)
  showWaveBanner(`WAVE ${n}`)
}

function showWaveBanner(text) {
  waveBannerEl.textContent = text
  waveBannerEl.style.transition = 'opacity 0.3s'
  waveBannerEl.style.opacity = '1'
  setTimeout(() => {
    waveBannerEl.style.opacity = '0'
  }, 1600)
}

function checkWaveClear() {
  if (enemies.length === 0 && state.phase === 'playing' && !state.waveTransition) {
    state.waveTransition = true
    if (state.wave >= WAVE_TOTAL) {
      showWaveBanner('ALL WAVES CLEARED')
      state.nextWaveTime = clock.elapsedTime + 1.8
      state.victoryPending = true
    } else {
      showWaveBanner('WAVE CLEAR')
      state.nextWaveTime = clock.elapsedTime + 2.4
      state.victoryPending = false
    }
  }
}

function triggerEnd(victory) {
  state.phase = 'ended'
  blasterHeld = false
  document.exitPointerLock()
  hud.style.display = 'none'
  pauseOverlay.style.display = 'none'
  endScreen.style.display = 'flex'
  endTitleEl.textContent = victory ? 'MISSION COMPLETE' : 'MECH DESTROYED'
  endTitleEl.style.color = victory ? '#5fd0ff' : '#ff5a5a'
  endStatsEl.innerHTML = `WAVE ${state.wave} / ${WAVE_TOTAL} 도달<br/>격파 수: ${state.kills}<br/>생존 HP: ${Math.max(0, Math.round(player.hp))}`
}

// --- HUD / radar ------------------------------------------------------------
function updateHud() {
  hpFill.style.width = `${clamp(player.hp, 0, PLAYER_HP_MAX)}%`
  heatFill.style.width = `${clamp(player.heat, 0, HEAT_MAX)}%`
  energyFill.style.width = `${clamp(player.energy, 0, ENERGY_MAX)}%`
  overheatTag.style.opacity = clock.elapsedTime < player.overheatUntil ? '1' : '0'
  waveNumEl.textContent = String(state.wave)
  killCountEl.textContent = String(state.kills)
  missileCountEl.textContent = String(player.missiles)
}

function drawRadar() {
  const RANGE = 70
  const R = 55
  radarCtx.clearRect(0, 0, 120, 120)
  radarCtx.fillStyle = 'rgba(10,20,30,0.4)'
  radarCtx.beginPath()
  radarCtx.arc(60, 60, 58, 0, Math.PI * 2)
  radarCtx.fill()
  radarCtx.strokeStyle = 'rgba(120,180,230,0.3)'
  radarCtx.beginPath()
  radarCtx.arc(60, 60, 58, 0, Math.PI * 2)
  radarCtx.stroke()

  for (const en of enemies) {
    const dx = en.pos.x - player.pos.x
    const dz = en.pos.z - player.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > RANGE) continue
    const relForward = dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw)
    const relRight = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)
    const rx = 60 + (relRight / RANGE) * R
    const ry = 60 - (relForward / RANGE) * R
    radarCtx.fillStyle = '#ff5a5a'
    radarCtx.beginPath()
    radarCtx.arc(rx, ry, 3.2, 0, Math.PI * 2)
    radarCtx.fill()
  }

  radarCtx.fillStyle = '#5fd0ff'
  radarCtx.beginPath()
  radarCtx.moveTo(60, 54)
  radarCtx.lineTo(55, 66)
  radarCtx.lineTo(65, 66)
  radarCtx.closePath()
  radarCtx.fill()
}

// --- Game loop --------------------------------------------------------------
const clock = new THREE.Clock()

function updateGame(dt) {
  updateMovement(dt)
  updateWeapons(dt)
  updateEnemies(dt)
  updateEnemyProjectiles(dt)
  updateMissiles(dt)
  updateEffects()
  updateCamera()
  updateHud()
  drawRadar()

  if (state.waveTransition && clock.elapsedTime >= state.nextWaveTime) {
    state.waveTransition = false
    if (state.victoryPending) triggerEnd(true)
    else startWave(state.wave + 1)
  }
}

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.05)
  if (state.phase === 'playing' && !pausedForPointer) updateGame(dt)
  renderer.render(scene, camera)
}
animate()

// --- Reset / screen flow -----------------------------------------------------
function resetGame() {
  for (const en of [...enemies]) scene.remove(en.group)
  enemies.length = 0
  enemyHitboxes.length = 0
  for (const p of enemyProjectiles) scene.remove(p.mesh)
  enemyProjectiles.length = 0
  for (const m of missiles) scene.remove(m.mesh)
  missiles.length = 0
  for (const e of effects) scene.remove(e.mesh)
  effects.length = 0

  player.pos.set(0, 0, 0)
  player.yaw = 0
  player.pitch = 0
  player.hp = PLAYER_HP_MAX
  player.heat = 0
  player.overheatUntil = 0
  player.energy = ENERGY_MAX
  player.missiles = MISSILE_MAX
  player.missileCooldown = 0
  player.missileRegenTimer = MISSILE_REGEN_TIME
  player.blasterCooldown = 0
  player.walkCycle = 0

  state.wave = 0
  state.kills = 0
  state.waveTransition = false
  state.victoryPending = false
  state.phase = 'playing'

  startWave(1)
}

startBtn.addEventListener('click', () => {
  titleScreen.style.display = 'none'
  hud.style.display = 'block'
  endScreen.style.display = 'none'
  resetGame()
  canvas.requestPointerLock()
})

retryBtn.addEventListener('click', () => {
  endScreen.style.display = 'none'
  hud.style.display = 'block'
  resetGame()
  canvas.requestPointerLock()
})
