import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { parseGrid, canMoveTo, tileCenter } from '../mapUtils'

// Fixed small town layout. '#' = wall, everything else is walkable floor.
// Letters mark where an interactable stands (the tile itself is still floor).
const MAP = [
  '############',
  '#..........#',
  '#.W......H.#',
  '#..........#',
  '#....T.....#',
  '#..........#',
  '#.n......n.#',
  '#....D.....#',
  '#.....e....#',
  '############',
]

export const TILE = 52
export const COLS = MAP[0].length
export const ROWS = MAP.length
export const STAGE_WIDTH = COLS * TILE
export const STAGE_HEIGHT = ROWS * TILE

const grid = parseGrid(MAP)
const PLAYER_START = [1, 1]
const PLAYER_HALF = 12
const PLAYER_SPEED = 130
const DIALOGUE_DURATION = 3.2

const DIALOGUE = {
  weapon: { speaker: '대장장이', text: '이 검을 받아가게! (공격력 +5)' },
  herb: { speaker: '약초상', text: '특제 비약일세, 마셔두게! (최대 체력 +10)' },
  tavern: { speaker: '선술집 주인', text: '던전 가장 깊은 곳에 우두머리가 있다고 하더군...' },
  villager1: { speaker: '마을 사람', text: '요즘 몬스터들이 자꾸 마을 근처를 어슬렁거려요...' },
  villager2: { speaker: '마을 사람', text: '조심하세요, 던전은 위험하다고 들었어요.' },
  elder: { speaker: '촌장', text: '던전의 몬스터를 모두 물리치고 평화를 되찾아주게. 이것이 자네의 임무일세.' },
}

const SPAWN_TYPES = {
  W: 'weapon',
  H: 'herb',
  T: 'tavern',
  n: null, // resolved to villager1/villager2 in order below
  e: 'elder',
  D: 'gate',
}

function buildInteractables() {
  const list = []
  let villagerIndex = 0
  for (let row = 0; row < MAP.length; row++) {
    for (let col = 0; col < MAP[row].length; col++) {
      const ch = MAP[row][col]
      if (!(ch in SPAWN_TYPES)) continue
      let type = SPAWN_TYPES[ch]
      if (ch === 'n') {
        villagerIndex++
        type = `villager${villagerIndex}`
      }
      list.push({ type, ...tileCenter(col, row, TILE), touching: false, visited: false })
    }
  }
  return list
}

export const useTownStore = defineStore('town', () => {
  const phase = ref('intro') // intro | town
  const player = reactive({ x: 0, y: 0, facing: 'down' })
  const interactables = reactive(buildInteractables())

  const quest = ref('')
  const bonusAttack = ref(0)
  const bonusMaxHp = ref(0)

  const dialogueSpeaker = ref('')
  const dialogueText = ref('')
  const dialogueTimer = ref(0)

  function enterTown() {
    const start = tileCenter(...PLAYER_START, TILE)
    player.x = start.x
    player.y = start.y
    player.facing = 'down'
    for (const it of interactables) it.touching = false
  }

  function beginAdventure() {
    phase.value = 'town'
    enterTown()
  }

  function triggerInteraction(item) {
    if (item.type === 'gate') return 'enterDungeon'
    const line = DIALOGUE[item.type]
    dialogueSpeaker.value = line.speaker
    dialogueText.value = line.text
    dialogueTimer.value = DIALOGUE_DURATION
    if (!item.visited) {
      item.visited = true
      if (item.type === 'weapon') bonusAttack.value += 5
      if (item.type === 'herb') bonusMaxHp.value += 10
      if (item.type === 'elder') quest.value = '던전의 몬스터를 모두 처치하라'
    }
    return null
  }

  function update(dt, input) {
    if (phase.value !== 'town') return
    if (dialogueTimer.value > 0) dialogueTimer.value -= dt

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
    if (canMoveTo(grid, COLS, ROWS, TILE, tryX, player.y, PLAYER_HALF)) player.x = tryX
    const tryY = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(grid, COLS, ROWS, TILE, player.x, tryY, PLAYER_HALF)) player.y = tryY

    for (const item of interactables) {
      const overlapping = Math.abs(player.x - item.x) < PLAYER_HALF + 14 && Math.abs(player.y - item.y) < PLAYER_HALF + 14
      if (overlapping && !item.touching) {
        item.touching = true
        if (triggerInteraction(item) === 'enterDungeon') return 'enterDungeon'
      } else if (!overlapping) {
        item.touching = false
      }
    }
    return null
  }

  return {
    grid,
    phase,
    player,
    interactables,
    quest,
    bonusAttack,
    bonusMaxHp,
    dialogueSpeaker,
    dialogueText,
    dialogueTimer,
    beginAdventure,
    enterTown,
    update,
  }
})
