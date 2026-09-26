/* marcus.gg — the index: the sphere, one miniature per project, and the small print */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;
const { REDUCED, safe, INK, INK2, INK3, RULE, RULE2, PAPER, font, fitText, clamp, lerp, easeOut, easeInOut } = MD;

// seeded randomness so every visitor sees the same arrangement
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one-bit ordered-dither fills as canvas patterns, 2px cells, crisp at any pixel ratio
const patCache = new Map();
function dither(ctx, level, dpr) {
  const k = clamp(Math.round(level * 16), 0, 16);
  const key = k + '@' + dpr;
  if (!patCache.has(key)) {
    const c = Math.max(1, Math.round(2 * dpr));
    const tile = document.createElement('canvas');
    tile.width = tile.height = 4 * c;
    const g = tile.getContext('2d');
    g.fillStyle = INK;
    for (let i = 0; i < 16; i++) if (MD.B4[i] < k) g.fillRect((i & 3) * c, (i >> 2) * c, c, c);
    patCache.set(key, tile);
  }
  const p = ctx.createPattern(patCache.get(key), 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  return p;
}

/* ---------- Fig. 1: the sphere ---------- */

safe('orb', function orb() {
  const canvas = document.getElementById('orb');
  if (!canvas) return;
  const cap = document.getElementById('orb-rot');
  const g = canvas.getContext('2d');
  const off = document.createElement('canvas');
  const og = off.getContext('2d');
  const BASE = -0.00022; // one slow revolution in about half a minute
  let S = 0, dpr = 0, cell = 2, N = 0, img = null, buf = null;
  const st = { rot: 0.9, lx: 0.9, ly: -0.2, lz: -0.55, grid: true }; // lit from behind at first
  const tgt = { lx: -0.55, ly: -0.45, lz: 0.8 };
  let vel = BASE, dragging = false, lastX = 0, lastMoveT = 0, pointerT = 0, px = 0, py = 0;

  function setCell(c) {
    cell = c;
    if (!S) return;
    N = Math.max(8, Math.floor(S / c));
    off.width = N; off.height = N;
    img = og.createImageData(N, N);
    buf = new Uint32Array(img.data.buffer);
  }
  function size() {
    const w = canvas.clientWidth, d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === S && d === dpr && N) return;
    S = w; dpr = d;
    if (!S) return;
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(S * dpr);
    setCell(cell);
  }
  function draw() {
    if (!N) return;
    MD.shadeOrb(buf, N, st);
    og.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = false;
    const side = Math.round(N * cell * dpr), o = Math.round((canvas.width - side) / 2);
    g.drawImage(off, o, o, side, side);
  }
  function caption() {
    if (!cap) return;
    const deg = Math.round((((-st.rot * 180) / Math.PI) % 360 + 360) % 360);
    cap.textContent = 'rot ' + String(deg).padStart(3, '0') + '°';
  }

  let running = false, raf = 0, last = 0, lastCap = 0;
  function frame(t) {
    if (!running) { raf = 0; return; }
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    if (pointerT && t - pointerT < 4000) {
      const r = canvas.getBoundingClientRect();
      tgt.lx = clamp((px - (r.left + r.width / 2)) / 360, -1.4, 1.4);
      tgt.ly = clamp((py - (r.top + r.height * 0.44)) / 360, -1.4, 1.4);
      tgt.lz = 0.75;
    } else {
      tgt.lx = -0.55 + 0.35 * Math.sin(t / 2600);
      tgt.ly = -0.42 + 0.22 * Math.cos(t / 3300);
      tgt.lz = 0.8;
    }
    const k = 1 - Math.exp(-dt / 260);
    st.lx += (tgt.lx - st.lx) * k;
    st.ly += (tgt.ly - st.ly) * k;
    st.lz += (tgt.lz - st.lz) * k;
    if (!dragging) {
      vel = BASE + (vel - BASE) * Math.exp(-dt / 700);
      st.rot += vel * dt;
    }
    draw();
    if (t - lastCap > 120) { lastCap = t; caption(); }
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    px = e.clientX; py = e.clientY; pointerT = performance.now();
  }, { passive: true });
  canvas.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastMoveT = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX;
    lastX = e.clientX;
    st.rot -= dx * 0.012;
    vel = (-dx * 0.012) / Math.max(8, now - lastMoveT);
    lastMoveT = now;
    if (REDUCED) { draw(); caption(); }
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  size();
  MD.repaints.push(() => { size(); draw(); });
  if (REDUCED) {
    Object.assign(st, { lx: -0.55, ly: -0.45, lz: 0.8 });
    setCell(2);
    draw();
    return;
  }
  // boot: the sphere resolves from coarse blocks to fine dither
  const seq = [16, 11, 8, 6, 4, 3, 2];
  setCell(seq[0]);
  seq.slice(1).forEach((c, i) => setTimeout(() => setCell(c), 380 + i * 130));
  const io = new IntersectionObserver(entries => {
    const vis = entries.some(e => e.isIntersecting);
    if (vis && !running) { running = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); }
    else if (!vis) running = false;
  });
  io.observe(canvas);
});

/* ---------- miniatures: one small, true-to-life animation per project ---------- */

// each mini gets (ctx, W, H, dpr, time-in-ms); REDUCED draws a settled frame
function mini(name, draw, settled) {
  safe('mini-' + name, function () {
    const canvas = document.querySelector('canvas.mini[data-mini="' + name + '"]');
    if (!canvas) return;
    const s = MD.stage(canvas);
    let lastT = settled;
    const paint = t => {
      if (!s.W || !s.H) return;
      s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      s.ctx.clearRect(0, 0, s.W, s.H);
      draw(s.ctx, s.W, s.H, s.dpr, t);
    };
    MD.repaints.push(() => { s.size(); paint(lastT); });
    MD.loop(canvas, (t, dt, el) => { lastT = REDUCED ? settled : el; paint(lastT); });
  });
}

// Umbra: five sealed partitions; cookies bounce inside their own, never across
(function () {
  const R = rng(7);
  const cells = Array.from({ length: 5 }, (_, c) => ({
    region: ['GB', 'US', 'DE', 'AU', 'CA'][c],
    flash: 0,
    cookies: Array.from({ length: 6 + ((R() * 3) | 0) }, () => ({ x: R(), y: R(), vx: (R() - 0.5) * 0.00035, vy: (R() - 0.5) * 0.00035 })),
  }));
  let lastT = 0, nextThrow = 1800;
  mini('umbra', (g, W, H, dpr, t) => {
    const dt = t > lastT && t - lastT < 100 ? t - lastT : 16;
    lastT = t;
    const top = 30, bot = H - 42, x0 = 14, x1 = W - 14, cw = (x1 - x0) / 5;
    // tab strip
    g.fillStyle = INK;
    for (let c = 0; c < 5; c++) {
      const tx = x0 + c * cw;
      g.fillRect(tx + 6, 10, cw - 12, 1);
      g.font = font(10);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = INK2;
      fitText(g, 'tab ' + (c + 1), tx + 6, 20, cw - 12, 10);
      g.fillStyle = INK;
    }
    // every so often, one cookie is thrown at a wall — and stays home
    if (!REDUCED && t > nextThrow) {
      const c = cells[(t / 997 | 0) % 5], k = c.cookies[0];
      k.vx = (k.x < 0.5 ? -1 : 1) * 0.0022; k.vy *= 0.3;
      nextThrow = t + 2600;
    }
    for (let c = 0; c < 5; c++) {
      const cell = cells[c], cx = x0 + c * cw;
      for (const k of cell.cookies) {
        if (!REDUCED) {
          k.x += k.vx * dt; k.y += k.vy * dt;
          if (k.x < 0) { k.x = 0; k.vx = Math.abs(k.vx) * 0.6; if (Math.abs(k.vx) > 0.0004) cell.flash = t; }
          if (k.x > 1) { k.x = 1; k.vx = -Math.abs(k.vx) * 0.6; if (Math.abs(k.vx) > 0.0004) cell.flash = t; }
          if (k.y < 0) { k.y = 0; k.vy = Math.abs(k.vy); }
          if (k.y > 1) { k.y = 1; k.vy = -Math.abs(k.vy); }
          const sp = Math.hypot(k.vx, k.vy), min = 0.00012;
          if (sp < min) { k.vx *= min / (sp || 1); k.vy *= min / (sp || 1); }
          if (sp > 0.0004) { k.vx *= 0.985; k.vy *= 0.985; }
        }
        g.fillRect(Math.round(cx + 8 + k.x * (cw - 20)), Math.round(top + 8 + k.y * (bot - top - 20)), 4, 4);
      }
      // the wall: a double rule, thickening for a beat when something hits it
      const hit = !REDUCED && t - cell.flash < 180;
      g.fillRect(Math.round(cx) + (c ? 0 : 0), top, 1, bot - top);
      if (c) g.fillRect(Math.round(cx) + 2, top, hit ? 2 : 1, bot - top);
      // exit: a dotted line down to the region
      g.fillStyle = INK3;
      for (let y = bot + 4; y < H - 18; y += 3) g.fillRect(Math.round(cx + cw / 2), y, 1, 1);
      g.fillStyle = INK;
      g.textAlign = 'center';
      fitText(g, cell.region, cx + cw / 2, H - 10, cw - 6, 11, 500);
    }
    g.fillRect(x1, top, 1, bot - top);
    g.fillRect(x0, top, x1 - x0, 1);
    g.fillRect(x0, bot, x1 - x0 + 1, 1);
  }, 0);
})();

// Vestra: the total rolls to each day's snapshot while the history pans one day at a time
(function () {
  const R = rng(11);
  const days = [];
  let v = 112000;
  const step = i => { v += (R() - 0.4) * 820; if (i % 47 === 30) v += 3800; return v; };
  for (let i = 0; i < 400; i++) days.push(step(i));
  const WIN = 60, PERIOD = 1500;
  const fmt = n => '£' + Math.round(n).toLocaleString('en-GB');
  mini('vestra', (g, W, H, dpr, t) => {
    const k = REDUCED ? 0 : Math.floor(t / PERIOD) % (days.length - WIN - 1);
    const p = REDUCED ? 1 : easeInOut(clamp((t % PERIOD) / 800, 0, 1));
    const view = i => days[k + i];
    const prevV = view(WIN - 2), nextV = view(WIN - 1), cur = lerp(prevV, nextV, p);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = INK3;
    fitText(g, 'net worth · daily snapshot', 16, 24, W - 32, 10.5);
    // the figure: each changed digit rolls in four steps
    const prev = fmt(prevV), next = fmt(nextV), size = clamp(W / 11, 22, 40);
    g.font = font(size, 500);
    const cw = g.measureText('0').width, x0 = 16, y0 = 30 + size;
    g.save();
    g.beginPath(); g.rect(x0 - 2, y0 - size * 0.8, cw * Math.max(prev.length, next.length) + 8, size * 1.0); g.clip();
    g.fillStyle = INK;
    const q = Math.round(p * 4) / 4;
    for (let i = 0; i < next.length; i++) {
      const a = prev.length === next.length ? prev[i] : next[i], b = next[i], x = x0 + i * cw;
      if (a === b || REDUCED) { g.fillText(b, x, y0); continue; }
      g.fillText(a, x, y0 - q * size);
      g.fillText(b, x, y0 + (1 - q) * size);
    }
    g.restore();
    const delta = nextV - view(0);
    g.fillStyle = INK2;
    g.textAlign = 'right';
    fitText(g, (delta >= 0 ? '+' : '−') + fmt(Math.abs(delta)) + ' over 60 days', W - 16, y0, Math.max(40, W - 32 - cw * next.length - 16), 10.5);
    // history: the window pans left by one day as the new snapshot arrives
    const top = y0 + 22, bot = H - 16;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < WIN + 1; i++) { const d = days[k + i]; if (d < lo) lo = d; if (d > hi) hi = d; }
    lo -= 900; hi += 500;
    const X = i => 16 + (W - 32) * ((i - p) / (WIN - 1));
    const Y = d => bot - (bot - top) * ((d - lo) / (hi - lo));
    g.save();
    g.beginPath(); g.rect(16, top - 4, W - 32, bot - top + 5); g.clip();
    g.beginPath();
    g.moveTo(X(0), bot);
    for (let i = 0; i < WIN; i++) g.lineTo(X(i), Y(i === WIN - 1 ? cur : view(i)));
    g.lineTo(X(WIN - 1), bot);
    g.closePath();
    g.fillStyle = dither(g, 0.2, dpr);
    g.fill();
    g.beginPath();
    for (let i = 0; i < WIN; i++) g[i ? 'lineTo' : 'moveTo'](X(i), Y(i === WIN - 1 ? cur : view(i)));
    g.strokeStyle = INK; g.lineWidth = 1.25; g.stroke();
    g.restore();
    g.fillStyle = INK;
    g.fillRect(Math.round(X(WIN - 1)) - 2, Math.round(Y(cur)) - 2, 5, 5);
    g.fillRect(16, bot, W - 32, 1);
  }, 0);
})();

// Dial: listings land on a price axis as a stacked dot plot; the cheap outliers are cut; the lowest twenty are averaged
(function () {
  const R = rng(23);
  const prices = [];
  for (let i = 0; i < 34; i++) prices.push(Math.round((3000 + (R() + R() + R() - 1.5) * 1400) / 10) * 10);
  prices.push(1450, 1620, 1780); // fakes and parts listings
  const sorted = prices.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const floor = median * 0.6;
  const kept = sorted.filter(p => p >= floor);
  const low = kept.slice(0, 20);
  const avg = low.reduce((a, b) => a + b, 0) / low.length;
  const excluded = sorted.length - kept.length;
  const lo = 1200, hi = Math.max(...prices) + 300, BINS = 26;
  const bin = p => Math.min(BINS - 1, Math.floor(((p - lo) / (hi - lo)) * BINS));
  const stackOf = {};
  const items = sorted.map((p, i) => { const b = bin(p); const k = stackOf[b] = (stackOf[b] || 0) + 1; return { p, b, k: k - 1, drop: 120 + R() * 1100, low: i - (sorted.length - kept.length) < 20 && p >= floor }; });
  const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
  mini('dial', (g, W, H, dpr, t) => {
    const T = REDUCED ? 1e9 : t % 9000;
    const ax = 18, bx = W - 18, base = H - 44;
    const bw = (bx - ax) / BINS, sq = Math.max(4, Math.min(8, Math.floor(bw) - 2));
    const X = p => ax + (bx - ax) * ((p - lo) / (hi - lo));
    const medP = T > 1900, floorP = clamp((T - 2400) / 800, 0, 1), brP = T > 3500;
    const fxNow = lerp(ax, X(floor), easeOut(floorP));
    g.fillStyle = INK;
    g.fillRect(ax, base, bx - ax, 1);
    for (let b = 0; b <= BINS; b += 2) g.fillRect(Math.round(ax + b * bw), base + 1, 1, 3);
    items.forEach(it => {
      const land = clamp((T - it.drop) / 360, 0, 1);
      if (land <= 0) return;
      const x = Math.round(ax + it.b * bw + (bw - sq) / 2);
      const yEnd = base - 3 - (it.k + 1) * (sq + 2);
      const y = Math.round(lerp(34, yEnd, easeOut(land)));
      const cut = floorP > 0 && it.p < floor && ax + it.b * bw + bw / 2 < fxNow;
      if (cut) { g.strokeStyle = INK3; g.lineWidth = 1; g.setLineDash([1, 1]); g.strokeRect(x + 0.5, y + 0.5, sq - 1, sq - 1); g.setLineDash([]); }
      else { g.fillStyle = brP && it.low ? INK : (brP ? dither(g, 0.45, dpr) : INK); g.fillRect(x, y, sq, sq); }
    });
    g.textBaseline = 'alphabetic';
    if (medP) {
      g.fillStyle = INK2;
      const mx = Math.round(X(median));
      for (let y = 40; y < base; y += 4) g.fillRect(mx, y, 1, 2);
      g.textAlign = 'center';
      fitText(g, 'median ' + gbp(median), clamp(mx, ax + 60, bx - 60), 36, 130, 10);
    }
    if (floorP > 0) {
      const fx = Math.round(fxNow);
      g.fillStyle = INK;
      g.fillRect(fx, 44, 1, base - 44);
      if (floorP >= 1) { g.textAlign = 'left'; g.fillStyle = INK2; fitText(g, '60% · ' + excluded + ' excluded', fx + 6, 54, Math.max(40, X(median) - fx - 14), 10); }
    }
    if (brP) {
      const a = Math.round(X(low[0])), b = Math.round(X(low[low.length - 1])), y = base + 14;
      g.fillStyle = INK;
      g.fillRect(a, y, b - a, 1);
      g.fillRect(a, y - 4, 1, 5);
      g.fillRect(b, y - 4, 1, 5);
      g.textAlign = 'center';
      fitText(g, 'average of ' + low.length + ' lowest · ' + gbp(avg), clamp((a + b) / 2, ax + 110, bx - 110), y + 16, bx - ax, 10.5, 500);
    }
    g.textAlign = 'left';
    g.fillStyle = INK;
    fitText(g, brP ? gbp(low[0]) + ' lowest comparable ask' : 'Pulling market data…', ax, 20, bx - ax, 11.5, brP ? 600 : 400);
  }, 1e9);
})();

// Section Price Insights: every listing falls into its zone; each zone becomes low, typical, high
(function () {
  const R = rng(5);
  const zones = [
    { name: 'Floor', base: 240 }, { name: 'Lower', base: 160 }, { name: 'Club', base: 190 },
    { name: 'Upper', base: 95 }, { name: 'Balcony', base: 70 },
  ];
  const dots = [];
  zones.forEach((z, zi) => {
    const n = 14 + ((R() * 8) | 0);
    z.prices = [];
    for (let i = 0; i < n; i++) { const p = Math.round(z.base * (0.75 + R() * 0.6)); z.prices.push(p); dots.push({ zi, p, x0: R(), delay: R() * 1400 }); }
  });
  zones[0].prices.push(900); dots.push({ zi: 0, p: 900, x0: 0.5, delay: 1500, outlier: true });
  zones.forEach(z => {
    const s = z.prices.slice().sort((a, b) => a - b);
    const q = f => s[Math.floor((s.length - 1) * f)];
    const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
    const inl = s.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
    z.min = s[0]; z.max = s[s.length - 1]; z.avg = inl.reduce((a, b) => a + b, 0) / inl.length; z.trim = inl.length < s.length;
  });
  mini('insights', (g, W, H, dpr, t) => {
    const T = REDUCED ? 1e9 : t % 8500;
    const lx = 88, rx = W - 18, top = 22, laneH = (H - top - 18) / zones.length;
    const lo = 40, hi = 420;
    const X = p => lx + (rx - lx) * clamp((p - lo) / (hi - lo), 0, 1);
    const collapse = clamp((T - 3200) / 700, 0, 1);
    g.textBaseline = 'middle';
    zones.forEach((z, zi) => {
      const cy = top + laneH * (zi + 0.5);
      // each zone keeps its own dither density, shown in a swatch beside its name
      g.fillStyle = dither(g, 0.2 + zi * 0.15, dpr);
      g.fillRect(12, Math.round(cy - 4), 8, 8);
      g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(11.5, Math.round(cy - 4) - 0.5, 9, 9);
      g.fillStyle = INK2;
      g.textAlign = 'left';
      fitText(g, z.name, 26, cy, lx - 32, 10.5);
      g.fillStyle = RULE;
      g.fillRect(lx, Math.round(cy + laneH * 0.34), rx - lx, 1);
      if (collapse > 0) {
        const a = X(z.min), b = X(Math.min(z.max, hi)), m = X(z.avg);
        g.fillStyle = INK;
        g.fillRect(Math.round(a), Math.round(cy), Math.round((b - a) * collapse), 1);
        g.fillRect(Math.round(a), Math.round(cy - 4), 1, 9);
        if (collapse >= 1) {
          g.fillRect(Math.round(b), Math.round(cy - 4), 1, 9);
          g.fillRect(Math.round(m) - 2, Math.round(cy - 3), 5, 7);
          if (z.trim) { g.textAlign = 'left'; fitText(g, '*', m + 5, cy - 7, 10, 11, 600); }
        }
      }
    });
    // the dots fall into their lanes, then fade as the lanes collapse
    const fade = 1 - collapse;
    dots.forEach(d => {
      const k = clamp((T - d.delay) / 600, 0, 1);
      if (k <= 0) return;
      const cy = top + laneH * (d.zi + 0.5);
      let x = lerp(lx + d.x0 * (rx - lx), X(d.p), easeOut(k));
      let y = lerp(0, cy + ((d.p * 7) % 9) - 4, easeOut(k));
      if (d.outlier) { x = lerp(x, rx - 4, collapse); y = lerp(y, top - 6 + 8, collapse); }
      if (fade <= 0 && !d.outlier) return;
      if (!d.outlier && fade < 1 && ((d.p + d.zi) % 3) / 3 > fade) return;
      g.fillStyle = INK;
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      if (d.outlier && collapse >= 1) { g.textAlign = 'right'; g.fillStyle = INK2; fitText(g, 'outlier', x - 6, y, 60, 9.5); }
    });
  }, 1e9);
})();

/* ---------- windows take focus as you hover or scroll past them ---------- */

safe('focus', function focus() {
  const items = Array.from(document.querySelectorAll('.pj'));
  const wins = items.map(a => a.querySelector('.win')).filter(Boolean);
  if (!wins.length) return;
  let hovered = null, centred = null;
  const paint = () => wins.forEach(w => w.classList.toggle('active', w === (hovered || centred)));
  items.forEach(a => {
    const w = a.querySelector('.win');
    a.addEventListener('mouseenter', () => { hovered = w; paint(); });
    a.addEventListener('mouseleave', () => { if (hovered === w) hovered = null; paint(); });
    a.addEventListener('focus', () => { hovered = w; paint(); });
    a.addEventListener('blur', () => { if (hovered === w) hovered = null; paint(); });
  });
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { const w = en.target.querySelector('.win'); if (en.isIntersecting) centred = w; else if (centred === w) centred = null; });
    paint();
  }, { rootMargin: '-45% 0px -45% 0px' });
  items.forEach(a => io.observe(a));
});

/* ---------- email: never in the page source; decoded letter by letter on request ---------- */

safe('email', function email() {
  const btn = document.getElementById('email');
  const text = document.getElementById('email-text');
  if (!btn || !text) return;
  const rot13 = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
  const coded = 'znephf' + String.fromCharCode(64) + 'qrnpbaqrif.pbz';
  const addr = rot13(coded);
  btn.addEventListener('click', () => {
    const finish = () => {
      const li = btn.parentNode;
      const a = document.createElement('a');
      a.className = 'row';
      a.href = 'mailto:' + addr;
      a.innerHTML = '<span class="k">Email</span><span></span><span class="go" aria-hidden="true">→</span>';
      a.children[1].textContent = addr;
      li.replaceChild(a, btn);
      a.focus({ preventScroll: true });
    };
    if (REDUCED) { finish(); return; }
    btn.disabled = true;
    const t0 = performance.now(), PER = 34, STAGGER = 26;
    const tick = t => {
      let out = '', settled = true;
      for (let i = 0; i < coded.length; i++) {
        const c = coded[i];
        if (c < 'a' || c > 'z') { out += c; continue; }
        const k = clamp(Math.floor((t - t0 - i * STAGGER) / PER), 0, 13);
        if (k < 13) settled = false;
        out += String.fromCharCode((c.charCodeAt(0) - 97 + k) % 26 + 97);
      }
      text.textContent = out;
      if (settled) finish(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});

/* ---------- the last commit, read live from GitHub ---------- */

safe('commit', function commit() {
  const el = document.getElementById('commit');
  if (!el || !window.fetch) return;
  const rel = iso => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    const m = s / 60, h = m / 60, d = h / 24;
    if (m < 90) return Math.round(m) + ' minutes ago';
    if (h < 36) return Math.round(h) + ' hours ago';
    return Math.round(d) + ' days ago';
  };
  fetch('https://api.github.com/repos/Nerhh/deacondevs.com/commits?per_page=1')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(list => {
      const c = list && list[0];
      if (!c) return;
      let msg = (c.commit.message || '').split('\n')[0];
      if (msg.length > 64) msg = msg.slice(0, 63) + '…';
      el.textContent = 'Last commit ';
      const b = document.createElement('b');
      b.textContent = c.sha.slice(0, 7);
      el.append(b, ' — ' + msg + ', ' + rel(c.commit.author.date) + '.');
      el.hidden = false;
      MD.hide(el);
      MD.dissolve(el, 0, 420);
    })
    .catch(() => { /* offline or rate-limited: say nothing rather than something made up */ });
});
})();
