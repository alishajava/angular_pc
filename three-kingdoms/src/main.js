// 군웅할거 (Warlords) — small-scale turn-based regional conquest, Three
// Kingdoms-flavored. A collapsed dynasty leaves 7 regions in play; the
// player governs one and tries to reunify the land before being wiped out.
//
// Two layers: the strategic map (regions, income, recruiting, moving
// armies - resolved turn by turn) and a tactical battle grid (small
// squad-based skirmish) that opens whenever the PLAYER is attacker or
// defender. AI-vs-AI and AI-vs-neutral fights are auto-resolved by troop
// comparison so the player isn't stuck watching battles they have no part
// in.

const canvas = document.getElementById('game')
canvas.width = 900
canvas.height = 600
const ctx = canvas.getContext('2d')

const MAP_W = 600
const COLORS = {
  player: '#4fa8ff',
  factionB: '#d1553f',
  factionC: '#55b86a',
  neutral: '#8a8a8a',
}
const FACTION_NAME = {
  player: '나',
  factionB: '업성 세력',
  factionC: '강릉 세력',
  neutral: '무소속',
}

// --- Regions ---------------------------------------------------------
const REGIONS = [
  { id: 0, name: '낙양', x: 150, y: 300, owner: 'player', troops: 10, income: 15 },
  { id: 1, name: '장안', x: 80, y: 150, owner: 'neutral', troops: 3, income: 8 },
  { id: 2, name: '업성', x: 300, y: 100, owner: 'factionB', troops: 10, income: 15 },
  { id: 3, name: '허창', x: 330, y: 330, owner: 'neutral', troops: 3, income: 10 },
  { id: 4, name: '강릉', x: 480, y: 440, owner: 'factionC', troops: 10, income: 15 },
  { id: 5, name: '성도', x: 150, y: 480, owner: 'neutral', troops: 3, income: 8 },
  { id: 6, name: '건업', x: 480, y: 180, owner: 'neutral', troops: 3, income: 10 },
]
const EDGES = [
  [0, 1], [0, 3], [0, 5],
  [1, 2],
  [2, 3], [2, 6],
  [3, 4], [3, 5],
  [4, 5], [4, 6],
]
const NEIGHBORS = {}
for (const r of REGIONS) NEIGHBORS[r.id] = []
for (const [a, b] of EDGES) {
  NEIGHBORS[a].push(b)
  NEIGHBORS[b].push(a)
}

const RECRUIT_COST = 15
const RECRUIT_AMOUNT = 3

function cloneRegions() {
  return REGIONS.map((r) => ({ ...r }))
}

// --- Game state --------------------------------------------------------
function makeInitialState() {
  return {
    phase: 'title', // title | intro | map | battle | win | lose
    regions: cloneRegions(),
    gold: 60,
    turn: 1,
    selected: null,
    toast: null,
    battle: null,
  }
}
let state = makeInitialState()
let elapsed = 0

function regionById(id) {
  return state.regions.find((r) => r.id === id)
}

function say(text) {
  state.toast = { text, until: elapsed + 2.4 }
}

function ownedBy(owner) {
  return state.regions.filter((r) => r.owner === owner)
}

// --- Battle (tactic duel) -------------------------------------------------
// Each round both sides pick one of three tactics, revealed simultaneously,
// rock-paper-scissors style: 돌격(charge) beats 기습(ambush), 기습 beats
// 수비(defend), 수비 beats 돌격. Winning the matchup roughly triples your
// casualties dealt vs taken that round; a tie is a plain trade. Whoever's
// army is bigger still deals more absolute damage (it scales off your own
// current troop count), so a lopsided fight is still over in one round
// regardless of which tactic you pick - the tactic choice is what decides
// close fights, not who clicks fastest through a side-by-side squad crawl.
const MAX_ROUNDS = 6
const TACTICS = ['charge', 'ambush', 'defend']
const TACTIC_INFO = {
  charge: { label: '돌격', beats: 'ambush' },
  ambush: { label: '기습', beats: 'defend' },
  defend: { label: '수비', beats: 'charge' },
}

function startBattle(attackerRegionId, defenderRegionId, attackerIsPlayer) {
  const atk = regionById(attackerRegionId)
  const def = regionById(defenderRegionId)
  state.battle = {
    attackerRegionId,
    defenderRegionId,
    attackerIsPlayer,
    attackerOwner: atk.owner,
    defenderOwner: def.owner,
    attackerTroops: atk.troops,
    defenderTroops: def.troops,
    initialAttackerTroops: atk.troops,
    initialDefenderTroops: def.troops,
    round: 1,
    lastResult: null,
    log: attackerIsPlayer ? '내 군대가 공격을 시작했다. 전술을 선택하세요.' : `${def.name}이(가) 침공당했다! 전술을 선택해 수비하라.`,
  }
  state.phase = 'battle'
}

function humanTroops() {
  const b = state.battle
  return b.attackerIsPlayer ? b.attackerTroops : b.defenderTroops
}
function aiTroops() {
  const b = state.battle
  return b.attackerIsPlayer ? b.defenderTroops : b.attackerTroops
}
function setHumanTroops(v) {
  const b = state.battle
  if (b.attackerIsPlayer) b.attackerTroops = v
  else b.defenderTroops = v
}
function setAiTroops(v) {
  const b = state.battle
  if (b.attackerIsPlayer) b.defenderTroops = v
  else b.attackerTroops = v
}

// Light personality rather than pure chance: favors defending when
// outnumbered and charging when ahead, random otherwise.
function pickAiTactic() {
  const hp = humanTroops()
  const ap = aiTroops()
  const roll = Math.random()
  if (ap < hp * 0.7) return roll < 0.55 ? 'defend' : TACTICS[Math.floor(Math.random() * 3)]
  if (ap > hp * 1.3) return roll < 0.55 ? 'charge' : TACTICS[Math.floor(Math.random() * 3)]
  return TACTICS[Math.floor(Math.random() * 3)]
}

// From humanChoice's perspective.
function matchupOutcome(humanChoice, aiChoice) {
  if (humanChoice === aiChoice) return 'tie'
  return TACTIC_INFO[humanChoice].beats === aiChoice ? 'win' : 'lose'
}

function finishBattle() {
  const b = state.battle
  const atkRegion = regionById(b.attackerRegionId)
  const defRegion = regionById(b.defenderRegionId)
  const defenderWasPlayer = defRegion.owner === 'player'
  const attackerWins = b.attackerTroops > b.defenderTroops

  if (attackerWins) {
    defRegion.owner = b.attackerOwner
    defRegion.troops = Math.max(1, Math.round(b.attackerTroops))
    atkRegion.troops = 0
    if (b.attackerIsPlayer) say(`${defRegion.name}을(를) 점령했다!`)
    else if (defenderWasPlayer) say(`${defRegion.name}을(를) 빼앗겼다...`)
  } else {
    defRegion.troops = Math.max(1, Math.round(b.defenderTroops))
    atkRegion.troops = 0
    if (b.attackerIsPlayer) say(`${defRegion.name} 공략에 실패했다...`)
    else if (defenderWasPlayer) say(`${defRegion.name}을(를) 지켜냈다!`)
  }

  state.battle = null
  state.phase = 'map'
  checkWinLose()
}

function chooseTactic(humanChoice) {
  const b = state.battle
  if (!b) return
  const aiChoice = pickAiTactic()
  const outcome = matchupOutcome(humanChoice, aiChoice)
  const hp = humanTroops()
  const ap = aiTroops()
  const humanRate = outcome === 'win' ? 0.45 : outcome === 'lose' ? 0.18 : 0.3
  const aiRate = outcome === 'win' ? 0.18 : outcome === 'lose' ? 0.45 : 0.3
  const dmgToAi = Math.max(1, Math.round(hp * humanRate))
  const dmgToHuman = Math.max(1, Math.round(ap * aiRate))
  setAiTroops(Math.max(0, ap - dmgToAi))
  setHumanTroops(Math.max(0, hp - dmgToHuman))

  const verb = outcome === 'win' ? '내 전술이 적중했다!' : outcome === 'lose' ? '적 전술에 당했다...' : '팽팽하게 맞붙었다.'
  b.lastResult = { humanChoice, aiChoice, outcome, dmgToAi, dmgToHuman }
  b.log = `나: ${TACTIC_INFO[humanChoice].label} vs 적: ${TACTIC_INFO[aiChoice].label} — ${verb} (적 피해 ${dmgToAi} · 내 피해 ${dmgToHuman})`

  if (aiTroops() <= 0 || humanTroops() <= 0 || b.round >= MAX_ROUNDS) {
    finishBattle()
    return
  }
  b.round += 1
}

// --- Map actions ---------------------------------------------------------
// Conquests from AI-vs-AI/neutral fights (the only thing autoResolveBattle
// handles - a player-involved fight goes through startBattle/finishBattle
// instead, which already toasts its own outcome) used to happen completely
// silently: the player would end their turn, and regions would just be
// owned by someone else with no explanation. turnEvents collects those
// conquests so endTurn can summarize them in one toast.
let turnEvents = []

function autoResolveBattle(attackerId, defenderId) {
  const atk = regionById(attackerId)
  const def = regionById(defenderId)
  const atkPower = atk.troops * (0.85 + Math.random() * 0.3)
  const defPower = def.troops * (0.85 + Math.random() * 0.3) * 1.1 // defender's home-ground edge
  if (atkPower > defPower) {
    const defName = def.name
    turnEvents.push(`${FACTION_NAME[atk.owner]}이(가) ${defName}을(를) 점령`)
    def.owner = atk.owner
    def.troops = Math.max(1, Math.round(atk.troops - def.troops * 0.5))
  } else {
    def.troops = Math.max(1, Math.round(def.troops - atk.troops * 0.5))
  }
  atk.troops = 0
}

function moveOrAttack(sourceId, targetId) {
  const source = regionById(sourceId)
  const target = regionById(targetId)
  if (source.troops <= 0) return
  if (target.owner === source.owner) {
    target.troops += source.troops
    source.troops = 0
    say(`${target.name}에 병력을 보냈다.`)
    return
  }
  const playerInvolved = source.owner === 'player' || target.owner === 'player'
  if (playerInvolved) {
    startBattle(sourceId, targetId, source.owner === 'player')
  } else {
    autoResolveBattle(sourceId, targetId)
    checkWinLose()
  }
}

function recruitAt(regionId) {
  const r = regionById(regionId)
  if (r.owner !== 'player') return
  if (state.gold < RECRUIT_COST) {
    say('금이 부족합니다')
    return
  }
  state.gold -= RECRUIT_COST
  r.troops += RECRUIT_AMOUNT
  say(`${r.name}에 병력 +${RECRUIT_AMOUNT}`)
}

function checkWinLose() {
  if (ownedBy('player').length === 0) {
    state.phase = 'lose'
  } else if (ownedBy('player').length === state.regions.length) {
    state.phase = 'win'
  }
}

// --- AI turn ---------------------------------------------------------
const aiGold = { factionB: 60, factionC: 60 }

// A player-involving attack opens the tactical battle screen and needs
// the player's own input to resolve - if the AI kept going after that
// and called moveOrAttack again, a second startBattle() would silently
// overwrite state.battle out from under whatever the player was mid-way
// through fighting. So every loop here bails the moment a battle starts,
// leaving the rest of this faction's (and the other faction's) moves for
// a later turn.
function runAiFaction(owner) {
  if (state.phase === 'battle') return
  aiGold[owner] += ownedBy(owner).reduce((sum, r) => sum + r.income, 0)
  for (const r of ownedBy(owner)) {
    if (aiGold[owner] >= RECRUIT_COST && r.troops < 25) {
      aiGold[owner] -= RECRUIT_COST
      r.troops += RECRUIT_AMOUNT
    }
  }
  for (const r of ownedBy(owner)) {
    if (state.phase === 'battle') return
    if (r.troops < 4) continue
    const targets = NEIGHBORS[r.id]
      .map((id) => regionById(id))
      .filter((t) => t.owner !== owner && t.troops < r.troops * 0.9)
    if (targets.length === 0) continue
    targets.sort((a, b) => a.troops - b.troops)
    moveOrAttack(r.id, targets[0].id)
  }
}

const TOAST_MAX_WIDTH = 240

function announceTurnEvents() {
  if (turnEvents.length === 0) return
  const summary = `세력 다툼 ${turnEvents.length}건 발생`
  const joined = turnEvents.join(' · ')
  // Measuring against the actual toast font avoids a long region/faction
  // name combo silently overflowing the toast box - fall back to the
  // count-only summary whenever the full list wouldn't fit.
  ctx.font = '12px sans-serif'
  const text = turnEvents.length === 1 || ctx.measureText(joined).width <= TOAST_MAX_WIDTH ? joined : summary
  say(text)
  turnEvents = []
}

function endTurn() {
  if (state.phase !== 'map') return
  turnEvents = []
  for (const r of ownedBy('player')) state.gold += r.income
  runAiFaction('factionB')
  if (state.phase === 'battle') {
    state.turn += 1
    state.selected = null
    return
  }
  runAiFaction('factionC')
  announceTurnEvents()
  state.turn += 1
  state.selected = null
  checkWinLose()
}

// --- Input ---------------------------------------------------------------
function uiButtons() {
  return [
    { id: 'recruit', x: 630, y: 420, w: 240, h: 40, label: `모병 +${RECRUIT_AMOUNT} (${RECRUIT_COST}G)` },
    { id: 'endturn', x: 630, y: 480, w: 240, h: 40, label: '턴 종료' },
  ]
}

canvas.addEventListener('click', (e) => {
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
    state.phase = 'map'
    return
  }
  if (state.phase === 'win' || state.phase === 'lose') return

  if (state.phase === 'battle') {
    handleBattleTacticClick(mx, my)
    return
  }

  if (state.phase !== 'map') return
  if (mx >= MAP_W) {
    for (const btn of uiButtons()) {
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        if (btn.id === 'recruit' && state.selected !== null) recruitAt(state.selected)
        if (btn.id === 'endturn') endTurn()
      }
    }
    return
  }
  const clicked = state.regions.find((r) => Math.hypot(r.x - mx, r.y - my) < 28)
  if (!clicked) return
  if (state.selected === null) {
    if (clicked.owner === 'player') state.selected = clicked.id
    return
  }
  if (state.selected === clicked.id) {
    state.selected = null
    return
  }
  const source = regionById(state.selected)
  if (NEIGHBORS[source.id].includes(clicked.id)) {
    moveOrAttack(source.id, clicked.id)
    state.selected = null
  } else if (clicked.owner === 'player') {
    state.selected = clicked.id
  } else {
    state.selected = null
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') restart()
})

function restart() {
  state = makeInitialState()
  aiGold.factionB = 60
  aiGold.factionC = 60
}

// --- Rendering -----------------------------------------------------------
function drawOverlay(lines, title, footer) {
  ctx.fillStyle = 'rgba(26,20,14,0.88)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e8c27a'
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 100)
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 30 + i * 26))
  if (footer) {
    ctx.fillStyle = '#ccc'
    ctx.font = '13px sans-serif'
    ctx.fillText(footer, canvas.width / 2, canvas.height - 50)
  }
  ctx.textAlign = 'left'
}

function drawTitle() {
  drawOverlay(
    ['한 왕조가 무너진 뒤, 일곱 고을이 저마다의 주인을 자처한다.', '한 지역의 수장이 되어 천하를 다시 하나로 모아라.'],
    '군웅할거',
    '클릭해서 시작',
  )
}

function drawIntro() {
  drawOverlay(
    [
      '목표: 7개 고을을 전부 점령하면 승리, 내 고을이 전부 사라지면 패배.',
      '',
      '매 턴: 금으로 병력을 모으고 → 인접 고을로 군대를 보내 이동/점령 → 턴 종료.',
      '(공격하면 그 고을의 병력이 전부 빠져나가니, 수도를 비우고 공격하면 위험하다)',
      '',
      '전투: 내 군대가 걸린 전투는 직접 지휘한다.',
      '매 라운드 돌격/기습/수비 중 하나를 고르면 — 돌격은 기습에, 기습은 수비에,',
      '수비는 돌격에 강하다 (가위바위보와 같다). 이기는 전술을 고를수록 피해를 덜 입는다.',
    ],
    '천하 정세',
    '클릭해서 시작',
  )
}

function drawWin() {
  drawOverlay(['모든 고을이 그대의 깃발 아래 모였다.', '천하는 다시 하나가 되었다.'], '천하 통일', 'R 키로 다시 시작')
}

function drawLose() {
  drawOverlay(['마지막 고을마저 무너졌다.', '그대의 이름은 역사에 짧게 남을 것이다.'], '패망', 'R 키로 다시 시작')
}

function drawMap() {
  ctx.fillStyle = '#3e2e1c'
  ctx.fillRect(0, 0, MAP_W, canvas.height)

  ctx.strokeStyle = 'rgba(232,194,122,0.25)'
  ctx.lineWidth = 2
  for (const [a, b] of EDGES) {
    const ra = regionById(a)
    const rb = regionById(b)
    ctx.beginPath()
    ctx.moveTo(ra.x, ra.y)
    ctx.lineTo(rb.x, rb.y)
    ctx.stroke()
  }

  for (const r of state.regions) {
    const isSelected = state.selected === r.id
    const isTarget = state.selected !== null && NEIGHBORS[state.selected].includes(r.id)
    ctx.beginPath()
    ctx.arc(r.x, r.y, 28, 0, Math.PI * 2)
    ctx.fillStyle = COLORS[r.owner]
    ctx.fill()
    ctx.lineWidth = isSelected ? 4 : isTarget ? 3 : 1.5
    ctx.strokeStyle = isSelected ? '#fff' : isTarget ? '#ffd23f' : 'rgba(0,0,0,0.4)'
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(r.name, r.x, r.y - 36)
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(String(r.troops), r.x, r.y + 5)
  }
  ctx.textAlign = 'left'
}

function drawPanel() {
  ctx.fillStyle = '#4c3722'
  ctx.fillRect(MAP_W, 0, canvas.width - MAP_W, canvas.height)

  ctx.fillStyle = '#e8c27a'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText(`${state.turn}턴`, 630, 36)
  ctx.fillStyle = '#ffd23f'
  ctx.font = '14px sans-serif'
  ctx.fillText(`금 ${state.gold}`, 630, 58)

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.moveTo(620, 80)
  ctx.lineTo(880, 80)
  ctx.stroke()

  ctx.fillStyle = '#9fb8d8'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('세력 현황', 630, 104)
  ctx.font = '12px sans-serif'
  let y = 126
  for (const owner of ['player', 'factionB', 'factionC']) {
    const regions = ownedBy(owner)
    const troops = regions.reduce((s, r) => s + r.troops, 0)
    ctx.fillStyle = COLORS[owner]
    ctx.fillRect(630, y - 10, 10, 10)
    ctx.fillStyle = '#fff'
    ctx.fillText(`${FACTION_NAME[owner]}: ${regions.length}개 고을, 병력 ${troops}`, 648, y)
    y += 22
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.moveTo(620, y + 6)
  ctx.lineTo(880, y + 6)
  ctx.stroke()
  y += 30

  if (state.selected !== null) {
    const r = regionById(state.selected)
    ctx.fillStyle = '#e8c27a'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(`선택: ${r.name}`, 630, y)
    y += 22
    ctx.fillStyle = '#fff'
    ctx.font = '12px sans-serif'
    ctx.fillText(`병력 ${r.troops} · 수입 ${r.income}/턴`, 630, y)
    y += 20
    ctx.fillStyle = '#9fb8d8'
    ctx.fillText('인접 고을을 클릭하면 이동/공격', 630, y)
  } else {
    ctx.fillStyle = '#9fb8d8'
    ctx.font = '12px sans-serif'
    ctx.fillText('내 고을을 클릭해 선택하세요', 630, y)
  }

  for (const btn of uiButtons()) {
    const disabled =
      btn.id === 'recruit' &&
      (state.selected === null || regionById(state.selected).owner !== 'player' || state.gold < RECRUIT_COST)
    ctx.fillStyle = disabled ? '#3a3024' : '#5a4428'
    ctx.beginPath()
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.stroke()
    ctx.fillStyle = disabled ? '#776a52' : '#fff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 4)
  }
  ctx.textAlign = 'left'

  if (state.toast && elapsed < state.toast.until) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(620, 540, 260, 40)
    ctx.fillStyle = '#ffd23f'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.toast.text, 750, 564)
    ctx.textAlign = 'left'
  }
}

function tacticButtons() {
  return TACTICS.map((t, i) => ({ id: t, x: 40 + i * 290, y: 460, w: 260, h: 90 }))
}

function handleBattleTacticClick(mx, my) {
  for (const btn of tacticButtons()) {
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      chooseTactic(btn.id)
      return
    }
  }
}

function drawTroopBar(x, y, w, label, troops, initialTroops, color) {
  ctx.textAlign = 'left'
  ctx.fillStyle = '#e8c27a'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(label, x, y)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(x, y + 12, w, 20)
  const ratio = initialTroops > 0 ? Math.max(0, Math.min(1, troops / initialTroops)) : 0
  ctx.fillStyle = color
  ctx.fillRect(x, y + 12, w * ratio, 20)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${Math.max(0, Math.round(troops))}`, x + w, y + 54)
  ctx.textAlign = 'left'
}

function drawBattle() {
  const b = state.battle
  ctx.fillStyle = '#322819'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#e8c27a'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(`⚔ 전투 — ${b.round}/${MAX_ROUNDS} 라운드`, canvas.width / 2, 46)
  ctx.textAlign = 'left'

  const aiOwner = b.attackerIsPlayer ? b.defenderOwner : b.attackerOwner
  const humanInitial = b.attackerIsPlayer ? b.initialAttackerTroops : b.initialDefenderTroops
  const aiInitial = b.attackerIsPlayer ? b.initialDefenderTroops : b.initialAttackerTroops
  drawTroopBar(80, 100, 330, `나 (${b.attackerIsPlayer ? '공격' : '수비'})`, humanTroops(), humanInitial, COLORS.player)
  drawTroopBar(490, 100, 330, `${FACTION_NAME[aiOwner]} (${b.attackerIsPlayer ? '수비' : '공격'})`, aiTroops(), aiInitial, COLORS[aiOwner])

  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(80, 190, 740, 220)
  ctx.fillStyle = '#9fb8d8'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('상성: 돌격 > 기습 > 수비 > 돌격', 100, 216)
  ctx.fillStyle = '#fff'
  ctx.font = '14px sans-serif'
  ctx.fillText(b.log, 100, 250)
  if (b.lastResult) {
    ctx.fillStyle = '#ffd23f'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(
      `마지막 라운드: 나 ${TACTIC_INFO[b.lastResult.humanChoice].label} vs 적 ${TACTIC_INFO[b.lastResult.aiChoice].label}`,
      100,
      280,
    )
  }
  ctx.fillStyle = '#9fb8d8'
  ctx.font = '12px sans-serif'
  ctx.fillText('아래 전술 중 하나를 선택하면 바로 그 라운드가 진행됩니다.', 100, 390)

  for (const btn of tacticButtons()) {
    const info = TACTIC_INFO[btn.id]
    ctx.fillStyle = '#5a4428'
    ctx.beginPath()
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText(info.label, btn.x + btn.w / 2, btn.y + 40)
    ctx.fillStyle = '#ffd23f'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${TACTIC_INFO[info.beats].label} 상대로 강함`, btn.x + btn.w / 2, btn.y + 66)
    ctx.textAlign = 'left'
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (state.phase === 'title') return drawTitle()
  if (state.phase === 'intro') return drawIntro()
  if (state.phase === 'win') return drawWin()
  if (state.phase === 'lose') return drawLose()
  if (state.phase === 'battle') return drawBattle()
  drawMap()
  drawPanel()
}

let lastTime = performance.now()
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000)
  lastTime = time
  elapsed += dt
  render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
