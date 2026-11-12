const app = document.getElementById('app')

const TOTAL_TURNS = 32 // 8 years x 4 quarters
const QUARTER_NAMES = ['1분기', '2분기', '3분기', '4분기']

const HAIR_COLORS = [
  { key: 'black', label: '검정', hex: '#2b2320' },
  { key: 'brown', label: '밤색', hex: '#6b4226' },
  { key: 'gray', label: '반백', hex: '#8a8a8a' },
]

function rankForTurn(turn) {
  if (turn < 8) return { key: 'junior', label: '신입사원' }
  if (turn < 16) return { key: 'staff', label: '대리' }
  if (turn < 24) return { key: 'manager', label: '과장' }
  return { key: 'director', label: '부장' }
}

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
      s.money += rand(5, 10)
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
    desc: '퇴근 후 부업을 한다 · 돈 +',
    run(s) {
      s.money += rand(25, 35)
      s.stats.stamina = clamp(s.stats.stamina - rand(8, 12))
      s.stress = clamp(s.stress + rand(10, 15))
      return `${s.name}은(는) 퇴근 후 부업으로 짬짬이 돈을 벌었다.`
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
    desc: '휴가를 내고 떠난다 · 비용 50 · 랜덤 대폭 성장',
    cost: 50,
    run(s) {
      s.money -= 50
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
  { text: '사내 이벤트 추첨에서 소소한 상금을 받았다.', run: (s) => { s.money += 15 } },
  {
    text: '지하철에서 지갑을 소매치기당했다.',
    condition: (s) => s.money >= 10,
    run: (s) => { s.money = Math.max(0, s.money - 12) },
  },
  { text: '중요한 프로젝트에 발탁되었다.', run: (s) => { s.stats.work = clamp(s.stats.work + 6); s.stress = clamp(s.stress + 5) } },
  { text: '야근 중 실수를 저질러 질책을 받았다.', run: (s) => { s.stress = clamp(s.stress + 10); s.stats.trust = clamp(s.stats.trust - 3) } },
  { text: '자기계발 강의에서 큰 깨달음을 얻었다.', run: (s) => { s.stats.expertise = clamp(s.stats.expertise + 6) } },
  { text: '동료의 추천으로 사내 동아리에 가입했다.', run: (s) => { s.stats.network = clamp(s.stats.network + 4); s.stats.trust = clamp(s.stats.trust + 2) } },
  { text: '과로로 몸이 으슬으슬했다.', run: (s) => { s.stress = clamp(s.stress + 12) } },
  { text: '소액으로 투자해 짭짤한 수익을 얻었다.', run: (s) => { s.money += 10 } },
  { text: '동기와 점심을 먹으며 수다로 힐링했다.', run: (s) => { s.stress = clamp(s.stress - 8); s.stats.network = clamp(s.stats.network + 2) } },
  { text: '건강검진에서 체력 관리에 주의하라는 소견을 들었다.', run: (s) => { s.stats.stamina = clamp(s.stats.stamina - 5); s.stress = clamp(s.stress + 5) } },
  { text: '사내 체육대회에서 활약했다.', run: (s) => { s.stats.stamina = clamp(s.stats.stamina + 5); s.stats.network = clamp(s.stats.network + 4) } },
  { text: '야근 수당을 넉넉히 받았다.', run: (s) => { s.money += 12 } },
  { text: '중요한 문서에 커피를 쏟아 당황했다.', run: (s) => { s.stress = clamp(s.stress + 10) } },
  { text: '멘토에게 값진 조언을 들었다.', run: (s) => { s.stats.expertise = clamp(s.stats.expertise + 4); s.stats.trust = clamp(s.stats.trust + 3) } },
  { text: '오랜만에 칼퇴근을 해서 기분이 좋았다.', run: (s) => { s.stress = clamp(s.stress - 10) } },
  {
    text: '회사 앞에서 사기성 설문조사에 돈을 뜯겼다.',
    condition: (s) => s.money >= 10,
    run: (s) => { s.money = Math.max(0, s.money - 10) },
  },
]

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

  if (work >= HIGH && trust >= HIGH) {
    return {
      title: '임원 엔딩',
      text: `뛰어난 업무 성과와 두터운 신뢰를 바탕으로, ${s.name}은(는) 마침내 임원으로 승진해 회사의 핵심 의사결정에 참여하게 되었다.`,
    }
  }
  if (trust >= HIGH && network >= HIGH) {
    return {
      title: '신뢰받는 리더 엔딩',
      text: `깊은 신뢰와 넓은 인맥을 쌓은 ${s.name}은(는) 팀원들이 가장 따르고 싶어하는 리더로 자리매김했다.`,
    }
  }
  if (s.money >= 300 && network >= HIGH) {
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
function drawPortrait(canvas, { rankKey, moodKey, hairHex }) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  const proportions = {
    junior: { headR: 0.3, headY: 0.32, bodyTop: 0.55, bodyW: 0.5, shoulderW: 0.64 },
    staff: { headR: 0.28, headY: 0.31, bodyTop: 0.53, bodyW: 0.48, shoulderW: 0.62 },
    manager: { headR: 0.27, headY: 0.3, bodyTop: 0.51, bodyW: 0.47, shoulderW: 0.62 },
    director: { headR: 0.26, headY: 0.29, bodyTop: 0.49, bodyW: 0.46, shoulderW: 0.64 },
  }
  const p = proportions[rankKey] || proportions.junior
  const headR = H * p.headR
  const headY = H * p.headY

  // Suit / shoulders - darker and sharper the higher the rank
  const suitColors = { junior: '#8fa3c9', staff: '#5f7cb0', manager: '#3a4f7a', director: '#23314f' }
  ctx.fillStyle = suitColors[rankKey] || suitColors.junior
  ctx.beginPath()
  ctx.moveTo(cx - W * p.shoulderW * 0.5, H)
  ctx.quadraticCurveTo(cx - W * p.bodyW * 0.5, H * p.bodyTop, cx, H * (p.bodyTop - 0.02))
  ctx.quadraticCurveTo(cx + W * p.bodyW * 0.5, H * p.bodyTop, cx + W * p.shoulderW * 0.5, H)
  ctx.closePath()
  ctx.fill()

  // Shirt collar / tie
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(cx - headR * 0.32, H * (p.bodyTop - 0.01))
  ctx.lineTo(cx, H * p.bodyTop + headR * 0.3)
  ctx.lineTo(cx + headR * 0.32, H * (p.bodyTop - 0.01))
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = rankKey === 'director' || rankKey === 'manager' ? '#c23b3b' : '#3f6fd1'
  ctx.beginPath()
  ctx.moveTo(cx - headR * 0.09, H * p.bodyTop)
  ctx.lineTo(cx + headR * 0.09, H * p.bodyTop)
  ctx.lineTo(cx + headR * 0.06, H)
  ctx.lineTo(cx - headR * 0.06, H)
  ctx.closePath()
  ctx.fill()

  // Neck
  ctx.fillStyle = '#ffd9b8'
  ctx.fillRect(cx - headR * 0.3, headY + headR * 0.75, headR * 0.6, headR * 0.5)

  // Back hair
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.ellipse(cx, headY + headR * 0.1, headR * 1.05, headR * 1.2, 0, 0, Math.PI * 2)
  ctx.fill()

  // Face
  ctx.fillStyle = '#ffd9b8'
  ctx.beginPath()
  ctx.arc(cx, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  // Front hair / neat office cut
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.moveTo(cx - headR, headY - headR * 0.05)
  ctx.quadraticCurveTo(cx - headR * 0.6, headY - headR * 1.2, cx, headY - headR * 1.08)
  ctx.quadraticCurveTo(cx + headR * 0.6, headY - headR * 1.2, cx + headR, headY - headR * 0.05)
  ctx.quadraticCurveTo(cx, headY - headR * 0.58, cx - headR, headY - headR * 0.05)
  ctx.fill()

  // Glasses for manager/director ranks (looks more senior)
  if (rankKey === 'manager' || rankKey === 'director') {
    ctx.strokeStyle = 'rgba(40,40,40,0.75)'
    ctx.lineWidth = Math.max(1, headR * 0.035)
    const eyeY = headY + headR * 0.08
    const eyeDX = headR * 0.38
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + sx * eyeDX, eyeY, headR * 0.22, headR * 0.17, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(cx - headR * 0.16, eyeY)
    ctx.lineTo(cx + headR * 0.16, eyeY)
    ctx.stroke()
  }

  // Director's pin accent
  if (rankKey === 'director') {
    ctx.fillStyle = '#d4af37'
    ctx.beginPath()
    ctx.arc(cx - W * p.shoulderW * 0.22, H * p.bodyTop + headR * 0.5, headR * 0.1, 0, Math.PI * 2)
    ctx.fill()
  }

  // Face features by mood
  const eyeY = headY + headR * 0.08
  const eyeDX = headR * 0.38
  ctx.fillStyle = '#4a332b'
  if (moodKey === 'tired' || moodKey === 'sick') {
    ctx.strokeStyle = '#4a332b'
    ctx.lineWidth = Math.max(1.5, headR * 0.06)
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + sx * eyeDX - headR * 0.14, eyeY)
      ctx.quadraticCurveTo(cx + sx * eyeDX, eyeY + headR * 0.08, cx + sx * eyeDX + headR * 0.14, eyeY)
      ctx.stroke()
    }
  } else {
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + sx * eyeDX, eyeY, headR * 0.1, headR * 0.14, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Blush / fatigue tint
  ctx.fillStyle = moodKey === 'sick' ? 'rgba(90,110,180,0.4)' : 'rgba(255,140,140,0.3)'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + sx * headR * 0.55, headY + headR * 0.32, headR * 0.14, headR * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Mouth
  ctx.strokeStyle = '#a85a46'
  ctx.lineWidth = Math.max(1.5, headR * 0.05)
  ctx.beginPath()
  const mouthY = headY + headR * 0.52
  if (moodKey === 'bright') {
    ctx.arc(cx, mouthY - headR * 0.1, headR * 0.22, 0.15 * Math.PI, 0.85 * Math.PI)
  } else if (moodKey === 'sick') {
    ctx.moveTo(cx - headR * 0.14, mouthY + headR * 0.05)
    ctx.quadraticCurveTo(cx, mouthY - headR * 0.08, cx + headR * 0.14, mouthY + headR * 0.05)
  } else if (moodKey === 'tired') {
    ctx.moveTo(cx - headR * 0.16, mouthY)
    ctx.lineTo(cx + headR * 0.16, mouthY)
  } else {
    ctx.arc(cx, mouthY - headR * 0.06, headR * 0.16, 0.2 * Math.PI, 0.8 * Math.PI)
  }
  ctx.stroke()

  // Sweat drop if sick
  if (moodKey === 'sick') {
    ctx.fillStyle = '#7fc4e8'
    ctx.beginPath()
    ctx.moveTo(cx + headR * 0.85, headY - headR * 0.3)
    ctx.quadraticCurveTo(cx + headR * 0.95, headY - headR * 0.05, cx + headR * 0.85, headY + headR * 0.05)
    ctx.quadraticCurveTo(cx + headR * 0.75, headY - headR * 0.05, cx + headR * 0.85, headY - headR * 0.3)
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
    money: 50,
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
  if (!state.sick && state.stress >= 92 && Math.random() < 0.35) {
    state.sick = true
    lines.push(`${state.name}은(는) 무리를 한 탓인지 몸이 으슬으슬하다... (다음 분기는 병가를 낸다)`)
  }
  if (state.stress >= 85) state.burnoutTurns += 1
  state.lastResult = lines.join(' ')
  state.turn += 1
  state.phase = 'result'
}

function continueFromResult() {
  if (state.turn >= TOTAL_TURNS) {
    state.ending = computeEnding(state)
    state.phase = 'ending'
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
      <div class="hint">매 분기마다 활동을 선택해 능력치를 키우세요. 무리하면 번아웃이 올 수 있어요. 8년이 지나면 그동안의 성장에 따라 엔딩이 결정됩니다.</div>
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
  const rank = rankForTurn(state.turn)
  const mood = moodForStress(state.stress)
  app.innerHTML = `
    <div class="game-wrap">
      <div class="topbar">
        <span>${yearAt(state.turn)}년차 · ${quarterAt(state.turn)}</span>
        <span class="money">💰 ${state.money}</span>
      </div>
      <div class="body-row">
        <div class="portrait-col">
          <canvas id="portrait-canvas" width="200" height="240"></canvas>
          <div class="worker-name">${state.name}</div>
          <div class="worker-rank">${rank.label}</div>
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
  const body = `<div class="log-box">${state.lastResult}</div>
    <button class="continue-btn" id="continue-btn">계속</button>`
  renderTopAndPortrait(body)
  document.getElementById('continue-btn').onclick = continueFromResult
}

function renderEnding() {
  const rank = rankForTurn(TOTAL_TURNS)
  app.innerHTML = `
    <div class="ending-wrap">
      <canvas id="ending-canvas" width="220" height="264"></canvas>
      <h2 class="ending-title">${state.ending.title}</h2>
      <div class="ending-text">${state.ending.text}</div>
      <div class="ending-stats">업무력 ${state.stats.work} · 체력 ${state.stats.stamina} · 인맥 ${state.stats.network} · 전문성 ${state.stats.expertise} · 신뢰 ${state.stats.trust} · 자금 ${state.money}</div>
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
