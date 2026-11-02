// Store logic: catalogue, orders, customers, reports, settings.
import { randomBytes } from "node:crypto";
import { q, db } from "./db.js";
import { fail } from "./http.js";

/* ---------- Settings ---------- */
export const DEFAULT_SETTINGS = {
  storeName: "Seven Notes", city: "Lucknow", state: "Uttar Pradesh",
  address: "Seven Notes Music Store, Lucknow, Uttar Pradesh",
  phone: "", whatsapp: "", email: "", mapsUrl: "", gstin: "",
  hours: [["Mon to Sat", "11:00 to 20:30"], ["Sunday", "12:00 to 19:00"]],
  shippingFee: 0, freeShippingOver: 0,
  codEnabled: true, upiEnabled: true, upiId: "", pickupEnabled: true
};
export async function getSettings() {
  const { rows } = await q("select key, value from settings");
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...(s.store || {}), departments: s.departments || [] };
}
export async function saveSettings(input) {
  const cur = await getSettings(), next = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (!(k in input)) { next[k] = cur[k]; continue; }
    const d = DEFAULT_SETTINGS[k], v = input[k];
    if (typeof d === "boolean") next[k] = Boolean(v);
    else if (typeof d === "number") { const n = Number(v); if (!Number.isFinite(n) || n < 0) fail(400, `${k} must be a positive number`); next[k] = n; }
    else if (Array.isArray(d)) next[k] = Array.isArray(v) ? v.filter(r => Array.isArray(r) && r[0]).map(r => [String(r[0]).slice(0, 40), String(r[1] || "").slice(0, 60)]).slice(0, 7) : cur[k];
    else next[k] = String(v ?? "").trim().slice(0, 300);
  }
  if (next.whatsapp) next.whatsapp = next.whatsapp.replace(/\D/g, "");
  await q("insert into settings (key, value) values ('store', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(next)]);
  return getSettings();
}

/* ---------- Products ---------- */
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
export function toPublic(r, fams) {
  return {
    id: r.id, sku: r.sku, name: r.name, brand: r.brand, dept: r.dept, cat: r.cat, colour: r.colour,
    stock: r.stock, price: num(r.price), mrp: num(r.mrp), images: r.images, specs: r.specs, desc: r.description,
    art: r.art || "strings", variants: r.family && fams ? (fams.get(r.family) || []).filter(id => id !== r.id) : []
  };
}
export function toAdmin(r) {
  return { ...toPublic(r), family: r.family, gstRate: num(r.gst_rate), hsn: r.hsn, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
export async function publicCatalog() {
  const [{ rows }, settings] = await Promise.all([q("select * from products where status = 'active' order by name"), getSettings()]);
  const fams = new Map();
  rows.forEach(r => { if (r.family) fams.set(r.family, [...(fams.get(r.family) || []), r.id]); });
  const { departments, ...pub } = settings;
  return { departments, products: rows.map(r => toPublic(r, fams)), settings: pub };
}

const ARTS = { guitars: "acoustic", folk: "ukulele", keys: "keyboard", drums: "djembe", studio: "mic", amps: "amp", accessories: "strings" };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "item";
async function validProduct(input, partial) {
  const out = {}, depts = (await getSettings()).departments.map(d => d.id);
  const str = (k, max = 200) => { if (k in input) out[k] = String(input[k] ?? "").trim().slice(0, max); };
  str("name"); str("brand", 80); str("cat", 80); str("colour", 40); str("sku", 60); str("hsn", 20); str("family", 120); str("description", 4000);
  if ("dept" in input) { if (!depts.includes(input.dept)) fail(400, "Choose a department"); out.dept = input.dept; }
  for (const k of ["price", "mrp"]) if (k in input) { const v = num(input[k]); if (v !== null && (!Number.isFinite(v) || v < 0)) fail(400, `${k === "mrp" ? "MRP" : "Price"} must be a positive number`); out[k] = v; }
  if ("stock" in input) { const v = Number(input.stock); if (!Number.isInteger(v) || v < 0) fail(400, "Stock must be a whole number, 0 or more"); out.stock = v; }
  if ("gstRate" in input) { const v = Number(input.gstRate); if (![0, 5, 12, 18, 28].includes(v)) fail(400, "GST rate must be 0, 5, 12, 18 or 28"); out.gst_rate = v; }
  if ("status" in input) { if (!["active", "inactive"].includes(input.status)) fail(400, "Status must be active or inactive"); out.status = input.status; }
  if ("images" in input) { if (!Array.isArray(input.images)) fail(400, "Images must be a list"); out.images = JSON.stringify(input.images.map(String).filter(u => /^(\/|https:\/\/)[^"'<>\s]+$/.test(u)).slice(0, 12)); }
  if ("specs" in input) {
    const s = input.specs && typeof input.specs === "object" ? input.specs : {};
    out.specs = JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k, v]) => k && v).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)])));
  }
  if (out.family === "") out.family = null;
  if (!partial) { if (!out.name) fail(400, "Add a product name"); if (!out.dept) fail(400, "Choose a department"); if (!out.cat) fail(400, "Add a category"); }
  if (out.name === "") fail(400, "Product name can't be empty");
  return out;
}
export async function createProduct(input) {
  const p = await validProduct(input, false);
  let id = slug(p.name);
  if ((await q("select 1 from products where id = $1", [id])).rowCount) id += "-" + randomBytes(2).toString("hex");
  p.id = id; p.sku = p.sku || id.toUpperCase(); p.art = ARTS[p.dept];
  const keys = Object.keys(p);
  const { rows } = await q(`insert into products (${keys.join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`, keys.map(k => p[k]));
  return toAdmin(rows[0]);
}
export async function updateProduct(id, input) {
  const p = await validProduct(input, true);
  if (p.dept) p.art = ARTS[p.dept];
  const keys = Object.keys(p);
  if (!keys.length) return getProduct(id);
  const { rows } = await q(`update products set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1 returning *`, [id, ...keys.map(k => p[k])]);
  if (!rows[0]) fail(404, "Product not found");
  return toAdmin(rows[0]);
}
export async function getProduct(id) {
  const { rows } = await q("select * from products where id = $1", [id]);
  if (!rows[0]) fail(404, "Product not found");
  return toAdmin(rows[0]);
}
export async function listProducts(f) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace("$?", "$" + args.length)); };
  if (f.q) add("(name ilike $? or brand ilike $? or sku ilike $? or id ilike $?)".replaceAll("$?", "$" + (args.length + 1)), `%${f.q}%`);
  if (f.dept) add("dept = $?", f.dept);
  if (f.status) add("status = $?", f.status);
  if (f.stock === "out") where.push("stock <= 0"); else if (f.stock === "low") where.push("stock between 1 and 2"); else if (f.stock === "in") where.push("stock > 0");
  if (f.missing === "price") where.push("price is null"); else if (f.missing === "images") where.push("jsonb_array_length(images) = 0");
  const order = { name: "name asc", stock: "stock asc, name", "stock-desc": "stock desc, name", price: "price asc nulls last", "price-desc": "price desc nulls last", updated: "updated_at desc" }[f.sort] || "updated_at desc, name";
  const size = Math.min(200, Math.max(10, Number(f.size) || 50)), page = Math.max(1, Number(f.page) || 1);
  const w = where.length ? "where " + where.join(" and ") : "";
  const [{ rows }, c] = await Promise.all([
    q(`select * from products ${w} order by ${order} limit ${size} offset ${(page - 1) * size}`, args),
    q(`select count(*)::int n from products ${w}`, args)
  ]);
  return { items: rows.map(toAdmin), total: c.rows[0].n, page, size };
}
export async function bulkProducts({ action, ids = [], rows = [] }) {
  if (["activate", "deactivate", "delete"].includes(action)) {
    if (!Array.isArray(ids) || !ids.length) fail(400, "Select at least one product");
    const r = action === "delete" ? await q("delete from products where id = any($1)", [ids])
      : await q("update products set status = $2, updated_at = now() where id = any($1)", [ids, action === "activate" ? "active" : "inactive"]);
    return { changed: r.rowCount };
  }
  if (action !== "upsert") fail(400, "Unknown bulk action");
  if (!Array.isArray(rows) || rows.length > 500) fail(400, "Send up to 500 rows at a time");
  let created = 0, updated = 0; const errors = [];
  for (const [i, row] of rows.entries()) {
    try {
      let id = row.id && (await q("select id from products where id = $1", [row.id])).rows[0]?.id;
      if (!id && row.sku) id = (await q("select id from products where sku = $1", [row.sku])).rows[0]?.id;
      const clean = Object.fromEntries(Object.entries(row).filter(([k, v]) => k !== "id" && v !== undefined && v !== ""));
      if (id) { await updateProduct(id, clean); updated++; } else { await createProduct(clean); created++; }
    } catch (e) { errors.push({ row: i + 2, message: e.message }); }
  }
  return { created, updated, errors };
}

/* ---------- Orders ---------- */
const STATUS = ["pending", "accepted", "packed", "shipped", "ready", "delivered", "cancelled", "rejected"];
const phone10 = p => String(p || "").replace(/\D/g, "").slice(-10);
function orderOut(r, full = true) {
  const o = { number: r.number, status: r.status, items: r.items, subtotal: num(r.subtotal), shipping: num(r.shipping), total: num(r.total), hasUnpriced: r.has_unpriced,
    fulfilment: r.fulfilment, paymentMethod: r.payment_method, paymentStatus: r.payment_status, tracking: r.tracking, history: r.history, createdAt: r.created_at, updatedAt: r.updated_at };
  if (full) Object.assign(o, { customer: r.customer, notes: r.notes, internalNotes: r.internal_notes, stockApplied: r.stock_applied });
  return o;
}
function totals(items, settings, fulfilment) {
  const priced = items.filter(i => i.price !== null);
  const subtotal = priced.reduce((a, i) => a + i.price * i.qty, 0);
  const free = settings.freeShippingOver > 0 && subtotal >= settings.freeShippingOver;
  const shipping = fulfilment === "delivery" && !free ? settings.shippingFee : 0;
  return { subtotal, shipping, total: subtotal + shipping, hasUnpriced: priced.length < items.length };
}
export async function createOrder(b) {
  if (b.website) fail(400, "Something went wrong. Please try again.");
  const settings = await getSettings();
  const c = b.customer || {};
  const customer = {
    name: String(c.name || "").trim().slice(0, 80), phone: phone10(c.phone), email: String(c.email || "").trim().slice(0, 120),
    address: String(c.address || "").trim().slice(0, 300), city: String(c.city || "").trim().slice(0, 60), state: String(c.state || "").trim().slice(0, 60), pincode: String(c.pincode || "").replace(/\D/g, "")
  };
  if (customer.name.length < 2) fail(400, "Enter your name");
  if (customer.phone.length !== 10) fail(400, "Enter a 10-digit mobile number");
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) fail(400, "Check your email address");
  const fulfilment = b.fulfilment === "pickup" && settings.pickupEnabled ? "pickup" : "delivery";
  if (fulfilment === "delivery") {
    if (customer.address.length < 6) fail(400, "Enter your delivery address");
    if (!customer.city) fail(400, "Enter your city");
    if (!/^\d{6}$/.test(customer.pincode)) fail(400, "Enter a 6-digit PIN code");
  }
  const pm = String(b.paymentMethod || "");
  const allowed = [settings.codEnabled && fulfilment === "delivery" && "cod", settings.upiEnabled && "upi", fulfilment === "pickup" && "store"].filter(Boolean);
  if (!allowed.includes(pm)) fail(400, "Choose a payment option");
  const want = Array.isArray(b.items) ? b.items : [];
  if (!want.length || want.length > 50) fail(400, "Your cart is empty");
  const { rows: prods } = await q("select * from products where id = any($1) and status = 'active'", [want.map(i => String(i.id))]);
  const P = new Map(prods.map(p => [p.id, p]));
  const items = want.map(i => {
    const p = P.get(String(i.id)); if (!p) fail(400, "An item in your cart is no longer available. Remove it and try again.");
    const qty = Math.min(20, Math.max(1, Math.floor(Number(i.qty) || 1)));
    return { id: p.id, sku: p.sku, name: p.name, brand: p.brand, qty, price: num(p.price), gstRate: num(p.gst_rate), hsn: p.hsn || "", image: p.images[0] || null };
  });
  const t = totals(items, settings, fulfilment);
  const client = await db().connect();
  try {
    await client.query("begin");
    const { rows: [{ id }] } = await client.query("select nextval(pg_get_serial_sequence('orders','id')) id");
    const ist = new Date(Date.now() + 5.5 * 3600e3).toISOString();
    const number = `SN${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}-${String(id).padStart(4, "0")}`;
    const hist = [{ at: new Date().toISOString(), status: "pending", note: "Order placed on the website" }];
    const { rows } = await client.query(
      `insert into orders (id, number, customer, items, subtotal, shipping, total, has_unpriced, fulfilment, payment_method, notes, history)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [id, number, customer, JSON.stringify(items), t.subtotal, t.shipping, t.total, t.hasUnpriced, fulfilment, pm, String(b.notes || "").slice(0, 500), JSON.stringify(hist)]);
    await client.query("commit");
    return orderOut(rows[0], false);
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
export async function trackOrder(number, phone) {
  const { rows } = await q("select * from orders where number = $1", [String(number || "").trim().toUpperCase()]);
  if (!rows[0] || rows[0].customer.phone !== phone10(phone)) fail(404, "We couldn't find an order with that number and phone.");
  return orderOut(rows[0], false);
}
export async function listOrders(f) {
  const where = [], args = [];
  const groups = { open: ["pending", "accepted", "packed", "ready"], unshipped: ["accepted", "packed"], closed: ["delivered", "cancelled", "rejected"] };
  if (f.status && groups[f.status]) { args.push(groups[f.status]); where.push(`status = any($${args.length})`); }
  else if (f.status && STATUS.includes(f.status)) { args.push(f.status); where.push(`status = $${args.length}`); }
  if (f.q) { args.push(`%${f.q}%`); where.push(`(number ilike $${args.length} or customer->>'name' ilike $${args.length} or customer->>'phone' ilike $${args.length} or items::text ilike $${args.length})`); }
  if (f.phone) { args.push(phone10(f.phone)); where.push(`customer->>'phone' = $${args.length}`); }
  const size = Math.min(100, Math.max(10, Number(f.size) || 25)), page = Math.max(1, Number(f.page) || 1);
  const w = where.length ? "where " + where.join(" and ") : "";
  const [{ rows }, c, counts] = await Promise.all([
    q(`select * from orders ${w} order by created_at desc limit ${size} offset ${(page - 1) * size}`, args),
    q(`select count(*)::int n from orders ${w}`, args),
    q("select status, count(*)::int n from orders group by status")
  ]);
  return { items: rows.map(r => orderOut(r)), total: c.rows[0].n, page, size, counts: Object.fromEntries(counts.rows.map(r => [r.status, r.n])) };
}
export async function getOrder(number) {
  const { rows } = await q("select * from orders where number = $1", [number]);
  if (!rows[0]) fail(404, "Order not found");
  return orderOut(rows[0]);
}

/* Allowed transitions — mirrors Seller Central's flow: pending → accepted → packed → shipped/ready → delivered. */
const NEXT = {
  accept: [["pending"], "accepted"], reject: [["pending"], "rejected"], pack: [["accepted"], "packed"],
  ship: [["packed", "accepted"], "shipped"], ready: [["packed", "accepted"], "ready"], deliver: [["shipped", "ready"], "delivered"],
  cancel: [["pending", "accepted", "packed", "shipped", "ready"], "cancelled"]
};
const LABEL = { accept: "Order accepted", reject: "Order rejected", pack: "Packed", ship: "Shipped", ready: "Ready for pickup", deliver: "Delivered", cancel: "Cancelled" };
export async function orderAction(number, b) {
  const client = await db().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from orders where number = $1 for update", [number]);
    const o = rows[0]; if (!o) fail(404, "Order not found");
    const now = new Date().toISOString(), note = String(b.note || "").trim().slice(0, 500);
    const set = { updated_at: now }; let hist = null;
    const a = b.action;
    if (a === "note") { set.internal_notes = String(b.internalNotes ?? "").slice(0, 2000); }
    else if (a === "paid" || a === "unpaid") { set.payment_status = a; hist = { at: now, status: o.status, note: a === "paid" ? "Payment received" : "Payment marked unpaid" }; }
    else if (a === "prices") {
      if (o.status !== "pending") fail(400, "Prices can only be changed before the order is accepted");
      const items = o.items.map(i => ({ ...i, price: b.prices && b.prices[i.id] !== undefined && b.prices[i.id] !== "" ? Number(b.prices[i.id]) : i.price }));
      if (items.some(i => i.price !== null && (!Number.isFinite(i.price) || i.price < 0))) fail(400, "Prices must be positive numbers");
      const t = totals(items, await getSettings(), o.fulfilment);
      Object.assign(set, { items: JSON.stringify(items), subtotal: t.subtotal, shipping: t.shipping, total: t.total, has_unpriced: t.hasUnpriced });
      hist = { at: now, status: o.status, note: "Prices confirmed" };
    } else if (NEXT[a]) {
      const [from, to] = NEXT[a];
      if (!from.includes(o.status)) fail(400, `Can't ${a} an order that is ${o.status}`);
      if (a === "accept" && o.has_unpriced) fail(400, "Set a price for every item before accepting");
      if (a === "ship" && o.fulfilment === "pickup") fail(400, "This is a store pickup. Mark it ready for pickup instead.");
      if (a === "ready" && o.fulfilment !== "pickup") fail(400, "This order is for delivery. Ship it instead.");
      if ((a === "reject" || a === "cancel") && !note) fail(400, "Add a reason so the customer knows why");
      set.status = to;
      if (a === "ship") set.tracking = JSON.stringify({ carrier: String(b.carrier || "").slice(0, 60), number: String(b.trackingNumber || "").slice(0, 80), url: /^https:\/\//.test(b.trackingUrl || "") ? String(b.trackingUrl).slice(0, 300) : "" });
      if (a === "accept" && !o.stock_applied) {
        for (const i of o.items) await client.query("update products set stock = greatest(0, stock - $2), updated_at = now() where id = $1", [i.id, i.qty]);
        set.stock_applied = true;
      }
      if ((a === "cancel") && o.stock_applied) {
        for (const i of o.items) await client.query("update products set stock = stock + $2, updated_at = now() where id = $1", [i.id, i.qty]);
        set.stock_applied = false;
      }
      if (a === "deliver" && ["cod", "store"].includes(o.payment_method)) set.payment_status = "paid";
      hist = { at: now, status: to, note: [LABEL[a], note].filter(Boolean).join(". ") };
    } else fail(400, "Unknown action");
    if (hist) set.history = JSON.stringify([...o.history, hist]);
    const keys = Object.keys(set);
    const r = await client.query(`update orders set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where number = $1 returning *`, [number, ...keys.map(k => set[k])]);
    await client.query("commit");
    return orderOut(r.rows[0]);
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}

/* ---------- Dashboard, customers, reports ---------- */
const LIVE = "status not in ('cancelled','rejected')";
const dayIST = "(created_at at time zone 'Asia/Kolkata')::date";
export async function dashboard() {
  const [counts, today, series, inv, recent, low] = await Promise.all([
    q("select status, count(*)::int n, coalesce(sum(total),0)::float v from orders group by status"),
    q(`select count(*)::int n, coalesce(sum(total),0)::float v from orders where ${LIVE} and ${dayIST} = (now() at time zone 'Asia/Kolkata')::date`),
    q(`select d::date as day, coalesce(sum(o.total),0)::float sales, count(o.id)::int orders
       from generate_series((now() at time zone 'Asia/Kolkata')::date - 13, (now() at time zone 'Asia/Kolkata')::date, '1 day') d
       left join orders o on (o.created_at at time zone 'Asia/Kolkata')::date = d and o.${LIVE}
       group by d order by d`),
    q(`select count(*) filter (where status='active')::int active, count(*) filter (where status='inactive')::int inactive,
       count(*) filter (where status='active' and stock<=0)::int out, count(*) filter (where status='active' and stock between 1 and 2)::int low,
       count(*) filter (where price is null)::int noprice, count(*) filter (where jsonb_array_length(images)=0)::int noimage,
       coalesce(sum(price*stock) filter (where price is not null and stock>0),0)::float value from products`),
    q("select * from orders order by created_at desc limit 8"),
    q("select * from products where status='active' and stock between 0 and 2 order by stock, name limit 8")
  ]);
  return {
    counts: Object.fromEntries(counts.rows.map(r => [r.status, r.n])), today: today.rows[0],
    series: series.rows.map(r => ({ day: r.day.toISOString().slice(0, 10), sales: r.sales, orders: r.orders })),
    inventory: inv.rows[0], recent: recent.rows.map(r => orderOut(r)), lowStock: low.rows.map(toAdmin)
  };
}
export async function customers(f) {
  const args = []; let w = "";
  if (f.q) { args.push(`%${f.q}%`); w = "where customer->>'name' ilike $1 or customer->>'phone' ilike $1 or customer->>'email' ilike $1 or customer->>'city' ilike $1"; }
  const { rows } = await q(`
    select customer->>'phone' phone, (array_agg(customer order by created_at desc))[1] latest, count(*)::int orders,
      coalesce(sum(total) filter (where ${LIVE}),0)::float spent, max(created_at) last_order, min(created_at) first_order
    from orders ${w} group by customer->>'phone' order by max(created_at) desc limit 500`, args);
  return rows.map(r => ({ phone: r.phone, name: r.latest.name, email: r.latest.email, city: r.latest.city, address: r.latest.address, pincode: r.latest.pincode, orders: r.orders, spent: r.spent, lastOrder: r.last_order, firstOrder: r.first_order }));
}
export async function reports(days) {
  const n = Math.min(365, Math.max(7, Number(days) || 30));
  const since = `(now() at time zone 'Asia/Kolkata')::date - ${n - 1}`;
  const [series, top, dept, pay] = await Promise.all([
    q(`select d::date as day, coalesce(sum(o.total),0)::float sales, count(o.id)::int orders
       from generate_series(${since}, (now() at time zone 'Asia/Kolkata')::date, '1 day') d
       left join orders o on ${dayIST.replace("created_at", "o.created_at")} = d and o.${LIVE}
       group by d order by d`),
    q(`select i->>'id' id, i->>'name' name, sum((i->>'qty')::int)::int qty, coalesce(sum((i->>'qty')::int * (i->>'price')::numeric),0)::float revenue
       from orders, jsonb_array_elements(items) i where ${LIVE} and ${dayIST} >= ${since}
       group by 1,2 order by revenue desc, qty desc limit 10`),
    q(`select coalesce(p.dept,'removed') dept, coalesce(sum((i->>'qty')::int * (i->>'price')::numeric),0)::float revenue, sum((i->>'qty')::int)::int qty
       from orders o, jsonb_array_elements(o.items) i left join products p on p.id = i->>'id'
       where o.${LIVE} and ${dayIST.replace("created_at", "o.created_at")} >= ${since} group by 1 order by revenue desc`),
    q(`select payment_method m, count(*)::int n, coalesce(sum(total),0)::float v from orders where ${LIVE} and ${dayIST} >= ${since} group by 1`)
  ]);
  return { days: n, series: series.rows.map(r => ({ day: r.day.toISOString().slice(0, 10), sales: r.sales, orders: r.orders })), top: top.rows, departments: dept.rows, payments: pay.rows };
}

/* ---------- Images ---------- */
const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
export async function saveImage(buf, mime) {
  if (!EXT[mime]) fail(400, "Upload a JPG, PNG or WebP image");
  if (buf.length < 100) fail(400, "That file looks empty");
  const id = randomBytes(10).toString("hex");
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const r = await put(`products/${id}.${EXT[mime]}`, buf, { access: "public", contentType: mime, addRandomSuffix: false });
    return r.url;
  }
  await q("insert into images (id, mime, data) values ($1, $2, $3)", [id, mime, buf]);
  return `/api/img/${id}`;
}
export async function loadImage(id) {
  const { rows } = await q("select mime, data from images where id = $1", [id]);
  if (!rows[0]) fail(404, "Image not found");
  return rows[0];
}

/* ---------- Form helpers for the admin product editor ---------- */
export async function meta() {
  const [{ departments }, cats, brands] = await Promise.all([
    getSettings(),
    q("select dept, cat, count(*)::int n from products group by 1,2 order by 3 desc"),
    q("select brand, count(*)::int n from products where brand <> '' group by 1 order by 2 desc")
  ]);
  const categories = {};
  cats.rows.forEach(r => { (categories[r.dept] ||= []).push(r.cat); });
  return { departments, categories, brands: brands.rows.map(r => r.brand) };
}
