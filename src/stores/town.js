import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { parseGrid, canMoveTo, tileCenter } from '../mapUtils'
import { writeSave, readSave } from '../save'

// Fixed small town layout. '#' = wall, everything else is walkable floor.
// Letters mark where an interactable stands (the tile itself is still floor).
const MAP = [
  '############',
  '#..........#',
  '#.W......H.#',
  '#.......R..#',
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
const PURCHASE_DIALOGUE_DURATION = 4.5

export const STARTING_COINS = 20
export const QUEST_REWARD = 50

const SHOP_PRICES = { weapon: 15, herb: 15 }

const DIALOGUE = {
  weapon: { speaker: '대장장이', offer: '이 검을 받아가게! 공격력이 +5 올라간다네.' },
  herb: { speaker: '약초상', offer: '특제 비약일세! 최대 체력이 +10 늘어난다네.' },
  villager1: { speaker: '마을 사람', text: '요즘 몬스터들이 자꾸 마을 근처를 어슬렁거려요...' },
  villager2: { speaker: '마을 사람', text: '조심하세요, 던전은 위험하다고 들었어요.' },
  elder: { speaker: '촌장', text: '던전의 몬스터를 모두 물리치고 평화를 되찾아주게. 이것이 자네의 임무일세.' },
  heroine: {
    speaker: '히로인',
    join: '혼자 가기엔 위험해요. 제가 함께 싸워드릴게요!',
    idle: '언제든 준비됐어요. 같이 가요!',
  },
}

const SPAWN_TYPES = {
  W: 'weapon',
  H: 'herb',
  T: 'tavern',
  n: null, // resolved to villager1/villager2 in order below
  e: 'elder',
  D: 'gate',
  R: 'heroine',
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
  const player = reactive({ x: 0, y: 0, facing: 'down', moving: false })
  const interactables = reactive(buildInteractables())

  const coins = ref(STARTING_COINS)
  const quest = ref('')
  const questDone = ref(false)
  const questRewarded = ref(false)
  const bonusAttack = ref(0)
  const bonusMaxHp = ref(0)
  const companionJoined = ref(false)

  const dialogueSpeaker = ref('')
  const dialogueText = ref('')
  const dialogueTimer = ref(0)
  const pendingPurchase = ref(null) // 'weapon' | 'herb' | null

  function enterTown() {
    const start = tileCenter(...PLAYER_START, TILE)
    player.x = start.x
    player.y = start.y
    player.facing = 'down'
    dialogueTimer.value = 0
    pendingPurchase.value = null
    for (const it of interactables) it.touching = false
  }

  function beginAdventure() {
    phase.value = 'town'
    enterTown()
  }

  function addCoins(amount) {
    coins.value += amount
  }

  function saveProgress() {
    const visitedTypes = interactables.filter((it) => it.visited).map((it) => it.type)
    const ok = writeSave({
      coins: coins.value,
      bonusAttack: bonusAttack.value,
      bonusMaxHp: bonusMaxHp.value,
      quest: quest.value,
      questDone: questDone.value,
      questRewarded: questRewarded.value,
      companionJoined: companionJoined.value,
      visitedTypes,
    })
    dialogueSpeaker.value = '시스템'
    dialogueText.value = ok ? '진행 상태를 저장했습니다.' : '저장에 실패했습니다.'
    dialogueTimer.value = DIALOGUE_DURATION
  }

  function loadProgress() {
    const data = readSave()
    if (!data) {
      dialogueSpeaker.value = '시스템'
      dialogueText.value = '저장된 데이터가 없습니다.'
      dialogueTimer.value = DIALOGUE_DURATION
      return false
    }
    coins.value = data.coins ?? STARTING_COINS
    bonusAttack.value = data.bonusAttack ?? 0
    bonusMaxHp.value = data.bonusMaxHp ?? 0
    quest.value = data.quest ?? ''
    questDone.value = !!data.questDone
    questRewarded.value = !!data.questRewarded
    companionJoined.value = !!data.companionJoined
    for (const it of interactables) {
      it.visited = (data.visitedTypes || []).includes(it.type)
    }
    if (phase.value === 'intro') beginAdventure()
    dialogueSpeaker.value = '시스템'
    dialogueText.value = '진행 상태를 불러왔습니다.'
    dialogueTimer.value = DIALOGUE_DURATION
    return true
  }

  function completeQuest() {
    if (!quest.value) return
    questDone.value = true
    quest.value = '완료: 던전의 몬스터를 모두 처치했다 (촌장에게 알리러 가자)'
  }

  function confirmPurchase() {
    const type = pendingPurchase.value
    if (!type) return
    pendingPurchase.value = null
    const price = SHOP_PRICES[type]
    const item = interactables.find((it) => it.type === type)
    if (coins.value < price) {
      dialogueText.value = `코인이 부족하다네... (${price}코인 필요, 보유 ${coins.value}코인)`
      dialogueTimer.value = DIALOGUE_DURATION
      return
    }
    coins.value -= price
    item.visited = true
    if (type === 'weapon') bonusAttack.value += 5
    if (type === 'herb') bonusMaxHp.value += 10
    dialogueSpeaker.value = DIALOGUE[type].speaker
    dialogueText.value = '구매 완료! 고맙네.'
    dialogueTimer.value = DIALOGUE_DURATION
  }

  function triggerInteraction(item) {
    if (item.type === 'gate') return 'enterDungeon'
    if (item.type === 'tavern') return 'enterTavern'

    if (item.type === 'elder') {
      if (questDone.value && !questRewarded.value) {
        questRewarded.value = true
        coins.value += QUEST_REWARD
        dialogueSpeaker.value = '촌장'
        dialogueText.value = `정말 고맙네! 포상으로 ${QUEST_REWARD}코인을 주겠네. 자네는 진정한 영웅일세.`
        dialogueTimer.value = DIALOGUE_DURATION
        quest.value = ''
        return null
      }
      if (questRewarded.value) {
        dialogueSpeaker.value = '촌장'
        dialogueText.value = '수고했네, 모험가 양반. 마을에 평화가 찾아왔어.'
        dialogueTimer.value = DIALOGUE_DURATION
        return null
      }
    }

    if (item.type === 'heroine') {
      dialogueSpeaker.value = DIALOGUE.heroine.speaker
      if (!companionJoined.value) {
        companionJoined.value = true
        dialogueText.value = DIALOGUE.heroine.join
      } else {
        dialogueText.value = DIALOGUE.heroine.idle
      }
      dialogueTimer.value = DIALOGUE_DURATION
      return null
    }

    if (item.type === 'weapon' || item.type === 'herb') {
      if (item.visited) {
        dialogueSpeaker.value = DIALOGUE[item.type].speaker
        dialogueText.value = '이미 구매했다네. 또 올 텐가?'
        dialogueTimer.value = DIALOGUE_DURATION
        return null
      }
      const price = SHOP_PRICES[item.type]
      dialogueSpeaker.value = DIALOGUE[item.type].speaker
      dialogueText.value = `${DIALOGUE[item.type].offer} 가격은 ${price}코인일세. (보유 ${coins.value}코인) [Enter] 구매`
      dialogueTimer.value = PURCHASE_DIALOGUE_DURATION
      pendingPurchase.value = item.type
      return null
    }

    const line = DIALOGUE[item.type]
    dialogueSpeaker.value = line.speaker
    dialogueText.value = line.text
    dialogueTimer.value = DIALOGUE_DURATION
    return null
  }

  function update(dt, input) {
    if (phase.value !== 'town') return
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
    if (player.moving) {
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
        const result = triggerInteraction(item)
        if (result === 'enterDungeon' || result === 'enterTavern') return result
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
    coins,
    quest,
    questDone,
    bonusAttack,
    bonusMaxHp,
    companionJoined,
    dialogueSpeaker,
    dialogueText,
    dialogueTimer,
    pendingPurchase,
    beginAdventure,
    enterTown,
    addCoins,
    completeQuest,
    confirmPurchase,
    saveProgress,
    loadProgress,
    update,
  }
})
