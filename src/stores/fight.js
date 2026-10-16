import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const STAGE_WIDTH = 800
export const STAGE_HEIGHT = 300
export const GROUND_Y = STAGE_HEIGHT - 50
export const BODY_WIDTH = 50
export const BODY_HEIGHT = 90

const GRAVITY = 1800
const MOVE_SPEED = 220
const JUMP_VELOCITY = -620
const PUNCH_RANGE = 70
const KICK_RANGE = 85
const PUNCH_DAMAGE = 6
const KICK_DAMAGE = 10
const ATTACK_STARTUP = 0.08
const ATTACK_ACTIVE_WINDOW = 0.1
const PUNCH_RECOVER = 0.25
const KICK_RECOVER = 0.3
const HITSTUN_DURATION = 0.35
const BLOCK_DAMAGE_SCALE = 0.2
const ROUND_TIME = 60
const WINS_NEEDED = 2

function createPlayer(x, facing) {
  return {
    x,
    y: GROUND_Y,
    vy: 0,
    onGround: true,
    hp: 100,
    maxHp: 100,
    facing, // 1 = right, -1 = left
    action: 'idle', // idle | walk | jump | block | punch | kick | hitstun
    actionTimer: 0,
    attackTotal: 0,
    hasHit: false,
  }
}

export const useFightStore = defineStore('fight', () => {
  const players = reactive([createPlayer(200, 1), createPlayer(600, -1)])
  const wins = reactive([0, 0])
  const round = ref(1)
  const roundTime = ref(ROUND_TIME)
  const phase = ref('ready') // ready | fighting | roundEnd | matchEnd
  const message = ref('ROUND 1')
  const phaseTimer = ref(1.2)

  function resetRound() {
    players[0] = createPlayer(200, 1)
    players[1] = createPlayer(600, -1)
    roundTime.value = ROUND_TIME
    phase.value = 'ready'
    message.value = `ROUND ${round.value}`
    phaseTimer.value = 1.2
  }

  function startMatch() {
    wins[0] = 0
    wins[1] = 0
    round.value = 1
    resetRound()
  }

  function startAttack(p, type) {
    if (p.action === 'punch' || p.action === 'kick' || p.action === 'hitstun') return
    const recover = type === 'punch' ? PUNCH_RECOVER : KICK_RECOVER
    p.action = type
    p.attackTotal = ATTACK_STARTUP + ATTACK_ACTIVE_WINDOW + recover
    p.actionTimer = p.attackTotal
    p.hasHit = false
  }

  function applyHit(attacker, defender, damage) {
    const blocked = defender.action === 'block'
    const dealt = blocked ? Math.round(damage * BLOCK_DAMAGE_SCALE) : damage
    defender.hp = Math.max(0, defender.hp - dealt)
    if (!blocked) {
      defender.action = 'hitstun'
      defender.actionTimer = HITSTUN_DURATION
    }
  }

  function checkHit(attacker, defender) {
    if (attacker.hasHit) return
    if (attacker.action !== 'punch' && attacker.action !== 'kick') return
    const elapsed = attacker.attackTotal - attacker.actionTimer
    if (elapsed < ATTACK_STARTUP || elapsed > ATTACK_STARTUP + ATTACK_ACTIVE_WINDOW) return
    const range = attacker.action === 'punch' ? PUNCH_RANGE : KICK_RANGE
    const damage = attacker.action === 'punch' ? PUNCH_DAMAGE : KICK_DAMAGE
    const dx = defender.x - attacker.x
    const facingCorrect = (attacker.facing === 1 && dx > 0) || (attacker.facing === -1 && dx < 0)
    if (facingCorrect && Math.abs(dx) <= range) {
      attacker.hasHit = true
      applyHit(attacker, defender, damage)
    }
  }

  function endRound(p1, p2) {
    phase.value = 'roundEnd'
    let winnerIdx = null
    if (p1.hp <= 0 && p2.hp <= 0) {
      message.value = 'DOUBLE K.O.!'
    } else if (p1.hp <= 0) {
      winnerIdx = 1
      message.value = 'PLAYER 2 WINS ROUND!'
    } else if (p2.hp <= 0) {
      winnerIdx = 0
      message.value = 'PLAYER 1 WINS ROUND!'
    } else if (p1.hp === p2.hp) {
      message.value = 'TIME UP - DRAW!'
    } else {
      winnerIdx = p1.hp > p2.hp ? 0 : 1
      message.value = `TIME UP - PLAYER ${winnerIdx + 1} WINS ROUND!`
    }
    if (winnerIdx !== null) wins[winnerIdx]++
    phaseTimer.value = 2.2

    if (wins[0] >= WINS_NEEDED || wins[1] >= WINS_NEEDED) {
      const matchWinnerIdx = wins[0] >= WINS_NEEDED ? 0 : 1
      phase.value = 'matchEnd'
      message.value = `PLAYER ${matchWinnerIdx + 1} WINS THE MATCH!`
    }
  }

  function update(dt, input) {
    if (phase.value === 'ready') {
      phaseTimer.value -= dt
      if (phaseTimer.value <= 0) {
        phase.value = 'fighting'
        message.value = 'FIGHT!'
        phaseTimer.value = 0.6
      }
      return
    }
    if (phase.value === 'roundEnd') {
      phaseTimer.value -= dt
      if (phaseTimer.value <= 0) {
        round.value++
        resetRound()
      }
      return
    }
    if (phase.value === 'matchEnd') return

    roundTime.value = Math.max(0, roundTime.value - dt)

    const [p1, p2] = players
    p1.facing = p2.x >= p1.x ? 1 : -1
    p2.facing = p1.x >= p2.x ? 1 : -1

    for (const [p, keys] of [[p1, input.p1], [p2, input.p2]]) {
      if (p.actionTimer > 0) {
        p.actionTimer -= dt
        if (p.actionTimer <= 0) {
          p.action = 'idle'
          p.actionTimer = 0
        }
      }
      const locked = p.action === 'punch' || p.action === 'kick' || p.action === 'hitstun'

      let moveDir = 0
      if (!locked && p.action !== 'block') {
        if (keys.left) moveDir -= 1
        if (keys.right) moveDir += 1
      }
      if (moveDir !== 0 && p.onGround) {
        p.x += moveDir * MOVE_SPEED * dt
        p.action = 'walk'
      } else if (p.onGround && !locked && p.action !== 'block') {
        p.action = 'idle'
      }
      p.x = Math.min(STAGE_WIDTH - BODY_WIDTH / 2, Math.max(BODY_WIDTH / 2, p.x))

      if (keys.jumpPressed && p.onGround && !locked) {
        p.vy = JUMP_VELOCITY
        p.onGround = false
      }
      if (!p.onGround) {
        p.vy += GRAVITY * dt
        p.y += p.vy * dt
        if (p.y >= GROUND_Y) {
          p.y = GROUND_Y
          p.vy = 0
          p.onGround = true
        } else if (!locked) {
          p.action = 'jump'
        }
      }

      if (!locked && p.onGround) {
        if (keys.block) p.action = 'block'
        else if (p.action === 'block') p.action = 'idle'
      }

      if (!locked && p.onGround) {
        if (keys.punchPressed) startAttack(p, 'punch')
        else if (keys.kickPressed) startAttack(p, 'kick')
      }
    }

    const minDist = BODY_WIDTH + 10
    if (Math.abs(p1.x - p2.x) < minDist) {
      const overlap = minDist - Math.abs(p1.x - p2.x)
      const dir = p1.x < p2.x ? -1 : 1
      p1.x = Math.min(STAGE_WIDTH - BODY_WIDTH / 2, Math.max(BODY_WIDTH / 2, p1.x + (dir * overlap) / 2))
      p2.x = Math.min(STAGE_WIDTH - BODY_WIDTH / 2, Math.max(BODY_WIDTH / 2, p2.x - (dir * overlap) / 2))
    }

    checkHit(p1, p2)
    checkHit(p2, p1)

    if (p1.hp <= 0 || p2.hp <= 0 || roundTime.value <= 0) {
      endRound(p1, p2)
    }
  }

  return {
    players,
    wins,
    round,
    roundTime,
    phase,
    message,
    startMatch,
    update,
  }
})
