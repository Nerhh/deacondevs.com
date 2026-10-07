/* TFT Copilot — the roll-down, worked out.
   rollDown below is src/engine/odds.ts from the TFT Copilot repository, ported line for line: an exact
   dynamic programme over (gold, copies bought), slot by slot. While the instrument is on screen a
   simulation of the same shops runs beside it, as the engine's own tests check it. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;

MD.safe('tft', function tft() {
  const fig = document.querySelector('.tf-fig');
  const win = document.querySelector('.tf-win');
  const canvas = document.getElementById('tf-curve');
  const ctl = document.getElementById('tf-ctl');
  if (!fig || !win || !canvas || !ctl) return;
  const { REDUCED, INK, INK3, RULE2, fitText, clamp, rng } = MD;
  const $ = id => document.getElementById(id);
  const out = { p: $('tf-p'), what: $('tf-what'), slot: $('tf-slot'), shop: $('tf-shop'), left: $('tf-left'), sim: $('tf-sim') };
  const wispSw = $('tf-wisp');
  const resetBtn = $('tf-reset');

  /* ---------- Set 18 (src/data/rules.ts; champion counts from the worked example) ---------- */

  const RULES = {
    poolSize: { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 },
    championsPerCost: { 1: 14, 2: 13, 3: 14, 4: 14, 5: 10 },
    shopOdds: {
      1: [1, 0, 0, 0, 0], 2: [1, 0, 0, 0, 0], 3: [0.75, 0.25, 0, 0, 0], 4: [0.55, 0.3, 0.15, 0, 0],
      5: [0.45, 0.33, 0.2, 0.02, 0], 6: [0.3, 0.4, 0.25, 0.05, 0], 7: [0.19, 0.3, 0.4, 0.1, 0.01],
      8: [0.15, 0.2, 0.32, 0.3, 0.03], 9: [0.1, 0.17, 0.25, 0.33, 0.15], 10: [0.05, 0.1, 0.2, 0.4, 0.25],
    },
    shopSlots: 5,
    rollCost: 2,
  };

  /* ---------- src/engine/odds.ts ---------- */

  function poolView(rules, cost, targetOut, otherTierOut) {
    const per = rules.poolSize[cost] || 0;
    const n = rules.championsPerCost[cost] || 0;
    const remaining = Math.max(0, per - targetOut);
    const tierRemaining = Math.max(remaining, per * n - targetOut - otherTierOut);
    return { remaining, tierRemaining };
  }
  function slotHitChance(rules, level, cost, view) {
    const odds = (rules.shopOdds[level] || [])[cost - 1] || 0;
    if (view.tierRemaining <= 0) return 0;
    return odds * (view.remaining / view.tierRemaining);
  }
  function merge(m, k, s, p) {
    if (p <= 0) return;
    const e = m.get(k);
    if (e) e.p += p; else m.set(k, { s, p });
  }
  function rollDownStates(rules, level, start, active, opts) {
    const pattern = opts.slotPattern && opts.slotPattern.length ? opts.slotPattern : [rules.shopSlots || 5];
    let shopIndex = 0;
    const rollCost = rules.rollCost || 2;
    const reserve = opts.reserveGold || 0;
    const key = s => s.gold + '|' + s.got.join(',');
    const done = s => (opts.stopOnAny ? s.got.some((g, i) => g >= active[i].need) : s.got.every((g, i) => g >= active[i].need));
    let frontier = new Map();
    for (const x of start) merge(frontier, key(x.s), x.s, x.p);
    const finished = [];
    let first = true;
    while (frontier.size > 0) {
      // pay for this shop (unless it is the free one already showing)
      const paid = new Map();
      for (const { s, p } of frontier.values()) {
        if (done(s)) { finished.push({ s, p }); continue; }
        const shopCost = first && opts.freeShop ? 0 : rollCost;
        // gold only falls and the pool only shrinks, so once nothing missing can show up and still be bought, rolling is wasted
        const useful = active.some((t, i) =>
          s.got[i] < t.need &&
          s.gold - shopCost - t.cost >= reserve &&
          slotHitChance(rules, level, t.cost, poolView(rules, t.cost, t.out + s.got[i], t.otherTierOut)) > 0);
        if (!useful) { finished.push({ s, p }); continue; }
        const ns = { gold: s.gold - shopCost, got: s.got };
        merge(paid, key(ns), ns, p);
      }
      first = false;
      if (paid.size === 0) break;
      // walk the slots of this shop
      let cur = paid;
      const slots = pattern[shopIndex++ % pattern.length];
      for (let slot = 0; slot < slots; slot++) {
        const next = new Map();
        for (const { s, p } of cur.values()) {
          let miss = 1;
          active.forEach((t, i) => {
            if (s.got[i] >= t.need) return;
            const q = slotHitChance(rules, level, t.cost, poolView(rules, t.cost, t.out + s.got[i], t.otherTierOut));
            if (q <= 0) return;
            if (s.gold - t.cost < reserve) return; // seen but can't afford it
            miss -= q;
            const got = s.got.slice();
            got[i]++;
            const ns = { gold: s.gold - t.cost, got };
            merge(next, key(ns), ns, p * q);
          });
          merge(next, key(s), s, p * Math.max(0, miss));
        }
        cur = next;
      }
      frontier = cur;
    }
    return finished;
  }
  function rollDown(rules, level, gold, targets, opts) {
    const active = targets.filter(t => t.need > 0);
    if (!active.length) return { pAll: 1, expectedGoldLeft: gold, expectedGoldLeftIfHit: gold };
    const finished = rollDownStates(rules, level, [{ s: { gold, got: active.map(() => 0) }, p: 1 }], active, opts || {});
    let pAll = 0, goldLeft = 0, goldIfHit = 0;
    for (const { s, p } of finished) {
      goldLeft += p * s.gold;
      if (active.every((t, i) => s.got[i] >= t.need)) { pAll += p; goldIfHit += p * s.gold; }
    }
    return { pAll, expectedGoldLeft: goldLeft, expectedGoldLeftIfHit: pAll > 0 ? goldIfHit / pAll : undefined };
  }

  /* ---------- the situation ---------- */

  const EXAMPLE = { level: 8, gold: 30, cost: 4, held: 2, need: 1, rivals: 0, tier: 20, wisp: false };
  const S = Object.assign({}, EXAMPLE);
  const pool = () => RULES.poolSize[S.cost];
  const LIMITS = {
    level: () => [3, 10, 1],
    gold: () => [0, 100, 2],
    cost: () => [1, 5, 1],
    held: () => [0, pool() - S.rivals - S.need, 1],
    need: () => [1, pool() - S.held - S.rivals, 1],
    rivals: () => [0, pool() - S.held - S.need, 1],
    tier: () => [0, Math.min(80, pool() * (RULES.championsPerCost[S.cost] - 1)), 1],
  };
  function settle() {
    // a cheaper unit has a bigger pool, a dearer one a smaller: pull everything back inside the new limits
    const p = pool();
    S.need = clamp(S.need, 1, p);
    S.held = clamp(S.held, 0, p - S.need);
    S.rivals = clamp(S.rivals, 0, p - S.held - S.need);
    S.tier = clamp(S.tier, 0, LIMITS.tier()[1]);
  }
  const target = () => [{ id: 'unit', cost: S.cost, need: S.need, out: S.held + S.rivals, otherTierOut: S.tier }];
  const opts = () => ({ freeShop: true, slotPattern: S.wisp ? [5, 4] : undefined });

  /* ---------- the answer: one exact run for the budget, and one per budget for the curve ---------- */

  const BUDGETS = 50; // 0, 2, 4 … 100 gold
  let curve = new Float64Array(BUDGETS + 1), from = new Float64Array(BUDGETS + 1), tCurve = -1e9;
  let exact = { pAll: 0, expectedGoldLeft: 0 };
  const pct = (p, d) => (p * 100).toFixed(d == null ? 1 : d) + '%';

  function compute() {
    settle();
    const t = target(), o = opts();
    exact = rollDown(RULES, S.level, S.gold, t, o);
    from = curveNow(performance.now());
    curve = new Float64Array(BUDGETS + 1);
    for (let b = 0; b <= BUDGETS; b++) curve[b] = b * 2 === S.gold ? exact.pAll : rollDown(RULES, S.level, b * 2, t, o).pAll;
    tCurve = performance.now();
    const q = slotHitChance(RULES, S.level, S.cost, poolView(RULES, S.cost, S.held + S.rivals, S.tier));
    if (out.p) out.p.textContent = pct(exact.pAll);
    if (out.what) out.what.textContent = S.need === 1 ? 'chance to find it before the gold runs out' : 'chance to find all ' + S.need + ' before the gold runs out';
    if (out.slot) out.slot.textContent = pct(q, 2);
    if (out.shop) out.shop.textContent = pct(1 - Math.pow(1 - q, 5));
    if (out.left) out.left.textContent = Math.round(exact.expectedGoldLeft) + (exact.expectedGoldLeftIfHit != null && Math.round(exact.expectedGoldLeftIfHit) !== Math.round(exact.expectedGoldLeft) ? ' · ' + Math.round(exact.expectedGoldLeftIfHit) + ' if it hits' : '');
    sim.n = 0; sim.hits = 0; sim.seed++;
    sim.R = rng(sim.seed * 2654435761);
    if (REDUCED) { while (sim.n < sim.cap) { sim.n++; if (simOnce(sim.R)) sim.hits++; } }
    renderControls();
    paintSim();
    draw();
  }

  // the curve eases from the old answer to the new one in six steps
  function curveNow(now) {
    if (REDUCED) return curve;
    const k = Math.min(1, Math.floor(((now - tCurve) / 240) * 6) / 6);
    if (k >= 1) return curve;
    const c = new Float64Array(BUDGETS + 1);
    for (let b = 0; b <= BUDGETS; b++) c[b] = from[b] + (curve[b] - from[b]) * k;
    return c;
  }

  /* ---------- the check: the same shops, rolled at random ---------- */

  const sim = { n: 0, hits: 0, seed: 1, R: rng(1), cap: 20000 };
  function simOnce(R) {
    const odds = RULES.shopOdds[S.level], pattern = S.wisp ? [5, 4] : [5];
    let gold = S.gold, got = 0, shop = 0, first = true;
    const out0 = S.held + S.rivals;
    for (;;) {
      if (got >= S.need) return true;
      const shopCost = first ? 0 : RULES.rollCost;
      if (!(gold - shopCost - S.cost >= 0 && slotHitChance(RULES, S.level, S.cost, poolView(RULES, S.cost, out0 + got, S.tier)) > 0)) return false;
      gold -= shopCost; first = false;
      const slots = pattern[shop++ % pattern.length];
      for (let s = 0; s < slots && got < S.need; s++) {
        // a cost by the level's odds, then a champion of that cost weighted by the copies left
        let u = R(), c = 0;
        while (c < 4 && u >= odds[c]) { u -= odds[c]; c++; }
        if (c + 1 !== S.cost) continue;
        const v = poolView(RULES, S.cost, out0 + got, S.tier);
        if (R() * v.tierRemaining < v.remaining && gold - S.cost >= 0) { gold -= S.cost; got++; }
      }
    }
  }
  function paintSim() {
    if (!out.sim) return;
    if (!sim.n) { out.sim.textContent = 'Checking against simulated roll-downs…'; return; }
    const est = sim.hits / sim.n, diff = Math.abs(est - exact.pAll) * 100;
    out.sim.innerHTML = '';
    out.sim.append('Simulated: ');
    const b = document.createElement('b'); b.textContent = pct(est); out.sim.append(b);
    out.sim.append(' of ' + sim.n.toLocaleString('en-GB') + ' roll-downs, ' + (diff < 0.05 ? 'level with' : diff.toFixed(1) + ' points from') + ' the exact ' + pct(exact.pAll) + '.');
  }

  /* ---------- the curve ---------- */

  const st = MD.stage(canvas);
  const g = st.ctx;
  const R = Math.round;
  function draw() {
    const W = st.W, H = st.H;
    if (!W || !H) return;
    g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const c = curveNow(performance.now());
    const x0 = 34, x1 = W - 6, y0 = 22, y1 = H - 24;
    const X = gold => x0 + (x1 - x0) * (gold / 100), Y = p => y1 - (y1 - y0) * p;
    // the grid: quarters, dotted
    g.textBaseline = 'middle';
    for (let q = 0; q <= 4; q++) {
      const y = R(Y(q / 4));
      g.fillStyle = q ? RULE2 : INK;
      if (q) for (let x = x0; x < x1; x += 3) g.fillRect(x, y, 1, 1); else g.fillRect(x0, y, x1 - x0, 1);
      if (q % 2 === 0) { g.fillStyle = INK3; g.textAlign = 'right'; fitText(g, q * 25 + '%', x0 - 6, y, x0 - 6, 10); }
    }
    g.fillStyle = INK3;
    for (let gold = 0; gold <= 100; gold += 20) {
      g.fillRect(R(X(gold)), y1 + 1, 1, 4);
      g.textAlign = gold === 100 ? 'right' : 'center';
      fitText(g, gold === 100 ? '100 gold' : String(gold), gold === 100 ? x1 + 1 : X(gold), y1 + 13, 70, 10);
    }
    // the staircase: each step is one budget, two gold apart
    const path = upto => {
      g.beginPath(); g.moveTo(X(0), y1);
      for (let b = 0; b <= Math.min(BUDGETS, upto); b++) {
        const xa = X(Math.max(0, b * 2 - 1)), xb = X(Math.min(100, b * 2 + 1));
        g.lineTo(xa, Y(c[b])); g.lineTo(xb, Y(c[b]));
      }
      g.lineTo(X(Math.min(100, Math.min(BUDGETS, upto) * 2 + 1)), y1); g.closePath();
    };
    path(BUDGETS); g.fillStyle = MD.pattern(g, 0.12, st.dpr); g.fill();
    const bNow = Math.floor(S.gold / 2);
    path(bNow); g.fillStyle = MD.pattern(g, 0.38, st.dpr); g.fill();
    g.beginPath();
    for (let b = 0; b <= BUDGETS; b++) {
      const xa = X(Math.max(0, b * 2 - 1)), xb = X(Math.min(100, b * 2 + 1));
      g[b ? 'lineTo' : 'moveTo'](xa, Y(c[b])); g.lineTo(xb, Y(c[b]));
    }
    g.strokeStyle = INK; g.lineWidth = 1.25; g.stroke();
    // this budget: a dotted drop line, the exact answer as a solid square, the simulation as a hollow one
    const mx = R(X(S.gold)), my = R(Y(c[bNow]));
    g.fillStyle = INK;
    for (let y = y0 - 8; y < y1; y += 3) g.fillRect(mx, y, 1, 1);
    g.fillRect(mx - 3, my - 3, 7, 7);
    if (sim.n > 200) {
      const sy = R(Y(sim.hits / sim.n));
      g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(mx - 5.5, sy - 5.5, 11, 11);
    }
    g.textAlign = mx > (x0 + x1) / 2 ? 'right' : 'left';
    g.fillStyle = INK;
    fitText(g, S.gold + ' gold', mx + (g.textAlign === 'right' ? -8 : 8), y0 - 8, (x1 - x0) * 0.45, 11, 600);
  }

  /* ---------- the keys ---------- */

  const rows = Array.from(ctl.querySelectorAll('.tf-row[data-k]'));
  function renderControls() {
    rows.forEach(row => {
      const k = row.dataset.k, [lo, hi] = LIMITS[k]();
      const o = row.querySelector('output');
      if (o) o.textContent = String(S[k]);
      const [dn, up] = row.querySelectorAll('button');
      if (dn) dn.disabled = S[k] <= lo;
      if (up) up.disabled = S[k] >= hi;
      if (k === 'tier') { const lab = row.querySelector('.lab'); if (lab) lab.textContent = 'Other ' + S.cost + '-costs out'; }
    });
    if (wispSw) wispSw.setAttribute('aria-checked', S.wisp ? 'true' : 'false');
  }
  function nudge(k, d) {
    const [lo, hi, step] = LIMITS[k]();
    const v = clamp(S[k] + d * step, lo, hi);
    if (v === S[k]) return false;
    S[k] = v;
    compute();
    return true;
  }
  // a key held down repeats, as a keyboard does
  let rep = 0;
  const stopRep = () => { clearTimeout(rep); rep = 0; };
  rows.forEach(row => {
    row.querySelectorAll('button[data-d]').forEach(btn => {
      const d = Number(btn.dataset.d);
      btn.addEventListener('click', e => { if (e.detail === 0 || !btn.dataset.held) nudge(row.dataset.k, d); delete btn.dataset.held; });
      btn.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        stopRep();
        const tick = first => { if (nudge(row.dataset.k, d)) { btn.dataset.held = '1'; rep = setTimeout(() => tick(false), first ? 420 : 70); } };
        rep = setTimeout(() => tick(true), 420);
      });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => btn.addEventListener(ev, stopRep));
    });
  });
  if (wispSw) wispSw.addEventListener('click', () => { S.wisp = !S.wisp; compute(); });
  if (resetBtn) resetBtn.addEventListener('click', () => { Object.assign(S, EXAMPLE); compute(); });

  /* ---------- run ---------- */

  let opened = REDUCED || !('IntersectionObserver' in window), lastSimPaint = 0;
  fig.addEventListener('opened', () => { opened = true; st.size(); draw(); });
  MD.loop(win, now => {
    if (opened && sim.n < sim.cap) {
      // a few hundred roll-downs a frame until twenty thousand; the estimate settles onto the exact line
      const batch = 240;
      for (let i = 0; i < batch && sim.n < sim.cap; i++) { sim.n++; if (simOnce(sim.R)) sim.hits++; }
      if (now - lastSimPaint > 120 || sim.n >= sim.cap) { lastSimPaint = now; paintSim(); }
      draw();
    } else if (performance.now() - tCurve < 300) draw();
  });
  MD.repaints.push(() => { st.size(); draw(); });
  compute();
});
})();
