import { defineStore } from 'pinia'
import { ref } from 'vue'

// Controls which top-level scene App.vue shows.
export const useFlowStore = defineStore('flow', () => {
  const stage = ref('town') // town | dungeon | tavern | forest | village2
  const forestEntry = ref('west') // 숲길에 어느 쪽에서 들어왔나 (west: 처음 마을, east: 단풍마을)
  const village2Entry = ref('west')

  function goToDungeon() {
    stage.value = 'dungeon'
  }
  function goToTown() {
    stage.value = 'town'
  }
  function goToTavern() {
    stage.value = 'tavern'
  }
  function goToForest(entry = 'west') {
    forestEntry.value = entry
    stage.value = 'forest'
  }
  function goToVillage2(entry = 'west') {
    village2Entry.value = entry
    stage.value = 'village2'
  }

  return { stage, forestEntry, village2Entry, goToDungeon, goToTown, goToTavern, goToForest, goToVillage2 }
})
