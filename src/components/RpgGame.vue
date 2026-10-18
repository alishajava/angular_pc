<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRpgStore, TILE, COLS, ROWS, STAGE_WIDTH, STAGE_HEIGHT, WORLD_HEIGHT, ATTACK_VISUAL_DURATION } from '../stores/rpg'
import { useTownStore } from '../stores/town'
import { useFlowStore } from '../stores/flow'
import { unlockAudio, playAttackSwing, playFireball, playMonsterDown, playPlayerHit, playPickup, playLevelUp, playGameOver, toggleMusic, isMusicEnabled, setMusicTrack } from '../audio'
import { drawHero, drawMonster, drawBoss, drawSlash, drawFireball, FACE_ANGLE } from '../sprites'

const store = useRpgStore()
const town = useTownStore()
const flow = useFlowStore()
const canvasRef = ref(null)
const showStats = ref(false)

const heldKeys = new Set()
const justPressed = new Set()

const MOVE_UP = ['w', 'arrowup']
const MOVE_DOWN = ['s', 'arrowdown']
const MOVE_LEFT = ['a', 'arrowleft']
const MOVE_RIGHT = ['d', 'arrowright']
const ATTACK_KEYS = [' ', 'spacebar', 'j']
const FIREBALL_KEYS = ['k']

function onKeyDown(e) {
  unlockAudio()
  const key = e.key.toLowerCase()
  if ([...MOVE_UP, ...MOVE_DOWN, ...MOVE_LEFT, ...MOVE_RIGHT, ...ATTACK_KEYS, ...FIREBALL_KEYS, 'enter'].includes(key)) {
    e.preventDefault()
  }
  if (!heldKeys.has(key)) justPressed.add(key)
  heldKeys.add(key)
  if (key === 'i') showStats.value = !showStats.value
  if (key === 'm') toggleMusic()
  if (store.phase === 'gameOver' || store.phase === 'cleared') {
    town.enterTown()
    flow.goToTown()
    return
  }
}

function onKeyUp(e) {
  heldKeys.delete(e.key.toLowerCase())
}

function buildInput() {
  const attackPressed = ATTACK_KEYS.some((k) => justPressed.has(k))
  const fireballPressed = FIREBALL_KEYS.some((k) => justPressed.has(k))
  justPressed.clear()
  return {
    up: MOVE_UP.some((k) => heldKeys.has(k)),
    down: MOVE_DOWN.some((k) => heldKeys.has(k)),
    left: MOVE_LEFT.some((k) => heldKeys.has(k)),
    right: MOVE_RIGHT.some((k) => heldKeys.has(k)),
    attackPressed,
    fireballPressed,
  }
}

watch(
  () => store.player.swingTimer,
  (n, o) => {
    if (n > o) playAttackSwing()
  },
)
watch(
  () => store.player.fireballCooldown,
  (n, o) => {
    if (n > o) playFireball()
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
    if (m.isBoss) drawBoss(ctx, m.x, m.y)
    else drawMonster(ctx, m.x, m.y)

    const barW = m.isBoss ? 40 : 22
    const barY = m.isBoss ? -34 : -20
    ctx.fillStyle = '#000'
    ctx.fillRect(m.x - barW / 2, m.y + barY, barW, 4)
    ctx.fillStyle = m.isBoss ? '#d4af37' : '#4caf50'
    ctx.fillRect(m.x - barW / 2, m.y + barY, barW * (m.hp / m.maxHp), 4)
    if (m.isBoss) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffd700'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('BOSS', m.x, m.y + barY - 4)
    }
  }
}

function drawPlayer(ctx) {
  const p = store.player
  ctx.save()
  ctx.globalAlpha = p.invulnTimer > 0 ? 0.55 : 1
  drawHero(ctx, p.x, p.y, p.facing)
  ctx.restore()

  if (p.swingTimer > 0) {
    const progress = 1 - p.swingTimer / ATTACK_VISUAL_DURATION
    drawSlash(ctx, p.x, p.y, FACE_ANGLE[p.swingFacing], progress)
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
  ctx.font = 'bold 13px sans-serif'
  ctx.fillStyle = '#ffd700'
  ctx.fillText(`${town.coins} 코인`, STAGE_WIDTH - 10, 40)

  ctx.textAlign = 'left'
  ctx.font = '11px sans-serif'
  ctx.fillStyle = p.fireballCooldown <= 0 ? '#ff9f43' : '#777'
  ctx.fillText(
    p.fireballCooldown <= 0 ? '[K] 파이어볼 준비' : `[K] 파이어볼 ${p.fireballCooldown.toFixed(1)}s`,
    16,
    38,
  )

  if (town.quest) {
    ctx.textAlign = 'left'
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#ffe066'
    ctx.fillText(`임무: ${town.quest}`, 16, 54)
  }

  if (store.toastTimer > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffe066'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(store.toast, STAGE_WIDTH / 2, 50)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = '#aaa'
  ctx.font = '11px sans-serif'
  ctx.fillText(`[I] 스탯 보기 · [M] 음악 ${isMusicEnabled() ? 'ON' : 'OFF'}`, STAGE_WIDTH - 10, STAGE_HEIGHT - 10)
}

function drawStats(ctx) {
  const p = store.player
  const w = 280
  const h = 170
  const x = (STAGE_WIDTH - w) / 2
  const y = (STAGE_HEIGHT - h) / 2

  ctx.fillStyle = 'rgba(10, 10, 20, 0.9)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = '#4fd1ff'
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('모험가 스탯', STAGE_WIDTH / 2, y + 26)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = '13px sans-serif'
  const lines = [
    `체력: ${p.hp} / ${p.maxHp}`,
    `공격력: ${p.attack} (마을 보너스 +${town.bonusAttack})`,
    `처치 수: ${store.kills}`,
    `코인: ${town.coins}`,
    `임무: ${town.quest || '없음'}`,
  ]
  lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 52 + i * 22))

  ctx.textAlign = 'center'
  ctx.fillStyle = '#aaa'
  ctx.font = '11px sans-serif'
  ctx.fillText('[I] 닫기', STAGE_WIDTH / 2, y + h - 12)
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  const cameraY = Math.max(0, Math.min(store.player.y - STAGE_HEIGHT / 2, WORLD_HEIGHT - STAGE_HEIGHT))

  ctx.save()
  ctx.translate(0, -cameraY)
  drawMap(ctx)
  drawPotions(ctx)
  drawMonsters(ctx)
  for (const f of store.fireballs) drawFireball(ctx, f.x, f.y)
  drawPlayer(ctx)
  ctx.restore()

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
      ctx.fillText(`KILLS ${store.kills} — 아무 키나 눌러 마을로`, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - boxH / 2 + 82)
    }
  }

  if (showStats.value) drawStats(ctx)
}

onMounted(() => {
  store.startGame()
  setMusicTrack('dungeon')
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
    <div class="controls">
      WASD/방향키 이동 · Space/J 공격 · K 파이어볼 · I 스탯 보기 · M 음악 켜기/끄기 · 클리어/게임오버 시 아무 키나 눌러 마을로
    </div>
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
