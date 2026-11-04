const app = document.getElementById('app')

const TOTAL_TURNS_MAX = 40 // safety-net day count for the rare "stabilized" ending
const BASE_DECAY_MIN = 2
const BASE_DECAY_MAX = 4
const HIGH = 70
const VERY_HIGH = 85

const HAIR_COLORS = [
  { key: 'silver', label: '은발', hex: '#cfd8e3' },
  { key: 'black', label: '흑발', hex: '#2b2320' },
  { key: 'teal', label: '청록', hex: '#2f7d78' },
]

function moodForState(cheer, core) {
  if (core <= 20) return { key: 'fading', label: '깜빡이는 코어' }
  if (cheer >= 75) return { key: 'bright', label: '쾌활함' }
  if (cheer <= 25) return { key: 'weary', label: '지침' }
  return { key: 'normal', label: '평온함' }
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function lerpHex(hexA, hexB, t) {
  t = clamp(t, 0, 1)
  const a = parseInt(hexA.slice(1), 16)
  const b = parseInt(hexB.slice(1), 16)
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r},${g},${bl})`
}

// --- Activities -------------------------------------------------------------
const STAT_KEYS = ['combat', 'chore', 'bond', 'knowledge', 'cheer']
const STAT_LABELS = { combat: '전투력', chore: '가사력', bond: '유대감', knowledge: '지식', cheer: '쾌활함' }
const STAT_COLORS = { combat: '#e0633f', chore: '#4fae7a', bond: '#e06ba6', knowledge: '#5b8ac6', cheer: '#f0c419' }

// decay: [min, max] extra core cost on top of the base daily decay. Negative values restore core.
const ACTIVITIES = [
  {
    key: 'combat',
    name: '전투 훈련',
    desc: '실전 감각을 유지한다 · 전투력 + / 코어 소모 큼',
    decay: [4, 7],
    run(s) {
      s.stats.combat = clamp(s.stats.combat + rand(12, 18))
      return `${s.name}은(는) 구슬땀을 흘리며 전투 훈련을 했다.`
    },
  },
  {
    key: 'chore',
    name: '집안일 하기',
    desc: '청소와 요리를 한다 · 가사력 + / 용돈 약간',
    decay: [0, 1],
    run(s) {
      s.stats.chore = clamp(s.stats.chore + rand(12, 18))
      s.money += rand(4, 8)
      return `${s.name}은(는) 집 안 구석구석을 정리하고 저녁을 준비했다.`
    },
  },
  {
    key: 'outing',
    name: '함께 외출하기',
    desc: '같이 시간을 보낸다 · 유대감 + / 비용 15',
    cost: 15,
    decay: [1, 2],
    run(s) {
      s.money -= 15
      s.stats.bond = clamp(s.stats.bond + rand(10, 16))
      s.stats.knowledge = clamp(s.stats.knowledge + rand(3, 6))
      return `${s.name}와(과) 함께 거리를 거닐며 좋은 시간을 보냈다.`
    },
  },
  {
    key: 'study',
    name: '공부하기',
    desc: '인간의 생활을 배운다 · 지식 +',
    decay: [0, 2],
    run(s) {
      s.stats.knowledge = clamp(s.stats.knowledge + rand(12, 18))
      s.stats.cheer = clamp(s.stats.cheer + rand(1, 3))
      return `${s.name}은(는) 책을 펼치고 인간의 생활 방식을 하나씩 익혔다.`
    },
  },
  {
    key: 'play',
    name: '장난치기',
    desc: '함께 놀고 웃는다 · 쾌활함 +',
    decay: [-1, 1],
    run(s) {
      s.stats.cheer = clamp(s.stats.cheer + rand(12, 18))
      s.stats.bond = clamp(s.stats.bond + rand(2, 5))
      return `${s.name}은(는) 장난을 치며 집 안 가득 웃음소리를 채웠다.`
    },
  },
  {
    key: 'rest',
    name: '정비·휴식',
    desc: '코어를 점검하고 쉰다 · 코어 소모 크게 감소',
    decay: [-9, -5],
    run(s) {
      s.stats.cheer = clamp(s.stats.cheer + rand(1, 3))
      return `${s.name}은(는) 하루 종일 코어를 정비하며 조용히 쉬었다.`
    },
  },
  {
    key: 'mission',
    name: '임무 수행',
    desc: '의뢰를 처리한다 · 돈 + / 코어 소모 큼',
    decay: [3, 5],
    run(s) {
      s.money += rand(20, 30)
      s.stats.combat = clamp(s.stats.combat + rand(3, 6))
      return `${s.name}은(는) 들어온 의뢰를 처리하고 보수를 받아왔다.`
    },
  },
]

// --- Random events ------------------------------------------------------------
const EVENTS = [
  { text: '실수로 접시를 깨뜨려 당황했다.', run: (s) => { s.stats.chore = clamp(s.stats.chore - 3); s.stats.cheer = clamp(s.stats.cheer - 2) } },
  { text: '이웃이 로봇이냐고 물어봐서 둘 다 당황했다.', run: (s) => { s.stats.bond = clamp(s.stats.bond + 3) } },
  { text: '낡은 전투 데이터가 떠올라 잠시 말이 없어졌다.', run: (s) => { s.stats.combat = clamp(s.stats.combat + 4); s.core = clamp(s.core - 3) } },
  { text: '함께 저녁을 만들어 먹었다.', run: (s) => { s.stats.bond = clamp(s.stats.bond + 4); s.stats.chore = clamp(s.stats.chore + 2) } },
  { text: '길에서 주운 고양이를 함께 돌봐주었다.', run: (s) => { s.stats.cheer = clamp(s.stats.cheer + 4); s.stats.bond = clamp(s.stats.bond + 2) } },
  { text: '정비 중 예상보다 심한 마모를 발견했다.', run: (s) => { s.core = clamp(s.core - 5) } },
  { text: '깜짝 선물을 받고 환하게 웃었다.', run: (s) => { s.stats.cheer = clamp(s.stats.cheer + 5); s.stats.bond = clamp(s.stats.bond + 3) } },
  { text: '오래된 사진을 보며 조용히 미소지었다.', run: (s) => { s.stats.bond = clamp(s.stats.bond + 3) } },
  { text: '갑작스런 위협을 혼자 조용히 처리하고 돌아왔다.', run: (s) => { s.stats.combat = clamp(s.stats.combat + 5); s.core = clamp(s.core - 4) } },
  { text: '새로운 레시피에 도전해 맛있는 요리를 완성했다.', run: (s) => { s.stats.chore = clamp(s.stats.chore + 5); s.stats.knowledge = clamp(s.stats.knowledge + 2) } },
  { text: '동네 축제에 놀러 가 신나게 즐겼다.', run: (s) => { s.stats.cheer = clamp(s.stats.cheer + 4); s.stats.knowledge = clamp(s.stats.knowledge + 2) } },
  { text: '밤새 이런저런 이야기를 나누었다.', run: (s) => { s.stats.bond = clamp(s.stats.bond + 5); s.core = clamp(s.core - 1) } },
  { text: '우연히 좋은 부품을 구해 컨디션이 좋아졌다.', run: (s) => { s.core = clamp(s.core + 6) } },
  { text: '사소한 일로 작게 다투었다.', run: (s) => { s.stats.bond = clamp(s.stats.bond - 3); s.stats.cheer = clamp(s.stats.cheer - 2) } },
  { text: '함께 옥상에 올라가 별을 보았다.', run: (s) => { s.stats.bond = clamp(s.stats.bond + 4); s.stats.cheer = clamp(s.stats.cheer + 2) } },
  { text: '예전에 알던 동료 기체의 소식을 전해 들었다.', run: (s) => { s.stats.knowledge = clamp(s.stats.knowledge + 3); s.core = clamp(s.core - 2) } },
]

// --- Endings ------------------------------------------------------------------
function computeEnding(s) {
  if (s.core > 0 && s.turn >= TOTAL_TURNS_MAX) {
    return {
      title: '코어 안정화 엔딩',
      text: `정성스러운 보살핌 덕분이었을까. ${s.name}의 코어는 한계를 넘기고도 꺼지지 않았다.\n"저, 조금 더 오래 곁에 있어도 될까요?"\n수명의 경계를 넘어선 ${s.name}은(는), 이제 평범한 내일을 함께 꿈꿀 수 있게 되었다.`,
    }
  }

  if (s.turn < 8) {
    return {
      title: '과부하 엔딩',
      text: `${s.name}은(는) 무리한 훈련과 임무를 반복한 끝에, 마음을 나눌 틈도 없이 코어의 불빛이 꺼지고 말았다.\n너무 이른 작별이었다. 좀 더 쉬게 해줄걸, 하는 후회만이 남았다.`,
    }
  }

  const { combat, chore, bond, knowledge, cheer } = s.stats
  const combos = [
    {
      test: bond >= HIGH && combat >= HIGH,
      title: '마지막까지 지켜낸 엔딩',
      text: `코어의 빛이 희미해지던 마지막 순간까지, ${s.name}은(는) 곁을 지켰다.\n"지켜야 할 사람이 있어서 다행이었어요." 그 말을 남기고, ${s.name}은(는) 웃으며 눈을 감았다.\n슬펐지만, 후회는 없었다.`,
    },
    {
      test: bond >= HIGH && cheer >= HIGH,
      title: '행복했던 나날 엔딩',
      text: `짧았지만 매일이 웃음으로 가득했다. ${s.name}은(는) 마지막 순간까지 장난기 가득한 미소를 잃지 않았다.\n"덕분에 정말 즐거운 나날이었어요." 그 말이, 오래도록 마음에 남았다.`,
    },
    {
      test: knowledge >= HIGH && chore >= HIGH,
      title: '완벽한 하루들 엔딩',
      text: `${s.name}은(는) 어느새 누구보다 사람다운 나날을 보내고 있었다. 요리와 살림, 그리고 사소한 지식들까지.\n마지막 날도 여느 때와 다름없이 평범하고 완벽한 하루였다.`,
    },
  ]
  const combo = combos.find((c) => c.test)
  if (combo) return combo

  const soloEndings = [
    { stat: combat, title: '전설의 호위 엔딩', text: `${s.name}의 전투력은 끝내 전설이 되었다. 코어가 멈춘 후에도, 그 이름은 가장 강했던 호위 기체로 오래도록 기억되었다.` },
    { stat: bond, title: '영원히 기억될 엔딩', text: `함께한 시간이 너무 깊어, ${s.name}은(는) 더 이상 기계로 느껴지지 않았다. 코어가 꺼진 뒤에도, 하루하루 속에는 늘 ${s.name}이 함께였다.` },
  ]
  const best = soloEndings.filter((e) => e.stat >= VERY_HIGH).sort((a, b) => b.stat - a.stat)[0]
  if (best) return best

  return {
    title: '조용한 작별 엔딩',
    text: `특별한 사건도, 깊은 유대도 없었지만, ${s.name}은(는) 맡은 하루하루를 묵묵히 살아냈다.\n조용한 작별이었지만, 그것대로 담담한 하루들이었다.`,
  }
}

// --- Portrait drawing (canvas, procedural - no external art assets) -------
function drawPortrait(canvas, { moodKey, coreRatio, hairHex }) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  if (moodKey === 'fading') ctx.globalAlpha = 0.82

  const cx = W / 2
  const headR = H * 0.27
  const headY = H * 0.3
  const bodyTop = H * 0.55

  // Dress / shoulders
  ctx.fillStyle = '#242733'
  ctx.beginPath()
  ctx.moveTo(cx - W * 0.3, H)
  ctx.quadraticCurveTo(cx - W * 0.24, bodyTop, cx, bodyTop - H * 0.02)
  ctx.quadraticCurveTo(cx + W * 0.24, bodyTop, cx + W * 0.3, H)
  ctx.closePath()
  ctx.fill()

  // White collar
  ctx.fillStyle = '#f2f2f2'
  ctx.beginPath()
  ctx.moveTo(cx - headR * 0.3, bodyTop)
  ctx.lineTo(cx, bodyTop + headR * 0.32)
  ctx.lineTo(cx + headR * 0.3, bodyTop)
  ctx.lineTo(cx + headR * 0.42, bodyTop + headR * 0.1)
  ctx.lineTo(cx, bodyTop + headR * 0.55)
  ctx.lineTo(cx - headR * 0.42, bodyTop + headR * 0.1)
  ctx.closePath()
  ctx.fill()

  // Apron
  ctx.fillStyle = '#f7f7f7'
  ctx.beginPath()
  ctx.moveTo(cx - headR * 0.5, bodyTop + headR * 0.6)
  ctx.lineTo(cx + headR * 0.5, bodyTop + headR * 0.6)
  ctx.lineTo(cx + headR * 0.62, H)
  ctx.lineTo(cx - headR * 0.62, H)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx - headR * 0.3, bodyTop + headR * 0.75)
  ctx.lineTo(cx - headR * 0.4, H - 6)
  ctx.moveTo(cx + headR * 0.3, bodyTop + headR * 0.75)
  ctx.lineTo(cx + headR * 0.4, H - 6)
  ctx.stroke()

  // Core light (glows through the apron, color shifts teal -> red as it depletes)
  const coreColor = lerpHex('#3fd0c9', '#ff5a4d', 1 - coreRatio)
  const coreCx = cx
  const coreCy = bodyTop + headR * 0.95
  const coreR = headR * (0.14 + coreRatio * 0.05)
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = (moodKey === 'fading' ? 0.82 : 1) * (0.12 * i)
    ctx.fillStyle = coreColor
    ctx.beginPath()
    ctx.arc(coreCx, coreCy, coreR * (1 + i * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = moodKey === 'fading' ? 0.82 : 1
  ctx.fillStyle = coreColor
  ctx.beginPath()
  ctx.arc(coreCx, coreCy, coreR, 0, Math.PI * 2)
  ctx.fill()

  // Neck
  ctx.fillStyle = '#ffe3c8'
  ctx.fillRect(cx - headR * 0.3, headY + headR * 0.75, headR * 0.6, headR * 0.5)

  // Back hair
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.ellipse(cx, headY + headR * 0.15, headR * 1.08, headR * 1.3, 0, 0, Math.PI * 2)
  ctx.fill()

  // Face
  ctx.fillStyle = '#ffe3c8'
  ctx.beginPath()
  ctx.arc(cx, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  // Front hair / bangs
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.moveTo(cx - headR, headY - headR * 0.1)
  ctx.quadraticCurveTo(cx - headR * 0.6, headY - headR * 1.25, cx, headY - headR * 1.1)
  ctx.quadraticCurveTo(cx + headR * 0.6, headY - headR * 1.25, cx + headR, headY - headR * 0.1)
  ctx.quadraticCurveTo(cx, headY - headR * 0.55, cx - headR, headY - headR * 0.1)
  ctx.fill()

  // Maid headband
  ctx.fillStyle = '#fbfbfb'
  ctx.beginPath()
  ctx.arc(cx, headY - headR * 0.3, headR * 1.02, Math.PI * 1.08, Math.PI * 1.92)
  ctx.lineWidth = headR * 0.16
  ctx.strokeStyle = '#fbfbfb'
  ctx.stroke()

  // Face features by mood
  const eyeY = headY + headR * 0.08
  const eyeDX = headR * 0.38
  ctx.fillStyle = '#4a332b'
  if (moodKey === 'weary' || moodKey === 'fading') {
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

  // Blush
  ctx.fillStyle = moodKey === 'fading' ? 'rgba(120,150,200,0.35)' : 'rgba(255,140,140,0.32)'
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
  } else if (moodKey === 'fading') {
    ctx.moveTo(cx - headR * 0.14, mouthY + headR * 0.05)
    ctx.quadraticCurveTo(cx, mouthY - headR * 0.08, cx + headR * 0.14, mouthY + headR * 0.05)
  } else if (moodKey === 'weary') {
    ctx.moveTo(cx - headR * 0.16, mouthY)
    ctx.lineTo(cx + headR * 0.16, mouthY)
  } else {
    ctx.arc(cx, mouthY - headR * 0.06, headR * 0.16, 0.2 * Math.PI, 0.8 * Math.PI)
  }
  ctx.stroke()

  ctx.globalAlpha = 1
}

// --- State ----------------------------------------------------------------
function freshState() {
  return {
    phase: 'title',
    name: '',
    hairHex: HAIR_COLORS[0].hex,
    hairKey: HAIR_COLORS[0].key,
    turn: 0,
    stats: { combat: 20, chore: 20, bond: 20, knowledge: 20, cheer: 30 },
    money: 40,
    core: 100,
    lastResult: '',
    ending: null,
  }
}
let state = freshState()

function resolveTurn(activity) {
  const lines = []
  lines.push(activity.run(state))
  if (Math.random() < 0.55) {
    const ev = pick(EVENTS)
    ev.run(state)
    lines.push(ev.text)
  }

  const base = rand(BASE_DECAY_MIN, BASE_DECAY_MAX)
  const extra = rand(activity.decay[0], activity.decay[1])
  state.core = clamp(state.core - base - extra)

  if (state.core > 0 && state.core <= 20) {
    lines.push('⚠ 코어 잔량이 위험 수준이다.')
  }

  state.lastResult = lines.join(' ')
  state.turn += 1
  state.phase = 'result'
}

function continueFromResult() {
  if (state.core <= 0 || state.turn >= TOTAL_TURNS_MAX) {
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
      <h1>메이드로이드</h1>
      <div class="subtitle">전투용으로 설계된 안드로이드가, 당신의 집에서 메이드로 살아가는 이야기.<br/>코어의 수명은 알 수 없습니다 — 하루하루를 어떻게 보낼지는 당신의 선택에 달렸습니다.</div>
      <div class="field-row">
        <label>이름</label>
        <input id="name-input" type="text" maxlength="8" placeholder="예: 하루" value="하루" />
      </div>
      <div class="field-row">
        <label>머리색</label>
        <div class="swatch-row">
          ${HAIR_COLORS.map(
            (h) => `<div class="swatch ${h.key === state.hairKey ? 'selected' : ''}" data-hair="${h.key}" style="background:${h.hex}" title="${h.label}"></div>`,
          ).join('')}
        </div>
      </div>
      <button class="primary-btn" id="start-btn">함께 지내기 시작</button>
      <div class="hint">매일 활동을 선택해 능력치를 키우세요. 무리한 활동은 코어를 빠르게 소모시키고, 정비와 휴식은 코어를 되찾아줍니다. 코어가 다하면 그날이 마지막 날이 됩니다.</div>
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
    state.name = nameInput.value.trim() || '하루'
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

function coreBar(core) {
  const color = lerpHex('#3fd0c9', '#ff5a4d', 1 - core / 100)
  return `
    <div class="stat-row core-row">
      <div class="stat-label">코어</div>
      <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${core}%; background:${color}"></div></div>
      <div class="stat-val">${core}</div>
    </div>
  `
}

function renderTopAndPortrait(extraBodyHtml) {
  const mood = moodForState(state.stats.cheer, state.core)
  app.innerHTML = `
    <div class="game-wrap">
      <div class="topbar">
        <span>${state.turn + 1}일차</span>
        <span class="money">💰 ${state.money}</span>
      </div>
      <div class="body-row">
        <div class="portrait-col">
          <canvas id="portrait-canvas" width="200" height="240"></canvas>
          <div class="droid-name">${state.name}</div>
          <div class="droid-day">코어 가동 중</div>
          <div class="mood-tag">${mood.label}</div>
        </div>
        <div class="stats-col">
          ${STAT_KEYS.map((k) => statBar(k, state.stats[k])).join('')}
          ${coreBar(state.core)}
          ${extraBodyHtml}
        </div>
      </div>
    </div>
  `
  const canvas = document.getElementById('portrait-canvas')
  if (canvas) drawPortrait(canvas, { moodKey: mood.key, coreRatio: state.core / 100, hairHex: state.hairHex })
}

function renderChoose() {
  const body = `<div class="activity-grid">
      ${ACTIVITIES.map((a) => {
        const disabled = a.cost && state.money < a.cost
        return `<button class="activity-btn" data-act="${a.key}" ${disabled ? 'disabled' : ''}>
          <span class="act-name">${a.name}</span>
          <span class="act-desc">${a.desc}</span>
        </button>`
      }).join('')}
    </div>`
  renderTopAndPortrait(body)
  document.querySelectorAll('.activity-btn').forEach((btn) => {
    btn.onclick = () => {
      const a = ACTIVITIES.find((x) => x.key === btn.dataset.act)
      resolveTurn(a)
      render()
    }
  })
}

function renderResult() {
  const body = `<div class="log-box">${state.lastResult}</div>
    <button class="continue-btn" id="continue-btn">계속</button>`
  renderTopAndPortrait(body)
  document.getElementById('continue-btn').onclick = continueFromResult
}

function renderEnding() {
  const moodKey = state.core > 0 ? 'bright' : 'fading'
  app.innerHTML = `
    <div class="ending-wrap">
      <canvas id="ending-canvas" width="220" height="264"></canvas>
      <h2 class="ending-title">${state.ending.title}</h2>
      <div class="ending-text">${state.ending.text}</div>
      <div class="ending-stats">전투력 ${state.stats.combat} · 가사력 ${state.stats.chore} · 유대감 ${state.stats.bond} · 지식 ${state.stats.knowledge} · 쾌활함 ${state.stats.cheer} · 함께한 날 ${state.turn}일 · 자금 ${state.money}</div>
      <button class="restart-btn" id="restart-btn">다시 시작하기</button>
    </div>
  `
  drawPortrait(document.getElementById('ending-canvas'), { moodKey, coreRatio: Math.max(state.core, 6) / 100, hairHex: state.hairHex })
  document.getElementById('restart-btn').onclick = () => {
    state = freshState()
    render()
  }
}

render()
