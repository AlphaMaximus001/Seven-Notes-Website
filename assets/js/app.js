/* Seven Notes storefront: data, router and views. Hash routes keep it hostable on any static host. */
(function () {
  "use strict";
  const C = window.CATALOG, S = window.SITE;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = $("#app");

  /* ---------- Data ---------- */
  const P = {}; C.products.forEach(p => { P[p.id] = p; });
  const DEPTS = C.departments, D = {}; DEPTS.forEach(d => { D[d.id] = d; });
  const byDept = id => C.products.filter(p => p.dept === id);
  const counts = {}; DEPTS.forEach(d => { counts[d.id] = byDept(d.id).length; });
  const catsOf = id => { const m = new Map(); byDept(id).forEach(p => m.set(p.cat, (m.get(p.cat) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };
  const brandCounts = (list) => { const m = new Map(); list.forEach(p => m.set(p.brand, (m.get(p.brand) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const ALL_BRANDS = brandCounts(C.products).filter(([b]) => !["Generic", "Seven Notes"].includes(b));
  const hasImg = p => p.images && p.images.length;
  const SWATCH = { Black: "#1d1d22", Natural: "#E8D3A9", Sunburst: "radial-gradient(circle at 40% 40%, #F2B544 0 30%, #8A3B12 60%, #1d1d22 85%)", Brown: "#6B4226", Mahogany: "#7B3F2A", Red: "#C62828", Blue: "#2A5BD7", Green: "#2E8B57", Yellow: "#F5C518", Purple: "#7B4FC9", Pink: "#F49AC2", White: "#ffffff", Gold: "#D4AF37", Grey: "#8E8E93", Silver: "#C9CCD3", Orange: "#F28C28", "Wine Red": "#722F37", "Trans Black": "#2a2a30", "Tobacco Sunburst": "radial-gradient(circle at 40% 40%, #C98A3A 0 30%, #5A2A10 60%, #120a06 85%)", Walnut: "#5C4033" };
  const pick = (ids, fallback) => ids.map(id => P[id]).find(p => p && hasImg(p)) || fallback.find(hasImg) || fallback[0];

  function stockInfo(p) {
    if (p.stock >= 3) return { cls: "in", label: "In stock" };
    if (p.stock > 0) return { cls: "low", label: `Only ${p.stock} left` };
    return { cls: "order", label: "Available to order" };
  }
  const priceLabel = p => (S.showPrices && p.price ? "₹" + Number(p.price).toLocaleString("en-IN") : "Price on request");

  /* ---------- Small templates ---------- */
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>'
  };
  function art(p, withCap = true) {
    return `<div class="art"><span class="art__brand">${esc(p.brand === "Generic" ? "" : p.brand)}</span><svg viewBox="0 0 64 64" aria-hidden="true">${window.ART[p.art] || window.ART.strings}</svg>${withCap ? '<span class="art__cap">Photo coming soon</span>' : ""}</div>`;
  }
  function media(p, n = 2) {
    if (!hasImg(p)) return art(p);
    return p.images.slice(0, n).map((src, i) => `<img src="${src}" alt="${i ? "" : esc(p.name)}" loading="lazy" decoding="async">`).join("");
  }
  function card(p, opts = {}) {
    const st = stockInfo(p), wished = Store.isWished(p.id);
    return `<article class="card${opts.list ? " card--list" : ""}" data-id="${p.id}">
      <div class="card__media">${media(p)}</div>
      ${p.stock >= 10 ? '<span class="card__tag">Plenty in stock</span>' : ""}
      <button class="heart" data-wish="${p.id}" aria-pressed="${wished}" aria-label="${wished ? "Remove from" : "Save to"} wishlist">${ICON.heart}</button>
      <div class="card__body">
        <span class="card__brand">${esc(p.brand === "Generic" ? p.cat : p.brand)}</span>
        <a class="card__name" href="#/p/${p.id}">${esc(p.name)}</a>
        <span class="pill pill--${st.cls}">${st.label}</span>
        <div class="card__foot"><span class="card__price">${priceLabel(p)}</span>
          <button class="card__add" data-add="${p.id}" aria-label="Add ${esc(p.name)} to enquiry list">${ICON.plus}</button></div>
      </div></article>`;
  }
  const crumbs = items => `<ol class="crumbs">${items.map(([t, h]) => `<li>${h ? `<a href="${h}">${esc(t)}</a>` : esc(t)}</li>`).join("")}</ol>`;
  const rail = list => `<div class="rail" data-rail>${list.map(p => card(p)).join("")}</div>`;

  /* ---------- Header: departments + mega menu + mobile nav ---------- */
  function buildHeader() {
    $("#deptsRow").innerHTML = DEPTS.map(d => `<a class="depts__link" href="#/c/${d.id}" data-dept="${d.id}" aria-haspopup="true" aria-expanded="false">${esc(d.name)}</a>`).join("") +
      '<a class="depts__link" href="#/c/all">Every product</a>';
    $("#footerDepts").innerHTML = DEPTS.map(d => `<li><a href="#/c/${d.id}">${esc(d.name)}</a></li>`).join("");
    $("#mnav").innerHTML = `<div class="drawer__head" style="padding:0 0 12px;border-color:rgba(255,255,255,.15)"><span class="logo logo--light"><span class="logo__word">Departments</span></span><button class="iconbtn" data-close-mnav aria-label="Close menu"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>` +
      DEPTS.map(d => `<a href="#/c/${d.id}">${esc(d.name)}</a>`).join("") + '<a href="#/c/all">Every product</a><a href="#/wishlist">Wishlist</a>';
    $("#footerAddress").textContent = S.address;
    const ph = $("#footerPhone"); ph.textContent = S.phoneDisplay; ph.href = "tel:" + S.phoneDisplay.replace(/\s/g, "");
    $("#year").textContent = new Date().getFullYear();

    const mega = $("#mega"); let openId = null, timer = null;
    function megaHTML(d) {
      const cats = catsOf(d.id), list = byDept(d.id), feat = list.filter(hasImg).sort((a, b) => b.stock - a.stock)[0];
      return `<div class="wrap mega__grid">
        <div class="mega__intro"><svg class="mega__icon" viewBox="0 0 64 64" aria-hidden="true">${window.ART[d.icon]}</svg><h3>${esc(d.name)}</h3><p>${esc(d.blurb)}</p>
          <div class="mega__brands">${brandCounts(list).filter(([b]) => b !== "Generic").slice(0, 6).map(([b]) => `<a class="chip" href="#/c/${d.id}?brand=${encodeURIComponent(b)}">${esc(b)}</a>`).join("")}</div></div>
        <div class="mega__cats">${cats.map(([c, n]) => `<a href="#/c/${d.id}?cat=${encodeURIComponent(c)}">${esc(c)}<span>${n}</span></a>`).join("")}<a href="#/c/${d.id}"><b>All ${esc(d.name.toLowerCase())}</b><span>${list.length}</span></a></div>
        ${feat ? `<a class="mega__feature" href="#/p/${feat.id}"><img src="${feat.images[0]}" alt=""><p>${esc(feat.brand)}</p><strong>${esc(feat.name)}</strong></a>` : ""}
      </div>`;
    }
    function open(id, link) {
      clearTimeout(timer);
      if (openId === id) return;
      $$(".depts__link[aria-expanded]").forEach(a => a.setAttribute("aria-expanded", "false"));
      link.setAttribute("aria-expanded", "true");
      const wasOpen = openId !== null; openId = id;
      mega.innerHTML = megaHTML(D[id]);
      if (!wasOpen) Motion.mega(mega, true); else { mega.hidden = false; gsap.from(mega.querySelectorAll(".mega__cats a, .mega__intro > *"), { opacity: 0, y: 8, duration: 0.3, stagger: 0.01 }); }
    }
    function close() { timer = setTimeout(() => { if (openId === null) return; openId = null; $$(".depts__link").forEach(a => a.setAttribute("aria-expanded", "false")); Motion.mega(mega, false); }, 140); }
    $$(".depts__link[data-dept]").forEach(a => {
      a.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") open(a.dataset.dept, a); });
      a.addEventListener("pointerleave", close);
      a.addEventListener("focus", () => open(a.dataset.dept, a));
    });
    mega.addEventListener("pointerenter", () => clearTimeout(timer));
    mega.addEventListener("pointerleave", close);
    mega.addEventListener("click", e => { if (e.target.closest("a")) { openId = null; mega.hidden = true; } });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && openId) { openId = null; Motion.mega(mega, false); } });

    const mnav = $("#mnav"), scrim = $("#scrim");
    $("#menuBtn").addEventListener("click", () => toggleMnav(true));
    mnav.addEventListener("click", e => { if (e.target.closest("a") || e.target.closest("[data-close-mnav]")) toggleMnav(false); });
    function toggleMnav(on) {
      mnav.setAttribute("aria-hidden", !on); mnav.inert = !on; $("#menuBtn").setAttribute("aria-expanded", on);
      Motion.drawer(mnav, on, "left"); Motion.fade(scrim, on); scrim.onclick = () => toggleMnav(false);
    }
  }

  /* ---------- Search ---------- */
  const SYN = { uke: "ukulele", ukes: "ukulele", keyboard: "keys", piano: "keyboard", mic: "microphone", mike: "microphone", amp: "amplifier", pedal: "effects", lead: "cable", wire: "cable", tabla: "percussion", sticks: "drumsticks", headphone: "headphones", phone: "headphones" };
  const IDX = C.products.map(p => {
    const t = `${p.name} ${p.brand} ${p.cat} ${D[p.dept].name} ${p.colour || ""}`.toLowerCase();
    return { p, t, c: t.replace(/[^a-z0-9]/g, "") };
  });
  function search(q) {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean).map(t => SYN[t] || t);
    if (!toks.length) return [];
    const res = [];
    IDX.forEach(r => {
      let score = 0;
      for (const t of toks) {
        const tc = t.replace(/[^a-z0-9]/g, "");
        if (r.t.includes(t)) score += r.p.name.toLowerCase().includes(t) ? 3 : 1;
        else if (tc.length > 2 && r.c.includes(tc)) score += 2;
        else if (t.endsWith("s") && r.t.includes(t.slice(0, -1))) score += 1;
        else return;
      }
      if (r.p.name.toLowerCase().startsWith(toks[0])) score += 2;
      if (r.p.stock > 0) score += 0.5;
      if (hasImg(r.p)) score += 0.3;
      res.push([score, r.p]);
    });
    return res.sort((a, b) => b[0] - a[0]).map(r => r[1]);
  }
  function hl(text, q) {
    let out = esc(text);
    q.split(/\s+/).filter(t => t.length > 1).forEach(t => { out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
    return out;
  }
  function buildSearch() {
    const input = $("#searchInput"), box = $("#suggest"), form = $("#searchForm");
    let sel = -1, t = null;
    function render() {
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      const res = search(q).slice(0, 6), ql = q.toLowerCase();
      const cats = []; DEPTS.forEach(d => catsOf(d.id).forEach(([c, n]) => { if (c.toLowerCase().includes(ql) || d.name.toLowerCase().includes(ql)) cats.push([d, c, n]); }));
      const brands = ALL_BRANDS.filter(([b]) => b.toLowerCase().includes(ql)).slice(0, 4);
      let h = "";
      if (cats.length) h += `<div class="suggest__group"><p class="suggest__label">Categories</p>${cats.slice(0, 4).map(([d, c, n]) => `<a role="option" href="#/c/${d.id}?cat=${encodeURIComponent(c)}">${hl(c, q)} <span style="margin-left:auto;color:var(--ink-3);font-size:13px">${n}</span></a>`).join("")}</div>`;
      if (brands.length) h += `<div class="suggest__group"><p class="suggest__label">Brands</p>${brands.map(([b, n]) => `<a role="option" href="#/brand/${encodeURIComponent(b)}">${hl(b, q)} <span style="margin-left:auto;color:var(--ink-3);font-size:13px">${n}</span></a>`).join("")}</div>`;
      if (res.length) h += `<div class="suggest__group"><p class="suggest__label">Products</p>${res.map(p => `<a role="option" href="#/p/${p.id}">${hasImg(p) ? `<img src="${p.images[0]}" alt="">` : `<span class="suggest__art" style="position:relative">${art(p, false)}</span>`}<span>${hl(p.name, q)}</span></a>`).join("")}</div>`;
      h += `<div class="suggest__group"><a role="option" class="suggest__all" href="#/search?q=${encodeURIComponent(q)}">See all results for “${esc(q)}”</a></div>`;
      box.innerHTML = h; box.hidden = false; sel = -1;
    }
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 70); });
    input.addEventListener("focus", render);
    input.addEventListener("keydown", e => {
      const opts = $$("a", box);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!opts.length) return;
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.setAttribute("aria-selected", i === sel)); opts[sel].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Escape") { box.hidden = true; input.blur(); }
      else if (e.key === "Enter" && sel >= 0 && opts[sel]) { e.preventDefault(); location.hash = opts[sel].getAttribute("href"); box.hidden = true; input.blur(); }
    });
    form.addEventListener("submit", e => { e.preventDefault(); const q = input.value.trim(); if (q) { location.hash = "#/search?q=" + encodeURIComponent(q); box.hidden = true; input.blur(); } });
    box.addEventListener("click", e => { if (e.target.closest("a")) { box.hidden = true; input.blur(); } });
    document.addEventListener("click", e => { if (!form.contains(e.target)) box.hidden = true; });
    document.addEventListener("keydown", e => { if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });
  }

  /* ---------- Home ---------- */
  function viewHome() {
    const tileImg = {
      guitars: pick(["yamaha-fs80c-nat", "yamaha-f280-nat"], byDept("guitars")),
      folk: pick(["kala-ka-surf-dawnpatrol", "kala-ka-hibiscus-c"], byDept("folk")),
      keys: pick(["casio-ctk-3500-61-key-portable-keyboard", "yamaha-psr-i510-keyboard"], byDept("keys")),
      drums: pick(["kadence-dje-12-inch", "kadence-dje-10inch"], byDept("drums")),
      studio: pick(["audiotechnica-m50x", "shure-sv-200"], byDept("studio")),
      amps: pick(["vox-vt20x", "laney-lx15-electric-amp"], byDept("amps")),
      accessories: pick(["d-addario-exl110", "kadence-foldable-guitar-stand-nk51"], byDept("accessories"))
    };
    // In-stock rail: round-robin across departments so it isn't all strings.
    const pools = DEPTS.map(d => byDept(d.id).filter(p => p.stock > 0 && hasImg(p)).sort((a, b) => b.stock - a.stock));
    const instock = []; for (let i = 0; instock.length < 16 && i < 40; i++) pools.forEach(pl => { if (pl[i] && instock.length < 16) instock.push(pl[i]); });
    const journey = [
      ["Travel & Junior Guitars", "Small hands, first chords", "Shorter scales and lighter bodies for kids, travellers and couch practice.", ["kadence-frontier-34inch-sunburst", "kadence-wanderer-36-travel-guitar-with-eq-wne-01"]],
      ["Acoustic Guitars", "Your first full-size acoustic", "Dreadnoughts and grand auditoriums from Yamaha, Kadence, Fender and Westwood.", ["yamaha-f280-nat", "yamaha-fg800-natural"]],
      ["Electro-Acoustic Guitars", "Plug in for the open mic", "A built-in pickup and preamp so the same guitar works at home and on stage.", ["takamine-gd11mce-ns", "fender-cd60sce-mahogany"]],
      ["Electric Guitars", "Turn it up", "Strats, LPs and shred machines from Squier, Ibanez, ESP, Jackson and Jet.", ["fender-squire-sonic-start-hss-sunburst", "ibanez-grg-131dx"]],
      ["Bass Guitars", "Hold down the low end", "Four-string basses that sit right in the pocket of any band.", ["yamaha-trbx174-bass-guitar"]]
    ].map(([cat, title, text, ids]) => ({ cat, title, text, p: pick(ids, C.products.filter(p => p.cat === cat)), n: C.products.filter(p => p.cat === cat).length }));
    const brands = ALL_BRANDS.slice(0, 22).map(([b]) => b);

    app.innerHTML = `
    <section class="hero" aria-labelledby="heroTitle">
      <div class="wrap hero__grid">
        <div class="hero__copy">
          <h1 id="heroTitle" class="display"><span class="ln"><span>Every note,</span></span><span class="ln"><span>under one</span></span><span class="ln"><span>roof.</span></span></h1>
          <p class="hero__lede">Guitars, ukuleles, keys, drums, studio gear and every string, cable and capo in between. Browse ${C.products.length} products, then pick them up at our ${esc(S.city)} store or have them delivered.</p>
          <div class="hero__cta"><a class="btn btn--accent" href="#/c/guitars">Shop guitars</a><a class="btn btn--ghost" href="#/c/all?stock=1">See what's in stock</a></div>
          <p class="hero__note"><button class="sound" id="soundBtn" aria-pressed="${HeroStrings.isOn()}"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg><span>${HeroStrings.isOn() ? "Sound on" : "Turn sound on"}</span></button> Then sweep across the strings.</p>
        </div>
        <div class="strings" id="strings"><div class="strings__labels"></div><span class="strings__nut" aria-hidden="true"></span><span class="strings__hint" aria-hidden="true">Each string is a department</span></div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="shead"><div><h2 data-split>Seven departments, one for every note.</h2><p>Pick where you want to start.</p></div><a class="shead__link" href="#/c/all">Browse all ${C.products.length}</a></div>
        <div class="bento">${DEPTS.map(d => { const p = tileImg[d.id]; return `
          <a class="tile" href="#/c/${d.id}">
            <div><h3>${esc(d.name)}</h3><span class="tile__count">${counts[d.id]} products in ${catsOf(d.id).length} categories</span></div>
            <span class="tile__go" aria-hidden="true">${ICON.arrow}</span>
            ${p && hasImg(p) ? `<img class="tile__img" src="${p.images[0]}" alt="" loading="lazy">` : ""}
          </a>`; }).join("")}</div>
      </div>
    </section>

    <section class="section section--mist">
      <div class="wrap">
        <div class="shead"><div><h2 data-split>On the shelf in ${esc(S.city)} today.</h2><p>Stock counts update from our store register. Reserve any of these and collect them the same day.</p></div><a class="shead__link" href="#/c/all?stock=1">All in-stock items</a></div>
        ${rail(instock)}
      </div>
    </section>

    <section class="journey" aria-label="Guitars from first chord to first gig">
      <div class="wrap journey__intro"><div class="shead"><div><h2 data-split>Guitars, from first chord to first gig.</h2><p style="color:#CFCDEA">Five steps most players take. Scroll to walk through them.</p></div><a class="shead__link" href="#/c/guitars">All ${counts.guitars} guitars</a></div></div>
      <div class="journey__track">${journey.map((j, i) => `
        <article class="jpanel">
          <div><span class="jpanel__step">Step ${i + 1} of ${journey.length}</span><h3>${esc(j.title)}</h3><p>${esc(j.text)}</p></div>
          <a class="btn" href="#/c/guitars?cat=${encodeURIComponent(j.cat)}">${j.n} ${esc(j.cat.toLowerCase())}</a>
          ${j.p && hasImg(j.p) ? `<img src="${j.p.images[0]}" alt="${esc(j.p.name)}" loading="lazy">` : ""}
        </article>`).join("")}</div>
    </section>

    <section class="marquee" aria-label="Brands we stock">
      <div class="marquee__row">${[...brands, ...brands].map((b, i) => `<a href="#/brand/${encodeURIComponent(b)}"${i >= brands.length ? ' tabindex="-1" aria-hidden="true"' : ""}>${esc(b)}</a>`).join("")}</div>
    </section>

    <section class="section section--mist" id="finder">
      <div class="wrap">
        <div class="shead"><div><h2 data-split>Time for new strings?</h2><p>Answer two questions and we'll show the sets that fit.</p></div></div>
        <div class="finder">
          <div class="finder__q">
            <div><h3>What do you play?</h3><div class="finder__opts" data-q="inst">
              ${[["Acoustic Guitar Strings", "Acoustic guitar"], ["Electric Guitar Strings", "Electric guitar"], ["Classical Guitar Strings", "Classical guitar"], ["Ukulele & Other Strings", "Ukulele, violin, mandolin"]].map(([v, l], i) => `<button class="chip" aria-pressed="${i === 0}" data-v="${v}">${l}</button>`).join("")}</div></div>
            <div><h3>How should they feel?</h3><div class="finder__opts" data-q="feel">
              ${[["light", "Lighter, easier to press"], ["medium", "Balanced"], ["heavy", "Heavier, louder"]].map(([v, l], i) => `<button class="chip" aria-pressed="${i === 0}" data-v="${v}">${l}</button>`).join("")}</div></div>
            <label class="toggle" style="max-width:280px">Only show what's in stock<input type="checkbox" id="finderStock"></label>
          </div>
          <div class="finder__res" id="finderRes"></div>
        </div>
      </div>
    </section>

    <section class="section section--ink">
      <div class="wrap">
        <div class="shead"><div><h2 data-split>What you get from a real music store.</h2></div></div>
        <div class="services">
          ${[["Set up before it leaves", "We adjust action, intonation and tuning on every guitar and ukulele, so it's easy to play from day one.", '<path d="M8 32L32 8l8 8-24 24H8z"/><path d="M28 12l8 8"/>'],
             ["Try it in the store", `Come in and play before you decide. Our ${esc(S.city)} store has most of what you see here on the wall.`, '<path d="M6 20l14-12 14 12v14H6z"/><path d="M16 34V24h8v10"/>'],
             ["Ask us on WhatsApp", "Not sure about gauges, sizes or which keyboard suits a beginner? Message us and a musician on our team replies.", '<path d="M6 34l2-6A14 14 0 1 1 14 32z"/>'],
             ["GST invoices for institutions", "Schools, studios, churches and bands can order in bulk with a proper GST invoice.", '<rect x="8" y="6" width="24" height="28" rx="2"/><path d="M14 14h12M14 20h12M14 26h6"/>']]
            .map(([t, d, i]) => `<div class="service" data-reveal><svg viewBox="0 0 40 40" aria-hidden="true">${i}</svg><div><h3>${t}</h3><p>${d}</p></div></div>`).join("")}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap visit">
        <div class="visit__card" data-reveal><h2>Come and play.</h2><p>${esc(S.address)}. Bring your instrument along if you'd like help choosing strings or accessories that fit it.</p><a class="btn" href="${S.mapsUrl}" target="_blank" rel="noopener">Get directions</a></div>
        <dl data-reveal>${S.hours.map(([d, h]) => `<dt>${esc(d)}</dt><dd>${esc(h)}</dd>`).join("")}<dt>Phone</dt><dd><a href="tel:${S.phoneDisplay.replace(/\s/g, "")}">${esc(S.phoneDisplay)}</a></dd><dt>WhatsApp</dt><dd><a href="https://wa.me/${S.whatsapp}" target="_blank" rel="noopener">Message the store</a></dd></dl>
      </div>
    </section>`;

    const hs = HeroStrings.mount($("#strings"), DEPTS, counts);
    $("#soundBtn").addEventListener("click", e => {
      const on = HeroStrings.toggleSound(); const b = e.currentTarget;
      b.setAttribute("aria-pressed", on); b.querySelector("span").textContent = on ? "Sound on" : "Turn sound on";
      if (on) hs.strum(0.05);
    });
    // String finder
    const fState = { inst: "Acoustic Guitar Strings", feel: "light" };
    function gaugeClass(p) {
      const g = p.specs && p.specs.Gauge; if (!g) return "medium";
      const first = parseInt(g, 10);
      if (p.cat === "Electric Guitar Strings") return first <= 9 ? "light" : first === 10 ? "medium" : "heavy";
      return first <= 10 ? "light" : first === 11 ? "medium" : "heavy";
    }
    function renderFinder(flip) {
      const stockOnly = $("#finderStock").checked;
      let list = C.products.filter(p => p.cat === fState.inst && (!stockOnly || p.stock > 0));
      if (["Acoustic Guitar Strings", "Electric Guitar Strings"].includes(fState.inst)) list = list.filter(p => gaugeClass(p) === fState.feel);
      list.sort((a, b) => (hasImg(b) - hasImg(a)) || b.stock - a.stock);
      const res = $("#finderRes");
      const html = list.length ? list.slice(0, 6).map(p => card(p)).join("") + (list.length > 6 ? `<a class="btn btn--ghost" style="grid-column:1/-1;justify-self:start" href="#/c/accessories?cat=${encodeURIComponent(fState.inst)}">See all ${list.length} matches</a>` : "")
        : `<p class="finder__empty">Nothing matches that combination right now. Try a different feel, or <a href="https://wa.me/${S.whatsapp}" style="color:var(--neel);font-weight:700">ask us on WhatsApp</a> and we'll order the right set.</p>`;
      if (flip) Motion.flip(res, () => { res.innerHTML = html; }); else res.innerHTML = html;
    }
    $$("#finder [data-q]").forEach(g => g.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", g).forEach(x => x.setAttribute("aria-pressed", x === b)); fState[g.dataset.q] = b.dataset.v; renderFinder(true);
    }));
    $("#finderStock").addEventListener("change", () => renderFinder(true));
    renderFinder(false);
    return { hero: $(".hero"), strings: hs };
  }

  /* ---------- Listing (department, brand, search, all) ---------- */
  const PAGE = 24;
  let shown = PAGE;
  function parseQuery(qs) {
    const u = new URLSearchParams(qs || ""), arr = k => (u.get(k) || "").split("|").filter(Boolean);
    return { cat: arr("cat"), brand: arr("brand"), colour: arr("colour"), stock: u.get("stock") === "1", sort: u.get("sort") || "relevance", q: u.get("q") || "" };
  }
  function toQuery(f) {
    const u = new URLSearchParams();
    if (f.q) u.set("q", f.q);
    ["cat", "brand", "colour"].forEach(k => { if (f[k].length) u.set(k, f[k].join("|")); });
    if (f.stock) u.set("stock", "1"); if (f.sort !== "relevance") u.set("sort", f.sort);
    const s = u.toString(); return s ? "?" + s : "";
  }
  function listingBase(kind, key, f) {
    if (kind === "c" && key !== "all") return byDept(key);
    if (kind === "brand") return C.products.filter(p => p.brand === key);
    if (kind === "search") return search(f.q);
    return C.products.slice();
  }
  function applyFilters(base, f) {
    let list = base.filter(p => (!f.cat.length || f.cat.includes(p.cat)) && (!f.brand.length || f.brand.includes(p.brand)) && (!f.colour.length || f.colour.includes(p.colour)) && (!f.stock || p.stock > 0));
    const s = f.sort;
    if (s === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (s === "za") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (s === "stock") list.sort((a, b) => b.stock - a.stock);
    else if (s === "brand") list.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    else if (!f.q) list.sort((a, b) => (b.stock > 0) - (a.stock > 0) || hasImg(b) - hasImg(a) || a.name.localeCompare(b.name));
    return list;
  }
  function viewListing(kind, key, qs) {
    const f = parseQuery(qs); shown = PAGE;
    const dept = kind === "c" ? D[key] : null;
    const title = dept ? dept.name : kind === "brand" ? key : kind === "search" ? `Results for “${f.q}”` : "Every product";
    const desc = dept ? dept.blurb : kind === "brand" ? `Everything we stock from ${key}.` : kind === "search" ? "" : `All ${C.products.length} products across seven departments.`;
    const cats = dept ? catsOf(dept.id) : null;
    app.innerHTML = `
      <section class="lhead"><div class="wrap">
        ${crumbs([["Home", "#/"], ...(dept ? [[dept.name, null]] : kind === "brand" ? [["Brands", "#/c/all"], [key, null]] : [[kind === "search" ? "Search" : "All products", null]])])}
        ${dept ? `<svg class="lhead__art" viewBox="0 0 64 64" aria-hidden="true" data-parallax>${window.ART[dept.icon]}</svg>` : ""}
        <h1 data-split>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}
        ${cats ? `<div class="lchips" id="catChips">${cats.map(([c, n]) => `<button class="chip" data-chip="${esc(c)}" aria-pressed="${f.cat.includes(c)}">${esc(c)} <span>${n}</span></button>`).join("")}</div>` : ""}
      </div></section>
      <div class="wrap listing">
        <aside class="filters" id="filters" aria-label="Filters"></aside>
        <div>
          <div class="ltools">
            <div style="display:flex;gap:10px;align-items:center"><button class="btn btn--ghost filters-btn" id="filtersBtn" style="height:40px">Filters</button><p class="ltools__count" id="lcount"></p></div>
            <div class="ltools__right">
              <label class="sr-only" for="sort">Sort by</label>
              <select class="select" id="sort">${[["relevance", kind === "search" ? "Best match" : "Recommended"], ["stock", "Most in stock"], ["az", "Name A to Z"], ["za", "Name Z to A"], ["brand", "Brand"]].map(([v, l]) => `<option value="${v}"${f.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select>
              <div class="viewtoggle" role="group" aria-label="Layout"><button data-view="grid" aria-label="Grid view" aria-pressed="${Store.get().view !== "list"}"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg></button><button data-view="list" aria-label="List view" aria-pressed="${Store.get().view === "list"}"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>
            </div>
          </div>
          <div class="active-filters" id="activeF"></div>
          <div class="grid${Store.get().view === "list" ? " grid--list" : ""}" id="grid"></div>
          <div class="more" id="more"></div>
        </div>
      </div>`;
    const base = listingBase(kind, key, f);
    const state = { kind, key, f, base };
    renderListingBody(state, false);

    const route = () => `#/${kind === "c" ? "c/" + key : kind === "brand" ? "brand/" + encodeURIComponent(key) : kind}`;
    function update(mut) {
      mut(state.f); shown = PAGE;
      history.replaceState(null, "", route() + toQuery(state.f));
      renderListingBody(state, true);
    }
    $("#sort").addEventListener("change", e => update(f => { f.sort = e.target.value; }));
    $$(".viewtoggle button").forEach(b => b.addEventListener("click", () => {
      Store.setView(b.dataset.view); $$(".viewtoggle button").forEach(x => x.setAttribute("aria-pressed", x === b));
      Motion.flip($("#grid"), () => { $("#grid").classList.toggle("grid--list", b.dataset.view === "list"); });
    }));
    const chips = $("#catChips");
    if (chips) chips.addEventListener("click", e => {
      const b = e.target.closest("[data-chip]"); if (!b) return;
      const c = b.dataset.chip;
      update(f => { f.cat = f.cat.includes(c) ? f.cat.filter(x => x !== c) : [...f.cat, c]; });
    });
    $("#filters").addEventListener("change", e => {
      const t = e.target;
      if (t.dataset.f) update(f => { const k = t.dataset.f; f[k] = t.checked ? [...f[k], t.value] : f[k].filter(x => x !== t.value); });
      if (t.id === "fStock") update(f => { f.stock = t.checked; });
    });
    $("#filters").addEventListener("click", e => {
      const sw = e.target.closest("[data-swatch]");
      if (sw) update(f => { const c = sw.dataset.swatch; f.colour = f.colour.includes(c) ? f.colour.filter(x => x !== c) : [...f.colour, c]; });
      const g = e.target.closest(".fgroup > button");
      if (g) { const grp = g.parentElement; grp.toggleAttribute("data-closed"); g.setAttribute("aria-expanded", !grp.hasAttribute("data-closed")); }
      if (e.target.closest("[data-close-filters]")) toggleFilters(false);
    });
    $("#filters").addEventListener("input", e => {
      if (e.target.id !== "brandSearch") return;
      const q = e.target.value.toLowerCase();
      $$("#brandList .check").forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(q); });
    });
    $("#activeF").addEventListener("click", e => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      const [k, v] = b.dataset.rm.split("::");
      update(f => { if (k === "stock") f.stock = false; else if (k === "all") { f.cat = []; f.brand = []; f.colour = []; f.stock = false; } else f[k] = f[k].filter(x => x !== v); });
    });
    $("#more").addEventListener("click", e => {
      if (!e.target.closest("button")) return;
      const before = shown; shown += PAGE;
      const list = applyFilters(state.base, state.f);
      $("#grid").insertAdjacentHTML("beforeend", list.slice(before, shown).map(p => card(p, { list: Store.get().view === "list" })).join(""));
      renderMore(list.length);
      const added = $$("#grid .card").slice(before);
      if (!Motion.reduce) gsap.fromTo(added, { opacity: 0, y: 24 }, { opacity: 1, y: 0, stagger: 0.03, duration: 0.6 });
      ScrollTrigger.refresh();
    });
    $("#filtersBtn").addEventListener("click", () => toggleFilters(true));
    function toggleFilters(on) { $("#filters").classList.toggle("is-open", on); Motion.fade($("#scrim"), on); $("#scrim").onclick = () => toggleFilters(false); }
  }
  function renderMore(total) {
    $("#more").innerHTML = total > shown ? `<p class="ltools__count">Showing ${Math.min(shown, total)} of ${total}</p><div class="more__bar"><i style="width:${(Math.min(shown, total) / total) * 100}%"></i></div><button class="btn btn--ghost">Show ${Math.min(PAGE, total - shown)} more</button>` : "";
  }
  function renderListingBody(state, animate) {
    const { f, base } = state;
    const list = applyFilters(base, f);
    // Facet counts are computed against everything except the facet itself.
    const facet = (k) => applyFilters(base, Object.assign({}, f, { [k]: k === "stock" ? false : [] }));
    const catC = new Map(), brC = new Map(), colC = new Map();
    facet("cat").forEach(p => catC.set(p.cat, (catC.get(p.cat) || 0) + 1));
    facet("brand").forEach(p => brC.set(p.brand, (brC.get(p.brand) || 0) + 1));
    facet("colour").forEach(p => p.colour && colC.set(p.colour, (colC.get(p.colour) || 0) + 1));
    const allCats = [...new Set(base.map(p => p.cat))].map(c => [c, catC.get(c) || 0]).sort((a, b) => b[1] - a[1]);
    const allBrands = [...new Set(base.map(p => p.brand))].map(b => [b, brC.get(b) || 0]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const inStockN = facet("stock").filter(p => p.stock > 0).length;
    const grp = (title, body, closed) => `<div class="fgroup"${closed ? " data-closed" : ""}><button aria-expanded="${!closed}">${title}${ICON.chev}</button><div class="fgroup__body">${body}</div></div>`;
    const checks = (k, items) => items.map(([v, n]) => `<label class="check"><input type="checkbox" data-f="${k}" value="${esc(v)}"${f[k].includes(v) ? " checked" : ""}${!n && !f[k].includes(v) ? " disabled" : ""}><span>${esc(v)}</span><span>${n}</span></label>`).join("");
    const filtersEl = $("#filters");
    const keepOpen = {}; $$(".fgroup", filtersEl).forEach((g, i) => { keepOpen[i] = g.hasAttribute("data-closed"); });
    filtersEl.innerHTML = `<div class="filters__head"><h2>Filters</h2><button class="iconbtn" data-close-filters aria-label="Close filters"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>` +
      grp("Availability", `<label class="toggle">In stock only <span style="color:var(--ink-3);font-weight:500;margin-left:auto">${inStockN}</span><input type="checkbox" id="fStock"${f.stock ? " checked" : ""}></label>`) +
      (allCats.length > 1 ? grp("Category", checks("cat", allCats)) : "") +
      (allBrands.length > 1 ? grp("Brand", (allBrands.length > 8 ? '<input class="fgroup__search" id="brandSearch" placeholder="Find a brand" aria-label="Find a brand">' : "") + `<div id="brandList">${checks("brand", allBrands)}</div>`) : "") +
      (colC.size ? grp("Colour", `<div class="swatches">${[...colC].sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="swatch" data-swatch="${esc(c)}" aria-pressed="${f.colour.includes(c)}" title="${esc(c)} (${n})" aria-label="${esc(c)}, ${n} products" style="background:${SWATCH[c] || "#ccc"}"></button>`).join("")}</div>`) : "");
    $$(".fgroup", filtersEl).forEach((g, i) => { if (keepOpen[i]) g.setAttribute("data-closed", ""); });
    $("#lcount").innerHTML = `<b>${list.length}</b> ${list.length === 1 ? "product" : "products"}`;
    const act = [...f.cat.map(v => ["cat", v]), ...f.brand.map(v => ["brand", v]), ...f.colour.map(v => ["colour", v]), ...(f.stock ? [["stock", "In stock"]] : [])];
    $("#activeF").innerHTML = act.map(([k, v]) => `<button class="chip" data-rm="${k}::${esc(v)}" aria-label="Remove filter ${esc(v)}">${esc(v)}</button>`).join("") + (act.length > 1 ? '<button class="chip" data-rm="all::" style="background:transparent">Clear all</button>' : "");
    $$("#catChips [data-chip]").forEach(b => b.setAttribute("aria-pressed", f.cat.includes(b.dataset.chip)));
    const grid = $("#grid");
    const html = list.length ? list.slice(0, shown).map(p => card(p, { list: Store.get().view === "list" })).join("")
      : `<div class="empty" style="grid-column:1/-1"><h2>Nothing matches those filters.</h2><p>Remove a filter, or tell us what you're after and we'll check with our distributors.</p><a class="btn btn--wa" href="https://wa.me/${S.whatsapp}?text=${encodeURIComponent("Hi Seven Notes, I'm looking for: " + (f.q || ""))}" target="_blank" rel="noopener">${ICON.wa} Ask on WhatsApp</a></div>`;
    if (animate) Motion.flip(grid, () => { grid.innerHTML = html; }); else grid.innerHTML = html;
    renderMore(list.length);
  }

  /* ---------- Product page ---------- */
  const PAIR = {
    "Acoustic Guitars": ["Acoustic Guitar Strings", "Capos", "Bags & Cases", "Stands & Hangers", "Straps"],
    "Electro-Acoustic Guitars": ["Acoustic Guitar Strings", "Cables & Connectors", "Capos", "Bags & Cases", "Guitar Amplifiers"],
    "Travel & Junior Guitars": ["Acoustic Guitar Strings", "Capos", "Bags & Cases"],
    "Classical Guitars": ["Classical Guitar Strings", "Stands & Hangers", "Bags & Cases"],
    "Electric Guitars": ["Guitar Amplifiers", "Electric Guitar Strings", "Cables & Connectors", "Effects & Multi-FX", "Straps"],
    "Bass Guitars": ["Guitar Amplifiers", "Cables & Connectors", "Straps", "Stands & Hangers"],
    "Ukuleles": ["Ukulele & Other Strings", "Bags & Cases", "Capos"], "Violins": ["Violin Accessories", "Ukulele & Other Strings", "Bags & Cases"],
    "Portable Keyboards": ["Keyboard Stands & Pedals", "Bags & Cases", "Power Supplies", "Headphones"],
    "MIDI Controllers": ["Headphones", "Audio Interfaces", "Keyboard Stands & Pedals"],
    "Microphones": ["Mic Stands & Mounts", "Cables & Connectors", "Audio Interfaces"],
    "Headphones": ["Audio Interfaces", "MIDI Controllers"], "Audio Interfaces": ["Microphones", "Headphones", "Studio Monitors"],
    "Guitar Amplifiers": ["Cables & Connectors", "Effects & Multi-FX", "Power Supplies"], "Effects & Multi-FX": ["Power Supplies", "Cables & Connectors"],
    "Djembes & Darbukas": ["Hand Percussion"], "Cajons": ["Hand Percussion", "Drumsticks"], "Electronic Drums & Pads": ["Drumsticks", "Headphones"]
  };
  function viewProduct(id) {
    const p = P[id];
    if (!p) return viewNotFound();
    Store.viewed(id);
    const d = D[p.dept], st = stockInfo(p);
    const variants = [p, ...p.variants.map(v => P[v]).filter(Boolean)].sort((a, b) => a.name.localeCompare(b.name));
    const specs = Object.assign({ Brand: p.brand, Model: p.name, Category: p.cat }, p.colour ? { Colour: p.colour } : {}, p.specs, { Availability: p.stock > 0 ? `${st.label} at our ${S.city} store` : "Ordered in for you, usually 3 to 7 days" });
    const pairs = (PAIR[p.cat] || []).flatMap(c => C.products.filter(x => x.cat === c).sort((a, b) => (hasImg(b) - hasImg(a)) || b.stock - a.stock).slice(0, 2)).slice(0, 8);
    const similar = C.products.filter(x => x.cat === p.cat && x.id !== p.id && !p.variants.includes(x.id)).sort((a, b) => (b.brand === p.brand) - (a.brand === p.brand) || hasImg(b) - hasImg(a) || b.stock - a.stock).slice(0, 10);
    const recent = Store.get().recent.filter(x => x !== id && P[x]).slice(0, 8).map(x => P[x]);
    const wa = `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(`Hi Seven Notes, what's today's price for ${p.name}? (${location.href})`)}`;
    const imgs = p.images || [];
    app.innerHTML = `
      <div class="wrap" style="padding-top:22px">${crumbs([["Home", "#/"], [d.name, "#/c/" + d.id], [p.cat, `#/c/${d.id}?cat=${encodeURIComponent(p.cat)}`], [p.name, null]])}</div>
      <div class="wrap pdp">
        <div class="gallery${imgs.length < 2 ? " gallery--single" : ""}">
          <div class="gallery__thumbs">${imgs.map((src, i) => `<button data-thumb="${i}" aria-label="Show image ${i + 1}" aria-current="${i === 0}"><img src="${src}" alt=""></button>`).join("")}</div>
          <div class="gallery__main" id="gmain">${imgs.length ? `<img src="${imgs[0]}" alt="${esc(p.name)}">` : art(p)}</div>
        </div>
        <div class="pinfo">
          <a class="pinfo__brand" href="#/brand/${encodeURIComponent(p.brand)}">${esc(p.brand === "Generic" ? p.cat : p.brand)}</a>
          <h1>${esc(p.name)}</h1>
          <div class="pinfo__meta"><span class="pill pill--${st.cls}">${st.label}</span><span>${esc(p.cat)}</span></div>
          ${variants.length > 1 ? `<div class="variants"><h2>${variants.every(v => v.colour) ? "Colour" : "Options"}</h2><div class="variants__row">${variants.map(v => `<a class="variant" href="#/p/${v.id}" aria-current="${v.id === p.id}">${v.colour ? `<i style="background:${SWATCH[v.colour] || "#ccc"}"></i>` : ""}${esc(v.colour || v.name.replace(p.brand, "").trim())}</a>`).join("")}</div></div>` : ""}
          <div class="pinfo__price">
            <div><strong>${priceLabel(p)}</strong><p>${S.showPrices && p.price ? "Inclusive of GST." : "Prices move with distributor rates, so we confirm the best price when you ask. It takes a few minutes on WhatsApp."}</p></div>
            <div class="pinfo__actions">
              <div class="qty" aria-label="Quantity"><button data-q="-1" aria-label="Decrease quantity">−</button><output id="pq">1</output><button data-q="1" aria-label="Increase quantity">+</button></div>
              <button class="btn btn--neel" id="padd">${ICON.plus} Add to enquiry list</button>
              <button class="iconbtn heart" style="position:static;background:#fff" data-wish="${p.id}" aria-pressed="${Store.isWished(p.id)}" aria-label="Save to wishlist">${ICON.heart}</button>
            </div>
            <a class="btn btn--wa btn--block" href="${wa}" target="_blank" rel="noopener">${ICON.wa} Get today's price on WhatsApp</a>
          </div>
          <ul class="perks">
            <li>${ICON.check}<span><b>${p.stock > 0 ? "Collect today" : "We'll order it in"}</b> ${p.stock > 0 ? `from our ${esc(S.city)} store, or get it delivered.` : "and message you when it arrives."}</span></li>
            <li>${ICON.check}<span><b>${p.dept === "guitars" || p.dept === "folk" ? "Free setup" : "Genuine stock"}</b> ${p.dept === "guitars" || p.dept === "folk" ? "and tuning before it leaves the store." : "from authorised distributors with manufacturer warranty."}</span></li>
            <li>${ICON.check}<span><b>GST invoice</b> on every order.</span></li>
          </ul>
          <div class="ptabs">
            <h2>About this product</h2><p>${esc(p.desc)}</p>
            <h2>Details</h2><table class="specs"><tbody>${Object.entries(specs).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
          </div>
        </div>
      </div>
      ${pairs.length ? `<section class="section section--mist" style="padding-top:56px;padding-bottom:56px"><div class="wrap"><div class="shead"><div><h2 data-split>Goes well with it.</h2><p>What people usually add when they buy ${p.cat.toLowerCase().replace(/s$/, "")}s.</p></div></div>${rail(pairs)}</div></section>` : ""}
      ${similar.length ? `<section class="section" style="padding-top:56px;padding-bottom:56px"><div class="wrap"><div class="shead"><div><h2 data-split>More ${esc(p.cat.toLowerCase())}.</h2></div><a class="shead__link" href="#/c/${d.id}?cat=${encodeURIComponent(p.cat)}">See all</a></div>${rail(similar)}</div></section>` : ""}
      ${recent.length ? `<section class="section section--mist" style="padding-top:56px;padding-bottom:56px"><div class="wrap"><div class="shead"><div><h2 data-split>Recently viewed.</h2></div></div>${rail(recent)}</div></section>` : ""}`;

    let q = 1;
    $$(".pinfo [data-q]").forEach(b => b.addEventListener("click", () => { q = Math.max(1, Math.min(99, q + +b.dataset.q)); $("#pq").textContent = q; Motion.bump($("#pq")); }));
    $("#padd").addEventListener("click", e => { Store.addToList(p.id, q); Motion.fly(e.currentTarget, imgs[0]); toast(`${q} × ${p.name} added`, true); });
    const main = $("#gmain");
    $$("[data-thumb]").forEach(b => b.addEventListener("click", () => {
      $$("[data-thumb]").forEach(x => x.setAttribute("aria-current", x === b));
      const img = main.querySelector("img"); if (!img) return;
      gsap.to(img, { opacity: 0, scale: 0.96, duration: 0.15, onComplete: () => { img.src = imgs[+b.dataset.thumb]; gsap.to(img, { opacity: 1, scale: 1, duration: 0.4 }); } });
    }));
    if (imgs.length) {
      main.addEventListener("click", () => main.classList.toggle("is-zoom"));
      main.addEventListener("pointermove", e => { const r = main.getBoundingClientRect(); main.querySelector("img").style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; });
      main.addEventListener("pointerleave", () => main.classList.remove("is-zoom"));
    }
    if (!Motion.reduce) gsap.from(".pinfo > *", { opacity: 0, y: 20, duration: 0.7, stagger: 0.05, delay: 0.2 });
    if (!Motion.reduce) gsap.from(".gallery__main", { clipPath: "inset(10% 10% 10% 10% round 22px)", opacity: 0, duration: 1, delay: 0.1 });
    document.title = `${p.name} | Seven Notes, ${S.city}`;
  }

  /* ---------- Wishlist, help, 404 ---------- */
  function viewWishlist() {
    const list = Store.get().wish.map(id => P[id]).filter(Boolean);
    app.innerHTML = `<section class="lhead"><div class="wrap">${crumbs([["Home", "#/"], ["Wishlist", null]])}<h1 data-split>Your wishlist</h1><p>${list.length ? `${list.length} saved ${list.length === 1 ? "product" : "products"}. Add them to your enquiry list when you're ready.` : "Tap the heart on any product to save it here."}</p></div></section>
      <div class="wrap" style="padding-top:28px;padding-bottom:80px">${list.length ? `<div class="grid" id="grid">${list.map(p => card(p)).join("")}</div><div style="margin-top:24px"><button class="btn btn--neel" id="wishAll">${ICON.plus} Add all to enquiry list</button></div>` : `<div class="empty"><h2>Nothing saved yet.</h2><p>Start with a department.</p><a class="btn" href="#/c/guitars">Browse guitars</a></div>`}</div>`;
    const b = $("#wishAll"); if (b) b.addEventListener("click", e => { list.forEach(p => Store.addToList(p.id)); Motion.fly(e.currentTarget, list[0].images[0]); toast(`${list.length} items added`, true); });
  }
  const HELP = {
    enquiry: ["How enquiries work", `<ol><li>Add the products you want to your enquiry list. There's no payment online.</li><li>Open the list and send it to us on WhatsApp, or by email if you prefer.</li><li>We reply with today's best price, availability and delivery or pickup options, usually within the hour during store hours.</li><li>Pay at the store, by UPI or by bank transfer. You get a GST invoice either way.</li></ol>`],
    delivery: ["Delivery and pickup", `<p>Anything marked <b>In stock</b> can be collected from our ${esc(S.city)} store the same day. We deliver across India through trusted couriers; guitars travel in a gig bag inside a double-walled carton.</p><p>Items marked <b>Available to order</b> usually reach us in 3 to 7 days. We'll message you when yours arrives.</p>`],
    returns: ["Returns and warranty", `<p>Every product carries the manufacturer's warranty. If something arrives damaged, message us within 48 hours with a photo of the box and product and we'll arrange a replacement.</p><p>Strings, picks and other consumables can't be returned once opened.</p>`],
    strings: ["Which strings fit my instrument?", `<p>Steel-string acoustic guitars take acoustic strings (bronze or phosphor bronze). Classical guitars only take nylon strings: steel strings can damage the neck. Electric guitars take nickel or stainless steel electric strings.</p><h2>Gauges in one line</h2><p>The first number is the thinnest string. Lighter sets (09 or 10) are easier to press and bend; heavier sets (11, 12 and up) are louder and fuller.</p><p><a class="btn" href="#/?finder=1">Use the string finder</a></p>`]
  };
  function viewHelp(topic) {
    const h = HELP[topic]; if (!h) return viewNotFound();
    app.innerHTML = `<div class="wrap prose">${crumbs([["Home", "#/"], ["Help", null]])}<h1 data-split>${h[0]}</h1>${h[1]}</div>`;
  }
  function viewNotFound() {
    app.innerHTML = `<div class="wrap" style="padding:80px 0"><div class="empty"><h2>We couldn't find that page.</h2><p>It may have moved, or the product is no longer listed.</p><a class="btn" href="#/">Back to the home page</a></div></div>`;
  }

  /* ---------- Enquiry drawer ---------- */
  const drawer = $("#drawer"), scrim = $("#scrim");
  function openDrawer(on) {
    if (on) renderDrawer();
    drawer.setAttribute("aria-hidden", !on); drawer.inert = !on;
    Motion.drawer(drawer, on); Motion.fade(scrim, on);
    scrim.onclick = () => openDrawer(false);
    if (on) { Motion.stop(); setTimeout(() => $("#drawerClose").focus(), 50); } else Motion.start();
  }
  function renderDrawer() {
    const L = Store.get().list, ids = Object.keys(L).filter(id => P[id]);
    if (!ids.length) {
      $("#drawerBody").innerHTML = `<div class="drawer__empty"><svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="#17153B" stroke-width="1.6">${window.ART.strings}</svg><p>Your list is empty. Add products, then send the list to us for today's prices.</p><a class="btn" href="#/c/all" data-close-drawer>Browse products</a></div>`;
      $("#drawerFoot").innerHTML = ""; return;
    }
    $("#drawerBody").innerHTML = ids.map(id => { const p = P[id]; return `<div class="line" data-line="${id}">
      <a class="line__img" href="#/p/${id}" data-close-drawer>${hasImg(p) ? `<img src="${p.images[0]}" alt="">` : art(p, false)}</a>
      <div><div class="line__brand">${esc(p.brand)}</div><a class="line__name" href="#/p/${id}" data-close-drawer>${esc(p.name)}</a><div><span class="pill pill--${stockInfo(p).cls}" style="font-size:12px">${stockInfo(p).label}</span></div><button class="line__rm" data-rm-line="${id}">Remove</button></div>
      <div class="qty"><button data-dq="-1" aria-label="Decrease">−</button><output>${L[id]}</output><button data-dq="1" aria-label="Increase">+</button></div></div>`; }).join("");
    $("#drawerFoot").innerHTML = `
      <div class="field"><label for="eqName">Your name</label><input id="eqName" autocomplete="name"></div>
      <div class="field"><label for="eqNote">Anything we should know? (optional)</label><textarea id="eqNote" placeholder="Pickup or delivery, PIN code, budget…"></textarea></div>
      <button class="btn btn--wa btn--block" id="sendWa">${ICON.wa} Send list on WhatsApp</button>
      <a class="btn btn--ghost btn--block" id="sendMail" href="#">Email the list instead</a>
      <p>We reply with prices and availability. Nothing is charged until you confirm.</p>`;
  }
  function enquiryText() {
    const L = Store.get().list, name = ($("#eqName") || {}).value || "", note = ($("#eqNote") || {}).value || "";
    const lines = Object.keys(L).filter(id => P[id]).map((id, i) => `${i + 1}. ${P[id].name} × ${L[id]}`);
    return `Hi Seven Notes${name ? ", this is " + name : ""}. Please share prices and availability for:\n${lines.join("\n")}${note ? "\n\nNote: " + note : ""}`;
  }
  drawer.addEventListener("click", e => {
    const line = e.target.closest("[data-line]");
    if (e.target.closest("[data-dq]") && line) { const id = line.dataset.line; Store.setQty(id, (Store.get().list[id] || 0) + +e.target.closest("[data-dq]").dataset.dq); if (Store.get().list[id]) { line.querySelector("output").textContent = Store.get().list[id]; Motion.bump(line.querySelector("output")); } else removeLine(line); }
    if (e.target.closest("[data-rm-line]")) { Store.setQty(line.dataset.line, 0); removeLine(line); }
    if (e.target.closest("#sendWa")) window.open(`https://wa.me/${S.whatsapp}?text=${encodeURIComponent(enquiryText())}`, "_blank", "noopener");
    if (e.target.closest("#sendMail")) { e.preventDefault(); location.href = `mailto:${S.email}?subject=${encodeURIComponent("Enquiry from the website")}&body=${encodeURIComponent(enquiryText())}`; }
    if (e.target.closest("[data-close-drawer]")) openDrawer(false);
  });
  function removeLine(line) { gsap.to(line, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: "power2.in", onComplete: () => { line.remove(); if (!Store.listCount()) renderDrawer(); } }); }
  $("#listBtn").addEventListener("click", () => openDrawer(true));
  $("#drawerClose").addEventListener("click", () => openDrawer(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && drawer.getAttribute("aria-hidden") === "false") openDrawer(false); });

  /* ---------- Global delegated actions ---------- */
  function toast(msg, withLink) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${withLink ? '<button data-open-list>View list</button>' : ""}`;
    Motion.toast(t);
  }
  $("#toast").addEventListener("click", e => { if (e.target.closest("[data-open-list]")) openDrawer(true); });
  document.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) { e.preventDefault(); const p = P[add.dataset.add]; Store.addToList(p.id); Motion.fly(add, hasImg(p) && p.images[0]); toast(`${p.name} added`, true); return; }
    const w = e.target.closest("[data-wish]");
    if (w) { e.preventDefault(); const on = Store.toggleWish(w.dataset.wish); $$(`[data-wish="${w.dataset.wish}"]`).forEach(x => { x.setAttribute("aria-pressed", on); x.setAttribute("aria-label", (on ? "Remove from" : "Save to") + " wishlist"); }); Motion.pop(w); if (on) toast("Saved to your wishlist"); }
  });
  Store.on(() => {
    const n = Store.listCount(), w = Store.get().wish.length;
    const lc = $("#listCount"), wc = $("#wishCount");
    lc.hidden = !n; lc.textContent = n; wc.hidden = !w; wc.textContent = w;
  });
  (function initBadges() { const n = Store.listCount(), w = Store.get().wish.length; $("#listCount").hidden = !n; $("#listCount").textContent = n; $("#wishCount").hidden = !w; $("#wishCount").textContent = w; })();
  $("#newsForm").addEventListener("submit", e => { e.preventDefault(); $("#newsForm").hidden = true; $("#newsOk").hidden = false; Motion.pop($("#newsOk")); });

  // Drag-to-scroll for product rails (mouse only; touch scrolls natively).
  document.addEventListener("pointerdown", e => {
    const r = e.target.closest("[data-rail]"); if (!r || e.pointerType !== "mouse") return;
    const x0 = e.clientX, s0 = r.scrollLeft; let moved = false;
    const mv = ev => { const dx = ev.clientX - x0; if (Math.abs(dx) > 5) { moved = true; r.classList.add("is-drag"); } r.scrollLeft = s0 - dx; };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); setTimeout(() => r.classList.remove("is-drag"), 0); if (moved) gsap.to(r, { scrollLeft: r.scrollLeft, duration: 0.01 }); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });

  /* ---------- Router ---------- */
  let current = null, first = true, busy = Promise.resolve();
  function parse() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
    return { seg, qs: qs || "", key: path };
  }
  function render(r) {
    $$(".depts__link").forEach(a => a.setAttribute("aria-current", r.seg[0] === "c" && a.getAttribute("href") === "#/c/" + r.seg[1]));
    document.title = "Seven Notes Music Store, " + S.city;
    let extra = null;
    const [a, b] = r.seg;
    if (!a) extra = viewHome();
    else if (a === "c" && (b === "all" || D[b])) viewListing("c", b, r.qs);
    else if (a === "brand" && b) viewListing("brand", b, r.qs);
    else if (a === "search") viewListing("search", null, r.qs);
    else if (a === "p" && b) viewProduct(b);
    else if (a === "wishlist") viewWishlist();
    else if (a === "help") viewHelp(b);
    else viewNotFound();
    Motion.page(app);
    if (extra && extra.hero) Motion.hero(extra.hero, extra.strings);
    return extra;
  }
  let heroStrings = null;
  function go() {
    const r = parse();
    if (r.seg[0] === "list") { openDrawer(true); history.replaceState(null, "", current ? "#" + current : "#/"); return; }
    // Same listing, only the query changed (e.g. back button after a filter): re-render without the curtain.
    if (!first && current === r.key && r.seg[0] !== "p") { heroStrings && heroStrings.destroy && heroStrings.destroy(); const ex = render(r); heroStrings = ex && ex.strings; return; }
    const wasFirst = first; first = false; current = r.key;
    busy = busy.then(async () => {
      if (!wasFirst) await Motion.cover();
      if (heroStrings) { heroStrings.destroy(); heroStrings = null; }
      Motion.scrollTop(true);
      const ex = render(r); heroStrings = ex && ex.strings;
      if (r.key === "/" && r.qs.includes("finder")) setTimeout(() => { const el = $("#finder"); el && (Motion.lenis ? Motion.lenis.scrollTo(el, { offset: -100 }) : el.scrollIntoView()); }, 300);
      app.focus({ preventScroll: true });
      await (wasFirst ? Motion.intro() : Motion.reveal());
    });
  }
  buildHeader();
  buildSearch();
  addEventListener("hashchange", go);
  go();
})();
