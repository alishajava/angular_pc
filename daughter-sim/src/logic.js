// 딸 키우기 규칙: 활동·이벤트·엔딩·상태. 화면(탑뷰)과 무관한 순수 로직.
export const TOTAL_TURNS = 32 // 8 years x 4 seasons
export const SEASON_NAMES = ['봄', '여름', '가을', '겨울']
export const START_AGE = 10

export const HAIR_COLORS = [
  { key: 'brown', label: '밤색', hex: '#6b4226' },
  { key: 'black', label: '검정', hex: '#2b2320' },
  { key: 'red', label: '적갈색', hex: '#9c3b2e' },
]

export function stageForAge(age) {
  if (age <= 12) return { key: 'child', label: '유년기' }
  if (age <= 15) return { key: 'teen', label: '소녀기' }
  return { key: 'lady', label: '숙녀기' }
}

export function moodForStress(stress) {
  if (stress >= 85) return { key: 'sick', label: '기진맥진' }
  if (stress >= 60) return { key: 'tired', label: '피곤함' }
  if (stress <= 25) return { key: 'bright', label: '쾌활함' }
  return { key: 'normal', label: '평온함' }
}

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// --- Activities -----------------------------------------------------------
export const STAT_KEYS = ['int', 'str', 'charm', 'art', 'faith']
export const STAT_LABELS = { int: '지력', str: '체력', charm: '매력', art: '예술', faith: '신앙' }
export const STAT_COLORS = { int: '#5b8ac6', str: '#e0633f', charm: '#e06ba6', art: '#8f6bd6', faith: '#4fae7a' }

export const ACTIVITIES = [
  {
    key: 'study',
    name: '공부하기',
    desc: '서당에서 글공부를 한다 · 지력 +',
    run(s) {
      s.stats.int = clamp(s.stats.int + rand(12, 18))
      s.stress = clamp(s.stress + rand(8, 12))
      return `${s.name}은(는) 서당에서 열심히 글공부를 했다.`
    },
  },
  {
    key: 'train',
    name: '무예 수련',
    desc: '몸을 단련한다 · 체력 +',
    run(s) {
      s.stats.str = clamp(s.stats.str + rand(12, 18))
      s.stress = clamp(s.stress + rand(8, 12))
      return `${s.name}은(는) 땀을 흘리며 무예를 수련했다.`
    },
  },
  {
    key: 'art',
    name: '예술 수업',
    desc: '그림과 음악을 배운다 · 예술 +',
    run(s) {
      s.stats.art = clamp(s.stats.art + rand(12, 18))
      s.stats.charm = clamp(s.stats.charm + rand(2, 5))
      s.stress = clamp(s.stress + rand(6, 10))
      return `${s.name}은(는) 화실에서 그림과 음악을 배웠다.`
    },
  },
  {
    key: 'pray',
    name: '기도와 봉사',
    desc: '사찰에서 마음을 다스린다 · 신앙 +',
    run(s) {
      s.stats.faith = clamp(s.stats.faith + rand(12, 18))
      s.stats.charm = clamp(s.stats.charm + rand(1, 4))
      s.stress = clamp(s.stress - rand(2, 6))
      return `${s.name}은(는) 사찰에서 봉사하며 마음을 다스렸다.`
    },
  },
  {
    key: 'work',
    name: '아르바이트',
    desc: '시장에서 일을 돕는다 · 돈 +',
    run(s) {
      s.money += rand(18, 28)
      s.stats.str = clamp(s.stats.str + rand(1, 3))
      s.stress = clamp(s.stress + rand(8, 12))
      return `${s.name}은(는) 시장에서 일을 돕고 용돈을 벌었다.`
    },
  },
  {
    key: 'rest',
    name: '휴식',
    desc: '집에서 푹 쉰다 · 피로 - -',
    run(s) {
      s.stress = clamp(s.stress - rand(20, 28))
      s.stats.charm = clamp(s.stats.charm + rand(1, 3))
      return `${s.name}은(는) 집에서 푹 쉬며 재충전했다.`
    },
  },
  {
    key: 'travel',
    name: '여행',
    desc: '먼 마을로 떠난다 · 비용 40 · 랜덤 대폭 성장',
    cost: 40,
    run(s) {
      s.money -= 40
      const picks = []
      while (picks.length < 2) {
        const k = pick(STAT_KEYS)
        if (!picks.includes(k)) picks.push(k)
      }
      for (const k of picks) s.stats[k] = clamp(s.stats[k] + rand(8, 14))
      s.stress = clamp(s.stress - rand(6, 12))
      return `${s.name}은(는) 먼 마을로 여행을 떠나 많은 것을 보고 배웠다. (${picks.map((k) => STAT_LABELS[k]).join(', ')} 상승)`
    },
  },
]

// --- Random events ----------------------------------------------------------
export const EVENTS = [
  { text: '거리 공연을 보고 감탄했다.', run: (s) => { s.stats.art = clamp(s.stats.art + 5) } },
  { text: '친구와 사소한 일로 다투었다.', run: (s) => { s.stress = clamp(s.stress + 8); s.stats.charm = clamp(s.stats.charm - 2) } },
  { text: '길에서 용돈을 주웠다.', run: (s) => { s.money += 12 } },
  {
    text: '소매치기를 당했다.',
    condition: (s) => s.money >= 10,
    run: (s) => { s.money = Math.max(0, s.money - 12) },
  },
  { text: '선생님께 칭찬을 들었다.', run: (s) => { s.stats.int = clamp(s.stats.int + 5); s.stress = clamp(s.stress - 4) } },
  { text: '오래된 책을 발견해 밤새 읽었다.', run: (s) => { s.stats.int = clamp(s.stats.int + 6); s.stress = clamp(s.stress + 5) } },
  { text: '동네 축제에 놀러 갔다.', run: (s) => { s.stats.charm = clamp(s.stats.charm + 5); s.stress = clamp(s.stress - 8) } },
  { text: '강아지 한 마리를 주워와 돌보기 시작했다.', run: (s) => { s.stats.faith = clamp(s.stats.faith + 4); s.stats.charm = clamp(s.stats.charm + 4); s.stress = clamp(s.stress - 6) } },
  { text: '무대에서 노래를 불러 박수를 받았다.', run: (s) => { s.stats.art = clamp(s.stats.art + 6); s.stats.charm = clamp(s.stats.charm + 6) } },
  { text: '동네 대회에서 우승했다.', run: (s) => { s.stats.str = clamp(s.stats.str + 6); s.money += 10 } },
  { text: '명상을 통해 마음의 평화를 얻었다.', run: (s) => { s.stats.faith = clamp(s.stats.faith + 5); s.stress = clamp(s.stress - 10) } },
  { text: '오랜만에 늦잠을 잤다.', run: (s) => { s.stress = clamp(s.stress - 10) } },
  {
    text: '시장에서 바가지를 썼다.',
    condition: (s) => s.money >= 10,
    run: (s) => { s.money = Math.max(0, s.money - 10) },
  },
  { text: '몸살이 나서 하루 종일 앓았다.', run: (s) => { s.stress = clamp(s.stress + 14) } },
  { text: '이웃 어른께 좋은 말씀을 들었다.', run: (s) => { s.stats.faith = clamp(s.stats.faith + 4); s.stats.int = clamp(s.stats.int + 3) } },
  { text: '새 옷을 지어 입고 한껏 멋을 냈다.', run: (s) => { s.stats.charm = clamp(s.stats.charm + 5); s.money = Math.max(0, s.money - 8) } },
]

// --- Endings ------------------------------------------------------------
export const HIGH = 70
export const VERY_HIGH = 85

export function computeEnding(s) {
  // 마지막 턴에 쉬어서 모면하지 못하도록, 고스트레스 상태가 여러 턴 이어졌다면 번아웃
  if (s.stress >= 85 || s.burnoutTurns >= 4) {
    return {
      title: '번아웃 엔딩',
      text: `${s.name}은(는) 너무 지친 나머지 짐을 싸서 홀로 먼 곳으로 떠나버렸다.\n가끔 보내오는 편지에는 "이제야 제대로 쉴 수 있을 것 같아요"라고 적혀 있었다.\n\n조금 더 쉬게 해줄걸, 하는 아쉬움이 오래도록 남았다.`,
    }
  }
  const { int, str, charm, art, faith } = s.stats
  const comboEndings = [
    { test: int >= HIGH && charm >= HIGH, title: '외교관 엔딩', text: `뛰어난 지혜와 사람을 끄는 매력을 겸비한 ${s.name}은(는) 왕실의 외교관으로 발탁되어 여러 나라를 넘나들며 이름을 떨쳤다.` },
    { test: str >= HIGH && art >= HIGH, title: '무용가 엔딩', text: `단련된 몸과 예술적 감각이 어우러져, ${s.name}은(는) 전국을 순회하는 유명 무용단의 간판 무용수가 되었다.` },
    { test: int >= HIGH && faith >= HIGH, title: '대학자 엔딩', text: `깊은 학식과 흔들림 없는 신념을 갖춘 ${s.name}은(는) 대학당의 수장이 되어 수많은 제자를 길러냈다.` },
    { test: charm >= HIGH && art >= HIGH, title: '인기 예인 엔딩', text: `빼어난 매력과 예술적 재능으로, ${s.name}은(는) 온 나라가 아는 인기 예인이 되어 가는 곳마다 환호를 받았다.` },
    { test: str >= HIGH && faith >= HIGH, title: '기사단장 엔딩', text: `강인한 체력과 깊은 신앙심으로, ${s.name}은(는) 왕실 기사단을 이끄는 기사단장의 자리에 올랐다.` },
    { test: s.money >= 300 && charm >= HIGH, title: '대상인 엔딩', text: `타고난 수완과 사람을 끄는 매력으로, ${s.name}은(는) 온 나라에 지점을 둔 대상단의 주인이 되었다.` },
  ]
  const combo = comboEndings.find((e) => e.test)
  if (combo) return combo

  const soloEndings = [
    { stat: int, title: '천재 학자 엔딩', text: `${s.name}은(는) 또래를 뛰어넘는 학식으로 명성을 떨치며, 젊은 나이에 왕실 학자로 임명되었다.` },
    { stat: str, title: '여기사 엔딩', text: `${s.name}은(는) 누구보다 강인한 몸과 용기로, 왕국을 지키는 여기사가 되어 전설처럼 회자되었다.` },
    { stat: charm, title: '사교계의 꽃 엔딩', text: `${s.name}은(는) 타고난 매력으로 사교계를 사로잡았고, 귀족들의 초대가 끊이지 않는 인기인이 되었다.` },
    { stat: art, title: '예술가 엔딩', text: `${s.name}은(는) 뛰어난 예술적 재능을 인정받아, 작품이 왕실 미술관에 걸리는 명장이 되었다.` },
    { stat: faith, title: '대사제 엔딩', text: `${s.name}은(는) 깊은 신앙심으로 많은 이들의 존경을 받으며, 젊은 나이에 대사원을 이끄는 대사제가 되었다.` },
  ]
  const best = soloEndings
    .filter((e) => e.stat >= VERY_HIGH)
    .sort((a, b) => b.stat - a.stat)[0]
  if (best) return best

  if (s.money >= 400) {
    return { title: '거상 엔딩', text: `${s.name}은(는) 차곡차곡 모은 재산으로 큰 상단을 꾸려, 온 나라에 이름난 거상이 되었다.` }
  }

  return {
    title: '평범하지만 행복한 삶 엔딩',
    text: `${s.name}은(는) 특별히 뛰어난 재주는 없었지만, 마을 사람들과 어울려 소박하고 다정한 나날을 보냈다.\n때때로 지난 8년을 돌아보며, 평범함 속의 행복에 미소 짓곤 했다.`,
  }
}

// --- State ----------------------------------------------------------------
export function freshState() {
  return {
    name: '',
    hairHex: HAIR_COLORS[0].hex,
    hairKey: HAIR_COLORS[0].key,
    turn: 0,
    stats: { int: 20, str: 20, charm: 20, art: 20, faith: 20 },
    money: 30,
    stress: 20,
    burnoutTurns: 0, // 스트레스 85 이상으로 끝난 턴 수
    sick: false,
  }
}

export function ageAt(turn) {
  return START_AGE + Math.floor(turn / 4)
}
export function seasonAt(turn) {
  return SEASON_NAMES[turn % 4]
}

// 한 계절을 보낸다. activity가 null이면 몸살로 앓아눕는 턴. 결과 문장을 돌려준다.
export function resolveTurn(state, activity) {
  const lines = []
  if (state.sick) {
    state.stress = clamp(state.stress - rand(20, 28))
    lines.push(`${state.name}은(는) 몸살로 하루 종일 앓아누웠다.`)
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
  if (!state.sick && state.stress >= 92 && Math.random() < 0.35) {
    state.sick = true
    lines.push(`${state.name}은(는) 무리를 한 탓인지 몸이 으슬으슬하다... (다음 계절은 앓아눕는다)`)
  }
  if (state.stress >= 85) state.burnoutTurns += 1
  state.turn += 1
  return lines.join(' ')
}
