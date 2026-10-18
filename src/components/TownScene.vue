<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useTownStore, TILE, COLS, ROWS, STAGE_WIDTH, STAGE_HEIGHT } from '../stores/town'
import { useFlowStore } from '../stores/flow'
import { unlockAudio, playPickup } from '../audio'

const store = useTownStore()
const flow = useFlowStore()
const canvasRef = ref(null)

const heldKeys = new Set()

const MOVE_UP = ['w', 'arrowup']
const MOVE_DOWN = ['s', 'arrowdown']
const MOVE_LEFT = ['a', 'arrowleft']
const MOVE_RIGHT = ['d', 'arrowright']

function onKeyDown(e) {
  unlockAudio()
  const key = e.key.toLowerCase()
  if ([...MOVE_UP, ...MOVE_DOWN, ...MOVE_LEFT, ...MOVE_RIGHT].includes(key)) e.preventDefault()
  heldKeys.add(key)
  if (store.phase === 'intro') store.beginAdventure()
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
let prevDialogueTimer = 0

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time

  if (store.dialogueTimer > prevDialogueTimer) playPickup()
  prevDialogueTimer = store.dialogueTimer

  const result = store.update(dt, buildInput())
  if (result === 'enterDungeon') flow.goToDungeon()
  render()

  rafId = requestAnimationFrame(loop)
}

const TYPE_LABEL = {
  weapon: ['W', '#e67e22'],
  herb: ['H', '#2ecc71'],
  tavern: ['T', '#9b59b6'],
  villager1: ['N', '#95a5a6'],
  villager2: ['N', '#95a5a6'],
  elder: ['E', '#f1c40f'],
  gate: ['▼', '#4fd1ff'],
}

function drawMap(ctx) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      ctx.fillStyle = store.grid[row][col] === 1 ? '#263326' : '#3d5a3d'
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE)
    }
  }
}

function drawInteractables(ctx) {
  for (const item of store.interactables) {
    const [label, color] = TYPE_LABEL[item.type]
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(item.x - 14, item.y - 14, 28, 28, 6)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, item.x, item.y + 5)
  }
}

function drawPlayer(ctx) {
  const p = store.player
  ctx.fillStyle = '#4fd1ff'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2)
  ctx.fill()
  const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing]
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(p.x + dv[0] * 7, p.y + dv[1] * 7, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawHud(ctx) {
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(store.quest ? `임무: ${store.quest}` : '마을을 둘러보세요', 10, 20)

  if (store.dialogueTimer > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, STAGE_HEIGHT - 56, STAGE_WIDTH, 56)
    ctx.fillStyle = '#ffe066'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(store.dialogueSpeaker, 12, STAGE_HEIGHT - 34)
    ctx.fillStyle = '#fff'
    ctx.font = '13px sans-serif'
    ctx.fillText(store.dialogueText, 12, STAGE_HEIGHT - 14)
  }
}

const STORY_LINES = [
  '오랫동안 봉인되어 있던 던전이 다시 열렸다.',
  '마을을 위협하는 몬스터들이 쏟아져 나오고 있다.',
  '마지막 남은 모험가인 당신은 던전으로 떠나기 전,',
  '마을에서 장비를 갖추고 사람들의 이야기를 들어본다.',
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
  ctx.fillText('아무 키나 눌러 시작하세요', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 90)
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
  drawInteractables(ctx)
  drawPlayer(ctx)
  drawHud(ctx)
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
  <div class="town-scene">
    <canvas ref="canvasRef" :width="STAGE_WIDTH" :height="STAGE_HEIGHT"></canvas>
    <div class="controls">
      WASD/방향키 이동 · 상점(W/H/T)·주민(N)·촌장(E)에 부딪히면 대화 · 던전 입구(▼)로 가면 입장
    </div>
  </div>
</template>

<style scoped>
.town-scene {
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
  text-align: center;
}
</style>
