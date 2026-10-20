<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useTavernStore, TILE, COLS, ROWS, STAGE_WIDTH, STAGE_HEIGHT } from '../stores/tavern'
import { useFlowStore } from '../stores/flow'
import { unlockAudio, playPickup, setMusicTrack } from '../audio'
import { drawHero, drawVillager } from '../sprites'
import { wrapText } from '../canvasText'

const store = useTavernStore()
const flow = useFlowStore()
const canvasRef = ref(null)

const heldKeys = new Set()
const MOVE_UP = ['w', 'arrowup']
const MOVE_DOWN = ['s', 'arrowdown']
const MOVE_LEFT = ['a', 'arrowleft']
const MOVE_RIGHT = ['d', 'arrowright']
const ADVANCE_KEYS = [' ', 'spacebar', 'enter', 'j']

function onKeyDown(e) {
  unlockAudio()
  const key = e.key.toLowerCase()
  if ([...MOVE_UP, ...MOVE_DOWN, ...MOVE_LEFT, ...MOVE_RIGHT, ...ADVANCE_KEYS].includes(key)) e.preventDefault()
  heldKeys.add(key)
  if (store.conversation && ADVANCE_KEYS.includes(key)) store.advanceConversation()
}

function onKeyUp(e) {
  heldKeys.delete(e.key.toLowerCase())
}

function buildInput() {
  return {
    up: MOVE_UP.some((k) => heldKeys.has(k)),
    down: MOVE_DOWN.some((k) => heldKeys.has(k)),
    left: MOVE_LEFT.some((k) => heldKeys.has(k)),
    right: MOVE_RIGHT.some((k) => heldKeys.has(k)),
  }
}

let rafId = null
let lastTime = 0
let wasTalking = false
let animTime = 0

function idleSwing(seed = 0) {
  return Math.sin(animTime * 2 + seed) * 1.8
}

function walkSwing(moving) {
  return moving ? Math.sin(animTime * 10) * 3 : idleSwing()
}

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  animTime += dt

  const result = store.update(dt, buildInput())
  if (store.conversation && !wasTalking) playPickup()
  wasTalking = !!store.conversation
  if (result === 'exit') flow.goToTown()

  render()
  rafId = requestAnimationFrame(loop)
}

function drawMap(ctx) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      ctx.fillStyle = store.grid[row][col] === 1 ? '#2b1d12' : '#6b4a2f'
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
  // door marker
  ctx.fillStyle = 'rgba(255, 224, 102, 0.35)'
  ctx.fillRect(store.door.x - TILE / 2, store.door.y - TILE / 2, TILE, TILE)
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('출구', store.door.x, store.door.y + 4)
}

function drawPlayer(ctx) {
  drawHero(ctx, store.player.x, store.player.y, store.player.facing, walkSwing(store.player.moving))
}

function drawConversation(ctx) {
  const convo = store.conversation
  if (!convo) return
  const h = 120
  const y = STAGE_HEIGHT - h

  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.fillRect(0, y, STAGE_WIDTH, h)

  // portrait
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.roundRect(12, y + 12, 64, 64, 8)
  ctx.fill()
  ctx.translate(44, y + 50)
  ctx.scale(1.4, 1.4)
  drawVillager(ctx, 0, 0, '#9b59b6')
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(convo.speaker, 90, y + 30)

  ctx.fillStyle = '#fff'
  ctx.font = '13px sans-serif'
  const lines = wrapText(ctx, convo.lines[convo.index], STAGE_WIDTH - 102)
  lines.forEach((line, i) => ctx.fillText(line, 90, y + 50 + i * 18))

  ctx.textAlign = 'right'
  ctx.fillStyle = '#aaa'
  ctx.font = '11px sans-serif'
  ctx.fillText('[Space] 계속', STAGE_WIDTH - 12, y + h - 10)
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)

  drawMap(ctx)
  drawVillager(ctx, store.npc.x, store.npc.y, '#9b59b6', undefined, idleSwing())
  drawPlayer(ctx)
  drawConversation(ctx)
}

onMounted(() => {
  store.enterTavern()
  setMusicTrack('town')
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
  <div class="tavern-scene">
    <canvas ref="canvasRef" :width="STAGE_WIDTH" :height="STAGE_HEIGHT"></canvas>
    <div class="controls">WASD/방향키 이동 · 주인에게 부딪히면 대화 · Space로 대화 계속 · 출구로 가면 마을로</div>
  </div>
</template>

<style scoped>
.tavern-scene {
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
