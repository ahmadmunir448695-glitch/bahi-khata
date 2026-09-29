import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createJsonStore } from "./storage.js";
import { hashPassword, verifyPassword, createSessions, createLoginLimiter } from "./auth.js";
import { checkCustomer, checkEntry, checkSettings, customerSummaries, ledger, summary, DEFAULT_TEMPLATES } from "../../shared/core.js";

const isEmail = (s) => typeof s === "string" && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// `dataDir` is where shops, customers and entries are saved. `clientDir` is the built Vue app to serve, if it exists.
export async function createApp({ dataDir, clientDir, secret } = {}) {
  const db = createJsonStore(dataDir);

  let sessionSecret = secret;
  if (!sessionSecret) {
    sessionSecret = (await db.read("secret.json", null))?.secret;
    if (!sessionSecret) {
      sessionSecret = randomBytes(32).toString("hex");
      await db.update("secret.json", {}, (s) => (s.secret = sessionSecret));
    }
  }
  const sessions = createSessions(sessionSecret);
  const limiter = createLoginLimiter();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "32kb" }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const publicUser = (u) => ({ id: u.id, name: u.name, shop: u.shop, email: u.email, templates: u.templates });
  const invalid = (res, fields) => res.status(400).json({ error: Object.values(fields)[0], fields });
  const notFound = (res, what) => res.status(404).json({ error: `${what} not found.` });

  app.use(
    wrap(async (req, res, next) => {
      const session = sessions.read(req);
      if (session) req.user = (await db.read("users.json", [])).find((u) => u.id === session.uid);
      next();
    })
  );
  const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Please log in first." }));
  // Every read goes through these, so a shop only ever sees its own khata.
  const mine = async (req, file) => (await db.read(file, [])).filter((x) => x.ownerId === req.user.id);
  const findCustomer = async (req, id) => (await mine(req, "customers.json")).find((c) => c.id === id);

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // ---------- Accounts ----------
  app.post(
    "/api/auth/register",
    wrap(async (req, res) => {
      const { name, shop, password } = req.body || {};
      const email = String(req.body?.email || "").trim().toLowerCase();
      const fields = {};
      if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 60) fields.name = "Enter your name.";
      if (typeof shop !== "string" || shop.trim().length < 2 || shop.trim().length > 40) fields.shop = "Enter your shop name.";
      if (!isEmail(email)) fields.email = "Enter a valid email address.";
      if (typeof password !== "string" || password.length < 8 || password.length > 200) fields.password = "Use at least 8 characters.";
      if (Object.keys(fields).length) return invalid(res, fields);

      const passwordHash = await hashPassword(password);
      const user = await db.update("users.json", [], (list) => {
        if (list.some((u) => u.email === email)) return null;
        const u = { id: randomUUID(), name: name.trim(), shop: shop.trim(), email, passwordHash, templates: { ...DEFAULT_TEMPLATES }, createdAt: new Date().toISOString() };
        list.push(u);
        return u;
      });
      if (!user) return invalid(res, { email: "An account with this email already exists. Log in instead." });
      sessions.issue(res, user);
      res.status(201).json({ user: publicUser(user) });
    })
  );

  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (limiter.blocked(req, email)) return res.status(429).json({ error: "Too many wrong passwords. Try again in 15 minutes." });
      const user = (await db.read("users.json", [])).find((u) => u.email === email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        limiter.fail(req, email);
        return res.status(401).json({ error: "Wrong email or password." });
      }
      limiter.reset(req, email);
      sessions.issue(res, user);
      res.json({ user: publicUser(user) });
    })
  );

  app.post("/api/auth/logout", (req, res) => {
    sessions.clear(res);
    res.json({ ok: true });
  });
  app.get("/api/auth/me", (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

  app.put(
    "/api/settings",
    requireUser,
    wrap(async (req, res) => {
      const { value, errors } = checkSettings(req.body);
      if (errors) return invalid(res, errors);
      const user = await db.update("users.json", [], (list) => Object.assign(list.find((u) => u.id === req.user.id), value));
      res.json({ user: publicUser(user) });
    })
  );

  // ---------- Customers ----------
  app.get(
    "/api/customers",
    requireUser,
    wrap(async (req, res) => res.json(customerSummaries(await mine(req, "customers.json"), await mine(req, "entries.json"))))
  );

  app.get("/api/summary", requireUser, wrap(async (req, res) => res.json(summary(await mine(req, "customers.json"), await mine(req, "entries.json")))));

  app.post(
    "/api/customers",
    requireUser,
    wrap(async (req, res) => {
      const { value, errors } = checkCustomer(req.body);
      if (errors) return invalid(res, errors);
      const customer = { id: randomUUID(), ownerId: req.user.id, ...value, createdAt: new Date().toISOString() };
      await db.update("customers.json", [], (list) => list.push(customer));
      res.status(201).json({ ...customer, balance: 0, count: 0 });
    })
  );

  // One customer with the full ledger (oldest first, running balance on each entry).
  app.get(
    "/api/customers/:id",
    requireUser,
    wrap(async (req, res) => {
      const customer = await findCustomer(req, req.params.id);
      if (!customer) return notFound(res, "Customer");
      const entries = ledger((await mine(req, "entries.json")).filter((e) => e.customerId === customer.id));
      res.json({ ...customer, balance: entries.at(-1)?.balance || 0, entries });
    })
  );

  app.put(
    "/api/customers/:id",
    requireUser,
    wrap(async (req, res) => {
      const { value, errors } = checkCustomer(req.body);
      if (errors) return invalid(res, errors);
      const c = await db.update("customers.json", [], (list) => {
        const found = list.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
        return found ? Object.assign(found, value) : null;
      });
      if (!c) return notFound(res, "Customer");
      res.json(c);
    })
  );

  // Deleting a customer removes their entries too.
  app.delete(
    "/api/customers/:id",
    requireUser,
    wrap(async (req, res) => {
      const removed = await db.update("customers.json", [], (list) => {
        const i = list.findIndex((x) => x.id === req.params.id && x.ownerId === req.user.id);
        return i === -1 ? false : (list.splice(i, 1), true);
      });
      if (!removed) return notFound(res, "Customer");
      await db.update("entries.json", [], (list) => {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].customerId === req.params.id && list[i].ownerId === req.user.id) list.splice(i, 1);
      });
      res.json({ ok: true });
    })
  );

  // ---------- Entries ----------
  app.post(
    "/api/customers/:id/entries",
    requireUser,
    wrap(async (req, res) => {
      if (!(await findCustomer(req, req.params.id))) return notFound(res, "Customer");
      const { value, errors } = checkEntry(req.body);
      if (errors) return invalid(res, errors);
      const entry = { id: randomUUID(), ownerId: req.user.id, customerId: req.params.id, ...value, createdAt: new Date().toISOString() };
      await db.update("entries.json", [], (list) => list.push(entry));
      res.status(201).json(entry);
    })
  );

  app.put(
    "/api/entries/:id",
    requireUser,
    wrap(async (req, res) => {
      const { value, errors } = checkEntry(req.body);
      if (errors) return invalid(res, errors);
      const e = await db.update("entries.json", [], (list) => {
        const found = list.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
        return found ? Object.assign(found, value, { updatedAt: new Date().toISOString() }) : null;
      });
      if (!e) return notFound(res, "Entry");
      res.json(e);
    })
  );

  app.delete(
    "/api/entries/:id",
    requireUser,
    wrap(async (req, res) => {
      const removed = await db.update("entries.json", [], (list) => {
        const i = list.findIndex((x) => x.id === req.params.id && x.ownerId === req.user.id);
        return i === -1 ? false : (list.splice(i, 1), true);
      });
      if (!removed) return notFound(res, "Entry");
      res.json({ ok: true });
    })
  );

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  if (clientDir && existsSync(path.join(clientDir, "index.html"))) {
    app.use(express.static(clientDir, { maxAge: "1h", index: false }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(clientDir, "index.html")));
  }

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  });

  return app;
}
