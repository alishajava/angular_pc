// 사무실·거리·집 지도 정의: 충돌(solid), 가구/건물 그림 정보(props), 상호작용 지점(stations), 사람(npcs)
export const TILE = 32
export const COLS = 25
export const ROWS = 18
export const W = COLS * TILE
export const H = ROWS * TILE

function mk(key, name) {
  return { key, name, solid: Array.from({ length: ROWS }, () => Array(COLS).fill(0)), props: [], stations: [], npcs: [] }
}
function rect(m, c, r, w, h) {
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (y >= 0 && y < ROWS && x >= 0 && x < COLS) m.solid[y][x] = 1
}
function prop(m, kind, c, r, w = 1, h = 1, extra = {}, solid = true) {
  m.props.push({ kind, c, r, w, h, ...extra })
  if (solid) rect(m, c, r, w, h)
}
const px = (c) => c * TILE + TILE / 2
const py = (r) => r * TILE + TILE / 2
function station(m, id, c, r, label, radius = 44) {
  m.stations.push({ id, x: c * TILE, y: r * TILE, label, radius })
}

// ------------------------------------------------------------ 사무실 ----
function buildOffice() {
  const m = mk('office', '사무실')
  // 외벽: 위 2줄은 창문 벽, 좌우·아래 1줄
  rect(m, 0, 0, COLS, 2)
  rect(m, 0, 0, 1, ROWS)
  rect(m, COLS - 1, 0, 1, ROWS)
  rect(m, 0, ROWS - 1, COLS, 1)

  // 상사실 (오른쪽 위): 유리벽 + 문
  prop(m, 'glass', 17, 2, 1, 5)
  prop(m, 'glass', 18, 6, 2, 1)
  prop(m, 'glass', 22, 6, 2, 1)
  prop(m, 'bossdesk', 20, 3, 3, 1)
  prop(m, 'plant', 18, 2)
  prop(m, 'shelf', 23, 2, 1, 2)
  // 회의실 (왼쪽 위)
  prop(m, 'glass', 9, 2, 1, 5)
  prop(m, 'glass', 1, 6, 3, 1)
  prop(m, 'glass', 6, 6, 3, 1)
  prop(m, 'meetingtable', 3, 3, 4, 2)
  prop(m, 'whiteboard', 4, 1, 3, 1, {}, false)
  // 탕비실 + 복사기
  prop(m, 'counter', 11, 2, 4, 1)
  prop(m, 'copier', 15, 3, 2, 1)
  prop(m, 'plant', 10, 8)
  prop(m, 'plant', 23, 8)
  // 개방형 사무공간: 책상 2줄
  const deskCols = [3, 7, 11, 15, 19]
  for (const c of deskCols) {
    prop(m, 'deskpod', c, 9, 2, 1, { mine: false })
    prop(m, 'chair', c, 10, 1, 1, {}, false)
  }
  for (const c of [7, 11, 15, 19]) {
    prop(m, 'deskpod', c, 13, 2, 1, { mine: c === 11 })
    prop(m, 'chair', c, 14, 1, 1, {}, false)
  }
  // 자료실 (왼쪽 아래)
  prop(m, 'shelf', 1, 11, 2, 6)
  prop(m, 'readtable', 3, 15, 2, 1)
  // 동아리방 (아래 가운데) / 인사팀 (오른쪽 아래)
  prop(m, 'sofa', 8, 16, 3, 1)
  prop(m, 'pingpong', 14, 15, 3, 2)
  prop(m, 'hrdesk', 19, 16, 4, 1)
  prop(m, 'plant', 1, 8)
  prop(m, 'plant', 23, 16)
  prop(m, 'elevator', 12, 16, 2, 1, {}, false)

  station(m, 'desk', 11.5 + 0.5, 14.5, '내 자리', 46)
  station(m, 'boss', 21.5, 5.4, '상사', 50)
  station(m, 'meeting', 5, 5.6, '회의실', 50)
  station(m, 'coffee', 12.5, 4, '탕비실', 44)
  station(m, 'copier', 16, 5, '복사기', 40)
  station(m, 'library', 3.6, 14.4, '자료실', 46)
  station(m, 'club', 11, 14.9, '동아리방', 40)
  station(m, 'elevator', 13, 15.6, '엘리베이터', 40)

  // 사람들 (책상 의자 위치 = 책상 아래 칸)
  m.npcs.push(
    { id: 'seoyeon', name: '서연 (인턴)', x: px(3) + 16, y: py(10), look: 'junior_f', sit: true, facing: 'up', role: 'colleague' },
    { id: 'jihun', name: '지훈 (동기)', x: px(7) + 16, y: py(10), look: 'peer_m', sit: true, facing: 'up', role: 'colleague' },
    { id: 'park', name: '박 대리 (사수)', x: px(11) + 16, y: py(10), look: 'senior_m', sit: true, facing: 'up', role: 'colleague' },
    { id: 'choi', name: '최 과장', x: px(15) + 16, y: py(10), look: 'manager_f', sit: true, facing: 'up', role: 'colleague' },
    { id: 'lee', name: '이 주임', x: px(7) + 16, y: py(14), look: 'staff_f', sit: true, facing: 'up', role: 'colleague' },
    { id: 'oh', name: '오 부장', x: px(14), y: py(11), look: 'director_m', role: 'wander', wander: { x0: 4, x1: 21, y: 11.4 } },
    { id: 'boss', name: '한 이사 (상사)', x: px(21) + 16, y: py(2) + 18, look: 'boss_m', facing: 'down', role: 'boss' },
    { id: 'hr', name: '정 매니저 (인사팀)', x: px(20) + 16, y: py(15), look: 'hr_f', facing: 'down', role: 'hr' },
  )
  m.spawn = { x: px(12) + 16, y: 14.6 * TILE }
  return m
}

// ------------------------------------------------------------ 거리 ----
function buildStreet() {
  const m = mk('street', '회사 앞 거리')
  rect(m, 0, 0, 1, ROWS)
  rect(m, COLS - 1, 0, 1, ROWS)
  rect(m, 0, ROWS - 1, COLS, 1)
  rect(m, 0, 0, COLS, 1)
  // 위쪽 상가 (문은 4행 아래쪽, 걸어서 문 앞에 서면 이용)
  const north = [
    ['office', 1, 6, '회사', '#6a7fa8', '🏢'],
    ['headhunter', 7, 4, '헤드헌팅', '#8a6ab0', '🤝'],
    ['academy', 11, 4, '직무학원', '#4aa08a', '📚'],
    ['restaurant', 15, 4, '식당', '#d9904a', '🍚'],
    ['bar', 19, 5, '호프집', '#b0503f', '🍺'],
  ]
  for (const [id, c, w, label, color, icon] of north) {
    prop(m, 'shop', c, 1, w, 4, { label, color, icon })
    station(m, id === 'office' ? 'door_office' : id, c + w / 2, 5.3, label, 46)
  }
  // 아래쪽: 집 / 편의점 / 공원 / 여행사
  const south = [
    ['home', 1, 5, '내 집', '#8a7a62', '🏠'],
    ['convenience', 6, 4, '편의점', '#3f9a6a', '🏪'],
    ['travel', 19, 5, '여행사', '#4a8ac0', '✈️'],
  ]
  for (const [id, c, w, label, color, icon] of south) {
    prop(m, 'shop', c, 12, w, 5, { label, color, icon, south: true })
    station(m, id === 'home' ? 'door_home' : id, c + w / 2, 11.4, label, 46)
  }
  // 공원
  prop(m, 'pond', 13, 14, 4, 2, {}, true)
  for (const [c, r] of [[10, 12], [11, 15], [17, 12], [17, 15], [12, 12]]) prop(m, 'tree', c, r)
  prop(m, 'bench', 14, 12, 2, 1, {}, false)
  station(m, 'park', 15, 13.2, '공원 벤치', 40)
  prop(m, 'lamp', 5, 6, 1, 1, {}, false)
  prop(m, 'lamp', 12, 6, 1, 1, {}, false)
  prop(m, 'lamp', 20, 6, 1, 1, {}, false)
  m.npcs.push(
    { id: 'walker1', name: '행인', x: px(5), y: py(6), look: 'walker_a', role: 'walker', wander: { x0: 2, x1: 22, y: 6.2 } },
    { id: 'walker2', name: '행인', x: px(20), y: py(11), look: 'walker_b', role: 'walker', wander: { x0: 2, x1: 22, y: 11.2 } },
  )
  m.spawnFromOffice = { x: px(3), y: py(6) }
  m.spawnFromHome = { x: px(3), y: py(11) + 4 }
  return m
}

// ------------------------------------------------------------ 집 ----
function buildHome() {
  const m = mk('home', '내 집')
  rect(m, 0, 0, COLS, 3)
  rect(m, 0, 0, 1, ROWS)
  rect(m, COLS - 1, 0, 1, ROWS)
  rect(m, 0, ROWS - 1, COLS, 1)
  prop(m, 'bed', 2, 3, 3, 3)
  prop(m, 'homepc', 8, 3, 3, 1)
  prop(m, 'kitchen', 14, 3, 6, 1)
  prop(m, 'tvsofa', 5, 11, 5, 3)
  prop(m, 'plant', 22, 4)
  prop(m, 'plant', 1, 15)
  prop(m, 'rug', 13, 8, 8, 5, {}, false)
  prop(m, 'homedoor', 12, 16, 2, 1, {}, false)
  station(m, 'bed', 4.5, 6.6, '침대', 52)
  station(m, 'homepc', 9.5, 5, '컴퓨터', 46)
  station(m, 'sofa', 7.5, 10.3, '소파', 52)
  station(m, 'door_street', 13, 15.6, '현관문', 40)
  m.spawn = { x: px(5), y: py(7) }
  m.spawnFromStreet = { x: px(12) + 16, y: py(15) - 6 }
  return m
}

export const MAPS = { office: buildOffice(), street: buildStreet(), home: buildHome() }
