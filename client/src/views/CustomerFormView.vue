<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { toast, useTitle } from "../lib/state.js";
import AppBar from "../components/AppBar.vue";
import Icon from "../components/Icon.vue";

// Add a customer, or edit one when an id is given.
const props = defineProps({ id: { type: String, default: "" } });
const router = useRouter();
useTitle(() => (props.id ? "Edit customer" : "Add customer"));
const form = reactive({ name: "", phone: "", note: "", promiseDate: "" });
const balance = ref(0);
const fields = ref({});
const busy = ref(false);
const loaded = ref(!props.id);
const armed = ref(false);

if (props.id) {
  api("GET", `/customers/${props.id}`).then((c) => {
    Object.assign(form, { name: c.name, phone: c.phone, note: c.note, promiseDate: c.promiseDate || "" });
    balance.value = c.balance;
    loaded.value = true;
  });
}

async function save() {
  busy.value = true;
  fields.value = {};
  try {
    const c = props.id ? await api("PUT", `/customers/${props.id}`, form) : await api("POST", "/customers", form);
    toast(props.id ? "Customer saved" : `${c.name} added`);
    router.replace(`/c/${c.id}`);
  } catch (err) {
    fields.value = err.fields || { name: err.message };
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!armed.value) {
    armed.value = true;
    setTimeout(() => (armed.value = false), 4000);
    return;
  }
  await api("DELETE", `/customers/${props.id}`);
  toast(`${form.name} deleted`);
  router.replace("/");
}
</script>

<template>
  <AppBar :title="props.id ? 'Edit customer' : 'Add customer'" :back="props.id ? `/c/${props.id}` : '/'" />
  <main class="page">
    <form v-if="loaded" class="card form-grid" novalidate @submit.prevent="save">
      <label class="field" :class="{ bad: fields.name }">Name
        <input id="c-name" v-model="form.name" autocomplete="off" placeholder="e.g. Imran Butt" />
        <span v-if="fields.name" class="err">{{ fields.name }}</span>
      </label>
      <label class="field" :class="{ bad: fields.phone }">Mobile number <small>Optional. Needed for WhatsApp reminders.</small>
        <input id="c-phone" v-model="form.phone" type="tel" inputmode="tel" autocomplete="off" placeholder="0300 1234567" />
        <span v-if="fields.phone" class="err">{{ fields.phone }}</span>
      </label>
      <label class="field">Note <small>Optional. Helps you find them, e.g. "Gali 4" or "Rickshaw driver".</small>
        <input id="c-note" v-model="form.note" maxlength="120" autocomplete="off" />
      </label>
      <div class="actions">
        <button v-if="props.id" type="button" class="btn btn-danger" style="margin-right:auto" @click="remove">
          <Icon name="trash" />{{ armed ? (balance ? "Tap again: deletes the whole khata" : "Tap again to delete") : "Delete" }}
        </button>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Saving…" : props.id ? "Save" : "Add customer" }}</button>
      </div>
    </form>
  </main>
</template>
