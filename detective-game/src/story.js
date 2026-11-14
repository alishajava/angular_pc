// The case file: who says what, which evidence breaks which statement.
//
// "The Contradiction Under the Umbrella" in three acts:
//   1. Investigate the scene and collect evidence.
//   2. Cross-examine 김수한 - his alibi is a lie, but the lie hides something.
//   3. Cross-examine 최도윤 - the "victim" staged the break-in.
//
// Every line is { who, mood, text }; `mood` drives the speaker's expression.

export const INTRO = [
  { who: 'hana', mood: 'worried', text: '탐정님, 큰일이에요! 새벽에 최도윤 사장님의 사무실에 도둑이 들었대요!' },
  { who: 'seojin', mood: 'determined', text: '도둑이라... 일단 현장부터 보자, 하나. 사소한 단서도 놓치면 안 돼.' },
  { who: 'park', mood: 'neutral', text: '오, 한 탐정 왔군. 신고자는 최 사장일세. 새벽 2시에 경보가 울려 와 보니 도둑이 있었고, 몸싸움 끝에 이마를 다쳤다더군.' },
  { who: 'park', mood: 'neutral', text: '그런데 금고는 멀쩡하고 서류만 헤집어 놨어. 최 사장은 돈 문제로 다퉜던 김수한을 의심하고 있네.' },
  { who: 'seojin', mood: 'determined', text: '거짓말은 반드시 어딘가에 모순을 남기는 법이지... 시작하자.' },
]

// ---- clue hotspots (positions live in main.js; this is what they yield) ----
export const CLUES = {
  desk: {
    text: '책상 위의 서류가 한쪽 방향으로 쓸려 있다. 몸싸움으로 엎어졌다기보다... 손으로 쓸어낸 듯한 모양이다.',
  },
  window: {
    text: '창문이 열려 있지만 걸쇠는 부서진 곳 없이 멀쩡하다. 안쪽에서 열린 모양이다. 여긴 3층, 외벽에는 발 디딜 곳도 없다.',
  },
  cctv: {
    text: '편의점 CCTV를 되돌려 보니, 사건 전날 밤 10시 15분 우산을 사는 남자가 찍혀 있다. 낯이 익다... 김수한이다!',
  },
  umbrella: {
    text: '문 옆의 젖은 우산. 편의점 영수증이 그대로 붙어 있다. 22:15, 결제 카드 명의는 김수한.',
  },
  keycard: {
    text: '출입 단말기 기록이다. 새벽 1시 58분, 최도윤의 출입카드로 문이 열렸다. 그런데... 그 시각 경보가 울린 기록은 없다.',
  },
  safe: {
    text: '금고는 닫혀 있지만 열쇠가 꽂혀 있다. 안에는 도난보험 증서가... 사건 3일 전에 가입했고, 보험금은 5천만 원. 수익자는 최도윤이다.',
  },
}

export const EVIDENCE = {
  cctv: { name: '편의점 CCTV 사진', icon: 'photo', desc: '사건 전날 밤 10시 15분, 현장 근처 편의점. 김수한이 우산을 사고 있다.' },
  umbrella: { name: '우산과 영수증', icon: 'receipt', desc: '현장 문 옆의 젖은 우산. 영수증은 22:15 편의점 결제, 카드 명의는 김수한이다.' },
  desk: { name: '흐트러진 서류', icon: 'papers', desc: '책상 위 서류가 한 방향으로 쓸려 있다. 싸우다 엎어진 것이 아니라 손으로 쓸어낸 모양이다.' },
  window: { name: '창문 상태', icon: 'window', desc: '걸쇠는 멀쩡하고 안쪽에서 열려 있다. 3층 외벽에는 사람이 타고 도망칠 흔적이 전혀 없다.' },
  keycard: { name: '출입 기록', icon: 'card', desc: '01:58 최도윤의 출입카드로 문이 열림. 같은 시각 경보 작동 기록은 없다.' },
  safe: { name: '도난보험 증서', icon: 'policy', desc: '금고 속 증서. 사건 3일 전 가입한 도난보험, 보험금 5천만 원, 수익자 최도윤.' },
  text: { name: '문자 메시지', icon: 'phone', desc: '김수한의 휴대폰. 사건 전날 최도윤의 문자: "오늘 밤 10시 반에 사무실로 와. 현금으로 갚아."' },
}

// Which hotspot hands over which evidence (the 7th, 'text', is earned by pressing).
export const CLUE_EVIDENCE = { desk: 'desk', window: 'window', cctv: 'cctv', umbrella: 'umbrella', keycard: 'keycard', safe: 'safe' }

// What the people at the scene say while you look around.
export const TALK = {
  minji: [
    { mood: 'smile', text: '사건 전날 밤 10시 15분쯤이었어요. 한 아저씨가 급하게 들어와서 우산을 사 갔어요. 비가 막 쏟아질 때라서요.' },
    { mood: 'cheer', text: '계산하면서 계속 시계만 쳐다보더라고요. 약속에 늦은 사람처럼요. 영수증도 그분 카드로 뽑았어요!' },
  ],
  park: [
    { mood: 'neutral', text: '신고는 새벽 2시 넘어서 들어왔네. 최 사장 말로는 경보음에 놀라 달려왔다는데, 금고는 그대로고 서류만 어질러져 있었지.' },
    { mood: 'neutral', text: '창문이 열려 있어서 범인이 그리로 도망쳤다고 보고 있네. 아직 확실한 건 없지만.' },
  ],
  hana: [
    { mood: 'cheer', text: '탐정님! 수상한 곳은 노랗게 빛나고 있어요. 하나씩 눌러서 조사해 봐요! 얻은 증거는 오른쪽 위 "증거 파일"에 모여요.' },
    { mood: 'smile', text: '증언을 들을 땐 이상한 부분에 "추궁"을 눌러 보세요. 틀린 증거를 내밀면 신뢰도가 깎이니까 신중하게요!' },
  ],
  hanaDone: { mood: 'cheer', text: '단서가 다 모였어요! 이제 목격자 김수한 씨를 심문하러 가요!' },
  choi: [
    { mood: 'worried', text: '제 사무실이... 엉망이 됐어요. 경보 소리에 놀라 달려왔는데 도둑과 마주쳤지 뭡니까. 이 상처가 그 증거예요.' },
    { mood: 'worried', text: '김수한 그 친구, 돈 문제로 저와 크게 다퉜습니다. 앙심을 품고 한 짓이 분명해요. 꼭 잡아 주세요, 탐정님.' },
  ],
  seojin: [
    { mood: 'determined', text: '...시간표를 맞춰 보면 거짓말은 어딘가 어긋나게 돼 있어. 증거를 하나도 놓치지 말자.' },
    { mood: 'determined', text: '모든 증언엔 빈틈이 있다. 문제는 그 빈틈에 무엇을 끼워 넣느냐지.' },
  ],
}

export const BEFORE_KIM = [
  { who: 'park', mood: 'neutral', text: '자, 증인 김수한을 불러왔네. 사건 전날 밤 10시 무렵 어디 있었는지 직접 들어 보게.' },
  { who: 'hana', mood: 'cheer', text: '탐정님! 이상한 부분엔 "추궁"을 눌러 보세요. 모순을 찾으면 증거를 내미는 거예요!' },
  { who: 'seojin', mood: 'determined', text: '...좋아, 증언을 들어 보지.' },
]

// ---- act 2: 김수한 ----
export const EXAM_KIM = {
  witness: 'suhan',
  title: '김수한의 증언',
  needed: 2,
  wrong: [
    { mood: 'smile', text: '(식은땀을 닦으며) 그게... 제 증언이랑 무슨 상관이 있죠?' },
    { mood: 'nervous', text: '이상한 소리 마세요. 그런 증거는 말이 안 됩니다!' },
  ],
  statements: [
    {
      text: '저는 사건 전날 밤 10시, 계속 집에서 혼자 TV를 보고 있었습니다. 아무 데도 나가지 않았어요.',
      press: [{ mood: 'nervous', text: '정말입니다. 뉴스까지 다 봤다니까요. 밤새 집 밖으로 한 발짝도 안 나갔어요.' }],
      valid: ['cctv', 'umbrella'],
      react: { mood: 'shocked', text: '으윽... 그, 그 사진은...! 우연히 닮은 사람이겠죠!' },
    },
    {
      text: '최 사장님과는 돈 문제로 다툰 적이 있지만, 그날은 연락도 한 적 없습니다.',
      press: [
        { mood: 'nervous', text: '연락이라뇨, 그날은 휴대폰도 안 봤어요! ...아니, 그게... 문자가 오긴 왔는데 읽지도 않았습니다!' },
      ],
      unlock: 'text',
      valid: [],
      react: { mood: 'nervous', text: '(그건 증거가 아니잖아...)' },
    },
    {
      text: '저는 사건이 일어난 건물 근처에는 가지도 않았습니다. 정말이에요.',
      press: [{ mood: 'nervous', text: '그 동네는 간 적도 없어요. 제 발로 갈 이유가 없잖아요?' }],
      valid: ['cctv', 'umbrella'],
      react: { mood: 'shocked', text: '그, 그건 그냥 지나가다가... 아니, 그게...!' },
    },
    {
      text: '우산요? 저는 우산 같은 건 쓰지도, 사지도 않습니다. 비 맞는 걸 좋아하거든요.',
      press: [{ mood: 'nervous', text: '정말입니다. 우산은 평생 안 사 봤어요. 비 오는 날엔 오히려 상쾌하죠.' }],
      valid: ['umbrella'],
      react: { mood: 'shocked', text: '으으윽! 영수증에... 제 카드 이름이...!' },
    },
    {
      text: '그러니까 저는 이번 사건과 전혀 관계가 없습니다. 믿어 주세요!',
      press: [{ mood: 'nervous', text: '억울해요! 저는 아무것도 안 훔쳤다고요!' }],
      valid: ['text'],
      react: { mood: 'shocked', text: '문자까지... 그건 사장님이 부른 거라고요! 그래서 간 건데...!' },
    },
  ],
}

export const KIM_CLEAR = [
  { who: 'seojin', mood: 'determined', text: '김수한 씨. 영수증은 22시 15분, 현장 근처 편의점입니다. 이제 사실대로 말하시죠.' },
  { who: 'suhan', mood: 'defeated', text: '...맞아요. 그날 밤 최 사장님이 빚을 갚으라고 사무실로 부르셨어요. 10시 반에 가서 돈을 건네고 10분 만에 나왔습니다.' },
  { who: 'suhan', mood: 'defeated', text: '그때 사장님은 멀쩡했어요. 이마에 상처 같은 건 없었다고요! 그런데 새벽에 도둑이 들었다니... 의심받을까 봐 무서워서 거짓말을 했습니다.' },
  { who: 'park', mood: 'neutral', text: '뭐라고? 그럼 새벽 2시 사건은 김수한이 아니라는 건가? 최 사장, 이게 어떻게 된 일인가?' },
  { who: 'seojin', mood: 'determined', text: '진짜 모순은 이제부터입니다. 최도윤 사장님, 증언을 한 번 더 들려주시죠.' },
  { who: 'choi', mood: 'angry', text: '나, 나를 의심하는 건가?! 좋소, 얼마든지 말해 주지! 나는 피해자요!' },
]

// ---- act 3: 최도윤 ----
export const EXAM_CHOI = {
  witness: 'choi',
  title: '최도윤의 증언',
  needed: 3,
  wrong: [
    { mood: 'angry', text: '그게 무슨 상관이오?! 엉뚱한 소리 마시오!' },
    { mood: 'smile', text: '하하, 탐정 양반. 증거를 잘못 짚으신 것 같은데?' },
  ],
  statements: [
    {
      text: '나는 어젯밤 11시에 퇴근했소. 새벽 2시쯤 경보가 울려서 놀라 사무실로 달려왔지.',
      press: [{ mood: 'angry', text: '경보가 울리자마자 달려왔소! 그러지 않았으면 도둑을 놓쳤을 거요!' }],
      valid: ['keycard'],
      react: { mood: 'shocked', text: '경보 기록이... 그, 그건 기계가 고장 났던 거요!' },
    },
    {
      text: '사무실엔 이미 도둑이 있었고, 나는 몸싸움을 하다 이마를 맞았소. 그 와중에 서류가 다 엎어졌지.',
      press: [{ mood: 'angry', text: '목숨이 위험했소! 이 상처가 증거 아니오!' }],
      valid: ['desk'],
      react: { mood: 'nervous', text: '서류가... 한 방향으로? 싸우다 보면 그럴 수도 있지 않소!' },
    },
    {
      text: '도둑은 창문으로 달아났소. 나는 쫓아갈 수가 없었지.',
      press: [{ mood: 'worried', text: '3층이긴 해도 배관을 타면 가능하오. 요즘 도둑은 대단하니까!' }],
      valid: ['window'],
      react: { mood: 'shocked', text: '걸쇠가 멀쩡하다고?! 그, 그야 도둑이 닫고 갔겠지!' },
    },
    {
      text: '솔직히 이번 일로 나는 손해만 봤소. 문도 고쳐야 하고 일도 못 하게 됐잖소.',
      press: [{ mood: 'worried', text: '손해 보상이니 뭐니 그런 건 생각도 안 해 봤소! 나는 피해자요!' }],
      valid: ['safe'],
      react: { mood: 'shocked', text: '보, 보험이라니... 그건 원래 들어 두려던 거요!' },
    },
    {
      text: '범인은 김수한이 틀림없소! 돈 문제로 앙심을 품었을 테니까!',
      press: [{ mood: 'angry', text: '그 놈이 거짓말한 건 이미 밝혀졌잖소! 그러니 범인이오!' }],
      valid: ['text'],
      react: { mood: 'shocked', text: '그 문자는 내가... 아니, 그건 빚 독촉이었을 뿐이오!' },
    },
  ],
}

export const CHOI_CLEAR = [
  { who: 'seojin', mood: 'determined', text: '최 사장님. 새벽 1시 58분, 경보도 없이 당신 카드로 들어와 서류를 쓸어내고, 안쪽에서 창문을 열어 둔 사람은 바로 당신입니다.' },
  { who: 'seojin', mood: 'determined', text: '3일 전 가입한 보험금 5천만 원. 빚쟁이 김수한 씨를 범인으로 몰면 모든 게 맞아떨어지니까요. 이마의 상처도 직접 낸 거겠죠.' },
  { who: 'choi', mood: 'defeated', text: '...사업이 망해 가고 있었소. 보험금이 필요했어. 도둑이 든 것처럼 꾸미고 김수한에게 누명을 씌우면... 모든 게 풀릴 줄 알았는데...' },
  { who: 'park', mood: 'angry', text: '최도윤. 보험 사기와 무고 혐의로 체포한다! 한 탐정, 이번엔 정말 큰 신세를 졌네.' },
  { who: 'suhan', mood: 'cheer', text: '살았다... 탐정님, 정말 감사합니다! 이제 다시는 거짓말 안 할게요!' },
  { who: 'minji', mood: 'cheer', text: '제가 본 그 아저씨 영수증이 사건을 풀어 준 거네요! 신기해요!' },
  { who: 'hana', mood: 'cheer', text: '역시 우리 탐정님! 모순을 하나하나 짚어내셨어요! 오늘도 사건 해결이에요!' },
]
