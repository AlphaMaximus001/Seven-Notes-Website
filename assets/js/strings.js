/* Seven playable strings. Sweep the pointer across them to pluck; each string is one department.
   Sound is synthesised with Karplus-Strong (no audio files) and only plays after the visitor turns it on. */
(function () {
  const NOTES = [130.81, 146.83, 164.81, 174.61, 196.0, 220.0, 246.94]; // Sa Re Ga Ma Pa Dha Ni (C3 major)
  let ctx = null, buffers = [], soundOn = false;

  function makeBuffer(freq) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.2), period = Math.round(sr / freq);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % period;
      const v = 0.4985 * (ring[idx] + ring[next]);
      d[i] = ring[idx];
      ring[idx] = v; idx = next;
    }
    return buf;
  }
  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC(); buffers = NOTES.map(makeBuffer);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }
  function play(i, vel) {
    if (!soundOn || !ctx) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = buffers[i]; f.type = "lowpass"; f.frequency.value = 1800 + vel * 3200;
    g.gain.value = 0.18 + vel * 0.32;
    src.connect(f).connect(g).connect(ctx.destination); src.start();
  }

  function mount(root, depts, counts) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("aria-hidden", "true");
    root.prepend(svg);
    const labels = root.querySelector(".strings__labels");
    const strs = depts.map((d, i) => {
      const glow = document.createElementNS(svgNS, "path"); glow.setAttribute("class", "s-glow");
      const line = document.createElementNS(svgNS, "path"); line.setAttribute("class", "s-line");
      const w = 4.2 - i * 0.45; // thick (low Sa) to thin (high Ni)
      line.setAttribute("stroke-width", w); glow.setAttribute("stroke-width", w * 3);
      line.setAttribute("stroke", i < 4 ? "url(#wound)" : "url(#plain)");
      svg.append(glow, line);
      const a = document.createElement("a");
      a.className = "slabel"; a.href = "#/c/" + d.id;
      a.innerHTML = `<b>${d.swara}</b><span>${d.name}</span><em>${counts[d.id]} products</em>`;
      a.addEventListener("pointerenter", () => pluck(i, 0.22, 0.6));
      a.addEventListener("focus", () => pluck(i, 0.22, 0.5));
      labels.append(a);
      return { line, glow, label: a, amp: 0, t: 0, px: 0.5, y: 0, w };
    });
    const defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML = '<linearGradient id="wound" x1="0" x2="1"><stop offset="0" stop-color="#B8862E"/><stop offset=".5" stop-color="#FFD27A"/><stop offset="1" stop-color="#B8862E"/></linearGradient>' +
      '<linearGradient id="plain" x1="0" x2="1"><stop offset="0" stop-color="#9A98C2"/><stop offset=".5" stop-color="#F2F1FF"/><stop offset="1" stop-color="#9A98C2"/></linearGradient>';
    svg.prepend(defs);

    let W = 0, H = 0, running = false, lastY = null, lastX = null, lastT = 0;
    function layout() {
      const r = root.getBoundingClientRect(); W = r.width; H = r.height;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const top = H * 0.1, gap = (H * 0.8) / (strs.length - 1);
      strs.forEach((s, i) => { s.y = top + gap * i; s.label.style.top = s.y + "px"; });
      draw(0);
    }
    function path(s, disp) {
      const x0 = 0, x1 = W - 6, cx = x0 + (x1 - x0) * s.px;
      return `M${x0},${s.y} Q${cx},${s.y + disp * 2} ${x1},${s.y}`;
    }
    function draw(dt) {
      let alive = false;
      strs.forEach((s, i) => {
        let disp = 0;
        if (s.amp > 0.05) {
          s.t += dt;
          const freq = 9 + i * 1.6; // visual wobble frequency (Hz), higher strings shimmer faster
          disp = s.amp * Math.exp(-s.t * 2.2) * Math.cos(2 * Math.PI * freq * s.t);
          if (s.amp * Math.exp(-s.t * 2.2) < 0.05) s.amp = 0; else alive = true;
        }
        const d = path(s, disp);
        s.line.setAttribute("d", d); s.glow.setAttribute("d", d);
        s.glow.style.opacity = Math.min(0.9, Math.abs(disp) / 10);
      });
      return alive;
    }
    function tick(time, deltaTime) {
      if (!draw(Math.min(deltaTime, 50) / 1000)) { gsap.ticker.remove(tick); running = false; }
    }
    function pluck(i, px, vel) {
      const s = strs[i];
      s.px = Math.min(0.92, Math.max(0.08, px)); s.amp = 4 + vel * 18; s.t = 0;
      play(i, vel);
      if (!running) { running = true; gsap.ticker.add(tick); }
    }
    function onMove(e) {
      const r = root.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
      if (lastY !== null) {
        const dy = y - lastY, dt = Math.max(1, now - lastT), vel = Math.min(1, Math.abs(dy) / dt / 1.4);
        strs.forEach((s, i) => {
          if ((lastY - s.y) * (y - s.y) < 0) pluck(i, ((x + lastX) / 2) / W, 0.25 + vel * 0.75);
        });
      }
      lastY = y; lastX = x; lastT = now;
    }
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", () => { lastY = null; });
    root.addEventListener("pointerdown", e => { if (soundOn) ensureAudio(); onMove(e); });
    const ro = new ResizeObserver(layout); ro.observe(root);
    layout();

    // Ambient life: a soft, silent shimmer every few seconds while the hero is on screen.
    let ambient = null, visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(root);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ambient = setInterval(() => {
        if (!visible || document.hidden) return;
        const i = Math.floor(Math.random() * strs.length), s = strs[i];
        if (s.amp > 0) return;
        s.px = 0.3 + Math.random() * 0.5; s.amp = 1.6; s.t = 0;
        if (!running) { running = true; gsap.ticker.add(tick); }
      }, 2400);
    }
    return {
      strings: strs.map(s => s.line),
      labels: strs.map(s => s.label),
      strum(delay = 0) { strs.forEach((s, i) => setTimeout(() => pluck(i, 0.62, 0.35), delay * 1000 + i * 70)); },
      destroy() { ro.disconnect(); io.disconnect(); clearInterval(ambient); gsap.ticker.remove(tick); }
    };
  }

  window.HeroStrings = {
    mount,
    toggleSound() { soundOn = !soundOn; if (soundOn) ensureAudio(); return soundOn; },
    isOn: () => soundOn
  };
})();
