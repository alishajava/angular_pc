<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useFightStore, STAGE_WIDTH, STAGE_HEIGHT, BODY_WIDTH, BODY_HEIGHT, GROUND_Y } from '../stores/fight'
import { createAiController } from '../stores/ai'

const store = useFightStore()
const canvasRef = ref(null)
const vsCpu = ref(true)
const aiInput = createAiController()

function setMode(cpu) {
  if (vsCpu.value === cpu) return
  vsCpu.value = cpu
  store.startMatch()
}

const heldKeys = new Set()
const justPressed = new Set()

const KEY_MAP = {
  // player 1
  a: ['p1', 'left'],
  d: ['p1', 'right'],
  w: ['p1', 'jump'],
  s: ['p1', 'block'],
  j: ['p1', 'punch'],
  k: ['p1', 'kick'],
  // player 2
  arrowleft: ['p2', 'left'],
  arrowright: ['p2', 'right'],
  arrowup: ['p2', 'jump'],
  arrowdown: ['p2', 'block'],
  n: ['p2', 'punch'],
  m: ['p2', 'kick'],
}

function onKeyDown(e) {
  const key = e.key.toLowerCase()
  if (KEY_MAP[key]) e.preventDefault()
  if (!heldKeys.has(key)) justPressed.add(key)
  heldKeys.add(key)
  if (key === 'enter' && store.phase === 'matchEnd') {
    store.startMatch()
  }
}

function onKeyUp(e) {
  const key = e.key.toLowerCase()
  heldKeys.delete(key)
}

function buildKeyboardInput() {
  const input = {
    p1: { left: false, right: false, block: false, jumpPressed: false, punchPressed: false, kickPressed: false },
    p2: { left: false, right: false, block: false, jumpPressed: false, punchPressed: false, kickPressed: false },
  }
  for (const [key, [player, action]] of Object.entries(KEY_MAP)) {
    if (action === 'jump' || action === 'punch' || action === 'kick') {
      if (justPressed.has(key)) input[player][`${action}Pressed`] = true
    } else if (heldKeys.has(key)) {
      input[player][action] = true
    }
  }
  justPressed.clear()
  return input
}

let rafId = null
let lastTime = 0

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  const input = buildKeyboardInput()
  if (vsCpu.value) {
    input.p2 = aiInput(dt, store.players[1], store.players[0])
  }
  store.update(dt, input)
  render()

  rafId = requestAnimationFrame(loop)
}

function drawPlayer(ctx, p, color) {
  const left = p.x - BODY_WIDTH / 2
  const top = p.y - BODY_HEIGHT
  const flash = p.action === 'hitstun' && Math.floor(performance.now() / 80) % 2 === 0
  ctx.fillStyle = flash ? '#ffffff' : color
  ctx.beginPath()
  ctx.roundRect(left, top, BODY_WIDTH, BODY_HEIGHT, 10)
  ctx.fill()

  // eye to show facing direction
  ctx.fillStyle = '#ffffff'
  const eyeX = p.x + p.facing * 10
  ctx.beginPath()
  ctx.arc(eyeX, top + 22, 5, 0, Math.PI * 2)
  ctx.fill()

  if (p.action === 'block') {
    ctx.fillStyle = 'rgba(255, 220, 80, 0.85)'
    const shieldX = p.x + p.facing * (BODY_WIDTH / 2 + 4)
    ctx.beginPath()
    ctx.roundRect(shieldX - (p.facing === 1 ? 0 : 10), top + 10, 10, BODY_HEIGHT - 30, 4)
    ctx.fill()
  }

  if (p.action === 'punch' || p.action === 'kick') {
    const elapsed = p.attackTotal - p.actionTimer
    const active = elapsed >= 0.08 && elapsed <= 0.18
    ctx.fillStyle = active ? '#fff176' : 'rgba(255,241,118,0.5)'
    const range = p.action === 'punch' ? 42 : 55
    const limbY = p.action === 'punch' ? top + 30 : top + 65
    const limbH = p.action === 'punch' ? 10 : 14
    const startX = p.x + p.facing * (BODY_WIDTH / 2)
    const w = range
    ctx.beginPath()
    ctx.roundRect(p.facing === 1 ? startX : startX - w, limbY, w, limbH, 5)
    ctx.fill()
  }
}

function drawHpBar(ctx, x, align, hp, maxHp, label, winCount) {
  const barW = 260
  const barH = 22
  const bx = align === 'left' ? x : x - barW
  ctx.fillStyle = '#222'
  ctx.fillRect(bx, 16, barW, barH)
  const ratio = Math.max(0, hp / maxHp)
  const fillColor = ratio > 0.5 ? '#4caf50' : ratio > 0.2 ? '#ffb300' : '#e53935'
  ctx.fillStyle = fillColor
  if (align === 'left') {
    ctx.fillRect(bx + 2, 18, (barW - 4) * ratio, barH - 4)
  } else {
    const w = (barW - 4) * ratio
    ctx.fillRect(bx + barW - 2 - w, 18, w, barH - 4)
  }
  ctx.strokeStyle = '#fff'
  ctx.strokeRect(bx, 16, barW, barH)

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = align === 'left' ? 'left' : 'right'
  ctx.fillText(label, align === 'left' ? bx : bx + barW, 12)

  ctx.textAlign = align
  for (let i = 0; i < 2; i++) {
    const pipX = align === 'left' ? bx + barW + 10 + i * 14 : bx - 10 - i * 14
    ctx.beginPath()
    ctx.arc(pipX, 27, 5, 0, Math.PI * 2)
    ctx.fillStyle = i < winCount ? '#ffd700' : 'rgba(255,255,255,0.25)'
    ctx.fill()
  }
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT)
  gradient.addColorStop(0, '#1b2a4a')
  gradient.addColorStop(1, '#3a5a8a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  ctx.fillStyle = '#2e4b2e'
  ctx.fillRect(0, GROUND_Y, STAGE_WIDTH, STAGE_HEIGHT - GROUND_Y)

  const [p1, p2] = store.players
  drawPlayer(ctx, p1, '#4f8ff7')
  drawPlayer(ctx, p2, '#f75f5f')

  drawHpBar(ctx, 20, 'left', p1.hp, p1.maxHp, 'P1', store.wins[0])
  drawHpBar(ctx, STAGE_WIDTH - 20, 'right', p2.hp, p2.maxHp, 'P2', store.wins[1])

  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(Math.ceil(store.roundTime).toString(), STAGE_WIDTH / 2, 36)

  if (store.phase !== 'fighting') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, STAGE_HEIGHT / 2 - 40, STAGE_WIDTH, 80)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText(store.message, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 10)
    if (store.phase === 'matchEnd') {
      ctx.font = '16px sans-serif'
      ctx.fillText('Press ENTER to play again', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 34)
    }
  }
}

onMounted(() => {
  store.startMatch()
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
  <div class="fight-game">
    <div class="mode-toggle">
      <button type="button" :class="{ active: vsCpu }" @click="setMode(true)">VS 컴퓨터</button>
      <button type="button" :class="{ active: !vsCpu }" @click="setMode(false)">VS 2P</button>
    </div>
    <canvas ref="canvasRef" :width="STAGE_WIDTH" :height="STAGE_HEIGHT"></canvas>
    <div class="controls">
      <div><strong>Player 1</strong>: A/D 이동 · W 점프 · S 막기 · J 펀치 · K 킥</div>
      <div v-if="vsCpu"><strong>Player 2</strong>: 컴퓨터(CPU)가 조작합니다</div>
      <div v-else><strong>Player 2</strong>: ←/→ 이동 · ↑ 점프 · ↓ 막기 · N 펀치 · M 킥</div>
    </div>
  </div>
</template>

<style scoped>
.fight-game {
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
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mode-toggle {
  display: flex;
  gap: 0.5rem;
}

.mode-toggle button {
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid #888;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
}

.mode-toggle button.active {
  background: #4f8ff7;
  border-color: #4f8ff7;
  color: #fff;
}
</style>
