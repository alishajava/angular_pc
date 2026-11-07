const canvas = document.getElementById('game')
canvas.width = 960
canvas.height = 560
const ctx = canvas.getContext('2d')

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// The 2.5D illusion: x scrolls the camera (true side-scroller axis), while
// y is a shallow "depth" band the player and enemies can also move within.
// Nothing about y is scrolled - it maps straight to screen y - but entities
// are drawn in y order (painter's algorithm) so a character standing
// "further forward" (larger y) draws over one standing further back, and
// depthScale makes them a little bigger too. That's the whole trick.
const WORLD_WIDTH = 3400
const DEPTH_TOP = 300
const DEPTH_BOTTOM = 460
const DEPTH_MID = (DEPTH_TOP + DEPTH_BOTTOM) / 2
const GROUND_TOP = 270

function depthScale(y) {
  return 0.82 + ((y - DEPTH_TOP) / (DEPTH_BOTTOM - DEPTH_TOP)) * 0.3
}

const PLAYER_SPEED = 170
const PLAYER_MAX_HP = 100

// A jump is a straight-up hop (z), independent of the x/depth-y plane you
// still steer mid-air. High enough off the ground, it also dodges grounded
// enemy attacks - giving it a tactical reason to exist beyond looking nice.
const JUMP_VELOCITY = 280
const GRAVITY = 950
const JUMP_DODGE_HEIGHT = 16

const ATTACKS = {
  punch: { startup: 0.08, active: 0.08, recovery: 0.14, range: 52, damage: 10, knockback: 36 },
  kick: { startup: 0.14, active: 0.1, recovery: 0.22, range: 60, damage: 16, knockback: 80 },
  ultimate: { startup: 0.15, active: 0.2, recovery: 0.35, range: 150, damage: 35, knockback: 90 },
  // Not a simple knockback like the others - resolvePlayerThrow launches
  // the grabbed enemy into its own little gravity arc (see the enemy
  // 'thrown' state in updateEnemies), so `knockback` here is unused but
  // kept for shape-consistency with the rest of this table.
  throw: { startup: 0.12, active: 0.1, recovery: 0.35, range: 46, damage: 20, knockback: 0 },
}

// A quick burst forward on double-tapping a direction - classic fighting-
// game "dash" input. Tracked by logical direction (not the exact key) so
// tapping 'a' then quickly 'arrowleft' still counts; DOUBLE_TAP_WINDOW is
// generous since this is a beat-em-up, not a frame-perfect fighter.
const DASH_SPEED = 480
const DASH_DURATION = 0.18
const DOUBLE_TAP_WINDOW = 280
let lastTapTime = { left: -9999, right: -9999 }

// Punch and kick pressed together (within this window, in either order)
// throws instead - see the keydown handler and canThrowOverride below.
const THROW_WINDOW = 120
let lastPunchPress = -9999
let lastKickPress = -9999

// Fills as the player lands hits (and a bit more when they get hit, so a
// losing fight still builds toward a comeback). At max, L unleashes a big
// 360-degree hit that also makes the player briefly invulnerable.
const GAUGE_MAX = 100
const GAUGE_PER_HIT = 6
const GAUGE_PER_HURT = 15

const ENEMY_TYPES = {
  thug: { hp: 28, speed: 85, damage: 8, attackRange: 48, telegraph: 0.32, active: 0.14, cooldown: 0.85, color: '#c0564a' },
  boss: { hp: 170, speed: 58, damage: 16, attackRange: 58, telegraph: 0.42, active: 0.2, cooldown: 1.0, color: '#7b3fa0' },
}

// Classic beat-em-up pacing: crossing a trigger spawns that wave and locks
// the camera (see updateCamera's gateX clamp) until every enemy in it is
// dead, so the player can't just outrun the fight. SPAWN_AHEAD puts
// enemies just off the right edge of the now-locked screen so they walk
// in rather than popping up already in frame.
const SPAWN_AHEAD = 260
const WAVES = [
  { triggerX: 480, enemies: [{ dx: 0, dy: -50, type: 'thug' }, { dx: 40, dy: 45, type: 'thug' }] },
  { triggerX: 1300, enemies: [{ dx: 0, dy: -55, type: 'thug' }, { dx: 30, dy: 0, type: 'thug' }, { dx: 60, dy: 55, type: 'thug' }] },
  { triggerX: 2300, enemies: [{ dx: 0, dy: 0, type: 'boss' }] },
]

const HITSTUN_DURATION = 0.3
const DEATH_FADE = 0.4

function makePlayer() {
  return {
    x: 120,
    y: DEPTH_MID,
    hp: PLAYER_MAX_HP,
    facing: 1,
    moving: false,
    walkPhase: 0,
    attack: null, // { type, phase: 'startup' | 'active' | 'recovery', t, resolved }
    hitstunTimer: 0,
    flashTimer: 0,
    gauge: 0,
    invulnTimer: 0,
    ultimateFlash: 0,
    z: 0,
    vz: 0,
    jumping: false,
    dashing: false,
    dashTimer: 0,
    dashDir: 1,
  }
}

function makeEnemy(type, x, y) {
  return {
    type,
    x,
    y,
    hp: ENEMY_TYPES[type].hp,
    maxHp: ENEMY_TYPES[type].hp,
    facing: -1,
    state: 'approach', // approach | telegraph | attack | cooldown-is-implicit | hitstun | thrown | dead
    t: 0,
    cooldownTimer: 0,
    hitstunTimer: 0,
    resolved: false,
    walkPhase: Math.random() * 10,
    deathTimer: 0,
    flashTimer: 0,
    thrown: null,
  }
}

function makeInitialState() {
  return {
    phase: 'playing', // playing | gameover | cleared
    player: makePlayer(),
    enemies: [],
    cameraX: 0,
    gateX: null,
    waveIndex: 0,
  }
}
let state = makeInitialState()

function canAct() {
  const p = state.player
  return !p.attack && !p.dashing && p.hitstunTimer <= 0
}
// A throw is allowed to cancel the *other* button's attack, but only while
// that attack is still in its startup window (hasn't dealt damage or
// committed to recovery yet) - otherwise mashing both buttons during an
// active hit would let you cancel recovery frames for free.
function canThrowOverride() {
  const p = state.player
  return !p.dashing && p.hitstunTimer <= 0 && (!p.attack || p.attack.phase === 'startup')
}

const heldKeys = new Set()
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  const isRepeat = heldKeys.has(key)
  heldKeys.add(key)
  if (key === 'r') {
    state = makeInitialState()
    return
  }
  if (state.phase !== 'playing') return

  if (!isRepeat) {
    const now = performance.now()
    if (MOVE_KEYS.left.includes(key)) {
      if (now - lastTapTime.left < DOUBLE_TAP_WINDOW) startDash(-1)
      lastTapTime.left = now
    }
    if (MOVE_KEYS.right.includes(key)) {
      if (now - lastTapTime.right < DOUBLE_TAP_WINDOW) startDash(1)
      lastTapTime.right = now
    }
  }

  if (key === 'j') {
    const now = performance.now()
    const isThrow = now - lastKickPress <= THROW_WINDOW
    lastPunchPress = now
    if (isThrow && canThrowOverride()) startAttack('throw')
    else if (canAct()) startAttack('punch')
  }
  if (key === 'k') {
    const now = performance.now()
    const isThrow = now - lastPunchPress <= THROW_WINDOW
    lastKickPress = now
    if (isThrow && canThrowOverride()) startAttack('throw')
    else if (canAct()) startAttack('kick')
  }
  if (key === 'l' && canAct() && state.player.gauge >= GAUGE_MAX) {
    startAttack('ultimate')
  }
  if (key === ' ' && !state.player.jumping && canAct()) {
    e.preventDefault() // stop the page from scrolling on space
    startJump()
  }
})
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()))
function held(names) { return names.some((k) => heldKeys.has(k)) }

const MOVE_KEYS = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
}

function startAttack(type) {
  const p = state.player
  p.attack = { type, phase: 'startup', t: 0, resolved: false }
  if (type === 'ultimate') {
    p.gauge = 0
    p.ultimateFlash = 0.3
    p.invulnTimer = ATTACKS.ultimate.startup + ATTACKS.ultimate.active
  }
}

function startJump() {
  const p = state.player
  p.jumping = true
  p.vz = JUMP_VELOCITY
}

function startDash(dir) {
  const p = state.player
  if (p.attack || p.hitstunTimer > 0 || p.dashing || p.jumping) return
  p.dashing = true
  p.dashTimer = DASH_DURATION
  p.dashDir = dir
  p.facing = dir
}

function playerMaxX() {
  return state.gateX !== null ? state.gateX + canvas.width - 60 : WORLD_WIDTH - 40
}

function updatePlayer(dt) {
  const p = state.player
  if (p.flashTimer > 0) p.flashTimer -= dt
  if (p.invulnTimer > 0) p.invulnTimer -= dt
  if (p.ultimateFlash > 0) p.ultimateFlash -= dt

  if (p.jumping) {
    p.vz -= GRAVITY * dt
    p.z += p.vz * dt
    if (p.z <= 0) {
      p.z = 0
      p.vz = 0
      p.jumping = false
    }
  }

  if (p.dashing) {
    p.dashTimer -= dt
    p.moving = true
    p.walkPhase += dt * 20 // fast leg blur, faster than the normal run cycle
    p.x = clamp(p.x + p.dashDir * DASH_SPEED * dt, 40, playerMaxX())
    if (p.dashTimer <= 0) p.dashing = false
    return // skip the hitstun/attack/movement branch below entirely
  }

  if (p.hitstunTimer > 0) {
    p.hitstunTimer -= dt
    p.moving = false
  } else if (!p.attack) {
    let dx = 0
    let dy = 0
    if (held(MOVE_KEYS.left)) dx -= 1
    if (held(MOVE_KEYS.right)) dx += 1
    if (held(MOVE_KEYS.up)) dy -= 1
    if (held(MOVE_KEYS.down)) dy += 1
    p.moving = dx !== 0 || dy !== 0
    if (p.moving) {
      const len = Math.hypot(dx, dy)
      dx /= len
      dy /= len
      p.x = clamp(p.x + dx * PLAYER_SPEED * dt, 40, playerMaxX())
      p.y = clamp(p.y + dy * PLAYER_SPEED * dt, DEPTH_TOP, DEPTH_BOTTOM)
      if (dx !== 0) p.facing = Math.sign(dx)
      p.walkPhase += dt * 9
    }
  } else {
    p.moving = false
  }

  if (p.attack) updatePlayerAttack(dt)
}

function updatePlayerAttack(dt) {
  const p = state.player
  const atk = p.attack
  const def = ATTACKS[atk.type]
  atk.t += dt
  if (atk.phase === 'startup' && atk.t >= def.startup) {
    atk.phase = 'active'
    atk.t = 0
    atk.resolved = false
  } else if (atk.phase === 'active') {
    // Resolved exactly once on entering the active window - not "while
    // active", which would hit every frame of it instead of just once.
    if (!atk.resolved) {
      resolvePlayerHit(atk.type)
      atk.resolved = true
    }
    if (atk.t >= def.active) {
      atk.phase = 'recovery'
      atk.t = 0
    }
  } else if (atk.phase === 'recovery') {
    if (atk.t >= def.recovery) p.attack = null
  }
}

function resolvePlayerHit(type) {
  if (type === 'throw') return resolvePlayerThrow()
  const p = state.player
  const def = ATTACKS[type]
  const omni = type === 'ultimate' // hits all around, not just in front
  for (const en of state.enemies) {
    if (en.state === 'dead') continue
    const dx = en.x - p.x
    const dy = en.y - p.y
    if (!omni) {
      const inFront = p.facing > 0 ? dx > -15 : dx < 15
      if (!inFront) continue
    }
    if (Math.abs(dx) > def.range || Math.abs(dy) > (omni ? 70 : 50)) continue
    damageEnemy(en, def.damage, Math.sign(dx || p.facing) * def.knockback)
    if (!omni) p.gauge = Math.min(GAUGE_MAX, p.gauge + GAUGE_PER_HIT)
  }
}

// Grabs the single nearest valid enemy in front (dead or already-thrown
// enemies can't be grabbed) and launches it into a gravity arc rather than
// a simple sideways knockback - see the 'thrown' state in updateEnemies for
// the actual flight physics, and drawEnemySprite for how its height gets
// rendered as lift, same trick as the player's own jump.
const THROW_LAUNCH_VZ = 260
const THROW_LAUNCH_VX = 220

function resolvePlayerThrow() {
  const p = state.player
  const def = ATTACKS.throw
  let best = null
  let bestDist = Infinity
  for (const en of state.enemies) {
    if (en.state === 'dead' || en.state === 'thrown') continue
    const dx = en.x - p.x
    const dy = en.y - p.y
    const inFront = p.facing > 0 ? dx > -15 : dx < 15
    if (!inFront) continue
    if (Math.abs(dx) > def.range || Math.abs(dy) > 50) continue
    const dist = Math.hypot(dx, dy)
    if (dist < bestDist) {
      bestDist = dist
      best = en
    }
  }
  if (!best) return

  const dir = Math.sign(best.x - p.x) || p.facing
  best.hp -= def.damage
  best.flashTimer = 0.12
  best.facing = -dir
  p.gauge = Math.min(GAUGE_MAX, p.gauge + GAUGE_PER_HIT)
  if (best.hp <= 0) {
    best.state = 'dead'
    best.deathTimer = DEATH_FADE
    return
  }
  best.state = 'thrown'
  best.thrown = { z: 0, vz: THROW_LAUNCH_VZ, vx: dir * THROW_LAUNCH_VX }
}

function damageEnemy(en, dmg, knockbackDx) {
  en.hp -= dmg
  en.flashTimer = 0.12
  en.x = clamp(en.x + knockbackDx, 40, WORLD_WIDTH - 40)
  if (en.hp <= 0) {
    en.state = 'dead'
    en.deathTimer = DEATH_FADE
  } else {
    en.state = 'hitstun'
    en.hitstunTimer = HITSTUN_DURATION
    en.t = 0
  }
}

function damagePlayer(dmg, knockbackDx) {
  const p = state.player
  if (p.hitstunTimer > 0) return // brief invulnerability while already reeling
  if (p.invulnTimer > 0) return // mid-ultimate invulnerability window
  if (p.jumping && p.z > JUMP_DODGE_HEIGHT) return // high enough to hop over a grounded attack
  p.hp = Math.max(0, p.hp - dmg)
  p.hitstunTimer = HITSTUN_DURATION
  p.flashTimer = 0.15
  p.attack = null
  p.dashing = false // otherwise next frame's dash branch would run before this stun and ignore it entirely
  p.gauge = Math.min(GAUGE_MAX, p.gauge + GAUGE_PER_HURT)
  p.x = clamp(p.x + knockbackDx, 40, playerMaxX())
  if (p.hp <= 0) state.phase = 'gameover'
}

function updateEnemies(dt) {
  const p = state.player
  for (const en of state.enemies) {
    if (en.flashTimer > 0) en.flashTimer -= dt
    if (en.state === 'dead') {
      en.deathTimer -= dt
      continue
    }
    if (en.cooldownTimer > 0) en.cooldownTimer -= dt

    if (en.state === 'hitstun') {
      en.hitstunTimer -= dt
      if (en.hitstunTimer <= 0) en.state = 'approach'
      continue
    }

    if (en.state === 'thrown') {
      const th = en.thrown
      th.vz -= GRAVITY * dt
      th.z += th.vz * dt
      en.x = clamp(en.x + th.vx * dt, 40, WORLD_WIDTH - 40)
      if (th.z <= 0) {
        th.z = 0
        en.thrown = null
        en.state = 'hitstun'
        en.hitstunTimer = HITSTUN_DURATION * 1.5 // a beat longer than a normal hit - they just landed hard
        en.t = 0
      }
      continue
    }

    const stats = ENEMY_TYPES[en.type]
    const dx = p.x - en.x
    const dy = p.y - en.y
    const dist = Math.hypot(dx, dy)

    if (en.state === 'approach') {
      if (dx !== 0) en.facing = Math.sign(dx)
      if (dist <= stats.attackRange && en.cooldownTimer <= 0) {
        en.state = 'telegraph'
        en.t = 0
      } else if (dist > stats.attackRange * 0.8) {
        const nx = dx / (dist || 1)
        const ny = dy / (dist || 1)
        en.x = clamp(en.x + nx * stats.speed * dt, 40, WORLD_WIDTH - 40)
        en.y = clamp(en.y + ny * stats.speed * dt, DEPTH_TOP, DEPTH_BOTTOM)
        en.walkPhase += dt * 8
      }
    } else if (en.state === 'telegraph') {
      en.t += dt
      if (en.t >= stats.telegraph) {
        en.state = 'attack'
        en.t = 0
        en.resolved = false
      }
    } else if (en.state === 'attack') {
      en.t += dt
      if (!en.resolved) {
        const d2 = Math.hypot(p.x - en.x, p.y - en.y)
        if (d2 <= stats.attackRange + 10) damagePlayer(stats.damage, Math.sign(-en.facing) * 30)
        en.resolved = true
      }
      if (en.t >= stats.active) {
        en.state = 'approach'
        en.t = 0
        en.cooldownTimer = stats.cooldown
      }
    }
  }

  resolveEnemySeparation()
  state.enemies = state.enemies.filter((en) => !(en.state === 'dead' && en.deathTimer <= 0))
}

// Keeps enemies from all stacking on exactly the player's position -
// same circle push-out idea used for the 3D prototype's NPCs, just
// between enemies only (the player can still be surrounded).
function resolveEnemySeparation() {
  const alive = state.enemies.filter((e) => e.state !== 'dead' && e.state !== 'thrown')
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i]
      const b = alive[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy)
      const minDist = 36
      if (dist >= minDist || dist < 0.001) continue
      const push = (minDist - dist) / 2
      const nx = dx / dist
      const ny = dy / dist
      a.x -= nx * push
      a.y = clamp(a.y - ny * push, DEPTH_TOP, DEPTH_BOTTOM)
      b.x += nx * push
      b.y = clamp(b.y + ny * push, DEPTH_TOP, DEPTH_BOTTOM)
    }
  }
}

function checkWaveTriggers() {
  if (state.gateX !== null) return
  const idx = state.waveIndex
  if (idx >= WAVES.length) return
  const wave = WAVES[idx]
  if (state.player.x < wave.triggerX) return

  for (const spec of wave.enemies) {
    state.enemies.push(makeEnemy(spec.type, wave.triggerX + SPAWN_AHEAD + spec.dx, DEPTH_MID + spec.dy))
  }
  state.gateX = state.cameraX
}

function checkWaveCleared() {
  if (state.gateX === null) return
  if (state.enemies.some((e) => e.state !== 'dead')) return
  state.gateX = null
  state.waveIndex += 1
  if (state.waveIndex >= WAVES.length) state.phase = 'cleared'
}

function updateCamera() {
  const desired = state.player.x - canvas.width * 0.35
  const maxCam = state.gateX !== null ? state.gateX : WORLD_WIDTH - canvas.width
  state.cameraX = clamp(desired, 0, Math.max(0, maxCam))
}

function update(dt) {
  if (state.phase !== 'playing') return
  updatePlayer(dt)
  updateEnemies(dt)
  checkWaveTriggers()
  checkWaveCleared()
  updateCamera()
}

// --- Rendering ---

function makeBuildings(count, xRange, hRange, wRange) {
  const arr = []
  for (let i = 0; i < count; i++) {
    arr.push({
      x: (i / count) * xRange,
      w: wRange[0] + Math.random() * (wRange[1] - wRange[0]),
      h: hRange[0] + Math.random() * (hRange[1] - hRange[0]),
    })
  }
  return arr
}
const buildingsFar = makeBuildings(26, WORLD_WIDTH * 1.2, [90, 200], [60, 140])
const buildingsMid = makeBuildings(34, WORLD_WIDTH * 1.2, [60, 140], [50, 110])

function worldToScreenX(x) { return x - state.cameraX }

function drawParallaxLayer(buildings, factor, color) {
  ctx.fillStyle = color
  const offset = state.cameraX * factor
  for (const b of buildings) {
    const sx = b.x - offset
    if (sx < -b.w || sx > canvas.width + b.w) continue
    ctx.fillRect(sx, GROUND_TOP - b.h, b.w, b.h)
  }
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_TOP)
  grad.addColorStop(0, '#2b1f4a')
  grad.addColorStop(1, '#5d4a8a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, GROUND_TOP)

  drawParallaxLayer(buildingsFar, 0.25, '#20163a')
  drawParallaxLayer(buildingsMid, 0.5, '#2e2050')

  ctx.fillStyle = '#3a3a42'
  ctx.fillRect(0, GROUND_TOP, canvas.width, canvas.height - GROUND_TOP)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  for (let i = 0; i < 40; i++) {
    const sx = i * 90 - state.cameraX
    if (sx < -20 || sx > canvas.width + 20) continue
    ctx.beginPath()
    ctx.moveTo(sx, GROUND_TOP)
    ctx.lineTo(sx - 30, canvas.height)
    ctx.stroke()
  }
}

function drawShadow(x, y, scale) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(worldToScreenX(x), y + 2, 22 * scale, 8 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawHumanoid(x, y, opts) {
  const scale = depthScale(y)
  ctx.save()
  ctx.globalAlpha = opts.alpha ?? 1
  ctx.translate(worldToScreenX(x), y - (opts.lift || 0))
  ctx.scale(scale * opts.facing, scale)

  const bodyColor = opts.flash ? '#ffffff' : opts.color
  const legSwing = opts.moving ? Math.sin(opts.walkPhase) * 10 : 0
  const kicking = opts.attacking && opts.attackType === 'kick'
  const throwing = opts.attacking && opts.attackType === 'throw'
  const punching = opts.attacking && !kicking && !throwing

  ctx.fillStyle = '#2a2a2a'
  if (kicking) {
    ctx.fillRect(-10, -26, 7, 26) // back leg planted
    ctx.fillRect(8, -22, 24, 9) // front leg extended into the kick
  } else if (throwing) {
    ctx.fillRect(-9, -26, 7, 26) // a braced, wide stance for hauling an opponent around
    ctx.fillRect(6, -26, 7, 26)
  } else {
    ctx.fillRect(-10, -26 + legSwing * 0.2, 7, 26)
    ctx.fillRect(3, -26 - legSwing * 0.2, 7, 26)
  }

  ctx.fillStyle = bodyColor
  ctx.fillRect(-12, -56, 24, 32)

  ctx.fillStyle = '#f2c79b'
  ctx.beginPath()
  ctx.arc(0, -66, 11, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = bodyColor
  if (punching) {
    ctx.fillRect(10, -52, 22, 8)
    ctx.fillRect(-14, -50, 10, 20)
  } else if (kicking) {
    ctx.fillRect(8, -50, 8, 16) // arms pulled into a guard while the leg does the work
    ctx.fillRect(-16, -50, 8, 16)
  } else if (throwing) {
    ctx.fillRect(8, -58, 26, 10) // both arms reaching out wide for the grab
    ctx.fillRect(-16, -50, 10, 18)
  } else {
    const armSwing = opts.moving ? Math.sin(opts.walkPhase + Math.PI) * 6 : 0
    ctx.fillRect(10, -50 + armSwing * 0.3, 8, 18)
    ctx.fillRect(-18, -50 - armSwing * 0.3, 8, 18)
  }
  ctx.restore()
}

function drawPlayerSprite() {
  const p = state.player
  const shadowShrink = clamp(1 - p.z / 160, 0.55, 1)
  drawShadow(p.x, p.y, depthScale(p.y) * shadowShrink)

  if (p.dashing) {
    // Cheap afterimage trail: a few faint copies behind the dash direction,
    // fading out with distance - no history buffer needed since the dash
    // moves in a straight line, so a fixed offset per copy is enough.
    for (let i = 3; i >= 1; i--) {
      drawHumanoid(p.x - p.dashDir * i * 14, p.y, {
        color: '#3f7fd1',
        facing: p.facing,
        walkPhase: p.walkPhase,
        moving: true,
        alpha: 0.12 * (4 - i),
      })
    }
  }

  drawHumanoid(p.x, p.y, {
    color: '#3f7fd1',
    facing: p.facing,
    walkPhase: p.walkPhase,
    moving: p.moving,
    attacking: !!p.attack && p.attack.phase !== 'recovery',
    attackType: p.attack && p.attack.type,
    flash: p.hitstunTimer > 0 && Math.floor(p.hitstunTimer * 20) % 2 === 0,
    lift: p.z,
  })
}

function drawBossHealthBar(en) {
  const sx = worldToScreenX(en.x)
  const w = 70
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(sx - w / 2, en.y - 100, w, 6)
  ctx.fillStyle = '#ff4d4d'
  ctx.fillRect(sx - w / 2, en.y - 100, w * Math.max(0, en.hp / en.maxHp), 6)
}

function drawEnemySprite(en) {
  const stats = ENEMY_TYPES[en.type]
  const alpha = en.state === 'dead' ? Math.max(0, en.deathTimer / DEATH_FADE) : 1
  const liftZ = en.thrown ? en.thrown.z : 0
  const shadowShrink = clamp(1 - liftZ / 160, 0.55, 1)
  drawShadow(en.x, en.y, depthScale(en.y) * shadowShrink)
  drawHumanoid(en.x, en.y, {
    color: en.state === 'telegraph' ? '#ffcf4d' : stats.color,
    facing: en.facing,
    walkPhase: en.walkPhase,
    moving: en.state === 'approach',
    attacking: en.state === 'attack',
    flash: en.flashTimer > 0,
    alpha,
    lift: liftZ,
  })
  if (en.type === 'boss' && en.state !== 'dead') drawBossHealthBar(en)
}

function drawWorld() {
  drawBackground()
  const drawables = [{ y: state.player.y, draw: drawPlayerSprite }]
  for (const en of state.enemies) drawables.push({ y: en.y, draw: () => drawEnemySprite(en) })
  drawables.sort((a, b) => a.y - b.y)
  for (const d of drawables) d.draw()
  drawUltimateEffect()
}

function drawUltimateEffect() {
  const p = state.player
  const atk = p.attack
  if (!atk || atk.type !== 'ultimate') return
  const def = ATTACKS.ultimate
  const progress = atk.phase === 'startup' ? atk.t / def.startup : atk.phase === 'active' ? 1 : null
  if (progress === null) return
  const sx = worldToScreenX(p.x)
  const radius = def.range * (0.3 + progress * 0.7)
  ctx.save()
  ctx.strokeStyle = `rgba(255, 220, 90, ${0.9 - progress * 0.5})`
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.ellipse(sx, p.y - 30, radius, radius * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawUltimateFlash() {
  const p = state.player
  if (p.ultimateFlash <= 0) return
  ctx.fillStyle = `rgba(255, 240, 180, ${(p.ultimateFlash / 0.3) * 0.35})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function drawHud() {
  const p = state.player
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(16, 16, 220, 22)
  ctx.fillStyle = '#4dff88'
  ctx.fillRect(18, 18, 216 * Math.max(0, p.hp / PLAYER_MAX_HP), 18)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.strokeRect(16, 16, 220, 22)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('HP', 20, 17)

  const ready = p.gauge >= GAUGE_MAX
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(16, 42, 220, 14)
  ctx.fillStyle = ready && Math.floor(performance.now() / 150) % 2 === 0 ? '#ffe066' : '#9a5cff'
  ctx.fillRect(18, 44, 216 * (p.gauge / GAUGE_MAX), 10)
  ctx.strokeStyle = '#fff'
  ctx.strokeRect(16, 42, 220, 14)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 10px sans-serif'
  ctx.fillText(ready ? '필살기 준비 완료! (L)' : '필살기', 20, 43)

  const waveLabel =
    state.waveIndex >= WAVES.length
      ? 'CLEAR'
      : state.waveIndex === WAVES.length - 1
        ? 'BOSS'
        : `WAVE ${state.waveIndex + 1}/${WAVES.length}`
  ctx.fillText(waveLabel, 16, 62)
}

function drawOverlay() {
  if (state.phase === 'playing') return
  ctx.fillStyle = 'rgba(10,8,20,0.75)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px sans-serif'
  ctx.fillText(state.phase === 'cleared' ? 'STAGE CLEAR!' : 'GAME OVER', canvas.width / 2, canvas.height / 2 - 30)
  ctx.font = '18px sans-serif'
  ctx.fillText('R 키를 눌러 다시 시작', canvas.width / 2, canvas.height / 2 + 20)
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  update(dt)
  drawWorld()
  drawUltimateFlash()
  drawHud()
  drawOverlay()

  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
