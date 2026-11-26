<script setup>
import TownScene from './components/TownScene.vue'
import TavernScene from './components/TavernScene.vue'
import VillageScene from './components/VillageScene.vue'
import RpgGame from './components/RpgGame.vue'
import { useFlowStore } from './stores/flow'

const flow = useFlowStore()
</script>

<template>
  <main>
    <h1>던전 RPG</h1>
    <TownScene v-if="flow.stage === 'town'" />
    <TavernScene v-else-if="flow.stage === 'tavern'" />
    <VillageScene v-else-if="flow.stage === 'village2'" />
    <RpgGame v-else-if="flow.stage === 'forest'" :key="'forest-' + flow.forestEntry" level="forest" :entry="flow.forestEntry" />
    <RpgGame v-else />
  </main>
</template>
