/* marcus.gg — hand-rolled, zero dependencies */
(() => {
'use strict';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const root = document.documentElement;
root.classList.add('js');
const repaints = []; // canvases re-render through these on resize / font load

const easeOut = t => 1 - Math.pow(1 - t, 3);

function hexA(hex, a) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// each module initialises inside safe(): one broken module never takes the page with it
function safe(name, fn) {
  try { fn(); } catch (e) { if (window.console && console.error) console.error('marcus.gg: ' + name + ' failed', e); }
}

let PAL = {};
(function refreshPalette() {
  const cs = getComputedStyle(root);
  const v = name => cs.getPropertyValue(name).trim();
  PAL = {
    fg: v('--fg'), muted: v('--muted'), line: v('--line'), line2: v('--line2'),
    bg: v('--bg'), bg2: v('--bg2'), bg3: v('--bg3'),
    accent: v('--accent-bright'), green: v('--green'), red: v('--red'),
    chart: [v('--c1'), v('--c2'), v('--c3'), v('--c4')],
  };
})();

/* ---------- ordered dither: the Bayer matrices every effect here is built on ---------- */

function bayer(n) {
  let m = [[0, 2], [3, 1]];
  while (m.length < n) {
    const s = m.length, o = [];
    for (let y = 0; y < s * 2; y++) {
      o.push([]);
      for (let x = 0; x < s * 2; x++) o[y].push(4 * m[y % s][x % s] + [[0, 2], [3, 1]][(y / s) | 0][(x / s) | 0]);
    }
    m = o;
  }
  return m.flat();
}
const B4 = bayer(4), B8 = bayer(8);
const INK32 = (255 << 24 | 0x15 << 16 | 0x15 << 8 | 0x15) >>> 0; // #151515, little-endian RGBA

/* ---------- the sphere: shaded per pixel, then reduced to one bit ---------- */

function shadeOrb(buf, N, s) {
  const ln = Math.hypot(s.lx, s.ly, s.lz) || 1;
  const lx = s.lx / ln, ly = s.ly / ln, lz = s.lz / ln;
  let hx = lx, hy = ly, hz = lz + 1;
  const hn = Math.hypot(hx, hy, hz) || 1; hx /= hn; hy /= hn; hz /= hn;
  const cx = N * 0.5, cy = N * (s.cy || 0.44), R = N * (s.r || 0.33);
  const T = 0.38, cT = Math.cos(T), sT = Math.sin(T), TAU = Math.PI * 2;
  const floor = s.floor !== false;
  const shx = cx - lx * R * 0.55, shy = cy + R * 1.16, srx = R * 0.95, sry = R * 0.2;
  for (let y = 0, i = 0; y < N; y++) {
    const row = (y & 7) << 3;
    const dy = (y + 0.5 - cy) / R;
    for (let x = 0; x < N; x++, i++) {
      const dx = (x + 0.5 - cx) / R;
      const r2 = dx * dx + dy * dy;
      let I = 1;
      if (r2 <= 1) {
        const nz = Math.sqrt(1 - r2);
        const diff = Math.max(0, dx * lx + dy * ly + nz * lz);
        const sp = Math.max(0, dx * hx + dy * hy + nz * hz);
        I = 0.1 + 0.82 * diff + 0.6 * Math.pow(sp, 36);
        if (s.grid) {
          // a tilted globe: twelve meridians and five parallels turning with the sphere
          const yy = dy * cT - nz * sT, zz = dy * sT + nz * cT;
          const lat = Math.asin(Math.max(-1, Math.min(1, -yy)));
          let fm = ((Math.atan2(dx, zz) + s.rot) / TAU) * 12; fm -= Math.floor(fm);
          let fp = (lat / Math.PI + 0.5) * 6; fp -= Math.floor(fp);
          const on = ((fm < 0.018 || fm > 0.982) && Math.abs(lat) < 1.3) || ((fp < 0.024 || fp > 0.976) && Math.abs(lat) < 1.4);
          if (on) I = diff > 0.18 ? I * 0.38 : 0.36;
        }
        // a faint rim on the unlit side keeps the limb against the paper
        if (diff < 0.2) I += Math.pow(1 - nz, 4) * 0.35;
      } else if (floor) {
        const ex = (x + 0.5 - shx) / srx, ey = (y + 0.5 - shy) / sry, e2 = ex * ex + ey * ey;
        if (e2 < 1) I = 0.52 + 0.48 * e2;
      }
      buf[i] = I < (B8[row + (x & 7)] + 0.5) / 64 ? INK32 : 0;
    }
  }
}

function orbIcon(N, bg) {
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  shadeOrb(new Uint32Array(img.data.buffer), N, { rot: 0.5, lx: -0.6, ly: -0.55, lz: 0.7, grid: N >= 32, cy: 0.5, r: 0.46, floor: false });
  if (!bg) { g.putImageData(img, 0, 0); return c; }
  const t = document.createElement('canvas');
  t.width = N; t.height = N;
  t.getContext('2d').putImageData(img, 0, 0);
  g.fillStyle = bg; g.fillRect(0, 0, N, N);
  g.drawImage(t, 0, 0);
  return c;
}

safe('initIcons', function initIcons() {
  const mb = document.getElementById('mb-orb');
  if (mb) mb.getContext('2d').drawImage(orbIcon(16), 0, 0);
  const link = document.querySelector('link[rel="icon"]');
  if (link) { link.type = 'image/png'; link.href = orbIcon(32, '#fbfbf9').toDataURL('image/png'); }
});

safe('initOrb', function initOrb() {
  const canvas = document.getElementById('orb');
  if (!canvas) return;
  const cap = document.getElementById('orb-rot');
  const g = canvas.getContext('2d');
  const off = document.createElement('canvas');
  const og = off.getContext('2d');
  const BASE = -0.00022; // a slow turn: one revolution in about half a minute
  let S = 0, dpr = 0, cell = 2, N = 0, img = null, buf = null;
  // the light starts behind the sphere and swings round to the front as it boots
  const st = { rot: 0.9, lx: 0.9, ly: -0.2, lz: -0.55, grid: true };
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
    shadeOrb(buf, N, st);
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
      // light comes from wherever the cursor is
      const r = canvas.getBoundingClientRect();
      tgt.lx = Math.max(-1.4, Math.min(1.4, (px - (r.left + r.width / 2)) / 360));
      tgt.ly = Math.max(-1.4, Math.min(1.4, (py - (r.top + r.height * 0.44)) / 360));
      tgt.lz = 0.75;
    } else {
      // left alone, the light wanders
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
  repaints.push(() => { size(); draw(); });
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

/* ---------- umbra: every tab is its own browser ---------- */

safe('initUmbra', function initUmbra() {
  const canvas = document.getElementById('umbra-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // documentation-range IPs only (RFC 5737) — nothing here points at a real machine
  const IDS = [
    { host: 'bank.example', hue: '#151515', ip: '198.51.100.9',  cc: 'GB', tz: 'Europe/London',     dev: 'Chrome 129 · macOS',   jar: 14, seed: 3 },
    { host: 'shop.example',     hue: '#3a3a37', ip: '203.0.113.42',  cc: 'US', tz: 'America/New_York',  dev: 'Chrome 128 · Windows', jar: 9,  seed: 7 },
    { host: 'mail.example',     hue: '#5c5c58', ip: '192.0.2.131',   cc: 'DE', tz: 'Europe/Berlin',     dev: 'Chrome 129 · Windows', jar: 21, seed: 11 },
    { host: 'work.example',   hue: '#7e7e79', ip: '198.51.100.77', cc: 'AU', tz: 'Australia/Sydney',  dev: 'Chrome 127 · macOS',   jar: 6,  seed: 5 },
    { host: 'ads.example',      hue: '#9a9a95', ip: '192.0.2.44',    cc: 'CA', tz: 'America/Toronto',   dev: 'Chrome 129 · Linux',   jar: 12, seed: 13 },
  ];
  const rnd = (seed, i) => { const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453; return x - Math.floor(x); };
  const HEX = '0123456789abcdef';
  // each identity gets a deterministic fingerprint: three arcs (a nod to the Umbra mark) + a hash
  IDS.forEach(id => {
    id.arcs = [0, 1, 2].map(k => ({
      a0: rnd(id.seed, k) * Math.PI * 2,
      gap: 0.8 + rnd(id.seed, k + 10) * 1.6,
      r: 0.42 + k * 0.24,
      w: 1.6 + rnd(id.seed, k + 20) * 1.6,
    }));
    let h = '';
    for (let i = 0; i < 8; i++) h += HEX[Math.floor(rnd(id.seed, 40 + i) * 16)];
    id.hash = 'fp:' + h.slice(0, 4) + '·' + h.slice(4);
  });
  const rgb = hex => { let h = hex.replace('#', ''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixHex = (a, b, p) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * p)).join(',')})`; };
  const lerpAng = (a, b, p) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * p; };
  const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const SCR = 'abcdefghijklmnopqrstuvwxyz0123456789./:-';
  const scramble = (s, p, hex) => {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const pos = i / s.length;
      if (c === ' ' || c === '·' || pos < p) out += c;
      else out += hex ? HEX[Math.floor(Math.random() * 16)] : SCR[Math.floor(Math.random() * SCR.length)];
    }
    return out;
  };

  let W = 0, H = 0, running = false, raf = 0;
  let order = [0, 1, 2, 3, 4];
  let open = []; // { id, t0 (spawn time), closing }
  let active = -1, phase = 'spawn', phaseT0 = 0, stepT0 = 0, step = 0;
  let from = null, to = null, morphT0 = 0;

  let lastDpr = 0;
  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === W && h === H && d === lastDpr) return;
    W = w; H = h; lastDpr = d;
    if (!W || !H) return;
    const dpr = d;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function focus(idx, t) {
    from = to || IDS[idx];
    to = IDS[idx];
    morphT0 = t;
    active = idx;
  }

  // square corners throughout: this is a window from an older machine
  function rr(x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); }

  function drawFingerprint(cx, cy, R, p, t) {
    const a = from, b = to;
    const col = mixHex(a.hue, b.hue, p);
    const spin = REDUCED ? 0 : t / 9000;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const A = a.arcs[k], B = b.arcs[k];
      const a0 = lerpAng(A.a0, B.a0, p) + spin * (k % 2 ? -1 : 1);
      const gap = A.gap + (B.gap - A.gap) * p;
      const r = R * (A.r + (B.r - A.r) * p);
      const w = A.w + (B.w - A.w) * p;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.95 - k * 0.18;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0 + gap, a0 + Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // outer halo + centre dot
    const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
    halo.addColorStop(0, hexA(b.hue, 0.16 * (1 - Math.abs(0.5 - p) * 2)));
    halo.addColorStop(1, hexA(b.hue, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 6.2832); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.2, R * 0.06), 0, 6.2832); ctx.fill();
    // a scanning sweep passes over the print while it re-forms
    if (p < 1) {
      const sy = cy - R * 1.1 + R * 2.2 * p;
      const g = ctx.createLinearGradient(0, sy - R * 0.5, 0, sy);
      g.addColorStop(0, hexA(b.hue, 0));
      g.addColorStop(1, hexA(b.hue, 0.35));
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, 6.2832); ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(cx - R * 1.1, sy - R * 0.5, R * 2.2, R * 0.5);
      ctx.fillStyle = hexA(b.hue, 0.9);
      ctx.fillRect(cx - R * 1.1, sy, R * 2.2, 1.2);
      ctx.restore();
    }
    return col;
  }

  function render(t) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const narrow = W < 460;
    const pad = narrow ? 10 : 16;
    const x0 = pad, y0 = pad, w = W - pad * 2, h = H - pad * 2;

    // ---- window chrome
    ctx.fillStyle = PAL.bg2;
    rr(x0, y0, w, h, 10); ctx.fill();
    ctx.strokeStyle = PAL.line; ctx.lineWidth = 1;
    rr(x0 + 0.5, y0 + 0.5, w - 1, h - 1, 10); ctx.stroke();

    // ---- tab strip
    const stripY = y0 + 8, tabH = 26;
    const tw = Math.min(124, Math.max(narrow ? 54 : 74, (w - 24) / 5 - 4));
    let tx = x0 + 10;
    const tabRects = [];
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    open.forEach(tab => {
      const id = IDS[tab.id];
      let ap = REDUCED ? 1 : Math.min(1, (t - tab.t0) / 320);
      ap = easeOut(ap);
      if (tab.closing) ap *= Math.max(0, 1 - (t - tab.closing) / 220);
      const cw = tw * ap;
      if (cw < 1) { tabRects.push(null); return; }
      const isA = tab.id === active;
      ctx.globalAlpha = ap;
      ctx.fillStyle = isA ? PAL.bg3 : 'transparent';
      if (isA) { rr(tx, stripY, cw, tabH, 6); ctx.fill(); }
      // colour tag along the top edge — the tab's identity at a glance
      ctx.fillStyle = id.hue;
      ctx.fillRect(tx + 6, stripY, Math.max(0, cw - 12), 2);
      // favicon dot + host
      ctx.beginPath(); ctx.arc(tx + 11, stripY + tabH / 2, 3, 0, 6.2832); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.rect(tx, stripY, Math.max(0, cw - 6), tabH); ctx.clip();
      ctx.fillStyle = isA ? PAL.fg : PAL.muted;
      ctx.fillText(narrow ? id.host.split('.')[0] : id.host, tx + 19, stripY + tabH / 2 + 0.5);
      ctx.restore();
      ctx.globalAlpha = 1;
      tabRects.push({ x: tx, w: cw });
      tx += cw + 4;
    });
    // "+" ghost tab
    ctx.fillStyle = PAL.muted;
    ctx.globalAlpha = 0.6;
    ctx.fillText('+', tx + 6, stripY + tabH / 2 + 0.5);
    ctx.globalAlpha = 1;

    // ---- address bar
    const ay = stripY + tabH + 6, ah = 24;
    ctx.fillStyle = PAL.bg;
    rr(x0 + 10, ay, w - 20, ah, 7); ctx.fill();
    ctx.strokeStyle = PAL.line;
    rr(x0 + 10.5, ay + 0.5, w - 21, ah - 1, 7); ctx.stroke();
    const p = to ? (REDUCED ? 1 : easeIO(Math.min(1, (t - morphT0) / 620))) : 0;
    if (to) {
      // padlock
      ctx.fillStyle = mixHex(from.hue, to.hue, p);
      ctx.fillRect(x0 + 22, ay + 10, 7, 6);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x0 + 25.5, ay + 10, 2.6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = PAL.muted;
      ctx.fillText('https://', x0 + 36, ay + ah / 2 + 0.5);
      ctx.fillStyle = PAL.fg;
      ctx.fillText(scramble(to.host, p), x0 + 36 + ctx.measureText('https://').width, ay + ah / 2 + 0.5);
      // isolation pill, pops in as the identity settles
      const pillT = Math.max(0, (p - 0.7) / 0.3);
      if (pillT > 0 && !narrow) {
        const s = 0.7 + 0.3 * easeOut(pillT);
        const label = 'isolated ✓';
        ctx.font = '600 9px "IBM Plex Mono", monospace';
        const lw = ctx.measureText(label).width + 16;
        const px = x0 + w - 16 - lw, py = ay + 4;
        ctx.save();
        ctx.translate(px + lw / 2, py + 8); ctx.scale(s, s); ctx.translate(-(px + lw / 2), -(py + 8));
        ctx.globalAlpha = pillT;
        ctx.fillStyle = hexA(to.hue, 0.14);
        rr(px, py, lw, 16, 8); ctx.fill();
        ctx.strokeStyle = hexA(to.hue, 0.6); ctx.lineWidth = 1;
        rr(px + 0.5, py + 0.5, lw - 1, 15, 8); ctx.stroke();
        ctx.fillStyle = to.hue;
        ctx.textAlign = 'center';
        ctx.fillText(label, px + lw / 2, py + 8.5);
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.font = '500 10px "IBM Plex Mono", monospace';
      }
    }

    // ---- page body: fingerprint left, identity readout right
    const by = ay + ah + 10, bh = y0 + h - by - 10;
    if (!to || bh < 40) return;
    const R = Math.min(bh * 0.38, w * 0.13, 66);
    const fx = x0 + (narrow ? 14 + R : w * 0.2), fy = by + bh / 2;
    const col = drawFingerprint(fx, fy, R, p, t);

    const rx = narrow ? fx + R + 18 : x0 + w * 0.42;
    const rows = [
      ['exit ip', to.ip + '  ' + to.cc, from.ip + '  ' + from.cc, true],
      ['timezone', to.tz, from.tz, false],
      ['device', to.dev, from.dev, false],
      ['cookies', null],
      ['fingerprint', to.hash, from.hash, true],
    ].filter(r => !(narrow && r[0] === 'device'));
    const lineH = Math.min(24, (bh - 8) / rows.length);
    let ry = by + (bh - lineH * rows.length) / 2 + lineH / 2;
    const labelW = narrow ? 70 : 82;
    rows.forEach(r => {
      ctx.font = '500 9px "IBM Plex Mono", monospace';
      ctx.fillStyle = PAL.muted;
      ctx.fillText(r[0], rx, ry);
      if (r[0] === 'cookies') {
        // the jar: one square per cookie, in the tab's colour — a different count every tab
        const n = Math.round(from.jar + (to.jar - from.jar) * p);
        const cell = 5, gapC = 2, per = Math.max(6, Math.floor((x0 + w - 14 - (rx + labelW)) / (cell + gapC)));
        for (let i = 0; i < n; i++) {
          const cxq = rx + labelW + (i % per) * (cell + gapC);
          const cyq = ry - cell / 2 + Math.floor(i / per) * (cell + gapC) - (n > per ? 3 : 0);
          ctx.fillStyle = hexA(col, i < n - 1 || p >= 1 ? 0.9 : 0.5);
          ctx.fillRect(cxq, cyq, cell, cell);
        }
        ctx.fillStyle = PAL.fg;
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        const nx = rx + labelW + Math.min(n, per) * (cell + gapC) + 6;
        if (nx < x0 + w - 24) ctx.fillText(String(n), nx, ry);
      } else {
        ctx.font = '600 10.5px "IBM Plex Mono", monospace';
        ctx.fillStyle = PAL.fg;
        const txt = p >= 1 ? r[1] : scramble(r[1], p, r[3]);
        ctx.save();
        ctx.beginPath(); ctx.rect(rx + labelW, ry - 8, x0 + w - 12 - (rx + labelW), 16); ctx.clip();
        ctx.fillText(txt, rx + labelW, ry);
        ctx.restore();
      }
      ry += lineH;
    });

    // ---- partition label under the print
    ctx.font = '500 8.5px "IBM Plex Mono", monospace';
    ctx.fillStyle = PAL.muted;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.85;
    const cap = 'partition · persist:tab-' + (active + 1);
    const capW = ctx.measureText(cap).width;
    // keep the caption inside the window on narrow cards
    const capX = Math.min(Math.max(fx, x0 + 12 + capW / 2), x0 + w - 12 - capW / 2);
    ctx.fillText(cap, capX, fy + R + 14);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // ---- seal: the verdict, plus a sweep across the tab strip
    if (phase === 'seal') {
      const el = t - phaseT0;
      const a = Math.min(1, el / 300) * (el > 1400 ? Math.max(0, 1 - (el - 1400) / 300) : 1);
      const sweep = Math.min(1, el / 900);
      ctx.fillStyle = hexA(PAL.accent, 0.9 * (1 - sweep));
      ctx.fillRect(x0 + 10 + (w - 20) * sweep, stripY - 2, 1.5, tabH + 4);
      ctx.globalAlpha = a;
      const msg = open.length + ' sessions · 0 shared state · ' + open.length + ' exit IPs';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      const mw = ctx.measureText(msg).width + 22;
      const mx = x0 + w / 2 - mw / 2, my = y0 + h - 30;
      ctx.fillStyle = PAL.bg3;
      rr(mx, my, mw, 20, 10); ctx.fill();
      ctx.strokeStyle = hexA(PAL.accent, 0.6);
      rr(mx + 0.5, my + 0.5, mw - 1, 19, 10); ctx.stroke();
      ctx.fillStyle = PAL.accent;
      ctx.textAlign = 'center';
      ctx.fillText(msg, x0 + w / 2, my + 10.5);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  function tick(t) {
    const el = t - phaseT0;
    if (phase === 'spawn') {
      if (open.length < IDS.length && t - stepT0 > (open.length ? 380 : 200)) {
        const idx = order[open.length];
        open.push({ id: idx, t0: t, closing: 0 });
        focus(idx, t);
        stepT0 = t;
      } else if (open.length === IDS.length && t - stepT0 > 1100) {
        phase = 'tour'; phaseT0 = t; stepT0 = t; step = 0;
        focus(order[0], t);
      }
    } else if (phase === 'tour') {
      if (t - stepT0 > 1500) {
        step++;
        if (step >= IDS.length) { phase = 'seal'; phaseT0 = t; }
        else { focus(order[step], t); stepT0 = t; }
      }
    } else if (phase === 'seal') {
      if (el > 1800) { phase = 'close'; phaseT0 = t; stepT0 = 0; }
    } else if (phase === 'close') {
      const live = open.filter(tab => !tab.closing);
      if (live.length && t - stepT0 > 140) {
        const last = live[live.length - 1];
        last.closing = t;
        stepT0 = t;
        const nxt = live[live.length - 2];
        if (nxt) focus(nxt.id, t);
      }
      open = open.filter(tab => !tab.closing || t - tab.closing < 240);
      if (!open.length) {
        order.push(order.shift());
        phase = 'spawn'; phaseT0 = t; stepT0 = t;
      }
    }
  }

  function frame(t) {
    if (!running) { raf = 0; return; }
    if (!phaseT0) { phaseT0 = t; stepT0 = t; }
    tick(t);
    render(t);
    raf = requestAnimationFrame(frame);
  }

  size();
  if (REDUCED) {
    // a still: every tab open, the first one in focus
    open = order.map(i => ({ id: i, t0: 0, closing: 0 }));
    from = to = IDS[order[0]]; active = order[0]; phase = 'still';
    render(1);
  } else {
    const io = new IntersectionObserver(entries => {
      const vis = entries.some(e => e.isIntersecting);
      if (vis && !running) {
        if (canvas.width !== Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) size();
        running = true;
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!vis) {
        running = false;
      }
    }, { threshold: 0.2 });
    io.observe(canvas);
  }
  repaints.push(() => { size(); render(performance.now()); });
});

/* ---------- stubhub lens: live price sparkline ---------- */

safe('initSpark', function initSpark() {
  const canvas = document.getElementById('spark-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const N = 64;
  const data = [];
  let price = 86;
  const push = () => {
    // mean-reverting random walk so the "market" stays plausible
    price = Math.max(38, Math.min(150, price + (Math.random() - 0.5) * 7 + (86 - price) * 0.04));
    data.push(price);
    if (data.length > N) data.shift();
  };
  for (let i = 0; i < N; i++) push();

  let W = 0, H = 0, running = false, revealT0 = 0, lastTick = 0, raf = 0;

  let lastDpr = 0;
  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === W && h === H && d === lastDpr) return;
    W = w; H = h; lastDpr = d;
    if (!W || !H) return;
    const dpr = d;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(prog, t) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const pad = 10, padR = 78;
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; sum += v; }
    lo -= 5; hi += 5;
    const avg = sum / data.length;
    const X = i => pad + (W - pad - padR) * (i / (N - 1));
    const Y = v => (H - pad) - (H - pad * 2) * ((v - lo) / (hi - lo));
    const upto = Math.max(2, Math.floor((N - 1) * prog) + 1);

    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, Y(avg));
    ctx.lineTo(W - padR + 40, Y(avg));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '500 9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PAL.muted;
    ctx.fillText('avg £' + avg.toFixed(0), pad + 6, Y(avg) - 8);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, hexA(PAL.accent, 0.16));
    grad.addColorStop(1, hexA(PAL.accent, 0));
    ctx.beginPath();
    ctx.moveTo(X(0), Y(data[0]));
    for (let i = 1; i < upto; i++) ctx.lineTo(X(i), Y(data[i]));
    ctx.lineTo(X(upto - 1), H - pad);
    ctx.lineTo(X(0), H - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(X(0), Y(data[0]));
    for (let i = 1; i < upto; i++) ctx.lineTo(X(i), Y(data[i]));
    ctx.strokeStyle = PAL.accent;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const li = upto - 1, lx = X(li), lv = data[li], ly = Y(lv);
    const pulse = REDUCED ? 0 : Math.sin((t || 0) / 320) * 1.1;
    ctx.fillStyle = PAL.accent;
    ctx.beginPath();
    ctx.arc(lx, ly, 3 + Math.max(0, pulse), 0, 6.2832);
    ctx.fill();

    const deal = lv < avg * 0.95;
    const delta = ((lv - avg) / avg) * 100;
    const yl = Math.max(16, Math.min(H - 18, ly));
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = PAL.fg;
    ctx.fillText('£' + lv.toFixed(2), lx + 10, yl - 6);
    ctx.fillStyle = deal ? PAL.green : PAL.muted;
    ctx.fillText(deal ? '▼ deal' : (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%', lx + 10, yl + 8);
  }

  function frame(t) {
    if (!running) { raf = 0; return; }
    if (!revealT0) revealT0 = t;
    const prog = Math.min(1, (t - revealT0) / 1400);
    if (prog >= 1 && t - lastTick > 900) { push(); lastTick = t; }
    draw(easeOut(prog), t);
    raf = requestAnimationFrame(frame);
  }

  size();
  if (REDUCED) {
    draw(1, 0);
  } else {
    const io = new IntersectionObserver(entries => {
      const vis = entries.some(e => e.isIntersecting);
      if (vis && !running) {
        if (canvas.width !== Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) size();
        running = true;
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!vis) {
        running = false;
      }
    }, { threshold: 0.2 });
    io.observe(canvas);
  }
  repaints.push(() => { size(); draw(1, 0); });
});

/* ---------- vestra: allocation donut ---------- */

safe('initDonut', function initDonut() {
  const canvas = document.getElementById('donut-canvas');
  if (!canvas) return;
  const SEGS = [['index funds', 52], ['pension', 28], ['cash', 12], ['play money', 8]];
  const TOTAL = 127482;
  const ctx = canvas.getContext('2d');
  const S = 160;
  let played = false, t0 = 0;

  const legend = document.getElementById('donut-legend');
  if (legend) {
    legend.innerHTML = SEGS.map(([n, p], i) =>
      `<li><i style="background:var(--c${i + 1})"></i>${n} <b>${p}%</b></li>`).join('');
  }

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    canvas.style.width = S + 'px';
    canvas.style.height = S + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(p) {
    ctx.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2, r = S / 2 - 6, ir = r - 20;
    const sweep = p * Math.PI * 2;
    let a0 = -Math.PI / 2, done = 0;
    SEGS.forEach(([name, pct], i) => {
      const segA = (pct / 100) * Math.PI * 2;
      const a = Math.max(0, Math.min(segA, sweep - done));
      if (a > 0.002) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a0 + a);
        ctx.arc(cx, cy, ir, a0 + a, a0, true);
        ctx.closePath();
        ctx.fillStyle = PAL.chart[i] || PAL.accent;
        ctx.fill();
        ctx.strokeStyle = PAL.bg2;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      a0 += segA;
      done += segA;
    });
    ctx.fillStyle = PAL.fg;
    ctx.font = '600 15px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('£' + Math.round(TOTAL * p).toLocaleString('en-GB'), cx, cy - 8);
    ctx.fillStyle = PAL.muted;
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillText('net worth', cx, cy + 12);
  }

  function frame(t) {
    if (!t0) t0 = t;
    const p = Math.min(1, (t - t0) / 1500);
    draw(easeOut(p));
    if (p < 1) requestAnimationFrame(frame);
  }

  size();
  if (REDUCED) {
    played = true;
    draw(1);
  } else {
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting) && !played) {
        played = true;
        requestAnimationFrame(frame);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(canvas);
  }
  repaints.push(() => { size(); if (played) draw(1); });
});

/* ---------- dial: watch scan & valuation ---------- */

safe('initWatch', function initWatch() {
  const canvas = document.getElementById('watch-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const WATCHES = [
    { name: 'diver',  dial: '#1c1c1a', hand: '#fbfbf9', mark: '#b5b5b0', low: 2850, est: 3120, high: 3480 },
    { name: 'chrono', dial: '#3a3a37', hand: '#fbfbf9', mark: '#cfcfca', low: 4200, est: 4680, high: 5150 },
    { name: 'field',  dial: '#5e5e59', hand: '#fbfbf9', mark: '#e0e0db', low: 640,  est: 730,  high: 815 },
    { name: 'dress',  dial: '#fbfbf9', hand: '#151515', mark: '#7a7a75', low: 1150, est: 1280, high: 1420 },
  ];
  let W = 0, H = 0, running = false, raf = 0;
  let wi = 0, cur = WATCHES[0], phase = 'idle', phaseT0 = 0;

  function jitter(w) {
    // wobble the "market" a little so every scan reads differently
    const f = 0.98 + Math.random() * 0.04;
    const r10 = v => Math.round(v * f / 10) * 10;
    return { name: w.name, dial: w.dial, hand: w.hand, mark: w.mark, low: r10(w.low), est: r10(w.est), high: r10(w.high) };
  }

  let lastDpr = 0;
  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === W && h === H && d === lastDpr) return;
    W = w; H = h; lastDpr = d;
    if (!W || !H) return;
    const dpr = d;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWatch(scanP) {
    const r = Math.min(H * 0.4, 62);
    const cx = 16 + r, cy = H / 2;
    // case
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.muted;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, 6.2832); ctx.stroke();
    // dial
    ctx.fillStyle = cur.dial;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    // hour markers
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const big = i % 3 === 0;
      ctx.strokeStyle = hexA(cur.mark, big ? 0.95 : 0.5);
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
      ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
      ctx.stroke();
    }
    // hands run on real local time, seconds sweep
    const now = new Date();
    const s = now.getSeconds() + (REDUCED ? 0 : now.getMilliseconds() / 1000);
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    const hand = (ang, len, lw, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(ang) * len * 0.18, cy - Math.sin(ang) * len * 0.18);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
    };
    hand(h * Math.PI / 6 - Math.PI / 2, r * 0.5, 3, cur.hand);
    hand(m * Math.PI / 30 - Math.PI / 2, r * 0.72, 2.2, cur.hand);
    hand(s * Math.PI / 30 - Math.PI / 2, r * 0.82, 1, PAL.accent);
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, 6.2832); ctx.fill();
    // scan beam sweeping the dial
    if (scanP !== null) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
      const bx = cx - r + 2 * r * scanP;
      const g = ctx.createLinearGradient(bx - r * 0.5, 0, bx, 0);
      g.addColorStop(0, hexA(PAL.accent, 0));
      g.addColorStop(1, hexA(PAL.accent, 0.28));
      ctx.fillStyle = g;
      ctx.fillRect(bx - r * 0.5, cy - r, r * 0.5, r * 2);
      ctx.fillStyle = hexA(PAL.accent, 0.9);
      ctx.fillRect(bx, cy - r, 1.5, r * 2);
      ctx.restore();
    }
    return { cx, cy, r };
  }

  function drawReadout(rx, t, revealP) {
    const w2 = W - rx - 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '500 9px "IBM Plex Mono", monospace';
    ctx.fillStyle = PAL.muted;
    ctx.fillText('scan · ' + cur.name, rx, H * 0.22);
    if (revealP === null) {
      const dots = '.'.repeat(1 + Math.floor((t / 300) % 3));
      ctx.font = '600 18px "IBM Plex Mono", monospace';
      ctx.fillStyle = PAL.muted;
      ctx.fillText('scanning' + dots, rx, H * 0.5);
      return;
    }
    const p = easeOut(revealP);
    ctx.font = '600 20px "IBM Plex Mono", monospace';
    ctx.fillStyle = PAL.fg;
    ctx.fillText('£' + Math.round(cur.est * p).toLocaleString('en-GB'), rx, H * 0.5);
    ctx.font = '500 9px "IBM Plex Mono", monospace';
    ctx.fillStyle = PAL.muted;
    ctx.fillText(w2 > 150 ? 'est. from the 20 cheapest listings' : 'lowest-20 estimate', rx, H * 0.5 + 14);
    // low—high range bar with the estimate marker
    const by = H * 0.78, bw = Math.max(60, w2 - 4);
    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rx, by); ctx.lineTo(rx + bw, by); ctx.stroke();
    const frac = (cur.est - cur.low) / (cur.high - cur.low);
    ctx.strokeStyle = PAL.accent;
    ctx.beginPath(); ctx.moveTo(rx, by); ctx.lineTo(rx + bw * frac * p, by); ctx.stroke();
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(rx + bw * frac * p, by, 3, 0, 6.2832); ctx.fill();
    ctx.fillStyle = PAL.muted;
    ctx.font = '500 8.5px "IBM Plex Mono", monospace';
    ctx.fillText('£' + cur.low.toLocaleString('en-GB'), rx, by + 12);
    ctx.textAlign = 'right';
    ctx.fillText('£' + cur.high.toLocaleString('en-GB'), rx + bw, by + 12);
    ctx.textAlign = 'left';
  }

  function render(t) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const el = t - phaseT0;
    const scanP = phase === 'scan' ? Math.min(1, el / 900) : null;
    const face = drawWatch(scanP);
    if (phase === 'reveal') {
      const p = Math.min(1, el / 800);
      ctx.strokeStyle = hexA(PAL.accent, (1 - p) * 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(face.cx, face.cy, face.r + 5 + p * 4, 0, 6.2832); ctx.stroke();
    }
    const revealP = phase === 'scan' ? null : phase === 'reveal' ? Math.min(1, el / 800) : 1;
    drawReadout(face.cx + face.r + 22, t, revealP);
  }

  function frame(t) {
    if (!running) { raf = 0; return; }
    if (!phaseT0) phaseT0 = t;
    const el = t - phaseT0;
    if (phase === 'idle' && el > 3400) {
      phase = 'scan';
      phaseT0 = t;
      wi = (wi + 1) % WATCHES.length;
      cur = jitter(WATCHES[wi]);
    } else if (phase === 'scan' && el > 900) {
      phase = 'reveal';
      phaseT0 = t;
    } else if (phase === 'reveal' && el > 800) {
      phase = 'idle';
      phaseT0 = t;
    }
    render(t);
    raf = requestAnimationFrame(frame);
  }

  size();
  if (REDUCED) {
    phaseT0 = 1;
    render(1);
  } else {
    const io = new IntersectionObserver(entries => {
      const vis = entries.some(e => e.isIntersecting);
      if (vis && !running) {
        if (canvas.width !== Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) size();
        running = true;
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!vis) {
        running = false;
      }
    }, { threshold: 0.2 });
    io.observe(canvas);
  }
  repaints.push(() => { size(); render(phaseT0 || 1); });
});

/* ---------- reveal: typing, dither dissolve, zoom rectangles ---------- */

// seventeen 4x4 dither masks, 2px cells, from nothing to everything
const TILES = Array.from({ length: 17 }, (_, k) => {
  let r = '';
  for (let i = 0; i < 16; i++) if (B4[i] < k) r += `<rect x='${(i & 3) * 2}' y='${(i >> 2) * 2}' width='2' height='2'/>`;
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' shape-rendering='crispEdges'>${r}</svg>`)}")`;
});
function setMask(el, k) {
  el.style.webkitMaskImage = el.style.maskImage = TILES[k];
  el.style.webkitMaskSize = el.style.maskSize = '8px 8px';
}
function clearMask(el) {
  ['mask-image', '-webkit-mask-image', 'mask-size', '-webkit-mask-size'].forEach(p => el.style.removeProperty(p));
}
function hide(el) { if (!REDUCED) setMask(el, 0); }
function dissolve(el, delay, dur) {
  if (REDUCED) { clearMask(el); return; }
  dur = dur || 440;
  setTimeout(() => {
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / dur);
      if (p < 1) { setMask(el, Math.max(1, Math.ceil(p * 16))); requestAnimationFrame(step); }
      else clearMask(el);
    };
    requestAnimationFrame(step);
  }, delay || 0);
}

function prepType(el) {
  if (REDUCED || el.classList.contains('tw')) return;
  const text = el.textContent;
  el.style.setProperty('--n', String(Math.max(1, text.length)));
  if (el.dataset.cps) el.style.setProperty('--cps', el.dataset.cps + 'ms');
  el.textContent = '';
  const t = document.createElement('span');
  t.className = 'tw-text';
  t.textContent = text;
  const c = document.createElement('span');
  c.className = 'tw-caret';
  c.setAttribute('aria-hidden', 'true');
  el.append(t, c);
  el.classList.add('tw');
  t.addEventListener('animationend', () => el.classList.add('done'), { once: true });
}
function typeIn(el, delay) {
  if (REDUCED || !el.classList.contains('tw')) return;
  el.style.setProperty('--d', (delay || 0) + 'ms');
  el.classList.add('on');
}

// ZoomRects: dotted outlines grow from the centre of a window to its frame, then the window dissolves in
const zoomCanvas = document.createElement('canvas');
zoomCanvas.className = 'zoom';
zoomCanvas.setAttribute('aria-hidden', 'true');
zoomCanvas.width = zoomCanvas.height = 0;
document.body.appendChild(zoomCanvas);
const zg = zoomCanvas.getContext('2d');
const zooms = [];
let zraf = 0;
function zoomLoop(t) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
  if (zoomCanvas.width !== w || zoomCanvas.height !== h) { zoomCanvas.width = w; zoomCanvas.height = h; }
  zg.setTransform(d, 0, 0, d, 0, 0);
  zg.clearRect(0, 0, innerWidth, innerHeight);
  zg.strokeStyle = '#151515';
  zg.lineWidth = 1;
  zg.setLineDash([2, 2]);
  const STEPS = 10, TRAIL = 3;
  for (let i = zooms.length - 1; i >= 0; i--) {
    const z = zooms[i];
    if (!z.t0) z.t0 = t;
    const p = Math.min(1, (t - z.t0) / z.dur);
    const step = Math.floor(p * STEPS);
    const r = z.el.getBoundingClientRect(); // follows the window if the page scrolls mid-zoom
    for (let k = Math.max(0, step - TRAIL + 1); k <= step; k++) {
      const q = easeOut(k / STEPS);
      const zw = r.width * (0.08 + 0.92 * q), zh = r.height * (0.08 + 0.92 * q);
      zg.strokeRect(Math.round(r.left + (r.width - zw) / 2) + 0.5, Math.round(r.top + (r.height - zh) / 2) + 0.5, Math.round(zw) - 1, Math.round(zh) - 1);
    }
    if (p >= 1) { zooms.splice(i, 1); z.done(); }
  }
  if (zooms.length) zraf = requestAnimationFrame(zoomLoop);
  else { zraf = 0; zoomCanvas.width = zoomCanvas.height = 0; }
}
function zoomOpen(el, done) {
  if (REDUCED) { done(); return; }
  zooms.push({ el, dur: 380, done, t0: 0 });
  if (!zraf) zraf = requestAnimationFrame(zoomLoop);
}

safe('initReveal', function initReveal() {
  const typed = Array.from(document.querySelectorAll('[data-type]'));
  typed.forEach(prepType);
  if (REDUCED || !('IntersectionObserver' in window)) return;

  // the index plays in sequence on load
  document.querySelectorAll('[data-at]').forEach(el => {
    const at = parseInt(el.dataset.at, 10) || 0;
    if (el.hasAttribute('data-type')) typeIn(el, at);
    else { hide(el); dissolve(el, at, 520); }
  });

  // each project: the window zooms open, then its name types and its notes dissolve in
  const projs = Array.from(document.querySelectorAll('.proj'));
  projs.forEach(p => {
    const win = p.querySelector('.win');
    if (win) hide(win);
    p.querySelectorAll('[data-dz]').forEach(hide);
  });
  const pio = new IntersectionObserver(entries => {
    entries.filter(en => en.isIntersecting).forEach((en, i) => {
      pio.unobserve(en.target);
      const p = en.target, win = p.querySelector('.win');
      setTimeout(() => zoomOpen(win, () => {
        dissolve(win, 0, 380);
        p.querySelectorAll('[data-type]').forEach(el => typeIn(el, 260));
        p.querySelectorAll('[data-dz]').forEach((el, j) => dissolve(el, 460 + j * 140, 420));
      }), i * 170);
    });
  }, { threshold: 0.3 });
  projs.forEach(p => pio.observe(p));

  // everything else reveals as it arrives
  const rest = el => !el.closest('.proj') && !el.hasAttribute('data-at');
  const dz = Array.from(document.querySelectorAll('[data-dz]')).filter(rest);
  dz.forEach(hide);
  const io = new IntersectionObserver(entries => {
    entries.filter(en => en.isIntersecting).forEach((en, i) => {
      io.unobserve(en.target);
      if (en.target.hasAttribute('data-type')) typeIn(en.target, i * 90);
      else dissolve(en.target, 120 + i * 140, 480);
    });
  }, { threshold: 0.35 });
  typed.filter(rest).forEach(el => io.observe(el));
  dz.forEach(el => io.observe(el));
});

/* ---------- window focus: pinstripes follow your attention ---------- */

safe('initFocus', function initFocus() {
  const wins = Array.from(document.querySelectorAll('.win'));
  if (!wins.length) return;
  let hovered = null, centred = null;
  const paint = () => wins.forEach(w => w.classList.toggle('active', w === (hovered || centred)));
  wins.forEach(w => {
    w.addEventListener('mouseenter', () => { hovered = w; paint(); });
    w.addEventListener('mouseleave', () => { if (hovered === w) hovered = null; paint(); });
  });
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) centred = en.target;
      else if (centred === en.target) centred = null;
    });
    paint();
  }, { rootMargin: '-45% 0px -45% 0px' });
  wins.forEach(w => io.observe(w));
});

/* ---------- menu bar: London time, cursor position, the section you are in ---------- */

safe('initMenubar', function initMenubar() {
  const clock = document.getElementById('clock');
  if (clock && window.Intl) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const tick = () => { clock.textContent = 'London ' + fmt.format(new Date()); setTimeout(tick, 1000 - (Date.now() % 1000) + 5); };
    tick();
  }

  const coords = document.getElementById('coords');
  if (coords && FINE) {
    let x = 0, y = 0, queued = false;
    const pad = n => String(Math.max(0, Math.round(n))).padStart(4, '0');
    const paint = () => { queued = false; coords.textContent = 'x ' + pad(x) + '  y ' + pad(y); };
    document.addEventListener('pointermove', e => {
      x = e.pageX; y = e.pageY;
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
  }

  const odo = document.getElementById('odo');
  const name = document.getElementById('sec-name');
  const secs = Array.from(document.querySelectorAll('[data-sec]'));
  if (!odo || !name || !secs.length) return;
  const cols = [0, 1].map(() => {
    const d = document.createElement('span');
    d.className = 'dig';
    const inner = document.createElement('span');
    for (let i = 0; i < 10; i++) { const n = document.createElement('i'); n.textContent = String(i); inner.appendChild(n); }
    d.appendChild(inner);
    odo.appendChild(d);
    return inner;
  });
  let current = -1;
  function show(n, label) {
    if (n === current) return;
    current = n;
    cols[0].style.setProperty('--v', String(Math.floor(n / 10)));
    cols[1].style.setProperty('--v', String(n % 10));
    name.textContent = label;
    name.classList.remove('swap');
    void name.offsetWidth; // restart the wipe
    name.classList.add('swap');
  }
  show(parseInt(secs[0].dataset.sec, 10) || 0, secs[0].dataset.name || '');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) show(parseInt(en.target.dataset.sec, 10) || 0, en.target.dataset.name || ''); });
  }, { rootMargin: '-50% 0px -50% 0px' });
  secs.forEach(s => io.observe(s));
});

/* ---------- email: never in the page source; decoded letter by letter on request ---------- */

safe('initEmail', function initEmail() {
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
    // each letter turns through the alphabet thirteen places, the way it was encoded
    const t0 = performance.now(), PER = 34, STAGGER = 26;
    const tick = t => {
      let out = '', settled = true;
      for (let i = 0; i < coded.length; i++) {
        const c = coded[i];
        if (c < 'a' || c > 'z') { out += c; continue; }
        const k = Math.max(0, Math.min(13, Math.floor((t - t0 - i * STAGGER) / PER)));
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

safe('initCommit', function initCommit() {
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
      hide(el);
      dissolve(el, 0, 420);
    })
    .catch(() => { /* offline or rate-limited: say nothing rather than something made up */ });
});

/* ---------- repaint on resize and once the typeface has arrived ---------- */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => repaints.forEach(fn => fn()), 200);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => repaints.forEach(fn => fn()));

})();
