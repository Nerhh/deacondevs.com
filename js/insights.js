/* Section Price Insights — one invented event, drawn four ways.
   Wide screens get a horizontal track driven by vertical scroll; everything else gets a
   plain stack in which each panel plays as it arrives. Every figure on the page comes
   from the same 254 made-up listings below, so the panels always agree. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;
const { safe, REDUCED, INK, INK2, INK3, RULE, RULE2, PAPER, font, fitText, clamp, lerp, easeOut, easeInOut, B4 } = MD;

/* ---------- demo data: an invented venue, illustrative prices ---------- */

function rng(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const run = (a, n) => Array.from({ length: n }, (_, i) => String(a + i));

// fixed order: a zone's index is its marking everywhere on the page, sections included
const ZONES = [
  { name: 'Field',       lo: 205, hi: 470, n: 32, secs: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'] },
  { name: 'Lower Level', lo: 118, hi: 305, n: 66, secs: run(101, 18) },
  { name: 'Club',        lo: 160, hi: 345, n: 30, secs: run(201, 8) },
  { name: 'Mezzanine',   lo: 84,  hi: 198, n: 52, secs: run(301, 16) },
  { name: 'Upper Level', lo: 42,  hi: 128, n: 73, secs: run(401, 24) },
];

function build(seed) {
  const R = rng(seed), L = [];
  ZONES.forEach((z, zi) => {
    const ns = z.secs.length;
    const w = z.secs.map(() => 0.4 + R());
    const ws = w.reduce((a, b) => a + b, 0);
    const counts = w.map(v => Math.max(1, Math.floor(v / ws * z.n)));
    let left = z.n - counts.reduce((a, b) => a + b, 0);
    for (let k = 0; left > 0; k = (k + 1) % ns) if (R() < 0.5) { counts[k]++; left--; }
    z.secs.forEach((s, si) => {
      // sideline sections cost more; on the field, the front row does
      const q = zi === 0 ? 1 - Math.abs(si % 3 - 1) * 0.5 - (si >= 3 ? 0.3 : 0) : 0.5 + 0.5 * Math.cos(2 * Math.PI * (si + 0.5) / ns);
      const base = z.lo + (z.hi - z.lo) * (0.12 + 0.5 * q);
      for (let k = 0; k < counts[si]; k++) {
        const p = Math.round(base + (z.hi - z.lo) * (R() - 0.35) * 0.75);
        L.push({ zone: zi, section: s, price: clamp(p, z.lo, z.hi) });
      }
    });
  });
  L.push({ zone: 0, section: 'F2', price: 8000 }); // one absurd listing
  return L;
}

// the extension's own rule: true min and max; the average drops 1.5 × IQR outliers, from four prices up
function priceStats(prices) {
  const n = prices.length, min = Math.min(...prices), max = Math.max(...prices);
  let used = prices, outliers = 0;
  if (n >= 4) {
    const s = [...prices].sort((a, b) => a - b);
    const q = p => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
    const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
    const inl = s.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    if (inl.length && inl.length < n) { used = inl; outliers = n - inl.length; }
  }
  const avg = used.reduce((a, b) => a + b, 0) / used.length;
  return { min, max, avg, count: n, outliers, inMax: Math.max(...used), raw: prices.reduce((a, b) => a + b, 0) / n };
}

const LIST = build(9);
const TOTAL = LIST.length;                 // 254
const PER_PAGE = 10;
const PAGES = Math.ceil(TOTAL / PER_PAGE); // 26
const ZST = ZONES.map((z, zi) => Object.assign({ zi, name: z.name }, priceStats(LIST.filter(l => l.zone === zi).map(l => l.price))));
const BY_AVG = ZST.slice().sort((a, b) => a.avg - b.avg); // the table: cheapest average first
const LANES = BY_AVG.slice().reverse();                   // the chart: cheapest lane at the bottom
const OPEN = 0;                                           // the zone that opens into sections
const SECS = ZONES[OPEN].secs; // the Field's six, opened by the demo
const OUT = LIST.findIndex(l => l.price > 1000);
const MAXP = 600;
const money = n => '$' + Math.round(n).toLocaleString('en-GB');
const tip = r => `Average excludes ${r.outliers} outlier listing${r.outliers > 1 ? 's' : ''} (true range ${money(r.min)}–${money(r.max)})`;

/* ---------- canvas bits ---------- */

const PAT = [
  (x, y) => B4[(y & 3) * 4 + (x & 3)] < 4,  // Field: 25%
  (x, y) => B4[(y & 3) * 4 + (x & 3)] < 8,  // Lower Level: 50%
  (x, y) => ((x + y) & 3) === 0,            // Club: diagonal hatch
  (x, y) => B4[(y & 3) * 4 + (x & 3)] < 12, // Mezzanine: 75%
  (x, y) => B4[(y & 3) * 4 + (x & 3)] < 2,  // Upper Level: 12.5%
];
const TILE = PAT.map(f => {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = INK;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (f(x, y)) g.fillRect(x, y, 1, 1);
  return c;
});
const patCache = new WeakMap();
function pat(ctx, i) {
  let a = patCache.get(ctx);
  if (!a) { a = TILE.map(t => ctx.createPattern(t, 'repeat')); patCache.set(ctx, a); }
  return a[i];
}

function text(ctx, s, x, y, o) {
  o = o || {};
  ctx.fillStyle = o.color || INK;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'alphabetic';
  return fitText(ctx, s, x, y, Math.max(6, o.w == null ? 9999 : o.w), o.size || 11, o.weight || 400, o.min);
}
function measure(ctx, s, size, weight) { ctx.font = font(size, weight); return ctx.measureText(s).width; }
function hline(ctx, x0, x1, y) { ctx.fillRect(Math.round(x0), Math.round(y), Math.round(x1 - x0), 1); }
function frameRect(ctx, x, y, w, h) { ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1); }
function swatch(ctx, zi, x, y, s) {
  ctx.fillStyle = pat(ctx, zi); ctx.fillRect(Math.round(x), Math.round(y), s, s);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; frameRect(ctx, x, y, s, s);
}
// a pixel tick for "loaded", since the typeface has no check mark
const TICK = [[0, 4], [1, 5], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [7, 1], [8, 0]];
function tick(ctx, x, y) { ctx.fillStyle = INK; TICK.forEach(([a, b]) => ctx.fillRect(Math.round(x) + a, Math.round(y) - 8 + b, 2, 2)); }
const step = (u, n) => Math.floor(clamp(u, 0, 1) * n) / n;

/* ---------- panels: each one is a pure drawing of its timeline at time t ---------- */

const panels = [];
function panel(id, idx, dur, draw, after) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const p = { idx, dur, cv, t0: 0, dirty: true, shown: -1, locked: false, hot: 0 };
  p.st = MD.stage(cv, () => { p.dirty = true; });
  p.render = now => {
    const st = p.st;
    st.size();
    const t = REDUCED || p.locked ? dur : p.t0 ? clamp(now - p.t0, 0, dur) : 0;
    if (after) after(t);
    if (!st.W || !st.H || (!p.dirty && t === p.shown && now > p.hot)) return;
    p.dirty = false; p.shown = t;
    const ctx = st.ctx;
    ctx.clearRect(0, 0, st.W, st.H);
    ctx.imageSmoothingEnabled = false;
    draw(ctx, st.W, st.H, t, now);
  };
  p.play = () => { if (!p.t0) { p.t0 = performance.now(); p.dirty = true; } };
  p.reset = () => { if (p.t0 && !p.locked) { p.t0 = 0; p.dirty = true; } };
  // once someone has used the panel, it stays finished; kick() keeps it drawing for a moment
  p.kick = ms => { p.locked = true; p.dirty = true; p.hot = performance.now() + (ms || 0); p.render(performance.now()); };
  panels.push(p);
  p.ctl = MD.loop(cv, now => p.render(now));
  MD.repaints.push(() => { p.dirty = true; p.render(performance.now()); });
  return p;
}

/* ---- 1. all of it, at once: page one tells us the total, the rest arrive twelve at a time ---- */

const LOAD = (() => {
  const R = rng(7);
  const tiles = [{ page: 1, row: 0, col: 0, req: 420, done: 760 }];
  const waves = [{ from: 1, to: 1, end: 760 }];
  let prev = 760;
  for (let a = 2; a <= PAGES; a += 12) {
    const b = Math.min(a + 11, PAGES), req = prev + 120;
    let end = req;
    for (let pg = a; pg <= b; pg++) {
      const done = req + 240 + R() * 380;
      tiles.push({ page: pg, row: waves.length, col: pg - a, req, done });
      end = Math.max(end, done);
    }
    waves.push({ from: a, to: b, end });
    prev = end;
  }
  const perPage = pg => Math.min(PER_PAGE, TOTAL - (pg - 1) * PER_PAGE);
  let sum = 0;
  waves.forEach(w => { for (let pg = w.from; pg <= w.to; pg++) sum += perPage(pg); w.total = sum; });
  const finish = prev + 200;
  return { tiles, waves, perPage, finish, dur: finish + 60 };
})();

function drawLoad(ctx, W, H, t) {
  const narrow = W < 460;
  const pad = narrow ? 14 : 24;
  const fs = narrow ? 10.5 : 11;
  const labW = narrow ? 64 : 92;
  const avail = W - pad * 2 - labW;
  const pitch = Math.floor(Math.min(34, avail / 12));
  const gap = Math.max(3, Math.round(pitch * 0.16));
  const ts = pitch - gap;
  const rowH = Math.max(ts + 10, 30);
  const headH = 22, midGap = narrow ? 20 : 26, btnH = 24, statusH = 20;
  const total = headH + rowH * 4 + midGap + btnH + statusH;
  const y0 = Math.round(Math.max(pad, (H - total) / 2));
  const xT = pad + labW;
  const gridR = xT + pitch * 12 - gap;

  // header
  text(ctx, 'PAGES', pad, y0 + 10, { size: 10, color: INK3, w: labW - 8 });
  text(ctx, `${PER_PAGE} listings each`, gridR, y0 + 10, { size: 10, color: INK3, align: 'right', w: gridR - xT - 8 });
  ctx.fillStyle = RULE; hline(ctx, pad, gridR, y0 + headH - 7);

  // rows: page 1 on its own, then the batches
  const labels = ['Page 1', 'Batch 1', 'Batch 2', 'Batch 3'];
  LOAD.waves.forEach((w, r) => {
    const ry = y0 + headH + r * rowH;
    const cy = ry + rowH / 2;
    const done = t >= w.end;
    text(ctx, labels[r] || 'Batch ' + r, pad, cy - 1, { size: fs, weight: 500, color: t >= LOAD.tiles.find(q => q.row === r).req ? INK : INK3, w: labW - 10 });
    text(ctx, w.from === w.to ? 'p. ' + w.from : `p. ${w.from}–${w.to}`, pad, cy + 11, { size: 9.5, color: INK3, w: labW - 10 });
    if (r === 0 && done) {
      text(ctx, `total ${TOTAL} · ${PAGES} pages`, xT + pitch + 8, cy + 4, { size: 10, color: INK2, w: gridR - xT - pitch - 8 });
    }
  });

  // tiles
  const blink = Math.floor(t / 110) & 1;
  LOAD.tiles.forEach(q => {
    const x = xT + q.col * pitch, y = Math.round(y0 + headH + q.row * rowH + (rowH - ts) / 2);
    ctx.lineWidth = 1;
    if (t < q.req) {
      ctx.strokeStyle = RULE2; frameRect(ctx, x, y, ts, ts);
    } else if (t < q.done) {
      ctx.fillStyle = pat(ctx, blink ? 0 : 4); ctx.fillRect(x, y, ts, ts);
      ctx.strokeStyle = INK; frameRect(ctx, x, y, ts, ts);
    } else {
      ctx.fillStyle = INK; ctx.fillRect(x, y, ts, ts);
      if (ts >= 16) text(ctx, String(LOAD.perPage(q.page)), x + ts / 2, y + ts / 2 + 3.5, { size: ts >= 24 ? 10 : 9, color: PAPER, align: 'center', w: ts - 2 });
    }
  });

  // button, stepped progress bar, status
  const by = y0 + headH + rowH * 4 + midGap;
  const running = t >= 420 && t < LOAD.finish, complete = t >= LOAD.finish;
  const btnLabel = complete ? 'Reload all' : running ? 'Stop' : 'Load all listings';
  const bw = Math.ceil(measure(ctx, 'Load all listings', fs, 400)) + 20;
  ctx.fillStyle = PAPER; ctx.fillRect(pad, by, bw, btnH);
  ctx.strokeStyle = INK; frameRect(ctx, pad, by, bw, btnH);
  ctx.fillStyle = INK; ctx.fillRect(pad + 1, by + btnH, bw, 1); ctx.fillRect(pad + bw, by + 1, 1, btnH);
  text(ctx, btnLabel, pad + bw / 2, by + btnH / 2 + 4, { size: fs, align: 'center', w: bw - 8 });

  const bx = pad + bw + 12, bwid = gridR - bx, bh = 12, bY = by + (btnH - bh) / 2;
  let prevV = 0, frac = 0;
  LOAD.waves.forEach(w => {
    if (t >= w.end) { frac = (prevV + (w.total - prevV) * step((t - w.end) / 180, 5)) / TOTAL; }
    prevV = w.total;
  });
  ctx.strokeStyle = INK; frameRect(ctx, bx, bY, bwid, bh);
  const fw = Math.round((bwid - 4) * step(frac, 48));
  if (fw > 0) { ctx.fillStyle = INK; ctx.fillRect(Math.round(bx) + 2, Math.round(bY) + 2, fw, bh - 4); }

  const loaded = LOAD.waves.reduce((n, w) => (t >= w.end ? w.total : n), 0);
  const sy = by + btnH + statusH - 2;
  let status;
  if (complete) status = `All ${TOTAL} listings loaded`;
  else if (running) status = t >= LOAD.waves[0].end ? `Loading… ${loaded} / ${TOTAL}` : 'Loading… 0';
  else status = 'Detecting sections & zones…';
  ctx.font = font(fs, complete ? 500 : 400);
  const used = text(ctx, status, bx, sy, { size: fs, weight: complete ? 500 : 400, color: complete ? INK : INK2, w: bwid - (complete ? 16 : 0) });
  if (complete) tick(ctx, bx + measure(ctx, status, used, 500) + 6, sy);
}

/* ---- 2 and 3 share one geometry, so the lanes line up as the panels pass ---- */

const JIT = (() => {
  const R = rng(3);
  return LIST.map(() => {
    const u = (R() + R() + R()) / 3 * 2 - 1;
    return { jy: R(), cx: u, cy: R(), delay: 180 + R() * 1150, fall: 400 + R() * 220 };
  });
})();

function lanes(W, H) {
  const narrow = W < 540;
  const pad = narrow ? 14 : 22;
  const fs = narrow ? 10.5 : 11;
  const nameW = narrow ? 0 : clamp(Math.round(W * 0.2), 108, 150);
  const offW = narrow ? 46 : 64;
  const x0 = pad + nameW;
  const xo = W - pad - offW / 2;
  const x1 = W - pad - offW - (narrow ? 10 : 14);
  const skyH = clamp(Math.round(H * 0.14), 58, 80);
  const axisH = 24;
  const top = pad + skyH, bot = H - pad - axisH;
  const lh = (bot - top) / LANES.length;
  const head = narrow ? 18 : 0;
  const L = LANES.map((z, i) => {
    const y0 = top + i * lh, y1 = y0 + lh;
    const c0 = y0 + head + 5, c1 = y1 - 5;
    return { z, zi: z.zi, i, y0, y1, c0, c1, mid: Math.round((c0 + c1) / 2) };
  });
  const laneOf = [];
  L.forEach(l => { laneOf[l.zi] = l; });
  const X = v => (v > MAXP ? xo : x0 + (v / MAXP) * (x1 - x0));
  const dot = narrow ? 2 : 3;
  const pts = LIST.map((l, k) => {
    const ln = laneOf[l.zone], j = JIT[k];
    return {
      x: Math.round(X(l.price) - dot / 2),
      y: Math.round(ln.c0 + 2 + j.jy * (ln.c1 - ln.c0 - 4 - dot)),
      sx: Math.round((x0 + x1) / 2 + j.cx * (x1 - x0) * 0.46),
      sy: Math.round(pad + 20 + j.cy * (skyH - 28)),
    };
  });
  return { narrow, pad, fs, nameW, offW, x0, x1, xo, top, bot, lh, head, L, laneOf, X, dot, pts, W, H, skyH };
}

function laneFrame(ctx, g, counts) {
  const { pad, x0, x1, xo, offW, top, bot, L, narrow, W, fs } = g;
  // lane rules and the price grid
  ctx.fillStyle = RULE;
  L.forEach(l => hline(ctx, pad, W - pad, l.y0));
  hline(ctx, pad, W - pad, bot);
  for (let v = 100; v <= MAXP; v += 100) {
    const x = Math.round(g.X(v));
    for (let y = top + 2; y < bot; y += 3) ctx.fillRect(x, y, 1, 1);
  }
  const ox = Math.round(xo - offW / 2);
  for (let y = top + 2; y < bot; y += 3) ctx.fillRect(ox, y, 1, 1);

  // axis: $0 to $600, then a break and a column for anything off the scale
  ctx.fillStyle = INK;
  hline(ctx, x0, x1 + 1, bot);
  hline(ctx, ox + 4, W - pad, bot);
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  [x1 + 4, x1 + 8].forEach(bx => { ctx.beginPath(); ctx.moveTo(bx - 2, bot + 4); ctx.lineTo(bx + 2, bot - 4); ctx.stroke(); });
  const every = narrow ? 200 : 100;
  const offL = xo - measure(ctx, money(8000), 10, 400) / 2;
  ctx.fillStyle = INK; ctx.fillRect(Math.round(xo), bot, 1, 4);
  text(ctx, money(8000), xo, bot + 16, { size: 10, color: INK3, align: 'center', w: offW - 2 });
  for (let v = 0; v <= MAXP; v += every) {
    const x = Math.round(g.X(v));
    ctx.fillStyle = INK; ctx.fillRect(x, bot, 1, 4);
    const s = money(v), w = measure(ctx, s, 10, 400);
    if (v && x + w / 2 > offL - 10) continue; // leave room for the off-scale label
    text(ctx, s, x, bot + 16, { size: 10, color: INK3, align: v === 0 ? 'left' : 'center', w: 44 });
  }

  // lane names, markings and counts
  L.forEach(l => {
    const n = counts ? counts[l.zi] : l.z.count;
    if (narrow) {
      swatch(ctx, l.zi, pad, l.y0 + 5, 9);
      text(ctx, l.z.name, pad + 15, l.y0 + 13, { size: fs, weight: 500, w: W - pad * 2 - 60 });
      text(ctx, String(n), W - pad, l.y0 + 13, { size: 10, color: INK3, align: 'right', w: 30 });
    } else {
      swatch(ctx, l.zi, pad, l.mid - 12, 10);
      text(ctx, l.z.name, pad + 17, l.mid - 3, { size: fs, weight: 500, w: g.nameW - 26 });
      text(ctx, `${n} listing${n === 1 ? '' : 's'}`, pad + 17, l.mid + 12, { size: 10, color: INK3, w: g.nameW - 26 });
    }
  });
}

let geoCache = null;
function geo(W, H) {
  if (!geoCache || geoCache.W !== W || geoCache.H !== H) geoCache = lanes(W, H);
  return geoCache;
}

const ZONES_DUR = 180 + 1150 + 620 + 120;
function drawZones(ctx, W, H, t) {
  const g = geo(W, H);
  const counts = ZONES.map(() => 0);
  const pos = g.pts.map((p, k) => {
    const j = JIT[k];
    const u = step((t - j.delay) / j.fall, 12);
    if (u >= 1) counts[LIST[k].zone]++;
    return u <= 0 ? [p.sx, p.sy] : u >= 1 ? [p.x, p.y] : [Math.round(lerp(p.sx, p.x, easeOut(u))), Math.round(lerp(p.sy, p.y, u * u))];
  });
  laneFrame(ctx, g, counts);
  const landed = counts.reduce((a, b) => a + b, 0);
  text(ctx, landed === TOTAL ? `${TOTAL} listings · ${ZONES.length} zones` : `${TOTAL} listings`, g.pad, g.pad + 9, { size: 10, color: INK3, w: g.W / 2 });
  ctx.fillStyle = INK;
  pos.forEach(([x, y]) => ctx.fillRect(x, y, g.dot, g.dot));
}

/* ---- 3. the average, honestly ---- */

const AVG = { col: 240, colDur: 460, bar: 720, fling: 1480, shift: 2000, ast: 2330, note: 2380, dur: 2760 };
function drawAvg(ctx, W, H, t) {
  const g = geo(W, H);
  laneFrame(ctx, g, null);
  const { pad, fs, xo, offW } = g;
  const bh = g.narrow ? 9 : 11;
  const lab = g.narrow ? 10 : 10.5;
  const fieldLane = g.laneOf[OPEN];
  const skyY = Math.round(g.pad + g.skyH * 0.42);

  // the dots gather onto each lane's centre line, then become its bar
  ctx.fillStyle = INK;
  g.pts.forEach((p, k) => {
    if (k === OUT) return;
    const l = g.laneOf[LIST[k].zone];
    if (t >= AVG.bar + l.i * 70 + 180) return;
    const u = easeInOut(step((t - AVG.col - l.i * 70) / AVG.colDur, 6));
    ctx.fillRect(p.x, Math.round(lerp(p.y, l.mid - g.dot / 2, u)), g.dot, g.dot);
  });

  g.L.forEach(l => {
    const z = l.z, tb = AVG.bar + l.i * 70;
    if (t < tb) return;
    const grow = step((t - tb) / 180, 4);
    const xa = Math.round(g.X(z.min)), xb = Math.round(g.X(z.inMax));
    const xe = Math.round(lerp(xa, xb, grow));
    const y = l.mid - Math.floor(bh / 2);
    if (xe - xa >= 2) {
      ctx.fillStyle = PAPER; ctx.fillRect(xa, y, xe - xa + 1, bh);
      ctx.fillStyle = pat(ctx, z.zi); ctx.fillRect(xa, y, xe - xa + 1, bh);
      ctx.strokeStyle = INK; ctx.lineWidth = 1; frameRect(ctx, xa, y, xe - xa + 1, bh);
    }
    if (grow < 1) return;
    const hasOut = z.max > z.inMax;
    if (hasOut) {
      // the true maximum stays on show, off the scale, joined by a dotted whisker
      ctx.fillStyle = INK;
      for (let x = xb + 3; x < xo - 2; x += 3) ctx.fillRect(x, l.mid, 1, 1);
      ctx.fillRect(Math.round(xo), y, 1, bh);
    }
    // min and max below the bar, pushed apart if they would touch
    const sMin = money(z.min), sMax = money(z.max);
    const wMin = measure(ctx, sMin, lab, 400), wMax = measure(ctx, sMax, lab, 400);
    const xMax = hasOut ? xo : xb;
    let aMin = clamp(xa - wMin / 2, pad, W - pad - wMin), aMax = clamp(xMax - wMax / 2, pad, W - pad - wMax);
    if (aMin + wMin + 8 > aMax) { const mid = (aMin + wMin + aMax) / 2; aMin = mid - 4 - wMin; aMax = mid + 4; }
    const by = y + bh + lab + 3;
    text(ctx, sMin, aMin, by, { size: lab, color: INK2 });
    text(ctx, sMax, aMax, by, { size: lab, color: INK2 });

    // the average: a tick through the bar with its figure above
    const ta = tb + 220;
    if (t < ta) return;
    let v = z.avg;
    if (hasOut) {
      const u = step((t - AVG.shift) / 300, 6);
      v = lerp(z.raw, z.avg, u);
      if (u > 0) {
        // where the average would have been with the outlier counted
        const gx = Math.round(g.X(z.raw));
        ctx.fillStyle = INK3;
        for (let yy = y - 3; yy < y + bh + 3; yy += 2) ctx.fillRect(gx, yy, 1, 1);
        if (u >= 1) {
          const s = money(z.raw), w = measure(ctx, s, lab, 400);
          text(ctx, s, gx, y - 5, { size: lab, color: INK3, align: 'center' });
          ctx.fillStyle = INK3; ctx.fillRect(Math.round(gx - w / 2), Math.round(y - 5 - lab * 0.33), Math.round(w), 1);
        }
      }
    }
    const ax = Math.round(g.X(v));
    ctx.fillStyle = PAPER; ctx.fillRect(ax - 1, y - 3, 3, bh + 6);
    ctx.fillStyle = INK; ctx.fillRect(ax, y - 3, 1, bh + 6);
    const star = hasOut && t >= AVG.ast;
    const sAvg = money(v) + (star ? '*' : '');
    text(ctx, sAvg, ax, y - 5, { size: lab, weight: 500, align: 'center' });
  });

  // the outlier: carried to its lane's end, then flung out of the average
  const p = g.pts[OUT], l = fieldLane;
  const y = l.mid - Math.floor(bh / 2);
  if (t < AVG.fling) {
    const u = easeInOut(step((t - AVG.col - l.i * 70) / AVG.colDur, 6));
    const yy = Math.round(lerp(p.y, l.mid - g.dot / 2, u));
    ctx.fillStyle = INK; ctx.fillRect(p.x - 1, yy - 1, g.dot + 2, g.dot + 2);
  } else {
    const u = step((t - AVG.fling) / 420, 7);
    const x = Math.round(xo + Math.sin(Math.PI * u) * 14);
    const yy = Math.round(lerp(l.mid, skyY, u) - Math.sin(Math.PI * u) * 12);
    const s = 6;
    if (u >= 1) {
      ctx.fillStyle = INK3;
      for (let k = yy + s / 2 + 3; k < y - 2; k += 3) ctx.fillRect(Math.round(xo), k, 1, 1);
      ctx.fillStyle = PAPER; ctx.fillRect(x - s / 2, yy - s / 2, s, s);
      ctx.strokeStyle = INK; frameRect(ctx, x - s / 2, yy - s / 2, s, s);
      text(ctx, 'outlier', x - s / 2 - 5, yy + 3.5, { size: 10, color: INK3, align: 'right', w: 60 });
    } else {
      ctx.fillStyle = INK; ctx.fillRect(x - s / 2, yy - s / 2, s, s);
    }
  }

  // the note, opening like a window, pointing at the asterisk
  if (t >= AVG.note) {
    const one = '* 1.5 × IQR, from four prices up';
    const limit = xo - offW / 2 - 70 - pad; // keep clear of the flung dot and its label
    const lines = measure(ctx, one, lab, 400) + 16 <= limit ? [one] : ['* 1.5 × IQR,', 'from four prices up'];
    const bw = Math.ceil(Math.max(...lines.map(s => measure(ctx, s, lab, 400)))) + 16;
    const bhh = lines.length * (lab + 4) + 10;
    const ax = Math.round(g.X(fieldLane.z.avg));
    const bx = Math.round(clamp(ax - bw / 2, pad, Math.max(pad, pad + limit - bw)));
    const byy = Math.round(l.y0 - 10 - bhh);
    const u = step((t - AVG.note) / 180, 4);
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    if (u < 1) {
      const zw = bw * (0.25 + 0.75 * u), zh = bhh * (0.25 + 0.75 * u);
      ctx.setLineDash([2, 2]); frameRect(ctx, bx + (bw - zw) / 2, byy + (bhh - zh) / 2, zw, zh); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = PAPER; ctx.fillRect(bx, byy, bw, bhh);
      frameRect(ctx, bx, byy, bw, bhh);
      ctx.fillStyle = INK; ctx.fillRect(bx + 1, byy + bhh, bw, 1); ctx.fillRect(bx + bw, byy + 1, 1, bhh);
      lines.forEach((s, i) => text(ctx, s, bx + 8, byy + 5 + (i + 1) * (lab + 4) - 3, { size: lab, w: bw - 12 }));
      // a stem down to the figure it explains
      const top = y - 5 - lab - 1;
      ctx.fillStyle = INK;
      for (let k = byy + bhh + 2; k < top; k += 2) ctx.fillRect(clamp(ax, bx + 4, bx + bw - 4), k, 1, 1);
    }
  }
}

/* ---- 4. zones, then sections: an invented bowl beside a table you can use ---- */

const BOWL = { rings: 140, ringStep: 230, rows: 1180, rowStep: 90, open: 1760, labels: 1960, labStep: 85 };
BOWL.dur = BOWL.labels + SECS.length * BOWL.labStep + 240;
const RINGS = [
  { zi: 1, r0: 0.43, r1: 0.58 },
  { zi: 2, r0: 0.60, r1: 0.685 },
  { zi: 3, r0: 0.705, r1: 0.835 },
  { zi: 4, r0: 0.855, r1: 1 },
];
// each zone's sections, cheapest average first, as the extension lists them
const SECTIONS = ZONES.map((z, zi) => z.secs
  .map(s => Object.assign({ name: s }, priceStats(LIST.filter(l => l.zone === zi && l.section === s).map(l => l.price))))
  .sort((a, b) => a.avg - b.avg));

// the table's state; until someone touches it, the opening animation drives it
const TBL = { key: 'avg', dir: 1, open: new Set([OPEN]), touched: false, at: new Map() };

// how far a zone has opened (0..1) and which of its labels are showing
function opening(zi, t, now) {
  if (!TBL.touched) {
    if (zi !== OPEN) return null;
    const k = step((t - BOWL.open) / 200, 4);
    return k > 0 ? { k, lab: j => t >= BOWL.labels + j * BOWL.labStep } : null;
  }
  if (!TBL.open.has(zi)) return null;
  // the bowl labels the Field and the most recently opened ring, so labels never crowd
  if (zi !== OPEN) {
    let last = -1, when = -Infinity;
    TBL.open.forEach(z => { if (z !== OPEN && (TBL.at.get(z) || 0) >= when) { when = TBL.at.get(z) || 0; last = z; } });
    if (zi !== last) return null;
  }
  const since = REDUCED ? 1e9 : now - (TBL.at.get(zi) || 0);
  const each = Math.min(80, 420 / ZONES[zi].secs.length);
  return { k: Math.max(0.25, step(since / 200, 4)), lab: j => since >= 120 + j * each };
}

// a section label on a paper chip; where sectors are narrow, the chip loses its border
function chip(ctx, s, x, y, fs, room) {
  const tw = Math.ceil(measure(ctx, s, fs, 500));
  const boxed = room == null || room >= tw + 7;
  const w = tw + (boxed ? 6 : 2), h = fs + (boxed ? 5 : 3);
  const lx = Math.round(x - w / 2), ly = Math.round(y - h / 2);
  ctx.fillStyle = PAPER; ctx.fillRect(lx, ly, w, h);
  if (boxed) { ctx.strokeStyle = INK; frameRect(ctx, lx, ly, w, h); }
  text(ctx, s, x, ly + h / 2 + fs * 0.36, { size: fs, weight: 500, align: 'center', w: w - 1 });
}

function drawBowl(ctx, W, H, t, now) {
  const R = Math.floor(Math.min(W, H) / 2 - (W < 400 ? 12 : 18));
  const cx = Math.round(W / 2), cy = Math.round(H / 2 + R * 0.03);
  const GAP = 0.56, A0 = -Math.PI / 2 + GAP, SPAN = Math.PI * 2 - GAP * 2;
  const fs = R >= 200 ? 10 : 9;
  ctx.lineWidth = 1; ctx.strokeStyle = INK;

  // rings step in from the middle out, one sector at a time
  const ringLabels = [];
  RINGS.forEach((ring, k) => {
    const n = ZONES[ring.zi].secs.length, t0 = BOWL.rings + k * BOWL.ringStep;
    const shown = t >= t0 ? Math.min(n, Math.floor((t - t0) / (BOWL.ringStep * 0.9 / n)) + 1) : 0;
    const op = opening(ring.zi, t, now);
    for (let j = 0; j < shown; j++) {
      const a = A0 + (SPAN * j) / n, b = A0 + (SPAN * (j + 1)) / n;
      ctx.beginPath();
      ctx.arc(cx, cy, R * ring.r1, a, b);
      ctx.arc(cx, cy, R * ring.r0, b, a, true);
      ctx.closePath();
      ctx.fillStyle = PAPER; ctx.fill();
      ctx.fillStyle = pat(ctx, ring.zi); ctx.fill();
      ctx.strokeStyle = INK; ctx.stroke();
      if (op && op.lab(j)) {
        const m = (a + b) / 2, r = R * (ring.r0 + ring.r1) / 2;
        ringLabels.push([ZONES[ring.zi].secs[j], cx + Math.cos(m) * r, cy + Math.sin(m) * r, r * (b - a)]);
      }
    }
  });
  ringLabels.forEach(([s, x, y, room]) => chip(ctx, s, x, y, fs, room));

  // the stage, in the open end of the bowl
  const sw = Math.round(R * 0.34), sh = Math.max(12, Math.round(R * 0.075));
  const sx = cx - Math.round(sw / 2), sy = Math.round(cy - R * 0.345);
  ctx.fillStyle = INK; ctx.fillRect(sx, sy, sw, sh);
  text(ctx, 'STAGE', cx, sy + sh / 2 + 3.5, { size: 9, color: PAPER, align: 'center', w: sw - 6, weight: 500 });

  // the field: one block, then its six sections
  const fw = Math.round(R * 0.52), fh = Math.round(R * 0.44);
  const fx = cx - Math.round(fw / 2), fy = Math.round(cy - R * 0.2);
  if (t < BOWL.rings * 0.5) return;
  const op = opening(OPEN, t, now);
  ctx.strokeStyle = INK;
  if (!op) {
    ctx.fillStyle = PAPER; ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = pat(ctx, OPEN); ctx.fillRect(fx, fy, fw, fh);
    frameRect(ctx, fx, fy, fw, fh);
    return;
  }
  const gp = Math.round(op.k * (R > 140 ? 5 : 4));
  const cw = (fw - gp * 2) / 3, ch = (fh - gp) / 2;
  ZONES[OPEN].secs.forEach((s, i) => {
    const bx = Math.round(fx + (i % 3) * (cw + gp)), by = Math.round(fy + Math.floor(i / 3) * (ch + gp));
    const bw = Math.round(cw), bh = Math.round(ch);
    ctx.fillStyle = PAPER; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = pat(ctx, OPEN); ctx.fillRect(bx, by, bw, bh);
    frameRect(ctx, bx, by, bw, bh);
    if (op.lab(SECTIONS[OPEN].findIndex(q => q.name === s))) chip(ctx, s, bx + bw / 2, by + bh / 2, R > 150 ? 11 : 10);
  });
}

/* the table is written from the same data, so it can never disagree with the canvases;
   like the extension's, its headers sort and its zones open into their sections */
let rowEls = [], rowAt = [], openRow = null, bowlPanel = null;
const COLS = [['name', 'Zone'], ['min', 'Min'], ['avg', 'Avg'], ['max', 'Max'], ['count', 'Count']];
const avgCell = r => money(r.avg) + (r.outliers ? `<span class="ast" title="${tip(r)}">*</span>` : '');
const cells = r => `<td>${money(r.min)}</td><td>${avgCell(r)}</td><td>${money(r.max)}</td><td>${r.count}</td>`;

function renderTable() {
  const table = document.getElementById('ins-table');
  if (!table) return;
  const { key, dir } = TBL;
  table.tHead.innerHTML = '<tr>' + COLS.map(([k, label]) => {
    const on = k === key;
    return `<th scope="col"${on ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${k}">${label}${on ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  }).join('') + '</tr>';
  const zs = ZST.slice().sort((a, b) => (key === 'name' ? a.name.localeCompare(b.name) : a[key] - b[key]) * dir);
  let html = '';
  zs.forEach(z => {
    const open = TBL.open.has(z.zi);
    html += `<tr class="z${open ? ' open' : ''}"><th scope="row"><button type="button" class="zb" data-z="${z.zi}" aria-expanded="${open}"><i class="car"></i><i class="sw sw-${z.zi}"></i>${z.name}</button></th>${cells(z)}</tr>`;
    if (open) SECTIONS[z.zi].forEach(s => { html += `<tr class="s"><th scope="row"><i class="sw sw-${z.zi}"></i>${s.name}</th>${cells(s)}</tr>`; });
  });
  table.tBodies[0].innerHTML = html;
  rowEls = Array.from(table.tBodies[0].rows);
  let zi = 0, si = 0;
  rowAt = rowEls.map(r => (r.classList.contains('z') ? BOWL.rows + BOWL.rowStep * zi++ : BOWL.labels + BOWL.labStep * si++));
  openRow = table.tBodies[0].querySelector('tr.open');
}

safe('insights-table', function table() {
  const el = document.getElementById('ins-table');
  if (!el) return;
  renderTable();
  const foot = document.querySelector('.ins-foot');
  const oz = ZST[OPEN];
  if (foot && oz.outliers) foot.innerHTML = `Prices before fees. <span class="ast-k">*</span> ${tip(oz)}.`;
  if (!REDUCED) rowEls.forEach(r => r.classList.add('off'));

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const refocus = b.dataset.sort ? `[data-sort="${b.dataset.sort}"]` : `[data-z="${b.dataset.z}"]`;
    if (b.dataset.sort) {
      const k = b.dataset.sort;
      if (TBL.key === k) TBL.dir *= -1;
      else { TBL.key = k; TBL.dir = k === 'count' ? -1 : 1; }
    } else {
      const z = +b.dataset.z;
      if (TBL.open.has(z)) TBL.open.delete(z);
      else { TBL.open.add(z); TBL.at.set(z, performance.now()); }
    }
    if (!TBL.touched) { TBL.touched = true; TBL.at.set(OPEN, -1e9); }
    renderTable();
    rowEls.forEach(r => r.classList.remove('off'));
    const again = el.querySelector(refocus);
    if (again) again.focus();
    if (bowlPanel) bowlPanel.kick(700);
  });
});

let rowT = -1;
function tableAt(t) {
  if (TBL.touched || t === rowT || !rowEls.length) return;
  rowT = t;
  rowEls.forEach((r, i) => r.classList.toggle('off', t < rowAt[i]));
  if (openRow) {
    const open = t >= BOWL.open;
    openRow.classList.toggle('open', open);
    const b = openRow.querySelector('button');
    if (b) b.setAttribute('aria-expanded', String(open));
  }
}

safe('insights-panels', function build() {
  panel('cv-load', 0, LOAD.dur, drawLoad);
  panel('cv-zones', 1, ZONES_DUR, drawZones);
  panel('cv-avg', 2, AVG.dur, drawAvg);
  bowlPanel = panel('cv-bowl', 3, BOWL.dur, drawBowl, tableAt);
});

/* ---------- the track: vertical scroll moves the panels sideways, one transform per frame ---------- */

safe('insights-track', function track() {
  const sec = document.getElementById('run');
  if (!sec || REDUCED) return;
  const rail = sec.querySelector('.ins-rail'), frame = sec.querySelector('.ins-frame');
  const stepEl = document.getElementById('ins-step'), fillEl = document.getElementById('ins-fill'), nameEl = document.getElementById('ins-name');
  const names = Array.from(sec.querySelectorAll('.ins-panel h2')).map(h => h.textContent.trim());
  const mq = window.matchMedia('(min-width: 901px) and (min-height: 640px)');
  let on = false, s = 0, fresh = true, lastX = '', lastStep = -1, lastFill = -1;

  // stacked: each panel plays when it is mostly on screen and rewinds once it has gone
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    if (on) return;
    es.forEach(e => {
      const p = panels.find(q => q.cv === e.target);
      if (!p) return;
      if (e.intersectionRatio >= 0.4) p.play();
      else if (!e.isIntersecting) p.reset();
    });
  }, { threshold: [0, 0.4] }) : null;
  const watch = () => { if (!io) { panels.forEach(p => p.play()); return; } panels.forEach(p => { io.unobserve(p.cv); io.observe(p.cv); }); };

  function mode() {
    const want = mq.matches;
    if (want === on && !fresh) return;
    on = want; fresh = true; lastX = ''; lastStep = -1; lastFill = -1;
    sec.classList.toggle('ins-track', on);
    rail.style.transform = '';
    panels.forEach(p => p.reset());
    if (!on) watch();
  }
  mode();
  if (mq.addEventListener) mq.addEventListener('change', mode); else if (mq.addListener) mq.addListener(mode);

  // four rests and three moves along the section's scroll
  const D = 0.12, M = (1 - 4 * D) / 3;
  function at(p) {
    for (let i = 0; i < 3; i++) {
      const a = D * (i + 1) + M * i;
      if (p < a) return i;
      if (p < a + M) return i + easeInOut((p - a) / M);
    }
    return 3;
  }

  MD.loop(sec, (now, dt) => {
    if (!on) return;
    const target = at(MD.progress(sec));
    if (fresh) { s = target; fresh = false; } else s += (target - s) * (1 - Math.exp(-dt / 110));
    if (Math.abs(target - s) < 0.0008) s = target;
    const x = (-s * 25).toFixed(3);
    if (x !== lastX) { rail.style.transform = `translate3d(${x}%,0,0)`; lastX = x; }
    const idx = Math.round(s);
    if (idx !== lastStep) { lastStep = idx; if (stepEl) stepEl.textContent = String(idx + 1); if (nameEl) nameEl.textContent = names[idx] || ''; }
    const cells = Math.round(((s + 1) / 4) * 24);
    if (cells !== lastFill && fillEl) { lastFill = cells; fillEl.style.width = (cells / 24) * 100 + '%'; }
    const r = frame.getBoundingClientRect();
    const seen = r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.45;
    panels.forEach(p => {
      const d = Math.abs(s - p.idx);
      if (seen && d < 0.2) p.play();
      else if (d > 0.999 || r.bottom < 0 || r.top > innerHeight) p.reset();
    });
  });

  // a focused control inside a panel that is off to the side brings that panel round
  const view = sec.querySelector('.ins-view');
  rail.addEventListener('focusin', e => {
    if (!on) return;
    const art = e.target.closest('.ins-panel');
    if (view) view.scrollLeft = 0;
    if (!art) return;
    const i = +art.dataset.step || 0;
    const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
    if (Math.abs(s - i) > 0.01) window.scrollTo({ top: scrollY + r.top + (i * (D + M) + D / 2) * span, behavior: 'instant' });
  });

  // rewind everything once the whole section has left the screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { if (on && !es[0].isIntersecting) panels.forEach(p => p.reset()); }).observe(sec);
  }
});

})();
