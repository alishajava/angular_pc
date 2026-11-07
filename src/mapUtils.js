// Shared tile-grid helpers used by both the town and dungeon scenes.

export function parseGrid(mapRows) {
  return mapRows.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)))
}

export function canMoveTo(grid, cols, rows, tile, x, y, half) {
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ]
  for (const [cx, cy] of corners) {
    const col = Math.floor(cx / tile)
    const row = Math.floor(cy / tile)
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false
    if (grid[row][col] === 1) return false
  }
  return true
}

export function tileCenter(col, row, tile) {
  return { x: col * tile + tile / 2, y: row * tile + tile / 2 }
}
