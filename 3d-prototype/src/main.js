import * as THREE from 'three'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x202634)
scene.fog = new THREE.Fog(0x202634, 20, 70)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9))
const sun = new THREE.DirectionalLight(0xffffff, 1.0)
sun.position.set(10, 20, 10)
scene.add(sun)

// Ground: a big flat plane plus a grid overlay so movement has a visual reference.
const GROUND_SIZE = 100
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x3a5a40 }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)
scene.add(new THREE.GridHelper(GROUND_SIZE, 40, 0x2a3a2a, 0x2a3a2a))

// A few scattered landmark boxes so walking around actually feels like going somewhere.
// Each one is also solid: `landmarkBoxes` holds the collision data `boxBlocks()` checks
// against, including its height so a high enough jump can clear a short box.
const landmarkMat = new THREE.MeshStandardMaterial({ color: 0xcc6633 })
const LANDMARKS = [
  [8, 1, 4],
  [-10, 1.5, -6],
  [14, 1, -12],
  [-6, 1, 12],
  [0, 2, -20],
  [20, 1, 6],
]
const BOX_HALF_SIZE = 1 // landmark boxes are 2x2 in footprint
const landmarkBoxes = []
for (const [x, halfHeight, z] of LANDMARKS) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, halfHeight * 2, 2), landmarkMat)
  box.position.set(x, halfHeight, z)
  scene.add(box)
  landmarkBoxes.push({ x, z, height: halfHeight * 2 })
}

// Player: capsule body + sphere head + a small nose cone marking facing direction.
const player = new THREE.Group()
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 0.8, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x3f7fd1 }),
)
body.position.y = 0.8
player.add(body)
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xf2c79b }),
)
head.position.y = 1.55
player.add(head)
const nose = new THREE.Mesh(
  new THREE.ConeGeometry(0.08, 0.2, 8),
  new THREE.MeshStandardMaterial({ color: 0xffe066 }),
)
nose.rotation.x = Math.PI / 2
nose.position.set(0, 1.55, 0.3)
player.add(nose)
scene.add(player)

// Keyboard input. Jump is triggered here (edge-style, gated on `grounded`)
// rather than read as a held key, so holding Space doesn't bunny-hop.
const heldKeys = new Set()
const JUMP_KEYS = [' ', 'spacebar']
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  heldKeys.add(key)
  if (JUMP_KEYS.includes(key) && grounded) {
    velocityY = JUMP_SPEED
    grounded = false
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))

const MOVE_KEYS = {
  forward: ['w', 'arrowup'],
  back: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
}
function held(names) {
  return names.some((k) => heldKeys.has(k))
}

// Mouse-drag orbit camera: yaw/pitch around the player, no pointer lock needed.
let yaw = Math.PI
let pitch = 0.5
const ORBIT_DISTANCE = 7
let dragging = false
let lastPointer = { x: 0, y: 0 }

renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true
  lastPointer = { x: e.clientX, y: e.clientY }
})
window.addEventListener('pointerup', () => {
  dragging = false
})
window.addEventListener('pointermove', (e) => {
  if (!dragging) return
  const dx = e.clientX - lastPointer.x
  const dy = e.clientY - lastPointer.y
  lastPointer = { x: e.clientX, y: e.clientY }
  yaw -= dx * 0.005
  pitch = Math.min(1.3, Math.max(0.1, pitch - dy * 0.005))
})

function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

const PLAYER_SPEED = 6
const PLAYER_RADIUS = 0.5
const GROUND_HALF = GROUND_SIZE / 2 - 1
let facingAngle = 0

// A box only blocks movement up to its own height, so jumping high enough
// clears short ones instead of bumping into them like an invisible wall.
function boxBlocks(x, z, y) {
  for (const box of landmarkBoxes) {
    const half = BOX_HALF_SIZE + PLAYER_RADIUS
    if (Math.abs(x - box.x) < half && Math.abs(z - box.z) < half && y < box.height - 0.05) {
      return true
    }
  }
  return false
}

const GRAVITY = 20
const JUMP_SPEED = 10 // peak height v²/2g ≈ 2.5, enough to clear the 2-unit-tall boxes
let velocityY = 0
let grounded = true

function updateVertical(dt) {
  velocityY -= GRAVITY * dt
  player.position.y += velocityY * dt
  if (player.position.y <= 0) {
    player.position.y = 0
    velocityY = 0
    grounded = true
  }
}

function updatePlayer(dt) {
  let moveX = 0
  let moveZ = 0
  if (held(MOVE_KEYS.forward)) moveZ -= 1
  if (held(MOVE_KEYS.back)) moveZ += 1
  if (held(MOVE_KEYS.left)) moveX -= 1
  if (held(MOVE_KEYS.right)) moveX += 1
  if (moveX === 0 && moveZ === 0) return

  const len = Math.hypot(moveX, moveZ)
  moveX /= len
  moveZ /= len

  // Move relative to the camera's current yaw, so "forward" is always away from the camera.
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  const worldX = moveX * cos - moveZ * sin
  const worldZ = moveX * sin + moveZ * cos

  // Resolve each axis separately so the player slides along a box's edge
  // instead of stopping dead when moving diagonally into it.
  const nextX = player.position.x + worldX * PLAYER_SPEED * dt
  if (!boxBlocks(nextX, player.position.z, player.position.y)) {
    player.position.x = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextX))
  }
  const nextZ = player.position.z + worldZ * PLAYER_SPEED * dt
  if (!boxBlocks(player.position.x, nextZ, player.position.y)) {
    player.position.z = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextZ))
  }

  const targetAngle = Math.atan2(worldX, worldZ)
  facingAngle += angleDelta(facingAngle, targetAngle) * Math.min(1, dt * 10)
  player.rotation.y = facingAngle
}

function updateCamera() {
  const x = player.position.x + Math.sin(yaw) * ORBIT_DISTANCE * Math.cos(pitch)
  const z = player.position.z + Math.cos(yaw) * ORBIT_DISTANCE * Math.cos(pitch)
  const y = Math.sin(pitch) * ORBIT_DISTANCE + 1.0
  camera.position.set(x, y, z)
  camera.lookAt(player.position.x, player.position.y + 1.2, player.position.z)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  updatePlayer(dt)
  updateVertical(dt)
  updateCamera()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
