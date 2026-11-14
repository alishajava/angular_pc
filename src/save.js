// Minimal localStorage-backed save for town progress (coins, shop/quest state).
// Dungeon runs are always transient and restart fresh, by design.
const SAVE_KEY = 'dungeon-rpg-save'

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY)
  } catch {
    return false
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
