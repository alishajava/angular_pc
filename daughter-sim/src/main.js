import { sfx, unlockSfx, toggleMute } from './sfx.js'

const app = document.getElementById('app')

const TOTAL_TURNS = 32 // 8 years x 4 seasons
const SEASON_NAMES = ['봄', '여름', '가을', '겨울']
const START_AGE = 10

const HAIR_COLORS = [
  { key: 'brown', label: '밤색', hex: '#6b4226' },
  { key: 'black', label: '검정', hex: '#2b2320' },
  { key: 'red', label: '적갈색', hex: '#9c3b2e' },
]

function stageForAge(age) {
  if (age <= 12) return { key: 'child', label: '유년기' }
  if (age <= 15) return { key: 'teen', label: '소녀기' }
  return { key: 'lady', label: '숙녀기' }
}

function moodForStress(stress) {
  if (stress >= 85) return { key: 'sick', label: '기진맥진' }
  if (stress >= 60) return { key: 'tired', label: '피곤함' }
  if (stress <= 25) return { key: 'bright', label: '쾌활함' }
  return { key: 'normal', label: '평온함' }
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// --- Activities -----------------------------------------------------------
const STAT_KEYS = ['int', 'str', 'charm', 'art', 'faith']
const STAT_LABELS = { int: '지력', str: '체력', charm: '매력', art: '예술', faith: '신앙' }
const STAT_COLORS = { int: '#5b8ac6', str: '#e0633f', charm: '#e06ba6', art: '#8f6bd6', faith: '#4fae7a' }

const ACTIVITIES = [
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
const EVENTS = [
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
const HIGH = 70
const VERY_HIGH = 85

function computeEnding(s) {
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

  // age lines for senior ranks
  if (lines) {
    ctx.strokeStyle = 'rgba(120,80,60,0.4)'
    ctx.lineWidth = Math.max(1, R * 0.03)
    for (const sx of [-1, 1]) {
      for (let i = 0; i < lines; i++) {
        ctx.beginPath()
        ctx.arc(cx + sx * R * 0.33, headY + R * 0.4, R * (0.2 + i * 0.05), sx > 0 ? -0.5 : Math.PI - 1.4 + 0.9, sx > 0 ? 0.6 : Math.PI + 0.1)
        ctx.stroke()
      }
    }
  }
}

function drawPortrait(canvas, { stageKey, moodKey, hairHex }) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  const proportions = {
    child: { headR: 0.32, headY: 0.33, bodyTop: 0.56, bodyW: 0.5, shoulderW: 0.62 },
    teen: { headR: 0.27, headY: 0.3, bodyTop: 0.52, bodyW: 0.46, shoulderW: 0.58 },
    lady: { headR: 0.23, headY: 0.27, bodyTop: 0.46, bodyW: 0.42, shoulderW: 0.56 },
  }
  const p = proportions[stageKey] || proportions.teen
  const headR = H * p.headR
  const headY = H * p.headY

  // Outfit / shoulders
  const outfitColors = { child: '#ffb199', teen: '#ff9b7a', lady: '#f08a7a' }
  ctx.fillStyle = outfitColors[stageKey] || '#ff9b7a'
  ctx.beginPath()
  ctx.moveTo(cx - W * p.shoulderW * 0.5, H)
  ctx.quadraticCurveTo(cx - W * p.bodyW * 0.5, H * p.bodyTop, cx, H * (p.bodyTop - 0.02))
  ctx.quadraticCurveTo(cx + W * p.bodyW * 0.5, H * p.bodyTop, cx + W * p.shoulderW * 0.5, H)
  ctx.closePath()
  ctx.fill()

  // Neck
  ctx.fillStyle = '#ffd9b8'
  ctx.fillRect(cx - headR * 0.3, headY + headR * 0.75, headR * 0.6, headR * 0.5)

  // Back hair (behind head), longer for older stages
  const hairLen = { child: 0.12, teen: 0.3, lady: 0.46 }[stageKey] || 0.3
  ctx.fillStyle = hairHex
  ctx.beginPath()
  ctx.ellipse(cx, headY + headR * 0.1, headR * 1.08, headR * (1.1 + hairLen), 0, 0, Math.PI * 2)
  ctx.fill()

  // Face
  ctx.fillStyle = '#ffd9b8'
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
  // a little fringe texture
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = Math.max(1, headR * 0.03)
  for (const dx of [-0.35, -0.1, 0.15, 0.4]) {
    ctx.beginPath()
    ctx.moveTo(cx + headR * dx, headY - headR * 0.75)
    ctx.lineTo(cx + headR * dx * 1.15, headY - headR * 0.25)
    ctx.stroke()
  }

  // Lady stage: small ribbon/tiara accent
  if (stageKey === 'lady') {
    ctx.fillStyle = '#e06ba6'
    ctx.beginPath()
    ctx.arc(cx + headR * 0.55, headY - headR * 0.85, headR * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }

  drawFaceDetail(ctx, cx, headY, headR, moodKey, { eyeHex: '#6a3f2a', lashes: stageKey !== 'child', eyeScale: stageKey === 'child' ? 1.18 : stageKey === 'teen' ? 1.05 : 1, browHex: hairHex })

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
    stats: { int: 20, str: 20, charm: 20, art: 20, faith: 20 },
    money: 30,
    stress: 20,
    burnoutTurns: 0, // 스트레스 85 이상으로 끝난 턴 수
    sick: false,
    lastResult: '',
    ending: null,
  }
}
let state = freshState()

function ageAt(turn) {
  return START_AGE + Math.floor(turn / 4)
}
function seasonAt(turn) {
  return SEASON_NAMES[turn % 4]
}

function resolveTurn(activity) {
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
    lines.push(`${state.name}은(는) 무리를 한 탓인지 몸이 으슬으슬하다... (다음 턴은 앓아눕는다)`)
  }
  if (state.stress >= 85) state.burnoutTurns += 1
  state.lastResult = lines.join(' ')
  setTimeout(() => (state.sick ? sfx.bad() : sfx.pickup()), 90)
  state.turn += 1
  state.phase = 'result'
}

function continueFromResult() {
  if (state.turn >= TOTAL_TURNS) {
    state.ending = computeEnding(state)
    state.phase = 'ending'
    setTimeout(() => (state.ending.title.includes('번아웃') ? sfx.lose() : sfx.fanfare()), 120)
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
      <h1>딸 키우기</h1>
      <div class="subtitle">10살부터 18살까지, 8년간 딸을 키워 보세요</div>
      <div class="field-row">
        <label>딸의 이름</label>
        <input id="name-input" type="text" maxlength="8" placeholder="예: 리안" value="리안" />
      </div>
      <div class="field-row">
        <label>머리색</label>
        <div class="swatch-row">
          ${HAIR_COLORS.map(
            (h) => `<div class="swatch ${h.key === state.hairKey ? 'selected' : ''}" data-hair="${h.key}" style="background:${h.hex}" title="${h.label}"></div>`,
          ).join('')}
        </div>
      </div>
      <button class="primary-btn" id="start-btn">키우기 시작</button>
      <div class="hint">매 계절마다 활동을 선택해 딸의 능력치를 키우세요. 무리하면 병에 걸릴 수 있어요. 18살이 되면 그동안의 성장에 따라 엔딩이 결정됩니다.</div>
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
    state.name = nameInput.value.trim() || '리안'
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
  const age = ageAt(state.turn)
  const stage = stageForAge(age)
  const mood = moodForStress(state.stress)
  app.innerHTML = `
    <div class="game-wrap">
      <div class="topbar">
        <span>${age}세 · ${seasonAt(state.turn)}</span>
        <span class="money">💰 ${state.money}</span>
      </div>
      <div class="body-row">
        <div class="portrait-col">
          ${
            stage.key === 'child'
              ? `<img class="portrait-img" src="${import.meta.env.BASE_URL}portraits/child_default.webp" alt="${state.name}" />`
              : `<canvas id="portrait-canvas" width="200" height="240"></canvas>`
          }
          <div class="daughter-name">${state.name}</div>
          <div class="daughter-stage">${stage.label}</div>
          <div class="mood-tag">${mood.label}</div>
        </div>
        <div class="stats-col">
          ${STAT_KEYS.map((k) => statBar(k, state.stats[k])).join('')}
          <div class="stat-row">
            <div class="stat-label">피로</div>
            <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${state.stress}%; background:#999"></div></div>
            <div class="stat-val">${state.stress}</div>
          </div>
          ${extraBodyHtml}
        </div>
      </div>
    </div>
  `
  const canvas = document.getElementById('portrait-canvas')
  if (canvas) drawPortrait(canvas, { stageKey: stage.key, moodKey: mood.key, hairHex: state.hairHex })
}

function renderChoose() {
  const forcedSick = state.sick
  const body = forcedSick
    ? `<div class="log-box">${state.name}은(는) 몸살 기운이 있어 이번 계절은 쉬어야 할 것 같다.</div>
       <button class="continue-btn" id="go-btn">계절 보내기</button>`
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
  const stage = stageForAge(18)
  app.innerHTML = `
    <div class="ending-wrap">
      <canvas id="ending-canvas" width="220" height="264"></canvas>
      <h2 class="ending-title">${state.ending.title}</h2>
      <div class="ending-text">${state.ending.text}</div>
      <div class="ending-stats">지력 ${state.stats.int} · 체력 ${state.stats.str} · 매력 ${state.stats.charm} · 예술 ${state.stats.art} · 신앙 ${state.stats.faith} · 자금 ${state.money}</div>
      <button class="restart-btn" id="restart-btn">다시 키우기</button>
    </div>
  `
  drawPortrait(document.getElementById('ending-canvas'), { stageKey: stage.key, moodKey: 'bright', hairHex: state.hairHex })
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
