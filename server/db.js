// Postgres connection + schema. Works with Neon (Vercel Storage) or any Postgres via DATABASE_URL.
import pg from "pg";
import { readFile } from "node:fs/promises";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const hasDb = Boolean(url);

let pool;
export function db() {
  if (!hasDb) throw Object.assign(new Error("Database not configured. Connect a Postgres database (Vercel Storage, Neon) and redeploy."), { status: 503 });
  if (!pool) {
    const local = /localhost|127\.0\.0\.1|host=\//.test(url);
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, ssl: local ? false : { rejectUnauthorized: false } });
  }
  return pool;
}
export const q = (text, params) => db().query(text, params);

const SCHEMA = `
create table if not exists products (
  id text primary key,
  sku text,
  name text not null,
  brand text not null default '',
  dept text not null,
  cat text not null,
  colour text,
  family text,
  stock integer not null default 0,
  price numeric(12,2),
  mrp numeric(12,2),
  gst_rate numeric(5,2) not null default 18,
  hsn text,
  images jsonb not null default '[]',
  specs jsonb not null default '{}',
  description text not null default '',
  art text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_dept on products(dept);
create table if not exists orders (
  id serial primary key,
  number text unique not null,
  status text not null default 'pending',
  customer jsonb not null,
  items jsonb not null,
  subtotal numeric(12,2) not null default 0,
  shipping numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  has_unpriced boolean not null default false,
  fulfilment text not null default 'delivery',
  payment_method text not null default 'cod',
  payment_status text not null default 'unpaid',
  notes text not null default '',
  internal_notes text not null default '',
  tracking jsonb,
  stock_applied boolean not null default false,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status on orders(status);
create index if not exists orders_created on orders(created_at desc);
create table if not exists settings (key text primary key, value jsonb not null);
create table if not exists images (id text primary key, mime text not null, data bytea not null, created_at timestamptz not null default now());
`;

let ready;
/** Create tables on first use and seed the catalogue from the SKU sheet export if the shop is empty. */
export function ensureSchema() {
  if (!ready) ready = (async () => {
    await q(SCHEMA);
    const { rows } = await q("select count(*)::int n from products");
    if (rows[0].n === 0) await seed();
  })().catch(e => { ready = null; throw e; });
  return ready;
}

async function seed() {
  const raw = JSON.parse(await readFile(new URL("./seed/catalog.json", import.meta.url), "utf8"));
  // Variation families: products listed as colour/size variants of each other share one family key.
  const fam = {};
  raw.products.forEach(p => { if (p.variants.length) fam[p.id] = [p.id, ...p.variants].sort()[0]; });
  // One round trip for the whole catalogue: the function and database may be continents apart.
  const rows = raw.products.map(p => ({
    id: p.id, sku: p.id.toUpperCase(), name: p.name, brand: p.brand, dept: p.dept, cat: p.cat, colour: p.colour, family: fam[p.id] || null,
    stock: p.stock, price: p.price, images: p.images.map(i => (i.startsWith("/") || i.startsWith("http") ? i : "/" + i)), specs: p.specs || {}, description: p.desc, art: p.art
  }));
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into products (id, sku, name, brand, dept, cat, colour, family, stock, price, images, specs, description, art)
       select id, sku, name, coalesce(brand, ''), dept, cat, colour, family, coalesce(stock, 0), price, coalesce(images, '[]'), coalesce(specs, '{}'), coalesce(description, ''), art
       from jsonb_to_recordset($1::jsonb) as r(id text, sku text, name text, brand text, dept text, cat text, colour text, family text, stock int, price numeric, images jsonb, specs jsonb, description text, art text)
       on conflict (id) do nothing`, [JSON.stringify(rows)]);
    await client.query("insert into settings (key, value) values ('departments', $1) on conflict do nothing", [JSON.stringify(raw.departments)]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
