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

It's a static site with no build step and no server. Open `index.html` through any static host (GitHub Pages, Netlify, Cloudflare Pages) or run it locally:

```bash
python3 -m http.server 8000
```

## What's in it

- **Home:** a playable hero (seven strings, one per department; sweep across them to pluck, with optional synthesised sound), a department grid, an in-stock rail, a pinned "first chord to first gig" guitar journey, a brand marquee, a string finder, services and store details.
- **Listings:** category chips, facet filters with live counts (category, brand, colour, in stock), sorting, grid/list view and animated filtering.
- **Product pages:** a zoomable gallery, colour variants, stock status, a quantity picker, "Goes well with" accessory pairings, similar products and recently viewed items.
- **Search:** instant suggestions for categories, brands and products, with keyboard navigation (press `/` to focus).
- **Enquiry list:** shoppers build a list and send it to the store on WhatsApp or by email. No online payment, since the sheet has no prices yet.
- **Motion:** GSAP, ScrollTrigger, Flip, SplitText and Lenis (vendored in `assets/vendor`). It respects `prefers-reduced-motion`.

## Before going live

1. Fill in the `TODO`s in `assets/js/config.js`: address, phone, WhatsApp number, email, hours and the Maps link.
2. Prices are hidden ("Price on request") because the stock sheet has none. To show them, add a `price` to products in the catalogue and set `showPrices: true`.
3. 264 of 540 products have a verified manufacturer/retailer photo. The rest show department artwork marked "Photo coming soon". To add a photo, drop `assets/img/products/<product-id>-1.webp` in and list it in `scripts/images.json`, or add a hint in `scripts/image_hints.py` and re-run the image step.

## Updating stock from the sheet

```bash
curl -L "https://docs.google.com/spreadsheets/d/1lC9KxEm2eVaLZ6Sc1uZYbFUFfLxc9t25ivs_VYeNNrc/export?format=csv&gid=0" -o sku.csv
python3 scripts/classify.py sku.csv > scripts/products.raw.json
python3 scripts/build_catalog.py scripts/products.raw.json scripts/images.json
```

`classify.py` assigns brand, department, category and colour using the rules at the top of the file. Product IDs come from the sheet's item name, so keep names stable to keep their photos.

### Re-sourcing photos (optional)

```bash
mkdir -p .cache/cat
python3 scripts/images/pull_catalog.py www.bajaao.com .cache/cat/www.bajaao.com.json
python3 scripts/images/fetch_images.py scripts/products.raw.json scripts/images.json
```

Photos are matched only through the verified terms in `scripts/image_hints.py`, so a product never gets a lookalike photo. Where the right colour wasn't available, the product deliberately keeps its artwork.
