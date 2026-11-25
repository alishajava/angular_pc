import { sfx, unlockSfx, toggleMute } from './sfx.js'
import { drawPerson } from './people.js'
import { TILE, COLS, ROWS, W, H, MAPS } from './maps.js'
import { LOOKS, buildGround, drawProp } from './draw.js'
import * as C from './career.js'

const { clamp, rand, pick, fmt, RANKS, STAT_KEYS, STAT_LABELS, STAT_COLORS, ARCHETYPES } = C

// ====================================================================== 상수 ==
const SLOT_NAMES = ['오전', '점심', '오후', '저녁', '밤']
const SLOT_TIMES = ['09:00', '12:00', '14:00', '18:00', '21:00', '24:00']
const SAVE_KEY = 'jobsim-topview-save-v1'
const PLAYER_SPEED = 118
const PLAYER_HALF = 9

const canvas = document.getElementById('game')
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d')
const overlay = document.getElementById('overlay')

// ====================================================================== 상태 ==
let S = null
function newState(name, hairKey) {
  const s = C.freshCareerState()
  s.name = name || '민준'
  const h = C.HAIR_COLORS.find((x) => x.key === hairKey) || C.HAIR_COLORS[0]
  s.hairKey = h.key
  s.hairHex = h.hex
  s.mapKey = 'home'
  s.day = null
  return s
}
const player = { x: 0, y: 0, facing: 'down', moving: false, walk: 0 }
let elapsed = 0
let runtimeNpcs = []
let groundCache = {}
let ui = { menu: null, hits: [], prompt: null, hint: 1 }
let lockInput = false // 모달이 열려 있을 때

function slotNow() {
  return S && S.day ? S.day.slot : 0
}
const isNight = () => slotNow() >= 4
const isEvening = () => slotNow() === 3
const workHours = () => slotNow() <= 2

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
    return d && d.stats && d.turn !== undefined ? d : null
  } catch {
    return null
  }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* noop */ }
}

// ================================================================= 지도 / NPC ==
function curMap() {
  return MAPS[S.mapKey]
}
function loadNpcs() {
  const m = curMap()
  runtimeNpcs = m.npcs
    .filter((n) => {
      if (S.mapKey === 'office' && slotNow() >= 3) return false // 퇴근 후 사무실은 텅 비어 있다
      return true
    })
    .map((n) => ({ ...n, hx: n.x, hy: n.y, walk: 0, moving: false, facing: n.facing || 'down', timer: Math.random() * 3, dir: Math.random() < 0.5 ? 1 : -1, emote: null, emoteT: 0 }))
}
function enterMap(key, pos, facing = 'down') {
  S.mapKey = key
  player.x = pos.x
  player.y = pos.y
  player.facing = facing
  loadNpcs()
  getGround()
  ui.menu = null
}
function getGround() {
  const key = S.mapKey === 'office' ? `office|${S.company.name}` : S.mapKey
  if (!groundCache[key]) groundCache[key] = buildGround(S.mapKey, S.company)
  return groundCache[key]
}
function solidAt(c, r) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true
  return curMap().solid[r][c] === 1
}
function canMoveTo(x, y) {
  for (const [cx, cy] of [[x - PLAYER_HALF, y - PLAYER_HALF + 6], [x + PLAYER_HALF, y - PLAYER_HALF + 6], [x - PLAYER_HALF, y + PLAYER_HALF - 2], [x + PLAYER_HALF, y + PLAYER_HALF - 2]]) {
    if (solidAt(Math.floor(cx / TILE), Math.floor(cy / TILE))) return false
  }
  // 사람과는 부딪히지만, 이미 겹쳐 있으면 멀어지는 방향으로는 움직일 수 있게 한다 (끼어서 못 움직이는 문제 방지)
  for (const n of runtimeNpcs) {
    const d = Math.hypot(x - n.x, y - n.y)
    if (d < 16 && d < Math.hypot(player.x - n.x, player.y - n.y) + 0.01) return false
  }
  return true
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
const particles = []
function sparkle(x, y, color = '#ffe066', n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 30 + Math.random() * 60
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, life: 0.7, max: 0.7, color, size: 2 + Math.random() * 2 })
  }
}

// ================================================================== 능력치 변화 ==
function snap() {
  return { ...S.stats, stress: S.stress, money: S.money }
}
function gain(k, n) {
  if (k === 'stress') S.stress = clamp(S.stress + n)
  else if (k === 'money') S.money = Math.max(0, S.money + n)
  else S.stats[k] = clamp(S.stats[k] + n)
}
function diffText(before) {
  const parts = []
  for (const k of STAT_KEYS) {
    const d = S.stats[k] - before[k]
    if (d) parts.push(`${STAT_LABELS[k]} ${d > 0 ? '+' : ''}${d}`)
  }
  if (S.stress !== before.stress) parts.push(`스트레스 ${S.stress - before.stress > 0 ? '+' : ''}${S.stress - before.stress}`)
  if (S.money !== before.money) parts.push(`💰 ${S.money - before.money > 0 ? '+' : ''}${S.money - before.money}만`)
  return parts.join(' · ')
}

// ================================================================ 활동(스테이션) ==
const T = (arr) => pick(arr)
function menuFor(id) {
  const slot = slotNow()
  const co = C.archOf(S)
  const wh = workHours()
  const closed = (why) => ({ ok: false, why })
  const O = (label, desc, ok, run, extra = {}) => ({ label, desc, ok: ok === true, why: ok === true ? '' : ok.why, run, ...extra })
  switch (id) {
    case 'desk':
      return {
        title: '내 자리',
        options: [
          wh
            ? O('업무에 집중하기', '근무 시간 · 업무력 ↑ / 스트레스 약간 ↑', true, () => {
                gain('work', rand(4, 7)); gain('stress', rand(2, 4)); S.day.workSlots++
                return T(['밀린 보고서를 한 장씩 처리해 나갔다.', '메일 답장을 쳐내고 기획안을 다듬었다.', '집중해서 자료를 정리하니 시간이 훌쩍 지나갔다.'])
              })
            : O('야근하기', '업무력 ↑↑ · 야근 수당 · 스트레스 ↑', true, () => {
                gain('work', rand(5, 9)); gain('money', rand(12, 22)); gain('stress', rand(4, 7))
                return T(['불 꺼진 사무실에서 혼자 남아 일을 마무리했다.', '야식을 시켜 놓고 밤늦게까지 업무를 처리했다.'])
              }),
        ],
      }
    case 'boss':
      if (!wh) return { title: '이사실', options: [O('면담', '', closed('이사님은 퇴근하셨다'), () => '')] }
      return {
        title: '한 이사 (상사)',
        options: [
          O('업무 보고하기', '신뢰 ↑ (업무력이 높을수록 좋은 평가)', true, () => {
            S.day.workSlots++
            if (S.stats.work >= 45) {
              gain('trust', rand(4, 7)); gain('stress', -rand(0, 2))
              return T(['"요즘 일 잘하고 있다더군." 한 이사가 만족스럽게 고개를 끄덕였다.', '보고가 깔끔하다는 칭찬을 들었다.'])
            }
            gain('trust', rand(1, 3)); gain('stress', rand(3, 5))
            return T(['"아직 많이 부족하네. 더 분발해 주게." 쓴소리를 들었다.', '보고 내용에 빈틈이 많다는 지적을 받았다.'])
          }),
        ],
      }
    case 'meeting':
      return {
        title: '회의실',
        options: [
          O('회의 참석하기', '업무력·신뢰 ↑ / 스트레스 ↑', slot === 0 || slot === 2 ? true : closed('지금은 잡힌 회의가 없다 (오전·오후 회의)'), () => {
            gain('work', rand(2, 4)); gain('trust', rand(3, 5)); gain('stress', rand(2, 4)); S.day.workSlots++
            return T(['주간 회의에서 의견을 내 팀원들의 호응을 얻었다.', '길고 긴 회의였지만 핵심을 정리해 발표했다.'])
          }),
        ],
      }
    case 'library':
      return {
        title: '자료실',
        options: [O('자료실에서 공부하기', '전문성 ↑', true, () => {
          gain('expertise', rand(4, 7)); gain('stress', rand(1, 3))
          return T(['업계 보고서와 전문 서적을 파고들었다.', '조용한 자료실에서 새로운 기술을 익혔다.'])
        })],
      }
    case 'club':
      return {
        title: '동아리방 (사내 동아리)',
        options: [O('동아리 활동하기', '신뢰 ↑ / 스트레스 ↓', slot >= 2 ? true : closed('동아리 활동은 오후 2시 이후에'), () => {
          gain('trust', rand(4, 6)); gain('network', rand(1, 2)); gain('stress', -rand(2, 4))
          return T(['사내 탁구 동아리에서 땀을 흘리며 동료들과 웃었다.', '동아리 봉사활동에 참여해 사람들의 신뢰를 얻었다.'])
        })],
      }
    case 'academy':
      return {
        title: '직무 학원',
        options: [O('저녁 강의 듣기', '전문성 ↑↑ / 스트레스 ↑', slot >= 3 ? true : closed('저녁 강의는 퇴근 후(18시~)에'), () => {
          gain('expertise', rand(5, 8)); gain('stress', rand(3, 5))
          return T(['퇴근 후 직무 강의를 들으며 노트를 빼곡히 채웠다.', '실무 사례 수업에서 새로운 관점을 배웠다.'])
        })],
      }
    case 'restaurant':
      return {
        title: '식당',
        options: [
          slot === 1
            ? O('동료와 점심 먹기', '인맥 ↑ / 스트레스 ↓', true, () => {
                gain('network', rand(2, 4)); gain('stress', -rand(3, 6))
                return T(['동료들과 점심을 먹으며 수다를 떨었다.', '맛집 순례로 스트레스를 풀었다.'])
              })
            : O('혼자 저녁 먹기', '스트레스 ↓', slot === 3 ? true : closed('식사 시간이 아니다 (점심 12시 · 저녁 18시)'), () => {
                gain('stress', -rand(3, 5)); gain('network', 1)
                return '따뜻한 저녁을 먹고 마음이 한결 편안해졌다.'
              }),
        ],
      }
    case 'bar':
      return {
        title: '호프집 (회식)',
        options: [O('회식·술자리', '인맥 ↑↑ / 체력 ↓', slot >= 3 ? true : closed('호프집은 저녁(18시~)에 연다'), () => {
          gain('network', rand(4, 7)); gain('stamina', -rand(2, 4)); gain('stress', -rand(1, 3)); gain('money', -rand(2, 5))
          return T(['팀 회식에서 상사와 동료들과 한층 가까워졌다.', '술잔을 부딪치며 속 깊은 얘기를 나눴다.'])
        })],
      }
    case 'convenience':
      return {
        title: '편의점',
        options: [O('편의점 알바하기', '돈 ↑↑ / 체력 ↓ / 스트레스 ↑', slot >= 3 ? true : closed('알바는 퇴근 후(18시~)에'), () => {
          gain('money', rand(35, 55)); gain('stamina', -rand(3, 5)); gain('stress', rand(3, 5))
          return T(['야간 알바로 짬짬이 돈을 벌었다.', '진열대를 채우고 계산대를 보며 시급을 벌었다.'])
        })],
      }
    case 'headhunter':
      return {
        title: '헤드헌팅 사무소',
        options: [O('이직 상담받기', '이직 제안 받기 · 전문성 약간 ↑', slot <= 3 ? true : closed('상담 시간이 끝났다 (21시 전까지)'), () => {
          gain('expertise', rand(1, 2)); gain('stress', rand(2, 4))
          const p = 0.25 + (S.stats.expertise + S.stats.network) / 300
          let n = 0
          for (let i = 0; i < 3; i++) if (Math.random() < p) n++
          S.offers = C.generateOffers(n)
          S.afterNote = S.offers.length ? 'offers' : ''
          return S.offers.length ? `이력서를 맡기고 면접을 봤다. ${S.offers.length}곳에서 제안이 왔다!` : '이력서를 맡기고 상담을 받았지만, 아직 마음에 드는 제안은 없었다.'
        })],
      }
    case 'travel':
      return {
        title: '여행사',
        options: [O('휴가 내고 여행 떠나기 (250만)', '남은 하루를 모두 쓴다 · 랜덤 대폭 성장', S.money >= 250 ? (slot <= 3 ? true : closed('늦은 시간이라 떠날 수 없다')) : closed('여행 경비 250만이 필요하다'), () => {
          gain('money', -250)
          const picks = []
          while (picks.length < 2) { const k = pick(STAT_KEYS); if (!picks.includes(k)) picks.push(k) }
          for (const k of picks) gain(k, rand(8, 14))
          gain('stress', -rand(15, 22))
          return `휴가를 내고 여행을 떠나 재충전하고 돌아왔다. (${picks.map((k) => STAT_LABELS[k]).join(', ')} 상승)`
        }, { slots: 'all' })],
      }
    case 'park':
      return {
        title: '공원 벤치',
        options: [O('벤치에서 쉬기', '스트레스 ↓ / 체력 ↑', true, () => {
          gain('stress', -rand(4, 7)); gain('stamina', rand(2, 3))
          return T(['벤치에 앉아 멍하니 연못을 바라봤다.', '산책하며 머릿속을 비웠다.'])
        })],
      }
    case 'sofa':
      return {
        title: '소파',
        options: [O('소파에서 쉬기', '스트레스 ↓↓ / 체력 ↑', slot >= 3 ? true : closed('퇴근 후에 쉴 수 있다'), () => {
          gain('stress', -rand(5, 8)); gain('stamina', rand(3, 5))
          return T(['소파에 누워 드라마를 보며 푹 쉬었다.', '좋아하는 음악을 틀어 놓고 늘어져 있었다.'])
        })],
      }
    case 'homepc':
      return {
        title: '컴퓨터 (재택 부업)',
        options: [O('재택 부업하기', '돈 ↑ / 체력 ↓', slot >= 3 ? true : closed('퇴근 후에 할 수 있다'), () => {
          gain('money', rand(30, 45)); gain('stamina', -rand(2, 4)); gain('stress', rand(2, 4))
          return '집 컴퓨터로 번역·디자인 부업을 했다.'
        })],
      }
    case 'bed':
      return {
        title: '침대',
        options: [O('잠자기 (하루 마치기)', `남은 시간이 많을수록 푹 쉰다 (남은 ${5 - slot}칸)`, true, null, { sleep: true })],
      }
    default:
      return null
  }
}

function openMenu(id, label) {
  const m = menuFor(id)
  if (!m) return
  ui.menu = { id, title: m.title, options: m.options, sel: 0 }
  sfx.click()
}

function chooseOption(i) {
  const m = ui.menu
  if (!m) return
  const o = m.options[i]
  if (!o) return
  if (!o.ok) {
    sfx.bad()
    return
  }
  ui.menu = null
  if (o.sleep) return sleepNow()
  const before = snap()
  const n = o.slots === 'all' ? 5 - S.day.slot : 1
  transition(() => {
    const text = o.run()
    const slotName = SLOT_NAMES[S.day.slot]
    S.day.slot = Math.min(5, S.day.slot + n)
    S.day.log.push(`[${slotName}] ${text}`)
    const d = diffText(before)
    dlgAfterAction(text, d)
    sfx.pickup()
  })
}
function dlgAfterAction(text, d) {
  const next = S.day.slot < 5 ? `\n(다음: ${SLOT_NAMES[S.day.slot]} ${SLOT_TIMES[S.day.slot]})` : '\n(하루가 끝났다...)'
  say('', `${text}\n${d}${next}`, () => {
    if (S.afterNote === 'offers') {
      S.afterNote = ''
      return showOffers(() => afterActionContinue())
    }
    afterActionContinue()
  })
  loadNpcs()
}
function afterActionContinue() {
  if (S.day.slot >= 5) sleepNow(true)
}
function freeAction(text, fn) {
  const before = snap()
  fn()
  const d = diffText(before)
  say('', d ? `${text}\n${d}` : text)
}

// ================================================================ 상호작용 감지 ==
function nearestInteractable() {
  const m = curMap()
  let best = null
  const consider = (item) => {
    const d = Math.hypot(player.x - item.x, player.y - item.y)
    if (d <= item.radius && (!best || d < best.d)) best = { ...item, d }
  }
  for (const s of m.stations) consider({ kind: 'station', id: s.id, x: s.x, y: s.y, radius: s.radius, label: s.label })
  for (const n of runtimeNpcs) {
    if (n.role === 'walker') continue
    consider({ kind: 'npc', id: n.id, x: n.x, y: n.y, radius: 46, label: n.name, npc: n })
  }
  return best
}

const FREE_STATIONS = new Set(['elevator', 'door_office', 'door_home', 'door_street', 'coffee', 'copier'])
function activate(it) {
  if (it.kind === 'npc') return talkTo(it.npc)
  const id = it.id
  if (id === 'elevator') return go('street', MAPS.street.spawnFromOffice, 'down')
  if (id === 'door_office') return go('office', MAPS.office.spawn, 'up')
  if (id === 'door_home') return go('home', MAPS.home.spawnFromStreet, 'up')
  if (id === 'door_street') return go('street', MAPS.street.spawnFromHome, 'down')
  if (id === 'coffee') {
    if (S.day.coffee) return say('', '이미 커피를 한 잔 마셨다. (하루 한 번)')
    S.day.coffee = true
    sfx.pickup()
    return freeAction('탕비실에서 커피를 내려 마셨다. 잠깐의 여유가 생겼다.', () => { gain('stress', -rand(2, 4)); gain('network', 1) })
  }
  if (id === 'copier') {
    if (S.day.copier) return say('', '오늘 복사할 서류는 다 했다. (하루 한 번)')
    S.day.copier = true
    sfx.pickup()
    return freeAction('복사기 앞에서 서류를 뽑으며 선배의 잡무를 도왔다.', () => { gain('work', 1); gain('trust', rand(1, 2)); gain('stress', 1) })
  }
  openMenu(id, it.label)
}
function go(key, pos, facing) {
  sfx.door()
  transition(() => enterMap(key, pos, facing))
}

// ----------------------------------------------------------------- NPC 대화 ----
const LINES = {
  colleague: [
    '요즘 분기마다 평가가 빡빡하더라고요. 같이 힘내요!',
    '점심은 뭐 드실래요? 근처에 새로 생긴 식당 괜찮대요.',
    '이번 프로젝트 마감이 코앞이에요... 커피 수혈이 필요해요.',
    '이직 생각해 봤어요? 헤드헌터 사무소가 길 건너편에 있잖아요.',
    '야근도 좋지만 스트레스 관리부터 해야 오래 가요.',
    '인사팀에 물어보면 승진까지 얼마나 남았는지 알려 줘요.',
  ],
  oh: ['부장은 말이야, 후배들이 믿고 따라와야 하는 자리야. 신뢰가 제일 중요해.', '일만 잘해서는 안 돼. 사람을 얻어야지.'],
}
function talkTo(n) {
  n.facing = (() => {
    const dx = player.x - n.x
    const dy = player.y - n.y
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
  })()
  n.emote = '!'
  n.emoteT = 1.2
  sfx.click()
  if (n.role === 'hr') return hrTalk(n)
  if (n.role === 'boss') return openMenu('boss', n.name)
  const first = !S.day.talked[n.id]
  S.day.talked[n.id] = true
  const line = n.id === 'oh' ? T(LINES.oh) : T(LINES.colleague)
  if (!first) return say(n.name, line)
  const before = snap()
  gain('network', rand(1, 2))
  if (n.id === 'oh') gain('trust', 1)
  say(n.name, `${line}\n${diffText(before)}`)
}
function hrTalk(n) {
  const rank = RANKS[S.rankIdx]
  const a = C.archOf(S)
  const needQ = (rank.minYears + a.promo) * 4
  const left = Math.max(0, needQ - S.qAtRank)
  const w = a.w
  const promo = S.rankIdx >= 3 ? '더 이상 올라갈 직급은 없네요.' : left > 0 ? `${rank.label} 승진까지 최소 ${Math.ceil(left / 4 * 10) / 10}년 남았어요. (평가 A 이상 필요)` : `승진 요건 시간은 채웠어요! 이번 평가에서 A 이상이면 승진 가능해요.`
  say(n.name, `${S.name}님은 지금 ${rank.label}, 연봉 ${fmt(S.salary)}이고 근속 ${(S.tenureQ / 4).toFixed(1)}년이에요.\n${promo}\n우리 회사(${a.label})는 업무 ${Math.round(w.work * 100)}% · 전문성 ${Math.round(w.expertise * 100)}% · 신뢰 ${Math.round(w.trust * 100)}% · 인맥 ${Math.round(w.network * 100)}%로 평가해요.`)
}

// ================================================================== 하루의 끝 ==
function sleepNow(auto = false) {
  const leftover = 5 - S.day.slot
  S.day.leftover = leftover
  // 집으로 돌아가 잠드는 연출
  transition(() => {
    endDay(leftover)
  })
}

function endDay(leftover) {
  const lines = []
  const d = S.day
  // 1) 회사 문화: 하루 동안 쌓은 성장/스트레스에 보정
  const co = C.archOf(S)
  for (const k of ['work', 'expertise']) {
    const diff = S.stats[k] - d.start.stats[k]
    if (diff > 0) S.stats[k] = clamp(d.start.stats[k] + Math.round(diff * co.growth))
  }
  const sd = S.stress - d.start.stress
  if (sd > 0) S.stress = clamp(d.start.stress + Math.round(sd * co.stress))
  // 2) 근태: 근무 시간(오전·점심 외 오후)에 일한 칸 수
  if (!S.sickDay) {
    if (d.workSlots === 0) { gain('trust', -4); gain('stress', 3); lines.push('근무 시간에 거의 자리를 비워 근태 평가가 나빠졌다. (신뢰 -4)') }
    else if (d.workSlots === 1) { gain('trust', -1); lines.push('업무 시간에 자리를 자주 비웠다. (신뢰 -1)') }
    else if (d.workSlots >= 3) { gain('trust', 1); lines.push('근무 시간을 성실하게 채웠다. (신뢰 +1)') }
    // 3) 무작위 사건
    if (Math.random() < 0.55) {
      const cand = C.EVENTS.filter((e) => !e.condition || e.condition(S))
      const ev = pick(cand)
      ev.run(S)
      lines.push('오늘의 일: ' + ev.text)
    }
  }
  // 4) 잠: 남은 시간이 많을수록 푹 쉰다
  const rest = S.sickDay ? rand(20, 28) : rand(4, 6) + 3 * leftover
  S.stress = clamp(S.stress - rest)
  S.stats.stamina = clamp(S.stats.stamina + (S.sickDay ? 8 : 2 * leftover))
  lines.push(S.sickDay ? '병가를 내고 하루 종일 쉬었다.' : leftover > 0 ? `일찍 쉬어서 푹 잤다. (스트레스 -${rest})` : '늦게까지 일정을 소화하고 쓰러지듯 잠들었다.')
  // 5) 헤드헌터 연락 / 병가
  if (!S.sickDay && !S.offers.length && Math.random() < (S.stats.expertise + S.stats.network) / 650) {
    S.offers = C.generateOffers(1)
    if (S.offers.length) lines.push(`헤드헌터에게서 이직 제안이 왔다! (${S.offers[0].name})`)
  }
  S.sick = false
  if (!S.sickDay && S.stress >= 92 && Math.random() < 0.35) {
    S.sick = true
    lines.push('무리를 한 탓인지 몸이 으슬으슬하다... (다음 분기 시작은 병가)')
  }
  S.sickDay = false
  if (S.stress >= 85) S.burnoutTurns += 1
  // 6) 급여: 세후 월급 - 생활비
  const income = Math.round((S.salary * 0.88) / 4)
  const living = Math.round(income * 0.55 + RANKS[S.rankIdx].living * 0.45)
  S.money = Math.max(0, S.money + income - living)
  S.totalEarned += income
  S.lastPay = { income, living }
  S.tenureQ += 1
  S.qAtRank += 1
  S.turn += 1
  // 요약 창
  showDaySummary(lines)
}

// ================================================================ 모달(DOM) ==
function showOverlay(html) {
  held.clear()
  overlay.innerHTML = html
  overlay.classList.add('on')
  lockInput = true
}
function hideOverlay() {
  held.clear()
  overlay.classList.remove('on')
  overlay.innerHTML = ''
  lockInput = false
}
function cardHtml(title, body, btns) {
  return `<div class="modal"><div class="modal-title">${title}</div><div class="modal-body">${body}</div><div class="modal-btns">${btns}</div></div>`
}

function showDaySummary(lines) {
  const d = S.day
  const ws = d.workSlots
  const pay = S.lastPay
  const quarterIdx = (S.turn - 1) % 4
  const yr = Math.min(8, C.yearAt(S.turn - 1))
  const body = `
    <div class="log-box">${d.log.length ? d.log.join('\n') : '(오늘은 별다른 활동 없이 지나갔다)'}</div>
    <div class="log-box">${lines.join('\n')}</div>
    <div class="pay-line"><span>급여(세후) +${fmt(pay.income)}</span><span>생활비 −${fmt(pay.living)}</span><b>${pay.income - pay.living >= 0 ? '+' : ''}${fmt(pay.income - pay.living)}</b></div>
    <div class="muted" style="margin-top:.4rem">근무 시간 업무 ${ws}칸 · 💰 ${fmt(S.money)} · 스트레스 ${S.stress}</div>`
  showOverlay(cardHtml(`${yr}년차 ${C.QUARTER_NAMES[quarterIdx]} 마감`, body, '<button class="continue-btn" id="m-ok">계속</button>'))
  document.getElementById('m-ok').onclick = () => {
    hideOverlay()
    afterSummary()
  }
}

function afterSummary() {
  if (S.turn >= C.TOTAL_TURNS) return showEnding()
  if (S.turn % 4 === 0 && S.turn > 0) {
    S.review = C.computeReview()
    const g = S.review.grade
    setTimeout(() => (S.review.promoted ? sfx.fanfare() : g === 'S' || g === 'A' ? sfx.good() : g === 'D' ? sfx.bad() : sfx.pickup()), 120)
    return showReview(() => afterReview())
  }
  afterReview()
}
function afterReview() {
  if (S.offers.length) {
    sfx.alarm()
    return showOffers(() => nextDay())
  }
  nextDay()
}

function showReview(next) {
  const r = S.review
  const a = C.archOf(S)
  const wtxt = `업무 ${Math.round(a.w.work * 100)}% · 전문성 ${Math.round(a.w.expertise * 100)}% · 신뢰 ${Math.round(a.w.trust * 100)}% · 인맥 ${Math.round(a.w.network * 100)}%`
  const body = `
    <div class="review-card">
      <div class="review-head"><div class="grade grade-${r.grade}">${r.grade}</div>
        <div><div class="review-title">${r.year}년차 인사평가 · ${C.GRADE_TEXT[r.grade]}</div>
        <div class="review-sub">평가 점수 ${r.score}점 · ${a.label} 기준 (${wtxt})</div></div></div>
      <div class="review-row"><span>연봉</span><b>${fmt(r.before)} → ${fmt(r.after)} <em>${r.raisePct > 0 ? `+${r.raisePct}%` : '동결'}</em></b></div>
      <div class="review-row"><span>성과급</span><b>${r.bonus > 0 ? `+${fmt(r.bonus)}` : '없음'}</b></div>
      ${r.promoted ? `<div class="promo">🎉 승진! ${r.promoted.from} → ${r.promoted.to} (연봉 +8%)</div>` : ''}
      ${!r.promoted && S.rankIdx < 3 ? `<div class="review-note">다음 승진까지: 현재 직급 ${Math.floor(S.qAtRank / 4)}년 근무 · 평가 A 이상 필요</div>` : ''}
    </div>`
  showOverlay(cardHtml('연말 인사평가', body, '<button class="continue-btn" id="m-ok">확인</button>'))
  document.getElementById('m-ok').onclick = () => {
    hideOverlay()
    next()
  }
}

let negMsg = ''
function showOffers(next) {
  const cur = S.salary
  const cards = S.offers.map((o, i) => {
    const a = ARCHETYPES[o.arch]
    const diff = Math.round(((o.salary - cur) / cur) * 100)
    return `<div class="offer-card">
      <div class="offer-head"><b>${o.name}</b><span class="tag">${a.label}</span>${o.rankIdx > S.rankIdx ? '<span class="tag up-tag">직급 상승</span>' : ''}</div>
      <div class="offer-line">${RANKS[o.rankIdx].label} · 연봉 <b>${fmt(o.salary)}</b> <em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}%</em></div>
      <div class="offer-note">${a.note}</div>
      <div class="offer-actions">
        <button class="mini-btn" data-neg="${i}" ${o.negotiated ? 'disabled' : ''}>${o.negotiated ? '협상 완료' : '연봉 협상'}</button>
        <button class="mini-btn go" data-accept="${i}">이직하기</button></div></div>`
  }).join('')
  const body = `<div class="log-box">이직 제안이 도착했다. 지금 회사: <b>${S.company.name}</b> (${C.archOf(S).label}) · 연봉 ${fmt(cur)}${negMsg ? `\n${negMsg}` : ''}</div>
    <div class="offer-list">${cards || '<div class="muted">제안이 모두 사라졌다.</div>'}</div>
    <div class="offer-tip">이직하면 근속이 초기화되고 신뢰가 절반으로 줄어요. 회사 성격에 따라 스트레스·성장·승진 속도가 달라집니다.</div>`
  showOverlay(cardHtml('이직 제안', body, `<button class="continue-btn" id="m-decline">${S.offers.length ? '모두 거절하고 남는다' : '돌아가기'}</button>`))
  overlay.querySelectorAll('[data-neg]').forEach((b) => (b.onclick = () => {
    const r = C.negotiateOffer(Number(b.dataset.neg))
    if (r) { negMsg = r.msg; r.kind === 'good' ? sfx.good() : r.kind === 'bad' ? sfx.bad() : sfx.click() }
    showOffers(next)
  }))
  overlay.querySelectorAll('[data-accept]').forEach((b) => (b.onclick = () => {
    const msg = C.acceptOfferAt(Number(b.dataset.accept))
    negMsg = ''
    sfx.start()
    groundCache = {}
    showOverlay(cardHtml('새 직장', `<div class="log-box">${msg}</div>`, '<button class="continue-btn" id="m-ok">출근하기</button>'))
    document.getElementById('m-ok').onclick = () => { hideOverlay(); next() }
  }))
  document.getElementById('m-decline').onclick = () => {
    S.offers = []
    negMsg = ''
    hideOverlay()
    next()
  }
}

function showEnding() {
  S.offers = []
  S.ending = C.computeEnding(S)
  setTimeout(() => (S.ending.title.includes('번아웃') ? sfx.lose() : sfx.fanfare()), 120)
  clearSave()
  const career = S.history.map((h) => `<li>${h.moved ? '↪ ' : ''}${h.year}년차 · ${h.company} · ${h.rank} · ${fmt(h.salary)}${h.grade ? ` (평가 ${h.grade})` : ''}</li>`).join('')
  overlay.innerHTML = `<div class="ending-wrap">
      <canvas id="ending-canvas" width="160" height="200"></canvas>
      <h2 class="ending-title">${S.ending.title}</h2>
      <div class="ending-text">${S.ending.text}</div>
      <div class="ending-stats">업무력 ${S.stats.work} · 체력 ${S.stats.stamina} · 인맥 ${S.stats.network} · 전문성 ${S.stats.expertise} · 신뢰 ${S.stats.trust}<br>최종 연봉 ${fmt(S.salary)} · 이직 ${S.transfers}회 · 누적 수입 ${fmt(S.totalEarned)} · 자산 ${fmt(S.money)}</div>
      <details class="career"><summary>커리어 기록 보기</summary><ul>${career}</ul></details>
      <button class="restart-btn" id="restart-btn">다시 시작하기</button></div>`
  overlay.classList.add('on', 'solid')
  lockInput = true
  const ec = document.getElementById('ending-canvas').getContext('2d')
  drawPerson(ec, 80, 150, { ...playerLook(), outfit: 'suit' }, { facing: 'down', t: 0 })
  document.getElementById('restart-btn').onclick = () => {
    overlay.classList.remove('solid')
    showTitle()
  }
}

// ================================================================== 하루 시작 ==
function nextDay() {
  hideOverlay()
  startDay()
}
function startDay() {
  S.day = {
    slot: 0,
    talked: {},
    workSlots: 0,
    log: [],
    coffee: false,
    copier: false,
    start: { stats: { ...S.stats }, stress: S.stress },
    intro: false,
  }
  S.afterNote = ''
  saveGame()
  enterMap('home', MAPS.home.spawn, 'down')
  ui.hint = 1
  if (S.sick) {
    S.sickDay = true
    S.day.slot = 5
    showOverlay(cardHtml('병가', `<div class="log-box">${S.name}은(는) 번아웃 조짐으로 이번 분기는 병가를 내고 쉬기로 했다.</div>`, '<button class="continue-btn" id="m-ok">푹 쉬기</button>'))
    document.getElementById('m-ok').onclick = () => {
      hideOverlay()
      transition(() => endDay(5))
    }
    return
  }
  const yr = Math.min(8, C.yearAt(S.turn))
  const co = C.archOf(S)
  say('', `${yr}년차 ${C.quarterAt(S.turn)}. ${S.company.name}(${co.label}) ${RANKS[S.rankIdx].label} ${S.name}의 하루가 시작된다.\n집을 나서 회사로 출근하자. 근무 시간(오전·점심·오후)에는 일을 해야 평가가 좋아져요.`)
}

// ================================================================== 타이틀 ==
function showTitle() {
  const save = readSave()
  let hairKey = (S && S.hairKey) || C.HAIR_COLORS[0].key
  const render = () => {
    overlay.innerHTML = `<div class="title-wrap">
      <h1>직장 시뮬레이터</h1>
      <div class="subtitle">신입사원부터 임원까지, 8년간의 회사 생활을 직접 걸어 다니며 살아보세요</div>
      <div class="field-row"><label>이름</label><input id="name-input" type="text" maxlength="8" placeholder="예: 민준" value="${(document.getElementById('name-input') && document.getElementById('name-input').value) || '민준'}" /></div>
      <div class="field-row"><label>머리색</label><div class="swatch-row">${C.HAIR_COLORS.map((h) => `<div class="swatch ${h.key === hairKey ? 'selected' : ''}" data-hair="${h.key}" style="background:${h.hex}" title="${h.label}"></div>`).join('')}</div></div>
      <button class="primary-btn" id="start-btn">입사하기</button>
      ${save ? `<button class="mini-btn" id="cont-btn" style="margin-top:.7rem;padding:.55rem 1.4rem">이어하기 · ${Math.min(8, C.yearAt(save.turn))}년차 ${C.QUARTER_NAMES[save.turn % 4]} (${save.name})</button>` : ''}
      <div class="hint">집에서 출근해 사무실·거리를 걸어 다니세요. 하루(분기)에는 오전·점심·오후·저녁·밤 다섯 칸이 있고, 장소마다 할 수 있는 일이 달라요. 4분기마다 인사평가, 이직 제안, 번아웃에 주의하세요. 8년이 지나면 엔딩이 결정됩니다.</div>
      <div class="hint">조작: 방향키/WASD 이동 · E/Space 상호작용 · 숫자키/클릭 선택 · Esc 닫기</div></div>`
    overlay.classList.add('on', 'solid')
    lockInput = true
    document.querySelectorAll('.swatch').forEach((el) => (el.onclick = () => { hairKey = el.dataset.hair; render() }))
    document.getElementById('start-btn').onclick = () => {
      const name = document.getElementById('name-input').value.trim() || '민준'
      S = newState(name, hairKey)
      C.bindState(S)
      groundCache = {}
      overlay.classList.remove('solid')
      hideOverlay()
      sfx.start()
      startDay()
    }
    const cont = document.getElementById('cont-btn')
    if (cont) cont.onclick = () => {
      S = save
      C.bindState(S)
      groundCache = {}
      overlay.classList.remove('solid')
      hideOverlay()
      sfx.start()
      startDay()
    }
  }
  if (!S) { S = newState('민준'); C.bindState(S) }
  render()
}

// ================================================================== 입력 ==
const held = new Set()
const MOVE = { up: ['w', 'arrowup'], down: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'] }
const heldAny = (names) => names.some((k) => held.has(k))
// 키 이름을 e.code 기준으로 통일한다. (한글 입력기 상태나 키보드 배열이 달라도 WASD/방향키가 똑같이 동작하고,
// keydown/keyup의 key 값이 달라서 키가 '눌린 채로' 남아 혼자 걸어가는 문제를 막는다)
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
  if (e.metaKey) clearHeld() // 맥에서 Cmd를 누르면 keyup이 오지 않아 키가 남는 문제
  held.add(key)
  if (e.repeat) return
  if (key === 'm') return void toggleMute()
  if (lockInput) return
  if (dlg.active) {
    if (key === ' ' || key === 'enter' || key === 'e') advanceDialogue()
    return
  }
  if (fade.dir) return
  if (ui.menu) {
    if (key === 'escape') ui.menu = null
    else if (/^[1-9]$/.test(key)) chooseOption(Number(key) - 1)
    else if (key === 'arrowup') ui.menu.sel = (ui.menu.sel + ui.menu.options.length - 1) % ui.menu.options.length
    else if (key === 'arrowdown') ui.menu.sel = (ui.menu.sel + 1) % ui.menu.options.length
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
// 창/탭을 벗어나거나 포커스가 바뀌면 눌린 키를 모두 놓은 것으로 본다
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
  if (dlg.active) return advanceDialogue()
  if (ui.menu) {
    for (const h of ui.hits) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.fn()
    ui.menu = null
    return
  }
  for (const h of ui.hits) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.fn()
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
  const locked = lockInput || dlg.active || fade.dir !== 0 || !!ui.menu
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
    const tx = player.x + dx * PLAYER_SPEED * dt
    if (canMoveTo(tx, player.y)) player.x = tx
    const ty = player.y + dy * PLAYER_SPEED * dt
    if (canMoveTo(player.x, ty)) player.y = ty
  }
  ui.prompt = locked ? null : nearestInteractable()
}
function updateNpcs(dt) {
  for (const n of runtimeNpcs) {
    if (n.emoteT > 0) { n.emoteT -= dt; if (n.emoteT <= 0) n.emote = null }
    if (n.wander) {
      n.moving = true
      const cx = n.x + n.dir * 26 * dt
      if (cx < n.wander.x0 * TILE || cx > n.wander.x1 * TILE) n.dir *= -1
      else if (!(Math.hypot(cx - player.x, n.y - player.y) < 22)) n.x = cx
      n.facing = n.dir > 0 ? 'right' : 'left'
      n.walk += dt * 6
    } else if (n.role === 'colleague' || n.role === 'hr' || n.role === 'boss') {
      n.moving = false
      const d = Math.hypot(player.x - n.x, player.y - n.y)
      if (d < 70 && !dlg.active) {
        const dx = player.x - n.x
        const dy = player.y - n.y
        n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      } else if (n.sit) n.facing = 'up'
    }
  }
}
const cars = [
  { x: 100, lane: 7.55, dir: -1, speed: 70, color: '#d94a4a' },
  { x: 500, lane: 8.55, dir: -1, speed: 50, color: '#4a7ac0' },
  { x: 250, lane: 9.55, dir: 1, speed: 80, color: '#f0c040' },
  { x: 650, lane: 10.4, dir: 1, speed: 60, color: '#e8e8ee' },
]
function updateCars(dt) {
  for (const c of cars) {
    c.x += c.dir * c.speed * dt
    if (c.x < -60) c.x = W + 60
    if (c.x > W + 60) c.x = -60
  }
}
function updateFx(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
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
function playerLook() {
  const r = S.rankIdx
  const base = { skin: '#f4cba2', hair: S.hairHex, hairStyle: 'messy', pants: '#3a4a6a', shoes: '#2b2440', eye: '#2f5fa0' }
  if (r === 0) return { ...base, shirt: '#3f9fd1', outfit: 'tee' }
  if (r === 1) return { ...base, shirt: '#3a4a6a', jacket: '#3a4a6a', pants: '#2c3446', outfit: 'suit', tie: '#d86a4a' }
  if (r === 2) return { ...base, shirt: '#2f3a52', jacket: '#2f3a52', pants: '#252c3c', outfit: 'suit', tie: '#2f6fb0', glasses: false }
  return { ...base, shirt: '#22262e', jacket: '#22262e', pants: '#1a1c24', outfit: 'suit', tie: '#7a1e2a' }
}

function render() {
  ctx.clearRect(0, 0, W, H)
  if (!S || !S.day) { ctx.fillStyle = '#c7d4ec'; ctx.fillRect(0, 0, W, H); return }
  const m = curMap()
  ctx.drawImage(getGround(), 0, 0)
  const env = { t: elapsed, night: isEvening() || isNight() }
  const objs = []
  for (const p of m.props) {
    const under = p.kind === 'rug' || p.kind === 'pond'
    objs.push({ y: under ? -1 : (p.r + p.h) * TILE - 2, f: () => drawProp(ctx, p, elapsed, env) })
  }
  for (const n of runtimeNpcs) {
    objs.push({ y: n.y + 6, f: () => drawNpc(n) })
  }
  if (S.mapKey === 'street') for (const c of cars) objs.push({ y: c.lane * TILE + 14, f: () => drawCar(c) })
  objs.push({ y: player.y + 8, f: drawPlayer })
  objs.sort((a, b) => a.y - b.y)
  for (const o of objs) o.f()
  drawFx()
  drawTint()
  drawHud()
  drawPrompt()
  drawMenu()
  drawDialogue()
  if (fade.dir) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade.t)})`; ctx.fillRect(0, 0, W, H) }
}
function drawNpc(n) {
  const look = LOOKS[n.look]
  drawPerson(ctx, n.x, n.y + 6, look, { facing: n.facing, walk: n.walk, moving: n.moving, t: elapsed, sit: !!n.sit, emote: n.emote, pose: n.emote === '!' ? { type: 'wave', p: 0 } : null })
}
function drawPlayer() {
  drawPerson(ctx, player.x, player.y + 8, playerLook(), { facing: player.facing, walk: player.walk, moving: player.moving, t: elapsed })
}
function drawCar(c) {
  const y = c.lane * TILE
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(c.x - 26, y + 12, 54, 6)
  ctx.fillStyle = c.color
  ctx.beginPath(); ctx.roundRect(c.x - 28, y - 2, 56, 20, 7); ctx.fill()
  ctx.fillStyle = 'rgba(190,225,250,0.9)'
  ctx.fillRect(c.x - 10, y + 1, 20, 12)
  ctx.fillStyle = (isEvening() || isNight()) ? '#fff6c0' : '#d8d8d0'
  ctx.fillRect(c.dir > 0 ? c.x + 24 : c.x - 28, y + 2, 4, 5)
  ctx.fillRect(c.dir > 0 ? c.x + 24 : c.x - 28, y + 11, 4, 5)
}
function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
}
function drawTint() {
  const s = slotNow()
  if (s === 3) { ctx.fillStyle = S.mapKey === 'street' ? 'rgba(255,140,60,0.2)' : 'rgba(255,170,90,0.1)'; ctx.fillRect(0, 0, W, H) }
  else if (s >= 4) { ctx.fillStyle = S.mapKey === 'street' ? 'rgba(14,22,70,0.5)' : 'rgba(14,22,70,0.26)'; ctx.fillRect(0, 0, W, H) }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
}
function panel(x, y, w, h, r = 10, fill = 'rgba(16,22,40,0.82)', stroke = 'rgba(160,190,255,0.35)') {
  ctx.fillStyle = fill
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke()
}
function drawHud() {
  const rank = RANKS[S.rankIdx]
  ctx.fillStyle = 'rgba(14,20,40,0.88)'
  ctx.fillRect(0, 0, W, 38)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 13px sans-serif'
  const yr = Math.min(8, C.yearAt(Math.min(S.turn, C.TOTAL_TURNS - 1)))
  ctx.fillText(`${yr}년차 ${C.quarterAt(S.turn)} · ${rank.label} · ${S.company.name}`, 12, 19)
  // 시간 칸
  const sx = 330
  for (let i = 0; i < 5; i++) {
    const x = sx + i * 58
    const cur = i === S.day.slot
    const done = i < S.day.slot
    ctx.fillStyle = cur ? '#ffd24a' : done ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.38)'
    ctx.beginPath(); ctx.roundRect(x, 7, 54, 24, 7); ctx.fill()
    ctx.fillStyle = cur ? '#3a2a08' : done ? 'rgba(255,255,255,0.4)' : '#fff'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${SLOT_NAMES[i]} ${SLOT_TIMES[i].slice(0, 2)}시`, x + 27, 19.5)
  }
  ctx.textAlign = 'right'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillStyle = '#ffe066'
  ctx.fillText(`💰 ${fmt(S.money)}`, W - 12, 19)
  // 능력치 패널
  panel(8, 46, 168, 126)
  ctx.textAlign = 'left'
  ctx.font = '11px sans-serif'
  const rows = [...STAT_KEYS.map((k) => [STAT_LABELS[k], S.stats[k], STAT_COLORS[k]]), ['스트레스', S.stress, S.stress >= 85 ? '#ff5050' : S.stress >= 60 ? '#e0a030' : '#9aa3b8']]
  rows.forEach(([label, v, color], i) => {
    const y = 58 + i * 18
    ctx.fillStyle = '#dfe6ff'
    ctx.fillText(label, 16, y)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath(); ctx.roundRect(70, y - 5, 80, 9, 4); ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(70, y - 5, Math.max(4, (80 * v) / 100), 9, 4); ctx.fill()
    ctx.fillStyle = '#b8c4e8'
    ctx.textAlign = 'right'
    ctx.fillText(String(v), 170, y)
    ctx.textAlign = 'left'
  })
  // 오늘의 목표
  if (workHours()) {
    panel(W / 2 - 92, 44, 184, 26)
    ctx.fillStyle = S.day.workSlots >= 2 ? '#9fe8a0' : '#ffe9a8'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`📌 근무 시간 업무 ${S.day.workSlots}/2칸`, W / 2, 61)
  }
  ctx.textBaseline = 'alphabetic'
  // 처음 안내
  if (ui.hint > 0 && S.turn === 0) {
    ui.hint -= 0.0008
    panel(W / 2 - 250, H - 60, 500, 26, 13)
    ctx.fillStyle = '#d8e4ff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('방향키/WASD 이동 · E 또는 Space로 상호작용 · 장소에서 활동을 고르면 시간 한 칸이 흘러요', W / 2, H - 43)
  }
}
function drawPrompt() {
  const it = ui.prompt
  if (!it || ui.menu || dlg.active) return
  const text = it.kind === 'npc' ? `[E] ${it.label}와(과) 대화` : `[E] ${it.label}`
  ctx.font = 'bold 13px sans-serif'
  const w = ctx.measureText(text).width + 24
  const x = clamp(it.x - w / 2, 6, W - w - 6)
  const y = clamp(it.y - 62, 44, H - 40)
  panel(x, y, w, 26, 13, 'rgba(255,248,214,0.95)', '#c9a040')
  ctx.fillStyle = '#4a3410'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + 13.5)
  ctx.textBaseline = 'alphabetic'
}
function drawMenu() {
  ui.hits = []
  const m = ui.menu
  if (!m) return
  const w = 520
  const rowH = 62
  const h = 54 + m.options.length * (rowH + 8) + 28
  const x = W / 2 - w / 2
  const y = H / 2 - h / 2
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(0, 0, W, H)
  panel(x, y, w, h, 16, 'rgba(18,24,44,0.96)', 'rgba(160,190,255,0.5)')
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe066'
  ctx.font = 'bold 17px sans-serif'
  ctx.fillText(m.title, x + 22, y + 34)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#9fb0d8'
  ctx.textAlign = 'right'
  ctx.fillText(`${SLOT_NAMES[S.day.slot]} ${SLOT_TIMES[S.day.slot]}`, x + w - 22, y + 34)
  m.options.forEach((o, i) => {
    const oy = y + 50 + i * (rowH + 8)
    const sel = m.sel === i
    ctx.fillStyle = !o.ok ? 'rgba(255,255,255,0.06)' : sel ? 'rgba(255,210,74,0.3)' : 'rgba(255,255,255,0.12)'
    ctx.beginPath(); ctx.roundRect(x + 16, oy, w - 32, rowH, 10); ctx.fill()
    if (sel && o.ok) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.stroke() }
    ctx.textAlign = 'left'
    ctx.fillStyle = o.ok ? '#fff' : '#7f88a4'
    ctx.font = 'bold 15px sans-serif'
    ctx.fillText(`${i + 1}. ${o.label}`, x + 32, oy + 26)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = o.ok ? '#b8c4e8' : '#ff9a8a'
    ctx.fillText(o.ok ? o.desc : `🔒 ${o.why}`, x + 32, oy + 47)
    ui.hits.push({ x: x + 16, y: oy, w: w - 32, h: rowH, fn: () => { m.sel = i; chooseOption(i) } })
  })
  ctx.textAlign = 'center'
  ctx.fillStyle = '#7f88a4'
  ctx.font = '11px sans-serif'
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
  ctx.font = '15px sans-serif'
  const full = wrapLines(dlg.text, w - 36)
  const shown = wrapLines(dlg.text.slice(0, Math.floor(dlg.shown)), w - 36)
  const h = 36 + full.length * 22
  const y = H - h - 14
  panel(x, y, w, h, 12, 'rgba(14,18,34,0.94)', 'rgba(160,190,255,0.6)')
  if (dlg.speaker) {
    ctx.font = 'bold 13px sans-serif'
    const nw = ctx.measureText(dlg.speaker).width + 24
    panel(x + 16, y - 14, nw, 26, 8, '#26324f', 'rgba(160,190,255,0.7)')
    ctx.fillStyle = '#ffe066'
    ctx.textAlign = 'left'
    ctx.fillText(dlg.speaker, x + 28, y + 4)
  }
  ctx.fillStyle = '#fff'
  ctx.font = '15px sans-serif'
  ctx.textAlign = 'left'
  shown.forEach((l, i) => ctx.fillText(l, x + 18, y + 30 + i * 22))
  if (dlg.shown >= dlg.text.length) {
    const b = Math.sin(elapsed * 6) * 2
    ctx.fillStyle = '#ffe066'
    ctx.beginPath(); ctx.moveTo(x + w - 30, y + h - 20 + b); ctx.lineTo(x + w - 18, y + h - 20 + b); ctx.lineTo(x + w - 24, y + h - 12 + b); ctx.closePath(); ctx.fill()
  }
}

// ================================================================== 루프 ==
let last = performance.now()
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000)
  last = t
  elapsed += dt
  if (S && S.day) {
    updatePlayer(dt)
    updateNpcs(dt)
    updateCars(dt)
  }
  updateFx(dt)
  render()
  requestAnimationFrame(loop)
}

showTitle()
requestAnimationFrame(loop)
// 디버그/테스트용 훅 (게임 로직에는 영향 없음)
window.__job = { get S() { return S }, player, go, MAPS, nearestInteractable, activate, chooseOption, get ui() { return ui }, dlg, advanceDialogue, endDay, sleepNow }
