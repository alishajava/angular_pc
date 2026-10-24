import { defineStore } from 'pinia'
import { ref } from 'vue'

// Controls which top-level scene App.vue shows.
export const useFlowStore = defineStore('flow', () => {
  const stage = ref('town') // town | dungeon | tavern

  function goToDungeon() {
    stage.value = 'dungeon'
  }
  function goToTown() {
    stage.value = 'town'
  }
  function goToTavern() {
    stage.value = 'tavern'
  }

  return { stage, goToDungeon, goToTown, goToTavern }
})
