<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import TownScene from './components/TownScene.vue'
import TavernScene from './components/TavernScene.vue'
import VillageScene from './components/VillageScene.vue'
import RpgGame from './components/RpgGame.vue'
import { useFlowStore } from './stores/flow'
import { useTownStore } from './stores/town'

const flow = useFlowStore()
const town = useTownStore()
const toast = ref('')
let toastTimer = 0
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2200)
}
function doSave() {
  showToast(town.saveProgress() ? '💾 진행 상태를 저장했습니다.' : '저장에 실패했습니다.')
}
function doLoad() {
  // 던전 안에서는 불러오지 않는다 (던전 진행은 저장하지 않는 설계)
  showToast(town.loadProgress() ? '📂 저장된 진행 상태를 불러왔습니다.' : '저장된 데이터가 없습니다.')
}
// 장소를 옮길 때마다 자동 저장 (직접 저장/불러오기를 한 뒤부터)
watch(() => flow.stage, () => town.autosave())
const timer = setInterval(() => { if (flow.stage !== 'dungeon') town.autosave() }, 30000)
const onHide = () => { if (document.visibilityState === 'hidden' && flow.stage !== 'dungeon') town.autosave() }
document.addEventListener('visibilitychange', onHide)
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onHide) })
</script>

<template>
  <main>
    <h1>던전 RPG</h1>
    <TownScene v-if="flow.stage === 'town'" />
    <TavernScene v-else-if="flow.stage === 'tavern'" />
    <VillageScene v-else-if="flow.stage === 'village2'" />
    <RpgGame v-else-if="flow.stage === 'forest'" :key="'forest-' + flow.forestEntry" level="forest" :entry="flow.forestEntry" />
    <RpgGame v-else />
    <div v-if="town.phase !== 'intro' || flow.stage !== 'town'" class="save-bar">
      <button type="button" @click="doSave">💾 저장 (P)</button>
      <button type="button" @click="doLoad">📂 불러오기 (L)</button>
      <span class="save-note">장소를 옮길 때 자동 저장 · 던전 진행은 저장되지 않아요</span>
      <span v-if="toast" class="save-toast">{{ toast }}</span>
    </div>
  </main>
</template>

<style scoped>
.save-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.6rem; font-size: 0.8rem; }
.save-bar button { font: inherit; padding: 0.35rem 0.8rem; border-radius: 8px; border: 1px solid #4fd1ff; background: #15203a; color: #e6f3ff; cursor: pointer; }
.save-bar button:hover { background: #1f3358; }
.save-note { opacity: 0.6; }
.save-toast { color: #ffe066; font-weight: bold; }
</style>
