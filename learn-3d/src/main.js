// three.js는 npm으로 설치된 라이브러리라서, 2D 버전의 <script> CDN 링크
// 대신 이렇게 import 한 줄로 가져온다. (package.json의 "dependencies"에
// three가 적혀 있고, `npm install`로 실제 코드가 node_modules에 받아져 있다.)
import * as THREE from 'three'

// ----------------------------------------------------------------
// 1. 3D의 "캔버스" 3종 세트: Scene / Camera / Renderer
// ----------------------------------------------------------------
// 2D에서는 canvas + ctx 두 개만 있으면 됐지만, 3D에서는 세 가지가 필요하다.

// Scene: 3D 물체들을 담는 "무대". 여기에 물체를 추가(add)한다.
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x8fbc5a) // 2D 버전과 같은 잔디색 배경

// Camera: "누구의 눈으로 이 장면을 볼 것인가". 2D에는 없던 개념이다.
// PerspectiveCamera(시야각, 가로세로비율, 가까운한계, 먼한계)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
// 카메라를 캐릭터보다 위, 뒤쪽에 놓고 원점(0,0,0)을 내려다보게 한다.
camera.position.set(0, 8, 9)
camera.lookAt(0, 0, 0)

// Renderer: Scene을 Camera 시점으로 "실제 화면에 그려주는" 엔진.
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.shadowMap.enabled = true // 그림자를 쓰려면 렌더러에서도 켜 줘야 한다
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement) // 여기서 <canvas>가 만들어져 붙는다

// ----------------------------------------------------------------
// 2. 조명
// ----------------------------------------------------------------
// 3D는 빛이 없으면 물체가 새까맣게 보인다(2D는 이런 개념 자체가 없었다).
// 가장 간단하게: 사방에서 은은하게 비추는 빛 하나만 추가한다.
scene.add(new THREE.AmbientLight(0xffffff, 0.7))
// 방향성 조명(해): 한 방향에서 평행하게 비춰서, 물체의 밝은 면/어두운 면이 생긴다.
// castShadow = true 로 하면 이 빛이 그림자도 만들어 준다.
const sun = new THREE.DirectionalLight(0xfff2cf, 1.6)
sun.position.set(6, 12, 5)
sun.castShadow = true
sun.shadow.camera.left = -12
sun.shadow.camera.right = 12
sun.shadow.camera.top = 12
sun.shadow.camera.bottom = -12
scene.add(sun)
// 멀리 있는 것은 배경색으로 흐려지게 하는 안개. 한 줄이면 깊이감이 확 산다.
scene.fog = new THREE.Fog(0x8fbc5a, 14, 34)

// ----------------------------------------------------------------
// 3. 맵(바닥)
// ----------------------------------------------------------------
// PlaneGeometry(가로, 세로)로 평평한 사각형을 만들고, 바닥처럼 눕힌다.
const groundSize = 16
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x79a84f }),
)
ground.rotation.x = -Math.PI / 2 // 기본은 수직으로 서 있어서, 90도 돌려 눕힌다
ground.receiveShadow = true // 바닥은 그림자를 "받는" 쪽
// 2D 때의 격자처럼, 바닥에 눈금을 깔아 움직임이 잘 보이게 한다.
const grid = new THREE.GridHelper(groundSize, groundSize, 0x4f7a32, 0x6c9645)
grid.position.y = 0.01
scene.add(grid)
scene.add(ground)

// ----------------------------------------------------------------
// 4. 캐릭터
// ----------------------------------------------------------------
// 2D에서 사각형을 그렸던 것처럼, 3D에서는 정육면체(Box)를 하나 띄운다.
// Mesh = Geometry(형태) + Material(색/재질)의 조합.
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x2b6cff }),
)
player.position.set(0, 0.5, 0) // y=0.5: 박스 높이의 절반만큼 띄워서 바닥 위에 올려놓는다
player.castShadow = true // 캐릭터는 그림자를 "드리우는" 쪽
scene.add(player)

// 캐릭터의 "이동 속도"도 2D 버전과 똑같은 하나의 숫자다.
const speed = 4 // 초당 이동 거리

// ----------------------------------------------------------------
// 5. 키보드 입력 (2D 버전과 완전히 동일한 코드)
// ----------------------------------------------------------------
const keysDown = new Set()
window.addEventListener('keydown', (e) => keysDown.add(e.key.toLowerCase()))
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()))

// ----------------------------------------------------------------
// 6. update() — 이동 로직
// ----------------------------------------------------------------
// 2D에서는 x, y 두 축으로 움직였다. 3D는 보통 세 축(x, y, z)이 있지만,
// 바닥 위를 걷는 캐릭터는 y(높이)는 그대로 두고 x/z(바닥 평면)만 움직인다.
// 즉 "위에서 내려다본 이동"은 2D 때의 x,y 로직이 x,z 로 이름만 바뀐 것과 같다.
//
// dt(delta time, 지난 프레임과의 시간차)를 곱해주는 이유: 컴퓨터 성능에
// 따라 1초에 몇 번 그려지는지(프레임 수)가 달라도 "초당 이동 거리"가
// 항상 같아지게 하기 위해서다. 2D 버전은 매 프레임 고정 픽셀만큼
// 움직여서 더 단순했지만, 3D에서는 이 방식이 더 흔하다.
let lastTime = performance.now()
function update() {
  const now = performance.now()
  const dt = (now - lastTime) / 1000 // 밀리초 -> 초
  lastTime = now

  let dx = 0
  let dz = 0
  if (keysDown.has('w') || keysDown.has('arrowup')) dz -= 1
  if (keysDown.has('s') || keysDown.has('arrowdown')) dz += 1
  if (keysDown.has('a') || keysDown.has('arrowleft')) dx -= 1
  if (keysDown.has('d') || keysDown.has('arrowright')) dx += 1
  player.position.x += dx * speed * dt
  player.position.z += dz * speed * dt
  // 움직이는 방향으로 박스를 부드럽게 돌려 주면 "걷는" 느낌이 난다.
  if (dx !== 0 || dz !== 0) {
    const target = Math.atan2(dx, dz)
    let diff = target - player.rotation.y
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    player.rotation.y += diff * Math.min(1, dt * 12)
    // 통통 튀는 걸음: 사인 함수로 높이를 살짝 흔든다.
    player.position.y = 0.5 + Math.abs(Math.sin(now / 90)) * 0.18
  } else {
    player.position.y = 0.5
  }

  // 2D의 Math.max/min clamp와 똑같은 방식으로, 맵 밖으로 못 나가게 가둔다.
  const half = groundSize / 2 - 0.5
  player.position.x = Math.max(-half, Math.min(half, player.position.x))
  player.position.z = Math.max(-half, Math.min(half, player.position.z))

  // 카메라가 항상 캐릭터를 따라가도록, 캐릭터 기준 상대 위치를 유지한다.
  camera.position.set(player.position.x, 8, player.position.z + 9)
  camera.lookAt(player.position.x, 0, player.position.z)
}

// ----------------------------------------------------------------
// 7. 게임 루프
// ----------------------------------------------------------------
// 2D의 draw() 자리를 renderer.render(scene, camera) 한 줄이 대신한다.
// "이 장면(scene)을 이 카메라(camera) 시점으로 그려라"는 뜻.
function loop() {
  update()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
loop()

// 화면 왼쪽 위에 조작 안내를 띄운다 (3D 화면 위에 평범한 HTML 글자를 겹쳐 놓았을 뿐이다).
const hint = document.createElement('div')
hint.textContent = 'WASD / 방향키로 움직이세요'
hint.style.cssText = 'position:fixed;left:16px;top:14px;color:#fff;font:14px sans-serif;text-shadow:0 1px 3px #0008;pointer-events:none'
document.body.appendChild(hint)

// 창 크기가 바뀌면 카메라 비율과 렌더러 크기도 맞춰준다 (3D만의 번거로움).
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
