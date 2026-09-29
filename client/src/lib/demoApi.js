// In-browser copy of the Node API for the self-contained preview build.
// Data lives in this browser's localStorage and starts with a demo shop and sample khata.
import { checkCustomer, checkEntry, checkSettings, customerSummaries, ledger, summary, pkDay, DEFAULT_TEMPLATES } from "../../../shared/core.js";

const KEY = "bahi-preview-v1";
let memory = null; // used when localStorage is blocked

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) return saved;
  } catch {}
  return memory || seed();
}
function save(db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
}

class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
const invalid = (fields) => {
  throw new ApiError(400, Object.values(fields)[0], fields);
};
// Not real security: the preview only keeps data in this one browser.
async function hash(password) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bahi-preview:" + password));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "plain:" + password;
  }
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const publicUser = (u) => ({ id: u.id, name: u.name, shop: u.shop, email: u.email, templates: u.templates });

export async function handle(method, url, body) {
  await new Promise((r) => setTimeout(r, 50));
  const db = load();
  const path = url.split("?")[0];
  const user = db.users.find((u) => u.id === db.session);
  const route = `${method} ${path}`;
  let m;

  if (route === "GET /auth/me") return { user: user ? publicUser(user) : null };
  if (route === "POST /auth/logout") {
    db.session = null;
    save(db);
    return { ok: true };
  }
  if (route === "POST /auth/login") {
    const email = String(body?.email || "").trim().toLowerCase();
    const u = db.users.find((x) => x.email === email);
    if (!u || u.passwordHash !== (await hash(String(body?.password || "")))) throw new ApiError(401, "Wrong email or password.");
    db.session = u.id;
    save(db);
    return { user: publicUser(u) };
  }
  if (route === "POST /auth/register") {
    const { name, shop, password } = body || {};
    const email = String(body?.email || "").trim().toLowerCase();
    const fields = {};
    if (typeof name !== "string" || name.trim().length < 2) fields.name = "Enter your name.";
    if (typeof shop !== "string" || shop.trim().length < 2) fields.shop = "Enter your shop name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Enter a valid email address.";
    if (typeof password !== "string" || password.length < 8) fields.password = "Use at least 8 characters.";
    if (db.users.some((u) => u.email === email)) fields.email = "An account with this email already exists. Log in instead.";
    if (Object.keys(fields).length) invalid(fields);
    const u = { id: uid(), name: name.trim(), shop: shop.trim(), email, passwordHash: await hash(password), templates: { ...DEFAULT_TEMPLATES }, createdAt: new Date().toISOString() };
    db.users.push(u);
    db.session = u.id;
    save(db);
    return { user: publicUser(u) };
  }

  if (!user) throw new ApiError(401, "Please log in first.");
  const customers = () => db.customers.filter((c) => c.ownerId === user.id);
  const entries = () => db.entries.filter((e) => e.ownerId === user.id);

  if (route === "PUT /settings") {
    const { value, errors } = checkSettings(body);
    if (errors) invalid(errors);
    Object.assign(user, value);
    save(db);
    return { user: publicUser(user) };
  }
  if (route === "GET /customers") return customerSummaries(customers(), entries());
  if (route === "GET /summary") return summary(customers(), entries());
  if (route === "POST /customers") {
    const { value, errors } = checkCustomer(body);
    if (errors) invalid(errors);
    const c = { id: uid(), ownerId: user.id, ...value, createdAt: new Date().toISOString() };
    db.customers.push(c);
    save(db);
    return { ...c, balance: 0, count: 0 };
  }
  if ((m = path.match(/^\/customers\/([^/]+)\/entries$/)) && method === "POST") {
    if (!customers().some((c) => c.id === m[1])) throw new ApiError(404, "Customer not found.");
    const { value, errors } = checkEntry(body);
    if (errors) invalid(errors);
    const e = { id: uid(), ownerId: user.id, customerId: m[1], ...value, createdAt: new Date().toISOString() };
    db.entries.push(e);
    save(db);
    return e;
  }
  if ((m = path.match(/^\/customers\/([^/]+)$/))) {
    const c = customers().find((x) => x.id === m[1]);
    if (!c) throw new ApiError(404, "Customer not found.");
    if (method === "GET") {
      const list = ledger(entries().filter((e) => e.customerId === c.id));
      return { ...c, balance: list.at(-1)?.balance || 0, entries: list };
    }
    if (method === "PUT") {
      const { value, errors } = checkCustomer(body);
      if (errors) invalid(errors);
      Object.assign(c, value);
      save(db);
      return c;
    }
    if (method === "DELETE") {
      db.customers = db.customers.filter((x) => x !== c);
      db.entries = db.entries.filter((e) => e.customerId !== c.id);
      save(db);
      return { ok: true };
    }
  }
  if ((m = path.match(/^\/entries\/([^/]+)$/))) {
    const e = entries().find((x) => x.id === m[1]);
    if (!e) throw new ApiError(404, "Entry not found.");
    if (method === "DELETE") {
      db.entries = db.entries.filter((x) => x !== e);
      save(db);
      return { ok: true };
    }
    if (method === "PUT") {
      const { value, errors } = checkEntry(body);
      if (errors) invalid(errors);
      Object.assign(e, value, { updatedAt: new Date().toISOString() });
      save(db);
      return e;
    }
  }
  throw new ApiError(404, "Not found.");
}

// ---------- Demo shop ----------
export const DEMO_LOGIN = { email: "demo@bahi.pk", password: "demo1234" };
const DEMO_HASH = "0b2af4ebf293c33fc1bf51640fe0f78817aeab96076a5f9b36fba43841140add";

function seed() {
  let n = 11;
  const rand = () => ((n = (n * 16807) % 2147483647) - 1) / 2147483646;
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const now = Date.now();
  const day = (ago) => pkDay(now - ago * 864e5);

  const demo = { id: "demo", name: "Muhammad Aslam", shop: "Aslam General Store", email: DEMO_LOGIN.email, passwordHash: DEMO_HASH, templates: { ...DEFAULT_TEMPLATES }, createdAt: new Date().toISOString() };
  const people = [
    ["Imran Butt", "03004512873", "Gali 4, ghar 17"], ["Nadia Bibi", "03214478120", ""], ["Chacha Rafiq", "", "Masjid wali gali"],
    ["Kashif Mehmood", "03335129044", ""], ["Shazia Parveen", "03124490317", "Upar wala portion"], ["Tariq Hussain", "03451209836", ""],
    ["Bilal Ahmed", "03017735261", "Rickshaw driver"], ["Rukhsana Begum", "03224560098", ""], ["Usman Ghani", "", "Chai dhaba"],
    ["Farzana Akhtar", "03065541278", ""], ["Hamid Ali", "03138802451", ""], ["Saima Noreen", "03347712609", "School teacher"],
  ];
  const goods = ["Atta 10kg", "Ghee 5kg", "Cheeni 5kg", "Chai patti", "Doodh", "Chawal 5kg", "Sabun, surf", "Daal masoor", "Anday 2 darjan", "Cold drinks", "Biscuit, rusk", "Oil 3L"];

  const customers = [];
  const entries = [];
  people.forEach(([name, phone, note], i) => {
    const c = { id: `demo-c${i}`, ownerId: demo.id, name, phone, note, promiseDate: "", createdAt: new Date(now - (60 - i) * 864e5).toISOString() };
    customers.push(c);
    let k = 0;
    const add = (type, amount, ago, what = "") =>
      entries.push({ id: `demo-e${i}-${k++}`, ownerId: demo.id, customerId: c.id, type, amount, note: what, date: day(ago), createdAt: new Date(now - ago * 864e5 + k * 1000).toISOString() });
    let owed = 0;
    for (let ago = 45 - i * 2; ago >= 0; ago -= 3 + Math.floor(rand() * 6)) {
      if (rand() < 0.68 || owed < 800) {
        const amt = Math.round((300 + rand() * 2600) / 10) * 10;
        add("gave", amt, ago, pick(goods));
        owed += amt;
      } else {
        const amt = rand() < 0.4 ? owed : Math.round((owed * (0.3 + rand() * 0.5)) / 100) * 100;
        if (amt > 0) (add("got", amt, ago, rand() < 0.3 ? "JazzCash" : ""), (owed -= amt));
      }
    }
    // A few people promised a payment date: two are due or late, one is later this week.
    if (i === 0) c.promiseDate = day(0);
    if (i === 3) c.promiseDate = day(2);
    if (i === 5) c.promiseDate = day(-4);
    if (i === 8) add("got", owed + 500, 0, "Advance");
  });
  // Something happened today, so the day's totals aren't empty.
  entries.push({ id: "demo-t1", ownerId: demo.id, customerId: "demo-c1", type: "gave", amount: 1850, note: "Doodh, anday", date: day(0), createdAt: new Date(now - 3600e3).toISOString() });
  entries.push({ id: "demo-t2", ownerId: demo.id, customerId: "demo-c6", type: "got", amount: 2000, note: "", date: day(0), createdAt: new Date(now - 1800e3).toISOString() });

  const db = { users: [demo], customers, entries, session: demo.id };
  save(db);
  return db;
}

export function resetPreview() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  memory = null;
}
