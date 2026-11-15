import { sfx, unlockSfx, toggleMute } from './sfx.js'

const app = document.getElementById('app')

const TOTAL_TURNS = 32 // 8 years x 4 quarters
const QUARTER_NAMES = ['1분기', '2분기', '3분기', '4분기']

const HAIR_COLORS = [
  { key: 'black', label: '검정', hex: '#2b2320' },
  { key: 'brown', label: '밤색', hex: '#6b4226' },
  { key: 'gray', label: '반백', hex: '#8a8a8a' },
]

// Ranks are earned through the yearly review (not handed out by the calendar).
const RANKS = [
  { key: 'junior', label: '신입사원', living: 600, minYears: 2 },
  { key: 'staff', label: '대리', living: 720, minYears: 2 },
  { key: 'manager', label: '과장', living: 860, minYears: 2 },
  { key: 'director', label: '부장', living: 1000, minYears: 99 },
]
const fmt = (n) => `${Math.round(n).toLocaleString('ko-KR')}만`
const round10 = (n) => Math.round(n / 10) * 10

function moodForStress(stress) {
  if (stress >= 85) return { key: 'sick', label: '탈진 직전' }
  if (stress >= 60) return { key: 'tired', label: '피곤함' }
  if (stress <= 25) return { key: 'bright', label: '활기찬' }
  return { key: 'normal', label: '평온함' }
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// --- Activities -----------------------------------------------------------
const STAT_KEYS = ['work', 'stamina', 'network', 'expertise', 'trust']
const STAT_LABELS = { work: '업무력', stamina: '체력', network: '인맥', expertise: '전문성', trust: '신뢰' }
const STAT_COLORS = { work: '#3f6fd1', stamina: '#e0633f', network: '#e06ba6', expertise: '#8f6bd6', trust: '#4fae7a' }

const ACTIVITIES = [
  {
    key: 'overtime',
    name: '야근하기',
    desc: '밤늦게까지 업무를 처리한다 · 업무력 + / 수당',
    run(s) {
      s.stats.work = clamp(s.stats.work + rand(12, 18))
      s.money += rand(30, 60)
      s.stress = clamp(s.stress + rand(10, 15))
      return `${s.name}은(는) 밤늦게까지 야근하며 업무를 처리했다.`
    },
  },
  {
    key: 'study',
    name: '자기계발',
    desc: '퇴근 후 강의를 듣는다 · 전문성 +',
    run(s) {
      s.stats.expertise = clamp(s.stats.expertise + rand(12, 18))
      s.stress = clamp(s.stress + rand(8, 12))
      return `${s.name}은(는) 퇴근 후 자기계발 강의를 들으며 실력을 쌓았다.`
    },
  },
  {
    key: 'dinner',
    name: '회식 참여',
    desc: '팀 회식에 참석한다 · 인맥 + / 체력 -',
    run(s) {
      s.stats.network = clamp(s.stats.network + rand(12, 18))
      s.stats.stamina = clamp(s.stats.stamina - rand(4, 8))
      s.stress = clamp(s.stress - rand(2, 6))
      return `${s.name}은(는) 팀 회식에서 동료들과 친해졌다.`
    },
  },
  {
    key: 'volunteer',
    name: '봉사·사내동아리',
    desc: '사내 동아리 활동을 한다 · 신뢰 +',
    run(s) {
      s.stats.trust = clamp(s.stats.trust + rand(12, 18))
      s.stress = clamp(s.stress - rand(4, 8))
      return `${s.name}은(는) 사내 동아리 활동과 봉사로 주변의 신뢰를 쌓았다.`
    },
  },
  {
    key: 'sidejob',
    name: '부업·투잡',
    desc: '퇴근 후 부업을 한다 · 돈 + (120~180만)',
    run(s) {
      s.money += rand(120, 180)
      s.stats.stamina = clamp(s.stats.stamina - rand(8, 12))
      s.stress = clamp(s.stress + rand(10, 15))
      return `${s.name}은(는) 퇴근 후 부업으로 짬짬이 돈을 벌었다.`
    },
  },
  {
    key: 'jobhunt',
    name: '이직 준비',
    desc: '이력서를 쓰고 면접을 본다 · 이직 제안 받기 · 전문성 + / 스트레스 +',
    run(s) {
      s.stats.expertise = clamp(s.stats.expertise + rand(2, 5))
      s.stress = clamp(s.stress + rand(6, 10))
      const p = 0.25 + (s.stats.expertise + s.stats.network) / 300
      let n = 0
      for (let i = 0; i < 3; i++) if (Math.random() < p) n++
      s.offers = generateOffers(n)
      return s.offers.length
        ? `${s.name}은(는) 이력서를 돌리고 면접을 봤다. ${s.offers.length}곳에서 제안이 왔다!`
        : `${s.name}은(는) 이력서를 돌리고 면접을 봤지만, 아직 마음에 드는 제안은 오지 않았다.`
    },
  },
  {
    key: 'rest',
    name: '휴식',
    desc: '집에서 푹 쉰다 · 체력 + / 스트레스 - -',
    run(s) {
      s.stress = clamp(s.stress - rand(20, 28))
      s.stats.stamina = clamp(s.stats.stamina + rand(10, 15))
      return `${s.name}은(는) 집에서 푹 쉬며 재충전했다.`
    },
  },
  {
    key: 'travel',
    name: '여행',
    desc: '휴가를 내고 떠난다 · 비용 250만 · 랜덤 대폭 성장',
    cost: 250,
    run(s) {
      s.money -= 250
      const picks = []
      while (picks.length < 2) {
        const k = pick(STAT_KEYS)
        if (!picks.includes(k)) picks.push(k)
      }
      for (const k of picks) s.stats[k] = clamp(s.stats[k] + rand(8, 14))
      s.stress = clamp(s.stress - rand(15, 22))
      return `${s.name}은(는) 휴가를 내고 여행을 떠나 재충전하고 돌아왔다. (${picks.map((k) => STAT_LABELS[k]).join(', ')} 상승)`
    },
  },
]

// --- Random events ----------------------------------------------------------
const EVENTS = [
  { text: '상사에게 업무 성과로 칭찬을 받았다.', run: (s) => { s.stats.trust = clamp(s.stats.trust + 5); s.stress = clamp(s.stress - 4) } },
  { text: '동료와 업무 방식으로 사소한 갈등이 있었다.', run: (s) => { s.stress = clamp(s.stress + 8); s.stats.network = clamp(s.stats.network - 2) } },
  { text: '사내 이벤트 추첨에서 소소한 상금을 받았다.', run: (s) => { s.money += 60 } },
  {
    text: '지하철에서 지갑을 소매치기당했다.',
    condition: (s) => s.money >= 70,
    run: (s) => { s.money = Math.max(0, s.money - 70) },
  },
  { text: '중요한 프로젝트에 발탁되었다.', run: (s) => { s.stats.work = clamp(s.stats.work + 6); s.stress = clamp(s.stress + 5) } },
  { text: '야근 중 실수를 저질러 질책을 받았다.', run: (s) => { s.stress = clamp(s.stress + 10); s.stats.trust = clamp(s.stats.trust - 3) } },
  { text: '자기계발 강의에서 큰 깨달음을 얻었다.', run: (s) => { s.stats.expertise = clamp(s.stats.expertise + 6) } },
  { text: '동료의 추천으로 사내 동아리에 가입했다.', run: (s) => { s.stats.network = clamp(s.stats.network + 4); s.stats.trust = clamp(s.stats.trust + 2) } },
  { text: '과로로 몸이 으슬으슬했다.', run: (s) => { s.stress = clamp(s.stress + 12) } },
  { text: '소액으로 투자해 짭짤한 수익을 얻었다.', run: (s) => { s.money += 50 } },
  { text: '동기와 점심을 먹으며 수다로 힐링했다.', run: (s) => { s.stress = clamp(s.stress - 8); s.stats.network = clamp(s.stats.network + 2) } },
  { text: '건강검진에서 체력 관리에 주의하라는 소견을 들었다.', run: (s) => { s.stats.stamina = clamp(s.stats.stamina - 5); s.stress = clamp(s.stress + 5) } },
  { text: '사내 체육대회에서 활약했다.', run: (s) => { s.stats.stamina = clamp(s.stats.stamina + 5); s.stats.network = clamp(s.stats.network + 4) } },
  { text: '야근 수당을 넉넉히 받았다.', run: (s) => { s.money += 50 } },
  { text: '중요한 문서에 커피를 쏟아 당황했다.', run: (s) => { s.stress = clamp(s.stress + 10) } },
  { text: '멘토에게 값진 조언을 들었다.', run: (s) => { s.stats.expertise = clamp(s.stats.expertise + 4); s.stats.trust = clamp(s.stats.trust + 3) } },
  { text: '오랜만에 칼퇴근을 해서 기분이 좋았다.', run: (s) => { s.stress = clamp(s.stress - 10) } },
  {
    text: '회사 앞에서 사기성 설문조사에 돈을 뜯겼다.',
    condition: (s) => s.money >= 60,
    run: (s) => { s.money = Math.max(0, s.money - 60) },
  },
]

// --- Career: companies, yearly review, job market -------------------------
// Each company type bends the game a little: pay, how much stress piles up,
// how fast you grow, how quickly promotions come and what the review rewards.
const ARCHETYPES = {
  mid: { key: 'mid', label: '중견기업', names: ['한결상사', '성진산업', '다온정밀', '우리화학'], pay: 1.0, stress: 0.9, growth: 1.0, raise: 0, promo: 0, w: { work: 0.35, expertise: 0.25, trust: 0.25, network: 0.15 }, note: '무난하고 균형 잡힌 직장' },
  big: { key: 'big', label: '대기업', names: ['한빛전자', '대한중공업', '미래모빌리티', '동양제과'], pay: 1.08, stress: 1.0, growth: 1.0, raise: 0, promo: 1, w: { work: 0.3, expertise: 0.2, trust: 0.25, network: 0.25 }, note: '연봉이 높지만 승진이 느려요 · 인맥을 중시' },
  startup: { key: 'startup', label: '스타트업', names: ['노바랩스', '피카테크', '버블웍스', '모두의AI'], pay: 0.92, stress: 1.25, growth: 1.15, raise: 2, promo: -1, stock: true, w: { work: 0.45, expertise: 0.2, trust: 0.2, network: 0.15 }, note: '빠른 성장·빠른 승진·스톡옵션(2년 이상 근속) / 스트레스 ↑' },
  foreign: { key: 'foreign', label: '외국계', names: ['Globex 코리아', 'Nordic Systems', 'Aurora Korea'], pay: 1.18, stress: 1.1, growth: 1.05, raise: 1, promo: 0, need: (s) => s.stats.expertise >= 45, w: { work: 0.25, expertise: 0.4, trust: 0.2, network: 0.15 }, note: '최고 수준의 연봉 · 전문성을 평가 · 전문성 45 이상 필요' },
  public: { key: 'public', label: '공공기관', names: ['한국에너지공단', '국가정보진흥원', '지역개발공사'], pay: 0.92, stress: 0.7, growth: 0.95, raise: -1, promo: 1, need: (s) => s.stats.trust >= 45, w: { work: 0.2, expertise: 0.2, trust: 0.4, network: 0.2 }, note: '안정적이고 스트레스가 적어요 · 신뢰 45 이상 필요' },
}
const GRADE_RAISE = { S: 7, A: 4, B: 2, C: 1, D: 0 }
const GRADE_BONUS = { S: 0.8, A: 0.5, B: 0.25, C: 0.1, D: 0 }
const GRADE_TEXT = { S: '탁월', A: '우수', B: '보통', C: '미흡', D: '부진' }

function makeCompany(arch, name) {
  const a = ARCHETYPES[arch]
  return { arch, name: name || pick(a.names) }
}
const archOf = (s) => ARCHETYPES[s.company.arch]

function generateOffers(n) {
  const s = state
  const pool = Object.values(ARCHETYPES).filter((a) => !a.need || a.need(s))
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const offers = []
  for (const a of shuffled) {
    if (offers.length >= n) break
    let name = pick(a.names)
    if (name === s.company.name) name = a.names.find((x) => x !== s.company.name) || name
    const promoted = s.rankIdx < 3 && Math.random() < 0.2
    const rankIdx = promoted ? s.rankIdx + 1 : s.rankIdx
    const mult = Math.min(1.25, a.pay * (0.95 + (s.stats.expertise + s.stats.network) / 1500 + rand(0, 4) / 100) * (promoted ? 1.05 : 1))
    offers.push({ arch: a.key, name, rankIdx, salary: round10(s.salary * mult), negotiated: false })
  }
  return offers
}

function computeReview() {
  const s = state
  const a = archOf(s)
  const w = a.w
  let score = s.stats.work * w.work + s.stats.expertise * w.expertise + s.stats.trust * w.trust + s.stats.network * w.network + rand(-6, 6)
  if (s.stress >= 80) score -= 5
  score = Math.round(score)
  const grade = score >= 70 ? 'S' : score >= 56 ? 'A' : score >= 42 ? 'B' : score >= 30 ? 'C' : 'D'
  const raisePct = Math.max(0, GRADE_RAISE[grade] + a.raise)
  const before = s.salary
  s.salary = round10(s.salary * (1 + raisePct / 100))
  const quarterly = Math.round((s.salary * 0.88) / 4)
  const bonus = Math.round(quarterly * GRADE_BONUS[grade])
  s.money += bonus
  const review = { year: yearAt(s.turn - 1), grade, score, raisePct, before, after: s.salary, bonus, promoted: null }
  // promotion: enough time in the grade + a good review
  const needQ = (RANKS[s.rankIdx].minYears + a.promo) * 4
  if (s.rankIdx < 3 && s.qAtRank >= needQ && (grade === 'S' || grade === 'A' || (grade === 'B' && s.rankIdx === 0))) {
    review.promoted = { from: RANKS[s.rankIdx].label, to: RANKS[s.rankIdx + 1].label }
    s.rankIdx += 1
    s.qAtRank = 0
    s.salary = round10(s.salary * 1.08)
    review.after = s.salary
  }
  s.history.push({ year: review.year, company: s.company.name, rank: RANKS[s.rankIdx].label, salary: s.salary, grade })
  return review
}

function negotiate(i) {
  const o = state.offers[i]
  if (!o || o.negotiated) return
  o.negotiated = true
  const chance = clamp(0.35 + (state.stats.network + state.stats.expertise) / 400, 0.3, 0.85)
  const roll = Math.random()
  if (roll < chance) {
    const up = round10(o.salary * 1.08)
    state.negMsg = `협상 성공! ${o.name}이(가) 연봉을 ${fmt(o.salary)} → ${fmt(up)}으로 올려 주었다.`
    o.salary = up
    sfx.good()
  } else if (roll > 0.88) {
    state.negMsg = `협상이 틀어져 ${o.name}이(가) 제안을 철회했다...`
    state.offers.splice(i, 1)
    sfx.bad()
  } else {
    state.negMsg = `${o.name}은(는) 조건을 더 올려 줄 수 없다고 했다. 기존 조건은 유효하다.`
    sfx.click()
  }
  render()
}

function acceptOffer(i) {
  const o = state.offers[i]
  if (!o) return
  const a = ARCHETYPES[o.arch]
  const prevCompany = state.company.name
  const prevSalary = state.salary
  state.company = makeCompany(o.arch, o.name)
  if (o.rankIdx !== state.rankIdx) state.qAtRank = 0
  state.rankIdx = o.rankIdx
  state.salary = o.salary
  state.tenureQ = 0
  state.transfers += 1
  // starting over in a new place: trust has to be earned again
  state.stats.trust = Math.max(5, Math.round(state.stats.trust * 0.5))
  state.stress = clamp(state.stress - 5)
  state.history.push({ year: yearAt(Math.max(0, state.turn - 1)), company: o.name, rank: RANKS[state.rankIdx].label, salary: o.salary, moved: true })
  state.offers = []
  state.joinMsg = `${state.name}은(는) ${prevCompany}을(를) 떠나 ${a.label} ${o.name}에 ${RANKS[state.rankIdx].label}(으)로 입사했다.\n연봉 ${fmt(prevSalary)} → ${fmt(o.salary)} (${o.salary >= prevSalary ? '+' : ''}${Math.round(((o.salary - prevSalary) / prevSalary) * 100)}%)\n새 환경에서는 신뢰를 처음부터 다시 쌓아야 한다. (신뢰 -50%)`
  state.phase = 'joined'
  sfx.start()
  render()
}

// --- Endings ------------------------------------------------------------
const HIGH = 70
const VERY_HIGH = 85

function computeEnding(s) {
  // 마지막 턴에 쉬어서 모면하지 못하도록, 고스트레스 상태가 여러 턴 이어졌다면 번아웃
  if (s.stress >= 85 || s.burnoutTurns >= 4) {
    return {
      title: '번아웃 퇴사 엔딩',
      text: `${s.name}은(는) 더 이상 버틸 수 없다고 느껴 사직서를 내고 회사를 떠났다.\n오랜만에 연락한 지인에게는 "이제야 숨을 쉴 수 있을 것 같아요"라고 말했다.\n\n조금 더 쉬어가게 했다면 어땠을까, 하는 아쉬움이 오래 남았다.`,
    }
  }
  const { work, stamina, network, expertise, trust } = s.stats
  // startup stock options pay off (or don't) at the end for those who stayed 2+ years
  s.stockNote = ''
  if (archOf(s).stock && s.tenureQ >= 8) {
    if (Math.random() < 0.3) {
      s.money += 6000
      s.stockNote = '\n\n💎 근속한 스타트업이 상장에 성공해 스톡옵션으로 6,000만을 손에 쥐었다!'
    } else s.stockNote = '\n\n스톡옵션은 끝내 휴지조각이 되었지만, 값진 경험이 남았다.'
  }
  const rankIdx = s.rankIdx

  if (s.salary >= 8000) {
    return {
      title: '연봉킹 엔딩',
      text: `꾸준한 성과와 영리한 이직으로 연봉 ${fmt(s.salary)}까지 오른 ${s.name}은(는) 업계에서 손꼽히는 고연봉자가 되었다.${s.stockNote}`,
    }
  }
  if (s.transfers >= 3 && s.salary >= 5800) {
    return {
      title: '프로 이직러 엔딩',
      text: `${s.transfers}번의 이직으로 몸값을 차곡차곡 올린 ${s.name}은(는) 어디서든 러브콜을 받는 프로 이직러가 되었다.${s.stockNote}`,
    }
  }
  if (s.transfers === 0 && rankIdx === 3 && trust >= 60) {
    return {
      title: '한 우물 엔딩',
      text: `한 회사에서 묵묵히 일해 부장까지 오른 ${s.name}은(는) 동료와 후배 모두가 믿고 따르는 회사의 산증인이 되었다.${s.stockNote}`,
    }
  }
  if (work >= HIGH && trust >= HIGH && rankIdx >= 2) {
    return {
      title: '임원 엔딩',
      text: `뛰어난 업무 성과와 두터운 신뢰를 바탕으로, ${s.name}은(는) 마침내 임원으로 승진해 회사의 핵심 의사결정에 참여하게 되었다.${s.stockNote}`,
    }
  }
  if (trust >= HIGH && network >= HIGH) {
    return {
      title: '신뢰받는 리더 엔딩',
      text: `깊은 신뢰와 넓은 인맥을 쌓은 ${s.name}은(는) 팀원들이 가장 따르고 싶어하는 리더로 자리매김했다.`,
    }
  }
  if (s.money >= 10000 && network >= HIGH) {
    return {
      title: '창업가 엔딩',
      text: `차곡차곡 모은 자금과 넓은 인맥을 발판으로, ${s.name}은(는) 회사를 나와 자신만의 사업을 시작했다.`,
    }
  }
  if (stamina >= HIGH && s.stress <= 30) {
    return {
      title: '워라밸 고수 엔딩',
      text: `건강한 체력과 낮은 스트레스를 유지하며, ${s.name}은(는) 일과 삶의 균형을 지킨 워라밸의 달인이 되었다.`,
    }
  }
  if (expertise >= VERY_HIGH) {
    return {
      title: '전문가 엔딩',
      text: `깊고 전문적인 역량을 갈고닦은 ${s.name}은(는) 업계에서 손꼽히는 전문가로 이름을 떨쳤다.`,
    }
  }

  return {
    title: '평범한 직장인 엔딩',
    text: `${s.name}은(는) 특별히 두각을 드러내지는 않았지만, 동료들과 어울려 소박하고 성실한 직장 생활을 이어갔다.\n때때로 지난 8년을 돌아보며, 평범함 속의 보람에 미소 짓곤 했다.`,
  }
}

// --- Portrait drawing (canvas, procedural - no external art assets) -------
// Detailed face painter shared by every portrait stage: layered eyes (white,
// iris, pupil, two highlights, lash line), shaped brows, nose, cheeks and a
// mouth with lips - all driven by the mood so the expression changes with
// stress. Drawn after the hair/head so it always sits on top.
function drawFaceDetail(ctx, cx, headY, headR, moodKey, { eyeHex = '#4a332b', lashes = false, eyeScale = 1, browHex = '#3a2a22', skinHex = '#ffd9b8', lines = 0 } = {}) {
  const eyeY = headY + headR * 0.08
  const eyeDX = headR * 0.38
  const sleepy = moodKey === 'tired' || moodKey === 'sick'
  const R = headR

  // cheeks
  ctx.fillStyle = moodKey === 'sick' ? 'rgba(224,99,63,0.45)' : 'rgba(255,130,130,0.32)'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + sx * R * 0.58, headY + R * 0.36, R * 0.15, R * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const sx of [-1, 1]) {
    const ex = cx + sx * eyeDX
    const rx = R * 0.16 * eyeScale
    const ry = (sleepy ? R * 0.1 : R * 0.17) * eyeScale

    ctx.beginPath()
    ctx.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()
    const ir = R * 0.115 * eyeScale
    const iy = eyeY + (sleepy ? ry * 0.1 : ry * 0.08)
    const grad = ctx.createRadialGradient(ex, iy - ir * 0.3, ir * 0.15, ex, iy, ir)
    grad.addColorStop(0, '#a8805f')
    grad.addColorStop(0.45, eyeHex)
    grad.addColorStop(1, '#1d1210')
    ctx.fillStyle = eyeHex
    ctx.beginPath()
    ctx.arc(ex, iy, ir, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#120a08'
    ctx.beginPath()
    ctx.arc(ex, iy, ir * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex + ir * 0.38, iy - ir * 0.4, ir * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex - ir * 0.35, iy + ir * 0.4, ir * 0.15, 0, Math.PI * 2)
    ctx.fill()
    if (sleepy) {
      // heavy lid drawn over the upper half of the eye
      ctx.fillStyle = skinHex
      ctx.fillRect(ex - rx - 1, eyeY - ry - 1, rx * 2 + 2, ry * 1.05)
    }
    ctx.restore()

    // upper lash line (+ outer flicks)
    ctx.strokeStyle = '#2a1c18'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    if (sleepy) {
      ctx.moveTo(ex - rx, eyeY - ry * 0.1)
      ctx.quadraticCurveTo(ex, eyeY + ry * 0.05, ex + rx, eyeY - ry * 0.1)
    } else {
      ctx.ellipse(ex, eyeY, rx, ry, 0, Math.PI * 1.07, Math.PI * 1.93)
    }
    ctx.stroke()
    if (lashes && !sleepy) {
      ctx.lineWidth = Math.max(1.2, R * 0.035)
      for (const k of [0, 1, 2]) {
        ctx.beginPath()
        ctx.moveTo(ex + sx * rx * 0.9, eyeY - ry * (0.5 - k * 0.3))
        ctx.lineTo(ex + sx * (rx + R * 0.09), eyeY - ry * (0.85 - k * 0.3))
        ctx.stroke()
      }
    }
    if (moodKey === 'tired' || moodKey === 'sick') {
      ctx.strokeStyle = 'rgba(120,80,110,0.45)'
      ctx.lineWidth = Math.max(1.2, R * 0.04)
      ctx.beginPath()
      ctx.arc(ex, eyeY + ry * 0.3, rx * 0.95, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
    }

    // brow
    const by = eyeY - ry - R * (moodKey === 'bright' ? 0.2 : 0.14)
    let tiltIn = 0
    let tiltOut = 0
    if (moodKey === 'sick') { tiltIn = -R * 0.1; tiltOut = R * 0.04 }
    else if (moodKey === 'tired') { tiltIn = R * 0.02; tiltOut = R * 0.05 }
    else if (moodKey === 'bright') { tiltIn = 0; tiltOut = -R * 0.02 }
    ctx.strokeStyle = browHex
    ctx.lineWidth = Math.max(2, R * 0.07)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ex - sx * rx * 1.05, by + tiltIn)
    ctx.quadraticCurveTo(ex + sx * rx * 0.1, by - R * 0.07 + (tiltIn + tiltOut) / 2, ex + sx * rx * 1.15, by + tiltOut)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // nose
  ctx.strokeStyle = 'rgba(150,90,70,0.65)'
  ctx.lineWidth = Math.max(1.4, R * 0.04)
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.02, headY + R * 0.14)
  ctx.quadraticCurveTo(cx - R * 0.09, headY + R * 0.33, cx + R * 0.02, headY + R * 0.34)
  ctx.stroke()

  // mouth
  const my = headY + R * 0.56
  ctx.lineCap = 'round'
  if (moodKey === 'bright') {
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.24, my - R * 0.04)
    ctx.quadraticCurveTo(cx, my + R * 0.3, cx + R * 0.24, my - R * 0.04)
    ctx.quadraticCurveTo(cx, my + R * 0.02, cx - R * 0.24, my - R * 0.04)
    ctx.fillStyle = '#9c3f46'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.2, my - R * 0.03)
    ctx.quadraticCurveTo(cx, my + R * 0.04, cx + R * 0.2, my - R * 0.03)
    ctx.quadraticCurveTo(cx, my + R * 0.1, cx - R * 0.2, my - R * 0.03)
    ctx.fill()
    ctx.strokeStyle = '#7a2f38'
    ctx.lineWidth = Math.max(1.4, R * 0.04)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.24, my - R * 0.04)
    ctx.quadraticCurveTo(cx, my + R * 0.3, cx + R * 0.24, my - R * 0.04)
    ctx.stroke()
  } else if (moodKey === 'sick') {
    ctx.strokeStyle = '#a85a46'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.18, my + R * 0.06)
    ctx.quadraticCurveTo(cx - R * 0.06, my - R * 0.04, cx, my + R * 0.03)
    ctx.quadraticCurveTo(cx + R * 0.06, my + R * 0.1, cx + R * 0.18, my + R * 0.02)
    ctx.stroke()
  } else if (moodKey === 'tired') {
    ctx.strokeStyle = '#a85a46'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.16, my + R * 0.02)
    ctx.quadraticCurveTo(cx, my - R * 0.01, cx + R * 0.16, my + R * 0.03)
    ctx.stroke()
  } else {
    ctx.strokeStyle = '#a85a46'
    ctx.lineWidth = Math.max(1.6, R * 0.05)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.17, my)
    ctx.quadraticCurveTo(cx, my + R * 0.14, cx + R * 0.17, my)
    ctx.stroke()
    ctx.fillStyle = 'rgba(214,110,110,0.55)'
    ctx.beginPath()
    ctx.ellipse(cx, my + R * 0.075, R * 0.07, R * 0.03, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'butt'

  // age lines for senior ranks: nasolabial folds, plus a forehead crease at the top rank
  if (lines) {
    ctx.strokeStyle = 'rgba(150,95,70,0.45)'
    ctx.lineWidth = Math.max(1.2, R * 0.035)
    ctx.lineCap = 'round'
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + sx * R * 0.17, headY + R * 0.32)
      ctx.quadraticCurveTo(cx + sx * R * 0.34, headY + R * 0.4, cx + sx * R * 0.33, headY + R * 0.6)
      ctx.stroke()
    }
    if (lines >= 2) {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.3, headY - R * 0.42)
      ctx.quadraticCurveTo(cx, headY - R * 0.47, cx + R * 0.3, headY - R * 0.42)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }
}

function drawPortrait(canvas, { rankKey, moodKey, hairHex }) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  // Higher ranks get a slightly smaller head (more "grown-up" proportions)
  // and broader shoulders.
  const proportions = {
    junior: { headR: 0.27, headY: 0.33, shoulderW: 0.74 },
    staff: { headR: 0.26, headY: 0.32, shoulderW: 0.78 },
    manager: { headR: 0.25, headY: 0.31, shoulderW: 0.82 },
    director: { headR: 0.245, headY: 0.3, shoulderW: 0.86 },
  }
  const p = proportions[rankKey] || proportions.junior
  const R = H * p.headR
  const headY = H * p.headY
  const SKIN = '#ffd9b8'
  const SKIN_SHADE = '#f0c09c'
  const chinY = headY + R
  const shoulderY = chinY + R * 0.2
  const SW = W * p.shoulderW

  // --- suit jacket with real shoulders ---
  const suitColors = { junior: '#8fa3c9', staff: '#5f7cb0', manager: '#3a4f7a', director: '#23314f' }
  const lapelColors = { junior: '#7b90ba', staff: '#4f6a9c', manager: '#2e4066', director: '#19243c' }
  const suit = suitColors[rankKey] || suitColors.junior
  ctx.fillStyle = suit
  ctx.beginPath()
  ctx.moveTo(cx - SW / 2, H)
  ctx.lineTo(cx - SW / 2, shoulderY + R * 0.42)
  ctx.quadraticCurveTo(cx - SW / 2, shoulderY + R * 0.06, cx - R * 0.42, shoulderY)
  ctx.lineTo(cx + R * 0.42, shoulderY)
  ctx.quadraticCurveTo(cx + SW / 2, shoulderY + R * 0.06, cx + SW / 2, shoulderY + R * 0.42)
  ctx.lineTo(cx + SW / 2, H)
  ctx.closePath()
  ctx.fill()

  // shirt front
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.42, shoulderY)
  ctx.lineTo(cx, shoulderY + R * 0.95)
  ctx.lineTo(cx + R * 0.42, shoulderY)
  ctx.closePath()
  ctx.fill()

  // tie: knot + blade
  ctx.fillStyle = rankKey === 'director' || rankKey === 'manager' ? '#c23b3b' : '#3f6fd1'
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.1, shoulderY + R * 0.08)
  ctx.lineTo(cx + R * 0.1, shoulderY + R * 0.08)
  ctx.lineTo(cx + R * 0.07, shoulderY + R * 0.24)
  ctx.lineTo(cx - R * 0.07, shoulderY + R * 0.24)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.07, shoulderY + R * 0.24)
  ctx.lineTo(cx + R * 0.07, shoulderY + R * 0.24)
  ctx.lineTo(cx + R * 0.13, shoulderY + R * 0.8)
  ctx.lineTo(cx, shoulderY + R * 0.95)
  ctx.lineTo(cx - R * 0.13, shoulderY + R * 0.8)
  ctx.closePath()
  ctx.fill()

  // lapels over the shirt
  ctx.fillStyle = lapelColors[rankKey] || lapelColors.junior
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + sx * R * 0.42, shoulderY)
    ctx.lineTo(cx + sx * R * 0.78, shoulderY + R * 0.2)
    ctx.lineTo(cx + sx * R * 0.5, shoulderY + R * 0.5)
    ctx.lineTo(cx + sx * R * 0.6, shoulderY + R * 0.62)
    ctx.lineTo(cx, shoulderY + R * 0.95)
    ctx.closePath()
    ctx.fill()
  }
  // shirt collar points
  ctx.fillStyle = '#f2f5fb'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + sx * R * 0.42, shoulderY - R * 0.02)
    ctx.lineTo(cx + sx * R * 0.02, shoulderY + R * 0.1)
    ctx.lineTo(cx + sx * R * 0.3, shoulderY + R * 0.34)
    ctx.closePath()
    ctx.fill()
  }

  // Director's lapel pin
  if (rankKey === 'director') {
    ctx.fillStyle = '#d4af37'
    ctx.beginPath()
    ctx.arc(cx - R * 0.62, shoulderY + R * 0.36, R * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- neck (with a soft shadow under the chin) ---
  ctx.fillStyle = SKIN
  ctx.fillRect(cx - R * 0.27, chinY - R * 0.2, R * 0.54, R * 0.44)
  ctx.fillStyle = SKIN_SHADE
  ctx.beginPath()
  ctx.ellipse(cx, chinY + R * 0.02, R * 0.27, R * 0.12, 0, 0, Math.PI)
  ctx.fill()

  // --- ears ---
  for (const sx of [-1, 1]) {
    ctx.fillStyle = SKIN
    ctx.beginPath()
    ctx.ellipse(cx + sx * R * 0.95, headY + R * 0.12, R * 0.13, R * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = SKIN_SHADE
    ctx.beginPath()
    ctx.ellipse(cx + sx * R * 0.97, headY + R * 0.12, R * 0.06, R * 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- face ---
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.ellipse(cx, headY, R * 0.93, R, 0, 0, Math.PI * 2)
  ctx.fill()

  // --- short, side-parted office haircut: covers the top and temples only,
  //     so the forehead, brows, ears and jaw all stay visible ---
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.98, headY + R * 0.02)
  ctx.arc(cx, headY - R * 0.04, R * 1.03, Math.PI * 0.98, Math.PI * 2.02)
  ctx.lineTo(cx + R * 0.84, headY + R * 0.04) // right sideburn
  ctx.lineTo(cx + R * 0.8, headY - R * 0.36)
  ctx.quadraticCurveTo(cx + R * 0.35, headY - R * 0.5, cx - R * 0.3, headY - R * 0.7) // sweep to the part
  ctx.quadraticCurveTo(cx - R * 0.62, headY - R * 0.62, cx - R * 0.8, headY - R * 0.36)
  ctx.lineTo(cx - R * 0.84, headY + R * 0.04) // left sideburn
  ctx.closePath()
  ctx.fill()
  // parting line + shine
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = Math.max(1, R * 0.03)
  ctx.beginPath()
  ctx.moveTo(cx - R * 0.3, headY - R * 0.7)
  ctx.quadraticCurveTo(cx - R * 0.36, headY - R * 0.9, cx - R * 0.26, headY - R * 1.05)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = Math.max(1.5, R * 0.05)
  ctx.beginPath()
  ctx.arc(cx, headY - R * 0.04, R * 0.82, Math.PI * 1.55, Math.PI * 1.8)
  ctx.stroke()

  drawFaceDetail(ctx, cx, headY, R, moodKey, { eyeHex: '#3a2a22', browHex: hairHex, lines: rankKey === 'director' ? 2 : rankKey === 'manager' ? 1 : 0 })

  // Glasses for manager/director ranks, drawn over the eyes
  if (rankKey === 'manager' || rankKey === 'director') {
    const eyeY = headY + R * 0.08
    const eyeDX = R * 0.38
    ctx.strokeStyle = '#2c2c34'
    ctx.lineWidth = Math.max(1.6, R * 0.045)
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.roundRect(cx + sx * eyeDX - R * 0.26, eyeY - R * 0.2, R * 0.52, R * 0.4, R * 0.1)
      ctx.fillStyle = 'rgba(200,225,255,0.14)'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + sx * (eyeDX + R * 0.26), eyeY - R * 0.06)
      ctx.lineTo(cx + sx * R * 0.93, eyeY - R * 0.02)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(cx - eyeDX + R * 0.26, eyeY - R * 0.04)
    ctx.quadraticCurveTo(cx, eyeY - R * 0.1, cx + eyeDX - R * 0.26, eyeY - R * 0.04)
    ctx.stroke()
  }

  // Sweat drop if sick
  if (moodKey === 'sick') {
    ctx.fillStyle = '#7fc4e8'
    ctx.beginPath()
    ctx.moveTo(cx + R * 0.78, headY - R * 0.38)
    ctx.quadraticCurveTo(cx + R * 0.9, headY - R * 0.12, cx + R * 0.78, headY - R * 0.02)
    ctx.quadraticCurveTo(cx + R * 0.66, headY - R * 0.12, cx + R * 0.78, headY - R * 0.38)
    ctx.fill()
  }
}

// --- State ----------------------------------------------------------------
function freshState() {
  return {
    phase: 'title',
    name: '',
    hairHex: HAIR_COLORS[0].hex,
    hairKey: HAIR_COLORS[0].key,
    turn: 0,
    stats: { work: 20, stamina: 20, network: 20, expertise: 20, trust: 20 },
    money: 300, // 만원
    salary: 3200, // 연봉 (만원)
    company: makeCompany('mid', '한결상사'),
    rankIdx: 0,
    qAtRank: 0, // 현재 직급에서 보낸 분기 수
    tenureQ: 0, // 현재 회사 근속 분기 수
    transfers: 0,
    totalEarned: 0,
    offers: [],
    history: [{ year: 1, company: '한결상사', rank: '신입사원', salary: 3200 }],
    lastPay: null,
    review: null,
    stress: 20,
    burnoutTurns: 0, // 스트레스 85 이상으로 끝난 턴 수
    sick: false,
    lastResult: '',
    ending: null,
  }
}
let state = freshState()

function yearAt(turn) {
  return Math.floor(turn / 4) + 1
}
function quarterAt(turn) {
  return QUARTER_NAMES[turn % 4]
}

function resolveTurn(activity) {
  const lines = []
  const before = { stats: { ...state.stats }, stress: state.stress }
  if (state.sick) {
    state.stress = clamp(state.stress - rand(20, 28))
    lines.push(`${state.name}은(는) 번아웃 조짐으로 이번 분기는 병가를 내고 쉬었다.`)
    state.sick = false
  } else {
    lines.push(activity.run(state))
    if (Math.random() < 0.55) {
      const candidates = EVENTS.filter((e) => !e.condition || e.condition(state))
      const ev = pick(candidates)
      ev.run(state)
      lines.push(ev.text)
    }
  }
  // the company's culture bends what you just gained (growth) and what it cost (stress)
  const co = archOf(state)
  for (const k of ['work', 'expertise']) {
    const d = state.stats[k] - before.stats[k]
    if (d > 0) state.stats[k] = clamp(before.stats[k] + Math.round(d * co.growth))
  }
  const sd = state.stress - before.stress
  if (sd > 0) state.stress = clamp(before.stress + Math.round(sd * co.stress))
  // headhunters call people with a good profile
  if (!state.sick && !state.offers.length && Math.random() < (state.stats.expertise + state.stats.network) / 650) {
    state.offers = generateOffers(1)
    if (state.offers.length) lines.push(`헤드헌터에게서 이직 제안이 왔다! (${state.offers[0].name})`)
  }
  if (!state.sick && state.stress >= 92 && Math.random() < 0.35) {
    state.sick = true
    lines.push(`${state.name}은(는) 무리를 한 탓인지 몸이 으슬으슬하다... (다음 분기는 병가를 낸다)`)
  }
  if (state.stress >= 85) state.burnoutTurns += 1
  // payday: take-home pay minus the cost of living
  const income = Math.round((state.salary * 0.88) / 4)
  // lifestyle grows with income, so a bigger paycheck is not all pure savings
  const living = Math.round(income * 0.55 + RANKS[state.rankIdx].living * 0.45)
  state.money = Math.max(0, state.money + income - living)
  state.totalEarned += income
  state.lastPay = { income, living }
  state.tenureQ += 1
  state.qAtRank += 1
  state.lastResult = lines.join(' ')
  setTimeout(() => (state.sick ? sfx.bad() : sfx.pickup()), 90)
  state.turn += 1
  state.phase = 'result'
}

function continueFromResult() {
  // the fourth quarter closes the year: performance review, raise, promotion
  if (state.turn % 4 === 0 && state.turn > 0 && !state.sickBurnout) {
    state.review = computeReview()
    state.phase = 'review'
    const g = state.review.grade
    setTimeout(() => (state.review.promoted ? sfx.fanfare() : g === 'S' || g === 'A' ? sfx.good() : g === 'D' ? sfx.bad() : sfx.pickup()), 120)
    render()
    return
  }
  proceedAfterTurn()
}

function proceedAfterTurn() {
  if (state.turn >= TOTAL_TURNS) {
    state.offers = []
    state.ending = computeEnding(state)
    state.phase = 'ending'
    setTimeout(() => (state.ending.title.includes('번아웃') ? sfx.lose() : sfx.fanfare()), 120)
  } else if (state.offers.length) {
    state.phase = 'offers'
    state.negMsg = ''
    sfx.alarm()
  } else {
    state.phase = 'choose'
  }
  render()
}

// --- Render -----------------------------------------------------------------
function render() {
  if (state.phase === 'title') return renderTitle()
  if (state.phase === 'choose') return renderChoose()
  if (state.phase === 'result') return renderResult()
  if (state.phase === 'review') return renderReview()
  if (state.phase === 'offers') return renderOffers()
  if (state.phase === 'joined') return renderJoined()
  if (state.phase === 'ending') return renderEnding()
}

function renderTitle() {
  app.innerHTML = `
    <div class="title-wrap">
      <h1>직장 시뮬레이터</h1>
      <div class="subtitle">신입사원부터 임원까지, 8년간의 회사 생활을 살아보세요</div>
      <div class="field-row">
        <label>이름</label>
        <input id="name-input" type="text" maxlength="8" placeholder="예: 민준" value="민준" />
      </div>
      <div class="field-row">
        <label>머리색</label>
        <div class="swatch-row">
          ${HAIR_COLORS.map(
            (h) => `<div class="swatch ${h.key === state.hairKey ? 'selected' : ''}" data-hair="${h.key}" style="background:${h.hex}" title="${h.label}"></div>`,
          ).join('')}
        </div>
      </div>
      <button class="primary-btn" id="start-btn">입사하기</button>
      <div class="hint">매 분기마다 활동을 선택해 능력치를 키우세요. 4분기마다 인사평가로 연봉·승진이 정해지고, 이직 제안으로 회사를 옮길 수도 있어요. 무리하면 번아웃이 올 수 있어요. 8년이 지나면 그동안의 성장에 따라 엔딩이 결정됩니다.</div>
    </div>
  `
  const nameInput = document.getElementById('name-input')
  document.querySelectorAll('.swatch').forEach((el) => {
    el.onclick = () => {
      const h = HAIR_COLORS.find((x) => x.key === el.dataset.hair)
      state.hairKey = h.key
      state.hairHex = h.hex
      render()
    }
  })
  document.getElementById('start-btn').onclick = () => {
    state.name = nameInput.value.trim() || '민준'
    state.phase = 'choose'
    render()
  }
}

function statBar(key, val) {
  return `
    <div class="stat-row">
      <div class="stat-label">${STAT_LABELS[key]}</div>
      <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${val}%; background:${STAT_COLORS[key]}"></div></div>
      <div class="stat-val">${val}</div>
    </div>
  `
}

function renderTopAndPortrait(extraBodyHtml) {
  const rank = RANKS[state.rankIdx]
  const mood = moodForStress(state.stress)
  const arch = archOf(state)
  app.innerHTML = `
    <div class="game-wrap">
      <div class="topbar">
        <span>${Math.min(8, yearAt(state.turn))}년차 · ${quarterAt(state.turn)}</span>
        <span class="salary">연봉 ${fmt(state.salary)}</span>
        <span class="money">💰 ${fmt(state.money)}</span>
      </div>
      <div class="body-row">
        <div class="portrait-col">
          <canvas id="portrait-canvas" width="200" height="240"></canvas>
          <div class="worker-name">${state.name}</div>
          <div class="worker-rank">${rank.label}</div>
          <div class="worker-company">${state.company.name}<small>${arch.label}</small></div>
          <div class="mood-tag">${mood.label}</div>
        </div>
        <div class="stats-col">
          ${STAT_KEYS.map((k) => statBar(k, state.stats[k])).join('')}
          <div class="stat-row">
            <div class="stat-label">스트레스</div>
            <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${state.stress}%; background:#999"></div></div>
            <div class="stat-val">${state.stress}</div>
          </div>
          ${extraBodyHtml}
        </div>
      </div>
    </div>
  `
  const canvas = document.getElementById('portrait-canvas')
  if (canvas) drawPortrait(canvas, { rankKey: rank.key, moodKey: mood.key, hairHex: state.hairHex })
}

function renderChoose() {
  const forcedSick = state.sick
  const body = forcedSick
    ? `<div class="log-box">${state.name}은(는) 번아웃 조짐이 있어 이번 분기는 쉬어야 할 것 같다.</div>
       <button class="continue-btn" id="go-btn">분기 보내기</button>`
    : `<div class="activity-grid">
        ${ACTIVITIES.map((a) => {
          const disabled = a.cost && state.money < a.cost
          return `<button class="activity-btn" data-act="${a.key}" ${disabled ? 'disabled' : ''}>
            <span class="act-name">${a.name}</span>
            <span class="act-desc">${a.desc}</span>
          </button>`
        }).join('')}
      </div>`
  renderTopAndPortrait(body)
  if (forcedSick) {
    document.getElementById('go-btn').onclick = () => {
      resolveTurn(null)
      render()
    }
  } else {
    document.querySelectorAll('.activity-btn').forEach((btn) => {
      btn.onclick = () => {
        const a = ACTIVITIES.find((x) => x.key === btn.dataset.act)
        resolveTurn(a)
        render()
      }
    })
  }
}

function renderResult() {
  const pay = state.lastPay
  const payLine = pay
    ? `<div class="pay-line"><span>급여(세후) +${fmt(pay.income)}</span><span>생활비 −${fmt(pay.living)}</span><b>${pay.income - pay.living >= 0 ? '+' : ''}${fmt(pay.income - pay.living)}</b></div>`
    : ''
  const body = `<div class="log-box">${state.lastResult}</div>
    ${payLine}
    <button class="continue-btn" id="continue-btn">계속</button>`
  renderTopAndPortrait(body)
  document.getElementById('continue-btn').onclick = continueFromResult
}

function renderReview() {
  const r = state.review
  const a = archOf(state)
  const wtxt = `업무 ${Math.round(a.w.work * 100)}% · 전문성 ${Math.round(a.w.expertise * 100)}% · 신뢰 ${Math.round(a.w.trust * 100)}% · 인맥 ${Math.round(a.w.network * 100)}%`
  const body = `
    <div class="review-card">
      <div class="review-head">
        <div class="grade grade-${r.grade}">${r.grade}</div>
        <div>
          <div class="review-title">${r.year}년차 인사평가 · ${GRADE_TEXT[r.grade]}</div>
          <div class="review-sub">평가 점수 ${r.score}점 · ${a.label} 기준 (${wtxt})</div>
        </div>
      </div>
      <div class="review-row"><span>연봉</span><b>${fmt(r.before)} → ${fmt(r.after)} <em>${r.raisePct > 0 ? `+${r.raisePct}%` : '동결'}</em></b></div>
      <div class="review-row"><span>성과급</span><b>${r.bonus > 0 ? `+${fmt(r.bonus)}` : '없음'}</b></div>
      ${r.promoted ? `<div class="promo">🎉 승진! ${r.promoted.from} → ${r.promoted.to} (연봉 +8%)</div>` : ''}
      ${!r.promoted && state.rankIdx < 3 ? `<div class="review-note">다음 승진까지: 현재 직급 ${Math.floor(state.qAtRank / 4)}년 근무 · 평가 A 이상 필요</div>` : ''}
    </div>
    <button class="continue-btn" id="review-ok">확인</button>`
  renderTopAndPortrait(body)
  document.getElementById('review-ok').onclick = proceedAfterTurn
}

function renderOffers() {
  const cur = state.salary
  const cards = state.offers
    .map((o, i) => {
      const a = ARCHETYPES[o.arch]
      const diff = Math.round(((o.salary - cur) / cur) * 100)
      return `<div class="offer-card">
        <div class="offer-head"><b>${o.name}</b><span class="tag">${a.label}</span>${o.rankIdx > state.rankIdx ? '<span class="tag up-tag">직급 상승</span>' : ''}</div>
        <div class="offer-line">${RANKS[o.rankIdx].label} · 연봉 <b>${fmt(o.salary)}</b> <em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}%</em></div>
        <div class="offer-note">${a.note}</div>
        <div class="offer-actions">
          <button class="mini-btn" data-neg="${i}" ${o.negotiated ? 'disabled' : ''}>${o.negotiated ? '협상 완료' : '연봉 협상'}</button>
          <button class="mini-btn go" data-accept="${i}">이직하기</button>
        </div>
      </div>`
    })
    .join('')
  const body = `
    <div class="log-box">이직 제안이 도착했다. 지금 회사: <b>${state.company.name}</b> (${archOf(state).label}) · 연봉 ${fmt(cur)}${state.negMsg ? `\n${state.negMsg}` : ''}</div>
    <div class="offer-list">${cards || '<div class="muted">제안이 모두 사라졌다.</div>'}</div>
    <div class="offer-tip">이직하면 근속이 초기화되고 신뢰가 절반으로 줄어요. 회사 성격에 따라 스트레스·성장·승진 속도가 달라집니다.</div>
    <button class="continue-btn" id="decline-btn">${state.offers.length ? '모두 거절하고 남는다' : '돌아가기'}</button>`
  renderTopAndPortrait(body)
  document.querySelectorAll('[data-neg]').forEach((b) => (b.onclick = () => negotiate(Number(b.dataset.neg))))
  document.querySelectorAll('[data-accept]').forEach((b) => (b.onclick = () => acceptOffer(Number(b.dataset.accept))))
  document.getElementById('decline-btn').onclick = () => {
    state.offers = []
    state.phase = 'choose'
    render()
  }
}

function renderJoined() {
  const body = `<div class="log-box">${state.joinMsg}</div>
    <button class="continue-btn" id="joined-ok">출근하기</button>`
  renderTopAndPortrait(body)
  document.getElementById('joined-ok').onclick = () => {
    state.phase = state.turn >= TOTAL_TURNS ? 'choose' : 'choose'
    render()
  }
}

function renderEnding() {
  const rank = RANKS[state.rankIdx]
  const career = state.history
    .map((h) => `<li>${h.moved ? '↪ ' : ''}${h.year}년차 · ${h.company} · ${h.rank} · ${fmt(h.salary)}${h.grade ? ` (평가 ${h.grade})` : ''}</li>`)
    .join('')
  app.innerHTML = `
    <div class="ending-wrap">
      <canvas id="ending-canvas" width="220" height="264"></canvas>
      <h2 class="ending-title">${state.ending.title}</h2>
      <div class="ending-text">${state.ending.text}</div>
      <div class="ending-stats">업무력 ${state.stats.work} · 체력 ${state.stats.stamina} · 인맥 ${state.stats.network} · 전문성 ${state.stats.expertise} · 신뢰 ${state.stats.trust}<br>최종 연봉 ${fmt(state.salary)} · 이직 ${state.transfers}회 · 누적 수입 ${fmt(state.totalEarned)} · 자산 ${fmt(state.money)}</div>
      <details class="career"><summary>커리어 기록 보기</summary><ul>${career}</ul></details>
      <button class="restart-btn" id="restart-btn">다시 시작하기</button>
    </div>
  `
  drawPortrait(document.getElementById('ending-canvas'), { rankKey: rank.key, moodKey: 'bright', hairHex: state.hairHex })
  document.getElementById('restart-btn').onclick = () => {
    state = freshState()
    render()
  }
}

render()

// 버튼 클릭음 + 소리 켜기/끄기 버튼 (화면이 통째로 다시 그려지므로 문서 단위로 한 번만 등록)
document.addEventListener('pointerdown', unlockSfx)
document.addEventListener('keydown', unlockSfx)
document.addEventListener('click', (e) => {
  const muteBtn = e.target.closest('#mute-btn')
  if (muteBtn) {
    muteBtn.textContent = toggleMute() ? '소리 끔' : '소리 켬'
    return
  }
  if (e.target.closest('button')) sfx.click()
})
