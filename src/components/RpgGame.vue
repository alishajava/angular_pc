<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRpgStore, TILE, COLS, ROWS, STAGE_WIDTH, STAGE_HEIGHT, WORLD_HEIGHT } from '../stores/rpg'
import { useTownStore } from '../stores/town'
import { useFlowStore } from '../stores/flow'
import { unlockAudio, playAttackSwing, playFireball, playMonsterDown, playPlayerHit, playPickup, playLevelUp, playGameOver, toggleMusic, isMusicEnabled, setMusicTrack } from '../audio'
import { drawHero, drawHeroine, drawMonster, drawBoss, drawSlash, drawFireball, FACE_ANGLE } from '../sprites'
import { makeDungeonBackdrop, drawDungeonLife, drawDungeonDarkness, drawPotion, drawBattleBackdrop } from '../scenery'
import { canMoveTo } from '../mapUtils'

const store = useRpgStore()
const town = useTownStore()
const flow = useFlowStore()
const canvasRef = ref(null)
const showStats = ref(false)

const heldKeys = new Set()

const MOVE_UP = ['w', 'arrowup']
const MOVE_DOWN = ['s', 'arrowdown']
const MOVE_LEFT = ['a', 'arrowleft']
const MOVE_RIGHT = ['d', 'arrowright']
const ATTACK_KEYS = [' ', 'spacebar', 'j']
const FIREBALL_KEYS = ['k']
const FLEE_KEYS = ['r']

function onKeyDown(e) {
  unlockAudio()
  const key = e.key.toLowerCase()
  if ([...MOVE_UP, ...MOVE_DOWN, ...MOVE_LEFT, ...MOVE_RIGHT, ...ATTACK_KEYS, ...FIREBALL_KEYS, ...FLEE_KEYS, 'enter', 'escape'].includes(key)) {
    e.preventDefault()
  }
  if (e.repeat) return // 키를 꾹 눌러도 화면 전환/행동이 반복되지 않게
  heldKeys.add(key)
  if (key === 'i') showStats.value = !showStats.value
  if (key === 'm') toggleMusic()
  if (store.phase === 'gameOver' || store.phase === 'cleared') {
    town.enterTown()
    flow.goToTown()
    return
  }
  if (key === 'escape') {
    if (store.battle.active) return // 전투 중에는 마을로 도망칠 수 없다 (R로 도망)
    town.enterTown()
    flow.goToTown()
    return
  }
  if (store.battle.active && store.battle.turn === 'player') {
    if (ATTACK_KEYS.includes(key)) store.battleAttack()
    else if (FIREBALL_KEYS.includes(key)) store.battleFireball()
    else if (FLEE_KEYS.includes(key)) store.battleFlee()
  }
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

watch(
  () => store.battle.actionId,
  () => {
    if (store.battle.effect === 'attack') playAttackSwing()
    else if (store.battle.effect === 'fireball') playFireball()
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
let animTime = 0

function walkSwing(moving) {
  return moving ? Math.sin(animTime * 10) * 3 : Math.sin(animTime * 2.4) * 3
}

function loop(time) {
  if (!lastTime) lastTime = time
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  animTime += dt

  store.update(dt, buildInput())
  if (store.companion.active && !store.battle.active) updateFollower(dt)
  render()

  rafId = requestAnimationFrame(loop)
}

// Static dungeon (flagstones, brick walls, moss, bones) painted once into an
// offscreen canvas; torch flames are animated on top each frame.
let backdrop = null

function drawMap(ctx) {
  if (!backdrop) backdrop = makeDungeonBackdrop({ grid: store.grid, cols: COLS, rows: ROWS, tile: TILE })
  ctx.drawImage(backdrop.canvas, 0, 0)
  drawDungeonLife(ctx, animTime, backdrop.torches)
}

function drawPotions(ctx) {
  for (const p of store.potions) drawPotion(ctx, p.x, p.y, animTime)
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

// The heroine trails the hero as if on a short leash: she only moves once
// the gap grows past FOLLOW_DIST, so she walks behind you along your path
// and stops a step away when you stop - instead of being glued to a fixed
// offset on top of the hero.
const FOLLOW_DIST = 34
const FOLLOW_SPEED = 240
const FOLLOWER_HALF = 10
const follower = { x: 0, y: 0, facing: 'right', moving: false, ready: false }

function updateFollower(dt) {
  const p = store.player
  let dx = p.x - follower.x
  let dy = p.y - follower.y
  let dist = Math.hypot(dx, dy)
  // first frame, or the hero jumped (new run / returned from elsewhere): snap beside him
  if (!follower.ready || dist > 170) {
    follower.x = p.x
    follower.y = p.y
    follower.ready = true
    follower.moving = false
    return
  }
  follower.moving = false
  if (dist <= FOLLOW_DIST) return
  const step = Math.min(dist - FOLLOW_DIST, FOLLOW_SPEED * dt)
  const sx = (dx / dist) * step
  const sy = (dy / dist) * step
  // slide along walls rather than cutting through corners
  if (canMoveTo(store.grid, COLS, ROWS, TILE, follower.x + sx, follower.y, FOLLOWER_HALF)) follower.x += sx
  if (canMoveTo(store.grid, COLS, ROWS, TILE, follower.x, follower.y + sy, FOLLOWER_HALF)) follower.y += sy
  follower.moving = step > 0.3
  if (Math.abs(dx) > 6) follower.facing = dx > 0 ? 'right' : 'left'
}

function drawPlayer(ctx) {
  const p = store.player
  const swing = walkSwing(p.moving)
  if (!store.companion.active) {
    drawHero(ctx, p.x, p.y, p.facing, swing)
    return
  }
  // while the two are still stacked (start of a run) stand her just beside him
  const stacked = Math.hypot(p.x - follower.x, p.y - follower.y) < 12
  const fx = follower.x + (stacked ? -21 : 0)
  const fy = follower.y + (stacked ? -3 : 0)
  const fswing = follower.moving ? Math.sin(animTime * 10 + 1.6) * 3 : Math.sin(animTime * 2.4 + 1) * 2
  const drawHer = () => drawHeroine(ctx, fx, fy, follower.facing, fswing)
  // whoever stands lower on screen is drawn last, so they overlap correctly
  if (fy > p.y) {
    drawHero(ctx, p.x, p.y, p.facing, swing)
    drawHer()
  } else {
    drawHer()
    drawHero(ctx, p.x, p.y, p.facing, swing)
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

  if (town.quest) {
    ctx.textAlign = 'left'
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#ffe066'
    ctx.fillText(`임무: ${town.quest}`, 16, 38)
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
  ctx.fillText(
    `[I] 스탯 · [M] 음악 ${isMusicEnabled() ? 'ON' : 'OFF'} · [Esc] 마을로`,
    STAGE_WIDTH - 10,
    STAGE_HEIGHT - 10,
  )
}

function drawBattle(ctx) {
  const b = store.battle
  const m = store.monsters[b.monsterIndex]
  if (!m) return
  const p = store.player

  drawBattleBackdrop(ctx, STAGE_WIDTH, STAGE_HEIGHT, animTime)

  // the party stands to the left, facing the monster
  const idle = Math.sin(animTime * 2.4) * 2
  const lunge = b.effectTimer > 0 && b.effect === 'attack' ? 14 : 0
  ctx.save()
  ctx.translate(STAGE_WIDTH * 0.2 + lunge, STAGE_HEIGHT * 0.44)
  ctx.scale(2.2, 2.2)
  drawHero(ctx, 0, 0, 'right', idle)
  ctx.restore()
  if (store.companion.active) {
    ctx.save()
    ctx.translate(STAGE_WIDTH * 0.09, STAGE_HEIGHT * 0.48)
    ctx.scale(2, 2)
    drawHeroine(ctx, 0, 0, 'right', -idle)
    ctx.restore()
  }

  // monster
  const mx = STAGE_WIDTH / 2
  const my = STAGE_HEIGHT * 0.36
  ctx.save()
  ctx.translate(mx, my)
  ctx.scale(m.isBoss ? 2.2 : 1.8, m.isBoss ? 2.2 : 1.8)
  if (m.isBoss) drawBoss(ctx, 0, 0)
  else drawMonster(ctx, 0, 0)
  ctx.restore()

  if (b.effectTimer > 0) {
    if (b.effect === 'attack') drawSlash(ctx, mx, my, FACE_ANGLE.down, 1 - b.effectTimer / 0.3)
    else if (b.effect === 'fireball') drawFireball(ctx, mx, my - 10)
  }

  const barW = m.isBoss ? 160 : 110
  const barY = my - (m.isBoss ? 80 : 60)
  ctx.fillStyle = '#000'
  ctx.fillRect(mx - barW / 2, barY, barW, 10)
  ctx.fillStyle = m.isBoss ? '#d4af37' : '#4caf50'
  ctx.fillRect(mx - barW / 2, barY, barW * Math.max(0, m.hp / m.maxHp), 10)
  ctx.textAlign = 'center'
  ctx.fillStyle = m.isBoss ? '#ffd700' : '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText(m.isBoss ? 'BOSS' : '몬스터', mx, barY - 8)

  // message log
  const logY = STAGE_HEIGHT * 0.58
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(20, logY, STAGE_WIDTH - 40, 46)
  ctx.fillStyle = '#fff'
  ctx.font = '14px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(b.log, STAGE_WIDTH / 2, logY + 28)

  // player hp + commands
  const cmdY = logY + 62
  ctx.fillStyle = '#000'
  ctx.fillRect(20, cmdY, 160, 14)
  ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#4caf50' : '#e53935'
  ctx.fillRect(20, cmdY, 160 * (p.hp / p.maxHp), 14)
  ctx.strokeStyle = '#fff'
  ctx.strokeRect(20, cmdY, 160, 14)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 11px sans-serif'
  ctx.fillText(`용사 HP ${p.hp}/${p.maxHp}`, 24, cmdY + 11)

  if (store.companion.active) {
    ctx.textAlign = 'right'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = '#ff8fb0'
    ctx.fillText('히로인 동행 중', STAGE_WIDTH - 20, cmdY + 11)
  }

  ctx.textAlign = 'center'
  ctx.font = 'bold 14px sans-serif'
  if (b.turn === 'player') {
    ctx.fillStyle = '#4fd1ff'
    ctx.fillText('어떻게 할까?', STAGE_WIDTH / 2, cmdY + 44)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#fff'
    ctx.fillText('[Space] 공격', STAGE_WIDTH / 2, cmdY + 68)
    ctx.fillStyle = b.fireballReady ? '#ff9f43' : '#777'
    ctx.fillText(b.fireballReady ? '[K] 파이어볼' : '[K] 파이어볼 (불가)', STAGE_WIDTH / 2, cmdY + 88)
    ctx.fillStyle = '#fff'
    ctx.fillText('[R] 도망', STAGE_WIDTH / 2, cmdY + 108)
  } else {
    ctx.fillStyle = '#aaa'
    ctx.fillText('...', STAGE_WIDTH / 2, cmdY + 44)
  }
}

function drawStats(ctx) {
  const p = store.player
  const w = 280
  const h = 190
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
    `동료: ${store.companion.active ? '히로인과 함께 싸운다' : '없음'}`,
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

  if (store.battle.active) {
    drawBattle(ctx)
  } else {
    const cameraY = Math.max(0, Math.min(store.player.y - STAGE_HEIGHT / 2, WORLD_HEIGHT - STAGE_HEIGHT))
    ctx.save()
    ctx.translate(0, -cameraY)
    drawMap(ctx)
    drawPotions(ctx)
    drawMonsters(ctx)
    drawPlayer(ctx)
    ctx.restore()
    drawDungeonDarkness(ctx, store.player.x, store.player.y - cameraY, STAGE_WIDTH, STAGE_HEIGHT)
  }

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
      WASD/방향키 이동 · 몬스터와 부딪히면 전투 시작 · 전투 중 Space 공격 · K 파이어볼 · R 도망 · I 스탯 보기 · M 음악 켜기/끄기 · Esc 마을로 돌아가기
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
