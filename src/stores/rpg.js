import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { parseGrid, canMoveTo as canMoveToTile, tileCenter as tileCenterOf } from '../mapUtils'
import { useTownStore } from './town'

// Fixed small dungeon layout. '#' = wall, '.' = floor.
const MAP = [
  '############',
  '#..........#',
  '#.##.####..#',
  '#.#......#.#',
  '#.#.####.#.#',
  '#...#..#...#',
  '#.###..###.#',
  '#..........#',
  '#.####.##..#',
  '############',
]

export const TILE = 52
export const COLS = MAP[0].length
export const ROWS = MAP.length
export const STAGE_WIDTH = COLS * TILE
export const STAGE_HEIGHT = ROWS * TILE

const grid = parseGrid(MAP)
function tileCenter(col, row) {
  return tileCenterOf(col, row, TILE)
}

const PLAYER_HALF = 12
const PLAYER_SPEED = 130
export const PLAYER_MAX_HP = 30
export const PLAYER_BASE_ATTACK = 8
const ATTACK_COOLDOWN = 0.4
const ATTACK_RANGE = 28
const ATTACK_WIDTH = 24
export const ATTACK_VISUAL_DURATION = 0.22
const INVULN_DURATION = 0.6

const MONSTER_HALF = 10
const MONSTER_SPEED = 65
const MONSTER_DETECT_RADIUS = 160
const MONSTER_CONTACT_COOLDOWN = 0.8
const MONSTER_MAX_HP = 14
const MONSTER_DAMAGE = 6
const POTION_HEAL = 15

// Hand-placed spawn points (col, row) on floor tiles of MAP above.
const MONSTER_SPAWNS = [
  [4, 1],
  [9, 2],
  [2, 5],
  [6, 5],
  [10, 7],
]
const POTION_SPAWNS = [
  [6, 3],
  [3, 7],
]
const PLAYER_START = [1, 1]

export const useRpgStore = defineStore('rpg', () => {
  const player = reactive({
    x: 0,
    y: 0,
    facing: 'down',
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    attack: PLAYER_BASE_ATTACK,
    attackCooldown: 0,
    swingTimer: 0,
    swingFacing: 'down',
    invulnTimer: 0,
  })
  const monsters = reactive([])
  const potions = reactive([])
  const kills = ref(0)
  const phase = ref('ready') // ready | playing | cleared | gameOver
  const message = ref('DUNGEON')
  const phaseTimer = ref(1.0)
  const toast = ref('')
  const toastTimer = ref(0)
  const ending = ref('')

  function startGame() {
    const town = useTownStore()
    const start = tileCenter(...PLAYER_START)
    player.x = start.x
    player.y = start.y
    player.facing = 'down'
    player.maxHp = PLAYER_MAX_HP + town.bonusMaxHp
    player.hp = player.maxHp
    player.attack = PLAYER_BASE_ATTACK + town.bonusAttack
    player.attackCooldown = 0
    player.swingTimer = 0
    player.invulnTimer = 0

    monsters.length = 0
    for (const [col, row] of MONSTER_SPAWNS) {
      const pos = tileCenter(col, row)
      monsters.push({ ...pos, hp: MONSTER_MAX_HP, maxHp: MONSTER_MAX_HP, contactCooldown: 0 })
    }
    potions.length = 0
    for (const [col, row] of POTION_SPAWNS) {
      potions.push(tileCenter(col, row))
    }

    kills.value = 0
    message.value = 'DUNGEON'
    ending.value = ''
    phase.value = 'ready'
    phaseTimer.value = 1.0
  }

  function canMoveTo(x, y, half) {
    return canMoveToTile(grid, COLS, ROWS, TILE, x, y, half)
  }

  function attackHitbox(x, y, facing) {
    const w = ATTACK_WIDTH
    const len = ATTACK_RANGE
    if (facing === 'up') return { x: x - w / 2, y: y - len - PLAYER_HALF, w, h: len }
    if (facing === 'down') return { x: x - w / 2, y: y + PLAYER_HALF, w, h: len }
    if (facing === 'left') return { x: x - len - PLAYER_HALF, y: y - w / 2, w: len, h: w }
    return { x: x + PLAYER_HALF, y: y - w / 2, w: len, h: w }
  }

  function overlapsHitbox(rect, mx, my, half) {
    return mx + half > rect.x && mx - half < rect.x + rect.w && my + half > rect.y && my - half < rect.y + rect.h
  }

  function blockedByMonster(x, y, half) {
    return monsters.some((m) => Math.hypot(x - m.x, y - m.y) < half + MONSTER_HALF)
  }

  function update(dt, input) {
    if (phase.value === 'ready') {
      phaseTimer.value -= dt
      if (phaseTimer.value <= 0) phase.value = 'playing'
      return
    }
    if (phase.value !== 'playing') return

    if (toastTimer.value > 0) toastTimer.value -= dt
    if (player.attackCooldown > 0) player.attackCooldown -= dt
    if (player.swingTimer > 0) player.swingTimer -= dt
    if (player.invulnTimer > 0) player.invulnTimer -= dt

    let dx = 0
    let dy = 0
    if (input.left) dx -= 1
    if (input.right) dx += 1
    if (input.up) dy -= 1
    if (input.down) dy += 1
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2
      dy *= Math.SQRT1_2
    }
    if (dx !== 0 || dy !== 0) {
      player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    }
    const tryX = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(tryX, player.y, PLAYER_HALF) && !blockedByMonster(tryX, player.y, PLAYER_HALF)) player.x = tryX
    const tryY = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(player.x, tryY, PLAYER_HALF) && !blockedByMonster(player.x, tryY, PLAYER_HALF)) player.y = tryY

    if (input.attackPressed && player.attackCooldown <= 0) {
      player.attackCooldown = ATTACK_COOLDOWN
      player.swingTimer = ATTACK_VISUAL_DURATION
      player.swingFacing = player.facing
      const hitbox = attackHitbox(player.x, player.y, player.facing)
      for (let i = monsters.length - 1; i >= 0; i--) {
        const m = monsters[i]
        if (overlapsHitbox(hitbox, m.x, m.y, MONSTER_HALF)) {
          m.hp -= player.attack
          if (m.hp <= 0) {
            kills.value++
            if (kills.value % 3 === 0) {
              player.attack += 1
              toast.value = 'ATTACK UP!'
              toastTimer.value = 1.4
            }
            monsters.splice(i, 1)
          }
        }
      }
    }

    for (const m of monsters) {
      if (m.contactCooldown > 0) m.contactCooldown -= dt
      const mdx = player.x - m.x
      const mdy = player.y - m.y
      const dist = Math.hypot(mdx, mdy)
      if (dist < MONSTER_DETECT_RADIUS && dist > PLAYER_HALF + MONSTER_HALF) {
        const mx = (mdx / dist) * MONSTER_SPEED * dt
        const my = (mdy / dist) * MONSTER_SPEED * dt
        if (canMoveTo(m.x + mx, m.y, MONSTER_HALF)) m.x += mx
        if (canMoveTo(m.x, m.y + my, MONSTER_HALF)) m.y += my
      }
      if (
        player.invulnTimer <= 0 &&
        m.contactCooldown <= 0 &&
        Math.abs(player.x - m.x) < PLAYER_HALF + MONSTER_HALF &&
        Math.abs(player.y - m.y) < PLAYER_HALF + MONSTER_HALF
      ) {
        player.hp = Math.max(0, player.hp - MONSTER_DAMAGE)
        player.invulnTimer = INVULN_DURATION
        m.contactCooldown = MONSTER_CONTACT_COOLDOWN
        if (player.hp <= 0) {
          phase.value = 'gameOver'
          message.value = 'GAME OVER'
          ending.value = '용사는 쓰러졌다... 던전의 어둠은 계속된다.'
          return
        }
      }
    }

    for (let i = potions.length - 1; i >= 0; i--) {
      const p = potions[i]
      if (Math.abs(player.x - p.x) < PLAYER_HALF + 8 && Math.abs(player.y - p.y) < PLAYER_HALF + 8) {
        player.hp = Math.min(player.maxHp, player.hp + POTION_HEAL)
        potions.splice(i, 1)
      }
    }

    if (monsters.length === 0) {
      phase.value = 'cleared'
      message.value = 'DUNGEON CLEARED!'
      ending.value = '던전의 몬스터를 모두 물리쳤다. 마을에 다시 평화가 찾아왔다.'
    }
  }

  return {
    grid,
    player,
    monsters,
    potions,
    kills,
    phase,
    message,
    ending,
    toast,
    toastTimer,
    startGame,
    update,
  }
})
