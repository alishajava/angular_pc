import { sfx, unlockSfx, toggleMute } from './sfx.js'
import { drawPerson, drawEmote } from './people.js'
import { TILE, COLS, ROWS, W, H, MAP, PAL, buildGround, drawProp } from './world.js'
import { drawPortrait } from './portrait.js'
import { CG_LIST, drawCG } from './cg.js'
import {
  TOTAL_TURNS, SEASON_NAMES, HAIR_COLORS, STAT_KEYS, STAT_LABELS, STAT_COLORS, ACTIVITIES,
  stageForAge, moodForStress, computeEnding, freshState, ageAt, resolveTurn, clamp, rand, pick,
} from './logic.js'

// ====================================================================== 상수 ==
const SAVE_KEY = 'daughter-topview-save-v1'
const PLAYER_SPEED = 118
const PLAYER_HALF = 9
const FONT = '"Apple SD Gothic Neo","Malgun Gothic",sans-serif'

const canvas = document.getElementById('game')
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d')
const overlay = document.getElementById('overlay')

// ====================================================================== 상태 ==
let S = null // 규칙 상태 (logic.js)
let viewTurn = 0 // 화면에 보이는 계절 (결과를 보여 주는 동안은 이전 계절 그대로)
const player = { x: 0, y: 0, facing: 'down', moving: false, walk: 0 }
const girl = { x: 0, y: 0, facing: 'down', moving: false, walk: 0, emote: null, emoteT: 0, trail: [] }
let runtimeNpcs = []
let pickups = []
let weather = []
let elapsed = 0
let lockInput = true // 타이틀/엔딩 화면이 떠 있을 때
let ui = { menu: null, hits: [], prompt: null, hint: 1 }
let banner = null
const groundCache = {}
const floaters = []
const particles = []

const season = () => viewTurn % 4
const getGround = () => groundCache[season()] || (groundCache[season()] = buildGround(season()))

// ================================================================== 저장/로드 ==
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S))
  } catch { /* 저장 공간 없음 */ }
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    const d = raw ? JSON.parse(raw) : null
    return d && d.stats && d.turn !== undefined && d.turn < TOTAL_TURNS ? d : null
  } catch {
    return null
  }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* noop */ }
}

// ================================================================= 지도 / 이동 ==
function solidAt(c, r) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true
  return MAP.solid[r][c] === 1
}
function canMoveTo(x, y) {
  for (const [cx, cy] of [[x - PLAYER_HALF, y - PLAYER_HALF + 6], [x + PLAYER_HALF, y - PLAYER_HALF + 6], [x - PLAYER_HALF, y + PLAYER_HALF - 2], [x + PLAYER_HALF, y + PLAYER_HALF - 2]]) {
    if (solidAt(Math.floor(cx / TILE), Math.floor(cy / TILE))) return false
  }
  // 사람과는 부딪히지만, 이미 겹쳐 있으면 멀어지는 방향으로는 움직일 수 있게 한다
  for (const n of runtimeNpcs) {
    const d = Math.hypot(x - n.x, y - n.y)
    if (d < 16 && d < Math.hypot(player.x - n.x, player.y - n.y) + 0.01) return false
  }
  return true
}
function loadNpcs() {
  runtimeNpcs = MAP.npcs.map((n) => ({ ...n, walk: 0, moving: false, facing: n.facing || 'down', dir: Math.random() < 0.5 ? 1 : -1, emote: null, emoteT: 0 }))
}
function placeGirlBeside() {
  girl.x = player.x - 22
  girl.y = player.y + 4
  if (!canMoveTo(girl.x, girl.y)) { girl.x = player.x; girl.y = player.y + 18 }
  girl.trail = []
  girl.moving = false
  girl.facing = player.facing
}

// ----------------------------------------------------------- 주워 담기 아이템 ----
function reachableTiles() {
  const start = [Math.floor(MAP.spawn.x / TILE), Math.floor(MAP.spawn.y / TILE)]
  const seen = new Set([start.join(',')])
  const q = [start]
  while (q.length) {
    const [c, r] = q.shift()
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc
      const nr = r + dr
      const k = `${nc},${nr}`
      if (seen.has(k) || solidAt(nc, nr)) continue
      seen.add(k)
      q.push([nc, nr])
    }
  }
  return seen
}
const REACH = reachableTiles()
function spawnPickups() {
  const cand = []
  for (const k of REACH) {
    const [c, r] = k.split(',').map(Number)
    if (r < 6 || r > 16) continue
    if (MAP.stations.some((s) => Math.hypot(c * TILE + 16 - s.x, r * TILE + 16 - s.y) < 60)) continue
    cand.push([c, r])
  }
  pickups = []
  const kinds = ['coin', 'coin', 'coin', 'herb', 'scroll']
  for (const kind of kinds) {
    const [c, r] = cand.splice(Math.floor(Math.random() * cand.length), 1)[0]
    pickups.push({ kind, x: c * TILE + 16, y: r * TILE + 16, ph: Math.random() * 6 })
  }
}
function collect(p) {
  sfx.coin()
  if (p.kind === 'coin') { S.money += 3; floatText(p.x, p.y - 14, '엽전 +3', '#ffe066') }
  else if (p.kind === 'herb') { S.stress = clamp(S.stress - 3); floatText(p.x, p.y - 14, '약초 피로 -3', '#9fe8a0') }
  else { S.stats.int = clamp(S.stats.int + 1); floatText(p.x, p.y - 14, '글귀 지력 +1', '#9cc8ff') }
  sparkle(p.x, p.y, '#fff0a0', 10)
}

// =================================================================== 대화/연출 ==
const dlg = { active: false, speaker: '', text: '', shown: 0, onClose: null }
function say(speaker, text, onClose = null) {
  dlg.active = true
  dlg.speaker = speaker
  dlg.text = text
  dlg.shown = 0
  dlg.onClose = onClose
}
function advanceDialogue() {
  if (!dlg.active) return
  if (dlg.shown < dlg.text.length) {
    dlg.shown = dlg.text.length
    return
  }
  dlg.active = false
  sfx.click()
  const cb = dlg.onClose
  dlg.onClose = null
  if (cb) cb()
}
const fade = { t: 0, dir: 0, mid: null }
function transition(cb) {
  fade.dir = 1
  fade.t = 0
  fade.mid = cb
}
function sparkle(x, y, color = '#ffe066', n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 20 + Math.random() * 50
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.6 + Math.random() * 0.4, max: 1, color, size: 3 })
  }
}
function floatText(x, y, text, color = '#fff') {
  floaters.push({ x, y, text, color, t: 0 })
}

// ================================================================== 딸 외형 ==
function girlLookFor(stageKey, hairHex) {
  const skirt = { child: '#ff9fb2', teen: '#e8606f', lady: '#4f6fc0' }[stageKey]
  const top = { child: '#ffe27a', teen: '#fff0a8', lady: '#f5e6a8' }[stageKey]
  return {
    skin: '#f8d6b8', hair: hairHex, hairStyle: stageKey === 'child' ? 'bob' : 'long',
    shirt: skirt, jeogori: top, outfit: 'dress', shoes: '#f0e4d0', eye: '#6a3f2a',
    ribbon: stageKey === 'lady' ? '#e06ba6' : '#ff8fb0',
  }
}
function girlInfo() {
  const age = ageAt(viewTurn)
  const stage = stageForAge(age)
  return { scale: { child: 0.8, teen: 0.9, lady: 1 }[stage.key], look: girlLookFor(stage.key, S.hairHex) }
}

// ====================================================================== 이벤트 CG ==
// 이벤트가 일어나면 일러스트(CG)가 전체 화면으로 나온다. 본 CG는 타이틀의 갤러리에서 다시 볼 수 있다.
const CG_KEY = 'daughter-cg-unlocked-v1'
function unlockedCgs() {
  try {
    const d = JSON.parse(localStorage.getItem(CG_KEY) || '[]')
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}
function unlockCg(id) {
  const list = unlockedCgs()
  if (list.includes(id)) return false
  list.push(id)
  try { localStorage.setItem(CG_KEY, JSON.stringify(list)) } catch { /* 저장 공간 없음 */ }
  return true
}
let cgView = null // { id, t, caption, isNew, onClose }
function showCG(id, caption, onClose) {
  cgView = { id, t: 0, caption, isNew: unlockCg(id), onClose }
  sfx.good()
}
function closeCG() {
  if (!cgView || cgView.t < 0.7) return
  const cb = cgView.onClose
  cgView = null
  sfx.click()
  if (cb) cb()
}
function cgWho() {
  return { look: girlInfo().look, hairHex: S.hairHex, name: S.name }
}
function wrapPlain(text, maxW) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch === ' ' ? '' : ch } else line += ch
  }
  lines.push(line)
  return lines
}
function drawCGOverlay() {
  const v = cgView
  const a = Math.min(1, v.t / 0.45)
  ctx.save()
  ctx.globalAlpha = a
  drawCG(ctx, v.id, v.t + 1.2, W, H, cgWho())
  const info = CG_LIST.find((c) => c.id === v.id)
  ctx.fillStyle = 'rgba(30,18,12,0.7)'
  ctx.beginPath(); ctx.roundRect(16, 16, 40 + (info ? info.title.length * 15 : 80) + (v.isNew ? 70 : 0), 32, 16); ctx.fill()
  ctx.font = `bold 14px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffe9d4'
  ctx.fillText(`EVENT CG · ${info ? info.title : ''}`, 30, 32)
  if (v.isNew) {
    const tw = ctx.measureText(`EVENT CG · ${info ? info.title : ''}`).width
    ctx.fillStyle = '#ff5a7a'
    ctx.beginPath(); ctx.roundRect(40 + tw, 22, 46, 20, 10); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `bold 11px ${FONT}`
    ctx.fillText('NEW!', 49 + tw, 32)
  }
  // 자막
  ctx.font = `bold 17px ${FONT}`
  const lines = wrapPlain(v.caption.replace('딸', S.name), W - 80)
  const h = 22 + lines.length * 26 + 22
  const y = H - h - 18
  ctx.fillStyle = 'rgba(30,18,12,0.78)'
  ctx.beginPath(); ctx.roundRect(24, y, W - 48, h, 14); ctx.fill()
  ctx.strokeStyle = 'rgba(255,205,160,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 28 + i * 26))
  if (v.t > 0.7) {
    ctx.font = `12px ${FONT}`
    ctx.fillStyle = `rgba(255,224,170,${0.6 + Math.sin(elapsed * 5) * 0.3})`
    ctx.fillText('Space · 클릭: 계속', W / 2, y + h - 14)
  }
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
const PLAYER_LOOK = { skin: '#f2c79b', hair: '#2b2320', hairStyle: 'short', shirt: '#5f7fa8', pants: '#3a4258', shoes: '#2a2224', eye: '#3a2a22', outfit: 'tee', hat: 'gat' }
const LOOKS = {
  teacher: { skin: '#e8c8a0', hair: '#d8d8d8', hairStyle: 'short', shirt: '#3f5a8a', pants: '#2c3446', shoes: '#2a2224', eye: '#3a2a22', outfit: 'tee', hat: 'gat', glasses: true },
  master: { skin: '#dba87c', hair: '#1c1512', hairStyle: 'short', shirt: '#9a3a32', pants: '#2a2a32', shoes: '#1c1c22', eye: '#3a2a22', outfit: 'tee' },
  painter: { skin: '#f4cba2', hair: '#3a2a22', hairStyle: 'bun', shirt: '#5a9a7a', pants: '#4a5a48', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'dress', jeogori: '#f4efe0' },
  monk: { skin: '#e8b48f', hair: '#e8b48f', hairStyle: 'short', shirt: '#8a8f7a', pants: '#6a6f5a', shoes: '#4a3a2a', eye: '#3a2a22', outfit: 'tee' },
  aunt: { skin: '#e8b48f', hair: '#5a3a28', hairStyle: 'bun', shirt: '#c0705a', pants: '#5a4a3a', shoes: '#3a2a1a', eye: '#3a2a22', outfit: 'apron' },
  uncle: { skin: '#dba87c', hair: '#2b2320', hairStyle: 'short', shirt: '#6a8a5a', pants: '#4a4a3a', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'tee', hat: 'straw' },
  boatman: { skin: '#c89a6c', hair: '#4a3524', hairStyle: 'short', shirt: '#4a7a9a', pants: '#3a4a5a', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'tee', hat: 'straw' },
  granny: { skin: '#eac8a2', hair: '#d8d4d0', hairStyle: 'bun', shirt: '#9a7ab0', pants: '#6a5a7a', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'dress', jeogori: '#e8e0d0' },
  kid: { skin: '#f2c79b', hair: '#2b2320', hairStyle: 'bob', shirt: '#6ab0e0', pants: '#4a5a6a', shoes: '#3a2a22', eye: '#3a2a22', outfit: 'tee' },
}
const NPC_SCALE = { kid: 0.78 }

// 마을 사람들의 대사 (딸의 성장 상황에 따라 달라진다)
function npcLine(n) {
  const nm = S.name
  const { int, str, charm, art, faith } = S.stats
  const tier = (v, a, b, c) => (v < 35 ? a : v < 65 ? b : c)
  switch (n.id) {
    case 'teacher': return tier(int, `${nm}는 아직 글공부가 더 필요하구려. 서당에 자주 보내 주시게.`, `${nm}는 제법 총명해졌소. 이대로만 가면 큰 학자가 되겠소.`, `${nm}는 이 서당의 자랑이오! 가르칠 것이 점점 줄어드는구려.`)
    case 'master': return tier(str, `몸이 아직 가늘구나. 연무장에서 땀 좀 흘려야 한다.`, `${nm}의 자세가 꽤 좋아졌소. 계속 정진하시오.`, `허허, ${nm}를 이기려면 이 사범도 진땀을 빼야겠소.`)
    case 'painter': return tier(art, `그림은 마음으로 그리는 것이지요. ${nm}도 한번 붓을 잡아 보세요.`, `${nm}의 색감이 참 곱습니다. 눈이 좋은 아이예요.`, `${nm}의 그림을 걸어 두고 싶을 정도랍니다!`)
    case 'monk': return S.stress >= 60 ? `${nm}의 얼굴에 피로가 가득하구려. 무리하지 말고 집에서 쉬게 하시오.` : tier(faith, `마음을 고요히 하는 법을 함께 배워 보겠소?`, `${nm}의 마음이 점점 깊어지고 있소.`, `${nm}는 이미 제 스승이라 해도 되겠소.`)
    case 'aunt': return S.money >= 150 ? `어머, 곳간이 두둑하시네! 오늘은 좋은 걸로 덤 드릴게요.` : `시장에서 일을 도와주면 용돈을 넉넉히 드리지요. ${nm}는 일도 야무져요.`
    case 'uncle': return `싱싱한 물건이 가득이오! 여행을 가려면 노잣돈 40냥은 챙기시오.`
    case 'boatman': return `나루터에서 먼 마을까지 모셔다 드리지요. 뱃삯은 40냥, 다녀오면 견문이 크게 넓어질 거요.`
    case 'granny': return tier(charm, `${nm}는 요즘 어찌 지내누. 곱게 자라야 할 텐데...`, `${nm}가 참 예뻐졌구먼. 동네에 소문이 자자하오.`, `${nm}를 보려고 총각들이 줄을 선다는 소문이 있어요, 호호.`)
    case 'kid': return `${nm}야, 같이 놀자! ...아참, 지금은 바쁘구나?`
    default: return '...'
  }
}
function girlLine() {
  const nm = S.name
  if (S.sick) return `콜록... 몸이 으슬으슬해요. 집에서 쉬고 싶어요.`
  const mood = moodForStress(S.stress).key
  if (mood === 'sick') return `너무 힘들어요... 이번엔 쉬면 안 될까요?`
  if (mood === 'tired') return `조금 피곤해요... 그래도 열심히 할게요!`
  if (mood === 'bright') return pick([`오늘은 어디로 가요? 기운이 넘쳐요!`, `${ageAt(viewTurn)}살인데도 벌써 이렇게 컸어요. 헤헤.`])
  return pick([`${nm}는(은) 어디든 따라갈게요!`, `오늘은 어떤 걸 배울까요?`, `날씨가 참 좋네요.`])
}

// ================================================================ 상호작용 감지 ==
function nearestInteractable() {
  let best = null
  const consider = (item) => {
    const d = Math.hypot(player.x - item.x, player.y - item.y)
    if (d <= item.radius && (!best || d < best.d)) best = { ...item, d }
  }
  for (const s of MAP.stations) consider({ kind: 'station', id: s.id, x: s.x, y: s.y, radius: s.radius, label: s.label, act: s.act })
  if (best) return best
  for (const n of runtimeNpcs) consider({ kind: 'npc', id: n.id, x: n.x, y: n.y, radius: 44, label: n.name, npc: n })
  if (best) return best
  consider({ kind: 'girl', id: 'girl', x: girl.x, y: girl.y, radius: 40, label: S.name })
  return best
}
function activate(it) {
  if (it.kind === 'npc') {
    const n = it.npc
    const dx = player.x - n.x
    const dy = player.y - n.y
    n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    n.emote = '!'; n.emoteT = 1.2
    return say(n.name, npcLine(n))
  }
  if (it.kind === 'girl') {
    girl.emote = S.stress >= 60 || S.sick ? '...' : '♥'; girl.emoteT = 1.6
    return say(S.name, girlLine())
  }
  openStation(MAP.stations.find((s) => s.id === it.id))
}

function openStation(st) {
  const act = ACTIVITIES.find((a) => a.key === st.act)
  const cancel = { label: '그만두기', desc: '다음에 다시 올게요', ok: true, fn: () => { ui.menu = null } }
  if (S.sick) {
    if (st.act !== 'rest') return say('', `${S.name}은(는) 몸살 기운이 있어요. 이번 계절은 집에서 쉬게 해야겠어요.`)
    ui.menu = { title: st.label, sel: 0, options: [{ label: '몸살 요양', desc: '이번 계절은 푹 앓아누워 쉰다 · 피로 - -', ok: true, fn: () => doActivity(null, st) }, cancel] }
    sfx.click()
    return
  }
  const ok = !act.cost || S.money >= act.cost
  ui.menu = {
    title: st.label,
    sel: 0,
    options: [
      { label: act.name, desc: act.desc, ok, why: `자금이 부족해요 (필요 ${act.cost})`, fn: () => doActivity(act, st) },
      cancel,
    ],
  }
  sfx.click()
}
function chooseOption(i) {
  const o = ui.menu && ui.menu.options[i]
  if (!o) return
  if (!o.ok) return sfx.bad()
  o.fn()
}

// ================================================================== 한 계절 진행 ==
function snap() {
  return { stats: { ...S.stats }, money: S.money, stress: S.stress }
}
function deltaText(b) {
  const parts = []
  for (const k of STAT_KEYS) {
    const d = S.stats[k] - b.stats[k]
    if (d) parts.push(`${STAT_LABELS[k]} ${d > 0 ? '+' : ''}${d}`)
  }
  const ds = S.stress - b.stress
  if (ds) parts.push(`피로 ${ds > 0 ? '+' : ''}${ds}`)
  const dm = S.money - b.money
  if (dm) parts.push(`💰 ${dm > 0 ? '+' : ''}${dm}`)
  return parts.join(' · ')
}
function doActivity(act, st) {
  ui.menu = null
  const before = snap()
  sfx.door()
  transition(() => {
    const text = resolveTurn(S, act)
    const cg = S.pendingCg
    const cgText = S.pendingCgText
    S.pendingCg = null
    const door = MAP.doorSpawns[st.id]
    player.x = door.x
    player.y = door.y
    player.facing = 'down'
    placeGirlBeside()
    girl.emote = S.sick || S.stress >= 85 ? '...' : S.stress <= 25 ? '♥' : '!'
    girl.emoteT = 3
    sparkle(girl.x, girl.y - 24, '#ffe066', 12)
    setTimeout(() => (S.sick ? sfx.bad() : sfx.good()), 150)
    const showResult = () => say('', `${text}\n\n▶ ${deltaText(before)}`, afterResult)
    if (cg) showCG(cg, cgText, showResult)
    else showResult()
  })
}
function afterResult() {
  saveGame()
  if (S.turn >= TOTAL_TURNS) return transition(showEnding)
  transition(() => {
    const prevAge = ageAt(viewTurn)
    const prevStage = stageForAge(prevAge).key
    viewTurn = S.turn
    newSeasonSetup()
    const age = ageAt(viewTurn)
    if (age !== prevAge) {
      const st = stageForAge(age)
      const grew = st.key !== prevStage ? `\n${S.name}은(는) 이제 ${st.label}에 접어들었어요. 모습이 한층 달라졌네요!` : ''
      say('', `🎂 ${S.name}이(가) ${age}살이 되었어요!${grew}`)
    }
  })
}
function newSeasonSetup() {
  spawnPickups()
  initWeather()
  banner = { t: 0, text: `${ageAt(viewTurn)}세 · ${SEASON_NAMES[season()]}` }
}

// ================================================================== 날씨 입자 ==
function initWeather() {
  weather = []
  const n = [46, 22, 42, 90][season()]
  for (let i = 0; i < n; i++) weather.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6, sp: 0.6 + Math.random() * 0.8, sz: 1 + Math.random() * 2 })
}
function updateWeather(dt) {
  const s = season()
  for (const p of weather) {
    p.ph += dt * 2
    if (s === 1) { // 여름: 반딧불처럼 떠다니는 빛
      p.x += Math.sin(p.ph) * 14 * dt
      p.y += Math.cos(p.ph * 0.7) * 10 * dt
    } else {
      const fall = s === 3 ? 38 : s === 2 ? 30 : 24
      p.y += fall * p.sp * dt
      p.x += (Math.sin(p.ph) * 18 + (s === 3 ? 6 : 14)) * dt
    }
    if (p.y > H + 6) { p.y = -6; p.x = Math.random() * W }
    if (p.x > W + 6) p.x = -6
    if (p.x < -6) p.x = W + 6
  }
}
function drawWeather() {
  const s = season()
  for (const p of weather) {
    if (s === 0) {
      ctx.fillStyle = 'rgba(255,190,210,0.9)'
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4 * p.sz * 0.6, 2 * p.sz * 0.6, p.ph, 0, Math.PI * 2); ctx.fill()
    } else if (s === 1) {
      const a = 0.35 + 0.4 * Math.abs(Math.sin(p.ph))
      ctx.fillStyle = `rgba(255,245,160,${a})`
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 + p.sz * 0.5, 0, Math.PI * 2); ctx.fill()
    } else if (s === 2) {
      ctx.fillStyle = p.sz > 1.8 ? 'rgba(214,92,36,0.9)' : 'rgba(236,160,50,0.9)'
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2.2, p.ph, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * 0.9 + 0.6, 0, Math.PI * 2); ctx.fill()
    }
  }
}

// ================================================================== 입력 ==
const held = new Set()
const MOVE = { up: ['w', 'arrowup'], down: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'] }
const heldAny = (names) => names.some((k) => held.has(k))
// 키 이름을 e.code 기준으로 통일한다 (한글 입력기 상태에서도 WASD/방향키가 같게 동작, 키가 눌린 채 남는 문제 방지)
function keyName(e) {
  const c = e.code || ''
  if (c.startsWith('Key')) return c.slice(3).toLowerCase()
  if (c.startsWith('Digit')) return c.slice(5)
  if (c === 'Space') return ' '
  if (c === 'Enter' || c === 'NumpadEnter') return 'enter'
  if (c === 'Escape') return 'escape'
  if (c.startsWith('Arrow')) return c.toLowerCase()
  return (e.key || '').toLowerCase()
}
const clearHeld = () => held.clear()
window.addEventListener('keydown', (e) => {
  const key = keyName(e)
  unlockSfx()
  if (e.target && e.target.tagName === 'INPUT') return // 이름 입력 중에는 게임 키로 처리하지 않는다
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault()
  if (e.metaKey) clearHeld()
  held.add(key)
  if (e.repeat) return
  if (key === 'm') return void toggleMute()
  if (cgView) {
    if (!fade.dir && (key === ' ' || key === 'enter' || key === 'e' || key === 'escape')) closeCG()
    return
  }
  if (lockInput) return
  if (dlg.active) {
    if (fade.dir) return
    if (key === ' ' || key === 'enter' || key === 'e') advanceDialogue()
    return
  }
  if (fade.dir) return
  if (ui.menu) {
    const n = ui.menu.options.length
    if (key === 'escape') ui.menu = null
    else if (/^[1-9]$/.test(key)) chooseOption(Number(key) - 1)
    else if (key === 'arrowup') ui.menu.sel = (ui.menu.sel + n - 1) % n
    else if (key === 'arrowdown') ui.menu.sel = (ui.menu.sel + 1) % n
    else if (key === 'enter' || key === ' ' || key === 'e') chooseOption(ui.menu.sel)
    return
  }
  if (key === ' ' || key === 'enter' || key === 'e') {
    const it = nearestInteractable()
    if (it) activate(it)
  }
})
window.addEventListener('keyup', (e) => {
  held.delete(keyName(e))
  if (e.metaKey) clearHeld()
})
window.addEventListener('blur', clearHeld)
document.addEventListener('visibilitychange', clearHeld)
document.addEventListener('focusout', clearHeld)
window.addEventListener('contextmenu', clearHeld)
canvas.addEventListener('pointerdown', (e) => {
  unlockSfx()
  const r = canvas.getBoundingClientRect()
  const x = ((e.clientX - r.left) * W) / r.width
  const y = ((e.clientY - r.top) * H) / r.height
  if (lockInput || fade.dir) return
  if (cgView) return closeCG()
  if (dlg.active) return advanceDialogue()
  for (const h of ui.hits) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.fn()
  if (ui.menu) ui.menu = null
})
document.addEventListener('pointerdown', unlockSfx)
document.addEventListener('click', (e) => {
  const mute = e.target.closest('#mute-btn')
  if (mute) {
    mute.textContent = toggleMute() ? '소리 끔' : '소리 켬'
    return
  }
  if (e.target.closest('button')) sfx.click()
})

// ================================================================== 업데이트 ==
function updatePlayer(dt) {
  const locked = lockInput || dlg.active || fade.dir !== 0 || !!ui.menu || !!cgView
  let dx = 0
  let dy = 0
  if (!locked) {
    if (heldAny(MOVE.left)) dx -= 1
    if (heldAny(MOVE.right)) dx += 1
    if (heldAny(MOVE.up)) dy -= 1
    if (heldAny(MOVE.down)) dy += 1
  }
  player.moving = dx !== 0 || dy !== 0
  if (player.moving) {
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2 }
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    player.walk += dt * 10
    const ox = player.x
    const oy = player.y
    const tx = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(tx, player.y)) player.x = tx
    const ty = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(player.x, ty)) player.y = ty
    const last = girl.trail[girl.trail.length - 1]
    if (!last || Math.hypot(player.x - last.x, player.y - last.y) >= 5) girl.trail.push({ x: player.x, y: player.y })
    if (girl.trail.length > 400) girl.trail.shift()
    void ox; void oy
  }
  ui.prompt = locked ? null : nearestInteractable()
  // 아이템 줍기
  if (!locked) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      if (Math.hypot(player.x - pickups[i].x, player.y - pickups[i].y) < 18) { collect(pickups[i]); pickups.splice(i, 1) }
    }
  }
}
// 딸은 보호자가 지나온 길(trail)을 그대로 따라온다 (벽을 뚫지 않는다)
function updateGirl(dt) {
  if (girl.emoteT > 0) { girl.emoteT -= dt; if (girl.emoteT <= 0) girl.emote = null }
  const speed = 128
  while (girl.trail.length && Math.hypot(girl.trail[0].x - girl.x, girl.trail[0].y - girl.y) < 3) girl.trail.shift()
  const dist = Math.hypot(player.x - girl.x, player.y - girl.y)
  if (dist > 26 && girl.trail.length) {
    const t = girl.trail[0]
    const dx = t.x - girl.x
    const dy = t.y - girl.y
    const d = Math.hypot(dx, dy) || 1
    const step = Math.min(d, speed * dt)
    girl.x += (dx / d) * step
    girl.y += (dy / d) * step
    girl.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    girl.moving = true
    girl.walk += dt * 10
  } else {
    girl.moving = false
    if (dist > 26 && !girl.trail.length) girl.trail.push({ x: player.x, y: player.y })
    if (dist <= 40) {
      const dx = player.x - girl.x
      const dy = player.y - girl.y
      if (!player.moving) girl.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    }
  }
  // 아플 때나 지쳤을 때는 가끔 표정 이모트
  if (!girl.emote && (S.sick || S.stress >= 85) && Math.random() < dt * 0.15) { girl.emote = '...'; girl.emoteT = 1.6 }
}
function updateNpcs(dt) {
  for (const n of runtimeNpcs) {
    if (n.emoteT > 0) { n.emoteT -= dt; if (n.emoteT <= 0) n.emote = null }
    if (n.wander) {
      n.moving = true
      const cx = n.x + n.dir * 24 * dt
      if (cx < n.wander.x0 * TILE || cx > n.wander.x1 * TILE) n.dir *= -1
      else if (!(Math.hypot(cx - player.x, n.y - player.y) < 22)) n.x = cx
      n.facing = n.dir > 0 ? 'right' : 'left'
      n.walk += dt * 6
    } else {
      n.moving = false
      const d = Math.hypot(player.x - n.x, player.y - n.y)
      if (d < 70 && !dlg.active) {
        const dx = player.x - n.x
        const dy = player.y - n.y
        n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      }
    }
  }
}
function updateFx(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
  for (const f of floaters) f.t += dt
  if (cgView) cgView.t += dt
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t > 1.4) floaters.splice(i, 1)
  if (banner) { banner.t += dt; if (banner.t > 2.4) banner = null }
  if (dlg.active && dlg.shown < dlg.text.length) {
    const b = Math.floor(dlg.shown)
    dlg.shown = Math.min(dlg.text.length, dlg.shown + dt * 55)
    if (Math.floor(dlg.shown) % 2 === 0 && Math.floor(dlg.shown) > b && dlg.text[Math.floor(dlg.shown) - 1] !== ' ') sfx.blip && sfx.blip(380)
  }
  if (fade.dir === 1) {
    fade.t += dt * 4.5
    if (fade.t >= 1) {
      const cb = fade.mid
      fade.mid = null
      fade.dir = -1
      fade.t = 1
      if (cb) cb()
    }
  } else if (fade.dir === -1) {
    fade.t = Math.max(0, fade.t - dt * 6)
    if (fade.t <= 0) { fade.dir = 0; fade.t = 0 }
  }
}

// ================================================================== 그리기 ==
function render() {
  ctx.clearRect(0, 0, W, H)
  ui.hits = []
  if (!S) { ctx.fillStyle = '#ffe3cf'; ctx.fillRect(0, 0, W, H); return }
  ctx.drawImage(getGround(), 0, 0)
  const objs = []
  for (const p of MAP.props) {
    const under = p.kind === 'dock' || p.kind === 'flowers' || p.kind === 'boat' || p.kind === 'reeds'
    const sy = p.kind === 'smoke' ? 9999 : under ? (p.kind === 'flowers' ? -1 : p.r * TILE) : (p.r + p.h) * TILE - 2
    objs.push({ y: sy, f: () => drawProp(ctx, p, elapsed, season()) })
  }
  for (const n of runtimeNpcs) objs.push({ y: n.y + 6, f: () => drawNpc(n) })
  for (const p of pickups) objs.push({ y: p.y, f: () => drawPickup(p) })
  objs.push({ y: girl.y + 7, f: drawGirl })
  objs.push({ y: player.y + 8, f: drawPlayer })
  objs.sort((a, b) => a.y - b.y)
  for (const o of objs) o.f()
  drawFx()
  drawWeather()
  drawTint()
  drawHud()
  drawPrompt()
  drawMenu()
  drawDialogue()
  drawBanner()
  if (cgView) drawCGOverlay()
  if (fade.dir) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade.t)})`; ctx.fillRect(0, 0, W, H) }
}
function drawNpc(n) {
  const sc = NPC_SCALE[n.look] || 1
  ctx.save()
  ctx.translate(n.x, n.y + 6)
  ctx.scale(sc, sc)
  drawPerson(ctx, 0, 0, LOOKS[n.look], { facing: n.facing, walk: n.walk, moving: n.moving, t: elapsed, pose: n.emote === '!' ? { type: 'wave', p: 0 } : null })
  ctx.restore()
  if (n.emote) drawEmote(ctx, n.x, n.y - 52 * sc, n.emote, elapsed)
}
function drawPlayer() {
  drawPerson(ctx, player.x, player.y + 8, PLAYER_LOOK, { facing: player.facing, walk: player.walk, moving: player.moving, t: elapsed })
}
function drawGirl() {
  const g = girlInfo()
  ctx.save()
  ctx.translate(girl.x, girl.y + 7)
  ctx.scale(g.scale, g.scale)
  drawPerson(ctx, 0, 0, g.look, { facing: girl.facing, walk: girl.walk, moving: girl.moving, t: elapsed })
  ctx.restore()
  const em = girl.emote || (S.sick ? '...' : null)
  if (em) drawEmote(ctx, girl.x, girl.y - 54 * g.scale, em, elapsed)
}
function drawPickup(p) {
  const bob = Math.sin(elapsed * 3 + p.ph) * 2.5
  const x = p.x
  const y = p.y + bob - 4
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill()
  const glow = ctx.createRadialGradient(x, y, 1, x, y, 16)
  glow.addColorStop(0, 'rgba(255,240,150,0.55)')
  glow.addColorStop(1, 'rgba(255,240,150,0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - 16, y - 16, 32, 32)
  if (p.kind === 'coin') {
    ctx.fillStyle = '#f0c040'
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#8a6410'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#8a6410'; ctx.fillRect(x - 2, y - 2, 4, 4)
  } else if (p.kind === 'herb') {
    ctx.fillStyle = '#5aae5a'
    ctx.beginPath(); ctx.ellipse(x - 3, y, 5, 2.6, -0.6, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(x + 3, y - 1, 5, 2.6, 0.6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#2a6a2a'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 2); ctx.stroke()
  } else {
    ctx.fillStyle = '#f8f0dc'
    ctx.fillRect(x - 6, y - 5, 12, 10)
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 6, y - 5, 12, 10)
    ctx.fillStyle = '#6a8ac0'
    ctx.fillRect(x - 4, y - 2, 8, 1.5); ctx.fillRect(x - 4, y + 1, 6, 1.5)
  }
}
function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
  ctx.font = `bold 12px ${FONT}`
  ctx.textAlign = 'center'
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(40,24,10,0.85)'
    ctx.strokeText(f.text, f.x, f.y - f.t * 26)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y - f.t * 26)
  }
  ctx.globalAlpha = 1
}
function drawTint() {
  const t = PAL[season()].tint
  if (t) { ctx.fillStyle = t; ctx.fillRect(0, 0, W, H) }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, H * 0.98)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(40,20,10,0.22)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
}
function panel(x, y, w, h, r = 10, fill = 'rgba(52,32,22,0.88)', stroke = 'rgba(255,205,160,0.45)') {
  ctx.fillStyle = fill
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke()
}

// 초상화 썸네일 (HUD): 유년기는 그림 파일, 이후는 캔버스로 그린 초상화
const childImg = new Image()
childImg.src = `${import.meta.env.BASE_URL}portraits/child_default.webp`
const thumb = { key: '', canvas: document.createElement('canvas') }
thumb.canvas.width = 200
thumb.canvas.height = 240
function portraitThumb() {
  const stage = stageForAge(ageAt(viewTurn)).key
  const mood = moodForStress(S.stress).key
  if (stage === 'child') return childImg.complete && childImg.naturalWidth ? childImg : null
  const key = `${stage}|${mood}|${S.hairHex}`
  if (thumb.key !== key) {
    drawPortrait(thumb.canvas, { stageKey: stage, moodKey: mood, hairHex: S.hairHex })
    thumb.key = key
  }
  return thumb.canvas
}
function drawHud() {
  const age = ageAt(viewTurn)
  const stage = stageForAge(age)
  const mood = moodForStress(S.stress)
  ctx.fillStyle = 'rgba(46,28,20,0.92)'
  ctx.fillRect(0, 0, W, 62)
  ctx.fillStyle = 'rgba(255,205,160,0.25)'
  ctx.fillRect(0, 61, W, 1)
  // 초상화
  ctx.save()
  ctx.beginPath(); ctx.arc(22, 17, 15, 0, Math.PI * 2); ctx.clip()
  ctx.fillStyle = '#ffe9d4'; ctx.fillRect(7, 2, 30, 30)
  const img = portraitThumb()
  if (img) {
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    ctx.drawImage(img, w * 0.15, h * 0.02, w * 0.7, w * 0.7, 6, 1, 32, 32)
  }
  ctx.restore()
  ctx.strokeStyle = '#ffd6b0'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(22, 17, 15, 0, Math.PI * 2); ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.font = `bold 13px ${FONT}`
  ctx.fillText(`${S.name} · ${age}세 · ${SEASON_NAMES[season()]}`, 44, 12)
  ctx.font = `11px ${FONT}`
  ctx.fillStyle = '#ffd6b0'
  ctx.fillText(`${stage.label} · ${S.sick ? '몸살' : mood.label}`, 44, 26)
  // 진행도
  const bx = 330
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath(); ctx.roundRect(bx, 11, 220, 10, 5); ctx.fill()
  ctx.fillStyle = '#ffb07a'
  ctx.beginPath(); ctx.roundRect(bx, 11, Math.max(6, (220 * viewTurn) / TOTAL_TURNS), 10, 5); ctx.fill()
  ctx.fillStyle = '#ffe9d4'
  ctx.font = `10px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(`10세 ─ ${viewTurn}/${TOTAL_TURNS} 계절 ─ 18세`, bx + 110, 29)
  ctx.textAlign = 'right'
  ctx.font = `bold 14px ${FONT}`
  ctx.fillStyle = '#ffe066'
  ctx.fillText(`💰 ${S.money}`, W - 14, 19)
  // 능력치 줄
  const rows = [...STAT_KEYS.map((k) => [STAT_LABELS[k], S.stats[k], STAT_COLORS[k]]), ['피로', S.stress, S.stress >= 85 ? '#ff5a4a' : S.stress >= 60 ? '#e0a030' : '#b8a8a0']]
  const cw = W / rows.length
  rows.forEach(([label, v, color], i) => {
    const x = 10 + i * cw
    ctx.textAlign = 'left'
    ctx.font = `bold 11px ${FONT}`
    ctx.fillStyle = '#ffe9d4'
    ctx.fillText(label, x, 47)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.beginPath(); ctx.roundRect(x + 34, 42, cw - 82, 9, 4); ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(x + 34, 42, Math.max(4, ((cw - 82) * v) / 100), 9, 4); ctx.fill()
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffd6b0'
    ctx.font = `10px ${FONT}`
    ctx.fillText(String(v), x + cw - 14, 47)
  })
  ctx.textBaseline = 'alphabetic'
  if (S.sick) {
    panel(W / 2 - 150, 68, 300, 24, 12, 'rgba(160,50,40,0.9)', '#ffb0a0')
    ctx.fillStyle = '#fff'
    ctx.font = `bold 12px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(`🤒 ${S.name}이(가) 몸살이 났어요. 집에서 쉬게 해 주세요`, W / 2, 84)
  }
  if (ui.hint > 0 && S.turn === 0 && !dlg.active) {
    ui.hint -= 0.0006
    panel(W / 2 - 290, H - 52, 580, 28, 14)
    ctx.fillStyle = '#ffe9d4'
    ctx.font = `12px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('방향키/WASD로 걷고, 건물 앞에서 E 또는 Space — 한 계절에 한 번 딸과 함께 활동을 해요', W / 2, H - 33)
  }
}
function drawPrompt() {
  const it = ui.prompt
  if (!it || ui.menu || dlg.active || fade.dir) return
  const act = it.kind === 'station' ? ACTIVITIES.find((a) => a.key === it.act) : null
  const text = it.kind === 'station' ? `[E] ${it.label} · ${act.name}` : `[E] ${it.label}에게 말 걸기`
  ctx.font = `bold 13px ${FONT}`
  const w = ctx.measureText(text).width + 24
  const x = clamp(it.x - w / 2, 6, W - w - 6)
  const y = clamp(it.kind === 'station' ? it.y - 74 : it.y - 66, 94, H - 40)
  panel(x, y, w, 26, 13, 'rgba(255,248,224,0.96)', '#c9a040')
  ctx.fillStyle = '#4a3410'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + 13.5)
  ctx.textBaseline = 'alphabetic'
  ui.hits.push({ x, y, w, h: 26, fn: () => activate(it) })
}
function drawMenu() {
  const m = ui.menu
  if (!m) return
  const w = 520
  const rowH = 62
  const h = 54 + m.options.length * (rowH + 8) + 28
  const x = W / 2 - w / 2
  const y = H / 2 - h / 2 + 20
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(0, 0, W, H)
  ui.hits = []
  panel(x, y, w, h, 16, 'rgba(56,34,24,0.97)', 'rgba(255,205,160,0.55)')
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe066'
  ctx.font = `bold 17px ${FONT}`
  ctx.fillText(m.title, x + 22, y + 34)
  ctx.font = `12px ${FONT}`
  ctx.fillStyle = '#e8c8a8'
  ctx.textAlign = 'right'
  ctx.fillText(`${ageAt(viewTurn)}세 · ${SEASON_NAMES[season()]}`, x + w - 22, y + 34)
  m.options.forEach((o, i) => {
    const oy = y + 50 + i * (rowH + 8)
    const sel = m.sel === i
    ctx.fillStyle = !o.ok ? 'rgba(255,255,255,0.06)' : sel ? 'rgba(255,210,74,0.3)' : 'rgba(255,255,255,0.12)'
    ctx.beginPath(); ctx.roundRect(x + 16, oy, w - 32, rowH, 10); ctx.fill()
    if (sel && o.ok) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.stroke() }
    ctx.textAlign = 'left'
    ctx.fillStyle = o.ok ? '#fff' : '#9a8878'
    ctx.font = `bold 15px ${FONT}`
    ctx.fillText(`${i + 1}. ${o.label}`, x + 32, oy + 26)
    ctx.font = `12px ${FONT}`
    ctx.fillStyle = o.ok ? '#e8c8a8' : '#ff9a8a'
    ctx.fillText(o.ok ? o.desc : `🔒 ${o.why}`, x + 32, oy + 47)
    ui.hits.push({ x: x + 16, y: oy, w: w - 32, h: rowH, fn: () => { m.sel = i; chooseOption(i) } })
  })
  ctx.textAlign = 'center'
  ctx.fillStyle = '#a89080'
  ctx.font = `11px ${FONT}`
  ctx.fillText('숫자키 또는 클릭으로 선택 · Esc 닫기', x + w / 2, y + h - 12)
}
function wrapLines(text, maxW) {
  const lines = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch === ' ' ? '' : ch } else line += ch
    }
    lines.push(line)
  }
  return lines
}
function drawDialogue() {
  if (!dlg.active) return
  const x = 16
  const w = W - 32
  ctx.font = `15px ${FONT}`
  const full = wrapLines(dlg.text, w - 36)
  const shown = wrapLines(dlg.text.slice(0, Math.floor(dlg.shown)), w - 36)
  const h = 36 + full.length * 22
  const y = H - h - 14
  panel(x, y, w, h, 12, 'rgba(50,30,22,0.95)', 'rgba(255,205,160,0.6)')
  if (dlg.speaker) {
    ctx.font = `bold 13px ${FONT}`
    const nw = ctx.measureText(dlg.speaker).width + 24
    panel(x + 16, y - 14, nw, 26, 8, '#6a3a2a', 'rgba(255,205,160,0.7)')
    ctx.fillStyle = '#ffe066'
    ctx.textAlign = 'left'
    ctx.fillText(dlg.speaker, x + 28, y + 4)
  }
  ctx.fillStyle = '#fff'
  ctx.font = `15px ${FONT}`
  ctx.textAlign = 'left'
  shown.forEach((l, i) => ctx.fillText(l, x + 18, y + 30 + i * 22))
  if (dlg.shown >= dlg.text.length) {
    const b = Math.sin(elapsed * 6) * 2
    ctx.fillStyle = '#ffe066'
    ctx.beginPath(); ctx.moveTo(x + w - 30, y + h - 20 + b); ctx.lineTo(x + w - 18, y + h - 20 + b); ctx.lineTo(x + w - 24, y + h - 12 + b); ctx.closePath(); ctx.fill()
  }
}
function drawBanner() {
  if (!banner || fade.dir) return
  const t = banner.t
  const a = t < 0.3 ? t / 0.3 : t > 1.9 ? Math.max(0, (2.4 - t) / 0.5) : 1
  ctx.globalAlpha = a
  const col = ['#ff9ab8', '#5ab85a', '#e0742a', '#8ab8e0'][season()]
  panel(W / 2 - 130, 108 - (1 - a) * 10, 260, 44, 22, 'rgba(50,30,22,0.9)', col)
  ctx.fillStyle = col
  ctx.beginPath(); ctx.arc(W / 2 - 100, 130 - (1 - a) * 10, 9, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold 20px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(banner.text, W / 2 + 10, 130 - (1 - a) * 10)
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = 1
}

// ============================================================ 타이틀 / 엔딩 ==
function showOverlay(html) {
  overlay.innerHTML = html
  overlay.classList.add('on')
  lockInput = true
}
function hideOverlay() {
  overlay.classList.remove('on')
  overlay.innerHTML = ''
  lockInput = false
}
function startGame(state) {
  S = state
  viewTurn = S.turn
  player.x = MAP.spawn.x
  player.y = MAP.spawn.y
  player.facing = 'down'
  loadNpcs()
  placeGirlBeside()
  banner = null
  ui = { menu: null, hits: [], prompt: null, hint: 1 }
  dlg.active = false
  spawnPickups()
  initWeather()
  hideOverlay()
  sfx.start()
  banner = { t: 0, text: `${ageAt(viewTurn)}세 · ${SEASON_NAMES[season()]}` }
}
// ---- 이벤트 CG 갤러리 (타이틀에서 열기) ----
function showGallery(onBack, hairKey) {
  const hair = (HAIR_COLORS.find((x) => x.key === hairKey) || HAIR_COLORS[0]).hex
  const who = { look: girlLookFor('teen', hair), hairHex: hair, name: '리안' }
  const got = unlockedCgs()
  showOverlay(`<div class="gallery">
    <h2>이벤트 CG 갤러리 <small>${got.length}/${CG_LIST.length}</small></h2>
    <div class="gallery-grid">${CG_LIST.map((c) => `<button class="cg-thumb ${got.includes(c.id) ? '' : 'locked'}" data-id="${c.id}" ${got.includes(c.id) ? '' : 'disabled'}><canvas width="240" height="173"></canvas><span>${got.includes(c.id) ? c.title : '???'}</span></button>`).join('')}</div>
    <div class="hint">게임 중 이벤트가 일어나면 CG가 하나씩 열려요. 열린 CG를 누르면 크게 볼 수 있어요.</div>
    <button class="mini-btn" id="gallery-back">← 돌아가기</button></div>`)
  document.querySelectorAll('.cg-thumb').forEach((btn) => {
    const g = btn.querySelector('canvas').getContext('2d')
    if (btn.classList.contains('locked')) {
      g.fillStyle = '#4a3a32'; g.fillRect(0, 0, 240, 173)
      g.fillStyle = '#7a665a'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 120, 88)
    } else {
      g.save(); g.scale(0.3, 0.3); drawCG(g, btn.dataset.id, 1.4, W, H, who); g.restore()
      btn.onclick = () => openCgViewer(btn.dataset.id, who, () => showGallery(onBack, hairKey))
    }
  })
  document.getElementById('gallery-back').onclick = onBack
}
function openCgViewer(id, who, onBack) {
  const info = CG_LIST.find((c) => c.id === id)
  showOverlay(`<div class="cg-viewer"><canvas id="cg-big" width="${W}" height="${H}"></canvas><div class="cg-title">${info.title}</div><button class="mini-btn" id="cg-close">닫기</button></div>`)
  const cv = document.getElementById('cg-big')
  const g = cv.getContext('2d')
  const t0 = performance.now()
  let alive = true
  const loopCg = () => {
    if (!alive || !document.body.contains(cv)) return
    drawCG(g, id, (performance.now() - t0) / 1000 + 1.2, W, H, who)
    requestAnimationFrame(loopCg)
  }
  loopCg()
  document.getElementById('cg-close').onclick = () => { alive = false; onBack() }
}

function showTitle() {
  const save = readSave()
  let hairKey = (S && S.hairKey) || HAIR_COLORS[0].key
  const render = () => {
    const prev = document.getElementById('name-input')
    const nameVal = (prev && prev.value) || '리안'
    showOverlay(`<div class="title-wrap">
      <h1>딸 키우기</h1>
      <div class="subtitle">10살부터 18살까지, 8년간 한옥 마을에서 딸과 함께 걸으며 키워 보세요</div>
      <div class="field-row"><label>딸의 이름</label><input id="name-input" type="text" maxlength="8" placeholder="예: 리안" value="${nameVal}" /></div>
      <div class="field-row"><label>머리색</label><div class="swatch-row">${HAIR_COLORS.map((h) => `<div class="swatch ${h.key === hairKey ? 'selected' : ''}" data-hair="${h.key}" style="background:${h.hex}" title="${h.label}"></div>`).join('')}</div></div>
      <button class="primary-btn" id="start-btn">키우기 시작</button>
      <button class="mini-btn" id="gallery-btn">🖼 이벤트 CG 갤러리 (${unlockedCgs().length}/${CG_LIST.length})</button>
      ${save ? `<button class="mini-btn" id="cont-btn">이어하기 · ${save.name} ${ageAt(save.turn)}세 ${SEASON_NAMES[save.turn % 4]}</button>` : ''}
      <div class="hint">마을을 걸어 다니며 서당·연무장·화실·사찰·시장·집·나루터에서 딸과 함께 활동하세요. 한 계절에 한 번, 총 32계절. 무리하면 병이 나요. 길에 떨어진 엽전·약초·글귀도 주워 보세요. 18살이 되면 엔딩이 결정됩니다.</div>
      <div class="hint">조작: 방향키/WASD 이동 · E/Space 상호작용 · 숫자키/클릭 선택 · Esc 닫기 · M 소리</div></div>`)
    document.querySelectorAll('.swatch').forEach((el) => (el.onclick = () => { hairKey = el.dataset.hair; render() }))
    document.getElementById('gallery-btn').onclick = () => showGallery(() => render(), hairKey)
    document.getElementById('start-btn').onclick = () => {
      const st = freshState()
      st.name = document.getElementById('name-input').value.trim() || '리안'
      const h = HAIR_COLORS.find((x) => x.key === hairKey) || HAIR_COLORS[0]
      st.hairKey = h.key
      st.hairHex = h.hex
      clearSave()
      startGame(st)
    }
    const cont = document.getElementById('cont-btn')
    if (cont) cont.onclick = () => startGame(save)
  }
  render()
}
function showEnding() {
  clearSave()
  const ending = computeEnding(S)
  setTimeout(() => (ending.title.includes('번아웃') ? sfx.lose() : sfx.fanfare()), 120)
  showOverlay(`<div class="ending-wrap">
      <canvas id="ending-canvas" width="220" height="264"></canvas>
      <h2 class="ending-title">${ending.title}</h2>
      <div class="ending-text">${ending.text}</div>
      <div class="ending-stats">지력 ${S.stats.int} · 체력 ${S.stats.str} · 매력 ${S.stats.charm} · 예술 ${S.stats.art} · 신앙 ${S.stats.faith} · 자금 ${S.money}</div>
      <button class="restart-btn" id="restart-btn">다시 키우기</button>
    </div>`)
  drawPortrait(document.getElementById('ending-canvas'), { stageKey: 'lady', moodKey: 'bright', hairHex: S.hairHex })
  document.getElementById('restart-btn').onclick = () => {
    S = null
    showTitle()
  }
}

// ================================================================== 루프 ==
let last = performance.now()
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000)
  last = t
  elapsed += dt
  if (S && !lockInput) {
    updatePlayer(dt)
    updateGirl(dt)
    updateNpcs(dt)
    updateWeather(dt)
  } else if (S) {
    updateWeather(dt)
  }
  updateFx(dt)
  render()
  requestAnimationFrame(loop)
}

showTitle()
requestAnimationFrame(loop)
// 디버그/테스트용 훅 (게임 로직에는 영향 없음)
window.__dg = { get S() { return S }, player, girl, MAP, nearestInteractable, activate, chooseOption, get ui() { return ui }, dlg, advanceDialogue, REACH, get viewTurn() { return viewTurn }, get pickups() { return pickups } }
