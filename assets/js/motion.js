/* Motion system. Signature ease: expo.out. Durations: quick .2s, standard .5s, slow .9s.
   One page context per route so every tween/ScrollTrigger is reverted on navigation. */
(function () {
  gsap.registerPlugin(ScrollTrigger, Flip, SplitText);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "expo.out", Q = 0.2, STD = 0.5, SLOW = 0.9;
  gsap.defaults({ ease: EASE, duration: STD });
  document.documentElement.classList.add("js");

  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  let pageCtx = null;
  const curtainBars = () => document.querySelectorAll("#curtain i");

  const Motion = {
    reduce, lenis,
    scrollTop(immediate = true) { if (lenis) lenis.scrollTo(0, { immediate }); else window.scrollTo(0, 0); },
    stop() { lenis && lenis.stop(); }, start() { lenis && lenis.start(); },

    /* Seven bars rise to cover the page, then lift away: the route transition. */
    cover() {
      if (reduce) return gsap.to("#app", { opacity: 0, duration: 0.15 }).then();
      return gsap.timeline()
        .set(curtainBars(), { transformOrigin: "bottom", scaleY: 0 })
        .to(curtainBars(), { scaleY: 1, duration: 0.42, ease: "power3.inOut", stagger: { each: 0.035, from: "start" } })
        .then();
    },
    reveal() {
      if (reduce) return gsap.fromTo("#app", { opacity: 0 }, { opacity: 1, duration: 0.2 }).then();
      gsap.set("#app", { opacity: 1 });
      return gsap.timeline()
        .set(curtainBars(), { transformOrigin: "top" })
        .to(curtainBars(), { scaleY: 0, duration: 0.55, ease: "power3.inOut", stagger: { each: 0.035, from: "start" } })
        .then();
    },

    /* First load: logo bars equalise, then the curtain lifts. */
    intro() {
      const mark = document.querySelector(".header .logo__mark");
      if (reduce) { gsap.set(curtainBars(), { scaleY: 0 }); return Promise.resolve(); }
      gsap.set(curtainBars(), { scaleY: 1 });
      gsap.from(mark, { rotate: -24, scale: 0.6, opacity: 0, transformOrigin: "30% 60%", duration: 1.1, ease: "elastic.out(1, .5)", delay: 0.3 });
      return this.reveal();
    },

    /* Called after a route renders. Returns nothing; everything lives in pageCtx. */
    page(root, opts = {}) {
      if (pageCtx) pageCtx.revert();
      pageCtx = gsap.context(() => {
        if (reduce) return;
        const mm = gsap.matchMedia();

        // Section headings: words rise out of a mask.
        const splits = root.querySelectorAll("[data-split]");
        gsap.set(splits, { opacity: 0 });
        const ctxRef = pageCtx;
        document.fonts.ready.then(() => (ctxRef || pageCtx).add(() => {
          splits.forEach(el => {
            gsap.set(el, { opacity: 1 });
            const split = SplitText.create(el, { type: "lines,words", mask: "lines" });
            gsap.from(split.words, { yPercent: 110, duration: SLOW, stagger: 0.04, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
          });
          ScrollTrigger.refresh();
        }));
        // Generic reveal: rise + fade, batched so rows enter together.
        const items = root.querySelectorAll("[data-reveal]");
        if (items.length) {
          ScrollTrigger.batch(items, {
            start: "top 92%", once: true,
            onEnter: b => gsap.fromTo(b, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.06, overwrite: true })
          });
        }
        // Department tiles: clip-path wipe in, image drifts on scroll.
        root.querySelectorAll(".tile").forEach((t, i) => {
          gsap.from(t, { clipPath: "inset(18% 18% 18% 18% round 22px)", opacity: 0, duration: 1.1, delay: (i % 3) * 0.06, scrollTrigger: { trigger: t, start: "top 90%", once: true } });
          const img = t.querySelector(".tile__img");
          if (img) gsap.fromTo(img, { yPercent: 8 }, { yPercent: -6, ease: "none", scrollTrigger: { trigger: t, scrub: true } });
        });
        // Listing header: giant swara slides against the scroll.
        root.querySelectorAll("[data-parallax]").forEach(el => {
          gsap.to(el, { xPercent: -14, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top top", end: "bottom top", scrub: true } });
        });
        // Pinned horizontal guitar journey (desktop/tablet only).
        mm.add("(min-width: 700px)", () => {
          const track = root.querySelector(".journey__track");
          if (!track) return;
          const dist = () => Math.max(0, track.scrollWidth - innerWidth);
          const tween = gsap.to(track, { x: () => -dist(), ease: "none",
            scrollTrigger: { trigger: ".journey", start: "top top", end: () => "+=" + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 } });
          track.querySelectorAll(".jpanel img").forEach(img => {
            gsap.from(img, { rotate: -8, xPercent: 20, ease: "none", scrollTrigger: { trigger: img.closest(".jpanel"), containerAnimation: tween, start: "left right", end: "center center", scrub: true } });
          });
        });
        // Brand marquee: constant drift, nudged and skewed by scroll velocity.
        root.querySelectorAll(".marquee__row").forEach(row => {
          const loop = gsap.to(row, { xPercent: -50, duration: 40, ease: "none", repeat: -1 });
          const skew = gsap.quickTo(row, "skewX", { duration: 0.4, ease: "power3" });
          ScrollTrigger.create({ trigger: row, onUpdate: self => {
            const v = gsap.utils.clamp(-1, 1, self.getVelocity() / 2500);
            loop.timeScale(1 + Math.abs(v) * 5); skew(-v * 8);
            gsap.to(loop, { timeScale: 1, duration: 1, overwrite: "auto", delay: 0.1 });
          } });
        });
        // Product grid/rail cards on first view.
        const cards = root.querySelectorAll(".grid .card, .rail .card, .finder__res .card");
        if (cards.length) ScrollTrigger.batch(cards, { start: "top 95%", once: true,
          onEnter: b => gsap.fromTo(b, { opacity: 0, y: 24, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.045, overwrite: true }) });
        if (opts.extra) opts.extra();
      }, root);
      requestAnimationFrame(() => ScrollTrigger.refresh());
    },

    hero(hero, strings) {
      if (!hero) return;
      if (reduce) return;
      pageCtx && pageCtx.add(() => {
        const tl = gsap.timeline({ delay: 0.15 });
        tl.from(hero.querySelectorAll("h1 .ln > span"), { yPercent: 115, duration: 1.1, stagger: 0.09 })
          .from(hero.querySelectorAll(".hero__lede, .hero__cta > *, .hero__note"), { opacity: 0, y: 20, duration: 0.8, stagger: 0.06 }, "-=0.75")
          .from(strings.strings, { scaleX: 0, transformOrigin: "100% 50%", duration: 1.2, stagger: 0.07, ease: "expo.inOut" }, 0.1)
          .from(strings.labels, { opacity: 0, x: -20, duration: 0.6, stagger: 0.07 }, 0.6)
          .add(() => strings.strum(0), 1.25);
        // Hero content drifts up and dims as you scroll past.
        gsap.to(hero.querySelector(".hero__copy"), { yPercent: -18, opacity: 0.3, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
      });
    },

    /* Thumbnail arcs from the button to the list icon, then the badge bumps. */
    fly(fromEl, imgSrc) {
      const target = document.getElementById("listBtn");
      const badge = document.getElementById("listCount");
      if (reduce || !fromEl || !target) { this.bump(badge); return; }
      const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
      const f = document.createElement("div"); f.className = "flyer";
      f.innerHTML = imgSrc ? `<img src="${imgSrc}" alt="">` : '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#17153B" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
      document.body.append(f);
      const sx = a.left + a.width / 2 - 32, sy = a.top + a.height / 2 - 32, ex = b.left + b.width / 2 - 32, ey = b.top + b.height / 2 - 32;
      const peak = Math.min(sy, ey) - 120;
      gsap.timeline({ onComplete: () => { f.remove(); this.bump(badge); this.bump(target); } })
        .fromTo(f, { x: sx, y: sy, scale: 0.4 }, { scale: 1, duration: 0.18, ease: "back.out(2)" })
        .to(f, { duration: 0.7, ease: "power2.inOut", keyframes: { x: [sx, (sx + ex) / 2, ex], y: [sy, peak, ey], easeEach: "sine.inOut" } }, 0.05)
        .to(f, { scale: 0.25, opacity: 0.4, duration: 0.25, ease: "power2.in" }, "-=0.22");
    },
    bump(el) {
      if (!el || reduce) return;
      gsap.fromTo(el, { scale: 1 }, { keyframes: { scale: [1, 1.35, 0.92, 1] }, duration: 0.5, ease: "power2.out", overwrite: true });
    },
    pop(el) { if (!el || reduce) return; gsap.fromTo(el, { scale: 0.6 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, .4)" }); },

    /* Animate a grid between two states. update() must change the DOM. */
    flip(container, update) {
      if (reduce) { update(); return; }
      const state = Flip.getState(container.querySelectorAll(".card"));
      update();
      Flip.from(state, { duration: 0.6, ease: "expo.out", scale: true, absolute: false, nested: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.02 }),
        onLeave: els => gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.3 }) });
      requestAnimationFrame(() => ScrollTrigger.refresh());
    },

    drawer(el, open, from = "right") {
      const x = from === "right" ? "105%" : "-105%";
      if (open) {
        gsap.set(el, { visibility: "visible" });
        gsap.fromTo(el, { x }, { x: "0%", duration: reduce ? 0 : 0.6 });
        if (!reduce) gsap.from(el.querySelectorAll(".line, .drawer__foot > *, .mnav a"), { opacity: 0, x: from === "right" ? 30 : -30, duration: 0.5, stagger: 0.04, delay: 0.12 });
      } else {
        gsap.to(el, { x, duration: reduce ? 0 : 0.4, ease: "power3.in", onComplete: () => gsap.set(el, { visibility: "hidden" }) });
      }
    },
    fade(el, show) {
      if (show) { el.hidden = false; gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 }); }
      else gsap.to(el, { opacity: 0, duration: 0.25, onComplete: () => { el.hidden = true; } });
    },
    mega(el, show) {
      if (show) {
        el.hidden = false;
        if (reduce) return;
        gsap.fromTo(el, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.55 });
        gsap.from(el.querySelectorAll(".mega__intro > *, .mega__cats a, .mega__feature"), { opacity: 0, y: 12, duration: 0.45, stagger: 0.015, delay: 0.08 });
      } else {
        if (reduce) { el.hidden = true; return; }
        gsap.to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.3, ease: "power3.in", onComplete: () => { el.hidden = true; } });
      }
    },
    toast(el) {
      gsap.killTweensOf(el);
      gsap.set(el, { xPercent: -50, x: 0 });
      gsap.timeline()
        .fromTo(el, { y: 160 }, { y: 0, duration: reduce ? 0 : 0.5, ease: "back.out(1.6)" })
        .to(el, { y: 160, duration: reduce ? 0 : 0.35, ease: "power3.in", delay: 2.8 });
    }
  };
  window.Motion = Motion;
})();
