// 경력 모델: 직급·연봉·인사평가·이직·엔딩. 화면(DOM/캔버스)과 무관한 순수 로직이다.
let state = null
export function bindState(s) {
  state = s
}

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


const STAT_KEYS = ['work', 'stamina', 'network', 'expertise', 'trust']
const STAT_LABELS = { work: '업무력', stamina: '체력', network: '인맥', expertise: '전문성', trust: '신뢰' }
const STAT_COLORS = { work: '#3f6fd1', stamina: '#e0633f', network: '#e06ba6', expertise: '#8f6bd6', trust: '#4fae7a' }

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

export function yearAt(turn) {
  return Math.floor(turn / 4) + 1
}
export function quarterAt(turn) {
  return QUARTER_NAMES[turn % 4]
}

// 이직 협상: 결과 메시지와 성공 여부를 돌려준다 (효과음은 화면 쪽에서)
export function negotiateOffer(i) {
  const o = state.offers[i]
  if (!o || o.negotiated) return null
  o.negotiated = true
  const chance = clamp(0.35 + (state.stats.network + state.stats.expertise) / 400, 0.3, 0.85)
  const roll = Math.random()
  if (roll < chance) {
    const up = round10(o.salary * 1.08)
    const msg = `협상 성공! ${o.name}이(가) 연봉을 ${fmt(o.salary)} → ${fmt(up)}으로 올려 주었다.`
    o.salary = up
    return { msg, kind: 'good' }
  }
  if (roll > 0.88) {
    const msg = `협상이 틀어져 ${o.name}이(가) 제안을 철회했다...`
    state.offers.splice(i, 1)
    return { msg, kind: 'bad' }
  }
  return { msg: `${o.name}은(는) 조건을 더 올려 줄 수 없다고 했다. 기존 조건은 유효하다.`, kind: 'neutral' }
}

export function acceptOfferAt(i) {
  const o = state.offers[i]
  if (!o) return null
  const a = ARCHETYPES[o.arch]
  const prevCompany = state.company.name
  const prevSalary = state.salary
  state.company = makeCompany(o.arch, o.name)
  if (o.rankIdx !== state.rankIdx) state.qAtRank = 0
  state.rankIdx = o.rankIdx
  state.salary = o.salary
  state.tenureQ = 0
  state.transfers += 1
  // 새 회사에서는 신뢰를 처음부터 다시 쌓아야 한다
  state.stats.trust = Math.max(5, Math.round(state.stats.trust * 0.5))
  state.stress = clamp(state.stress - 5)
  state.history.push({ year: yearAt(Math.max(0, state.turn - 1)), company: o.name, rank: RANKS[state.rankIdx].label, salary: o.salary, moved: true })
  state.offers = []
  return `${state.name}은(는) ${prevCompany}을(를) 떠나 ${a.label} ${o.name}에 ${RANKS[state.rankIdx].label}(으)로 입사했다.\n연봉 ${fmt(prevSalary)} → ${fmt(o.salary)} (${o.salary >= prevSalary ? '+' : ''}${Math.round(((o.salary - prevSalary) / prevSalary) * 100)}%)\n새 환경에서는 신뢰를 처음부터 다시 쌓아야 한다. (신뢰 -50%)`
}

export function freshCareerState() {
  return {
    name: '',
    hairHex: HAIR_COLORS[0].hex,
    hairKey: HAIR_COLORS[0].key,
    turn: 0,
    stats: { work: 20, stamina: 20, network: 20, expertise: 20, trust: 20 },
    money: 300, // 만원
    salary: 3200, // 연봉 (만원)
    company: makeCompany('mid', '한결상사'),
    rankIdx: 0,
    qAtRank: 0,
    tenureQ: 0,
    transfers: 0,
    totalEarned: 0,
    offers: [],
    history: [{ year: 1, company: '한결상사', rank: '신입사원', salary: 3200 }],
    lastPay: null,
    review: null,
    stress: 20,
    burnoutTurns: 0,
    sick: false,
    ending: null,
  }
}

export { generateOffers, computeReview, computeEnding, makeCompany, archOf, moodForStress, clamp, rand, pick, fmt, round10, EVENTS, ARCHETYPES, RANKS, HAIR_COLORS, STAT_KEYS, STAT_LABELS, STAT_COLORS, GRADE_TEXT, TOTAL_TURNS, QUARTER_NAMES }
