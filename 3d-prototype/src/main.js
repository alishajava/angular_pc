import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SKY_COLOR = 0x9fd4f0

const scene = new THREE.Scene()
scene.background = new THREE.Color(SKY_COLOR)
scene.fog = new THREE.Fog(SKY_COLOR, 30, 85)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6b8caf, 1.4)
scene.add(hemiLight)
const sun = new THREE.DirectionalLight(0xffffff, 1.8)
sun.position.set(10, 20, 10)
scene.add(sun)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
scene.add(ambientLight)

// A small flat-shaded disc standing in for the sun/moon - not physically
// placed relative to the directional light's actual falloff (there isn't
// any at this scale), just parked far along the same direction so the sky
// has something to visibly cross as the day cycles. `fog: false` keeps it
// fully bright at the horizon instead of fading into the sky color, which
// is what actually sells "that's the light source" rather than a blob.
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(5, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
)
scene.add(sunMesh)
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(3.5, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xcdd6e8, fog: false }),
)
scene.add(moonMesh)

// A full day/night cycle every DAY_LENGTH seconds - sky/fog color, the sun's
// color+intensity+position, and the ambient/hemisphere fill lights all
// interpolate between a handful of keyframes across dayTime (0..1, where 0.5
// is noon). Keeping fill-light keyframes alongside the sun's own means dusk
// and dawn warm the whole scene's shadows instead of just the direct light.
const DAY_LENGTH = 180
let dayTime = 0.28
const SKY_KEYFRAMES = [
  { t: 0.0, sky: 0x0a1020, sun: 0x8ea9ff, sunI: 0.1, hemiI: 0.35, hemiGround: 0x0c1830, ambI: 0.08 },
  { t: 0.22, sky: 0xffb37a, sun: 0xffd9a0, sunI: 1.1, hemiI: 0.9, hemiGround: 0x5a4030, ambI: 0.25 },
  { t: 0.5, sky: 0x9fd4f0, sun: 0xffffff, sunI: 1.8, hemiI: 1.4, hemiGround: 0x6b8caf, ambI: 0.4 },
  { t: 0.78, sky: 0xff7e4d, sun: 0xffb37a, sunI: 1.0, hemiI: 0.9, hemiGround: 0x5a3020, ambI: 0.25 },
  { t: 1.0, sky: 0x0a1020, sun: 0x8ea9ff, sunI: 0.1, hemiI: 0.35, hemiGround: 0x0c1830, ambI: 0.08 },
]
// THREE.Color.lerp() interpolates in the renderer's linear working color
// space, not the sRGB space these hex values are written in. For a lerp
// between a near-black keyframe (night) and a bright one (dawn/dusk), that
// difference isn't cosmetic: dark sRGB values map to tiny linear values, so
// even a 10% linear-space blend toward the bright color overshoots into a
// muddy, desaturated brown rather than a subtle tint. Lerping the raw sRGB
// byte components ourselves and only converting to a THREE.Color at the end
// (via setHex, a single sRGB->linear conversion for correct rendering)
// keeps the perceived color changing smoothly across the whole cycle.
function lerpHex(hexA, hexB, t) {
  const ar = (hexA >> 16) & 255, ag = (hexA >> 8) & 255, ab = hexA & 255
  const br = (hexB >> 16) & 255, bg = (hexB >> 8) & 255, bb = hexB & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const b = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | b
}

function updateDayNight(dt) {
  dayTime = (dayTime + dt / DAY_LENGTH) % 1

  let kf0 = SKY_KEYFRAMES[0]
  let kf1 = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1]
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    if (dayTime >= SKY_KEYFRAMES[i].t && dayTime <= SKY_KEYFRAMES[i + 1].t) {
      kf0 = SKY_KEYFRAMES[i]
      kf1 = SKY_KEYFRAMES[i + 1]
      break
    }
  }
  const localT = (dayTime - kf0.t) / (kf1.t - kf0.t || 1)

  const skyHex = lerpHex(kf0.sky, kf1.sky, localT)
  scene.background.setHex(skyHex)
  scene.fog.color.setHex(skyHex)

  const sunHex = lerpHex(kf0.sun, kf1.sun, localT)
  sun.color.setHex(sunHex)
  sun.intensity = THREE.MathUtils.lerp(kf0.sunI, kf1.sunI, localT)
  hemiLight.intensity = THREE.MathUtils.lerp(kf0.hemiI, kf1.hemiI, localT)
  hemiLight.groundColor.setHex(lerpHex(kf0.hemiGround, kf1.hemiGround, localT))
  ambientLight.intensity = THREE.MathUtils.lerp(kf0.ambI, kf1.ambI, localT)

  const angle = dayTime * Math.PI * 2 - Math.PI / 2
  const sunDist = 60
  sun.position.set(Math.cos(angle) * sunDist, Math.max(4, Math.sin(angle) * sunDist), 15)

  const skyDist = 150
  sunMesh.position.set(Math.cos(angle) * skyDist, Math.sin(angle) * skyDist, 40)
  sunMesh.material.color.setHex(sunHex)
  sunMesh.visible = Math.sin(angle) > -0.15
  const moonAngle = angle + Math.PI
  moonMesh.position.set(Math.cos(moonAngle) * skyDist, Math.sin(moonAngle) * skyDist, 40)
  moonMesh.visible = Math.sin(moonAngle) > -0.15
}

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

// Splits a loaded model's named body-part mesh off into its own pivot Group,
// positioned at that part's own top edge (shoulder for an arm, hip for a
// leg) rather than the model's origin, so rotating the pivot swings the
// limb like a real joint - the same trick makeLimb/makeLeg use for the
// primitive characters, just derived from the imported mesh's own geometry
// bounds instead of hand-picked numbers, since this model has no skeleton
// to hinge on.
function makeJointPivot(model, primaryName, extraNames) {
  const primary = model.getObjectByName(primaryName)
  if (!primary) return null
  primary.geometry.computeBoundingBox()
  const bb = primary.geometry.boundingBox
  const jointX = (bb.min.x + bb.max.x) / 2
  const jointY = bb.max.y
  const pivot = new THREE.Group()
  pivot.position.set(jointX, jointY, 0)
  for (const name of [primaryName, ...extraNames]) {
    const part = model.getObjectByName(name)
    if (!part) continue
    model.remove(part)
    part.position.x -= jointX
    part.position.y -= jointY
    pivot.add(part)
  }
  model.add(pivot)
  return pivot
}

// The model's whole texture is a tiny 4x4 swatch grid - every part's UV is a
// single point (min===max per accessor), i.e. each mesh
// just samples one flat-color texel rather than any real texture detail. That
// makes per-part recoloring trivial and bleed-free: clone a part's material,
// drop its map so the texture lookup can't matter anymore, and set an
// absolute color - nothing else sampling the same swatch cell (e.g. the eyes
// share a cell with the shoes) is touched, since only the explicitly named
// parts get a cloned material.
const HAIR_PARTS = ['hair_cap', 'hair_left', 'hair_right', 'hair_bangs']
const SHIRT_PARTS = ['torso', 'left_arm', 'right_arm']
const SHORTS_PARTS = ['shorts']
const SHOE_PARTS = ['left_shoe', 'right_shoe']
const SKIN_PARTS = ['head', 'left_hand', 'right_hand', 'left_leg', 'right_leg']

function recolorParts(model, names, hex) {
  for (const name of names) {
    const part = model.getObjectByName(name)
    if (!part) continue
    part.material = part.material.clone()
    part.material.map = null
    part.material.color.set(hex)
    part.material.needsUpdate = true
  }
}

// Clones the loaded character model (so each NPC gets its own independent
// mesh/material instances to rig and recolor) and optionally overrides any
// of its palette groups, producing a palette-swapped variant from the same
// single sample asset instead of needing a separate model per NPC.
const MODEL_TARGET_HEIGHT = 1.85
function instantiateCharacterModel(sourceScene, variant = {}) {
  const model = sourceScene.clone(true)
  if (variant.hair) recolorParts(model, HAIR_PARTS, variant.hair)
  if (variant.shirt) recolorParts(model, SHIRT_PARTS, variant.shirt)
  if (variant.shorts) recolorParts(model, SHORTS_PARTS, variant.shorts)
  if (variant.shoes) recolorParts(model, SHOE_PARTS, variant.shoes)
  if (variant.skin) recolorParts(model, SKIN_PARTS, variant.skin)
  const box = new THREE.Box3().setFromObject(model)
  const height = box.max.y - box.min.y || 1
  model.scale.setScalar(MODEL_TARGET_HEIGHT / height)
  return model
}

// Swaps an NPC's capsule-built body for an imported model - keeps the
// primitive parts underneath (just hidden) rather than deleting them, so
// anything that still references npc.armL/armR/legL/legR has something
// harmless to rotate and nothing else has to special-case these npcs.
function attachModelToNpc(npc, model) {
  for (const child of npc.group.children) child.visible = false
  npc.group.add(model)
  npc.modelRig = {
    root: model,
    legL: makeJointPivot(model, 'left_leg', ['left_shoe']),
    legR: makeJointPivot(model, 'right_leg', ['right_shoe']),
    armL: makeJointPivot(model, 'left_arm', ['left_hand']),
    armR: makeJointPivot(model, 'right_arm', ['right_hand']),
  }
}

// Five NPCs scattered around the map, each a palette-swapped clone of the
// one sample model (see recolorParts above) so they read as distinct
// people without needing separate assets. Two patrol a short back-and-forth
// path (see updateNpcPatrol); the rest just stand with an idle sway. 'arin'
// and 'eunho' double as the delivery quest's giver/target (see updateQuest).
const NPC_WALK_SPEED = 1.6
const NPC_DEFS = [
  { id: 'arin', name: '아린', primitiveColor: 0xd1553f, pos: [4, -3], rotY: Math.PI * 0.6, variant: {}, patrol: { axis: 'z', half: 2.5 } },
  { id: 'bomi', name: '보미', primitiveColor: 0x55b86a, pos: [-4, 9], rotY: -Math.PI * 0.3, variant: { hair: '#6b4226', shirt: '#55b86a', shorts: '#2f2f2f' } },
  { id: 'chanho', name: '찬호', primitiveColor: 0x4477cc, pos: [10, 10], rotY: Math.PI * 0.9, variant: { hair: '#2b2320', shirt: '#4477cc', shorts: '#1f1f1f' } },
  { id: 'dain', name: '다인', primitiveColor: 0xe0a93f, pos: [-6, -12], rotY: -Math.PI * 0.5, variant: { hair: '#9c3b2e', shirt: '#e0a93f', shorts: '#3a2e20' }, patrol: { axis: 'z', half: 2.5 } },
  { id: 'eunho', name: '은호', primitiveColor: 0x9c6bd6, pos: [18, -2], rotY: Math.PI * 0.2, variant: { hair: '#45324f', shirt: '#9c6bd6', shorts: '#2f2f3a' } },
]

const npcs = NPC_DEFS.map((def, i) => {
  const npc = { ...createCharacter(def.primitiveColor), phase: i * 1.7, greeted: false, id: def.id, name: def.name }
  npc.group.position.set(def.pos[0], 0, def.pos[1])
  npc.group.rotation.y = def.rotY
  if (def.patrol) {
    const half = def.patrol.half
    npc.patrol =
      def.patrol.axis === 'x'
        ? { from: { x: def.pos[0] - half, z: def.pos[1] }, to: { x: def.pos[0] + half, z: def.pos[1] }, goingTo: true }
        : { from: { x: def.pos[0], z: def.pos[1] - half }, to: { x: def.pos[0], z: def.pos[1] + half }, goingTo: true }
  }
  return npc
})

new GLTFLoader().load(`${import.meta.env.BASE_URL}models/character.glb`, (gltf) => {
  NPC_DEFS.forEach((def, i) => {
    attachModelToNpc(npcs[i], instantiateCharacterModel(gltf.scene, def.variant))
  })
})

// A drivable car: a body + cabin + 4 wheels. Each wheel is a tilted pivot
// group (rotation.z = 90deg, so the cylinder's axis points sideways like
// a real axle) with the wheel mesh spinning around its own untilted local
// Y axis as a child - that composition keeps the spin visually correct
// regardless of the pivot's tilt or the car's heading.
function makeWheel(group, x, y, z) {
  const pivot = new THREE.Group()
  pivot.position.set(x, y, z)
  pivot.rotation.z = Math.PI / 2
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.28, 14),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  )
  pivot.add(mesh)
  group.add(pivot)
  return mesh
}

function createCar() {
  const group = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.6, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xe0433f }),
  )
  body.position.y = 0.55
  group.add(body)

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.5, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xbfe3f2 }),
  )
  cabin.position.set(0, 1.0, -0.2)
  group.add(cabin)

  const wheels = [
    makeWheel(group, 0.85, 0.35, 1.0),
    makeWheel(group, -0.85, 0.35, 1.0),
    makeWheel(group, 0.85, 0.35, -1.0),
    makeWheel(group, -0.85, 0.35, -1.0),
  ]

  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0x554400 })
  const headlightL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), headlightMat)
  headlightL.position.set(0.55, 0.55, 1.62)
  group.add(headlightL)
  const headlightR = headlightL.clone()
  headlightR.position.x = -0.55
  group.add(headlightR)

  scene.add(group)
  return { group, wheels }
}

const CAR_RADIUS = 1.2
const CAR_ENTER_RADIUS = 2.5
const car = createCar()
car.group.position.set(6, 0, -8)
let carSpeed = 0
let driving = false

function nearCar() {
  const dx = player.position.x - car.group.position.x
  const dz = player.position.z - car.group.position.z
  return Math.hypot(dx, dz) < CAR_ENTER_RADIUS
}

// The player model is hidden whenever the camera is riding "inside" it -
// driving (chase cam still shows the car, but the player themselves is
// inside it) or first-person (would otherwise see giant body parts
// filling the screen).
let cameraMode = 'orbit' // 'orbit' | 'first'
function updatePlayerVisibility() {
  player.visible = !driving && cameraMode !== 'first'
}

function enterCar() {
  driving = true
  carSpeed = 0
  updatePlayerVisibility()
}

function exitCar() {
  driving = false
  const heading = car.group.rotation.y
  // Step out to the car's side rather than dropping the player back inside it.
  player.position.x = car.group.position.x + Math.cos(heading) * 2.2
  player.position.z = car.group.position.z - Math.sin(heading) * 2.2
  player.position.y = 0
  updatePlayerVisibility()
  velocityY = 0
  grounded = true
}

const hintEl = document.getElementById('hint')
const DEFAULT_HINT = hintEl ? hintEl.textContent : ''
function updateHint() {
  if (!hintEl) return
  if (driving) hintEl.textContent = 'W/S 가속·후진 · A/D 조향 · E 키로 하차 · V 키로 시점 전환'
  else if (nearCar()) hintEl.textContent = 'E 키를 눌러 차에 탑승'
  else hintEl.textContent = DEFAULT_HINT
}

// Keyboard input. Jump is triggered here (edge-style, gated on `grounded`
// and not already mid-jump-animation) rather than read as a held key, so
// holding Space doesn't bunny-hop or restart the windup mid-crouch.
const heldKeys = new Set()
const JUMP_KEYS = [' ', 'spacebar']
const ENTER_KEYS = ['e', 'f']
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  heldKeys.add(key)
  if (JUMP_KEYS.includes(key) && !driving && grounded && jumpState === 'none') {
    jumpState = 'windup'
    jumpStateT = 0
  }
  if (ENTER_KEYS.includes(key)) {
    if (driving) exitCar()
    else if (nearCar()) enterCar()
  }
  if (key === 'v') {
    cameraMode = cameraMode === 'orbit' ? 'first' : 'orbit'
    updatePlayerVisibility()
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

// Real FPS-style mouselook in both camera modes: the pointer locks on the
// first click (browsers require a user gesture to grant it) and stays
// locked across V toggles, so looking around never needs a button held -
// just move the mouse. Pitch gets a wider range in first-person, where
// looking far up/down makes sense; orbit allows a low look-up angle too,
// with updateCamera clamping the camera's height so it can't dip
// underground (the ground plane isn't in cameraBlockers to raycast against).
let yaw = Math.PI
let pitch = 0.5
const ORBIT_DISTANCE = 7
const MOUSE_SENSITIVITY = 0.0022

renderer.domElement.addEventListener('pointerdown', () => {
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock()
})
window.addEventListener('pointermove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return
  yaw -= e.movementX * MOUSE_SENSITIVITY
  const pitchMin = cameraMode === 'first' ? -1.2 : -0.6
  pitch = Math.min(1.3, Math.max(pitchMin, pitch - e.movementY * MOUSE_SENSITIVITY))
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
function resolveBoxCollisions(pos, radius) {
  const half = BOX_HALF_SIZE + radius
  for (const box of landmarkBoxes) {
    if (pos.y >= box.height - 0.05) continue
    const dx = pos.x - box.x
    const dz = pos.z - box.z
    if (Math.abs(dx) >= half || Math.abs(dz) >= half) continue

    const penX = half - Math.abs(dx)
    const penZ = half - Math.abs(dz)
    if (penX < penZ) {
      pos.x = box.x + Math.sign(dx || 1) * half
    } else {
      pos.z = box.z + Math.sign(dz || 1) * half
    }
  }
}

// Same idea as resolveBoxCollisions, but with independent x/z half-extents
// per wall (so a wall segment can be long and thin) and no height
// exemption - walls are always taller than the player can jump, so unlike
// the landmark boxes there's no "stand on top" case to account for.
function resolveWallCollisions(pos, radius) {
  for (const wall of walls) {
    const halfX = wall.halfX + radius
    const halfZ = wall.halfZ + radius
    const dx = pos.x - wall.x
    const dz = pos.z - wall.z
    if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) continue

    const penX = halfX - Math.abs(dx)
    const penZ = halfZ - Math.abs(dz)
    if (penX < penZ) {
      pos.x = wall.x + Math.sign(dx || 1) * halfX
    } else {
      pos.z = wall.z + Math.sign(dz || 1) * halfZ
    }
  }
}

// Same idea as resolveBoxCollisions, but circular (NPCs are standing
// characters, not axis-aligned blocks) and with no "stand on top" case -
// an NPC is just solid from the ground up to about head height.
const NPC_RADIUS = 0.45
const NPC_HEIGHT = 1.8

function resolveNpcCollisions(pos, radius) {
  const minDist = NPC_RADIUS + radius
  for (const npc of npcs) {
    if (pos.y >= NPC_HEIGHT - 0.05) continue
    const dx = pos.x - npc.group.position.x
    const dz = pos.z - npc.group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist >= minDist) continue
    const push = minDist - dist
    const [nx, nz] = dist > 0.0001 ? [dx / dist, dz / dist] : [1, 0]
    pos.x += nx * push
    pos.z += nz * push
  }
}

// The car has its own circular collider (CAR_RADIUS) that already blocks
// it from driving through boxes/walls/NPCs, but nothing stopped the player
// from walking *into* the parked car - add the matching push-out the other
// way. Skipped while driving: then the player isn't a separate body, it's
// riding inside the car's own position.
function resolveCarCollision(pos, radius) {
  if (driving) return
  const dx = pos.x - car.group.position.x
  const dz = pos.z - car.group.position.z
  const dist = Math.hypot(dx, dz)
  const minDist = CAR_RADIUS + radius
  if (dist >= minDist) return
  const push = minDist - dist
  const [nx, nz] = dist > 0.0001 ? [dx / dist, dz / dist] : [1, 0]
  pos.x += nx * push
  pos.z += nz * push
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
// rather than frozen - except npc[0], which actually patrols (see
// updateNpcPatrol) and gets a real walk-cycle swing while it does. Each
// idler has its own phase offset so they don't sway in lockstep.
let npcTime = 0
const IDLE_SWAY_RATE = 1.6
const IDLE_SWAY_AMOUNT = 0.3
// A real walking cadence (steps/sec) barely changes with a slow stroll like
// this - what changes is stride length, not stride rate - so this stays
// close to the player's own WALK_RATE rather than being scaled down by
// NPC_WALK_SPEED. Scaling it down (an earlier version of this code did)
// made the legs swing far slower than the body was translating, which read
// as skating/sliding instead of walking: the feet barely moved while the
// body coasted forward underneath them.
const NPC_WALK_RATE = 6
const NPC_ARM_SWING = 0.6
const NPC_LEG_SWING = 0.55
// A small up/down bob, twice per stride (one bump per footfall), sells the
// weight of a footstep landing - without it the body glides in a perfectly
// flat line even with the legs swinging, which also reads as sliding.
const NPC_BOB_HEIGHT = 0.05

function updateNpcs(dt) {
  npcTime += dt
  for (const npc of npcs) {
    if (npc.walking) {
      const swing = Math.sin(npcTime * NPC_WALK_RATE)
      npc.armL.rotation.x = swing * NPC_ARM_SWING
      npc.armR.rotation.x = -swing * NPC_ARM_SWING
      npc.legL.hip.rotation.x = -swing * NPC_LEG_SWING
      npc.legR.hip.rotation.x = swing * NPC_LEG_SWING
      if (npc.modelRig) {
        npc.modelRig.armL.rotation.x = swing * NPC_ARM_SWING
        npc.modelRig.armR.rotation.x = -swing * NPC_ARM_SWING
        npc.modelRig.legL.rotation.x = -swing * NPC_LEG_SWING
        npc.modelRig.legR.rotation.x = swing * NPC_LEG_SWING
        npc.modelRig.root.position.y = Math.abs(Math.sin(npcTime * NPC_WALK_RATE)) * NPC_BOB_HEIGHT
      }
    } else {
      const sway = Math.sin(npcTime * IDLE_SWAY_RATE + npc.phase) * IDLE_SWAY_AMOUNT
      npc.armL.rotation.x = sway
      npc.armR.rotation.x = -sway
      npc.legL.hip.rotation.x *= 0.85
      npc.legR.hip.rotation.x *= 0.85
      if (npc.modelRig) {
        npc.modelRig.armL.rotation.x = sway
        npc.modelRig.armR.rotation.x = -sway
        npc.modelRig.legL.rotation.x *= 0.85
        npc.modelRig.legR.rotation.x *= 0.85
        npc.modelRig.root.position.y *= 0.8
      }
    }
  }
}

// Moves every patrolling NPC back and forth between its patrol endpoints,
// facing the direction it's walking - paused while it's mid-greeting (see
// updateNpcGreetings) so it doesn't wander off mid-conversation.
function updateNpcPatrol(dt) {
  for (const npc of npcs) {
    const patrol = npc.patrol
    if (!patrol) continue
    if (npc.greeted) {
      npc.walking = false
      continue
    }
    const dest = patrol.goingTo ? patrol.to : patrol.from
    const dx = dest.x - npc.group.position.x
    const dz = dest.z - npc.group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.05) {
      patrol.goingTo = !patrol.goingTo
      npc.walking = false
      continue
    }
    npc.walking = true
    const step = Math.min(dist, NPC_WALK_SPEED * dt)
    npc.group.position.x += (dx / dist) * step
    npc.group.position.z += (dz / dist) * step
    npc.group.rotation.y = Math.atan2(dx, dz)
  }
}

// Spoken out loud via the browser's built-in text-to-speech (no voice
// files to generate or host) rather than a silent on-screen bubble.
function speak(text) {
  if (!window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ko-KR'
  utter.pitch = 1.05
  window.speechSynthesis.speak(utter)
}

// A simple repeatable fetch quest: approach the giver (arin) while no
// quest is active to get asked to carry something to the target (eunho),
// clear across the map; approach the target while it's active to complete
// it and reopen the loop. Piggybacks on the same greeted edge-trigger as
// the regular hello below, so it fires once per approach rather than every
// frame spent standing in GREET_RADIUS.
const QUEST_GIVER_ID = 'arin'
const QUEST_TARGET_ID = 'eunho'
let questState = 'none' // 'none' | 'active'

function npcById(id) {
  return npcs.find((n) => n.id === id)
}

const questBannerEl = document.getElementById('quest-banner')
function setQuestBanner(text, autoHideMs) {
  if (!questBannerEl) return
  questBannerEl.textContent = text
  questBannerEl.style.opacity = text ? '1' : '0'
  if (autoHideMs) {
    setTimeout(() => {
      if (questBannerEl.textContent === text) questBannerEl.style.opacity = '0'
    }, autoHideMs)
  }
}

// Fires once per approach, like the car's dock/enter prompts: greeted
// flips true the frame the player enters GREET_RADIUS and back to false
// only once they leave it, so walking up to the same NPC again later
// (rather than just lingering nearby) triggers a fresh greeting.
const GREET_RADIUS = 3

function updateNpcGreetings() {
  for (const npc of npcs) {
    const dist = Math.hypot(player.position.x - npc.group.position.x, player.position.z - npc.group.position.z)
    const near = dist < GREET_RADIUS
    if (near && !npc.greeted) {
      npc.greeted = true
      if (npc.id === QUEST_GIVER_ID && questState === 'none') {
        questState = 'active'
        const target = npcById(QUEST_TARGET_ID)
        speak(`${npc.name}: 저 멀리 ${target.name}에게 전해줄 물건이 있어요. 가져다 줄래요?`)
        setQuestBanner(`퀘스트: ${target.name}에게 물건 전달하기`)
      } else if (npc.id === QUEST_TARGET_ID && questState === 'active') {
        questState = 'none'
        speak(`${npc.name}: 고마워요! 덕분에 살았어요.`)
        setQuestBanner('퀘스트 완료! 다시 아린에게 가보세요.', 5000)
      } else {
        speak('안녕?')
      }
    } else if (!near) {
      npc.greeted = false
    }
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

// The direction the camera is actually looking, flattened to the ground
// plane - NOT just (sin(yaw), cos(yaw)) by itself, because that only
// matches the camera's facing in first-person. In orbit mode the camera
// sits at target + dir*distance and looks back at the target, so what the
// player sees as "forward" on screen is the opposite of that same dir
// vector. Without this split, forward movement only happened to line up
// with the view at yaw values a multiple of 180° apart and went sideways
// or backward in between - which is exactly the "W goes backward after
// turning the camera" bug this fixes.
function cameraForwardXZ() {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  return cameraMode === 'first' ? { x: sin, z: cos } : { x: -sin, z: -cos }
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

  // Move relative to the camera's current facing: forward/back along the
  // camera's view direction, left/right along its perpendicular.
  const fwd = cameraForwardXZ()
  const right = { x: -fwd.z, z: fwd.x }
  const forwardAmount = -moveZ
  const worldX = moveX * right.x + forwardAmount * fwd.x
  const worldZ = moveX * right.z + forwardAmount * fwd.z

  const nextX = player.position.x + worldX * PLAYER_SPEED * dt
  player.position.x = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextX))
  const nextZ = player.position.z + worldZ * PLAYER_SPEED * dt
  player.position.z = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextZ))

  const targetAngle = Math.atan2(worldX, worldZ)
  facingAngle += angleDelta(facingAngle, targetAngle) * Math.min(1, dt * 10)
  player.rotation.y = facingAngle
}

// Arcade car model: acceleration/friction on a 1D speed value, and
// steering that turns the heading rather than strafing - scaled by
// Math.sign(carSpeed) so steering while reversing turns the car the way
// a real rear-steered push would (and does nothing while stationary, so
// the car can't pirouette in place).
const CAR_MAX_SPEED = 14
const CAR_MAX_REVERSE = -6
const CAR_ACCEL = 10
const CAR_FRICTION = 6
const CAR_TURN_RATE = 2.2
const WHEEL_SPIN_SCALE = 2.2

function updateCar(dt) {
  let accelInput = 0
  if (held(MOVE_KEYS.forward)) accelInput += 1
  if (held(MOVE_KEYS.back)) accelInput -= 1

  if (accelInput !== 0) {
    carSpeed += accelInput * CAR_ACCEL * dt
  } else {
    const drop = CAR_FRICTION * dt
    carSpeed = Math.abs(carSpeed) <= drop ? 0 : carSpeed - Math.sign(carSpeed) * drop
  }
  carSpeed = Math.max(CAR_MAX_REVERSE, Math.min(CAR_MAX_SPEED, carSpeed))

  let steerInput = 0
  if (held(MOVE_KEYS.left)) steerInput -= 1
  if (held(MOVE_KEYS.right)) steerInput += 1
  if (Math.abs(carSpeed) > 0.1) {
    car.group.rotation.y += steerInput * CAR_TURN_RATE * dt * Math.sign(carSpeed)
  }

  const heading = car.group.rotation.y
  const nextX = car.group.position.x + Math.sin(heading) * carSpeed * dt
  car.group.position.x = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextX))
  const nextZ = car.group.position.z + Math.cos(heading) * carSpeed * dt
  car.group.position.z = Math.max(-GROUND_HALF, Math.min(GROUND_HALF, nextZ))

  for (const wheel of car.wheels) wheel.rotation.y -= carSpeed * dt * WHEEL_SPIN_SCALE
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
const CAMERA_FLOOR_Y = 0.3

function updateCamera() {
  const target = driving ? car.group.position : player.position
  const eyeY = target.y + (driving ? 0.9 : 1.2)
  const dirX = Math.sin(yaw) * Math.cos(pitch)
  const dirY = Math.sin(pitch)
  const dirZ = Math.cos(yaw) * Math.cos(pitch)

  if (cameraMode === 'first') {
    camera.position.set(target.x, eyeY, target.z)
    camera.lookAt(target.x + dirX, eyeY + dirY, target.z + dirZ)
    return
  }

  let dist = ORBIT_DISTANCE
  // The ground plane isn't a camera blocker, so a low/negative pitch needs
  // its own floor check: cap the distance so the camera never sinks below
  // CAMERA_FLOOR_Y, which is what makes a genuine low look-up angle possible.
  if (dirY < 0) {
    const floorDist = (CAMERA_FLOOR_Y - eyeY) / dirY
    if (floorDist > 0) dist = Math.min(dist, floorDist)
  }
  cameraRay.set(new THREE.Vector3(target.x, eyeY, target.z), new THREE.Vector3(dirX, dirY, dirZ))
  cameraRay.far = dist
  const hit = cameraRay.intersectObjects(cameraBlockers, false)[0]
  if (hit) dist = Math.max(CAMERA_MIN_DISTANCE, hit.distance - CAMERA_HIT_MARGIN)

  camera.position.set(target.x + dirX * dist, eyeY + dirY * dist, target.z + dirZ * dist)
  camera.lookAt(target.x, eyeY, target.z)
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

  updateDayNight(dt)

  if (driving) {
    updateCar(dt)
    resolveBoxCollisions(car.group.position, CAR_RADIUS)
    resolveWallCollisions(car.group.position, CAR_RADIUS)
    resolveNpcCollisions(car.group.position, CAR_RADIUS)
  } else {
    updatePlayer(dt)
    updateJumpAnim(dt)
    resolveBoxCollisions(player.position, PLAYER_RADIUS)
    resolveWallCollisions(player.position, PLAYER_RADIUS)
    resolveNpcCollisions(player.position, PLAYER_RADIUS)
    resolveCarCollision(player.position, PLAYER_RADIUS)
    updateVertical(dt)
    updateNpcGreetings()
  }
  updateNpcPatrol(dt)
  updateNpcs(dt)
  updateHint()
  updateCamera()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
