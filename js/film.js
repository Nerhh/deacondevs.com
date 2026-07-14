/* film.js — the site as a film. One fixed stage, scroll is the timeline.
   GSAP + Lenis provide the transport; every frame is drawn by hand in canvas 2D.
   Replaces cinema.js. Loaded after main.js (needs window.__duel). */
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
const FILM_ANCHORS = { '#projects': 2.5 / 6, '#quests': 5.5 / 6 };

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

/* ---------- the duel canvas joins the stage as scene 0's subject ---------- */

const duelCanvas = document.getElementById('hero-canvas');
if (duelCanvas) stage.insertBefore(duelCanvas, stage.querySelector('.scene-ov'));

/* ---------- quests section becomes scene 5's set dressing ---------- */

const questsSection = document.getElementById('quests');
const questSlot = document.getElementById('quest-slot');
if (questsSection && questSlot) questSlot.appendChild(questsSection);

/* ---------- engine state ---------- */

const ctx = filmCanvas.getContext('2d');
const SCENES = 6;
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
  const k = key + '|' + (THEME.dark ? 'd' : 'l');
  let c = caches.get(k);
  if (!c || c.width !== Math.round(w * DPR)) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * DPR));
    c.height = Math.max(1, Math.round(h * DPR));
    const g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    fn(g, w, h);
    caches.set(k, c);
  }
  return c;
}
// painters receive a draw-space cache handle (returns canvas; caller drawImage at CSS size)
function mkEnv(t, in01, out01, ms) {
  return {
    W, H, ms, t, in01, out01,
    dark: THEME.dark,
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

function paintRingsArena(ctx, f) {
  var W = f.W, H = f.H, ms = f.ms;
  var TAU = Math.PI * 2;
  var dk = f.dark ? 1 : 0.5;
  var cx = W * 0.5;
  var gy = H * 0.62;
  var scy = H * 0.55;
  var inE = f.ease(f.in01);
  var out = f.clamp01(f.out01);
  var baseA = ctx.globalAlpha;

  // ---------- cached layers ----------
  var pw = Math.max(2, Math.round(W * 0.92));
  var phh = Math.max(2, Math.round(H * 0.40));
  var pool = f.cache('duelPool', pw, phh, function (g, w, h) {
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(w / h, 1);
    var grd = g.createRadialGradient(0, 0, 0, 0, 0, h / 2);
    grd.addColorStop(0, f.hexA(f.gold, 0.22));
    grd.addColorStop(0.35, f.hexA(f.gold2, 0.10));
    grd.addColorStop(0.72, f.hexA(f.violet, 0.035));
    grd.addColorStop(1, f.hexA(f.gold, 0));
    g.fillStyle = grd;
    g.fillRect(-h / 2, -h / 2, h, h);
    g.restore();
  });

  var skH = Math.max(2, Math.round(H * 0.16));
  var sky = f.cache('duelSky', Math.max(2, W), skH, function (g, w, h) {
    var glow = g.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, f.hexA(f.violet, 0));
    glow.addColorStop(1, f.hexA(f.violet, 0.07));
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    var x = 0, i = 0;
    while (x < w && i < 400) {
      var bw = 14 + f.rnd(i * 4 + 1) * 60;
      var bh = h * (0.15 + f.rnd(i * 4 + 2) * 0.62);
      var by = h - bh;
      g.fillStyle = f.hexA(f.ice, 0.035 + f.rnd(i * 4 + 3) * 0.03);
      g.fillRect(x, by, bw, bh);
      if (f.rnd(i * 4) > 0.62) {
        var sw = 2 + f.rnd(i * 9 + 6) * 3;
        g.fillRect(x + bw * 0.5 - sw * 0.5, by - bh * 0.35, sw, bh * 0.35);
      }
      g.fillStyle = f.hexA(f.ice, 0.10);
      g.fillRect(x, by, bw, 1);
      var wn = Math.floor(f.rnd(i * 4 + 7) * 4);
      for (var k = 0; k < wn; k++) {
        g.fillStyle = f.hexA(f.gold, 0.10 + f.rnd(i * 31 + k) * 0.12);
        g.fillRect(
          Math.round(x + 3 + f.rnd(i * 17 + k * 3) * (bw - 6)),
          Math.round(by + 4 + f.rnd(i * 23 + k * 5) * Math.max(2, bh - 8)),
          1, 2
        );
      }
      x += bw + 4 + f.rnd(i * 4 + 5) * 26;
      i++;
    }
  });

  var mgH = Math.max(2, Math.round(H * 0.07));
  var mirror = f.cache('duelMirror', 32, mgH, function (g, w, h) {
    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, f.hexA(f.gold, 0.12));
    grd.addColorStop(0.4, f.hexA(f.gold2, 0.045));
    grd.addColorStop(1, f.hexA(f.gold, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

  var hot = f.cache('duelLineHot', 256, 2, function (g, w, h) {
    var grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, f.hexA(f.gold, 0));
    grd.addColorStop(0.5, f.hexA(f.gold, 0.9));
    grd.addColorStop(1, f.hexA(f.gold, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

  var vw = Math.max(2, Math.round(W / 4)), vh = Math.max(2, Math.round(H / 4));
  var vig = f.cache('duelVig', vw, vh, function (g, w, h) {
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(w / h, 1);
    var grd = g.createRadialGradient(0, 0, h * 0.30, 0, 0, h * 0.80);
    grd.addColorStop(0, f.hexA(f.bg, 0));
    grd.addColorStop(1, f.hexA(f.bg, 0.55));
    g.fillStyle = grd;
    g.fillRect(-h / 2, -h / 2, h, h);
    g.restore();
  });

  // ---------- skyline on the horizon ----------
  ctx.globalAlpha = baseA * inE * (1 - out * 0.6) * dk;
  ctx.drawImage(sky, 0, gy - skH, W, skH);

  // ---------- stage light pool (breathing) ----------
  var poolA = inE * (1 - out * 0.8) * (0.85 + 0.15 * Math.sin(ms * 0.0011)) * dk;
  ctx.globalAlpha = baseA * f.clamp01(poolA);
  ctx.drawImage(pool, cx - pw / 2, gy - phh / 2, pw, phh);

  // ---------- shockwave rune-rings ----------
  var N = 7, life = 12600;
  var maxR = Math.max(W, H) * 0.74;
  var push = out * out * 0.38; // exit: rings accelerate outward
  var ringMaster = inE * (1 - out * 0.55) * dk;
  var squash = 0.30;

  // birth flash at stage centre, synced to ring emission
  var bp = (ms / 1800) % 1;
  var flash = Math.pow(1 - bp, 3) * ringMaster;
  if (flash > 0.01) {
    ctx.globalAlpha = baseA * flash * 0.5;
    ctx.drawImage(pool, cx - pw * 0.14, gy - phh * 0.14, pw * 0.28, phh * 0.28);
  }
  ctx.globalAlpha = baseA;

  function strokeRing(rx, ry, ecy) {
    ctx.beginPath();
    ctx.ellipse(cx, ecy, rx, Math.max(0.5, ry), 0, 0, TAU);
    ctx.stroke();
  }

  function ringPass(mul, ticks) {
    for (var i = 0; i < N; i++) {
      var ph = (ms / life + i / N + push) % 1;
      var a = (1 - ph) * Math.min(1, ph * 9) * ringMaster * mul;
      if (a < 0.004) continue;
      var r = maxR * f.ease(ph);
      if (r < 2) continue;
      var ry = r * squash;
      var ecy = scy + (gy - scy) * f.clamp01(ph * 2.5);
      var col = (i % 2 === 0) ? f.gold : f.violet;
      ctx.strokeStyle = f.hexA(col, a * 0.10);
      ctx.lineWidth = 5;
      strokeRing(r, ry, ecy);
      ctx.strokeStyle = f.hexA(col, a * 0.55);
      ctx.lineWidth = 1;
      strokeRing(r, ry, ecy);
      ctx.strokeStyle = f.hexA(col, a * 0.18);
      strokeRing(r * 0.955, ry * 0.955, ecy);
      if (ticks && a > 0.05) {
        ctx.fillStyle = f.hexA(col, Math.min(1, a * 0.8));
        var rot = ms * 0.00012 * (i % 2 === 0 ? 1 : -1);
        for (var k = 0; k < 8; k++) {
          var an = rot + (k / 8) * TAU;
          var sy = Math.sin(an);
          if (sy > 0) continue; // upper arc only
          ctx.fillRect(cx + Math.cos(an) * r - 1, ecy + sy * ry - 1, 2, 2);
        }
      }
    }
  }

  // upper world
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, gy);
  ctx.clip();
  ringPass(1, true);
  ctx.restore();
  // dim mirror reflection below the ground line
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, gy, W, H - gy);
  ctx.clip();
  ringPass(0.28, false);
  ctx.restore();

  // ---------- mirror glow + razor ground line ----------
  ctx.globalAlpha = baseA * inE * (1 - out * 0.7) * dk;
  ctx.drawImage(mirror, 0, gy, W, mgH);
  ctx.globalAlpha = baseA;

  var lineA = inE * (1 - out * 0.5) * dk;
  ctx.fillStyle = f.hexA(f.gold, 0.10 * lineA);
  ctx.fillRect(0, gy - 1.5, W, 3);
  ctx.fillStyle = f.hexA(f.gold, 0.65 * lineA);
  ctx.fillRect(0, gy, W, 1);
  ctx.globalAlpha = baseA * lineA * (0.55 + 0.25 * Math.sin(ms * 0.0016));
  ctx.drawImage(hot, cx - W * 0.26, gy - 1, W * 0.52, 2);
  ctx.globalAlpha = baseA;

  // ---------- drifting dust motes (parallax by size) ----------
  ctx.save();
  var mcol0 = f.hexA(f.gold, 1), mcol1 = f.hexA(f.ice, 1), mcol2 = f.hexA(f.violet, 1);
  var driftUp = out * out * H * 0.3;
  for (var i = 0; i < 60; i++) {
    var r1 = f.rnd(i * 5 + 1), r2 = f.rnd(i * 5 + 2), r3 = f.rnd(i * 5 + 3), r4 = f.rnd(i * 5 + 4);
    var sz = 0.8 + r3 * 1.9;
    var par = sz / 2.7;
    var x = (r1 * W + ms * (0.004 + 0.012 * par) * (r4 > 0.5 ? 1 : -1)) % W;
    if (x < 0) x += W;
    var y = r2 * H + Math.sin(ms * 0.00035 + i * 1.93) * 16 * par - driftUp * par;
    if (y < -4) y += H + 8;
    var tw = 0.55 + 0.45 * Math.sin(ms * 0.0011 + i * 2.39);
    ctx.globalAlpha = baseA * (0.04 + 0.26 * r3) * tw * inE * dk;
    ctx.fillStyle = (i % 3 === 0) ? mcol0 : (i % 3 === 1) ? mcol1 : mcol2;
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.restore();

  // ---------- vignette ----------
  ctx.globalAlpha = baseA * dk * (0.85 + out * 0.15);
  ctx.drawImage(vig, 0, 0, W, H);
  ctx.globalAlpha = baseA;
}

function paintCosmosFlight(ctx, f) {
  var W = f.W, H = f.H, ms = f.ms, t = f.t;
  var A = f.dark ? 1 : 0.5;
  var mn = Math.min(W, H);
  var rise = f.ease(f.in01), sink = f.ease(f.out01);
  var live = 1 - f.out01;
  var pan = t * H * 0.22;

  ctx.save();
  var GA = ctx.globalAlpha;

  // ---------- (a) three parallax starfield layers (cached tiles) ----------
  var T = 640;
  function starTile(key, seed, n, big) {
    return f.cache(key, T, T, function (g) {
      for (var i = 0; i < n; i++) {
        var x = f.rnd(seed + i * 3) * T;
        var y = f.rnd(seed + i * 3 + 1) * T;
        var m = f.rnd(seed + i * 3 + 2);
        var a = (0.22 + 0.65 * m) * A;
        if (m > 1 - big) {
          g.fillStyle = f.hexA(f.ice, 0.15 * A);
          g.beginPath(); g.arc(x, y, 2.8, 0, 6.284); g.fill();
          g.fillStyle = f.hexA('#eaf2ff', a);
          g.fillRect(x - 1, y - 1, 2, 2);
        } else {
          g.fillStyle = f.hexA(m > 0.55 ? '#cfe0ff' : '#8fa3c8', a);
          g.fillRect(x, y, 1, 1);
        }
      }
    });
  }
  function blitTile(img, ox, oy, alpha) {
    ctx.globalAlpha = GA * alpha;
    var x0 = (((ox % T) + T) % T) - T;
    var y0 = (((oy % T) + T) % T) - T;
    for (var y = y0; y < H; y += T)
      for (var x = x0; x < W; x += T)
        ctx.drawImage(img, x, y, T, T);
  }
  var baseA = 0.5 + 0.5 * f.in01;
  blitTile(starTile('cfStars0', 11000, 150, 0.05), ms * 0.0016, pan * 0.25 + ms * 0.0009, 0.55 * baseA);
  blitTile(starTile('cfStars1', 23000, 95, 0.09), ms * 0.0038, pan * 0.55 + ms * 0.0021, 0.8 * baseA);
  blitTile(starTile('cfStars2', 37000, 55, 0.16), ms * 0.0080, pan * 1.0 + ms * 0.0046, 1.0 * baseA);
  ctx.globalAlpha = GA;

  // twinkling foreground dust (per-frame, cheap rects)
  var i;
  for (i = 0; i < 34; i++) {
    var tx = f.rnd(500 + i) * W;
    var ty = (f.rnd(700 + i) * H + pan * 0.8 + ms * 0.004) % H;
    var ph = ms * 0.001 * (0.6 + f.rnd(900 + i) * 1.4) + f.rnd(300 + i) * 6.28;
    var tw = 0.5 + 0.5 * Math.sin(ph);
    var col = (i % 6 === 0) ? f.gold : (i % 6 === 3) ? f.ice : '#dbe7ff';
    ctx.fillStyle = f.hexA(col, (0.12 + 0.5 * tw) * A * baseA);
    var sz = tw > 0.75 ? 2 : 1;
    ctx.fillRect(tx | 0, ty | 0, sz, sz);
    if (tw > 0.9) {
      ctx.fillStyle = f.hexA(col, 0.22 * A * baseA);
      ctx.fillRect((tx | 0) - 2, ty | 0, 5, 1);
      ctx.fillRect(tx | 0, (ty | 0) - 2, 1, 5);
    }
  }

  // ---------- (d) aurora ribbons ----------
  function auroraBand(baseY, amp, k, sp, thick, col, alpha, phase) {
    if (alpha <= 0.004) return;
    ctx.beginPath();
    var n = 30, j, x, y;
    for (j = 0; j <= n; j++) {
      x = j / n * W;
      y = baseY + Math.sin(x * k + ms * sp + phase) * amp
        + Math.sin(x * k * 2.7 - ms * sp * 1.6 + phase * 2) * amp * 0.35;
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    for (j = n; j >= 0; j--) {
      x = j / n * W;
      y = baseY + Math.sin(x * k + ms * sp + phase + 0.9) * amp * 0.85 + thick
        + Math.sin(x * k * 1.6 + ms * sp * 0.7 + phase) * thick * 0.25;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = f.hexA(col, alpha);
    ctx.fill();
  }
  var aur = A * live * f.clamp01(f.in01 * 1.5 - 0.2);
  var auY = H * 0.30 + pan * 0.3 - sink * H * 0.10;
  var k1 = 5.5 / W, k2 = 8.5 / W;
  auroraBand(auY, H * 0.035, k1, 0.00023, H * 0.10, f.violet, 0.05 * aur, 0);
  auroraBand(auY, H * 0.035, k1, 0.00023, H * 0.045, f.violet, 0.075 * aur, 0);
  auroraBand(auY + H * 0.06, H * 0.03, k2, 0.00019, H * 0.085, f.ice, 0.04 * aur, 2.1);
  auroraBand(auY + H * 0.06, H * 0.03, k2, 0.00019, H * 0.04, f.ice, 0.055 * aur, 2.1);

  // ---------- (e) constellations: bow, coin, watch (cached line art) ----------
  var cs = Math.round(mn * 0.24);
  function starDot(g, x, y, r) {
    g.fillStyle = f.hexA(f.gold, 0.14 * A);
    g.beginPath(); g.arc(x, y, r * 2.6, 0, 6.284); g.fill();
    g.fillStyle = f.hexA('#ffe9b0', 0.9 * A);
    g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fill();
  }
  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0] * cs, pts[0][1] * cs);
    for (var j = 1; j < pts.length; j++) g.lineTo(pts[j][0] * cs, pts[j][1] * cs);
    g.stroke();
  }
  var bowC = f.cache('cfBow', cs, cs, function (g) {
    g.lineWidth = 1;
    g.strokeStyle = f.hexA(f.ice, 0.35 * A);
    var arc = [[0.30, 0.12], [0.47, 0.22], [0.56, 0.40], [0.56, 0.60], [0.47, 0.78], [0.30, 0.88]];
    poly(g, arc);
    g.strokeStyle = f.hexA(f.ice, 0.20 * A);
    poly(g, [[0.30, 0.12], [0.30, 0.88]]);
    g.strokeStyle = f.hexA(f.gold2, 0.32 * A);
    poly(g, [[0.30, 0.50], [0.78, 0.50]]);
    poly(g, [[0.70, 0.44], [0.78, 0.50], [0.70, 0.56]]);
    for (var j = 0; j < arc.length; j++) starDot(g, arc[j][0] * cs, arc[j][1] * cs, 1.6);
    starDot(g, 0.78 * cs, 0.50 * cs, 1.8);
  });
  var coinC = f.cache('cfCoin', cs, cs, function (g) {
    g.lineWidth = 1;
    g.strokeStyle = f.hexA(f.ice, 0.30 * A);
    var n = 9, pts = [], j, a;
    for (j = 0; j <= n; j++) { a = j / n * 6.283 - 1.57; pts.push([0.5 + Math.cos(a) * 0.33, 0.5 + Math.sin(a) * 0.33]); }
    poly(g, pts);
    g.strokeStyle = f.hexA(f.gold2, 0.30 * A);
    g.beginPath(); g.arc(0.5 * cs, 0.5 * cs, 0.17 * cs, 2.6, 4.9); g.stroke();
    g.beginPath(); g.arc(0.5 * cs, 0.5 * cs, 0.17 * cs, -0.5, 1.6); g.stroke();
    for (j = 0; j < n; j++) starDot(g, pts[j][0] * cs, pts[j][1] * cs, j % 3 === 0 ? 1.8 : 1.2);
    starDot(g, 0.5 * cs, 0.5 * cs, 1.4);
  });
  var watchC = f.cache('cfWatch', cs, cs, function (g) {
    g.lineWidth = 1;
    g.strokeStyle = f.hexA(f.ice, 0.28 * A);
    g.beginPath(); g.arc(0.5 * cs, 0.5 * cs, 0.34 * cs, 0, 6.284); g.stroke();
    for (var j = 0; j < 12; j++) {
      var a = j / 12 * 6.283;
      var x = 0.5 + Math.cos(a) * 0.34, y = 0.5 + Math.sin(a) * 0.34;
      if (j % 3 === 0) starDot(g, x * cs, y * cs, 1.7);
      else { g.fillStyle = f.hexA('#cfe0ff', 0.6 * A); g.fillRect(x * cs - 0.5, y * cs - 0.5, 1.5, 1.5); }
    }
    g.strokeStyle = f.hexA(f.gold2, 0.45 * A);
    poly(g, [[0.5, 0.5], [0.5 + 0.20 * Math.cos(-2.62), 0.5 + 0.20 * Math.sin(-2.62)]]);
    poly(g, [[0.5, 0.5], [0.5 + 0.28 * Math.cos(-0.52), 0.5 + 0.28 * Math.sin(-0.52)]]);
    starDot(g, 0.5 * cs, 0.5 * cs, 1.5);
  });
  function blitConst(img, cx0, cy0, k) {
    var ap = (0.55 + 0.30 * Math.sin(ms * 0.0006 + k * 2.3)) * f.clamp01(f.in01 * 2 - 0.25 * k - 0.15) * live;
    if (ap <= 0.01) return;
    ctx.globalAlpha = GA * ap;
    ctx.drawImage(img, cx0 - cs / 2, cy0 - cs / 2 + pan * 0.35 - sink * H * 0.08 * (1 + k * 0.3), cs, cs);
  }
  blitConst(coinC, W * 0.38, H * 0.13, 0);
  blitConst(bowC, W * 0.63, H * 0.34, 1);
  blitConst(watchC, W * 0.86, H * 0.15, 2);
  ctx.globalAlpha = GA;

  // ---------- (c) comets ----------
  var cIn = f.clamp01(f.in01 * 2 - 0.5) * live * A;
  if (cIn > 0.01) {
    var comets = [
      [9000, 0.0, 1.08, 0.02, 0.30, 0.62],
      [13000, 0.42, 0.72, -0.08, 0.02, 0.46],
      [17000, 0.71, 1.05, 0.55, 0.55, 0.04]
    ];
    ctx.lineCap = 'round';
    for (i = 0; i < 3; i++) {
      var c = comets[i];
      var p = (ms / c[0] + c[1]) % 1;
      if (p >= 0.34) continue;
      var cp = p / 0.34;
      var env = Math.sin(cp * 3.1416); env = env * env;
      var sx = c[2] * W, sy = c[3] * H, ex = c[4] * W, ey = c[5] * H;
      var hx = sx + (ex - sx) * cp, hy = sy + (ey - sy) * cp;
      var dx = ex - sx, dy = ey - sy;
      var dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
      var L = mn * 0.30 * env;
      for (var s = 0; s < 7; s++) {
        var q0 = s / 7, q1 = (s + 1) / 7;
        var ax = hx - dx * L * q0, py0 = hy - dy * L * q0;
        var bx = hx - dx * L * q1, py1 = hy - dy * L * q1;
        var fall = 1 - q0;
        ctx.strokeStyle = f.hexA(f.violet, 0.10 * fall * env * cIn);
        ctx.lineWidth = 7 * fall + 2;
        ctx.beginPath(); ctx.moveTo(ax, py0); ctx.lineTo(bx, py1); ctx.stroke();
        ctx.strokeStyle = f.hexA(s < 2 ? f.gold : f.violet, (s < 2 ? 0.5 : 0.28) * fall * env * cIn);
        ctx.lineWidth = 2.2 * fall + 0.4;
        ctx.beginPath(); ctx.moveTo(ax, py0); ctx.lineTo(bx, py1); ctx.stroke();
      }
      ctx.fillStyle = f.hexA(f.gold, 0.18 * env * cIn);
      ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 6.284); ctx.fill();
      ctx.fillStyle = f.hexA(f.gold, 0.45 * env * cIn);
      ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, 6.284); ctx.fill();
      ctx.fillStyle = f.hexA('#fff6d8', 0.85 * env * cIn);
      ctx.beginPath(); ctx.arc(hx, hy, 1.4, 0, 6.284); ctx.fill();
    }
  }

  // ---------- (b) planet horizon, low-left (cached full-frame layer) ----------
  var planet = f.cache('cfPlanet', W, H, function (g, w, h) {
    var R = Math.hypot(w, h) * 0.5;
    var cx = w * 0.22, cy = h * 0.70 + R;
    var atm = g.createRadialGradient(cx, cy, R * 0.99, cx, cy, R * 1.30);
    atm.addColorStop(0, f.hexA(f.gold2, 0.28 * A));
    atm.addColorStop(0.30, f.hexA(f.ember, 0.10 * A));
    atm.addColorStop(1, f.hexA(f.ember, 0));
    g.fillStyle = atm; g.fillRect(0, 0, w, h);
    var bod = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
    bod.addColorStop(0, '#060810');
    bod.addColorStop(0.80, '#080b14');
    bod.addColorStop(0.94, '#121017');
    bod.addColorStop(0.985, f.hexA(f.gold2, 0.55));
    bod.addColorStop(1, f.hexA('#ffdf9e', 0.9));
    g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fillStyle = bod; g.fill();
    g.strokeStyle = f.hexA('#ffe9b0', 0.85 * A); g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R - 0.75, 0, 6.284); g.stroke();
    g.strokeStyle = f.hexA(f.gold2, 0.30 * A); g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, R + 2, 0, 6.284); g.stroke();
    g.strokeStyle = f.hexA(f.gold2, 0.15 * A); g.lineWidth = 9;
    g.beginPath(); g.arc(cx, cy, R + 6, 0, 6.284); g.stroke();
    g.strokeStyle = f.hexA(f.gold2, 0.06 * A); g.lineWidth = 20;
    g.beginPath(); g.arc(cx, cy, R + 14, 0, 6.284); g.stroke();
    var hot = g.createRadialGradient(cx, cy - R, 0, cx, cy - R, R * 0.5);
    hot.addColorStop(0, f.hexA(f.gold, 0.40 * A));
    hot.addColorStop(0.4, f.hexA(f.gold2, 0.12 * A));
    hot.addColorStop(1, f.hexA(f.gold2, 0));
    g.fillStyle = hot; g.fillRect(0, 0, w, h);
    for (var j = 0; j < 26; j++) {
      var a = -2.85 + f.rnd(4000 + j) * 2.4;
      var rr = R * (0.965 - f.rnd(4100 + j) * 0.03);
      var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (py < 0 || py > h || px < 0 || px > w) continue;
      g.fillStyle = f.hexA(j % 4 ? f.gold2 : f.ember, (0.25 + 0.5 * f.rnd(4200 + j)) * A);
      g.fillRect(px, py, j % 5 ? 1 : 2, 1);
    }
  });
  var pdy = (1 - rise) * H * 0.32 + sink * H * 0.20 + pan * 0.35;
  ctx.globalAlpha = GA;
  ctx.drawImage(planet, 0, pdy, W, H);

  // living rim shimmer (single cheap arc per frame)
  var Rv = Math.hypot(W, H) * 0.5;
  var shim = (0.10 + 0.08 * Math.sin(ms * 0.0011)) * A * live * rise;
  if (shim > 0.01) {
    ctx.strokeStyle = f.hexA(f.gold, shim);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(W * 0.22, H * 0.70 + Rv + pdy, Rv + 2, -2.4, -0.7);
    ctx.stroke();
  }

  ctx.restore();
}

function paintMarketScape(ctx, f) {
  var W = f.W, H = f.H, ms = f.ms;
  var A = f.dark ? 1 : 0.5;
  var ein = f.ease(f.in01);
  var flat = f.ease(f.out01);
  var live = 1 - flat;
  var midY = H * 0.55, amp = H * 0.2;
  var GA = ctx.globalAlpha;
  var TAU = 6.28318530718;

  function noise(x, s) {
    var i = Math.floor(x), r = x - i, k = r * r * (3 - 2 * r);
    var a = f.rnd(i + s);
    return a + (f.rnd(i + 1 + s) - a) * k;
  }
  function terrain(x) {
    var v = (noise(x * 0.09, 1201) - 0.5) * 1.1
          + (noise(x * 0.23, 4801) - 0.5) * 0.5
          + (noise(x * 0.47, 9601) - 0.5) * 0.22;
    v *= 1.6;
    if (v > 1) v = 1; else if (v < -1) v = -1;
    return v;
  }

  // ---- (e) digit rain, far background ----
  var rainA = ein * live;
  if (rainA > 0.02) {
    ctx.save();
    ctx.font = '11px "Consolas","Courier New",monospace';
    ctx.textAlign = 'center';
    var CH = '0123456789£';
    for (var c = 0; c < 16; c++) {
      var colx = (0.03 + 0.94 * f.rnd(c * 7 + 1)) * W;
      var spd = 8 + f.rnd(c * 7 + 2) * 14;
      var ca = (0.08 + 0.13 * f.rnd(c * 7 + 3)) * rainA * A;
      ctx.fillStyle = f.hexA(f.muted, ca);
      for (var k = 0; k < 4; k++) {
        var ph = f.rnd(c * 31 + k * 13 + 5);
        var gy = ((ms * 0.001 * spd) / H + ph) % 1 * H;
        var gi = (Math.floor(ms / 800 + ph * 40) * 7 + c * 3 + k * 11) % 11;
        ctx.fillText(CH.charAt(gi), colx, gy);
      }
    }
    ctx.restore();
  }

  // ---- (a) cached perspective wireframe floor ----
  var floor = f.cache('marketscape_floor', W, H, function (g, w, h) {
    var vy = h * 0.58, cx0 = w * 0.5;
    g.lineWidth = 1;
    var hg = g.createLinearGradient(0, vy - h * 0.10, 0, vy + h * 0.16);
    hg.addColorStop(0, f.hexA(f.gold2, 0));
    hg.addColorStop(0.5, f.hexA(f.gold2, 0.05 * A));
    hg.addColorStop(1, f.hexA(f.gold2, 0));
    g.fillStyle = hg;
    g.fillRect(0, vy - h * 0.10, w, h * 0.26);
    g.strokeStyle = f.hexA(f.gold2, 0.12 * A);
    g.beginPath(); g.moveTo(0, vy + 0.5); g.lineTo(w, vy + 0.5); g.stroke();
    for (var i = 1; i <= 13; i++) {
      var p = i / 13, y = vy + (h - vy) * p * p;
      g.strokeStyle = f.hexA(f.gold2, (0.03 + 0.09 * p) * A);
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
    }
    g.strokeStyle = f.hexA(f.gold2, 0.06 * A);
    for (var j = -14; j <= 14; j++) {
      var xb = cx0 + j * (w * 0.085);
      g.beginPath();
      g.moveTo(cx0 + (xb - cx0) * 0.04, vy + (h - vy) * 0.04);
      g.lineTo(xb, h);
      g.stroke();
    }
    g.strokeStyle = f.hexA(f.gold2, 0.14 * A);
    for (var tk = 0; tk < 13; tk++) {
      var ty = h * 0.25 + tk * h * 0.05;
      var tw = (tk % 4 === 0) ? 10 : 5;
      g.beginPath(); g.moveTo(0, ty + 0.5); g.lineTo(tw, ty + 0.5); g.stroke();
    }
  });
  ctx.globalAlpha = GA * ein * (1 - 0.5 * flat);
  ctx.drawImage(floor, 0, 0, W, H);
  ctx.globalAlpha = GA;

  // ---- (b) price ridge: scrolling deterministic walk ----
  var N = 90, PAD = 5, dx = W / (N - 1);
  var u = ms * 0.0018;
  var raw = new Array(N + 2 * PAD + 1);
  for (var s0 = 0; s0 <= N + 2 * PAD; s0++) raw[s0] = terrain(u + s0 - PAD);
  var ys = new Array(N + 1), ya = new Array(N + 1);
  for (var p0 = 0; p0 <= N; p0++) {
    var sum = 0;
    for (var q = -4; q <= 4; q++) sum += raw[p0 + PAD + q];
    ys[p0] = midY - amp * raw[p0 + PAD] * live;
    ya[p0] = midY - amp * (sum / 9) * live;
  }

  var reveal = ein >= 0.999 ? W : W * ein;
  if (reveal > 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, reveal, H);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var ridge = new Path2D();
    ridge.moveTo(0, ys[0]);
    for (var p1 = 1; p1 <= N; p1++) ridge.lineTo(p1 * dx, ys[p1]);

    // area fill below the ridge
    var grd = ctx.createLinearGradient(0, midY - amp, 0, H * 0.98);
    grd.addColorStop(0, f.hexA(f.gold, 0.20 * A));
    grd.addColorStop(0.45, f.hexA(f.gold, 0.05 * A));
    grd.addColorStop(1, f.hexA(f.gold, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.98);
    for (var p2 = 0; p2 <= N; p2++) ctx.lineTo(p2 * dx, ys[p2]);
    ctx.lineTo(W, H * 0.98);
    ctx.closePath();
    ctx.fill();

    // layered glow strokes (no shadowBlur)
    var coreA = (1 - flat * 0.3) * A;
    ctx.strokeStyle = f.hexA(f.gold, 0.05 * coreA);
    ctx.lineWidth = 7;
    ctx.stroke(ridge);
    ctx.strokeStyle = f.hexA(f.gold, 0.13 * coreA);
    ctx.lineWidth = 3;
    ctx.stroke(ridge);
    ctx.strokeStyle = f.hexA(f.gold, 0.85 * coreA);
    ctx.lineWidth = 1.4;
    ctx.stroke(ridge);

    // ---- (c) rolling-average dashed line ----
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -(ms * 0.03) % 14;
    ctx.strokeStyle = f.hexA(f.violet, 0.55 * live * A + 0.1 * A);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ya[0]);
    for (var p3 = 1; p3 <= N; p3++) ctx.lineTo(p3 * dx, ya[p3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- (d) price beacons at local minima below the average ----
    var cands = [];
    for (var b = 3; b <= N - 3; b++) {
      if (ys[b] > ys[b - 1] && ys[b] >= ys[b + 1] && ys[b] > ys[b - 2] && ys[b] > ys[b + 2]) {
        var depth = ys[b] - ya[b];
        if (depth > H * 0.02) cands.push({ x: b * dx, y: ys[b], d: depth, w: Math.round(u + b) });
      }
    }
    cands.sort(function (m, n) { return n.d - m.d; });
    var picked = [];
    for (var ci = 0; ci < cands.length && picked.length < 3; ci++) {
      var ok = true;
      for (var pi = 0; pi < picked.length; pi++) {
        if (Math.abs(picked[pi].x - cands[ci].x) < W * 0.14) { ok = false; break; }
      }
      if (ok) picked.push(cands[ci]);
    }
    for (var bi = 0; bi < picked.length; bi++) {
      var bc = picked[bi];
      var ef = f.clamp01(Math.min(bc.x, W - bc.x) / (W * 0.07)) * live;
      if (ef <= 0.02) continue;
      var pp = (ms * 0.0011 + bc.w * 0.317) % 1;
      ctx.strokeStyle = f.hexA(f.ice, (1 - pp) * 0.55 * ef * A);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bc.x, bc.y, 3 + pp * 11, 0, TAU); ctx.stroke();
      ctx.fillStyle = f.hexA(f.ice, 0.16 * ef * A);
      ctx.beginPath(); ctx.arc(bc.x, bc.y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = f.hexA(f.ice, 0.9 * ef * A);
      ctx.beginPath(); ctx.arc(bc.x, bc.y, 2.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = f.hexA(f.ice, 0.3 * ef * A);
      ctx.beginPath();
      ctx.moveTo(bc.x + 0.5, bc.y - 9);
      ctx.lineTo(bc.x + 0.5, bc.y - H * 0.16);
      ctx.stroke();
      var ty = bc.y - 13 - 3 * Math.sin(ms * 0.003 + bc.w);
      ctx.fillStyle = f.hexA(f.ice, 0.85 * ef * A);
      ctx.beginPath();
      ctx.moveTo(bc.x, ty);
      ctx.lineTo(bc.x - 4.5, ty - 7);
      ctx.lineTo(bc.x + 4.5, ty - 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // draw-head spark while the ridge is revealing left-to-right
  if (ein > 0.02 && ein < 0.995) {
    var hj = ein * N;
    var h0 = Math.floor(hj);
    var h1 = h0 + 1 > N ? N : h0 + 1;
    var hy = ys[h0] + (ys[h1] - ys[h0]) * (hj - h0);
    ctx.fillStyle = f.hexA(f.gold, 0.18 * A);
    ctx.beginPath(); ctx.arc(reveal, hy, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = f.hexA(f.gold, 0.9 * A);
    ctx.beginPath(); ctx.arc(reveal, hy, 2.5, 0, TAU); ctx.fill();
  }

  ctx.globalAlpha = GA;
}

function paintWealthHalo(ctx, f) {
  var W = f.W, H = f.H, ms = f.ms;
  var TAU = Math.PI * 2;
  var dk = f.dark ? 1 : 0.5;
  var dkLine = f.dark ? 1 : 0.75;
  var baseA = ctx.globalAlpha;
  var cx = W * 0.62, cy = H * 0.5;
  var R = Math.min(W, H) * 0.34;
  var lw = 26;
  var Ro = R + 34, Ri = R - 32;
  var inE = f.ease(f.in01);
  var outE = f.ease(f.out01);
  var live = 1 - outE * 0.9;
  var gone = 1 - outE;
  var tRot = f.t * 0.4363; // ~25deg total scroll rotation
  var rot = -Math.PI / 2 + tRot - (1 - inE) * 0.5;

  var segs = [
    [0.52, f.gold,   'INDEX 52%'],
    [0.28, f.violet, 'PENSION 28%'],
    [0.12, f.ice,    'CASH 12%'],
    [0.08, f.ember,  'PLAY 8%']
  ];

  ctx.save();

  // ---------- soft core glow (cached radial gradient) ----------
  var CS = Math.ceil(R * 2.6);
  var core = f.cache('vestraHaloCore', CS, CS, function (g, w, h) {
    var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, f.hexA(f.gold, 0.14));
    gr.addColorStop(0.4, f.hexA(f.gold, 0.045));
    gr.addColorStop(1, f.hexA(f.gold, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  var pulse = 0.8 + 0.2 * Math.sin(ms * 0.0007);
  ctx.globalAlpha = baseA * pulse * inE * live * dk;
  ctx.drawImage(core, cx - CS / 2, cy - CS / 2);

  // ---------- HUD furniture: orbit rings + ticks (cached, drawn rotated) ----------
  var FS = Math.ceil((Ro + 14) * 2);
  var furn = f.cache('vestraHaloFurn', FS, FS, function (g, w, h) {
    var mx = w / 2, my = h / 2, k, a, major, r0, r1;
    g.lineWidth = 1;
    g.strokeStyle = f.hexA(f.gold2, 0.28);
    g.beginPath(); g.arc(mx, my, Ro, 0, TAU); g.stroke();
    g.strokeStyle = f.hexA(f.gold2, 0.18);
    g.beginPath(); g.arc(mx, my, Ri, 0, TAU); g.stroke();
    for (k = 0; k < 72; k++) {
      a = k / 72 * TAU;
      major = (k % 6 === 0);
      r0 = Ro + 3; r1 = r0 + (major ? 8 : 3);
      g.strokeStyle = f.hexA(f.gold2, major ? 0.42 : 0.2);
      g.beginPath();
      g.moveTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0);
      g.lineTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1);
      g.stroke();
    }
  });
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot * 0.5 + ms * 0.000025);
  ctx.globalAlpha = baseA * 0.9 * inE * live * dkLine;
  ctx.drawImage(furn, -FS / 2, -FS / 2);
  ctx.restore();

  // ---------- orbiting gold dust (70, parallax speeds, radius jitter) ----------
  var maxRad = Math.min(R * 1.5, cx - W * 0.36); // keep the left third calm
  var i, k;
  ctx.fillStyle = f.gold;
  for (i = 0; i < 70; i++) {
    var r1 = f.rnd(i), r2 = f.rnd(i + 97), r3 = f.rnd(i + 211), r4 = f.rnd(i + 331);
    var band = 0.55 + r1 * 0.95;
    var rad = Math.min(R * band, maxRad);
    rad += Math.sin(ms * 0.001 * (0.4 + r4 * 0.8) + r3 * 9) * (2 + r4 * 5);
    rad *= 1 + outE * (0.35 + r2 * 0.5); // drift outward on exit
    var sp = (0.05 + r2 * 0.1) / band;   // inner dust orbits faster
    var ang = r3 * TAU + ms * 0.001 * sp + tRot;
    var x = cx + Math.cos(ang) * rad;
    var y = cy + Math.sin(ang) * rad;
    var tw = 0.55 + 0.45 * Math.sin(ms * 0.0018 * (0.5 + r4) + i * 1.7);
    var al = (0.12 + 0.5 * r2) * tw * inE * live * dk;
    if (al < 0.01) continue;
    var s = 1 + r4 * 1.8;
    ctx.globalAlpha = baseA * al;
    ctx.fillRect(x - s * 0.5, y - s * 0.5, s, s);
  }

  // ---------- allocation segments ----------
  var gapA = 2 / R;               // 2px gaps
  var avail = TAU - segs.length * gapA;
  var hudA = f.clamp01(f.in01 * 2 - 0.8) * gone;
  var a0 = rot;
  ctx.lineCap = 'butt';
  ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';
  for (i = 0; i < 4; i++) {
    var p = segs[i][0], col = segs[i][1];
    var span = avail * p;
    var grow = f.ease(f.clamp01(f.in01 * 1.7 - i * 0.22)); // staggered assembly
    var s0 = a0 + gapA * 0.5;
    var s1 = s0 + span * grow;
    var mid = s0 + span * 0.5;
    var off = outE * outE * R * (0.4 + f.rnd(i + 7) * 0.35); // radial detach on exit
    var spin = outE * (f.rnd(i + 13) - 0.5) * 0.6;
    var ox = cx + Math.cos(mid) * off;
    var oy = cy + Math.sin(mid) * off;
    var segAl = 1 - outE * 0.85;
    var b0 = s0 + spin, b1 = s1 + spin;
    if (grow > 0.002 && b1 > b0 + 0.002) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = baseA * 0.12 * dk * segAl;            // soft glow pass
      ctx.lineWidth = lw + 22;
      ctx.beginPath(); ctx.arc(ox, oy, R, b0, b1); ctx.stroke();
      ctx.globalAlpha = baseA * 0.92 * segAl;                 // main body
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(ox, oy, R, b0, b1); ctx.stroke();
      ctx.globalAlpha = baseA * 0.16 * dk * segAl;            // outer edge highlight
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ox, oy, R + lw * 0.5 - 1, b0, b1); ctx.stroke();
    }
    if (hudA > 0.01 && grow > 0.5) {                          // 1px tick + label
      var mm = mid + spin;
      var c = Math.cos(mm), sn = Math.sin(mm);
      ctx.globalAlpha = baseA * 0.6 * hudA * dkLine;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + c * (Ro + 2), oy + sn * (Ro + 2));
      ctx.lineTo(ox + c * (Ro + 9), oy + sn * (Ro + 9));
      ctx.stroke();
      ctx.globalAlpha = baseA * 0.85 * hudA * dkLine;
      ctx.fillStyle = col;
      var lx = ox + c * (Ro + 16), ly = oy + sn * (Ro + 16);
      if (c > 0.35) { ctx.textAlign = 'left'; lx += 6; }
      else if (c < -0.35) { ctx.textAlign = 'right'; lx -= 6; }
      else { ctx.textAlign = 'center'; ly += sn > 0 ? 12 : -12; }
      ctx.fillText(segs[i][2], lx, ly);
    }
    a0 += gapA + span;
  }

  // ---------- travelling highlight sweep (~30deg comet, additive) ----------
  var sweepGate = f.clamp01(f.in01 * 2 - 1) * gone;
  if (sweepGate > 0.01) {
    var head = rot + (ms % 14000) / 14000 * TAU;
    var step = 0.09;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = f.hexA('#fff3c4', 1);
    for (k = 0; k < 7; k++) {
      var fall = 1 - k / 7;
      var e1 = head - k * step;
      var e0 = e1 - step * 1.2;
      var aa = fall * fall * 0.28 * dk * sweepGate;
      ctx.globalAlpha = baseA * aa;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, R, e0, e1); ctx.stroke();
      ctx.globalAlpha = baseA * aa * 0.45;
      ctx.lineWidth = lw + 26;
      ctx.beginPath(); ctx.arc(cx, cy, R, e0, e1); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- small centre HUD ----------
  var hud2 = f.clamp01(f.in01 * 2 - 1) * gone;
  if (hud2 > 0.01) {
    ctx.globalAlpha = baseA * 0.7 * hud2 * dkLine;
    ctx.strokeStyle = f.hexA(f.gold2, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, TAU); ctx.stroke();
    for (k = 0; k < 4; k++) {
      var ca = k * Math.PI / 2 + tRot;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ca) * 18, cy + Math.sin(ca) * 18);
      ctx.lineTo(cx + Math.cos(ca) * 24, cy + Math.sin(ca) * 24);
      ctx.stroke();
    }
    ctx.fillStyle = f.gold;
    ctx.globalAlpha = baseA * (0.5 + 0.3 * Math.sin(ms * 0.002)) * hud2;
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill();
  }

  // ---------- rising +coin sparks ----------
  ctx.fillStyle = f.gold;
  for (i = 0; i < 9; i++) {
    var q1 = f.rnd(i + 401), q2 = f.rnd(i + 503), q3 = f.rnd(i + 607);
    var per = 5200 + q1 * 4200;
    var u = ((ms + q2 * per * 2) % per) / per;
    var sx = cx + (q3 - 0.5) * R * 1.7 + Math.sin(ms * 0.001 + i * 2.1) * 8;
    var sy = cy + R * 0.62 - u * R * 1.25;
    var al2 = Math.sin(u * Math.PI);
    al2 = al2 * al2 * (0.35 + q1 * 0.4) * inE * gone * dk;
    if (al2 < 0.01) continue;
    var hs = 2.5 + q2 * 2.5;
    ctx.globalAlpha = baseA * al2;
    ctx.fillRect(sx - hs, sy - 1, hs * 2, 2);
    ctx.fillRect(sx - 1, sy - hs, 2, hs * 2);
  }

  ctx.restore();
}

function paintDialMacro(ctx, f) {
  var W = f.W, H = f.H, ms = f.ms;
  var TAU = Math.PI * 2;
  var t = f.clamp01(f.t);
  var ein = f.ease(f.clamp01(f.in01));
  var eout = f.ease(f.clamp01(f.out01));
  var dk = f.dark ? 1 : 0.5;
  var R = Math.min(W, H) * 0.44;
  var cx = W * 0.6 + eout * W * 0.18;
  var cy = H * 0.52;
  var scl = 1.06 - 0.06 * ein;
  var vis = ein * (1 - 0.85 * eout);
  if (vis <= 0.004) return;
  var baseA = ctx.globalAlpha;

  function lerp(a, b, x) { return a + (b - a) * x; }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ---------- cached: macro dust bokeh backdrop ----------
  var PAD = 90;
  var bokeh = f.cache('dm_bokeh', Math.ceil(W + PAD * 2), Math.ceil(H + PAD * 2), function (g, w, h) {
    for (var i = 0; i < 42; i++) {
      var x = f.rnd(i * 4 + 11) * w, y = f.rnd(i * 4 + 12) * h;
      var r = 3 + f.rnd(i * 4 + 13) * 15;
      var a = 0.02 + f.rnd(i * 4 + 14) * 0.05;
      var col = (i % 6 === 0) ? f.ice : (i % 4 === 0) ? f.gold2 : '#7d8db0';
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, f.hexA(col, a));
      gr.addColorStop(0.55, f.hexA(col, a * 0.45));
      gr.addColorStop(1, f.hexA(col, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  });

  // ---------- cached: the dial itself ----------
  var D = Math.ceil(R * 2.4);
  var dial = f.cache('dm_face', D, D, function (g, w, h) {
    var c = w / 2, i, a;
    // outer halo (layered strokes, no shadowBlur)
    for (i = 5; i >= 0; i--) {
      g.strokeStyle = f.hexA(f.ice, 0.035 * (1 - i / 6) * dk);
      g.lineWidth = 3 + i * 6;
      g.beginPath(); g.arc(c, c, R * 1.07 + i * 2.5, 0, TAU); g.stroke();
    }
    // case annulus
    g.fillStyle = '#0a0e18';
    g.beginPath(); g.arc(c, c, R * 1.09, 0, TAU); g.fill();
    // bezel: thin double ring, gold2
    g.strokeStyle = f.hexA(f.gold2, 0.9);
    g.lineWidth = 2;
    g.beginPath(); g.arc(c, c, R * 1.065, 0, TAU); g.stroke();
    g.strokeStyle = f.hexA(f.gold2, 0.45);
    g.lineWidth = 1;
    g.beginPath(); g.arc(c, c, R * 1.015, 0, TAU); g.stroke();
    // deep navy-black face
    var fgrad = g.createRadialGradient(c - R * 0.32, c - R * 0.38, R * 0.05, c, c, R);
    fgrad.addColorStop(0, '#131d33');
    fgrad.addColorStop(0.55, '#0b1224');
    fgrad.addColorStop(1, '#060a14');
    g.fillStyle = fgrad;
    g.beginPath(); g.arc(c, c, R * 0.985, 0, TAU); g.fill();
    // brushed concentric rings
    g.lineWidth = 1;
    for (i = 0; i < 62; i++) {
      g.strokeStyle = f.hexA('#9fb4d8', 0.018 + f.rnd(i + 40) * 0.016);
      g.beginPath(); g.arc(c, c, R * (0.06 + 0.9 * i / 62), 0, TAU); g.stroke();
    }
    // faint sunburst grain
    for (i = 0; i < 72; i++) {
      a = i / 72 * TAU + f.rnd(i + 300) * 0.05;
      g.strokeStyle = f.hexA('#b9c9e6', 0.012);
      g.beginPath();
      g.moveTo(c + Math.cos(a) * R * 0.1, c + Math.sin(a) * R * 0.1);
      g.lineTo(c + Math.cos(a) * R * 0.93, c + Math.sin(a) * R * 0.93);
      g.stroke();
    }
    // chapter hairlines
    g.strokeStyle = f.hexA('#cfd8ea', 0.14);
    g.beginPath(); g.arc(c, c, R * 0.955, 0, TAU); g.stroke();
    g.beginPath(); g.arc(c, c, R * 0.865, 0, TAU); g.stroke();
    // minute track: 60 ticks, 12 major
    for (i = 0; i < 60; i++) {
      a = i / 60 * TAU;
      var maj = (i % 5 === 0);
      var r0 = maj ? R * 0.875 : R * 0.905;
      g.strokeStyle = maj ? f.hexA(f.gold2, 0.85) : f.hexA('#cfd8ea', 0.32);
      g.lineWidth = maj ? 2 : 1;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * R * 0.945, c + Math.sin(a) * R * 0.945);
      g.stroke();
    }
    // applied hour markers (skip 3 o'clock for date window)
    for (i = 0; i < 12; i++) {
      if (i === 3) continue;
      a = i / 12 * TAU - Math.PI / 2;
      g.save();
      g.translate(c + Math.cos(a) * R * 0.76, c + Math.sin(a) * R * 0.76);
      g.rotate(a + Math.PI / 2);
      var mw = R * 0.045, mh = R * 0.13;
      g.fillStyle = f.hexA(f.gold2, 0.95);
      g.strokeStyle = f.hexA('#ffe9a8', 0.5);
      g.lineWidth = 1;
      if (i === 0) {
        rr(g, -mw * 1.2, -mh / 2, mw * 0.9, mh, 2); g.fill(); g.stroke();
        rr(g, mw * 0.3, -mh / 2, mw * 0.9, mh, 2); g.fill(); g.stroke();
      } else {
        rr(g, -mw / 2, -mh / 2, mw, mh, 2); g.fill(); g.stroke();
      }
      // faint lume-ice inner dot
      g.fillStyle = f.hexA(f.ice, 0.9);
      g.beginPath(); g.arc(0, mh * 0.24, 2, 0, TAU); g.fill();
      var lg = g.createRadialGradient(0, mh * 0.24, 0, 0, mh * 0.24, 6);
      lg.addColorStop(0, f.hexA(f.ice, 0.3));
      lg.addColorStop(1, f.hexA(f.ice, 0));
      g.fillStyle = lg;
      g.beginPath(); g.arc(0, mh * 0.24, 6, 0, TAU); g.fill();
      g.restore();
    }
    // date window at 3
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var dwx = c + R * 0.76, dwy = c;
    g.fillStyle = '#0d1322';
    rr(g, dwx - R * 0.07, dwy - R * 0.055, R * 0.14, R * 0.11, 3);
    g.fill();
    g.strokeStyle = f.hexA(f.gold2, 0.6);
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = f.hexA('#dfe8f5', 0.9);
    g.font = '700 ' + Math.max(10, Math.round(R * 0.07)) + 'px ui-monospace, Consolas, monospace';
    g.fillText(String(new Date().getDate()), dwx, dwy + 1);
    // wordmark
    g.fillStyle = f.hexA(f.gold2, 0.85);
    g.font = '600 ' + Math.max(11, Math.round(R * 0.055)) + 'px Georgia, serif';
    g.fillText('D I A L', c, c - R * 0.38);
    g.fillStyle = f.hexA('#cfd8ea', 0.4);
    g.font = Math.max(8, Math.round(R * 0.026)) + 'px ui-monospace, Consolas, monospace';
    g.fillText('MACRO VALUATION', c, c - R * 0.3);
  });

  // ---------- cached: measurement tics revealed by the scan ----------
  var tics = f.cache('dm_tics', D, D, function (g, w, h) {
    var c = w / 2, i, n = 0;
    g.lineWidth = 1;
    g.strokeStyle = f.hexA(f.ice, 0.28);
    for (i = 0; i < 150 && n < 46; i++) {
      var x = (f.rnd(i * 9 + 501) * 2 - 1) * R * 0.9;
      var y = (f.rnd(i * 9 + 502) * 2 - 1) * R * 0.9;
      if (x * x + y * y > R * R * 0.72) continue;
      n++;
      var s = 1.5 + f.rnd(i * 9 + 503) * 2.5;
      g.beginPath();
      g.moveTo(c + x - s, c + y); g.lineTo(c + x + s, c + y);
      g.moveTo(c + x, c + y - s); g.lineTo(c + x, c + y + s);
      g.stroke();
    }
    g.strokeStyle = f.hexA(f.ice, 0.18);
    g.setLineDash([4, 6]);
    g.beginPath(); g.arc(c, c, R * 0.52, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = f.hexA(f.ice, 0.25);
    g.beginPath();
    g.moveTo(c - R * 0.9, c); g.lineTo(c + R * 0.9, c);
    g.moveTo(c - R * 0.9, c - 5); g.lineTo(c - R * 0.9, c + 5);
    g.moveTo(c + R * 0.9, c - 5); g.lineTo(c + R * 0.9, c + 5);
    g.stroke();
  });

  // ---------- cached: tiny HUD boxes ----------
  function hudBox(key, label, value, col, valCol) {
    return f.cache(key, 120, 42, function (g, w, h) {
      g.fillStyle = f.hexA(col, 0.07);
      g.fillRect(0.5, 0.5, w - 1, h - 1);
      g.strokeStyle = f.hexA(col, 0.4);
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      g.strokeStyle = f.hexA(col, 0.95);
      g.beginPath();
      g.moveTo(0.5, 7); g.lineTo(0.5, 0.5); g.lineTo(7, 0.5);
      g.moveTo(w - 7, h - 0.5); g.lineTo(w - 0.5, h - 0.5); g.lineTo(w - 0.5, h - 7);
      g.stroke();
      g.font = '9px ui-monospace, Consolas, monospace';
      g.fillStyle = f.hexA(col, 0.7);
      g.fillText(label, 9, 15);
      g.font = '700 13px ui-monospace, Consolas, monospace';
      g.fillStyle = f.hexA(valCol || col, 0.95);
      g.fillText(value, 9, 32);
    });
  }
  var locked = t > 0.75;
  var hud0 = hudBox('dm_h0', 'CASE DIAMETER', '42.0 MM', f.ice);
  var hud1 = hudBox('dm_h1', 'LUME INDEX', '96.4 %', f.ice);
  var hud2 = locked
    ? hudBox('dm_h2b', 'VALUATION', 'LOCKED', f.gold)
    : hudBox('dm_h2a', 'VALUATION', 'SCANNING', f.ice);

  // ================= per-frame =================
  ctx.save();

  // drifting bokeh backdrop (ambient)
  var bdx = Math.sin(ms * 0.00006) * 24, bdy = Math.cos(ms * 0.000045) * 18;
  ctx.globalAlpha = baseA * vis * dk;
  ctx.drawImage(bokeh, -PAD + bdx, -PAD + bdy);

  // enter dial space (entrance scale 1.06 -> 1)
  ctx.translate(cx, cy);
  ctx.scale(scl, scl);

  ctx.globalAlpha = baseA * vis;
  ctx.drawImage(dial, -D / 2, -D / 2);

  // lume pulse overlay (ambient)
  var i, a;
  for (i = 0; i < 12; i++) {
    if (i === 3) continue;
    a = i / 12 * TAU - Math.PI / 2;
    ctx.fillStyle = f.hexA(f.ice, (0.1 + 0.08 * Math.sin(ms * 0.0025 + i * 1.7)) * dk);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76, 4.5, 0, TAU);
    ctx.fill();
  }

  // scan beam progress (completes on exit)
  var bp = f.clamp01(f.ease(t) * 1.02 + eout * 1.5);
  var bx = lerp(-R, R, bp);
  var fp = f.clamp01((t - 0.75) / 0.22);

  // ---- clipped to dial: revealed tics, beam, flare wash ----
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.97, 0, TAU);
  ctx.clip();

  if (bx > -R * 0.98) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-R, -R, bx + R, R * 2);
    ctx.clip();
    ctx.globalAlpha = baseA * vis * (0.6 + 0.08 * Math.sin(ms * 0.004));
    ctx.drawImage(tics, -D / 2, -D / 2);
    ctx.restore();
  }

  var edgeFade = f.clamp01(bp * 14) * f.clamp01((1 - bp) * 14);
  if (edgeFade > 0.01) {
    var flick = 0.85 + 0.12 * Math.sin(ms * 0.017) + 0.03 * Math.sin(ms * 0.043);
    var trail = R * 0.55;
    var grd = ctx.createLinearGradient(bx - trail, 0, bx, 0);
    grd.addColorStop(0, f.hexA(f.ice, 0));
    grd.addColorStop(0.75, f.hexA(f.ice, 0.07 * dk));
    grd.addColorStop(1, f.hexA(f.ice, 0.18 * dk));
    ctx.globalAlpha = baseA * vis * edgeFade * flick;
    ctx.fillStyle = grd;
    ctx.fillRect(bx - trail, -R, trail, R * 2);
    ctx.fillStyle = f.hexA(f.ice, 0.2 * dk);
    ctx.fillRect(bx - 5, -R, 8, R * 2);
    ctx.fillStyle = f.hexA('#e9f4ff', 0.95 * dk);
    ctx.fillRect(bx - 0.75, -R, 1.5, R * 2);
  }

  if (fp > 0 && fp < 1) {
    ctx.globalAlpha = baseA * vis * (1 - fp) * 0.1 * dk;
    ctx.fillStyle = f.gold;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.97, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // ---- live hands from real local time ----
  var dnow = new Date();
  var sec = dnow.getSeconds() + dnow.getMilliseconds() / 1000;
  var mnu = dnow.getMinutes() + sec / 60;
  var hrs = (dnow.getHours() % 12) + mnu / 60;
  var aH = hrs / 12 * TAU - Math.PI / 2;
  var aM = mnu / 60 * TAU - Math.PI / 2;
  var aS = sec / 60 * TAU - Math.PI / 2;
  var handCol = f.dark ? f.fg : '#dde7f5';

  ctx.lineCap = 'round';
  ctx.globalAlpha = baseA * vis;

  function hand(ang, tail, len, wid, col) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = wid + 1.2;
    ctx.beginPath();
    ctx.moveTo(-ca * tail + 2.2, -sa * tail + 3.2);
    ctx.lineTo(ca * len + 2.2, sa * len + 3.2);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = wid;
    ctx.beginPath();
    ctx.moveTo(-ca * tail, -sa * tail);
    ctx.lineTo(ca * len, sa * len);
    ctx.stroke();
  }

  hand(aH, R * 0.06, R * 0.46, Math.max(3, R * 0.03), handCol);
  ctx.strokeStyle = 'rgba(8,12,22,0.55)';
  ctx.lineWidth = Math.max(1, R * 0.011);
  ctx.beginPath();
  ctx.moveTo(Math.cos(aH) * R * 0.14, Math.sin(aH) * R * 0.14);
  ctx.lineTo(Math.cos(aH) * R * 0.4, Math.sin(aH) * R * 0.4);
  ctx.stroke();

  hand(aM, R * 0.07, R * 0.7, Math.max(2, R * 0.02), handCol);
  ctx.strokeStyle = 'rgba(8,12,22,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.cos(aM) * R * 0.16, Math.sin(aM) * R * 0.16);
  ctx.lineTo(Math.cos(aM) * R * 0.62, Math.sin(aM) * R * 0.62);
  ctx.stroke();

  hand(aS, R * 0.18, R * 0.82, 1.5, f.gold);
  ctx.fillStyle = f.gold;
  ctx.beginPath();
  ctx.arc(-Math.cos(aS) * R * 0.18, -Math.sin(aS) * R * 0.18, Math.max(3, R * 0.022), 0, TAU);
  ctx.fill();

  // centre cap
  ctx.fillStyle = f.gold2;
  ctx.beginPath(); ctx.arc(0, 0, Math.max(4, R * 0.032), 0, TAU); ctx.fill();
  ctx.fillStyle = '#0b101d';
  ctx.beginPath(); ctx.arc(0, 0, Math.max(1.6, R * 0.012), 0, TAU); ctx.fill();

  // ---- valuation-lock flare ring (t > 0.75) ----
  if (fp > 0 && fp < 1) {
    var fr = f.ease(fp) * R * 1.08;
    var fa = (1 - fp) * (1 - fp) * 0.6 * dk * vis;
    ctx.globalAlpha = baseA;
    ctx.strokeStyle = f.hexA(f.gold, fa);
    ctx.lineWidth = 2 + 6 * (1 - fp);
    ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = f.hexA(f.gold, fa * 0.35);
    ctx.lineWidth = 14 * (1 - fp) + 8;
    ctx.beginPath(); ctx.arc(0, 0, fr * 0.96, 0, TAU); ctx.stroke();
  }

  // ---- HUD boxes fade in behind the beam ----
  var boxes = [
    { img: hud0, x: -R * 1.38, y: -R * 0.58, tx: -R * 0.6, ty: -R * 0.28, col: f.ice },
    { img: hud1, x: -R * 1.28, y: R * 0.34, tx: -R * 0.3, ty: R * 0.45, col: f.ice },
    { img: hud2, x: R * 1.06, y: -R * 0.5, tx: R * 0.52, ty: -R * 0.2, col: locked ? f.gold : f.ice }
  ];
  for (i = 0; i < 3; i++) {
    var b = boxes[i];
    var ap = f.clamp01((bx - b.tx) / (R * 0.22)) * vis;
    if (ap <= 0.01) continue;
    ctx.globalAlpha = baseA * ap;
    var ex = b.x < 0 ? b.x + 120 : b.x;
    ctx.strokeStyle = f.hexA(b.col, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex, b.y + 21);
    ctx.lineTo(b.tx, b.ty);
    ctx.stroke();
    ctx.fillStyle = f.hexA(b.col, 0.9);
    ctx.beginPath(); ctx.arc(b.tx, b.ty, 2.5, 0, TAU); ctx.fill();
    var rp = (ms * 0.0012 + i * 0.4) % 1;
    ctx.strokeStyle = f.hexA(b.col, 0.5 * (1 - rp));
    ctx.beginPath(); ctx.arc(b.tx, b.ty, 3 + rp * 9, 0, TAU); ctx.stroke();
    ctx.drawImage(b.img, b.x, b.y);
    ctx.fillStyle = f.hexA(b.col, Math.sin(ms * 0.006 + i * 2.1) > 0.3 ? 0.9 : 0.2);
    ctx.fillRect(b.x + 108, b.y + 8, 4, 4);
  }

  ctx.restore();
}

function paintSchematicRealm(ctx, f) {
  var W = f.W, H = f.H, ms = f.ms, TAU = Math.PI * 2;
  var A = f.dark ? 1 : 0.5;
  var ei = f.ease(f.clamp01(f.in01));
  var eo = f.ease(f.clamp01(f.out01));
  var live = 1 - eo;
  var base = ctx.globalAlpha;
  var cx = W * 0.55, cy = H * 0.48, R = Math.min(W, H) * 0.3;
  var mn = Math.min(W, H);
  var j, k;

  function al(a) { ctx.globalAlpha = base * f.clamp01(a); }

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  /* ---------- (a) blueprint wireframe terrain (cached), tilted/panned by t ---------- */
  var tW = Math.max(2, Math.round(W));
  var tH = Math.max(2, Math.round(H * 0.62));
  var terr = f.cache('srTerrain', tW, tH, function (g, w, h) {
    g.lineWidth = 1;
    var vpx = w * 0.5, rows = 16, cols = 56;
    var pts = [], i, c, z, row;
    function elev(u, v) {
      return Math.sin(u * 4.4 + v * 2.1 + f.rnd(3) * 6.28) * 0.55 +
             Math.sin(u * 9.3 - v * 3.4 + f.rnd(11) * 6.28) * 0.30 +
             Math.sin(u * 16.9 + v * 5.2 + f.rnd(23) * 6.28) * 0.15;
    }
    for (i = 0; i <= rows; i++) {
      z = i / rows;
      var ry = 3 + Math.pow(z, 1.65) * (h - 8);
      var half = w * (0.14 + 0.38 * z + 0.95 * z * z);
      var amp = Math.pow(z, 1.35) * h * 0.24;
      row = [];
      for (c = 0; c <= cols; c++) {
        var u = c / cols;
        row.push(vpx + (u - 0.5) * 2 * half,
                 ry - amp * (0.5 + 0.5 * elev(u * 3.1, z * 2.6)));
      }
      pts.push(row);
    }
    for (i = 0; i <= rows; i++) {
      z = i / rows;
      row = pts[i];
      g.strokeStyle = f.hexA(f.violet, (0.045 + z * 0.06) * A);
      g.beginPath();
      g.moveTo(row[0], row[1]);
      for (c = 1; c <= cols; c++) g.lineTo(row[c * 2], row[c * 2 + 1]);
      g.stroke();
    }
    g.strokeStyle = f.hexA(f.violet, 0.05 * A);
    g.beginPath();
    for (c = 0; c <= cols; c += 4) {
      g.moveTo(pts[0][c * 2], pts[0][c * 2 + 1]);
      for (i = 1; i <= rows; i++) g.lineTo(pts[i][c * 2], pts[i][c * 2 + 1]);
    }
    g.stroke();
    g.strokeStyle = f.hexA(f.ice, 0.10 * A);
    g.beginPath(); g.moveTo(0, 2.5); g.lineTo(w, 2.5); g.stroke();
    g.strokeStyle = f.hexA(f.ice, 0.04 * A);
    g.beginPath(); g.moveTo(0, 4.5); g.lineTo(w, 4.5); g.stroke();
  });
  var tilt = f.ease(f.t);
  var dh = tH * (1 - tilt * 0.16);
  var tBot = H + 12 - tilt * H * 0.10 + (1 - ei) * 46;
  al(ei * live);
  ctx.drawImage(terr, 0, tBot - dh, W, dh);

  /* ---------- particle dust ---------- */
  var dustGold = f.hexA(f.gold2, 0.10 * A);
  var dustIce = f.hexA(f.ice, 0.08 * A);
  var dustDim = f.hexA(f.ice, 0.05 * A);
  al(ei * live);
  for (j = 0; j < 42; j++) {
    var dx0 = f.rnd(j * 31 + 2) * W + Math.sin(ms * 0.0004 + j * 1.3) * 6;
    var spd = 6 + f.rnd(j * 31 + 9) * 14;
    var dy0 = (f.rnd(j * 31 + 5) * H - ms * 0.001 * spd) % H;
    if (dy0 < 0) dy0 += H;
    ctx.fillStyle = (j % 3 === 0) ? dustGold : (j % 3 === 1 ? dustIce : dustDim);
    var dsz = (j % 5 === 0) ? 2 : 1;
    ctx.fillRect(dx0, dy0, dsz, dsz);
  }

  /* ---------- (c) drafting furniture: crop marks + crosshair ---------- */
  al(ei * live);
  ctx.lineWidth = 1;
  ctx.strokeStyle = f.hexA(f.ice, 0.30 * A);
  var m = 16.5, L = 20;
  ctx.beginPath();
  ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
  ctx.moveTo(W - m - L, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + L);
  ctx.moveTo(m, H - m - L); ctx.lineTo(m, H - m); ctx.lineTo(m + L, H - m);
  ctx.moveTo(W - m - L, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - L);
  ctx.stroke();

  ctx.strokeStyle = f.hexA(f.ice, 0.26 * A);
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 9, cy);
  ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + 26, cy);
  ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy - 9);
  ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + 26);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU); ctx.stroke();

  /* ---------- measurement ticks along orbit ---------- */
  var oProg = f.ease(f.clamp01(f.in01 * 1.25));
  var NT = 60;
  al(ei * live);
  ctx.strokeStyle = f.hexA(f.ice, 0.20 * A);
  ctx.beginPath();
  for (k = 0; k < NT; k++) {
    if (k / NT > oProg) break;
    var ta = -Math.PI / 2 + (k / NT) * TAU;
    var lng = (k % 5 === 0);
    var r0 = R + 5, r1 = R + (lng ? 15 : 9);
    var ct = Math.cos(ta), st = Math.sin(ta);
    ctx.moveTo(cx + ct * r0, cy + st * r0);
    ctx.lineTo(cx + ct * r1, cy + st * r1);
    if (lng) {
      var rr = r1 + 5;
      ctx.moveTo(cx + ct * rr + st * 3, cy + st * rr - ct * 3);
      ctx.lineTo(cx + ct * rr - st * 3, cy + st * rr + ct * 3);
    }
  }
  ctx.stroke();

  /* ---------- (b) huge dashed orbit circle (draw-in / un-draw) ---------- */
  var arcEnd = TAU * f.ease(f.clamp01(f.in01 * 1.1));
  if (arcEnd > 0.001) {
    al(live);
    ctx.setLineDash([Math.max(0.01, 7 * (1 - eo)), 6 + 8 * eo]);
    ctx.lineDashOffset = -ms * 0.008 - eo * 420;
    ctx.strokeStyle = f.hexA(f.ice, 0.10 * A);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + arcEnd);
    ctx.stroke();
    ctx.strokeStyle = f.hexA(f.ice, 0.55 * A);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + arcEnd);
    ctx.stroke();
    ctx.setLineDash([1, 7]);
    ctx.lineDashOffset = -ms * 0.004;
    ctx.lineWidth = 1;
    ctx.strokeStyle = f.hexA(f.ice, 0.10 * A);
    ctx.beginPath();
    ctx.arc(cx, cy, R + 24, -Math.PI / 2, -Math.PI / 2 + arcEnd);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  /* ---------- second crossing ellipse orbit (gold2, thin) ---------- */
  var rot = -0.45, rx = R * 1.5, ryE = R * 0.42;
  var eEnd = TAU * f.ease(f.clamp01(f.in01 * 1.1 - 0.05));
  if (eEnd > 0.001) {
    al(live);
    ctx.strokeStyle = f.hexA(f.gold2, 0.30 * A);
    ctx.lineWidth = 1;
    ctx.setLineDash([Math.max(0.01, 60 * (1 - eo)), 0.01 + 60 * eo]);
    ctx.lineDashOffset = -ms * 0.004 - eo * 260;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ryE, rot, 0, eEnd);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    var eaAng = ms * 0.00022 + 2.0;
    var ce = Math.cos(eaAng) * rx, se = Math.sin(eaAng) * ryE;
    var exx = cx + ce * Math.cos(rot) - se * Math.sin(rot);
    var eyy = cy + ce * Math.sin(rot) + se * Math.cos(rot);
    al(ei * live);
    ctx.fillStyle = f.hexA(f.gold2, 0.14 * A);
    ctx.beginPath(); ctx.arc(exx, eyy, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = f.hexA(f.gold2, 0.8 * A);
    ctx.beginPath(); ctx.arc(exx, eyy, 1.8, 0, TAU); ctx.fill();
  }

  /* ---------- comet head travelling the orbit ---------- */
  var ca = -Math.PI / 2 + ms * 0.00034;
  al(ei * live);
  for (j = 6; j >= 1; j--) {
    var pa = ca - j * 0.055;
    ctx.fillStyle = f.hexA(f.gold, (0.30 - j * 0.045) * A);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(pa) * R, cy + Math.sin(pa) * R, Math.max(0.6, 3 - j * 0.4), 0, TAU);
    ctx.fill();
  }
  var hx = cx + Math.cos(ca) * R, hy = cy + Math.sin(ca) * R;
  ctx.fillStyle = f.hexA(f.gold, 0.07 * A);
  ctx.beginPath(); ctx.arc(hx, hy, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = f.hexA(f.gold, 0.16 * A);
  ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, TAU); ctx.fill();
  ctx.fillStyle = f.hexA(f.gold, 0.65 * A);
  ctx.beginPath(); ctx.arc(hx, hy, 3.1, 0, TAU); ctx.fill();
  ctx.fillStyle = f.hexA('#fff6da', 0.95 * A);
  ctx.beginPath(); ctx.arc(hx, hy, 1.6, 0, TAU); ctx.fill();

  /* ---------- compass rose, top-right (cached linework) ---------- */
  var CS = 96;
  var rose = f.cache('srRose', CS, CS, function (g, w, h) {
    var c = w / 2, q;
    g.lineWidth = 1;
    g.lineJoin = 'round';
    g.strokeStyle = f.hexA(f.ice, 0.38 * A);
    g.beginPath(); g.arc(c, c, 40, 0, TAU); g.stroke();
    g.strokeStyle = f.hexA(f.ice, 0.14 * A);
    g.beginPath(); g.arc(c, c, 33.5, 0, TAU); g.stroke();
    g.strokeStyle = f.hexA(f.ice, 0.32 * A);
    g.beginPath();
    for (var kk = 0; kk < 24; kk++) {
      var a2 = (kk / 24) * TAU;
      var rr0 = (kk % 6 === 0) ? 34 : 37;
      g.moveTo(c + Math.cos(a2) * rr0, c + Math.sin(a2) * rr0);
      g.lineTo(c + Math.cos(a2) * 40, c + Math.sin(a2) * 40);
    }
    g.stroke();
    function kite(a, len, wd, col, aFill) {
      var tx = c + Math.cos(a) * len, ty = c + Math.sin(a) * len;
      var pxk = Math.cos(a + Math.PI / 2), pyk = Math.sin(a + Math.PI / 2);
      var bx = c + Math.cos(a) * 6, by = c + Math.sin(a) * 6;
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(bx + pxk * wd, by + pyk * wd);
      g.lineTo(c, c);
      g.lineTo(bx - pxk * wd, by - pyk * wd);
      g.closePath();
      g.fillStyle = f.hexA(col, aFill * A);
      g.fill();
      g.strokeStyle = f.hexA(col, 0.6 * A);
      g.stroke();
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(bx + pxk * wd, by + pyk * wd);
      g.lineTo(c, c);
      g.closePath();
      g.fillStyle = f.hexA(col, 0.35 * A);
      g.fill();
    }
    for (q = 0; q < 4; q++) kite(-Math.PI / 2 + q * Math.PI / 2, 29, 4.5, f.gold2, 0.14);
    for (q = 0; q < 4; q++) kite(-Math.PI / 4 + q * Math.PI / 2, 17, 3, f.violet, 0.12);
    g.fillStyle = f.hexA(f.gold, 0.9 * A);
    g.beginPath(); g.arc(c, c, 2.6, 0, TAU); g.fill();
    g.strokeStyle = f.hexA(f.gold2, 0.5 * A);
    g.beginPath(); g.arc(c, c, 5.5, 0, TAU); g.stroke();
  });
  var rX = W - CS - 24, rY = 22 + Math.sin(ms * 0.0006) * 2.5;
  al(ei * live * 0.9);
  ctx.drawImage(rose, rX, rY);
  var sc = rX + CS / 2, scy = rY + CS / 2, sa = ms * 0.0011;
  ctx.lineWidth = 1;
  for (j = 0; j < 4; j++) {
    var swA = sa - j * 0.12;
    ctx.strokeStyle = f.hexA(f.ice, (0.16 - j * 0.035) * A);
    ctx.beginPath();
    ctx.moveTo(sc, scy);
    ctx.lineTo(sc + Math.cos(swA) * 31, scy + Math.sin(swA) * 31);
    ctx.stroke();
  }

  /* ---------- (d) floating quest-rune glyphs ---------- */
  var NG = 7, GS = 26;
  var GP = [0, 0, 0];
  function gpos(i, out) {
    var dep = 0.7 + f.rnd(i * 9 + 7) * 0.6;
    var dir = f.rnd(i * 9 + 2) > 0.5 ? -1 : 1;
    out[0] = W * (0.07 + f.rnd(i * 9 + 1) * 0.40) +
             Math.sin(ms * 0.00030 + i * 1.9) * 7 * dep + eo * dir * 70 * dep;
    out[1] = H * (0.13 + f.rnd(i * 9 + 4) * 0.56) +
             Math.cos(ms * 0.00023 + i * 2.6) * 5 * dep - eo * 60 * dep;
    out[2] = dep;
    return out;
  }
  function glyphC(i) {
    return f.cache('srGly' + i, GS, GS, function (g, w, h) {
      g.lineWidth = 1;
      var gold2 = f.gold2, vio = f.violet, ice = f.ice;
      if (i === 0) { /* sword */
        g.fillStyle = f.hexA(ice, 0.85 * A);
        g.fillRect(12, 2, 2, 13);
        g.fillStyle = f.hexA(ice, 0.35 * A);
        g.fillRect(11, 4, 1, 9);
        g.fillStyle = f.hexA(gold2, 0.95 * A);
        g.fillRect(8, 15, 10, 2);
        g.fillStyle = f.hexA(gold2, 0.7 * A);
        g.fillRect(12, 17, 2, 4);
        g.fillRect(11, 21, 4, 2);
      } else if (i === 1) { /* coin */
        g.strokeStyle = f.hexA(gold2, 0.9 * A);
        g.beginPath(); g.arc(13, 13, 8.5, 0, TAU); g.stroke();
        g.fillStyle = f.hexA(f.gold, 0.10 * A);
        g.beginPath(); g.arc(13, 13, 7, 0, TAU); g.fill();
        g.fillStyle = f.hexA(f.gold, 0.9 * A);
        g.fillRect(12, 9, 2, 8);
        g.fillRect(10, 11, 6, 1);
        g.fillRect(10, 14, 6, 1);
      } else if (i === 2) { /* book */
        g.strokeStyle = f.hexA(vio, 0.85 * A);
        g.strokeRect(5.5, 7.5, 15, 12);
        g.beginPath(); g.moveTo(13.5, 7.5); g.lineTo(13.5, 19.5); g.stroke();
        g.strokeStyle = f.hexA(vio, 0.4 * A);
        g.beginPath();
        g.moveTo(8, 11.5); g.lineTo(11.5, 11.5);
        g.moveTo(8, 14.5); g.lineTo(11.5, 14.5);
        g.moveTo(15.5, 11.5); g.lineTo(19, 11.5);
        g.moveTo(15.5, 14.5); g.lineTo(19, 14.5);
        g.stroke();
        g.fillStyle = f.hexA(f.gold, 0.9 * A);
        g.fillRect(15, 8, 2, 4);
      } else if (i === 3) { /* potion */
        g.fillStyle = f.hexA(gold2, 0.8 * A);
        g.fillRect(11, 2, 4, 2);
        g.fillStyle = f.hexA(ice, 0.6 * A);
        g.fillRect(12, 4, 2, 4);
        g.beginPath();
        g.moveTo(13, 7.5); g.lineTo(18.5, 20.5); g.lineTo(7.5, 20.5); g.closePath();
        g.fillStyle = f.hexA(vio, 0.30 * A);
        g.fill();
        g.strokeStyle = f.hexA(vio, 0.85 * A);
        g.stroke();
        g.fillStyle = f.hexA(vio, 0.85 * A);
        g.fillRect(12, 16, 2, 2);
      } else if (i === 4) { /* key */
        g.strokeStyle = f.hexA(gold2, 0.9 * A);
        g.beginPath(); g.arc(13, 7.5, 4, 0, TAU); g.stroke();
        g.fillStyle = f.hexA(gold2, 0.85 * A);
        g.fillRect(12, 11, 2, 11);
        g.fillRect(14, 16, 4, 2);
        g.fillRect(14, 20, 3, 2);
      } else if (i === 5) { /* shield */
        g.beginPath();
        g.moveTo(7.5, 5.5); g.lineTo(18.5, 5.5); g.lineTo(18.5, 13);
        g.lineTo(13, 20.5); g.lineTo(7.5, 13); g.closePath();
        g.fillStyle = f.hexA(ice, 0.10 * A);
        g.fill();
        g.strokeStyle = f.hexA(ice, 0.85 * A);
        g.stroke();
        g.strokeStyle = f.hexA(gold2, 0.8 * A);
        g.beginPath();
        g.moveTo(13.5, 8); g.lineTo(13.5, 17);
        g.moveTo(10, 11.5); g.lineTo(16, 11.5);
        g.stroke();
      } else { /* rune star */
        g.strokeStyle = f.hexA(vio, 0.85 * A);
        g.beginPath();
        g.moveTo(13.5, 4); g.lineTo(13.5, 22);
        g.moveTo(4, 13.5); g.lineTo(22, 13.5);
        g.stroke();
        g.strokeStyle = f.hexA(gold2, 0.8 * A);
        g.beginPath();
        g.moveTo(13.5, 9.5); g.lineTo(17.5, 13.5); g.lineTo(13.5, 17.5); g.lineTo(9.5, 13.5);
        g.closePath();
        g.stroke();
        g.fillStyle = f.hexA(f.gold, 0.7 * A);
        g.fillRect(12, 12, 3, 3);
      }
    });
  }
  for (var gi = 0; gi < NG; gi++) {
    gpos(gi, GP);
    var gxp = GP[0], dep = GP[2];
    var apIn = f.ease(f.clamp01((f.in01 - gi * 0.05) / 0.45));
    if (apIn <= 0) continue;
    var gw = GS * dep;
    var gy2 = GP[1] + (1 - apIn) * 16;
    al(apIn * live * (0.55 + 0.45 * (dep - 0.7) / 0.6));
    ctx.drawImage(glyphC(gi), gxp - gw / 2, gy2 - gw / 2, gw, gw);
    var uy = gy2 + gw * 0.62;
    var uw = gw * 0.95 * apIn;
    ctx.strokeStyle = f.hexA(f.ice, 0.22 * A);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gxp - uw / 2, uy); ctx.lineTo(gxp + uw / 2, uy);
    ctx.stroke();
    var cp = f.clamp01((f.in01 - (0.34 + gi * 0.085)) / 0.14);
    if (cp > 0) {
      var ks = dep * 0.9;
      var ox = gxp + gw * 0.62, oy = gy2 + gw * 0.30;
      var ax = ox - 4 * ks, ay = oy + 0.5 * ks;
      var bx2 = ox - 1 * ks, by2 = oy + 4 * ks;
      var cx2 = ox + 5 * ks, cy2 = oy - 3.5 * ks;
      var p1 = Math.min(1, cp / 0.4);
      var p2 = f.clamp01((cp - 0.4) / 0.6);
      if (cp >= 1) {
        ctx.fillStyle = f.hexA(f.gold, 0.10 * A);
        ctx.beginPath(); ctx.arc(ox, oy, 7, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = f.hexA(f.gold, 0.95 * A);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + (bx2 - ax) * p1, ay + (by2 - ay) * p1);
      if (p2 > 0) ctx.lineTo(bx2 + (cx2 - bx2) * p2, by2 + (cy2 - by2) * p2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  /* ---------- (e) radar ping from a random glyph every ~3s ---------- */
  var pc = ms / 3000, pk = Math.floor(pc), pf = pc - pk;
  gpos(Math.floor(f.rnd(pk * 13 + 5) * NG) % NG, GP);
  var pr = 8 + pf * mn * 0.10;
  al(Math.pow(1 - pf, 1.6) * 0.45 * ei * live);
  ctx.strokeStyle = f.hexA(f.ice, 0.8 * A);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(GP[0], GP[1], pr, 0, TAU); ctx.stroke();
  var pf2 = pf - 0.16;
  if (pf2 > 0) {
    al(Math.pow(1 - pf2, 1.6) * 0.22 * ei * live);
    ctx.beginPath(); ctx.arc(GP[0], GP[1], 8 + pf2 * mn * 0.10, 0, TAU); ctx.stroke();
  }

  ctx.restore();
}

PAINTERS[0] = paintRingsArena;
PAINTERS[1] = paintCosmosFlight;
PAINTERS[2] = paintMarketScape;
PAINTERS[3] = paintWealthHalo;
PAINTERS[4] = paintDialMacro;
PAINTERS[5] = paintSchematicRealm;

/* ---------- scene 1 set piece: the dragon crosses the cosmos ---------- */

const DRAGON_A = ['..d......d..', '..dd....dd..', '..dDDDDDDd..', 'ddDDDDDDDDDe', '..dDDDDDDdO.'];
const DRAGON_B = ['............', '..dDDDDDDd..', 'ddDDDDDDDDDe', '..dDDDDDDdO.', '..dd....dd..'];
const DRAGON_PAL = { D: '#c0392b', d: '#8e2418', e: '#ffd23f', O: '#e67e22' };
const fire = [];

function drawDragonFlight(t, ms, alpha) {
  const k = clamp01((t - 0.12) / 0.72);
  if (k <= 0 || k >= 1) return;
  const cell = Math.max(4, Math.round(Math.min(W, H) / 110));
  const x = -14 * cell + (W + 28 * cell) * ease(k);
  const y = H * 0.34 - Math.sin(k * Math.PI) * H * 0.1 + Math.sin(ms / 260) * 6;
  const map = Math.floor(ms / 110) % 2 === 0 ? DRAGON_A : DRAGON_B;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let ry = 0; ry < map.length; ry++) {
    for (let rx = 0; rx < map[ry].length; rx++) {
      const ch = map[ry][rx];
      if (ch === '.') continue;
      ctx.fillStyle = DRAGON_PAL[ch];
      ctx.fillRect(Math.round(x + rx * cell), Math.round(y + ry * cell), cell, cell);
    }
  }
  if (fire.length < 90 && Math.random() < 0.85) {
    fire.push({ x: x, y: y + 2.5 * cell, vx: -1.2 - Math.random(), vy: (Math.random() - 0.5) * 0.8, life: 1 });
  }
  for (let i = fire.length - 1; i >= 0; i--) {
    const f = fire[i];
    f.x += f.vx; f.y += f.vy; f.life -= 0.02;
    if (f.life <= 0) { fire.splice(i, 1); continue; }
    ctx.globalAlpha = alpha * f.life * 0.8;
    ctx.fillStyle = f.life > 0.5 ? '#e67e22' : '#c0392b';
    const s = 2 + f.life * 3;
    ctx.fillRect(f.x, f.y, s, s);
  }
  ctx.restore();
}

/* ---------- overlays, chrome, indicator ---------- */

const overlays = Array.from(document.querySelectorAll('.scene-ov'));
const dots = Array.from(document.querySelectorAll('.film-dots button'));
const pill = document.getElementById('film-pill');
const pillLabel = pill ? pill.querySelector('span') : null;
const duelUi = document.getElementById('duel-ui');
const banner = document.getElementById('duel-banner');

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

  let duelAlpha = 0;
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
    if (i === 0) duelAlpha = a;
  }

  // scene 0's subject: the live duel canvas rides on top of the rings
  if (duelCanvas) {
    duelCanvas.style.opacity = (duelAlpha * boot).toFixed(3);
    duelCanvas.style.visibility = duelAlpha > 0.01 ? 'visible' : 'hidden';
    if (window.__duel) window.__duel.setCam(clamp01(sp) * 0.5);
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
  const duelling = duelUi && !duelUi.hidden;
  if (pillLabel) {
    const label = idx === 0 ? '⚔ challenge deacon' : '⚔ return to the duel';
    if (pillLabel.textContent !== label) pillLabel.textContent = label;
    pill.style.opacity = (boot * (duelling ? 0 : 1)).toFixed(2);
    pill.style.pointerEvents = duelling ? 'none' : 'auto';
  }

  // wander off mid-duel and Marcus sheathes the bow
  if (duelling && sp > 1.5 && window.__duel) {
    window.__duel.challenge(false);
    duelUi.hidden = true;
    if (banner) banner.hidden = true;
  }

  // the film ends: the stage yields to the plain-flow epilogue sections
  const endK = clamp01((p - 0.965) / 0.03);
  stage.style.opacity = (1 - endK).toFixed(3);
  stage.style.visibility = endK >= 1 ? 'hidden' : 'visible';
  stage.style.pointerEvents = endK > 0.5 ? 'none' : '';
});

/* ---------- scene dots navigate the timeline ---------- */

const trackLen = () => Math.max(1, track.offsetHeight - innerHeight);
dots.forEach((d, i) => {
  d.addEventListener('pointerdown', e => e.preventDefault()); // no focus-scroll jumps, ever
  d.addEventListener('click', () => {
    lenis.scrollTo(track.offsetTop + trackLen() * ((i + 0.5) / SCENES), { duration: 1.4 });
  });
});

/* ---------- the playable duel ---------- */

if (pill && duelUi && banner && window.__duel) {
  const orbA = document.getElementById('orb-atk');
  const orbS = document.getElementById('orb-spec');
  const flee = document.getElementById('duel-exit');
  [pill, orbA, orbS, flee].forEach(b => b && b.addEventListener('pointerdown', e => e.preventDefault()));

  const startDuel = () => {
    window.__duel.challenge(true);
    duelUi.hidden = false;
    gsap.fromTo(duelUi.children, { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, ease: 'power3.out', overwrite: 'auto' });
  };

  pill.addEventListener('click', () => {
    const sp = p * SCENES;
    if (sp < 0.6) { startDuel(); return; }
    lenis.scrollTo(0, { duration: 1.5, onComplete: startDuel });
  });

  flee.addEventListener('click', () => {
    window.__duel.challenge(false);
    duelUi.hidden = true;
    banner.hidden = true;
  });

  orbA.addEventListener('click', () => window.__duel.playerAttack(false));
  orbS.addEventListener('click', () => window.__duel.playerAttack(true));
  addEventListener('keydown', e => {
    if (duelUi.hidden) return;
    if (e.code === 'Space') { e.preventDefault(); window.__duel.playerAttack(true); }
    else if (e.code === 'KeyA' || e.code === 'Enter') window.__duel.playerAttack(false);
  });

  const setOrb = (orb, v) => {
    orb.style.setProperty('--p', v.toFixed(3));
    orb.classList.toggle('ready', v >= 0.999);
  };
  gsap.ticker.add(() => {
    if (duelUi.hidden) return;
    const s = window.__duel.getState();
    setOrb(orbA, s.atk);
    setOrb(orbS, s.spec);
  });

  window.__duel.onResult = res => {
    banner.textContent = res === 'won' ? 'You are victorious!' : 'Oh dear, you are dead!';
    banner.classList.toggle('lose', res === 'lost');
    banner.hidden = false;
    gsap.fromTo(banner, { scale: 0.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(2.2)' });
    gsap.to(banner, { autoAlpha: 0, duration: 0.4, delay: 2.4, onComplete: () => { banner.hidden = true; } });
  };
}

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
