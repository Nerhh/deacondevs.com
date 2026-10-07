/* marcus.gg — /more/: one miniature per project, as on the index */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;
const { REDUCED, INK, INK2, INK3, RULE, PAPER, B4, font, fitText, clamp, easeOut, rng, mini } = MD;
const dither = MD.pattern;
const two = n => String(n).padStart(2, '0');
// the ticket's clock is the menu bar's: London time
const LDN = window.Intl ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : null;
const hms = ms => { if (LDN) return LDN.format(new Date(ms)); const d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); };

// Admit: the ticket's code changes on the real ten-second clock; beside it, the door's log fills in
(function () {
  const STEP = 10000, N = 21;
  // a code is a 21×21 one-bit matrix: three finder squares and the rest drawn from the step
  const matrix = step => {
    const R = rng(step * 2654435761), m = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) m[i] = R() < 0.5 ? 1 : 0;
    const finder = (ox, oy) => {
      for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) {
        const X = ox + x, Y = oy + y;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        m[Y * N + X] = ring === 3 || ring <= 1 ? 1 : 0;
      }
    };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    return m;
  };
  const cache = new Map();
  const codeAt = step => { if (!cache.has(step)) { if (cache.size > 4) cache.clear(); cache.set(step, matrix(step)); } return cache.get(step); };

  const ATTEMPTS = [
    { what: 'live code', ok: true, res: 'Admitted' },
    { what: 'screenshot', ok: false, res: 'Code expired', age: true },
    { what: 'scanned again', ok: false, res: 'Already scanned' },
    { what: 'old owner, after a transfer', ok: false, res: 'Old ticket code' },
  ];
  const EVERY = 2600, FIRST = 700;
  let origin = 0; // wall-clock time of t = 0

  mini('admit', (g, W, H, dpr, t) => {
    const now = Date.now();
    if (!origin || REDUCED) origin = now - t;
    const step = Math.floor(now / STEP), into = now % STEP;

    // the ticket
    const tw = Math.round(clamp(W * 0.36, 128, 176)), tx = 14, ty = 12, th = H - 24;
    g.fillStyle = PAPER; g.fillRect(tx, ty, tw, th);
    g.fillStyle = INK;
    g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = INK3;
    fitText(g, '7K2Q-M9XR-P4TD', tx + 10, ty + 14, tw - 20, 10);
    const stripH = 22, capH = 18;
    const side = Math.max(42, Math.min(tw - 20, th - 28 - stripH - capH - 12));
    const mod = Math.max(1, Math.floor(side / N)), qs = mod * N;
    const qx = Math.round(tx + (tw - qs) / 2), qy = Math.round(ty + 26 + (side - qs) / 2);
    // the new code arrives through a 4×4 Bayer dissolve over the old one
    const cur = codeAt(step), prev = codeAt(step - 1);
    const k = REDUCED ? 16 : Math.min(16, Math.floor((into / 420) * 16));
    g.fillStyle = INK;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const m = (B4[(y & 3) * 4 + (x & 3)] < k ? cur : prev)[y * N + x];
      if (m) g.fillRect(qx + x * mod, qy + y * mod, mod, mod);
    }
    // the security strip: ink, a sweeping line, a square blinking once a second, the server clock
    const sy = Math.round(qy + qs + 10), sx = tx + 8, sw = tw - 16;
    g.fillStyle = INK; g.fillRect(sx, sy, sw, stripH);
    g.fillStyle = PAPER;
    if (!REDUCED) g.fillRect(Math.round(sx + 2 + ((now % 2400) / 2400) * (sw - 5)), sy + 3, 1, stripH - 6);
    if (REDUCED || Math.floor(now / 500) % 2 === 0) g.fillRect(sx + 6, sy + stripH / 2 - 3, 6, 6);
    g.textAlign = 'right';
    fitText(g, hms(now), sx + sw - 6, sy + stripH / 2 + 0.5, sw - 26, 10.5, 500);
    g.fillStyle = INK2; g.textAlign = 'left';
    fitText(g, 'New code in ' + Math.ceil((STEP - into) / 1000) + ' s', sx, sy + stripH + 12, sw, 10);

    // the door's log, newest first
    const lx = tx + tw + 18, lw = W - lx - 14;
    g.fillStyle = INK; g.textAlign = 'left';
    fitText(g, 'Main door', lx, ty + 8, lw * 0.6, 11, 500);
    const n = REDUCED ? 6 : Math.max(0, Math.floor((t - FIRST) / EVERY) + 1);
    const admitted = n > 0 ? 1 : 0;
    g.textAlign = 'right'; g.fillStyle = INK3;
    fitText(g, admitted + ' in', W - 14, ty + 8, lw * 0.4, 10);
    g.fillStyle = INK; g.fillRect(lx, ty + 18, lw, 1);
    const rowH = 38, rows = Math.max(1, Math.floor((th - 26) / rowH));
    for (let r = 0; r < Math.min(rows, n); r++) {
      const e = n - 1 - r;                         // event number, newest first
      const a = r === 0 && e === 0 ? ATTEMPTS[0] : ATTEMPTS[e === 0 ? 0 : 1 + ((e - 1) % 3)];
      const at = REDUCED ? now - r * EVERY : origin + FIRST + e * EVERY;
      const fresh = !REDUCED && r === 0 ? clamp((t - (FIRST + e * EVERY)) / 360, 0, 1) : 1;
      const y = ty + 26 + r * rowH;
      if (fresh < 1) { g.save(); g.beginPath(); g.rect(lx, y, lw, Math.ceil(rowH * Math.ceil(easeOut(fresh) * 4) / 4)); g.clip(); }
      g.fillStyle = INK3; g.textAlign = 'left';
      const what = a.age ? 'screenshot, ' + (31 + (e % 4) * 7) + ' s old' : a.what;
      fitText(g, hms(at) + '  ' + what, lx, y + 8, lw, 10);
      // result: admitted is a filled key, a refusal an outlined one
      g.font = font(11, 500);
      const label = (a.ok ? '✓ ' : '× ') + a.res, bw = Math.min(lw, g.measureText(label).width + 14);
      if (a.ok) { g.fillStyle = INK; g.fillRect(lx, y + 16, bw, 17); g.fillStyle = PAPER; }
      else { g.strokeStyle = INK; g.strokeRect(lx + 0.5, y + 16.5, bw - 1, 16); g.fillStyle = INK; }
      fitText(g, label, lx + 7, y + 25, bw - 12, 11, 500);
      if (fresh < 1) g.restore();
      if (r < Math.min(rows, n) - 1) { g.fillStyle = RULE; g.fillRect(lx, y + rowH - 2, lw, 1); }
    }
    if (n === 0) { g.fillStyle = INK3; g.textAlign = 'left'; fitText(g, 'Waiting for the first scan…', lx, ty + 34, lw, 10); }
  }, 1e9);
})();

// TFT Copilot: a roll-down at level 8 with 30 gold for one 4-cost, five slots a shop, beside the exact odds
(function () {
  // Set 18: level-8 shop odds, a 4-cost pool of 10 copies across 14 champions; you hold 2, 20 other 4-costs are out
  const ODDS = [0.15, 0.2, 0.32, 0.3, 0.03];
  const remaining = 10 - 2, tierRemaining = 10 * 14 - 2 - 20;
  const q = ODDS[3] * remaining / tierRemaining;        // one slot shows the target
  const SHOPS = 14;                                     // the free shop, then 13 rolls at 2 gold, keeping 4 to buy
  const exact = k => 1 - Math.pow(1 - q, 5 * k);         // hit by the k-th shop
  const pctExact = (exact(SHOPS) * 100).toFixed(1);
  const SHOP_MS = 480, HOLD = 2600, CYCLE = SHOPS * SHOP_MS + HOLD;
  const runs = new Map();
  const runOf = c => {
    if (runs.has(c)) return runs.get(c);
    const R = rng(1000 + c * 7919), shops = [];
    let hit = -1;
    for (let s = 0; s < SHOPS && hit < 0; s++) {
      const slots = [];
      for (let i = 0; i < 5; i++) {
        let u = R(), tier = 0;
        while (tier < 4 && u > ODDS[tier]) { u -= ODDS[tier]; tier++; }
        const target = tier === 3 && R() < remaining / tierRemaining;
        slots.push({ cost: tier + 1, target });
        if (target && hit < 0) hit = s;
      }
      shops.push(slots);
    }
    const run = { shops, hit };
    if (runs.size > 6) runs.clear();
    runs.set(c, run);
    return run;
  };

  mini('tft', (g, W, H, dpr, t) => {
    const c = REDUCED ? 3 : Math.floor(t / CYCLE), T = REDUCED ? 1e9 : t % CYCLE;
    const run = runOf(c);
    const shown = Math.min(run.shops.length, Math.floor(T / SHOP_MS) + 1);
    const s = shown - 1, done = shown >= run.shops.length && T > run.shops.length * SHOP_MS;
    const paid = Math.max(0, s) * 2, gold = 30 - paid - (done && run.hit >= 0 ? 4 : 0);
    const x0 = 16, x1 = W - 16;

    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = INK3;
    fitText(g, 'level 8 · one 4-cost · you hold 2', x0, 20, (x1 - x0) * 0.66, 10.5);
    g.textAlign = 'right'; g.fillStyle = INK;
    fitText(g, gold + ' gold', x1, 20, (x1 - x0) * 0.3, 12, 600);

    // the shop: five slots, each a cost tier drawn as a dither density; the target is inked in
    const gap = 6, sw = (x1 - x0 - gap * 4) / 5, sh = clamp(H * 0.2, 34, 48), sy = 34;
    const slots = run.shops[Math.max(0, s)];
    const flip = REDUCED ? 1 : clamp((T - s * SHOP_MS) / 140, 0, 1);
    slots.forEach((sl, i) => {
      const x = Math.round(x0 + i * (sw + gap)), w = Math.round(sw);
      g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(x + 0.5, sy + 0.5, w - 1, sh - 1);
      if (flip < 1 && i >= Math.floor(flip * 5)) return; // the slots turn over left to right
      if (sl.target) {
        g.fillStyle = INK; g.fillRect(x, sy, w, sh);
        g.fillStyle = PAPER; g.textAlign = 'center';
        fitText(g, '✓ hit', x + w / 2, sy + sh / 2 + 0.5, w - 8, 11, 600);
      } else {
        g.fillStyle = dither(g, 0.06 + sl.cost * 0.1, dpr); g.fillRect(x + 3, sy + 3, w - 6, sh - 6);
        g.fillStyle = PAPER; g.fillRect(x + 4, sy + 4, 16, 14);
        g.fillStyle = INK; g.textAlign = 'center';
        fitText(g, String(sl.cost), x + 12, sy + 11.5, 14, 10, 500);
      }
    });

    // the exact odds: chance of having found it by each shop, a staircase to the last affordable roll
    const cy0 = sy + sh + 22, cy1 = H - 26, cx1 = x1;
    const X = k => x0 + (cx1 - x0) * (k / SHOPS), Y = p => cy1 - (cy1 - cy0) * p;
    g.beginPath(); g.moveTo(X(0), cy1);
    for (let k = 1; k <= SHOPS; k++) { g.lineTo(X(k - 1), Y(exact(k))); g.lineTo(X(k), Y(exact(k))); }
    g.lineTo(X(SHOPS), cy1); g.closePath();
    g.fillStyle = dither(g, 0.16, dpr); g.fill();
    g.beginPath();
    for (let k = 1; k <= SHOPS; k++) { g[k === 1 ? 'moveTo' : 'lineTo'](X(k - 1), Y(exact(k))); g.lineTo(X(k), Y(exact(k))); }
    g.strokeStyle = INK; g.lineWidth = 1.25; g.stroke();
    g.fillStyle = INK; g.fillRect(x0, cy1, cx1 - x0, 1);
    for (let k = 0; k <= SHOPS; k++) g.fillRect(Math.round(X(k)), cy1 + 1, 1, k % 7 === 0 ? 4 : 2);
    // where this roll-down is now
    const mk = Math.max(1, shown), mx = Math.round((X(mk - 1) + X(mk)) / 2), my = Math.round(Y(exact(mk)));
    for (let y = cy0 - 4; y < cy1; y += 3) g.fillRect(mx, y, 1, 1);
    g.fillRect(mx - 2, my - 2, 5, 5);
    g.textAlign = 'right'; g.fillStyle = INK;
    fitText(g, pctExact + '% exact', cx1, cy0 - 8, (cx1 - x0) * 0.4, 11, 600);
    g.textAlign = 'left'; g.fillStyle = INK2;
    const line = !done ? 'shop ' + shown + ' of ' + SHOPS + ' · ' + (exact(mk) * 100).toFixed(1) + '% by now'
      : run.hit >= 0 ? 'this run: found on shop ' + (run.hit + 1) + ', ' + gold + ' gold left' : 'this run: missed, ' + gold + ' gold left';
    fitText(g, line, x0, H - 11, x1 - x0, 10.5);
  }, 1e9);
})();
})();
