// 천하제패 - starting over from scratch, step by step.
// Step 1: just show the player's own territory. Nothing else yet.
// Feedback: a circle doesn't read as a territory - draw it as a map region instead.

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

function render() {
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

render()
