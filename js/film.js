/* film.js — the site as a film. One fixed stage, scroll is the timeline.
   GSAP + Lenis provide the transport; every frame is drawn by hand in canvas 2D.
   Loaded after main.js (uses window.__clog to report boss-fight unlocks). */
(() => {
'use strict';

if (!window.gsap || !window.ScrollTrigger || !window.Lenis) return;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

const root = document.documentElement;
root.classList.add('smooth'); // Lenis owns easing on every page; CSS smooth-scroll and reveal transitions stand down
gsap.registerPlugin(ScrollTrigger);

/* ---------- smooth transport (shared by film pages and plain pages) ---------- */

const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

// in film mode these sections live on the timeline, not in the document flow
const FILM_ANCHORS = {
  '#projects': 1.5 / 7, '#quests': 4.5 / 7,
  '#clog': 5.5 / 7, '#about': 6.5 / 7, '#contact': 6.5 / 7,
};

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (!id || id.length < 2) return;
    if (root.classList.contains('film') && FILM_ANCHORS[id] !== undefined) {
      e.preventDefault();
      lenis.scrollTo(track.offsetTop + trackLen() * FILM_ANCHORS[id], { duration: 1.6 });
      return;
    }
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    lenis.scrollTo(el, { offset: -64 });
  });
});

/* ---------- tail / plain-page reveals: gentle, once, never scrubbed ---------- */

function revealTail() {
  gsap.utils.toArray('.tail .section-h, .tail .section-note, .tail .clog-item, .tail .about-col p, .tail .npc, .tail .ge, .tail .log-entry, .log-entry').forEach(el => {
    gsap.from(el, {
      y: 36, autoAlpha: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

const stage = document.getElementById('film-stage');
const track = document.getElementById('film-track');
const filmCanvas = document.getElementById('film-canvas');
if (!stage || !track || !filmCanvas) { revealTail(); return; } // log page etc: smooth scroll + reveals only

root.classList.add('film');
revealTail();

/* ---------- the whole site joins the film: sections dock into scene overlays ---------- */

const dock = (sel, slotId) => {
  const el = document.querySelector(sel);
  const slot = document.getElementById(slotId);
  if (el && slot) slot.appendChild(el);
};
dock('#quests', 'quest-slot');
dock('#clog', 'clog-slot');
dock('#ge-ticker', 'ge-slot');
dock('#npc', 'npc-slot');

/* ---------- engine state ---------- */

const ctx = filmCanvas.getContext('2d');
const SCENES = 7;
const XFADE = 0.16;            // crossfade half-width in scene units
let W = 0, H = 0, DPR = 1;
let p = 0;                     // smoothed master progress 0..1
let bootMs = 0;                // stage lights up on arrival
const caches = new Map();

const cs = getComputedStyle(root);
let THEME = {};
function readTheme() {
  const v = n => cs.getPropertyValue(n).trim();
  THEME = {
    dark: root.getAttribute('data-theme') === 'dark',
    fg: v('--fg') || '#eae6da', bg: v('--bg') || '#05060b',
    muted: v('--muted') || '#8b8fa0', line: v('--line') || '#1c2030',
  };
  caches.clear();
}
readTheme();

function hexA(hex, a) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const clamp01 = x => Math.max(0, Math.min(1, x));
const rnd = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function cacheGet(key, w, h, fn) {
  // caches are CSS-pixel sized: painters may drawImage them with or without
  // explicit dimensions and the geometry stays true either way
  const k = key + '|' + (THEME.dark ? 'd' : 'l');
  let c = caches.get(k);
  if (!c || c.width !== Math.max(1, Math.round(w))) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    fn(c.getContext('2d'), w, h);
    caches.set(k, c);
  }
  return c;
}
// painters receive a draw-space cache handle (returns canvas; caller drawImage at CSS size)
function mkEnv(t, in01, out01, ms) {
  return {
    W, H, ms, t, in01, out01,
    dark: true, // the film is always night
    gold: '#f5c518', gold2: '#d9b45b', violet: '#a05fd0', ice: '#9cc7ff',
    ember: '#e67e22', red: '#c0281a',
    fg: THEME.fg, bg: THEME.bg, muted: THEME.muted, line: THEME.line,
    hexA, ease, clamp01, rnd,
    cache: (key, w, h, fn) => cacheGet(key, w, h, fn),
    drawCache: (c, x, y) => ctx.drawImage(c, x, y, c.width / DPR, c.height / DPR),
  };
}

function size() {
  const w = innerWidth, h = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
  if (w === W && h === H && filmCanvas.width === Math.round(w * DPR)) return;
  W = w; H = h;
  filmCanvas.width = Math.round(W * DPR);
  filmCanvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  caches.clear();
}
size();
addEventListener('resize', () => { size(); ScrollTrigger.refresh(); });

/* ---------- scene painters (registry filled below by the scene modules) ---------- */

const PAINTERS = [];

function paintCrystalArena(ctx, f) {
  var GA = ctx.globalAlpha;
  var W = f.W, H = f.H, ms = f.ms;
  var LM = f.dark ? 1 : 0.55;
  var inE = f.ease(f.clamp01(f.in01));
  var outE = f.clamp01(f.out01);
  var exitK = 1 - outE;                 // 0 while visible, 1 as scene exits
  var dim = 1 - 0.38 * exitK;           // light dims on exit
  var groundY = H * 0.72;
  var gh2 = Math.ceil(H - groundY) + 2;
  var K = 'paintCrystalArena:';
  var rnd = f.rnd;

  function A(a) { ctx.globalAlpha = f.clamp01(GA * LM * a); }

  function tri(g, x1, y1, x2, y2, x3, y3) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill();
  }
  function polyFill(g, pts, col) {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fill();
  }
  // tapered angular polyline -> low-poly limb polygon
  function limb(g, pts, w0, w1, col) {
    var n = pts.length, Lp = [], Rp = [], i, dx, dy;
    for (i = 0; i < n; i++) {
      if (i === 0) { dx = pts[1][0] - pts[0][0]; dy = pts[1][1] - pts[0][1]; }
      else if (i === n - 1) { dx = pts[i][0] - pts[i - 1][0]; dy = pts[i][1] - pts[i - 1][1]; }
      else { dx = pts[i + 1][0] - pts[i - 1][0]; dy = pts[i + 1][1] - pts[i - 1][1]; }
      var dl = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / dl, ny = dx / dl;
      var w = w0 + (w1 - w0) * (i / (n - 1));
      Lp.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
      Rp.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
    }
    g.fillStyle = col;
    g.beginPath(); g.moveTo(Lp[0][0], Lp[0][1]);
    for (i = 1; i < n; i++) g.lineTo(Lp[i][0], Lp[i][1]);
    for (i = n - 1; i >= 0; i--) g.lineTo(Rp[i][0], Rp[i][1]);
    g.closePath(); g.fill();
  }
  // small faceted crystal cluster: 2-3 diamonds, dark facet / light facet / bright core
  function crys(g, x, y, s, seed, baseAng) {
    var n = 2 + ((rnd(seed) * 2) | 0);
    for (var j = 0; j < n; j++) {
      var ang = baseAng + (rnd(seed + j * 3 + 1) - 0.5) * 0.9;
      var len = s * (0.75 + 0.65 * rnd(seed + j * 3 + 2));
      var wid = len * 0.30;
      var ox = x + (rnd(seed + j * 3 + 3) - 0.5) * s * 0.6;
      var oy = y + (rnd(seed + j * 3 + 4) - 0.5) * s * 0.35;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      var tx2 = ox + ca * len, ty2 = oy + sa * len;
      var bx3 = ox - ca * len * 0.28, by3 = oy - sa * len * 0.28;
      g.fillStyle = '#4fa8b8'; tri(g, tx2, ty2, ox - sa * wid, oy + ca * wid, bx3, by3);
      g.fillStyle = '#9adbe8'; tri(g, tx2, ty2, ox + sa * wid, oy - ca * wid, bx3, by3);
      g.fillStyle = '#bdeef5';
      tri(g, ox + ca * len * 0.9, oy + sa * len * 0.9,
        ox - sa * wid * 0.35 + ca * len * 0.1, oy + ca * wid * 0.35 + sa * len * 0.1,
        ox + sa * wid * 0.35 + ca * len * 0.1, oy - ca * wid * 0.35 + sa * len * 0.1);
    }
  }
  function sigil(g, x, y, r, col, lw) {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.62, 0.8, 5.4); g.stroke();
    for (var j = 0; j < 4; j++) {
      var a = j * 1.5708 + 0.7854;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66);
      g.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(x, y - r * 0.32); g.lineTo(x + r * 0.22, y); g.lineTo(x, y + r * 0.32); g.lineTo(x - r * 0.22, y);
    g.closePath(); g.stroke();
  }

  // ---------- shared deterministic geometry (used in caches AND per-frame) ----------
  var tw = Math.round(W * 0.34), th = Math.round(H * 0.98);
  var treeLX = -W * 0.06, treeRX = W - tw + W * 0.06;
  var treeY = groundY + H * 0.05 - th;

  function trunkX(dir, s, u) {
    var bx = dir > 0 ? tw * 0.30 : tw * 0.70;
    return bx + dir * (Math.sin(u * 5 + s) * tw * 0.02 + u * u * tw * 0.10);
  }
  function branchPts(dir, s, k) {
    var u = 0.30 + 0.14 * k;
    var sy = th * (1 - 0.74 * u);
    var sx = trunkX(dir, s, u);
    var r1 = rnd(s * 10 + 40 + k) - 0.5, r2 = rnd(s * 10 + 50 + k) - 0.5, r3 = rnd(s * 10 + 60 + k) - 0.5;
    var reach = tw * (0.24 + 0.11 * k + 0.06 * r1);
    return [
      [sx, sy],
      [sx + dir * reach * 0.35, sy - th * (0.085 + 0.02 * k) + th * 0.02 * r2],
      [sx + dir * reach * 0.72, sy - th * (0.13 + 0.035 * k)],
      [sx + dir * reach + dir * tw * 0.03 * r3, sy - th * (0.10 + 0.03 * k) + th * 0.03]
    ];
  }
  function shardPos(i) {
    var xx = i < 3 ? W * (0.05 + 0.115 * rnd(200 + i * 7)) : W * (0.85 + 0.11 * rnd(200 + i * 7));
    var yy = groundY + (H - groundY) * (0.12 + 0.55 * rnd(201 + i * 7));
    return [xx, yy];
  }

  // ---------- gate slab builder (base pass + bright overlay pass share geometry) ----------
  var gw = Math.round(W * 0.46), ghc = Math.round(H * 0.66);
  function buildSlab(g, bx, by, tx, ty, wmax, seed, bright) {
    var N = 5, L = [], M = [], R = [], i, u;
    for (i = 0; i <= N; i++) {
      u = i / N;
      var x = bx + (tx - bx) * u, y = by + (ty - by) * u;
      var prof = u > 0.78 ? (1 - u) / 0.22 : (0.72 + 0.5 * Math.sin(u * 2.8));
      var w = wmax * prof * (1 + (rnd(seed + i) - 0.5) * 0.3);
      var jx = (i === 0 || i === N) ? 0 : (rnd(seed + 10 + i) - 0.5) * wmax * 0.35;
      L.push([x - w + jx, y]);
      R.push([x + w + jx, y]);
      M.push([x + jx + w * (0.18 + (rnd(seed + 20 + i) - 0.5) * 0.2), y]);
    }
    L[N] = [tx, ty]; R[N] = [tx, ty]; M[N] = [tx, ty];
    var sx2 = (bx + tx) / 2 + wmax * 0.12, sy2 = (by + ty) / 2;
    if (!bright) {
      var SL = ['#5595a6', '#4a8899', '#417b8b', '#3a6e7e', '#325f70'];
      var SR = ['#9adbe8', '#8fd2df', '#7ec3d1', '#6db2c2', '#5c9fb0'];
      for (i = 0; i < N; i++) {
        var o = (i + seed % 3) % 5;
        polyFill(g, [L[i], M[i], M[i + 1], L[i + 1]], SL[o]);
        polyFill(g, [M[i], R[i], R[i + 1], M[i + 1]], SR[o]);
      }
      polyFill(g, [L[0], M[0], M[1], L[1]], 'rgba(189,238,245,0.22)');
      polyFill(g, [M[0], R[0], R[1], M[1]], 'rgba(189,238,245,0.30)');
      g.strokeStyle = 'rgba(16,50,62,0.6)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo((L[1][0] + M[1][0]) / 2, L[1][1]); g.lineTo(L[3][0] * 0.4 + M[3][0] * 0.6, L[3][1]); g.stroke();
      g.beginPath(); g.moveTo((M[2][0] + R[2][0]) / 2, M[2][1]); g.lineTo((M[4][0] + R[4][0]) / 2, M[4][1]); g.stroke();
      g.strokeStyle = 'rgba(189,238,245,0.35)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(M[0][0], M[0][1]);
      for (i = 1; i <= N; i++) g.lineTo(M[i][0], M[i][1]);
      g.stroke();
      sigil(g, sx2, sy2, wmax * 0.8, 'rgba(154,219,232,0.45)', 1.2);
      for (i = 0; i < 5; i++) {
        var rx3 = bx + (rnd(seed + 30 + i) - 0.5) * wmax * 3.2;
        var rs = wmax * (0.25 + 0.35 * rnd(seed + 36 + i));
        g.fillStyle = ['#332a22', '#3e3226', '#241f1a'][i % 3];
        tri(g, rx3 - rs, by + 2, rx3 + rs * 0.9, by + 2, rx3 + rs * 0.1, by - rs * (0.8 + 0.5 * rnd(seed + 42 + i)));
      }
    } else {
      g.strokeStyle = 'rgba(232,247,250,0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(M[0][0], M[0][1]);
      for (i = 1; i <= N; i++) g.lineTo(M[i][0], M[i][1]);
      g.stroke();
      polyFill(g, [M[N - 1], R[N - 1], R[N], M[N]], 'rgba(189,238,245,0.45)');
      polyFill(g, [L[N - 1], M[N - 1], M[N], L[N]], 'rgba(189,238,245,0.28)');
      polyFill(g, [L[0], M[0], M[1], L[1]], 'rgba(189,238,245,0.30)');
      polyFill(g, [M[0], R[0], R[1], M[1]], 'rgba(189,238,245,0.40)');
      sigil(g, sx2, sy2, wmax * 0.8, 'rgba(189,238,245,0.95)', 1.6);
    }
  }

  // ---------- tree builder ----------
  function buildTree(g, dir, s) {
    var tp = [], nT = 6, i, u, k;
    for (i = 0; i < nT; i++) {
      u = i / (nT - 1);
      tp.push([trunkX(dir, s, u) + (rnd(s + i) - 0.5) * tw * 0.03 * (i > 0 ? 1 : 0.3), th * (1 - 0.74 * u)]);
    }
    g.fillStyle = '#241f1a';
    tri(g, tp[0][0] - th * 0.08, th, tp[0][0] + th * 0.08, th, tp[0][0], th * 0.90);
    limb(g, tp, th * 0.040, th * 0.010, '#241f1a');
    var tp2 = [], tp3 = [], tp4 = [];
    for (i = 0; i < nT; i++) {
      tp2.push([tp[i][0] + dir * th * 0.007, tp[i][1]]);
      tp3.push([tp[i][0] + dir * th * 0.013, tp[i][1]]);
      tp4.push([tp[i][0] + dir * th * 0.016, tp[i][1]]);
    }
    limb(g, tp2, th * 0.022, th * 0.005, '#332a22');
    limb(g, tp3.slice(0, 4), th * 0.010, th * 0.004, '#3e3226');
    limb(g, tp4, th * 0.004, th * 0.0015, 'rgba(120,182,192,0.22)');
    for (k = 0; k < 4; k++) {
      var bp = branchPts(dir, s, k);
      limb(g, bp, th * 0.014, th * 0.0035, '#241f1a');
      limb(g, [[bp[0][0], bp[0][1] - 2], [bp[1][0], bp[1][1] - 2], [bp[2][0], bp[2][1] - 2]], th * 0.006, th * 0.002, '#332a22');
      var q = bp[2];
      limb(g, [q, [q[0] + dir * tw * 0.05, q[1] - th * 0.035], [q[0] + dir * tw * 0.09, q[1] - th * 0.028]], th * 0.005, th * 0.0015, '#241f1a');
      crys(g, bp[3][0], bp[3][1], H * 0.016, s * 20 + k * 7, Math.PI / 2);
    }
    for (k = 0; k < 2; k++) {
      u = 0.35 + 0.2 * k;
      crys(g, trunkX(dir, s, u) + dir * th * 0.020, th * (1 - 0.74 * u), H * 0.014, s * 30 + k * 9, dir > 0 ? -0.35 : Math.PI + 0.35);
    }
    g.fillStyle = '#39482a';
    for (i = 0; i < 4; i++) {
      var mx = tp[0][0] + (rnd(s + 70 + i) - 0.5) * th * 0.12;
      tri(g, mx - 8, th, mx + 9, th, mx + 1, th - 7 - 8 * rnd(s + 74 + i));
    }
  }

  // ---------- caches ----------
  var sky = f.cache(K + 'sky', W, H, function (g) {
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#020308');
    gr.addColorStop(0.55, '#04070d');
    gr.addColorStop(0.85, '#071019');
    gr.addColorStop(1, '#0a141c');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var hz = g.createRadialGradient(W * 0.53, groundY, 10, W * 0.53, groundY, H * 0.5);
    hz.addColorStop(0, 'rgba(80,140,150,0.12)');
    hz.addColorStop(1, 'rgba(80,140,150,0)');
    g.fillStyle = hz; g.fillRect(0, 0, W, H);
    for (var i = 0; i < 8; i++) {
      var x = W * (0.06 + 0.88 * rnd(i * 7 + 1));
      var y = H * (0.04 + 0.34 * rnd(i * 7 + 2));
      var s = 0.8 + 1.2 * rnd(i * 7 + 3);
      g.fillStyle = 'rgba(156,199,255,' + (0.16 + 0.2 * rnd(i * 7 + 4)).toFixed(3) + ')';
      g.fillRect(x, y, s, s);
    }
  });

  var glow = f.cache(K + 'glow', 64, 64, function (g) {
    var gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(189,238,245,0.9)');
    gr.addColorStop(0.35, 'rgba(154,219,232,0.38)');
    gr.addColorStop(1, 'rgba(111,199,212,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });

  var gate = f.cache(K + 'gate', gw, ghc, function (g) {
    var hs = H * 0.55;
    buildSlab(g, gw * 0.30, ghc - 2, gw * 0.44, ghc - 2 - hs, W * 0.062, 11, false);
    buildSlab(g, gw * 0.72, ghc - 2, gw * 0.575, ghc - 2 - hs * 0.94, W * 0.058, 77, false);
  });
  var gateB = f.cache(K + 'gateB', gw, ghc, function (g) {
    var hs = H * 0.55;
    buildSlab(g, gw * 0.30, ghc - 2, gw * 0.44, ghc - 2 - hs, W * 0.062, 11, true);
    buildSlab(g, gw * 0.72, ghc - 2, gw * 0.575, ghc - 2 - hs * 0.94, W * 0.058, 77, true);
  });

  var ground = f.cache(K + 'ground', W, gh2, function (g) {
    g.fillStyle = '#46592f'; g.fillRect(0, 0, W, gh2);
    var gr = g.createLinearGradient(0, 0, 0, gh2);
    gr.addColorStop(0, 'rgba(18,26,14,0.55)');
    gr.addColorStop(0.35, 'rgba(18,26,14,0.15)');
    gr.addColorStop(1, 'rgba(18,26,14,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, gh2);
    var i, x, y, s, v;
    var cols = ['#41552c', '#546c39', '#5d7340', '#3a4a28', '#66793f', '#74884a', '#4a5d33'];
    for (i = 0; i < 60; i++) {
      x = W * rnd(i * 5 + 300);
      y = gh2 * Math.pow(rnd(i * 5 + 301), 0.8);
      s = (W * 0.012 + W * 0.03 * rnd(i * 5 + 302)) * (0.35 + y / gh2);
      g.fillStyle = cols[(i * 3 + ((rnd(i * 5 + 303) * 7) | 0)) % 7];
      tri(g, x, y, x + s * (0.4 + rnd(i * 5 + 304)), y + s * 0.5, x - s * (0.3 + rnd(i * 5 + 303) * 0.7), y + s * (0.3 + 0.4 * rnd(i * 5 + 305)));
    }
    // dirt path to the gate
    function pl(v2) { return W * (v2 < 0.45 ? 0.487 - 0.037 * (v2 / 0.45) : 0.450 - 0.095 * ((v2 - 0.45) / 0.55)); }
    function pr(v2) { return W * (v2 < 0.45 ? 0.578 + 0.037 * (v2 / 0.45) : 0.615 + 0.085 * ((v2 - 0.45) / 0.55)); }
    polyFill(g, [[W * 0.487, 0], [W * 0.578, 0], [W * 0.615, gh2 * 0.45], [W * 0.700, gh2], [W * 0.355, gh2], [W * 0.450, gh2 * 0.45]], '#54422e');
    var colsP = ['#7a5c3e', '#3e3226', '#6b5136', '#4a3a2a', '#5a4632'];
    for (i = 0; i < 16; i++) {
      v = rnd(i * 4 + 400);
      y = gh2 * v;
      var lx = pl(v), rx = pr(v);
      x = lx + (rx - lx) * (0.12 + 0.76 * rnd(i * 4 + 401));
      s = (W * 0.006 + W * 0.016 * rnd(i * 4 + 402)) * (0.4 + v);
      polyFill(g, [[x, y], [x + s, y + s * 0.35], [x + s * 0.6, y + s * 0.8], [x - s * 0.35, y + s * 0.5]], colsP[i % 5]);
    }
    g.strokeStyle = '#33291d'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W * 0.487, 0); g.lineTo(W * 0.450, gh2 * 0.45); g.lineTo(W * 0.355, gh2); g.stroke();
    g.beginPath(); g.moveTo(W * 0.578, 0); g.lineTo(W * 0.615, gh2 * 0.45); g.lineTo(W * 0.700, gh2); g.stroke();
    // grass tufts either side of the path
    for (i = 0; i < 22; i++) {
      x = (i % 2) ? W * (0.70 + 0.28 * rnd(i * 3 + 500)) : W * (0.02 + 0.30 * rnd(i * 3 + 500));
      y = gh2 * (0.15 + 0.8 * rnd(i * 3 + 501));
      s = (3 + 5 * rnd(i * 3 + 502)) * (0.5 + y / gh2);
      g.strokeStyle = (i % 3) ? '#617a3c' : '#74884a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - s * 0.6, y); g.lineTo(x - s * 0.8, y - s);
      g.moveTo(x, y); g.lineTo(x, y - s * 1.3);
      g.moveTo(x + s * 0.6, y); g.lineTo(x + s * 0.9, y - s * 0.9);
      g.stroke();
    }
    // crystal shards sprouting near the trees (edges only)
    for (i = 0; i < 6; i++) {
      var sp3 = shardPos(i);
      crys(g, sp3[0], sp3[1] - groundY, H * 0.020, 600 + i * 9, -Math.PI / 2);
    }
  });

  var treeL = f.cache(K + 'treeL', tw, th, function (g) { buildTree(g, 1, 3); });
  var treeR = f.cache(K + 'treeR', tw, th, function (g) { buildTree(g, -1, 8); });

  var mh = Math.round(H * 0.12);
  var mist = f.cache(K + 'mist', W, mh, function (g) {
    var band = g.createLinearGradient(0, 0, 0, mh);
    band.addColorStop(0, 'rgba(175,200,202,0)');
    band.addColorStop(0.55, 'rgba(175,200,202,0.30)');
    band.addColorStop(1, 'rgba(175,200,202,0.12)');
    g.fillStyle = band; g.fillRect(0, 0, W, mh);
    for (var i = 0; i < 9; i++) {
      var x = W * (i + 0.5) / 9 + (rnd(i + 50) - 0.5) * W * 0.08;
      var y = mh * (0.35 + 0.4 * rnd(i + 60));
      var rx = W * (0.06 + 0.07 * rnd(i + 70));
      var ry = mh * (0.30 + 0.25 * rnd(i + 80));
      var gr = g.createRadialGradient(x, y, 1, x, y, rx);
      gr.addColorStop(0, 'rgba(185,208,210,0.5)');
      gr.addColorStop(1, 'rgba(185,208,210,0)');
      g.save();
      g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = gr;
      g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      g.restore();
    }
  });

  var vig = f.cache(K + 'vig', W, H, function (g) {
    var r = Math.max(W, H) * 0.72;
    var gr = g.createRadialGradient(W * 0.52, H * 0.55, Math.min(W, H) * 0.42, W * 0.52, H * 0.55, r);
    gr.addColorStop(0, 'rgba(2,3,8,0)');
    gr.addColorStop(0.7, 'rgba(2,3,8,0.28)');
    gr.addColorStop(1, 'rgba(2,3,8,0.62)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });

  // ---------- per-frame ----------
  var p1 = 0.5 + 0.5 * Math.sin(ms * 0.0011);
  var p2 = 0.5 + 0.5 * Math.sin(ms * 0.00085 + 2.1);
  var i;

  ctx.save();
  var zs = 1 + 0.02 * f.ease(f.clamp01(f.t));   // subtle cinematic push-in, pivot on ground line
  ctx.translate(W * 0.5, groundY);
  ctx.scale(zs, zs);
  ctx.translate(-W * 0.5, -groundY);

  // 1) sky + twinkles
  A(dim);
  ctx.drawImage(sky, 0, 0, W, H);
  ctx.fillStyle = '#9cc7ff';
  for (i = 0; i < 3; i++) {
    var txx = W * (0.15 + 0.7 * rnd(i * 2 + 30));
    var tyy = H * (0.06 + 0.22 * rnd(i * 2 + 31));
    var tp5 = 0.5 + 0.5 * Math.sin(ms * 0.0016 + i * 2.5);
    A((0.10 + 0.20 * tp5 * tp5) * dim);
    ctx.fillRect(txx, tyy, 1.5, 1.5);
  }

  // 2) crystal gate: aura, slabs, pulsing bright overlay
  var gx = Math.round(W * 0.53 - gw / 2), gy = Math.round(groundY - ghc + 2);
  A((0.10 + 0.10 * p1) * inE * dim);
  ctx.drawImage(glow, W * 0.53 - W * 0.21, groundY - H * 0.50, W * 0.42, H * 0.55);
  A(0.97 * dim);
  ctx.drawImage(gate, gx, gy, gw, ghc);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  A((0.22 + 0.30 * p1) * (0.25 + 0.75 * inE) * dim);
  ctx.drawImage(gateB, gx, gy, gw, ghc);
  ctx.restore();

  // 3) ground + pool of light at the gate's feet
  A(0.98 * dim);
  ctx.drawImage(ground, 0, groundY - 1, W, gh2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  A((0.28 + 0.16 * p1) * inE * dim);
  ctx.drawImage(glow, W * 0.53 - W * 0.16, groundY - H * 0.030, W * 0.32, H * 0.085);
  A((0.16 + 0.10 * p2) * inE * dim);
  ctx.drawImage(glow, W * 0.53 - W * 0.09, groundY - H * 0.018, W * 0.18, H * 0.05);
  ctx.restore();

  // 4) trees (whole cached tree rotated a hair around its base = slight branch-tip sway)
  function drawTree(cv, x0, dir, s, sway) {
    var bx = dir > 0 ? tw * 0.30 : tw * 0.70;
    ctx.save();
    ctx.translate(x0 + bx, treeY + th);
    ctx.rotate(sway);
    ctx.translate(-bx, -th);
    A(0.98 * dim);
    ctx.drawImage(cv, 0, 0, tw, th);
    ctx.globalCompositeOperation = 'lighter';
    for (var k = 0; k < 4; k++) {
      var tip = branchPts(dir, s, k)[3];
      var pu = 0.5 + 0.5 * Math.sin(ms * 0.0012 + s + k * 1.9);
      A((0.08 + 0.26 * pu) * inE * dim);
      var gs2 = H * (0.035 + 0.02 * rnd(s + k + 5));
      ctx.drawImage(glow, tip[0] - gs2 / 2, tip[1] - gs2 / 2, gs2, gs2);
    }
    for (k = 0; k < 2; k++) {
      var u = 0.35 + 0.2 * k;
      var cx2 = trunkX(dir, s, u) + dir * th * 0.020;
      var cy2 = th * (1 - 0.74 * u);
      var pu2 = 0.5 + 0.5 * Math.sin(ms * 0.001 + s * 2 + k * 2.6);
      A((0.07 + 0.20 * pu2) * inE * dim);
      var gs3 = H * 0.030;
      ctx.drawImage(glow, cx2 - gs3 / 2, cy2 - gs3 / 2, gs3, gs3);
    }
    ctx.restore();
  }
  drawTree(treeL, treeLX, 1, 3, Math.sin(ms * 0.00047) * 0.006);
  drawTree(treeR, treeRX, -1, 8, Math.sin(ms * 0.00047 + 1.9) * 0.006);

  // 5) shard glows at the edges + occasional drifting motes
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < 6; i++) {
    var sp2 = shardPos(i);
    var pu3 = 0.5 + 0.5 * Math.sin(ms * 0.0013 + i * 2.2);
    A((0.06 + 0.20 * pu3) * inE * dim);
    var gs4 = H * 0.030;
    ctx.drawImage(glow, sp2[0] - gs4 / 2, sp2[1] - gs4 / 2 - H * 0.008, gs4, gs4);
  }
  for (i = 0; i < 6; i++) {
    var spd = 0.00002 + 0.00003 * rnd(i * 3 + 90);
    var px = W * (0.10 + 0.80 * rnd(i * 3 + 91)) + Math.sin(ms * 0.00023 + i * 2.1) * W * 0.02;
    var prog = (ms * spd + rnd(i * 3 + 92)) % 1;
    var py = groundY - H * 0.02 - prog * H * 0.30;
    var occ = Math.max(0, Math.sin(ms * 0.00013 + i * 1.9)); occ *= occ;
    var fl = 0.5 + 0.5 * Math.sin(ms * 0.0021 + i * 2.7);
    var al = occ * (0.20 + 0.45 * fl) * inE * dim * (1 - prog * 0.7);
    if (al > 0.02) {
      A(al);
      var gs5 = H * 0.014;
      ctx.drawImage(glow, px - gs5 / 2, py - gs5 / 2, gs5, gs5);
      ctx.fillStyle = '#dff5f8';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }
  ctx.restore();

  // 6) knee-height mist, two drifting layers; thickens on exit
  var off1 = (ms * 0.010) % W;
  var off2 = W - (ms * 0.006) % W;
  A(0.30 + 0.60 * exitK);
  ctx.drawImage(mist, off1 - W, groundY - mh * 0.62, W, mh);
  ctx.drawImage(mist, off1, groundY - mh * 0.62, W, mh);
  A(0.42 + 0.75 * exitK);
  ctx.drawImage(mist, off2 - W, groundY - mh * 0.30, W, mh);
  ctx.drawImage(mist, off2, groundY - mh * 0.30, W, mh);

  ctx.restore(); // end push-in transform

  // 7) vignette (strengthens as the light dies on exit)
  A(0.9 + 0.6 * exitK);
  ctx.drawImage(vig, 0, 0, W, H);

  ctx.globalAlpha = GA;
}

function paintGielinorFlyover(ctx, f) {
  var GA = ctx.globalAlpha;
  ctx.save();
  var W = f.W, H = f.H, ms = f.ms, t = f.t;
  var A = f.dark ? 1 : 0.55;
  var TAU = Math.PI * 2;
  var TW = 2048;
  var CW = Math.ceil(W);
  var horizon = H * 0.62;
  var K = 'paintGielinorFlyover:';
  var DIM = (W | 0) + 'x' + (H | 0);
  var inE = f.ease(f.clamp01(f.in01));
  var outE = f.ease(f.clamp01(f.out01));
  var night = 1 - outE;
  var i, j, k;

  function mod(a, n) { return ((a % n) + n) % n; }
  function al(a) { var v = GA * A * a; ctx.globalAlpha = v < 0 ? 0 : v > 1 ? 1 : v; }
  function ent(idx) { return f.ease(f.clamp01((f.in01 - 0.09 * idx) / 0.62)); }
  function ridgePt(seed, N, ii) { var jj = ((ii % N) + N) % N; return 0.25 + 0.75 * f.rnd(seed + jj * 7); }
  function ridgeY(seed, N, amp, u) {
    var seg = TW / N, ii = Math.floor(u / seg), fr = u / seg - ii;
    var a = ridgePt(seed, N, ii), b = ridgePt(seed, N, ii + 1);
    return -(a + (b - a) * fr) * amp;
  }
  function ridgeStrip(name, seed, N, amp, fillDepth, cBase, cLit, cDark, snow) {
    var baseY = amp + 6;
    var hgt = Math.ceil(baseY + fillDepth);
    var img = f.cache(K + name + ':' + DIM, TW, hgt, function (c) {
      var pts = [], q;
      for (q = 0; q <= N; q++) pts.push([q * TW / N, baseY + ridgeY(seed, N, amp, q * TW / N)]);
      c.fillStyle = cBase;
      c.beginPath();
      c.moveTo(-2, hgt + 4);
      for (q = 0; q <= N; q++) c.lineTo(pts[q][0], pts[q][1]);
      c.lineTo(TW + 2, hgt + 4);
      c.closePath(); c.fill();
      for (q = 1; q < N; q++) {
        var p = pts[q], l = pts[q - 1], r = pts[q + 1];
        if (p[1] < l[1] && p[1] < r[1]) {
          c.fillStyle = cLit;
          c.beginPath();
          c.moveTo(p[0], p[1]);
          c.lineTo(r[0], r[1]);
          c.lineTo(p[0] * 0.45 + r[0] * 0.55, Math.min(hgt, r[1] + amp * 0.3));
          c.closePath(); c.fill();
          c.fillStyle = cDark;
          c.beginPath();
          c.moveTo(p[0], p[1]);
          c.lineTo(l[0], l[1]);
          c.lineTo(p[0] * 0.5 + l[0] * 0.5, Math.min(hgt, l[1] + amp * 0.22));
          c.closePath(); c.fill();
          if (snow && baseY - p[1] > amp * 0.62) {
            var slx = p[0] + (l[0] - p[0]) * 0.24, sly = p[1] + (l[1] - p[1]) * 0.24;
            var srx = p[0] + (r[0] - p[0]) * 0.3, sry = p[1] + (r[1] - p[1]) * 0.3;
            c.fillStyle = '#cfd4c8';
            c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(srx, sry); c.lineTo(slx, sly); c.closePath(); c.fill();
            c.fillStyle = '#e8e6d8';
            c.beginPath(); c.moveTo(p[0], p[1]);
            c.lineTo(p[0] + (srx - p[0]) * 0.6, p[1] + (sry - p[1]) * 0.6);
            c.lineTo(p[0] + (slx - p[0]) * 0.35, p[1] + (sly - p[1]) * 0.35);
            c.closePath(); c.fill();
          }
        }
      }
    });
    return { img: img, baseY: baseY, hgt: hgt };
  }
  function drawTiled(img, off, yTop) {
    for (var x = -mod(off, TW); x < W; x += TW) ctx.drawImage(img, x, yTop);
  }
  function diamond(x, y, w2, h2) {
    ctx.beginPath();
    ctx.moveTo(x - w2, y); ctx.lineTo(x, y - h2); ctx.lineTo(x + w2, y); ctx.lineTo(x, y + h2);
    ctx.closePath(); ctx.fill();
  }
  function slab(c, x, y, w, h, col, seed) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y + h);
    for (var q = 0; q <= 4; q++) {
      c.lineTo(x + w * q / 4, y + h * (q === 0 || q === 4 ? 0.8 : 0.08 + 0.55 * f.rnd(seed + q * 3)));
    }
    c.lineTo(x + w, y + h);
    c.closePath(); c.fill();
  }

  var scroll = t * W;

  // ---- dusk sky (cached gradient) ----
  var skyH = Math.ceil(horizon) + 2;
  var sky = f.cache(K + 'sky:' + DIM, CW, skyH, function (c) {
    var g = c.createLinearGradient(0, 0, 0, skyH);
    g.addColorStop(0, '#0a1020');
    g.addColorStop(0.55, '#1b2334');
    g.addColorStop(0.85, '#2a2a31');
    g.addColorStop(1, '#33291f');
    c.fillStyle = g;
    c.fillRect(0, 0, CW, skyH);
  });
  al(inE);
  ctx.drawImage(sky, 0, 0);

  // ---- a handful of faint pinpricks (brighten as night falls) ----
  ctx.fillStyle = '#bdeef5';
  for (i = 0; i < 9; i++) {
    var twk = 0.5 + 0.5 * Math.sin(ms * 0.0016 + i * 2.4);
    al((0.1 + 0.38 * night) * inE * twk);
    ctx.fillRect(f.rnd(11 + i) * W, f.rnd(23 + i) * H * 0.3, 1.5, 1.5);
  }

  // ---- ember band at the horizon (fades with out01) ----
  var embH = Math.ceil(H * 0.26);
  var ember = f.cache(K + 'ember:' + DIM, CW, embH, function (c) {
    var g = c.createLinearGradient(0, 0, 0, embH);
    g.addColorStop(0, f.hexA('#8a4a20', 0));
    g.addColorStop(0.55, f.hexA('#8a4a20', 0.5));
    g.addColorStop(0.88, f.hexA('#c9752c', 0.8));
    g.addColorStop(1, f.hexA('#d9903d', 0.95));
    c.fillStyle = g;
    c.fillRect(0, 0, CW, embH);
    var sx = CW * 0.34, sy = embH * 0.95;
    for (var q = 3; q >= 1; q--) {
      c.fillStyle = f.hexA('#d9903d', 0.055 * q);
      c.beginPath();
      c.ellipse(sx, sy, CW * 0.07 * q, embH * 0.15 * q, 0, 0, TAU);
      c.fill();
    }
  });
  al(inE * outE);
  ctx.drawImage(ember, 0, horizon - embH + 2);

  // ---- low-poly cloud slabs, six of them, individual drift speeds ----
  for (i = 0; i < 6; i++) {
    var cwd = Math.max(60, Math.round(W * (0.1 + 0.08 * f.rnd(41 + i))));
    var chh = Math.max(10, Math.round(H * 0.012 + H * 0.016 * f.rnd(47 + i)));
    var cloud = f.cache(K + 'cloud' + i + ':' + DIM, cwd, chh, (function (ii, w2, h2) {
      return function (c) {
        slab(c, 0, h2 * 0.42, w2, h2 * 0.58, '#232c40', 55 + ii * 9);
        slab(c, w2 * 0.13, 0, w2 * 0.7, h2 * 0.62, '#3d4761', 77 + ii * 9);
        if (ii >= 4) {
          c.globalAlpha = 0.5;
          c.fillStyle = '#8a5230';
          c.fillRect(w2 * 0.12, h2 * 0.86, w2 * 0.72, h2 * 0.1);
          c.globalAlpha = 1;
        }
      };
    })(i, cwd, chh));
    var range = W + 2 * cwd;
    var cx = W + cwd - mod(f.rnd(51 + i) * range * 5 + ms * (0.008 + 0.012 * f.rnd(61 + i)) + scroll * (0.05 + 0.025 * i), range);
    al(inE * (0.45 + 0.35 * f.rnd(31 + i)) * (0.35 + 0.65 * outE));
    ctx.drawImage(cloud, cx, H * (0.06 + 0.4 * f.rnd(71 + i)));
  }

  // ---- distant bird specks (flapping chevrons) ----
  ctx.strokeStyle = '#0d1017';
  ctx.lineWidth = 1.4;
  for (i = 0; i < 3; i++) {
    var brange = W * 1.3;
    var bx = W * 1.15 - mod(f.rnd(81 + i) * brange * 2 + ms * (0.025 + 0.012 * f.rnd(83 + i)) + scroll * 0.15, brange);
    var by = H * (0.16 + 0.14 * f.rnd(85 + i)) + Math.sin(ms * 0.0011 + i * 2.2) * H * 0.008;
    var fl = Math.sin(ms * 0.011 + i * 1.9);
    var wl = 2.6 + 0.9 * f.rnd(87 + i);
    al(0.75 * inE * (0.35 + 0.65 * outE));
    ctx.beginPath();
    ctx.moveTo(bx - wl, by - fl * wl * 0.7);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + wl, by - fl * wl * 0.7);
    ctx.stroke();
  }

  // ---- far ridge: cool grey-blue, snow-capped facets ----
  var farL = ridgeStrip('far', 101, 18, H * 0.14, H * 0.06, '#2a3548', '#3a4a63', '#222b3b', true);
  var entF = ent(0), slF = (1 - entF) * H * 0.1;
  al(0.95 * entF);
  drawTiled(farL.img, scroll * 0.12 + ms * 0.0045, horizon - farL.baseY + slF);

  // ---- warm atmospheric haze over the far bases ----
  var hazH = Math.ceil(H * 0.14);
  var haze = f.cache(K + 'haze:' + DIM, CW, hazH, function (c) {
    var g = c.createLinearGradient(0, 0, 0, hazH);
    g.addColorStop(0, f.hexA('#b06a30', 0));
    g.addColorStop(0.55, f.hexA('#b06a30', 0.45));
    g.addColorStop(1, f.hexA('#b06a30', 0));
    c.fillStyle = g;
    c.fillRect(0, 0, CW, hazH);
  });
  al(0.3 * inE * outE);
  ctx.drawImage(haze, 0, horizon - hazH * 0.55);

  // ---- mid ridge + tiny cottage light with smoke ----
  var midL = ridgeStrip('mid', 202, 13, H * 0.1, H * 0.26, '#1d2534', '#2a3448', '#161c29', false);
  var entM = ent(1), slM = (1 - entM) * H * 0.14;
  var offM = scroll * 0.3 + ms * 0.01;
  al(entM);
  drawTiled(midL.img, offM, horizon + H * 0.03 - midL.baseY + slM);

  var cotY = horizon + H * 0.03 + ridgeY(202, 13, H * 0.1, TW * 0.66) + H * 0.022 + slM;
  var cotX0 = TW * 0.66 - mod(offM, TW);
  for (j = 0; j < 3; j++) {
    var cX = cotX0 + j * TW;
    if (cX < -40 || cX > W + 40) continue;
    var lightA = (0.7 + 0.3 * outE) * entM;
    ctx.fillStyle = '#e8a33d';
    for (k = 3; k >= 1; k--) {
      al(0.05 * k * lightA);
      ctx.beginPath(); ctx.arc(cX, cotY, 2.5 + k * 3.2, 0, TAU); ctx.fill();
    }
    al(0.95 * lightA);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(cX - 1.2, cotY - 1.2, 2.4, 2.4);
    ctx.fillStyle = '#8d939c';
    for (k = 0; k < 5; k++) {
      var ph = mod(ms * 0.00009 + k * 0.2, 1);
      al(0.22 * (1 - ph) * entM * (0.5 + 0.5 * outE));
      ctx.beginPath();
      ctx.arc(cX - ph * H * 0.02 + Math.sin(ph * 7 + k * 1.3) * 3, cotY - 3 - ph * H * 0.05, 1 + ph * 2.2, 0, TAU);
      ctx.fill();
    }
  }

  // ---- winding river catching the ember light ----
  var rh = H * 0.15;
  function rivCy(u) { return rh * 0.48 + rh * 0.16 * Math.sin(u * TAU * 2 / TW + 1.7) + rh * 0.09 * Math.sin(u * TAU * 5 / TW + 4.2); }
  function rivW(u) { return rh * (0.13 + 0.05 * Math.sin(u * TAU * 3 / TW + 2.1)); }
  var riv = f.cache(K + 'river:' + DIM, TW, Math.ceil(rh), function (c) {
    function ribbon(scale, col) {
      c.fillStyle = col;
      c.beginPath();
      var M = 46, q, u;
      for (q = 0; q <= M; q++) {
        u = -20 + (TW + 40) * q / M;
        if (q) c.lineTo(u, rivCy(u) - rivW(u) * scale);
        else c.moveTo(u, rivCy(u) - rivW(u) * scale);
      }
      for (q = M; q >= 0; q--) { u = -20 + (TW + 40) * q / M; c.lineTo(u, rivCy(u) + rivW(u) * scale); }
      c.closePath(); c.fill();
    }
    ribbon(1.18, '#171c28');
    ribbon(1, '#8a4a20');
    ribbon(0.55, '#c9822f');
    ribbon(0.22, '#e8a95a');
  });
  var entR = ent(2), slR = (1 - entR) * H * 0.16;
  var offR = scroll * 0.45 + ms * 0.014;
  var yRiv = horizon + H * 0.02 + slR;
  al((0.35 + 0.65 * outE) * entR);
  drawTiled(riv, offR, yRiv);

  // three glints travelling along the water
  for (k = 0; k < 3; k++) {
    var gu = mod(ms * (0.022 + 0.009 * k) + k * TW / 3, TW);
    var gy = yRiv + rivCy(gu);
    var gx0 = gu - mod(offR, TW);
    var pulse = 0.45 + 0.55 * Math.sin(ms * 0.005 + k * 2.1);
    for (j = 0; j < 3; j++) {
      var gx = gx0 + j * TW;
      if (gx < -20 || gx > W + 20) continue;
      ctx.fillStyle = '#ffd98a';
      al(0.22 * outE * entR * pulse);
      diamond(gx, gy, 9, 2.6);
      ctx.fillStyle = '#ffe9b0';
      al(0.7 * outE * entR * pulse);
      diamond(gx, gy, 4, 1.1);
    }
  }

  // ---- near hills: near-black ----
  var nearL = ridgeStrip('near', 303, 10, H * 0.09, H * 0.14, '#10141f', '#1a2130', '#0a0d15', false);
  var entN = ent(3), slN = (1 - entN) * H * 0.18;
  var yNear = horizon + H * 0.16 - nearL.baseY + slN;
  al(entN);
  drawTiled(nearL.img, scroll * 0.62 + ms * 0.019, yNear);
  ctx.fillStyle = '#10141f';
  var nbY = yNear + nearL.hgt;
  if (nbY < H) ctx.fillRect(0, nbY - 1, W, H - nbY + 1);

  // ---- pine silhouette band, fastest layer ----
  var pinH = Math.ceil(H * 0.2);
  var pines = f.cache(K + 'pines:' + DIM, TW, pinH, function (c) {
    function row(col, baseY, maxH, step, seed) {
      c.fillStyle = col;
      var n = Math.ceil(TW / step);
      for (var q = 0; q < n; q++) {
        var tx = mod((q + 0.5) * step + (f.rnd(seed + q) - 0.5) * step * 0.7, TW);
        var th = maxH * (0.55 + 0.45 * f.rnd(seed + q * 3 + 1));
        var bw = th * 0.46;
        tr(tx, baseY, bw, th);
        if (tx < bw) tr(tx + TW, baseY, bw, th);
        if (tx > TW - bw) tr(tx - TW, baseY, bw, th);
      }
      function tr(x, y, bw, th) {
        c.fillRect(x - bw * 0.06, y - th * 0.18, bw * 0.12, th * 0.2);
        for (var z = 0; z < 3; z++) {
          var ty = y - th * (0.1 + 0.27 * z), tw2 = bw * (1 - 0.26 * z);
          c.beginPath();
          c.moveTo(x - tw2 / 2, ty);
          c.lineTo(x + tw2 / 2, ty);
          c.lineTo(x, ty - th * 0.45);
          c.closePath(); c.fill();
        }
      }
    }
    row('#151b28', pinH * 0.84, pinH * 0.52, 58, 901);
    c.fillStyle = '#080b12';
    c.fillRect(0, pinH * 0.82, TW, pinH * 0.18);
    row('#080b12', pinH * 0.93, pinH * 0.72, 73, 991);
  });
  var entP = ent(4), slP = (1 - entP) * H * 0.22;
  al(entP);
  drawTiled(pines, scroll + ms * 0.028, H - pinH + slP);

  // ---- exit: night falls over everything ----
  if (night > 0.003) {
    ctx.fillStyle = '#020308';
    al(night * 0.82);
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function paintCollectionHall(ctx, f) {
  var GA = ctx.globalAlpha;
  var W = f.W, H = f.H, ms = f.ms;
  var A = f.dark ? 1 : 0.55;
  var inE = f.ease(f.clamp01(f.in01));
  var outE = f.ease(f.clamp01(f.out01));
  var lit = inE * outE; // master torchlight envelope: ignites in, dims out
  var u = Math.min(W, H) / 900;
  var PI = Math.PI;
  var floorY = H * 0.80;
  var tY = H * 0.47;                    // sconce mount height
  var TX = [W * 0.085, W * 0.345];      // two torches, left third
  var flameB = tY - 24 * u;             // flame base (top of basket)
  var ax = W * 0.215;                   // alcove centre
  var ahw = W * 0.055;                  // alcove half width
  var aY0 = H * 0.30;                   // arch apex
  var yc = aY0 + ahw;                   // arch spring line / arc centre
  var py = H * 0.635;                   // pedestal top
  var seed = Math.floor(ms / 90);       // flame re-shape tick (~90ms)
  var i, k, l;

  // shared cup silhouette (bowl), used for bake fill and per-frame shimmer clip
  function cupSil(g, ox, oy, s) {
    g.moveTo(ox + 35 * s, oy + 18 * s);
    g.lineTo(ox + 115 * s, oy + 18 * s);
    g.lineTo(ox + 112 * s, oy + 44 * s);
    g.lineTo(ox + 99 * s, oy + 66 * s);
    g.lineTo(ox + 84 * s, oy + 78 * s);
    g.lineTo(ox + 66 * s, oy + 78 * s);
    g.lineTo(ox + 51 * s, oy + 66 * s);
    g.lineTo(ox + 38 * s, oy + 44 * s);
    g.closePath();
  }

  // ============ CACHED LAYERS ============

  // full backdrop: stone wall, arched alcove, pedestal, iron sconces, flagstone floor
  var wall = f.cache('paintCollectionHall:wall:' + (W | 0) + 'x' + (H | 0), Math.ceil(W), Math.ceil(H), function (g) {
    var s = u;
    var r, c, a;
    // mortar base
    g.fillStyle = '#191411';
    g.fillRect(0, 0, W, H);
    // low-poly stone blocks, 3 grey-brown shades + facet triangles
    var shades = ['#2a2622', '#332e28', '#3c362e'];
    var rh = Math.max(30, H * 0.064);
    var cw = Math.max(56, W * 0.058);
    var rows = Math.ceil(floorY / rh);
    var cols = Math.ceil(W / cw) + 1;
    for (r = 0; r <= rows; r++) {
      var off = (r & 1) ? -cw * 0.5 : 0;
      var y = r * rh;
      var bh = Math.min(rh, floorY - y);
      if (bh < 6) continue;
      for (c = 0; c <= cols; c++) {
        var x = c * cw + off;
        if (x > W) break;
        var id = r * 131 + c * 7;
        g.fillStyle = shades[Math.min(2, Math.floor(f.rnd(id) * 3))];
        g.fillRect(x + 1.5, y + 1.5, cw - 3, bh - 3);
        var fr = f.rnd(id + 1);
        g.beginPath();
        if (fr < 0.45) {
          g.moveTo(x + 1.5, y + 1.5);
          g.lineTo(x + cw - 1.5, y + 1.5);
          g.lineTo(x + 1.5, y + bh - 1.5);
          g.fillStyle = 'rgba(96,84,64,0.15)';
        } else if (fr < 0.9) {
          g.moveTo(x + cw - 1.5, y + bh - 1.5);
          g.lineTo(x + cw - 1.5, y + 1.5);
          g.lineTo(x + 1.5, y + bh - 1.5);
          g.fillStyle = 'rgba(10,7,5,0.22)';
        } else {
          g.moveTo(x + 1.5, y + bh - 1.5);
          g.lineTo(x + cw * 0.6, y + 1.5);
          g.lineTo(x + cw - 1.5, y + bh - 1.5);
          g.fillStyle = 'rgba(96,84,64,0.10)';
        }
        g.closePath();
        g.fill();
      }
    }
    // ceiling darkness band
    var tg = g.createLinearGradient(0, 0, 0, H * 0.22);
    tg.addColorStop(0, 'rgba(2,3,8,0.55)');
    tg.addColorStop(1, 'rgba(2,3,8,0)');
    g.fillStyle = tg;
    g.fillRect(0, 0, W, H * 0.22);

    // ---- arched alcove ----
    var N = 8;
    g.beginPath();
    g.moveTo(ax - ahw, floorY);
    g.lineTo(ax - ahw, yc);
    for (a = 1; a <= N; a++) {
      var an = PI + (a / N) * PI;
      g.lineTo(ax + Math.cos(an) * ahw, yc + Math.sin(an) * ahw);
    }
    g.lineTo(ax + ahw, floorY);
    g.closePath();
    g.fillStyle = '#161009';
    g.fill();
    // inner side facets
    g.fillStyle = 'rgba(74,60,40,0.12)';
    g.fillRect(ax - ahw, yc, ahw * 0.28, floorY - yc);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(ax + ahw * 0.6, yc, ahw * 0.4, floorY - yc);
    // voussoir arch stones (alternating shades)
    var vsh = ['#3c362e', '#2f2a24'];
    var r2 = ahw + 15 * s;
    for (a = 0; a < N; a++) {
      var a0 = PI + (a / N) * PI + 0.015;
      var a1 = PI + ((a + 1) / N) * PI - 0.015;
      g.beginPath();
      g.moveTo(ax + Math.cos(a0) * ahw, yc + Math.sin(a0) * ahw);
      g.lineTo(ax + Math.cos(a0) * r2, yc + Math.sin(a0) * r2);
      g.lineTo(ax + Math.cos(a1) * r2, yc + Math.sin(a1) * r2);
      g.lineTo(ax + Math.cos(a1) * ahw, yc + Math.sin(a1) * ahw);
      g.closePath();
      g.fillStyle = vsh[a & 1];
      g.fill();
    }
    // jamb stones down both sides
    for (var sd2 = -1; sd2 <= 1; sd2 += 2) {
      var jx = (sd2 < 0) ? (ax - ahw - 15 * s) : (ax + ahw);
      var jy = yc, ji = 0;
      while (jy < floorY - 3) {
        var jh = Math.min(26 * s, floorY - jy);
        g.fillStyle = vsh[(ji + (sd2 > 0 ? 1 : 0)) & 1];
        g.fillRect(jx, jy + 1.5, 15 * s, jh - 3);
        jy += 26 * s;
        ji++;
      }
    }
    // pedestal: column, base slab, top slab
    var colTop = py + 8 * s, colBot = floorY - 12 * s;
    g.fillStyle = '#2a2521';
    g.fillRect(ax - 24 * s, colTop, 48 * s, colBot - colTop);
    g.fillStyle = '#332e28';
    g.fillRect(ax - 24 * s, colTop, 19 * s, colBot - colTop);
    g.beginPath();
    g.moveTo(ax - 40 * s, floorY);
    g.lineTo(ax + 40 * s, floorY);
    g.lineTo(ax + 33 * s, floorY - 12 * s);
    g.lineTo(ax - 33 * s, floorY - 12 * s);
    g.closePath();
    g.fillStyle = '#38322a';
    g.fill();
    g.beginPath();
    g.moveTo(ax - 34 * s, py);
    g.lineTo(ax + 34 * s, py);
    g.lineTo(ax + 29 * s, py + 10 * s);
    g.lineTo(ax - 29 * s, py + 10 * s);
    g.closePath();
    g.fillStyle = '#3c362e';
    g.fill();
    g.fillStyle = '#4a4238';
    g.fillRect(ax - 34 * s, py - 2 * s, 68 * s, 2.5 * s);

    // ---- iron torch sconces ----
    for (var kk = 0; kk < 2; kk++) {
      var tx = TX[kk];
      g.fillStyle = '#15110c';
      g.fillRect(tx - 5 * s, tY - 4 * s, 10 * s, 34 * s); // back plate
      g.fillStyle = '#2a2318';
      g.fillRect(tx - 5 * s, tY - 4 * s, 3 * s, 34 * s);  // plate edge light
      g.fillStyle = '#1b160f';
      g.fillRect(tx - 3 * s, tY - 24 * s, 6 * s, 22 * s); // stem
      g.beginPath();                                       // basket cup
      g.moveTo(tx - 14 * s, tY - 26 * s);
      g.lineTo(tx + 14 * s, tY - 26 * s);
      g.lineTo(tx + 7 * s, tY - 11 * s);
      g.lineTo(tx - 7 * s, tY - 11 * s);
      g.closePath();
      g.fillStyle = '#221c13';
      g.fill();
      g.beginPath();                                       // basket left facet
      g.moveTo(tx - 14 * s, tY - 26 * s);
      g.lineTo(tx, tY - 26 * s);
      g.lineTo(tx - 3 * s, tY - 11 * s);
      g.lineTo(tx - 7 * s, tY - 11 * s);
      g.closePath();
      g.fillStyle = '#332a1c';
      g.fill();
      g.fillStyle = '#4a3d28';
      g.fillRect(tx - 14 * s, tY - 28 * s, 28 * s, 2.5 * s); // rim
    }

    // ---- floor flagstones ----
    g.fillStyle = '#15100d';
    g.fillRect(0, floorY, W, H - floorY);
    var fsh = ['#211b16', '#282219', '#1d1712'];
    var fh = H - floorY;
    var ry = [0, 0.26, 0.58, 1];
    var idn = 0;
    for (var fr2 = 0; fr2 < 3; fr2++) {
      var y0 = floorY + fh * ry[fr2];
      var y1 = floorY + fh * ry[fr2 + 1];
      var fw = cw * (1.15 + fr2 * 0.55);
      var offx = (fr2 & 1) ? fw * 0.5 : 0;
      for (var x0 = -offx; x0 < W; x0 += fw) {
        idn++;
        g.fillStyle = fsh[Math.min(2, Math.floor(f.rnd(600 + idn) * 3))];
        g.fillRect(x0 + 2, y0 + 2, fw - 4, y1 - y0 - 4);
        if (f.rnd(900 + idn) < 0.5) {
          g.beginPath();
          g.moveTo(x0 + 2, y0 + 2);
          g.lineTo(x0 + fw - 2, y0 + 2);
          g.lineTo(x0 + 2, y1 - 2);
          g.closePath();
          g.fillStyle = 'rgba(88,74,56,0.08)';
          g.fill();
        }
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, floorY - 2, W, 4); // wall/floor junction shadow
  });

  // warm torch light pool (radial, no per-frame gradients)
  var glow = f.cache('paintCollectionHall:glow', 256, 256, function (g) {
    var gr = g.createRadialGradient(128, 128, 6, 128, 128, 127);
    gr.addColorStop(0, 'rgba(255,190,96,0.5)');
    gr.addColorStop(0.32, 'rgba(232,140,50,0.28)');
    gr.addColorStop(0.7, 'rgba(184,68,31,0.10)');
    gr.addColorStop(1, 'rgba(120,50,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  // gold item glow
  var gglow = f.cache('paintCollectionHall:gglow', 256, 256, function (g) {
    var gr = g.createRadialGradient(128, 128, 4, 128, 128, 127);
    gr.addColorStop(0, 'rgba(245,197,24,0.42)');
    gr.addColorStop(0.45, 'rgba(217,180,91,0.16)');
    gr.addColorStop(1, 'rgba(217,180,91,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  // right-half calming gradient strip (stretched at draw time)
  var dimS = f.cache('paintCollectionHall:dim', 256, 8, function (g) {
    var gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(3,2,2,0)');
    gr.addColorStop(0.4, 'rgba(3,2,2,0.32)');
    gr.addColorStop(1, 'rgba(3,2,2,0.5)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 8);
  });

  // golden trophy cup sprite (design space 150x134, baked at u scale)
  var cupW = Math.ceil(150 * u), cupH = Math.ceil(136 * u);
  var cup = f.cache('paintCollectionHall:cup:' + cupW, cupW, cupH, function (g) {
    var s = u;
    // handles (behind bowl)
    g.lineWidth = 5 * s;
    g.strokeStyle = '#8f6b16';
    g.beginPath();
    g.moveTo(112 * s, 26 * s);
    g.lineTo(132 * s, 34 * s);
    g.lineTo(130 * s, 56 * s);
    g.lineTo(96 * s, 68 * s);
    g.stroke();
    g.strokeStyle = '#d9b45b';
    g.beginPath();
    g.moveTo(38 * s, 26 * s);
    g.lineTo(18 * s, 34 * s);
    g.lineTo(20 * s, 56 * s);
    g.lineTo(54 * s, 68 * s);
    g.stroke();
    // bowl: mid fill then left highlight / right shade facets
    g.beginPath();
    cupSil(g, 0, 0, s);
    g.fillStyle = '#c2952b';
    g.fill();
    g.beginPath();
    g.moveTo(35 * s, 18 * s);
    g.lineTo(62 * s, 18 * s);
    g.lineTo(64 * s, 78 * s);
    g.lineTo(51 * s, 66 * s);
    g.lineTo(38 * s, 44 * s);
    g.closePath();
    g.fillStyle = '#f5c518';
    g.fill();
    g.beginPath();
    g.moveTo(93 * s, 18 * s);
    g.lineTo(115 * s, 18 * s);
    g.lineTo(112 * s, 44 * s);
    g.lineTo(99 * s, 66 * s);
    g.lineTo(88 * s, 78 * s);
    g.closePath();
    g.fillStyle = '#8f6b16';
    g.fill();
    // mouth + rim catch light
    g.beginPath();
    g.moveTo(40 * s, 18 * s);
    g.lineTo(110 * s, 18 * s);
    g.lineTo(103 * s, 24 * s);
    g.lineTo(47 * s, 24 * s);
    g.closePath();
    g.fillStyle = '#6b4d12';
    g.fill();
    g.fillStyle = '#f7dc7a';
    g.fillRect(35 * s, 15.5 * s, 80 * s, 3 * s);
    // stem
    g.beginPath();
    g.moveTo(68 * s, 78 * s);
    g.lineTo(82 * s, 78 * s);
    g.lineTo(80 * s, 96 * s);
    g.lineTo(70 * s, 96 * s);
    g.closePath();
    g.fillStyle = '#a87b1e';
    g.fill();
    // knop diamond
    g.beginPath();
    g.moveTo(75 * s, 90 * s);
    g.lineTo(87 * s, 99 * s);
    g.lineTo(75 * s, 108 * s);
    g.lineTo(63 * s, 99 * s);
    g.closePath();
    g.fillStyle = '#d9b45b';
    g.fill();
    g.beginPath();
    g.moveTo(75 * s, 90 * s);
    g.lineTo(75 * s, 108 * s);
    g.lineTo(63 * s, 99 * s);
    g.closePath();
    g.fillStyle = '#f0cd4d';
    g.fill();
    // foot (two facets)
    g.beginPath();
    g.moveTo(63 * s, 106 * s);
    g.lineTo(87 * s, 106 * s);
    g.lineTo(105 * s, 122 * s);
    g.lineTo(45 * s, 122 * s);
    g.closePath();
    g.fillStyle = '#8f6b16';
    g.fill();
    g.beginPath();
    g.moveTo(63 * s, 106 * s);
    g.lineTo(75 * s, 106 * s);
    g.lineTo(75 * s, 122 * s);
    g.lineTo(45 * s, 122 * s);
    g.closePath();
    g.fillStyle = '#d9b45b';
    g.fill();
    // base slab
    g.fillStyle = '#6b4d12';
    g.fillRect(41 * s, 122 * s, 68 * s, 9 * s);
    g.globalAlpha = 0.4;
    g.fillStyle = '#f5c518';
    g.fillRect(41 * s, 122 * s, 68 * s, 2 * s);
    g.globalAlpha = 1;
  });

  // hanging banner sprite (design space 104x198)
  var bnW = Math.ceil(104 * u), bnH = Math.ceil(198 * u);
  var banner = f.cache('paintCollectionHall:banner:' + bnW, bnW, bnH, function (g) {
    var s = u;
    // rod + end caps
    g.fillStyle = '#3a2c1c';
    g.fillRect(2 * s, 2 * s, 100 * s, 6 * s);
    g.fillStyle = '#241f16';
    g.fillRect(2 * s, 6 * s, 100 * s, 2 * s);
    g.fillStyle = '#4a3a26';
    g.fillRect(0, 0, 6 * s, 10 * s);
    g.fillRect(98 * s, 0, 6 * s, 10 * s);
    // cloth with swallowtail bottom
    g.beginPath();
    g.moveTo(10 * s, 8 * s);
    g.lineTo(94 * s, 8 * s);
    g.lineTo(92 * s, 150 * s);
    g.lineTo(90 * s, 192 * s);
    g.lineTo(52 * s, 160 * s);
    g.lineTo(14 * s, 192 * s);
    g.lineTo(12 * s, 150 * s);
    g.closePath();
    g.fillStyle = '#242e19';
    g.fill();
    // right shade facet
    g.beginPath();
    g.moveTo(60 * s, 8 * s);
    g.lineTo(94 * s, 8 * s);
    g.lineTo(92 * s, 150 * s);
    g.lineTo(90 * s, 192 * s);
    g.lineTo(52 * s, 160 * s);
    g.lineTo(56 * s, 80 * s);
    g.closePath();
    g.fillStyle = 'rgba(8,12,5,0.30)';
    g.fill();
    // left sheen facet
    g.beginPath();
    g.moveTo(10 * s, 8 * s);
    g.lineTo(30 * s, 8 * s);
    g.lineTo(24 * s, 120 * s);
    g.lineTo(12 * s, 150 * s);
    g.closePath();
    g.fillStyle = 'rgba(116,136,74,0.12)';
    g.fill();
    // gold trim border
    g.strokeStyle = '#d9b45b';
    g.globalAlpha = 0.7;
    g.lineWidth = 2.5 * s;
    g.beginPath();
    g.moveTo(13 * s, 12 * s);
    g.lineTo(91 * s, 12 * s);
    g.lineTo(89 * s, 148 * s);
    g.lineTo(87 * s, 185 * s);
    g.lineTo(52 * s, 156 * s);
    g.lineTo(17 * s, 185 * s);
    g.lineTo(15 * s, 148 * s);
    g.closePath();
    g.stroke();
    g.globalAlpha = 1;
    // tassels at the three points
    function dia(x, y) {
      g.beginPath();
      g.moveTo(x * s, (y - 5) * s);
      g.lineTo((x + 4) * s, y * s);
      g.lineTo(x * s, (y + 5) * s);
      g.lineTo((x - 4) * s, y * s);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#d9b45b';
    dia(14, 190);
    dia(90, 190);
    dia(52, 162);
    // embroidered sword glyph (point down), linework
    g.strokeStyle = '#e5c76b';
    g.lineWidth = 2.4 * s;
    g.globalAlpha = 0.9;
    g.beginPath(); // pommel diamond
    g.moveTo(52 * s, 34 * s);
    g.lineTo(58 * s, 40 * s);
    g.lineTo(52 * s, 46 * s);
    g.lineTo(46 * s, 40 * s);
    g.closePath();
    g.stroke();
    g.beginPath(); // grip
    g.moveTo(52 * s, 46 * s);
    g.lineTo(52 * s, 60 * s);
    g.stroke();
    g.beginPath(); // crossguard
    g.moveTo(35 * s, 62 * s);
    g.lineTo(69 * s, 62 * s);
    g.stroke();
    g.beginPath(); // blade
    g.moveTo(47 * s, 66 * s);
    g.lineTo(57 * s, 66 * s);
    g.lineTo(52 * s, 136 * s);
    g.closePath();
    g.stroke();
    g.globalAlpha = 0.5;
    g.beginPath(); // ridge
    g.moveTo(52 * s, 68 * s);
    g.lineTo(52 * s, 126 * s);
    g.stroke();
    g.globalAlpha = 1;
  });

  // ============ PER-FRAME DRAW ============
  ctx.save();

  // 1) backdrop
  ctx.globalAlpha = GA * A;
  ctx.drawImage(wall, 0, 0, W, H);

  // 2) torch light pools (wall + floor), pulsing + 90ms flicker
  var Rw = W * 0.115;
  for (k = 0; k < 2; k++) {
    var tx = TX[k];
    var pulse = 0.8 + 0.13 * Math.sin(ms * 0.0034 + k * 2.6) + 0.14 * (f.rnd(seed * 13 + k * 5 + 3) - 0.5);
    if (pulse > 1) pulse = 1;
    var cyv = flameB - 26 * u;
    ctx.globalAlpha = GA * A * lit * 0.8 * pulse;
    ctx.drawImage(glow, tx - Rw, cyv - Rw, Rw * 2, Rw * 2);
    ctx.globalAlpha = GA * A * lit * 0.55 * pulse;
    ctx.drawImage(glow, tx - Rw * 0.45, cyv - Rw * 0.45, Rw * 0.9, Rw * 0.9);
    ctx.globalAlpha = GA * A * lit * 0.4 * pulse;
    ctx.drawImage(glow, tx - W * 0.09, floorY - (H - floorY) * 0.15, W * 0.18, (H - floorY) * 1.2);
  }

  // 3) alcove gold glow (behind trophy) + floor spill
  ctx.globalAlpha = GA * A * lit * (0.5 + 0.08 * Math.sin(ms * 0.0021));
  ctx.drawImage(gglow, ax - ahw * 1.3, H * 0.40, ahw * 2.6, H * 0.30);
  ctx.globalAlpha = GA * A * lit * 0.25;
  ctx.drawImage(gglow, ax - ahw, floorY - (H - floorY) * 0.2, ahw * 2, (H - floorY) * 0.9);

  // 4) trophy cup + shimmer sweep
  var cupX = ax - 75 * u, cupY = py - 129 * u;
  ctx.globalAlpha = GA * A * (0.7 + 0.3 * lit);
  ctx.drawImage(cup, cupX, cupY, cupW, cupH);
  var sp = (ms % 2900) / 2900;
  if (sp < 0.38 && lit > 0.04) {
    var k2 = sp / 0.38;
    var sx = cupX + (24 + k2 * 104) * u;
    ctx.save();
    ctx.beginPath();
    cupSil(ctx, cupX, cupY, u);
    ctx.clip();
    ctx.globalAlpha = GA * A * lit * Math.sin(PI * k2) * 0.5;
    ctx.fillStyle = '#fbe9a6';
    ctx.beginPath();
    ctx.moveTo(sx, cupY);
    ctx.lineTo(sx + 10 * u, cupY);
    ctx.lineTo(sx - 12 * u, cupY + 90 * u);
    ctx.lineTo(sx - 22 * u, cupY + 90 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 5) hanging banner with subtle sway
  var sway = Math.sin(ms * 0.00113) * 0.021 + Math.sin(ms * 0.00071 + 1.7) * 0.011;
  ctx.save();
  ctx.globalAlpha = GA * A;
  ctx.translate(ax, 0);
  ctx.rotate(sway);
  ctx.drawImage(banner, -bnW / 2, -2, bnW, bnH);
  ctx.restore();

  // 6) unlit ambience (room darkens when torches are out)
  if (lit < 0.995) {
    ctx.globalAlpha = GA * A * (1 - lit) * 0.55;
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, W, H);
  }

  // 7) live flames (3 flat polys each, re-shaped every ~90ms) + sparks
  var fs = inE * (0.35 + 0.65 * outE); // ignite in, shrink out
  if (fs > 0.02) {
    var cols = ['#b8441f', '#d96f26', '#e8a33d'];
    for (k = 0; k < 2; k++) {
      var tx2 = TX[k];
      // ember bed in basket
      ctx.globalAlpha = GA * A * lit * (0.5 + 0.4 * f.rnd(seed * 3 + k));
      ctx.fillStyle = '#e8a33d';
      ctx.fillRect(tx2 - 9 * u, flameB - 3 * u, 18 * u, 4 * u);
      for (l = 0; l < 3; l++) {
        var sc = 1 - l * 0.3;
        var sd = seed * 7 + k * 101 + l * 13;
        var hh = 62 * u * (0.8 + f.rnd(sd + 1) * 0.35) * fs * (0.62 + 0.38 * sc);
        var bw = 15 * u * sc * (0.85 + f.rnd(sd + 2) * 0.3);
        var tip = (f.rnd(sd + 3) - 0.5) * 13 * u;
        var m1 = (f.rnd(sd + 4) - 0.5) * 7 * u;
        var m2 = (f.rnd(sd + 5) - 0.5) * 7 * u;
        ctx.globalAlpha = GA * A * 0.92 * (0.35 + 0.65 * outE);
        ctx.fillStyle = cols[l];
        ctx.beginPath();
        ctx.moveTo(tx2 - bw, flameB);
        ctx.lineTo(tx2 - bw * 0.7 + m1, flameB - hh * 0.4);
        ctx.lineTo(tx2 - bw * 0.32 + m2, flameB - hh * 0.74);
        ctx.lineTo(tx2 + tip, flameB - hh);
        ctx.lineTo(tx2 + bw * 0.4 - m2, flameB - hh * 0.68);
        ctx.lineTo(tx2 + bw * 0.76 - m1, flameB - hh * 0.36);
        ctx.lineTo(tx2 + bw, flameB);
        ctx.closePath();
        ctx.fill();
      }
      // rising spark motes
      for (i = 0; i < 7; i++) {
        var cyc = 1300 + f.rnd(k * 31 + i + 40) * 900;
        var ph = ((ms + f.rnd(k * 57 + i + 80) * 5000) % cyc) / cyc;
        var syy = flameB - 20 * u - ph * H * 0.15;
        var sxx = tx2 + (f.rnd(k * 7 + i + 120) - 0.5) * 14 * u + Math.sin(ms * 0.003 + i * 2.1 + k * 3) * 7 * u * ph;
        var ssz = (1.4 + f.rnd(i + k * 11 + 160) * 1.8) * u * (1 - ph * 0.55);
        ctx.globalAlpha = GA * A * lit * (1 - ph) * 0.85;
        ctx.fillStyle = (i % 3 === 0) ? '#f5c518' : ((i % 3 === 1) ? '#e8a33d' : '#d96f26');
        ctx.fillRect(sxx - ssz * 0.5, syy - ssz * 0.5, ssz, ssz);
      }
    }
  }

  // 8) keep the right half calm and dim for the DOM collection grid
  ctx.globalAlpha = GA * A * 0.9;
  ctx.drawImage(dimS, W * 0.42, 0, W * 0.58, H);

  ctx.restore();
}

function paintCampfireFinale(ctx, f) {
  var GA = ctx.globalAlpha;
  var W = f.W, H = f.H, ms = f.ms;
  var A = GA * (f.dark ? 1 : 0.55);
  if (A < 0.003) return;

  var S = Math.max(0.65, Math.min(1.5, Math.min(W, H) / 900));
  var hy = H * 0.60;                 // horizon
  var fx = W * 0.30, fy = H * 0.78;  // fire base (centre-left; right half stays calm)
  var R = Math.min(W, H) * 0.5;
  var inE = f.ease(f.in01);
  var outE = f.ease(f.out01);
  var lvl = inE * (1 - 0.55 * outE);              // fire settles low on exit
  var flameLvl = Math.pow(Math.max(0, lvl), 1.35); // flames grow from embers

  // ---- 80ms re-jitter clock, smoothed between steps ----
  var s0 = Math.floor(ms / 80);
  var fr = (ms - s0 * 80) / 80; fr = fr * fr * (3 - 2 * fr);
  function jr(k) {
    var a = f.rnd(k + s0 * 57), b = f.rnd(k + s0 * 57 + 57);
    return a + (b - a) * fr;
  }
  var flick = 0.80 + 0.20 * jr(9001);
  var fh = 150 * S * flameLvl * (0.88 + 0.12 * flick);

  ctx.save();

  // ================= 1) SKY / TREELINES / GROUND (cached) =================
  var base = f.cache('paintCampfireFinale:base:' + W + 'x' + H, W, H, function (g) {
    function ridge(baseY, step, hMin, hMax, color, seedO) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, baseY + 40); g.lineTo(0, baseY);
      var x = 0, i = 0;
      while (x < W && i < 80) {
        var w2 = step * (0.7 + 0.6 * f.rnd(seedO + i * 3));
        var hh = hMin + (hMax - hMin) * f.rnd(seedO + i * 3 + 1);
        g.lineTo(x + w2 * 0.5, baseY - hh);
        g.lineTo(x + w2 * 0.72, baseY - hh * 0.45);
        g.lineTo(x + w2, baseY - hh * 0.08);
        x += w2; i++;
      }
      g.lineTo(W, baseY); g.lineTo(W, baseY + 40);
      g.closePath(); g.fill();
    }
    var sk = g.createLinearGradient(0, 0, 0, hy);
    sk.addColorStop(0, '#020308'); sk.addColorStop(0.6, '#04060a'); sk.addColorStop(1, '#0a0b08');
    g.fillStyle = sk; g.fillRect(0, 0, W, hy + 2);
    // handful of faint pinpricks only
    g.fillStyle = '#cfd4c8';
    for (var i = 0; i < 11; i++) {
      g.globalAlpha = 0.06 + 0.14 * f.rnd(i * 5 + 3);
      g.fillRect(f.rnd(i * 5 + 1) * W, f.rnd(i * 5 + 2) * hy * 0.75, 1.4, 1.4);
    }
    g.globalAlpha = 1;
    ridge(hy + 2, W / 22, 14 * S, 42 * S, '#0a0e09', 200);      // far treeline
    ridge(hy + 8 * S, W / 13, 26 * S, 68 * S, '#060905', 320);  // near treeline
    var gd = g.createLinearGradient(0, hy, 0, H);
    gd.addColorStop(0, '#070806'); gd.addColorStop(1, '#020202');
    g.fillStyle = gd; g.fillRect(0, hy, W, H - hy);
  });
  ctx.globalAlpha = A;
  ctx.drawImage(base, 0, 0);

  // ================= distant crystal gate callback (cached, pulsing) =================
  var gate = f.cache('paintCampfireFinale:gate', 140, 140, function (g) {
    function shard(x, y, w, h) {
      g.fillStyle = '#0d181b';
      g.beginPath();
      g.moveTo(x - w * 0.5, y); g.lineTo(x - w * 0.36, y - h * 0.7); g.lineTo(x, y - h);
      g.lineTo(x + w * 0.4, y - h * 0.64); g.lineTo(x + w * 0.5, y);
      g.closePath(); g.fill();
      g.fillStyle = '#2b4a50';
      g.beginPath();
      g.moveTo(x, y - h); g.lineTo(x + w * 0.4, y - h * 0.64);
      g.lineTo(x + w * 0.12, y - h * 0.30); g.lineTo(x - w * 0.04, y - h * 0.62);
      g.closePath(); g.fill();
      g.strokeStyle = '#9adbe8'; g.globalAlpha = 0.55; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - w * 0.36, y - h * 0.7); g.lineTo(x, y - h); g.lineTo(x + w * 0.4, y - h * 0.64);
      g.stroke();
      g.globalAlpha = 1;
    }
    var cx = 70, cy = 112;
    var glows = [[62, 0.05], [40, 0.09], [22, 0.14], [11, 0.20]];
    g.fillStyle = '#9adbe8';
    for (var i = 0; i < 4; i++) {
      g.globalAlpha = glows[i][1];
      g.beginPath(); g.arc(cx, cy - 24, glows[i][0], 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    shard(cx - 8, cy, 14, 42);
    shard(cx + 9, cy, 11, 29);
  });
  ctx.globalAlpha = A * inE * (0.6 + 0.2 * Math.sin(ms * 0.0006));
  ctx.drawImage(gate, W * 0.75 - 70, hy - 112);

  // ================= 3) warm-lit low-poly grass facets (cached, masked) =================
  var gw = Math.max(8, Math.round(R * 2.1)), gh = Math.max(8, Math.round(R * 1.0));
  var grass = f.cache('paintCampfireFinale:grass:' + gw + 'x' + gh, gw, gh, function (g) {
    var cx = gw * 0.5, cy = gh * 0.40;
    var y0 = Math.max(0, (hy - (fy - cy)) + 2);
    var cols = 13, rows = 6;
    var cw = gw / cols, chh = (gh - y0) / rows;
    var pal = ['#4a5d33', '#5d7340', '#5a4632', '#3e3226', '#4a3a28', '#74884a', '#3a4a28'];
    function px(cc, rr) { return cc * cw + (f.rnd(cc * 7 + rr * 13 + 11) - 0.5) * cw * 0.6; }
    function py(cc, rr) { return y0 + rr * chh + (f.rnd(cc * 7 + rr * 13 + 12) - 0.5) * chh * 0.6; }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var k = r * cols + c;
        var x00 = px(c, r), y00 = py(c, r), x10 = px(c + 1, r), y10 = py(c + 1, r);
        var x01 = px(c, r + 1), y01 = py(c, r + 1), x11 = px(c + 1, r + 1), y11 = py(c + 1, r + 1);
        g.fillStyle = pal[(k * 5 + ((f.rnd(k * 3 + 60) * 7) | 0)) % pal.length];
        g.beginPath(); g.moveTo(x00, y00); g.lineTo(x10, y10); g.lineTo(x01, y01); g.closePath(); g.fill();
        g.fillStyle = pal[(k * 3 + 1 + ((f.rnd(k * 3 + 61) * 7) | 0)) % pal.length];
        g.beginPath(); g.moveTo(x10, y10); g.lineTo(x11, y11); g.lineTo(x01, y01); g.closePath(); g.fill();
      }
    }
    g.save();
    g.translate(cx, cy); g.scale(1, 0.55);
    var wt = g.createRadialGradient(0, 0, 10, 0, 0, gw * 0.5);
    wt.addColorStop(0, 'rgba(240,170,80,0.34)');
    wt.addColorStop(0.5, 'rgba(200,110,40,0.14)');
    wt.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = wt; g.beginPath(); g.arc(0, 0, gw * 0.5, 0, 6.2832); g.fill();
    var mk = g.createRadialGradient(0, 0, 10, 0, 0, gw * 0.5);
    mk.addColorStop(0, 'rgba(0,0,0,0.9)');
    mk.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    mk.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = mk; g.beginPath(); g.arc(0, 0, gw * 0.5, 0, 6.2832); g.fill();
    g.restore();
  });
  ctx.globalAlpha = A * Math.min(1, lvl * 1.3) * (0.78 + 0.22 * flick);
  ctx.drawImage(grass, fx - gw * 0.5, fy - gh * 0.40);

  // ================= warm light pool + flame aura (cached gradient, flickers) =================
  var pool = f.cache('paintCampfireFinale:pool', 512, 512, function (g) {
    var rg = g.createRadialGradient(256, 256, 8, 256, 256, 252);
    rg.addColorStop(0, 'rgba(246,178,86,0.40)');
    rg.addColorStop(0.28, 'rgba(230,138,48,0.24)');
    rg.addColorStop(0.6, 'rgba(150,72,26,0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
  });
  if (lvl > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    var ps = R * (0.86 + 0.14 * flick) * (0.55 + 0.45 * lvl);
    ctx.globalAlpha = A * (0.7 + 0.3 * flick) * Math.min(1, lvl * 1.5);
    ctx.drawImage(pool, fx - ps, fy - ps * 0.55, ps * 2, ps * 1.1);
    var gr = Math.max(30 * S, fh * 1.9);
    ctx.globalAlpha = A * 0.55 * flick * Math.min(1, lvl * 1.5);
    ctx.drawImage(pool, fx - gr, fy - fh * 0.5 - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  var pa = A * Math.min(1, inE * 1.6);

  // ================= 4) signpost (cached) =================
  var sw = Math.max(8, Math.round(150 * S)), sh = Math.max(8, Math.round(150 * S));
  var sign = f.cache('paintCampfireFinale:sign:' + sw, sw, sh, function (g) {
    var u = S, px0 = sw * 0.5;
    function plank(cyP, dir, tilt) {
      g.save();
      g.translate(px0, cyP); g.rotate(tilt);
      var L = 58 * u;
      g.fillStyle = '#3e3226';
      g.beginPath();
      g.moveTo(dir * (L + 14 * u), 0);
      g.lineTo(dir * L, -8 * u);
      g.lineTo(-dir * 14 * u, -7 * u);
      g.lineTo(-dir * 14 * u, 9 * u);
      g.lineTo(dir * L, 9 * u);
      g.closePath(); g.fill();
      g.fillStyle = '#5a4632';
      g.beginPath();
      g.moveTo(dir * L, -8 * u); g.lineTo(-dir * 14 * u, -7 * u);
      g.lineTo(-dir * 14 * u, -3.5 * u); g.lineTo(dir * L, -4.5 * u);
      g.closePath(); g.fill();
      g.fillStyle = '#332a22';
      g.beginPath();
      g.moveTo(dir * (L + 14 * u), 0); g.lineTo(dir * L, -8 * u); g.lineTo(dir * L, 9 * u);
      g.closePath(); g.fill();
      g.fillStyle = '#120e0a';
      g.fillRect(-1.5 * u, -1.5 * u, 3 * u, 3 * u);
      g.restore();
    }
    g.fillStyle = '#1a1410';
    g.fillRect(px0 - 4.5 * u, 8 * u, 4.5 * u, sh - 8 * u);
    g.fillStyle = '#2b221a';
    g.fillRect(px0, 8 * u, 4.5 * u, sh - 8 * u);
    g.fillStyle = '#3a2e22';
    g.beginPath(); g.moveTo(px0 - 6 * u, 8 * u); g.lineTo(px0, 3 * u); g.lineTo(px0 + 6 * u, 8 * u); g.closePath(); g.fill();
    plank(26 * u, -1, 0.06);  // points left
    plank(56 * u, 1, -0.05);  // points right
  });
  var signX = Math.max(sw * 0.55, fx - 300 * S);
  var signBaseY = fy + 4 * S;
  ctx.globalAlpha = pa;
  ctx.drawImage(sign, signX - sw / 2, signBaseY - sh);

  // ================= 4) log bench (cached) =================
  var bw = Math.max(8, Math.round(150 * S)), bh = Math.max(8, Math.round(78 * S));
  var bench = f.cache('paintCampfireFinale:bench:' + bw, bw, bh, function (g) {
    var u = S;
    g.fillStyle = '#191410';
    g.fillRect(24 * u, 50 * u, 10 * u, 26 * u);
    g.fillRect(112 * u, 44 * u, 10 * u, 26 * u);
    g.fillStyle = '#4a3a28';
    g.beginPath(); g.moveTo(6 * u, 30 * u); g.lineTo(144 * u, 23 * u); g.lineTo(144 * u, 34 * u); g.lineTo(6 * u, 43 * u); g.closePath(); g.fill();
    g.fillStyle = '#241f1a';
    g.beginPath(); g.moveTo(6 * u, 43 * u); g.lineTo(144 * u, 34 * u); g.lineTo(144 * u, 47 * u); g.lineTo(6 * u, 57 * u); g.closePath(); g.fill();
    g.fillStyle = '#5a4632';
    g.beginPath(); g.moveTo(6 * u, 30 * u); g.lineTo(1 * u, 44 * u); g.lineTo(6 * u, 57 * u); g.closePath(); g.fill();
    g.fillStyle = '#3e3226';
    g.beginPath(); g.moveTo(5 * u, 36 * u); g.lineTo(3 * u, 44 * u); g.lineTo(5 * u, 51 * u); g.closePath(); g.fill();
  });
  var benchX = Math.min(fx + 150 * S, W * 0.5 - (bw + 12 * S));
  var benchY = fy + 30 * S;
  ctx.drawImage(bench, benchX, benchY - bh);

  // ================= 2) stone ring + crossed logs (cached) =================
  var fbw = Math.max(8, Math.round(180 * S)), fbh = Math.max(8, Math.round(96 * S));
  var fbase = f.cache('paintCampfireFinale:fbase:' + fbw, fbw, fbh, function (g) {
    var u = S, cx = fbw / 2, cy = fbh / 2;
    function stone(k, front) {
      var a2 = (k / 9) * 6.2832 + 0.35;
      var sx = cx + Math.cos(a2) * 60 * u;
      var sy = cy + Math.sin(a2) * 22 * u;
      var rs = (5 + 5 * f.rnd(k * 7 + 40)) * u;
      var v, va, vr;
      g.fillStyle = front ? '#38302a' : '#221d18';
      g.beginPath();
      for (v = 0; v < 5; v++) {
        va = v / 5 * 6.2832 + f.rnd(k * 7 + 41 + v) * 0.8;
        vr = rs * (0.7 + 0.5 * f.rnd(k * 7 + 46 + v));
        if (v) g.lineTo(sx + Math.cos(va) * vr, sy + Math.sin(va) * vr * 0.72);
        else g.moveTo(sx + Math.cos(va) * vr, sy + Math.sin(va) * vr * 0.72);
      }
      g.closePath(); g.fill();
      g.fillStyle = front ? '#57493a' : '#2c2620';
      g.beginPath();
      for (v = 0; v < 5; v++) {
        va = v / 5 * 6.2832 + f.rnd(k * 7 + 41 + v) * 0.8;
        vr = rs * 0.55 * (0.7 + 0.5 * f.rnd(k * 7 + 46 + v));
        if (v) g.lineTo(sx + Math.cos(va) * vr, sy - rs * 0.3 + Math.sin(va) * vr * 0.6);
        else g.moveTo(sx + Math.cos(va) * vr, sy - rs * 0.3 + Math.sin(va) * vr * 0.6);
      }
      g.closePath(); g.fill();
      if (front) {
        var dirx = cx - sx, diry = cy - sy;
        var dl = Math.sqrt(dirx * dirx + diry * diry) || 1;
        dirx /= dl; diry /= dl;
        g.strokeStyle = '#8a5a2e'; g.lineWidth = 1.6 * u; g.globalAlpha = 0.8;
        g.beginPath();
        g.moveTo(sx + dirx * rs * 0.55 + diry * rs * 0.45, sy + diry * rs * 0.40 - dirx * rs * 0.30);
        g.lineTo(sx + dirx * rs * 0.55 - diry * rs * 0.45, sy + diry * rs * 0.40 + dirx * rs * 0.30);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    function logQ(x1, y1, x2, y2) {
      var ax = cx + x1 * u, ay = cy + y1 * u, bx2 = cx + x2 * u, by2 = cy + y2 * u;
      var dx = bx2 - ax, dy = by2 - ay, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / dl * 4.5 * u, ny = dx / dl * 4.5 * u;
      if (ny > 0) { nx = -nx; ny = -ny; }
      g.fillStyle = '#241f1a';
      g.beginPath();
      g.moveTo(ax + nx, ay + ny); g.lineTo(bx2 + nx, by2 + ny);
      g.lineTo(bx2 - nx, by2 - ny); g.lineTo(ax - nx, ay - ny);
      g.closePath(); g.fill();
      g.fillStyle = '#3a2e22';
      g.beginPath();
      g.moveTo(ax + nx, ay + ny); g.lineTo(bx2 + nx, by2 + ny);
      g.lineTo(bx2 + nx * 0.2, by2 + ny * 0.2); g.lineTo(ax + nx * 0.2, ay + ny * 0.2);
      g.closePath(); g.fill();
      g.fillStyle = '#100d0a';
      g.beginPath(); g.arc(ax, ay, 4.2 * u, 0, 6.2832); g.fill();
      g.fillStyle = '#b8441f'; g.globalAlpha = 0.5;
      g.beginPath(); g.arc(bx2, by2, 3.2 * u, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }
    var k;
    for (k = 0; k < 9; k++) { if (Math.sin((k / 9) * 6.2832 + 0.35) < 0) stone(k, false); }
    logQ(-40, 10, 34, -16);
    logQ(40, 12, -30, -14);
    for (k = 0; k < 9; k++) { if (Math.sin((k / 9) * 6.2832 + 0.35) >= 0) stone(k, true); }
  });
  ctx.drawImage(fbase, fx - fbw / 2, fy - fbh / 2);

  // per-frame warm-lit edges on props, flickering with the fire
  var edgeA = A * 0.35 * flick * Math.min(1, lvl * 1.6);
  if (edgeA > 0.01) {
    ctx.globalAlpha = edgeA;
    ctx.strokeStyle = '#e8a33d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(signX + 4.5 * S, signBaseY - 120 * S);
    ctx.lineTo(signX + 4.5 * S, signBaseY - 8 * S);
    ctx.moveTo(signX + 70 * S, signBaseY - sh + 50 * S);
    ctx.lineTo(signX + 64 * S, signBaseY - sh + 62 * S);
    ctx.moveTo(benchX + 6 * S, benchY - bh + 43 * S);
    ctx.lineTo(benchX + 144 * S, benchY - bh + 34 * S);
    ctx.stroke();
  }

  // ================= ember bed (glows first, before flame catches) =================
  ctx.globalCompositeOperation = 'lighter';
  var emA = Math.min(1, inE * 2.5) * (1 - 0.4 * outE);
  for (var ei = 0; ei < 7; ei++) {
    var pu = 0.5 + 0.5 * Math.sin(ms * 0.0032 + ei * 1.9);
    ctx.globalAlpha = A * emA * (0.22 + 0.55 * pu);
    ctx.fillStyle = ei % 2 ? '#e8a33d' : '#d96f26';
    var ex = fx + (f.rnd(ei * 17 + 300) - 0.5) * 64 * S;
    var ey = fy - 1 - f.rnd(ei * 17 + 301) * 7 * S;
    var er = (1.4 + 1.6 * f.rnd(ei * 17 + 302)) * S;
    ctx.fillRect(ex - er * 0.5, ey - er * 0.5, er, er);
  }
  ctx.globalCompositeOperation = 'source-over';

  // ================= 2) the living flame: 5 flat polygons, 80ms jitter =================
  if (fh > 3) {
    var cols5 = ['#7f1d10', '#b8441f', '#d96f26', '#e8a33d', '#f5c518'];
    var qs = [0.3, 0.58, 0.82];
    ctx.globalAlpha = A * 0.96;
    for (var li = 0; li < 5; li++) {
      var sb = li * 101;
      var wq = 60 * S * (1 - li * 0.155) * (0.9 + 0.2 * jr(sb + 50));
      var hq = fh * (1 - li * 0.15) * (0.88 + 0.24 * jr(sb + 51));
      var cxx = fx + (jr(sb + 52) - 0.5) * 6 * S * li;
      var byy = fy - 4 * S - li * 2.2 * S;
      ctx.fillStyle = cols5[li];
      ctx.beginPath();
      ctx.moveTo(cxx - wq * 0.5, byy);
      var qi, q, hw;
      for (qi = 0; qi < 3; qi++) {
        q = qs[qi];
        hw = wq * 0.5 * (1 - Math.pow(q, 1.5));
        ctx.lineTo(cxx - hw + (jr(sb + qi * 2) - 0.5) * wq * 0.45 * (0.25 + q), byy - hq * q);
      }
      ctx.lineTo(cxx + (jr(sb + 7) - 0.5) * wq * 0.5, byy - hq * (0.9 + 0.2 * jr(sb + 8)));
      for (qi = 2; qi >= 0; qi--) {
        q = qs[qi];
        hw = wq * 0.5 * (1 - Math.pow(q, 1.5));
        ctx.lineTo(cxx + hw + (jr(sb + 20 + qi * 2) - 0.5) * wq * 0.45 * (0.25 + q), byy - hq * q);
      }
      ctx.lineTo(cxx + wq * 0.5, byy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ================= sparks: ~3/s, ~2s life, gold quads with sway =================
  if (flameLvl > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = f.gold;
    var P = 2100;
    for (var si = 0; si < 7; si++) {
      var tt = ms + si * 300;
      var cyc = Math.floor(tt / P);
      var ag = (tt - cyc * P) / P;
      var seed = si * 13 + cyc * 29;
      var spx = fx + (f.rnd(seed + 700) - 0.5) * 26 * S + Math.sin(ms * 0.004 + si * 1.3 + cyc) * 8 * S * ag;
      var rise = (80 + f.rnd(seed + 701) * 130) * S;
      var spy = fy - 12 * S - fh * 0.55 - ag * rise;
      ctx.globalAlpha = A * flameLvl * 0.9 * (ag < 0.12 ? ag / 0.12 : (1 - ag) / 0.88);
      var sz = (1.5 + 1.5 * f.rnd(seed + 702)) * S;
      ctx.beginPath();
      ctx.moveTo(spx, spy - sz); ctx.lineTo(spx + sz, spy);
      ctx.lineTo(spx, spy + sz); ctx.lineTo(spx - sz, spy);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ================= smoke column, drifting up and right =================
  if (flameLvl > 0.08) {
    ctx.fillStyle = '#6e685e';
    var Ps = 5200;
    for (var mi = 0; mi < 6; mi++) {
      var t2 = ms + mi * 866;
      var a2 = (t2 % Ps) / Ps;
      var rr2 = (7 + 30 * a2) * S;
      var smx = fx + 8 * S + a2 * a2 * 130 * S + Math.sin(ms * 0.0012 + mi * 1.8) * 10 * S * a2;
      var smy = fy - fh - 14 * S - a2 * H * 0.34;
      ctx.globalAlpha = A * 0.10 * (1 - a2) * Math.min(1, a2 * 8) * flameLvl;
      ctx.beginPath(); ctx.arc(smx, smy, rr2, 0, 6.2832); ctx.fill();
    }
  }

  // ================= 5) fireflies at the darkness edge (left arc only) =================
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = f.gold;
  for (var ki = 0; ki < 7; ki++) {
    var ang = 2.0 + f.rnd(ki * 23 + 900) * 2.4;
    var rrf = R * (0.8 + 0.35 * f.rnd(ki * 23 + 901));
    var pxf = fx + Math.cos(ang) * rrf + Math.sin(ms * 0.00037 + ki * 2.1) * 36 * S;
    var pyf = fy + Math.sin(ang) * rrf * 0.42 + Math.sin(ms * 0.00047 + ki * 1.4) * 24 * S;
    pxf = Math.max(W * 0.03, Math.min(W * 0.52, pxf));
    pyf = Math.max(H * 0.42, Math.min(H * 0.92, pyf));
    var bl = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ms * 0.0011 + ki * 2.6));
    ctx.globalAlpha = A * inE * bl * 0.16;
    ctx.beginPath(); ctx.arc(pxf, pyf, 4.5 * S, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = A * inE * bl * 0.85;
    ctx.beginPath(); ctx.arc(pxf, pyf, 1.5 * S, 0, 6.2832); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

function paintWealthHalo(ctx, f) {
  var GA = ctx.globalAlpha;
  var AM = GA * (f.dark ? 1 : 0.55);
  var W = f.W, H = f.H, ms = f.ms;
  var TAU = Math.PI * 2;
  var cx = W * 0.62, cy = H * 0.5;
  var R = Math.min(W, H) * 0.30;
  var ringW = R * 0.09;
  var mapR = R - ringW * 0.5 + 2;
  var ei = f.ease(f.clamp01(f.in01));
  var eo = f.ease(f.clamp01(f.out01));
  var live = ei * (1 - eo);
  var i, k;
  if (f.in01 <= 0.001) { ctx.globalAlpha = GA; return; }

  // ambient world behind the instrument -- the scene must never sit on a void
  var bdk = f.cache('paintWealthHalo:bd:' + W + 'x' + H, W, H, function (c) {
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04050a');
    g.addColorStop(0.62, '#070a10');
    g.addColorStop(1, '#0b0d10');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var wg = c.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 2.4);
    wg.addColorStop(0, f.hexA('#d9b45b', 0.05));
    wg.addColorStop(0.5, f.hexA('#d9b45b', 0.015));
    wg.addColorStop(1, f.hexA('#d9b45b', 0));
    c.fillStyle = wg; c.fillRect(0, 0, W, H);
    for (var q = 0; q < 26; q++) {
      c.globalAlpha = 0.08 + f.rnd(600 + q) * 0.22;
      c.fillStyle = q % 6 === 0 ? '#9cc7ff' : '#e8e4d8';
      c.fillRect(f.rnd(610 + q) * W, f.rnd(640 + q) * H * 0.5, 1, 1);
    }
    c.globalAlpha = 1;
    var hills = [['#0d1218', 0.86, 0.055], ['#090d13', 0.92, 0.075]];
    for (var hql = 0; hql < 2; hql++) {
      var col = hills[hql][0], base = H * hills[hql][1], amp2 = H * hills[hql][2];
      c.fillStyle = col;
      c.beginPath(); c.moveTo(0, H);
      c.lineTo(0, base);
      for (var hx = 0; hx <= 12; hx++) {
        c.lineTo(W * hx / 12, base - f.rnd(660 + hql * 40 + hx) * amp2);
      }
      c.lineTo(W, H); c.closePath(); c.fill();
    }
  });
  A(ei); ctx.drawImage(bdk, 0, 0, W, H);
  for (i = 0; i < 14; i++) {
    var mtx = (f.rnd(700 + i) * W + ms * (0.004 + f.rnd(710 + i) * 0.008)) % W;
    var mty = f.rnd(720 + i) * H;
    A(ei * (0.05 + 0.14 * f.rnd(730 + i)) * (0.6 + 0.4 * Math.sin(ms * 0.001 + i * 2.1)));
    ctx.fillStyle = '#d9b45b';
    ctx.fillRect(mtx, mty, 1.5, 1.5);
  }

  function A(a) { ctx.globalAlpha = Math.max(0, Math.min(1, a)) * AM; }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fmt(n) {
    var s = '' + Math.max(0, Math.floor(n)), o = '', L = s.length, q;
    for (q = 0; q < L; q++) { o += s.charAt(q); var rd = L - 1 - q; if (rd > 0 && rd % 3 === 0) o += ','; }
    return o;
  }

  // ---------- cached low-poly map face ----------
  var mapS = Math.ceil(mapR * 2.3);
  var face = f.cache('paintWealthHalo:face:' + mapS, mapS, mapS, function (cv) {
    var g = cv.getContext ? cv.getContext('2d') : cv;
    var S = mapS, a, b, x, y, r0, ang2;
    g.fillStyle = '#4c5f35';
    g.fillRect(0, 0, S, S);
    // faceted terrain
    var n = 9, pts = [], greens = ['#42552c', '#4a5d33', '#52673a', '#5d7340', '#67794a', '#74884a'];
    for (a = 0; a < n; a++) {
      pts.push([]);
      for (b = 0; b < n; b++) {
        pts[a].push([
          (a / (n - 1)) * S + (f.rnd(a * 17 + b * 3 + 5) - 0.5) * S * 0.07,
          (b / (n - 1)) * S + (f.rnd(a * 29 + b * 11 + 9) - 0.5) * S * 0.07
        ]);
      }
    }
    for (a = 0; a < n - 1; a++) {
      for (b = 0; b < n - 1; b++) {
        var p00 = pts[a][b], p10 = pts[a + 1][b], p01 = pts[a][b + 1], p11 = pts[a + 1][b + 1];
        var gi = Math.floor(f.rnd(a * 31 + b * 13) * greens.length) % greens.length;
        var brown = f.rnd(a * 7 + b * 41) > 0.90;
        g.fillStyle = brown ? (f.rnd(a + b * 3) > 0.5 ? '#5d5136' : '#695c3e') : greens[gi];
        g.beginPath(); g.moveTo(p00[0], p00[1]); g.lineTo(p10[0], p10[1]); g.lineTo(p11[0], p11[1]); g.closePath(); g.fill();
        var gj = (gi + (f.rnd(a * 3 + b * 17) > 0.5 ? 1 : greens.length - 1)) % greens.length;
        g.fillStyle = brown ? '#5d5136' : greens[gj];
        g.beginPath(); g.moveTo(p00[0], p00[1]); g.lineTo(p11[0], p11[1]); g.lineTo(p01[0], p01[1]); g.closePath(); g.fill();
      }
    }
    // sandy path corner to corner
    var Ax = S * 0.02, Ay = S * 0.86, Bx = S * 0.98, By = S * 0.18;
    var pxs = [], pys = [];
    for (a = 0; a < 6; a++) {
      var tt = a / 5;
      var off = (a === 0 || a === 5) ? 0 : (f.rnd(a + 30) - 0.5) * S * 0.05;
      pxs.push(Ax + (Bx - Ax) * tt + 0.578 * off);
      pys.push(Ay + (By - Ay) * tt + 0.816 * off);
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    var pw = [S * 0.075, S * 0.056, S * 0.028], pcol = ['#7c6c48', '#a08c62', '#b7a47a'];
    for (b = 0; b < 3; b++) {
      g.strokeStyle = pcol[b]; g.lineWidth = pw[b];
      g.beginPath(); g.moveTo(pxs[0], pys[0]);
      for (a = 1; a < 6; a++) g.lineTo(pxs[a], pys[a]);
      g.stroke();
    }
    g.fillStyle = '#6f5f40';
    for (a = 0; a < 9; a++) {
      var t2 = 0.08 + 0.84 * f.rnd(a + 120);
      x = Ax + (Bx - Ax) * t2 + (f.rnd(a + 130) - 0.5) * S * 0.03;
      y = Ay + (By - Ay) * t2 + (f.rnd(a + 140) - 0.5) * S * 0.03;
      g.fillRect(x, y, 2, 2);
    }
    // pond (upper-left of centre)
    var pcx = S * 0.30, pcy = S * 0.38, pr = S * 0.085;
    g.beginPath();
    for (a = 0; a < 8; a++) {
      ang2 = a / 8 * TAU; r0 = pr * 1.3 * (0.8 + f.rnd(a + 70) * 0.45);
      x = pcx + Math.cos(ang2) * r0; y = pcy + Math.sin(ang2) * r0 * 0.85;
      if (a) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = '#8b7c56'; g.fill();
    g.beginPath();
    for (a = 0; a < 8; a++) {
      ang2 = a / 8 * TAU; r0 = pr * (0.8 + f.rnd(a + 70) * 0.45);
      x = pcx + Math.cos(ang2) * r0; y = pcy + Math.sin(ang2) * r0 * 0.85;
      if (a) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = '#3e5d79'; g.fill();
    g.beginPath();
    for (a = 0; a < 6; a++) {
      ang2 = a / 6 * TAU; r0 = pr * 0.5 * (0.8 + f.rnd(a + 90) * 0.5);
      x = pcx - pr * 0.15 + Math.cos(ang2) * r0; y = pcy - pr * 0.12 + Math.sin(ang2) * r0 * 0.85;
      if (a) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = '#4d6f8e'; g.fill();
    // grey building block near centre, beside the road
    g.save();
    g.translate(S * 0.61, S * 0.345);
    g.rotate(0.28);
    g.fillStyle = '#6f6a60'; g.strokeStyle = '#4a453d'; g.lineWidth = 2;
    g.fillRect(-S * 0.045, -S * 0.034, S * 0.09, S * 0.068);
    g.strokeRect(-S * 0.045, -S * 0.034, S * 0.09, S * 0.068);
    g.fillStyle = '#7e786c';
    g.fillRect(-S * 0.045, -S * 0.034, S * 0.09, S * 0.022);
    g.fillStyle = '#5a554c';
    g.fillRect(S * 0.02, -S * 0.004, S * 0.042, S * 0.036);
    g.strokeRect(S * 0.02, -S * 0.004, S * 0.042, S * 0.036);
    g.restore();
    // trees
    var drawn = 0;
    for (a = 0; a < 44 && drawn < 20; a++) {
      x = S * (0.10 + 0.80 * f.rnd(a * 5 + 11));
      y = S * (0.10 + 0.80 * f.rnd(a * 5 + 12));
      var dxq = x - S * 0.5, dyq = y - S * 0.5;
      if (dxq * dxq + dyq * dyq > (S * 0.43) * (S * 0.43)) continue;
      var crs = Math.abs((Bx - Ax) * (y - Ay) - (By - Ay) * (x - Ax)) / (S * 1.177);
      if (crs < S * 0.055) continue;
      var pdx = x - pcx, pdy = y - pcy;
      if (pdx * pdx + pdy * pdy < (S * 0.145) * (S * 0.145)) continue;
      var bdx = x - S * 0.61, bdy = y - S * 0.345;
      if (bdx * bdx + bdy * bdy < (S * 0.09) * (S * 0.09)) continue;
      r0 = S * 0.017 * (0.75 + f.rnd(a * 5 + 13) * 0.6);
      g.fillStyle = '#31431f'; g.beginPath(); g.arc(x, y, r0, 0, TAU); g.fill();
      g.fillStyle = '#202d13'; g.beginPath(); g.arc(x + r0 * 0.18, y + r0 * 0.22, r0 * 0.55, 0, TAU); g.fill();
      g.fillStyle = '#4a5f2c'; g.beginPath(); g.arc(x - r0 * 0.30, y - r0 * 0.32, r0 * 0.30, 0, TAU); g.fill();
      drawn++;
    }
    g.fillStyle = f.hexA('#243018', 0.10);
    g.fillRect(0, 0, S, S);
  });

  var rot = Math.sin(ms * 0.00012) * 0.06 + Math.sin(ms * 0.000047) * 0.025;
  var mapE = f.ease(f.clamp01(f.in01 / 0.55));
  var cols = [f.gold, f.violet, f.ice, f.ember];
  var pcts = [52, 28, 12, 8];
  var fracs = [0.52, 0.28, 0.12, 0.08];

  // ---------- soft gold ambient halo (layered fills, no shadowBlur) ----------
  for (k = 0; k < 4; k++) {
    A(live * (0.016 + 0.009 * k));
    ctx.fillStyle = f.gold;
    ctx.beginPath(); ctx.arc(cx, cy, R * (1.55 - 0.15 * k), 0, TAU); ctx.fill();
  }

  // ---------- map face (iris open, slow breathing rotation) ----------
  if (mapE > 0.001 && eo < 0.999) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, mapR * (0.35 + 0.65 * mapE), 0, TAU);
    ctx.clip();
    A(mapE * (1 - eo));
    ctx.fillStyle = '#1b2312';
    ctx.fillRect(cx - mapR, cy - mapR, mapR * 2, mapR * 2);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    A(mapE * (1 - eo));
    ctx.drawImage(face, -mapS / 2, -mapS / 2, mapS, mapS);
    ctx.restore();
    // edge vignette (layered strokes)
    ctx.lineCap = 'butt';
    for (k = 0; k < 3; k++) {
      A(mapE * (1 - eo) * (0.20 - 0.06 * k));
      ctx.strokeStyle = '#0a0f06';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, mapR - 3 - k * 5, 0, TAU); ctx.stroke();
    }
    // white flag planted on the path (rotates with terrain, bobs)
    var fpx2 = 0.1248 * mapS, fpy2 = -0.0684 * mapS;
    var cr2 = Math.cos(rot), sr2 = Math.sin(rot);
    var fx = cx + fpx2 * cr2 - fpy2 * sr2;
    var fy = cy + fpx2 * sr2 + fpy2 * cr2;
    var bob = -Math.abs(Math.sin(ms * 0.003)) * 2.5;
    A(mapE * (1 - eo) * 0.35);
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(fx, fy + 1, 4, 1.8, 0, 0, TAU); ctx.fill();
    A(mapE * (1 - eo));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx - 1, fy - 12 + bob, 2, 12 - bob);
    ctx.beginPath();
    ctx.moveTo(fx + 1, fy - 12 + bob);
    ctx.lineTo(fx + 9, fy - 9.5 + bob);
    ctx.lineTo(fx + 1, fy - 7 + bob);
    ctx.closePath(); ctx.fill();
    // white player arrow at exact centre
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(ms * 0.0009) * 0.07);
    A(mapE * (1 - eo));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6.5); ctx.lineTo(4.6, 5.2); ctx.lineTo(0, 2.4); ctx.lineTo(-4.6, 5.2);
    ctx.closePath(); ctx.fill();
    A(mapE * (1 - eo) * 0.5);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // ---------- allocation ring ----------
  var gapA = 2.4 / R;
  var a0 = -Math.PI / 2;
  var rbe = f.ease(f.clamp01((f.in01 - 0.10) / 0.5));
  if (rbe > 0.001) {
    A(rbe * (1 - eo) * 0.9);
    ctx.strokeStyle = '#241d13';
    ctx.lineWidth = ringW + 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  }
  var cur = a0;
  for (i = 0; i < 4; i++) {
    var sw = fracs[i] * TAU - gapA;
    var st = cur + gapA / 2;
    cur += fracs[i] * TAU;
    var env = f.ease(f.clamp01((f.in01 - 0.18 - i * 0.12) / 0.5));
    if (env <= 0.001) continue;
    var mid = st + sw / 2;
    var fan = eo * R * (0.34 + 0.10 * i);
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * fan, cy + Math.sin(mid) * fan);
    ctx.rotate(eo * 0.22 * (i - 1.5));
    var en = st + sw * env;
    var sal = env * (1 - eo);
    ctx.lineCap = 'butt';
    A(sal); ctx.strokeStyle = cols[i]; ctx.lineWidth = ringW;
    ctx.beginPath(); ctx.arc(0, 0, R, st, en); ctx.stroke();
    A(sal * 0.35); ctx.strokeStyle = '#1a1006'; ctx.lineWidth = ringW * 0.42;
    ctx.beginPath(); ctx.arc(0, 0, R - ringW * 0.26, st, en); ctx.stroke();
    A(sal * 0.30); ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = ringW * 0.16;
    ctx.beginPath(); ctx.arc(0, 0, R + ringW * 0.28, st, en); ctx.stroke();
    A(sal * 0.25); ctx.strokeStyle = '#100a04'; ctx.lineWidth = 1.5;
    for (k = 1; k <= 2; k++) {
      var na = st + sw * (k / 3);
      if (na > en) break;
      ctx.beginPath();
      ctx.moveTo(Math.cos(na) * (R - ringW * 0.5), Math.sin(na) * (R - ringW * 0.5));
      ctx.lineTo(Math.cos(na) * (R + ringW * 0.5), Math.sin(na) * (R + ringW * 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }
  // travelling bright sweep (layered translucent arcs)
  if (live > 0.001) {
    var sa = (ms * 0.0003) % TAU;
    var shalf = [0.45, 0.26, 0.12], salp = [0.05, 0.08, 0.13];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff3cf';
    ctx.lineWidth = ringW * 0.9;
    for (k = 0; k < 3; k++) {
      A(live * salp[k]);
      ctx.beginPath(); ctx.arc(cx, cy, R, sa - shalf[k], sa + shalf[k]); ctx.stroke();
    }
  }

  // ---------- OSRS orbs on the left arc ----------
  var orbR = Math.max(14, R * 0.098);
  for (i = 0; i < 4; i++) {
    var oe = f.ease(f.clamp01((f.in01 - 0.32 - i * 0.09) / 0.45));
    if (oe <= 0.001) continue;
    var oa = Math.PI + 0.62 - i * 0.38;
    var det = eo * R * (0.55 + 0.12 * i);
    var orad = R * 1.015 + det;
    var ox = cx + Math.cos(oa) * orad;
    var oy = cy + Math.sin(oa) * orad;
    var os = 0.5 + 0.5 * oe;
    var al = oe * (1 - eo);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(os, os);
    A(al * 0.95); ctx.fillStyle = '#221c13';
    ctx.beginPath(); ctx.arc(0, 0, orbR, 0, TAU); ctx.fill();
    A(al * 0.6); ctx.strokeStyle = '#0f0c08'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, orbR, 0, TAU); ctx.stroke();
    // crescent frame, opening toward the map
    var op = 0.66;
    ctx.lineCap = 'round';
    A(al); ctx.strokeStyle = '#494034'; ctx.lineWidth = orbR * 0.30;
    ctx.beginPath(); ctx.arc(0, 0, orbR * 0.92, oa - (Math.PI - op), oa + (Math.PI - op)); ctx.stroke();
    A(al * 0.6); ctx.strokeStyle = '#6a5c49'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, orbR * 1.05, oa - (Math.PI - op), oa + (Math.PI - op)); ctx.stroke();
    // coloured globe with darker lower half
    var gr = orbR * 0.60;
    var puls = 1 + Math.sin(ms * 0.002 + i * 1.4) * 0.03;
    A(al); ctx.fillStyle = cols[i];
    ctx.beginPath(); ctx.arc(0, 0, gr * puls, 0, TAU); ctx.fill();
    A(al * 0.45); ctx.fillStyle = '#160e04';
    ctx.beginPath(); ctx.arc(0, 0, gr * puls, 0, Math.PI); ctx.closePath(); ctx.fill();
    A(al * 0.30); ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-gr * 0.33, -gr * 0.35, gr * 0.28, 0, TAU); ctx.fill();
    A(al * 0.5); ctx.strokeStyle = '#0f0c08'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, gr * puls, 0, TAU); ctx.stroke();
    // percentage tab to the orb's left
    var tw2 = 34, th2 = 18;
    var tx = -orbR - 8 - tw2, ty = -th2 / 2;
    A(al * 0.88); ctx.fillStyle = '#14100b'; rr(tx, ty, tw2, th2, 4); ctx.fill();
    A(al * 0.6); ctx.strokeStyle = f.hexA(cols[i], 0.5); ctx.lineWidth = 1; rr(tx, ty, tw2, th2, 4); ctx.stroke();
    A(al); ctx.fillStyle = cols[i];
    ctx.font = '15px VT323, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pcts[i] + '%', tx + tw2 / 2, 1);
    ctx.restore();
  }

  // ---------- compass rose orb, top-left rim ----------
  var cee = f.ease(f.clamp01((f.in01 - 0.22) / 0.5));
  if (cee > 0.001) {
    var cAng = Math.PI + 1.05;
    var cdet = eo * R * 0.6;
    var ccx = cx + Math.cos(cAng) * (R * 1.05 + cdet);
    var ccy = cy + Math.sin(cAng) * (R * 1.05 + cdet);
    var cR = Math.max(18, R * 0.13);
    var cal = cee * (1 - eo);
    var cs = 0.5 + 0.5 * cee;
    ctx.save();
    ctx.translate(ccx, ccy);
    ctx.scale(cs, cs);
    A(cal * 0.95); ctx.fillStyle = '#241e15';
    ctx.beginPath(); ctx.arc(0, 0, cR, 0, TAU); ctx.fill();
    A(cal); ctx.strokeStyle = '#5b5142'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, cR * 0.98, 0, TAU); ctx.stroke();
    A(cal * 0.5); ctx.strokeStyle = '#0f0c08'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, cR * 1.12, 0, TAU); ctx.stroke();
    A(cal * 0.8); ctx.strokeStyle = '#d8ccb4'; ctx.lineWidth = 1.5;
    ctx.lineCap = 'butt';
    for (k = 0; k < 4; k++) {
      var ta = -Math.PI / 2 + k * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ta) * cR * 0.66, Math.sin(ta) * cR * 0.66);
      ctx.lineTo(Math.cos(ta) * cR * 0.85, Math.sin(ta) * cR * 0.85);
      ctx.stroke();
    }
    ctx.rotate(Math.sin(ms * 0.0006) * 0.09);
    A(cal); ctx.fillStyle = f.gold;
    ctx.beginPath(); ctx.moveTo(0, -cR * 0.58); ctx.lineTo(cR * 0.15, 0); ctx.lineTo(-cR * 0.15, 0); ctx.closePath(); ctx.fill();
    A(cal * 0.85); ctx.fillStyle = f.gold2;
    ctx.beginPath(); ctx.moveTo(0, cR * 0.42); ctx.lineTo(cR * 0.15, 0); ctx.lineTo(-cR * 0.15, 0); ctx.closePath(); ctx.fill();
    A(cal); ctx.fillStyle = '#14100b';
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- net-worth XP pill, top-right rim ----------
  var pe = f.ease(f.clamp01((f.in01 - 0.5) / 0.45));
  if (pe > 0.001) {
    var pdet = eo * R * 0.5;
    var pxc = cx + 0.408 * (R * 1.12 + pdet);
    var pyc = cy - 0.913 * (R * 1.12 + pdet) - (1 - pe) * 10;
    var cntE = f.ease(f.clamp01((f.in01 - 0.5) / 0.48));
    var kk = Math.floor(ms / 1600);
    var twOn = cntE >= 0.999 && f.rnd(kk) > 0.62;
    var twv = 6 + Math.floor(f.rnd(kk + 9) * 68);
    var val = 127482 * cntE + (twOn ? twv : 0);
    var txt = '£' + fmt(val);
    ctx.font = '18px VT323, monospace';
    var twd = ctx.measureText(txt).width;
    var pw2 = twd + 22, ph2 = 26;
    var pal = pe * (1 - eo);
    A(pal * 0.92); ctx.fillStyle = '#171207';
    rr(pxc - pw2 / 2, pyc - ph2 / 2, pw2, ph2, 6); ctx.fill();
    A(pal * 0.9); ctx.strokeStyle = '#5b5142'; ctx.lineWidth = 1.5;
    rr(pxc - pw2 / 2, pyc - ph2 / 2, pw2, ph2, 6); ctx.stroke();
    A(pal * 0.5); ctx.strokeStyle = f.hexA(f.gold, 0.55); ctx.lineWidth = 1;
    rr(pxc - pw2 / 2 + 2, pyc - ph2 / 2 + 2, pw2 - 4, ph2 - 4, 4); ctx.stroke();
    A(pal); ctx.fillStyle = f.gold;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, pxc, pyc + 1);
    A(pal * 0.7);
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillStyle = f.muted;
    ctx.fillText('NET WORTH', pxc, pyc - ph2 / 2 - 7);
    if (twOn) {
      var pp = (ms % 1600) / 1600;
      A(pal * (1 - pp));
      ctx.font = '14px VT323, monospace';
      ctx.fillStyle = f.gold;
      ctx.fillText('+' + twv, pxc + pw2 / 2 + 14, pyc - 6 - pp * 16);
    }
  }

  // ---------- gold dust motes ----------
  ctx.fillStyle = f.gold;
  for (i = 0; i < 24; i++) {
    var ma = f.rnd(i) * TAU + ms * 0.00004 * (0.4 + f.rnd(i + 40)) * (f.rnd(i + 60) > 0.5 ? 1 : -1);
    var mr = R * (1.03 + f.rnd(i + 20) * 0.38);
    var mx = cx + Math.cos(ma) * mr;
    var my = cy + Math.sin(ma) * mr * 0.97 + Math.sin(ms * 0.0007 + i * 2.1) * 4;
    var twk = Math.sin(ms * 0.0011 + i * 1.7);
    A(live * (0.15 + 0.35 * twk * twk));
    var msz = 1 + f.rnd(i + 80) * 1.5;
    ctx.fillRect(mx, my, msz, msz);
  }

  // ---------- restore state ----------
  ctx.globalAlpha = GA;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function paintDialMacro(ctx, f) {
  var GA = ctx.globalAlpha;
  var W = f.W, H = f.H, ms = f.ms;
  var ease = f.ease, clamp01 = f.clamp01, hexA = f.hexA, rnd = f.rnd;
  var TAU = Math.PI * 2;
  var dk = f.dark ? 1 : 0.55;
  var inE = ease(f.in01), outE = ease(f.out01);
  var A = GA * dk * (0.12 + 0.88 * inE) * (1 - 0.92 * outE);
  if (A < 0.004) return;
  var R = Math.min(W, H) * 0.42;
  if (!(R > 4)) return;
  var cx = W * 0.6 + outE * W * 0.09;
  var cy = H * 0.52;
  var sc = 1.05 - 0.05 * inE + 0.03 * outE;
  var i;

  /* ---------- cached face: bezel + parchment + etchings ---------- */
  var S = Math.ceil(R * 2.6), hs = S / 2;
  var face = f.cache('paintDialMacro:face:' + S, S, S, function (g) {
    if (g.getContext) g = g.getContext('2d');
    g.save();
    g.translate(hs, hs);
    function circ(r, col) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = col; g.fill(); }
    /* crown stem + loop (pocket-watch) */
    g.beginPath(); g.arc(0, -R * 1.155, R * 0.062, 0, TAU);
    g.lineWidth = R * 0.030; g.strokeStyle = '#6a4c2e'; g.stroke();
    g.beginPath(); g.arc(0, -R * 1.155, R * 0.062, Math.PI * 0.7, Math.PI * 1.6);
    g.lineWidth = R * 0.012; g.strokeStyle = '#c9a25c'; g.stroke();
    g.fillStyle = '#6a4c2e';
    g.fillRect(-R * 0.052, -R * 1.10, R * 0.104, R * 0.18);
    g.fillStyle = '#8a6a38';
    g.fillRect(-R * 0.068, -R * 1.115, R * 0.136, R * 0.045);
    g.fillStyle = '#c9a25c';
    g.fillRect(-R * 0.068, -R * 1.115, R * 0.136, R * 0.012);
    g.fillStyle = '#4a3420';
    g.fillRect(-R * 0.012, -R * 1.06, R * 0.024, R * 0.13);
    /* bronze bezel rings */
    circ(R, '#4a3420');
    circ(R * 0.985, '#6a4c2e');
    circ(R * 0.945, '#8a6a38');
    g.beginPath(); g.arc(0, 0, R * 0.965, Math.PI * 0.78, Math.PI * 1.52);
    g.lineWidth = R * 0.018; g.strokeStyle = '#c9a25c'; g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.965, -Math.PI * 0.18, Math.PI * 0.46);
    g.strokeStyle = 'rgba(0,0,0,0.30)'; g.stroke();
    circ(R * 0.885, '#5a4326');
    circ(R * 0.868, '#3a2a18');
    /* 8 rivets */
    var j, a, rx, ry;
    for (j = 0; j < 8; j++) {
      a = j * TAU / 8 + TAU / 16;
      rx = Math.cos(a) * R * 0.925; ry = Math.sin(a) * R * 0.925;
      g.beginPath(); g.arc(rx + R * 0.004, ry + R * 0.005, R * 0.024, 0, TAU); g.fillStyle = '#3a2a18'; g.fill();
      g.beginPath(); g.arc(rx, ry, R * 0.021, 0, TAU); g.fillStyle = '#8a6a38'; g.fill();
      g.beginPath(); g.arc(rx - R * 0.006, ry - R * 0.007, R * 0.008, 0, TAU); g.fillStyle = '#c9a25c'; g.fill();
    }
    /* aged parchment */
    var pg = g.createRadialGradient(-R * 0.14, -R * 0.17, R * 0.05, 0, 0, R * 0.87);
    pg.addColorStop(0, '#e4d8bc');
    pg.addColorStop(0.45, '#d8ccb4');
    pg.addColorStop(1, '#b8a888');
    circ(R * 0.86, pg);
    /* linen grain spokes */
    g.strokeStyle = 'rgba(58,42,24,0.023)';
    g.lineWidth = 1;
    for (j = 0; j < 48; j++) {
      a = j * TAU / 48 + 0.03;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.09, Math.sin(a) * R * 0.09);
      g.lineTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84);
      g.stroke();
    }
    /* concentric ruling rings */
    g.strokeStyle = 'rgba(58,42,24,0.09)';
    var rr = [0.28, 0.40, 0.52, 0.64, 0.745];
    for (j = 0; j < rr.length; j++) { g.beginPath(); g.arc(0, 0, R * rr[j], 0, TAU); g.stroke(); }
    /* minute track on rim */
    for (j = 0; j < 60; j++) {
      a = j * TAU / 60 - Math.PI / 2;
      var big = j % 5 === 0;
      g.strokeStyle = big ? 'rgba(58,42,24,0.55)' : 'rgba(58,42,24,0.30)';
      g.lineWidth = big ? Math.max(1.4, R * 0.007) : 1;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * (big ? 0.782 : 0.80), Math.sin(a) * R * (big ? 0.782 : 0.80));
      g.lineTo(Math.cos(a) * R * 0.838, Math.sin(a) * R * 0.838);
      g.stroke();
    }
    /* thin diagonal cross etch to rim */
    g.strokeStyle = 'rgba(58,42,24,0.16)';
    g.lineWidth = 1;
    for (j = 0; j < 4; j++) {
      a = Math.PI / 4 + j * Math.PI / 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.07, Math.sin(a) * R * 0.07);
      g.lineTo(Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76);
      g.stroke();
    }
    /* bronze diamond ticks at the eighths */
    for (j = 0; j < 4; j++) {
      a = Math.PI / 4 + j * Math.PI / 2;
      var ex = Math.cos(a) * R * 0.655, ey = Math.sin(a) * R * 0.655, dz = R * 0.028;
      g.beginPath();
      g.moveTo(ex, ey - dz); g.lineTo(ex + dz * 0.62, ey); g.lineTo(ex, ey + dz); g.closePath();
      g.fillStyle = '#6a4c2e'; g.fill();
      g.beginPath();
      g.moveTo(ex, ey - dz); g.lineTo(ex, ey + dz); g.lineTo(ex - dz * 0.62, ey); g.closePath();
      g.fillStyle = '#c9a25c'; g.fill();
    }
    /* cardinal letters, etched */
    g.font = Math.round(R * 0.13) + 'px VT323, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var CL = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
    for (j = 0; j < 4; j++) {
      var lx = CL[j][1] * R * 0.62, ly = CL[j][2] * R * 0.62;
      g.fillStyle = 'rgba(255,255,255,0.30)';
      g.fillText(CL[j][0], lx, ly + Math.max(1, R * 0.006));
      g.fillStyle = '#3a2a18';
      g.fillText(CL[j][0], lx, ly);
    }
    g.restore();
  });

  /* ---------- cached compass rose ---------- */
  var RS = Math.ceil(R * 0.5), rh = RS / 2;
  var rose = f.cache('paintDialMacro:rose:' + RS, RS, RS, function (g) {
    if (g.getContext) g = g.getContext('2d');
    g.save();
    g.translate(rh, rh);
    var r1 = R * 0.205, r2 = R * 0.135, v = R * 0.052;
    function pt(rr, aa) { return [Math.cos(aa) * rr, Math.sin(aa) * rr]; }
    function facets(red, bone, solid, oy) {
      for (var k = 0; k < 8; k++) {
        var a = k * TAU / 8 - Math.PI / 2;
        var L = (k % 2 === 0) ? r1 : r2;
        var tip = pt(L, a), vl = pt(v, a - TAU / 16), vr = pt(v, a + TAU / 16);
        g.beginPath(); g.moveTo(tip[0], tip[1] + oy); g.lineTo(vl[0], vl[1] + oy); g.lineTo(0, oy); g.closePath();
        g.fillStyle = solid || ((k % 2 === 0) ? red : bone); g.fill();
        g.beginPath(); g.moveTo(tip[0], tip[1] + oy); g.lineTo(vr[0], vr[1] + oy); g.lineTo(0, oy); g.closePath();
        g.fillStyle = solid || ((k % 2 === 0) ? bone : red); g.fill();
      }
    }
    facets(null, null, 'rgba(0,0,0,0.20)', Math.max(1, R * 0.008));
    facets('#8f1d10', '#e8e6d8', null, 0);
    g.strokeStyle = 'rgba(58,42,24,0.70)'; g.lineWidth = Math.max(1, R * 0.0035);
    for (var k = 0; k < 8; k++) {
      var a = k * TAU / 8 - Math.PI / 2, L = (k % 2 === 0) ? r1 : r2;
      var tip = pt(L, a), vl = pt(v, a - TAU / 16), vr = pt(v, a + TAU / 16);
      g.beginPath(); g.moveTo(vl[0], vl[1]); g.lineTo(tip[0], tip[1]); g.lineTo(vr[0], vr[1]); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, R * 0.030, 0, TAU); g.fillStyle = '#e8e6d8'; g.fill();
    g.beginPath(); g.arc(0, 0, R * 0.030, 0, TAU); g.strokeStyle = '#8f1d10'; g.lineWidth = Math.max(1, R * 0.006); g.stroke();
    g.restore();
  });

  /* ---------- cached low-poly night terrain ---------- */
  var TW2 = Math.ceil(W), TH2 = Math.ceil(H * 0.26);
  var terr = f.cache('paintDialMacro:terr:' + TW2 + 'x' + TH2, TW2, TH2, function (g) {
    if (g.getContext) g = g.getContext('2d');
    var n = 12, xs = [], ys = [], j;
    for (j = 0; j <= n; j++) { xs.push(TW2 * j / n); ys.push(TH2 * (0.22 + 0.5 * rnd(j * 7 + 3))); }
    g.beginPath(); g.moveTo(0, TH2 + 2);
    for (j = 0; j <= n; j++) g.lineTo(xs[j], ys[j]);
    g.lineTo(TW2, TH2 + 2); g.closePath();
    g.fillStyle = '#0a1008'; g.fill();
    for (j = 0; j < n; j++) {
      g.beginPath();
      g.moveTo(xs[j], ys[j]); g.lineTo(xs[j + 1], ys[j + 1]);
      g.lineTo((xs[j] + xs[j + 1]) / 2, TH2);
      g.closePath();
      g.fillStyle = 'rgba(93,115,64,' + (0.04 + 0.06 * rnd(j * 11 + 2)).toFixed(3) + ')';
      g.fill();
    }
    g.beginPath(); g.moveTo(0, TH2 + 2);
    for (j = 0; j <= n; j++) g.lineTo(TW2 * j / n, TH2 * (0.55 + 0.4 * rnd(j * 13 + 5)));
    g.lineTo(TW2, TH2 + 2); g.closePath();
    g.fillStyle = '#050803'; g.fill();
  });

  ctx.save();

  /* ---------- world: terrain, light pool, fireflies ---------- */
  ctx.globalAlpha = A * 0.9;
  ctx.drawImage(terr, 0, H - TH2);

  ctx.save();
  ctx.translate(cx, cy + R * 1.0);
  ctx.scale(1, 0.35);
  var pool = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.25);
  pool.addColorStop(0, hexA(f.gold2, 0.10));
  pool.addColorStop(1, hexA(f.gold2, 0));
  ctx.globalAlpha = A;
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.25, 0, TAU); ctx.fill();
  ctx.restore();

  for (i = 0; i < 3; i++) {
    var fx = W * (0.10 + 0.13 * i) + Math.sin(ms * 0.00021 + i * 2.4) * W * 0.022;
    var fy = H * (0.50 + 0.34 * rnd(i + 11)) + Math.sin(ms * 0.00033 + i * 1.7) * H * 0.035;
    var bl = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ms * 0.0016 + i * 2.1));
    ctx.fillStyle = '#d6e08a';
    ctx.globalAlpha = A * 0.05 * bl; ctx.beginPath(); ctx.arc(fx, fy, 7, 0, TAU); ctx.fill();
    ctx.globalAlpha = A * 0.14 * bl; ctx.beginPath(); ctx.arc(fx, fy, 3.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = A * 0.75 * bl; ctx.beginPath(); ctx.arc(fx, fy, 1.2, 0, TAU); ctx.fill();
  }

  /* ---------- instrument group ---------- */
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);

  /* leather strap edge, faceted, exiting bottom-right (behind bezel) */
  var ux = Math.cos(0.66), uy = Math.sin(0.66), px2 = -uy, py2 = ux;
  var seg = [[R * 0.78, R * 0.085], [R * 1.15, R * 0.10], [R * 1.55, R * 0.115], [R * 2.0, R * 0.13]];
  var scol = ['#2e2015', '#241810', '#1d130c'];
  ctx.globalAlpha = A;
  for (i = 0; i < 3; i++) {
    var d0 = seg[i], d1 = seg[i + 1];
    ctx.fillStyle = scol[i];
    ctx.beginPath();
    ctx.moveTo(ux * d0[0] + px2 * d0[1], uy * d0[0] + py2 * d0[1]);
    ctx.lineTo(ux * d1[0] + px2 * d1[1], uy * d1[0] + py2 * d1[1]);
    ctx.lineTo(ux * d1[0] - px2 * d1[1], uy * d1[0] - py2 * d1[1]);
    ctx.lineTo(ux * d0[0] - px2 * d0[1], uy * d0[0] - py2 * d0[1]);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = hexA('#c9a25c', 0.14); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ux * R * 0.86 + px2 * R * 0.055, uy * R * 0.86 + py2 * R * 0.055);
  ctx.lineTo(ux * R * 1.9 + px2 * R * 0.09, uy * R * 1.9 + py2 * R * 0.09);
  ctx.stroke();

  /* face sprite, with focus-pull ghosts on entrance */
  var dfoc = 1 - inE;
  if (dfoc > 0.02) {
    var off = dfoc * R * 0.03;
    ctx.globalAlpha = A * 0.30 * dfoc;
    ctx.drawImage(face, -hs + off, -hs);
    ctx.drawImage(face, -hs - off, -hs + off * 0.5);
  }
  ctx.globalAlpha = A * (0.55 + 0.45 * inE);
  ctx.drawImage(face, -hs, -hs);

  /* compass rose with ambient wobble */
  var wob = Math.sin(ms * 0.00051) * Math.sin(ms * 0.00013 + 1.7);
  ctx.save();
  ctx.rotate(wob * 0.017);
  ctx.globalAlpha = A * (0.94 + 0.06 * Math.sin(ms * 0.0019));
  ctx.drawImage(rose, -rh, -rh);
  ctx.restore();

  /* ---------- scan beam + revealed tics ---------- */
  var prog = ease(f.t);
  var bx = (-1.25 + 2.5 * prog) * R;

  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.85, 0, TAU); ctx.clip();
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 1;
  for (i = 0; i < 12; i++) {
    var tx = (-0.66 + i * 0.12) * R;
    var rv = clamp01((bx - tx) / (R * 0.18));
    if (rv <= 0) continue;
    ctx.globalAlpha = A * 0.26 * rv;
    ctx.beginPath(); ctx.moveTo(tx, -R * 0.315); ctx.lineTo(tx, -R * 0.285); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, R * 0.285); ctx.lineTo(tx, R * 0.315); ctx.stroke();
  }
  if (prog > 0.005 && prog < 0.995) {
    var trail = ctx.createLinearGradient(bx - R * 0.85, 0, bx, 0);
    trail.addColorStop(0, hexA(f.gold2, 0));
    trail.addColorStop(0.7, hexA(f.gold2, 0.06));
    trail.addColorStop(1, hexA(f.gold2, 0.17));
    ctx.globalAlpha = A;
    ctx.fillStyle = trail;
    ctx.fillRect(bx - R * 0.85, -R * 0.86, R * 0.85, R * 1.72);
    ctx.fillStyle = f.gold;
    ctx.globalAlpha = A * 0.06; ctx.fillRect(bx - R * 0.012, -R * 0.86, R * 0.045, R * 1.72);
    ctx.globalAlpha = A * 0.16; ctx.fillRect(bx - R * 0.005, -R * 0.86, R * 0.018, R * 1.72);
    ctx.globalAlpha = A * 0.60; ctx.fillRect(bx - R * 0.002, -R * 0.86, R * 0.005, R * 1.72);
  }
  ctx.restore();

  /* ---------- parchment HUD tags ---------- */
  function tag(x, y, txt, al) {
    if (al < 0.02) return;
    var tw = R * 0.34, th = R * 0.10, lip = Math.max(1, R * 0.008);
    ctx.globalAlpha = A * al;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + R * 0.008, y + R * 0.012, tw, th);
    ctx.fillStyle = '#d8ccb4';
    ctx.fillRect(x, y, tw, th);
    ctx.fillStyle = '#e4d8bc';
    ctx.fillRect(x, y, tw, lip);
    ctx.fillStyle = '#c4b294';
    ctx.fillRect(x, y + th - lip, tw, lip);
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.strokeRect(x, y, tw, th);
    ctx.fillStyle = '#3a2a18';
    ctx.font = Math.max(9, Math.round(R * 0.048)) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + tw / 2, y + th / 2 + 1);
  }
  tag(-R * 0.60, -R * 0.40, 'EST £3,120', clamp01((prog - 0.40) * 5));
  tag(R * 0.16, R * 0.30, 'LOWEST-20', clamp01((prog - 0.70) * 5));

  /* ---------- live hands ---------- */
  var dt = new Date();
  var sec = dt.getSeconds() + dt.getMilliseconds() / 1000;
  var mnu = dt.getMinutes() + sec / 60;
  var hrr = (dt.getHours() % 12) + mnu / 60;
  var aH = hrr / 12 * TAU - Math.PI / 2;
  var aM = mnu / 60 * TAU - Math.PI / 2;
  var aS = sec / 60 * TAU - Math.PI / 2 + Math.sin(ms * 0.0062) * 0.003;

  function ironHand(ang, len, tail, wid) {
    function path(c) {
      c.beginPath();
      c.moveTo(-tail, wid * 0.42);
      c.lineTo(0, wid * 0.55);
      c.lineTo(len * 0.82, wid * 0.20);
      c.lineTo(len, 0);
      c.lineTo(len * 0.82, -wid * 0.20);
      c.lineTo(0, -wid * 0.55);
      c.lineTo(-tail, -wid * 0.42);
      c.closePath();
    }
    ctx.save();
    ctx.translate(R * 0.012, R * 0.016);
    ctx.rotate(ang);
    ctx.globalAlpha = A * 0.30;
    path(ctx); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(ang);
    ctx.globalAlpha = A;
    path(ctx); ctx.fillStyle = '#2a241d'; ctx.fill();
    ctx.strokeStyle = '#4a4036'; ctx.lineWidth = Math.max(1, R * 0.005);
    ctx.beginPath();
    ctx.moveTo(-tail, -wid * 0.42);
    ctx.lineTo(0, -wid * 0.55);
    ctx.lineTo(len * 0.82, -wid * 0.20);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
  ironHand(aH, R * 0.34, R * 0.09, R * 0.055);
  ironHand(aM, R * 0.52, R * 0.10, R * 0.040);

  /* seconds hand = two-tone compass needle */
  var nw = R * 0.030, L1 = R * 0.62, L2 = R * 0.50;
  function needleHalf(sgn, colUp, colDn, solid) {
    var LL = sgn > 0 ? L1 : L2;
    ctx.beginPath(); ctx.moveTo(sgn * LL, 0); ctx.lineTo(0, -nw); ctx.lineTo(0, 0); ctx.closePath();
    ctx.fillStyle = solid || colUp; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sgn * LL, 0); ctx.lineTo(0, 0); ctx.lineTo(0, nw); ctx.closePath();
    ctx.fillStyle = solid || colDn; ctx.fill();
  }
  ctx.save();
  ctx.translate(R * 0.012, R * 0.016);
  ctx.rotate(aS);
  ctx.globalAlpha = A * 0.30;
  needleHalf(1, 0, 0, '#000'); needleHalf(-1, 0, 0, '#000');
  ctx.restore();
  ctx.save();
  ctx.rotate(aS);
  ctx.globalAlpha = A;
  needleHalf(1, '#a02015', '#c0281a', null);
  needleHalf(-1, '#d3d0bf', '#e8e6d8', null);
  ctx.restore();

  /* bronze centre cap */
  ctx.globalAlpha = A;
  ctx.beginPath(); ctx.arc(R * 0.004, R * 0.006, R * 0.050, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.046, 0, TAU); ctx.fillStyle = '#8a6a38'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.046, 0, TAU); ctx.strokeStyle = '#4a3420'; ctx.lineWidth = Math.max(1, R * 0.007); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.030, Math.PI * 0.7, Math.PI * 1.6); ctx.strokeStyle = '#c9a25c'; ctx.lineWidth = Math.max(1, R * 0.008); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.011, 0, TAU); ctx.fillStyle = '#3a2a18'; ctx.fill();

  /* valuation-locked flare (single pulse past t 0.78) */
  if (f.t > 0.78) {
    var p = clamp01((f.t - 0.78) / 0.14);
    if (p < 1) {
      var fr = R * (0.30 + 0.60 * ease(p));
      ctx.strokeStyle = f.gold;
      ctx.globalAlpha = A * 0.28 * (1 - p);
      ctx.lineWidth = Math.max(3, R * 0.05 * (1 - p));
      ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = A * 0.80 * (1 - p);
      ctx.lineWidth = Math.max(1.5, R * 0.020 * (1 - p));
      ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = A * 0.28 * (1 - p);
      ctx.lineWidth = Math.max(1, R * 0.008);
      ctx.beginPath(); ctx.arc(0, 0, fr * 1.15, 0, TAU); ctx.stroke();
      var fgl = ctx.createRadialGradient(0, 0, 0, 0, 0, fr);
      fgl.addColorStop(0, hexA(f.gold, 0.14 * (1 - p)));
      fgl.addColorStop(1, hexA(f.gold, 0));
      ctx.globalAlpha = A;
      ctx.fillStyle = fgl;
      ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU); ctx.fill();
    }
  }

  ctx.restore();
}

function paintSchematicRealm(ctx, f) {
  var GA = ctx.globalAlpha;
  var W = f.W, H = f.H, ms = f.ms, PI = Math.PI;
  var ein = f.ease(f.clamp01(f.in01)), eout = f.ease(f.clamp01(f.out01));
  var A = GA * (f.dark ? 0.55 : 1);
  var live = ein * (0.30 + 0.70 * eout);
  var flameS = (0.20 + 0.80 * ein) * (0.40 + 0.60 * eout);
  var fi = Math.floor(ms / 90), fr = ms / 90 - fi; fr = fr * fr * (3 - 2 * fr);
  var fn0 = f.rnd(fi & 1023), fn1 = f.rnd((fi + 1) & 1023);
  var flick = 0.82 + 0.18 * (fn0 + (fn1 - fn0) * fr);
  var K = 'paintSchematicRealm:' + (W | 0) + 'x' + (H | 0) + ':';
  var cx = W * 0.17, deskY = H * 0.45, trayY = H * 0.618, candleTop = H * 0.552, baseY = H * 0.672;
  var i;

  // ---------- static world: night, window, desk, props ----------
  var bg = f.cache(K + 'bg', W | 0, H | 0, function (g) {
    function poly(p, c) { g.fillStyle = c; g.beginPath(); g.moveTo(p[0], p[1]); for (var n = 2; n < p.length; n += 2) g.lineTo(p[n], p[n + 1]); g.closePath(); g.fill(); }
    // night
    g.fillStyle = '#020308'; g.fillRect(0, 0, W, H);
    var sg = g.createLinearGradient(0, 0, 0, deskY);
    sg.addColorStop(0, 'rgba(12,18,34,0.55)'); sg.addColorStop(1, 'rgba(4,6,12,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, deskY);
    // arched window silhouette, top-left
    var wx = W * 0.155, ww = W * 0.062, wy = H * 0.205, wb = H * 0.365;
    g.fillStyle = '#0b1322';
    g.beginPath(); g.moveTo(wx - ww, wb); g.lineTo(wx - ww, wy); g.arc(wx, wy, ww, PI, 0); g.lineTo(wx + ww, wb); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(58,51,43,0.75)'; g.lineWidth = Math.max(2, W * 0.0028); g.stroke();
    g.strokeStyle = '#04060c'; g.lineWidth = Math.max(2, W * 0.002);
    g.beginPath(); g.moveTo(wx, wy - ww); g.lineTo(wx, wb); g.moveTo(wx - ww, H * 0.24); g.lineTo(wx + ww, H * 0.24); g.stroke();
    g.fillStyle = '#241f19'; g.fillRect(wx - ww * 1.15, wb, ww * 2.3, H * 0.012);
    // ---- desk: low-poly planks in perspective ----
    var yB = deskY, yF = H * 0.872, vx = W * 0.42;
    g.fillStyle = '#31220f'; g.fillRect(0, yB, W, H - yB);
    var N = 7, shades = ['#4a3420', '#3e2c1a', '#584028', '#4a3420', '#43301c', '#584028', '#3e2c1a'];
    var xf = [], xb = [];
    for (var n2 = 0; n2 <= N; n2++) { xf[n2] = -0.06 * W + n2 * (1.12 * W / N); xb[n2] = vx + (xf[n2] - vx) * 0.62; }
    var yM = (yB + yF) * 0.5;
    for (n2 = 0; n2 < N; n2++) {
      var xm0 = (xb[n2] + xf[n2]) * 0.5, xm1 = (xb[n2 + 1] + xf[n2 + 1]) * 0.5;
      poly([xb[n2], yB, xb[n2 + 1], yB, xm1, yM, xm0, yM], shades[n2]);
      poly([xm0, yM, xm1, yM, xf[n2 + 1], yF, xf[n2], yF], shades[n2]);
      g.fillStyle = 'rgba(0,0,0,' + (0.04 + f.rnd(n2 + 3) * 0.07).toFixed(3) + ')';
      g.beginPath(); g.moveTo(xb[n2], yB); g.lineTo(xb[n2 + 1], yB); g.lineTo(xm1, yM); g.lineTo(xm0, yM); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,214,150,' + (0.02 + f.rnd(n2 + 11) * 0.03).toFixed(3) + ')';
      g.beginPath(); g.moveTo(xm0, yM); g.lineTo(xm1, yM); g.lineTo(xf[n2 + 1], yF); g.lineTo(xf[n2], yF); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(26,17,8,0.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(xb[n2], yB); g.lineTo(xf[n2], yF); g.stroke();
      g.strokeStyle = 'rgba(18,11,4,0.45)'; g.lineWidth = 1;
      for (var s = 0; s < 2; s++) {
        var u = 0.25 + 0.5 * f.rnd(n2 * 5 + s + 31);
        var gx0 = xb[n2] + (xb[n2 + 1] - xb[n2]) * u, gx1 = xf[n2] + (xf[n2 + 1] - xf[n2]) * u;
        var bend = (f.rnd(n2 * 7 + s + 57) - 0.5) * W * 0.012;
        g.beginPath(); g.moveTo(gx0, yB + H * 0.01); g.quadraticCurveTo((gx0 + gx1) * 0.5 + bend, yM, gx1, yF - H * 0.01); g.stroke();
      }
    }
    g.strokeStyle = 'rgba(106,76,46,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, yB + 1); g.lineTo(W, yB + 1); g.stroke();
    // bevelled front edge + front face
    g.fillStyle = '#6a4c2e'; g.fillRect(0, yF, W, H * 0.012);
    var fg2 = g.createLinearGradient(0, yF + H * 0.012, 0, H);
    fg2.addColorStop(0, '#2a1b0c'); fg2.addColorStop(1, '#140b04');
    g.fillStyle = fg2; g.fillRect(0, yF + H * 0.012, W, H - yF);
    // ---- props layout ----
    var px = W * 0.262, pT = H * 0.615, pB = H * 0.664, pr = H * 0.026;
    var sx = W * 0.205, sy = H * 0.492, sl = W * 0.072, sr = H * 0.0155;
    // contact shadows
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.beginPath(); g.ellipse(cx, baseY + H * 0.004, H * 0.05, H * 0.011, 0, 0, PI * 2); g.fill();
    g.beginPath(); g.ellipse(px + W * 0.003, H * 0.667, H * 0.03, H * 0.008, 0, 0, PI * 2); g.fill();
    g.beginPath(); g.ellipse(sx, sy + sr + H * 0.004, sl * 1.05, H * 0.006, 0, 0, PI * 2); g.fill();
    // ---- rolled spare scroll (back-left) ----
    g.fillStyle = '#4a3420'; g.fillRect(sx - sl - W * 0.014, sy - sr * 0.45, W * 0.014, sr * 0.9);
    g.fillRect(sx + sl, sy - sr * 0.45, W * 0.014, sr * 0.9);
    g.fillStyle = '#6a4c2e'; g.fillRect(sx - sl - W * 0.014, sy - sr * 0.45, W * 0.014, sr * 0.38);
    g.fillRect(sx + sl, sy - sr * 0.45, W * 0.014, sr * 0.38);
    g.fillStyle = '#3a2a18'; g.fillRect(sx - sl - W * 0.017, sy - sr * 0.6, W * 0.004, sr * 1.2);
    g.fillRect(sx + sl + W * 0.013, sy - sr * 0.6, W * 0.004, sr * 1.2);
    g.fillStyle = '#c4b294'; g.fillRect(sx - sl, sy + sr * 0.3, sl * 2, sr * 0.7);
    g.fillStyle = '#d8ccb4'; g.fillRect(sx - sl, sy - sr * 0.35, sl * 2, sr * 0.65);
    g.fillStyle = '#e4d8bc'; g.fillRect(sx - sl, sy - sr, sl * 2, sr * 0.65);
    g.fillStyle = '#a8946f'; g.fillRect(sx + sl * 0.32, sy - sr, 1.5, sr * 2);
    g.fillStyle = '#cbbd9c'; g.beginPath(); g.ellipse(sx + sl - W * 0.001, sy, W * 0.003, sr, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#a8946f'; g.beginPath(); g.ellipse(sx + sl - W * 0.001, sy, W * 0.0015, sr * 0.5, 0, 0, PI * 2); g.fill();
    // ---- old map corner (peeking from under the pot/wax) ----
    poly([W * 0.19, H * 0.658, W * 0.325, H * 0.647, W * 0.352, H * 0.699, W * 0.298, H * 0.734, W * 0.208, H * 0.72], '#cbbd9c');
    poly([W * 0.19, H * 0.658, W * 0.325, H * 0.647, W * 0.318, H * 0.66, W * 0.21, H * 0.671], '#b6a480');
    g.fillStyle = 'rgba(143,29,16,0.7)';
    var rx0 = W * 0.215, ry0 = H * 0.705, rx1 = W * 0.30, ry1 = H * 0.671, cq = W * 0.255, cyq = H * 0.722;
    for (var q = 0; q < 8; q++) {
      var tq = q / 7, it = 1 - tq;
      g.fillRect(it * it * rx0 + 2 * it * tq * cq + tq * tq * rx1, it * it * ry0 + 2 * it * tq * cyq + tq * tq * ry1, 3, 3);
    }
    g.strokeStyle = 'rgba(143,29,16,0.85)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(rx1 - 5, ry1 - 5); g.lineTo(rx1 + 6, ry1 + 6); g.moveTo(rx1 + 6, ry1 - 5); g.lineTo(rx1 - 5, ry1 + 6); g.stroke();
    // ---- ink-scribble scrap (far left) ----
    poly([W * 0.055, H * 0.652, W * 0.145, H * 0.643, W * 0.152, H * 0.692, W * 0.062, H * 0.702], '#d0c3a2');
    poly([W * 0.055, H * 0.652, W * 0.145, H * 0.643, W * 0.143, H * 0.650, W * 0.058, H * 0.659], '#e0d5b6');
    g.strokeStyle = 'rgba(20,14,8,0.7)'; g.lineWidth = 1.5;
    for (var w2 = 0; w2 < 4; w2++) {
      var ly = H * (0.661 + w2 * 0.0095);
      g.beginPath(); g.moveTo(W * 0.064, ly);
      g.quadraticCurveTo(W * 0.085, ly - H * 0.004, W * 0.104, ly);
      g.quadraticCurveTo(W * 0.118, ly + H * 0.003, W * (0.126 + f.rnd(w2 + 70) * 0.014), ly - H * 0.001);
      g.stroke();
    }
    // ---- sealing wax stick + seal stamp ----
    g.save(); g.translate(W * 0.318, H * 0.706); g.rotate(0.42);
    g.fillStyle = '#8f1d10'; g.fillRect(-W * 0.026, -H * 0.006, W * 0.052, H * 0.012);
    g.fillStyle = '#b53222'; g.fillRect(-W * 0.026, -H * 0.006, W * 0.052, H * 0.004);
    g.fillStyle = '#5e120a'; g.fillRect(W * 0.022, -H * 0.006, W * 0.004, H * 0.012);
    g.restore();
    var stx = W * 0.352, sty = H * 0.664;
    g.fillStyle = '#8a6a2a'; g.beginPath(); g.ellipse(stx, sty, H * 0.013, H * 0.006, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#5a4218'; g.beginPath(); g.ellipse(stx, sty - H * 0.002, H * 0.010, H * 0.0045, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#4a3420'; g.fillRect(stx - H * 0.004, sty - H * 0.036, H * 0.008, H * 0.034);
    g.fillStyle = '#6a4c2e'; g.beginPath(); g.ellipse(stx, sty - H * 0.038, H * 0.008, H * 0.005, 0, 0, PI * 2); g.fill();
    // ---- two loose coins ----
    function coin(mx, my) {
      g.fillStyle = '#6e5210'; g.beginPath(); g.ellipse(mx, my + H * 0.0025, H * 0.0145, H * 0.0062, 0, 0, PI * 2); g.fill();
      g.fillStyle = '#b8891f'; g.beginPath(); g.ellipse(mx, my, H * 0.0145, H * 0.0062, 0, 0, PI * 2); g.fill();
      g.fillStyle = '#d4a92e'; g.beginPath(); g.ellipse(mx, my, H * 0.0095, H * 0.004, 0, 0, PI * 2); g.fill();
      g.fillStyle = '#f5c518'; g.beginPath(); g.moveTo(mx - H * 0.008, my - H * 0.002); g.lineTo(mx + H * 0.002, my - H * 0.004); g.lineTo(mx + H * 0.005, my + H * 0.001); g.closePath(); g.fill();
    }
    coin(W * 0.103, H * 0.737); coin(W * 0.132, H * 0.760);
    // ---- brass candlestick + candle body ----
    var cwS = H * 0.017;
    poly([cx - H * 0.042, baseY, cx + H * 0.042, baseY, cx + H * 0.028, baseY - H * 0.016, cx - H * 0.028, baseY - H * 0.016], '#8a6a2a');
    poly([cx - H * 0.042, baseY, cx - H * 0.028, baseY - H * 0.016, cx - H * 0.008, baseY - H * 0.016, cx - H * 0.012, baseY], '#c9a34a');
    poly([cx + H * 0.042, baseY, cx + H * 0.028, baseY - H * 0.016, cx + H * 0.010, baseY - H * 0.016, cx + H * 0.016, baseY], '#5a4218');
    poly([cx - H * 0.008, baseY - H * 0.016, cx + H * 0.008, baseY - H * 0.016, cx + H * 0.006, trayY + H * 0.006, cx - H * 0.006, trayY + H * 0.006], '#8a6a2a');
    g.fillStyle = '#c9a34a'; g.fillRect(cx - H * 0.006, trayY + H * 0.006, H * 0.004, baseY - H * 0.022 - trayY);
    poly([cx - H * 0.026, trayY + H * 0.006, cx + H * 0.026, trayY + H * 0.006, cx + H * 0.018, trayY - H * 0.004, cx - H * 0.018, trayY - H * 0.004], '#8a6a2a');
    g.fillStyle = 'rgba(245,197,24,0.35)'; g.fillRect(cx - H * 0.024, trayY + H * 0.002, H * 0.014, H * 0.003);
    poly([cx - cwS, trayY - H * 0.004, cx, trayY - H * 0.004, cx, candleTop, cx - cwS, candleTop + H * 0.003], '#d9cbaa');
    poly([cx, trayY - H * 0.004, cx + cwS, trayY - H * 0.004, cx + cwS, candleTop + H * 0.003, cx, candleTop], '#bfae8c');
    poly([cx - cwS, candleTop + H * 0.003, cx - cwS * 0.4, candleTop - H * 0.004, cx + cwS * 0.5, candleTop - H * 0.003, cx + cwS, candleTop + H * 0.003, cx, candleTop + H * 0.006], '#e8dcc0');
    g.strokeStyle = '#241c12'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, candleTop); g.lineTo(cx + H * 0.002, candleTop - H * 0.008); g.stroke();
    // ---- ink pot (dark glass) ----
    poly([px - pr * 0.55, pT, px + pr * 0.55, pT, px + pr, pT + (pB - pT) * 0.45, px + pr * 0.8, pB, px - pr * 0.8, pB, px - pr, pT + (pB - pT) * 0.45], '#0e1216');
    poly([px - pr * 0.55, pT, px - pr, pT + (pB - pT) * 0.45, px - pr * 0.8, pB, px - pr * 0.35, pB, px - pr * 0.5, pT + (pB - pT) * 0.45, px - pr * 0.2, pT], '#1a2026');
    poly([px - pr * 0.5, pT - H * 0.006, px + pr * 0.5, pT - H * 0.006, px + pr * 0.55, pT + H * 0.002, px - pr * 0.55, pT + H * 0.002], '#2a3038');
    g.fillStyle = '#05070a'; g.beginPath(); g.ellipse(px, pT - H * 0.005, pr * 0.38, H * 0.004, 0, 0, PI * 2); g.fill();
    // ---- sand / dust specks in the pool ----
    for (var d = 0; d < 30; d++) {
      var ang = f.rnd(d + 300) * PI * 2, rad = Math.sqrt(f.rnd(d + 340));
      var sxp = cx + Math.cos(ang) * rad * W * 0.12;
      var syp = H * 0.70 + Math.sin(ang) * rad * H * 0.075;
      if (syp < deskY + H * 0.03) syp = deskY + H * 0.03;
      if (syp > yF - 4) syp = yF - 4;
      g.fillStyle = 'rgba(226,188,130,' + (0.10 + f.rnd(d + 380) * 0.18).toFixed(2) + ')';
      g.fillRect(sxp, syp, 2, 2);
    }
  });

  // ---------- warm light pool (half-res cached gradient) ----------
  var pw = (W / 2) | 0, ph = (H / 2) | 0;
  var pool = f.cache(K + 'pool', pw, ph, function (g) {
    g.save(); g.translate(cx / 2, H * 0.585 / 2); g.scale(1, 0.72);
    var rg = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.24);
    rg.addColorStop(0, 'rgba(255,196,110,0.42)');
    rg.addColorStop(0.16, 'rgba(255,152,31,0.27)');
    rg.addColorStop(0.4, 'rgba(206,110,32,0.13)');
    rg.addColorStop(0.72, 'rgba(128,66,22,0.05)');
    rg.addColorStop(1, 'rgba(128,66,22,0)');
    g.fillStyle = rg; g.fillRect(-W, -H * 2, W * 2, H * 4);
    g.restore();
  });

  // ---------- quill (cached, rotated per frame for the tap) ----------
  var qw = Math.max(48, (W * 0.09) | 0), qh = Math.max(70, (H * 0.21) | 0);
  var quill = f.cache(K + 'quill', qw, qh, function (g) {
    var tx = qw * 0.14, ty = qh * 0.94, ex = qw * 0.82, ey = qh * 0.07;
    var dx2 = ex - tx, dy2 = ey - ty, ln = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    var nx = -(dy2 / ln), ny = dx2 / ln;
    function P(t2) { return [tx + dx2 * t2, ty + dy2 * t2]; }
    var side = [1, -0.62], base = ['#e8e2d2', '#d5cdb8'], fA = ['#d8d0ba', '#c8bfa8'], fB = ['#cfc8b4', '#bdb49c'];
    for (var v = 0; v < 2; v++) {
      var s2 = side[v];
      g.beginPath();
      var a0 = P(0.30); g.moveTo(a0[0], a0[1]);
      for (var b = 0; b < 6; b++) {
        var tb = 0.36 + b * 0.115;
        var amp = ln * 0.15 * s2 * (0.55 + Math.sin((b + 1.5) / 7.5 * PI) * 0.65) * (0.8 + f.rnd(b + v * 7 + 3) * 0.4);
        var o1 = P(tb); g.lineTo(o1[0] + nx * amp, o1[1] + ny * amp);
        var o2 = P(tb + 0.05); g.lineTo(o2[0] + nx * amp * 0.55, o2[1] + ny * amp * 0.55);
      }
      var pe = P(1.0); g.lineTo(pe[0], pe[1]);
      g.closePath(); g.fillStyle = base[v]; g.fill();
      var pa = P(0.40), pm = P(0.52), pb2 = P(0.64);
      g.fillStyle = fA[v];
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pm[0] + nx * ln * 0.11 * s2, pm[1] + ny * ln * 0.11 * s2); g.lineTo(pb2[0], pb2[1]); g.closePath(); g.fill();
      pa = P(0.68); pm = P(0.80); pb2 = P(0.93);
      g.fillStyle = fB[v];
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pm[0] + nx * ln * 0.09 * s2, pm[1] + ny * ln * 0.09 * s2); g.lineTo(pb2[0], pb2[1]); g.closePath(); g.fill();
    }
    g.strokeStyle = '#c9c0a8'; g.lineWidth = Math.max(2, ln * 0.018);
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(ex, ey); g.stroke();
    var pn = P(0.07);
    g.fillStyle = '#241c12';
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(pn[0] + nx * 3, pn[1] + ny * 3); g.lineTo(pn[0] - nx * 3, pn[1] - ny * 3); g.closePath(); g.fill();
    g.fillStyle = '#0d1014'; g.fillRect(tx - 1.5, ty - 2, 3, 4);
  });

  // ---------- per-frame composite ----------
  ctx.globalAlpha = A * (0.15 + 0.85 * ein);
  ctx.drawImage(bg, 0, 0, W, H);

  // light pool: blooms with in01, flickers with the flame, dims with out01
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var ps = (0.55 + 0.45 * ein) * (0.97 + 0.05 * flick);
  ctx.globalAlpha = A * live * (0.72 + 0.28 * flick);
  ctx.translate(cx, H * 0.585); ctx.scale(ps, ps); ctx.translate(-cx, -H * 0.585);
  ctx.drawImage(pool, 0, 0, W, H);
  ctx.restore();

  // flame position + hot halo (layered translucent fills, no shadowBlur)
  var fx = cx + Math.sin(ms * 0.0016) * H * 0.0012;
  var fy = candleTop - H * 0.004;
  var fh = H * 0.055 * flameS * (0.88 + 0.24 * flick);
  var fw = H * 0.012 * (0.8 + 0.3 * flick);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var halos = [[0.075, 0.05], [0.042, 0.09], [0.02, 0.16]];
  for (i = 0; i < 3; i++) {
    ctx.globalAlpha = A * live * halos[i][1] * flick;
    ctx.fillStyle = '#ffcf7a';
    ctx.beginPath(); ctx.arc(fx, fy - fh * 0.45, H * halos[i][0] * (0.7 + 0.5 * flameS), 0, PI * 2); ctx.fill();
  }
  ctx.restore();

  // flame: 3 layered flat polygons, re-jittered every ~90ms
  function jj(kk) { return f.rnd((fi * 13 + kk) & 2047) - 0.5; }
  var sway = Math.sin(ms * 0.0021) * 0.5;
  function flamePoly(wm, hm, col, al) {
    var w3 = fw * wm, h3 = fh * hm;
    ctx.globalAlpha = A * al * (0.35 + 0.65 * ein);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(fx - w3, fy);
    ctx.lineTo(fx - w3 * (0.95 + jj(2) * 0.2), fy - h3 * 0.38);
    ctx.lineTo(fx - w3 * (0.55 + jj(3) * 0.25), fy - h3 * 0.74);
    ctx.lineTo(fx + (jj(1) * 1.4 + sway) * w3, fy - h3);
    ctx.lineTo(fx + w3 * (0.6 + jj(4) * 0.25), fy - h3 * 0.7);
    ctx.lineTo(fx + w3 * (0.98 + jj(5) * 0.2), fy - h3 * 0.35);
    ctx.lineTo(fx + w3, fy);
    ctx.closePath(); ctx.fill();
  }
  flamePoly(1, 1, f.gold, 0.88);
  flamePoly(0.66, 0.70, f.ember, 0.92);
  flamePoly(0.38, 0.40, f.red, 0.95);
  ctx.globalAlpha = A * 0.45 * ein;
  ctx.fillStyle = '#2b3a9e';
  ctx.beginPath(); ctx.moveTo(fx - fw * 0.4, fy); ctx.lineTo(fx, fy - fh * 0.12); ctx.lineTo(fx + fw * 0.4, fy); ctx.closePath(); ctx.fill();

  // slow wax-drip highlight on the candle face
  var dl = H * (0.016 + 0.014 * (0.5 + 0.5 * Math.sin(ms * 0.00035)));
  ctx.globalAlpha = A * 0.5 * ein;
  ctx.fillStyle = '#f0e6cc';
  ctx.beginPath();
  ctx.moveTo(cx + H * 0.012, candleTop + H * 0.004);
  ctx.lineTo(cx + H * 0.016, candleTop + H * 0.004);
  ctx.lineTo(cx + H * 0.0145, candleTop + H * 0.004 + dl);
  ctx.lineTo(cx + H * 0.0125, candleTop + H * 0.004 + dl * 0.85);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(cx + H * 0.0125, candleTop + H * 0.002 + dl, H * 0.003, H * 0.003);

  // sky pinpricks twinkling in the window
  var stars = [[0.132, 0.155], [0.172, 0.118], [0.19, 0.26]];
  for (i = 0; i < 3; i++) {
    ctx.globalAlpha = A * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(ms * 0.0016 + i * 2.4)));
    ctx.fillStyle = f.ice;
    ctx.fillRect(W * stars[i][0], H * stars[i][1], 2, 2);
  }

  // quill leaning on the ink pot; tip taps on a ~6s cycle
  var tp = (ms % 6100) / 6100;
  var tap = tp < 0.055 ? Math.sin(tp / 0.055 * PI) * 0.05 : 0;
  ctx.save();
  ctx.globalAlpha = A * (0.25 + 0.75 * ein);
  ctx.translate(W * 0.276, H * 0.663);
  ctx.rotate(0.02 + tap);
  ctx.drawImage(quill, -qw * 0.14, -qh * 0.94, qw, qh);
  ctx.restore();

  // ink-pot glass glint + coin facet glints
  ctx.globalAlpha = A * live * (0.18 + 0.10 * Math.sin(ms * 0.0011));
  ctx.fillStyle = f.ice;
  ctx.fillRect(W * 0.252, H * 0.626, Math.max(2, W * 0.002), H * 0.014);
  for (i = 0; i < 2; i++) {
    ctx.globalAlpha = A * live * 0.5 * (0.5 + 0.5 * Math.sin(ms * 0.0009 + i * 2.7));
    ctx.fillStyle = '#f5c518';
    var cc = i ? [W * 0.132, H * 0.760] : [W * 0.103, H * 0.737];
    ctx.fillRect(cc[0] - H * 0.004, cc[1] - H * 0.002, H * 0.006, H * 0.0025);
  }

  // dust motes drifting up through the candlelight
  for (i = 0; i < 25; i++) {
    var r1 = f.rnd(i + 41), r2 = f.rnd(i + 141), r3 = f.rnd(i + 241);
    var ph2 = (ms * (0.03 + r3 * 0.04) / 1000 + r2) % 1;
    var mx = cx + (r1 - 0.5) * W * 0.30 + Math.sin(ms * 0.0005 + i * 1.7) * W * 0.008;
    var my = H * (0.74 - 0.40 * ph2);
    var ddx = (mx - cx) / (W * 0.18), ddy = (my - H * 0.58) / (H * 0.26);
    var dd = 1 - Math.min(1, ddx * ddx + ddy * ddy);
    if (dd <= 0) continue;
    ctx.globalAlpha = A * live * flick * 0.55 * dd * Math.sin(ph2 * PI);
    ctx.fillStyle = '#ffd9a0';
    var msz = 1 + r1 * 1.6;
    ctx.fillRect(mx, my, msz, msz);
  }

  ctx.globalAlpha = GA;
}

PAINTERS[0] = paintCrystalArena;
PAINTERS[1] = paintGielinorFlyover;
PAINTERS[2] = paintWealthHalo;
PAINTERS[3] = paintDialMacro;
PAINTERS[4] = paintSchematicRealm;
PAINTERS[5] = paintCollectionHall;
PAINTERS[6] = paintCampfireFinale;

/* ---------- the actors: low-poly OSRS art, integrated from the art fleet ---------- */

const ACTORS = {};
function drawBlueDragon(ctx, a) {
  var hx = a.hexA || function (h) { return h; };
  var dead = a.dead || 0, live = 1 - dead;
  var R = (a.rear || 0) * live;
  var ms = a.ms || 0;
  var sway = a.sway || 0;
  var hurt = a.hurt || 0;
  var flapE = Math.max(0, Math.min(1, (a.flap || 0) * live + dead * 0.8));
  var jawE = Math.max(0, Math.min(1, (a.jaw || 0) + dead * 0.35));
  var sink = dead * 46;
  var yG = -sink; // ground line inside sunk body space
  var bodyRot = R * 0.62 - dead * 0.05 + Math.sin(ms * 0.0009) * 0.012 * live;
  var neckRot = R * 0.5 + sway * 0.07 + Math.sin(ms * 0.0011) * 0.04 * live - dead * 1.38;
  var headRot = R * 0.16 + sway * 0.05 + dead * 1.05;
  var jawAng = -jawE * 0.5;
  var swT = sway + Math.sin(ms * 0.0007) * 0.35 * live;
  // OSRS blue dragon palette
  var B0 = '#6fc7d4', B1 = '#7fd0dd', B2 = '#5cb4c4', B3 = '#4da8b8', B4 = '#3d92a2', B5 = '#357f8e';
  var M0 = '#8a8390', M1 = '#6e6875', M2 = '#5a5560';
  var K0 = '#e8e6d8', K1 = '#cfd4c8', K2 = '#b9bdb0';
  var Y0 = '#9a958f', Y1 = '#8a8478';
  var DK = '#152528', EYE = '#0a1113';
  var tintA = hurt * 0.55;

  function poly(shade, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = shade;
    ctx.fill();
    if (tintA > 0.01) { ctx.fillStyle = hx('#ffcdc0', tintA); ctx.fill(); } // white-red hit flash
  }
  function edge(x0, y0, x1, y1, al) {
    ctx.strokeStyle = hx('#1c3238', al); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  function rotP(x, y, ang) { var c = Math.cos(ang), s = Math.sin(ang); return { x: x * c - y * s, y: x * s + y * c }; }
  function fbone(x0, y0, x1, y1, w, shade) {
    var dx = x1 - x0, dy = y1 - y0, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / dl * w, ny = dx / dl * w;
    poly(shade, [x0 + nx, y0 + ny, x1 + nx * 0.5, y1 + ny * 0.5, x1 - nx * 0.5, y1 - ny * 0.5, x0 - nx, y0 - ny]);
  }
  function inBody(fn) { // torso group pivots at the hips when rearing
    ctx.save(); ctx.translate(74, -86); ctx.rotate(bodyRot); ctx.translate(-74, 86); fn(); ctx.restore();
  }

  function hindLeg(near) {
    var bx = near ? 70 : 94;
    var A = near ? B2 : B4, S = near ? B3 : B5, F = near ? B3 : B5, CL = near ? K0 : K1;
    var sx = dead * (near ? 14 : -6); // splay outward on collapse
    var kl = dead * 26;               // knees fold up as the body sinks
    poly(A, [bx - 26, -98, bx + 26, -92, bx + 32, -58 - kl * 0.4, bx + 10, -38 - kl, bx - 20, -62 - kl * 0.5]);
    poly(S, [bx + 6, -44 - kl, bx + 28, -52 - kl * 0.6, bx + sx + 32, yG - 8, bx + sx + 16, yG - 4]);
    poly(F, [bx + sx + 30, yG - 13, bx + sx + 36, yG - 3, bx + sx + 2, yG, bx + sx + 8, yG - 10]);
    poly(CL, [bx + sx + 9, yG - 9, bx + sx - 5, yG - 5, bx + sx + 8, yG - 5, bx + sx - 3, yG - 1, bx + sx + 8, yG - 1, bx + sx + 6, yG]);
  }

  function foreLeg(near) {
    var U = near ? B1 : B4, L = near ? B2 : B5, F = near ? B3 : B5, CL = near ? K0 : K1;
    ctx.save(); ctx.translate(-52, -92); ctx.rotate(R * 0.55 * (near ? 1 : 0.8)); // tucks when reared
    var fy = yG + 92;
    poly(U, [-10, -8, 10, -4, 12, 26, -4, 30]);
    poly(L, [-4, 24, 12, 20, 10, fy - 8, -6, fy - 4]);
    poly(F, [8, fy - 11, 14, fy - 2, -16, fy, -10, fy - 9]);
    poly(CL, [-9, fy - 8, -20, fy - 4, -8, fy - 4, -18, fy, -8, fy]);
    ctx.restore();
  }

  function wing(near) {
    var mem = near ? M0 : M1, memD = near ? M2 : '#4e4a55', bone = near ? K1 : K2;
    var px = near ? -14 : 4, py = near ? -114 : -118;
    var wr = (near ? 1 : 0.92) * (0.52 - 0.85 * flapE) + Math.sin(ms * 0.0013 + (near ? 0 : 0.7)) * 0.03 * live + dead * 0.5;
    ctx.save(); ctx.translate(px, py); ctx.rotate(wr); // shoulder pivot
    var wx = 24, wy = -30, fold = 1 - flapE;
    var A0 = -1.28 + 0.75 * fold, A1 = -0.78 + 0.42 * fold, A2 = -0.3 + 0.1 * fold;
    var t0x = wx + 86 * Math.cos(A0), t0y = wy + 86 * Math.sin(A0);
    var t1x = wx + 98 * Math.cos(A1), t1y = wy + 98 * Math.sin(A1);
    var t2x = wx + 88 * Math.cos(A2), t2y = wy + 88 * Math.sin(A2);
    function sagx(px2, qx) { return (px2 + qx) / 2 + (wx - (px2 + qx) / 2) * 0.24; }
    function sagy(py2, qy) { return (py2 + qy) / 2 + (wy - (py2 + qy) / 2) * 0.24; }
    poly(mem, [0, 0, wx, wy, t0x, t0y, sagx(t0x, t1x), sagy(t0y, t1y), t1x, t1y, sagx(t1x, t2x), sagy(t1y, t2y), t2x, t2y, 14, 28]);
    poly(hx(memD, 0.55), [wx, wy, t0x, t0y, sagx(t0x, t1x), sagy(t0y, t1y), t1x, t1y]); // facet shade panel
    fbone(wx, wy, t0x, t0y, 2.2, bone);
    fbone(wx, wy, t1x, t1y, 2.2, bone);
    fbone(wx, wy, t2x, t2y, 2.2, bone);
    poly(bone, [-2, -3, wx - 2, wy - 4, wx + 4, wy + 2, 4, 3]); // arm bone
    ctx.restore();
  }

  function tail() {
    ctx.save(); ctx.translate(96, -86);
    ctx.rotate(0.14 + swT * 0.10);
    poly(K1, [4, -13, 12, -23, 19, -12, 27, -21, 33, -11, 41, -19, 46, -10, 46, -8, 4, -11]); // ridge spikes
    poly(B2, [0, -15, 52, -11, 52, 11, 0, 15]);
    ctx.translate(52, 0); ctx.rotate(0.13 + swT * 0.13);
    poly(K1, [3, -9, 10, -17, 16, -8, 23, -15, 29, -7, 35, -13, 40, -5, 40, -3, 3, -7]);
    poly(B0, [0, -11, 46, -6, 46, 6, 0, 11]);
    ctx.translate(46, 0); ctx.rotate(0.15 + swT * 0.16);
    poly(K0, [2, -5, 8, -11, 13, -4, 19, -9, 24, -2, 42, -1, 24, 1, 2, -3]);
    poly(B3, [0, -6, 30, -3, 50, 0, 30, 4, 0, 6]);
    ctx.restore();
  }

  function torso() {
    // back spikes first so the body covers their roots
    poly(K1, [98, -102, 86, -118, 72, -108, 58, -126, 44, -116, 28, -142, 12, -128, -6, -142, -22, -126, -38, -136, -46, -120, -44, -118, 26, -126, 98, -100]);
    poly(B1, [100, -104, 26, -130, -44, -124, -36, -92, 58, -88]);   // upper back
    poly(B0, [-44, -124, -74, -108, -72, -86, -36, -92]);            // shoulder
    poly(B2, [-36, -92, -72, -86, -66, -58, -6, -48, 66, -58, 58, -88]); // lower mass
    poly(B3, [100, -104, 58, -88, 66, -58, 102, -70]);               // haunch mass
    poly(B2, [-74, -108, -80, -84, -72, -86]);                       // chest keel
    var br = Math.sin(ms * 0.0019) * 1.5 * live; // breathing
    ctx.save(); ctx.translate(0, br);
    poly(Y0, [-64, -58, -24, -49, -22, -60, -60, -70]);
    poly(Y1, [-24, -49, 16, -47, 16, -58, -22, -60]);
    poly(Y0, [16, -47, 56, -52, 54, -63, 16, -58]);
    poly(Y1, [56, -52, 96, -64, 92, -74, 54, -63]);
    ctx.restore();
    edge(-44, -124, 26, -130, 0.2); edge(26, -130, 100, -104, 0.16);
  }

  function neckHead() {
    ctx.save(); ctx.translate(-64, -104); ctx.rotate(neckRot); // neck base pivot
    poly(B2, [14, 0, -12, -34, -40, -22, -16, 10]);
    poly(B1, [-12, -34, -38, -66, -58, -52, -40, -22]);
    poly(Y0, [-16, 10, -28, -6, -36, -1, -22, 13]);   // throat plates
    poly(Y1, [-28, -6, -40, -22, -49, -16, -36, -1]);
    poly(Y0, [-40, -22, -54, -46, -62, -40, -49, -16]);
    edge(14, 0, -38, -66, 0.16);
    ctx.save(); ctx.translate(-48, -59); ctx.rotate(headRot); // head pivot at neck top
    poly(K1, [-8, -20, 20, -38, 24, -33, -4, -15]);   // far horn
    poly(K2, [14, -10, 36, -16, 16, -2]);             // far cheek frill
    poly(B1, [10, -24, -12, -26, -34, -14, -8, -8]);  // skull top
    poly(B0, [-34, -14, -56, -6, -58, 1, -30, 3, -8, -8]); // snout
    poly(B2, [10, -24, -8, -8, -30, 3, -6, 9, 14, 0]);     // cheek
    var jt = rotP(-50, 4, jawAng);
    poly(DK, [2, 3, -48, 1, 2 + jt.x, 4 + jt.y]);     // mouth interior
    ctx.save(); ctx.translate(2, 4); ctx.rotate(jawAng); // jaw group
    poly(B3, [0, 0, -46, 2, -50, 8, -24, 13, -2, 9]);
    poly(K0, [-6, 2, -11, -4, -16, 3, -22, -3, -27, 3, -33, -2, -38, 3, -38, 5, -6, 5]); // lower teeth
    ctx.restore();
    poly(K0, [-8, 2, -12, 9, -17, 2, -23, 8, -28, 2, -35, 7, -40, 2, -40, 0, -8, 0]); // upper teeth
    poly(DK, [-52, -3, -56, 0, -49, 0]);              // nostril
    poly(K1, [12, -4, 34, -8, 14, 4]);                // near frills
    poly(K1, [10, 3, 28, 10, 8, 9]);
    poly(K0, [-2, -19, 30, -37, 34, -31, 4, -13]);    // near brow horn
    poly(hx(EYE, 1 - dead * 0.6), [-16, -13, -7, -15, -5, -11, -14, -9]); // eye
    edge(-8, -8, -56, -6, 0.22);
    ctx.restore();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(a.x, a.y);
  var sc = a.s || 1;
  ctx.scale((a.dir || 1) * sc, sc); // dir 1 faces left (-x)
  ctx.translate(0, sink);           // whole rig sinks on death; feet pinned to yG
  hindLeg(false);                                        // far hind leg
  inBody(function () { foreLeg(false); wing(false); });  // far foreleg + far wing
  tail();                                                // tail behind body
  inBody(torso);                                         // body mass + belly + spikes
  hindLeg(true);                                         // near hind leg
  inBody(function () { neckHead(); foreLeg(true); wing(true); }); // neck/head, near foreleg, near wing
  ctx.restore();
}

function drawRangerHero(ctx, a) {
  var M = Math;
  function c01(v) { return v > 1 ? 1 : (v > 0 ? v : 0); }
  var ms = a.ms || 0;
  var s = (a.s == null ? 1 : a.s);
  var dir = (a.dir == null ? 1 : (a.dir < 0 ? -1 : 1));
  var d = c01(a.draw || 0), fi = c01(a.fire || 0), hu = c01(a.hurt || 0), rl = c01(a.roll || 0);
  var st = a.step || 0; if (st > 1) st = 1; if (st < -1) st = -1;
  var hexA = a.hexA;

  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(s * dir, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var GA = ctx.globalAlpha;

  // ---- roll state: tuck ball, 360 rotation, ~60px backward travel ----
  var ballA = 0;
  if (rl > 0.02 && rl < 0.995) {
    if (rl < 0.1) ballA = (rl - 0.02) / 0.08;            // duck into the tuck
    else if (rl >= 0.85) ballA = 1 - (rl - 0.85) / 0.15; // unroll
    else ballA = 1;
  }
  var standA = 1 - ballA;
  var rr = rl * rl * (3 - 2 * rl);
  var dxR = -60 * rr;                     // backward displacement (local -x)
  var hop = -M.sin(M.PI * rl) * 13;       // arc of the roll
  var cr = (standA > 0.01 && standA < 0.99) ? ballA : 0; // crouch while tucking/unrolling

  var OV = null; // hurt-flash tint override
  function P(pts, col) {
    ctx.fillStyle = OV || col;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  }
  function L(x1, y1, x2, y2, col, w) {
    ctx.strokeStyle = OV || col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ---- ground shadow (layered translucent, no shadowBlur) ----
  var hopK = -hop / 13;
  ctx.fillStyle = hexA('#000000', 0.15 * (1 - 0.5 * hopK));
  ctx.beginPath();
  ctx.ellipse(dxR + 2, -1.5, 28 - 6 * hopK, 5.5, 0, 0, M.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexA('#000000', 0.2 * (1 - 0.5 * hopK));
  ctx.beginPath();
  ctx.ellipse(dxR + 2, -1.5, 17 - 4 * hopK, 3.6, 0, 0, M.PI * 2);
  ctx.fill();

  // ---- heavy leg: thick faceted thigh/shin, wide solid boot ----
  function leg(hx, hy, fx, thA, thB, shA, btTop, btSide, lift) {
    var kx = (hx + fx) / 2 + 4, ky = -27 - lift * 0.5;
    var by = -lift;
    P([hx - 6, hy, hx + 6, hy, kx + 4.5, ky, kx - 4.5, ky], thA);                                   // thigh mass
    P([hx + 2, hy, hx + 6, hy, kx + 4.5, ky, kx + 1.5, ky], thB);                                   // thigh front facet
    P([kx - 4, ky, kx + 4, ky, fx + 3.5, -10 - lift, fx - 3.5, -10 - lift], shA);                   // shin
    P([fx - 5, -14 + by, fx + 5.5, -14 + by, fx + 6.5, -5 + by, fx - 6, -5 + by], btSide);          // boot cuff
    P([fx - 7, -6 + by, fx + 7, -6 + by, fx + 12, -2 + by, fx + 11, by, fx - 7, by], btTop);        // boot body
    P([fx + 7, -6 + by, fx + 12, -2 + by, fx + 7, -2.5 + by], btSide);                              // toe facet
  }

  function figure() {
    var brA = 1 - 0.6 * M.max(d, fi);
    var uy = M.sin(ms * 0.0021) * 1.4 * brA + cr * 3;   // breathing bob
    var sway = M.sin(ms * 0.0016);
    var sx = st * 5 + d * 3 + fi * 4;                   // shoulder lean shift
    var shY = -90 + uy + cr * 10;
    var hipY = -52 + cr * 5;

    // bow anchor (computed early; limbs drawn split around the body)
    var gx = 34 + d * 2 + fi * 4 + sx * 0.3;
    var gy = -76 - d * 8 - fi * 5 + uy + cr * 9;
    var fl = d > 0.02 ? d : -0.15 * M.sin(M.PI * fi);   // limb flex / release snap
    var Tx = gx - 3 - 9 * fl, Ty = gy - 56 + 3 * fl;    // top string nock
    var Bx = gx - 4 - 8 * fl, By = gy + 52 - 3 * fl;    // bottom string nock

    function bowLimb(sg, tipX, tipY) {                  // sg: -1 up, +1 down
      P([gx + 6, gy + sg * 8,
         gx + 12 - fl * 3, gy + sg * 26,
         gx + 5 - fl * 6, gy + sg * 40,
         tipX + 5, tipY - sg * 6,
         tipX + 7, tipY + sg * 4,                       // recurve tip flick
         tipX, tipY,
         tipX, tipY - sg * 9,
         gx - 1 - fl * 6, gy + sg * 38,
         gx + 6 - fl * 3, gy + sg * 25,
         gx, gy + sg * 7], '#6d4f28');
      P([gx + 1, gy + sg * 8,
         gx + 7 - fl * 3, gy + sg * 25,
         gx + 9 - fl * 3, gy + sg * 24,
         gx + 3, gy + sg * 7], '#8a6a38');              // belly highlight facet
    }

    // ---- 1. far leg ----
    leg(-4, hipY, -12 - st * 10, '#221c17', '#2a231d', '#1b1613', '#588a30', '#3f6423', st > 0 ? st * 3 : 0);

    // ---- 2. far arm + bow rear (lower) limb ----
    P([sx, shY - 7, sx + 9, shY - 1, 22, gy + 2, 20, gy - 6], '#2a221c');                    // upper arm mass
    P([20, gy - 6, gx - 1, gy - 5.5, gx, gy + 4, 21, gy + 3.5], '#4d7a2a');                  // vambrace
    P([20, gy - 6, gx - 1, gy - 5.5, gx - 1, gy - 2.5, 20, gy - 3.5], '#6fae3d');            // vambrace top facet
    bowLimb(1, Bx, By);                                                                       // rear limb
    P([gx - 1, gy - 10, gx + 7, gy - 9, gx + 7, gy + 9, gx - 1, gy + 10], '#241f1a');        // grip wrap
    P([gx - 2, gy - 5.5, gx + 6, gy - 5, gx + 6, gy + 5, gx - 2, gy + 5.5], '#c8956c');      // far hand

    // ---- 3. wide cape (3 facets, sways on ms) ----
    var cw = sway * 3.5 - st * 4 - fi * 2;
    P([sx - 12, shY - 5, sx + 3, shY - 8, -2 + cw * 0.4, -42, -20 + cw, -36], '#241f1a');
    P([-20 + cw, -36, -2 + cw * 0.4, -42, -6 + cw * 1.2, -9, -30 + cw * 1.6, -6], '#15131a');
    P([sx + 3, shY - 8, -2 + cw * 0.4, -42, 2 + cw * 0.6, -12, -6 + cw * 1.2, -9], '#1c1815');

    // ---- 4. torso: solid Masori mass + layered pads ----
    P([sx - 13, shY - 3, sx - 4, shY - 8, -2, hipY + 1, -11, hipY + 1], '#282019');          // back facet
    P([sx - 4, shY - 8, sx + 13, shY - 4, 14, -68 + cr * 4, 10, hipY + 1, -2, hipY + 1], '#332a24'); // chest mass
    P([sx + 9, shY - 3, sx + 12, shY + 2, -6, hipY - 4, -9, hipY - 8], '#d2a13c');           // gold strap
    P([sx + 9, shY - 3, sx + 12, shY + 2, sx + 4, shY + 4, sx + 2, shY - 0.5], '#a87f19');   // strap dark step
    P([sx - 15, shY - 7, sx - 5, shY - 9, sx - 4, shY - 2, sx - 14, shY], '#2c241e');        // far shoulder pad
    P([sx, shY - 4, sx + 14, shY - 2, sx + 15, shY + 6, sx + 2, shY + 4], '#2c241e');        // near pad under-layer
    P([sx - 3, shY - 10, sx + 13, shY - 7, sx + 15, shY + 1, sx + 1, shY + 1], '#3a2f26');   // near pad main
    P([sx - 3, shY - 10, sx + 13, shY - 7, sx + 12.5, shY - 4.5, sx - 3, shY - 7.5], '#d2a13c'); // pad gold trim
    P([-11, hipY, 11, hipY, 11, hipY + 4, -11, hipY + 4], '#241f1a');                        // belt
    P([-2, hipY, 3, hipY, 3, hipY + 4, -2, hipY + 4], '#d2a13c');                            // buckle

    // ---- 5. quiver over the shoulder, bone-fletched tips ----
    P([-5, -60 + cr * 4, -14, -64 + cr * 4, -21, shY - 6, -12, shY - 4], '#3e3226');
    P([-21, shY - 6, -12, shY - 4, -13, shY - 11, -20, shY - 12], '#5a4632');
    for (var q = 0; q < 3; q++) {
      var qx = -19 + q * 3, qy = shY - 11 - q * 0.6;
      L(qx, qy, qx - 3, qy - 11, '#7a5c3e', 1.4);
      P([qx - 3, qy - 11, qx - 6.5, qy - 16, qx - 0.5, qy - 14.5, qx - 0.8, qy - 12], '#e8e6d8');
    }

    // ---- 6. near leg ----
    leg(5, hipY, 11 + st * 10, '#2f2722', '#3a3129', '#262019', '#6fae3d', '#4d7a2a', st < 0 ? -st * 3 : 0);

    // ---- 7. big hood: swept peak, gold crest, mask, red eye slit ----
    var hbx = sx + 2 + d * 1.5, hby = -108 + uy + cr * 10;
    P([hbx - 4, shY - 2, hbx + 7, shY - 2, hbx + 6, hby + 10, hbx - 3, hby + 10], '#1d1a19'); // neck
    P([hbx - 4, hby - 15, hbx - 16, hby - 13, hbx - 27, hby - 5, hbx - 14, hby - 2, hbx - 7, hby + 6], '#1d1a19'); // swept peak
    P([hbx + 12, hby + 9, hbx + 15, hby - 2, hbx + 9, hby - 13, hbx - 2, hby - 16, hbx - 13, hby - 12, hbx - 14, hby - 2, hbx - 8, hby + 8], '#26221f'); // hood dome
    P([hbx + 12, hby + 9, hbx + 15, hby - 2, hbx + 9, hby - 13, hbx + 4, hby - 6, hbx + 6, hby + 6], '#2c2723'); // front facet
    P([hbx + 9, hby - 13, hbx - 2, hby - 16, hbx - 13, hby - 12, hbx - 24, hby - 6, hbx - 19, hby - 6, hbx - 11, hby - 10.5, hbx - 2, hby - 13, hbx + 8, hby - 10.5], '#d9a821'); // gold crest
    P([hbx - 2, hby - 16, hbx - 13, hby - 12, hbx - 11, hby - 10.5, hbx - 2, hby - 13], '#a87f19'); // crest dark step
    P([hbx + 14, hby + 7, hbx + 15, hby - 2, hbx + 10, hby - 9, hbx + 5, hby - 3, hbx + 6, hby + 6], '#171412'); // hood shadow
    P([hbx + 14, hby + 7, hbx + 5, hby + 6, hbx + 4, hby + 1, hbx + 13, hby + 2], '#26221f');       // face mask
    P([hbx + 13.5, hby - 3.6, hbx + 5.5, hby - 3, hbx + 5.5, hby - 1, hbx + 13.5, hby - 1.6], '#d93025'); // eye slit
    P([hbx + 12, hby - 3.2, hbx + 7, hby - 2.8, hbx + 7, hby - 1.7, hbx + 12, hby - 2.1], hexA('#ff6b4a', 0.5 + 0.2 * M.sin(ms * 0.006))); // slit glow

    // ---- 8. near arm: reach string, pull to cheek + string + arrow ----
    var cheekX = hbx + 7, cheekY = hby + 7;
    var hx, hy;
    if (fi > 0.05) {                                       // follow-through
      hx = sx - 5 - 7 * fi; hy = cheekY - 1 + 2 * fi;
    } else if (d <= 0.02) {                                // rest at hip
      hx = 13 + sway * 0.5; hy = -62 + uy;
    } else if (d < 0.25) {                                 // reach for string
      var k1 = (d - 0.02) / 0.23;
      hx = 13 + (gx - 6 - 13) * k1; hy = (-62 + uy) + ((gy + 1) - (-62 + uy)) * k1;
    } else {                                               // pull to cheek
      var k2 = (d - 0.25) / 0.75;
      hx = (gx - 6) + (cheekX - (gx - 6)) * k2; hy = (gy + 1) + (cheekY - (gy + 1)) * k2;
    }
    var ex = hx - 8 - d * 5, ey = hy - 3 - d * 4;
    P([sx - 1, shY - 3, sx + 7, shY + 2, ex + 3, ey + 4, ex - 3, ey - 3], '#2f2822');        // upper arm mass
    P([ex - 3, ey - 3.5, hx - 1, hy - 4, hx + 1, hy + 3.5, ex - 2, ey + 4.5], '#4d7a2a');    // vambrace
    P([ex - 3, ey - 3.5, hx - 1, hy - 4, hx - 1, hy - 1.5, ex - 3, ey - 1], '#6fae3d');      // top facet
    P([hx - 1.5, hy - 3.5, hx + 5, hy - 3, hx + 5, hy + 3, hx - 1.5, hy + 3.5], '#c8956c');  // hand

    ctx.strokeStyle = OV || '#cfc4a6';
    ctx.lineWidth = 1.2;
    if (d > 0.02 && fi <= 0.05) {
      var nx = hx + 3, ny = hy - 0.5;
      ctx.beginPath(); ctx.moveTo(Tx, Ty); ctx.lineTo(nx, ny); ctx.lineTo(Bx, By); ctx.stroke(); // string V
      var rx0 = gx + 1, ry0 = gy - 10;                    // arrow rest above grip
      var tpx = gx + 22;
      var tt = (tpx - nx) / (rx0 - nx || 1);
      var tpy = ny + (ry0 - ny) * tt;
      L(nx, ny, tpx, tpy, '#7a5c3e', 1.8);                                // shaft
      P([tpx, tpy - 3, tpx + 7, tpy, tpx, tpy + 3], '#cfd4c8');           // head
      P([nx + 1, ny, nx + 8, ny - 4, nx + 10, ny - 0.5], '#e8e6d8');      // bone fletch
      P([nx + 1, ny, nx + 8, ny + 4, nx + 10, ny + 0.5], '#cfd4c8');
    } else {
      var wob = M.sin(ms * 0.12) * 3 * fi;                // string vibrates after release
      ctx.beginPath(); ctx.moveTo(Tx, Ty);
      ctx.quadraticCurveTo((Tx + Bx) / 2 - 1 - wob, (Ty + By) / 2, Bx, By);
      ctx.stroke();
    }

    // ---- 9. bow front (upper) limb over everything ----
    bowLimb(-1, Tx, Ty);

    // ---- release flash at the arrow point ----
    if (fi > 0.03) {
      var fx0 = gx + 18, fy0 = gy - 9, ff = fi;
      P([fx0 - 4, fy0, fx0 + 5, fy0 - 10, fx0 + 22, fy0, fx0 + 5, fy0 + 10], hexA('#e8a33d', 0.16 * ff));
      P([fx0 - 2, fy0, fx0 + 5, fy0 - 5.5, fx0 + 14, fy0, fx0 + 5, fy0 + 5.5], hexA('#d96f26', 0.3 * ff));
      P([fx0, fy0, fx0 + 4.5, fy0 - 2.4, fx0 + 9, fy0, fx0 + 4.5, fy0 + 2.4], hexA('#ffe9b8', 0.55 * ff));
      L(fx0 + 9, fy0, fx0 + 28 + 14 * ff, fy0, hexA('#e8a33d', 0.35 * ff), 1.3);
    }
  }

  // ---- tucked ball for the dodge roll: hood + cape wrapped tight ----
  function ball() {
    var by = -25 + hop, R = 25;
    ctx.save();
    ctx.translate(0, by);
    ctx.rotate(-M.PI * 2 * rl);
    var KP = [0, -1, 0.71, -0.71, 1, 0, 0.71, 0.71, 0, 1, -0.71, 0.71, -1, 0, -0.71, -0.71];
    var KC = ['#26221f', '#1d1a19', '#241f1a', '#15131a', '#26221f', '#1d1a19', '#241f1a', '#15131a'];
    for (var i = 0; i < 8; i++) {
      var j = (i + 1) % 8;
      P([0, 0, KP[i * 2] * R, KP[i * 2 + 1] * R, KP[j * 2] * R, KP[j * 2 + 1] * R], KC[i]);
    }
    P([KP[0] * R, KP[1] * R, KP[2] * R, KP[3] * R, KP[2] * R * 0.8, KP[3] * R * 0.8, KP[0] * R * 0.8, KP[1] * R * 0.8], '#d9a821'); // crest arc
    P([KP[8] * R * 0.9, KP[9] * R * 0.9, KP[10] * R * 0.9, KP[11] * R * 0.9, KP[10] * R * 0.55, KP[11] * R * 0.55, KP[8] * R * 0.55, KP[9] * R * 0.55], '#4d7a2a'); // boots tuck
    P([-R * 0.8, R * 0.55, R * 0.8, -R * 0.5, R * 0.74, -R * 0.64, -R * 0.86, R * 0.42], '#6d4f28'); // tucked bow
    L(-R * 0.72, R * 0.44, R * 0.72, -R * 0.58, '#8a6a38', 1.1);
    P([R * 0.35, -R * 0.15, R * 0.62, -R * 0.2, R * 0.62, -R * 0.08, R * 0.35, -R * 0.05], '#d93025'); // eye slit
    P([-R * 0.55, R * 0.1, -R * 0.8, R * 0.28, -R * 0.62, R * 0.32], '#e8e6d8');                        // bone tips
    ctx.restore();
    // dust kicked up behind the roll
    var da = ballA;
    var dp = (ms * 0.02) % 10;
    P([16 + dp, -2, 22 + dp, -7, 28 + dp, -3, 22 + dp, 0], hexA('#7a5c3e', 0.18 * da));
    P([30 + dp * 1.4, -1, 35 + dp * 1.4, -5, 40 + dp * 1.4, -2, 35 + dp * 1.4, 0], hexA('#5a4632', 0.14 * da));
  }

  ctx.translate(dxR, 0);
  if (standA > 0.01) {
    ctx.globalAlpha = GA * standA;
    figure();
    if (hu > 0.01) {                       // hurt: flat red re-fill of the figure
      ctx.globalAlpha = GA * standA * hu * 0.5;
      OV = hexA('#ff4430', 1);
      figure();
      OV = null;
    }
  }
  if (ballA > 0.01) {
    ctx.globalAlpha = GA * ballA;
    ball();
    if (hu > 0.01) {
      ctx.globalAlpha = GA * ballA * hu * 0.5;
      OV = hexA('#ff4430', 1);
      ball();
      OV = null;
    }
  }
  ctx.restore();
}


ACTORS.dragon = drawBlueDragon;
ACTORS.ranger = drawRangerHero;

/* ---------- scene 0: the boss fight — Marcus vs Deacon the Blue ---------- */

const BSPLAT = [
  '.......d.......', '...d...dd......', '...dd.drrd..d..', '....drrrrd.dd..', '..ddrrrrrrddd..',
  '.d.rrrrrrrrrd..', '..drrrrrrrrrdd.', 'ddrrrrrrrrrrrdd', '..drrrrrrrrrd..', '.ddrrrrrrrrrd.d',
  '..drrrrrrrrdd..', '...drrrrrrd....', '..dd.drrd.dd...', '.d....dd...d...', '.......d.......',
];
function drawSplatPx(x, y, cell, gold) {
  const r = gold ? '#d9a821' : '#c0281a', d = gold ? '#8a6d1d' : '#6f100a';
  for (let ry = 0; ry < 15; ry++) {
    for (let rx = 0; rx < 15; rx++) {
      const ch = BSPLAT[ry][rx];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'r' ? r : d;
      ctx.fillRect(x + rx * cell, y + ry * cell, cell, cell);
    }
  }
}

// the dragon's facet art uses translucent fills — composite it offscreen so the
// world never bleeds through its body
let dScratch = null, dsCtx = null;
function drawDragonOpaque(args) {
  if (!ACTORS.dragon) return;
  if (!dScratch || dScratch.width !== filmCanvas.width) {
    dScratch = document.createElement('canvas');
    dScratch.width = filmCanvas.width;
    dScratch.height = filmCanvas.height;
    dsCtx = dScratch.getContext('2d');
  }
  dsCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dsCtx.clearRect(0, 0, W, H);
  ACTORS.dragon(dsCtx, args);
  ctx.drawImage(dScratch, 0, 0, W, H);
}

const boss = { hp: 255, maxHp: 255, dead: 0, deadT: 0, rear: 0, jaw: 0, hurt: 0, nextBreath: 0, breathHit: false };
const champ = { draw: 0, fire: 0, roll: 0, rollT: -9e9, hurt: 0, shotT: 0 };
let bArrows = [], bSplats = [], bFlames = [], bSparks = [];
let shakeB = 0, specAt = 0, lootT = -9e9;

const groundY = () => H * 0.72;
const fightScale = () => Math.max(0.5, Math.min(1.2, Math.min(W / 1500, H / 950)));
const bossX = () => W * 0.66;
const champX = now => W * 0.34 + Math.sin(now / 2600) * W * 0.012;

function mouthPos(now) {
  const s = fightScale();
  return { x: bossX() - (150 + boss.rear * 55) * s, y: groundY() - (85 + boss.rear * 125) * s };
}

function fireArrow(now, spec) {
  const s = fightScale();
  bArrows.push({
    sx: champX(now) + 34 * s, sy: groundY() - 66 * s,
    tx: bossX() - (60 + Math.random() * 70) * s, ty: groundY() - (70 + Math.random() * 55) * s,
    t0: now, dur: 520, spec: !!spec,
    dmg: spec ? 13 + (Math.random() * 8 | 0) : Math.random() < 0.12 ? 0 : 3 + (Math.random() * 10 | 0),
  });
}

function updateBoss(now, dt) {
  const s = fightScale();
  if (boss.dead > 0) {
    boss.dead = Math.min(1, (now - boss.deadT) / 1100);
    boss.rear = Math.max(0, boss.rear - dt / 300);
    boss.jaw = Math.max(0, boss.jaw - dt / 300);
    if (now - boss.deadT > 4200) { boss.hp = boss.maxHp; boss.dead = 0; boss.nextBreath = now + 2600; }
  } else {
    if (!boss.nextBreath) boss.nextBreath = now + 3600;
    const bt = now - boss.nextBreath;
    if (bt > 0 && bt < 2000) {
      boss.rear = Math.min(1, bt / 520);
      boss.jaw = clamp01((bt - 320) / 280);
      if (bt > 600 && bt < 1650) {
        const m = mouthPos(now);
        for (let i = 0; i < 3; i++) {
          const dx = (champX(now) + 10) - m.x, dy = (groundY() - 46 * s) - m.y;
          const L = Math.hypot(dx, dy) || 1;
          const sp = (7 + Math.random() * 3) * s;
          bFlames.push({
            x: m.x, y: m.y,
            vx: dx / L * sp + (Math.random() - 0.5) * 1.2,
            vy: dy / L * sp + (Math.random() - 0.5) * 1.6,
            life: 1, size: (5 + Math.random() * 7) * s,
          });
        }
        if (!boss.breathHit && bt > 860) {
          boss.breathHit = true;
          if (window.__clog) window.__clog('spec-deacon');
          if (Math.random() < 0.72) {
            champ.rollT = now; // dodged through the flames
          } else {
            champ.hurt = 1;
            bSplats.push({ x: champX(now), y: groundY() - 92 * s, t0: now, dmg: 4 + (Math.random() * 9 | 0), gold: false });
            shakeB = Math.min(1.2, shakeB + 0.6);
          }
        }
      }
    } else if (bt >= 2000) {
      boss.nextBreath = now + 4600 + Math.random() * 2800;
      boss.breathHit = false;
    } else {
      boss.rear = Math.max(0, boss.rear - dt / 480);
      boss.jaw = Math.max(0, boss.jaw - dt / 320);
    }
  }
  boss.hurt = Math.max(0, boss.hurt - dt / 260);
  champ.hurt = Math.max(0, champ.hurt - dt / 380);

  const rollAge = now - champ.rollT;
  champ.roll = rollAge > 0 && rollAge < 680 ? rollAge / 680 : 0;
  if (!champ.shotT) champ.shotT = now + 700;
  const sAge = now - champ.shotT;
  if (sAge > 0 && champ.roll === 0 && boss.dead === 0) {
    if (sAge < 430) {
      champ.draw = sAge / 430;
    } else {
      fireArrow(now, false);
      champ.fire = 1;
      champ.draw = 0;
      champ.shotT = now + 1250 + Math.random() * 500;
    }
  }
  champ.fire = Math.max(0, champ.fire - dt / 180);

  for (let i = bArrows.length - 1; i >= 0; i--) {
    const a2 = bArrows[i];
    if (now - a2.t0 < a2.dur) continue;
    bArrows.splice(i, 1);
    if (boss.dead > 0) continue;
    bSplats.push({ x: a2.tx, y: a2.ty - 14, t0: now, dmg: a2.dmg, gold: a2.spec });
    if (a2.dmg > 0) {
      boss.hurt = 1;
      boss.hp = Math.max(0, boss.hp - a2.dmg);
      if (a2.spec) shakeB = Math.min(1.3, shakeB + 0.7);
      for (let k = 0; k < (a2.spec ? 14 : 6); k++) {
        bSparks.push({ x: a2.tx, y: a2.ty, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 1, col: a2.spec ? '#ffd23f' : '#e67e22' });
      }
      if (boss.hp <= 0) {
        boss.dead = 0.001;
        boss.deadT = now;
        lootT = now;
        shakeB = 1.4;
        if (window.__clog) { window.__clog('duel-death'); window.__clog('duel-won'); }
      }
    }
  }
  for (let i = bFlames.length - 1; i >= 0; i--) {
    const p2 = bFlames[i];
    p2.x += p2.vx; p2.y += p2.vy; p2.vy -= 0.03; p2.life -= dt / 620;
    if (p2.life <= 0) bFlames.splice(i, 1);
  }
  for (let i = bSparks.length - 1; i >= 0; i--) {
    const p2 = bSparks[i];
    p2.x += p2.vx; p2.y += p2.vy; p2.vy += 0.12; p2.life -= dt / 520;
    if (p2.life <= 0) bSparks.splice(i, 1);
  }
  bSplats = bSplats.filter(s2 => now - s2.t0 < 820);
  shakeB *= 0.9;
}

function drawBossFight(now, alpha, t) {
  const s = fightScale();
  ctx.save();
  ctx.globalAlpha = alpha;
  // the camera leans in as the visitor scrolls through the scene
  const z = 1 + 0.18 * t;
  ctx.translate(W / 2, groundY());
  ctx.scale(z, z);
  ctx.translate(-W / 2, -groundY());
  if (shakeB > 0.02) ctx.translate((Math.random() - 0.5) * shakeB * 9, (Math.random() - 0.5) * shakeB * 6);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(bossX() - 40 * s, groundY() + 6, 170 * s, 22 * s, 0, 0, 6.2832); ctx.fill();
  ctx.beginPath(); ctx.ellipse(champX(now), groundY() + 5, 34 * s, 8 * s, 0, 0, 6.2832); ctx.fill();

  drawDragonOpaque({
    x: bossX(), y: groundY(), s, dir: 1, ms: now,
    flap: 0.5 + 0.5 * Math.sin(now / (boss.rear > 0.4 ? 420 : 1150)),
    rear: boss.rear, jaw: boss.jaw, sway: Math.sin(now / 1700),
    hurt: boss.hurt, dead: boss.dead, hexA,
  });
  if (ACTORS.ranger) {
    ACTORS.ranger(ctx, {
      x: champX(now), y: groundY(), s: s * 1.05, dir: 1, ms: now,
      draw: champ.draw, step: Math.sin(now / 2600), roll: champ.roll,
      fire: champ.fire, hurt: champ.hurt, hexA,
    });
  }

  for (const a2 of bArrows) {
    const p2 = clamp01((now - a2.t0) / a2.dur);
    const arcH = 90 * s;
    const x = a2.sx + (a2.tx - a2.sx) * p2;
    const y = a2.sy + (a2.ty - a2.sy) * p2 - Math.sin(p2 * Math.PI) * arcH;
    const px = a2.sx + (a2.tx - a2.sx) * (p2 - 0.04);
    const py = a2.sy + (a2.ty - a2.sy) * (p2 - 0.04) - Math.sin(Math.max(0, p2 - 0.04) * Math.PI) * arcH;
    const ang = Math.atan2(y - py, x - px);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = a2.spec ? '#ffd23f' : '#d9c284';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.fillStyle = a2.spec ? '#ffd23f' : '#d2a13c';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(1, -3.4); ctx.lineTo(1, 3.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  for (const p2 of bFlames) {
    const lf = Math.max(0, p2.life);
    ctx.globalAlpha = alpha * lf * 0.85;
    ctx.fillStyle = lf > 0.66 ? '#ffd23f' : lf > 0.33 ? '#e67e22' : '#b8441f';
    ctx.fillRect(p2.x - p2.size / 2, p2.y - p2.size / 2, p2.size, p2.size);
  }
  for (const p2 of bSparks) {
    ctx.globalAlpha = alpha * Math.max(0, p2.life);
    ctx.fillStyle = p2.col;
    ctx.fillRect(p2.x - 2, p2.y - 2, 4, 4);
  }
  ctx.globalAlpha = alpha;

  if (boss.dead > 0 && now - lootT < 2600) {
    // the loot beam — every kill deserves one
    const lb = 1 - Math.abs((now - lootT) / 1300 - 1);
    const bx2 = bossX() - 30 * s;
    const g2 = ctx.createLinearGradient(0, groundY() - 320 * s, 0, groundY());
    g2.addColorStop(0, hexA('#f5c518', 0));
    g2.addColorStop(1, hexA('#f5c518', 0.35 * Math.max(0, lb)));
    ctx.fillStyle = g2;
    ctx.fillRect(bx2 - 20 * s, groundY() - 320 * s, 40 * s, 320 * s);
  }

  for (const s2 of bSplats) {
    const age = now - s2.t0;
    ctx.globalAlpha = alpha * (age > 640 ? Math.max(0, 1 - (age - 640) / 180) : 1);
    const cell = 2.4 * s * (0.75 + 0.25 * Math.min(1, age / 80));
    drawSplatPx(s2.x - 7.5 * cell, s2.y - 7.5 * cell, cell, s2.gold);
    ctx.font = Math.max(13, 17 * s) + 'px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(String(s2.dmg), s2.x + 1, s2.y + 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(s2.dmg), s2.x, s2.y + 1);
  }
  ctx.globalAlpha = alpha;
  ctx.restore();

  // OSRS boss bar, pinned to the frame not the dolly
  ctx.save();
  ctx.globalAlpha = alpha;
  const bw = Math.min(340, W * 0.32), bh2 = 20, bx3 = W / 2 - bw / 2, by3 = 86;
  ctx.fillStyle = 'rgba(5,6,11,0.72)';
  ctx.fillRect(bx3 - 6, by3 - 6, bw + 12, bh2 + 12);
  ctx.strokeStyle = 'rgba(217,180,91,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx3 - 6.5, by3 - 6.5, bw + 13, bh2 + 13);
  ctx.fillStyle = '#8f1010';
  ctx.fillRect(bx3, by3, bw, bh2);
  ctx.fillStyle = '#2fbe4f';
  ctx.fillRect(bx3, by3, bw * (boss.hp / boss.maxHp), bh2);
  ctx.font = '19px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText('Deacon the Blue', W / 2 + 1, by3 + bh2 / 2 + 2);
  ctx.fillStyle = '#ffe066';
  ctx.fillText('Deacon the Blue', W / 2, by3 + bh2 / 2 + 1);
  const readyIn = Math.max(0, specAt - now);
  ctx.font = '14px VT323, monospace';
  ctx.fillStyle = readyIn > 0 ? 'rgba(139,143,160,0.8)' : 'rgba(245,197,24,0.95)';
  ctx.fillText(readyIn > 0 ? 'special in ' + Math.ceil(readyIn / 1000) : 'special ready — click', W / 2, by3 + bh2 + 18);
  ctx.restore();
}

// click anywhere in the arena: loose the dragonfire volley
filmCanvas.addEventListener('click', () => {
  const now = performance.now();
  if (sceneAlpha(0, p * SCENES) < 0.5 || boss.dead > 0) return;
  if (now < specAt) { fireArrow(now, false); return; } // eager clicks still loose an arrow
  specAt = now + 8000;
  fireArrow(now, true);
  setTimeout(() => fireArrow(performance.now(), true), 160);
  setTimeout(() => fireArrow(performance.now(), true), 330);
  if (window.__clog) window.__clog('spec-marcus');
});

/* ---------- scene 1 set piece: the dragon crosses the vista ---------- */

const emberTrail = [];

function drawDragonFlight(t, ms, alpha) {
  if (!ACTORS.dragon) return;
  const k = clamp01((t - 0.1) / 0.8);
  if (k <= 0 || k >= 1) return;
  const s = Math.max(0.3, Math.min(0.6, Math.min(W / 2200, H / 1500)));
  const kk = k * k * (3 - 2 * k); // smooth crossing, no whoosh
  const x = -320 * s + (W + 640 * s) * kk;
  const y = H * 0.4 - Math.sin(k * Math.PI) * H * 0.09 + Math.sin(ms / 320) * 7;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawDragonOpaque({
    x, y: y + 130 * s, s, dir: -1, ms,
    flap: 0.5 + 0.5 * Math.sin(ms / 300),
    rear: 0.22, jaw: 0, sway: Math.sin(ms / 900),
    hurt: 0, dead: 0, hexA,
  });
  if (emberTrail.length < 70 && Math.random() < 0.7) {
    emberTrail.push({ x: x - 120 * s, y: y + 60 * s, vx: -1 - Math.random() * 1.2, vy: (Math.random() - 0.5), life: 1 });
  }
  for (let i = emberTrail.length - 1; i >= 0; i--) {
    const e2 = emberTrail[i];
    e2.x += e2.vx; e2.y += e2.vy; e2.life -= 0.018;
    if (e2.life <= 0) { emberTrail.splice(i, 1); continue; }
    ctx.globalAlpha = alpha * e2.life * 0.7;
    ctx.fillStyle = e2.life > 0.5 ? '#e67e22' : '#b8441f';
    const sz = 1.5 + e2.life * 3;
    ctx.fillRect(e2.x, e2.y, sz, sz);
  }
  ctx.restore();
}

/* ---------- overlays, chrome, indicator ---------- */

const overlays = Array.from(document.querySelectorAll('.scene-ov'));
const dots = Array.from(document.querySelectorAll('.film-dots button'));

function sceneAlpha(i, sp) {
  // the first and last scenes hold full strength at the timeline's ends
  let c = sp;
  if (i === 0) c = Math.max(c, 0.5);
  if (i === SCENES - 1) c = Math.min(c, SCENES - 0.5);
  return clamp01((0.5 + XFADE - Math.abs(c - i - 0.5)) / (2 * XFADE));
}

/* ---------- master transport: no pins, no snapping — a lerp follows the scrollbar ---------- */

const master = ScrollTrigger.create({ trigger: track, start: 'top top', end: 'bottom bottom' });

let last = 0;
gsap.ticker.add(() => {
  const now = performance.now();
  if (!bootMs) bootMs = now;
  const dt = Math.min(50, now - last || 16);
  last = now;

  const target = master.progress || 0;
  p += (target - p) * Math.min(1, dt / 140);   // one global easing constant: the camera's inertia
  if (Math.abs(target - p) < 0.00005) p = target;

  const boot = ease(clamp01((now - bootMs) / 1100));
  const sp = p * SCENES;

  size();
  ctx.clearRect(0, 0, W, H);

  if (sceneAlpha(0, sp) > 0.02) updateBoss(now, dt);

  for (let i = 0; i < SCENES; i++) {
    const a = sceneAlpha(i, sp);
    if (a <= 0.002) continue;
    // scene-local time spans the whole crossfade window, so worlds assemble
    // while they fade in and finish dissolving exactly as they fade out
    let c = sp;
    if (i === 0) c = Math.max(c, 0.5);
    if (i === SCENES - 1) c = Math.min(c, SCENES - 0.5);
    const t = clamp01((c - i + XFADE) / (1 + 2 * XFADE));
    const in01 = i === 0 ? 1 : ease(clamp01(t / 0.3));
    const out01 = ease(clamp01((t - 0.7) / 0.3));
    ctx.save();
    ctx.globalAlpha = a * boot;
    const painter = PAINTERS[i];
    if (painter) { try { painter(ctx, mkEnv(t, in01, out01, now)); } catch (e) { /* one scene never kills the film */ } }
    ctx.restore();
    if (i === 1) drawDragonFlight(t, now, a * boot);
    if (i === 0) drawBossFight(now, a * boot, t);
  }

  // overlays crossfade sharper than the worlds so headlines never overprint,
  // and drift further so in/out text passes at different heights
  for (let i = 0; i < overlays.length; i++) {
    const ov = overlays[i];
    const raw = sceneAlpha(i, sp);
    const a = Math.pow(raw, 1.9) * boot;
    ov.style.opacity = a.toFixed(3);
    let c = sp;
    if (i === 0) c = Math.max(c, 0.5);
    if (i === SCENES - 1) c = Math.min(c, SCENES - 0.5);
    const t = clamp01((c - i + XFADE) / (1 + 2 * XFADE));
    ov.style.transform = 'translateY(' + ((0.5 - t) * -76).toFixed(1) + 'px)';
    ov.classList.toggle('live', raw > 0.55);
  }

  const idx = Math.max(0, Math.min(SCENES - 1, Math.round(sp - 0.5)));
  dots.forEach((d, i) => d.classList.toggle('on', i === idx));

});

/* ---------- scene dots navigate the timeline ---------- */

const trackLen = () => Math.max(1, track.offsetHeight - innerHeight);
dots.forEach((d, i) => {
  d.addEventListener('pointerdown', e => e.preventDefault()); // no focus-scroll jumps, ever
  d.addEventListener('click', () => {
    lenis.scrollTo(track.offsetTop + trackLen() * ((i + 0.5) / SCENES), { duration: 1.4 });
  });
});

/* ---------- the NPC portrait joins the low-poly era ---------- */

(function paintPortrait() {
  const face = document.getElementById('npc-face');
  if (!face) return;
  const g = face.getContext('2d');
  g.clearRect(0, 0, face.width, face.height);
  const P = (pts, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  };
  // shoulders and cloak
  P([[4, 72], [13, 51], [59, 51], [68, 72]], '#241f1a');
  P([[4, 72], [13, 51], [36, 55], [36, 72]], '#2b2520');
  // the hood, front on: tall point, faceted left/right
  P([[36, 3], [59, 25], [55, 49], [36, 55], [17, 49], [13, 25]], '#26221f');
  P([[36, 3], [59, 25], [50, 30], [36, 12]], '#302a24');
  P([[36, 3], [13, 25], [22, 30], [36, 12]], '#1b1816');
  // gold crest over the crown
  P([[33, 4], [39, 4], [41, 15], [37, 12], [35, 12], [31, 15]], '#d9a821');
  P([[35, 12], [37, 12], [38, 19], [34, 19]], '#a87e18');
  // the dark of the cowl
  P([[36, 15], [52, 29], [48, 48], [36, 53], [24, 48], [20, 29]], '#0c0a08');
  // the red eye slit, glowing
  g.fillStyle = 'rgba(217,48,37,0.30)';
  g.fillRect(23, 30, 26, 8);
  g.fillStyle = '#d93025';
  g.fillRect(26, 32, 20, 3);
  g.fillStyle = '#ff6a5a';
  g.fillRect(30, 32, 6, 2);
  // masked lower face
  P([[26, 41], [46, 41], [42, 52], [30, 52]], '#1d1a19');
})();

/* ---------- verification hook: seek the timeline directly ---------- */

window.__film = {
  seek(v) {
    const val = clamp01(v);
    // through Lenis so its internal target can never fight the jump
    lenis.scrollTo(Math.round(track.offsetTop + trackLen() * val), { immediate: true, force: true });
    ScrollTrigger.update();
    p = val;
  },
  get p() { return p; },
};

/* ---------- theme flips repaint the film ---------- */

const themeBtn = document.getElementById('theme-toggle');
if (themeBtn) themeBtn.addEventListener('click', () => setTimeout(readTheme, 0));

addEventListener('load', () => ScrollTrigger.refresh());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());

})();
