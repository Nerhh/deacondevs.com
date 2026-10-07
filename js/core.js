/* marcus.gg — shared core. Hand-rolled, zero dependencies.
   Every page loads this first; page scripts use window.MD. */
(() => {
'use strict';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const root = document.documentElement;
root.classList.add('js');
const repaints = [];

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hexA(hex, a) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// every module initialises inside safe(): one broken module never takes the page with it
function safe(name, fn) {
  try { fn(); } catch (e) { if (window.console && console.error) console.error('marcus.gg: ' + name + ' failed', e); }
}

const INK = '#151515', INK2 = '#4a4a46', INK3 = '#6c6c67', RULE = '#d6d6d1', RULE2 = '#bfbfb9', PAPER = '#fbfbf9', BG = '#f2f2ef';
const FONT = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const font = (size, weight) => `${weight || 400} ${size}px ${FONT}`;

/* ---------- ordered dither ---------- */

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
const INK32 = (255 << 24 | 0x15 << 16 | 0x15 << 8 | 0x15) >>> 0; // #151515 as little-endian RGBA

/* ---------- canvas helpers ---------- */

// a canvas that tracks its CSS size and device pixel ratio, and only reallocates when either changes
function stage(canvas, onResize) {
  const ctx = canvas.getContext('2d');
  const s = { canvas, ctx, W: 0, H: 0, dpr: 0 };
  s.size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === s.W && h === s.H && d === s.dpr) return false;
    s.W = w; s.H = h; s.dpr = d;
    if (!w || !h) return false;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (onResize) onResize(s);
    return true;
  };
  s.size();
  return s;
}

// draw text that never leaves its box: shrink down to a floor size, then truncate with an ellipsis
function fitText(ctx, text, x, y, maxW, size, weight, minSize) {
  let sz = size;
  const floor = minSize || Math.max(8, Math.round(size * 0.7));
  ctx.font = font(sz, weight);
  while (sz > floor && ctx.measureText(text).width > maxW) { sz -= 0.5; ctx.font = font(sz, weight); }
  let t = text;
  if (ctx.measureText(t).width > maxW) {
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    t += '…';
  }
  ctx.fillText(t, x, y);
  return sz;
}

// run fn(t, dt) every frame while el is on screen; returns a controller
function loop(el, fn, opts) {
  const ctl = { running: false, raf: 0, last: 0, t0: 0 };
  const frame = t => {
    if (!ctl.running) { ctl.raf = 0; return; }
    if (!ctl.t0) ctl.t0 = t;
    const dt = ctl.last ? Math.min(64, t - ctl.last) : 16;
    ctl.last = t;
    fn(t, dt, t - ctl.t0);
    ctl.raf = requestAnimationFrame(frame);
  };
  ctl.start = () => { if (ctl.running) return; ctl.running = true; ctl.last = 0; if (!ctl.raf) ctl.raf = requestAnimationFrame(frame); };
  ctl.stop = () => { ctl.running = false; };
  if (REDUCED && !(opts && opts.always)) { fn(0, 16, 1e9); return ctl; }
  if (!('IntersectionObserver' in window)) { ctl.start(); return ctl; }
  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) ctl.start(); else ctl.stop();
  }, { rootMargin: (opts && opts.margin) || '80px 0px' });
  io.observe(el);
  return ctl;
}

// fraction of the way through a tall scroll section (0 at its top reaching the viewport top, 1 at its end)
function progress(section) {
  const r = section.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span > 0 ? clamp(-r.top / span, 0, 1) : (r.top < 0 ? 1 : 0);
}

function onVisible(el, cb, threshold) {
  if (!('IntersectionObserver' in window)) { cb(); return; }
  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) { io.disconnect(); cb(); }
  }, { threshold: threshold == null ? 0.3 : threshold });
  io.observe(el);
}

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

// one-bit dither of any greyscale field: lum(x, y) in 0..1 (1 = paper) → ink or nothing
function ditherField(buf, W, H, lum) {
  for (let y = 0, i = 0; y < H; y++) {
    const row = (y & 7) << 3;
    for (let x = 0; x < W; x++, i++) buf[i] = lum(x, y) < (B8[row + (x & 7)] + 0.5) / 64 ? INK32 : 0;
  }
}

safe('icons', function icons() {
  const mb = document.getElementById('mb-orb');
  if (mb) mb.getContext('2d').drawImage(orbIcon(16), 0, 0);
  const link = document.querySelector('link[rel="icon"]');
  if (link) { link.type = 'image/png'; link.href = orbIcon(32, PAPER).toDataURL('image/png'); }
});

/* ---------- reveal: typing, dither dissolve, zoom rectangles ---------- */

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
function hide(el) { if (!REDUCED && el) setMask(el, 0); }
function dissolve(el, delay, dur) {
  if (!el) return;
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
  // each glyph advances 1ch plus any tracking; kept in em so the caret still lands right after a resize
  const cs = getComputedStyle(el), ls = parseFloat(cs.letterSpacing) || 0;
  if (ls) el.style.setProperty('--ls', (ls / parseFloat(cs.fontSize)).toFixed(4) + 'em');
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
  if (REDUCED || !el || !el.classList.contains('tw')) return;
  el.style.setProperty('--d', (delay || 0) + 'ms');
  el.classList.add('on');
}

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
  zg.strokeStyle = INK;
  zg.lineWidth = 1;
  zg.setLineDash([2, 2]);
  const STEPS = 10, TRAIL = 3;
  for (let i = zooms.length - 1; i >= 0; i--) {
    const z = zooms[i];
    if (!z.t0) z.t0 = t;
    const p = Math.min(1, (t - z.t0) / z.dur);
    const step = Math.floor(p * STEPS);
    const r = z.el.getBoundingClientRect();
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
  if (REDUCED || !el) { if (done) done(); return; }
  zooms.push({ el, dur: 380, done: done || (() => {}), t0: 0 });
  if (!zraf) zraf = requestAnimationFrame(zoomLoop);
}

// generic reveal: [data-type] types in, [data-dz] dissolves in, [data-at] plays on load,
// [data-zoom] zooms open before its [data-type]/[data-dz] children arrive
safe('reveal', function reveal() {
  const typed = Array.from(document.querySelectorAll('[data-type]'));
  typed.forEach(prepType);
  if (REDUCED || !('IntersectionObserver' in window)) return;

  document.querySelectorAll('[data-at]').forEach(el => {
    const at = parseInt(el.dataset.at, 10) || 0;
    if (el.hasAttribute('data-type')) typeIn(el, at);
    else { hide(el); dissolve(el, at, 520); }
  });

  const groups = Array.from(document.querySelectorAll('[data-zoom]'));
  groups.forEach(g => {
    const target = g.querySelector('[data-zoom-target]') || g;
    hide(target);
    g.querySelectorAll('[data-dz]').forEach(hide);
  });
  const gio = new IntersectionObserver(entries => {
    entries.filter(en => en.isIntersecting).forEach((en, i) => {
      gio.unobserve(en.target);
      const g = en.target, target = g.querySelector('[data-zoom-target]') || g;
      setTimeout(() => zoomOpen(target, () => {
        dissolve(target, 0, 380);
        g.querySelectorAll('[data-type]').forEach(el => typeIn(el, 260));
        g.querySelectorAll('[data-dz]').forEach((el, j) => dissolve(el, 460 + j * 140, 420));
        g.dispatchEvent(new CustomEvent('opened'));
      }), i * 170);
    });
  }, { threshold: 0.25 });
  groups.forEach(g => gio.observe(g));

  const rest = el => !el.closest('[data-zoom]') && !el.hasAttribute('data-at');
  const dz = Array.from(document.querySelectorAll('[data-dz]')).filter(rest);
  dz.forEach(hide);
  const io = new IntersectionObserver(entries => {
    entries.filter(en => en.isIntersecting).forEach((en, i) => {
      io.unobserve(en.target);
      if (en.target.hasAttribute('data-type')) typeIn(en.target, i * 90);
      else dissolve(en.target, 100 + i * 130, 480);
    });
  }, { threshold: 0.3 });
  typed.filter(rest).forEach(el => io.observe(el));
  dz.forEach(el => io.observe(el));
});

/* ---------- menu bar: London time and the cursor's position ---------- */

safe('menubar', function menubar() {
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
});

/* ---------- miniatures: the small live windows on the index and on /more/ ---------- */

// seeded randomness so every visitor sees the same arrangement
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one-bit ordered-dither fills as canvas patterns, 2px cells, crisp at any pixel ratio
const patCache = new Map();
function pattern(ctx, level, dpr) {
  const k = clamp(Math.round(level * 16), 0, 16);
  const key = k + '@' + dpr;
  if (!patCache.has(key)) {
    const c = Math.max(1, Math.round(2 * dpr));
    const tile = document.createElement('canvas');
    tile.width = tile.height = 4 * c;
    const g = tile.getContext('2d');
    g.fillStyle = INK;
    for (let i = 0; i < 16; i++) if (B4[i] < k) g.fillRect((i & 3) * c, (i >> 2) * c, c, c);
    patCache.set(key, tile);
  }
  const p = ctx.createPattern(patCache.get(key), 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  return p;
}

// each mini gets (ctx, W, H, dpr, time-in-ms); REDUCED draws a settled frame
function mini(name, draw, settled) {
  safe('mini-' + name, function () {
    const canvas = document.querySelector('canvas.mini[data-mini="' + name + '"]');
    if (!canvas) return;
    const s = stage(canvas);
    let lastT = settled;
    const paint = t => {
      if (!s.W || !s.H) return;
      s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      s.ctx.clearRect(0, 0, s.W, s.H);
      draw(s.ctx, s.W, s.H, s.dpr, t);
    };
    repaints.push(() => { s.size(); paint(lastT); });
    loop(canvas, (t, dt, el) => { lastT = REDUCED ? settled : el; paint(lastT); });
  });
}

// a project's window takes focus as you hover it, or as it crosses the middle of the screen
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

/* ---------- repaint on resize and once the typeface has arrived ---------- */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => repaints.forEach(fn => fn()), 180);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => repaints.forEach(fn => fn()));

window.MD = {
  REDUCED, FINE, root, repaints, safe, easeOut, easeInOut, clamp, lerp, hexA,
  INK, INK2, INK3, RULE, RULE2, PAPER, BG, FONT, font,
  B4, B8, INK32, bayer, ditherField, shadeOrb, orbIcon,
  stage, fitText, loop, progress, onVisible,
  hide, dissolve, prepType, typeIn, zoomOpen,
  rng, pattern, mini,
};
})();
