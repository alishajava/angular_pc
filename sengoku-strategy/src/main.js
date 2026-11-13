// 천하제패: turn-based 4X set in the late Han / Three Kingdoms period of China.
// Full game systems restored on top of the new presentation: territories are
// drawn as irregular map regions (not circles) on a parchment map, and every
// turn opens with an advisor scene asking what to do, rendered graphically.

const CANVAS_W = 980
const CANVAS_H = 640
const MAP_X0 = 16
const MAP_Y0 = 64
const MAP_W = 700
const MAP_H = 370
const PANEL_X0 = 726
const PANEL_W = 238
const BOTTOM_Y0 = 444
const BOTTOM_H = 180

const MAX_SEASONS = 40 // 10 in-game years, soft end if nobody unifies before then
const SEASON_NAMES = ['봄', '여름', '가을', '겨울']

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
function rand(lo, hi) {
  return lo + Math.random() * (hi - lo)
}
function randInt(lo, hi) {
  return Math.floor(rand(lo, hi + 1))
}
function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------- Audio ----------
let audioCtx = null
let masterGain = null
function ensureAudio() {
  if (audioCtx) return audioCtx
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0.4
  masterGain.connect(audioCtx.destination)
  return audioCtx
}
function noiseBuffer(ac, duration) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}
function playTone({ freqFrom, freqTo, duration, type = 'sawtooth', gain = 0.3, delay = 0 }) {
  if (!audioCtx) return
  const ac = audioCtx
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(20, freqFrom), t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + duration)
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.connect(g)
  g.connect(masterGain)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}
function playNoiseBurst({ duration, filterFreqFrom, filterFreqTo, gain = 0.3, type = 'lowpass', delay = 0 }) {
  if (!audioCtx) return
  const ac = audioCtx
  const t0 = ac.currentTime + delay
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, duration)
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(filterFreqFrom, t0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreqTo), t0 + duration)
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  src.connect(filter)
  filter.connect(g)
  g.connect(masterGain)
  src.start(t0)
  src.stop(t0 + duration + 0.02)
}
function playClashSound(ranged) {
  playNoiseBurst({ duration: 0.22, filterFreqFrom: 2600, filterFreqTo: 300, gain: 0.22 })
  playTone({ freqFrom: ranged ? 520 : 220, freqTo: 70, duration: 0.18, type: 'square', gain: 0.16 })
}
function playMoveSound() {
  playTone({ freqFrom: 300, freqTo: 420, duration: 0.08, type: 'sine', gain: 0.08 })
}
function playVictorySound() {
  playTone({ freqFrom: 523, freqTo: 523, duration: 0.14, type: 'sine', gain: 0.2 })
  playTone({ freqFrom: 659, freqTo: 659, duration: 0.14, type: 'sine', gain: 0.2, delay: 0.14 })
  playTone({ freqFrom: 784, freqTo: 784, duration: 0.14, type: 'sine', gain: 0.2, delay: 0.28 })
  playTone({ freqFrom: 1047, freqTo: 1047, duration: 0.3, type: 'sine', gain: 0.22, delay: 0.42 })
}
function playDefeatSound() {
  playTone({ freqFrom: 300, freqTo: 70, duration: 0.6, type: 'sawtooth', gain: 0.2 })
}

// ---------- Battle FX ----------
let floatingTexts = []
function spawnFloatingText(text, x, y, color) {
  floatingTexts.push({ text, x, y, life: 1.0, maxLife: 1.0, color })
}
function updateFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i]
    f.life -= 1 / 60
    f.y -= 0.55
    if (f.life <= 0) floatingTexts.splice(i, 1)
  }
}

// ---------- Map data ----------
const REGION_DEFS = [
  { id: 'heochang', name: '허창', x: 380, y: 190, terrain: 'plain' },
  { id: 'gijoo', name: '기주', x: 380, y: 80, terrain: 'mountain' },
  { id: 'byeongjoo', name: '병주', x: 250, y: 30, terrain: 'mountain' },
  { id: 'hyeongjoo', name: '형주', x: 190, y: 190, terrain: 'coast' },
  { id: 'ikjoo', name: '익주', x: 250, y: 310, terrain: 'plain' },
  { id: 'yejoo', name: '예주', x: 560, y: 130, terrain: 'plain' },
  { id: 'yangjoo', name: '양주', x: 560, y: 280, terrain: 'coast' },
]
const ADJACENCY_PAIRS = [
  ['heochang', 'gijoo'],
  ['heochang', 'hyeongjoo'],
  ['heochang', 'yejoo'],
  ['heochang', 'yangjoo'],
  ['gijoo', 'byeongjoo'],
  ['gijoo', 'hyeongjoo'],
  ['hyeongjoo', 'ikjoo'],
  ['ikjoo', 'yangjoo'],
  ['yejoo', 'yangjoo'],
]
const TERRAIN_DEFENSE_MULT = { plain: 1.0, coast: 1.1, mountain: 1.3 }
const TERRAIN_LABEL = { plain: '평야', coast: '해안', mountain: '산악' }

function buildNeighborMap() {
  const map = {}
  for (const r of REGION_DEFS) map[r.id] = []
  for (const [a, b] of ADJACENCY_PAIRS) {
    map[a].push(b)
    map[b].push(a)
  }
  return map
}
const NEIGHBORS = buildNeighborMap()

// irregular polygon offsets so each territory reads as a map region, not a
// generic colored circle
function makeTerritoryShape(points = 9, baseRadius = 28, jitter = 0.3) {
  const pts = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const r = baseRadius * (1 - jitter + Math.random() * jitter * 2)
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r])
  }
  return pts
}

// ---------- Factions ----------
const FACTIONS = {
  player: { id: 'player', name: '유비군', color: '#2e9a5a', isPlayer: true, personality: 'balanced' },
  yuan: { id: 'yuan', name: '원소군', color: '#c9983f', isPlayer: false, personality: 'cavalry' },
  sun: { id: 'sun', name: '손권군', color: '#d1483f', isPlayer: false, personality: 'commerce' },
  cao: { id: 'cao', name: '조조군', color: '#3f6fd1', isPlayer: false, personality: 'agriculture' },
}
const FACTION_ORDER = ['player', 'yuan', 'sun', 'cao']
const NEUTRAL_COLOR = '#948a73'

const START_OWNERS = {
  ikjoo: 'player',
  gijoo: 'yuan',
  byeongjoo: 'yuan',
  yangjoo: 'sun',
  yejoo: 'cao',
  heochang: null,
  hyeongjoo: null,
}

// Historical Three Kingdoms officers, grouped by faction for flavor.
const GENERAL_NAME_POOLS = {
  player: ['관우', '장비', '조운', '제갈량', '마초', '황충', '위연', '방통', '강유', '법정'],
  yuan: ['안량', '문추', '저수', '전풍', '고람', '순우경', '심배', '봉기'],
  sun: ['주유', '노숙', '여몽', '감녕', '태사자', '정보', '황개', '육손'],
  cao: ['하후돈', '하후연', '장료', '허저', '전위', '순욱', '곽가', '사마의'],
}

function makeGeneral(factionId) {
  const pool = GENERAL_NAME_POOLS[factionId] || GENERAL_NAME_POOLS.player
  return {
    name: choice(pool),
    lead: randInt(35, 90),
    pol: randInt(35, 90),
    int: randInt(35, 90),
  }
}
function makeWeakGarrisonGeneral() {
  return { name: '무명 장수', lead: randInt(20, 35), pol: randInt(20, 35), int: randInt(20, 35) }
}

// ---------- Units ----------
// spear beats cavalry, cavalry beats bow, bow beats spear - but the bonus is
// a multiplier on top of real base power and troop counts, not a coin flip:
// bringing a mixed force blunts being hard-countered, and a general's
// leadership and the defender's terrain matter just as much as the pick.
const UNIT_BASE_POWER = { spear: 1.0, bow: 1.0, cavalry: 1.2 }
const UNIT_COUNTER = { spear: 'cavalry', cavalry: 'bow', bow: 'spear' }
const UNIT_LABEL = { spear: '창병', bow: '궁병', cavalry: '기병' }
const UNIT_COST = {
  spear: { gold: 3, rice: 2 },
  bow: { gold: 5, rice: 2 },
  cavalry: { gold: 9, rice: 3 },
}
const RECRUIT_BATCH = 10

function troopCap(region) {
  return 40 + region.agriculture * 22
}
function totalTroops(region) {
  return region.spear + region.bow + region.cavalry
}

// ---------- Development ----------
function devCost(level, base) {
  return base + level * 24
}
function goldIncome(region) {
  const base = region.id === 'heochang' ? 24 : 14
  return base + region.commerce * 11
}
function riceIncome(region) {
  return 14 + region.agriculture * 11
}

// ---------- State ----------
function makeInitialState() {
  const regions = REGION_DEFS.map((def) => {
    const owner = START_OWNERS[def.id]
    const neutral = owner === null
    return {
      ...def,
      owner,
      shape: makeTerritoryShape(),
      agriculture: neutral ? 0 : 1,
      commerce: neutral ? 0 : 1,
      defense: neutral ? 0 : 0,
      security: neutral ? 60 : 80,
      spear: neutral ? 22 : 16,
      bow: neutral ? 0 : 6,
      cavalry: neutral ? 0 : 0,
      general: neutral ? makeWeakGarrisonGeneral() : makeGeneral(owner),
    }
  })

  const factions = {}
  for (const id of FACTION_ORDER) {
    factions[id] = {
      ...FACTIONS[id],
      alive: true,
      gold: 120,
      rice: 80,
      relations: {},
    }
  }
  for (const a of FACTION_ORDER) {
    for (const b of FACTION_ORDER) {
      if (a === b) continue
      factions[a].relations[b] = { score: 0, pact: null, pactTurns: 0 } // pact: null | 'nonaggression' | 'alliance' | 'marriage'
    }
  }

  return {
    phase: 'title', // title | intro | turnStart | map | forceSelect | battle | diplomacy | ending
    season: 0, // index into SEASON_NAMES, advances each end-turn
    year: 1,
    turnCount: 1,
    regions,
    factions,
    selectedRegionId: null,
    attackFromId: null, // set while picking an attack target
    pendingAttack: null, // { fromId, toId }
    diplomacyFactionId: null,
    battle: null,
    toast: null, // { text, until }
    gameOverText: null,
  }
}
let state = makeInitialState()

function region(id) {
  return state.regions.find((r) => r.id === id)
}
function faction(id) {
  return id ? state.factions[id] : null
}

let toastTimer = 0
function say(text) {
  state.toast = text
  toastTimer = 3.2
}

// ---------- Diplomacy helpers ----------
function relationOf(a, b) {
  return state.factions[a].relations[b]
}
function adjustRelation(a, b, delta) {
  if (a === b) return
  const ra = relationOf(a, b)
  const rb = relationOf(b, a)
  ra.score = clamp(ra.score + delta, -100, 100)
  rb.score = clamp(rb.score + delta, -100, 100)
}
function pactOf(a, b) {
  return relationOf(a, b).pact
}
function setPact(a, b, pact, turns) {
  relationOf(a, b).pact = pact
  relationOf(a, b).pactTurns = turns
  relationOf(b, a).pact = pact
  relationOf(b, a).pactTurns = turns
}
function isProtected(a, b) {
  const p = pactOf(a, b)
  return p === 'nonaggression' || p === 'alliance' || p === 'marriage'
}

function proposalInfo(kind) {
  if (kind === 'nonaggression') return { label: '불가침 제안', cost: 20, minRel: -30, baseChance: 55, turns: 8 }
  if (kind === 'alliance') return { label: '동맹 제안', cost: 55, minRel: 15, baseChance: 40, turns: 999 }
  return { label: '혼인동맹 제안', cost: 160, minRel: 45, baseChance: 50, turns: 999 }
}

function proposePact(fromId, toId, kind) {
  const info = proposalInfo(kind)
  const f = faction(fromId)
  const rel = relationOf(fromId, toId)
  if (rel.score < info.minRel) {
    say(`관계가 부족해 제안할 수 없습니다 (필요 관계도 ${info.minRel})`)
    return
  }
  if (f.gold < info.cost) {
    say('금이 부족합니다.')
    return
  }
  f.gold -= info.cost
  const chance = clamp(info.baseChance + rel.score / 2, 5, 95)
  if (Math.random() * 100 < chance) {
    setPact(fromId, toId, kind, info.turns)
    adjustRelation(fromId, toId, kind === 'marriage' ? 40 : 15)
    say(`${faction(toId).name}과(와) ${info.label}이 성사되었습니다!`)
  } else {
    adjustRelation(fromId, toId, -5)
    say(`${faction(toId).name}이(가) ${info.label}을 거절했습니다.`)
  }
}

function breakPactPenalty(attackerId, defenderId) {
  const p = pactOf(attackerId, defenderId)
  if (!p) return
  setPact(attackerId, defenderId, null, 0)
  adjustRelation(attackerId, defenderId, -50)
  say(`배신! ${faction(attackerId).name}이(가) ${faction(defenderId).name}과(와)의 약조를 깼습니다.`)
}

// ---------- Combat ----------
// ---------- Tactical battle grid ----------
const GRID_COLS = 8
const GRID_ROWS = 5
const TILE_W = 80
const TILE_H = 54
const GRID_X0 = MAP_X0 + (MAP_W - GRID_COLS * TILE_W) / 2
const GRID_Y0 = MAP_Y0 + 70
const MOVE_RANGE = { spear: 2, bow: 2, cavalry: 3 }
const ATTACK_RANGE = { spear: 1, bow: 2, cavalry: 1 }
const UNIT_ICON_LABEL = { spear: '창', bow: '궁', cavalry: '기' }

function gridDistance(a, b) {
  return Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy))
}

function squadStartRows(n) {
  if (n <= 1) return [2]
  if (n === 2) return [1, 3]
  return [1, 2, 3]
}

function buildSquads(side, troops, gx) {
  const types = ['spear', 'bow', 'cavalry'].filter((t) => troops[t] > 0)
  const rows = squadStartRows(types.length)
  return types.map((t, i) => ({
    id: `${side}_${t}`,
    side,
    type: t,
    count: troops[t],
    gx,
    gy: rows[i],
    acted: false,
  }))
}

function squadAt(b, gx, gy) {
  return b.squads.find((s) => s.count > 0 && s.gx === gx && s.gy === gy)
}

function computeMoveRange(b, squad) {
  const range = MOVE_RANGE[squad.type]
  const tiles = []
  for (let x = 0; x < GRID_COLS; x++) {
    for (let y = 0; y < GRID_ROWS; y++) {
      const d = Math.max(Math.abs(x - squad.gx), Math.abs(y - squad.gy))
      if (d > range) continue
      const occupied = b.squads.some((s) => s.count > 0 && s.id !== squad.id && s.gx === x && s.gy === y)
      if (occupied) continue
      tiles.push({ x, y })
    }
  }
  return tiles
}

function computeAttackable(b, squad) {
  const range = ATTACK_RANGE[squad.type]
  const enemySide = squad.side === 'attacker' ? 'defender' : 'attacker'
  return b.squads.filter((s) => s.side === enemySide && s.count > 0 && gridDistance(s, squad) <= range)
}

function selectSquad(b, squad) {
  b.selectedSquadId = squad.id
  b.mode = 'moving'
  b.moveRangeTiles = computeMoveRange(b, squad)
}

function deselectBattle(b) {
  b.selectedSquadId = null
  b.mode = 'select'
  b.moveRangeTiles = []
  b.attackableIds = []
}

function moveSelectedSquadTo(b, x, y) {
  const squad = b.squads.find((s) => s.id === b.selectedSquadId)
  if (!squad) return
  if (x !== squad.gx || y !== squad.gy) playMoveSound()
  squad.gx = x
  squad.gy = y
  const targets = computeAttackable(b, squad)
  if (targets.length > 0) {
    b.mode = 'targeting'
    b.attackableIds = targets.map((t) => t.id)
  } else {
    squad.acted = true
    deselectBattle(b)
  }
}

function tileCenter(gx, gy) {
  return { x: GRID_X0 + gx * TILE_W + TILE_W / 2, y: GRID_Y0 + gy * TILE_H + TILE_H / 2 }
}

function resolveSquadAttack(b, attackerSquad, defenderSquad) {
  const attGeneral = region(attackerSquad.side === 'attacker' ? b.fromId : b.toId).general
  const defGeneral = region(defenderSquad.side === 'attacker' ? b.fromId : b.toId).general
  const terrainMult = TERRAIN_DEFENSE_MULT[region(b.toId).terrain]
  const atkTerrainMult = attackerSquad.side === 'defender' ? terrainMult : 1
  const defTerrainMult = defenderSquad.side === 'defender' ? terrainMult : 1

  const ranged = attackerSquad.type === 'bow' && gridDistance(attackerSquad, defenderSquad) >= 2
  const counterBonus = UNIT_COUNTER[attackerSquad.type] === defenderSquad.type ? 1.35 : 1
  const counterBonusBack = UNIT_COUNTER[defenderSquad.type] === attackerSquad.type ? 1.35 : 1

  const atkPower =
    attackerSquad.count * UNIT_BASE_POWER[attackerSquad.type] * (1 + attGeneral.lead / 220) * atkTerrainMult * counterBonus
  const defPower =
    defenderSquad.count * UNIT_BASE_POWER[defenderSquad.type] * (1 + defGeneral.lead / 220) * defTerrainMult * counterBonusBack

  const K = 0.1
  const lossToDefender = Math.min(defenderSquad.count, Math.round(atkPower * K))
  const lossToAttacker = ranged ? 0 : Math.min(attackerSquad.count, Math.round(defPower * K * 0.55))

  defenderSquad.count -= lossToDefender
  attackerSquad.count -= lossToAttacker

  const defPos = tileCenter(defenderSquad.gx, defenderSquad.gy)
  spawnFloatingText(`-${lossToDefender}`, defPos.x, defPos.y, '#ff6b6b')
  if (lossToAttacker > 0) {
    const atkPos = tileCenter(attackerSquad.gx, attackerSquad.gy)
    spawnFloatingText(`-${lossToAttacker}`, atkPos.x, atkPos.y, '#ffcf6b')
  }
  playClashSound(ranged)
}

function attackTarget(b, targetId) {
  const squad = b.squads.find((s) => s.id === b.selectedSquadId)
  const target = b.squads.find((s) => s.id === targetId)
  if (!squad || !target) return
  resolveSquadAttack(b, squad, target)
  squad.acted = true
  deselectBattle(b)
  checkBattleOutcome(b)
}

function checkBattleOutcome(b) {
  if (b.resolved) return
  const attackerAlive = b.squads.some((s) => s.side === 'attacker' && s.count > 0)
  const defenderAlive = b.squads.some((s) => s.side === 'defender' && s.count > 0)
  if (!defenderAlive) {
    b.resolved = true
    b.outcome = 'attacker'
  } else if (!attackerAlive) {
    b.resolved = true
    b.outcome = 'defender'
  }
}

function handleBattleGridClick(b, gx, gy) {
  if (b.mode === 'select') {
    const squad = squadAt(b, gx, gy)
    if (squad && squad.side === 'attacker' && !squad.acted) selectSquad(b, squad)
    return
  }
  if (b.mode === 'moving') {
    const inRange = b.moveRangeTiles.some((t) => t.x === gx && t.y === gy)
    if (inRange) {
      moveSelectedSquadTo(b, gx, gy)
      return
    }
    const squad = squadAt(b, gx, gy)
    if (squad && squad.side === 'attacker' && !squad.acted) selectSquad(b, squad)
    else deselectBattle(b)
    return
  }
  if (b.mode === 'targeting') {
    const target = squadAt(b, gx, gy)
    if (target && b.attackableIds.includes(target.id)) attackTarget(b, target.id)
    else deselectBattle(b)
  }
}

function endPlayerBattleTurn(b) {
  if (b.resolved || b.side !== 'player') return
  deselectBattle(b)
  b.side = 'enemy'
  runEnemyBattleTurn(b)
}

function runEnemyBattleTurn(b) {
  const enemySquads = b.squads.filter((s) => s.side === 'defender' && s.count > 0)
  for (const squad of enemySquads) {
    if (b.resolved) break
    const targets = b.squads.filter((s) => s.side === 'attacker' && s.count > 0)
    if (targets.length === 0) break

    let nearest = targets[0]
    let nearestDist = gridDistance(squad, nearest)
    for (const t of targets) {
      const d = gridDistance(squad, t)
      if (d < nearestDist) {
        nearest = t
        nearestDist = d
      }
    }

    const range = MOVE_RANGE[squad.type]
    let bestTile = { x: squad.gx, y: squad.gy }
    let bestDist = nearestDist
    for (let x = 0; x < GRID_COLS; x++) {
      for (let y = 0; y < GRID_ROWS; y++) {
        const d = Math.max(Math.abs(x - squad.gx), Math.abs(y - squad.gy))
        if (d === 0 || d > range) continue
        if (squadAt(b, x, y)) continue
        const dist = Math.max(Math.abs(x - nearest.gx), Math.abs(y - nearest.gy))
        if (dist < bestDist) {
          bestDist = dist
          bestTile = { x, y }
        }
      }
    }
    squad.gx = bestTile.x
    squad.gy = bestTile.y

    if (gridDistance(squad, nearest) <= ATTACK_RANGE[squad.type]) {
      resolveSquadAttack(b, squad, nearest)
      checkBattleOutcome(b)
    }
    squad.acted = true
  }

  if (!b.resolved) {
    b.squads.forEach((s) => {
      s.acted = false
    })
    b.turn += 1
    b.side = 'player'
    if (b.turn > b.maxTurns) {
      b.resolved = true
      b.outcome = 'defender'
    }
  }
}

function sidePower(troops, general, terrainMult, tacticId, isAmbushSuccess) {
  let power = 0
  for (const type of ['spear', 'bow', 'cavalry']) {
    const count = troops[type]
    if (count <= 0) continue
    let unitPower = UNIT_BASE_POWER[type]
    if (tacticId === 'volley' && type === 'bow') unitPower *= 1.5
    power += count * unitPower
  }
  power *= 1 + general.lead / 220
  power *= terrainMult
  if (tacticId === 'charge') power *= 1.3
  if (isAmbushSuccess) power *= 1.8
  return power
}

function counterMultiplier(attackTroops, defendTroops) {
  const defTotal = totalTroops(defendTroops) || 1
  let bonus = 0
  for (const type of ['spear', 'bow', 'cavalry']) {
    const countered = UNIT_COUNTER[type]
    const share = defendTroops[countered] / defTotal
    bonus += share * 0.4 * (attackTroops[type] / (totalTroops(attackTroops) || 1))
  }
  return 1 + bonus
}

function startBattle(fromId, toId, sentTroops) {
  const from = region(fromId)
  const to = region(toId)
  const attackerOwner = from.owner
  const defenderOwner = to.owner

  const squads = [
    ...buildSquads('attacker', sentTroops, 0),
    ...buildSquads('defender', { spear: to.spear, bow: to.bow, cavalry: to.cavalry }, GRID_COLS - 1),
  ]

  state.battle = {
    fromId,
    toId,
    attackerOwner,
    defenderOwner,
    turn: 1,
    maxTurns: 8,
    side: 'player',
    squads,
    selectedSquadId: null,
    mode: 'select',
    moveRangeTiles: [],
    attackableIds: [],
    resolved: false,
    outcome: null, // 'attacker' | 'defender'
  }
  state.phase = 'battle'
}

function applyProportionalLoss(troops, loss) {
  const total = totalTroops(troops)
  if (total <= 0 || loss <= 0) return
  for (const type of ['spear', 'bow', 'cavalry']) {
    const share = troops[type] / total
    troops[type] = Math.max(0, Math.round(troops[type] - loss * share))
  }
}

function finishBattle() {
  const b = state.battle
  const from = region(b.fromId)
  const to = region(b.toId)
  const defenderWasOwner = to.owner
  const defenderFactionAlive = defenderWasOwner ? faction(defenderWasOwner) : null

  const attackerTroops = { spear: 0, bow: 0, cavalry: 0 }
  const defenderTroops = { spear: 0, bow: 0, cavalry: 0 }
  for (const s of b.squads) {
    if (s.count <= 0) continue
    if (s.side === 'attacker') attackerTroops[s.type] += s.count
    else defenderTroops[s.type] += s.count
  }

  if (b.outcome === 'attacker') {
    to.owner = from.owner
    to.spear = attackerTroops.spear
    to.bow = attackerTroops.bow
    to.cavalry = attackerTroops.cavalry
    to.security = 20
    const joinRoll = Math.random() < 0.3
    if (!(joinRoll && defenderWasOwner)) {
      to.general = makeWeakGarrisonGeneral()
    }
    say(`${region(b.toId).name}을(를) 점령했습니다!`)
    if (defenderFactionAlive) adjustRelation(b.attackerOwner, defenderWasOwner, -25)
    checkFactionSurvival(defenderWasOwner)
    playVictorySound()
  } else {
    to.spear = defenderTroops.spear
    to.bow = defenderTroops.bow
    to.cavalry = defenderTroops.cavalry
    from.spear += attackerTroops.spear
    from.bow += attackerTroops.bow
    from.cavalry += attackerTroops.cavalry
    say(`${region(b.toId).name} 공략에 실패했습니다. 살아남은 병력을 물렸습니다.`)
    playDefeatSound()
  }
  state.battle = null
  state.phase = 'map'
  state.selectedRegionId = null
  checkVictoryConditions()
}

function checkFactionSurvival(factionId) {
  if (!factionId) return
  const owns = state.regions.some((r) => r.owner === factionId)
  if (!owns && faction(factionId).alive) {
    faction(factionId).alive = false
    say(`${faction(factionId).name}이(가) 멸망했습니다.`)
  }
}

// ---------- Turn resolution ----------
function regionCountFor(factionId) {
  return state.regions.filter((r) => r.owner === factionId).length
}

function checkVictoryConditions() {
  for (const id of FACTION_ORDER) {
    if (regionCountFor(id) === state.regions.length) {
      state.phase = 'ending'
      state.gameOverText =
        id === 'player'
          ? '천하통일! 당신의 세력이 천하를 평정했습니다.\n\n— 승리 —'
          : `${faction(id).name}이(가) 천하를 통일했습니다.\n\n— 패배 —`
      return
    }
  }
  if (regionCountFor('player') === 0) {
    state.phase = 'ending'
    state.gameOverText = '모든 영지를 잃었습니다.\n\n— 패배 —'
    return
  }
  if (state.turnCount >= MAX_SEASONS) {
    const ranking = FACTION_ORDER.map((id) => ({ id, count: regionCountFor(id) })).sort((a, b) => b.count - a.count)
    const top = ranking[0]
    state.phase = 'ending'
    state.gameOverText =
      top.id === 'player'
        ? `${MAX_SEASONS}계절이 지났습니다. 당신의 세력이 가장 많은 영지를 지배하며 당대 최강으로 남았습니다.\n\n— 승리 —`
        : `${MAX_SEASONS}계절이 지났습니다. ${faction(top.id).name}이(가) 당대 최강으로 남았습니다.\n\n— 패배 —`
  }
}

function runAiFaction(factionId) {
  const f = faction(factionId)
  if (!f.alive) return
  const myRegions = state.regions.filter((r) => r.owner === factionId)
  if (myRegions.length === 0) return

  for (const r of myRegions) {
    const focus = f.personality
    const want =
      focus === 'cavalry' ? 'defense' : focus === 'commerce' ? 'commerce' : focus === 'agriculture' ? 'agriculture' : 'commerce'
    const cost = devCost(r[want], 45)
    if (f.gold >= cost && r[want] < 5 && Math.random() < 0.7) {
      f.gold -= cost
      r[want] += 1
    } else if (f.gold >= 30 && totalTroops(r) < troopCap(r)) {
      const type = focus === 'cavalry' ? 'cavalry' : focus === 'agriculture' ? 'spear' : 'bow'
      const c = UNIT_COST[type]
      if (f.gold >= c.gold * RECRUIT_BATCH && f.rice >= c.rice * RECRUIT_BATCH) {
        f.gold -= c.gold * RECRUIT_BATCH
        f.rice -= c.rice * RECRUIT_BATCH
        r[type] += RECRUIT_BATCH
      }
    }
  }

  if (Math.random() < 0.25) {
    for (const otherId of FACTION_ORDER) {
      if (otherId === factionId || !faction(otherId).alive) continue
      const rel = relationOf(factionId, otherId)
      if (rel.pact) continue
      if (rel.score >= 20 && Math.random() < 0.5) {
        proposePact(factionId, otherId, 'nonaggression')
        break
      }
    }
  }

  for (const r of myRegions) {
    if (totalTroops(r) < 30) continue
    const targets = NEIGHBORS[r.id]
      .map((id) => region(id))
      .filter((t) => t.owner !== factionId && !(t.owner && isProtected(factionId, t.owner)))
    if (targets.length === 0) continue
    targets.sort((a, b) => totalTroops(a) - totalTroops(b))
    const target = targets[0]
    if (totalTroops(target) * 1.3 < totalTroops(r)) {
      if (target.owner) breakPactPenalty(factionId, target.owner)
      const sendRatio = 0.75
      const sent = {
        spear: Math.round(r.spear * sendRatio),
        bow: Math.round(r.bow * sendRatio),
        cavalry: Math.round(r.cavalry * sendRatio),
      }
      r.spear -= sent.spear
      r.bow -= sent.bow
      r.cavalry -= sent.cavalry
      aiResolveBattleInstant(r.id, target.id, sent)
      break
    }
  }
}

function aiResolveBattleInstant(fromId, toId, sentTroops) {
  const from = region(fromId)
  const to = region(toId)
  const attackerOwner = from.owner
  const attGeneral = from.general
  const defGeneral = to.general
  const terrainMult = TERRAIN_DEFENSE_MULT[to.terrain]
  const attacker = { ...sentTroops }
  const defender = { spear: to.spear, bow: to.bow, cavalry: to.cavalry }
  let rounds = 0
  while (totalTroops(attacker) > 0 && totalTroops(defender) > 0 && rounds < 5) {
    rounds += 1
    const counterMult = counterMultiplier(attacker, defender)
    const attPower = sidePower(attacker, attGeneral, 1, 'charge', false) * counterMult
    const defPower = sidePower(defender, defGeneral, terrainMult, 'defend', false) * counterMultiplier(defender, attacker)
    const K = 0.045
    applyProportionalLoss(defender, Math.min(attPower * K, totalTroops(defender)))
    applyProportionalLoss(attacker, Math.min(defPower * K * 0.6, totalTroops(attacker)))
  }
  if (totalTroops(defender) <= 0 && totalTroops(attacker) > 0) {
    const defenderWasOwner = to.owner
    to.owner = attackerOwner
    to.spear = attacker.spear
    to.bow = attacker.bow
    to.cavalry = attacker.cavalry
    to.security = 20
    to.general = Math.random() < 0.3 ? to.general : makeWeakGarrisonGeneral()
    if (defenderWasOwner) adjustRelation(attackerOwner, defenderWasOwner, -25)
    pushTurnEvent(`${faction(attackerOwner).name}이(가) ${to.name}을(를) 점령했습니다.`)
    checkFactionSurvival(defenderWasOwner)
  } else {
    to.spear = defender.spear
    to.bow = defender.bow
    to.cavalry = defender.cavalry
    from.spear += attacker.spear
    from.bow += attacker.bow
    from.cavalry += attacker.cavalry
    pushTurnEvent(`${faction(attackerOwner).name}의 ${to.name} 공격이 격퇴되었습니다.`)
  }
}

let turnEvents = []
function pushTurnEvent(text) {
  turnEvents.push(text)
}

function endTurn() {
  if (state.phase !== 'map') return
  turnEvents = []

  for (const r of state.regions) {
    if (!r.owner) continue
    const f = faction(r.owner)
    f.gold += goldIncome(r)
    f.rice += riceIncome(r)
    r.security = clamp(r.security + (r.security < 70 ? 6 : 1), 0, 100)
    if (r.security < 30 && Math.random() < 0.12) {
      r.owner = null
      r.general = makeWeakGarrisonGeneral()
      r.security = 55
      pushTurnEvent(`치안 붕괴로 ${r.name}에서 반란이 일어나 독립했습니다!`)
    }
  }

  for (const a of FACTION_ORDER) {
    for (const b of FACTION_ORDER) {
      if (a >= b) continue
      const rel = relationOf(a, b)
      if (rel.pact && rel.pact !== 'alliance' && rel.pact !== 'marriage') {
        rel.pactTurns -= 1
        if (rel.pactTurns <= 0) {
          setPact(a, b, null, 0)
          pushTurnEvent(`${faction(a).name}와(과) ${faction(b).name}의 불가침이 만료되었습니다.`)
        }
      }
    }
  }

  for (const id of FACTION_ORDER) {
    if (id === 'player') continue
    runAiFaction(id)
  }

  if (turnEvents.length > 0) say(turnEvents.slice(0, 2).join(' / '))

  state.turnCount += 1
  state.season = (state.season + 1) % 4
  if (state.season === 0) state.year += 1

  checkVictoryConditions()
  if (state.phase === 'map') {
    state.selectedRegionId = null
    state.phase = 'turnStart'
  }
}

// ---------- Player actions ----------
function investDevelopment(regionId, kind) {
  const r = region(regionId)
  if (!r || r.owner !== 'player') return
  if (r[kind] >= 5) {
    say('이미 최대 단계입니다.')
    return
  }
  const cost = devCost(r[kind], kind === 'defense' ? 55 : 45)
  const f = faction('player')
  if (f.gold < cost) {
    say('금이 부족합니다.')
    return
  }
  f.gold -= cost
  r[kind] += 1
  say(`${r.name}: ${kind === 'agriculture' ? '농업' : kind === 'commerce' ? '상업' : '축성'} 투자 완료`)
}

function recruit(regionId, type) {
  const r = region(regionId)
  if (!r || r.owner !== 'player') return
  if (totalTroops(r) + RECRUIT_BATCH > troopCap(r)) {
    say('이 영지의 병력 상한에 도달했습니다. (농업을 올리면 상한이 늘어납니다)')
    return
  }
  const c = UNIT_COST[type]
  const f = faction('player')
  const goldCost = c.gold * RECRUIT_BATCH
  const riceCost = c.rice * RECRUIT_BATCH
  if (f.gold < goldCost || f.rice < riceCost) {
    say('금 또는 쌀이 부족합니다.')
    return
  }
  f.gold -= goldCost
  f.rice -= riceCost
  r[type] += RECRUIT_BATCH
  say(`${UNIT_LABEL[type]} ${RECRUIT_BATCH}명을 모병했습니다.`)
}

function beginAttackTargeting(regionId) {
  const r = region(regionId)
  if (!r || r.owner !== 'player') return
  if (totalTroops(r) < 10) {
    say('출진할 병력이 부족합니다.')
    return
  }
  state.attackFromId = regionId
  state.phase = 'targeting'
}

function cancelTargeting() {
  state.attackFromId = null
  state.phase = 'map'
}

// Reverse flow for the "이 영지로 출진" button: the player selected an
// enemy/neutral region first, so pick the strongest adjacent owned region
// to attack from instead of making them re-select it on the map.
function attackFromNeighbor(targetId) {
  const target = region(targetId)
  if (!target || target.owner === 'player') return
  if (target.owner && isProtected('player', target.owner)) {
    say('불가침/동맹 관계라 공격할 수 없습니다. (파기하려면 먼저 외교에서 확인하세요)')
    return
  }
  const ownedNeighborIds = NEIGHBORS[targetId].filter((id) => region(id).owner === 'player')
  if (ownedNeighborIds.length === 0) return
  const fromId = ownedNeighborIds.reduce((best, id) => (totalTroops(region(id)) > totalTroops(region(best)) ? id : best), ownedNeighborIds[0])
  if (totalTroops(region(fromId)) < 10) {
    say('출진할 병력이 부족합니다.')
    return
  }
  state.pendingAttack = { fromId, toId: targetId }
  state.phase = 'forceSelect'
}

function chooseAttackTarget(targetId) {
  const fromId = state.attackFromId
  if (!fromId) return
  if (!NEIGHBORS[fromId].includes(targetId)) return
  const target = region(targetId)
  if (target.owner === 'player') return
  if (target.owner && isProtected('player', target.owner)) {
    say('불가침/동맹 관계라 공격할 수 없습니다. (파기하려면 먼저 외교에서 확인하세요)')
    return
  }
  state.pendingAttack = { fromId, toId: targetId }
  state.phase = 'forceSelect'
}

function launchAttack(sendRatio) {
  const { fromId, toId } = state.pendingAttack
  const from = region(fromId)
  const sent = {
    spear: Math.round(from.spear * sendRatio),
    bow: Math.round(from.bow * sendRatio),
    cavalry: Math.round(from.cavalry * sendRatio),
  }
  if (totalTroops(sent) < 5) {
    say('보낼 병력이 너무 적습니다.')
    return
  }
  from.spear -= sent.spear
  from.bow -= sent.bow
  from.cavalry -= sent.cavalry
  if (region(toId).owner) breakPactIfNeeded('player', region(toId).owner)
  startBattle(fromId, toId, sent)
  state.attackFromId = null
  state.pendingAttack = null
}
function breakPactIfNeeded(a, b) {
  if (pactOf(a, b)) breakPactPenalty(a, b)
}

// ---------- Input ----------
const canvas = document.getElementById('game')
canvas.width = CANVAS_W
canvas.height = CANVAS_H
const ctx = canvas.getContext('2d')

function regionAt(mx, my) {
  for (const r of state.regions) {
    const d = Math.hypot(mx - r.x - MAP_X0, my - r.y - MAP_Y0)
    if (d < 30) return r
  }
  return null
}

function bottomButtons() {
  const list = []
  const y0 = BOTTOM_Y0 + 8
  if (state.phase === 'map' && state.selectedRegionId) {
    const r = region(state.selectedRegionId)
    const isMine = r.owner === 'player'
    const isNeighborMine = NEIGHBORS[r.id].some((id) => region(id).owner === 'player')
    let x = 16
    if (isMine) {
      list.push({ id: 'dev_agri', label: `농업 투자 (${devCost(r.agriculture, 45)}금)`, x, y: y0, w: 150, h: 26 })
      x += 158
      list.push({ id: 'dev_comm', label: `상업 투자 (${devCost(r.commerce, 45)}금)`, x, y: y0, w: 150, h: 26 })
      x += 158
      list.push({ id: 'dev_def', label: `축성 (${devCost(r.defense, 55)}금)`, x, y: y0, w: 140, h: 26 })
      const y1 = y0 + 32
      list.push({ id: 'recruit_spear', label: `창병 모병 (+${RECRUIT_BATCH})`, x: 16, y: y1, w: 140, h: 26 })
      list.push({ id: 'recruit_bow', label: `궁병 모병 (+${RECRUIT_BATCH})`, x: 164, y: y1, w: 140, h: 26 })
      list.push({ id: 'recruit_cav', label: `기병 모병 (+${RECRUIT_BATCH})`, x: 312, y: y1, w: 140, h: 26 })
      const y2 = y1 + 32
      list.push({ id: 'attack', label: '출진', x: 16, y: y2, w: 100, h: 28 })
    } else if (isNeighborMine) {
      list.push({ id: 'attack_from_neighbor', label: '이 영지로 출진 (인접한 내 영지에서)', x: 16, y: y0, w: 260, h: 28 })
    }
  }
  if (state.phase === 'targeting') {
    list.push({ id: 'cancel_target', label: '출진 취소', x: 16, y: y0, w: 120, h: 28 })
  }
  if (state.phase === 'forceSelect') {
    list.push({ id: 'send_30', label: '소수 정예 (30%)', x: 16, y: y0, w: 150, h: 30 })
    list.push({ id: 'send_60', label: '절반 출진 (60%)', x: 176, y: y0, w: 150, h: 30 })
    list.push({ id: 'send_100', label: '전군 출진 (100%)', x: 336, y: y0, w: 150, h: 30 })
    list.push({ id: 'cancel_force', label: '취소', x: 496, y: y0, w: 90, h: 30 })
  }
  if (state.phase === 'battle' && state.battle && !state.battle.resolved && state.battle.side === 'player') {
    list.push({ id: 'end_battle_turn', label: '턴 종료', x: 16, y: y0 + 70, w: 110, h: 30 })
  }
  if (state.phase === 'battle' && state.battle && state.battle.resolved) {
    list.push({ id: 'close_battle', label: '계속 ▶', x: 16, y: y0 + 70, w: 110, h: 30 })
  }
  if (state.phase === 'map') {
    list.push({ id: 'end_turn', label: `턴 종료 (${SEASON_NAMES[state.season]} ${state.year}년)`, x: CANVAS_W - 200, y: BOTTOM_Y0 + 8, w: 184, h: 30 })
  }
  if (state.phase === 'diplomacy') {
    const fid = state.diplomacyFactionId
    let y = y0
    for (const kind of ['nonaggression', 'alliance', 'marriage']) {
      const info = proposalInfo(kind)
      list.push({ id: `propose_${kind}`, label: `${info.label} (${info.cost}금)`, x: 16, y, w: 220, h: 26 })
      y += 32
    }
    list.push({ id: 'close_diplomacy', label: '닫기', x: 16, y, w: 100, h: 26 })
  }
  return list
}

function handleBottomClick(id) {
  if (id === 'dev_agri') investDevelopment(state.selectedRegionId, 'agriculture')
  else if (id === 'dev_comm') investDevelopment(state.selectedRegionId, 'commerce')
  else if (id === 'dev_def') investDevelopment(state.selectedRegionId, 'defense')
  else if (id === 'recruit_spear') recruit(state.selectedRegionId, 'spear')
  else if (id === 'recruit_bow') recruit(state.selectedRegionId, 'bow')
  else if (id === 'recruit_cav') recruit(state.selectedRegionId, 'cavalry')
  else if (id === 'attack') beginAttackTargeting(state.selectedRegionId)
  else if (id === 'attack_from_neighbor') attackFromNeighbor(state.selectedRegionId)
  else if (id === 'cancel_target') cancelTargeting()
  else if (id === 'send_30') launchAttack(0.3)
  else if (id === 'send_60') launchAttack(0.6)
  else if (id === 'send_100') launchAttack(1.0)
  else if (id === 'cancel_force') {
    state.pendingAttack = null
    state.phase = 'map'
  } else if (id === 'end_battle_turn') {
    endPlayerBattleTurn(state.battle)
  } else if (id === 'close_battle') {
    finishBattle()
  } else if (id === 'end_turn') endTurn()
  else if (id === 'propose_nonaggression') proposePact('player', state.diplomacyFactionId, 'nonaggression')
  else if (id === 'propose_alliance') proposePact('player', state.diplomacyFactionId, 'alliance')
  else if (id === 'propose_marriage') proposePact('player', state.diplomacyFactionId, 'marriage')
  else if (id === 'close_diplomacy') {
    state.diplomacyFactionId = null
    state.phase = 'map'
  }
}

function rankingRowAt(mx, my) {
  const x0 = PANEL_X0 + 10
  let y = MAP_Y0 + 150
  for (const id of FACTION_ORDER) {
    if (id === 'player') {
      y += 24
      continue
    }
    if (mx >= x0 && mx <= x0 + PANEL_W - 20 && my >= y - 14 && my <= y + 6) return id
    y += 24
  }
  return null
}

canvas.addEventListener('click', (e) => {
  ensureAudio()
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY

  if (state.phase === 'title') {
    state.phase = 'intro'
    return
  }
  if (state.phase === 'intro') {
    state.phase = 'turnStart'
    return
  }
  if (state.phase === 'turnStart') {
    state.phase = 'map'
    return
  }
  if (state.phase === 'ending') {
    return
  }

  const btn = bottomButtons().find((b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h)
  if (btn) {
    handleBottomClick(btn.id)
    return
  }

  if (state.phase === 'map') {
    const rid = rankingRowAt(mx, my)
    if (rid) {
      state.diplomacyFactionId = rid
      state.phase = 'diplomacy'
      return
    }
    const r = regionAt(mx, my)
    state.selectedRegionId = r ? r.id : null
    return
  }
  if (state.phase === 'battle' && state.battle && !state.battle.resolved && state.battle.side === 'player') {
    const gx = Math.floor((mx - GRID_X0) / TILE_W)
    const gy = Math.floor((my - GRID_Y0) / TILE_H)
    if (gx >= 0 && gx < GRID_COLS && gy >= 0 && gy < GRID_ROWS) {
      handleBattleGridClick(state.battle, gx, gy)
    }
    return
  }
  if (state.phase === 'targeting') {
    const r = regionAt(mx, my)
    if (r) chooseAttackTarget(r.id)
    return
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') {
    state = makeInitialState()
  }
})

// ---------- Rendering ----------
function worldToCanvas(r) {
  return { x: r.x + MAP_X0, y: r.y + MAP_Y0 }
}

function territoryPath(cx, cy, shape) {
  ctx.beginPath()
  shape.forEach(([dx, dy], i) => {
    const x = cx + dx
    const y = cy + dy
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

function drawMapGrid() {
  ctx.strokeStyle = 'rgba(139, 115, 70, 0.25)'
  ctx.lineWidth = 1
  for (let x = 0; x <= CANVAS_W; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CANVAS_H)
    ctx.stroke()
  }
  for (let y = 0; y <= CANVAS_H; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_W, y)
    ctx.stroke()
  }
}

function drawBackground() {
  // parchment-style map instead of a flat dark panel
  ctx.fillStyle = '#e8dcbb'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  drawMapGrid()
}

function factionColor(ownerId) {
  return ownerId ? FACTIONS[ownerId].color : NEUTRAL_COLOR
}

function drawMap() {
  ctx.strokeStyle = 'rgba(90, 70, 40, 0.45)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 5])
  for (const [a, b] of ADJACENCY_PAIRS) {
    const pa = worldToCanvas(region(a))
    const pb = worldToCanvas(region(b))
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  const validTargets = state.phase === 'targeting' ? NEIGHBORS[state.attackFromId] : null

  for (const r of state.regions) {
    const p = worldToCanvas(r)
    const isSelected = state.selectedRegionId === r.id || state.attackFromId === r.id
    const isValidTarget = validTargets && validTargets.includes(r.id) && r.owner !== 'player'

    territoryPath(p.x, p.y, r.shape)
    ctx.fillStyle = factionColor(r.owner)
    ctx.fill()
    ctx.lineWidth = isSelected ? 4 : isValidTarget ? 3 : 2.5
    ctx.strokeStyle = isValidTarget ? '#ffe066' : isSelected ? '#fff' : '#2a2017'
    ctx.stroke()

    if (r.defense > 0) {
      ctx.fillStyle = '#8a5a12'
      for (let i = 0; i < r.defense; i++) {
        ctx.beginPath()
        ctx.arc(p.x - 20 + i * 10, p.y - 56, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.textAlign = 'center'
    ctx.fillStyle = '#2b2317'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(r.name, p.x, p.y - 44)

    ctx.font = 'bold 11px sans-serif'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.strokeText(`${totalTroops(r)}`, p.x, p.y + 4)
    ctx.fillStyle = '#fff'
    ctx.fillText(`${totalTroops(r)}`, p.x, p.y + 4)

    ctx.fillStyle = 'rgba(43,35,23,0.65)'
    ctx.font = '9px sans-serif'
    ctx.fillText(TERRAIN_LABEL[r.terrain], p.x, p.y + 50)
  }
}

function drawHud() {
  ctx.fillStyle = 'rgba(43, 35, 23, 0.88)'
  ctx.fillRect(0, 0, 230, 54)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(`${state.year}년 ${SEASON_NAMES[state.season]} (${state.turnCount}/${MAX_SEASONS})`, 16, 26)
  const f = faction('player')
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#ffe066'
  ctx.fillText(`금 ${Math.floor(f.gold)}`, 16, 46)
  ctx.fillStyle = '#9fe08a'
  ctx.fillText(`쌀 ${Math.floor(f.rice)}`, 100, 46)
}

function drawRankingPanel() {
  const x0 = PANEL_X0
  ctx.fillStyle = '#2b2317'
  ctx.fillRect(x0, MAP_Y0, PANEL_W, MAP_H)
  ctx.strokeStyle = '#c9a85c'
  ctx.lineWidth = 2
  ctx.strokeRect(x0, MAP_Y0, PANEL_W, MAP_H)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('천하 정세', x0 + 10, MAP_Y0 + 20)

  const ranking = FACTION_ORDER.map((id) => ({ id, count: regionCountFor(id) })).sort((a, b) => b.count - a.count)
  let y = MAP_Y0 + 44
  for (const row of ranking) {
    const f = faction(row.id)
    ctx.fillStyle = f.alive ? f.color : '#555'
    ctx.beginPath()
    ctx.arc(x0 + 16, y - 5, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = f.alive ? '#fff' : '#888'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${f.name}${f.alive ? '' : ' (멸망)'} - ${row.count}개 영지`, x0 + 28, y)
    y += 22
  }

  y += 14
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText('외교 (클릭)', x0 + 10, y)
  y += 6
  for (const id of FACTION_ORDER) {
    if (id === 'player') continue
    y += 24
    const f = faction(id)
    const rel = relationOf('player', id)
    ctx.fillStyle = f.alive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'
    ctx.fillRect(x0 + 10, y - 16, PANEL_W - 20, 20)
    ctx.fillStyle = f.alive ? '#fff' : '#777'
    ctx.font = '11px sans-serif'
    const pactLabel = rel.pact ? ` [${rel.pact === 'nonaggression' ? '불가침' : rel.pact === 'alliance' ? '동맹' : '혼인'}]` : ''
    ctx.fillText(`${f.name} 관계 ${rel.score}${pactLabel}`, x0 + 16, y - 2)
  }

  if (state.selectedRegionId) {
    const r = region(state.selectedRegionId)
    let ry = y + 34
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`${r.name} 상세`, x0 + 10, ry)
    ry += 18
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#ddd'
    const lines = [
      `소유: ${r.owner ? faction(r.owner).name : '독립'} / 지형: ${TERRAIN_LABEL[r.terrain]}`,
      `농업 Lv${r.agriculture} 상업 Lv${r.commerce} 축성 Lv${r.defense}`,
      `치안 ${r.security}`,
      `창${r.spear} 궁${r.bow} 기${r.cavalry} (상한 ${troopCap(r)})`,
      `장수: ${r.general.name} (통솔${r.general.lead}/정치${r.general.pol}/지략${r.general.int})`,
    ]
    for (const line of lines) {
      ctx.fillText(line, x0 + 10, ry)
      ry += 16
    }
  }
}

function drawBottomPanel() {
  ctx.fillStyle = '#2b2317'
  ctx.fillRect(0, BOTTOM_Y0, CANVAS_W, BOTTOM_H)
  ctx.strokeStyle = '#c9a85c'
  ctx.lineWidth = 2
  ctx.strokeRect(0, BOTTOM_Y0, CANVAS_W, BOTTOM_H)

  if (state.phase === 'battle' && state.battle) {
    drawBattlePanel()
    return
  }
  if (state.phase === 'diplomacy') {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${faction(state.diplomacyFactionId).name}과(와)의 외교`, 16, BOTTOM_Y0 + 2)
  }
  if (state.phase === 'forceSelect') {
    const { fromId, toId } = state.pendingAttack
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(`${region(fromId).name} → ${region(toId).name} 출진 규모 선택`, 16, BOTTOM_Y0 + 2)
  }
  if (state.phase === 'targeting') {
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('공격할 인접 영지를 지도에서 클릭하세요 (노란 테두리)', 16, BOTTOM_Y0 + 2)
  }

  for (const btn of bottomButtons()) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 5)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 4)
  }

  if (state.phase === 'map' && !state.selectedRegionId) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('지도에서 영지를 클릭해 내정/모병/출진하세요. 오른쪽 세력 이름을 클릭하면 외교 창이 열립니다.', 16, BOTTOM_Y0 + 2)
  }
}

function drawSquadToken(b, squad) {
  const p = tileCenter(squad.gx, squad.gy)
  const color = squad.side === 'attacker' ? factionColor(b.attackerOwner) : factionColor(b.defenderOwner)
  const isSelected = squad.id === b.selectedSquadId
  const isAttackable = b.attackableIds.includes(squad.id)

  ctx.beginPath()
  ctx.arc(p.x, p.y, 20, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = isSelected ? 3.5 : isAttackable ? 3 : 2
  ctx.strokeStyle = isAttackable ? '#ff5a5a' : isSelected ? '#fff' : '#2a2017'
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(UNIT_ICON_LABEL[squad.type], p.x, p.y - 2)
  ctx.font = 'bold 10px sans-serif'
  ctx.fillText(`${squad.count}`, p.x, p.y + 11)

  if (squad.acted) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFloatingTexts() {
  ctx.textAlign = 'center'
  for (const f of floatingTexts) {
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1)
    ctx.fillStyle = f.color
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1
}

function drawBattleScene() {
  const b = state.battle
  const from = region(b.fromId)
  const to = region(b.toId)

  const grad = ctx.createLinearGradient(MAP_X0, MAP_Y0, MAP_X0, MAP_Y0 + MAP_H)
  grad.addColorStop(0, '#3a2a1c')
  grad.addColorStop(1, '#1c140d')
  ctx.fillStyle = grad
  ctx.fillRect(MAP_X0, MAP_Y0, MAP_W, MAP_H)
  ctx.strokeStyle = 'rgba(200,160,90,0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(MAP_X0, MAP_Y0, MAP_W, MAP_H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe9b8'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(`${from.name} vs ${to.name} (${TERRAIN_LABEL[to.terrain]})`, MAP_X0 + MAP_W / 2, MAP_Y0 + 22)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '12px sans-serif'
  ctx.fillText(`${b.turn} / ${b.maxTurns}턴 · ${b.side === 'player' ? '아군 턴' : '적군 턴'}`, MAP_X0 + MAP_W / 2, MAP_Y0 + 42)

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  for (let x = 0; x <= GRID_COLS; x++) {
    ctx.beginPath()
    ctx.moveTo(GRID_X0 + x * TILE_W, GRID_Y0)
    ctx.lineTo(GRID_X0 + x * TILE_W, GRID_Y0 + GRID_ROWS * TILE_H)
    ctx.stroke()
  }
  for (let y = 0; y <= GRID_ROWS; y++) {
    ctx.beginPath()
    ctx.moveTo(GRID_X0, GRID_Y0 + y * TILE_H)
    ctx.lineTo(GRID_X0 + GRID_COLS * TILE_W, GRID_Y0 + y * TILE_H)
    ctx.stroke()
  }

  if (b.mode === 'moving') {
    ctx.fillStyle = 'rgba(95, 170, 255, 0.28)'
    for (const t of b.moveRangeTiles) {
      ctx.fillRect(GRID_X0 + t.x * TILE_W + 2, GRID_Y0 + t.y * TILE_H + 2, TILE_W - 4, TILE_H - 4)
    }
  }
  if (b.mode === 'targeting') {
    ctx.fillStyle = 'rgba(255, 70, 70, 0.3)'
    for (const sq of b.squads) {
      if (!b.attackableIds.includes(sq.id)) continue
      ctx.fillRect(GRID_X0 + sq.gx * TILE_W + 2, GRID_Y0 + sq.gy * TILE_H + 2, TILE_W - 4, TILE_H - 4)
    }
  }

  for (const sq of b.squads) {
    if (sq.count <= 0) continue
    drawSquadToken(b, sq)
  }

  drawFloatingTexts()
}

function drawBattlePanel() {
  const b = state.battle
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(
    `${region(b.fromId).name} 공격군 vs ${region(b.toId).name} 수비군 - ${b.turn}/${b.maxTurns}턴`,
    16,
    BOTTOM_Y0 + 2,
  )

  ctx.font = '11px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  let hint = ''
  if (b.resolved) hint = ''
  else if (b.side !== 'player') hint = '적군이 행동 중입니다...'
  else if (b.mode === 'select') hint = '병력을 클릭해 이동·공격하세요 (창은 기병에, 기병은 궁병에, 궁병은 창병에 강함)'
  else if (b.mode === 'moving') hint = '이동할 칸을 클릭하세요. 궁병은 사거리 2, 나머지는 사거리 1'
  else if (b.mode === 'targeting') hint = '공격할 적(빨간 칸)을 클릭하세요'
  ctx.fillText(hint, 16, BOTTOM_Y0 + 20)

  if (b.resolved) {
    ctx.fillStyle = b.outcome === 'attacker' ? '#9fe08a' : '#ff9f9f'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(b.outcome === 'attacker' ? '승리! 영지를 점령했습니다.' : '패배... 병력을 물렸습니다.', 16, BOTTOM_Y0 + 40)
  }

  for (const btn of bottomButtons()) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 5)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 4)
  }
}

function drawToast() {
  if (!state.toast || toastTimer <= 0) return
  const w = Math.min(760, ctx.measureText(state.toast).width + 40)
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(CANVAS_W / 2 - w / 2, 8, w, 28)
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(state.toast, CANVAS_W / 2, 27)
}

function drawTitle() {
  ctx.fillStyle = '#231b12'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 40px sans-serif'
  ctx.fillText('천하제패', CANVAS_W / 2, CANVAS_H / 2 - 30)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.fillText('클릭하여 시작', CANVAS_W / 2, CANVAS_H / 2 + 20)
}

function drawIntro() {
  ctx.fillStyle = '#231b12'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText('후한 말, 군웅할거의 시대', CANVAS_W / 2, 60)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#fff'
  const lines = [
    '목표: 7개 영지를 모두 통일하거나, 40계절(10년) 뒤 가장 강한 세력이 되면 승리입니다.',
    '매 계절(턴)마다 내정(농업/상업/축성), 외교(불가침/동맹/혼인동맹), 군사(모병/출진) 중 원하는 만큼 행동할 수 있습니다.',
    '전투는 격자 위에서 병력을 이동시켜 벌입니다 - 창은 기병에, 기병은 궁병에, 궁병은 창병에 강합니다.',
    '궁병은 사거리 2에서 반격 없이 공격할 수 있고, 장수의 통솔과 지형(산악은 수비에 유리)이 승패를 가릅니다.',
    '치안이 낮은 영지는 반란으로 독립할 수 있으니 점령 직후엔 내정을 신경 쓰세요.',
    '오른쪽 "천하 정세" 패널에서 항상 각 세력의 영지 수와 관계를 확인할 수 있습니다.',
    '매 턴이 시작되면 부관이 먼저 다음 행동을 묻습니다.',
    '',
    '조작: 영지 클릭으로 선택·행동, 세력 이름 클릭으로 외교, 하단 버튼으로 턴 종료',
  ]
  lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, 100 + i * 26))
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('클릭하여 시작', CANVAS_W / 2, CANVAS_H - 30)
}

function drawEnding() {
  ctx.fillStyle = 'rgba(10,8,4,0.85)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  const lines = (state.gameOverText || '').split('\n')
  lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, CANVAS_H / 2 - 40 + i * 30))
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#ccc'
  ctx.fillText('R 키를 눌러 다시 시작', CANVAS_W / 2, CANVAS_H / 2 + 90)
}

// ---------- Advisor scene (turn start) ----------
function drawAdvisor(cx, baseY) {
  const OUTLINE = '#2a2017'
  const t = performance.now() / 1000

  // kimono body + layered collar
  ctx.beginPath()
  ctx.moveTo(cx - 34, baseY + 10)
  ctx.lineTo(cx - 20, baseY - 40)
  ctx.lineTo(cx + 20, baseY - 40)
  ctx.lineTo(cx + 34, baseY + 10)
  ctx.closePath()
  ctx.fillStyle = '#7a2e2e'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // winged shoulders (kataginu)
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + s * 12, baseY - 40)
    ctx.lineTo(cx + s * 40, baseY - 36)
    ctx.lineTo(cx + s * 30, baseY - 14)
    ctx.lineTo(cx + s * 16, baseY - 22)
    ctx.closePath()
    ctx.fillStyle = '#a63a3a'
    ctx.fill()
    ctx.lineWidth = 1.8
    ctx.stroke()
  }
  // inner collar (white, then gold edge) forming a deep V
  ctx.beginPath()
  ctx.moveTo(cx - 12, baseY - 40)
  ctx.lineTo(cx, baseY - 18)
  ctx.lineTo(cx + 12, baseY - 40)
  ctx.lineTo(cx + 7, baseY - 40)
  ctx.lineTo(cx, baseY - 28)
  ctx.lineTo(cx - 7, baseY - 40)
  ctx.closePath()
  ctx.fillStyle = '#f2ead8'
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#c9a85c'
  ctx.stroke()
  // family crest
  ctx.beginPath()
  ctx.arc(cx, baseY - 4, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#f2ead8'
  ctx.fill()
  ctx.strokeStyle = '#7a2e2e'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(cx, baseY - 4, 3, 0, Math.PI * 2)
  ctx.stroke()
  // sash
  ctx.fillStyle = '#2a2a44'
  ctx.fillRect(cx - 24, baseY - 14, 48, 6)

  // neck + head
  const hy = baseY - 56
  ctx.fillStyle = '#d9a97c'
  ctx.fillRect(cx - 5, baseY - 44, 10, 8)
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + s * 15.5, hy + 1, 2.8, 4, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#e8b98a'
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(cx, hy, 16, 0, Math.PI * 2)
  ctx.fillStyle = '#e8b98a'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  // hair: shaved front with topknot (chonmage) and side locks
  ctx.fillStyle = '#1c1c1c'
  ctx.beginPath()
  ctx.arc(cx, hy - 3, 16, Math.PI * 1.05, Math.PI * 1.95)
  ctx.lineTo(cx + 9, hy - 12)
  ctx.quadraticCurveTo(cx, hy - 16, cx - 9, hy - 12)
  ctx.closePath()
  ctx.fill()
  for (const s of [-1, 1]) ctx.fillRect(cx + s * 15 - 1.5, hy - 8, 3, 10)
  ctx.beginPath()
  ctx.ellipse(cx + 2, hy - 22, 6, 3.2, -0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(cx - 1, hy - 19, 4, 5)
  ctx.fillStyle = '#c9a85c' // hair tie
  ctx.fillRect(cx - 1.5, hy - 15.5, 5, 1.8)

  // eyes
  const blink = (t % 4.6) > 4.45
  for (const s of [-1, 1]) {
    const ex = cx + s * 6
    if (blink) {
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(ex - 3.2, hy + 1); ctx.lineTo(ex + 3.2, hy + 1); ctx.stroke()
      continue
    }
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.ellipse(ex, hy + 1, 3.4, 2.6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    ctx.fillStyle = '#3a2a1c'
    ctx.beginPath(); ctx.arc(ex - s * 0.4, hy + 1, 1.9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(ex - s * 0.4 + 0.8, hy + 0.2, 0.6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(ex - 3.6, hy - 1.4); ctx.lineTo(ex + 3.6, hy - 1.4 - s * -0.0); ctx.stroke()
  }
  // thin, composed brows (inner ends slightly lowered = stern)
  ctx.strokeStyle = '#1c1c1c'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + s * 2.5, hy - 5)
    ctx.lineTo(cx + s * 9.5, hy - 6.8)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  // nose, moustache, mouth, light beard
  ctx.strokeStyle = 'rgba(120,70,50,0.8)'
  ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.moveTo(cx - 1, hy + 3); ctx.quadraticCurveTo(cx - 3, hy + 8, cx + 1, hy + 8); ctx.stroke()
  ctx.fillStyle = '#1c1c1c'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx, hy + 9.5)
    ctx.quadraticCurveTo(cx + s * 6, hy + 8, cx + s * 11, hy + 12)
    ctx.quadraticCurveTo(cx + s * 6, hy + 11.5, cx, hy + 11)
    ctx.fill()
  }
  ctx.strokeStyle = '#7a3a3a'
  ctx.lineWidth = 1.4
  ctx.beginPath(); ctx.moveTo(cx - 3.5, hy + 13); ctx.quadraticCurveTo(cx, hy + 14.5, cx + 3.5, hy + 13); ctx.stroke()
  ctx.fillStyle = '#1c1c1c'
  ctx.beginPath(); ctx.moveTo(cx - 3, hy + 15.2); ctx.lineTo(cx + 3, hy + 15.2); ctx.lineTo(cx, hy + 21); ctx.closePath(); ctx.fill()
}

function drawAdvisorScene() {
  ctx.fillStyle = 'rgba(20, 15, 8, 0.6)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  const panelW = 640
  const panelH = 150
  const panelX = CANVAS_W / 2 - panelW / 2
  const panelY = CANVAS_H - panelH - 50

  ctx.fillStyle = '#2b2317'
  ctx.fillRect(panelX, panelY, panelW, panelH)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#c9a85c'
  ctx.strokeRect(panelX, panelY, panelW, panelH)

  drawAdvisor(panelX + 80, panelY - 6)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe9b8'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText('부관', panelX + 160, panelY + 32)

  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.fillText(`주공, ${state.year}년 ${SEASON_NAMES[state.season]}이 시작되었습니다.`, panelX + 160, panelY + 64)
  ctx.fillText('무엇을 하시겠습니까?', panelX + 160, panelY + 90)

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '12px sans-serif'
  ctx.fillText('(클릭하여 계속)', panelX + 160, panelY + 118)
}

function render() {
  if (toastTimer > 0) toastTimer -= 1 / 60
  updateFloatingTexts()
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  if (state.phase === 'title') return drawTitle()
  if (state.phase === 'intro') return drawIntro()
  if (state.phase === 'ending') return drawEnding()

  drawBackground()
  if (state.phase === 'battle' && state.battle) drawBattleScene()
  else drawMap()
  drawHud()
  drawRankingPanel()
  drawBottomPanel()
  drawToast()

  if (state.phase === 'turnStart') drawAdvisorScene()
}

function loop() {
  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
