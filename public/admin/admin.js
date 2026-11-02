/* Seven Notes Seller Hub */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const view = $("#view");
  const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const INR2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
  const money = v => (v === null || v === undefined ? "—" : INR.format(v));
  const when = d => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const day = d => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const ago = d => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(d); };
  const STATUS = { pending: "Waiting for you", accepted: "Accepted", packed: "Packed", shipped: "Shipped", ready: "Ready for pickup", delivered: "Delivered", cancelled: "Cancelled", rejected: "Rejected" };
  const PAY = { cod: "Cash on delivery", upi: "UPI (after confirmation)", store: "Pay at store" };
  const pill = (s, label) => `<span class="pill pill--${esc(s)}">${esc(label || STATUS[s] || s)}</span>`;
  let META = null, SETTINGS = null;

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const o = { method: opts.method || "GET", headers: { "x-sn-admin": "1" }, credentials: "same-origin" };
    if (opts.body !== undefined) {
      if (opts.raw) { o.body = opts.body; Object.assign(o.headers, opts.headers); }
      else { o.body = JSON.stringify(opts.body); o.headers["content-type"] = "application/json"; }
    }
    const r = await fetch("/api" + path, o);
    let data = null; try { data = await r.json(); } catch {}
    if (r.status === 401 && !path.startsWith("/admin/login")) { showLogin(); throw new Error("Signed out"); }
    if (!r.ok) throw new Error((data && data.error) || `Request failed (${r.status})`);
    return data;
  }
  function toast(msg, err) {
    const t = document.createElement("div"); t.className = "toast" + (err ? " toast--err" : ""); t.innerHTML = msg;
    $("#toasts").append(t); setTimeout(() => t.remove(), err ? 6000 : 4000);
  }
  const fail = e => { if (e.message !== "Signed out") toast(esc(e.message), true); };

  /* ---------- Login ---------- */
  async function showLogin(msg) {
    $("#shell").hidden = true; const L = $("#login"); L.hidden = false;
    let me = {}; try { me = await (await fetch("/api/admin/me")).json(); } catch {}
    const setup = !me.db ? `<div class="notice">No database is connected yet. In Vercel, open your project → <b>Storage</b> → <b>Create Database</b> → <b>Neon (Postgres)</b>, connect it to this project, then redeploy.</div>`
      : !me.configured ? `<div class="notice">Set an admin password first: Vercel → your project → <b>Settings → Environment Variables</b> → add <code>ADMIN_PASSWORD</code>, then redeploy.</div>` : "";
    L.innerHTML = `<form class="login__card" id="loginForm">
      <img src="/assets/img/logo-full.png" alt="Seven Notes">
      <h1>Sign in to Seller Hub</h1>${setup}
      <label class="field"><span>Admin password</span><input class="input" type="password" id="pw" autocomplete="current-password" required ${setup ? "disabled" : "autofocus"}></label>
      <p class="login__err" id="loginErr">${esc(msg || "")}</p>
      <button class="btn btn--primary" ${setup ? "disabled" : ""}>Sign in</button>
      <a href="/">Back to the store</a></form>`;
    $("#loginForm").addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/admin/login", { method: "POST", body: { password: $("#pw").value } }); L.hidden = true; start(); }
      catch (err) { $("#loginErr").textContent = err.message; }
    });
  }

  /* ---------- Shell ---------- */
  function shell() {
    $("#shell").hidden = false;
    const side = $("#side"), scrim = $("#scrim");
    const toggle = on => { side.hidden = !on; scrim.hidden = !on; $("#menuBtn").setAttribute("aria-expanded", on); };
    $("#menuBtn").onclick = () => toggle(true); $("#sideClose").onclick = scrim.onclick = () => toggle(false);
    side.onclick = e => { if (e.target.closest("a")) toggle(false); };
    $("#signOut").onclick = async () => { await api("/admin/logout", { method: "POST" }).catch(() => {}); showLogin(); };
    $("#topSearch").onsubmit = e => {
      e.preventDefault(); const v = $("#topQ").value.trim(); if (!v) return;
      location.hash = /^SN\d{6}-\d+$/i.test(v) ? "#/orders/" + v.toUpperCase() : /^\d{5,}$/.test(v) || /^SN/i.test(v) ? "#/orders?q=" + encodeURIComponent(v) : "#/inventory?q=" + encodeURIComponent(v);
    };
  }
  let lastPending = null, audio;
  async function poll() {
    try {
      const d = await api("/admin/orders?status=pending&size=10");
      const n = d.total;
      $("#bell").hidden = !n; $("#bell").textContent = n;
      $("#navPending").hidden = !n; $("#navPending").textContent = n;
      document.title = (n ? `(${n}) ` : "") + "Seller Hub | Seven Notes";
      if (lastPending !== null && n > lastPending) {
        const o = d.items[0];
        toast(`New order <b>${esc(o.number)}</b> from ${esc(o.customer.name)}. <a href="#/orders/${esc(o.number)}">Review it</a>`);
        chime();
      }
      lastPending = n;
    } catch {}
  }
  function chime() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.15); g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + i * 0.15 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.15 + 0.5); o.connect(g).connect(audio.destination); o.start(audio.currentTime + i * 0.15); o.stop(audio.currentTime + i * 0.15 + 0.55); });
    } catch {}
  }

  /* ---------- Router ---------- */
  function route() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?"); const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(qs || "");
    const nav = !seg[0] ? "home" : seg[0] === "inventory" ? (seg[1] === "new" ? "new" : params.get("missing") === "price" ? "pricing" : "inventory") : seg[0];
    $$(".bookmarks a").forEach(a => a.classList.toggle("is-on", a.dataset.nav === nav));
    view.innerHTML = '<p class="loading">Loading…</p>';
    window.scrollTo(0, 0);
    const R = { "": home, orders: () => seg[1] ? (seg[2] === "invoice" || seg[2] === "slip" ? printDoc(seg[1], seg[2]) : orderDetail(seg[1])) : orders(params),
      inventory: () => seg[1] ? editor(seg[1]) : inventory(params), upload, customers: () => customers(params), reports: () => reports(params), settings };
    (R[seg[0] || ""] || (() => { view.innerHTML = '<div class="empty"><h3>Page not found</h3><a href="#/">Go to Home</a></div>'; }))();
  }
  const setHashQuiet = h => history.replaceState(null, "", h);

  /* ---------- Home ---------- */
  async function home() {
    const d = await api("/admin/dashboard").catch(fail); if (!d) return;
    const c = d.counts, inv = d.inventory;
    const open = (c.pending || 0) + (c.accepted || 0) + (c.packed || 0) + (c.ready || 0);
    const act = (n, label, href, hot) => `<a href="${href}" class="${n ? (hot ? "hot" : "") : "zero"}"><span>${label}</span><b>${n}</b></a>`;
    view.innerHTML = `
      <div class="phead"><div><h1>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</h1><p>Here's what needs attention at Seven Notes today.</p></div>
        <div class="phead__actions"><a class="btn" href="#/upload">Bulk upload</a><a class="btn btn--primary" href="#/inventory/new">Add a product</a></div></div>
      <div class="grid-home">
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Actions</h2></div><div class="actions">
            ${act(c.pending || 0, "Orders to accept", "#/orders?status=pending", true)}
            ${act((c.accepted || 0) + (c.packed || 0), "Orders to pack and ship", "#/orders?status=unshipped", true)}
            ${act(c.ready || 0, "Waiting for customer pickup", "#/orders?status=ready")}
            ${act(inv.noprice, "Listings without a price", "#/inventory?missing=price")}
            ${act(inv.noimage, "Listings without photos", "#/inventory?missing=images")}
            ${act(inv.out, "Active listings out of stock", "#/inventory?stock=out")}
          </div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="snap">
            <a href="#/reports"><small>Sales today</small><strong>${money(d.today.v)}</strong><em>${d.today.n} order${d.today.n === 1 ? "" : "s"}</em></a>
            <a href="#/orders?status=open"><small>Open orders</small><strong>${open}</strong><em>${c.pending || 0} waiting for you</em></a>
            <a href="#/inventory?status=active"><small>Active listings</small><strong>${inv.active}</strong><em>${inv.inactive} inactive</em></a>
            <a href="#/inventory?stock=low"><small>Low stock (1 to 2 left)</small><strong>${inv.low}</strong><em>${inv.out} out of stock</em></a>
            <div><small>Inventory value</small><strong>${money(inv.value)}</strong><em>priced items in stock</em></div>
          </div></section>
          <section class="card"><div class="card__h"><h2>Sales, last 14 days</h2><a href="#/reports">Open reports</a></div><div class="card__b">${barChart(d.series, "sales")}</div></section>
          <section class="card"><div class="card__h"><h2>Latest orders</h2><a href="#/orders">Manage orders</a></div>${orderTable(d.recent, { compact: true })}</section>
        </div>
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Running low</h2><a href="#/inventory?stock=low">See all</a></div>
            ${d.lowStock.length ? `<table class="t"><tbody>${d.lowStock.map(p => `<tr><td>${thumb(p)}</td><td><a class="name" href="#/inventory/${esc(p.id)}">${esc(p.name)}</a><span class="sub">${p.stock ? p.stock + " left" : "Out of stock"}</span></td></tr>`).join("")}</tbody></table>` : '<p class="empty">Nothing is running low.</p>'}
          </section>
        </div>
      </div>`;
    wireCharts(); wireOrderActions(home);
  }

  /* ---------- Charts (single series: neel bars, rounded data-ends, hover tooltip, table view) ---------- */
  function barChart(series, key) {
    return `<div class="chart" data-series="${encodeURIComponent(JSON.stringify(series))}" data-key="${key}">${chartSvg(series, key, 760)}<div class="tip" hidden></div></div>
      <details class="datatable"><summary>Show as table</summary><table class="t"><thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Sales</th></tr></thead><tbody>${series.map(s => `<tr><td>${day(s.day)}</td><td class="num">${s.orders}</td><td class="num">${money(s.sales)}</td></tr>`).join("")}</tbody></table></details>`;
  }
  /* Drawn at the container's real width so text stays 11px at any size. */
  function chartSvg(series, key, W) {
    const H = 240, P = { l: 56, r: 8, t: 10, b: 26 };
    const max = Math.max(1, ...series.map(s => s[key]));
    const step = niceStep(max), top = Math.ceil(max / step) * step;
    const iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / series.length, w = Math.max(4, Math.min(28, bw - 6));
    const y = v => P.t + ih - (v / top) * ih;
    let g = "", bars = "", hits = "", ax = "";
    for (let v = 0; v <= top; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/>` + `<text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? "₹" + Math.round(v / 1000) + "k" : "₹" + v}</text>`;
    series.forEach((s, i) => {
      const x = P.l + i * bw + (bw - w) / 2, v = s[key], h = Math.max(0, (v / top) * ih), yy = P.t + ih - h;
      if (h > 0) { const r = Math.min(4, w / 2, h); bars += `<path class="bar" data-i="${i}" d="M${x},${P.t + ih} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + w - r} Q${x + w},${yy} ${x + w},${yy + r} V${P.t + ih} Z"/>`; }
      hits += `<rect class="hit" data-i="${i}" x="${P.l + i * bw}" y="${P.t}" width="${bw}" height="${ih}"/>`;
      const every = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(iw / 64))));
      if ((series.length - 1 - i) % every === 0) ax += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${day(s.day)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sales per day, ${series.length} days"><g class="grid axis">${g}</g>${bars}<g class="axis">${ax}</g>${hits}</svg>`;
  }
  function niceStep(max) { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  let chartRO = null;
  function wireCharts() {
    if (chartRO) chartRO.disconnect();
    chartRO = new ResizeObserver(entries => entries.forEach(en => {
      const ch = en.target, w = Math.round(ch.clientWidth);
      if (!w || +ch.dataset.w === w) return; ch.dataset.w = w;
      $("svg", ch).outerHTML = chartSvg(JSON.parse(decodeURIComponent(ch.dataset.series)), ch.dataset.key, w);
    }));
    $$(".chart").forEach(ch => {
      chartRO.observe(ch);
      const series = JSON.parse(decodeURIComponent(ch.dataset.series)), tip = $(".tip", ch);
      ch.addEventListener("pointermove", e => {
        const hit = e.target.closest(".hit"); $$(".bar", ch).forEach(b => b.classList.remove("is-hover"));
        if (!hit) { tip.hidden = true; return; }
        const i = +hit.dataset.i, s = series[i], bar = $(`.bar[data-i="${i}"]`, ch); bar && bar.classList.add("is-hover");
        const r = ch.getBoundingClientRect(), hr = hit.getBoundingClientRect();
        tip.innerHTML = `<b>${money(s.sales)}</b>${day(s.day)}, ${s.orders} order${s.orders === 1 ? "" : "s"}`;
        tip.hidden = false; tip.style.left = (hr.left - r.left + hr.width / 2) + "px";
        const bb = bar ? bar.getBoundingClientRect().top : hr.bottom - 4; tip.style.top = (bb - r.top) + "px";
      });
      ch.addEventListener("pointerleave", () => { tip.hidden = true; $$(".bar", ch).forEach(b => b.classList.remove("is-hover")); });
    });
  }

  /* ---------- Orders ---------- */
  const thumb = p => { const img = p.images ? p.images[0] : p.image; return img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : `<span class="thumbart"><svg viewBox="0 0 64 64">${(window.ART || {})[p.art] || (window.ART || {}).strings || ""}</svg></span>`; };
  function rowActions(o) {
    const b = (a, label, cls = "") => `<button class="btn btn--sm ${cls}" data-act="${a}" data-n="${esc(o.number)}">${label}</button>`;
    if (o.status === "pending") return o.hasUnpriced ? `<a class="btn btn--sm btn--primary" href="#/orders/${esc(o.number)}">Set prices</a>` + b("reject", "Reject", "btn--danger") : b("accept", "Accept", "btn--primary") + b("reject", "Reject", "btn--danger");
    if (o.status === "accepted") return b("pack", "Mark packed", "btn--primary");
    if (o.status === "packed") return o.fulfilment === "pickup" ? b("ready", "Ready for pickup", "btn--primary") : b("ship", "Ship", "btn--primary");
    if (o.status === "shipped" || o.status === "ready") return b("deliver", o.status === "ready" ? "Mark collected" : "Mark delivered", "btn--primary");
    return "";
  }
  function orderTable(list, { compact } = {}) {
    if (!list.length) return '<div class="empty"><h3>No orders here yet</h3><p>New orders from the website appear here.</p></div>';
    return `<div class="tablewrap"><table class="t"><thead><tr><th>Order date</th><th>Order</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th>${compact ? "" : "<th>Action</th>"}</tr></thead><tbody>
      ${list.map(o => `<tr>
        <td><b>${ago(o.createdAt)}</b><div class="sub">${when(o.createdAt)}</div></td>
        <td><a class="name" href="#/orders/${esc(o.number)}">${esc(o.number)}</a><span class="sub">${o.fulfilment === "pickup" ? "Store pickup" : "Delivery"}, ${esc(PAY[o.paymentMethod] || o.paymentMethod)}</span></td>
        <td>${esc(o.customer.name)}<div class="sub">${esc(o.customer.city || "Pickup")}${o.customer.pincode ? " " + esc(o.customer.pincode) : ""}</div></td>
        <td><div style="display:flex;gap:8px;align-items:center">${thumb(o.items[0])}<span>${esc(o.items[0].name)}${o.items.length > 1 ? `<div class="sub">+ ${o.items.length - 1} more</div>` : `<div class="sub">Qty ${o.items[0].qty}</div>`}</span></div></td>
        <td class="num"><b>${money(o.total)}</b>${o.hasUnpriced ? '<div class="sub">price to confirm</div>' : ""}</td>
        <td>${pill(o.status)}</td>${compact ? "" : `<td><div class="rowact">${rowActions(o)}<a class="btn btn--sm" href="#/orders/${esc(o.number)}">View</a></div></td>`}
      </tr>`).join("")}</tbody></table></div>`;
  }
  async function orders(params) {
    const status = params.get("status") || "", q = params.get("q") || "", page = params.get("page") || 1, phone = params.get("phone") || "";
    const d = await api(`/admin/orders?status=${status}&q=${encodeURIComponent(q)}&page=${page}&phone=${encodeURIComponent(phone)}`).catch(fail); if (!d) return;
    const c = d.counts, sum = (...k) => k.reduce((a, s) => a + (c[s] || 0), 0);
    const tabs = [["pending", "Waiting for you", sum("pending")], ["unshipped", "To pack and ship", sum("accepted", "packed")], ["shipped", "Shipped", sum("shipped")], ["ready", "Ready for pickup", sum("ready")], ["delivered", "Delivered", sum("delivered")], ["cancelled", "Cancelled", sum("cancelled")], ["rejected", "Rejected", sum("rejected")], ["", "All orders", Object.values(c).reduce((a, b) => a + b, 0)]];
    view.innerHTML = `<div class="phead"><div><h1>Manage orders</h1><p>Accept new orders, then pack, ship and close them out.</p></div></div>
      <section class="card">
        <nav class="tabs">${tabs.map(([s, l, n]) => `<a href="#/orders${s ? "?status=" + s : ""}" class="${status === s ? "is-on" : ""}">${l}<span>${n}</span></a>`).join("")}</nav>
        <form class="filters" id="of"><input class="input" type="search" name="q" value="${esc(q)}" placeholder="Order number, customer, phone or product"><button class="btn">Search</button>${phone ? `<span class="pill pill--accepted">Customer ${esc(phone)}</span><a href="#/orders">Clear</a>` : ""}</form>
        ${orderTable(d.items)}${pager(d, p => `#/orders?status=${status}&q=${encodeURIComponent(q)}&page=${p}`)}
      </section>`;
    $("#of").onsubmit = e => { e.preventDefault(); location.hash = `#/orders?status=${status}&q=${encodeURIComponent(e.target.q.value.trim())}`; };
    wireOrderActions(() => orders(params));
  }
  const pager = (d, href) => { const pages = Math.ceil(d.total / d.size); return pages > 1 ? `<div class="pager"><span>Page ${d.page} of ${pages}, ${d.total} total</span><span class="rowact">${d.page > 1 ? `<a class="btn btn--sm" href="${href(d.page - 1)}">Previous</a>` : ""}${d.page < pages ? `<a class="btn btn--sm" href="${href(+d.page + 1)}">Next</a>` : ""}</span></div>` : `<div class="pager"><span>${d.total} total</span></div>`; };

  function wireOrderActions(refresh) {
    view.onclick = async e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const ok = await runAction(b.dataset.n, b.dataset.act); if (ok) refresh();
    };
  }
  async function runAction(number, act, extra = {}) {
    let body = { action: act, ...extra };
    if (act === "reject" || act === "cancel") {
      const r = await ask(act === "reject" ? "Reject this order?" : "Cancel this order?", `<label class="field"><span>Reason (the customer sees this)</span><textarea class="textarea" name="note" rows="3" required placeholder="e.g. Out of stock with our distributor"></textarea></label>${act === "cancel" ? "<p class='notice notice--info'>Stock taken for this order is added back to inventory.</p>" : ""}`, act === "reject" ? "Reject order" : "Cancel order");
      if (!r) return false; body.note = r.note;
    } else if (act === "ship") {
      const r = await ask("Ship this order", `<label class="field"><span>Carrier</span><input class="input" name="carrier" list="carriers" required placeholder="Delhivery"><datalist id="carriers"><option>Delhivery</option><option>Blue Dart</option><option>DTDC</option><option>India Post</option><option>Shiprocket</option><option>Ekart</option><option>Own delivery</option></datalist></label>
        <label class="field"><span>Tracking number</span><input class="input" name="trackingNumber"></label><label class="field"><span>Tracking link (optional)</span><input class="input" name="trackingUrl" type="url" placeholder="https://"></label>`, "Confirm shipment");
      if (!r) return false; Object.assign(body, r);
    } else if (act === "accept") {
      body.note = "";
    }
    try { await api(`/admin/orders/${encodeURIComponent(number)}/action`, { method: "POST", body }); toast(`Order <b>${esc(number)}</b> updated`); poll(); return true; }
    catch (e) { fail(e); return false; }
  }
  function ask(title, html, okLabel) {
    return new Promise(resolve => {
      const m = $("#modal");
      $("#modalBox").innerHTML = `<form id="mf"><h2 id="modalTitle">${esc(title)}</h2><div class="card__b">${html}</div><div class="modal__foot"><button type="button" class="btn" id="mcancel">Go back</button><button class="btn btn--primary">${esc(okLabel)}</button></div></form>`;
      m.hidden = false; setTimeout(() => { const f = $("#mf input, #mf textarea"); f && f.focus(); }, 30);
      const done = v => { m.hidden = true; document.removeEventListener("keydown", key); resolve(v); };
      const key = e => { if (e.key === "Escape") done(null); };
      document.addEventListener("keydown", key);
      $("#mcancel").onclick = () => done(null);
      $("#mf").onsubmit = e => { e.preventDefault(); done(Object.fromEntries(new FormData(e.target))); };
    });
  }

  async function orderDetail(number) {
    const o = await api("/admin/orders/" + encodeURIComponent(number)).catch(fail); if (!o) return;
    const c = o.customer, pending = o.status === "pending";
    const wa = c.phone ? `https://wa.me/91${c.phone}?text=${encodeURIComponent(`Hi ${c.name}, this is Seven Notes about your order ${o.number}.`)}` : "";
    const next = rowActions(o);
    view.innerHTML = `
      <p class="crumbs"><a href="#/orders">Manage orders</a> › Order details</p>
      <div class="phead"><div><h1>Order ${esc(o.number)}</h1><p>Placed ${when(o.createdAt)} ${pill(o.status)} ${pill(o.paymentStatus, o.paymentStatus === "paid" ? "Paid" : "Unpaid")}</p></div>
        <div class="phead__actions actionbar">${next}${!["delivered", "cancelled", "rejected", "pending"].includes(o.status) ? `<button class="btn btn--danger" data-act="cancel" data-n="${esc(o.number)}">Cancel order</button>` : ""}
          <a class="btn" href="#/orders/${esc(o.number)}/invoice">Print invoice</a><a class="btn" href="#/orders/${esc(o.number)}/slip">Packing slip</a></div></div>
      ${pending && o.hasUnpriced ? '<p class="notice" style="margin-bottom:16px">Some items have no price yet. Enter the prices below and save, then accept the order.</p>' : ""}
      <div class="two">
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Items</h2>${pending ? '<button class="btn btn--sm" id="savePrices">Save prices</button>' : ""}</div>
            <div class="tablewrap"><table class="t"><thead><tr><th></th><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Line total</th></tr></thead><tbody>
            ${o.items.map(i => `<tr><td>${thumb(i)}</td><td><a class="name" href="#/inventory/${esc(i.id)}">${esc(i.name)}</a><span class="sub">SKU ${esc(i.sku || i.id)}</span></td><td class="num">${i.qty}</td>
              <td class="num">${pending ? `<input class="input inline" data-price="${esc(i.id)}" type="number" min="0" step="1" value="${i.price ?? ""}" placeholder="Price">` : money(i.price)}</td><td class="num">${i.price === null ? "—" : money(i.price * i.qty)}</td></tr>`).join("")}
            </tbody></table></div>
            <div class="totals"><span>Items</span><span>${money(o.subtotal)}</span><span>${o.fulfilment === "pickup" ? "Store pickup" : "Delivery"}</span><span>${o.shipping ? money(o.shipping) : "Free"}</span><span class="grand">Order total</span><span class="grand">${money(o.total)}</span></div>
          </section>
          <section class="card"><div class="card__h"><h2>Order history</h2></div><div class="card__b"><ul class="timeline">${o.history.map(h => `<li><b>${esc(h.note || STATUS[h.status])}</b><time>${when(h.at)}</time></li>`).join("")}</ul></div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card__h"><h2>Customer</h2><a href="#/orders?phone=${esc(c.phone)}">All their orders</a></div><div class="card__b">
            <dl class="kv"><dt>Name</dt><dd>${esc(c.name)}</dd><dt>Phone</dt><dd><a href="tel:+91${esc(c.phone)}">+91 ${esc(c.phone)}</a></dd>${c.email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ""}
            <dt>${o.fulfilment === "pickup" ? "Collecting" : "Ship to"}</dt><dd>${o.fulfilment === "pickup" ? "Store pickup" : `${esc(c.address)}<br>${esc(c.city)}${c.state ? ", " + esc(c.state) : ""} ${esc(c.pincode)}`}</dd>
            ${o.notes ? `<dt>Customer note</dt><dd>${esc(o.notes)}</dd>` : ""}</dl>
            <div class="actionbar" style="margin-top:14px"><a class="btn btn--sm" href="tel:+91${esc(c.phone)}">Call</a>${wa ? `<a class="btn btn--sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${c.email ? `<a class="btn btn--sm" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Your Seven Notes order " + o.number)}">Email</a>` : ""}</div>
          </div></section>
          <section class="card"><div class="card__h"><h2>Payment</h2>${o.paymentStatus === "paid" ? `<button class="btn btn--sm" data-pay="unpaid">Mark unpaid</button>` : `<button class="btn btn--sm btn--primary" data-pay="paid">Mark paid</button>`}</div><div class="card__b"><dl class="kv"><dt>Method</dt><dd>${esc(PAY[o.paymentMethod] || o.paymentMethod)}</dd><dt>Status</dt><dd>${pill(o.paymentStatus, o.paymentStatus === "paid" ? "Paid" : "Unpaid")}</dd>${o.paymentMethod === "upi" && SETTINGS && SETTINGS.upiId ? `<dt>Your UPI ID</dt><dd>${esc(SETTINGS.upiId)}</dd>` : ""}</dl></div></section>
          ${o.tracking ? `<section class="card"><div class="card__h"><h2>Shipment</h2></div><div class="card__b"><dl class="kv"><dt>Carrier</dt><dd>${esc(o.tracking.carrier)}</dd><dt>Tracking</dt><dd>${o.tracking.url ? `<a href="${esc(o.tracking.url)}" target="_blank" rel="noopener">${esc(o.tracking.number || "Track")}</a>` : esc(o.tracking.number || "—")}</dd></dl></div></section>` : ""}
          <section class="card"><div class="card__h"><h2>Internal notes</h2></div><div class="card__b"><textarea class="textarea" id="inotes" rows="4" style="width:100%" placeholder="Only your team sees this">${esc(o.internalNotes)}</textarea><button class="btn btn--sm" id="saveNotes" style="margin-top:8px">Save notes</button></div></section>
        </div>
      </div>`;
    const reload = () => orderDetail(number);
    wireOrderActions(reload);
    const sp = $("#savePrices");
    if (sp) sp.onclick = async () => {
      const prices = {}; $$("[data-price]").forEach(i => { prices[i.dataset.price] = i.value; });
      try { await api(`/admin/orders/${encodeURIComponent(number)}/action`, { method: "POST", body: { action: "prices", prices } }); toast("Prices saved"); reload(); } catch (e) { fail(e); }
    };
    $$("[data-pay]").forEach(b => b.onclick = async () => { if (await runAction(number, b.dataset.pay)) reload(); });
    $("#saveNotes").onclick = async () => { try { await api(`/admin/orders/${encodeURIComponent(number)}/action`, { method: "POST", body: { action: "note", internalNotes: $("#inotes").value } }); toast("Notes saved"); } catch (e) { fail(e); } };
  }

  /* GST invoice / packing slip. Prices on the site are GST-inclusive. */
  async function printDoc(number, kind) {
    const [o, s] = await Promise.all([api("/admin/orders/" + encodeURIComponent(number)), SETTINGS ? Promise.resolve(SETTINGS) : api("/admin/settings")]).catch(e => { fail(e); return []; });
    if (!o) return;
    const c = o.customer, intra = o.fulfilment === "pickup" || !c.state || c.state.trim().toLowerCase() === (s.state || "").toLowerCase();
    let taxable = 0, tax = 0;
    const rows = o.items.map((i, n) => {
      const gross = (i.price || 0) * i.qty, rate = i.gstRate ?? 18, base = gross / (1 + rate / 100);
      taxable += base; tax += gross - base;
      return kind === "slip" ? `<tr><td>${n + 1}</td><td>${esc(i.name)}<br><small>SKU ${esc(i.sku || i.id)}</small></td><td class="num">${i.qty}</td><td></td></tr>`
        : `<tr><td>${n + 1}</td><td>${esc(i.name)}<br><small>SKU ${esc(i.sku || i.id)}</small></td><td>${esc(i.hsn || "")}</td><td class="num">${i.qty}</td><td class="num">${INR2.format(base / i.qty || 0)}</td><td class="num">${rate}%</td><td class="num">${INR2.format(gross)}</td></tr>`;
    }).join("");
    $("#print").innerHTML = `<div class="inv">
      <div class="inv__head"><div><img src="/assets/img/logo-full.png" alt=""><p><b>${esc(s.storeName)}</b><br>${esc(s.address)}<br>${s.phone ? "Phone " + esc(s.phone) : ""}${s.gstin ? "<br>GSTIN " + esc(s.gstin) : ""}</p></div>
        <div style="text-align:right"><h1>${kind === "slip" ? "Packing slip" : "Tax invoice"}</h1><p>Order ${esc(o.number)}<br>Date ${new Date(o.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}<br>${esc(PAY[o.paymentMethod] || "")}</p></div></div>
      <div class="inv__cols"><div><b>${o.fulfilment === "pickup" ? "Customer (store pickup)" : "Ship to"}</b><p>${esc(c.name)}<br>${o.fulfilment === "pickup" ? "" : esc(c.address) + "<br>" + esc(c.city) + (c.state ? ", " + esc(c.state) : "") + " " + esc(c.pincode) + "<br>"}+91 ${esc(c.phone)}</p></div>${o.notes ? `<div><b>Customer note</b><p>${esc(o.notes)}</p></div>` : ""}</div>
      <table><thead>${kind === "slip" ? "<tr><th>#</th><th>Item</th><th class='num'>Qty</th><th>Packed ✓</th></tr>" : "<tr><th>#</th><th>Item</th><th>HSN</th><th class='num'>Qty</th><th class='num'>Unit price (excl. GST)</th><th class='num'>GST</th><th class='num'>Amount</th></tr>"}</thead><tbody>${rows}</tbody></table>
      ${kind === "slip" ? "" : `<table style="width:50%;margin-left:auto"><tbody><tr><td>Taxable value</td><td class="num">${INR2.format(taxable)}</td></tr>
        ${intra ? `<tr><td>CGST</td><td class="num">${INR2.format(tax / 2)}</td></tr><tr><td>SGST</td><td class="num">${INR2.format(tax / 2)}</td></tr>` : `<tr><td>IGST</td><td class="num">${INR2.format(tax)}</td></tr>`}
        ${o.shipping ? `<tr><td>Delivery</td><td class="num">${INR2.format(o.shipping)}</td></tr>` : ""}<tr><th>Total</th><th class="num">${INR2.format(o.total)}</th></tr></tbody></table>`}
      <div class="inv__foot"><p>Thank you for shopping at ${esc(s.storeName)}.</p><p>${kind === "slip" ? "" : "This is a computer-generated invoice."}</p></div></div>`;
    view.innerHTML = `<p class="crumbs"><a href="#/orders/${esc(number)}">Back to order ${esc(number)}</a></p><div class="card card__b"><p>Your ${kind === "slip" ? "packing slip" : "invoice"} is ready in the print dialog. <button class="btn btn--sm" onclick="window.print()">Print again</button></p></div>`;
    setTimeout(() => window.print(), 300);
  }

  /* ---------- Inventory ---------- */
  async function inventory(params) {
    META = META || await api("/admin/meta").catch(fail); if (!META) return;
    const f = Object.fromEntries(params); f.page = f.page || 1;
    const d = await api("/admin/products?" + new URLSearchParams(f)).catch(fail); if (!d) return;
    const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(l)}</option>`;
    const title = f.missing === "price" ? "Pricing" : "Manage all inventory";
    view.innerHTML = `<div class="phead"><div><h1>${title}</h1><p>${f.missing === "price" ? "Listings without a price show “Price on request” on your store. Type a price and press Enter to publish it." : "Edit stock and prices inline. Changes save as soon as you press Enter or leave the field."}</p></div>
        <div class="phead__actions"><button class="btn" id="exportCsv">Export CSV</button><a class="btn" href="#/upload">Bulk upload</a><a class="btn btn--primary" href="#/inventory/new">Add a product</a></div></div>
      <section class="card">
        <form class="filters" id="invf">
          <input class="input" type="search" name="q" value="${esc(f.q || "")}" placeholder="Search name, brand or SKU">
          <select class="select" name="dept">${opt("", "All departments", f.dept)}${META.departments.map(x => opt(x.id, x.name, f.dept)).join("")}</select>
          <select class="select" name="status">${opt("", "Any status", f.status)}${opt("active", "Active", f.status)}${opt("inactive", "Inactive", f.status)}</select>
          <select class="select" name="stock">${opt("", "Any stock", f.stock)}${opt("in", "In stock", f.stock)}${opt("low", "Low (1 to 2)", f.stock)}${opt("out", "Out of stock", f.stock)}</select>
          <select class="select" name="missing">${opt("", "Any listing", f.missing)}${opt("price", "Missing price", f.missing)}${opt("images", "Missing photos", f.missing)}</select>
          <select class="select" name="sort">${opt("", "Recently updated", f.sort)}${opt("name", "Name A to Z", f.sort)}${opt("stock", "Stock, low to high", f.sort)}${opt("stock-desc", "Stock, high to low", f.sort)}${opt("price", "Price, low to high", f.sort)}${opt("price-desc", "Price, high to low", f.sort)}</select>
          <button class="btn">Apply</button>
        </form>
        <div class="bulkbar" id="bulk" hidden><b id="bulkN"></b><button class="btn btn--sm" data-bulk="activate">Make active</button><button class="btn btn--sm" data-bulk="deactivate">Make inactive</button><button class="btn btn--sm btn--danger" data-bulk="delete">Delete</button></div>
        ${d.items.length ? `<div class="tablewrap"><table class="t"><thead><tr><th><input type="checkbox" id="all" aria-label="Select all"></th><th></th><th>Product</th><th>Department</th><th>Active</th><th class="num">Available</th><th class="num">Price (₹)</th><th class="num">MRP (₹)</th><th>Updated</th><th></th></tr></thead><tbody>
          ${d.items.map(p => `<tr data-id="${esc(p.id)}">
            <td><input type="checkbox" class="sel" aria-label="Select ${esc(p.name)}"></td><td>${thumb(p)}</td>
            <td><a class="name" href="#/inventory/${esc(p.id)}">${esc(p.name)}</a><span class="sub">${esc(p.brand)} · SKU ${esc(p.sku)}</span></td>
            <td>${esc((META.departments.find(x => x.id === p.dept) || {}).name || p.dept)}<div class="sub">${esc(p.cat)}</div></td>
            <td><input type="checkbox" class="switch" data-field="status" ${p.status === "active" ? "checked" : ""} aria-label="Active on store"></td>
            <td class="num"><input class="input inline" type="number" min="0" step="1" data-field="stock" value="${p.stock}" aria-label="Stock"></td>
            <td class="num"><input class="input inline" type="number" min="0" step="1" data-field="price" value="${p.price ?? ""}" placeholder="Add" aria-label="Price"></td>
            <td class="num"><input class="input inline" type="number" min="0" step="1" data-field="mrp" value="${p.mrp ?? ""}" placeholder="—" aria-label="MRP"></td>
            <td class="sub">${ago(p.updatedAt)}</td><td><a class="btn btn--sm" href="#/inventory/${esc(p.id)}">Edit</a></td></tr>`).join("")}
          </tbody></table></div>` : '<div class="empty"><h3>No products match</h3><p>Try clearing a filter.</p></div>'}
        ${pager(d, p => "#/inventory?" + new URLSearchParams({ ...f, page: p }))}
      </section>`;
    $("#invf").onsubmit = e => { e.preventDefault(); const p = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v)); location.hash = "#/inventory?" + new URLSearchParams(p); };
    $$("#invf select").forEach(s => s.onchange = () => $("#invf").requestSubmit());
    // Inline edits
    const save = async (input, value) => {
      const id = input.closest("tr").dataset.id, field = input.dataset.field;
      input.classList.remove("is-saved", "is-err");
      try { await api("/admin/products/" + encodeURIComponent(id), { method: "PUT", body: { [field]: value } }); input.classList.add("is-saved"); setTimeout(() => input.classList.remove("is-saved"), 1200); input.dataset.orig = input.value; }
      catch (e) { input.classList.add("is-err"); fail(e); }
    };
    $$(".inline").forEach(i => {
      i.dataset.orig = i.value;
      const commit = () => { if (i.value !== i.dataset.orig) save(i, i.dataset.field === "stock" ? Number(i.value || 0) : i.value === "" ? null : Number(i.value)); };
      i.addEventListener("change", commit); i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
    });
    $$(".switch").forEach(s => s.onchange = () => save(s, s.checked ? "active" : "inactive"));
    // Bulk
    const sel = () => $$(".sel:checked").map(c => c.closest("tr").dataset.id);
    const upd = () => { const n = sel().length; $("#bulk").hidden = !n; $("#bulkN").textContent = `${n} selected`; };
    $$(".sel").forEach(c => c.onchange = upd);
    const all = $("#all"); if (all) all.onchange = () => { $$(".sel").forEach(c => { c.checked = all.checked; }); upd(); };
    $$("[data-bulk]").forEach(b => b.onclick = async () => {
      const ids = sel(), act = b.dataset.bulk;
      if (act === "delete" && !await ask(`Delete ${ids.length} product${ids.length > 1 ? "s" : ""}?`, "<p>They disappear from your store immediately. Past orders keep their details.</p>", "Delete")) return;
      try { const r = await api("/admin/products/bulk", { method: "POST", body: { action: act, ids } }); toast(`${r.changed} updated`); inventory(params); } catch (e) { fail(e); }
    });
    $("#exportCsv").onclick = () => exportCsv(f);
  }
  const CSV_COLS = ["id", "sku", "name", "brand", "dept", "cat", "colour", "price", "mrp", "stock", "gstRate", "hsn", "status"];
  async function exportCsv(f) {
    toast("Preparing your CSV…");
    let page = 1, rows = [];
    for (;;) { const d = await api("/admin/products?" + new URLSearchParams({ ...f, page, size: 200 })); rows = rows.concat(d.items); if (rows.length >= d.total || !d.items.length) break; page++; }
    const cell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [CSV_COLS.join(","), ...rows.map(p => CSV_COLS.map(k => cell(p[k])).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `seven-notes-inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  /* ---------- Product editor ---------- */
  async function editor(id) {
    META = META || await api("/admin/meta").catch(fail); if (!META) return;
    const isNew = id === "new";
    const p = isNew ? { name: "", brand: "", dept: "", cat: "", colour: "", sku: "", hsn: "", family: "", price: null, mrp: null, stock: 0, gstRate: 18, status: "active", images: [], specs: {}, desc: "" }
      : await api("/admin/products/" + encodeURIComponent(id)).catch(fail);
    if (!p) return;
    let images = [...p.images];
    const deptOpts = META.departments.map(d => `<option value="${d.id}"${p.dept === d.id ? " selected" : ""}>${esc(d.name)}</option>`).join("");
    view.innerHTML = `
      <p class="crumbs"><a href="#/inventory">Manage all inventory</a> › ${isNew ? "Add a product" : "Edit listing"}</p>
      <div class="phead"><div><h1>${isNew ? "Add a product" : esc(p.name)}</h1><p>${isNew ? "Fields marked * are required. You can save now and add photos later." : `SKU ${esc(p.sku)} ${pill(p.status, p.status === "active" ? "Active" : "Inactive")}`}</p></div>
        <div class="phead__actions">${isNew ? "" : `<a class="btn" href="/#/p/${esc(p.id)}" target="_blank" rel="noopener">View on store</a><button class="btn btn--danger" id="del">Delete</button>`}</div></div>
      <form class="editor" id="pf" novalidate>
        <nav class="editor__nav"><a href="#s-vital" data-jump>Vital info</a><a href="#s-offer" data-jump>Offer and stock</a><a href="#s-images" data-jump>Images</a><a href="#s-desc" data-jump>Description</a><a href="#s-specs" data-jump>Details</a></nav>
        <div class="stack">
          <section class="card" id="s-vital"><div class="card__h"><h2>Vital info</h2></div><div class="card__b fields">
            <label class="field" style="grid-column:1/-1"><span>Product name *</span><input class="input" name="name" required maxlength="200" value="${esc(p.name)}" placeholder="e.g. Yamaha F310 Acoustic Guitar Natural"></label>
            <label class="field"><span>Brand</span><input class="input" name="brand" list="brands" value="${esc(p.brand)}"><datalist id="brands">${META.brands.map(b => `<option>${esc(b)}</option>`).join("")}</datalist></label>
            <label class="field"><span>Department *</span><select class="select" name="dept" required><option value="">Choose…</option>${deptOpts}</select></label>
            <label class="field"><span>Category *</span><input class="input" name="cat" list="cats" required value="${esc(p.cat)}"><datalist id="cats"></datalist><small>Pick one from the list or type a new category.</small></label>
            <label class="field"><span>Colour</span><input class="input" name="colour" value="${esc(p.colour || "")}"></label>
            <label class="field"><span>SKU</span><input class="input" name="sku" value="${esc(p.sku || "")}" placeholder="${isNew ? "Created for you" : ""}"></label>
            <label class="field"><span>HSN code</span><input class="input" name="hsn" value="${esc(p.hsn || "")}" placeholder="e.g. 9202"><small>Printed on GST invoices.</small></label>
            <label class="field"><span>Variation family</span><input class="input" name="family" value="${esc(p.family || "")}"><small>Products with the same family show as colour options of each other.</small></label>
          </div></section>
          <section class="card" id="s-offer"><div class="card__h"><h2>Offer and stock</h2></div><div class="card__b fields">
            <label class="field"><span>Your price (₹, incl. GST)</span><input class="input" name="price" type="number" min="0" step="1" value="${p.price ?? ""}" placeholder="Leave empty for “Price on request”"></label>
            <label class="field"><span>MRP (₹)</span><input class="input" name="mrp" type="number" min="0" step="1" value="${p.mrp ?? ""}"><small>Shown struck through when higher than your price.</small></label>
            <label class="field"><span>Quantity in stock</span><input class="input" name="stock" type="number" min="0" step="1" value="${p.stock}"></label>
            <label class="field"><span>GST rate</span><select class="select" name="gstRate">${[0, 5, 12, 18, 28].map(r => `<option value="${r}"${Number(p.gstRate) === r ? " selected" : ""}>${r}%</option>`).join("")}</select></label>
            <label class="field"><span>Listing status</span><select class="select" name="status"><option value="active"${p.status === "active" ? " selected" : ""}>Active: shown on the store</option><option value="inactive"${p.status === "inactive" ? " selected" : ""}>Inactive: hidden</option></select></label>
          </div></section>
          <section class="card" id="s-images"><div class="card__h"><h2>Images</h2><span class="sub">${"Up to 12. The first one is the main image. Drag to reorder."}</span></div><div class="card__b">
            <label class="drop" id="drop"><input type="file" id="files" accept="image/jpeg,image/png,image/webp" multiple hidden><b>Drop photos here</b> or click to choose. JPG, PNG or WebP. We resize them for the web automatically.</label>
            <div class="imgs" id="imgs"></div>
          </div></section>
          <section class="card" id="s-desc"><div class="card__h"><h2>Description</h2></div><div class="card__b"><textarea class="textarea" name="description" rows="6" style="width:100%" maxlength="4000" placeholder="What it is, who it suits, what's in the box">${esc(p.desc || "")}</textarea></div></section>
          <section class="card" id="s-specs"><div class="card__h"><h2>Details</h2><button type="button" class="btn btn--sm" id="addSpec">Add a detail</button></div><div class="card__b"><div id="specs"></div><small class="sub">Shown in the product's details table, e.g. Body: Spruce top, Scale length: 25.5 in.</small></div></section>
          <div class="savebar card"><a class="btn" href="#/inventory">Cancel</a><button class="btn btn--primary">${isNew ? "Save and publish" : "Save changes"}</button></div>
        </div>
      </form>`;
    const form = $("#pf");
    const fillCats = () => { $("#cats").innerHTML = (META.categories[form.dept.value] || []).map(c => `<option>${esc(c)}</option>`).join(""); };
    form.dept.onchange = fillCats; fillCats();
    $$("[data-jump]").forEach(a => a.onclick = e => { e.preventDefault(); $(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" }); });
    // Specs
    const specRow = (k = "", v = "") => { const d = document.createElement("div"); d.className = "specrow"; d.innerHTML = `<input class="input" placeholder="Name, e.g. Body" value="${esc(k)}"><input class="input" placeholder="Value, e.g. Spruce top" value="${esc(v)}"><button type="button" class="btn btn--sm" aria-label="Remove">Remove</button>`; d.querySelector("button").onclick = () => d.remove(); $("#specs").append(d); };
    Object.entries(p.specs || {}).forEach(([k, v]) => specRow(k, v)); if (!Object.keys(p.specs || {}).length) specRow();
    $("#addSpec").onclick = () => specRow();
    // Images
    const drawImgs = () => {
      $("#imgs").innerHTML = images.map((u, i) => `<figure draggable="true" data-i="${i}"><img src="${esc(u)}" alt="">${i === 0 ? "<figcaption>Main</figcaption>" : ""}<button type="button" data-rm="${i}" aria-label="Remove image"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></figure>`).join("");
      $$("#imgs [data-rm]").forEach(b => b.onclick = () => { images.splice(+b.dataset.rm, 1); drawImgs(); });
      let from = null;
      $$("#imgs figure").forEach(f => {
        f.ondragstart = () => { from = +f.dataset.i; f.classList.add("is-drag"); };
        f.ondragend = () => f.classList.remove("is-drag");
        f.ondragover = e => e.preventDefault();
        f.ondrop = e => { e.preventDefault(); const to = +f.dataset.i; if (from === null || from === to) return; const [m] = images.splice(from, 1); images.splice(to, 0, m); drawImgs(); };
      });
    };
    drawImgs();
    const drop = $("#drop"), files = $("#files");
    const handle = async list => {
      for (const file of [...list].slice(0, 12 - images.length)) {
        const ph = document.createElement("figure"); ph.className = "is-uploading"; ph.textContent = "Uploading…"; $("#imgs").append(ph);
        try { const { blob, mime } = await prepImage(file); const r = await api("/admin/upload", { method: "POST", raw: true, body: blob, headers: { "x-mime": mime, "content-type": "application/octet-stream" } }); images.push(r.url); }
        catch (e) { fail(e); }
        drawImgs();
      }
    };
    files.onchange = () => handle(files.files);
    ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", e => handle(e.dataTransfer.files));
    // Save
    form.onsubmit = async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      const body = { ...v, price: v.price === "" ? null : Number(v.price), mrp: v.mrp === "" ? null : Number(v.mrp), stock: Number(v.stock || 0), gstRate: Number(v.gstRate), images,
        specs: Object.fromEntries($$("#specs .specrow").map(r => [...r.querySelectorAll("input")].map(i => i.value.trim())).filter(([k, val]) => k && val)) };
      if (isNew && !body.sku) delete body.sku;
      try {
        const saved = await api(isNew ? "/admin/products" : "/admin/products/" + encodeURIComponent(id), { method: isNew ? "POST" : "PUT", body });
        toast(isNew ? `Published <b>${esc(saved.name)}</b>` : "Changes saved"); META = null;
        location.hash = "#/inventory/" + saved.id; if (!isNew) editor(saved.id);
      } catch (err) { fail(err); }
    };
    const del = $("#del");
    if (del) del.onclick = async () => {
      if (!await ask("Delete this product?", `<p>${esc(p.name)} disappears from your store immediately. Past orders keep their details.</p>`, "Delete product")) return;
      try { await api("/admin/products/" + encodeURIComponent(id), { method: "DELETE" }); toast("Product deleted"); location.hash = "#/inventory"; } catch (e) { fail(e); }
    };
  }
  async function prepImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name} isn't a JPG, PNG or WebP image`);
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    let blob = await new Promise(r => c.toBlob(r, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88));
    return { blob, mime: blob.type };
  }

  /* ---------- Bulk upload ---------- */
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  async function upload() {
    META = META || await api("/admin/meta").catch(fail); if (!META) return;
    view.innerHTML = `<div class="phead"><div><h1>Add products via upload</h1><p>Create new listings or update prices and stock for many products at once.</p></div></div>
      <div class="stack">
        <section class="card"><div class="card__h"><h2>1. Get the spreadsheet</h2></div><div class="card__b actionbar">
          <button class="btn" id="tplBlank">Download blank template</button><button class="btn" id="tplAll">Download current inventory</button>
          <p class="sub" style="flex-basis:100%">Columns: ${CSV_COLS.join(", ")}. Rows with an existing <b>id</b> or <b>sku</b> are updated; others are created (name, dept and cat are required). Department ids: ${META.departments.map(d => `<code>${d.id}</code>`).join(", ")}. Leave a cell empty to keep the current value.</p></div></section>
        <section class="card"><div class="card__h"><h2>2. Upload your file</h2></div><div class="card__b"><label class="drop" id="cdrop"><input type="file" id="csv" accept=".csv,text/csv" hidden><b>Drop your CSV here</b> or click to choose. Save from Excel or Google Sheets as “CSV”.</label></div></section>
        <section class="card" id="preview" hidden></section>
      </div>`;
    $("#tplBlank").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([CSV_COLS.join(",") + "\n,,Yamaha F310 Natural,Yamaha,guitars,Acoustic Guitars,Natural,12990,14990,3,18,9202,active\n"], { type: "text/csv" })); a.download = "seven-notes-template.csv"; a.click(); };
    $("#tplAll").onclick = () => exportCsv({});
    const go = async file => {
      const rows = parseCsv(await file.text()); if (rows.length < 2) return toast("That file has no rows", true);
      const head = rows[0].map(h => h.trim()), body = rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()]).filter(([k]) => CSV_COLS.includes(k))));
      const unknown = head.filter(h => h && !CSV_COLS.includes(h));
      const P = $("#preview"); P.hidden = false;
      P.innerHTML = `<div class="card__h"><h2>3. Check and apply</h2><button class="btn btn--primary" id="apply">Apply ${body.length} row${body.length > 1 ? "s" : ""}</button></div>
        <div class="card__b">${unknown.length ? `<p class="notice">Ignored columns: ${unknown.map(esc).join(", ")}</p>` : ""}<p class="sub">Showing the first 20 rows.</p></div>
        <div class="tablewrap"><table class="t"><thead><tr><th>Row</th>${head.filter(h => CSV_COLS.includes(h)).map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.slice(0, 20).map((r, i) => `<tr><td>${i + 2}</td>${Object.values(r).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="card__b" id="result"></div>`;
      $("#apply").onclick = async e => {
        e.target.disabled = true; let created = 0, updated = 0, errors = [];
        for (let i = 0; i < body.length; i += 100) {
          $("#result").innerHTML = `<p>Working… ${Math.min(i + 100, body.length)} of ${body.length}</p>`;
          const chunk = body.slice(i, i + 100).map(r => { const o = { ...r }; for (const k of ["price", "mrp", "stock", "gstRate"]) if (o[k] !== undefined && o[k] !== "") o[k] = Number(o[k]); return o; });
          try { const r = await api("/admin/products/bulk", { method: "POST", body: { action: "upsert", rows: chunk } }); created += r.created; updated += r.updated; errors = errors.concat(r.errors.map(x => ({ ...x, row: x.row + i }))); }
          catch (err) { errors.push({ row: `${i + 2}–${i + 101}`, message: err.message }); }
        }
        META = null;
        $("#result").innerHTML = `<p class="notice notice--info"><b>${created}</b> created, <b>${updated}</b> updated${errors.length ? `, <b>${errors.length}</b> with problems` : ""}.</p>${errors.length ? `<table class="t"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>${errors.map(x => `<tr><td>${x.row}</td><td>${esc(x.message)}</td></tr>`).join("")}</tbody></table>` : ""}<p style="margin-top:10px"><a href="#/inventory">Go to inventory</a></p>`;
      };
    };
    const d = $("#cdrop"), inp = $("#csv");
    inp.onchange = () => inp.files[0] && go(inp.files[0]);
    ["dragenter", "dragover"].forEach(t => d.addEventListener(t, e => { e.preventDefault(); d.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach(t => d.addEventListener(t, e => { e.preventDefault(); d.classList.remove("is-over"); }));
    d.addEventListener("drop", e => e.dataTransfer.files[0] && go(e.dataTransfer.files[0]));
  }

  /* ---------- Customers ---------- */
  async function customers(params) {
    const q = params.get("q") || "";
    const list = await api("/admin/customers?q=" + encodeURIComponent(q)).catch(fail); if (!list) return;
    view.innerHTML = `<div class="phead"><div><h1>Customers</h1><p>Everyone who has ordered from your website, newest first.</p></div></div>
      <section class="card"><form class="filters" id="cf"><input class="input" type="search" name="q" value="${esc(q)}" placeholder="Name, phone, email or city"><button class="btn">Search</button></form>
      ${list.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Customer</th><th>Contact</th><th>Location</th><th class="num">Orders</th><th class="num">Total spent</th><th>Last order</th><th></th></tr></thead><tbody>
        ${list.map(c => `<tr><td><b>${esc(c.name)}</b><div class="sub">Customer since ${day(c.firstOrder)}</div></td>
          <td><a href="tel:+91${esc(c.phone)}">+91 ${esc(c.phone)}</a>${c.email ? `<div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ""}</td>
          <td>${esc(c.city || "Store pickup")}${c.pincode ? `<div class="sub">${esc(c.pincode)}</div>` : ""}</td><td class="num">${c.orders}</td><td class="num">${money(c.spent)}</td><td>${ago(c.lastOrder)}</td>
          <td class="rowact"><a class="btn btn--sm" href="#/orders?phone=${esc(c.phone)}">Orders</a><a class="btn btn--sm" href="https://wa.me/91${esc(c.phone)}" target="_blank" rel="noopener">WhatsApp</a></td></tr>`).join("")}
      </tbody></table></div>` : '<div class="empty"><h3>No customers yet</h3><p>Customers appear here after their first order.</p></div>'}</section>`;
    $("#cf").onsubmit = e => { e.preventDefault(); location.hash = "#/customers?q=" + encodeURIComponent(e.target.q.value.trim()); };
  }

  /* ---------- Reports ---------- */
  async function reports(params) {
    const days = params.get("days") || "30";
    META = META || await api("/admin/meta").catch(fail);
    const d = await api("/admin/reports?days=" + days).catch(fail); if (!d) return;
    const sales = d.series.reduce((a, s) => a + s.sales, 0), ord = d.series.reduce((a, s) => a + s.orders, 0);
    const maxTop = Math.max(1, ...d.top.map(t => t.revenue)), maxDept = Math.max(1, ...d.departments.map(t => t.revenue));
    const dn = id => ((META && META.departments.find(x => x.id === id)) || {}).name || (id === "removed" ? "Deleted products" : id);
    view.innerHTML = `<div class="phead"><div><h1>Sales dashboard</h1><p>Cancelled and rejected orders are left out.</p></div>
        <div class="phead__actions"><select class="select" id="range">${[7, 30, 90, 365].map(n => `<option value="${n}"${+days === n ? " selected" : ""}>Last ${n} days</option>`).join("")}</select></div></div>
      <div class="stack">
        <section class="card"><div class="snap"><div><small>Sales</small><strong>${money(sales)}</strong></div><div><small>Orders</small><strong>${ord}</strong></div><div><small>Average order</small><strong>${money(ord ? sales / ord : 0)}</strong></div>
          ${d.payments.map(p => `<div><small>${esc(PAY[p.m] || p.m)}</small><strong>${money(p.v)}</strong><em>${p.n} orders</em></div>`).join("")}</div></section>
        <section class="card"><div class="card__h"><h2>Sales per day</h2></div><div class="card__b">${barChart(d.series, "sales")}</div></section>
        <div class="two">
          <section class="card"><div class="card__h"><h2>Top products by sales</h2></div><div class="card__b">${d.top.length ? d.top.map(t => `<div class="hbar"><span title="${esc(t.name)}">${esc(t.name)}</span><i style="width:${(t.revenue / maxTop) * 100}%"></i><span class="num">${money(t.revenue)} <span class="sub">(${t.qty})</span></span></div>`).join("") : '<p class="empty">No sales in this period yet.</p>'}</div></section>
          <section class="card"><div class="card__h"><h2>Sales by department</h2></div><div class="card__b">${d.departments.length ? d.departments.map(t => `<div class="hbar"><span>${esc(dn(t.dept))}</span><i style="width:${(t.revenue / maxDept) * 100}%"></i><span class="num">${money(t.revenue)}</span></div>`).join("") : '<p class="empty">No sales in this period yet.</p>'}</div></section>
        </div>
      </div>`;
    $("#range").onchange = e => { location.hash = "#/reports?days=" + e.target.value; };
    wireCharts();
  }

  /* ---------- Settings ---------- */
  async function settings() {
    const s = await api("/admin/settings").catch(fail); if (!s) return; SETTINGS = s;
    const f = (k, label, extra = "", help = "") => `<label class="field"><span>${label}</span><input class="input" name="${k}" value="${esc(s[k])}" ${extra}>${help ? `<small>${help}</small>` : ""}</label>`;
    const sw = (k, label) => `<label class="check"><input type="checkbox" name="${k}" ${s[k] ? "checked" : ""}> ${label}</label>`;
    view.innerHTML = `<div class="phead"><div><h1>Store and checkout settings</h1><p>These details appear on your website, invoices and WhatsApp links.</p></div></div>
      <form id="sf" class="stack">
        <section class="card"><div class="card__h"><h2>Store details</h2></div><div class="card__b fields">
          ${f("storeName", "Store name")}${f("address", "Full address", 'style="grid-column:span 2"')}${f("city", "City")}${f("state", "State", "", "Used to split CGST/SGST vs IGST on invoices.")}
          ${f("phone", "Phone (shown on site)", 'placeholder="+91 98xxx xxxxx"')}${f("whatsapp", "WhatsApp number", 'placeholder="919800000000"', "Country code first, digits only.")}${f("email", "Email", 'type="email"')}
          ${f("mapsUrl", "Google Maps link", 'type="url"')}${f("gstin", "GSTIN", "", "Printed on tax invoices.")}
        </div></section>
        <section class="card"><div class="card__h"><h2>Opening hours</h2></div><div class="card__b" id="hours">${s.hours.map(h => `<div class="specrow"><input class="input" value="${esc(h[0])}" placeholder="Mon to Sat"><input class="input" value="${esc(h[1])}" placeholder="11:00 to 20:30"><button type="button" class="btn btn--sm">Remove</button></div>`).join("")}</div><div class="card__b" style="padding-top:0"><button type="button" class="btn btn--sm" id="addHour">Add a row</button></div></section>
        <section class="card"><div class="card__h"><h2>Checkout</h2></div><div class="card__b fields">
          ${f("shippingFee", "Delivery charge (₹)", 'type="number" min="0"')}${f("freeShippingOver", "Free delivery above (₹)", 'type="number" min="0"', "0 means no free-delivery threshold.")}${f("upiId", "UPI ID", 'placeholder="sevennotes@okhdfcbank"', "Shared with customers who choose UPI.")}
          <div class="field"><span>Payment and pickup options</span>${sw("codEnabled", "Cash on delivery")}${sw("upiEnabled", "UPI after we confirm the order")}${sw("pickupEnabled", "Store pickup (pay at store)")}</div>
        </div></section>
        <div class="savebar card"><button class="btn btn--primary">Save settings</button></div>
      </form>`;
    const wire = () => $$("#hours .specrow button").forEach(b => b.onclick = () => b.parentElement.remove());
    wire(); $("#addHour").onclick = () => { $("#hours").insertAdjacentHTML("beforeend", '<div class="specrow"><input class="input" placeholder="Sunday"><input class="input" placeholder="12:00 to 19:00"><button type="button" class="btn btn--sm">Remove</button></div>'); wire(); };
    $("#sf").onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), body = Object.fromEntries(fd);
      ["codEnabled", "upiEnabled", "pickupEnabled"].forEach(k => { body[k] = fd.has(k); });
      body.hours = $$("#hours .specrow").map(r => [...r.querySelectorAll("input")].map(i => i.value.trim())).filter(r => r[0]);
      try { SETTINGS = await api("/admin/settings", { method: "PUT", body }); toast("Settings saved. Your store shows them within a minute."); } catch (err) { fail(err); }
    };
  }

  /* ---------- Boot ---------- */
  let started = false;
  async function start() {
    shell();
    if (!started) { started = true; addEventListener("hashchange", route); setInterval(poll, 30000); }
    api("/admin/settings").then(s => { SETTINGS = s; }).catch(() => {});
    poll(); route();
  }
  fetch("/api/admin/me").then(r => r.json()).then(me => me.signedIn ? start() : showLogin()).catch(() => showLogin("Can't reach the server. Check your connection."));
})();
