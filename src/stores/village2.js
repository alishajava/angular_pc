import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { parseGrid, canMoveTo, tileCenter } from '../mapUtils'
import { useTownStore } from './town'

// 단풍마을: 숲길 동쪽 끝에 있는 두 번째 마을. 첫 마을과 같은 그림 도구를 쓰되 배치·주민·상점이 다르다.
const COLS = 16
const ROWS = 12

function floorRow(markers = {}) {
  const chars = Array(COLS).fill('.')
  chars[0] = '#'
  chars[COLS - 1] = '#'
  for (const [col, ch] of Object.entries(markers)) chars[Number(col)] = ch
  return chars.join('')
}

export const SCENERY2 = {
  smithy: { col: 11, row: 1, w: 3 }, // W: 대장장이 뒤
  herbShop: { col: 2, row: 1, w: 3 }, // H: 연금술사 뒤
  tavern: { col: 9, row: 6, w: 3, h: 2, doorCol: 10, doorRow: 7 }, // 여관
  pond: { col: 3, row: 7, w: 2, h: 2 },
  trees: [
    [6, 5],
    [14, 5],
    [13, 10],
    [2, 10],
    [7, 9],
  ],
  paths: [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => [c, 6]), // 서쪽 숲길 입구에서 마을 한가운데로
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((c) => [c, 2]),
    ...[3, 4, 5].map((r) => [7, r]),
    ...[8, 9].map((r) => [10, r]),
    ...[5, 6, 7, 8, 9, 10, 11, 12, 13].map((c) => [c, 9]),
    [6, 8],
  ],
  lamps: [
    [8.5, 4.5],
    [10.5, 5.5],
    [5.5, 6.8],
    [12.5, 8.8],
  ],
}

function solidTiles() {
  const s = SCENERY2
  const list = []
  for (const b of [s.smithy, s.herbShop]) for (let c = b.col; c < b.col + b.w; c++) list.push([c, b.row])
  for (let r = s.tavern.row; r < s.tavern.row + s.tavern.h; r++) {
    for (let c = s.tavern.col; c < s.tavern.col + s.tavern.w; c++) {
      if (c === s.tavern.doorCol && r === s.tavern.doorRow) continue
      list.push([c, r])
    }
  }
  for (let r = s.pond.row; r < s.pond.row + s.pond.h; r++) for (let c = s.pond.col; c < s.pond.col + s.pond.w; c++) list.push([c, r])
  list.push(...s.trees)
  return list
}

const BASE_MAP = [
  '#'.repeat(COLS),
  floorRow(),
  floorRow({ 3: 'H', 12: 'W' }),
  floorRow(),
  floorRow(),
  floorRow(),
  floorRow({ 0: 'B', 2: 'n' }), // B: 서쪽 숲길로 나가는 길
  floorRow({ 10: 'T' }),
  floorRow({ 6: 'e' }),
  floorRow({ 13: 'n' }),
  floorRow(),
  '#'.repeat(COLS),
]
if (BASE_MAP.length !== ROWS) throw new Error('village2 MAP row count mismatch')

const MAP = (() => {
  const rows = BASE_MAP.map((r) => [...r])
  for (const [c, r] of solidTiles()) {
    if (rows[r][c] !== '.') throw new Error(`village2 scenery overlaps a marker at ${c},${r}`)
    rows[r][c] = '#'
  }
  return rows.map((r) => r.join(''))
})()

export const TILE = 52
export const V2_COLS = COLS
export const V2_ROWS = ROWS
export const V2_WIDTH = COLS * TILE
export const V2_HEIGHT = ROWS * TILE

const grid = parseGrid(MAP)
const PLAYER_HALF = 12
const PLAYER_SPEED = 130
const DIALOGUE_DURATION = 3.4
const PURCHASE_DIALOGUE_DURATION = 4.6
const QUEST_KILLS = 5
const QUEST_REWARD = 60

const PRICES = { sword: 40, elixir: 40 }
const SHOP = {
  sword: { speaker: '대장장이 게일', offer: '단풍마을 특제 강철 검일세! 공격력이 +8 올라간다네.' },
  elixir: { speaker: '연금술사 메리', offer: '숲의 약초로 달인 영약이에요! 최대 체력이 +20 늘어나요.' },
}

const SPAWN_TYPES = { W: 'sword', H: 'elixir', T: 'inn', n: null, e: 'elder2', B: 'westGate' }
const STATIC_TYPES = new Set(['inn', 'westGate'])
const WANDER_RADIUS = 22
const WANDER_SPEED = 0.5

function buildInteractables() {
  const list = []
  let vi = 0
  let seed = 0
  for (let row = 0; row < MAP.length; row++) {
    for (let col = 0; col < MAP[row].length; col++) {
      const ch = MAP[row][col]
      if (!(ch in SPAWN_TYPES)) continue
      let type = SPAWN_TYPES[ch]
      if (ch === 'n') {
        vi++
        type = `traveler${vi}`
      }
      const home = tileCenter(col, row, TILE)
      list.push({
        type,
        x: home.x,
        y: home.y,
        homeX: home.x,
        homeY: home.y,
        wanderAngle: STATIC_TYPES.has(type) ? 0 : seed * 2.1 + 0.7,
        wanderPhase: seed * 1.9,
        facing: 'right',
        touching: false,
      })
      seed++
    }
  }
  return list
}

export const useVillage2Store = defineStore('village2', () => {
  const town = useTownStore()
  const player = reactive({ x: 0, y: 0, facing: 'down', moving: false })
  const interactables = reactive(buildInteractables())
  const dialogueSpeaker = ref('')
  const dialogueText = ref('')
  const dialogueTimer = ref(0)
  const pendingPurchase = ref(null)
  let wanderTime = 0

  function enterVillage() {
    // 서쪽 숲길 입구 바로 안쪽에서 시작
    const start = tileCenter(1, 6, TILE)
    player.x = start.x
    player.y = start.y
    player.facing = 'right'
    dialogueTimer.value = 0
    pendingPurchase.value = null
    for (const it of interactables) it.touching = true
  }

  function say(speaker, text, duration = DIALOGUE_DURATION) {
    dialogueSpeaker.value = speaker
    dialogueText.value = text
    dialogueTimer.value = duration
  }

  function questText() {
    if (town.village2Quest === 'active') {
      const n = Math.min(QUEST_KILLS, town.forestKills - town.village2QuestBase)
      return `숲길의 몬스터를 처치하자 (${n}/${QUEST_KILLS})`
    }
    return ''
  }

  function confirmPurchase() {
    const type = pendingPurchase.value
    if (!type) return
    pendingPurchase.value = null
    const price = PRICES[type]
    if (town.coins < price) {
      say(SHOP[type].speaker, `코인이 부족하구려... (${price}코인 필요, 보유 ${town.coins}코인)`)
      return
    }
    town.coins -= price
    town.bought2[type] = true
    if (type === 'sword') town.bonusAttack += 8
    if (type === 'elixir') town.bonusMaxHp += 20
    say(SHOP[type].speaker, '구매 완료! 숲길 조심하게.')
  }

  function triggerInteraction(item) {
    const t = item.type
    if (t === 'westGate') return 'enterForest'

    if (t === 'sword' || t === 'elixir') {
      if (town.bought2[t]) {
        say(SHOP[t].speaker, '이미 가져가셨잖아요. 또 오세요!')
        return null
      }
      say(SHOP[t].speaker, `${SHOP[t].offer} 가격은 ${PRICES[t]}코인. (보유 ${town.coins}코인) [Enter] 구매`, PURCHASE_DIALOGUE_DURATION)
      pendingPurchase.value = t
      return null
    }

    if (t === 'inn') {
      town.saveProgress()
      say('여관 주인', '먼 길 오셨군요. 푹 쉬고 가세요. (진행 상태가 저장되었습니다)')
      return null
    }

    if (t === 'elder2') {
      if (town.village2Quest === 'none') {
        town.village2Quest = 'active'
        town.village2QuestBase = town.forestKills
        say('단풍 이장', `요즘 숲길에 몬스터가 늘어서 여행자들이 못 다니네. 숲의 몬스터를 ${QUEST_KILLS}마리만 처치해 주게. 사례는 하겠네.`)
        return null
      }
      if (town.village2Quest === 'active') {
        const n = town.forestKills - town.village2QuestBase
        if (n >= QUEST_KILLS) {
          town.village2Quest = 'rewarded'
          town.coins += QUEST_REWARD
          town.bonusAttack += 2
          say('단풍 이장', `해냈구먼! 정말 고맙네. 사례로 ${QUEST_REWARD}코인을 주고, 이 부적도 받게. (공격력 +2)`, 4.6)
        } else {
          say('단풍 이장', `아직이라네. 숲의 몬스터를 ${QUEST_KILLS - n}마리 더 처치해 주게. (${Math.max(0, n)}/${QUEST_KILLS})`)
        }
        return null
      }
      say('단풍 이장', '자네 덕분에 숲길이 한결 안전해졌네. 단풍마을은 언제든 환영일세.')
      return null
    }

    if (t === 'traveler1') say('여행자', '숲길의 늑대는 빠르고 아파요. 슬라임은 약하니 파이어볼로 한 방이에요!')
    else if (t === 'traveler2') say('마을 사람', '단풍이 물드는 철이면 마을이 온통 붉어져요. 첫 마을에서 오셨나요? 던전 소문은 여기까지 들려요.')
    return null
  }

  function update(dt, input) {
    if (dialogueTimer.value > 0) {
      dialogueTimer.value -= dt
      if (dialogueTimer.value <= 0) pendingPurchase.value = null
    }
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
    player.moving = dx !== 0 || dy !== 0
    if (player.moving) player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    const tx = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(grid, COLS, ROWS, TILE, tx, player.y, PLAYER_HALF)) player.x = tx
    const ty = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(grid, COLS, ROWS, TILE, player.x, ty, PLAYER_HALF)) player.y = ty

    wanderTime += dt
    for (const item of interactables) {
      if (!STATIC_TYPES.has(item.type)) {
        const t = wanderTime * WANDER_SPEED + item.wanderPhase
        const nx = item.homeX + Math.cos(item.wanderAngle) * WANDER_RADIUS * Math.sin(t)
        const ny = item.homeY + Math.sin(item.wanderAngle) * WANDER_RADIUS * Math.sin(t)
        if (nx > item.x + 0.05) item.facing = 'right'
        else if (nx < item.x - 0.05) item.facing = 'left'
        item.x = nx
        item.y = ny
      }
      const overlapping = Math.abs(player.x - item.x) < PLAYER_HALF + 14 && Math.abs(player.y - item.y) < PLAYER_HALF + 14
      if (overlapping && !item.touching) {
        item.touching = true
        const result = triggerInteraction(item)
        if (result === 'enterForest') return result
      } else if (!overlapping) {
        item.touching = false
      }
    }
    return null
  }

  return {
    grid,
    player,
    interactables,
    dialogueSpeaker,
    dialogueText,
    dialogueTimer,
    pendingPurchase,
    questText,
    enterVillage,
    confirmPurchase,
    update,
  }
})
