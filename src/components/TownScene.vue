<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useTownStore, TILE, COLS, ROWS, STAGE_WIDTH, STAGE_HEIGHT } from '../stores/town'
import { useFlowStore } from '../stores/flow'
import { PLAYER_MAX_HP, PLAYER_BASE_ATTACK } from '../stores/rpg'
import { unlockAudio, playPickup, toggleMusic, isMusicEnabled, setMusicTrack } from '../audio'
import { drawHero, drawVillager, drawElder, drawGate } from '../sprites'
import { wrapText } from '../canvasText'
import { hasSave } from '../save'

const store = useTownStore()
const flow = useFlowStore()
const canvasRef = ref(null)
const showStats = ref(false)

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
  if (key === 'i') showStats.value = !showStats.value
  if (key === 'm') toggleMusic()
  if (key === 'enter' && store.pendingPurchase) store.confirmPurchase()
  if (key === 'p' && store.phase === 'town') store.saveProgress()
  if (key === 'l') store.loadProgress()
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
  else if (result === 'enterTavern') flow.goToTavern()
  render()

  rafId = requestAnimationFrame(loop)
}

const TYPE_INFO = {
  weapon: { label: '대장장이', outfit: '#e67e22' },
  herb: { label: '약초상', outfit: '#2ecc71' },
  tavern: { label: '선술집', outfit: '#9b59b6' },
  villager1: { label: '마을 사람', outfit: '#8c9bab', hair: '#3a2f20' },
  villager2: { label: '마을 사람', outfit: '#b08968', hair: '#1c1c1c' },
  elder: { label: '촌장' },
  gate: { label: '던전 입구' },
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
    const info = TYPE_INFO[item.type]
    if (item.type === 'gate') drawGate(ctx, item.x, item.y)
    else if (item.type === 'elder') drawElder(ctx, item.x, item.y)
    else drawVillager(ctx, item.x, item.y, info.outfit, info.hair)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(info.label, item.x, item.y + 26)
  }
}

function drawPlayer(ctx) {
  const p = store.player
  drawHero(ctx, p.x, p.y, p.facing)
}

function drawHud(ctx) {
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(store.quest ? `임무: ${store.quest}` : '마을을 둘러보세요', 10, 20)
  ctx.textAlign = 'right'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillStyle = '#ffd700'
  ctx.fillText(`${store.coins} 코인`, STAGE_WIDTH - 10, 20)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(`[I] 스탯 · [M] 음악 ${isMusicEnabled() ? 'ON' : 'OFF'} · [P] 저장 · [L] 불러오기`, STAGE_WIDTH - 10, 36)

  if (store.dialogueTimer > 0) {
    ctx.textAlign = 'left'
    ctx.font = '13px sans-serif'
    const lines = wrapText(ctx, store.dialogueText, STAGE_WIDTH - 24)
    const boxH = 32 + lines.length * 18
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, STAGE_HEIGHT - boxH, STAGE_WIDTH, boxH)
    ctx.fillStyle = '#ffe066'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(store.dialogueSpeaker, 12, STAGE_HEIGHT - boxH + 18)
    ctx.fillStyle = '#fff'
    ctx.font = '13px sans-serif'
    lines.forEach((line, i) => ctx.fillText(line, 12, STAGE_HEIGHT - boxH + 38 + i * 18))
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

  if (hasSave()) {
    ctx.fillStyle = '#ffe066'
    ctx.font = '13px sans-serif'
    ctx.fillText('[L] 저장된 모험 불러오기', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 120)
  }
}

function drawStats(ctx) {
  const totalAttack = PLAYER_BASE_ATTACK + store.bonusAttack
  const totalMaxHp = PLAYER_MAX_HP + store.bonusMaxHp
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
    `공격력: ${PLAYER_BASE_ATTACK} (+${store.bonusAttack} 보너스) = ${totalAttack}`,
    `최대 체력: ${PLAYER_MAX_HP} (+${store.bonusMaxHp} 보너스) = ${totalMaxHp}`,
    `코인: ${store.coins}`,
    `임무: ${store.quest || '아직 없음 (촌장에게 말을 걸어보세요)'}`,
  ]
  lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 56 + i * 22))

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

  if (store.phase === 'intro') {
    drawIntro(ctx)
    return
  }

  drawMap(ctx)
  drawInteractables(ctx)
  drawPlayer(ctx)
  drawHud(ctx)
  if (showStats.value) drawStats(ctx)
}

onMounted(() => {
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
  <div class="town-scene">
    <canvas ref="canvasRef" :width="STAGE_WIDTH" :height="STAGE_HEIGHT"></canvas>
    <div class="controls">
      WASD/방향키 이동 · 상점 주인·마을 사람·촌장에게 부딪히면 대화 · 선술집은 안으로 입장 · 던전 입구로 가면 입장 · I 스탯 보기 · M 음악 켜기/끄기 · P 저장 · L 불러오기
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
