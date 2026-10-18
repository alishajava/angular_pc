import { defineStore } from 'pinia'
import { ref } from 'vue'

// Controls which top-level scene App.vue shows.
export const useFlowStore = defineStore('flow', () => {
  const stage = ref('town') // town | dungeon

  function goToDungeon() {
    stage.value = 'dungeon'
  }
  function goToTown() {
    stage.value = 'town'
  }

  return { stage, goToDungeon, goToTown }
})
