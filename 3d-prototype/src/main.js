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
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6b8caf, 1.4)
scene.add(hemiLight)
const sun = new THREE.DirectionalLight(0xffffff, 1.8)
sun.position.set(10, 20, 10)
scene.add(sun)
// The shadow frustum only covers SHADOW_RANGE around whoever the camera is
// following (see updateDayNight, which moves the light and its target along
// with them) - covering the whole 100-unit map at once would spread the
// shadow map too thin to read as anything but blur.
const SHADOW_RANGE = 32
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -SHADOW_RANGE, right: SHADOW_RANGE, top: SHADOW_RANGE, bottom: -SHADOW_RANGE, near: 1, far: 160 })
sun.shadow.camera.updateProjectionMatrix()
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.04
scene.add(sun.target)

function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
}
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
// 0 in full daylight, 1 in full night - what the stars, lamps, windows and
// headlights all key off (see updateSkyDecor / updateNightLights).
let nightFactor = 0
let currentSkyHex = SKY_COLOR
const SKY_KEYFRAMES = [
  { t: 0.0, sky: 0x0a1020, sun: 0x8ea9ff, sunI: 0.1, hemiI: 0.35, hemiGround: 0x0c1830, ambI: 0.08 },
  { t: 0.22, sky: 0xffb37a, sun: 0xffd9a0, sunI: 1.5, hemiI: 0.7, hemiGround: 0x5a4030, ambI: 0.2 },
  { t: 0.5, sky: 0x9fd4f0, sun: 0xffffff, sunI: 2.3, hemiI: 1.05, hemiGround: 0x6b8caf, ambI: 0.3 },
  { t: 0.78, sky: 0xff7e4d, sun: 0xffb37a, sunI: 1.4, hemiI: 0.7, hemiGround: 0x5a3020, ambI: 0.2 },
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
  const sunHeight = Math.sin(angle)
  const focus = driving ? car.group.position : player.position
  sun.position.set(focus.x + Math.cos(angle) * sunDist, Math.max(4, sunHeight * sunDist), focus.z + 15)
  sun.target.position.set(focus.x, 0, focus.z)
  // Shadows fade out as the sun nears the horizon rather than stretching to
  // infinity, and stay off all night - the light is clamped just above the
  // ground there, so anything it cast would be a smear across the whole map.
  sun.shadow.intensity = THREE.MathUtils.smoothstep(sunHeight, 0.02, 0.3)
  nightFactor = 1 - THREE.MathUtils.smoothstep(sunHeight, -0.12, 0.18)
  currentSkyHex = skyHex

  const skyDist = 150
  sunMesh.position.set(Math.cos(angle) * skyDist, Math.sin(angle) * skyDist, 40)
  sunMesh.material.color.setHex(sunHex)
  sunMesh.visible = Math.sin(angle) > -0.15
  const moonAngle = angle + Math.PI
  moonMesh.position.set(Math.cos(moonAngle) * skyDist, Math.sin(moonAngle) * skyDist, 40)
  moonMesh.visible = Math.sin(moonAngle) > -0.15
}

// Seeded so the scenery (grass speckle, tree layout, clouds, stars) comes out
// identical on every load instead of reshuffling under the player.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A flat base color with small random flecks of a few nearby shades, tiled.
// The flecks are what give movement a visual reference now that the debug
// grid is gone - a single flat color makes walking look like standing still.
function makeSpeckleTexture(base, flecks, count, seed) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const g = canvas.getContext('2d')
  g.fillStyle = base
  g.fillRect(0, 0, 256, 256)
  const rnd = seededRandom(seed)
  for (let i = 0; i < count; i++) {
    g.fillStyle = flecks[Math.floor(rnd() * flecks.length)]
    const size = 1.5 + rnd() * 3.5
    g.beginPath()
    g.ellipse(rnd() * 256, rnd() * 256, size, size * (0.4 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  return tex
}

// The walkable area is GROUND_SIZE across, but the grass itself runs well
// past that into the fog (and the tree line below hides the boundary), so
// the map no longer ends in a visible edge with sky underneath.
const GROUND_SIZE = 100
const GROUND_VISUAL_SIZE = 400
const TEXTURE_TILE = 5
const grassTexture = makeSpeckleTexture('#5fa85f', ['#5aa35a', '#65ad63', '#56a057', '#6ab167'], 1800, 11)
grassTexture.repeat.set(GROUND_VISUAL_SIZE / TEXTURE_TILE, GROUND_VISUAL_SIZE / TEXTURE_TILE)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_VISUAL_SIZE, GROUND_VISUAL_SIZE),
  new THREE.MeshStandardMaterial({ map: grassTexture }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

function makeCrateTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const g = canvas.getContext('2d')
  g.fillStyle = '#b9773d'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = '#8f5a2b'
  g.lineWidth = 3
  for (let x = 32; x < 128; x += 32) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 128)
    g.stroke()
  }
  g.strokeStyle = '#7a4a22'
  g.lineWidth = 14
  g.strokeRect(7, 7, 114, 114)
  g.lineWidth = 12
  g.beginPath()
  g.moveTo(12, 12)
  g.lineTo(116, 116)
  g.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// A few scattered landmark boxes so walking around actually feels like going somewhere.
// Each one is also solid: `landmarkBoxes` holds the collision data `boxBlocks()` checks
// against, including its height so a high enough jump can clear a short box.
const landmarkMat = new THREE.MeshStandardMaterial({ map: makeCrateTexture() })
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
  const geometry = new THREE.BoxGeometry(2, halfHeight * 2, 2)
  // Stretch the crate texture's V on the four side faces (BoxGeometry lays
  // its faces out as +x, -x, +y, -y, +z, -z, four vertices each) so a tall
  // box reads as crates stacked up rather than one crate pulled like taffy.
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    if (i < 8 || i >= 16) uv.setY(i, uv.getY(i) * halfHeight)
  }
  const box = new THREE.Mesh(geometry, landmarkMat)
  box.position.set(x, halfHeight, z)
  enableShadows(box)
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
  enableShadows(mesh)
  scene.add(mesh)
  walls.push({ x: cx, z: cz, halfX, halfZ })
  cameraBlockers.push(mesh)
}

// Window panes and the lamp inside only light up at night (see
// updateNightLights) - by day the glass is just a dark pane.
const windowMat = new THREE.MeshStandardMaterial({ color: 0x27323f, emissive: 0xffc46b, emissiveIntensity: 0 })
const houseLight = new THREE.PointLight(0xffc98a, 0, 12, 1.6)

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
  floor.receiveShadow = true
  scene.add(floor)

  // Purely visual: the doorway was a floor-to-roof slot in the wall. Sits
  // above head height, so it needs no collision of its own.
  const DOOR_HEIGHT = 2.2
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(T, WALL_HEIGHT - DOOR_HEIGHT, DOOR_WIDTH), wallMat)
  lintel.position.set(hx + S, (WALL_HEIGHT + DOOR_HEIGHT) / 2, hz)
  enableShadows(lintel)
  scene.add(lintel)

  // One pane per solid wall, slightly thicker than the wall so it shows on
  // both the outside and the inside face.
  for (const [wx, wz, alongX] of [[hx, hz - S, true], [hx, hz + S, true], [hx - S, hz, false]]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.5 : T + 0.06, 1.0, alongX ? T + 0.06 : 1.5), windowMat)
    pane.position.set(wx, 1.9, wz)
    scene.add(pane)
  }

  houseLight.position.set(hx, 2.4, hz)
  scene.add(houseLight)

  const roofHeight = 1.8
  // radialSegments=4 makes a square pyramid; rotate 45° so its flat faces
  // line up with the walls instead of its edges.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(S * Math.SQRT2 + 0.3, roofHeight, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.set(hx, WALL_HEIGHT + roofHeight / 2, hz)
  enableShadows(roof)
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

// ---- Face detail --------------------------------------------------------
// Faces are built from small flat-shaded shapes layered on the head (white
// of the eye -> iris -> pupil -> highlight, lash line, brows, nose, mouth,
// cheeks...) so they read as faces up close but still match the low-poly
// look. Eyes live in their own groups so a periodic blink can squash them.
const blinkers = []
function shade(color, f) {
  return new THREE.Color(color).multiplyScalar(f)
}
function flat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra })
}
function faceBox(parent, w, h, d, color, x, y, z, rz = 0, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color, extra))
  m.position.set(x, y, z)
  m.rotation.z = rz
  parent.add(m)
  return m
}
function faceBlob(parent, r, sx, sy, sz, color, x, y, z, extra) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), flat(color, extra))
  m.scale.set(sx, sy, sz)
  m.position.set(x, y, z)
  parent.add(m)
  return m
}
const LASH = 0x2a1d1a

// Face for the imported (boxy) character model. Coordinates are in the
// model's own space: the head's front surface is at z=0.35, eyes ~y 2.34.
function addModelFace(model, variant = {}, look = {}) {
  const F = 0.352
  const skin = variant.skin || '#f5c5a6'
  const hair = variant.hair || '#2b2320'
  const eyeColor = look.eye || '#4a3a2a'
  const browColor = shade(hair, 0.65)
  for (const n of ['left_eye', 'right_eye', 'smile']) {
    const o = model.getObjectByName(n)
    if (o) o.visible = false
  }
  const eyes = []
  for (const s of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(s * 0.15, 2.34, F)
    faceBox(eye, 0.15, 0.17, 0.02, 0xffffff, 0, 0, 0.01)
    faceBox(eye, 0.095, 0.145, 0.02, eyeColor, -s * 0.005, -0.005, 0.025)
    faceBox(eye, 0.05, 0.09, 0.02, 0x14101a, -s * 0.005, -0.005, 0.04)
    faceBox(eye, 0.03, 0.03, 0.02, 0xffffff, 0.02, 0.035, 0.055)
    faceBox(eye, 0.18, 0.035, 0.03, LASH, 0, 0.095, 0.03)
    faceBox(eye, 0.05, 0.03, 0.03, LASH, s * 0.095, 0.085, 0.03, s * -0.5)
    model.add(eye)
    eyes.push(eye)
    const strong = look.brow === 'strong'
    faceBox(model, strong ? 0.19 : 0.16, strong ? 0.055 : 0.038, 0.03, browColor, s * 0.15, strong ? 2.5 : 2.505, F + 0.02, s * (strong ? 0.14 : -0.1))
  }
  blinkers.push({ eyes, next: 1.5 + Math.random() * 3, until: 0 })

  const nose = shade(skin, 0.92)
  faceBox(model, 0.05, 0.1, 0.04, nose, 0, 2.25, F + 0.02)
  faceBox(model, 0.085, 0.05, 0.05, shade(skin, 0.88), 0, 2.2, F + 0.03)
  for (const s of [-1, 1]) faceBox(model, 0.02, 0.015, 0.02, shade(skin, 0.55), s * 0.025, 2.18, F + 0.058)

  const lip = 0x9a3f45
  const mouth = look.mouth || 'smile'
  if (mouth === 'open') {
    faceBox(model, 0.12, 0.075, 0.02, 0x5a1f25, 0, 2.115, F + 0.012)
    faceBox(model, 0.1, 0.022, 0.02, 0xffffff, 0, 2.145, F + 0.022)
    faceBox(model, 0.06, 0.025, 0.02, 0xe0707a, 0, 2.09, F + 0.022)
  } else if (mouth === 'smirk') {
    faceBox(model, 0.11, 0.028, 0.02, lip, -0.01, 2.125, F + 0.012, 0.08)
    faceBox(model, 0.05, 0.026, 0.02, lip, 0.075, 2.145, F + 0.012, 0.6)
  } else if (mouth === 'calm') {
    faceBox(model, 0.1, 0.026, 0.02, lip, 0, 2.125, F + 0.012)
    faceBox(model, 0.05, 0.02, 0.02, shade(lip, 1.15), 0, 2.098, F + 0.012)
  } else {
    faceBox(model, 0.1, 0.03, 0.02, lip, 0, 2.115, F + 0.012)
    for (const s of [-1, 1]) faceBox(model, 0.05, 0.03, 0.02, lip, s * 0.07, 2.14, F + 0.012, s * 0.55)
  }

  for (const s of [-1, 1]) faceBox(model, 0.13, 0.07, 0.012, 0xff8c96, s * 0.24, 2.17, F + 0.004, 0, { transparent: true, opacity: 0.4 })

  if (look.freckles) {
    const fc = shade(skin, 0.7)
    for (const s of [-1, 1]) {
      for (const [dx, dy] of [[0.2, 2.215], [0.26, 2.235], [0.3, 2.205], [0.23, 2.19], [0.28, 2.18]]) faceBox(model, 0.02, 0.02, 0.012, fc, s * dx, dy, F + 0.01)
    }
  }
  if (look.glasses) {
    const fr = look.glasses
    const z = F + 0.05
    for (const s of [-1, 1]) {
      const cx = s * 0.15
      faceBox(model, 0.25, 0.018, 0.02, fr, cx, 2.44, z)
      faceBox(model, 0.25, 0.018, 0.02, fr, cx, 2.24, z)
      faceBox(model, 0.018, 0.21, 0.02, fr, cx - 0.116, 2.34, z)
      faceBox(model, 0.018, 0.21, 0.02, fr, cx + 0.116, 2.34, z)
      faceBox(model, 0.232, 0.2, 0.01, 0xbfe4ff, cx, 2.34, z - 0.005, 0, { transparent: true, opacity: 0.14 })
      faceBox(model, 0.016, 0.016, 0.4, fr, s * 0.385, 2.38, z - 0.2)
    }
    faceBox(model, 0.06, 0.018, 0.02, fr, 0, 2.38, z)
  }
}

// Face + hair for the primitive (sphere-head) characters: the player and
// the NPCs' placeholder bodies. Head is a radius-0.3 sphere at y=1.55.
function addPrimitiveFace(group, hairColor, look = {}) {
  const HY = 1.55
  const eyeColor = look.eye || '#5a3d2a'
  const eyes = []
  for (const s of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(s * 0.105, HY + 0.02, 0.268)
    eye.rotation.y = s * 0.36
    faceBlob(eye, 0.06, 1, 1.15, 0.3, 0xffffff, 0, 0, 0)
    faceBlob(eye, 0.04, 1, 1.25, 0.3, eyeColor, 0, -0.004, 0.012)
    faceBlob(eye, 0.022, 1, 1.25, 0.3, 0x14101a, 0, -0.004, 0.02)
    faceBlob(eye, 0.012, 1, 1, 0.3, 0xffffff, 0.016, 0.02, 0.027)
    faceBox(eye, 0.12, 0.014, 0.02, LASH, 0, 0.06, 0.012)
    group.add(eye)
    eyes.push(eye)
    const brow = faceBox(group, 0.09, 0.02, 0.02, shade(hairColor, 0.85), s * 0.108, HY + 0.095, 0.262, s * -0.12)
    brow.rotation.y = s * 0.36
  }
  blinkers.push({ eyes, next: 1.5 + Math.random() * 3, until: 0 })

  faceBlob(group, 0.035, 1, 0.9, 1, shade(SKIN, 0.92), 0, HY - 0.03, 0.29)
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI), flat(0x9a3f45))
  mouth.rotation.z = Math.PI
  mouth.scale.y = 0.55
  mouth.position.set(0, HY - 0.045, 0.288)
  group.add(mouth)
  for (const s of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), flat(0xff8c96, { transparent: true, opacity: 0.45 }))
    blush.position.set(s * 0.17, HY - 0.045, 0.245)
    blush.rotation.y = s * 0.6
    group.add(blush)
    faceBlob(group, 0.06, 0.5, 1, 0.8, SKIN, s * 0.295, HY - 0.01, 0)
  }

  const hairMat = flat(hairColor, { roughness: 0.6 })
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.318, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat)
  cap.position.y = HY
  cap.rotation.x = -0.3
  group.add(cap)
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), hairMat)
  back.scale.set(1.05, 1.0, 0.75)
  back.position.set(0, HY - 0.05, -0.14)
  group.add(back)
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), hairMat)
  fringe.scale.set(1.6, 0.42, 0.7)
  fringe.position.set(0, HY + 0.13, 0.2)
  fringe.rotation.x = 0.35
  group.add(fringe)
}

function updateBlinks(now) {
  for (const b of blinkers) {
    if (now >= b.next && b.until === 0) {
      b.until = now + 0.12
      for (const e of b.eyes) e.scale.y = 0.08
    } else if (b.until && now >= b.until) {
      b.until = 0
      b.next = now + 2 + Math.random() * 3.5
      for (const e of b.eyes) e.scale.y = 1
    }
  }
}

function createCharacter(outfitColor, hairColor = 0x3a2a22) {
  const group = new THREE.Group()

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.3, 4, 8),
    new THREE.MeshStandardMaterial({ color: outfitColor }),
  )
  torso.position.y = 1.05
  group.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), new THREE.MeshStandardMaterial({ color: SKIN }))
  head.position.y = 1.55
  group.add(head)
  addPrimitiveFace(group, hairColor)

  const armL = makeLimb(group, SKIN, 0.07, 0.5, -0.36, 1.3)
  const armR = makeLimb(group, SKIN, 0.07, 0.5, 0.36, 1.3)
  const legL = makeLeg(group, BOOTS, 0.1, 0.38, 0.37, -0.14, 0.75)
  const legR = makeLeg(group, BOOTS, 0.1, 0.38, 0.37, 0.14, 0.75)

  enableShadows(group)
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
  addModelFace(model, variant, variant.look)
  const box = new THREE.Box3().setFromObject(model)
  const height = box.max.y - box.min.y || 1
  model.scale.setScalar((variant.height || MODEL_TARGET_HEIGHT) / height)
  return model
}

// Swaps an NPC's capsule-built body for an imported model - keeps the
// primitive parts underneath (just hidden) rather than deleting them, so
// anything that still references npc.armL/armR/legL/legR has something
// harmless to rotate and nothing else has to special-case these npcs.
function attachModelToNpc(npc, model) {
  for (const child of npc.group.children) {
    if (child !== npc.nameTag) child.visible = false
  }
  enableShadows(model)
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
// people without needing separate assets. Every palette group (hair,
// shirt, shorts, shoes, skin) is given its own value per NPC, plus a
// height variation, specifically so no two land on the same silhouette +
// colors even at a glance - coloring only 2-3 of the groups left them
// reading as near-identical recolors of each other. Two patrol a short
// back-and-forth path (see updateNpcPatrol); the rest just stand with an
// idle sway. 'arin' doubles as the delivery quest's giver (see
// updateNpcGreetings - any of the others can be that quest's target).
const NPC_WALK_SPEED = 1.6
const NPC_DEFS = [
  { id: 'arin', name: '아린', primitiveColor: 0xd1553f, pos: [4, -3], rotY: Math.PI * 0.6, variant: { hair: '#45324f', shirt: '#79b8da', shorts: '#314a79', shoes: '#202437', skin: '#f5c5a6', height: 1.85, look: { eye: '#7a5cc0', glasses: 0x2b2b3a } }, patrol: { axis: 'z', half: 2.5 } },
  { id: 'bomi', name: '보미', primitiveColor: 0x55b86a, pos: [-4, 9], rotY: -Math.PI * 0.3, variant: { hair: '#6b4226', shirt: '#55b86a', shorts: '#2f2f2f', shoes: '#3a2e20', skin: '#e8b48f', height: 1.78, look: { eye: '#3f9a5a', mouth: 'open', freckles: true } } },
  { id: 'chanho', name: '찬호', primitiveColor: 0x4477cc, pos: [10, 10], rotY: Math.PI * 0.9, variant: { hair: '#2b2320', shirt: '#4477cc', shorts: '#1f1f1f', shoes: '#c0392b', skin: '#f5c5a6', height: 1.93, look: { eye: '#4a3a2a', mouth: 'smirk', brow: 'strong' } } },
  { id: 'dain', name: '다인', primitiveColor: 0xe0a93f, pos: [-6, -12], rotY: -Math.PI * 0.5, variant: { hair: '#9c3b2e', shirt: '#e0a93f', shorts: '#3a2e20', shoes: '#e8d9b5', skin: '#d99a76', height: 1.7, look: { eye: '#c07a2a', freckles: true } }, patrol: { axis: 'z', half: 2.5 } },
  { id: 'eunho', name: '은호', primitiveColor: 0x9c6bd6, pos: [18, -2], rotY: Math.PI * 0.2, variant: { hair: '#1f3a52', shirt: '#9c6bd6', shorts: '#2f2f3a', shoes: '#4a7a4a', skin: '#c98a63', height: 1.88, look: { eye: '#2f6a9a', mouth: 'calm', glasses: 0xc0392b } } },
]

// Text drawn to a canvas and shown as a camera-facing sprite. `worldHeight`
// is the sprite's height in world units; its width follows the text.
function makeTextSprite(text, { color = '#ffffff', background = 'rgba(15, 18, 26, 0.6)', fontSize = 40, worldHeight = 0.4 } = {}) {
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')
  const font = `bold ${fontSize}px sans-serif`
  g.font = font
  canvas.width = Math.ceil(g.measureText(text).width + fontSize * 1.2)
  canvas.height = Math.ceil(fontSize * 1.7)
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (background) {
    g.fillStyle = background
    g.beginPath()
    g.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2)
    g.fill()
  }
  g.lineWidth = fontSize / 7
  g.strokeStyle = 'rgba(0, 0, 0, 0.75)'
  g.strokeText(text, canvas.width / 2, canvas.height / 2 + 2)
  g.fillStyle = color
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1)
  return sprite
}

const npcs = NPC_DEFS.map((def, i) => {
  const npc = { ...createCharacter(def.primitiveColor, def.variant.hair), phase: i * 1.7, greeted: false, id: def.id, name: def.name }
  npc.group.position.set(def.pos[0], 0, def.pos[1])
  npc.group.rotation.y = def.rotY
  // The delivery quest names its target, so every NPC wears their name.
  npc.nameTag = makeTextSprite(def.name)
  npc.nameTag.position.y = def.variant.height + 0.42
  npc.group.add(npc.nameTag)
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

  // One beam standing in for both headlights; only switched on while the
  // car is being driven at night (see updateNightLights).
  const headlightBeam = new THREE.SpotLight(0xfff1c4, 0, 34, 0.55, 0.6, 1.2)
  headlightBeam.position.set(0, 0.8, 1.6)
  headlightBeam.target.position.set(0, 0, 14)
  group.add(headlightBeam, headlightBeam.target)

  enableShadows(group)
  scene.add(group)
  return { group, wheels, headlightMat, headlightBeam }
}

const CAR_RADIUS = 1.2
const CAR_ENTER_RADIUS = 2.5
const car = createCar()
car.group.position.set(6, 0, -8)
let carSpeed = 0
let driving = false

// ---------- Scenery ----------
// Round, solid props (tree trunks, rocks, lamp posts). `height` lets a jump
// clear the low ones, the same way a landmark box stops blocking from above.
const sceneryColliders = []

function resolveSceneryCollisions(pos, radius) {
  for (const c of sceneryColliders) {
    if (pos.y >= c.height) continue
    const dx = pos.x - c.x
    const dz = pos.z - c.z
    const minDist = c.radius + radius
    const dist = Math.hypot(dx, dz)
    if (dist >= minDist) continue
    const push = minDist - dist
    const [nx, nz] = dist > 0.0001 ? [dx / dist, dz / dist] : [1, 0]
    pos.x += nx * push
    pos.z += nz * push
  }
}

// Dirt paths as three strips that meet edge to edge rather than crossing:
// two coplanar planes overlapping at the junction would z-fight there.
// Each is [centerX, centerZ, sizeX, sizeZ].
const PATH_STRIPS = [
  [7, 2, 40, 2],
  [6, -11, 2, 24],
  [6, 9, 2, 12],
]
const pathMat = new THREE.MeshStandardMaterial({
  map: makeSpeckleTexture('#b89a6a', ['#b09263', '#c0a272', '#aa8c5e'], 1400, 23),
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
})
for (const [cx, cz, sizeX, sizeZ] of PATH_STRIPS) {
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ)
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * sizeX) / TEXTURE_TILE, (uv.getY(i) * sizeZ) / TEXTURE_TILE)
  const strip = new THREE.Mesh(geometry, pathMat)
  strip.rotation.x = -Math.PI / 2
  strip.position.set(cx, 0.03, cz)
  strip.receiveShadow = true
  scene.add(strip)
}

const LAMP_POSITIONS = [[-8, 3.7], [4.3, 3.7], [17, 0.3], [7.7, -15], [4.3, 11]]
const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36 })
const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffd28a, emissiveIntensity: 0 })
for (const [x, z] of LAMP_POSITIONS) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 8), lampPoleMat)
  pole.position.set(x, 1.6, z)
  enableShadows(pole)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), lampBulbMat)
  bulb.position.set(x, 3.3, z)
  scene.add(pole, bulb)
  sceneryColliders.push({ x, z, radius: 0.15, height: 3.2 })
}
// Every real light costs every lit pixel on screen, so only the two lamps
// nearest the player actually cast light (the bulbs themselves all glow).
// The lamps are far enough apart that the pool swapping lamps happens
// beyond the light's reach, where it isn't visible.
const lampLights = []
for (let i = 0; i < 2; i++) {
  const light = new THREE.PointLight(0xffc98a, 0, 13, 1.6)
  scene.add(light)
  lampLights.push(light)
}

// True anywhere a tree or rock would be in the way: on a path, against a
// box or the house, where someone stands or patrols (with room to dodge the
// car), or on top of where the player and the car start.
function sceneryBlocked(x, z) {
  if (Math.hypot(x, z) < 5) return true
  if (Math.hypot(x - car.group.position.x, z - car.group.position.z) < 4.5) return true
  if (Math.abs(x - HOUSE_CENTER.x) < HOUSE_HALF + 4 && Math.abs(z - HOUSE_CENTER.z) < HOUSE_HALF + 4) return true
  for (const [cx, cz, sizeX, sizeZ] of PATH_STRIPS) {
    if (Math.abs(x - cx) < sizeX / 2 + 2.2 && Math.abs(z - cz) < sizeZ / 2 + 2.2) return true
  }
  for (const [lx, , lz] of LANDMARKS) {
    if (Math.hypot(x - lx, z - lz) < 3.4) return true
  }
  for (const [lx, lz] of LAMP_POSITIONS) {
    if (Math.hypot(x - lx, z - lz) < 2.5) return true
  }
  for (const def of NPC_DEFS) {
    const half = def.patrol ? def.patrol.half : 0
    const alongX = def.patrol && def.patrol.axis === 'x'
    const nearestX = alongX ? Math.max(def.pos[0] - half, Math.min(def.pos[0] + half, x)) : def.pos[0]
    const nearestZ = alongX ? def.pos[1] : Math.max(def.pos[1] - half, Math.min(def.pos[1] + half, z))
    if (Math.hypot(x - nearestX, z - nearestZ) < 4.5) return true
  }
  return false
}

// Pines: a scattering across the map (solid trunks), plus a dense band just
// outside the walkable square so the edge of the world reads as a forest
// line instead of an invisible wall. All of them share three InstancedMeshes
// (trunk + two foliage tiers) - a couple hundred separate trees would be
// several hundred draw calls, doubled again by the shadow pass.
const INNER_TREE_COUNT = 30
const BORDER_TREE_COUNT = 200
{
  const rnd = seededRandom(7)
  const trees = []
  const crowded = (x, z, minDist) => trees.some((t) => Math.hypot(t.x - x, t.z - z) < minDist)
  const innerLimit = GROUND_SIZE / 2 - 3
  for (let tries = 0; trees.length < INNER_TREE_COUNT && tries < 5000; tries++) {
    const x = (rnd() * 2 - 1) * innerLimit
    const z = (rnd() * 2 - 1) * innerLimit
    if (sceneryBlocked(x, z) || crowded(x, z, 3.4)) continue
    const scale = 0.85 + rnd() * 0.6
    trees.push({ x, z, scale, rot: rnd() * Math.PI * 2, tint: rnd() })
    sceneryColliders.push({ x, z, radius: 0.3 * scale, height: Infinity })
  }
  const borderInner = GROUND_SIZE / 2 + 2.5
  const borderOuter = GROUND_SIZE / 2 + 17
  for (let tries = 0; trees.length < INNER_TREE_COUNT + BORDER_TREE_COUNT && tries < 20000; tries++) {
    const x = (rnd() * 2 - 1) * borderOuter
    const z = (rnd() * 2 - 1) * borderOuter
    if (Math.max(Math.abs(x), Math.abs(z)) < borderInner || crowded(x, z, 2.8)) continue
    trees.push({ x, z, scale: 1.1 + rnd() * 0.8, rot: rnd() * Math.PI * 2, tint: rnd() })
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.5, 6).translate(0, 0.75, 0)
  const lowerGeo = new THREE.ConeGeometry(1.25, 2.3, 7).translate(0, 2.4, 0)
  const upperGeo = new THREE.ConeGeometry(0.9, 1.9, 7).translate(0, 3.55, 0)
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7a5536, flatShading: true }), trees.length)
  const foliageMat = new THREE.MeshStandardMaterial({ flatShading: true })
  const lowerMesh = new THREE.InstancedMesh(lowerGeo, foliageMat, trees.length)
  const upperMesh = new THREE.InstancedMesh(upperGeo, foliageMat, trees.length)

  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  trees.forEach((t, i) => {
    quat.setFromAxisAngle(up, t.rot)
    matrix.compose(new THREE.Vector3(t.x, 0, t.z), quat, new THREE.Vector3(t.scale, t.scale, t.scale))
    trunkMesh.setMatrixAt(i, matrix)
    lowerMesh.setMatrixAt(i, matrix)
    upperMesh.setMatrixAt(i, matrix)
    color.setHSL(0.29 + t.tint * 0.09, 0.42 + t.tint * 0.15, 0.24 + t.tint * 0.1)
    lowerMesh.setColorAt(i, color)
    color.offsetHSL(0, 0, 0.035)
    upperMesh.setColorAt(i, color)
  })
  for (const mesh of [trunkMesh, lowerMesh, upperMesh]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8f96, flatShading: true })
  for (let placed = 0, tries = 0; placed < 12 && tries < 2000; tries++) {
    const x = (rnd() * 2 - 1) * innerLimit
    const z = (rnd() * 2 - 1) * innerLimit
    if (sceneryBlocked(x, z) || crowded(x, z, 2.2)) continue
    const size = 0.35 + rnd() * 0.35
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), rockMat)
    rock.position.set(x, size * 0.35, z)
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
    rock.scale.y = 0.7
    enableShadows(rock)
    scene.add(rock)
    sceneryColliders.push({ x, z, radius: size * 0.8, height: size })
    placed++
  }
}

// Stars sit on a shell centred on the camera (re-centred every frame in
// updateSkyDecor) so they never get closer or slide past like scenery, and
// only fade in as nightFactor rises.
const stars = (() => {
  const rnd = seededRandom(31)
  const positions = []
  while (positions.length < 500 * 3) {
    const v = new THREE.Vector3(rnd() * 2 - 1, rnd(), rnd() * 2 - 1)
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue
    v.normalize().multiplyScalar(300)
    if (v.y < 15) continue
    positions.push(v.x, v.y, v.z)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
  )
  points.frustumCulled = false
  scene.add(points)
  return points
})()

const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
const CLOUD_WRAP = 180
const clouds = (() => {
  const rnd = seededRandom(53)
  const puffGeo = new THREE.SphereGeometry(1, 8, 6)
  const list = []
  for (let i = 0; i < 10; i++) {
    const group = new THREE.Group()
    const puffs = 4 + Math.floor(rnd() * 3)
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat)
      puff.scale.set(6 + rnd() * 5, 2 + rnd() * 1.3, 4 + rnd() * 3)
      puff.position.set((rnd() * 2 - 1) * 8, rnd() * 1.2, (rnd() * 2 - 1) * 3)
      group.add(puff)
    }
    group.position.set((rnd() * 2 - 1) * CLOUD_WRAP, 44 + rnd() * 16, (rnd() * 2 - 1) * CLOUD_WRAP)
    scene.add(group)
    list.push({ group, speed: 0.8 + rnd() * 0.9 })
  }
  return list
})()

function updateSkyDecor(dt) {
  stars.position.copy(camera.position)
  stars.material.opacity = nightFactor * 0.9
  cloudMat.color.setHex(lerpHex(currentSkyHex, 0xffffff, 0.12 + 0.78 * (1 - nightFactor)))
  for (const cloud of clouds) {
    cloud.group.position.x += cloud.speed * dt
    if (cloud.group.position.x > CLOUD_WRAP) cloud.group.position.x = -CLOUD_WRAP
  }
}

// Everything that only matters after dark, all driven by the same
// nightFactor so lamps, windows and headlights come up together at dusk.
const LAMP_INTENSITY = 13
const HOUSE_LIGHT_INTENSITY = 9
const HEADLIGHT_BEAM_INTENSITY = 110
const HEADLIGHT_NIGHT = 0xfff0b0

function updateNightLights() {
  const focus = driving ? car.group.position : player.position
  const nearest = LAMP_POSITIONS.map(([x, z]) => ({ x, z, d: Math.hypot(x - focus.x, z - focus.z) })).sort((a, b) => a.d - b.d)
  lampLights.forEach((light, i) => {
    light.position.set(nearest[i].x, 3.1, nearest[i].z)
    light.intensity = nightFactor * LAMP_INTENSITY
  })
  lampBulbMat.emissiveIntensity = nightFactor * 2
  windowMat.emissiveIntensity = nightFactor * 1.5
  houseLight.intensity = nightFactor * HOUSE_LIGHT_INTENSITY
  const beam = driving ? nightFactor : 0
  car.headlightBeam.intensity = beam * HEADLIGHT_BEAM_INTENSITY
  if (performance.now() / 1000 > headlightFlashUntil) {
    car.headlightMat.emissive.setHex(lerpHex(HEADLIGHT_NORMAL, HEADLIGHT_NIGHT, beam))
  }
}

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

// Synthesized rather than an audio file - a couple of overlapping sawtooth
// tones with a quick attack/decay envelope reads as a honk close enough for
// this. AudioContext is created lazily on first use since browsers refuse
// to start one before a user gesture, and a key press already is one.
let audioCtx = null
const HORN_DURATION = 0.35
function playHorn() {
  if (!(window.AudioContext || window.webkitAudioContext)) return
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  const now = audioCtx.currentTime
  for (const freq of [320, 400]) {
    const osc = audioCtx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const gain = audioCtx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
    gain.gain.setValueAtTime(0.22, now + HORN_DURATION - 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + HORN_DURATION)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(now)
    osc.stop(now + HORN_DURATION + 0.02)
  }
}

// Honking both plays the sound and widens/speeds up the NPC dodge check
// below (see updateNpcDodge) for HORN_EFFECT_DURATION seconds - a quiet
// approach only makes NPCs step aside at the last moment, a honk gets
// their attention from further out. The headlights flash bright white
// briefly too, as a silent-mode-friendly visual echo of the same beat.
const HORN_EFFECT_DURATION = 1.4
let hornActiveUntil = 0
let headlightFlashUntil = 0
const HEADLIGHT_NORMAL = 0x554400
const HEADLIGHT_FLASH = 0xffffff

function honk() {
  playHorn()
  const now = performance.now() / 1000
  hornActiveUntil = now + HORN_EFFECT_DURATION
  headlightFlashUntil = now + 0.15
  car.headlightMat.emissive.setHex(HEADLIGHT_FLASH)
}

const hintEl = document.getElementById('hint')
const DEFAULT_HINT = hintEl ? hintEl.textContent : ''
function updateHint() {
  if (!hintEl) return
  if (driving) hintEl.textContent = 'W/S 가속·후진 · A/D 조향 · H 키로 경적 · E 키로 하차 · V 키로 시점 전환'
  else if (nearCar()) hintEl.textContent = 'E 키를 눌러 차에 탑승'
  else hintEl.textContent = DEFAULT_HINT
}

// Keyboard input. Jump is triggered here (edge-style, gated on `grounded`
// and not already mid-jump-animation) rather than read as a held key, so
// holding Space doesn't bunny-hop or restart the windup mid-crouch.
const heldKeys = new Set()
const JUMP_KEYS = [' ', 'spacebar']
const ENTER_KEYS = ['e', 'f']
const HORN_KEYS = ['h']
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  // Checked before heldKeys.add() below, using that same set as the
  // repeat-guard - otherwise the browser's own key-repeat would retrigger
  // the horn (and its sound) every frame the key stays held.
  if (HORN_KEYS.includes(key) && driving && !heldKeys.has(key)) {
    honk()
  }
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
    if (npc.hit) continue
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
    if (!patrol || npc.dodging || npc.hit) continue
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

// NPCs step out of the oncoming car's way rather than just being a wall
// it bumps into (resolveNpcCollisions below is still there as a backstop,
// for a model that hasn't loaded yet or a dodge that doesn't quite clear
// in time). Sidesteps relative to the car's own heading - using the
// lateral offset (the component of the NPC's position perpendicular to
// where the car is pointed) rather than just "away from the car" - so an
// NPC standing directly in the car's path still has a clear side to jump
// toward instead of the two vectors cancelling out near zero.
// Honking (see honk()) widens the radius they notice from and is the
// difference between a leisurely step aside and a last-second flinch.
const NPC_DODGE_RADIUS = 3.5
const NPC_DODGE_RADIUS_HORN = 7
const NPC_DODGE_SPEED = 5
const NPC_DODGE_DURATION = 0.5
const NPC_DODGE_COOLDOWN = 0.6

function updateNpcDodge(dt) {
  const hornActive = performance.now() / 1000 < hornActiveUntil

  for (const npc of npcs) {
    if (npc.dodgeCooldown > 0) npc.dodgeCooldown -= dt
    if (npc.hit) continue

    if (npc.dodging) {
      const d = npc.dodging
      npc.group.position.x += d.dir.x * NPC_DODGE_SPEED * dt
      npc.group.position.z += d.dir.z * NPC_DODGE_SPEED * dt
      npc.group.rotation.y = Math.atan2(d.dir.x, d.dir.z)
      npc.walking = true
      d.timer -= dt
      if (d.timer <= 0) {
        npc.dodging = null
        npc.dodgeCooldown = NPC_DODGE_COOLDOWN
        npc.walking = false
      }
      continue
    }

    if (!driving || Math.abs(carSpeed) < 1 || npc.dodgeCooldown > 0) continue

    const dx = npc.group.position.x - car.group.position.x
    const dz = npc.group.position.z - car.group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist >= (hornActive ? NPC_DODGE_RADIUS_HORN : NPC_DODGE_RADIUS)) continue

    const heading = car.group.rotation.y
    const rightX = Math.cos(heading)
    const rightZ = -Math.sin(heading)
    const sign = dx * rightX + dz * rightZ >= 0 ? 1 : -1
    npc.dodging = { timer: NPC_DODGE_DURATION, dir: { x: rightX * sign, z: rightZ * sign } }
    npc.walking = true
  }
}

// If the dodge above didn't clear in time (or never got the chance to -
// hit detection runs regardless of whether an npc was mid-dodge), an actual
// overlap at real speed knocks the NPC down instead of the car just
// quietly shoving through them: a short knockback slide away from the
// impact, a tip onto the ground (rotating the whole group around its own
// feet - crude as a fall, but reads fine at this scale), a beat lying
// there, then back up. Limb rotations are reset once on impact so they
// don't hold a mid-stride walk-cycle pose while lying down.
const HIT_SPEED_THRESHOLD = 2
const HIT_KNOCKBACK_SPEED = 6
const HIT_KNOCKBACK_FRICTION = 10
const HIT_FALL_DURATION = 0.3
const HIT_GROUND_DURATION = 1.6
const HIT_RISE_DURATION = 0.35

function resetNpcLimbPose(npc) {
  npc.armL.rotation.x = 0
  npc.armR.rotation.x = 0
  npc.legL.hip.rotation.x = 0
  npc.legR.hip.rotation.x = 0
  if (npc.modelRig) {
    npc.modelRig.armL.rotation.x = 0
    npc.modelRig.armR.rotation.x = 0
    npc.modelRig.legL.rotation.x = 0
    npc.modelRig.legR.rotation.x = 0
    npc.modelRig.root.position.y = 0
  }
}

// Split from the animation below on purpose: this only runs while driving,
// right after updateCar() moves the car and before resolveNpcCollisions
// corrects that position back out - see the call site for why the ordering
// matters. The knockback/fall/rise animation itself has to keep running
// every frame regardless of whether the player is still in the car (they
// might hop out mid-animation), so it's a separate function called
// unconditionally.
function triggerNpcHits() {
  if (!driving || Math.abs(carSpeed) <= HIT_SPEED_THRESHOLD) return
  for (const npc of npcs) {
    if (npc.hit) continue
    const dx = npc.group.position.x - car.group.position.x
    const dz = npc.group.position.z - car.group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist >= CAR_RADIUS + NPC_RADIUS) continue

    npc.dodging = null
    const [nx, nz] = dist > 0.0001 ? [dx / dist, dz / dist] : [0, 1]
    npc.group.rotation.y = Math.atan2(nx, nz)
    npc.hit = { phase: 'fall', t: 0, vx: nx * HIT_KNOCKBACK_SPEED, vz: nz * HIT_KNOCKBACK_SPEED }
    resetNpcLimbPose(npc)
  }
}

function updateNpcHitAnimation(dt) {
  for (const npc of npcs) {
    const h = npc.hit
    if (!h) continue
    h.t += dt

    const speed = Math.hypot(h.vx, h.vz)
    if (speed > 0.01) {
      npc.group.position.x += h.vx * dt
      npc.group.position.z += h.vz * dt
      const decay = Math.max(0, speed - HIT_KNOCKBACK_FRICTION * dt) / speed
      h.vx *= decay
      h.vz *= decay
    }

    if (h.phase === 'fall') {
      const t = Math.min(1, h.t / HIT_FALL_DURATION)
      npc.group.rotation.x = -t * (Math.PI / 2)
      if (t >= 1) {
        h.phase = 'ground'
        h.t = 0
      }
    } else if (h.phase === 'ground') {
      if (h.t >= HIT_GROUND_DURATION) {
        h.phase = 'rise'
        h.t = 0
      }
    } else if (h.phase === 'rise') {
      const t = Math.min(1, h.t / HIT_RISE_DURATION)
      npc.group.rotation.x = -(1 - t) * (Math.PI / 2)
      if (t >= 1) {
        npc.hit = null
        npc.dodgeCooldown = 0.3
      }
    }
  }
}

// Spoken out loud via the browser's built-in text-to-speech (no voice
// files to generate or host) rather than a silent on-screen bubble.
const subtitleEl = document.getElementById('subtitle')
let subtitleTimer = 0
function speak(text) {
  // Shown on screen as well: text-to-speech is silent on a muted tab and
  // missing outright in some browsers, and the quest lines matter.
  if (subtitleEl) {
    subtitleEl.textContent = text
    subtitleEl.style.opacity = '1'
    clearTimeout(subtitleTimer)
    subtitleTimer = setTimeout(() => {
      subtitleEl.style.opacity = '0'
    }, 4000)
  }
  if (!window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ko-KR'
  utter.pitch = 1.05
  window.speechSynthesis.speak(utter)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// A repeatable fetch quest: approach the giver (arin) while no quest is
// active to get asked to carry an item to a random other NPC, clear across
// the map; approach that NPC while it's active to complete it and reopen
// the loop. The target, item, and phrasing are all re-rolled each time
// (excluding whoever was just the target, so two deliveries in a row never
// send the player to the same place) rather than a single fixed line -
// otherwise every single offer and every single thank-you reads as the
// exact same two sentences on repeat, which got old fast. Piggybacks on
// the same greeted edge-trigger as the regular hello below, so it fires
// once per approach rather than every frame spent standing in GREET_RADIUS.
const QUEST_GIVER_ID = 'arin'
const QUEST_ITEMS = ['책', '편지', '빵', '우산', '화분', '열쇠']
const QUEST_OFFER_LINES = [
  (target, item) => `저 멀리 ${target}에게 전해줄 ${item}이(가) 있어요. 가져다 줄래요?`,
  (target, item) => `이 ${item} 좀 ${target}한테 갖다 줄 수 있어요?`,
  (target, item) => `${target}가 ${item}을(를) 기다리고 있대요. 부탁해도 될까요?`,
  (target, item) => `미안한데 ${item} 하나만 ${target}에게 전달해 줄래요?`,
]
const QUEST_DONE_LINES = ['고마워요! 덕분에 살았어요.', '오, 드디어 왔네요! 고마워요.', '와, 정말 감사해요!', '이걸 기다렸어요. 고마워요!']
let questState = 'none' // 'none' | 'active'
let questTargetId = null

function npcById(id) {
  return npcs.find((n) => n.id === id)
}

// Floating above whoever the player needs to find next: a "!" over the
// quest giver while there's a delivery to pick up, a gold diamond over the
// recipient while one is being carried.
const questOfferMarker = makeTextSprite('!', { color: '#ffd23f', background: null, fontSize: 96, worldHeight: 0.8 })
const questTargetMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false }))
questTargetMarker.scale.y = 1.5
scene.add(questOfferMarker, questTargetMarker)
const QUEST_MARKER_HEIGHT = 2.95

function updateQuestMarkers(dt) {
  const bob = Math.sin(performance.now() / 300) * 0.1
  const carrying = questState === 'active'
  const giver = npcById(QUEST_GIVER_ID).group.position
  questOfferMarker.visible = !carrying
  questOfferMarker.position.set(giver.x, QUEST_MARKER_HEIGHT + bob, giver.z)
  const target = carrying ? npcById(questTargetId).group.position : null
  questTargetMarker.visible = carrying
  if (target) questTargetMarker.position.set(target.x, QUEST_MARKER_HEIGHT + bob, target.z)
  questTargetMarker.rotation.y += dt * 2.5
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
        const candidates = npcs.filter((n) => n.id !== QUEST_GIVER_ID && n.id !== questTargetId)
        const target = pick(candidates)
        const item = pick(QUEST_ITEMS)
        questState = 'active'
        questTargetId = target.id
        speak(`${npc.name}: ${pick(QUEST_OFFER_LINES)(target.name, item)}`)
        setQuestBanner(`퀘스트: ${target.name}에게 ${item} 전달하기`)
      } else if (npc.id === questTargetId && questState === 'active') {
        questState = 'none'
        // questTargetId is deliberately left set (not cleared to null) -
        // the next offer's candidate filter excludes it so two deliveries
        // in a row never send the player back to the same NPC.
        speak(`${npc.name}: ${pick(QUEST_DONE_LINES)}`)
        setQuestBanner('퀘스트 완료! 다시 아린에게 가보세요.', 5000)
      } else {
        speak(`${npc.name}: 안녕?`)
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
const JUMP_WINDUP = 0.2
const JUMP_EXTEND = 0.22
const KNEE_BEND_MAX = 1.4
const HIP_TILT_MAX = 0.6 // 허벅지가 앞으로 나와야 쪼그려 앉는 자세로 보인다
const SQUASH_MIN = 0.78
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
    applyLegPose(t * KNEE_BEND_MAX, t * HIP_TILT_MAX, 1 - t * (1 - SQUASH_MIN))
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
    applyLegPose(KNEE_BEND_MAX * (1 - ease), HIP_TILT_MAX * (1 - ease), SQUASH_MIN + (1 - SQUASH_MIN) * ease)
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
  updateNightLights()
  updateNpcDodge(dt)

  if (driving) {
    updateCar(dt)
    // Checked against the car's raw post-movement position, before
    // resolveNpcCollisions below gets a chance to correct it back out to
    // exactly NPC_RADIUS+CAR_RADIUS apart - which is also triggerNpcHits'
    // own trigger distance, so checking after that correction would never
    // see a real overlap at all (every frame the car grazed an NPC, it'd
    // already have been pushed back to precisely the "just barely not
    // touching" distance before the hit check ever ran).
    triggerNpcHits()
    resolveBoxCollisions(car.group.position, CAR_RADIUS)
    resolveWallCollisions(car.group.position, CAR_RADIUS)
    resolveNpcCollisions(car.group.position, CAR_RADIUS)
    resolveSceneryCollisions(car.group.position, CAR_RADIUS)
  } else {
    updatePlayer(dt)
    updateJumpAnim(dt)
    resolveBoxCollisions(player.position, PLAYER_RADIUS)
    resolveWallCollisions(player.position, PLAYER_RADIUS)
    resolveNpcCollisions(player.position, PLAYER_RADIUS)
    resolveCarCollision(player.position, PLAYER_RADIUS)
    resolveSceneryCollisions(player.position, PLAYER_RADIUS)
    updateVertical(dt)
    updateNpcGreetings()
  }
  updateNpcHitAnimation(dt)
  updateNpcPatrol(dt)
  updateNpcs(dt)
  updateBlinks(performance.now() / 1000)
  updateHint()
  updateCamera()
  updateSkyDecor(dt)
  updateQuestMarkers(dt)
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
