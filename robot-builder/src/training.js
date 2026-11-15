// Life after assembly: teach the robot to move, speak and perform chores,
// then hand it requests from its master. All drawing happens on a canvas
// "room"; the side panel is plain HTML.

const SAVE_KEY = 'maidrobot-save-v1'
const LEARNED = 60 // enough to use a skill (with some risk)
const MASTER = 100

const MOVE_SKILLS = [
  { id: 'walk', cat: '이동', name: '걷기', icon: '🚶', desc: '방 안을 방향키로 돌아다닐 수 있게 됩니다.', need: null, diff: 1, stat: null },
  { id: 'run', cat: '이동', name: '달리기', icon: '🏃', desc: 'Shift를 누르면 빠르게 달립니다.', need: 'walk', diff: 2, stat: ['speed', 14] },
  { id: 'avoid', cat: '이동', name: '장애물 넘기', icon: '🦘', desc: '쿠션 같은 장애물을 폴짝 넘어갑니다.', need: 'walk', diff: 2, stat: ['precision', 12] },
  { id: 'bow', cat: '동작', name: '공손한 절', icon: '🙇', desc: '주인님께 단정하게 인사드립니다.', need: null, diff: 1, stat: null },
  { id: 'wave', cat: '동작', name: '손 흔들기', icon: '👋', desc: '반갑게 손을 흔듭니다.', need: null, diff: 1, stat: null },
  { id: 'dance', cat: '동작', name: '춤추기', icon: '💃', desc: '흥겹게 몸을 흔들며 춤을 춥니다.', need: 'wave', diff: 2, stat: ['speed', 14] },
  { id: 'serve', cat: '가사', name: '차 따르기', icon: '🍵', desc: '쟁반에 찻잔을 올려 흘리지 않고 나릅니다.', need: 'bow', diff: 2, stat: ['precision', 12] },
  { id: 'clean', cat: '가사', name: '청소하기', icon: '🧹', desc: '빗자루로 먼지를 쓸어 담습니다.', need: 'walk', diff: 2, stat: ['chore', 12] },
  { id: 'cook', cat: '가사', name: '요리하기', icon: '🍳', desc: '불 앞에서 정성껏 요리를 합니다.', need: 'serve', diff: 3, stat: ['chore', 18] },
]

const SPEECH = [
  { id: 'greet', name: '인사말', icon: '💬', need: null, phrases: ['안녕하세요', '다녀오셨어요', '주인님'] },
  { id: 'intro', name: '자기소개', icon: '🪪', need: 'greet', phrases: ['저는 {name}입니다', '잘 부탁드립니다'] },
  { id: 'talk', name: '대화', icon: '🗨️', need: 'intro', phrases: ['오늘 날씨가 좋네요', '차 드릴까요', '무엇을 도와드릴까요'] },
  { id: 'feel', name: '감정 표현', icon: '💗', need: 'talk', phrases: ['기뻐요', '죄송해요', '사랑해요 주인님'] },
]

const REQUESTS = [
  { id: 'guest', icon: '🔔', title: '손님 맞이', desc: '현관에 온 손님을 인사로 맞이한다.', need: ['bow', 'greet'], stat: 'charm', reward: 3 },
  { id: 'guide', icon: '🧭', title: '집 안내', desc: '새 손님에게 집 안을 안내한다.', need: ['walk', 'intro'], stat: 'speed', reward: 3 },
  { id: 'tea', icon: '☕', title: '차 한 잔', desc: '손님에게 따뜻한 차를 내온다.', need: ['serve', 'talk'], stat: 'precision', reward: 4 },
  { id: 'clean', icon: '🧽', title: '거실 대청소', desc: '거실 바닥의 먼지를 말끔히 쓴다.', need: ['clean', 'avoid'], stat: 'chore', reward: 4 },
  { id: 'dinner', icon: '🍲', title: '저녁 준비', desc: '주인님을 위한 저녁상을 차린다.', need: ['cook', 'serve'], stat: 'chore', reward: 5 },
  { id: 'party', icon: '🎉', title: '파티 분위기 띄우기', desc: '춤과 말솜씨로 파티를 이끈다.', need: ['dance', 'feel', 'wave'], stat: 'charm', reward: 6 },
]

const TITLES = ['신입 메이드', '견습 메이드', '정식 메이드', '베테랑 메이드', '완벽한 메이드']
const levelOf = (trust) => Math.min(5, 1 + Math.floor(trust / 12))

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY)
  } catch {
    return false
  }
}
export function readSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

export function createTraining(api) {
  const { app, sfx, drawRobot, computeStats, STAT_KEYS, STAT_LABELS, heartPath, starPath } = api

  // ----------------------------------------------------------- state ----
  let T = null
  const rc = document.createElement('canvas') // offscreen robot sprite
  rc.width = 460
  rc.height = 560

  function fresh(name, build) {
    return {
      name,
      build,
      day: 1,
      energy: 100,
      trust: 0,
      prog: {},
      vocab: [],
      bonus: 0,
      doneRequests: 0,
      log: [],
    }
  }
  const run = {
    tab: 'teach',
    x: 320,
    y: 300,
    vx: 0,
    anim: null,
    seq: null,
    say: null,
    particles: [],
    mini: null,
    jump: 0,
    bumpCd: 0,
    idleSay: 6,
    dust: 6,
    sleeping: 0,
    toast: null,
    last: 0,
    shake: 0,
  }
  const progOf = (id) => T.prog[id] || 0
  const speechProg = (g) => {
    const known = g.phrases.filter((p) => T.vocab.includes(`${g.id}:${p}`)).length
    return Math.round((known / g.phrases.length) * 100)
  }
  const skillProg = (id) => {
    const sp = SPEECH.find((g) => g.id === id)
    return sp ? speechProg(sp) : progOf(id)
  }
  const stats = () => {
    const s = computeStats(T.build)
    for (const k of STAT_KEYS) s[k] += T.bonus
    return s
  }
  const level = () => levelOf(T.trust)
  const save = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(T))
    } catch {}
  }
  const phrase = (p) => p.replace('{name}', T.name)

  // ------------------------------------------------------------ speech ----
  function speak(text, dur = 2.6) {
    run.say = { text, t: 0, dur }
    sfx.blip(420)
  }
  function knownPhrases() {
    return T.vocab.map((v) => phrase(v.slice(v.indexOf(':') + 1)))
  }
  function sayFrom(groupId, fallback = '……') {
    const list = T.vocab.filter((v) => v.startsWith(groupId + ':')).map((v) => phrase(v.slice(v.indexOf(':') + 1)))
    speak(list.length ? list[Math.floor(Math.random() * list.length)] : fallback)
  }

  // ---------------------------------------------------------- particles ----
  function puff(x, y, kind, n = 8, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 20 + Math.random() * 60
      run.particles.push({
        x,
        y,
        vx: kind === 'z' ? 12 : Math.cos(a) * v,
        vy: kind === 'steam' || kind === 'z' ? -24 - Math.random() * 14 : Math.sin(a) * v - 30,
        life: kind === 'z' ? 1.8 : 1,
        max: kind === 'z' ? 1.8 : 1,
        kind,
        color: color || ['#ffd76a', '#ff9fb6', '#fff', '#c9a6ff', '#a8e0cb'][i % 5],
        size: 3 + Math.random() * 3,
      })
    }
  }

  // -------------------------------------------------------- animations ----
  const ANIMS = {
    bow: 1.4,
    wave: 1.8,
    dance: 3.2,
    serve: 2.6,
    clean: 3.4,
    cook: 3.4,
    oops: 1.2,
    cheer: 1.4,
  }
  function startAnim(name, dur) {
    run.anim = { name, t: 0, dur: dur || ANIMS[name] || 1.5 }
  }

  // sequences: a list of steps the robot carries out by itself
  function runSeq(steps, onDone) {
    run.seq = { steps, i: -1, t: 0, onDone, cur: null }
    nextStep()
  }
  function nextStep() {
    const q = run.seq
    q.i++
    q.t = 0
    if (q.i >= q.steps.length) {
      const cb = q.onDone
      run.seq = null
      cb && cb()
      return
    }
    q.cur = q.steps[q.i]
    const c = q.cur
    if (c.say) speak(c.say, c.dur || 2.2)
    if (c.anim) startAnim(c.anim, c.dur)
  }
  function updateSeq(dt) {
    const q = run.seq
    if (!q) return
    q.t += dt
    const c = q.cur
    if (c.to) {
      const dx = c.to.x - run.x
      const dy = c.to.y - run.y
      const d = Math.hypot(dx, dy)
      const sp = 130 * dt
      if (d <= sp) {
        run.x = c.to.x
        run.y = c.to.y
        run.walking = false
        nextStep()
      } else {
        run.x += (dx / d) * sp
        run.y += (dy / d) * sp
        run.walking = true
        run.vx = dx
      }
      return
    }
    if (q.t >= (c.dur || 1)) nextStep()
  }

  // ------------------------------------------------------------ teach ----
  const reqMet = (s) => !s.need || skillProg(s.need) >= LEARNED
  function energyCost(base) {
    return Math.max(6, Math.round(base - stats().durability / 8))
  }

  function openMini(kind, data) {
    run.mini = { kind, ...data }
    renderMini()
  }
  function closeMini() {
    run.mini = null
    renderMini()
    renderSide()
    renderHud()
    save()
  }

  const ARROWS = [
    { k: 'up', ch: '↑', keys: ['arrowup', 'w'] },
    { k: 'left', ch: '←', keys: ['arrowleft', 'a'] },
    { k: 'down', ch: '↓', keys: ['arrowdown', 's'] },
    { k: 'right', ch: '→', keys: ['arrowright', 'd'] },
  ]

  function startSkillTraining(id) {
    const s = MOVE_SKILLS.find((x) => x.id === id)
    if (!s || !reqMet(s) || run.mini || run.seq) return
    const cost = energyCost(14 + s.diff * 2)
    if (T.energy < cost) {
      toast('에너지가 부족해요. 충전(잠자기)이 필요해요.')
      sfx.bad()
      return
    }
    T.energy -= cost
    sfx.click()
    const n = 3 + s.diff
    const pattern = Array.from({ length: n }, () => ARROWS[Math.floor(Math.random() * 4)].k)
    const tolerance = Math.floor(stats().precision / 20)
    openMini('pattern', { skill: s, pattern, input: [], mistakes: 0, tolerance, phase: 'demo', demoIdx: -1, lit: null, msg: '시범을 잘 보세요…', result: null })
    let i = 0
    const tick = () => {
      const m = run.mini
      if (!m || m.skill !== s) return
      if (i < pattern.length) {
        m.lit = pattern[i]
        sfx.blip(300 + ARROWS.findIndex((a) => a.k === pattern[i]) * 90)
        m.demoIdx = i
        i++
        renderMini()
        setTimeout(() => {
          if (run.mini === m) {
            m.lit = null
            renderMini()
          }
          setTimeout(tick, 220)
        }, 480)
      } else {
        m.phase = 'input'
        m.msg = '이제 같은 순서로 눌러 보세요! (방향키 / WASD)'
        renderMini()
      }
    }
    setTimeout(tick, 500)
  }

  function patternInput(dir) {
    const m = run.mini
    if (!m || m.kind !== 'pattern' || m.phase !== 'input') return
    const want = m.pattern[m.input.length]
    const ok = dir === want
    m.input.push(dir)
    if (!ok) m.mistakes++
    sfx.blip(ok ? 520 : 180)
    if (!ok) sfx.bad()
    if (m.input.length >= m.pattern.length) finishPattern()
    else renderMini()
  }

  function finishPattern() {
    const m = run.mini
    const s = m.skill
    const n = m.pattern.length
    const correct = n - m.mistakes
    const acc = correct / n
    const pass = m.mistakes <= m.tolerance
    let gain = Math.round(6 + acc * 24 + (pass ? 10 : 0))
    if (s.stat && stats()[s.stat[0]] >= s.stat[1]) gain += 4
    const before = progOf(s.id)
    T.prog[s.id] = Math.min(MASTER, before + gain)
    m.phase = 'result'
    m.result = { pass, gain, correct, n, now: T.prog[s.id], learned: before < LEARNED && T.prog[s.id] >= LEARNED, mastered: before < MASTER && T.prog[s.id] >= MASTER }
    m.msg = pass ? '잘 따라했어요!' : '조금 아쉬웠어요. 다시 도전해 봐요.'
    pass ? sfx.good() : sfx.hurt()
    if (m.result.learned) {
      sfx.fanfare()
      puff(run.x, run.y - 120, 'spark', 22)
    }
    // the robot immediately shows off what it just practised
    const demoAnim = { bow: 'bow', wave: 'wave', dance: 'dance', serve: 'serve', clean: 'clean', cook: 'cook' }[s.id]
    if (demoAnim && pass) startAnim(demoAnim)
    renderMini()
  }

  // ----------------------------------------------------------- speech ----
  function startPhraseTraining(gid, p) {
    const g = SPEECH.find((x) => x.id === gid)
    if (!g || run.mini || run.seq) return
    if (g.need && skillProg(g.need) < 100) return
    const key = `${gid}:${p}`
    if (T.vocab.includes(key)) {
      speak(phrase(p))
      return
    }
    const cost = energyCost(9)
    if (T.energy < cost) {
      toast('에너지가 부족해요. 충전(잠자기)이 필요해요.')
      sfx.bad()
      return
    }
    T.energy -= cost
    sfx.click()
    const text = phrase(p)
    const syl = [...text].filter((c) => c !== ' ')
    const order = syl.map((c, i) => ({ c, i }))
    const shuffled = [...order].sort(() => Math.random() - 0.5)
    openMini('words', {
      group: g,
      phrase: p,
      key,
      text,
      syl,
      chips: shuffled,
      picked: [],
      mistakes: 0,
      tolerance: 1 + Math.floor(stats().precision / 25),
      phase: 'listen',
      lit: -1,
      msg: '로봇이 천천히 말합니다. 잘 들어 보세요…',
      result: null,
    })
    let i = 0
    const tick = () => {
      const m = run.mini
      if (!m || m.key !== key) return
      if (i < syl.length) {
        m.lit = i
        sfx.blip(360 + (i % 4) * 70)
        i++
        renderMini()
        setTimeout(tick, 420)
      } else {
        m.lit = -1
        m.phase = 'pick'
        m.msg = '들은 순서대로 글자를 눌러 문장을 완성하세요!'
        renderMini()
      }
    }
    setTimeout(tick, 600)
  }

  function pickChip(idx) {
    const m = run.mini
    if (!m || m.kind !== 'words' || m.phase !== 'pick') return
    const chip = m.chips.find((c) => c.i === idx)
    if (!chip || m.picked.includes(idx)) return
    const want = m.picked.length
    if (idx === want) {
      m.picked.push(idx)
      sfx.blip(520 + want * 25)
      if (m.picked.length === m.syl.length) {
        m.phase = 'result'
        const ok = m.mistakes <= m.tolerance
        m.result = { pass: true, learned: true, mistakes: m.mistakes }
        T.vocab.push(m.key)
        speak(m.text, 2.4)
        sfx.good()
        m.msg = `"${m.text}" — 새 말을 배웠어요!`
        const gp = speechProg(m.group)
        if (gp >= 100) {
          sfx.fanfare()
          puff(run.x, run.y - 120, 'spark', 22)
          m.msg += ` (${m.group.name} 완료!)`
        }
        void ok
      }
    } else {
      m.mistakes++
      sfx.bad()
      m.shakeIdx = idx
      if (m.mistakes > m.tolerance) {
        m.phase = 'result'
        m.result = { pass: false }
        m.msg = '발음이 꼬였어요… 다시 도전해 봐요.'
        sfx.hurt()
      }
    }
    renderMini()
  }

  // ----------------------------------------------------------- requests ----
  function requestMet(r) {
    return r.need.every((id) => skillProg(id) >= LEARNED)
  }
  function successChance(r) {
    const avg = r.need.reduce((a, id) => a + skillProg(id), 0) / r.need.length
    const bonus = stats()[r.stat] / 220
    return Math.max(0.15, Math.min(0.97, 0.3 + (avg / 100) * 0.5 + bonus))
  }

  function doRequest(id) {
    const r = REQUESTS.find((x) => x.id === id)
    if (!r || !requestMet(r) || run.seq || run.mini) return
    const cost = energyCost(14)
    if (T.energy < cost) {
      toast('에너지가 부족해요. 충전(잠자기)이 필요해요.')
      sfx.bad()
      return
    }
    T.energy -= cost
    sfx.click()
    const chance = successChance(r)
    const success = Math.random() < chance
    const home = { x: 320, y: 300 }
    const line = (g, fb) => {
      const list = T.vocab.filter((v) => v.startsWith(g + ':')).map((v) => phrase(v.slice(v.indexOf(':') + 1)))
      return list.length ? list[Math.floor(Math.random() * list.length)] : fb
    }
    const steps = []
    steps.push({ to: { x: 330, y: 290 } })
    if (r.id === 'guest') {
      steps.push({ say: line('greet', '……'), anim: 'bow', dur: 1.6 })
      steps.push({ say: line('greet', '……'), anim: 'wave', dur: 1.6 })
    } else if (r.id === 'guide') {
      steps.push({ say: line('intro', '……'), dur: 1.8 })
      steps.push({ to: { x: 140, y: 280 } }, { say: '이쪽이 거실이에요.', dur: 1.2 }, { to: { x: 500, y: 300 } }, { say: '그리고 이쪽이 주방이에요.', dur: 1.4 })
    } else if (r.id === 'tea') {
      steps.push({ to: { x: 470, y: 275 } }, { say: line('talk', '……'), anim: 'serve', dur: 2.6 })
    } else if (r.id === 'clean') {
      steps.push({ to: { x: 160, y: 300 } }, { anim: 'clean', dur: 3.4, say: '구석구석 쓸어 볼게요.' })
    } else if (r.id === 'dinner') {
      steps.push({ to: { x: 540, y: 270 } }, { anim: 'cook', dur: 3.4, say: '맛있게 만들게요.' }, { to: { x: 440, y: 285 } }, { anim: 'serve', dur: 2.4 })
    } else if (r.id === 'party') {
      steps.push({ say: line('feel', '……'), anim: 'wave', dur: 1.6 }, { anim: 'dance', dur: 3.2 }, { say: line('feel', '……'), anim: 'cheer', dur: 1.4 })
    }
    if (!success) {
      steps.push({ anim: 'oops', dur: 1.3, say: line('feel', '앗, 실수했어요…') })
    }
    steps.push({ to: home })
    run.busy = true
    renderSide()
    runSeq(steps, () => {
      run.busy = false
      if (success) {
        T.trust += r.reward
        T.doneRequests++
        sfx.good()
        puff(run.x, run.y - 130, 'heart', 14)
        speak(line('feel', '해냈어요!'), 2)
        toast(`의뢰 성공! 신뢰 +${r.reward}`)
      } else {
        // learning from a mistake still teaches a little
        for (const sid of r.need) {
          if (!SPEECH.find((g) => g.id === sid)) T.prog[sid] = Math.min(MASTER, progOf(sid) + 4)
        }
        sfx.bad()
        toast('실수했지만… 경험이 조금 쌓였어요 (관련 기술 +4)')
      }
      const lv = level()
      if (T.lastLevel && lv > T.lastLevel) {
        T.bonus += 1
        sfx.fanfare()
        puff(run.x, run.y - 120, 'spark', 30)
        toast(`Lv.${lv} · ${TITLES[lv - 1]} 승급! 모든 능력치 +1`)
      }
      T.lastLevel = lv
      renderSide()
      renderHud()
      save()
    })
  }

  function sleepNow() {
    if (run.seq || run.mini || run.sleeping > 0) return
    sfx.sleep()
    run.sleeping = 2.6
    T.day++
    T.energy = 100
    // overnight the memory settles: partially-learned skills creep forward
    for (const s of MOVE_SKILLS) {
      const p = progOf(s.id)
      if (p > 0 && p < MASTER) T.prog[s.id] = Math.min(MASTER, p + 3)
    }
    run.dust = 6
    setTimeout(() => {
      toast(`Day ${T.day} 아침이에요. 에너지가 가득 찼어요! (배운 것이 조금 더 또렷해졌어요)`)
      renderSide()
      renderHud()
      save()
    }, 2500)
  }

  function toast(msg) {
    run.toast = { msg, t: 0 }
    const el = document.getElementById('train-toast')
    if (el) {
      el.textContent = msg
      el.classList.add('show')
      clearTimeout(run.toastTimer)
      run.toastTimer = setTimeout(() => el.classList.remove('show'), 3200)
    }
  }

  // ---------------------------------------------------------------- DOM ----
  function bar(v, max = 100) {
    return `<span class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span>`
  }

  function renderHud() {
    const hud = document.getElementById('train-hud')
    if (!hud) return
    const lv = level()
    const next = lv >= 5 ? 60 : lv * 12
    hud.innerHTML = `
      <div class="hud-row"><span class="hud-label">⚡ 에너지</span>${bar(T.energy)}<b>${T.energy}</b></div>
      <div class="hud-row"><span class="hud-label">♥ 신뢰</span>${bar(T.trust - (lv - 1) * 12, 12)}<b>${T.trust}</b></div>`
    const top = document.getElementById('train-top')
    if (top) top.innerHTML = `<span class="step-tag">${T.name}</span><span>Lv.${lv} ${TITLES[lv - 1]} · Day ${T.day}</span>`
    void next
  }

  function renderSide() {
    const el = document.getElementById('train-side')
    if (!el) return
    const tabs = [
      ['teach', '가르치기'],
      ['speech', '말 배우기'],
      ['req', '의뢰'],
      ['info', '상태'],
    ]
    let body = ''
    if (run.tab === 'teach') {
      const cats = ['이동', '동작', '가사']
      body = cats
        .map(
          (cat) => `<div class="cat-title">${cat}</div>` +
            MOVE_SKILLS.filter((s) => s.cat === cat)
              .map((s) => {
                const p = progOf(s.id)
                const open = reqMet(s)
                const need = MOVE_SKILLS.find((x) => x.id === s.need)
                const state = p >= MASTER ? '습득 완료' : p >= LEARNED ? '사용 가능' : open ? '배우는 중' : `🔒 ${need ? need.name : ''} 필요`
                return `<button class="skill-card ${open ? '' : 'locked'} ${p >= LEARNED ? 'learned' : ''}" data-skill="${s.id}" ${open && p < MASTER ? '' : 'disabled'}>
                  <span class="sk-icon">${s.icon}</span>
                  <span class="sk-main"><b>${s.name}</b><small>${s.desc}</small>${bar(p)}</span>
                  <span class="sk-state">${state}</span>
                </button>`
              })
              .join(''),
        )
        .join('')
      body += `<div class="tip">⚡ 가르칠 때마다 에너지가 줄어요. 정밀도가 높으면 실수를 한두 번 봐주고, 내구성이 높으면 덜 지쳐요.</div>`
    } else if (run.tab === 'speech') {
      body = SPEECH.map((g) => {
        const open = !g.need || skillProg(g.need) >= 100
        const gp = speechProg(g)
        const prevName = SPEECH.find((x) => x.id === g.need)?.name
        return `<div class="cat-title">${g.icon} ${g.name} <small>${gp}%</small></div>` +
          (open
            ? g.phrases
                .map((p) => {
                  const known = T.vocab.includes(`${g.id}:${p}`)
                  return `<button class="phrase-card ${known ? 'known' : ''}" data-phrase="${g.id}|${p}">
                    <span>${known ? '✔' : '＋'}</span><b>"${phrase(p)}"</b><small>${known ? '눌러서 말해 보기' : '발음 가르치기'}</small>
                  </button>`
                })
                .join('')
            : `<div class="locked-note">🔒 ${prevName}을(를) 모두 배우면 열려요</div>`)
      }).join('')
      body += `<div class="tip">글자를 순서대로 눌러 문장을 완성하면 새로운 말을 배워요. 배운 말은 일상에서 로봇이 직접 말해요.</div>`
    } else if (run.tab === 'req') {
      body = REQUESTS.map((r) => {
        const met = requestMet(r)
        const ch = Math.round(successChance(r) * 100)
        const needNames = r.need.map((id) => (MOVE_SKILLS.find((s) => s.id === id) || SPEECH.find((g) => g.id === id)).name)
        return `<button class="req-card ${met ? '' : 'locked'}" data-req="${r.id}" ${met && !run.busy ? '' : 'disabled'}>
          <span class="sk-icon">${r.icon}</span>
          <span class="sk-main"><b>${r.title}</b><small>${r.desc}</small><small class="need">필요: ${needNames.join(' · ')}</small></span>
          <span class="sk-state">${met ? `성공 ${ch}%<br>♥ +${r.reward}` : '🔒'}</span>
        </button>`
      }).join('')
      body += `<div class="tip">필요한 기술을 어느 정도(60%) 익히면 맡길 수 있어요. 성공하면 신뢰(♥)가 쌓여 승급해요.</div>`
    } else {
      const st = stats()
      const lv = level()
      body = `
        <div class="info-title">${TITLES[lv - 1]} · Lv.${lv}</div>
        <div class="info-sub">신뢰 ${T.trust} · 완료한 의뢰 ${T.doneRequests}건 · 아는 말 ${T.vocab.length}개</div>
        <div class="info-stats">${STAT_KEYS.map((k) => `<div class="stat-mini"><span>${STAT_LABELS[k]}</span><b>${st[k]}</b>${bar(st[k], 60)}</div>`).join('')}</div>
        <div class="cat-title">익힌 기술</div>
        <div class="chips">${MOVE_SKILLS.filter((s) => progOf(s.id) >= LEARNED).map((s) => `<span class="chip-ok">${s.icon} ${s.name}</span>`).join('') || '<span class="muted">아직 없어요</span>'}</div>
        <div class="cat-title">아는 말</div>
        <div class="chips">${knownPhrases().map((p) => `<span class="chip-ok">"${p}"</span>`).join('') || '<span class="muted">아직 없어요</span>'}</div>
        <button class="nav-btn" id="train-new">새 로봇 만들기</button>`
    }
    el.innerHTML = `
      <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${run.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="tab-body">${body}</div>`
    el.querySelectorAll('.tab').forEach((b) => (b.onclick = () => {
      sfx.click()
      run.tab = b.dataset.tab
      renderSide()
    }))
    el.querySelectorAll('[data-skill]').forEach((b) => (b.onclick = () => startSkillTraining(b.dataset.skill)))
    el.querySelectorAll('[data-phrase]').forEach((b) => (b.onclick = () => {
      const [g, p] = b.dataset.phrase.split('|')
      startPhraseTraining(g, p)
    }))
    el.querySelectorAll('[data-req]').forEach((b) => (b.onclick = () => doRequest(b.dataset.req)))
    const nb = document.getElementById('train-new')
    if (nb) nb.onclick = () => api.onNew()
  }

  function renderMini() {
    const el = document.getElementById('train-mini')
    if (!el) return
    const m = run.mini
    if (!m) {
      el.className = 'mini hidden'
      el.innerHTML = ''
      return
    }
    el.className = 'mini'
    if (m.kind === 'pattern') {
      const dots = m.pattern.map((_, i) => `<i class="${i < m.input.length ? (m.input[i] === m.pattern[i] ? 'ok' : 'bad') : ''}"></i>`).join('')
      const pad = ARROWS.map((a) => `<button class="arrow ${m.lit === a.k ? 'lit' : ''}" data-dir="${a.k}" ${m.phase === 'input' ? '' : 'disabled'}>${a.ch}</button>`).join('')
      el.innerHTML = `
        <h3>${m.skill.icon} ${m.skill.name} 가르치기</h3>
        <p>${m.msg}</p>
        <div class="dots">${dots}</div>
        <div class="pad">${pad}</div>
        ${m.phase === 'result' ? `<div class="mini-result ${m.result.pass ? 'pass' : 'fail'}">숙련도 +${m.result.gain} → ${m.result.now}%${m.result.learned ? ' · 이제 쓸 수 있어요!' : ''}${m.result.mastered ? ' · 완전히 습득!' : ''}</div><button class="nav-btn primary" id="mini-close">확인</button>` : ''}`
      el.querySelectorAll('[data-dir]').forEach((b) => (b.onclick = () => patternInput(b.dataset.dir)))
    } else {
      const pickedText = m.picked.map((i) => m.syl[i]).join('')
      const slots = m.syl.map((c, i) => `<i class="slot ${i < m.picked.length ? 'filled' : ''}">${i < m.picked.length ? m.syl[i] : ''}</i>`).join('')
      const listen = m.phase === 'listen' ? `<div class="listen">${m.syl.map((c, i) => `<span class="${i <= m.lit ? 'on' : ''}">${c}</span>`).join('')}</div>` : ''
      const chips = m.phase === 'pick' || m.phase === 'result'
        ? `<div class="chips-row">${m.chips.map((c) => `<button class="chip-btn ${m.picked.includes(c.i) ? 'used' : ''} ${m.shakeIdx === c.i ? 'shake' : ''}" data-chip="${c.i}" ${m.phase === 'pick' && !m.picked.includes(c.i) ? '' : 'disabled'}>${c.c}</button>`).join('')}</div>`
        : ''
      el.innerHTML = `
        <h3>${m.group.icon} 말 배우기</h3>
        <p>${m.msg}</p>
        ${listen}
        <div class="slots">${slots}</div>
        ${chips}
        <div class="muted small">실수 ${m.mistakes}/${m.tolerance + 1}</div>
        ${m.phase === 'result' ? `<div class="mini-result ${m.result.pass ? 'pass' : 'fail'}">${pickedText ? `"${pickedText}"` : ''}</div><button class="nav-btn primary" id="mini-close">확인</button>` : `<button class="nav-btn" id="mini-cancel">그만두기</button>`}`
      el.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => pickChip(Number(b.dataset.chip))))
      m.shakeIdx = null
    }
    const close = document.getElementById('mini-close') || document.getElementById('mini-cancel')
    if (close) close.onclick = () => {
      sfx.click()
      closeMini()
    }
  }

  // ------------------------------------------------------------ stage ----
  const SW = 640
  const SH = 360
  const OBST = [
    { x: 250, y: 300, r: 24 },
    { x: 410, y: 278, r: 22 },
  ]
  const held = new Set()

  function onKey(e) {
    if (!T || !document.getElementById('stage')) return
    const k = e.key.toLowerCase()
    if (e.type === 'keyup') {
      held.delete(k)
      return
    }
    held.add(k)
    if (k.startsWith('arrow') || k === ' ') e.preventDefault()
    if (run.mini && run.mini.kind === 'pattern') {
      const a = ARROWS.find((x) => x.keys.includes(k))
      if (a) patternInput(a.k)
    }
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)

  function updateWorld(dt) {
    if (run.sleeping > 0) run.sleeping -= dt
    if (run.say) {
      run.say.t += dt
      if (run.say.t > run.say.dur) run.say = null
    }
    if (run.anim) {
      run.anim.t += dt
      const a = run.anim
      if (a.name === 'dance' && Math.random() < dt * 6) puff(run.x, run.y - 150, 'heart', 1)
      if (a.name === 'cook' && Math.random() < dt * 10) puff(run.x + 60, run.y - 70, 'steam', 1, 'rgba(255,255,255,0.7)')
      if (a.name === 'serve' && Math.random() < dt * 4) puff(run.x + 50, run.y - 118, 'steam', 1, 'rgba(255,255,255,0.7)')
      if (a.name === 'clean' && run.dust > 0 && a.t / a.dur > 0.4 && Math.random() < dt * 3) {
        run.dust = Math.max(0, run.dust - 1)
        puff(run.x, run.y - 6, 'spark', 3, '#cdbca0')
      }
      if (a.t >= a.dur) run.anim = null
    }
    if (run.sleeping > 0 && Math.random() < dt * 3) puff(run.x + 30, run.y - 140, 'z', 1, '#cfe0ff')
    for (const p of run.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind !== 'steam' && p.kind !== 'z') p.vy += 90 * dt
      p.life -= dt
    }
    run.particles = run.particles.filter((p) => p.life > 0)
    if (run.bumpCd > 0) run.bumpCd -= dt
    if (run.jump > 0) run.jump = Math.max(0, run.jump - dt)

    // idle chatter with whatever words it knows
    if (!run.seq && !run.mini && !run.say && !run.anim) {
      run.idleSay -= dt
      if (run.idleSay <= 0) {
        run.idleSay = 7 + Math.random() * 6
        if (T.vocab.length) speak(knownPhrases()[Math.floor(Math.random() * T.vocab.length)])
        else if (progOf('walk') < LEARNED && T.day === 1 && !T.intro) {
          T.intro = true
          speak(`삐빅… 기동 완료. 저는 ${T.name}. 아직 아무것도 할 줄 몰라요.`, 4)
        }
      }
    }

    updateSeq(dt)
    run.walking = run.seq ? run.walking : false

    // free movement
    if (!run.seq && !run.mini && run.sleeping <= 0 && !run.anim) {
      const dx = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0)
      const dy = (held.has('s') || held.has('arrowdown') ? 1 : 0) - (held.has('w') || held.has('arrowup') ? 1 : 0)
      if (dx || dy) {
        if (progOf('walk') < LEARNED) {
          if (!run.say) speak('아직 걷는 법을 몰라요… 먼저 가르쳐 주세요!', 2.4)
        } else {
          const running = held.has('shift') && progOf('run') >= LEARNED
          const sp = (running ? 170 : 90) * (1 + stats().speed / 200)
          const len = Math.hypot(dx, dy)
          let nx = run.x + (dx / len) * sp * dt
          let ny = run.y + (dy / len) * sp * dt
          nx = Math.max(70, Math.min(570, nx))
          ny = Math.max(250, Math.min(335, ny))
          let blocked = false
          for (const o of OBST) {
            if (Math.hypot(nx - o.x, (ny - o.y) * 1.6) < o.r + 22) {
              if (progOf('avoid') >= LEARNED) {
                if (run.jump <= 0) {
                  run.jump = 0.55
                  sfx.jump()
                }
              } else blocked = true
            }
          }
          if (blocked) {
            if (run.bumpCd <= 0) {
              run.bumpCd = 1.2
              sfx.hit()
              speak('앗! 부딪혔어요. 장애물을 넘는 법을 배워야겠어요.', 2.4)
              run.shake = 0.3
            }
          } else {
            run.x = nx
            run.y = ny
            run.walking = true
            run.vx = dx
            run.running = running
          }
        }
      }
    }
    if (run.shake > 0) run.shake -= dt
  }

  function drawRoom(ctx, t) {
    // wall
    const wg = ctx.createLinearGradient(0, 0, 0, 220)
    wg.addColorStop(0, '#f6e6e4')
    wg.addColorStop(1, '#ecd2d4')
    ctx.fillStyle = wg
    ctx.fillRect(0, 0, SW, 220)
    ctx.fillStyle = 'rgba(200,140,150,0.16)'
    for (let x = 0; x < SW; x += 32) ctx.fillRect(x, 0, 14, 190)
    // wainscot
    ctx.fillStyle = '#d9b9a4'
    ctx.fillRect(0, 190, SW, 30)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(0, 190, SW, 3)
    // window with sunbeam
    ctx.fillStyle = '#8a6a4a'
    ctx.fillRect(58, 34, 136, 116)
    ctx.fillStyle = '#bfe6ff'
    ctx.fillRect(64, 40, 124, 104)
    ctx.fillStyle = '#8ad08a'
    ctx.fillRect(64, 112, 124, 32)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath()
    ctx.arc(((t * 8) % 160) + 50, 66, 14, 0, Math.PI * 2)
    ctx.arc(((t * 8) % 160) + 66, 72, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#8a6a4a'
    ctx.fillRect(124, 40, 4, 104)
    ctx.fillRect(64, 90, 124, 4)
    ctx.fillStyle = '#d96a7a'
    ctx.fillRect(48, 28, 16, 130)
    ctx.fillRect(188, 28, 16, 130)
    const beam = ctx.createLinearGradient(126, 150, 300, 330)
    beam.addColorStop(0, 'rgba(255,240,180,0.28)')
    beam.addColorStop(1, 'rgba(255,240,180,0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(70, 150)
    ctx.lineTo(190, 150)
    ctx.lineTo(380, 340)
    ctx.lineTo(180, 340)
    ctx.fill()
    // picture + shelf
    ctx.fillStyle = '#6a4a32'
    ctx.fillRect(290, 50, 64, 50)
    ctx.fillStyle = '#ffd9e0'
    ctx.fillRect(295, 55, 54, 40)
    heartPath(ctx, 322, 76, 12)
    ctx.fillStyle = '#ff7fa0'
    ctx.fill()
    ctx.fillStyle = '#8a5e3c'
    ctx.fillRect(430, 110, 150, 8)
    for (const [x, c, h] of [[440, '#c4553f', 30], [454, '#4a7ab8', 26], [466, '#e8c860', 32], [480, '#5aa86a', 24]]) {
      ctx.fillStyle = c
      ctx.fillRect(x, 110 - h, 10, h)
    }
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(550, 98, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#8a5e3c'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(550, 98)
    ctx.lineTo(550 + Math.sin(t * 0.2) * 7, 98 - 8)
    ctx.moveTo(550, 98)
    ctx.lineTo(556, 100)
    ctx.stroke()
    // floor
    const fg = ctx.createLinearGradient(0, 220, 0, SH)
    fg.addColorStop(0, '#d9a874')
    fg.addColorStop(1, '#b8845a')
    ctx.fillStyle = fg
    ctx.fillRect(0, 220, SW, SH - 220)
    ctx.strokeStyle = 'rgba(80,40,10,0.2)'
    ctx.lineWidth = 1.4
    for (let i = 0; i < 9; i++) {
      const y = 220 + i * i * 1.9 + i * 9
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(SW, y)
      ctx.stroke()
    }
    // rug
    ctx.fillStyle = '#e8a0a8'
    ctx.beginPath()
    ctx.ellipse(320, 300, 190, 46, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff3e8'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(320, 300, 168, 38, 0, 0, Math.PI * 2)
    ctx.stroke()
    // sofa (left) and table (right)
    ctx.fillStyle = '#b06a78'
    ctx.beginPath()
    ctx.roundRect(40, 188, 150, 62, 14)
    ctx.fill()
    ctx.fillStyle = '#c47e8c'
    ctx.beginPath()
    ctx.roundRect(48, 208, 134, 38, 10)
    ctx.fill()
    ctx.fillStyle = '#8a5a3c'
    ctx.beginPath()
    ctx.roundRect(468, 238, 110, 14, 4)
    ctx.fill()
    ctx.fillRect(478, 252, 8, 28)
    ctx.fillRect(560, 252, 8, 28)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(500, 236, 13, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e8a0b0'
    ctx.fillRect(528, 226, 22, 12)
    // plant
    ctx.fillStyle = '#b85c3c'
    ctx.fillRect(596, 190, 26, 24)
    ctx.fillStyle = '#3f9a52'
    for (const [dx, a] of [[-10, -0.5], [0, 0], [10, 0.5]]) {
      ctx.save()
      ctx.translate(609 + dx * 0.5, 192)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.ellipse(0, -16, 7, 18, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    // cushions the robot must get around
    for (const o of OBST) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.beginPath()
      ctx.ellipse(o.x + 3, o.y + 8, o.r + 2, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = o === OBST[0] ? '#8ac7e8' : '#f2c97a'
      ctx.beginPath()
      ctx.roundRect(o.x - o.r, o.y - 14, o.r * 2, 22, 11)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillRect(o.x - o.r + 8, o.y - 10, o.r * 1.2, 3)
    }
    // dust bunnies waiting to be swept
    for (let i = 0; i < run.dust; i++) {
      const x = 120 + ((i * 97) % 440)
      const y = 270 + ((i * 41) % 60)
      ctx.fillStyle = 'rgba(120,110,100,0.55)'
      ctx.beginPath()
      ctx.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2)
      ctx.ellipse(x - 5, y - 2, 5, 4, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function robotFx(t) {
    const fx = { t, noStage: true, blink: (t * 0.8) % 4 > 3.82, bob: Math.sin(t * 2.2) * 1.6 }
    const a = run.anim
    const sp = run.say && run.say.t < run.say.dur - 0.2
    fx.talk = sp ? (Math.sin(t * 16) > 0 ? 1 : 0) : 0
    if (run.walking) {
      fx.bob = Math.abs(Math.sin(t * (run.running ? 14 : 9))) * -3
      fx.lean = Math.sign(run.vx || 0) * (run.running ? 0.06 : 0.03)
    }
    if (a) {
      const p = a.t / a.dur
      if (a.name === 'bow') {
        fx.squash = Math.sin(p * Math.PI) * 1.8
        fx.lean = 0
        fx.bowAmt = Math.sin(p * Math.PI)
      } else if (a.name === 'wave') {
        fx.armR = 0.72 + Math.sin(t * 11) * 0.22
      } else if (a.name === 'dance') {
        fx.lean = Math.sin(t * 6) * 0.14
        fx.bob = -Math.abs(Math.sin(t * 6)) * 12
        fx.armL = 0.5 + Math.sin(t * 6) * 0.4
        fx.armR = 0.5 - Math.sin(t * 6) * 0.4
      } else if (a.name === 'serve') {
        fx.armL = 0.3 * Math.sin(p * Math.PI)
        fx.armR = 0.3 * Math.sin(p * Math.PI)
        fx.squash = Math.sin(p * Math.PI * 2) * 0.4
      } else if (a.name === 'clean') {
        fx.lean = Math.sin(t * 7) * 0.08
        fx.armR = 0.35
      } else if (a.name === 'cook') {
        fx.armR = 0.4 + Math.sin(t * 8) * 0.15
        fx.bob = Math.sin(t * 8) * 1.4
      } else if (a.name === 'oops') {
        fx.lean = Math.sin(t * 22) * 0.1
        fx.bob = Math.sin(t * 30) * 2
      } else if (a.name === 'cheer') {
        fx.armL = 0.9
        fx.armR = 0.9
        fx.bob = -Math.abs(Math.sin(t * 9)) * 8
      }
    }
    if (run.jump > 0) fx.bob = -Math.sin((1 - run.jump / 0.55) * Math.PI) * 26
    if (run.sleeping > 0) {
      fx.blink = true
      fx.lean = 0.04
    }
    return fx
  }

  function drawProps(ctx, t, k) {
    const a = run.anim
    if (!a) return
    const p = a.t / a.dur
    if (a.name === 'clean') {
      const bx = run.x + 38 * k + Math.sin(t * 7) * 22
      ctx.strokeStyle = '#8a5a30'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(bx + 18, run.y - 86 * k)
      ctx.lineTo(bx - 6, run.y - 4)
      ctx.stroke()
      ctx.fillStyle = '#d8b878'
      ctx.beginPath()
      ctx.moveTo(bx - 18, run.y)
      ctx.lineTo(bx + 8, run.y)
      ctx.lineTo(bx + 4, run.y - 12)
      ctx.lineTo(bx - 14, run.y - 12)
      ctx.fill()
    } else if (a.name === 'cook') {
      const px = run.x + 64 * k
      ctx.fillStyle = '#555'
      ctx.beginPath()
      ctx.roundRect(px - 26, run.y - 38, 52, 18, 4)
      ctx.fill()
      ctx.fillStyle = '#9a9aa4'
      ctx.beginPath()
      ctx.roundRect(px - 20, run.y - 62, 40, 26, 6)
      ctx.fill()
      ctx.fillStyle = '#ff9a3a'
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.arc(px - 14 + i * 9, run.y - 20, 3 + Math.sin(t * 12 + i) * 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (a.name === 'serve') {
      const tx = run.x + 56 * k
      const ty = run.y - 98 * k + Math.sin(p * Math.PI) * -6
      ctx.fillStyle = '#c9d0dc'
      ctx.beginPath()
      ctx.ellipse(tx, ty + 6, 26, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.roundRect(tx - 10, ty - 12, 20, 16, 4)
      ctx.fill()
      ctx.strokeStyle = '#e8909f'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(tx + 13, ty - 4, 5, -Math.PI / 2, Math.PI / 2)
      ctx.stroke()
    }
  }

  function drawStage(canvas, now) {
    const t = now / 1000
    const S = canvas.width / SW
    const ctx = canvas.getContext('2d')
    ctx.setTransform(S, 0, 0, S, 0, 0)
    ctx.clearRect(0, 0, SW, SH)
    if (run.shake > 0) ctx.translate((Math.random() - 0.5) * 6, 0)
    drawRoom(ctx, t)

    // robot sprite scaled by depth
    const k = 0.58 + ((run.y - 250) / 85) * 0.16
    const fx = robotFx(t)
    drawRobot(rc, T.build, fx)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(run.x, run.y + 2, 62 * k, 9 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    if (run.sleeping > 0) ctx.globalAlpha = 0.85
    ctx.drawImage(rc, run.x - 115 * k, run.y - 263 * k, 230 * k, 280 * k)
    ctx.restore()
    drawProps(ctx, t, k)

    // particles
    for (const p of run.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max))
      ctx.fillStyle = p.color
      if (p.kind === 'heart') {
        heartPath(ctx, p.x, p.y, p.size * 1.3)
        ctx.fill()
      } else if (p.kind === 'spark') {
        starPath(ctx, p.x, p.y, p.size * 1.2, p.size * 0.5)
        ctx.fill()
      } else if (p.kind === 'z') {
        ctx.font = `bold ${14 + (1 - p.life / p.max) * 10}px sans-serif`
        ctx.fillText('Z', p.x, p.y)
      } else {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1.6 - p.life / p.max), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // speech bubble
    if (run.say) {
      ctx.font = 'bold 15px sans-serif'
      const maxW = 280
      const words = [...run.say.text]
      const lines = []
      let line = ''
      for (const ch of words) {
        if (ctx.measureText(line + ch).width > maxW) {
          lines.push(line)
          line = ch
        } else line += ch
      }
      if (line) lines.push(line)
      const shown = Math.min(run.say.text.length, Math.floor(run.say.t * 24))
      let count = 0
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24
      const h = lines.length * 20 + 16
      const bx = Math.max(8, Math.min(SW - w - 8, run.x - w / 2))
      const by = Math.max(8, run.y - 263 * k - h - 4)
      ctx.fillStyle = 'rgba(255,255,255,0.96)'
      ctx.strokeStyle = '#6a4a58'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(bx, by, w, h, 12)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(run.x - 7, by + h - 1)
      ctx.lineTo(run.x + 5, by + h - 1)
      ctx.lineTo(run.x - 1, by + h + 10)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#4a2a38'
      ctx.textBaseline = 'middle'
      lines.forEach((l, i) => {
        const part = [...l].slice(0, Math.max(0, shown - count)).join('')
        count += [...l].length
        ctx.fillText(part, bx + 12, by + 8 + i * 20 + 10)
      })
      ctx.textBaseline = 'alphabetic'
    }
    if (run.sleeping > 0) {
      ctx.fillStyle = `rgba(10,14,40,${Math.min(0.55, run.sleeping / 2.6)})`
      ctx.fillRect(0, 0, SW, SH)
    }
    // controls hint
    if (!run.mini) {
      ctx.font = '12px sans-serif'
      ctx.fillStyle = 'rgba(60,30,40,0.7)'
      ctx.textAlign = 'left'
      ctx.fillText(progOf('walk') >= LEARNED ? '방향키/WASD 이동' + (progOf('run') >= LEARNED ? ' · Shift 달리기' : '') : '먼저 "걷기"를 가르쳐 보세요 →', 12, 20)
    }
  }

  // ------------------------------------------------------------- entry ----
  function start(name, build, saved) {
    T = saved || fresh(name, build)
    T.build = build
    T.lastLevel = level()
    run.tab = 'teach'
    run.x = 320
    run.y = 300
    run.say = null
    run.anim = null
    run.seq = null
    run.mini = null
    run.busy = false
    run.dust = 6
    run.particles = []
    run.idleSay = 1.2
    held.clear()
    save()
  }

  function render() {
    app.classList.add('wide')
    app.innerHTML = `
      <div class="train-wrap">
        <div class="topbar" id="train-top"></div>
        <div class="train-body">
          <div class="stage-col">
            <div class="stage-box">
              <canvas id="stage" width="1280" height="720"></canvas>
              <div class="mini hidden" id="train-mini"></div>
              <div class="train-toast" id="train-toast"></div>
            </div>
            <div class="hud" id="train-hud"></div>
            <div class="stage-actions">
              <button class="nav-btn primary" id="sleep-btn">🌙 충전하기 (잠자기)</button>
              <button class="nav-btn" id="back-btn">← 결과 화면</button>
            </div>
          </div>
          <div class="side-col" id="train-side"></div>
        </div>
      </div>`
    renderHud()
    renderSide()
    document.getElementById('sleep-btn').onclick = sleepNow
    document.getElementById('back-btn').onclick = () => api.onBack()
  }

  function frame(canvas, now) {
    if (!T) return
    const dt = Math.min(0.05, (now - (run.last || now)) / 1000)
    run.last = now
    updateWorld(dt)
    drawStage(canvas, now)
  }

  function leave() {
    app.classList.remove('wide')
    run.mini = null
    run.seq = null
    run.say = null
  }

  return { start, render, frame, leave, hasSave, readSave }
}
