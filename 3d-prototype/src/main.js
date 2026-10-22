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
// Solid meshes the orbit camera should raycast against (see updateCamera)
// so it never ends up outside a wall looking back through it.
const cameraBlockers = []
for (const [x, halfHeight, z] of LANDMARKS) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, halfHeight * 2, 2), landmarkMat)
  box.position.set(x, halfHeight, z)
  scene.add(box)
  landmarkBoxes.push({ x, z, height: halfHeight * 2 })
  cameraBlockers.push(box)
}

// A simple house: four walls (one split around a doorway) plus a floor
// and a pyramid roof. Unlike the landmark boxes above (uniform 2x2
// squares), walls need independent x/z half-extents, so they get their
// own `walls` collision list and `resolveWallCollisions` below rather
// than reusing `landmarkBoxes`.
const WALL_THICK = 0.3
const WALL_HEIGHT = 3.2
const DOOR_WIDTH = 1.4
const HOUSE_CENTER = { x: -16, z: 2 }
const HOUSE_HALF = 3
const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b5 })
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b4a3a })
const floorMat = new THREE.MeshStandardMaterial({ color: 0x9c6b43 })
const walls = []

function addWall(cx, cz, halfX, halfZ) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, WALL_HEIGHT, halfZ * 2), wallMat)
  mesh.position.set(cx, WALL_HEIGHT / 2, cz)
  scene.add(mesh)
  walls.push({ x: cx, z: cz, halfX, halfZ })
  cameraBlockers.push(mesh)
}

{
  const { x: hx, z: hz } = HOUSE_CENTER
  const S = HOUSE_HALF
  const T = WALL_THICK
  const doorHalf = DOOR_WIDTH / 2

  addWall(hx, hz - S, S + T / 2, T / 2) // north wall
  addWall(hx, hz + S, S + T / 2, T / 2) // south wall
  addWall(hx - S, hz, T / 2, S + T / 2) // west wall

  // East wall faces the rest of the map, split into two segments around the doorway.
  const segLen = S - doorHalf
  addWall(hx + S, hz - (doorHalf + segLen / 2), T / 2, segLen / 2 + T / 2)
  addWall(hx + S, hz + (doorHalf + segLen / 2), T / 2, segLen / 2 + T / 2)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(hx, 0.02, hz)
  scene.add(floor)

  const roofHeight = 1.8
  // radialSegments=4 makes a square pyramid; rotate 45° so its flat faces
  // line up with the walls instead of its edges.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(S * Math.SQRT2 + 0.3, roofHeight, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.set(hx, WALL_HEIGHT + roofHeight / 2, hz)
  scene.add(roof)
  cameraBlockers.push(roof)
}

// A character is a torso + head, plus four limbs that each hang from a
// pivot Group positioned at the joint (shoulder/hip) so rotating the
// pivot swings the limb like a real joint instead of just translating a
// shape. Legs are two segments (hip -> knee) so a knee bend actually
// looks like one. Used for both the player and the NPCs below, with a
// different outfit color per character.
const SKIN = 0xf2c79b
const BOOTS = 0x2b2440

function makeLimb(group, color, radius, length, jointX, jointY) {
  const pivot = new THREE.Group()
  pivot.position.set(jointX, jointY, 0)
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.05, length - radius * 2), 4, 8),
    new THREE.MeshStandardMaterial({ color }),
  )
  mesh.position.y = -length / 2
  pivot.add(mesh)
  group.add(pivot)
  return pivot
}

function makeLeg(group, color, radius, upperLen, lowerLen, jointX, jointY) {
  const hip = new THREE.Group()
  hip.position.set(jointX, jointY, 0)
  const upperMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.05, upperLen - radius * 2), 4, 8),
    new THREE.MeshStandardMaterial({ color }),
  )
  upperMesh.position.y = -upperLen / 2
  hip.add(upperMesh)

  const knee = new THREE.Group()
  knee.position.y = -upperLen
  hip.add(knee)
  const lowerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius * 0.85, Math.max(0.05, lowerLen - radius * 1.7), 4, 8),
    new THREE.MeshStandardMaterial({ color }),
  )
  lowerMesh.position.y = -lowerLen / 2
  knee.add(lowerMesh)

  group.add(hip)
  return { hip, knee }
}

function createCharacter(outfitColor) {
  const group = new THREE.Group()

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.3, 4, 8),
    new THREE.MeshStandardMaterial({ color: outfitColor }),
  )
  torso.position.y = 1.05
  group.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshStandardMaterial({ color: SKIN }))
  head.position.y = 1.55
  group.add(head)

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe066 }),
  )
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 1.55, 0.3)
  group.add(nose)

  const armL = makeLimb(group, SKIN, 0.07, 0.5, -0.36, 1.3)
  const armR = makeLimb(group, SKIN, 0.07, 0.5, 0.36, 1.3)
  const legL = makeLeg(group, BOOTS, 0.1, 0.38, 0.37, -0.14, 0.75)
  const legR = makeLeg(group, BOOTS, 0.1, 0.38, 0.37, 0.14, 0.75)

  scene.add(group)
  return { group, armL, armR, legL, legR }
}

// The player's own limb refs stay top-level (armL, armR, legL, legR) since
// the rest of this file already addresses them that way.
const { group: player, armL, armR, legL, legR } = createCharacter(0x3f7fd1)

// Two NPCs standing around, with a gentle idle sway (see updateNpcs) so
// the world doesn't feel frozen when the player isn't near them.
const npcs = [
  { ...createCharacter(0xd1553f), phase: 0 },
  { ...createCharacter(0x55b86a), phase: 2.1 },
]
npcs[0].group.position.set(4, 0, -3)
npcs[0].group.rotation.y = Math.PI * 0.6
npcs[1].group.position.set(-4, 0, 9)
npcs[1].group.rotation.y = -Math.PI * 0.3

// Keyboard input. Jump is triggered here (edge-style, gated on `grounded`
// and not already mid-jump-animation) rather than read as a held key, so
// holding Space doesn't bunny-hop or restart the windup mid-crouch.
const heldKeys = new Set()
const JUMP_KEYS = [' ', 'spacebar']
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  heldKeys.add(key)
  if (JUMP_KEYS.includes(key) && grounded && jumpState === 'none') {
    jumpState = 'windup'
    jumpStateT = 0
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

// Same idea as resolveBoxCollisions, but with independent x/z half-extents
// per wall (so a wall segment can be long and thin) and no height
// exemption - walls are always taller than the player can jump, so unlike
// the landmark boxes there's no "stand on top" case to account for.
function resolveWallCollisions() {
  for (const wall of walls) {
    const halfX = wall.halfX + PLAYER_RADIUS
    const halfZ = wall.halfZ + PLAYER_RADIUS
    const dx = player.position.x - wall.x
    const dz = player.position.z - wall.z
    if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) continue

    const penX = halfX - Math.abs(dx)
    const penZ = halfZ - Math.abs(dz)
    if (penX < penZ) {
      player.position.x = wall.x + Math.sign(dx || 1) * halfX
    } else {
      player.position.z = wall.z + Math.sign(dz || 1) * halfZ
    }
  }
}

// Same idea as resolveBoxCollisions, but circular (NPCs are standing
// characters, not axis-aligned blocks) and with no "stand on top" case -
// an NPC is just solid from the ground up to about head height.
const NPC_RADIUS = 0.45
const NPC_HEIGHT = 1.8

function resolveNpcCollisions() {
  const minDist = NPC_RADIUS + PLAYER_RADIUS
  for (const npc of npcs) {
    if (player.position.y >= NPC_HEIGHT - 0.05) continue
    const dx = player.position.x - npc.group.position.x
    const dz = player.position.z - npc.group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist >= minDist) continue
    const push = minDist - dist
    const [nx, nz] = dist > 0.0001 ? [dx / dist, dz / dist] : [1, 0]
    player.position.x += nx * push
    player.position.z += nz * push
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

// NPCs just stand around, with a slow arm sway so they read as alive
// rather than frozen. Each has its own phase offset so they don't sway
// in lockstep.
let npcTime = 0
const IDLE_SWAY_RATE = 1.6
const IDLE_SWAY_AMOUNT = 0.3

function updateNpcs(dt) {
  npcTime += dt
  for (const npc of npcs) {
    const sway = Math.sin(npcTime * IDLE_SWAY_RATE + npc.phase) * IDLE_SWAY_AMOUNT
    npc.armL.rotation.x = sway
    npc.armR.rotation.x = -sway
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
    legL.hip.rotation.x = -swing * LEG_SWING
    legR.hip.rotation.x = swing * LEG_SWING
  } else {
    armL.rotation.x *= 0.85
    armR.rotation.x *= 0.85
    legL.hip.rotation.x *= 0.85
    legR.hip.rotation.x *= 0.85
  }
}

// Jump squat-and-stretch: a brief windup (knees bend, player squashes down)
// before the actual upward velocity is applied, then an extend phase
// (knees and squash spring back to neutral) that plays out while rising.
// `updateJumpAnim` overrides the legs' hip/knee rotation and the player's
// scale whenever it's active, taking priority over the walk cycle.
const JUMP_WINDUP = 0.1
const JUMP_EXTEND = 0.18
const KNEE_BEND_MAX = 0.9
const SQUASH_MIN = 0.85
let jumpState = 'none' // 'none' | 'windup' | 'extend'
let jumpStateT = 0

function applyLegPose(kneeBend, hipTilt, squash) {
  legL.knee.rotation.x = kneeBend
  legR.knee.rotation.x = kneeBend
  legL.hip.rotation.x = -hipTilt
  legR.hip.rotation.x = -hipTilt
  player.scale.y = squash
}

function updateJumpAnim(dt) {
  if (jumpState === 'windup') {
    jumpStateT += dt
    const t = Math.min(1, jumpStateT / JUMP_WINDUP)
    applyLegPose(t * KNEE_BEND_MAX, t * 0.25, 1 - t * (1 - SQUASH_MIN))
    if (t >= 1) {
      velocityY = JUMP_SPEED
      grounded = false
      jumpState = 'extend'
      jumpStateT = 0
    }
  } else if (jumpState === 'extend') {
    jumpStateT += dt
    const t = Math.min(1, jumpStateT / JUMP_EXTEND)
    const ease = 1 - (1 - t) ** 3 // ease-out cubic: a snappy stretch, not a linear one
    applyLegPose(KNEE_BEND_MAX * (1 - ease), 0.25 * (1 - ease), SQUASH_MIN + (1 - SQUASH_MIN) * ease)
    if (t >= 1) {
      jumpState = 'none'
      applyLegPose(0, 0, 1)
    }
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

// Plain orbit-at-fixed-distance breaks as soon as something solid (like
// the house) is smaller than ORBIT_DISTANCE: the camera lands outside
// the wall, looking back through it at the player. Raycasting from the
// player's eye point out along the camera direction and pulling the
// distance in to just short of whatever it hits keeps the camera on the
// player's side of any wall or box.
const cameraRay = new THREE.Raycaster()
const CAMERA_MIN_DISTANCE = 1.2
const CAMERA_HIT_MARGIN = 0.3

function updateCamera() {
  const eyeY = player.position.y + 1.2
  const dirX = Math.sin(yaw) * Math.cos(pitch)
  const dirY = Math.sin(pitch)
  const dirZ = Math.cos(yaw) * Math.cos(pitch)

  let dist = ORBIT_DISTANCE
  cameraRay.set(new THREE.Vector3(player.position.x, eyeY, player.position.z), new THREE.Vector3(dirX, dirY, dirZ))
  cameraRay.far = ORBIT_DISTANCE
  const hit = cameraRay.intersectObjects(cameraBlockers, false)[0]
  if (hit) dist = Math.max(CAMERA_MIN_DISTANCE, hit.distance - CAMERA_HIT_MARGIN)

  camera.position.set(player.position.x + dirX * dist, eyeY + dirY * dist, player.position.z + dirZ * dist)
  camera.lookAt(player.position.x, eyeY, player.position.z)
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
  updateJumpAnim(dt)
  updateNpcs(dt)
  resolveBoxCollisions()
  resolveWallCollisions()
  resolveNpcCollisions()
  updateVertical(dt)
  updateCamera()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
