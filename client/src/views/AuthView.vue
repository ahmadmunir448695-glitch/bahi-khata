<script setup>
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, register, useTitle } from "../lib/state.js";
import { isPreview } from "../lib/api.js";

useTitle(() => "Log in");
const route = useRoute();
const router = useRouter();
const mode = ref(route.query.mode === "signup" ? "signup" : "login");
const form = reactive({ name: "", shop: "", email: isPreview ? "demo@bahi.pk" : "", password: isPreview ? "demo1234" : "" });
const fields = ref({});
const error = ref("");
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  fields.value = {};
  try {
    if (mode.value === "login") await login(form.email, form.password);
    else await register({ ...form });
    router.replace(typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/");
  } catch (err) {
    error.value = err.message;
    fields.value = err.fields || {};
  } finally {
    busy.value = false;
  }
}
function switchTo(m) {
  mode.value = m;
  error.value = "";
  fields.value = {};
  if (m === "signup" && isPreview) Object.assign(form, { email: "", password: "" });
}
</script>

<template>
  <div class="auth">
    <section class="auth-pitch">
      <div style="display:flex;align-items:center;gap:10px"><span class="logo">ب</span><strong style="font-size:20px">Bahi</strong></div>
      <h1>Your khata, <em>on your phone.</em></h1>
      <p>Write down every udhaar and every payment in two taps. See who owes you what, and send a polite WhatsApp reminder when it's time to collect.</p>
      <div class="mini-khata" aria-hidden="true">
        <div><span>12 Sep</span><span>Atta, ghee</span><span class="g">+2,500</span></div>
        <div><span>18 Sep</span><span>Cheeni, doodh</span><span class="g">+1,200</span></div>
        <div><span>25 Sep</span><span>Payment</span><span class="r">−3,000</span></div>
        <div class="t"><span></span><span>Baqi</span><span class="g">Rs 700</span></div>
      </div>
    </section>

    <section class="auth-panel">
      <form class="auth-card" novalidate @submit.prevent="submit">
        <div class="seg" role="tablist" aria-label="Log in or sign up">
          <button type="button" role="tab" :aria-selected="mode === 'login'" @click="switchTo('login')">Log in</button>
          <button type="button" role="tab" :aria-selected="mode === 'signup'" @click="switchTo('signup')">Create account</button>
        </div>
        <p v-if="isPreview && mode === 'login'" class="demo-note">Demo shop: <b>demo@bahi.pk</b> / <b>demo1234</b> (already filled in).</p>

        <template v-if="mode === 'signup'">
          <label class="field" :class="{ bad: fields.name }">Your name
            <input v-model="form.name" autocomplete="name" required />
            <span v-if="fields.name" class="err">{{ fields.name }}</span>
          </label>
          <label class="field" :class="{ bad: fields.shop }">Shop name <small>e.g. Aslam General Store</small>
            <input v-model="form.shop" autocomplete="organization" required />
            <span v-if="fields.shop" class="err">{{ fields.shop }}</span>
          </label>
        </template>
        <label class="field" :class="{ bad: fields.email }">Email
          <input v-model="form.email" type="email" autocomplete="email" inputmode="email" required />
          <span v-if="fields.email" class="err">{{ fields.email }}</span>
        </label>
        <label class="field" :class="{ bad: fields.password }">Password <small v-if="mode === 'signup'">At least 8 characters</small>
          <input v-model="form.password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required />
          <span v-if="fields.password" class="err">{{ fields.password }}</span>
        </label>
        <p v-if="error && !Object.keys(fields).length" class="err" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block" :disabled="busy">
          {{ busy ? "Please wait…" : mode === "login" ? "Log in" : "Open my khata" }}
        </button>
      </form>
    </section>
  </div>
</template>
