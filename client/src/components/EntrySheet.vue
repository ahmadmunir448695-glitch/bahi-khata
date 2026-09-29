<script setup>
import { computed, nextTick, ref } from "vue";
import { api } from "../lib/api.js";
import { toast } from "../lib/state.js";
import { money } from "../lib/format.js";
import { evalAmount, pkDay, MAX_AMOUNT } from "../../../shared/core.js";
import Icon from "./Icon.vue";

// Bottom sheet for adding or editing one entry. The parent calls open("gave" | "got", entry?).
const props = defineProps({ customer: { type: Object, required: true } });
const emit = defineEmits(["saved"]);

const dialog = ref(null);
const amountInput = ref(null);
const type = ref("gave");
const editing = ref(null);
const amount = ref("");
const note = ref("");
const date = ref(pkDay());
const fields = ref({});
const busy = ref(false);
const armed = ref(false);
const today = pkDay();

async function open(kind, entry = null) {
  editing.value = entry;
  type.value = entry ? entry.type : kind;
  amount.value = entry ? String(entry.amount) : "";
  note.value = entry ? entry.note : "";
  date.value = entry ? entry.date : today;
  fields.value = {};
  armed.value = false;
  dialog.value.showModal();
  await nextTick();
  amountInput.value?.focus();
}
defineExpose({ open });
const close = () => dialog.value.close();

const value = computed(() => evalAmount(amount.value));
const isSum = computed(() => /[+\-*/x×]/i.test(amount.value.replace(/^\s*-/, "")) && Number.isFinite(value.value));
const valid = computed(() => Number.isInteger(value.value) && value.value >= 1 && value.value <= MAX_AMOUNT);
const after = computed(() => props.customer.balance + (valid.value ? (type.value === "gave" ? 1 : -1) * value.value : 0) - (editing.value ? (editing.value.type === "gave" ? 1 : -1) * editing.value.amount : 0));

const quick = computed(() => {
  const list = [100, 500, 1000, 5000].map((n) => ({ label: `+${n.toLocaleString("en-PK")}`, add: n }));
  if (type.value === "got" && props.customer.balance > 0 && !editing.value) list.unshift({ label: `Full ${money(props.customer.balance)}`, set: props.customer.balance });
  return list;
});
function applyQuick(qk) {
  if (qk.set) amount.value = String(qk.set);
  else amount.value = String((Number.isFinite(value.value) ? value.value : 0) + qk.add);
  amountInput.value?.focus();
}

async function save() {
  if (!valid.value) {
    fields.value = { amount: "Enter an amount, like 1500 or 450+120." };
    return;
  }
  busy.value = true;
  fields.value = {};
  try {
    const body = { type: type.value, amount: value.value, note: note.value, date: date.value };
    if (editing.value) await api("PUT", `/entries/${editing.value.id}`, body);
    else await api("POST", `/customers/${props.customer.id}/entries`, body);
    toast(`${type.value === "gave" ? "Gave" : "Got"} ${money(value.value)} ${editing.value ? "(updated)" : "saved"}`);
    close();
    emit("saved");
  } catch (err) {
    fields.value = err.fields || { amount: err.message };
  } finally {
    busy.value = false;
  }
}

// Deleting takes two taps: the first arms the button for a few seconds.
async function remove() {
  if (!armed.value) {
    armed.value = true;
    setTimeout(() => (armed.value = false), 4000);
    return;
  }
  await api("DELETE", `/entries/${editing.value.id}`);
  toast("Entry deleted");
  close();
  emit("saved");
}
const onBackdrop = (e) => e.target === dialog.value && close();
</script>

<template>
  <dialog ref="dialog" class="sheet" aria-labelledby="sheet-title" @click="onBackdrop">
    <form class="sheet-form" novalidate @submit.prevent="save">
      <div class="sheet-head">
        <h2 id="sheet-title" :class="type">
          {{ editing ? "Edit entry" : type === "gave" ? `You gave ${customer.name.split(" ")[0]}` : `You got from ${customer.name.split(" ")[0]}` }}
        </h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close"><Icon name="x" /></button>
      </div>

      <div v-if="editing" class="seg" role="tablist" aria-label="Entry type">
        <button type="button" role="tab" :aria-selected="type === 'gave'" @click="type = 'gave'">You gave (udhaar)</button>
        <button type="button" role="tab" :aria-selected="type === 'got'" @click="type = 'got'">You got (payment)</button>
      </div>

      <label class="amount-box" :class="type">
        <span>Rs</span>
        <span class="sr-only">Amount</span>
        <input id="entry-amount" ref="amountInput" v-model="amount" inputmode="decimal" autocomplete="off" placeholder="0" />
      </label>
      <p v-if="isSum" class="small"><span class="muted">Total:</span> <b class="amt">{{ money(value) }}</b></p>
      <span v-if="fields.amount" class="err">{{ fields.amount }}</span>
      <div class="quick">
        <button v-for="qk in quick" :key="qk.label" type="button" @click="applyQuick(qk)">{{ qk.label }}</button>
      </div>

      <div class="row2">
        <label class="field">Note <small>optional</small>
          <input id="entry-note" v-model="note" maxlength="120" :placeholder="type === 'gave' ? 'e.g. Atta 10kg, ghee' : 'e.g. JazzCash'" autocomplete="off" />
        </label>
        <label class="field" :class="{ bad: fields.date }">Date
          <input id="entry-date" v-model="date" type="date" :max="today" />
        </label>
      </div>
      <span v-if="fields.date" class="err">{{ fields.date }}</span>

      <p class="small muted">
        Balance after this:
        <b class="amt" :class="after > 0 ? 'gave' : after < 0 ? 'got' : ''">{{ money(after) }}</b>
        {{ after > 0 ? "they owe you" : after < 0 ? "advance" : "settled" }}
      </p>

      <div class="actions">
        <button v-if="editing" type="button" class="btn btn-danger" style="margin-right:auto" @click="remove"><Icon name="trash" />{{ armed ? "Tap again" : "Delete" }}</button>
        <button type="submit" class="btn" :class="type === 'gave' ? 'btn-gave' : 'btn-got'" :disabled="busy" style="min-width:150px">{{ busy ? "Saving…" : "Save" }}</button>
      </div>
    </form>
  </dialog>
</template>
