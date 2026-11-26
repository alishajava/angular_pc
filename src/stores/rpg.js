import { defineStore } from 'pinia'
import { reactive, ref, shallowRef } from 'vue'
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
const VIEWPORT_ROWS = 10
// 화면(뷰포트) 크기는 던전·숲 모두 같다. 숲은 가로로 길어서 카메라가 가로로 따라간다.
export const STAGE_WIDTH = MAP[0].length * TILE
export const STAGE_HEIGHT = VIEWPORT_ROWS * TILE

function tileCenter(col, row) {
  return tileCenterOf(col, row, TILE)
}

// ---- 숲길: 마을과 마을 사이를 잇는 가로로 긴 길. 지그재그로 휘어지고, 몬스터가 돌아다닌다. ----
const FOREST_SPAWNS = [
  [7, 3, 'slime'],
  [8, 7, 'wolf'],
  [13, 7, 'slime'],
  [14, 2, 'wolf'],
  [19, 2, 'wolf'],
  [20, 7, 'slime'],
  [25, 8, 'wolf'],
  [26, 2, 'slime'],
  [31, 3, 'wolf'],
  [32, 7, 'slime'],
]
const FOREST_POTIONS = [
  [6, 8],
  [13, 2],
  [19, 8],
  [25, 2],
  [31, 8],
]
function buildForestMap() {
  const C = 36
  const R = 10
  const rows = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => (r === 0 || r === R - 1 || c === 0 || c === C - 1 ? '#' : '.')))
  const h = (a, b) => {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  // 숲을 가로지르는 나무 담장: 번갈아 아래/위에 틈을 남겨 길이 구불구불하게 이어진다
  const barriers = [[10, 'low'], [16, 'high'], [22, 'low'], [28, 'high']]
  for (const [c, gap] of barriers) {
    for (let r = 1; r < R - 1; r++) rows[r][c] = (gap === 'low' ? r >= 7 : r <= 2) ? '.' : '#'
  }
  rows[5][0] = 'W' // 서쪽 출구 (처음 마을)
  rows[5][C - 1] = 'E' // 동쪽 출구 (단풍마을)
  // 지나가야 하는 지점들: 입구, 출구, 몬스터·약초 자리
  const must = [[1, 5], [C - 2, 5], ...FOREST_SPAWNS.map(([c, r]) => [c, r]), ...FOREST_POTIONS]
  for (const [c, r] of must) rows[r][c] = '.'
  const connected = () => {
    const seen = new Set(['1,5'])
    const q = [[1, 5]]
    while (q.length) {
      const [c, r] = q.pop()
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nr < 0 || nc >= C || nr >= R || rows[nr][nc] === '#' || seen.has(`${nc},${nr}`)) continue
        seen.add(`${nc},${nr}`)
        q.push([nc, nr])
      }
    }
    return must.every(([c, r]) => seen.has(`${c},${r}`)) && seen.has(`${C - 1},5`)
  }
  // 군데군데 나무 덤불 — 길이 막히지 않을 때만 심는다
  for (let r = 1; r < R - 1; r++) {
    for (let c = 3; c < C - 3; c++) {
      if (rows[r][c] !== '.' || h(c, r) < 0.78) continue
      rows[r][c] = '#'
      if (!connected()) rows[r][c] = '.'
    }
  }
  return rows.map((row) => row.join(''))
}
const FOREST_MAP = buildForestMap()
const FOREST_KINDS = {
  slime: { bodyColor: '#4a8ac0', bellyColor: '#7fb4e0', hp: 12, damage: 5, coin: 4 },
  wolf: { bodyColor: '#8a6a4a', bellyColor: '#c0a07a', hp: 16, damage: 6, coin: 6 },
}

export const LEVELS = {
  dungeon: { key: 'dungeon', title: 'DUNGEON', map: MAP, theme: 'dungeon' },
  forest: { key: 'forest', title: '숲길', map: FOREST_MAP, theme: 'forest' },
}
for (const lv of Object.values(LEVELS)) {
  lv.cols = lv.map[0].length
  lv.rows = lv.map.length
  lv.grid = parseGrid(lv.map)
  lv.worldW = lv.cols * TILE
  lv.worldH = lv.rows * TILE
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
    moving: false,
  })
  const levelKey = ref('dungeon')
  const level = shallowRef(LEVELS.dungeon)
  const grid = shallowRef(LEVELS.dungeon.grid)
  const exitTo = ref('') // 'west' | 'east' : 숲길 끝에 닿으면 마을로 나간다
  const entrySide = ref('west')
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
    fireballCooldown: 0,
    effect: null, // 'attack' | 'fireball' | null
    effectTimer: 0,
    actionId: 0,
  })

  function startGame(key = 'dungeon', entry = 'west') {
    const town = useTownStore()
    levelKey.value = key
    level.value = LEVELS[key]
    grid.value = LEVELS[key].grid
    exitTo.value = ''
    entrySide.value = entry
    const start = key === 'forest' ? tileCenter(entry === 'east' ? level.value.cols - 2 : 1, 5) : tileCenter(...PLAYER_START)
    player.x = start.x
    player.y = start.y
    player.facing = 'down'
    player.maxHp = PLAYER_MAX_HP + town.bonusMaxHp
    player.hp = player.maxHp
    player.attack = PLAYER_BASE_ATTACK + town.bonusAttack
    companion.active = town.companionJoined

    monsters.length = 0
    const spawns = key === 'forest' ? FOREST_SPAWNS : MONSTER_SPAWNS
    for (const [col, row, kind] of spawns) {
      const pos = tileCenter(col, row)
      if (key === 'forest') {
        const k = FOREST_KINDS[kind]
        monsters.push({ ...pos, hp: k.hp, maxHp: k.hp, damage: k.damage, coinReward: k.coin, isBoss: false, contactCooldown: 0, bodyColor: k.bodyColor, bellyColor: k.bellyColor, kind })
        continue
      }
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
    for (const [col, row] of key === 'forest' ? FOREST_POTIONS : POTION_SPAWNS) {
      potions.push(tileCenter(col, row))
    }

    kills.value = 0
    message.value = LEVELS[key].title
    ending.value = ''
    phase.value = 'ready'
    phaseTimer.value = 1.0
    battle.active = false
  }

  function canMoveTo(x, y, half) {
    return canMoveToTile(grid.value, level.value.cols, level.value.rows, TILE, x, y, half)
  }

  function blockedByMonster(x, y, half) {
    return monsters.some((m) => Math.hypot(x - m.x, y - m.y) < half + MONSTER_HALF)
  }

  function startBattle(index) {
    const m = monsters[index]
    battle.active = true
    battle.monsterIndex = index
    battle.turn = 'player'
    battle.log = `${m.isBoss ? '보스' : m.kind === 'wolf' ? '늑대' : m.kind === 'slime' ? '슬라임' : '몬스터'}이(가) 나타났다!`
    battle.timer = 0
    battle.fireballReady = true
    battle.fireballCooldown = 0
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
    battle.fireballCooldown = 2 // 한 턴 쉬고 다시 사용 가능
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
      if (battle.fireballCooldown > 0) battle.fireballCooldown -= 1
      battle.fireballReady = battle.fireballCooldown === 0
    }
  }

  function finishVictory() {
    const m = monsters[battle.monsterIndex]
    kills.value++
    useTownStore().addCoins(m.coinReward)
    if (levelKey.value === 'forest') useTownStore().addForestKill()
    if (kills.value % 3 === 0) {
      player.attack += 1
      toast.value = 'ATTACK UP!'
      toastTimer.value = 1.4
    }
    monsters.splice(battle.monsterIndex, 1)
    battle.active = false
    if (levelKey.value === 'dungeon' && monsters.length === 0) {
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
    ending.value = levelKey.value === 'forest' ? '용사는 숲길에서 쓰러졌다... 다시 마을에서 정비하자.' : '용사는 쓰러졌다... 던전의 어둠은 계속된다.'
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
    player.moving = dx !== 0 || dy !== 0
    if (player.moving) {
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

    // 숲길 양끝 출구: 길 끝에 닿으면 그쪽 마을로 나간다
    if (levelKey.value === 'forest') {
      const c = Math.floor(player.x / TILE)
      const ch = level.value.map[Math.floor(player.y / TILE)][c]
      if (ch === 'W') exitTo.value = 'west'
      else if (ch === 'E') exitTo.value = 'east'
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
    level,
    levelKey,
    exitTo,
    entrySide,
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
