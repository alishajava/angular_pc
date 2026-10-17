<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRpgStore, TILE, COLS, ROWS, STAGE_WIDTH, STAGE_HEIGHT } from '../stores/rpg'
import { unlockAudio, playAttackSwing, playMonsterDown, playPlayerHit, playPickup, playLevelUp, playGameOver } from '../audio'

const store = useRpgStore()
const canvasRef = ref(null)

const heldKeys = new Set()
const justPressed = new Set()

const MOVE_UP = ['w', 'arrowup']
const MOVE_DOWN = ['s', 'arrowdown']
const MOVE_LEFT = ['a', 'arrowleft']
const MOVE_RIGHT = ['d', 'arrowright']
const ATTACK_KEYS = [' ', 'spacebar', 'j']

function onKeyDown(e) {
  unlockAudio()
  const key = e.key.toLowerCase()
  if ([...MOVE_UP, ...MOVE_DOWN, ...MOVE_LEFT, ...MOVE_RIGHT, ...ATTACK_KEYS, 'enter'].includes(key)) {
    e.preventDefault()
  }
  if (!heldKeys.has(key)) justPressed.add(key)
  heldKeys.add(key)
  if (store.phase === 'intro' || store.phase === 'gameOver' || store.phase === 'cleared') {
    store.startGame()
    return
  }
}

function onKeyUp(e) {
  heldKeys.delete(e.key.toLowerCase())
}

function buildInput() {
  const attackPressed = ATTACK_KEYS.some((k) => justPressed.has(k))
  justPressed.clear()
  return {
    up: MOVE_UP.some((k) => heldKeys.has(k)),
    down: MOVE_DOWN.some((k) => heldKeys.has(k)),
    left: MOVE_LEFT.some((k) => heldKeys.has(k)),
    right: MOVE_RIGHT.some((k) => heldKeys.has(k)),
    attackPressed,
  }
}

watch(
  () => store.player.swingTimer,
  (n, o) => {
    if (n > o) playAttackSwing()
  },
)
watch(
  () => store.kills,
  (n, o) => {
    if (n > o) playMonsterDown()
  },
)
watch(
  () => store.player.hp,
  (n, o) => {
    if (n < o) playPlayerHit()
  },
)
watch(
  () => store.potions.length,
  (n, o) => {
    if (n < o) playPickup()
  },
)
watch(
  () => store.toastTimer,
  (n, o) => {
    if (n > o) playLevelUp()
  },
)
watch(
  () => store.phase,
  (n) => {
    if (n === 'gameOver') playGameOver()
  },
)

let rafId = null
let lastTime = 0

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  store.update(dt, buildInput())
  render()

  rafId = requestAnimationFrame(loop)
}

function drawMap(ctx) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      ctx.fillStyle = store.grid[row][col] === 1 ? '#2a2438' : '#443d5c'
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
}

function drawPotions(ctx) {
  ctx.fillStyle = '#ff6b9d'
  for (const p of store.potions) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y - 8)
    ctx.lineTo(p.x + 7, p.y)
    ctx.lineTo(p.x, p.y + 8)
    ctx.lineTo(p.x - 7, p.y)
    ctx.closePath()
    ctx.fill()
  }
}

function drawMonsters(ctx) {
  for (const m of store.monsters) {
    ctx.fillStyle = '#ff6b6b'
    ctx.beginPath()
    ctx.arc(m.x, m.y, 10, 0, Math.PI * 2)
    ctx.fill()

    const barW = 22
    ctx.fillStyle = '#000'
    ctx.fillRect(m.x - barW / 2, m.y - 20, barW, 4)
    ctx.fillStyle = '#4caf50'
    ctx.fillRect(m.x - barW / 2, m.y - 20, barW * (m.hp / m.maxHp), 4)
  }
}

function drawPlayer(ctx) {
  const p = store.player
  ctx.save()
  ctx.globalAlpha = p.invulnTimer > 0 ? 0.55 : 1
  ctx.fillStyle = '#4fd1ff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2)
  ctx.fill()

  const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing]
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(p.x + dirVec[0] * 7, p.y + dirVec[1] * 7, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (p.swingTimer > 0) {
    const w = 24
    const len = 28
    const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.swingFacing]
    const cx = p.x + dv[0] * (len / 2 + 10)
    const cy = p.y + dv[1] * (len / 2 + 10)
    ctx.fillStyle = 'rgba(255, 241, 118, 0.7)'
    ctx.beginPath()
    if (dv[0] !== 0) ctx.roundRect(cx - len / 2, cy - w / 2, len, w, 5)
    else ctx.roundRect(cx - w / 2, cy - len / 2, w, len, 5)
    ctx.fill()
  }
}

function drawHud(ctx) {
  const p = store.player
  const barW = 180
  ctx.fillStyle = '#000'
  ctx.fillRect(10, 10, barW, 16)
  ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#4caf50' : '#e53935'
  ctx.fillRect(10, 10, barW * (p.hp / p.maxHp), 16)
  ctx.strokeStyle = '#fff'
  ctx.strokeRect(10, 10, barW, 16)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`HP ${p.hp}/${p.maxHp}`, 16, 22)

  ctx.textAlign = 'right'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(`ATK ${p.attack}  KILLS ${store.kills}`, STAGE_WIDTH - 10, 24)

  if (store.toastTimer > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffe066'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(store.toast, STAGE_WIDTH / 2, 50)
  }
}

const STORY_LINES = [
  '오랫동안 봉인되어 있던 던전이 다시 열렸다.',
  '마을을 위협하는 몬스터들이 쏟아져 나오고 있다.',
  '마지막 남은 모험가인 당신은 던전 깊숙이 들어가',
  '몬스터들을 물리치고 평화를 되찾아야 한다.',
]

function drawIntro(ctx) {
  ctx.fillStyle = '#0d0a1a'
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 28px sans-serif'
  ctx.fillText('던전의 봉인', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - 90)

  ctx.fillStyle = '#ddd'
  ctx.font = '15px sans-serif'
  STORY_LINES.forEach((line, i) => {
    ctx.fillText(line, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - 30 + i * 24)
  })

  ctx.fillStyle = '#4fd1ff'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('아무 키나 눌러 모험을 시작하세요', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 90)
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  if (store.phase === 'intro') {
    drawIntro(ctx)
    return
  }

  drawMap(ctx)
  drawPotions(ctx)
  drawMonsters(ctx)
  drawPlayer(ctx)
  drawHud(ctx)

  if (store.phase !== 'playing') {
    const ended = store.phase === 'gameOver' || store.phase === 'cleared'
    const boxH = ended ? 104 : 80
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, STAGE_HEIGHT / 2 - boxH / 2, STAGE_WIDTH, boxH)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(store.message, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - boxH / 2 + 34)
    if (ended) {
      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#ffe066'
      ctx.fillText(store.ending, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - boxH / 2 + 58)
      ctx.fillStyle = '#fff'
      ctx.fillText(`KILLS ${store.kills} — 아무 키나 눌러 재시작`, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - boxH / 2 + 82)
    }
  }
}

onMounted(() => {
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
  <div class="rpg-game">
    <canvas ref="canvasRef" :width="STAGE_WIDTH" :height="STAGE_HEIGHT"></canvas>
    <div class="controls">WASD/방향키 이동 · Space/J 공격 · 클리어/게임오버 시 아무 키나 눌러 재시작</div>
  </div>
</template>

<style scoped>
.rpg-game {
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
