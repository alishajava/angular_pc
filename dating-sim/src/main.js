const MAX_DAYS = 6
const GOOD_ENDING_THRESHOLD = 7

const CHARACTERS = [
  {
    id: 'daeun',
    name: '다은',
    color: '#ffb3c6',
    desc: '사진 동아리 신입생, 밝고 솔직함',
    stages: [
      {
        text: '다은이 전시회 벽 앞에서 선배를 기다리고 있었다.',
        speaker: '다은',
        line: '선배! 이번 동아리 전시회에 제 사진 걸었어요. 어때요, 솔직하게 말해주세요. 저 입시 때보다 늘었죠?',
        choices: [
          { label: '사진 속 빛 쓰는 방식이 진짜 늘었어', delta: 3, response: '와... 선배가 그런 말 해주니까 진짜 뿌듯하다. 역시 보는 눈이 있으시네요!' },
          { label: '어... 잘 찍은 것 같아 (대충)', delta: 1, response: '음... 선배 지금 자세히 안 본 거죠? 그래도 봐준 건 고마워요.' },
        ],
      },
      {
        text: '다은이 동아리방 앞에서 비를 맞으며 서 있었다. 우산을 깜빡한 모양이다.',
        speaker: '다은',
        line: '아 맞다, 우산... 오늘 날씨 좋다고 안 가져왔는데. 선배는 우산 있어요?',
        choices: [
          { label: '우산 같이 쓰고 가자, 집 방향 비슷하잖아', delta: 3, response: '진짜요? 좋아요! ...근데 왜 귀까지 빨개요, 선배?' },
          { label: '우산 빌려줄게, 난 비 맞고 뛰어갈게', delta: 1, response: '어... 고마워요. 근데 선배가 감기 걸릴까봐 좀 걸려요.' },
        ],
      },
      {
        text: '축제 마지막 날 밤, 다은이 자기 작품 앞에서 괜히 사진들을 다시 정리하고 있었다.',
        speaker: '다은',
        line: '선배, 사실... 이 사진들 중에 선배 몰래 찍은 거 하나 있어요. 보여드릴까, 말까 고민 중인데.',
        choices: [
          { label: '보여줘, 궁금해. 그리고... 나도 할 말 있어', delta: 3, response: '(사진을 내민다) 이거예요. 선배가 웃는 거 처음 제대로 찍혔더라고요. ...선배 할 말이 뭔데요? 설마.' },
          { label: '나중에 천천히 보여줘도 돼', delta: 1, response: '...선배는 가끔 너무 신사적이에요. 그게 장점이자 단점.' },
        ],
      },
    ],
    goodEnding:
      '다은: (사진을 내밀며) 저... 사실 이 사진, 선배한테 주고 싶어서 인화해놨어요.\n그리고 하나만 물어볼게요. 저랑, 계속 이렇게 옆에 있어 줄 수 있어요?\n\n축제의 마지막 불빛 아래, 두 사람은 한참을 그렇게 마주 보고 있었다.\n\n— ENDING: 다은과의 봄날 —',
  },
  {
    id: 'seojun',
    name: '서준',
    color: '#9ec5ff',
    desc: '책 좋아하는 무뚝뚝 선배, 알고 보면 다정함',
    stages: [
      {
        text: '서준이 책 한 권을 책상 위로 슥 밀어주었다.',
        speaker: '서준',
        line: '이거 읽어봐. 너 요즘 하는 고민이랑 비슷한 얘기 나와. ...뭐, 읽든 말든 상관없고.',
        choices: [
          { label: '지금 바로 몇 장 같이 읽어볼래?', delta: 3, response: '...생각보다 끈질기네. 좋아, 여기 이 구절부터 보자.' },
          { label: '고마워, 나중에 꼭 읽을게 (가방에 넣는다)', delta: 1, response: '말은 저래 놓고 안 읽는 애들 많더라. ...너는 아니었으면 좋겠다.' },
        ],
      },
      {
        text: '서준이 노트북 앞에서 머리를 감싸 쥐고 있었다. 화면엔 빨간 글씨가 가득했다.',
        speaker: '서준',
        line: '마감이 내일인데 하나도 안 풀려. ...너 이런 거 잘하지 않았나?',
        choices: [
          { label: '같이 풀어보자, 오늘 밤 새워도 상관없어', delta: 3, response: '(살짝 웃으며) 진짜 옆에 있어주네. ...고맙다는 말, 잘 안 하는데 지금은 해야겠다.' },
          { label: '에너지 드링크 사다 줄게, 힘내', delta: 1, response: '...고맙다. 근데 이걸로 해결될 문제는 아닌데.' },
        ],
      },
      {
        text: '축제 준비로 지친 서준이 옥상에서 바람을 쐬고 있었다.',
        speaker: '서준',
        line: '가끔 이렇게 혼자 올라와서 생각해. 나중에 뭐가 되고 싶은지, 사실 아직도 잘 모르겠어. ...너한테 이런 말 하는 거 처음이다.',
        choices: [
          { label: '나도 사실 두려운 거 많아. 같이 얘기해보자', delta: 3, response: '(한참을 보다가) ...너랑 있으면 이상하게 센치해지네. 싫지 않은데, 그게 더 당황스럽다.' },
          { label: '그런 고민은 다 하는 거야, 너무 걱정 마', delta: 1, response: '...그래, 네 말이 맞을지도. 근데 가끔은 그냥 들어주기만 해도 되는데.' },
        ],
      },
    ],
    goodEnding:
      '서준: ...나 원래 이런 말 잘 못 하는데. 그냥, 네가 있어서 이번 학기가 안 외로웠어. 그게 다야.\n...근데 혹시, 다음 학기도 이 옥상에 같이 올라올 생각 있어?\n\n서준은 평소답지 않게 귀까지 빨개진 채로 밤하늘만 보고 있었다.\n\n— ENDING: 서준과의 조용한 밤 —',
  },
  {
    id: 'ria',
    name: '리아',
    color: '#ffd76a',
    desc: '밴드 보컬, 자신감 넘치고 에너지 폭발',
    stages: [
      {
        text: '리아가 방금 만든 곡을 자신 있게 불러주었다. 끝나자마자 눈을 반짝이며 쳐다본다.',
        speaker: '리아',
        line: '어때?! 이번 곡, 내가 진짜 밤새서 만든 거야. 솔직한 피드백 원해. 진짜 솔직하게!',
        choices: [
          { label: '2절 전개가 좀 급해, 거기만 다듬으면 완벽해', delta: 3, response: '오... 그거 나도 걸렸던 부분인데! 역시 믿고 물어보길 잘했다. 땡큐!' },
          { label: '완전 좋아, 역시 리아밖에 없다!', delta: 1, response: '음... 그거 칭찬 맞아? 왠지 대충 들은 느낌인데.' },
        ],
      },
      {
        text: '공연 10분 전, 평소와 달리 리아가 계속 핸드폰 화면만 만지작거리고 있었다.',
        speaker: '리아',
        line: '나 사실 좀 떨려... 이런 티 안 내려고 했는데. 티 많이 나?',
        choices: [
          { label: '지난달보다 훨씬 안정됐어, 그때의 리아는 이제 없어', delta: 3, response: '...그걸 기억하고 있었어? 와, 진짜 든든하다. 좋아, 무대 올라가서 다 보여줄게.' },
          { label: '괜찮아, 넌 항상 잘하잖아', delta: 1, response: '그렇긴 한데... 오늘은 왠지 좀 더 구체적인 말이 듣고 싶었어.' },
        ],
      },
      {
        text: '공연을 성공적으로 마친 리아가 땀범벅이 된 채로 환하게 웃으며 다가왔다.',
        speaker: '리아',
        line: '봤어?! 마지막 소절에서 관객들 완전 떼창했잖아! ...근데 사실 그 순간에 너 보고 불렀던 거 알아?',
        choices: [
          { label: '알아, 그 순간 완전 시선 고정이었어. 나도 할 말 있어', delta: 3, response: '(잠깐 말을 잃더니 씩 웃는다) 역시 눈치는 있네. 좋아, 말해봐. 나 지금 심장 엄청 뛰는 중이니까 빨리.' },
          { label: '멀리서 봤는데 진짜 멋있더라, 축하해', delta: 1, response: '고마워... 근데 선배는 가끔 좀 멀리서만 보는 느낌이야.' },
        ],
      },
    ],
    goodEnding:
      '리아: 나 사실 이 노래, 처음부터 끝까지 너 생각하면서 썼어. 가사 다시 읽어봐.\n...이제 알겠지? 그러니까 대답은, 지금 당장 듣고 싶은데.\n\n관객이 떠난 텅 빈 무대 위, 리아는 여전히 기타를 멘 채로 손을 내밀었다.\n\n— ENDING: 리아와의 앙코르 —',
  },
]

const FRIEND_ENDING =
  '여섯 번째 날, 세 사람이 동시에 동아리방으로 몰려와 선배를 둘러쌌다.\n\n다은: "선배는 저한테도 잘해주고."\n서준: "나한테도 그랬지."\n리아: "나한테도!"\n\n셋이 동시에 선배를 쳐다보며 한숨을 쉰다.\n\n다은: "그러니까 결론은..."\n셋이 입을 모아: "너무 다정해서 아무도 못 고르는 타입이라는 거지."\n\n선배는 그저 웃을 수밖에 없었다. 동아리의 평화는 지켜졌다.\n\n— ENDING: 모두의 좋은 선배(?) —'

function makeInitialState() {
  return {
    screen: 'title',
    day: 1,
    chars: CHARACTERS.map((c) => ({ ...c, affection: 0, stage: 0 })),
    activeCharId: null,
    pendingResponse: null,
  }
}

let state = makeInitialState()

function heartsFor(affection) {
  const filled = Math.max(0, Math.min(5, Math.round((affection / 9) * 5)))
  return '♥'.repeat(filled) + '♡'.repeat(5 - filled)
}

function fillerScene() {
  return {
    text: '오늘은 별다른 이벤트 없이 매점에서 같이 떡볶이를 먹으며 시간을 보냈다. 소소하지만 편안한 시간.',
    line: '그냥 이렇게 같이 있는 시간도 괜찮다.',
    choices: [
      { label: '이야기에 적극적으로 맞장구치기', delta: 2, response: '...덕분에 오늘도 즐거웠어.' },
      { label: '가볍게 안부만 묻기', delta: 1, response: '그래, 또 보자.' },
    ],
  }
}

function render() {
  const app = document.getElementById('app')
  if (state.screen === 'title') {
    app.innerHTML = `
      <div class="card">
        <h1>동아리 연애 시뮬레이션</h1>
        <div class="subtitle">6일간의 선택이 엔딩을 결정합니다</div>
        <button class="primary-btn" id="start-btn">시작하기</button>
        <div class="hint">매일 한 사람을 골라 시간을 보내세요. 선택에 따라 호감도가 달라집니다.</div>
      </div>
    `
    document.getElementById('start-btn').onclick = () => {
      state = makeInitialState()
      state.screen = 'day'
      render()
    }
    return
  }

  if (state.screen === 'day') {
    const cards = state.chars
      .map(
        (c) => `
        <button class="char-card" data-id="${c.id}">
          <div class="avatar" style="background:${c.color}">${c.name[0]}</div>
          <div class="char-info">
            <div class="char-name">${c.name}</div>
            <div class="char-desc">${c.desc}</div>
            <div class="hearts">${heartsFor(c.affection)}</div>
          </div>
        </button>`,
      )
      .join('')
    app.innerHTML = `
      <div class="card">
        <div id="day-counter">Day ${state.day} / ${MAX_DAYS}</div>
        ${cards}
        <div class="hint">오늘 함께 시간을 보낼 사람을 선택하세요.</div>
      </div>
    `
    app.querySelectorAll('.char-card').forEach((btn) => {
      btn.onclick = () => {
        state.activeCharId = btn.dataset.id
        state.screen = 'scene'
        render()
      }
    })
    return
  }

  if (state.screen === 'scene') {
    const ch = state.chars.find((c) => c.id === state.activeCharId)
    const scene = ch.stage < ch.stages.length ? ch.stages[ch.stage] : fillerScene()

    if (state.pendingResponse) {
      app.innerHTML = `
        <div class="card">
          <div class="dialogue-box">
            <div class="speaker-row">
              <div class="avatar" style="background:${ch.color}">${ch.name[0]}</div>
              <div class="speaker-name">${ch.name}</div>
            </div>
            <div class="dialogue-text">${state.pendingResponse}</div>
            <button class="primary-btn" id="continue-btn">다음 날로</button>
          </div>
        </div>
      `
      document.getElementById('continue-btn').onclick = () => {
        state.pendingResponse = null
        state.activeCharId = null
        state.day += 1
        state.screen = state.day > MAX_DAYS ? 'ending' : 'day'
        render()
      }
      return
    }

    const choiceButtons = scene.choices
      .map((c, i) => `<button class="choice-btn" data-i="${i}">${c.label}</button>`)
      .join('')
    app.innerHTML = `
      <div class="card">
        <div class="dialogue-box">
          <div class="speaker-row">
            <div class="avatar" style="background:${ch.color}">${ch.name[0]}</div>
            <div class="speaker-name">${ch.name}</div>
          </div>
          <div class="dialogue-text">${scene.text}\n\n"${scene.line}"</div>
          ${choiceButtons}
        </div>
      </div>
    `
    app.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.onclick = () => {
        const choice = scene.choices[Number(btn.dataset.i)]
        ch.affection += choice.delta
        if (ch.stage < ch.stages.length) ch.stage += 1
        state.pendingResponse = choice.response
        render()
      }
    })
    return
  }

  if (state.screen === 'ending') {
    const best = state.chars.reduce((a, b) => (b.affection > a.affection ? b : a))
    const ending = best.affection >= GOOD_ENDING_THRESHOLD ? best.goodEnding : FRIEND_ENDING
    app.innerHTML = `
      <div class="card">
        <h1>엔딩</h1>
        <div class="dialogue-text">${ending}</div>
        <button class="primary-btn" id="restart-btn">다시 시작하기</button>
      </div>
    `
    document.getElementById('restart-btn').onclick = () => {
      state = makeInitialState()
      render()
    }
    return
  }
}

render()
