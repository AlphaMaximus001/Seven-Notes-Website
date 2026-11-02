// Tiny request/response helpers that work both on Vercel and in the local dev server.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

function stream(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limit) { reject(new HttpError(413, "Upload is too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
/** Vercel pre-parses req.body; the dev server doesn't. Handle both. */
export async function readJson(req) {
  const b = req.body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  const buf = typeof b === "string" ? Buffer.from(b) : Buffer.isBuffer(b) ? b : await stream(req, 2_000_000);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString("utf8")); } catch { fail(400, "Request body must be JSON"); }
}
export async function readRaw(req, limit = 4_000_000) {
  const b = req.body;
  if (Buffer.isBuffer(b)) return b;
  return stream(req, limit);
}

export function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(/;\s*/).forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); });
  return out;
}

/* ---------- Admin session: HMAC-signed cookie, no server state ---------- */
const COOKIE = "sn_admin";
const secret = () => process.env.SESSION_SECRET || createHash("sha256").update("sn|" + (process.env.ADMIN_PASSWORD || "") + "|" + (process.env.DATABASE_URL || process.env.POSTGRES_URL || "")).digest("hex");
const sign = s => createHmac("sha256", secret()).update(s).digest("base64url");
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) fail(503, "Admin password not set. Add ADMIN_PASSWORD in Vercel → Settings → Environment Variables, then redeploy.");
  return safeEq(createHash("sha256").update(String(pw || "")).digest("hex"), createHash("sha256").update(real).digest("hex"));
}
export function sessionCookie(req, days = 14) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + days * 864e5 })).toString("base64url");
  const secure = (req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
export function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const t = cookies(req)[COOKIE]; if (!t) return false;
  const [payload, sig] = t.split(".");
  if (!payload || !sig || !safeEq(sig, sign(payload))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
/** Admin writes must come from our own page (custom header can't be sent cross-site without CORS). */
export function requireAdmin(req) {
  if (!isAdmin(req)) fail(401, "Please sign in again.");
  if (req.method !== "GET" && req.headers["x-sn-admin"] !== "1") fail(403, "Blocked request.");
}

/* Best-effort login throttling per warm instance. */
const attempts = new Map();
export function throttle(req) {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const now = Date.now(), a = (attempts.get(ip) || []).filter(t => now - t < 10 * 60_000);
  if (a.length >= 8) fail(429, "Too many attempts. Wait a few minutes and try again.");
  a.push(now); attempts.set(ip, a);
}
