# Seven Notes website

Storefront for **Seven Notes**, a music instrument store in Lucknow. It lists all 540 SKUs from the store's stock sheet across seven departments:

| Department | Products |
|---|---|
| Guitars & Basses | 137 |
| Ukuleles, Violins & Folk | 78 |
| Keys & MIDI | 28 |
| Drums & Percussion | 36 |
| Studio & Live Sound | 37 |
| Amps & Effects | 50 |
| Strings & Accessories | 174 |

The storefront lives in `public/`, the API in `api/` and `server/`, and the database is Postgres. Without a database, the storefront still works from the bundled catalogue and falls back to WhatsApp enquiries.

## Storefront

- **Home:** playable strings (one per department, with optional sound), department tiles, an in-stock rail, a pinned guitar journey, a brand marquee, a string finder and store details.
- **Shopping:** listings with filters and live counts, instant search (press `/`), product pages with gallery, colour options, MRP and discount, "goes well with" items, and a wishlist.
- **Checkout:** delivery or store pickup; cash on delivery, UPI after confirmation, or pay at store. No card details are taken online. Customers get an order number and can follow it on **Track your order**.
- **Motion:** GSAP, ScrollTrigger, Flip, SplitText and Lenis (vendored in `public/assets/vendor`). It respects `prefers-reduced-motion`.

## Seller Hub (admin portal)

Open **`/admin/`** on your site, e.g. `https://your-site.vercel.app/admin/`. It's laid out like Amazon Seller Central:

- **Home:** action items (orders to accept, to ship, listings without prices or photos, out of stock), a snapshot (today's sales, open orders, low stock, inventory value), a 14-day sales chart, latest orders and running-low items. New orders trigger a toast and a chime, and the tab shows a pending count.
- **Orders:** tabs for waiting, to pack and ship, shipped, ready for pickup, delivered, cancelled and rejected. Accept or reject, mark packed, ship with carrier and tracking number, mark delivered or collected, or cancel (stock is added back). The order page shows customer details with call, WhatsApp and email buttons, the payment status, an internal notes field and the order history. You can print a **GST tax invoice** (CGST/SGST or IGST worked out automatically) and a **packing slip**. Orders with "Price on request" items let you enter prices before accepting.
- **Inventory and pricing:** filter, search and sort. Edit stock, price and MRP inline, toggle active/inactive, use bulk actions, or export to CSV.
- **Add or edit a product:** vital info, offer (price, MRP, stock, GST rate, HSN), drag-and-drop photos (resized in the browser and reorderable), description, a details table and variation families (colour options).
- **Bulk upload:** a CSV template, a preview, then create or update hundreds of products at once.
- **Customers:** everyone who has ordered, with order counts, total spend and quick contact links.
- **Reports:** sales per day (7/30/90/365 days), top products, sales by department and payment-method split.
- **Settings:** store details, opening hours, GSTIN, UPI ID, delivery charge, free-delivery threshold, and which payment and pickup options are offered.

Stock is deducted when you **accept** an order, and the storefront picks up changes within about 30 seconds.

## Setting it up on Vercel (one time)

1. **Database:** Vercel → your project → **Storage** → **Create Database** → **Neon (Postgres)** → connect it to this project. This adds `DATABASE_URL` for you. On first use, the tables are created and all 540 products are imported automatically.
2. **Admin password:** **Settings → Environment Variables** → add `ADMIN_PASSWORD` (a long password only you know).
3. **Photo storage (recommended):** **Storage → Create → Blob** → connect to this project. This adds `BLOB_READ_WRITE_TOKEN`. Without it, uploaded photos are stored in the database, which works but uses its space.
4. **Redeploy**, then open `/admin/`, sign in and fill in **Settings**.

`vercel.json` already points Vercel at `public/` and the API function, so no dashboard build settings are needed.

## Running locally

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/sevennotes ADMIN_PASSWORD=choose-one npm run dev
```

Open http://localhost:3000 (store) and http://localhost:3000/admin/ (Seller Hub).

## Updating stock from the sheet

```bash
curl -L "https://docs.google.com/spreadsheets/d/1lC9KxEm2eVaLZ6Sc1uZYbFUFfLxc9t25ivs_VYeNNrc/export?format=csv&gid=0" -o sku.csv
python3 scripts/classify.py sku.csv > scripts/products.raw.json
python3 scripts/build_catalog.py scripts/products.raw.json scripts/images.json
```

This refreshes the bundled fallback catalogue and the first-run seed. Once the database is live, update stock and prices in Seller Hub (or by bulk upload) instead.

`classify.py` assigns brand, department, category and colour using the rules at the top of the file. Product IDs come from the sheet's item name, so keep names stable to keep their photos.

### Re-sourcing photos (optional)

```bash
mkdir -p .cache/cat
python3 scripts/images/pull_catalog.py www.bajaao.com .cache/cat/www.bajaao.com.json
python3 scripts/images/fetch_images.py scripts/products.raw.json scripts/images.json
```

Photos are matched only through the verified terms in `scripts/image_hints.py`, so a product never gets a lookalike photo. Where the right colour wasn't available, the product deliberately keeps its artwork.
