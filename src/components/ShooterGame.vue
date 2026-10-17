<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  useShooterStore,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  ENEMY_W,
  ENEMY_H,
  BULLET_W,
  BULLET_H,
  ENEMY_BULLET_W,
  ENEMY_BULLET_H,
} from '../stores/shooter'
import { unlockAudio, playShoot, playExplosion, playPlayerHit, playWaveClear, playGameOver } from '../audio'

const store = useShooterStore()
const canvasRef = ref(null)

const heldKeys = new Set()

const MOVE_LEFT_KEYS = ['a', 'arrowleft']
const MOVE_RIGHT_KEYS = ['d', 'arrowright']
const FIRE_KEYS = [' ', 'spacebar']

function onKeyDown(e) {
  unlockAudio()
  const key = e.key.toLowerCase()
  if ([...MOVE_LEFT_KEYS, ...MOVE_RIGHT_KEYS, ...FIRE_KEYS, 'enter'].includes(key)) {
    e.preventDefault()
  }
  heldKeys.add(key)
  if (key === 'enter' && store.phase === 'gameOver') {
    store.startGame()
  }
}

watch(
  () => store.bullets.length,
  (n, o) => {
    if (n > o) playShoot()
  },
)
watch(
  () => store.score,
  (n, o) => {
    if (n > o) playExplosion()
  },
)
watch(
  () => store.player.lives,
  (n, o) => {
    if (n < o) playPlayerHit()
  },
)
watch(
  () => store.phase,
  (n) => {
    if (n === 'waveClear') playWaveClear()
    else if (n === 'gameOver') playGameOver()
  },
)

function onKeyUp(e) {
  heldKeys.delete(e.key.toLowerCase())
}

function buildInput() {
  return {
    left: MOVE_LEFT_KEYS.some((k) => heldKeys.has(k)),
    right: MOVE_RIGHT_KEYS.some((k) => heldKeys.has(k)),
    firing: FIRE_KEYS.some((k) => heldKeys.has(k)),
  }
}

const STAR_COUNT = 70
const stars = Array.from({ length: STAR_COUNT }, () => ({
  x: Math.random() * STAGE_WIDTH,
  y: Math.random() * STAGE_HEIGHT,
  size: Math.random() * 1.8 + 0.6,
  speed: Math.random() * 40 + 20,
  alpha: Math.random() * 0.5 + 0.3,
}))

let rafId = null
let lastTime = 0

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  for (const s of stars) {
    s.y += s.speed * dt
    if (s.y > STAGE_HEIGHT) s.y = 0
  }

  store.update(dt, buildInput())
  render()

  rafId = requestAnimationFrame(loop)
}

function drawPlayer(ctx) {
  const p = store.player
  const flying = p.invulnTimer > 0
  ctx.save()
  ctx.globalAlpha = flying ? 0.55 : 1
  ctx.fillStyle = '#4fd1ff'
  ctx.beginPath()
  ctx.moveTo(p.x, p.y - PLAYER_HEIGHT / 2)
  ctx.lineTo(p.x - PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT / 2)
  ctx.lineTo(p.x, p.y + PLAYER_HEIGHT / 4)
  ctx.lineTo(p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT / 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  if (flying) {
    ctx.strokeStyle = 'rgba(79, 209, 255, 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, PLAYER_WIDTH * 0.9, 0, Math.PI * 2)
    ctx.stroke()
  }
}

const ROW_COLORS = ['#ff6b81', '#ffa94d', '#ffe066', '#69db7c']

function drawEnemies(ctx) {
  for (const e of store.enemies) {
    if (!e.alive) continue
    ctx.fillStyle = ROW_COLORS[e.row % ROW_COLORS.length]
    ctx.beginPath()
    ctx.roundRect(e.x - ENEMY_W / 2, e.y - ENEMY_H / 2, ENEMY_W, ENEMY_H, 5)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.arc(e.x - 6, e.y, 2.5, 0, Math.PI * 2)
    ctx.arc(e.x + 6, e.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBullets(ctx) {
  ctx.fillStyle = '#fffa65'
  for (const b of store.bullets) {
    ctx.fillRect(b.x - BULLET_W / 2, b.y - BULLET_H / 2, BULLET_W, BULLET_H)
  }
  ctx.fillStyle = '#ff4d6d'
  for (const b of store.enemyBullets) {
    ctx.fillRect(b.x - ENEMY_BULLET_W / 2, b.y - ENEMY_BULLET_H / 2, ENEMY_BULLET_W, ENEMY_BULLET_H)
  }
}

function drawStars(ctx) {
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawHud(ctx) {
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText(`SCORE ${store.score}`, 14, 24)

  ctx.textAlign = 'right'
  ctx.fillText(`WAVE ${store.wave}`, STAGE_WIDTH - 14, 24)

  ctx.textAlign = 'left'
  for (let i = 0; i < store.player.lives; i++) {
    const lx = 14 + i * 22
    ctx.fillStyle = '#4fd1ff'
    ctx.beginPath()
    ctx.moveTo(lx, STAGE_HEIGHT - 14)
    ctx.lineTo(lx - 7, STAGE_HEIGHT - 2)
    ctx.lineTo(lx + 7, STAGE_HEIGHT - 2)
    ctx.closePath()
    ctx.fill()
  }
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT)
  gradient.addColorStop(0, '#060818')
  gradient.addColorStop(1, '#131a3a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  drawStars(ctx)
  drawEnemies(ctx)
  drawBullets(ctx)
  drawPlayer(ctx)
  drawHud(ctx)

  if (store.phase !== 'playing') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, STAGE_HEIGHT / 2 - 44, STAGE_WIDTH, 88)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 30px sans-serif'
    ctx.fillText(store.message, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 8)
    if (store.phase === 'gameOver') {
      ctx.font = '16px sans-serif'
      ctx.fillText(`SCORE ${store.score} — Press ENTER to retry`, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 34)
    }
  }
}

onMounted(() => {
  store.startGame()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="shooter-game">
    <canvas ref="canvasRef" :width="STAGE_WIDTH" :height="STAGE_HEIGHT"></canvas>
    <div class="controls">
      <div>A/D 또는 ←/→ 이동 · Space 발사 · 게임오버 시 Enter로 재시작</div>
    </div>
  </div>
</template>

<style scoped>
.shooter-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

canvas {
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  max-width: 100%;
}

.controls {
  font-size: 0.85rem;
  opacity: 0.8;
}
</style>
