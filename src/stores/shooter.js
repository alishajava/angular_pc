import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const STAGE_WIDTH = 480
export const STAGE_HEIGHT = 640

export const PLAYER_WIDTH = 34
export const PLAYER_HEIGHT = 28
const PLAYER_Y = STAGE_HEIGHT - 50
const PLAYER_SPEED = 260
const PLAYER_INVULN_DURATION = 1.5
const LIVES_START = 3

const FIRE_COOLDOWN = 0.18
const BULLET_SPEED = 520
export const BULLET_W = 4
export const BULLET_H = 14

const ENEMY_BULLET_SPEED = 240
export const ENEMY_BULLET_W = 4
export const ENEMY_BULLET_H = 12
const ENEMY_SHOOT_CHANCE = 0.35 // per shooter per second

export const ENEMY_W = 28
export const ENEMY_H = 22
const ROWS = 4
const COLS = 8
const H_GAP = 46
const V_GAP = 38
const TOP_MARGIN = 60
const SIDE_MARGIN = 36
const FORMATION_BASE_SPEED = 45
const FORMATION_SPEED_PER_WAVE = 8
const FORMATION_DROP = 16

const DIVE_CHANCE = 0.12 // per enemy per second
const DIVE_SPEED = 220
const MAX_CONCURRENT_DIVES = 2

function createEnemy(col, row, baseX, baseY) {
  return {
    col,
    row,
    baseX,
    baseY,
    x: baseX,
    y: baseY,
    alive: true,
    diving: false,
    vx: 0,
    vy: 0,
  }
}

export const useShooterStore = defineStore('shooter', () => {
  const player = reactive({
    x: STAGE_WIDTH / 2,
    y: PLAYER_Y,
    lives: LIVES_START,
    invulnTimer: 0,
    fireCooldown: 0,
  })
  const bullets = reactive([])
  const enemyBullets = reactive([])
  const enemies = reactive([])
  const formation = reactive({ offsetX: 0, offsetY: 0, dir: 1, speed: FORMATION_BASE_SPEED })

  const score = ref(0)
  const wave = ref(1)
  const phase = ref('ready') // ready | playing | waveClear | gameOver
  const message = ref('WAVE 1')
  const phaseTimer = ref(1.2)

  function createWave(waveNum) {
    enemies.length = 0
    const gridWidth = (COLS - 1) * H_GAP
    const startX = (STAGE_WIDTH - gridWidth) / 2
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        enemies.push(createEnemy(col, row, startX + col * H_GAP, TOP_MARGIN + row * V_GAP))
      }
    }
    formation.offsetX = 0
    formation.offsetY = 0
    formation.dir = 1
    formation.speed = FORMATION_BASE_SPEED + waveNum * FORMATION_SPEED_PER_WAVE
    enemyBullets.length = 0
    message.value = `WAVE ${waveNum}`
    phase.value = 'ready'
    phaseTimer.value = 1.1
  }

  function startGame() {
    score.value = 0
    wave.value = 1
    player.x = STAGE_WIDTH / 2
    player.lives = LIVES_START
    player.invulnTimer = PLAYER_INVULN_DURATION
    player.fireCooldown = 0
    bullets.length = 0
    createWave(1)
  }

  function hitPlayer() {
    if (player.invulnTimer > 0) return
    player.lives--
    player.invulnTimer = PLAYER_INVULN_DURATION
    if (player.lives <= 0) {
      phase.value = 'gameOver'
      message.value = 'GAME OVER'
    }
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2
  }

  function update(dt, input) {
    if (phase.value === 'ready') {
      phaseTimer.value -= dt
      if (phaseTimer.value <= 0) {
        phase.value = 'playing'
      }
      return
    }
    if (phase.value === 'waveClear') {
      phaseTimer.value -= dt
      if (phaseTimer.value <= 0) {
        wave.value++
        createWave(wave.value)
      }
      return
    }
    if (phase.value === 'gameOver') return

    // player
    if (player.invulnTimer > 0) player.invulnTimer -= dt
    if (player.fireCooldown > 0) player.fireCooldown -= dt

    let moveDir = 0
    if (input.left) moveDir -= 1
    if (input.right) moveDir += 1
    player.x += moveDir * PLAYER_SPEED * dt
    player.x = Math.min(STAGE_WIDTH - PLAYER_WIDTH / 2, Math.max(PLAYER_WIDTH / 2, player.x))

    if (input.firing && player.fireCooldown <= 0) {
      bullets.push({ x: player.x, y: player.y - PLAYER_HEIGHT / 2 })
      player.fireCooldown = FIRE_COOLDOWN
    }

    // formation movement
    formation.offsetX += formation.dir * formation.speed * dt
    const edgeMargin = SIDE_MARGIN
    const anyAtLeftEdge = enemies.some((e) => e.alive && !e.diving && e.baseX + formation.offsetX < edgeMargin)
    const anyAtRightEdge = enemies.some((e) => e.alive && !e.diving && e.baseX + formation.offsetX > STAGE_WIDTH - edgeMargin)
    if ((formation.dir > 0 && anyAtRightEdge) || (formation.dir < 0 && anyAtLeftEdge)) {
      formation.dir *= -1
      formation.offsetY += FORMATION_DROP
    }

    let diveCount = enemies.filter((e) => e.alive && e.diving).length

    for (const e of enemies) {
      if (!e.alive) continue
      if (e.diving) {
        e.x += e.vx * dt
        e.y += e.vy * dt
        if (e.y > STAGE_HEIGHT + 40) {
          e.diving = false
          diveCount--
        } else if (Math.random() < ENEMY_SHOOT_CHANCE * 0.3 * dt) {
          enemyBullets.push({ x: e.x, y: e.y + ENEMY_H / 2 })
        }
      } else {
        e.x = e.baseX + formation.offsetX
        e.y = e.baseY + formation.offsetY
        if (diveCount < MAX_CONCURRENT_DIVES && Math.random() < DIVE_CHANCE * dt) {
          e.diving = true
          diveCount++
          const dx = player.x - e.x
          const dist = Math.max(1, Math.abs(dx))
          e.vx = (dx / dist) * DIVE_SPEED * 0.5
          e.vy = DIVE_SPEED
        } else {
          const isBottomOfColumn = !enemies.some(
            (o) => o.alive && !o.diving && o.col === e.col && o.row > e.row,
          )
          if (isBottomOfColumn && Math.random() < ENEMY_SHOOT_CHANCE * dt) {
            enemyBullets.push({ x: e.x, y: e.y + ENEMY_H / 2 })
          }
        }
      }
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y -= BULLET_SPEED * dt
      if (bullets[i].y < -20) bullets.splice(i, 1)
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      enemyBullets[i].y += ENEMY_BULLET_SPEED * dt
      if (enemyBullets[i].y > STAGE_HEIGHT + 20) enemyBullets.splice(i, 1)
    }

    // player bullets vs enemies
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi]
      let hit = false
      for (const e of enemies) {
        if (!e.alive) continue
        if (overlap(b.x, b.y, BULLET_W, BULLET_H, e.x, e.y, ENEMY_W, ENEMY_H)) {
          e.alive = false
          score.value += 100
          hit = true
          break
        }
      }
      if (hit) bullets.splice(bi, 1)
    }

    // enemy bullets vs player
    if (player.invulnTimer <= 0) {
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eb = enemyBullets[i]
        if (overlap(eb.x, eb.y, ENEMY_BULLET_W, ENEMY_BULLET_H, player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
          enemyBullets.splice(i, 1)
          hitPlayer()
          if (phase.value === 'gameOver') return
        }
      }
    }

    // enemy body vs player
    if (player.invulnTimer <= 0) {
      for (const e of enemies) {
        if (!e.alive) continue
        if (overlap(e.x, e.y, ENEMY_W, ENEMY_H, player.x, player.y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
          e.alive = false
          hitPlayer()
          if (phase.value === 'gameOver') return
          break
        }
      }
    }

    if (enemies.every((e) => !e.alive)) {
      phase.value = 'waveClear'
      message.value = `WAVE ${wave.value} CLEAR!`
      phaseTimer.value = 1.6
    }
  }

  return {
    player,
    bullets,
    enemyBullets,
    enemies,
    score,
    wave,
    phase,
    message,
    startGame,
    update,
  }
})
