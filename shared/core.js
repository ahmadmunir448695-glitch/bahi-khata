// Ledger rules shared by the Node server and the in-browser preview:
// customers, entries, balances, the daily summary and WhatsApp reminders.
//
// Every entry is one of two kinds, as on a paper khata:
//   "gave": you gave goods or cash on credit, so the customer owes you more (+)
//   "got":  you received a payment, so the customer owes you less (−)
// A positive balance means the customer owes you; negative means you owe them (advance).

export const ENTRY_TYPES = ["gave", "got"];
export const MAX_AMOUNT = 10_000_000;

export const DEFAULT_TEMPLATES = {
  reminder:
    "Assalam o Alaikum {name}! 🙏\n{shop} ke khate mein aap ke Rs {balance} baqi hain.\nMeharbani kar ke jald ada kar dein. Shukriya!",
  statement: "{shop}: {name} ka hisaab\n\n{lines}\n\nBaqi: Rs {balance}",
};
export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);
export const PLACEHOLDERS = ["name", "shop", "balance"];

// Pakistan has no daylight saving: local time is always UTC+5.
const PK_OFFSET_MS = 5 * 3600 * 1000;
export const pkDay = (date = new Date()) => new Date(new Date(date).getTime() + PK_OFFSET_MS).toISOString().slice(0, 10);

// Accepts 0300 1234567, +92 300-1234567, 923001234567 or 3001234567; returns "03001234567" or "".
export function normalizePhone(input) {
  let d = String(input ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? "0" + d : "";
}
export const prettyPhone = (p) => (p && p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4)}` : p || "");
export const waLink = (phone, text) => `https://wa.me/92${String(phone).slice(1)}?text=${encodeURIComponent(text)}`;
export const rupees = (n) => Math.abs(n).toLocaleString("en-PK");

const str = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const int = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : NaN);

// ---------- Checks: each returns { value } or { errors: { field: message } } ----------
export function checkCustomer(body = {}) {
  const errors = {};
  const name = str(body.name);
  const rawPhone = str(body.phone);
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  const note = str(body.note);
  // The day the customer promised to pay ("Friday ko de dunga"); empty when there is none.
  const promiseDate = typeof body.promiseDate === "string" ? body.promiseDate : "";
  if (name.length < 2 || name.length > 60) errors.name = "Enter the customer's name.";
  if (rawPhone && !phone) errors.phone = "Enter a Pakistani mobile number, like 0300 1234567, or leave it empty.";
  if (note.length > 120) errors.note = "Keep the note under 120 characters.";
  if (promiseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(promiseDate) || Number.isNaN(Date.parse(promiseDate)) || promiseDate < "2000-01-01" || promiseDate > "2100-01-01"))
    errors.promiseDate = "Pick a valid date.";
  if (Object.keys(errors).length) return { errors };
  return { value: { name, phone, note, promiseDate } };
}

export function checkEntry(body = {}, today = pkDay()) {
  const errors = {};
  const type = body.type;
  const amount = int(body.amount);
  const note = str(body.note);
  const date = typeof body.date === "string" && body.date ? body.date : today;
  if (!ENTRY_TYPES.includes(type)) errors.type = "Choose You gave or You got.";
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) errors.amount = "Enter an amount in whole rupees.";
  if (note.length > 120) errors.note = "Keep the note under 120 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date > today || date < "2000-01-01") errors.date = "Pick a date up to today.";
  if (Object.keys(errors).length) return { errors };
  return { value: { type, amount, note, date } };
}

export function checkSettings(body = {}) {
  const errors = {};
  const shop = str(body.shop);
  const name = str(body.name);
  if (shop.length < 2 || shop.length > 40) errors.shop = "Enter your shop name.";
  if (name.length < 2 || name.length > 60) errors.name = "Enter your name.";
  const templates = {};
  for (const k of TEMPLATE_KEYS) {
    const t = typeof body.templates?.[k] === "string" ? body.templates[k].trim() : "";
    if (t.length < 5 || t.length > 600) errors[k] = "Write a message (5 to 600 characters).";
    templates[k] = t;
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { shop, name, templates } };
}

// ---------- Balances ----------
const signed = (e) => (e.type === "gave" ? e.amount : -e.amount);
const byDate = (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

// Entries oldest first, each with the balance after it.
export function ledger(entries) {
  let running = 0;
  return [...entries].sort(byDate).map((e) => ({ ...e, balance: (running += signed(e)) }));
}

// Customers with their balance and latest activity, highest amount owed first.
export function customerSummaries(customers, entries) {
  const byCustomer = new Map(customers.map((c) => [c.id, { balance: 0, count: 0, lastDate: "", lastAt: c.createdAt }]));
  for (const e of entries) {
    const s = byCustomer.get(e.customerId);
    if (!s) continue;
    s.balance += signed(e);
    s.count++;
    if (e.date > s.lastDate) s.lastDate = e.date;
    if (e.createdAt > s.lastAt) s.lastAt = e.createdAt;
  }
  return customers.map((c) => ({ ...c, ...byCustomer.get(c.id) })).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

// Customers who owe money and promised to pay by today (or earlier), most overdue first.
export function collectList(list, today = pkDay()) {
  return list
    .filter((c) => c.balance > 0 && c.promiseDate && c.promiseDate <= today)
    .sort((a, b) => a.promiseDate.localeCompare(b.promiseDate) || b.balance - a.balance);
}

export function summary(customers, entries, now = new Date()) {
  const list = customerSummaries(customers, entries);
  const today = pkDay(now);
  const collect = collectList(list, today);
  const weekAgo = pkDay(new Date(now).getTime() - 6 * 864e5);
  const sum = (filter) => entries.filter(filter).reduce((s, e) => s + e.amount, 0);
  return {
    toGet: list.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0),
    toGive: list.filter((c) => c.balance < 0).reduce((s, c) => s - c.balance, 0),
    customers: list.length,
    owing: list.filter((c) => c.balance > 0).length,
    gaveToday: sum((e) => e.type === "gave" && e.date === today),
    gotToday: sum((e) => e.type === "got" && e.date === today),
    gotWeek: sum((e) => e.type === "got" && e.date >= weekAgo && e.date <= today),
    collectCount: collect.length,
    collectAmount: collect.reduce((s, c) => s + c.balance, 0),
  };
}

// Shop-counter maths in the amount box: "450+120+85" or "3*250". Returns a whole number of rupees or NaN.
export function evalAmount(input) {
  const text = String(input ?? "").replace(/[,\s]/g, "").replace(/[x×]/gi, "*");
  if (!text || !/^[\d+\-*/.]+$/.test(text)) return NaN;
  const tokens = text.match(/\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens || tokens.join("") !== text) return NaN;
  // Numbers and operators must alternate, starting and ending with a number.
  for (let i = 0; i < tokens.length; i++) if (/\d/.test(tokens[i]) !== (i % 2 === 0)) return NaN;
  if (tokens.length % 2 === 0) return NaN;
  // Multiply and divide first, then add and subtract.
  const terms = [Number(tokens[0])];
  const ops = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (op === "*") terms[terms.length - 1] *= n;
    else if (op === "/") terms[terms.length - 1] = n === 0 ? NaN : terms[terms.length - 1] / n;
    else (ops.push(op), terms.push(n));
  }
  let total = terms[0];
  ops.forEach((op, i) => (total = op === "+" ? total + terms[i + 1] : total - terms[i + 1]));
  return Number.isFinite(total) ? Math.round(total) : NaN;
}

// ---------- WhatsApp ----------
export function fillTemplate(template, { name, shop, balance, lines = "" }) {
  const values = { name: name.split(" ")[0], shop, balance: rupees(balance), lines };
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

// Last few entries as plain text lines for the statement message.
export function statementLines(entries, limit = 8) {
  const rows = ledger(entries).slice(-limit);
  return rows
    .map((e) => `${e.date.slice(8, 10)}/${e.date.slice(5, 7)}  ${e.type === "gave" ? "Diye" : "Mile"} Rs ${rupees(e.amount)}${e.note ? ` (${e.note})` : ""}`)
    .join("\n");
}
