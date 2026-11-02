/* Persistent per-visitor state: enquiry list, wishlist, recently viewed. Storage can fail (private mode). */
(function () {
  const KEY = "sevennotes:v1";
  let state = { list: {}, wish: [], recent: [], view: "grid" };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) state = Object.assign(state, s); } catch (e) {}
  const subs = new Set();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} subs.forEach(fn => fn(state)); }
  window.Store = {
    get: () => state,
    on: fn => subs.add(fn),
    listCount: () => Object.values(state.list).reduce((a, b) => a + b, 0),
    addToList(id, qty = 1) { state.list[id] = Math.min(99, (state.list[id] || 0) + qty); save(); },
    setQty(id, qty) { if (qty <= 0) delete state.list[id]; else state.list[id] = Math.min(99, qty); save(); },
    clearList() { state.list = {}; save(); },
    toggleWish(id) { const i = state.wish.indexOf(id); if (i >= 0) state.wish.splice(i, 1); else state.wish.unshift(id); save(); return i < 0; },
    isWished: id => state.wish.includes(id),
    viewed(id) { state.recent = [id].concat(state.recent.filter(x => x !== id)).slice(0, 12); save(); },
    setView(v) { state.view = v; save(); }
  };
})();
