import { sfx, unlockSfx, toggleMute, isMuted } from './sfx.js'

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
  throw: { startup: 0.2, active: 0.38, recovery: 0.34, range: 46, damage: 20, knockback: 0 },
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
  // 빠르지만 약한 돌격병
  runner: { hp: 16, speed: 150, damage: 6, attackRange: 44, telegraph: 0.18, active: 0.12, cooldown: 0.55, color: '#3aa07a', size: 0.92 },
  // 느리고 단단한 덩치. 한 방이 아프다
  brute: { hp: 85, speed: 50, damage: 20, attackRange: 58, telegraph: 0.55, active: 0.22, cooldown: 1.3, color: '#9a7440', size: 1.18, kb: 60 },
  // 멀리서 총을 쏜다 (같은 줄에 서면 총알이 날아온다)
  gunman: { hp: 22, speed: 70, damage: 9, attackRange: 360, keepDist: 250, ranged: true, telegraph: 0.55, active: 0.1, cooldown: 1.9, color: '#4a6a90' },
  boss: { hp: 170, speed: 58, damage: 16, attackRange: 58, telegraph: 0.42, active: 0.2, cooldown: 1.0, color: '#7b3fa0', size: 1.25, bar: true },
  // 챕터 2 보스: 멀리서 돌진해 들이받는다
  captain: { hp: 270, speed: 68, damage: 18, attackRange: 62, telegraph: 0.38, active: 0.2, cooldown: 0.9, color: '#2f6aa8', size: 1.28, bar: true, chg: { min: 150, max: 480, tele: 0.65, speed: 520, dur: 0.5, extra: 10, cd: 1.2, chance: 1.6 } },
  // 챕터 3: 날렵한 여성 자객. 발차기와 도약 돌진을 쓴다
  vixen: { hp: 42, speed: 118, damage: 10, attackRange: 56, telegraph: 0.24, active: 0.14, cooldown: 0.7, color: '#c02a52', size: 0.98, chg: { min: 90, max: 280, tele: 0.3, speed: 440, dur: 0.28, extra: 6, cd: 0.5, chance: 2.2 } },
  // 챕터 3 보스: 클럽의 마담. 돌진 + 3갈래 부채꼴 사격
  madam: { hp: 340, speed: 92, damage: 16, attackRange: 60, telegraph: 0.3, active: 0.16, cooldown: 0.75, color: '#8a1f6a', size: 1.25, bar: true, fan: true, chg: { min: 120, max: 420, tele: 0.42, speed: 520, dur: 0.4, extra: 10, cd: 0.9, chance: 1.8 } },
}

// Classic beat-em-up pacing: crossing a trigger spawns that wave and locks
// the camera (see updateCamera's gateX clamp) until every enemy in it is
// dead, so the player can't just outrun the fight. Enemies spawn just
// off the right edge of the now-locked screen so they walk
// in rather than popping up already in frame.
const E = (type, dx, dy) => ({ type, dx, dy })
const CHAPTERS = [
  {
    name: 'CHAPTER 1',
    title: '황혼의 거리',
    theme: 'street',
    waves: [
      { triggerX: 480, enemies: [E('thug', 0, -50), E('runner', 40, 45)] },
      { triggerX: 1150, enemies: [E('thug', 0, -55), E('thug', 30, 0), E('runner', 60, 55)] },
      { triggerX: 1750, enemies: [E('gunman', 0, -50), E('thug', 40, 10), E('thug', 70, 55)] },
      { triggerX: 2350, enemies: [E('boss', 0, 0), E('runner', 70, -55)] },
    ],
  },
  {
    name: 'CHAPTER 2',
    title: '노을 진 항구',
    theme: 'harbor',
    waves: [
      { triggerX: 450, enemies: [E('runner', 0, -55), E('runner', 40, 50), E('thug', 80, 0)] },
      { triggerX: 1000, enemies: [E('gunman', 0, -55), E('gunman', 30, 55), E('brute', 90, 0)] },
      { triggerX: 1650, enemies: [E('brute', 0, 0), E('thug', 40, -55), E('runner', 70, 55), E('runner', 100, -20)] },
      { triggerX: 2250, enemies: [E('gunman', 0, -55), E('brute', 40, 20), E('thug', 80, -20), E('runner', 110, 55)] },
      { triggerX: 2850, enemies: [E('captain', 0, 0), E('gunman', 50, -55), E('gunman', 80, 55)] },
    ],
  },
  {
    name: 'CHAPTER 3',
    title: '네온 클럽가',
    theme: 'neon',
    waves: [
      { triggerX: 450, enemies: [E('vixen', 0, -50), E('runner', 40, 50), E('runner', 70, 0)] },
      { triggerX: 1000, enemies: [E('gunman', 0, -55), E('gunman', 30, 55), E('vixen', 80, 0)] },
      { triggerX: 1600, enemies: [E('brute', 0, -30), E('brute', 40, 40), E('vixen', 90, 0)] },
      { triggerX: 2200, enemies: [E('vixen', 0, -55), E('vixen', 40, 55), E('gunman', 80, 0), E('thug', 110, -30), E('runner', 130, 40)] },
      { triggerX: 2800, enemies: [E('madam', 0, 0), E('vixen', 60, -55), E('gunman', 90, 55)] },
    ],
  },
]
const curChapter = () => CHAPTERS[state.chapter]
const curWaves = () => CHAPTERS[state.chapter].waves

// 아이템: 적이 가끔 떨어뜨리고, 웨이브를 끝내면 하나씩 나온다
const GRENADE_MAX = 6
const MG_AMMO = 48
const MG_INTERVAL = 0.085
const GL_AMMO = 5
const GL_BLAST = { rx: 150, ry: 78, dmg: 72 }
const HAND_BLAST = { rx: 120, ry: 62, dmg: 55 }
const ITEM_KINDS = [['grenade', 0.28], ['mg', 0.22], ['gl', 0.16], ['heal', 0.34]]

const HITSTUN_DURATION = 0.3
// 경직이 풀린 직후 잠깐은 다시 경직되지 않는다 (약공격 연타로 보스까지 계속 묶어두는 것 방지)
const STUN_IMMUNITY = 0.45
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
    grenades: 1,
    gun: null, // { kind: 'mg' | 'gl', ammo }
    glCd: 0,
    firing: false,
    fireTimer: 0,
    muzzle: 0,
    nadeAnim: 0,
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
    stunImmunity: 0,
    resolved: false,
    walkPhase: Math.random() * 10,
    deathTimer: 0,
    flashTimer: 0,
    thrown: null,
  }
}

function makeInitialState(chapter = 0) {
  return {
    phase: 'playing', // playing | gameover | chapterclear | cleared
    chapter,
    player: makePlayer(),
    enemies: [],
    cameraX: 0,
    gateX: null,
    waveIndex: 0,
    fx: [],
    bullets: [],
    grenades: [],
    items: [],
    shake: 0,
    banner: { text: CHAPTERS[chapter].name, sub: CHAPTERS[chapter].title, t: 0 },
  }
}
let state = makeInitialState()
state.phase = 'title' // 첫 화면에서는 시작 입력을 기다린다 (R 재시작은 바로 플레이)
let muteNoticeUntil = 0

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
const heldCodes = new Set() // 한글 입력 상태에서도 F/G가 먹도록 물리 키(code)로도 추적한다
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  const isRepeat = heldKeys.has(key)
  heldKeys.add(key)
  heldCodes.add(e.code)
  unlockSfx()
  if (state.phase === 'title') {
    if (!isRepeat && (key.length === 1 || key === 'enter' || key.startsWith('arrow') || e.code.startsWith('Key') || e.code.startsWith('Digit'))) {
      e.preventDefault()
      const ch = e.code === 'Digit3' ? 2 : e.code === 'Digit2' ? 1 : 0 // 2/3 키: 챕터 2/3부터
      state = makeInitialState(ch)
      sfx.start()
    }
    return
  }
  if (state.phase === 'chapterclear') {
    if (!isRepeat && (key.length === 1 || key === 'enter')) startNextChapter()
    return
  }
  if (e.code === 'KeyR') {
    state = makeInitialState(state.chapter)
    sfx.click()
    return
  }
  if (key === 'm' && !isRepeat) {
    toggleMute()
    muteNoticeUntil = performance.now() + 1600
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
  if (e.code === 'KeyG' && !isRepeat) throwGrenade()
  if (e.code === 'KeyF' && !isRepeat) fireLauncher()
  if (key === 'l' && canAct() && state.player.gauge >= GAUGE_MAX) {
    startAttack('ultimate')
  }
  if (key === ' ' && !state.player.jumping && canAct()) {
    e.preventDefault() // stop the page from scrolling on space
    startJump()
  }
})
window.addEventListener('keyup', (e) => { heldKeys.delete(e.key.toLowerCase()); heldCodes.delete(e.code) })
// 창이 포커스를 잃으면 눌려 있던 키가 계속 눌린 것으로 남지 않게 한다
window.addEventListener('blur', () => { heldKeys.clear(); heldCodes.clear() })
window.addEventListener('pointerdown', () => {
  unlockSfx()
  if (state.phase === 'title') {
    state = makeInitialState(0)
    sfx.start()
  } else if (state.phase === 'chapterclear') startNextChapter()
})
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
  if (type !== 'ultimate') sfx.whoosh()
  if (type === 'ultimate') {
    sfx.heavy()
    p.gauge = 0
    p.ultimateFlash = 0.3
    p.invulnTimer = ATTACKS.ultimate.startup + ATTACKS.ultimate.active
  }
}

function startJump() {
  const p = state.player
  p.jumping = true
  p.vz = JUMP_VELOCITY
  sfx.jump()
}

function startDash(dir) {
  const p = state.player
  if (p.attack || p.hitstunTimer > 0 || p.dashing || p.jumping) return
  p.dashing = true
  p.dashTimer = DASH_DURATION
  sfx.whoosh()
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

  if (p.muzzle > 0) p.muzzle -= dt
  if (p.glCd > 0) p.glCd -= dt
  if (p.nadeAnim > 0) p.nadeAnim -= dt
  // 기관총: F를 누르고 있으면 연사 (이동은 절반 속도, 방향은 고정)
  p.firing = !!(p.gun && p.gun.kind === 'mg' && p.gun.ammo > 0 && heldCodes.has('KeyF') && !p.attack && p.hitstunTimer <= 0)
  if (p.firing) {
    p.fireTimer -= dt
    if (p.fireTimer <= 0) {
      p.fireTimer = MG_INTERVAL
      fireMachineGun()
    }
  } else p.fireTimer = 0
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
      const spd = p.firing ? PLAYER_SPEED * 0.5 : PLAYER_SPEED
      p.x = clamp(p.x + dx * spd * dt, 40, playerMaxX())
      p.y = clamp(p.y + dy * spd * dt, DEPTH_TOP, DEPTH_BOTTOM)
      if (dx !== 0 && !p.firing) p.facing = Math.sign(dx)
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
const THROW_LAUNCH_VZ = 250
const THROW_LAUNCH_VX = 270
const FLIP_END = Math.PI * 1.5 // 착지할 때의 몸 각도 (등으로 누운 자세)
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3)
// 잡은 적이 지나가는 길: 가슴 앞 → 머리 위로 번쩍 → 어깨 뒤로 젖힘(던지기 직전). k는 0..1.
// rel은 플레이어가 보는 방향 기준 앞쪽 거리, z는 발 높이, rot은 몸의 기울기(라디안)
function throwPath(k) {
  const lift = easeIO(clamp(k / 0.55, 0, 1))
  const back = k > 0.55 ? easeIO((k - 0.55) / 0.45) : 0
  return { rel: 26 - 22 * lift - 14 * back, z: 20 + 52 * lift + 4 * back, rot: 1.57 * lift + 0.5 * back }
}

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
  sfx.heavy()
  best.facing = -dir
  p.gauge = Math.min(GAUGE_MAX, p.gauge + GAUGE_PER_HIT)
  if (best.hp <= 0) {
    killEnemy(best)
    return
  }
  best.state = 'thrown'
  // 잡은 적을 머리 위로 들어 올렸다가(hold) 내던진다
  best.thrown = { z: 0, vz: THROW_LAUNCH_VZ, vx: dir * THROW_LAUNCH_VX, hold: def.active, holdMax: def.active, dir, rot: 0, hit: new Set(), trail: [], trailT: 0 }
  best.y = p.y
  state.fx.push({ kind: 'ring', x: p.x + p.facing * 14, y: p.y, t: 0, life: 0.3 })
}

function spawnLandFx(x, y) {
  state.fx.push({ kind: 'dust', x, y, t: 0, life: 0.6 })
  state.fx.push({ kind: 'ring', x, y, t: 0, life: 0.4 })
  state.fx.push({ kind: 'ring', x, y, t: -0.06, life: 0.5 })
  state.fx.push({ kind: 'spark', x, y: y - 8, t: 0, life: 0.25 })
  state.shake = Math.max(state.shake, 0.28)
  sfx.heavy()
}

function randomItemKind() {
  let r = Math.random()
  for (const [k, w] of ITEM_KINDS) { if ((r -= w) < 0) return k }
  return 'heal'
}
function spawnItem(x, y, kind = randomItemKind()) {
  state.items.push({ kind, x: clamp(x, 60, WORLD_WIDTH - 60), y: clamp(y, DEPTH_TOP + 10, DEPTH_BOTTOM - 10), t: 0 })
}
function killEnemy(en) {
  if (en.state === 'dead') return
  en.state = 'dead'
  en.deathTimer = DEATH_FADE
  en.charging = false
  en.fanShot = false
  if (Math.random() < 0.22) spawnItem(en.x, en.y)
}

function damageEnemy(en, dmg, knockbackDx) {
  en.hp -= dmg
  if (dmg >= 30) sfx.heavy()
  else sfx.hit()
  en.flashTimer = 0.12
  en.x = clamp(en.x + knockbackDx, 40, WORLD_WIDTH - 40)
  if (en.hp <= 0) {
    killEnemy(en)
  } else if (en.stunImmunity <= 0 && !en.down) {
    en.state = 'hitstun'
    en.hitstunTimer = HITSTUN_DURATION
    en.t = 0
    en.charging = false
    en.fanShot = false
  }
}

function damagePlayer(dmg, knockbackDx) {
  const p = state.player
  if (p.hitstunTimer > 0) return // brief invulnerability while already reeling
  if (p.invulnTimer > 0) return // mid-ultimate invulnerability window
  if (p.jumping && p.z > JUMP_DODGE_HEIGHT) return // high enough to hop over a grounded attack
  p.hp = Math.max(0, p.hp - dmg)
  sfx.hurt()
  p.hitstunTimer = HITSTUN_DURATION
  p.flashTimer = 0.15
  p.attack = null
  p.dashing = false // otherwise next frame's dash branch would run before this stun and ignore it entirely
  p.gauge = Math.min(GAUGE_MAX, p.gauge + GAUGE_PER_HURT)
  p.x = clamp(p.x + knockbackDx, 40, playerMaxX())
  if (p.hp <= 0) {
    state.phase = 'gameover'
    sfx.lose()
  }
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
    if (en.stunImmunity > 0 && en.state !== 'hitstun') en.stunImmunity -= dt

    if (en.state === 'hitstun') {
      en.hitstunTimer -= dt
      if (en.down) en.down.t += dt
      if (en.hitstunTimer <= 0) {
        en.state = 'approach'
        en.down = null
        en.stunImmunity = STUN_IMMUNITY
      }
      continue
    }

    if (en.state === 'thrown') {
      const th = en.thrown
      if (th.hold > 0) {
        // 들어 올려지는 중: 가슴 앞 → 머리 위 → 어깨 뒤로 젖힘. 플레이어 손이 같은 길을 따라간다
        th.hold -= dt
        const k = clamp(1 - Math.max(0, th.hold) / th.holdMax, 0, 1)
        const path = throwPath(k)
        en.x = clamp(p.x + p.facing * path.rel, 40, WORLD_WIDTH - 40)
        en.y = p.y
        th.z = path.z
        th.rot = th.dir * (path.rot + Math.sin(k * 40) * 0.04)
        en.facing = -th.dir
        if (th.hold <= 0) {
          // 놓는 순간: 앞으로 휙 내던진다
          th.rot0 = path.rot
          th.flightT = (th.vz + Math.sqrt(th.vz * th.vz + 2 * GRAVITY * th.z)) / GRAVITY
          th.fly = 0
          sfx.whoosh()
          state.fx.push({ kind: 'ring', x: en.x, y: en.y, t: 0, life: 0.25 })
        }
        continue
      }
      th.fly += dt
      th.vz -= GRAVITY * dt
      th.z += th.vz * dt
      en.x = clamp(en.x + th.vx * dt, 40, WORLD_WIDTH - 40)
      // 앞으로 공중제비를 돌며 날아가 등으로 떨어진다
      const prog = clamp(th.fly / th.flightT, 0, 1)
      th.rot = th.dir * (th.rot0 + (FLIP_END - th.rot0) * easeIO(prog))
      th.trailT -= dt
      if (th.trailT <= 0) {
        th.trailT = 0.04
        th.trail.push({ x: en.x, z: Math.max(0, th.z), rot: th.rot })
        if (th.trail.length > 6) th.trail.shift()
      }
      // 날아가는 동료에게 부딪힌 적은 같이 쓰러진다
      for (const o of state.enemies) {
        if (o === en || o.state === 'dead' || o.state === 'thrown' || th.hit.has(o)) continue
        if (Math.abs(o.x - en.x) < 32 && Math.abs(o.y - en.y) < 26 && th.z < 80) {
          th.hit.add(o)
          damageEnemy(o, 14, Math.sign(th.vx) * 45)
          state.fx.push({ kind: 'spark', x: o.x, y: o.y - 40, t: 0, life: 0.25 })
        }
      }
      if (th.z <= 0 && th.vz < 0) {
        th.z = 0
        spawnLandFx(en.x, en.y)
        en.hp -= 12 // 바닥에 내리꽂힌 충격
        en.flashTimer = 0.15
        const dir = th.dir
        en.thrown = null
        if (en.hp <= 0) { killEnemy(en); continue }
        en.state = 'hitstun'
        en.hitstunTimer = 1.0 // 등으로 누웠다가 일어난다
        en.down = { t: 0, dur: 1.0, dir }
        en.t = 0
      }
      continue
    }

    const stats = ENEMY_TYPES[en.type]
    const dx = p.x - en.x
    const dy = p.y - en.y
    const dist = Math.hypot(dx, dy)

    if (en.state === 'approach' && stats.ranged) {
      // 총잡이: 적당한 거리를 유지하며 같은 줄에 맞춰 선 뒤 쏜다
      if (dx !== 0) en.facing = Math.sign(dx)
      const aligned = Math.abs(dy) < 16
      if (dist < stats.keepDist * 0.6) {
        en.x = clamp(en.x - Math.sign(dx || 1) * stats.speed * 0.9 * dt, 40, WORLD_WIDTH - 40)
        en.walkPhase += dt * 8
      } else if (dist > stats.keepDist) {
        en.x = clamp(en.x + Math.sign(dx) * stats.speed * dt, 40, WORLD_WIDTH - 40)
        en.walkPhase += dt * 8
      }
      if (!aligned) {
        en.y = clamp(en.y + Math.sign(dy) * stats.speed * 0.8 * dt, DEPTH_TOP, DEPTH_BOTTOM)
        en.walkPhase += dt * 6
      }
      if (aligned && dist <= stats.attackRange && en.cooldownTimer <= 0) {
        en.state = 'telegraph'
        en.t = 0
      }
    } else if (en.state === 'approach') {
      if (dx !== 0) en.facing = Math.sign(dx)
      if (stats.chg && en.cooldownTimer <= 0 && dist > stats.chg.min && dist < stats.chg.max && Math.abs(dy) < 30 && Math.random() < dt * stats.chg.chance) {
        en.state = 'telegraph' // 돌진 준비
        en.charging = true
        en.t = 0
      } else if (stats.fan && en.cooldownTimer <= 0 && dist > 170 && dist < 440 && Math.random() < dt * 1.3) {
        en.state = 'telegraph' // 부채꼴 사격 준비
        en.fanShot = true
        en.t = 0
      } else if (dist <= stats.attackRange && en.cooldownTimer <= 0) {
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
      if (en.charging) en.facing = Math.sign(p.x - en.x) || en.facing
      if (en.t >= (en.charging ? stats.chg.tele : stats.telegraph)) {
        en.state = 'attack'
        en.t = 0
        en.resolved = false
      }
    } else if (en.state === 'attack') {
      en.t += dt
      if (en.charging) {
        // 돌진: 정면으로 달려가며 닿으면 큰 피해
        en.x = clamp(en.x + en.facing * stats.chg.speed * dt, 40, WORLD_WIDTH - 40)
        if (!en.resolved && Math.hypot(p.x - en.x, p.y - en.y) <= 52) {
          damagePlayer(stats.damage + stats.chg.extra, en.facing * 55)
          en.resolved = true
        }
        if (en.t >= stats.chg.dur) {
          en.state = 'approach'
          en.charging = false
          en.t = 0
          en.cooldownTimer = stats.cooldown + stats.chg.cd
        }
      } else {
        if (!en.resolved) {
          en.resolved = true
          if (en.fanShot) {
            en.fanShot = false
            for (const oy of [-38, 0, 38]) state.bullets.push({ x: en.x + en.facing * 40, y: clamp(en.y + oy, DEPTH_TOP - 10, DEPTH_BOTTOM + 10), vx: en.facing * 400, owner: 'e', dmg: stats.damage - 4, life: 1.8 })
            state.fx.push({ kind: 'ring', x: en.x + en.facing * 40, y: en.y, t: 0, life: 0.2 })
            sfx.shot()
          } else if (stats.ranged) {
            state.bullets.push({ x: en.x + en.facing * 40, y: en.y, vx: en.facing * 430, owner: 'e', dmg: stats.damage, life: 1.6 })
            state.fx.push({ kind: 'ring', x: en.x + en.facing * 40, y: en.y, t: 0, life: 0.15 })
            sfx.hit()
          } else {
            const d2 = Math.hypot(p.x - en.x, p.y - en.y)
            if (d2 <= stats.attackRange + 10) damagePlayer(stats.damage, Math.sign(-en.facing) * (stats.kb || 30))
          }
        }
        if (en.t >= stats.active) {
          en.state = 'approach'
          en.t = 0
          en.cooldownTimer = stats.cooldown
        }
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
  if (idx >= curWaves().length) return
  const wave = curWaves()[idx]
  if (state.player.x < wave.triggerX) return

  state.gateX = state.cameraX
  // 고정된 화면의 오른쪽 바깥에서 걸어 들어오게 한다 (화면 안에서 갑자기 나타나지 않도록)
  const spawnX = state.gateX + canvas.width + 40
  for (const spec of wave.enemies) {
    state.enemies.push(makeEnemy(spec.type, Math.min(WORLD_WIDTH - 40, spawnX + spec.dx), DEPTH_MID + spec.dy))
  }
}

function checkWaveCleared() {
  if (state.gateX === null) return
  if (state.enemies.some((e) => e.state !== 'dead')) return
  state.gateX = null
  state.waveIndex += 1
  // 웨이브 보상: 화면 가운데에 아이템이 하나 나타난다
  spawnItem(state.player.x + 120, DEPTH_MID + (Math.random() - 0.5) * 80)
  if (state.waveIndex >= curWaves().length) {
    state.enemies = []
    state.phase = state.chapter >= CHAPTERS.length - 1 ? 'cleared' : 'chapterclear'
    sfx.fanfare()
  } else {
    sfx.good()
  }
}

function startNextChapter() {
  const old = state.player
  const next = makeInitialState(state.chapter + 1)
  // 이전 챕터의 상태를 이어 간다 (체력은 조금 회복)
  next.player.hp = Math.min(PLAYER_MAX_HP, old.hp + 35)
  next.player.gauge = old.gauge
  next.player.grenades = old.grenades
  next.player.gun = old.gun
  state = next
  sfx.start()
}

// --- 아이템 / 총 / 수류탄 ---
function fireMachineGun() {
  const p = state.player
  p.gun.ammo -= 1
  p.muzzle = 0.06
  state.bullets.push({ x: p.x + p.facing * 46, y: p.y + (Math.random() - 0.5) * 6, vx: p.facing * 900, owner: 'p', dmg: 6, life: 0.65 })
  sfx.shot()
  if (p.gun.ammo <= 0) p.gun = null
}
function fireLauncher() {
  const p = state.player
  if (state.phase !== 'playing' || !p.gun || p.gun.kind !== 'gl' || p.gun.ammo <= 0 || p.attack || p.hitstunTimer > 0 || p.dashing || p.glCd > 0) return
  p.glCd = 0.8
  p.gun.ammo -= 1
  p.muzzle = 0.22
  state.shake = Math.max(state.shake, 0.14)
  // 어깨 위 발사관에서 로켓탄이 곧게 날아간다 (뒤로는 백블라스트)
  state.grenades.push({ x: p.x + p.facing * 70, y: p.y, z: 60 + p.z, vx: p.facing * 660, vz: 0, t: 0, fuse: 1.25, shell: true, rocket: true, puff: 0 })
  for (let i = 0; i < 4; i++) state.fx.push({ kind: 'smoke', x: p.x - p.facing * (24 + i * 14), y: p.y, h: 58 + p.z + i * 2, t: -i * 0.03, life: 0.7, r: 12 + i * 3 })
  sfx.launch()
  if (p.gun.ammo <= 0) p.gun = null
}
function throwGrenade() {
  const p = state.player
  if (p.grenades <= 0 || p.hitstunTimer > 0 || p.dashing || p.nadeAnim > 0) return
  p.grenades -= 1
  p.nadeAnim = 0.3
  state.grenades.push({ x: p.x + p.facing * 20, y: p.y, z: 52 + p.z, vx: p.facing * 250, vz: 240, t: 0, fuse: 1.0 })
  sfx.whoosh()
}
function explode(x, y, cfg = HAND_BLAST) {
  state.shake = 0.35
  state.fx.push({ kind: 'blast', x, y, t: 0, life: 0.55 })
  state.fx.push({ kind: 'dust', x, y, t: 0, life: 0.6 })
  sfx.boom()
  for (const en of state.enemies) {
    if (en.state === 'dead') continue
    const dx = (en.x - x) / cfg.rx
    const dy = (en.y - y) / cfg.ry
    const d = Math.hypot(dx, dy)
    if (d >= 1) continue
    const dmg = Math.round(cfg.dmg * (1 - d * 0.5))
    damageEnemy(en, dmg, Math.sign(en.x - x || 1) * 60)
    if (en.state !== 'dead' && en.state !== 'thrown' && !ENEMY_TYPES[en.type].bar) {
      en.state = 'hitstun' // 폭발에는 (보스를 뺀) 모두가 나가떨어진다
      en.hitstunTimer = HITSTUN_DURATION * 2
      en.charging = false
    }
  }
}
function updateProjectiles(dt) {
  const p = state.player
  for (const b of state.bullets) {
    b.x += b.vx * dt
    b.life -= dt
    if (b.owner === 'p') {
      for (const en of state.enemies) {
        if (en.state === 'dead' || en.state === 'thrown') continue
        if (Math.abs(en.x - b.x) < 18 && Math.abs(en.y - b.y) < 22) {
          en.hp -= b.dmg
          en.flashTimer = 0.08
          en.x = clamp(en.x + Math.sign(b.vx) * 3, 40, WORLD_WIDTH - 40)
          sfx.hit()
          state.fx.push({ kind: 'spark', x: b.x, y: b.y - 40, t: 0, life: 0.2 })
          if (en.hp <= 0) killEnemy(en)
          b.life = 0
          break
        }
      }
    } else if (Math.abs(p.x - b.x) < 16 && Math.abs(p.y - b.y) < 20 && !(p.jumping && p.z > JUMP_DODGE_HEIGHT)) {
      damagePlayer(b.dmg, Math.sign(b.vx) * 22)
      state.fx.push({ kind: 'spark', x: b.x, y: b.y - 40, t: 0, life: 0.2 })
      b.life = 0
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > state.cameraX - 80 && b.x < state.cameraX + canvas.width + 80)
  for (const g of state.grenades) {
    g.t += dt
    g.x += g.vx * dt
    if (!g.rocket) {
      g.vz -= GRAVITY * dt
      g.z += g.vz * dt
    }
    if (g.shell) {
      // 로켓탄: 적에 닿거나 사거리 끝에서 폭발, 지나간 자리에 연기가 남는다
      g.puff -= dt
      if (g.puff <= 0) { g.puff = 0.035; state.fx.push({ kind: 'smoke', x: g.x - Math.sign(g.vx) * 22, y: g.y, h: g.z, t: 0, life: 0.5, r: 6 }) }
      const hit = g.z < 100 && state.enemies.some((en) => en.state !== 'dead' && Math.abs(en.x - g.x) < 30 && Math.abs(en.y - g.y) < 30)
      if (hit || g.z <= 0 || g.t >= g.fuse) { explode(g.x, g.y, GL_BLAST); g.dead = true }
      continue
    }
    if (g.z <= 0) {
      g.z = 0
      if (Math.abs(g.vz) > 90) g.vz = -g.vz * 0.38
      else g.vz = 0
      g.vx *= 0.6
    }
    if (g.t >= g.fuse) { explode(g.x, g.y); g.dead = true }
  }
  state.grenades = state.grenades.filter((g) => !g.dead)
  for (const it of state.items) {
    it.t += dt
    if (Math.abs(p.x - it.x) < 30 && Math.abs(p.y - it.y) < 34 && p.z < 30) {
      it.taken = true
      if (it.kind === 'grenade') p.grenades = Math.min(GRENADE_MAX, p.grenades + 2)
      else if (it.kind === 'mg') p.gun = { kind: 'mg', ammo: MG_AMMO }
      else if (it.kind === 'gl') p.gun = { kind: 'gl', ammo: GL_AMMO }
      else p.hp = Math.min(PLAYER_MAX_HP, p.hp + 30)
      sfx.coin()
      state.fx.push({ kind: 'ring', x: it.x, y: it.y, t: 0, life: 0.3 })
    }
  }
  state.items = state.items.filter((it) => !it.taken)
}

function updateCamera() {
  const desired = state.player.x - canvas.width * 0.35
  const maxCam = state.gateX !== null ? state.gateX : WORLD_WIDTH - canvas.width
  state.cameraX = clamp(desired, 0, Math.max(0, maxCam))
}

function update(dt) {
  if (state.phase !== 'playing') return
  for (const f of state.fx) f.t += dt
  state.fx = state.fx.filter((f) => f.t < f.life)
  if (state.shake > 0) state.shake -= dt
  if (state.banner) { state.banner.t += dt; if (state.banner.t > 2.6) state.banner = null }
  updatePlayer(dt)
  updateEnemies(dt)
  updateProjectiles(dt)
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
// 챕터 2(항구)의 배경: 바다 위의 크레인/배, 창고와 컨테이너
const harborFar = Array.from({ length: 16 }, (_, i) => ({ x: (i / 16) * WORLD_WIDTH * 1.2 + bgHashEarly(i, 1) * 60, kind: i % 3 === 1 ? 'ship' : i % 3 === 0 ? 'crane' : 'tank', w: 110 + bgHashEarly(i, 2) * 70, h: 70 + bgHashEarly(i, 3) * 70 }))
const harborMid = Array.from({ length: 30 }, (_, i) => ({ x: (i / 30) * WORLD_WIDTH * 1.2, kind: i % 3 === 0 ? 'stack' : 'warehouse', w: 80 + bgHashEarly(i, 4) * 70, h: 52 + bgHashEarly(i, 5) * 40, c: Math.floor(bgHashEarly(i, 6) * 4) }))
function bgHashEarly(a, k = 0) { const x = Math.sin(a * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }

const THEMES = {
  street: {
    sky: ['#6a5cb8', '#b294de', '#f8c4d8'], far: '#6c5ca4', mid: '#8a6cb6', winFar: 'rgba(255,224,150,0.4)', winMid: 'rgba(255,224,150,0.65)',
    walk: '#b2b2c4', walkLine: 'rgba(0,0,0,0.16)', curb: '#d0d0de', road: '#86869a', lane: 'rgba(255,230,140,0.55)',
  },
  neon: {
    sky: ['#2c2a78', '#7a3fa0', '#ff82bc'], far: '#4a3f8c', mid: '#5f4aa0', winFar: 'rgba(120,230,255,0.5)', winMid: 'rgba(255,150,220,0.7)',
    walk: '#a090c4', walkLine: 'rgba(30,10,60,0.2)', curb: '#ff7ac8', road: '#6a68a0', lane: 'rgba(120,255,255,0.65)',
  },
  harbor: {
    sky: ['#3f64b0', '#f2967c', '#ffd8a2'], walk: '#a88c64', walkLine: 'rgba(60,35,10,0.35)', curb: '#6a4a30', road: '#8d877b', lane: 'rgba(255,255,255,0.55)',
  },
}
const NEON_COLORS = ['#ff4fa8', '#4fe8ff', '#ffe14f', '#b27bff']
const neonSigns = Array.from({ length: 26 }, (_, i) => ({ x: (i / 26) * WORLD_WIDTH * 1.2 + bgHashEarly(i, 7) * 50, kind: i % 4, w: 44 + bgHashEarly(i, 8) * 40, h: 40 + bgHashEarly(i, 9) * 60, y: 70 + bgHashEarly(i, 10) * 90, c: i % 4 }))
const WOOD_COLORS = ['#c0504a', '#4a7ac0', '#e0a030', '#4a9a6a']

function worldToScreenX(x) { return x - state.cameraX }

const bgHash = (a, k = 0) => {
  const x = Math.sin(a * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function drawParallaxLayer(buildings, factor, color, windowColor) {
  ctx.fillStyle = color
  const offset = state.cameraX * factor
  for (const b of buildings) {
    const sx = b.x - offset
    if (sx < -b.w || sx > canvas.width + b.w) continue
    ctx.fillStyle = color
    ctx.fillRect(sx, GROUND_TOP - b.h, b.w, b.h)
    // lit windows, a few flickering neon dots on the taller ones
    if (windowColor) {
      for (let wy = GROUND_TOP - b.h + 10; wy < GROUND_TOP - 12; wy += 16) {
        for (let wx = sx + 8; wx < sx + b.w - 10; wx += 14) {
          if (bgHash(b.x + wx * 0.37, wy) > 0.62) {
            ctx.fillStyle = bgHash(b.x, wy) > 0.8 ? 'rgba(130,200,255,0.55)' : windowColor
            ctx.fillRect(wx, wy, 7, 8)
          }
        }
      }
    }
  }
}

const LAMP_SPACING = 620
const PROP_SPOTS = Array.from({ length: 18 }, (_, i) => ({ x: 260 + i * 310 + bgHash(i, 5) * 120, kind: Math.floor(bgHash(i, 9) * 3) }))

function drawStreetProp(x, kind) {
  const sx = worldToScreenX(x)
  if (sx < -60 || sx > canvas.width + 60) return
  const y = GROUND_TOP + 30
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(sx, y + 2, 20, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  if (curChapter().theme === 'neon') {
    if (kind === 0) {
      // 네온 입간판
      ctx.fillStyle = '#1c1238'
      ctx.beginPath(); ctx.moveTo(sx - 16, y); ctx.lineTo(sx - 12, y - 40); ctx.lineTo(sx + 12, y - 40); ctx.lineTo(sx + 16, y); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = NEON_COLORS[Math.floor(x / 70) % 4]; ctx.lineWidth = 2.5
      ctx.strokeRect(sx - 10, y - 36, 20, 28)
      ctx.beginPath(); ctx.moveTo(sx - 6, y - 26); ctx.lineTo(sx + 6, y - 26); ctx.moveTo(sx - 6, y - 18); ctx.lineTo(sx + 6, y - 18); ctx.stroke()
    } else if (kind === 1) {
      // 벨벳 로프 기둥
      ctx.fillStyle = '#d8b84a'
      for (const dx of [-22, 22]) { ctx.fillRect(sx + dx - 2, y - 28, 4, 28); ctx.beginPath(); ctx.arc(sx + dx, y - 30, 4, 0, Math.PI * 2); ctx.fill() }
      ctx.strokeStyle = '#c0204a'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(sx - 22, y - 28); ctx.quadraticCurveTo(sx, y - 14, sx + 22, y - 28); ctx.stroke()
    } else {
      // 화분
      ctx.fillStyle = '#8a4a6a'
      hRound(sx - 11, y - 14, 22, 14, 3); ctx.fill()
      ctx.fillStyle = '#2f9a6a'
      for (const [dx, dy, r] of [[-6, -22, 8], [6, -24, 9], [0, -30, 8]]) { ctx.beginPath(); ctx.arc(sx + dx, y + dy, r, 0, Math.PI * 2); ctx.fill() }
    }
    return
  }
  if (curChapter().theme === 'harbor') {
    if (kind === 0) {
      // shipping container
      ctx.fillStyle = WOOD_COLORS[Math.floor(x / 50) % 4]
      ctx.fillRect(sx - 34, y - 34, 68, 34)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5
      for (let i = -30; i <= 30; i += 8) { ctx.beginPath(); ctx.moveTo(sx + i, y - 32); ctx.lineTo(sx + i, y - 2); ctx.stroke() }
      ctx.strokeStyle = '#2a2230'; ctx.lineWidth = 2; ctx.strokeRect(sx - 34, y - 34, 68, 34)
    } else if (kind === 1) {
      // oil drum
      ctx.fillStyle = '#b8442e'
      hRound(sx - 12, y - 32, 24, 32, 4); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(sx - 12, y - 22, 24, 3); ctx.fillRect(sx - 12, y - 11, 24, 3)
      ctx.fillStyle = '#7a2a1c'; ctx.fillRect(sx - 12, y - 33, 24, 3)
    } else {
      // mooring bollard
      ctx.fillStyle = '#3a3a44'
      hRound(sx - 8, y - 22, 16, 22, 5); ctx.fill()
      ctx.fillStyle = '#4e4e5a'; ctx.fillRect(sx - 12, y - 26, 24, 6)
    }
    return
  }
  if (kind === 0) {
    // trash can
    ctx.fillStyle = '#4a5260'
    hRound(sx - 11, y - 30, 22, 30, 4); ctx.fill()
    ctx.fillStyle = '#5c6676'
    ctx.fillRect(sx - 13, y - 33, 26, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(sx - 8, y - 26, 3, 22)
  } else if (kind === 1) {
    // stacked crates
    ctx.fillStyle = '#7a5a36'
    ctx.fillRect(sx - 18, y - 24, 36, 24)
    ctx.strokeStyle = '#4a3420'
    ctx.lineWidth = 2
    ctx.strokeRect(sx - 18, y - 24, 36, 24)
    ctx.beginPath()
    ctx.moveTo(sx - 18, y - 24); ctx.lineTo(sx + 18, y)
    ctx.moveTo(sx + 18, y - 24); ctx.lineTo(sx - 18, y)
    ctx.stroke()
  } else {
    // hydrant
    ctx.fillStyle = '#c0392b'
    hRound(sx - 7, y - 24, 14, 24, 4); ctx.fill()
    ctx.fillRect(sx - 11, y - 18, 22, 5)
    ctx.fillStyle = '#e8c040'
    ctx.fillRect(sx - 8, y - 28, 16, 5)
  }
}

function drawStreetLamp(x) {
  const sx = worldToScreenX(x)
  if (sx < -120 || sx > canvas.width + 120) return
  const top = GROUND_TOP - 120
  // light pool on the pavement
  const g = ctx.createRadialGradient(sx, GROUND_TOP + 30, 4, sx, GROUND_TOP + 30, 150)
  g.addColorStop(0, 'rgba(255,226,150,0.28)')
  g.addColorStop(1, 'rgba(255,226,150,0)')
  ctx.fillStyle = g
  ctx.fillRect(sx - 150, GROUND_TOP - 40, 300, 220)
  ctx.fillStyle = '#15121f'
  ctx.fillRect(sx - 3, top, 6, 150)
  ctx.fillRect(sx - 3, top, 30, 5)
  ctx.fillStyle = 'rgba(255,236,170,0.95)'
  ctx.beginPath()
  ctx.ellipse(sx + 24, top + 8, 11, 5, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawHarborFar(offset) {
  const seaY = GROUND_TOP - 34
  for (const b of harborFar) {
    const sx = b.x - offset
    if (sx < -b.w - 40 || sx > canvas.width + b.w) continue
    ctx.fillStyle = '#5b4d7c'
    if (b.kind === 'crane') {
      const bx = sx + 20
      ctx.fillRect(bx, seaY - b.h - 30, 7, b.h + 30)
      ctx.fillRect(bx - 20, seaY - b.h - 30, b.w + 20, 6)
      ctx.strokeStyle = '#5b4d7c'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(bx + 3, seaY - b.h - 30); ctx.lineTo(bx + b.w - 6, seaY - b.h - 24); ctx.moveTo(bx + b.w - 4, seaY - b.h - 24); ctx.lineTo(bx + b.w - 4, seaY - b.h + 20); ctx.stroke()
      ctx.fillRect(bx + b.w - 10, seaY - b.h + 20, 12, 8)
    } else if (b.kind === 'ship') {
      ctx.beginPath(); ctx.moveTo(sx, seaY - 22); ctx.lineTo(sx + b.w, seaY - 22); ctx.lineTo(sx + b.w - 18, seaY + 4); ctx.lineTo(sx + 14, seaY + 4); ctx.closePath(); ctx.fill()
      ctx.fillRect(sx + b.w * 0.55, seaY - 50, b.w * 0.28, 28)
      ctx.fillRect(sx + b.w * 0.62, seaY - 66, 10, 18)
      ctx.fillStyle = '#c0504a'; ctx.fillRect(sx + 6, seaY - 22, b.w - 12, 4)
    } else {
      ctx.fillRect(sx, seaY - 40, 38, 46)
      ctx.beginPath(); ctx.arc(sx + 19, seaY - 40, 19, Math.PI, 0); ctx.fill()
      ctx.fillRect(sx + 50, seaY - 30, 30, 36)
    }
  }
}
function drawHarborMid(offset) {
  for (const b of harborMid) {
    const sx = b.x - offset
    if (sx < -b.w - 10 || sx > canvas.width + 10) continue
    if (b.kind === 'warehouse') {
      ctx.fillStyle = '#8a6a82'
      ctx.fillRect(sx, GROUND_TOP - b.h, b.w, b.h)
      ctx.fillStyle = '#a65a4e'
      ctx.beginPath(); ctx.moveTo(sx - 4, GROUND_TOP - b.h); ctx.lineTo(sx + b.w / 2, GROUND_TOP - b.h - 18); ctx.lineTo(sx + b.w + 4, GROUND_TOP - b.h); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.2
      for (let x = sx + 6; x < sx + b.w; x += 9) { ctx.beginPath(); ctx.moveTo(x, GROUND_TOP - b.h + 2); ctx.lineTo(x, GROUND_TOP); ctx.stroke() }
      ctx.fillStyle = '#4a3a52'; ctx.fillRect(sx + b.w / 2 - 14, GROUND_TOP - 30, 28, 30)
      ctx.fillStyle = 'rgba(255,214,120,0.8)'; ctx.fillRect(sx + 8, GROUND_TOP - b.h + 10, 8, 6)
    } else {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 2; i++) {
          ctx.fillStyle = WOOD_COLORS[(b.c + row + i) % 4]
          ctx.fillRect(sx + i * 40, GROUND_TOP - 24 * (row + 1), 38, 22)
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(sx + i * 40, GROUND_TOP - 24 * (row + 1), 38, 22)
        }
      }
    }
  }
}

function drawNeonSigns(offset) {
  for (const n of neonSigns) {
    const sx = n.x - offset
    if (sx < -n.w - 20 || sx > canvas.width + 20) continue
    const col = NEON_COLORS[n.c]
    const y = GROUND_TOP - n.y - n.h
    ctx.fillStyle = 'rgba(14,8,34,0.78)'
    ctx.fillRect(sx, y, n.w, n.h)
    for (const [lw, al] of [[7, 0.18], [3, 0.95]]) {
      ctx.strokeStyle = col
      ctx.globalAlpha = al
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (n.kind === 0) { ctx.rect(sx + 4, y + 4, n.w - 8, n.h - 8); ctx.moveTo(sx + 10, y + n.h / 2); ctx.lineTo(sx + n.w - 10, y + n.h / 2) }
      else if (n.kind === 1) { ctx.arc(sx + n.w / 2, y + n.h / 2, Math.min(n.w, n.h) / 2 - 6, 0, Math.PI * 2); ctx.moveTo(sx + n.w / 2 - 6, y + n.h / 2); ctx.lineTo(sx + n.w / 2 + 6, y + n.h / 2) }
      else if (n.kind === 2) { ctx.moveTo(sx + 8, y + n.h - 8); ctx.lineTo(sx + n.w / 3, y + 10); ctx.lineTo(sx + n.w * 0.6, y + n.h - 10); ctx.lineTo(sx + n.w - 8, y + 8) }
      else { for (let k = 1; k <= 3; k++) { ctx.moveTo(sx + 8, y + (n.h * k) / 4); ctx.lineTo(sx + n.w - 8, y + (n.h * k) / 4) } }
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
    ctx.globalAlpha = 1
  }
}

function drawBackground() {
  const th = THEMES[curChapter().theme]
  const harbor = curChapter().theme === 'harbor'
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_TOP)
  grad.addColorStop(0, th.sky[0])
  grad.addColorStop(0.7, th.sky[1])
  grad.addColorStop(1, th.sky[2])
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, GROUND_TOP)

  const t = performance.now() / 1000
  const neon = curChapter().theme === 'neon'
  if (neon) {
    // 하늘을 가르는 서치라이트
    for (let k = 0; k < 3; k++) {
      const bx = 160 + k * 330 - state.cameraX * 0.03
      const ang = Math.sin(t * 0.4 + k * 2) * 0.35
      ctx.fillStyle = 'rgba(255,255,255,0.09)'
      ctx.beginPath()
      ctx.moveTo(bx - 14, GROUND_TOP - 40)
      ctx.lineTo(bx + 14, GROUND_TOP - 40)
      ctx.lineTo(bx + Math.sin(ang) * 260 + 60, 0)
      ctx.lineTo(bx + Math.sin(ang) * 260 - 60, 0)
      ctx.closePath(); ctx.fill()
    }
  }
  if (!harbor) {
    // 별과 달은 은은하게 (배경이 밝아진 만큼 별은 옅게)
    for (let i = 0; i < 40; i++) {
      const sx = ((bgHash(i, 1) * canvas.width * 1.4 - state.cameraX * 0.03) % canvas.width + canvas.width) % canvas.width
      const sy = bgHash(i, 2) * (GROUND_TOP * 0.5)
      ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.4 * Math.abs(Math.sin(t * 0.8 + i))})`
      ctx.fillRect(sx, sy, 1.6, 1.6)
    }
    const mx = canvas.width - 150 - state.cameraX * 0.02
    const mg = ctx.createRadialGradient(mx, 70, 6, mx, 70, 70)
    mg.addColorStop(0, 'rgba(255,244,210,0.5)')
    mg.addColorStop(1, 'rgba(255,244,210,0)')
    ctx.fillStyle = mg
    ctx.fillRect(mx - 70, 0, 140, 140)
    ctx.fillStyle = '#fff3d0'
    ctx.beginPath()
    ctx.arc(mx, 70, 22, 0, Math.PI * 2)
    ctx.fill()
    drawParallaxLayer(buildingsFar, 0.25, th.far, th.winFar)
    drawParallaxLayer(buildingsMid, 0.5, th.mid, th.winMid)
    if (neon) drawNeonSigns(state.cameraX * 0.5)
  } else {
    // 지는 해와 바다
    const sx0 = 640 - state.cameraX * 0.02
    const sg = ctx.createRadialGradient(sx0, GROUND_TOP - 70, 10, sx0, GROUND_TOP - 70, 150)
    sg.addColorStop(0, 'rgba(255,240,190,0.95)')
    sg.addColorStop(0.3, 'rgba(255,190,120,0.55)')
    sg.addColorStop(1, 'rgba(255,170,110,0)')
    ctx.fillStyle = sg
    ctx.fillRect(sx0 - 160, GROUND_TOP - 220, 320, 220)
    ctx.fillStyle = '#fff0c8'
    ctx.beginPath(); ctx.arc(sx0, GROUND_TOP - 70, 34, 0, Math.PI * 2); ctx.fill()
    const seaY = GROUND_TOP - 34
    const sea = ctx.createLinearGradient(0, seaY, 0, GROUND_TOP)
    sea.addColorStop(0, '#6a8cc8')
    sea.addColorStop(1, '#3f6aa8')
    ctx.fillStyle = sea
    ctx.fillRect(0, seaY, canvas.width, GROUND_TOP - seaY)
    ctx.strokeStyle = 'rgba(255,230,190,0.55)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 26; i++) {
      const wx = (i * 83 + Math.sin(t * 0.8 + i) * 8 - state.cameraX * 0.08) % (canvas.width + 60)
      const wy = seaY + 4 + (i % 5) * 6
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 16, wy); ctx.stroke()
    }
    drawHarborFar(state.cameraX * 0.25)
    drawHarborMid(state.cameraX * 0.5)
  }

  // sidewalk strip (street) / wooden pier (harbor), curb, then road with lane dashes
  const walk = 40
  ctx.fillStyle = th.walk
  ctx.fillRect(0, GROUND_TOP, canvas.width, walk)
  ctx.strokeStyle = th.walkLine
  ctx.lineWidth = 1.5
  for (let i = 0; i < 60; i++) {
    const sx = i * 70 - (state.cameraX % 70) - 70 + 70
    ctx.beginPath()
    ctx.moveTo(sx, GROUND_TOP)
    ctx.lineTo(sx, GROUND_TOP + walk)
    ctx.stroke()
  }
  if (harbor) {
    ctx.strokeStyle = 'rgba(60,35,10,0.25)'
    for (let y = GROUND_TOP + 10; y < GROUND_TOP + walk; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }
  }
  ctx.fillStyle = th.curb
  ctx.fillRect(0, GROUND_TOP + walk - 4, canvas.width, 4)
  ctx.fillStyle = th.road
  ctx.fillRect(0, GROUND_TOP + walk, canvas.width, canvas.height - GROUND_TOP - walk)
  const laneY = GROUND_TOP + walk + (canvas.height - GROUND_TOP - walk) * 0.5
  ctx.fillStyle = th.lane
  for (let i = -1; i < 20; i++) {
    const sx = i * 130 - (state.cameraX % 130)
    ctx.fillRect(sx, laneY, 64, 5)
  }
  // oil stains and cracks for grit
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let i = 0; i < 24; i++) {
    const sx = i * 240 + bgHash(i, 3) * 120 - state.cameraX
    if (sx < -80 || sx > canvas.width + 80) continue
    ctx.beginPath()
    ctx.ellipse(sx, GROUND_TOP + walk + 20 + bgHash(i, 4) * (canvas.height - GROUND_TOP - walk - 40), 34, 8, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const pr of PROP_SPOTS) drawStreetProp(pr.x, pr.kind)
  for (let x = 120; x < WORLD_WIDTH + 400; x += LAMP_SPACING) drawStreetLamp(x)
}

function drawShadow(x, y, scale) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(worldToScreenX(x), y + 2, 22 * scale, 8 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
}

// Per-character look: skin/hair/pants/boots plus an optional face style.
// `style` also picks the signature gear (player headband, thug bandana +
// scar, boss horned helm + beard).
const LOOKS = {
  player: { skin: '#f2c79b', hair: '#2a1d1a', pants: '#243456', boots: '#1d1b26', trim: '#e04a4a', eye: '#2a1d1a' },
  thug: { skin: '#e0b58a', hair: '#1c1512', pants: '#3a2a2a', boots: '#161214', trim: '#2b2b33', eye: '#2a1d1a' },
  boss: { skin: '#b79ac9', hair: '#2a1535', pants: '#2c1a3a', boots: '#150d1c', trim: '#ffd24a', eye: '#ff3b3b' },
  runner: { skin: '#e8c09a', hair: '#173a2a', pants: '#2a3a3a', boots: '#e0e0e0', trim: '#2f8a66', eye: '#2a1d1a' },
  brute: { skin: '#d9a878', hair: '#2a1d1a', pants: '#4a3a2a', boots: '#1a1410', trim: '#5a3a1a', eye: '#2a1d1a' },
  gunman: { skin: '#e8c8a0', hair: '#1c1c24', pants: '#2a3040', boots: '#161820', trim: '#2a3a50', eye: '#2a1d1a' },
  captain: { skin: '#e0b890', hair: '#e8e8ea', pants: '#1c2a44', boots: '#101420', trim: '#e8c040', eye: '#ff6a3a' },
  vixen: { skin: '#f4cfa8', hair: '#8a1230', pants: '#1a1620', boots: '#2a0f1c', trim: '#ff3b6a', eye: '#2a1d1a' },
  madam: { skin: '#f4d6b8', hair: '#e8cc58', pants: '#2a1030', boots: '#3a1030', trim: '#ffd24a', eye: '#7a2a9a' },
}
const FEMALE = new Set(['vixen', 'madam'])

function hRound(x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawHumanoid(x, y, opts) {
  const scale = depthScale(y) * (opts.size || 1)
  const look = LOOKS[opts.style || 'player']
  const t = performance.now() / 1000
  ctx.save()
  ctx.globalAlpha = opts.alpha ?? 1
  ctx.translate(worldToScreenX(x), y - (opts.lift || 0))
  if (opts.rot) {
    const sinkY = opts.sink ? 24 * scale * Math.abs(Math.sin(opts.rot)) : 0 // 누우면 몸통이 바닥에 닿게
    ctx.translate(0, -30 * scale + sinkY)
    ctx.rotate(opts.rot)
    ctx.translate(0, 30 * scale)
  }
  ctx.scale(scale * opts.facing, scale)
  // 던지기 자세: 준비(잡기) → 들어올리기 → 내던지기. tp = 단계 진행도 0..1
  const tPhase = opts.throwPhase
  const tp = opts.throwP || 0
  if (tPhase) {
    // 준비: 몸을 숙이며 파고든다 → 들어올릴 때 뒤로 젖힌다(활처럼) → 놓는 순간 앞으로 확 꺾는다
    const lean = tPhase === 'startup' ? 0.22 * easeOut(tp)
      : tPhase === 'active' ? 0.22 - 0.6 * easeIO(tp) // +0.22 → -0.38
        : -0.38 + 0.82 * easeOut(tp / 0.45) - 0.44 * easeIO(clamp((tp - 0.45) / 0.55, 0, 1)) // 앞으로 쭉(+0.44) → 제자리
    ctx.translate(0, -26)
    ctx.rotate(lean) // 윗몸 기울기(허리 기준)
    ctx.translate(0, 26)
  }

  const bodyColor = opts.flash ? '#ffffff' : opts.color
  const legSwing = opts.moving ? Math.sin(opts.walkPhase) * 10 : 0
  const kicking = opts.attacking && opts.attackType === 'kick'
  const throwing = !!tPhase || (opts.attacking && opts.attackType === 'throw')
  const punching = opts.attacking && !kicking && !throwing
  const OUT = 'rgba(15,10,20,0.75)'
  const boot = (bx, by, bw) => {
    ctx.fillStyle = look.boots
    hRound(bx - 1, by, bw + 2, 7, 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(bx, by + 5, bw, 1.4)
  }

  // ---- legs ----
  const female = FEMALE.has(opts.style)
  const leg = (lx, ly) => {
    if (!female) { ctx.fillStyle = look.pants; hRound(lx, ly, 7, 26, 2); ctx.fill(); return }
    ctx.fillStyle = look.skin // 허벅지는 맨살, 무릎 아래는 롱부츠
    hRound(lx, ly, 7, 15, 2); ctx.fill()
    ctx.fillStyle = look.boots
    hRound(lx - 0.5, ly + 11, 8, 15, 2); ctx.fill()
    ctx.fillStyle = look.trim
    ctx.fillRect(lx - 0.5, ly + 11, 8, 2)
  }
  ctx.fillStyle = look.pants
  if (kicking) {
    leg(-10, -26)
    boot(-10, -6, 7)
    ctx.fillStyle = female ? look.skin : look.pants
    hRound(8, -22, 24, 9, 3); ctx.fill()
    boot(28, -24, 6)
  } else if (throwing) {
    // 다리를 넓게 벌리고 무게중심을 낮춘 던지기 자세
    const wide = tPhase === 'startup' ? 3 + 4 * tp : 7
    leg(-12 - wide, -26)
    leg(5 + wide, -26)
    boot(-12 - wide, -6, 7)
    boot(5 + wide, -6, 7)
  } else {
    leg(-10, -26 + legSwing * 0.2)
    leg(3, -26 - legSwing * 0.2)
    boot(-10, -6 + legSwing * 0.2, 7)
    boot(3, -6 - legSwing * 0.2, 7)
  }

  // ---- torso ----
  ctx.fillStyle = bodyColor
  hRound(-12, -56, 24, 32, 5); ctx.fill()
  ctx.strokeStyle = OUT
  ctx.lineWidth = 1.2
  ctx.stroke()
  if (!opts.flash) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    hRound(-12, -38, 24, 14, 5); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    hRound(-9, -54, 9, 9, 3); ctx.fill()
  }
  // belt + buckle
  ctx.fillStyle = look.trim === '#ffd24a' ? '#3a2a10' : '#2a2018'
  ctx.fillRect(-12, -31, 24, 4)
  ctx.fillStyle = look.trim
  ctx.fillRect(-3, -31, 6, 4)
  if (opts.style === 'player') {
    ctx.fillStyle = '#ffe066' // chest bolt emblem
    ctx.beginPath()
    ctx.moveTo(1, -50); ctx.lineTo(-4, -42); ctx.lineTo(-0.5, -42); ctx.lineTo(-2, -35); ctx.lineTo(4, -44); ctx.lineTo(0.5, -44)
    ctx.closePath(); ctx.fill()
  } else if (opts.style === 'thug') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)' // tank-top stripes
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-6, -54); ctx.lineTo(-6, -32); ctx.moveTo(6, -54); ctx.lineTo(6, -32); ctx.stroke()
  } else if (opts.style === 'runner') {
    ctx.fillStyle = look.trim // 후드 줄무늬
    ctx.fillRect(-12, -50, 24, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillRect(-12, -44, 24, 2)
  } else if (opts.style === 'brute') {
    ctx.fillStyle = 'rgba(255,255,255,0.2)' // 배가 나온 민소매
    hRound(-9, -52, 18, 20, 6); ctx.fill()
    ctx.fillStyle = look.trim // 멜빵
    ctx.fillRect(-9, -56, 4, 26); ctx.fillRect(5, -56, 4, 26)
  } else if (opts.style === 'gunman') {
    ctx.fillStyle = '#161c28' // 조끼 + 탄띠
    hRound(-11, -55, 9, 24, 2); ctx.fill()
    hRound(2, -55, 9, 24, 2); ctx.fill()
    ctx.strokeStyle = '#d8a030'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-11, -54); ctx.lineTo(11, -34); ctx.stroke()
  } else if (opts.style === 'vixen') {
    ctx.fillStyle = look.skin // 크롭 재킷: 허리가 드러난 실루엣
    ctx.fillRect(-10, -41, 20, 9)
    ctx.strokeStyle = 'rgba(120,60,40,0.4)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, -35); ctx.stroke()
    ctx.fillStyle = look.pants // 핫팬츠와 벨트
    hRound(-12, -33, 24, 9, 3); ctx.fill()
    ctx.fillStyle = look.trim
    ctx.fillRect(-12, -33, 24, 2)
    ctx.strokeStyle = look.trim; ctx.lineWidth = 2 // 재킷 지퍼와 가슴선
    ctx.beginPath(); ctx.moveTo(0, -55); ctx.lineTo(0, -42); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(-10, -54, 5, 11)
  } else if (opts.style === 'madam') {
    ctx.fillStyle = '#f6f2ec' // 퍼 칼라
    ctx.beginPath(); ctx.ellipse(0, -55, 15, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = look.trim
    ctx.fillRect(-12, -33, 24, 3)
    for (const yy of [-48, -42, -36]) { ctx.beginPath(); ctx.arc(0, yy, 1.8, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = 'rgba(255,215,90,0.55)'
    ctx.fillRect(-12, -57, 3, 24); ctx.fillRect(9, -57, 3, 24)
  } else if (opts.style === 'captain') {
    ctx.fillStyle = look.trim // 견장과 금단추
    for (const s of [-1, 1]) hRound(s * 12 - 5, -58, 10, 6, 2), ctx.fill()
    for (const yy of [-48, -42, -36]) { ctx.beginPath(); ctx.arc(0, yy, 1.8, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillRect(-12, -33, 24, 2)
  } else {
    ctx.fillStyle = look.trim // boss armour plates + spiked shoulders
    hRound(-13, -57, 26, 7, 3); ctx.fill()
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * 11, -56); ctx.lineTo(s * 20, -66); ctx.lineTo(s * 17, -52)
      ctx.closePath(); ctx.fill()
    }
  }

  // ---- arms (sleeve + fist) ----
  const arm = (ax, ay, aw, ah) => {
    ctx.fillStyle = bodyColor
    hRound(ax, ay, aw, ah, 3); ctx.fill()
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1
    ctx.stroke()
  }
  const fist = (fx, fy) => {
    ctx.fillStyle = look.skin
    ctx.beginPath(); ctx.arc(fx, fy, 4.2, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1
    ctx.stroke()
  }
  // 어깨→손을 2마디(윗팔+아랫팔)로 이어 팔꿈치가 자연스럽게 꺾이는 팔
  const ik = (sx, sy, hx, hy) => {
    const l1 = 17
    const l2 = 17
    let dx = hx - sx
    let dy = hy - sy
    let d = Math.hypot(dx, dy) || 0.01
    const dd = Math.min(d, l1 + l2 - 0.5)
    const ux = dx / d
    const uy = dy / d
    const a = (dd * dd + l1 * l1 - l2 * l2) / (2 * dd)
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
    let ex = sx + ux * a - uy * h
    let ey = sy + uy * a + ux * h
    const ex2 = sx + ux * a + uy * h
    const ey2 = sy + uy * a - ux * h
    if (ey2 > ey) { ex = ex2; ey = ey2 } // 팔꿈치는 아래쪽으로
    const hx2 = sx + ux * dd
    const hy2 = sy + uy * dd
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [w, col] of [[9.2, OUT], [7.2, bodyColor]]) {
      ctx.strokeStyle = col
      ctx.lineWidth = w
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx2, hy2); ctx.stroke()
    }
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    fist(hx2, hy2)
  }
  if (opts.gun === 'gl') {
    // 어깨에 멘 바주카/RPG 발사관: 뒤쪽 손은 손잡이, 앞쪽 손은 발사관 중간을 받친다
    const kick = opts.muzzle ? -4 : 0
    ik(-3, -51, 10 + kick, -47) // 뒤쪽 팔
    ctx.save()
    ctx.translate(kick, 0)
    const ty = -64
    if (opts.muzzle) {
      // 백블라스트: 발사관 뒤로 뿜어 나오는 불꽃
      const bl = ctx.createLinearGradient(-60, 0, -22, 0)
      bl.addColorStop(0, 'rgba(255,120,30,0)'); bl.addColorStop(0.5, 'rgba(255,190,70,0.95)'); bl.addColorStop(1, 'rgba(255,255,220,1)')
      ctx.fillStyle = bl
      ctx.beginPath(); ctx.moveTo(-22, ty - 7); ctx.lineTo(-62 - Math.random() * 8, ty - 2); ctx.lineTo(-62 - Math.random() * 8, ty + 3); ctx.lineTo(-22, ty + 7); ctx.closePath(); ctx.fill()
    }
    // 뒤쪽 나팔(노즐)
    ctx.fillStyle = '#2a2d26'
    ctx.beginPath(); ctx.moveTo(-18, ty - 4); ctx.lineTo(-27, ty - 9); ctx.lineTo(-27, ty + 9); ctx.lineTo(-18, ty + 4); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke()
    // 발사관 본체
    ctx.fillStyle = '#5f6e3c'
    hRound(-19, ty - 6, 66, 12, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-16, ty - 5, 60, 2)
    ctx.fillStyle = '#3d4a28'
    ctx.fillRect(-4, ty - 6, 4, 12); ctx.fillRect(26, ty - 6, 4, 12)
    ctx.fillStyle = '#e8c040'; ctx.fillRect(4, ty - 6, 3, 12); ctx.fillRect(12, ty - 6, 3, 12) // 노란 띠
    // 앞쪽 깔때기 + 장전된 로켓탄 머리
    ctx.fillStyle = '#4a5630'
    ctx.beginPath(); ctx.moveTo(46, ty - 6); ctx.lineTo(54, ty - 9); ctx.lineTo(54, ty + 9); ctx.lineTo(46, ty + 6); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#d6452e'
    ctx.beginPath(); ctx.moveTo(52, ty - 6); ctx.quadraticCurveTo(64, ty - 4, 67, ty); ctx.quadraticCurveTo(64, ty + 4, 52, ty + 6); ctx.closePath(); ctx.fill(); ctx.stroke()
    // 조준경 + 손잡이
    ctx.fillStyle = '#23262e'
    hRound(14, ty - 12, 14, 6, 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#7ab0d8'; ctx.fillRect(25, ty - 11, 3, 4)
    hRound(3, ty + 5, 6, 12, 2); ctx.fill(); ctx.stroke()
    hRound(27, ty + 5, 5, 10, 2); ctx.fill(); ctx.stroke()
    ctx.restore()
    ik(8, -52, 29 + kick, -50) // 앞쪽 팔
    if (opts.muzzle) {
      ctx.fillStyle = '#ffe9a0'
      ctx.beginPath()
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const r = i % 2 ? 6 : 16; ctx.lineTo(70 + kick + Math.cos(a) * r, ty + Math.sin(a) * r) }
      ctx.closePath(); ctx.fill()
    }
  } else if (opts.gun) {
    // 총을 앞으로 겨눈 자세
    arm(8, -54, 20, 8); fist(30, -50)
    arm(-4, -49, 14, 8); fist(10, -46)
    ctx.fillStyle = '#23262e'
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1
    let mx
    if (opts.gun === 'mg') {
      hRound(10, -58, 42, 9, 2); ctx.fill(); ctx.stroke()
      hRound(2, -54, 12, 7, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#3a3e48'; ctx.fillRect(26, -50, 7, 11)
      ctx.fillStyle = '#6a6e78'; ctx.fillRect(34, -60, 14, 2)
      mx = 54
    } else {
      hRound(24, -57, 18, 7, 2); ctx.fill(); ctx.stroke()
      ctx.fillRect(26, -51, 6, 9)
      mx = 44
    }
    if (opts.muzzle) {
      ctx.fillStyle = '#ffe9a0'
      ctx.beginPath()
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const r = i % 2 ? 4 : 11; ctx.lineTo(mx + 4 + Math.cos(a) * r, -54 + Math.sin(a) * r) }
      ctx.closePath(); ctx.fill()
    }
  } else if (punching) {
    arm(8, -52, 18, 8); fist(29, -48)
    arm(-14, -50, 10, 18); fist(-9, -30)
  } else if (kicking) {
    arm(8, -50, 8, 16); fist(12, -33)
    arm(-16, -50, 8, 16); fist(-12, -33)
  } else if (throwing) {
    // 두 손이 잡은 적을 따라간다: 준비(뻗어 움켜쥠) → 번쩍 들어올림/젖힘 → 던지는 휘두름
    const lerp = (a, b, k) => a + (b - a) * k
    let tx
    let ty
    if (tPhase === 'startup') {
      const k = easeOut(tp)
      tx = lerp(12, 32, k)
      ty = lerp(-30, -44, k)
    } else if (tPhase === 'active') {
      // 같은 경로(throwPath)를 쓰므로 적의 몸에 손이 붙어 있는 것처럼 보인다
      const path = throwPath(clamp(tp, 0, 1))
      tx = path.rel
      ty = -(path.z + 12) / scale
    } else {
      // 놓은 뒤 앞으로 휘두르며 팔이 내려온다
      const k = easeOut(tp / 0.5)
      tx = lerp(-6, 36, k)
      ty = lerp(-124, -48, k)
    }
    ik(-5, -52, tx - 7, ty + 3) // 뒤쪽 팔
    ik(7, -52, tx + 7, ty - 2) // 앞쪽 팔
  } else {
    const armSwing = opts.moving ? Math.sin(opts.walkPhase + Math.PI) * 6 : 0
    arm(10, -50 + armSwing * 0.3, 8, 18); fist(14, -30 + armSwing * 0.3)
    arm(-18, -50 - armSwing * 0.3, 8, 18); fist(-14, -30 - armSwing * 0.3)
  }

  // ---- head ----
  const hx = 0
  const hy = -66
  // headband tails flutter behind the player
  if (opts.style === 'player') {
    ctx.fillStyle = look.trim
    const fl = Math.sin(t * 9 + (opts.walkPhase || 0)) * 3
    ctx.beginPath(); ctx.moveTo(-10, -71); ctx.lineTo(-24, -68 + fl); ctx.lineTo(-22, -73 + fl); ctx.lineTo(-10, -74); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-10, -70); ctx.lineTo(-22, -62 - fl); ctx.lineTo(-19, -67 - fl); ctx.closePath(); ctx.fill()
  }
  // ear
  ctx.fillStyle = look.skin
  ctx.beginPath(); ctx.arc(hx - 9, hy + 1, 2.8, 0, Math.PI * 2); ctx.fill()
  // face
  ctx.fillStyle = look.skin
  ctx.beginPath(); ctx.arc(hx, hy, 11, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = OUT
  ctx.lineWidth = 1.2
  ctx.stroke()
  // jaw shading
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.beginPath(); ctx.arc(hx, hy, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.fill()

  // hair / headgear
  ctx.fillStyle = look.hair
  if (opts.style === 'player') {
    ctx.beginPath()
    ctx.arc(hx - 1, hy - 3, 11.5, Math.PI * 1.02, Math.PI * 1.98)
    ctx.lineTo(10, hy - 6); ctx.lineTo(6, hy - 11); ctx.lineTo(2, hy - 7); ctx.lineTo(-2, hy - 13); ctx.lineTo(-6, hy - 7); ctx.lineTo(-10, hy - 10)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = look.trim // headband
    ctx.fillRect(-11, hy - 7, 22, 4)
  } else if (opts.style === 'thug') {
    ctx.beginPath() // mohawk
    ctx.moveTo(-8, hy - 8); ctx.lineTo(-4, hy - 18); ctx.lineTo(0, hy - 10); ctx.lineTo(4, hy - 19); ctx.lineTo(8, hy - 8)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#c24a3a' // bandana
    ctx.fillRect(-11, hy - 7, 22, 4)
  } else if (opts.style === 'runner') {
    ctx.beginPath() // 삐죽삐죽 머리 + 초록 머리띠
    ctx.moveTo(-9, hy - 6); ctx.lineTo(-6, hy - 16); ctx.lineTo(-2, hy - 9); ctx.lineTo(2, hy - 17); ctx.lineTo(6, hy - 9); ctx.lineTo(9, hy - 14); ctx.lineTo(10, hy - 6)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = look.trim
    ctx.fillRect(-11, hy - 7, 22, 4)
  } else if (opts.style === 'brute') {
    ctx.fillStyle = 'rgba(255,255,255,0.22)' // 민머리 광택
    ctx.beginPath(); ctx.ellipse(-3, hy - 9, 5, 2.5, -0.3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = look.hair
    ctx.fillRect(-11, hy - 5, 22, 3) // 굵은 눈썹 라인
  } else if (opts.style === 'gunman') {
    ctx.fillStyle = '#232a3a' // 중절모
    ctx.beginPath(); ctx.arc(hx, hy - 4, 11.5, Math.PI, 0); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke()
    ctx.fillStyle = '#1a2030'
    ctx.fillRect(-14, hy - 5, 30, 3)
    ctx.fillStyle = '#c8a040'
    ctx.fillRect(-11, hy - 8, 22, 2)
  } else if (opts.style === 'vixen') {
    const sway = Math.sin(t * 6 + (opts.walkPhase || 0)) * 3
    ctx.beginPath() // 길게 늘어진 포니테일
    ctx.moveTo(-8, hy - 6)
    ctx.bezierCurveTo(-26, hy - 8 + sway, -30, hy + 14 + sway, -22 + sway, hy + 26)
    ctx.bezierCurveTo(-18, hy + 14, -12, hy + 4, -6, hy - 1)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = look.hair
    ctx.beginPath(); ctx.arc(hx - 1, hy - 3, 11.8, Math.PI * 1.02, Math.PI * 1.98)
    ctx.lineTo(11, hy - 1); ctx.quadraticCurveTo(5, hy - 8, -1, hy - 4); ctx.lineTo(-10, hy - 2); ctx.closePath(); ctx.fill()
    ctx.fillStyle = look.trim
    ctx.beginPath(); ctx.arc(-9, hy - 6, 3, 0, Math.PI * 2); ctx.fill()
  } else if (opts.style === 'madam') {
    ctx.beginPath() // 풍성한 금발 웨이브 (얼굴은 가리지 않게 뒤쪽으로)
    ctx.moveTo(-6, hy - 8)
    ctx.bezierCurveTo(-24, hy - 6, -26, hy + 14, -16, hy + 26)
    ctx.bezierCurveTo(-12, hy + 20, -8, hy + 10, -4, hy + 2)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = look.hair
    ctx.beginPath(); ctx.arc(hx - 1, hy - 4, 12.5, Math.PI * 1.0, Math.PI * 2.0)
    ctx.lineTo(11, hy - 1); ctx.quadraticCurveTo(4, hy - 9, -3, hy - 3); ctx.closePath(); ctx.fill()
    ctx.fillStyle = look.trim // 티아라
    ctx.beginPath(); ctx.moveTo(-8, hy - 12); ctx.lineTo(-5, hy - 19); ctx.lineTo(-2, hy - 13); ctx.lineTo(1, hy - 21); ctx.lineTo(4, hy - 13); ctx.lineTo(7, hy - 18); ctx.lineTo(9, hy - 11); ctx.closePath(); ctx.fill()
  } else if (opts.style === 'captain') {
    ctx.fillStyle = '#f0f0f4' // 선장 모자
    ctx.beginPath(); ctx.arc(hx, hy - 4, 12, Math.PI, 0); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke()
    ctx.fillStyle = '#15203a'
    ctx.fillRect(-12, hy - 6, 26, 4)
    ctx.fillStyle = look.trim
    ctx.beginPath(); ctx.arc(2, hy - 12, 3, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.fillStyle = '#3b2a48' // horned helm
    ctx.beginPath(); ctx.arc(hx, hy - 3, 12, Math.PI, 0); ctx.fill()
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.fillStyle = '#f2efe0'
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 9, hy - 8); ctx.lineTo(s * 17, hy - 22); ctx.lineTo(s * 13, hy - 6); ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = look.trim
    ctx.fillRect(-12, hy - 6, 24, 3)
  }

  // eyes (3/4 view: near eye bigger, far eye smaller)
  const hurt = !!opts.hurt
  const blink = (t % 3.6) > 3.48
  const eyeSpec = [[3, 3.2], [8.5, 2.4]]
  for (const [ex, er] of eyeSpec) {
    if (hurt || blink) {
      ctx.strokeStyle = look.eye === '#ff3b3b' ? '#ff3b3b' : '#1a1420'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      if (hurt) { ctx.moveTo(ex - er, hy - 2 - er * 0.8); ctx.lineTo(ex + er, hy - 2 + er * 0.8); ctx.moveTo(ex - er, hy - 2 + er * 0.8); ctx.lineTo(ex + er, hy - 2 - er * 0.8) }
      else { ctx.moveTo(ex - er, hy - 1); ctx.lineTo(ex + er, hy - 1) }
      ctx.stroke()
      continue
    }
    ctx.fillStyle = opts.style === 'boss' ? '#ffe9a0' : '#ffffff'
    ctx.beginPath(); ctx.ellipse(ex, hy - 1, er, er * 1.15, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = OUT
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.fillStyle = look.eye
    ctx.beginPath(); ctx.arc(ex + 0.8, hy - 0.8, er * 0.62, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(ex + 1.5, hy - 1.8, er * 0.24, 0, Math.PI * 2); ctx.fill()
  }
  // brows: angry for enemies, determined for player
  ctx.strokeStyle = opts.style === 'player' ? look.hair : '#120d12'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  const ang = opts.style === 'player' ? 1.6 : 3.4
  ctx.moveTo(-0.5, hy - 6 - ang * 0.5); ctx.lineTo(5.5, hy - 5 + (opts.style === 'player' ? 0 : 1.5))
  ctx.moveTo(6.5, hy - 5.5 + (opts.style === 'player' ? 0 : 1.2)); ctx.lineTo(11, hy - 6.5 - ang * 0.3)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // nose bump + mouth
  ctx.fillStyle = look.skin
  ctx.beginPath(); ctx.moveTo(10.5, hy); ctx.lineTo(14, hy + 3.5); ctx.lineTo(10.5, hy + 4.5); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = OUT
  ctx.lineWidth = 0.9
  ctx.stroke()
  ctx.beginPath()
  if (opts.attacking || hurt) {
    ctx.ellipse(6.5, hy + 7, 3.2, 2.6, 0, 0, Math.PI * 2) // shouting / grimace
    ctx.fillStyle = '#4a1218'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillRect(4, hy + 5.2, 5, 1.4)
  } else if (opts.style === 'player') {
    ctx.arc(6, hy + 5.5, 3, 0.15 * Math.PI, 0.8 * Math.PI) // confident grin
    ctx.stroke()
  } else {
    ctx.moveTo(2.5, hy + 7.5); ctx.lineTo(10, hy + 6) // sneer
    ctx.stroke()
  }
  // extras
  if (opts.style === 'thug') {
    ctx.strokeStyle = '#a23a3a' // scar
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(-1, hy + 2); ctx.lineTo(5, hy + 10); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 0.7
    for (const k of [0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(-1 + 6 * k - 1.5, hy + 2 + 8 * k); ctx.lineTo(-1 + 6 * k + 1.5, hy + 2 + 8 * k); ctx.stroke() }
  } else if (opts.style === 'vixen' || opts.style === 'madam') {
    ctx.strokeStyle = '#120d12'; ctx.lineWidth = 1.3 // 속눈썹
    for (const [ex, er] of eyeSpec) { ctx.beginPath(); ctx.moveTo(ex + er * 0.6, hy - 3); ctx.lineTo(ex + er + 2.2, hy - 5.4); ctx.stroke() }
    ctx.fillStyle = look.trim // 붉은 입술
    ctx.beginPath(); ctx.ellipse(6.5, hy + 6.8, 3.6, 2, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#ffd24a' // 귀걸이
    ctx.beginPath(); ctx.arc(-9, hy + 4, 1.8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,110,130,0.35)'
    ctx.beginPath(); ctx.ellipse(10, hy + 4, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill()
  } else if (opts.style === 'gunman') {
    ctx.fillStyle = '#0e0e14' // 선글라스
    hRound(0.5, hy - 5, 14, 6.5, 2); ctx.fill()
    ctx.fillStyle = 'rgba(160,200,255,0.4)'; ctx.fillRect(2, hy - 4, 4, 2)
  } else if (opts.style === 'captain') {
    ctx.fillStyle = '#0e0e14' // 안대 + 수염
    ctx.beginPath(); ctx.arc(8.5, hy - 1, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#0e0e14'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(-10, hy - 6); ctx.lineTo(12, hy + 1); ctx.stroke()
    ctx.fillStyle = '#d8d8dc'
    ctx.beginPath(); ctx.moveTo(-5, hy + 7); ctx.quadraticCurveTo(3, hy + 17, 11, hy + 8); ctx.quadraticCurveTo(3, hy + 10, -5, hy + 7); ctx.fill()
  } else if (opts.style === 'brute') {
    ctx.strokeStyle = '#a23a3a'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(8, hy - 6); ctx.lineTo(3, hy + 4); ctx.stroke()
  } else if (opts.style === 'boss') {
    ctx.fillStyle = '#2a1535' // beard
    ctx.beginPath(); ctx.moveTo(-6, hy + 7); ctx.quadraticCurveTo(2, hy + 22, 11, hy + 8); ctx.quadraticCurveTo(3, hy + 10, -6, hy + 7); ctx.fill()
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
        style: 'player',
        color: '#3f7fd1',
        facing: p.facing,
        walkPhase: p.walkPhase,
        moving: true,
        alpha: 0.12 * (4 - i),
      })
    }
  }

  drawHumanoid(p.x, p.y, {
    style: 'player',
    hurt: p.hitstunTimer > 0,
    color: '#3f7fd1',
    facing: p.facing,
    walkPhase: p.walkPhase,
    moving: p.moving,
    attacking: !!p.attack && (p.attack.phase !== 'recovery' || p.attack.type === 'throw'),
    attackType: p.attack && p.attack.type,
    throwPhase: p.attack && p.attack.type === 'throw' ? p.attack.phase : p.nadeAnim > 0 && !p.attack ? 'recovery' : null,
    throwP: p.attack && p.attack.type === 'throw' ? Math.min(1, p.attack.t / ATTACKS.throw[p.attack.phase]) : p.nadeAnim > 0 ? clamp(1 - p.nadeAnim / 0.3, 0, 1) : 0,
    gun: p.gun && p.gun.ammo > 0 && !p.attack && p.nadeAnim <= 0 ? p.gun.kind : null,
    muzzle: p.muzzle > 0,
    flash: p.hitstunTimer > 0 && Math.floor(p.hitstunTimer * 20) % 2 === 0,
    lift: p.z,
  })
}

function drawBossHealthBar(en) {
  const sx = worldToScreenX(en.x)
  const w = 70
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(sx - w / 2, en.y - 128, w, 6)
  ctx.fillStyle = '#ff4d4d'
  ctx.fillRect(sx - w / 2, en.y - 128, w * Math.max(0, en.hp / en.maxHp), 6)
}

function drawEnemySprite(en) {
  const stats = ENEMY_TYPES[en.type]
  const alpha = en.state === 'dead' ? Math.max(0, en.deathTimer / DEATH_FADE) : 1
  const liftZ = en.thrown ? en.thrown.z : 0
  const shadowShrink = clamp(1 - liftZ / 160, 0.55, 1)
  drawShadow(en.x, en.y, depthScale(en.y) * shadowShrink)
  // 회전: 던져지는 중이면 공중제비, 쓰러져 있으면 누운 자세에서 일어나는 동작
  let rot = en.thrown ? en.thrown.rot : 0
  let sink = false
  if (!en.thrown && en.down) {
    const d = en.down
    const riseK = clamp((d.t - (d.dur - 0.38)) / 0.38, 0, 1)
    rot = d.dir * (FLIP_END + (Math.PI * 2 - FLIP_END) * easeIO(riseK))
    sink = true
  }
  const opts = {
    style: en.type,
    size: stats.size || 1,
    gun: stats.ranged ? 'pistol' : null,
    muzzle: !!stats.ranged && en.state === 'attack',
    hurt: en.state === 'hitstun',
    color: en.state === 'telegraph' ? '#ffcf4d' : stats.color,
    facing: en.facing,
    walkPhase: en.walkPhase,
    moving: en.state === 'approach',
    attacking: en.state === 'attack',
    attackType: FEMALE.has(en.type) ? 'kick' : null,
    flash: en.flashTimer > 0,
    alpha,
    lift: liftZ,
    rot,
    sink,
  }
  // 날아가는 동안의 잔상
  if (en.thrown && en.thrown.trail) {
    en.thrown.trail.forEach((g, i) => drawHumanoid(g.x, en.y, { ...opts, lift: g.z, rot: g.rot, hurt: true, alpha: 0.05 + i * 0.03 }))
  }
  drawHumanoid(en.x, en.y, opts)
  if (stats.bar && en.state !== 'dead') drawBossHealthBar(en)
}

function drawItem(it) {
  const sx = worldToScreenX(it.x)
  if (sx < -40 || sx > canvas.width + 40) return
  const bob = Math.sin(it.t * 4) * 3
  const y = it.y - 16 + bob
  drawShadow(it.x, it.y, 0.6)
  const glow = ctx.createRadialGradient(sx, y, 2, sx, y, 26)
  glow.addColorStop(0, 'rgba(255,240,150,0.6)')
  glow.addColorStop(1, 'rgba(255,240,150,0)')
  ctx.fillStyle = glow
  ctx.fillRect(sx - 26, y - 26, 52, 52)
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(20,12,24,0.8)'
  if (it.kind === 'grenade') {
    ctx.fillStyle = '#4a6a3a'
    ctx.beginPath(); ctx.ellipse(sx, y + 2, 9, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#2f4a26'; ctx.fillRect(sx - 4, y - 13, 8, 5)
    ctx.strokeStyle = '#c8c8d0'; ctx.beginPath(); ctx.arc(sx + 7, y - 11, 4, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.moveTo(sx - 8, y + 2); ctx.lineTo(sx + 8, y + 2); ctx.moveTo(sx, y - 8); ctx.lineTo(sx, y + 12); ctx.stroke()
  } else if (it.kind === 'gl') {
    ctx.fillStyle = '#5f6e3c'
    hRound(sx - 22, y - 5, 40, 10, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#2a2d26'
    ctx.beginPath(); ctx.moveTo(sx - 22, y - 3); ctx.lineTo(sx - 29, y - 8); ctx.lineTo(sx - 29, y + 8); ctx.lineTo(sx - 22, y + 3); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#d6452e'
    ctx.beginPath(); ctx.moveTo(sx + 16, y - 5); ctx.quadraticCurveTo(sx + 25, y - 3, sx + 27, y); ctx.quadraticCurveTo(sx + 25, y + 3, sx + 16, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#e8c040'; ctx.fillRect(sx - 12, y - 5, 3, 10); ctx.fillRect(sx - 5, y - 5, 3, 10)
    ctx.fillStyle = '#23262e'; ctx.fillRect(sx - 2, y + 4, 5, 8)
  } else if (it.kind === 'mg') {
    ctx.fillStyle = '#23262e'
    hRound(sx - 18, y - 6, 34, 8, 2); ctx.fill(); ctx.stroke()
    hRound(sx - 22, y - 3, 10, 7, 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#3a3e48'; ctx.fillRect(sx - 4, y + 2, 6, 10)
    ctx.fillStyle = '#e8c040'; ctx.fillRect(sx + 12, y - 8, 8, 2)
  } else {
    ctx.fillStyle = '#fff'
    hRound(sx - 11, y - 11, 22, 22, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#e04a4a'
    ctx.fillRect(sx - 3, y - 8, 6, 16); ctx.fillRect(sx - 8, y - 3, 16, 6)
  }
}
function drawGrenade(g) {
  const sx = worldToScreenX(g.x)
  if (g.shell) {
    const d = Math.sign(g.vx) || 1
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(sx, g.y + 2, 12, 3, 0, 0, Math.PI * 2); ctx.fill()
    const y = g.y - g.z
    ctx.save()
    ctx.translate(sx, y)
    ctx.scale(d, 1)
    // 분사 화염
    const fl = ctx.createLinearGradient(-34, 0, -8, 0)
    fl.addColorStop(0, 'rgba(255,120,30,0)'); fl.addColorStop(0.6, 'rgba(255,170,50,0.9)'); fl.addColorStop(1, 'rgba(255,250,200,1)')
    ctx.fillStyle = fl
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-34 - Math.random() * 6, 0); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill()
    // 몸체 + 탄두 + 꼬리날개
    ctx.fillStyle = '#6a7a46'
    hRound(-10, -4.5, 20, 9, 2); ctx.fill()
    ctx.strokeStyle = 'rgba(20,12,8,0.85)'; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.fillStyle = '#d6452e'
    ctx.beginPath(); ctx.moveTo(10, -5.5); ctx.quadraticCurveTo(22, -4, 24, 0); ctx.quadraticCurveTo(22, 4, 10, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#3a4a2a'
    ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-15, -9); ctx.lineTo(-6, -4); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-15, 9); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill()
    ctx.restore()
    return
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath(); ctx.ellipse(sx, g.y + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#4a6a3a'
  ctx.strokeStyle = 'rgba(20,12,24,0.8)'
  ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.ellipse(sx, g.y - g.z, 6, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // 도화선이 깜빡이며 점점 빨라진다
  if (Math.floor(g.t * (6 + g.t * 14)) % 2 === 0) { ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(sx, g.y - g.z - 9, 2.4, 0, Math.PI * 2); ctx.fill() }
}
function drawBullets() {
  for (const b of state.bullets) {
    const sx = worldToScreenX(b.x)
    const y = b.y - 44
    ctx.strokeStyle = b.owner === 'p' ? '#ffe680' : '#ff7a6a'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx - Math.sign(b.vx) * 16, y); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(sx, y, 2, 0, Math.PI * 2); ctx.fill()
  }
}

function drawWorld() {
  const sh = state.shake > 0
  if (sh) {
    ctx.save()
    ctx.translate((Math.random() - 0.5) * state.shake * 24, (Math.random() - 0.5) * state.shake * 24)
  }
  drawBackground()
  const drawables = [{ y: state.player.y, draw: drawPlayerSprite }]
  for (const en of state.enemies) drawables.push({ y: en.y, draw: () => drawEnemySprite(en) })
  for (const it of state.items) drawables.push({ y: it.y - 1, draw: () => drawItem(it) })
  for (const g of state.grenades) drawables.push({ y: g.y, draw: () => drawGrenade(g) })
  drawables.sort((a, b) => a.y - b.y)
  for (const d of drawables) d.draw()
  drawBullets()
  drawFx()
  drawUltimateEffect()
  if (sh) ctx.restore()
}

function drawFx() {
  for (const f of state.fx) {
    const k = f.t / f.life
    const sx = worldToScreenX(f.x)
    ctx.save()
    if (f.kind === 'blast') {
      const r = 20 + 105 * Math.min(1, k * 1.6)
      const g = ctx.createRadialGradient(sx, f.y - 20, 4, sx, f.y - 20, r)
      g.addColorStop(0, `rgba(255,250,200,${0.95 * (1 - k)})`)
      g.addColorStop(0.35, `rgba(255,170,60,${0.85 * (1 - k)})`)
      g.addColorStop(1, 'rgba(200,60,20,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(sx, f.y - 20, r, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(255,230,180,${0.8 * (1 - k)})`
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.ellipse(sx, f.y, r * 1.05, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke()
    } else if (f.kind === 'smoke') {
      if (f.t < 0) { ctx.restore(); continue }
      const rr = (f.r || 8) * (1 + k * 1.6)
      ctx.fillStyle = `rgba(225,225,230,${0.55 * (1 - k)})`
      ctx.beginPath(); ctx.arc(sx, f.y - f.h - k * 14, rr, 0, Math.PI * 2); ctx.fill()
    } else if (f.kind === 'spark') {
      ctx.fillStyle = `rgba(255,235,150,${1 - k})`
      ctx.beginPath()
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const rr = i % 2 ? 3 : 9 + 6 * k; ctx.lineTo(sx + Math.cos(a) * rr, f.y + Math.sin(a) * rr) }
      ctx.closePath(); ctx.fill()
    } else if (f.kind === 'ring') {
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`
      ctx.lineWidth = 3 * (1 - k) + 1
      ctx.beginPath()
      ctx.ellipse(sx, f.y, 14 + 44 * k, (14 + 44 * k) * 0.35, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r = 10 + 46 * k
        ctx.fillStyle = `rgba(220,210,190,${0.55 * (1 - k)})`
        ctx.beginPath()
        ctx.arc(sx + Math.cos(a) * r, f.y - 4 + Math.sin(a) * r * 0.3 - 18 * k * (i % 2), 5 + 5 * k, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
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

  const waves = curWaves()
  const last = waves[waves.length - 1]
  const waveLabel =
    state.waveIndex >= waves.length
      ? 'CLEAR'
      : state.waveIndex === waves.length - 1 && last.enemies.some((e) => ENEMY_TYPES[e.type].bar)
        ? 'BOSS'
        : `WAVE ${state.waveIndex + 1}/${waves.length}`
  ctx.fillText(`${curChapter().name} · ${waveLabel}`, 16, 62)

  // 소지품: 수류탄(G) / 기관총(F)
  for (let i = 0; i < p.grenades; i++) {
    ctx.fillStyle = '#4a6a3a'
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(26 + i * 18, 92, 6, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#2f4a26'; ctx.fillRect(23 + i * 18, 82, 6, 4)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = 'bold 10px sans-serif'
  ctx.fillText(p.grenades > 0 ? '수류탄 (G)' : '수류탄 없음', 16, 105)
  if (p.gun) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(16, 122, 120, 12)
    ctx.fillStyle = '#ffd24a'
    ctx.fillRect(18, 124, 116 * (p.gun.ammo / (p.gun.kind === 'gl' ? GL_AMMO : MG_AMMO)), 8)
    ctx.strokeStyle = '#fff'
    ctx.strokeRect(16, 122, 120, 12)
    ctx.fillStyle = '#fff'
    ctx.fillText(p.gun.kind === 'gl' ? `바주카 (F) ${p.gun.ammo}발` : `기관총 (F 누르고 있기) ${p.gun.ammo}`, 16, 138)
  }
}

function drawBanner() {
  const b = state.banner
  if (!b || state.phase !== 'playing') return
  const a = b.t < 0.4 ? b.t / 0.4 : b.t > 2.1 ? Math.max(0, (2.6 - b.t) / 0.5) : 1
  const W = canvas.width
  ctx.save()
  ctx.globalAlpha = a
  ctx.fillStyle = 'rgba(14,10,28,0.72)'
  ctx.fillRect(0, 150, W, 90)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = 'italic bold 40px sans-serif'
  ctx.fillStyle = '#ffd24a'
  ctx.fillText(b.text, W / 2, 200)
  ctx.font = 'bold 18px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(b.sub, W / 2, 228)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

function drawTitleScreen() {
  const W = canvas.width
  const H = canvas.height
  const t = performance.now() / 1000
  ctx.textBaseline = 'alphabetic'
  const shade = ctx.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(12,8,28,0.9)')
  shade.addColorStop(1, 'rgba(12,8,28,0.6)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)

  // slanted action stripes behind the logo
  ctx.save()
  ctx.translate(W / 2, 128)
  ctx.rotate(-0.06)
  ctx.fillStyle = '#e04a4a'
  ctx.fillRect(-330, -52, 660, 96)
  ctx.fillStyle = '#ffd24a'
  ctx.fillRect(-330, 44, 660, 8)
  ctx.textAlign = 'center'
  ctx.font = 'italic bold 66px sans-serif'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1a0f24'
  ctx.lineWidth = 10
  ctx.strokeText('횡스크롤 액션', 0, 22)
  ctx.fillStyle = '#fff'
  ctx.fillText('횡스크롤 액션', 0, 22)
  ctx.restore()

  // the cast, big: hero mid-punch facing a thug and the boss
  const big = (cx, cy, k, opts) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(0, 2, 26, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    drawHumanoid(state.cameraX, 0, { size: 1 / depthScale(0), walkPhase: t * 6, ...opts })
    ctx.restore()
  }
  const jab = Math.sin(t * 5) > 0.2
  big(W / 2 - 150, 430, 2.4, { style: 'player', color: '#3f7fd1', facing: 1, attacking: jab, attackType: 'punch' })
  big(W / 2 + 60, 426, 2.1, { style: 'thug', color: ENEMY_TYPES.thug.color, facing: -1, hurt: jab })
  big(W / 2 + 220, 436, 2.7, { style: 'boss', color: ENEMY_TYPES.boss.color, facing: -1 })
  if (jab) {
    ctx.fillStyle = '#ffe066'
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const r = i % 2 ? 12 : 26
      ctx.lineTo(W / 2 - 46 + Math.cos(a) * r, 312 + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }

  ctx.textAlign = 'center'
  ctx.font = '14px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText('A/D 이동 · W/S 앞뒤 · 스페이스 점프 · J 펀치 · K 킥 · J+K 던지기 · L 필살기 · M 소리', W / 2, H - 82)
  ctx.fillText('G 수류탄 · F 총/유탄발사기 — 아이템을 주우세요 · 2/3 키: 챕터 2/3부터', W / 2, H - 60)
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.45
  ctx.font = 'bold 20px sans-serif'
  ctx.fillStyle = '#ffe066'
  ctx.fillText('아무 키나 누르거나 클릭해서 시작', W / 2, H - 26)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

function drawOverlay() {
  if (performance.now() < muteNoticeUntil) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText(isMuted() ? '소리 끔 (M)' : '소리 켬 (M)', canvas.width - 16, 16)
    ctx.textAlign = 'left'
  }
  if (state.phase === 'title') {
    drawTitleScreen()
    return
  }
  if (state.phase === 'playing') return
  ctx.fillStyle = 'rgba(10,8,20,0.75)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px sans-serif'
  const title = state.phase === 'cleared' ? 'ALL CLEAR!' : state.phase === 'chapterclear' ? `${curChapter().name} CLEAR!` : 'GAME OVER'
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 30)
  ctx.font = '18px sans-serif'
  const sub = state.phase === 'chapterclear' ? `아무 키나 눌러 ${CHAPTERS[state.chapter + 1].name} — ${CHAPTERS[state.chapter + 1].title}` : state.phase === 'cleared' ? '모든 챕터를 클리어했어요! R 키로 처음부터' : 'R 키를 눌러 이 챕터를 다시 시작'
  ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 20)
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  update(dt)
  drawWorld()
  drawUltimateFlash()
  drawHud()
  drawBanner()
  drawOverlay()

  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
