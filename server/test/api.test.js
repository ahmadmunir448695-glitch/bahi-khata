import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { fillTemplate, statementLines, pkDay, evalAmount, DEFAULT_TEMPLATES } from "../../shared/core.js";

let server, base, dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "bahi-test-"));
  const app = await createApp({ dataDir, secret: "test-secret" });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await rm(dataDir, { recursive: true, force: true });
});

// Tiny client that keeps its own session cookie, like one browser.
function client() {
  let cookie = "";
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json() };
  };
}

let seq = 0;
async function shop() {
  const api = client();
  const r = await api("POST", "/auth/register", { name: "Aslam", shop: "Aslam General Store", email: `aslam${++seq}@example.com`, password: "password123" });
  assert.equal(r.status, 201);
  return api;
}
const today = pkDay();
const daysAgo = (n) => pkDay(Date.now() - n * 864e5);

test("the khata needs a login", async () => {
  const api = client();
  assert.equal((await api("GET", "/customers")).status, 401);
  assert.equal((await api("POST", "/customers", { name: "Ali" })).status, 401);
});

test("register, log out, log in, and login blocking", async () => {
  const api = client();
  const reg = await api("POST", "/auth/register", { name: "Rashid", shop: "Rashid Kiryana", email: "Rashid@Example.com", password: "password123" });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.passwordHash, undefined);
  assert.ok(reg.body.user.templates.reminder);
  assert.equal((await api("POST", "/auth/register", { name: "R", shop: "Rashid Kiryana", email: "rashid@example.com", password: "password123" })).status, 400);

  await api("POST", "/auth/logout");
  assert.equal((await api("GET", "/auth/me")).body.user, null);
  assert.equal((await api("POST", "/auth/login", { email: "rashid@example.com", password: "password123" })).status, 200);

  const other = client();
  for (let i = 0; i < 5; i++) await other("POST", "/auth/login", { email: "rashid@example.com", password: "wrong-one" });
  assert.equal((await other("POST", "/auth/login", { email: "rashid@example.com", password: "password123" })).status, 429);
});

test("customers are checked; phone is optional but must be valid", async () => {
  const api = await shop();
  const bad = await api("POST", "/customers", { name: "A", phone: "12345" });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.name);
  assert.ok(bad.body.fields.phone);

  const noPhone = await api("POST", "/customers", { name: "Chacha Rafiq" });
  assert.equal(noPhone.status, 201);
  assert.equal(noPhone.body.phone, "");
  const withPhone = await api("POST", "/customers", { name: "Nadia Bibi", phone: "+92 333 1112223" });
  assert.equal(withPhone.body.phone, "03331112223");
  assert.equal(withPhone.body.balance, 0);
});

test("entries move the balance and the ledger keeps a running total", async () => {
  const api = await shop();
  const c = (await api("POST", "/customers", { name: "Imran Butt", phone: "0300 5556667" })).body;
  await api("POST", `/customers/${c.id}/entries`, { type: "gave", amount: 2500, note: "Atta, ghee", date: daysAgo(3) });
  await api("POST", `/customers/${c.id}/entries`, { type: "gave", amount: "1,200", date: daysAgo(1) });
  await api("POST", `/customers/${c.id}/entries`, { type: "got", amount: 3000, date: today });

  const detail = (await api("GET", `/customers/${c.id}`)).body;
  assert.equal(detail.balance, 700);
  assert.deepEqual(detail.entries.map((e) => e.balance), [2500, 3700, 700]);
  assert.equal(detail.entries[0].note, "Atta, ghee");

  // An entry added later with an earlier date slots into the right place.
  await api("POST", `/customers/${c.id}/entries`, { type: "got", amount: 500, date: daysAgo(2) });
  const again = (await api("GET", `/customers/${c.id}`)).body;
  assert.deepEqual(again.entries.map((e) => e.balance), [2500, 2000, 3200, 200]);

  // Paying more than owed makes it an advance (negative balance).
  await api("POST", `/customers/${c.id}/entries`, { type: "got", amount: 1000 });
  assert.equal((await api("GET", `/customers/${c.id}`)).body.balance, -800);
});

test("entries are checked", async () => {
  const api = await shop();
  const c = (await api("POST", "/customers", { name: "Sadia" })).body;
  for (const body of [
    { type: "lent", amount: 100 },
    { type: "gave", amount: 0 },
    { type: "gave", amount: 99.5 },
    { type: "gave", amount: 100, date: "2999-01-01" },
    { type: "gave", amount: 100, date: "yesterday" },
  ]) {
    assert.equal((await api("POST", `/customers/${c.id}/entries`, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api("POST", "/customers/nope/entries", { type: "gave", amount: 100 })).status, 404);
});

test("edit and delete entries and customers", async () => {
  const api = await shop();
  const c = (await api("POST", "/customers", { name: "Kashif" })).body;
  const e = (await api("POST", `/customers/${c.id}/entries`, { type: "gave", amount: 800 })).body;
  assert.equal((await api("PUT", `/entries/${e.id}`, { type: "gave", amount: 850, note: "Sugar 5kg" })).body.amount, 850);
  assert.equal((await api("GET", `/customers/${c.id}`)).body.balance, 850);
  assert.equal((await api("DELETE", `/entries/${e.id}`)).status, 200);
  assert.equal((await api("GET", `/customers/${c.id}`)).body.balance, 0);

  assert.equal((await api("PUT", `/customers/${c.id}`, { name: "Kashif Ali", phone: "03001234567" })).body.name, "Kashif Ali");
  await api("POST", `/customers/${c.id}/entries`, { type: "gave", amount: 100 });
  assert.equal((await api("DELETE", `/customers/${c.id}`)).status, 200);
  assert.equal((await api("GET", `/customers/${c.id}`)).status, 404);
  assert.equal((await api("GET", "/summary")).body.toGet, 0, "their entries went too");
});

test("shops only see and change their own khata", async () => {
  const a = await shop();
  const b = await shop();
  const c = (await a("POST", "/customers", { name: "Private Customer" })).body;
  const e = (await a("POST", `/customers/${c.id}/entries`, { type: "gave", amount: 5000 })).body;

  assert.equal((await b("GET", "/customers")).body.length, 0);
  assert.equal((await b("GET", `/customers/${c.id}`)).status, 404);
  assert.equal((await b("PUT", `/customers/${c.id}`, { name: "Hacked" })).status, 404);
  assert.equal((await b("DELETE", `/customers/${c.id}`)).status, 404);
  assert.equal((await b("POST", `/customers/${c.id}/entries`, { type: "got", amount: 5000 })).status, 404);
  assert.equal((await b("PUT", `/entries/${e.id}`, { type: "got", amount: 1 })).status, 404);
  assert.equal((await b("DELETE", `/entries/${e.id}`)).status, 404);
  assert.equal((await b("GET", "/summary")).body.toGet, 0);

  assert.equal((await a("GET", `/customers/${c.id}`)).body.balance, 5000);
});

test("summary adds up what you'll get, what you owe, and today's money", async () => {
  const api = await shop();
  const owes = (await api("POST", "/customers", { name: "Owes Money" })).body;
  const advance = (await api("POST", "/customers", { name: "Paid Advance" })).body;
  await api("POST", `/customers/${owes.id}/entries`, { type: "gave", amount: 4000, date: daysAgo(10) });
  await api("POST", `/customers/${owes.id}/entries`, { type: "got", amount: 1500 });
  await api("POST", `/customers/${advance.id}/entries`, { type: "got", amount: 600, date: daysAgo(2) });
  await api("POST", `/customers/${advance.id}/entries`, { type: "gave", amount: 200 });

  const s = (await api("GET", "/summary")).body;
  assert.equal(s.toGet, 2500);
  assert.equal(s.toGive, 400);
  assert.equal(s.owing, 1);
  assert.equal(s.gaveToday, 200);
  assert.equal(s.gotToday, 1500);
  assert.equal(s.gotWeek, 2100);

  const list = (await api("GET", "/customers")).body;
  assert.deepEqual(list.map((c) => c.name), ["Owes Money", "Paid Advance"], "highest amount owed first");
});

test("settings and WhatsApp messages", async () => {
  const api = await shop();
  assert.equal((await api("PUT", "/settings", { shop: "", name: "Aslam", templates: {} })).status, 400);
  const r = await api("PUT", "/settings", { shop: "Aslam Store", name: "Aslam", templates: { ...DEFAULT_TEMPLATES, reminder: "{name}, Rs {balance} baqi – {shop}" } });
  assert.equal(r.status, 200);
  assert.equal(fillTemplate(r.body.user.templates.reminder, { name: "Imran Butt", shop: "Aslam Store", balance: 12500 }), "Imran, Rs 12,500 baqi – Aslam Store");

  const lines = statementLines([
    { type: "gave", amount: 2500, note: "Atta", date: "2026-09-01", createdAt: "a" },
    { type: "got", amount: 1000, note: "", date: "2026-09-05", createdAt: "b" },
  ]);
  assert.equal(lines, "01/09  Diye Rs 2,500 (Atta)\n05/09  Mile Rs 1,000");
});

test("promised payment dates put customers on the collect-today list", async () => {
  const api = await shop();
  const late = (await api("POST", "/customers", { name: "Late Payer", promiseDate: daysAgo(3) })).body;
  const dueToday = (await api("POST", "/customers", { name: "Due Today", promiseDate: today })).body;
  const later = (await api("POST", "/customers", { name: "Next Week", promiseDate: pkDay(Date.now() + 5 * 864e5) })).body;
  const paidUp = (await api("POST", "/customers", { name: "Paid Up", promiseDate: daysAgo(1) })).body;
  for (const c of [late, dueToday, later]) await api("POST", `/customers/${c.id}/entries`, { type: "gave", amount: 1000 });
  await api("POST", `/customers/${paidUp.id}/entries`, { type: "gave", amount: 500 });
  await api("POST", `/customers/${paidUp.id}/entries`, { type: "got", amount: 500 });

  const s = (await api("GET", "/summary")).body;
  assert.equal(s.collectCount, 2);
  assert.equal(s.collectAmount, 2000);
  assert.equal((await api("POST", "/customers", { name: "Bad Date", promiseDate: "someday" })).status, 400);
  const cleared = (await api("PUT", `/customers/${late.id}`, { name: "Late Payer", promiseDate: "" })).body;
  assert.equal(cleared.promiseDate, "");
});

test("the amount box adds up like a shop calculator", () => {
  assert.equal(evalAmount("450+120+85"), 655);
  assert.equal(evalAmount("3*250"), 750);
  assert.equal(evalAmount("3 x 250 + 50"), 800);
  assert.equal(evalAmount("1,200 - 200"), 1000);
  assert.equal(evalAmount("1000/3"), 333);
  assert.equal(evalAmount("2500"), 2500);
  for (const bad of ["", "abc", "5+", "+5", "5++5", "10/0", "alert(1)"]) assert.ok(Number.isNaN(evalAmount(bad)), bad);
});
