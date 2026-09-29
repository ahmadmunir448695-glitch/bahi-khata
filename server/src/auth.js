import { scrypt, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const COOKIE = "bahi_session";
const SESSION_DAYS = 7;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const key = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

// Stateless signed session token: base64url(payload).signature
export function createSessions(secret) {
  const sign = (data) => createHmac("sha256", secret).update(data).digest("base64url");

  function issue(res, user) {
    const payload = Buffer.from(
      JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + SESSION_DAYS * 864e5 })
    ).toString("base64url");
    const token = `${payload}.${sign(payload)}`;
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` +
        (process.env.NODE_ENV === "production" ? "; Secure" : "")
    );
  }

  function clear(res) {
    res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  }

  function read(req) {
    const cookie = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
    if (!cookie) return null;
    const [payload, sig] = cookie.slice(COOKIE.length + 1).split(".");
    if (!payload || !sig) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  return { issue, clear, read };
}

// Blocks a login name + IP after too many wrong passwords.
export function createLoginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  const key = (req, login) => `${req.ip}|${String(login).toLowerCase()}`;
  return {
    blocked(req, login) {
      const h = hits.get(key(req, login));
      if (!h) return false;
      if (Date.now() - h.first > windowMs) {
        hits.delete(key(req, login));
        return false;
      }
      return h.count >= max;
    },
    fail(req, login) {
      const k = key(req, login);
      const h = hits.get(k);
      if (!h || Date.now() - h.first > windowMs) hits.set(k, { count: 1, first: Date.now() });
      else h.count++;
    },
    reset(req, login) {
      hits.delete(key(req, login));
    },
  };
}
