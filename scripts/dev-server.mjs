// Local preview: serves public/ and routes /api/* to the same handler Vercel runs.
// Usage: DATABASE_URL=postgres://... ADMIN_PASSWORD=secret npm run dev
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import handler from "../api/index.js";

const root = new URL("../public/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon" };
const port = Number(process.env.PORT || 3000);

http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) return handler(req, res);
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, p);
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch {}
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, () => console.log(`Seven Notes running at http://localhost:${port}  (admin: /admin/)`));
