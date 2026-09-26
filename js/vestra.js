/* Vestra — six statements, each drawn one bit at a time.
   Every figure is illustrative, but the arithmetic is real: the tiles sum to the net worth,
   the month's waterfall lands on it, and the futures are the app's own seeded simulation. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;
const { INK, INK2, INK3, RULE, RULE2, PAPER, B8, INK32, REDUCED, clamp, easeOut, fitText, font } = MD;

/* ---------- helpers ---------- */

const gbp = n => '£' + Math.round(Math.abs(n)).toLocaleString('en-GB');
const money = n => (Math.round(n) < 0 ? '−' : '') + gbp(n);
const signed = n => (n < 0 ? '−' : '+') + gbp(n);
const pct = (n, d) => (n < 0 ? '−' : '+') + Math.abs(n).toFixed(d == null ? 1 : d) + '%';
const steps = (p, n) => Math.floor(clamp(p, 0, 1) * n + 1e-9) / n; // stepped progress, the way older machines moved
const phase = (ms, t0, dur) => clamp((ms - t0) / dur, 0, 1);

// mulberry32 and a Box–Muller normal: the same generator Vestra seeds its simulations with
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let spare = null;
  return () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let u = rng();
    while (u <= 1e-12) u = rng();
    const v = rng(), mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

// an 8×8 Bayer tile at a given coverage, one CSS pixel per cell, cached per context
const pats = new WeakMap();
function dither(ctx, level, colour) {
  const k = clamp(Math.round(level * 64), 0, 64), c = colour || INK;
  let m = pats.get(ctx);
  if (!m) { m = {}; pats.set(ctx, m); }
  const key = c + k;
  if (!m[key]) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 8;
    const g = cv.getContext('2d');
    g.fillStyle = c;
    for (let i = 0; i < 64; i++) if (B8[i] < k) g.fillRect(i & 7, i >> 3, 1, 1);
    m[key] = ctx.createPattern(cv, 'repeat');
  }
  return m[key];
}
// dithered rectangle whose pattern travels with it
function dRect(ctx, x, y, w, h, level, colour) {
  if (w <= 0 || h <= 0) return;
  x = Math.round(x); y = Math.round(y);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = dither(ctx, level, colour);
  ctx.fillRect(0, 0, Math.round(w), Math.round(h));
  ctx.restore();
}
// a 1px frame drawn with fills, so it is crisp at any whole device-pixel ratio
function frame(ctx, x, y, w, h, c) {
  ctx.fillStyle = c || INK;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}
function dotsH(ctx, x0, x1, y, c, on, off) {
  ctx.fillStyle = c || INK3;
  for (let x = Math.round(x0); x < x1; x += (on || 1) + (off || 1)) ctx.fillRect(x, Math.round(y), Math.min(on || 1, x1 - x), 1);
}
function dotsV(ctx, x, y0, y1, c, on, off) {
  ctx.fillStyle = c || INK3;
  for (let y = Math.round(y0); y < y1; y += (on || 1) + (off || 1)) ctx.fillRect(Math.round(x), y, 1, Math.min(on || 1, y1 - y));
}
// a one-bit polyline: one filled run per pixel column, so nothing is ever anti-aliased
function trace(ctx, x0, x1, fy, w) {
  let py = null;
  for (let x = x0; x <= x1; x++) {
    const y = Math.round(fy(x));
    if (py === null) ctx.fillRect(x, y, w, w);
    else { const a = Math.min(py, y), b = Math.max(py, y); ctx.fillRect(x, a, w, b - a + w); }
    py = y;
  }
}
// "label  value" as one unit that never leaves its box
function pair(ctx, label, value, x, y, maxW, size, align) {
  let sz = size;
  const floor = Math.max(8, Math.round(size * 0.72));
  const widths = () => {
    ctx.font = font(sz, 400); const a = ctx.measureText(label).width;
    ctx.font = font(sz, 500); const b = ctx.measureText(value).width;
    return [a, b];
  };
  let [a, b] = widths();
  while (sz > floor && a + b + sz * 0.7 > maxW) { sz -= 0.5; [a, b] = widths(); }
  const gap = sz * 0.7, total = Math.min(maxW, a + gap + b);
  const left = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK3;
  fitText(ctx, label, left, y, Math.max(8, maxW - b - gap), sz, 400, floor);
  ctx.fillStyle = INK;
  fitText(ctx, value, left + a + gap, y, Math.max(8, maxW - a - gap), sz, 500, floor);
}

/* ---------- a statement's drawing: sized by MD.stage, run by MD.loop, started when seen ---------- */

function scene(id, cfg) {
  const cv = document.getElementById(id);
  if (!cv) return null;
  const s = MD.stage(cv);
  const sc = { s, cv, ms: REDUCED ? Infinity : 0, started: REDUCED, dirty: true, t0: 0, key: null };
  sc.paint = () => {
    if (!s.W || !s.H) return;
    const ctx = s.ctx;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, s.W, s.H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    cfg.draw(ctx, s.W, s.H, sc.ms, sc);
    sc.dirty = false;
  };
  if (!REDUCED) {
    MD.onVisible(cv, () => {
      sc.started = true; sc.dirty = true;
      if (cfg.onStart) cfg.onStart(sc);
    }, 0.5);
  }
  MD.loop(cv, t => {
    const resized = s.size();
    if (REDUCED) { sc.paint(); return; }
    if (sc.started) { if (!sc.t0) sc.t0 = t; sc.ms = t - sc.t0; }
    // every frame while it animates; afterwards only when the idle loop moves on
    const key = !sc.started ? -2 : sc.ms < cfg.dur ? sc.ms : cfg.tick ? Math.floor(sc.ms / cfg.tick) : -1;
    if (resized || sc.dirty || key !== sc.key || (cfg.busy && cfg.busy(sc))) { sc.key = key; sc.paint(); }
  });
  MD.repaints.push(() => { s.size(); sc.paint(); });
  return sc;
}

/* ---------- the figures (illustrative) ---------- */

// the nine classes from Vestra's asset taxonomy; debt counts negative
const CLASSES = [
  ['Cash', 14200, 0.25], ['Premium Bonds', 10000, 0.5], ['Equity', 68450, 0.12],
  ['Crypto', 5860, 0.44], ['Commodity', 4310, 0.06], ['Property', 265000, 0.38],
  ['Collectable', 3950, 0.19], ['Other', 1200, 0.31], ['Debt', -188370, 0.25],
];
const NET = CLASSES.reduce((a, c) => a + c[1], 0); // 184,600

// August in review: start + market + added + income − fees = end, exactly
const MONTH = [
  ['Start', 180240, 'total'], ['The market', 2686], ['You added', 1500],
  ['Income', 212], ['Fees', -38], ['End', 184600, 'total'],
];
const M_CHANGE = MONTH[5][1] - MONTH[0][1];
if (MONTH.slice(1, 5).reduce((a, r) => a + r[1], MONTH[0][1]) !== MONTH[5][1] || MONTH[5][1] !== NET) {
  console.error('vestra: the month does not add up');
}

/* ---------- 01 · Everything counts: nine tiles fall and stack into one total ---------- */

MD.safe('vestra-tiles', function tiles() {
  const T0 = 120, GAP = 230, FALL = 380, COUNT = 420;
  const land = i => T0 + i * GAP + FALL;

  function tile(ctx, x, y, t, c) {
    const inv = c[1] < 0, fg = inv ? PAPER : INK;
    const fs = t >= 104 ? 12 : 11, pad = t >= 100 ? 8 : 6;
    const band = pad * 2 + fs * 2 + 6;
    ctx.fillStyle = inv ? INK : PAPER;
    ctx.fillRect(x, y, t, t);
    dRect(ctx, x + 1, y + band + 1, t - 2, t - band - 2, c[2], inv ? PAPER : INK);
    ctx.fillStyle = fg;
    ctx.fillRect(x, y + band, t, 1);
    frame(ctx, x, y, t, t, INK);
    ctx.fillStyle = fg;
    fitText(ctx, c[0], x + pad, y + pad + fs, t - pad * 2, fs, 500);
    ctx.fillStyle = inv ? RULE2 : INK2;
    fitText(ctx, money(c[1]), x + pad, y + pad + fs * 2 + 5, t - pad * 2, fs, 400);
  }

  scene('vs-c1', {
    dur: land(8) + COUNT + 60,
    draw(ctx, W, H, ms) {
      const side = W >= 600, gap = side ? 8 : 6, panelH = 108;
      let S = side ? Math.min(H - 28, Math.round(W * 0.47), 372) : Math.min(W - 2, 300, H - 150);
      const t = Math.floor((S - 2 * gap) / 3);
      S = 3 * t + 2 * gap;
      let x0, y0, px, py, pw;
      if (side) {
        pw = Math.min(300, W - S - 56);
        x0 = Math.round((W - S - 56 - pw) / 2); y0 = Math.round((H - S) / 2) - 2;
        px = x0 + S + 56; py = Math.round(y0 + (S - panelH) / 2);
      } else {
        pw = S; x0 = Math.round((W - S) / 2); y0 = 12;
        px = x0; py = y0 + S + 26;
      }

      // the floor they land on
      ctx.fillStyle = INK;
      const fx0 = Math.max(0, x0 - 10), fx1 = Math.min(W, x0 + S + 10);
      ctx.fillRect(fx0, y0 + S + 4, fx1 - fx0, 1);

      let A = 0, D = 0;
      CLASSES.forEach((c, i) => {
        const start = T0 + i * GAP;
        if (ms < start) return;
        const col = i % 3, row = 2 - Math.floor(i / 3);
        const tx = x0 + col * (t + gap), ty = y0 + row * (t + gap);
        const y = Math.round(-t - 4 + (ty + t + 4) * Math.pow(steps(phase(ms, start, FALL), 7), 1.6));
        tile(ctx, tx, y, t, c);
        const since = ms - land(i);
        if (since >= 0 && since < 180) {
          const g = since < 90 ? 4 : 8;
          ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
          ctx.strokeRect(tx - g + 0.5, ty - g + 0.5, t + g * 2 - 1, t + g * 2 - 1);
          ctx.restore();
        }
        const f = steps(phase(ms, land(i), COUNT), 8);
        if (c[1] >= 0) A += c[1] * f; else D += c[1] * f;
      });

      // the ledger: assets, debt, and what is left
      const fs = side ? 13 : 12, big = side ? 38 : 30;
      ctx.font = font(fs, 400);
      const lw = ctx.measureText('Net worth').width;
      const row = (label, value, y) => {
        ctx.textAlign = 'left'; ctx.fillStyle = INK3;
        fitText(ctx, label, px, y, lw + 4, fs, 400);
        ctx.textAlign = 'right'; ctx.fillStyle = INK;
        fitText(ctx, value, px + pw, y, pw - lw - 12, fs, 400);
      };
      row('Assets', money(A), py + 16);
      row('Debt', D ? money(D) : '£0', py + 42);
      ctx.fillStyle = INK;
      ctx.fillRect(px, py + 58, pw, 1);
      ctx.textAlign = 'left'; ctx.fillStyle = INK3;
      fitText(ctx, 'Net worth', px, py + 100, lw + 4, fs, 400);
      ctx.textAlign = 'right'; ctx.fillStyle = INK;
      fitText(ctx, money(A + D), px + pw, py + 100, pw - lw - 12, big, 500);
      ctx.textAlign = 'left';
    },
  });
});

/* ---------- 02 · the figure itself: an odometer over a year of 06:00 snapshots ---------- */

MD.safe('vestra-networth', function networth() {
  const N = 365, AUG = N - 1 - 31;
  const snaps = new Float64Array(N);
  (function series() {
    const g = gauss(mulberry32(20250901)), w = new Float64Array(N);
    for (let i = 1; i < N; i++) w[i] = w[i - 1] + g() * 520;
    const bridge = (i0, i1, v0, v1) => {
      for (let i = i0; i <= i1; i++) {
        const f = (i - i0) / (i1 - i0);
        snaps[i] = v0 + (v1 - v0) * f + (w[i] - (w[i0] + (w[i1] - w[i0]) * f));
      }
    };
    bridge(0, AUG, 158900, MONTH[0][1]);
    bridge(AUG, N - 1, MONTH[0][1], NET);
  })();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, snaps[i]); hi = Math.max(hi, snaps[i]); }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;

  // the odometer: each digit a window over a 0–9–0 strip; a wheel only turns as the one to its right rolls past nine
  const el = document.getElementById('vs-odo');
  let odo = null;
  if (el && !REDUCED) {
    const text = el.textContent.trim();
    const sr = document.createElement('span');
    sr.className = 'vs-sr';
    sr.textContent = text;
    el.parentNode.insertBefore(sr, el);
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    let power = text.replace(/\D/g, '').length - 1;
    const wheels = [];
    for (const ch of text) {
      if (/\d/.test(ch)) {
        const w = document.createElement('span'), strip = document.createElement('span');
        w.className = 'odo-w';
        for (let d = 0; d <= 10; d++) { const r = document.createElement('span'); r.textContent = String(d % 10); strip.appendChild(r); }
        w.appendChild(strip);
        el.appendChild(w);
        wheels.push({ strip, P: Math.pow(10, power--), last: -1 });
      } else {
        const c = document.createElement('span');
        c.className = 'odo-c';
        c.textContent = ch;
        el.appendChild(c);
      }
    }
    odo = wheels;
  }
  function setOdo(v) {
    if (!odo) return;
    for (const w of odo) {
      let pos = w.P === 1 ? v % 10 : Math.floor(v / w.P) % 10 + Math.max(0, (v % w.P) - (w.P - 1));
      pos = Math.floor(pos * 4 + 1e-6) / 4; // rolls in quarter-steps, like a mechanical counter
      if (pos !== w.last) { w.last = pos; w.strip.style.transform = `translateY(${-pos}em)`; }
    }
  }
  setOdo(0);

  const DUR = 2600;
  scene('vs-c2', {
    dur: DUR + 40, tick: 530,
    draw(ctx, W, H, ms) {
      const p = phase(ms, 0, DUR);
      setOdo(p >= 1 ? NET : NET * easeOut(p));
      const top = 6, base = H - 24;
      const fy = x => {
        const f = (x / (W - 1)) * (N - 1), i = Math.min(N - 2, Math.floor(f)), u = f - i;
        const v = snaps[i] + (snaps[i + 1] - snaps[i]) * u;
        return base - 3 - ((v - lo) / (hi - lo)) * (base - 3 - top);
      };
      const xEnd = Math.round(steps(p, 52) * (W - 1));

      // baseline with a tick for each month
      ctx.fillStyle = RULE2;
      ctx.fillRect(0, base, W, 1);
      for (let j = 0; j <= 12; j++) ctx.fillRect(Math.min(W - 1, Math.round((j / 12) * (W - 1))), base + 1, 1, 4);

      if (xEnd > 0) {
        ctx.beginPath();
        ctx.moveTo(0, base);
        for (let x = 0; x <= xEnd; x++) ctx.lineTo(x, Math.round(fy(x)));
        ctx.lineTo(xEnd, base);
        ctx.closePath();
        ctx.fillStyle = dither(ctx, 0.12);
        ctx.fill();
        ctx.fillStyle = INK;
        trace(ctx, 0, xEnd, fy, 1);
        const blink = p < 1 || REDUCED || Math.floor(ms / 530) % 2 === 0;
        if (blink) ctx.fillRect(Math.min(W - 5, xEnd - 2), Math.round(fy(xEnd)) - 2, 5, 5);
      }

      ctx.fillStyle = INK3;
      const fs = W < 480 ? 10.5 : 11;
      fitText(ctx, '1 Sep 2025', 0, H - 5, W / 2 - 8, fs, 400);
      ctx.textAlign = 'right';
      fitText(ctx, p >= 1 ? 'today, 06:00' : 'snapshot ' + String(Math.max(1, Math.round((xEnd / (W - 1)) * N))).padStart(3, '0'), W, H - 5, W / 2 - 8, fs, 400);
      ctx.textAlign = 'left';
    },
  });
});

/* ---------- 03 · The month, unfolded: a waterfall that lands exactly on the end figure ---------- */

MD.safe('vestra-month', function month() {
  const F = 178000, TOP = 185000; // the axis is cut: marked on the total bars
  const B0 = 150, BG = 320, GROW = 300;
  const tones = [0.62, 0.38, 0.26, 0.5, 0, 0.62];
  const levels = [];
  let run = 0;
  MONTH.forEach(r => {
    if (r[2]) { levels.push([F, r[1]]); run = r[1]; } else { levels.push([run, run + r[1]]); run += r[1]; }
  });
  const label = r => (r[2] ? money(r[1]) : signed(r[1]));
  const FOOT = [['Best', 'Global ETF +4.1%'], ['Toughest', 'Bitcoin −6.2%'], ['Transactions', '14']];
  const fEnd = B0 + 6 * BG;

  function header(ctx, W, ms, fs) {
    ctx.fillStyle = INK;
    fitText(ctx, 'August in review', 0, 14, W * 0.55, fs, 500);
    if (ms >= B0 + 5 * BG + GROW) {
      ctx.textAlign = 'right';
      fitText(ctx, signed(M_CHANGE) + ' · ' + pct((M_CHANGE / MONTH[0][1]) * 100), W, 14, W * 0.42, fs, 500);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = RULE;
    ctx.fillRect(0, 24, W, 1);
  }
  function bar(ctx, i, x, y, w, h, vertical) {
    const r = MONTH[i];
    if (w <= 0 || h <= 0) return;
    if (r[1] < 0) { ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h); }
    else dRect(ctx, x, y, w, h, tones[i]);
    frame(ctx, x, y, w, h, INK);
    if (r[2]) { // the cut in the axis
      ctx.save();
      ctx.beginPath();
      if (vertical) {
        const yb = y + h - 13;
        if (h < 22) { ctx.restore(); return; }
        ctx.moveTo(x - 3, yb + 3); ctx.lineTo(x + w + 3, yb - 3); ctx.lineTo(x + w + 3, yb + 1); ctx.lineTo(x - 3, yb + 7);
      } else {
        const xb = x + 12;
        if (w < 22) { ctx.restore(); return; }
        ctx.moveTo(xb - 3, y - 3); ctx.lineTo(xb + 1, y - 3); ctx.lineTo(xb + 7, y + h + 3); ctx.lineTo(xb + 3, y + h + 3);
      }
      ctx.closePath();
      ctx.fillStyle = PAPER; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  }

  scene('vs-c3', {
    dur: fEnd + 3 * 120 + 60,
    draw(ctx, W, H, ms) {
      const vertical = W >= 560, fs = vertical ? 12 : 11;
      header(ctx, W, ms, vertical ? 13 : 12);

      if (vertical) {
        const footY = H - 8, footRule = H - 28, names = footRule - 16, base = names - 20, top = 62;
        const colW = W / 6, bw = Math.round(Math.min(72, colW * 0.52));
        const y = v => base - ((v - F) / (TOP - F)) * (base - top);
        ctx.fillStyle = INK;
        ctx.fillRect(0, base, W, 1);
        MONTH.forEach((r, i) => {
          const start = B0 + i * BG, cx = colW * (i + 0.5), x = Math.round(cx - bw / 2);
          ctx.textAlign = 'center';
          ctx.fillStyle = ms >= start ? INK2 : RULE2;
          fitText(ctx, r[0], cx, names, colW - 10, fs, 400);
          ctx.textAlign = 'left';
          if (ms < start) return;
          const [a, b] = levels[i], g = steps(phase(ms, start, GROW), 6);
          let y0, y1;
          if (r[2]) { y0 = Math.round(y(b)); y1 = base; y0 = Math.round(y1 - (y1 - y0) * g); }
          else if (r[1] >= 0) { y1 = Math.round(y(a)); y0 = Math.round(y1 - Math.max(2, y(a) - y(b)) * g); }
          else { y0 = Math.round(y(a)); y1 = Math.round(y0 + Math.max(2, y(b) - y(a)) * g); }
          bar(ctx, i, x, y0, bw, Math.max(1, y1 - y0 + (r[2] ? 0 : 1)), true);
          if (i < 5 && ms >= start + BG) dotsH(ctx, x + bw + 2, Math.round(cx + colW - bw / 2) - 2, Math.round(y(levels[i][1])), INK3, 1, 2);
          if (g >= 1) {
            ctx.textAlign = 'center'; ctx.fillStyle = INK;
            fitText(ctx, label(r), cx, Math.min(y0, Math.round(y(Math.max(a, b)))) - 8, colW - 6, fs, 500);
            ctx.textAlign = 'left';
          }
        });
        ctx.fillStyle = RULE;
        ctx.fillRect(0, footRule, W, 1);
        FOOT.forEach((f, j) => {
          if (ms < fEnd + j * 120) return;
          const align = ['left', 'center', 'right'][j], x = [0, W / 2, W][j];
          pair(ctx, f[0], f[1], x, footY, W / 3 - 12, fs, align);
        });
      } else {
        const rowsTop = 38, footH = 66, rowH = Math.min(38, Math.floor((H - rowsTop - footH - 8) / 6));
        ctx.font = font(fs, 400);
        const nameW = Math.min(92, Math.ceil(ctx.measureText('You added').width) + 10);
        ctx.font = font(fs, 500);
        const valW = Math.min(84, Math.ceil(ctx.measureText('£184,600').width) + 8);
        const bx0 = nameW + 4, bx1 = W - valW - 6, bh = Math.max(10, Math.round(rowH * 0.46));
        const x = v => bx0 + ((v - F) / (TOP - F)) * (bx1 - bx0);
        ctx.fillStyle = INK;
        ctx.fillRect(bx0, rowsTop, 1, rowH * 6);
        MONTH.forEach((r, i) => {
          const start = B0 + i * BG, ry = rowsTop + i * rowH, by = Math.round(ry + (rowH - bh) / 2), mid = ry + rowH / 2 + 4;
          ctx.fillStyle = ms >= start ? INK2 : RULE2;
          fitText(ctx, r[0], 0, mid, nameW - 6, fs, 400);
          if (ms < start) return;
          const [a, b] = levels[i], g = steps(phase(ms, start, GROW), 6);
          let x0, x1;
          if (r[2]) { x0 = bx0; x1 = Math.round(bx0 + (x(b) - bx0) * g); }
          else if (r[1] >= 0) { x0 = Math.round(x(a)); x1 = Math.round(x0 + Math.max(2, x(b) - x(a)) * g); }
          else { x1 = Math.round(x(a)); x0 = Math.round(x1 - Math.max(2, x(a) - x(b)) * g); }
          bar(ctx, i, x0, by, Math.max(1, x1 - x0 + (r[2] ? 0 : 1)), bh, false);
          if (i < 5 && ms >= start + BG) dotsV(ctx, Math.round(x(levels[i][1])), by + bh + 2, by + rowH - 2, INK3, 1, 2);
          if (g >= 1) {
            ctx.textAlign = 'right'; ctx.fillStyle = INK;
            fitText(ctx, label(r), W, mid, valW, fs, 500);
            ctx.textAlign = 'left';
          }
        });
        const fr = rowsTop + rowH * 6 + 12;
        ctx.fillStyle = RULE;
        ctx.fillRect(0, fr, W, 1);
        FOOT.forEach((f, j) => {
          if (ms < fEnd + j * 120) return;
          const y = fr + 18 + j * 18;
          ctx.fillStyle = INK3;
          fitText(ctx, f[0], 0, y, W * 0.4, fs, 400);
          ctx.textAlign = 'right'; ctx.fillStyle = INK;
          fitText(ctx, f[1], W, y, W * 0.56, fs, 500);
          ctx.textAlign = 'left';
        });
      }
    },
  });
});

/* ---------- 04 · Deposits aren't gains: flatten the step to see the time-weighted return ---------- */

MD.safe('vestra-deposit', function deposit() {
  const K = 52, KD = 31, DEP = 15000, END = 68450;
  const m = new Float64Array(K + 1);
  m[0] = 1;
  const g = gauss(mulberry32(95028));
  for (let k = 1; k <= K; k++) m[k] = m[k - 1] * (1 + 0.0017 + 0.017 * g());
  const V0 = (END / (m[K] / m[KD]) - DEP) / m[KD];
  const TWR = (m[K] - 1) * 100;
  const GAIN = END - V0;
  // money-weighted (XIRR) on the same flows: −V0 at the start, −deposit in week 31, +END at the year's end
  let irr = 0.1;
  const npv = r => -V0 - DEP * Math.pow(1 + r, -KD / K) + END / (1 + r);
  for (let i = 0; i < 60; i++) { const d = (npv(irr + 1e-6) - npv(irr)) / 1e-6; irr -= npv(irr) / d; }
  const XIRR = irr * 100;

  const btn = document.getElementById('vs-t4');
  let mode = REDUCED ? 0 : 1; // 1 = money in, 0 = time-weighted
  let from = mode, to = mode, tSwitch = -1, touched = false, sc = null;
  const S_DUR = 480;
  const sNow = ms => (tSwitch < 0 ? to : from + (to - from) * steps(phase(ms, tSwitch, S_DUR), 8));
  function set(tw, byUser) {
    if (byUser) touched = true;
    if (btn) btn.setAttribute('aria-pressed', tw ? 'true' : 'false');
    const next = tw ? 0 : 1;
    if (!sc) { from = to = next; return; }
    from = sNow(sc.ms); to = next;
    tSwitch = REDUCED || !sc.started ? -1 : sc.ms;
    sc.dirty = true;
    if (REDUCED || !sc.started) sc.paint();
  }
  if (btn) {
    btn.setAttribute('aria-pressed', mode ? 'false' : 'true');
    btn.addEventListener('click', () => set(btn.getAttribute('aria-pressed') !== 'true', true));
  }

  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k <= K; k++) {
    const tw = V0 * m[k], raw = k >= KD ? tw + (DEP * m[k]) / m[KD] : tw;
    lo = Math.min(lo, tw); hi = Math.max(hi, raw);
  }
  const span = hi - lo; lo -= span * 0.06; hi += span * 0.05;

  const DRAW = 1500;
  sc = scene('vs-c4', {
    dur: DRAW + 60,
    busy: s => tSwitch >= 0 && s.ms < tSwitch + S_DUR + 40,
    onStart() {
      setTimeout(() => { if (!touched) set(true, false); }, 2600);
    },
    draw(ctx, W, H, ms) {
      const sv = sNow(ms);
      const small = W < 520, top = small ? 70 : 76, base = H - 24;
      const yv = v => base - 1 - ((v - lo) / (hi - lo)) * (base - 1 - top);
      const kAt = x => (x / (W - 1)) * K;
      const twAt = f => { const i = Math.min(K - 1, Math.floor(f)), u = f - i; return V0 * (m[i] + (m[i + 1] - m[i]) * u); };
      const dep = f => (f >= KD ? (DEP * twAt(f)) / (V0 * m[KD]) : 0);
      const xd = Math.round((KD / K) * (W - 1));
      const xEnd = Math.round(steps(phase(ms, 0, DRAW), 26) * (W - 1));

      // baseline
      ctx.fillStyle = RULE2;
      ctx.fillRect(0, base, W, 1);

      // the deposit, as a band between what you see and what you earned
      if (sv > 0.01 && xEnd >= xd) {
        ctx.save();
        ctx.fillStyle = dither(ctx, 0.3);
        for (let x = xd; x <= xEnd; x++) {
          const f = kAt(x), a = Math.round(yv(twAt(f) + dep(f) * sv)), b = Math.round(yv(twAt(f)));
          if (b > a) ctx.fillRect(x, a, 1, b - a);
        }
        ctx.restore();
      }
      // the marker for the day money went in
      if (xEnd >= xd) {
        dotsV(ctx, xd, top - 6, base, INK3, 1, 2);
        ctx.textAlign = 'right'; ctx.fillStyle = INK2;
        fitText(ctx, '6 Apr · £15,000 paid in', xd - 8, top + 4, xd - 12, small ? 10.5 : 11, 400);
        ctx.textAlign = 'left';
      }
      ctx.fillStyle = INK;
      trace(ctx, 0, xEnd, x => { const f = kAt(x); return yv(twAt(f) + dep(f) * sv); }, 2);

      // the readout
      const tw = sv < 0.5;
      const bigSz = small ? 22 : 28, smSz = small ? 11 : 12;
      ctx.fillStyle = INK;
      fitText(ctx, tw ? pct(TWR) : signed(GAIN), 0, bigSz + 2, W * 0.6, bigSz, 500);
      ctx.fillStyle = INK3;
      fitText(ctx, tw ? 'time-weighted · money-weighted ' + pct(XIRR) : 'balance change, ' + pct((GAIN / V0) * 100), 0, bigSz + 22, W - 4, smSz, 400);
      if (xEnd >= W - 1) {
        ctx.textAlign = 'right'; ctx.fillStyle = INK2;
        fitText(ctx, tw ? 'deposit set aside' : 'deposit counted', W, bigSz + 2, W * 0.36, smSz, 400);
        ctx.textAlign = 'left';
      }

      ctx.fillStyle = INK3;
      fitText(ctx, 'Sep 2025', 0, H - 5, W / 2 - 8, 11, 400);
      ctx.textAlign = 'right';
      fitText(ctx, 'Aug 2026', W, H - 5, W / 2 - 8, 11, 400);
      ctx.textAlign = 'left';
    },
  });
});

/* ---------- 05 · Five hundred futures: seeded paths pile up into a dithered cone ---------- */

MD.safe('vestra-futures', function futures() {
  const P = 500, YEARS = 14, M = YEARS * 12, START = NET, FLOW = 600, TARGET = 400000, YMAX = 1000000;
  const vals = new Float32Array(P * (M + 1)), finals = new Float64Array(P);
  (function simulate() {
    const muM = Math.pow(1.06, 1 / 12) - 1, sM = 0.14 / Math.sqrt(12), normal = gauss(mulberry32(20260702));
    for (let p = 0; p < P; p++) {
      let v = START;
      vals[p * (M + 1)] = v;
      for (let k = 1; k <= M; k++) { v = Math.max(0, v * (1 + muM + sM * normal()) + FLOW); vals[p * (M + 1) + k] = v; }
      finals[p] = v;
    }
  })();
  const above = new Uint16Array(P + 1);
  for (let p = 0; p < P; p++) above[p + 1] = above[p] + (finals[p] >= TARGET ? 1 : 0);
  const odds = Math.round((above[P] / P) * 100);
  const oddsEl = document.getElementById('vs-odds');
  if (oddsEl) oddsEl.textContent = odds + '%';

  // the density buffer: one count per CSS pixel, reduced to one bit through the Bayer matrix
  const REF = 14, LUT = new Uint8Array(P + 1);
  for (let c = 0; c <= P; c++) LUT[c] = c ? Math.max(1, Math.round(64 * Math.min(1, Math.pow(c / REF, 0.6)))) : 0;
  const off = document.createElement('canvas'), og = off.getContext('2d');
  let pw = 0, ph = 0, counts = null, img = null, buf = null, drawn = 0;

  function plot(W, H) {
    const right = W < 520 ? 44 : 60;
    return { x: 0, y: 30, w: Math.max(40, W - right), h: Math.max(40, H - 30 - 26) };
  }
  function ensure(w, h) {
    if (w === pw && h === ph) return;
    pw = w; ph = h; off.width = w; off.height = h;
    counts = new Uint16Array(w * h);
    img = og.createImageData(w, h);
    buf = new Uint32Array(img.data.buffer);
    drawn = 0;
  }
  const py = v => Math.round(ph - 1 - (v / YMAX) * (ph - 1));
  function pathY(p, x) {
    const f = (x / (pw - 1)) * M, i = Math.min(M - 1, Math.floor(f)), u = f - i, o = p * (M + 1);
    return vals[o + i] + (vals[o + i + 1] - vals[o + i]) * u;
  }
  function rasterise(p) {
    let prev = null;
    for (let x = 0; x < pw; x++) {
      const y = py(pathY(p, x));
      const a = prev === null ? y : Math.min(prev, y), b = prev === null ? y : Math.max(prev, y);
      for (let yy = Math.max(0, a); yy <= Math.min(ph - 1, b); yy++) { const i = yy * pw + x; if (counts[i] < 65535) counts[i]++; }
      prev = y;
    }
  }
  function develop() {
    for (let y = 0, i = 0; y < ph; y++) {
      const row = (y & 7) << 3;
      for (let x = 0; x < pw; x++, i++) buf[i] = B8[row + (x & 7)] < LUT[Math.min(P, counts[i])] ? INK32 : 0;
    }
    og.putImageData(img, 0, 0);
  }

  const T0 = 200, ACC = 2400, TRACE = 1200, HOLD = 1300;
  const sample = [37, 211, 402, 88, 316, 159, 471, 5, 264, 129];
  scene('vs-c5', {
    dur: T0 + ACC + 60, tick: 100,
    draw(ctx, W, H, ms) {
      const r = plot(W, H);
      ensure(r.w, r.h);
      const n = Math.round(P * steps(phase(ms, T0, ACC), 50));
      if (n < drawn) { counts.fill(0); drawn = 0; }
      if (n > drawn || !drawn) {
        for (let p = drawn; p < n; p++) rasterise(p);
        drawn = n;
        develop();
      }
      if (n) ctx.drawImage(off, r.x, r.y, pw, ph);

      const small = W < 520, fs = small ? 11 : 12;
      const ox = r.x, oy = r.y, yT = oy + py(TARGET);

      // while they pile up, the newest few are drawn crisp, like a pen
      ctx.fillStyle = INK;
      if (n > 0 && n < P) for (let p = Math.max(0, n - 3); p < n; p++) trace(ctx, 0, pw - 1, x => oy + Math.max(0, py(pathY(p, x))), 1);
      // afterwards one future at a time is walked out, slowly, while you watch
      if (n >= P && !REDUCED) {
        const idle = ms - (T0 + ACC), cyc = TRACE + HOLD, k = Math.floor(idle / cyc);
        const path = sample[k % sample.length], q = steps(clamp((idle - k * cyc) / TRACE, 0, 1), 14);
        const xe = Math.round(q * (pw - 1));
        if (xe > 0) trace(ctx, 0, xe, x => oy + Math.max(0, py(pathY(path, x))), 1);
      }

      // the target, and how many futures clear it by 2040
      ctx.fillStyle = INK;
      for (let x = 0; x < pw; x += 6) ctx.fillRect(ox + x, yT, Math.min(3, pw - x), 1);
      ctx.font = font(fs, 500);
      const chip = '£400,000 by 2040', cw = Math.min(pw - 16, ctx.measureText(chip).width + 12);
      ctx.fillStyle = PAPER; ctx.fillRect(ox + 8, yT - fs - 9, cw, fs + 6);
      frame(ctx, ox + 8, yT - fs - 9, cw, fs + 6, INK);
      ctx.fillStyle = INK;
      fitText(ctx, chip, ox + 14, yT - 7, cw - 12, fs, 500);

      const bx = ox + pw + 8, up = n ? Math.round((above[n] / n) * 100) : 0;
      ctx.fillStyle = INK;
      ctx.fillRect(bx, oy, 1, yT - oy); ctx.fillRect(bx, oy, 4, 1); ctx.fillRect(bx, yT - 1, 4, 1);
      ctx.fillStyle = RULE2;
      ctx.fillRect(bx, yT + 2, 1, oy + ph - yT - 2); ctx.fillRect(bx, oy + ph - 1, 4, 1);
      const lw = W - bx - 8;
      ctx.fillStyle = INK;
      fitText(ctx, n ? up + '%' : '—', bx + 7, Math.round((oy + yT) / 2) + 5, lw, small ? 13 : 16, 500);
      ctx.fillStyle = INK3;
      fitText(ctx, n ? 100 - up + '%' : '—', bx + 7, Math.round((yT + oy + ph) / 2) + 5, lw, fs, 400);

      // axes and the count
      ctx.fillStyle = RULE2;
      ctx.fillRect(ox, oy + ph, pw, 1);
      ctx.fillStyle = INK3;
      const yb = H - 6;
      fitText(ctx, '2026', ox, yb, 60, 11, 400);
      ctx.textAlign = 'center'; fitText(ctx, '2033', ox + pw / 2, yb, 60, 11, 400);
      ctx.textAlign = 'right'; fitText(ctx, '2040', ox + pw, yb, 60, 11, 400);
      ctx.textAlign = 'left';
      pair(ctx, 'Paths', String(n).padStart(3, '0') + ' / 500', 0, 16, W * 0.42, fs, 'left');
      ctx.textAlign = 'right'; ctx.fillStyle = INK3;
      fitText(ctx, small ? '£600/mo · 6% ± 14%' : '£600 a month · 6% return · 14% volatility', W, 16, W * 0.54, fs, 400);
      ctx.textAlign = 'left';
    },
  });
});

/* ---------- 06 · ISA · LISA · SIPP · GIA: allowances filling a cell at a time ---------- */

MD.safe('vestra-tax', function tax() {
  // [label, short label, used, allowance, segments as [amount, tone]]; tone 1 = solid ink
  const ROWS = [
    ['ISA allowance', 'ISA', 19000, 20000, [[15000, 1], [4000, 0.38]]],
    ['LISA, within the ISA', 'LISA', 4000, 4000, [[4000, 0.38]]],
    ['SIPP annual allowance', 'SIPP', 9600, 60000, [[9600, 1]]],
    ['GIA capital gains', 'GIA gains', 1240, 3000, [[1240, 1]]],
  ];
  const CELLS = 20, R0 = 120, RG = 260, CELL_MS = 45;
  const rowStart = i => R0 + i * RG;
  const rowCells = r => (r[2] / r[3]) * CELLS;
  const dur = Math.max(...ROWS.map((r, i) => rowStart(i) + Math.ceil(rowCells(r)) * CELL_MS)) + 60;

  scene('vs-c6', {
    dur, tick: 530,
    draw(ctx, W, H, ms) {
      const small = W < 480, fs = small ? 11 : 12;
      ctx.fillStyle = INK;
      fitText(ctx, 'This tax year', 0, 14, W * 0.5, fs + 1, 500);
      ctx.textAlign = 'right'; ctx.fillStyle = INK3;
      fitText(ctx, '6 April to 5 April', W, 14, W * 0.46, fs, 400);
      ctx.textAlign = 'left';
      ctx.fillStyle = RULE;
      ctx.fillRect(0, 24, W, 1);

      const top = 46, rowH = Math.floor((H - top) / 4), bh = small ? 18 : 20;
      ROWS.forEach((r, i) => {
        const y = top + i * rowH, target = rowCells(r);
        const shown = Math.min(target, steps(phase(ms, rowStart(i), CELLS * CELL_MS), CELLS) * CELLS);
        const used = target ? r[2] * (shown / target) : 0;
        const val = money(used) + ' of ' + money(r[3]);
        ctx.font = font(fs, 500);
        const vw = ctx.measureText(val).width;
        ctx.fillStyle = INK;
        fitText(ctx, W - vw - 14 < ctx.measureText(r[0]).width ? r[1] : r[0], 0, y + 12, W - vw - 14, fs, 500);
        ctx.textAlign = 'right'; ctx.fillStyle = INK2;
        fitText(ctx, val, W, y + 12, W * 0.6, fs, 400);
        ctx.textAlign = 'left';

        // the gauge: a 1px frame holding twenty cells
        const by = y + 22;
        frame(ctx, 0, by, W, bh, INK);
        const ix = 3, iw = W - 6, cy = by + 3, ch = bh - 6;
        let edge = 0;
        const segEnds = [];
        r[4].forEach(sg => { edge += (sg[0] / r[3]) * CELLS; segEnds.push([edge, sg[1]]); });
        for (let c = 0; c < CELLS; c++) {
          const cx = ix + Math.round((c * (iw + 2)) / CELLS), cw = ix + Math.round(((c + 1) * (iw + 2)) / CELLS) - cx - 2;
          const fill = clamp(shown - c, 0, 1);
          if (fill <= 0) {
            // the first empty cell after the ISA blinks, like a caret waiting for the rest
            if (i === 0 && c === Math.floor(target) && shown >= target && (REDUCED || Math.floor(ms / 530) % 2 === 0)) dRect(ctx, cx, cy, cw, ch, 0.12);
            continue;
          }
          const seg = segEnds.find(e => c < e[0] - 1e-9) || segEnds[segEnds.length - 1];
          const w = Math.max(1, Math.round(cw * fill));
          if (seg[1] >= 1) { ctx.fillStyle = INK; ctx.fillRect(cx, cy, w, ch); }
          else dRect(ctx, cx, cy, w, ch, seg[1]);
        }
      });
    },
  });
});

/* ---------- the rail: one square per statement, shown only while they are on screen ---------- */

MD.safe('vestra-rail', function rail() {
  const nav = document.getElementById('vs-rail');
  const sts = Array.from(document.querySelectorAll('.vs-st'));
  if (!nav || !sts.length) return;
  const links = Array.from(nav.querySelectorAll('a'));
  let cur = -2, queued = false;
  const update = () => {
    queued = false;
    const mid = window.innerHeight / 2;
    let c = -1;
    for (let i = 0; i < sts.length; i++) {
      const r = sts[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { c = i; break; }
    }
    if (c === cur) return;
    cur = c;
    nav.classList.toggle('on', c >= 0);
    links.forEach((a, i) => { if (i === c) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  };
  const req = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req);
  update();
});

})();
