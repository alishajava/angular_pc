const ATTACK_RANGE = 65
const CLOSE_RANGE = 40

export function createAiController() {
  let decisionTimer = 0
  let moveDir = 0
  let blocking = false

  return function aiInput(dt, self, opponent) {
    decisionTimer -= dt

    const dist = opponent.x - self.x
    const absDist = Math.abs(dist)
    const opponentAttacking = opponent.action === 'punch' || opponent.action === 'kick'

    if (decisionTimer <= 0) {
      decisionTimer = 0.22 + Math.random() * 0.35

      blocking = opponentAttacking && absDist < ATTACK_RANGE + 20 && Math.random() < 0.6

      if (blocking) {
        moveDir = 0
      } else if (absDist > ATTACK_RANGE) {
        moveDir = dist > 0 ? 1 : -1
      } else if (absDist < CLOSE_RANGE) {
        moveDir = Math.random() < 0.3 ? (dist > 0 ? -1 : 1) : 0
      } else {
        moveDir = Math.random() < 0.2 ? (dist > 0 ? 1 : -1) : 0
      }
    }

    let punchPressed = false
    let kickPressed = false
    const canAct = self.action === 'idle' || self.action === 'walk'
    if (!blocking && canAct && absDist <= ATTACK_RANGE && Math.random() < 0.06) {
      if (Math.random() < 0.5) punchPressed = true
      else kickPressed = true
    }

    return {
      left: moveDir === -1,
      right: moveDir === 1,
      block: blocking,
      jumpPressed: false,
      punchPressed,
      kickPressed,
    }
  }
}
