<script setup>
import TownScene from './components/TownScene.vue'
import TavernScene from './components/TavernScene.vue'
import RpgGame from './components/RpgGame.vue'
import { useFlowStore } from './stores/flow'

const flow = useFlowStore()
</script>

<template>
  <main>
    <h1>던전 RPG</h1>
    <TownScene v-if="flow.stage === 'town'" />
    <TavernScene v-else-if="flow.stage === 'tavern'" />
    <RpgGame v-else />
  </main>
</template>
