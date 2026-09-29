<script setup>
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, isPreview } from "../lib/api.js";
import { app, logout, toast, useTitle } from "../lib/state.js";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, fillTemplate } from "../../../shared/core.js";
import AppBar from "../components/AppBar.vue";
import Icon from "../components/Icon.vue";

useTitle(() => "Settings");
const router = useRouter();
const form = reactive({ shop: app.user.shop, name: app.user.name, templates: { ...app.user.templates } });
const fields = ref({});
const busy = ref(false);

const labels = {
  reminder: ["Payment reminder", "Sent when you tap Send reminder."],
  statement: ["Statement", "The customer's recent entries. {lines} is filled with them."],
};
const sampleLines = "12/09  Diye Rs 2,500 (Atta, ghee)\n18/09  Diye Rs 1,200\n25/09  Mile Rs 3,000";
const previews = computed(() =>
  Object.fromEntries(Object.keys(labels).map((k) => [k, fillTemplate(form.templates[k], { name: "Imran Butt", shop: form.shop, balance: 700, lines: sampleLines })]))
);
const tag = (ph) => "{" + ph + "}";
const boxes = {};
function insert(key, ph) {
  const el = boxes[key];
  const t = form.templates[key];
  const at = el ? el.selectionStart : t.length;
  form.templates[key] = t.slice(0, at) + tag(ph) + t.slice(el ? el.selectionEnd : t.length);
  requestAnimationFrame(() => el?.focus());
}

async function save() {
  busy.value = true;
  fields.value = {};
  try {
    app.user = (await api("PUT", "/settings", form)).user;
    toast("Settings saved");
  } catch (err) {
    fields.value = err.fields || {};
    toast(err.message);
  } finally {
    busy.value = false;
  }
}
async function signOut() {
  await logout();
  router.push("/login");
}
const resetArmed = ref(false);
async function resetDemo() {
  if (!resetArmed.value) {
    resetArmed.value = true;
    setTimeout(() => (resetArmed.value = false), 4000);
    return;
  }
  const { resetPreview } = await import("../lib/demoApi.js");
  resetPreview();
  location.reload();
}
</script>

<template>
  <AppBar title="Settings" :sub="app.user.email" back="/" />
  <main class="page">
    <form class="form-grid" novalidate @submit.prevent="save">
      <section class="card form-grid">
        <h2>Your shop</h2>
        <label class="field" :class="{ bad: fields.shop }">Shop name <small>Shown in your WhatsApp messages</small>
          <input id="s-shop" v-model="form.shop" />
          <span v-if="fields.shop" class="err">{{ fields.shop }}</span>
        </label>
        <label class="field" :class="{ bad: fields.name }">Your name
          <input id="s-name" v-model="form.name" />
          <span v-if="fields.name" class="err">{{ fields.name }}</span>
        </label>
      </section>

      <section class="card form-grid">
        <h2>WhatsApp messages</h2>
        <p class="small muted">Write them your way, in Urdu, Roman Urdu or English. Tap a tag to insert the customer's details.</p>
        <div v-for="(l, key) in labels" :key="key" class="form-grid" style="gap:8px">
          <label class="field" :class="{ bad: fields[key] }">{{ l[0] }} <small>{{ l[1] }}</small>
            <textarea :id="`s-${key}`" :ref="(el) => (boxes[key] = el)" v-model="form.templates[key]" rows="5"></textarea>
            <span v-if="fields[key]" class="err">{{ fields[key] }}</span>
          </label>
          <div class="chips">
            <button v-for="ph in key === 'statement' ? [...PLACEHOLDERS, 'lines'] : PLACEHOLDERS" :key="ph" type="button" class="chip" @click="insert(key, ph)">{{ tag(ph) }}</button>
            <button v-if="form.templates[key] !== DEFAULT_TEMPLATES[key]" type="button" class="chip" style="color:var(--muted)" @click="form.templates[key] = DEFAULT_TEMPLATES[key]">Reset</button>
          </div>
          <div class="wa-preview">{{ previews[key] }}</div>
        </div>
      </section>
      <div class="actions"><button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Saving…" : "Save settings" }}</button></div>
    </form>

    <section class="card form-grid">
      <h2>Account</h2>
      <div class="actions" style="justify-content:flex-start">
        <button type="button" class="btn btn-ghost" @click="signOut"><Icon name="logout" />Log out</button>
        <button v-if="isPreview" type="button" class="btn btn-danger" @click="resetDemo">{{ resetArmed ? "Tap again: erase and start over" : "Reset preview data" }}</button>
      </div>
    </section>
  </main>
</template>
