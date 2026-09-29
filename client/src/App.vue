<script setup>
import { RouterView } from "vue-router";
import { app, loadSession } from "./lib/state.js";
import { isPreview } from "./lib/api.js";
</script>

<template>
  <div v-if="app.loadError" class="boot">
    <h1>Bahi couldn't load</h1>
    <p class="muted">{{ app.loadError }}</p>
    <button type="button" class="btn btn-primary" @click="(app.loadError = ''), loadSession()">Try again</button>
  </div>
  <template v-else>
    <p v-if="isPreview" class="preview-note">Preview: your khata is saved in this browser only.</p>
    <RouterView />
  </template>
  <div class="toast" :class="{ show: app.toast }" role="status" aria-live="polite">{{ app.toast }}</div>
</template>
