// 천하제패 - starting over from scratch, step by step.
// Step 1: show the player's territory as a map region.
// Step 2: when a turn starts, an advisor appears and asks what to do.

const myTerritory = {
  name: '익주',
  // irregular border points (relative to center), so it reads as a
  // province shape on a map rather than a generic colored circle
  shape: [
    [-70, -8], [-48, -52], [-8, -64], [32, -50],
    [66, -14], [52, 32], [18, 54], [-28, 48],
    [-62, 22],
  ],
}

const state = { turn: 1 }

const canvas = document.getElementById('game')
canvas.width = 400
canvas.height = 300
const ctx = canvas.getContext('2d')

function drawMapGrid() {
  ctx.strokeStyle = 'rgba(139, 115, 70, 0.25)'
  ctx.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }
  for (let y = 0; y <= canvas.height; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }
}

function territoryPath(cx, cy, shape) {
  ctx.beginPath()
  shape.forEach(([dx, dy], i) => {
    const x = cx + dx
    const y = cy + dy
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

function drawMap() {
  // parchment-style map background instead of a flat panel color
  ctx.fillStyle = '#e8dcbb'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawMapGrid()

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  territoryPath(cx, cy, myTerritory.shape)
  ctx.fillStyle = '#8aa672'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#4a3f2a'
  ctx.stroke()

  ctx.fillStyle = '#2b2317'
  ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(myTerritory.name, cx, cy - 2)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#5a4a2a'
  ctx.fillText('내 영지', cx, cy + 18)
}

function drawAdvisor(cx, baseY) {
  const OUTLINE = '#2a2017'

  // robe
  ctx.beginPath()
  ctx.moveTo(cx - 34, baseY + 10)
  ctx.lineTo(cx - 20, baseY - 40)
  ctx.lineTo(cx + 20, baseY - 40)
  ctx.lineTo(cx + 34, baseY + 10)
  ctx.closePath()
  ctx.fillStyle = '#7a2e2e'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  // collar
  ctx.beginPath()
  ctx.moveTo(cx - 10, baseY - 38)
  ctx.lineTo(cx, baseY - 24)
  ctx.lineTo(cx + 10, baseY - 38)
  ctx.strokeStyle = '#e8c87a'
  ctx.lineWidth = 2
  ctx.stroke()

  // head
  ctx.beginPath()
  ctx.arc(cx, baseY - 56, 16, 0, Math.PI * 2)
  ctx.fillStyle = '#e8b98a'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
  ctx.stroke()

  // cap
  ctx.beginPath()
  ctx.arc(cx, baseY - 62, 16, Math.PI, Math.PI * 2)
  ctx.fillStyle = '#1c1c1c'
  ctx.fill()

  // topknot
  ctx.beginPath()
  ctx.arc(cx, baseY - 74, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#1c1c1c'
  ctx.fill()

  // eyes
  ctx.fillStyle = OUTLINE
  ctx.beginPath(); ctx.arc(cx - 5, baseY - 56, 1.6, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 5, baseY - 56, 1.6, 0, Math.PI * 2); ctx.fill()

  // mouth
  ctx.beginPath()
  ctx.moveTo(cx - 5, baseY - 49)
  ctx.lineTo(cx + 5, baseY - 49)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawAdvisorScene() {
  // dim the map behind the advisor
  ctx.fillStyle = 'rgba(20, 15, 8, 0.55)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const panelX = 10
  const panelY = 190
  const panelW = canvas.width - 20
  const panelH = 100

  ctx.fillStyle = '#2b2317'
  ctx.fillRect(panelX, panelY, panelW, panelH)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#c9a85c'
  ctx.strokeRect(panelX, panelY, panelW, panelH)

  drawAdvisor(55, panelY - 6)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffe9b8'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('부관', 105, panelY + 24)

  ctx.fillStyle = '#fff'
  ctx.font = '13px sans-serif'
  ctx.fillText(`주공, ${state.turn}턴이 시작되었습니다.`, 105, panelY + 48)
  ctx.fillText('무엇을 하시겠습니까?', 105, panelY + 68)
}

function render() {
  drawMap()
  drawAdvisorScene()
}

render()
