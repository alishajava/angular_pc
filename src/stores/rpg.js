import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { parseGrid, canMoveTo as canMoveToTile, tileCenter as tileCenterOf } from '../mapUtils'
import { useTownStore } from './town'

// One continuous dungeon made of 3 connected maze sections, stacked
// vertically and joined by a single-tile gap in the shared border row.
// '#' = wall, '.' = floor.
const SECTION = [
  '#..........#',
  '#.##.####..#',
  '#.#......#.#',
  '#.#.####.#.#',
  '#...#..#...#',
  '#.###..###.#',
  '#..........#',
  '#.####.##..#',
]

const MAP = [
  '############', // section 1 top (outer wall)
  ...SECTION,
  '#.##########', // section 1 bottom, gap at col 1 leads down
  '#.##########', // section 2 top, gap at col 1
  ...SECTION,
  '#.##########', // section 2 bottom, gap at col 1 leads down
  '#.##########', // section 3 top, gap at col 1
  ...SECTION,
  '############', // section 3 bottom (dungeon end)
]

export const TILE = 52
export const COLS = MAP[0].length
export const ROWS = MAP.length
const VIEWPORT_ROWS = 10
export const STAGE_WIDTH = COLS * TILE
export const STAGE_HEIGHT = VIEWPORT_ROWS * TILE
export const WORLD_HEIGHT = ROWS * TILE

const grid = parseGrid(MAP)
function tileCenter(col, row) {
  return tileCenterOf(col, row, TILE)
}

const PLAYER_HALF = 12
const PLAYER_SPEED = 130
export const PLAYER_MAX_HP = 30
export const PLAYER_BASE_ATTACK = 8

const FIREBALL_DAMAGE = 12

const MONSTER_HALF = 10
const MONSTER_SPEED = 65
const MONSTER_DETECT_RADIUS = 160
const MONSTER_MAX_HP = 14
const MONSTER_DAMAGE = 6
const BOSS_MAX_HP = 50
const BOSS_DAMAGE = 11
const POTION_HEAL = 15
const MONSTER_COIN_REWARD = 5
const BOSS_COIN_REWARD = 50
const HEROINE_ATTACK = 6

const FLEE_COOLDOWN = 1.0 // grace period before a fled-from monster can re-engage
const PLAYER_TURN_DELAY = 0.8 // pause after the player's action before the monster replies
const END_TURN_DELAY = 1.0 // pause after victory/defeat/flee before returning control

// Hand-placed spawn points (col, row) on floor tiles of MAP above.
// The boss waits in the farthest corner from the entrance (deepest,
// 3rd section), per the tavern keeper's rumor.
const MONSTER_SPAWNS = [
  // section 1
  [4, 1],
  [9, 2],
  // section 2
  [2, 15],
  [6, 15],
  [9, 12],
  // section 3
  [9, 22],
  [6, 25],
  [10, 27, 'boss'],
]
const POTION_SPAWNS = [
  [6, 3],
  [8, 14],
  [3, 17],
  [5, 21],
  [8, 24],
]
const PLAYER_START = [1, 1]

function rollDamage(base) {
  return Math.max(1, base + Math.floor(Math.random() * 5) - 2)
}

export const useRpgStore = defineStore('rpg', () => {
  const player = reactive({
    x: 0,
    y: 0,
    facing: 'down',
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    attack: PLAYER_BASE_ATTACK,
  })
  const monsters = reactive([])
  const potions = reactive([])
  const companion = reactive({ active: false })
  const kills = ref(0)
  const phase = ref('ready') // ready | playing | cleared | gameOver
  const message = ref('DUNGEON')
  const phaseTimer = ref(1.0)
  const toast = ref('')
  const toastTimer = ref(0)
  const ending = ref('')

  // Dragon-Quest-style turn-based battle, entered when a roaming monster
  // catches the player on the dungeon map.
  const battle = reactive({
    active: false,
    monsterIndex: -1,
    turn: 'player', // player | monsterPending | victory | defeat | fled
    log: '',
    timer: 0,
    fireballReady: true,
    effect: null, // 'attack' | 'fireball' | null
    effectTimer: 0,
    actionId: 0,
  })

  function startGame() {
    const town = useTownStore()
    const start = tileCenter(...PLAYER_START)
    player.x = start.x
    player.y = start.y
    player.facing = 'down'
    player.maxHp = PLAYER_MAX_HP + town.bonusMaxHp
    player.hp = player.maxHp
    player.attack = PLAYER_BASE_ATTACK + town.bonusAttack
    companion.active = town.companionJoined

    monsters.length = 0
    for (const [col, row, kind] of MONSTER_SPAWNS) {
      const pos = tileCenter(col, row)
      const isBoss = kind === 'boss'
      const hp = isBoss ? BOSS_MAX_HP : MONSTER_MAX_HP
      monsters.push({
        ...pos,
        hp,
        maxHp: hp,
        damage: isBoss ? BOSS_DAMAGE : MONSTER_DAMAGE,
        coinReward: isBoss ? BOSS_COIN_REWARD : MONSTER_COIN_REWARD,
        isBoss,
        contactCooldown: 0,
      })
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
    battle.active = false
  }

  function canMoveTo(x, y, half) {
    return canMoveToTile(grid, COLS, ROWS, TILE, x, y, half)
  }

  function blockedByMonster(x, y, half) {
    return monsters.some((m) => Math.hypot(x - m.x, y - m.y) < half + MONSTER_HALF)
  }

  function startBattle(index) {
    const m = monsters[index]
    battle.active = true
    battle.monsterIndex = index
    battle.turn = 'player'
    battle.log = `${m.isBoss ? '보스' : '몬스터'}이(가) 나타났다!`
    battle.timer = 0
    battle.fireballReady = true
    battle.effect = null
    battle.effectTimer = 0
  }

  function battleAttack() {
    if (!battle.active || battle.turn !== 'player') return
    const m = monsters[battle.monsterIndex]
    const dmg = rollDamage(player.attack)
    m.hp -= dmg
    battle.log = `용사의 공격! ${dmg}의 피해를 입혔다!`
    battle.effect = 'attack'
    battle.effectTimer = 0.3
    battle.actionId++
    advanceAfterPlayerAction(m)
  }

  function battleFireball() {
    if (!battle.active || battle.turn !== 'player') return
    if (!battle.fireballReady) {
      battle.log = '아직 파이어볼을 쓸 수 없다!'
      return
    }
    const m = monsters[battle.monsterIndex]
    const dmg = rollDamage(FIREBALL_DAMAGE)
    m.hp -= dmg
    battle.fireballReady = false
    battle.log = `파이어볼! ${dmg}의 피해를 입혔다!`
    battle.effect = 'fireball'
    battle.effectTimer = 0.35
    battle.actionId++
    advanceAfterPlayerAction(m)
  }

  function battleFlee() {
    if (!battle.active || battle.turn !== 'player') return
    const m = monsters[battle.monsterIndex]
    if (m.isBoss) {
      battle.log = '보스에게서는 도망칠 수 없다!'
      battle.turn = 'monsterPending'
      battle.timer = PLAYER_TURN_DELAY
      return
    }
    if (Math.random() < 0.75) {
      battle.turn = 'fled'
      battle.log = '도망쳤다!'
      battle.timer = END_TURN_DELAY
    } else {
      battle.log = '도망칠 수 없었다!'
      battle.turn = 'monsterPending'
      battle.timer = PLAYER_TURN_DELAY
    }
  }

  function advanceAfterPlayerAction(m) {
    if (m.hp <= 0) {
      battle.turn = 'victory'
      battle.timer = END_TURN_DELAY
    } else if (companion.active) {
      battle.turn = 'companionPending'
      battle.timer = PLAYER_TURN_DELAY
    } else {
      battle.turn = 'monsterPending'
      battle.timer = PLAYER_TURN_DELAY
    }
  }

  function resolveCompanionTurn() {
    const m = monsters[battle.monsterIndex]
    const dmg = rollDamage(HEROINE_ATTACK)
    m.hp -= dmg
    battle.log = `히로인의 공격! ${dmg}의 피해를 입혔다!`
    if (m.hp <= 0) {
      battle.turn = 'victory'
      battle.timer = END_TURN_DELAY
    } else {
      battle.turn = 'monsterPending'
      battle.timer = PLAYER_TURN_DELAY
    }
  }

  function resolveMonsterTurn() {
    const m = monsters[battle.monsterIndex]
    const dmg = rollDamage(m.damage)
    player.hp = Math.max(0, player.hp - dmg)
    battle.log = `${m.isBoss ? '보스' : '몬스터'}의 공격! ${dmg}의 피해를 받았다!`
    if (player.hp <= 0) {
      battle.turn = 'defeat'
      battle.timer = END_TURN_DELAY
    } else {
      battle.turn = 'player'
      battle.timer = 0
      battle.fireballReady = true
    }
  }

  function finishVictory() {
    const m = monsters[battle.monsterIndex]
    kills.value++
    useTownStore().addCoins(m.coinReward)
    if (kills.value % 3 === 0) {
      player.attack += 1
      toast.value = 'ATTACK UP!'
      toastTimer.value = 1.4
    }
    monsters.splice(battle.monsterIndex, 1)
    battle.active = false
    if (monsters.length === 0) {
      phase.value = 'cleared'
      message.value = 'DUNGEON CLEARED!'
      ending.value = '던전의 몬스터를 모두 물리쳤다. 마을에 다시 평화가 찾아왔다.'
      useTownStore().completeQuest()
    }
  }

  function finishDefeat() {
    battle.active = false
    phase.value = 'gameOver'
    message.value = 'GAME OVER'
    ending.value = '용사는 쓰러졌다... 던전의 어둠은 계속된다.'
  }

  function finishFlee() {
    const m = monsters[battle.monsterIndex]
    m.contactCooldown = FLEE_COOLDOWN
    battle.active = false
  }

  function updateBattle(dt) {
    if (battle.effectTimer > 0) battle.effectTimer -= dt
    if (battle.timer <= 0) return
    battle.timer -= dt
    if (battle.timer > 0) return
    if (battle.turn === 'companionPending') resolveCompanionTurn()
    else if (battle.turn === 'monsterPending') resolveMonsterTurn()
    else if (battle.turn === 'victory') finishVictory()
    else if (battle.turn === 'defeat') finishDefeat()
    else if (battle.turn === 'fled') finishFlee()
  }

  function update(dt, input) {
    if (phase.value === 'ready') {
      phaseTimer.value -= dt
      if (phaseTimer.value <= 0) phase.value = 'playing'
      return
    }
    if (phase.value !== 'playing') return

    if (toastTimer.value > 0) toastTimer.value -= dt

    if (battle.active) {
      updateBattle(dt)
      return
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
    if (dx !== 0 || dy !== 0) {
      player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    }
    const tryX = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(tryX, player.y, PLAYER_HALF) && !blockedByMonster(tryX, player.y, PLAYER_HALF)) player.x = tryX
    const tryY = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(player.x, tryY, PLAYER_HALF) && !blockedByMonster(player.x, tryY, PLAYER_HALF)) player.y = tryY

    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i]
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
        m.contactCooldown <= 0 &&
        Math.abs(player.x - m.x) < PLAYER_HALF + MONSTER_HALF &&
        Math.abs(player.y - m.y) < PLAYER_HALF + MONSTER_HALF
      ) {
        startBattle(i)
        return
      }
    }

    for (let i = potions.length - 1; i >= 0; i--) {
      const p = potions[i]
      if (Math.abs(player.x - p.x) < PLAYER_HALF + 8 && Math.abs(player.y - p.y) < PLAYER_HALF + 8) {
        player.hp = Math.min(player.maxHp, player.hp + POTION_HEAL)
        potions.splice(i, 1)
      }
    }
  }

  return {
    grid,
    player,
    monsters,
    potions,
    companion,
    kills,
    phase,
    message,
    ending,
    toast,
    toastTimer,
    battle,
    startGame,
    update,
    battleAttack,
    battleFireball,
    battleFlee,
  }
})
