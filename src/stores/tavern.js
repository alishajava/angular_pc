import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { parseGrid, canMoveTo, tileCenter } from '../mapUtils'

// Small interior room. '#' = wall, 'D' is the door back to town (still floor).
const MAP = ['########', '#......#', '#..N...#', '#......#', '#......#', '####D###']

export const TILE = 52
export const COLS = MAP[0].length
export const ROWS = MAP.length
export const STAGE_WIDTH = COLS * TILE
export const STAGE_HEIGHT = ROWS * TILE

const grid = parseGrid(MAP)
const PLAYER_START = [4, 4]
const NPC_POS = [3, 2]
const DOOR_POS = [4, 5]
const PLAYER_HALF = 12
const PLAYER_SPEED = 120

const KEEPER_LINES = [
  '어서 오게, 모험가 양반! 여기 앉아서 한 잔 하고 가게.',
  '요즘 다들 던전 이야기뿐이야. 가장 깊은 곳에 우두머리가 산다고 하더군.',
  '덩치가 산만 하고 왕관을 쓰고 있다던데... 조심해서 다녀오게나.',
]

export const useTavernStore = defineStore('tavern', () => {
  const player = reactive({ x: 0, y: 0, facing: 'up' })
  const npc = reactive({ ...tileCenter(...NPC_POS, TILE), touching: false })
  const door = tileCenter(...DOOR_POS, TILE)

  const conversation = ref(null) // { speaker, lines, index } | null

  function enterTavern() {
    const start = tileCenter(...PLAYER_START, TILE)
    player.x = start.x
    player.y = start.y
    player.facing = 'up'
    npc.touching = false
    conversation.value = null
  }

  function advanceConversation() {
    if (!conversation.value) return
    conversation.value.index++
    if (conversation.value.index >= conversation.value.lines.length) {
      conversation.value = null
    }
  }

  function update(dt, input) {
    if (conversation.value) return null

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

    const overlappingNpc = Math.abs(player.x - npc.x) < PLAYER_HALF + 14 && Math.abs(player.y - npc.y) < PLAYER_HALF + 14
    if (overlappingNpc && !npc.touching) {
      npc.touching = true
      conversation.value = { speaker: '선술집 주인', lines: KEEPER_LINES, index: 0 }
    } else if (!overlappingNpc) {
      npc.touching = false
    }

    if (Math.abs(player.x - door.x) < TILE / 2 && Math.abs(player.y - door.y) < TILE / 2) {
      return 'exit'
    }
    return null
  }

  return {
    grid,
    player,
    npc,
    door,
    conversation,
    enterTavern,
    advanceConversation,
    update,
  }
})
