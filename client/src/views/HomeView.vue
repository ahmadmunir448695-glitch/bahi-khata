<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { app, useTitle } from "../lib/state.js";
import { money, dayLabel, initials } from "../lib/format.js";
import { collectList, fillTemplate, pkDay, waLink } from "../../../shared/core.js";
import AppBar from "../components/AppBar.vue";
import Icon from "../components/Icon.vue";

useTitle(() => "");
const today = pkDay();
const list = ref(null);
const stats = ref(null);
const error = ref("");
Promise.all([api("GET", "/customers"), api("GET", "/summary")])
  .then(([l, s]) => ((list.value = l), (stats.value = s)))
  .catch((err) => (error.value = err.message));

// Remember the chosen sort on this phone.
const read = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const q = ref("");
const sort = ref(read("bahi-sort", "recent"));
watch(sort, (v) => {
  try {
    localStorage.setItem("bahi-sort", v);
  } catch {}
});

const collect = computed(() => collectList(list.value || [], today));
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const digits = needle.replace(/[^\d]/g, "");
  const rows = (list.value || []).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.note.toLowerCase().includes(needle) || (digits.length >= 3 && c.phone.includes(digits))
  );
  const by = {
    recent: (a, b) => b.lastAt.localeCompare(a.lastAt),
    due: (a, b) => b.balance - a.balance,
    name: (a, b) => a.name.localeCompare(b.name),
  }[sort.value];
  return (sort.value === "due" ? rows.filter((c) => c.balance > 0) : rows).sort(by);
});

const remindLink = (c) => waLink(c.phone, fillTemplate(app.user.templates.reminder, { name: c.name, shop: app.user.shop, balance: c.balance }));
const promiseLabel = (d) => (d === today ? "Promised today" : `Promised ${dayLabel(d, today)} · late`);
</script>

<template>
  <AppBar :title="app.user.shop" :sub="`Salam, ${app.user.name.split(' ')[0]}`">
    <RouterLink to="/settings" class="icon-btn" aria-label="Settings"><Icon name="settings" /></RouterLink>
  </AppBar>

  <main class="page">
    <p v-if="error" class="err">{{ error }}</p>

    <section v-if="stats" class="totals" aria-label="Khata totals">
      <div class="total">
        <span class="total-label">You'll get</span>
        <span class="total-value amt gave">{{ money(stats.toGet) }}</span>
        <span class="total-note">from {{ stats.owing }} customer{{ stats.owing === 1 ? "" : "s" }}</span>
      </div>
      <div class="total">
        <span class="total-label">You'll give</span>
        <span class="total-value amt got">{{ money(stats.toGive) }}</span>
        <span class="total-note">advance kept by you</span>
      </div>
      <div class="today">
        <div><span>Gave today</span><b class="gave">{{ money(stats.gaveToday) }}</b></div>
        <div><span>Got today</span><b class="got">{{ money(stats.gotToday) }}</b></div>
        <div><span>Got this week</span><b class="got">{{ money(stats.gotWeek) }}</b></div>
      </div>
    </section>

    <section v-if="collect.length" class="card" aria-labelledby="collect-title" style="display:grid;gap:10px">
      <div class="card-head">
        <h2 id="collect-title"><Icon name="calendar" style="width:18px;height:18px;vertical-align:-3px;margin-right:6px" />Collect today</h2>
        <span class="amt gave">{{ money(collect.reduce((s, c) => s + c.balance, 0)) }}</span>
      </div>
      <ul class="people" style="box-shadow:none;border:1px solid var(--line)">
        <li v-for="c in collect" :key="c.id" style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border-top:1px solid var(--line)">
          <RouterLink :to="`/c/${c.id}`" class="person" style="border:0;grid-template-columns:minmax(0,1fr) auto">
            <span style="min-width:0"><span class="person-name">{{ c.name }}</span><span class="person-sub" :class="{ gave: c.promiseDate < today }" style="display:block">{{ promiseLabel(c.promiseDate) }}</span></span>
            <span class="amt gave">{{ money(c.balance) }}</span>
          </RouterLink>
          <a v-if="c.phone" class="icon-btn" style="color:var(--wa);margin-right:8px" :href="remindLink(c)" target="_blank" rel="noopener" :aria-label="`Remind ${c.name} on WhatsApp`"><Icon name="wa" /></a>
          <span v-else style="width:50px"></span>
        </li>
      </ul>
    </section>

    <div class="list-tools">
      <label class="search">
        <span class="sr-only">Search customers</span>
        <Icon name="search" />
        <input v-model="q" type="search" placeholder="Search name, phone or note" autocomplete="off" />
      </label>
      <label>
        <span class="sr-only">Sort</span>
        <select v-model="sort" class="select">
          <option value="recent">Recent</option>
          <option value="due">Most due</option>
          <option value="name">A–Z</option>
        </select>
      </label>
    </div>

    <ul v-if="shown.length" class="people">
      <li v-for="c in shown" :key="c.id">
        <RouterLink :to="`/c/${c.id}`" class="person">
          <span class="avatar" aria-hidden="true">{{ initials(c.name) }}</span>
          <span style="min-width:0">
            <span class="person-name" style="display:block">{{ c.name }}</span>
            <span class="person-sub" style="display:block">{{ c.count ? `Last: ${dayLabel(c.lastDate, today)}` : "No entries yet" }}<template v-if="c.note"> · {{ c.note }}</template></span>
          </span>
          <span class="person-bal">
            <template v-if="c.balance > 0"><span class="amt gave">{{ money(c.balance) }}</span><small class="gave">will give you</small></template>
            <template v-else-if="c.balance < 0"><span class="amt got">{{ money(c.balance) }}</span><small class="got">advance</small></template>
            <template v-else><span class="amt settled">Rs 0</span><small class="settled">settled</small></template>
          </span>
        </RouterLink>
      </li>
    </ul>
    <div v-else-if="list" class="people empty">
      <Icon name="book" />
      <strong>{{ q ? "No one matches your search" : sort === "due" ? "Nobody owes you money" : "Your khata is empty" }}</strong>
      <span v-if="!q && sort !== 'due'">Add the customers who buy on udhaar. Then note every sale and payment in two taps.</span>
    </div>
  </main>

  <RouterLink to="/c/new" class="btn btn-primary fab"><Icon name="userplus" />Add customer</RouterLink>
</template>
