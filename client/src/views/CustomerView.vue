<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { app, toast, useTitle } from "../lib/state.js";
import { money, dayLabel } from "../lib/format.js";
import { fillTemplate, pkDay, prettyPhone, statementLines, waLink } from "../../../shared/core.js";
import AppBar from "../components/AppBar.vue";
import Icon from "../components/Icon.vue";
import EntrySheet from "../components/EntrySheet.vue";

const props = defineProps({ id: { type: String, required: true } });
const customer = ref(null);
const error = ref("");
const sheet = ref(null);
const today = pkDay();
useTitle(() => customer.value?.name || "Customer");

async function load() {
  try {
    customer.value = await api("GET", `/customers/${props.id}`);
  } catch (err) {
    error.value = err.message;
  }
}
load();

// Newest first on screen, like flipping to the latest page of the khata.
const rows = computed(() => [...(customer.value?.entries || [])].reverse());
const bal = computed(() => customer.value?.balance || 0);

const reminder = computed(() => fillTemplate(app.user.templates.reminder, { name: customer.value.name, shop: app.user.shop, balance: bal.value }));
const statement = computed(() =>
  fillTemplate(app.user.templates.statement, { name: customer.value.name, shop: app.user.shop, balance: bal.value, lines: statementLines(customer.value.entries) })
);
async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast("Couldn't copy on this phone");
  }
}

// Promised payment date ("kab dega?")
const promiseOpen = ref(false);
const promiseInput = ref("");
function editPromise() {
  promiseInput.value = customer.value.promiseDate || pkDay(Date.now() + 7 * 864e5);
  promiseOpen.value = true;
}
async function savePromise(value) {
  const { name, phone, note } = customer.value;
  try {
    const c = await api("PUT", `/customers/${props.id}`, { name, phone, note, promiseDate: value });
    customer.value.promiseDate = c.promiseDate;
    promiseOpen.value = false;
    toast(value ? `Payment promised for ${dayLabel(value, today)}` : "Promise date removed");
  } catch (err) {
    toast(err.message);
  }
}
const promiseText = computed(() => {
  const d = customer.value?.promiseDate;
  if (!d) return "";
  if (d < today) return `Promised ${dayLabel(d, today)}, now late`;
  if (d === today) return "Promised to pay today";
  return `Promised to pay ${dayLabel(d, today)}`;
});
</script>

<template>
  <AppBar :title="customer?.name || 'Customer'" :sub="customer?.phone ? prettyPhone(customer.phone) : customer?.note" back="/">
    <RouterLink v-if="customer" :to="`/c/${id}/edit`" class="icon-btn" aria-label="Edit customer"><Icon name="edit" /></RouterLink>
  </AppBar>

  <main class="page">
    <p v-if="error" class="err">{{ error }}</p>
    <template v-if="customer">
      <section class="balance-card" :class="bal > 0 ? 'owes' : bal < 0 ? 'advance' : 'zero'">
        <span class="balance-label" :class="bal > 0 ? 'gave' : bal < 0 ? 'got' : 'muted'">
          {{ bal > 0 ? "You'll get" : bal < 0 ? "You'll give (advance)" : "All settled" }}
        </span>
        <span class="balance-value amt" :class="bal > 0 ? 'gave' : bal < 0 ? 'got' : ''">{{ money(bal) }}</span>

        <p v-if="bal > 0" class="small" :class="customer.promiseDate && customer.promiseDate < today ? 'gave' : 'muted'" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <Icon name="calendar" style="width:16px;height:16px" />
          <template v-if="!promiseOpen">
            <span>{{ promiseText || "No payment date yet" }}</span>
            <button type="button" class="btn btn-ghost btn-sm" style="min-height:30px;padding:0 10px" @click="editPromise">{{ customer.promiseDate ? "Change" : "Set date" }}</button>
            <button v-if="customer.promiseDate" type="button" class="btn btn-ghost btn-sm" style="min-height:30px;padding:0 10px" @click="savePromise('')">Clear</button>
          </template>
          <template v-else>
            <label class="sr-only" for="promise-date">Promised date</label>
            <input id="promise-date" v-model="promiseInput" type="date" class="select" style="height:36px" />
            <button type="button" class="btn btn-primary btn-sm" style="min-height:36px" @click="savePromise(promiseInput)">Save</button>
            <button type="button" class="btn btn-ghost btn-sm" style="min-height:36px" @click="promiseOpen = false">Cancel</button>
          </template>
        </p>

        <div v-if="customer.phone" class="balance-actions">
          <a v-if="bal > 0" class="btn btn-wa btn-sm" :href="waLink(customer.phone, reminder)" target="_blank" rel="noopener"><Icon name="wa" />Send reminder</a>
          <a class="btn btn-ghost btn-sm" :href="waLink(customer.phone, statement)" target="_blank" rel="noopener"><Icon name="share" />Send statement</a>
        </div>
        <div v-else-if="customer.entries.length" class="balance-actions">
          <button type="button" class="btn btn-ghost btn-sm" @click="copy(statement, 'Statement')"><Icon name="share" />Copy statement</button>
          <RouterLink :to="`/c/${id}/edit`" class="btn btn-ghost btn-sm"><Icon name="phone" />Add phone for WhatsApp</RouterLink>
        </div>
      </section>

      <section class="khata-wrap" aria-labelledby="khata-title">
        <div class="card-head">
          <h2 id="khata-title">Khata</h2>
          <span class="small muted">{{ customer.entries.length }} entr{{ customer.entries.length === 1 ? "y" : "ies" }} · tap one to edit</span>
        </div>
        <div v-if="!rows.length" class="empty">
          <Icon name="book" />
          <strong>No entries yet</strong>
          <span>Tap <b class="gave">You gave</b> when {{ customer.name.split(" ")[0] }} takes goods on udhaar, and <b class="got">You got</b> when they pay.</span>
        </div>
        <div v-else style="overflow-x:auto">
          <table class="khata">
            <thead>
              <tr><th>Date</th><th class="n">You gave</th><th class="n">You got</th><th class="n">Balance</th></tr>
            </thead>
            <tbody>
              <tr v-for="e in rows" :key="e.id" class="row" tabindex="0" @click="sheet.open(e.type, e)" @keydown.enter="sheet.open(e.type, e)">
                <td><span class="date">{{ dayLabel(e.date, today) }}</span><div v-if="e.note" class="note">{{ e.note }}</div></td>
                <td class="n gv"><span v-if="e.type === 'gave'" class="amt gave">{{ money(e.amount) }}</span></td>
                <td class="n gt"><span v-if="e.type === 'got'" class="amt got">{{ money(e.amount) }}</span></td>
                <td class="n"><span class="amt bal">{{ e.balance < 0 ? "−" : "" }}{{ money(e.balance) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>

  <div v-if="customer" class="dock">
    <div class="dock-row">
      <button type="button" class="btn btn-gave" @click="sheet.open('gave')"><span>You gave</span><small>udhaar diya</small></button>
      <button type="button" class="btn btn-got" @click="sheet.open('got')"><span>You got</span><small>paisay mile</small></button>
    </div>
  </div>
  <EntrySheet v-if="customer" ref="sheet" :customer="customer" @saved="load" />
</template>
