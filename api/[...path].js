// Single serverless entry point for /api/* (keeps the project inside Vercel Hobby's function limit).
import { ensureSchema, hasDb } from "../server/db.js";
import { send, fail, readJson, readRaw, checkPassword, sessionCookie, clearCookie, isAdmin, requireAdmin, throttle, HttpError } from "../server/http.js";
import * as shop from "../server/shop.js";

const routes = [];
const on = (method, pattern, fn, admin = false) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), fn, admin });

/* Public */
on("GET", "/health", async () => ({ ok: true, db: hasDb, admin: Boolean(process.env.ADMIN_PASSWORD) }));
on("GET", "/catalog", async (req, res) => { res.setHeader("cache-control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300"); return shop.publicCatalog(); });
on("POST", "/orders", async req => shop.createOrder(await readJson(req)));
on("GET", "/orders/track", async (req, res, p, url) => shop.trackOrder(url.searchParams.get("number"), url.searchParams.get("phone")));
on("GET", "/img/:id", async (req, res, p) => {
  const img = await shop.loadImage(p.id);
  res.statusCode = 200; res.setHeader("content-type", img.mime); res.setHeader("cache-control", "public, max-age=31536000, immutable");
  res.end(img.data); return undefined;
});

/* Admin session */
on("POST", "/admin/login", async (req, res) => {
  throttle(req);
  const { password } = await readJson(req);
  if (!checkPassword(password)) fail(401, "That password isn't right.");
  res.setHeader("set-cookie", sessionCookie(req));
  return { ok: true };
});
on("POST", "/admin/logout", async (req, res) => { res.setHeader("set-cookie", clearCookie()); return { ok: true }; });
on("GET", "/admin/me", async req => ({ signedIn: isAdmin(req), configured: Boolean(process.env.ADMIN_PASSWORD), db: hasDb, blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN) }));

/* Admin */
const A = (m, p, fn) => on(m, p, fn, true);
const qs = url => Object.fromEntries(url.searchParams);
A("GET", "/admin/dashboard", () => shop.dashboard());
A("GET", "/admin/meta", () => shop.meta());
A("GET", "/admin/products", (req, res, p, url) => shop.listProducts(qs(url)));
A("POST", "/admin/products", async req => shop.createProduct(await readJson(req)));
A("POST", "/admin/products/bulk", async req => shop.bulkProducts(await readJson(req)));
A("GET", "/admin/products/:id", (req, res, p) => shop.getProduct(p.id));
A("PUT", "/admin/products/:id", async (req, res, p) => shop.updateProduct(p.id, await readJson(req)));
A("DELETE", "/admin/products/:id", async (req, res, p) => shop.bulkProducts({ action: "delete", ids: [p.id] }));
A("POST", "/admin/upload", async req => ({ url: await shop.saveImage(await readRaw(req), String(req.headers["x-mime"] || "")) }));
A("GET", "/admin/orders", (req, res, p, url) => shop.listOrders(qs(url)));
A("GET", "/admin/orders/:number", (req, res, p) => shop.getOrder(p.number));
A("POST", "/admin/orders/:number/action", async (req, res, p) => shop.orderAction(p.number, await readJson(req)));
A("GET", "/admin/customers", (req, res, p, url) => shop.customers(qs(url)));
A("GET", "/admin/reports", (req, res, p, url) => shop.reports(url.searchParams.get("days")));
A("GET", "/admin/settings", () => shop.getSettings());
A("PUT", "/admin/settings", async req => shop.saveSettings(await readJson(req)));

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const path = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";
  try {
    const match = routes.map(r => ({ r, m: r.method === req.method && r.re.exec(path) })).find(x => x.m);
    if (!match) {
      if (routes.some(r => r.re.test(path))) fail(405, "Method not allowed");
      fail(404, "Not found");
    }
    if (match.r.admin) requireAdmin(req);
    if (path !== "/health" && !path.startsWith("/admin/log") && path !== "/admin/me") await ensureSchema();
    const out = await match.r.fn(req, res, Object.fromEntries(Object.entries(match.m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])), url);
    if (out !== undefined) send(res, 200, out, match.r.admin || req.method !== "GET" ? { "cache-control": "no-store" } : {});
  } catch (e) {
    const status = e instanceof HttpError || e.status ? e.status : 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? "Something went wrong on our side. Please try again." : e.message }, { "cache-control": "no-store" });
  }
}
