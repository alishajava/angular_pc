// 천하제패 - starting over from scratch, step by step.
// Step 1: just show the player's own territory. Nothing else yet.

const myTerritory = { name: '익주' }

const canvas = document.getElementById('game')
canvas.width = 400
canvas.height = 300
const ctx = canvas.getContext('2d')

function render() {
  ctx.fillStyle = '#2b2317'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  ctx.beginPath()
  ctx.arc(cx, cy, 40, 0, Math.PI * 2)
  ctx.fillStyle = '#2e9a5a'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#fff'
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(myTerritory.name, cx, cy - 56)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#ffe066'
  ctx.fillText('내 영지', cx, cy + 60)
}

render()
