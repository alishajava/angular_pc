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
const landmarkMat = new THREE.MeshStandardMaterial({ color: 0xcc6633 })
const LANDMARKS = [
  [8, 1, 4],
  [-10, 1.5, -6],
  [14, 1, -12],
  [-6, 1, 12],
  [0, 2, -20],
  [20, 1, 6],
]
for (const [x, halfHeight, z] of LANDMARKS) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, halfHeight * 2, 2), landmarkMat)
  box.position.set(x, halfHeight, z)
  scene.add(box)
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

// Keyboard input.
const heldKeys = new Set()
window.addEventListener('keydown', (e) => heldKeys.add(e.key.toLowerCase()))
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
const GROUND_HALF = GROUND_SIZE / 2 - 1
let facingAngle = 0

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

  player.position.x = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, player.position.x + worldX * PLAYER_SPEED * dt))
  player.position.z = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, player.position.z + worldZ * PLAYER_SPEED * dt))

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
  updateCamera()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
