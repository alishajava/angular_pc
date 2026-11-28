<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useVillage2Store, SCENERY2, V2_COLS, V2_ROWS, V2_WIDTH, V2_HEIGHT, TILE } from '../stores/village2'
import { useTownStore } from '../stores/town'
import { useFlowStore } from '../stores/flow'
import { PLAYER_MAX_HP, PLAYER_BASE_ATTACK } from '../stores/rpg'
import { makeTownBackdrop, drawTownLife } from '../scenery'
import { unlockAudio, playPickup, toggleMusic, isMusicEnabled, setMusicTrack } from '../audio'
import { drawHero, drawVillager, drawElder } from '../sprites'
import { wrapText } from '../canvasText'

const store = useVillage2Store()
const town = useTownStore()
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
  if (key === 'p') town.saveProgress()
  if (key === 'l') town.loadProgress()
}
function onKeyUp(e) {
  heldKeys.delete(e.key.toLowerCase())
}
// 창을 벗어나면 눌린 키를 모두 놓은 것으로 처리 (키가 눌린 채로 남아 혼자 걷는 문제 방지)
function onBlur() {
  heldKeys.clear()
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
let animTime = 0
const idleSwing = (seed = 0) => Math.sin(animTime * 2.4 + seed) * 3
const wanderSwing = (seed = 0) => Math.sin(animTime * 6 + seed) * 3
const walkSwing = (moving) => (moving ? Math.sin(animTime * 10) * 3 : idleSwing())

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  animTime += dt
  if (store.dialogueTimer > prevDialogueTimer) playPickup()
  prevDialogueTimer = store.dialogueTimer
  const result = store.update(dt, buildInput())
  if (result === 'enterForest') {
    flow.goToForest('east')
    return
  }
  render()
  rafId = requestAnimationFrame(loop)
}

const TYPE_INFO = {
  sword: { label: '대장장이', outfit: '#c0392b', hair: '#3a2a20' },
  elixir: { label: '연금술사', outfit: '#8e44ad', hair: '#6a3a20' },
  inn: { label: '여관' },
  traveler1: { label: '여행자', outfit: '#3f7f9f', hair: '#2a2a2a' },
  traveler2: { label: '마을 사람', outfit: '#c58a3a', hair: '#5a3a20' },
  elder2: { label: '단풍 이장' },
  westGate: { label: '← 숲길' },
}
const STATIC_TYPES = new Set(['inn', 'westGate'])

// 단풍 느낌: 첫 마을과 같은 그림에 따뜻한 색을 덧입힌다
let backdrop = null
const sceneryInfo = { tile: TILE, scenery: SCENERY2 }
function drawMap(ctx) {
  if (!backdrop) {
    backdrop = makeTownBackdrop({ grid: store.grid, cols: V2_COLS, rows: V2_ROWS, tile: TILE, scenery: SCENERY2 })
    const g = backdrop.getContext('2d')
    g.globalCompositeOperation = 'overlay'
    g.fillStyle = 'rgba(255,140,40,0.5)'
    g.fillRect(0, 0, backdrop.width, backdrop.height)
    g.globalCompositeOperation = 'source-over'
  }
  ctx.drawImage(backdrop, 0, 0)
  drawTownLife(ctx, animTime, sceneryInfo)
  // 떨어지는 단풍잎
  for (let i = 0; i < 18; i++) {
    const x = (i * 97 + animTime * (18 + (i % 4) * 6) + Math.sin(animTime + i) * 20) % V2_WIDTH
    const y = (i * 53 + animTime * (26 + (i % 3) * 8)) % V2_HEIGHT
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(animTime * 1.4 + i)
    ctx.fillStyle = i % 2 ? '#e0602a' : '#e8a030'
    ctx.beginPath()
    ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawLabel(ctx, text, x, y) {
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(20,30,20,0.85)'
  ctx.lineWidth = 3
  ctx.strokeText(text, x, y)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, x, y)
}

function drawInteractables(ctx) {
  store.interactables.forEach((item, idx) => {
    const info = TYPE_INFO[item.type]
    const swing = STATIC_TYPES.has(item.type) ? idleSwing(idx * 1.3) : wanderSwing(idx * 1.3)
    const facing = item.facing === 'left' ? 'left' : 'right'
    if (item.type === 'westGate') {
      // 서쪽 끝 숲길 이정표
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(item.x + 8, item.y + 22, 18, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#6b4a2a'
      ctx.fillRect(item.x + 6, item.y - 34, 6, 56)
      ctx.fillStyle = '#c9a06a'
      ctx.strokeStyle = '#5a3e1b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(item.x - 22, item.y - 46, 62, 20, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#3a2410'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('← 시작의 마을', item.x + 9, item.y - 32)
    } else if (item.type === 'inn') {
      // 건물은 배경에 그려져 있고 이 칸은 여관 입구
    } else if (item.type === 'elder2') drawElder(ctx, item.x, item.y, swing, facing)
    else drawVillager(ctx, item.x, item.y, info.outfit, info.hair, swing, facing)
    drawLabel(ctx, info.label, item.x, item.y + 26)
  })
}

function drawHud(ctx) {
  const shade = ctx.createLinearGradient(0, 0, 0, 46)
  shade.addColorStop(0, 'rgba(40,16,8,0.7)')
  shade.addColorStop(1, 'rgba(40,16,8,0)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, V2_WIDTH, 46)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  const q = store.questText()
  ctx.fillText(q ? `임무: ${q}` : '단풍마을', 10, 20)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd700'
  ctx.fillText(`${town.coins} 코인`, V2_WIDTH - 10, 20)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#fff'
  ctx.fillText(`[I] 스탯 · [M] 음악 ${isMusicEnabled() ? 'ON' : 'OFF'} · [P] 저장 · [L] 불러오기`, V2_WIDTH - 10, 36)

  if (store.dialogueTimer > 0) {
    ctx.textAlign = 'left'
    ctx.font = '13px sans-serif'
    const lines = wrapText(ctx, store.dialogueText, V2_WIDTH - 24)
    const boxH = 32 + lines.length * 18
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, V2_HEIGHT - boxH, V2_WIDTH, boxH)
    ctx.fillStyle = '#ffe066'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(store.dialogueSpeaker, 12, V2_HEIGHT - boxH + 18)
    ctx.fillStyle = '#fff'
    ctx.font = '13px sans-serif'
    lines.forEach((line, i) => ctx.fillText(line, 12, V2_HEIGHT - boxH + 38 + i * 18))
  }
}

function drawStats(ctx) {
  const w = 280
  const h = 190
  const x = (V2_WIDTH - w) / 2
  const y = (V2_HEIGHT - h) / 2
  ctx.fillStyle = 'rgba(10, 10, 20, 0.9)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = '#4fd1ff'
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('모험가 스탯', V2_WIDTH / 2, y + 26)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = '13px sans-serif'
  const lines = [
    `공격력: ${PLAYER_BASE_ATTACK} (+${town.bonusAttack} 보너스) = ${PLAYER_BASE_ATTACK + town.bonusAttack}`,
    `최대 체력: ${PLAYER_MAX_HP} (+${town.bonusMaxHp} 보너스) = ${PLAYER_MAX_HP + town.bonusMaxHp}`,
    `코인: ${town.coins}`,
    `숲길 처치 수: ${town.forestKills}`,
    `동료: ${town.companionJoined ? '히로인과 함께 싸운다' : '없음'}`,
  ]
  lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 56 + i * 22))
  ctx.textAlign = 'center'
  ctx.fillStyle = '#aaa'
  ctx.font = '11px sans-serif'
  ctx.fillText('[I] 닫기', V2_WIDTH / 2, y + h - 12)
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, V2_WIDTH, V2_HEIGHT)
  drawMap(ctx)
  drawInteractables(ctx)
  const p = store.player
  drawHero(ctx, p.x, p.y, p.facing, walkSwing(p.moving))
  drawHud(ctx)
  if (showStats.value) drawStats(ctx)
}

onMounted(() => {
  backdrop = null
  setMusicTrack('town')
  store.enterVillage()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  rafId = requestAnimationFrame(loop)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="village-scene">
    <canvas ref="canvasRef" :width="V2_WIDTH" :height="V2_HEIGHT"></canvas>
    <div class="controls">
      WASD/방향키 이동 · 대장장이·연금술사·이장에게 부딪히면 대화/거래 · 여관에서 저장 · 서쪽 길로 가면 숲길 · I 스탯 · M 음악 · P 저장 · L 불러오기
    </div>
  </div>
</template>

<style scoped>
.village-scene {
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
