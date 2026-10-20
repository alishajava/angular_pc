import * as THREE from 'three'

const SKY_COLOR = 0x9fd4f0

const scene = new THREE.Scene()
scene.background = new THREE.Color(SKY_COLOR)
scene.fog = new THREE.Fog(SKY_COLOR, 30, 85)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8caf, 1.4))
const sun = new THREE.DirectionalLight(0xffffff, 1.8)
sun.position.set(10, 20, 10)
scene.add(sun)
scene.add(new THREE.AmbientLight(0xffffff, 0.4))

// Ground: a big flat plane plus a grid overlay so movement has a visual reference.
const GROUND_SIZE = 100
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x5fa85f }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)
scene.add(new THREE.GridHelper(GROUND_SIZE, 40, 0x3f7a3f, 0x3f7a3f))

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

// Player: torso + head, plus four limbs that each hang from a pivot Group
// positioned at the joint (shoulder/hip) so rotating the pivot swings the
// limb like a real joint instead of just translating a shape.
const SKIN = 0xf2c79b
const OUTFIT = 0x3f7fd1
const BOOTS = 0x2b2440

const player = new THREE.Group()

const torso = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.3, 0.3, 4, 8),
  new THREE.MeshStandardMaterial({ color: OUTFIT }),
)
torso.position.y = 1.05
player.add(torso)

const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshStandardMaterial({ color: SKIN }))
head.position.y = 1.55
player.add(head)

const nose = new THREE.Mesh(
  new THREE.ConeGeometry(0.08, 0.2, 8),
  new THREE.MeshStandardMaterial({ color: 0xffe066 }),
)
nose.rotation.x = Math.PI / 2
nose.position.set(0, 1.55, 0.3)
player.add(nose)

// Builds one limb: a pivot Group at the joint, with the limb mesh hanging
// below it offset by half its length, so `pivot.rotation.x` swings it
// forward/back around the joint rather than around its own center.
function makeLimb(color, radius, length, jointX, jointY) {
  const pivot = new THREE.Group()
  pivot.position.set(jointX, jointY, 0)
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.05, length - radius * 2), 4, 8),
    new THREE.MeshStandardMaterial({ color }),
  )
  mesh.position.y = -length / 2
  pivot.add(mesh)
  player.add(pivot)
  return pivot
}

const armL = makeLimb(SKIN, 0.07, 0.5, -0.36, 1.3)
const armR = makeLimb(SKIN, 0.07, 0.5, 0.36, 1.3)
const legL = makeLimb(BOOTS, 0.1, 0.75, -0.14, 0.75)
const legR = makeLimb(BOOTS, 0.1, 0.75, 0.14, 0.75)

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

// The box (if any) whose top footprint (x, z) is over, tallest first -
// i.e. what the player should land on if falling straight down here.
function supportingBox(x, z) {
  let best = null
  for (const box of landmarkBoxes) {
    if (Math.abs(x - box.x) < BOX_HALF_SIZE && Math.abs(z - box.z) < BOX_HALF_SIZE) {
      if (!best || box.height > best.height) best = box
    }
  }
  return best
}

// Pushes the player back out of any box it's overlapping from the side,
// below that box's height (a box never blocks the side once the player
// is standing at or above its top). Run every frame, after free movement,
// instead of gating proposed moves ahead of time - that approach could
// either trap the player mid-fall right next to the box they just stepped
// off, or (if exempted too loosely) let them walk back through its side
// and get snapped back up onto it. Continuous correction has neither
// failure mode: it can't trap you, and it can't be tunnelled through.
function resolveBoxCollisions() {
  const half = BOX_HALF_SIZE + PLAYER_RADIUS
  for (const box of landmarkBoxes) {
    if (player.position.y >= box.height - 0.05) continue
    const dx = player.position.x - box.x
    const dz = player.position.z - box.z
    if (Math.abs(dx) >= half || Math.abs(dz) >= half) continue

    const penX = half - Math.abs(dx)
    const penZ = half - Math.abs(dz)
    if (penX < penZ) {
      player.position.x = box.x + Math.sign(dx || 1) * half
    } else {
      player.position.z = box.z + Math.sign(dz || 1) * half
    }
  }
}

const GRAVITY = 20
const JUMP_SPEED = 10 // peak height v²/2g ≈ 2.5, enough to clear the 2-unit-tall boxes
let velocityY = 0
let grounded = true

function updateVertical(dt) {
  velocityY -= GRAVITY * dt
  const nextY = player.position.y + velocityY * dt
  const support = supportingBox(player.position.x, player.position.z)
  const floor = support ? support.height : 0
  if (nextY <= floor) {
    player.position.y = floor
    velocityY = 0
    grounded = true
  } else {
    player.position.y = nextY
    grounded = false
  }
}

// Swings the arms and legs opposite each other (left arm with right leg,
// like a real gait) while moving, and eases them back to a neutral stance
// as soon as movement stops instead of snapping straight back to rest.
let walkPhase = 0
const WALK_RATE = 8
const ARM_SWING = 0.6
const LEG_SWING = 0.5

function updateLimbs(dt, moving) {
  if (moving) {
    walkPhase += dt * WALK_RATE
    const swing = Math.sin(walkPhase)
    armL.rotation.x = swing * ARM_SWING
    armR.rotation.x = -swing * ARM_SWING
    legL.rotation.x = -swing * LEG_SWING
    legR.rotation.x = swing * LEG_SWING
  } else {
    armL.rotation.x *= 0.85
    armR.rotation.x *= 0.85
    legL.rotation.x *= 0.85
    legR.rotation.x *= 0.85
  }
}

function updatePlayer(dt) {
  let moveX = 0
  let moveZ = 0
  if (held(MOVE_KEYS.forward)) moveZ -= 1
  if (held(MOVE_KEYS.back)) moveZ += 1
  if (held(MOVE_KEYS.left)) moveX -= 1
  if (held(MOVE_KEYS.right)) moveX += 1
  const moving = moveX !== 0 || moveZ !== 0
  updateLimbs(dt, moving)
  if (!moving) return

  const len = Math.hypot(moveX, moveZ)
  moveX /= len
  moveZ /= len

  // Move relative to the camera's current yaw, so "forward" is always away from the camera.
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  const worldX = moveX * cos - moveZ * sin
  const worldZ = moveX * sin + moveZ * cos

  const nextX = player.position.x + worldX * PLAYER_SPEED * dt
  player.position.x = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextX))
  const nextZ = player.position.z + worldZ * PLAYER_SPEED * dt
  player.position.z = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextZ))

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
  resolveBoxCollisions()
  updateVertical(dt)
  updateCamera()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
