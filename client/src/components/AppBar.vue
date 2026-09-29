<script setup>
import { RouterLink } from "vue-router";
import Icon from "./Icon.vue";

// Top bar: a back arrow on inner pages, the logo on the home page, and slot for actions.
defineProps({ title: { type: String, required: true }, sub: { type: String, default: "" }, back: { type: String, default: "" } });
</script>

<template>
  <header class="appbar">
    <div class="appbar-row">
      <RouterLink v-if="back" :to="back" class="icon-btn back" aria-label="Back"><Icon name="back" /></RouterLink>
      <span v-else class="logo" aria-hidden="true">ب</span>
      <div class="appbar-title"><strong>{{ title }}</strong><span v-if="sub">{{ sub }}</span></div>
      <slot />
    </div>
  </header>
</template>
