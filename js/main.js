/* deacondevs.com — hand-rolled, zero dependencies */
(() => {
'use strict';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const repaints = []; // canvases re-render through these on theme change / resize

const easeOut = t => 1 - Math.pow(1 - t, 3);

function hexA(hex, a) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function countUp(el, to, dur) {
  if (!el) return;
  if (REDUCED) { el.textContent = to; return; }
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.max(0, Math.round(to * easeOut(p)));
    if (p < 1) requestAnimationFrame(tick);
  };
  tick(t0);
}

/* ---------- OSRS hitsplat pixel art (shared by the duel and the favicon) ---------- */

const SPLAT_MAP = [
  '.......d.......',
  '...d...dd......',
  '...dd.drrd..d..',
  '....drrrrd.dd..',
  '..ddrrrrrrddd..',
  '.d.rrrrrrrrrd..',
  '..drrrrrrrrrdd.',
  'ddrrrrrrrrrrrdd',
  '..drrrrrrrrrd..',
  '.ddrrrrrrrrrd.d',
  '..drrrrrrrrdd..',
  '...drrrrrrd....',
  '..dd.drrd.dd...',
  '.d....dd...d...',
  '.......d.......',
];
const SPLAT_COLS = {
  hit: { r: '#c0281a', d: '#6f100a' },
  miss: { r: '#2951c4', d: '#0f2166' },
};
function drawSplatPixels(g, x, y, cell, kind) {
  let cols = SPLAT_COLS[kind] || SPLAT_COLS.hit;
  // gilded mode: hits land in gold, max-hit style
  if (kind === 'hit' && root.classList.contains('gilded')) cols = { r: '#d9a821', d: '#8a6d1d' };
  for (let ry = 0; ry < SPLAT_MAP.length; ry++) {
    const row = SPLAT_MAP[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === '.') continue;
      g.fillStyle = ch === 'r' ? cols.r : cols.d;
      g.fillRect(x + rx * cell, y + ry * cell, cell, cell);
    }
  }
}

/* ---------- favicon: the hitsplat, drawn live ---------- */

(function initFavicon() {
  try {
    const c = document.createElement('canvas');
    c.width = 30; c.height = 30;
    const g = c.getContext('2d');
    drawSplatPixels(g, 0, 0, 2, 'hit');
    const D7 = ['111', '..1', '..1', '.1.', '.1.'];
    const D3 = ['111', '..1', '.11', '..1', '111'];
    g.fillStyle = '#fff';
    const put = (D, cx) => D.forEach((row, ry) => {
      for (let rx = 0; rx < 3; rx++) if (row[rx] === '1') g.fillRect((cx + rx) * 2, (5 + ry) * 2, 2, 2);
    });
    put(D7, 4);
    put(D3, 8);
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = c.toDataURL('image/png');
  } catch (e) { /* static icon stays */ }
})();

/* ---------- theme + palette ---------- */

let PAL = {};
function refreshPalette() {
  const cs = getComputedStyle(root);
  const v = name => cs.getPropertyValue(name).trim();
  PAL = {
    fg: v('--fg'), muted: v('--muted'), line: v('--line'),
    bg: v('--bg'), bg2: v('--bg2'),
    accent: v('--accent-bright'), green: v('--green'), red: v('--red'),
    chart: [v('--c1'), v('--c2'), v('--c3'), v('--c4')],
  };
}

const THEME_KEY = 'dd-theme';
function applyTheme(t) {
  root.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', t === 'dark' ? '#05060b' : '#f2efe7');
  refreshPalette();
  repaints.forEach(fn => fn());
}
{
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
  if (saved !== 'dark' && saved !== 'light') {
    saved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    applyTheme(next);
    clogUnlock('theme-flip');
    checkMoon();
  });
}

/* ---------- collection log: what has this visitor discovered? ---------- */

const CLOG_ENTRIES = [
  { id: 'spec-marcus', name: 'The dragonfire volley', hint: 'loose the special in the boss fight' },
  { id: 'spec-deacon', name: 'Dragonfire endured', hint: 'watch Deacon draw breath' },
  { id: 'duel-death', name: 'The dragon falls', hint: 'see the boss fight through' },
  { id: 'duel-won', name: 'Dragon slayer', hint: 'fell Deacon the Blue' },
  { id: 'watch-scan', name: 'A full dial scan', hint: 'let the watch finish its reading' },
  { id: 'theme-flip', name: 'Flipped the lights', hint: 'try the other theme' },
  { id: 'email-reveal', name: 'The secret email', hint: 'scrapers never find it' },
  { id: 'ge-ledger', name: 'The full ledger', hint: 'inspect the grand exchange' },
  { id: 'xp-100', name: '100 XP earned', hint: 'keep clicking things' },
  { id: 'moon', name: 'The night sky', hint: 'after dark, lights off' },
];
let clogState = {};
try { clogState = JSON.parse(localStorage.getItem('dd-clog') || '{}'); } catch (e) { /* ignore */ }

function clogRender() {
  const grid = document.getElementById('clog-grid');
  const count = document.getElementById('clog-count');
  const total = document.getElementById('clog-total');
  if (!grid) return;
  grid.innerHTML = CLOG_ENTRIES.map(en => {
    const done = !!clogState[en.id];
    return '<li class="clog-item' + (done ? ' done' : '') + '"><span class="clog-mark">' + (done ? '✓' : '?') +
      '</span><div><h3>' + en.name + '</h3><p>' + en.hint + '</p></div></li>';
  }).join('');
  if (count) count.textContent = String(CLOG_ENTRIES.filter(en => clogState[en.id]).length);
  if (total) total.textContent = String(CLOG_ENTRIES.length);
}

function clogComplete() {
  return CLOG_ENTRIES.every(en => clogState[en.id]);
}

function clogUnlock(id) {
  if (clogState[id] || !CLOG_ENTRIES.some(en => en.id === id)) return;
  clogState[id] = Date.now();
  try { localStorage.setItem('dd-clog', JSON.stringify(clogState)); } catch (e) { /* ignore */ }
  clogRender();
  const finished = clogComplete() && !root.classList.contains('gilded');
  if (finished) root.classList.add('gilded');
  if (REDUCED) return;
  const entry = CLOG_ENTRIES.find(en => en.id === id);
  const t = document.createElement('div');
  t.className = 'clog-toast';
  t.textContent = 'Collection log: ' + entry.name;
  document.body.appendChild(t);
  t.addEventListener('animationend', () => t.remove());
  setTimeout(() => t.remove(), 4500);
  if (finished) {
    setTimeout(() => {
      const t2 = document.createElement('div');
      t2.className = 'clog-toast gilded-toast';
      t2.textContent = 'Collection log complete — gilded mode unlocked';
      document.body.appendChild(t2);
      t2.addEventListener('animationend', () => t2.remove());
      setTimeout(() => t2.remove(), 5000);
    }, 1200);
  }
}

function checkMoon() {
  const h = new Date().getHours();
  if ((h >= 19 || h < 5) && root.getAttribute('data-theme') === 'dark') clogUnlock('moon');
}

clogRender();
if (clogComplete()) root.classList.add('gilded');
checkMoon();
window.__clog = clogUnlock; // the film's boss fight reports its unlocks through this

/* ---------- hero: Marcus (range, Masori) vs Deacon (mage, Ancestral) ---------- */

(function initDuel() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const heroEl = canvas.parentElement;
  const watermark = document.querySelector('.watermark');
  let W = 0, H = 0, SC = 1, raf = 0, running = false, last = 0;
  let stars = [], motes = [], caches = null, THEME = null, lastNight = null;
  let surgeT0 = -99999;
  const flare = { r: -99999, m: -99999 };
  const cam = { x: 0, y: 0 };
  let ptx = 0, pty = 0;
  let camZ = 0;                    // scroll-driven dolly into the fight (0 wide, 1 close)
  let mode = 'auto';               // 'auto' spectator | 'player' you are Marcus
  let duelResult = null;
  const playerCd = { atk: 0, spec: 0 };

  const GOLD = '#f5c518'; /* OSRS-GOLD: canvas only */
  const IVORY = '#dfe6ff';

  const dark = () => root.getAttribute('data-theme') === 'dark';
  const gy = () => Math.round(H * 0.62);
  const isNight = () => { const h = new Date().getHours(); return h >= 19 || h < 5; };

  const COL = {
    skin: '#c8956c',
    masori: { base: '#332a24', trim: '#d2a13c', dark: '#211b17', quiver: '#4a3220', bow: '#6d4f28', string: '#cfc4a6', arrow: '#d9c284' },
    ancest: { base: '#232f5c', trim: '#7fb4d9', gold: '#d2a13c', dark: '#17203f', staff: '#453a66', orb: '#8f7fd9', ice: '#9cc7ff' },
    hpGreen: '#39c04a', hpRed: '#b0271f',
  };

  function mkFighter(name, kind, dir) {
    return {
      name, kind, dir, x: 0,
      hp: 30, maxHp: 30,
      phase: 'idle', phaseT: 0, spec: false,
      bob: Math.random() * 6,
      dead: false, deathT: 0,
      flash: 0, freeze: 0,
      hopY: 0, hopV: 0,
    };
  }
  const ranger = mkFighter('Marcus', 'range', 1);
  const mage = mkFighter('Deacon', 'mage', -1);
  const fighters = [ranger, mage];

  let projectiles = [], particles = [], splats = [], xpFloats = [], aoes = [];
  let shake = 0, nextAttack = 0, turn = 0, specReady = 0, respawnAt = 0;

  function size() {
    const w2 = canvas.clientWidth, h2 = canvas.clientHeight;
    if (!w2 || !h2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    // mobile URL-bar show/hide fires resize without changing anything that matters —
    // don't reshuffle the starfield for it
    if (w2 === W && h2 === H && caches && canvas.width === Math.round(w2 * dpr)) return;
    W = w2;
    H = h2;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    SC = Math.max(0.5, Math.min(W >= 640 ? 1.9 : 1.4, Math.min(H / 240, W / 420)));
    const sep = Math.max(W * 0.12, 8 * 4 * SC + 24);
    ranger.x = Math.round(W / 2 - sep);
    mage.x = Math.round(W / 2 + sep);
    stars = [];
    for (let i = 0; i < 26; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H * 0.4, s: Math.random() < 0.3 ? 2 : 1, p: Math.random() * 6.28 });
    }
    motes = [];
    for (let i = 0; i < 36; i++) {
      motes.push({ y: Math.random() * gy(), k: Math.random(), spd: 4 + Math.random() * 5, ph: Math.random() * 6.28, a: 0.04 + Math.random() * 0.06 });
    }
    buildCaches();
  }

  // ---- offscreen caches: rebuilt only on resize / theme / day-night flip ----
  function buildCaches() {
    if (!W || !H) return;
    const dk = dark();
    const night = isNight();
    lastNight = night;
    THEME = dk ? {
      skyA: 0.6, plinth: 'rgba(125,141,187,0.35)', reflA: 0.10,
      rim: 'rgba(223,230,255,0.28)',
      glowRest: 0.06, glowAmp: 0.02, glowFlare: 0.18,
      steel: 'rgba(125,141,187,0.7)', label: 'rgba(234,230,218,0.7)', num: '#d9b45b',
      shadowA: 0.35, skyText: 'rgba(139,143,160,0.6)', celestial: IVORY,
    } : {
      skyA: 1, plinth: '#cfc7b2', reflA: 0.06,
      rim: 'rgba(110,87,33,0.30)',
      glowRest: 0.05, glowAmp: 0.01, glowFlare: 0.12,
      steel: 'rgba(109,122,158,0.8)', label: 'rgba(29,27,22,0.7)', num: '#9a7a28',
      shadowA: 0.16, skyText: 'rgba(109,106,94,0.7)', celestial: '#8a6d3b',
    };
    const mk = (w2, h2) => { const c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(w2)); c2.height = Math.max(1, Math.round(h2)); return c2; };
    caches = {};

    // vignette + spotlight cone + floor pool
    const vig = mk(W, H);
    const vg = vig.getContext('2d');
    const gyv = gy();
    const core = vg.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.55);
    if (dk) {
      core.addColorStop(0, '#151a2e');
      core.addColorStop(1, 'rgba(21,26,46,0)');
    } else {
      core.addColorStop(0, 'rgba(255,255,255,0.55)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
    }
    vg.fillStyle = core;
    vg.fillRect(0, 0, W, H);
    if (dk) {
      const coneCol = night ? '#b8cdf2' : IVORY;
      const cone = vg.createLinearGradient(0, 0, 0, gyv);
      cone.addColorStop(0, hexA(coneCol, 0.05));
      cone.addColorStop(1, hexA(coneCol, 0));
      vg.fillStyle = cone;
      vg.beginPath();
      vg.moveTo(W * 0.46, 0); vg.lineTo(W * 0.54, 0);
      vg.lineTo(W * 0.73, gyv); vg.lineTo(W * 0.27, gyv);
      vg.closePath(); vg.fill();
    }
    vg.save();
    vg.translate(W * 0.5, gyv);
    vg.scale(1, 0.15);
    const pool = vg.createRadialGradient(0, 0, 0, 0, 0, W * 0.2);
    pool.addColorStop(0, hexA(dk ? IVORY : '#ffffff', dk ? 0.07 : 0.5));
    pool.addColorStop(1, hexA(dk ? IVORY : '#ffffff', 0));
    vg.fillStyle = pool;
    vg.beginPath(); vg.arc(0, 0, W * 0.2, 0, 6.2832); vg.fill();
    vg.restore();
    caches.vig = vig;

    // surge blob (themed: navy stage-light in the dark, warm flare in the light)
    const cor = mk(256, 256);
    const cg = cor.getContext('2d');
    const cgr = cg.createRadialGradient(128, 128, 0, 128, 128, 128);
    if (dk) {
      cgr.addColorStop(0, hexA(IVORY, 0.12));
      cgr.addColorStop(0.4, hexA('#151a2e', 0.5));
      cgr.addColorStop(1, 'rgba(21,26,46,0)');
    } else {
      cgr.addColorStop(0, 'rgba(255,255,255,0.55)');
      cgr.addColorStop(0.4, hexA('#e8c25a', 0.3));
      cgr.addColorStop(1, 'rgba(255,255,255,0)');
    }
    cg.fillStyle = cgr;
    cg.fillRect(0, 0, 256, 256);
    caches.core = cor;

    // Gielinor skyline silhouette (2x width for parallax headroom)
    const skH = Math.max(34, Math.round(H * 0.1));
    const tw = W * 2;
    const sky2 = mk(tw, skH);
    const sg = sky2.getContext('2d');
    sg.fillStyle = dk ? '#0a0f1d' : '#cfc7b2';
    sg.beginPath();
    sg.moveTo(0, skH);
    sg.lineTo(0, skH * 0.8);
    let xx = 0;
    let seed = 7;
    while (xx < tw * 0.42) {
      seed = (seed * 16807) % 2147483647;
      const step = 50 + (seed % 100);
      seed = (seed * 16807) % 2147483647;
      const hgt = skH * (0.15 + (seed % 100) / 100 * 0.45);
      xx += step;
      sg.lineTo(xx, skH - hgt);
      seed = (seed * 16807) % 2147483647;
      xx += 30 + (seed % 60);
      sg.lineTo(xx, skH - hgt);
    }
    sg.lineTo(xx, skH);
    sg.closePath();
    sg.fill();
    // wizards' tower
    const tx0 = tw * 0.55, shH = skH * 0.72;
    sg.fillRect(tx0, skH - shH, 10, shH);
    sg.fillRect(tx0 - 4, skH - shH - 6, 18, 6);
    sg.fillRect(tx0 + 4, skH - shH - 13, 2, 7);
    // lumbridge keep
    const kx = tw * 0.72, kh = skH * 0.5;
    sg.fillRect(kx, skH - kh, 46, kh);
    for (let i = 0; i < 4; i++) sg.fillRect(kx + i * 12, skH - kh - 5, 6, 5);
    caches.sky = sky2;
    caches.skyH = skH;

    // mist tiles
    const mkMist = sd => {
      const m = mk(512, 48);
      const mg = m.getContext('2d');
      mg.fillStyle = hexA(dk ? '#9fb4d8' : '#ffffff', dk ? 0.05 : 0.08);
      for (let i = 0; i < 6; i++) {
        const cx2 = (sd * 97 + i * 131) % 512;
        const cy2 = 16 + ((sd * 31 + i * 57) % 18);
        const rx = 90 + ((i * 73 + sd * 13) % 90);
        const ry = 9 + ((i * 37) % 9);
        for (const off of [-512, 0, 512]) {
          mg.beginPath();
          mg.ellipse(cx2 + off, cy2, rx, ry, 0, 0, 6.2832);
          mg.fill();
        }
      }
      return m;
    };
    caches.mistA = mkMist(3);
    caches.mistB = mkMist(11);

    // under-glow radials
    const mkGlow = col => {
      const g2 = mk(128, 128);
      const gg = g2.getContext('2d');
      const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, hexA(col, 1));
      gr.addColorStop(1, hexA(col, 0));
      gg.fillStyle = gr;
      gg.fillRect(0, 0, 128, 128);
      return g2;
    };
    caches.glowG = mkGlow('#d9b45b');
    caches.glowV = mkGlow('#a05fd0');

    // rim-light edge cells (maps are initialised by the time size() runs)
    caches.rimR = computeRim(RANGER_MAP);
    caches.rimM = computeRim(MAGE_MAP);

    // reflection dissolve strip
    const gr2 = mk(16, 64);
    const gg2 = gr2.getContext('2d');
    const lg = gg2.createLinearGradient(0, 0, 0, 64);
    const bgc = dk ? '#05060b' : '#f2efe7';
    lg.addColorStop(0, hexA(bgc, 0.25));
    lg.addColorStop(1, bgc);
    gg2.fillStyle = lg;
    gg2.fillRect(0, 0, 16, 64);
    caches.grad = gr2;
  }

  // the visitor's actual sky, restyled as an instrument complication
  const UTC_LABEL = (() => {
    const m = -new Date().getTimezoneOffset();
    return 'GMT' + (m >= 0 ? '+' : '−') + Math.floor(Math.abs(m) / 60);
  })();

  function drawSkyMarks(t) {
    const night = isNight();
    if (night !== lastNight) buildCaches();
    const inset = W >= 640 ? 24 : 12;
    const cx2 = W - inset - 78 + cam.x * 3;
    const cy2 = inset + 62 + cam.y * 1.8;
    if (night && dark()) {
      for (const st of stars) {
        const tw = REDUCED ? 0.7 : 0.5 + 0.5 * Math.sin(t / 900 + st.p);
        ctx.globalAlpha = 0.08 + 0.08 * tw;
        ctx.fillStyle = IVORY;
        ctx.fillRect((st.x + cam.x * 3) | 0, (st.y + cam.y * 1.8) | 0, st.s, st.s);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = hexA(IVORY, 0.22);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx2, cy2, 13, 0, 6.2832); ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx2 + 6, cy2 - 3, 11.5, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else if (!night) {
      ctx.strokeStyle = hexA(THEME.celestial, 0.24);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx2, cy2, 12, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = hexA(THEME.celestial, 0.08);
      ctx.beginPath(); ctx.arc(cx2, cy2, 12, 0, 6.2832); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx2 + Math.cos(a) * 16, cy2 + Math.sin(a) * 16);
        ctx.lineTo(cx2 + Math.cos(a) * 19, cy2 + Math.sin(a) * 19);
        ctx.stroke();
      }
    } else {
      return; // night, light theme: the gallery keeps its walls bare
    }
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.skyText;
    ctx.fillText('LOCAL SKY · ' + UTC_LABEL, cx2, cy2 + 32);
    ctx.textAlign = 'left';
  }

  // ---- atmosphere ----
  function drawMist(t) {
    if (REDUCED || !caches.mistA) return;
    const wrap = v => ((v % 512) + 512) % 512;
    const xa = wrap(t * 0.006 + cam.x * 8);
    const xb = wrap(-t * 0.01 + cam.x * 8);
    for (let off = -512; off < W + 512; off += 512) {
      ctx.drawImage(caches.mistA, off - xa, gy() - 46);
      ctx.drawImage(caches.mistB, off - xb, gy() - 27);
    }
  }

  function drawMotes(t) {
    if (REDUCED) return;
    const surging = surgeVal(t) > 0.3;
    for (const m of motes) {
      const half = W * 0.04 + (W * 0.19) * (m.y / gy());
      const x = W * 0.5 + (m.k - 0.5) * 2 * half + Math.sin(t / 1000 + m.ph) * 3 + cam.x * 10;
      ctx.globalAlpha = m.a * (surging ? 1.6 : 1);
      ctx.fillStyle = IVORY;
      ctx.fillRect(x | 0, m.y | 0, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function surgeVal(t) {
    const el = t - surgeT0;
    if (el < 0 || el > 1200) return 0;
    if (el < 300) return easeOut(el / 300);
    if (el < 900) return 1;
    return 1 - easeOut((el - 900) / 300);
  }

  // ---- lighting ----
  // rim light: precomputed edge cells, lit from above and from stage centre
  function computeRim(map) {
    const cells = [];
    for (let r = 0; r < map.length; r++) {
      for (let c2 = 0; c2 < map[0].length; c2++) {
        if (map[r][c2] === '.') continue;
        const top = r === 0 || map[r - 1][c2] === '.';
        const side = c2 === map[0].length - 1 || map[r][c2 + 1] === '.';
        if (top || side) cells.push({ r, c: c2, top, side });
      }
    }
    return cells;
  }

  function drawRimFor(f, cells) {
    if (!cells || f.dead) return;
    const cell = 4 * SC;
    const ox = f.drawX !== undefined ? f.drawX : f.x;
    const oy = f.drawY !== undefined ? f.drawY : gy() + f.hopY;
    const top0 = oy - 19 * cell;
    ctx.fillStyle = THEME.rim;
    for (const rc of cells) {
      const left = f.dir === 1 ? ox + (rc.c - 8) * cell : ox + (8 - rc.c - 1) * cell;
      const ty = top0 + rc.r * cell;
      if (rc.top) ctx.fillRect(Math.round(left), Math.round(ty), Math.ceil(cell), Math.ceil(cell * 0.35));
      if (rc.side) {
        const sx2 = f.dir === 1 ? left + cell * 0.65 : left;
        ctx.fillRect(Math.round(sx2), Math.round(ty), Math.ceil(cell * 0.35), Math.ceil(cell));
      }
    }
  }

  function drawGlows(t) {
    if (!caches.glowG) return;
    const cell = 4 * SC;
    for (const f of fighters) {
      const img = f === ranger ? caches.glowG : caches.glowV;
      const fl = f === ranger ? flare.r : flare.m;
      let a2 = THEME.glowRest + THEME.glowAmp * (Math.sin(t / 4000 * 6.2832 + (f === ranger ? 0 : 2)) + 1) / 2;
      const since = t - fl;
      if (since >= 0 && since < 500) a2 = Math.max(a2, THEME.glowFlare * (1 - since / 500) + a2 * (since / 500));
      ctx.globalAlpha = a2;
      ctx.drawImage(img, f.x - 9 * cell, gy() - 2.2 * cell, 18 * cell, 4.4 * cell);
    }
    ctx.globalAlpha = 1;
  }

  function drawReflection(t) {
    if (!caches.grad) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gy() + 2, W, 64);
    ctx.clip();
    ctx.translate(0, 2 * gy() + 4);
    ctx.scale(1, -1);
    ctx.globalAlpha = THEME.reflA;
    drawRanger(ranger, t);
    drawMage(mage, t);
    for (const pr of projectiles) drawProjectile(pr, t);
    ctx.restore();
    // the dissolve strip is opaque — in film mode it would blot out the world canvas beneath
    if (!root.classList.contains('film')) ctx.drawImage(caches.grad, 0, gy() + 2, W, 64);
  }

  function drawAdditive(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pr of projectiles) {
      if (pr.kind === 'arrow') continue;
      ctx.globalAlpha = 0.35;
      drawProjectile(pr, t);
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.2;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    ctx.restore();
  }

  // ---- HUD callout annotations ----
  const CALLOUTS = [
    { f: 'r', row: 8, col: 12, side: -1, ly: 0.3, num: '01', text: 'TWISTED BOW — DRAGONFIRE DELIVERY SYSTEM' },
    { f: 'r', row: 1, col: 5, side: -1, ly: 0.42, num: '02', text: 'MASORI HOOD' },
    { f: 'r', row: 10, col: 2, side: -1, ly: 0.54, num: '03', text: 'CAPE — DRAMATIC EFFECT ONLY' },
    { f: 'm', row: 9, col: 12, side: 1, ly: 0.3, num: '01', text: 'ARCANE SPIRIT SHIELD' },
    { f: 'm', row: 4, col: 11, side: 1, ly: 0.42, num: '02', text: 'KODAI WAND' },
    { f: 'm', row: 13, col: 6, side: 1, ly: 0.54, num: '03', text: 'ROBES OF THE THIRD AGE… OF THIS SITE' },
  ].map(c2 => ({ ...c2, sx: 0, sy: 0 }));

  function drawCallouts(t) {
    const maxN = W < 640 ? 1 : 3;
    const inset = W >= 640 ? 24 : 12;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'bottom';
    for (const co of CALLOUTS) {
      if (parseInt(co.num, 10) > maxN) continue;
      const f = co.f === 'r' ? ranger : mage;
      if (f.dead || f.freeze > 0) continue;
      const cell = 4 * SC;
      const zc = 1 + 0.5 * camZ; // anchors track the scroll dolly's zoom
      let ax = f.dir === 1 ? f.x + (co.col - 8) * cell + cell / 2 : f.x + (8 - co.col - 1) * cell + cell / 2;
      let ay = gy() + f.hopY - 19 * cell + co.row * cell + cell / 2;
      ax = (ax - W / 2) * zc + W / 2;
      ay = (ay - gy()) * zc + gy();
      if (REDUCED || !co.sx) { co.sx = ax; co.sy = ay; }
      else { co.sx += (ax - co.sx) * 0.08; co.sy += (ay - co.sy) * 0.08; }
      const alpha = f.phase === 'windup' ? 0.25 : 1;
      const born = REDUCED ? 1 : Math.min(1, Math.max(0, (t - 1000 - parseInt(co.num, 10) * 140) / 800));
      if (born <= 0) continue;
      const sx2 = co.sx | 0, sy2 = co.sy | 0;
      const lx = co.side === -1 ? inset + 16 : W - inset - 16;
      // separate rails on phones so the two 01 labels never overprint
      const railLy = W < 640 ? (co.side === -1 ? 0.24 : 0.36) : co.ly;
      const ly = Math.round(H * railLy + cam.y * 2);
      const elbowX = sx2 + co.side * 36;
      const len = Math.hypot(elbowX - sx2, ly - sy2) + Math.abs(lx - elbowX);
      ctx.globalAlpha = alpha * born * 0.9;
      ctx.strokeStyle = THEME.steel;
      ctx.lineWidth = 1;
      ctx.setLineDash([len]);
      ctx.lineDashOffset = len * (1 - born);
      ctx.beginPath();
      ctx.moveTo(sx2, sy2);
      ctx.lineTo(elbowX, ly);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = THEME.steel;
      ctx.fillRect(sx2 - 1, sy2 - 1, 3, 3);
      ctx.textAlign = co.side === -1 ? 'left' : 'right';
      const numGap = ctx.measureText(co.num + ' ').width;
      ctx.fillStyle = THEME.num;
      ctx.fillText(co.num, lx, ly - 5);
      ctx.fillStyle = THEME.label;
      ctx.fillText(co.text, co.side === -1 ? lx + numGap : lx - numGap, ly - 5);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  /* ----- combat direction ----- */

  function scheduleNext(t) { nextAttack = t + 1200 + Math.random() * 900; }

  function startAttack(f, t, spec) {
    if (f.dead || f.phase !== 'idle' || respawnAt) return false;
    f.phase = 'windup';
    f.phaseT = t;
    f.spec = spec;
    return true;
  }

  function rollDamage(spec) {
    if (spec) return 12 + Math.floor(Math.random() * 7);
    if (Math.random() < 0.18) return 0;
    return 1 + Math.floor(Math.random() * 8);
  }

  function fire(f, t) {
    const target = f === ranger ? mage : ranger;
    const u = 4 * SC;
    const sx = f.x + f.dir * 3.4 * u;
    const sy = gy() - 9 * u;
    const tx = target.x;
    const ty = gy() - 8 * u;
    if (f.kind === 'range') {
      if (f.spec) {
        projectiles.push({
          kind: 'dragon', from: f, to: target, spec: true,
          sx, sy: sy - 2 * u, tx, ty, t0: t, dur: 780,
          dmg: rollDamage(true),
        });
      } else {
        projectiles.push({
          kind: 'arrow', from: f, to: target, spec: false,
          sx, sy, tx, ty, t0: t, dur: 400,
          dmg: rollDamage(false),
        });
      }
    } else {
      projectiles.push({
        kind: 'orb', from: f, to: target, spec: f.spec,
        sx, sy: sy - 1.5 * u, tx, ty, t0: t, dur: 640,
        dmg: rollDamage(f.spec),
      });
    }
    f.phase = 'idle';
    f.spec = false;
  }

  function projPos(pr, t) {
    const p = Math.max(0, Math.min(1, (t - pr.t0) / pr.dur));
    const arc = (pr.kind === 'orb' ? 24 : pr.kind === 'dragon' ? 16 : 12) * SC;
    return {
      p,
      x: pr.sx + (pr.tx - pr.sx) * p,
      y: pr.sy + (pr.ty - pr.sy) * p - Math.sin(p * Math.PI) * arc,
    };
  }

  function burst(x, y, color, n, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 2) * SC;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (up ? 1.2 * SC : 0),
        g: 0.05 * SC,
        life: 350 + Math.random() * 350, max: 700,
        size: (1.5 + Math.random() * 2) * SC,
        color,
      });
    }
  }

  function impact(pr, t) {
    const tgt = pr.to;
    if (tgt.dead) return;
    tgt.hp = Math.max(0, tgt.hp - pr.dmg);
    splats.push({ x: tgt.x + (Math.random() - 0.5) * 8 * SC, y: gy() - 8.5 * 4 * SC, t0: t, dmg: pr.dmg, miss: pr.dmg === 0 });
    if (pr.dmg > 0) {
      tgt.flash = 1;
      if (pr.from === ranger) flare.r = t; else flare.m = t;
      burst(tgt.x, gy() - 8 * 4 * SC, pr.kind === 'orb' ? COL.ancest.orb : COL.masori.trim, pr.spec ? 16 : 9);
      xpFloats.push({ x: pr.from.x, y: gy() - 25 * 4 * SC, t0: t, txt: '+' + pr.dmg * 4 + 'xp' });
      if (pr.spec || pr.dmg >= 7) shake = Math.min(1, shake + 0.7);
      if (pr.kind === 'dragon') {
        // dragonfire detonation
        burst(tgt.x, gy() - 8 * 4 * SC, '#e67e22', 22);
        burst(tgt.x, gy() - 6 * 4 * SC, '#c0392b', 12, true);
        shake = Math.min(1.3, shake + 1.1);
      }
      if (pr.kind === 'orb' && pr.spec) {
        // barrage: freeze plus an expanding icy blast
        tgt.freeze = 1;
        aoes.push({ x: tgt.x, t0: t });
        burst(tgt.x, gy() - 4 * 4 * SC, COL.ancest.ice, 18, true);
        shake = Math.min(1.3, shake + 0.9);
      }
    }
    if (tgt.hp <= 0 && !tgt.dead) {
      tgt.dead = true;
      tgt.deathT = t;
      respawnAt = t + 1700;
      pr.from.hopV = -3.4 * SC;
      pr.from.hopY = -0.1;
      burst(tgt.x, gy() - 5 * 4 * SC, dark() ? '#d8d4c8' : '#6a6456', 14, true);
      clogUnlock('duel-death');
      if (mode === 'player') {
        duelResult = tgt === mage ? 'won' : 'lost';
        if (duelResult === 'won') clogUnlock('duel-won');
        if (window.__duel && window.__duel.onResult) window.__duel.onResult(duelResult);
      }
    }
  }

  /* ----- update ----- */

  function update(t, dt) {
    if (t > nextAttack && !ranger.dead && !mage.dead && !respawnAt) {
      if (mode === 'player') {
        // Deacon fights back on his own; Marcus waits for your orders
        startAttack(mage, t, Math.random() < 0.18);
      } else {
        startAttack(turn === 0 ? ranger : mage, t, false);
        turn ^= 1;
      }
      scheduleNext(t);
    }
    for (const f of fighters) {
      if (f.phase === 'windup') {
        if (f.kind === 'mage') {
          // particles converge into the wand orb while casting
          const u = 4 * SC;
          const ox = f.x + f.dir * 3 * u, oy = gy() - 16 * u;
          const a = Math.random() * Math.PI * 2, r = 14 * SC;
          particles.push({
            x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r,
            vx: -Math.cos(a) * 1.4 * SC, vy: -Math.sin(a) * 1.4 * SC,
            g: 0, life: 220, max: 220, size: 1.6 * SC,
            color: f.spec ? COL.ancest.ice : COL.ancest.orb,
          });
        }
        if (t - f.phaseT > (f.kind === 'mage' ? 380 : 300)) fire(f, t);
      }
      f.flash *= 0.86;
      if (f.freeze > 0) f.freeze -= dt / 900;
      if (f.hopY < 0 || f.hopV !== 0) {
        f.hopY += f.hopV;
        f.hopV += 0.35 * SC;
        if (f.hopY >= 0) { f.hopY = 0; f.hopV = 0; }
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      const pos = projPos(pr, t);
      if (pr.kind === 'orb' && pos.p > 0 && pos.p < 1) {
        particles.push({
          x: pos.x, y: pos.y,
          vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
          g: 0, life: 300, max: 300, size: (1.2 + Math.random() * 1.6) * SC,
          color: pr.spec ? COL.ancest.ice : COL.ancest.orb,
        });
      }
      if (pr.kind === 'dragon' && pos.p > 0 && pos.p < 1) {
        // fire streaming off the dragon
        particles.push({
          x: pos.x - pr.from.dir * 10 * SC, y: pos.y + (Math.random() - 0.5) * 8 * SC,
          vx: -pr.from.dir * (0.5 + Math.random()), vy: (Math.random() - 0.5) * 0.6,
          g: -0.01, life: 340, max: 340, size: (1.6 + Math.random() * 2) * SC,
          color: Math.random() < 0.5 ? '#e67e22' : '#c0392b',
        });
      }
      if (pos.p >= 1) { impact(pr, t); projectiles.splice(i, 1); }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      if (p.g && p.y > gy() + 2 * SC) { p.y = gy() + 2 * SC; p.vy *= -0.35; p.vx *= 0.7; }
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    splats = splats.filter(s => t - s.t0 < 800);
    xpFloats = xpFloats.filter(s => t - s.t0 < 750);
    aoes = aoes.filter(a => t - a.t0 < 700);
    if (respawnAt && t > respawnAt) {
      for (const f of fighters) {
        if (f.dead) burst(f.x, gy() - 6 * 4 * SC, '#ffffff', 16, true);
        f.dead = false; f.hp = f.maxHp; f.flash = 0; f.freeze = 0; f.phase = 'idle';
      }
      respawnAt = 0;
      scheduleNext(t + 400);
    }
    shake *= 0.88;
  }

  /* ----- drawing ----- */

  function rr(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
  }

  function drawShadow(f) {
    const u = 4 * SC;
    ctx.fillStyle = 'rgba(0,0,0,' + THEME.shadowA + ')';
    ctx.beginPath();
    ctx.ellipse(f.x, gy() + 2, 5 * u, 0.85 * u, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,' + (THEME.shadowA * 0.5) + ')';
    ctx.beginPath();
    ctx.ellipse(f.x, gy() + 2, 7.5 * u, 1.25 * u, 0, 0, 6.2832);
    ctx.fill();
  }

  function deathTransform(f, t) {
    if (!f.dead) return 1;
    const dp = easeOut(Math.min(1, (t - f.deathT) / 420));
    ctx.translate(f.x, gy());
    ctx.rotate(-f.dir * dp * Math.PI / 2);
    ctx.translate(-f.x, -gy());
    const age = t - f.deathT;
    return age > 800 ? Math.max(0, 1 - (age - 800) / 300) : 1;
  }

  // side-profile pixel sprites modelled on Marcus's actual in-game characters:
  // slim silhouettes, twisted bow and arcane spirit shield front and centre
  const RANGER_MAP = [
    '....HHHH........',
    '....HHHGG.......',
    '....HHHGG.......',
    '....HBBE..WW....',
    '....HBMMM.sWw...',
    '....RRRR..s.W...',
    '..CCGGGG..s.WW..',
    '..CCGgGGSSs..W..',
    '..CCGgGGSVV.WW..',
    '..CCGgGG.VV.WW..',
    '..CCGGGG..s.WW..',
    '..CCBBBB..s..W..',
    '..CCBBBB..s.wW..',
    '..CCBRBB..s.W...',
    '....BBBB..sWW...',
    '....BB.BB.WW....',
    '....BB.BB.......',
    '...VVV.VVV......',
    '...VVV.VVVV.....',
  ];
  const RANGER_PAL = {
    H: '#1d1a19', G: '#d9a821', g: '#a87e18', B: '#26221f', E: '#d93025',
    M: '#5f7370', R: '#8a2c22', S: '#c8956c', C: '#15131a', V: '#6fae3d',
    W: '#2f2b26', w: '#574a38', s: '#cfc4a6',
  };
  const MAGE_MAP = [
    '.WW.............',
    '..WWW...........',
    '...WWWW.........',
    '....WWWWW.......',
    '....GGGGG..D....',
    '...WWSSSS..D....',
    '....WSbSS.aAa...',
    '...W.LLLL.aAAAa.',
    '...WLLLLLaAXAAa.',
    '...WLlLLLaXXXAa.',
    '...WLlLLLaAXAAa.',
    '...WLlLLLaAAAAa.',
    '...WLLLLL.aAAa..',
    '....LLLLL.aAa...',
    '....lLLLl..aa...',
    '....lLLLl.......',
    '....lllll.......',
    '.....BB.BB......',
    '.....BB.BB......',
  ];
  const MAGE_PAL = {
    W: '#e8e6df', G: '#d9a821', S: '#c8956c', b: '#2a1d12',
    L: '#8b96d6', l: '#6a76b8', B: '#5a5db0', D: '#4a5fd0',
    A: '#b9c4d2', a: '#4a5f96', X: '#7b5fd0',
  };

  // the ranger's special: arrows become dragons (two wing frames)
  const DRAGON_A = [
    '..d......d..',
    '..dd....dd..',
    '..dDDDDDDd..',
    'ddDDDDDDDDDe',
    '..dDDDDDDdO.',
  ];
  const DRAGON_B = [
    '............',
    '..dDDDDDDd..',
    'ddDDDDDDDDDe',
    '..dDDDDDDdO.',
    '..dd....dd..',
  ];
  const DRAGON_PAL = { D: '#c0392b', d: '#8e2418', e: '#ffd23f', O: '#e67e22' };

  function drawSprite(map, pal, cx, feetY, cell, d) {
    const rows = map.length, cols = map[0].length;
    const top = feetY - rows * cell;
    const cw = Math.ceil(cell);
    for (let ry = 0; ry < rows; ry++) {
      const row = map[ry];
      for (let rx = 0; rx < cols; rx++) {
        const k = row[rx];
        if (k === '.') continue;
        ctx.fillStyle = pal[k];
        const left = d === 1 ? cx + (rx - cols / 2) * cell : cx + (cols / 2 - rx - 1) * cell;
        ctx.fillRect(Math.round(left), Math.round(top + ry * cell), cw, cw);
      }
    }
  }

  function drawRanger(f, t) {
    const c = 4 * SC, u = 4 * SC, d = f.dir;
    const bob = (f.dead || f.freeze > 0 || REDUCED) ? 0 : Math.sin(t / 480 + f.bob) * 1.4 * SC;
    const wp = f.phase === 'windup' ? Math.min(1, (t - f.phaseT) / 300) : 0;
    const x = f.x + (f.flash > 0.05 ? (Math.random() - 0.5) * 3 : 0) + d * wp * 2;
    const y = gy() + f.hopY + bob;

    ctx.save();
    ctx.globalAlpha *= deathTransform(f, t);
    f.drawX = x; f.drawY = y; // rim light must reuse the exact draw origin (jitter is random per frame)
    drawSprite(RANGER_MAP, RANGER_PAL, x, y, c, d);
    if (wp > 0.15) {
      // pixel arrow nocked on the string, drawn back as he winds up
      const ay = Math.round(y - 10 * c);
      const tail = x + d * (2 - wp * 3.5) * c;
      const ah = Math.ceil(c * 0.7);
      ctx.fillStyle = COL.masori.arrow;
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(tail + d * i * c - (d === -1 ? c : 0)), ay, Math.ceil(c), ah);
      ctx.fillStyle = COL.masori.trim;
      ctx.fillRect(Math.round(tail + d * 4 * c - (d === -1 ? c : 0)), ay, Math.ceil(c), ah);
    }
    if (f.flash > 0.05) {
      ctx.fillStyle = hexA('#ff3b30', f.flash * 0.22);
      ctx.beginPath(); ctx.ellipse(x, y - 8 * u, 3.6 * u, 7 * u, 0, 0, 6.2832); ctx.fill();
    }
    if (f.freeze > 0) drawFreeze(x, y, u, f.freeze);
    ctx.restore();
  }

  function drawMage(f, t) {
    const c = 4 * SC, u = 4 * SC, d = f.dir;
    const bob = (f.dead || REDUCED) ? 0 : Math.sin(t / 520 + f.bob) * 1.4 * SC;
    const wp = f.phase === 'windup' ? Math.min(1, (t - f.phaseT) / 380) : 0;
    const x = f.x + (f.flash > 0.05 ? (Math.random() - 0.5) * 3 : 0) + d * wp * 2;
    const y = gy() + f.hopY + bob;

    ctx.save();
    ctx.globalAlpha *= deathTransform(f, t);
    f.drawX = x; f.drawY = y;
    drawSprite(MAGE_MAP, MAGE_PAL, x, y, c, d);
    // orb at the wand tip above the shield; grows while casting
    const ox = x + d * 3 * c, oy = y - 16 * c;
    const orbR = (1.1 + wp * 1.1 + (REDUCED ? 0 : Math.sin(t / 260) * 0.15)) * u;
    const oc = f.spec ? COL.ancest.ice : COL.ancest.orb;
    ctx.fillStyle = hexA(oc, 0.14);
    ctx.beginPath(); ctx.arc(ox, oy, orbR * 2.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = hexA(oc, 0.35);
    ctx.beginPath(); ctx.arc(ox, oy, orbR * 1.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = oc;
    ctx.beginPath(); ctx.arc(ox, oy, orbR, 0, 6.2832); ctx.fill();

    if (f.flash > 0.05) {
      ctx.fillStyle = hexA('#ff3b30', f.flash * 0.22);
      ctx.beginPath(); ctx.ellipse(x, y - 8 * u, 3.8 * u, 7 * u, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function drawFreeze(x, y, u, strength) {
    const a = Math.min(0.5, strength * 0.55);
    ctx.fillStyle = hexA(COL.ancest.ice, a * 0.5);
    rr(x - 3 * u, y - 9 * u, 6 * u, 9 * u, u);
    ctx.fillStyle = hexA(COL.ancest.ice, a);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 1.8 * u - 0.5 * u, y);
      ctx.lineTo(x + i * 1.8 * u, y - (1.8 + Math.abs(i)) * u);
      ctx.lineTo(x + i * 1.8 * u + 0.5 * u, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawProjectile(pr, t) {
    const pos = projPos(pr, t);
    if (pos.p <= 0 || pos.p >= 1) return;
    if (pr.kind === 'dragon') {
      const frame = Math.floor(t / 110) % 2 === 0 ? DRAGON_A : DRAGON_B;
      const cell = 3 * SC;
      drawSprite(frame, DRAGON_PAL, pos.x, pos.y + 2.5 * cell, cell, pr.from.dir);
      return;
    }
    if (pr.kind === 'arrow') {
      const prev = projPos(pr, t - 40);
      const a = Math.atan2(pos.y - prev.y, pos.x - prev.x);
      const L = 13 * SC;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(a);
      ctx.strokeStyle = COL.masori.arrow;
      ctx.lineWidth = 1.4 * SC;
      ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
      ctx.fillStyle = COL.masori.trim;
      ctx.beginPath();
      ctx.moveTo(L / 2 + 4 * SC, 0);
      ctx.lineTo(L / 2 - 1.5 * SC, -2.2 * SC);
      ctx.lineTo(L / 2 - 1.5 * SC, 2.2 * SC);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COL.masori.string;
      ctx.lineWidth = SC;
      ctx.beginPath(); ctx.moveTo(-L / 2, -1.8 * SC); ctx.lineTo(-L / 2 + 3.5 * SC, 0); ctx.lineTo(-L / 2, 1.8 * SC); ctx.stroke();
      ctx.restore();
    } else {
      const oc = pr.spec ? COL.ancest.ice : COL.ancest.orb;
      const r = (pr.spec ? 4.4 : 3.2) * SC;
      ctx.fillStyle = hexA(oc, 0.15);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r * 2.4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = hexA(oc, 0.4);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r * 1.5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = oc;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, 6.2832); ctx.fill();
    }
  }

  function drawSplat(s, t) {
    const age = t - s.t0;
    // OSRS splats snap in, hold, then vanish — just a tiny pop for juice
    const pop = 0.72 + 0.28 * Math.min(1, age / 80);
    const alpha = age > 620 ? Math.max(0, 1 - (age - 620) / 180) : 1;
    const cell = 1.7 * SC * pop;
    const w = 15 * cell;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawSplatPixels(ctx, s.x - w / 2, s.y - w / 2, cell, s.miss ? 'miss' : 'hit');
    ctx.font = `${Math.max(12, 16 * SC)}px VT323, "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(String(s.dmg), s.x + 1.2, s.y + 2.2);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(s.dmg), s.x, s.y + 1);
    ctx.restore();
  }

  function drawUI(t) {
    const u = 4 * SC;
    const nameC = dark() ? '#ffe066' : '#7d6407';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const f of fighters) {
      if (f.dead && t - f.deathT > 800) continue;
      // overhead name, OSRS style
      ctx.font = `${Math.max(15, 19 * SC)}px VT323, "IBM Plex Mono", monospace`;
      ctx.fillStyle = nameC;
      ctx.fillText(f.name, f.x, gy() - 22.6 * u);
      // hp bar
      const bw = 10 * u, bh = u, bx = f.x - bw / 2, by = gy() - 21.8 * u;
      ctx.fillStyle = COL.hpRed;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = COL.hpGreen;
      ctx.fillRect(bx, by, bw * (f.hp / f.maxHp), bh);
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }
    ctx.font = `${Math.max(12, 14 * SC)}px VT323, "IBM Plex Mono", monospace`;
    ctx.fillStyle = hexA(PAL.muted, 0.85);
    ctx.fillText('vs', W / 2, gy() - 22 * u);
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    if (!caches || !caches.vig) return;
    // in film mode the film canvas paints the world; this canvas carries only the fight
    const FILM = root.classList.contains('film');

    if (!FILM) {
      // the room: bolted down, never shakes
      ctx.drawImage(caches.vig, 0, 0);
    }
    const sv = surgeVal(t);
    if (sv > 0.01) {
      ctx.globalAlpha = 0.6 * sv;
      ctx.drawImage(caches.core, W * 0.5 - W * 0.55, H * 0.45 - H * 0.5, W * 1.1, H);
      ctx.globalAlpha = 1;
    }
    if (!FILM) {
      drawSkyMarks(t);
      ctx.globalAlpha = THEME.skyA;
      ctx.drawImage(caches.sky, Math.round(-W * 0.5 + cam.x * 4), gy() - caches.skyH);
      ctx.globalAlpha = 1;
      drawMist(t);
      drawMotes(t);
    }

    // the stage: only its contents jolt
    ctx.save();
    if (shake > 0.02) ctx.translate((Math.random() - 0.5) * shake * 7, (Math.random() - 0.5) * shake * 5);
    // scroll dolly: the camera pushes into the fight as the visitor scrolls
    if (camZ > 0.001) {
      const z = 1 + 0.5 * camZ;
      ctx.translate(W / 2, gy());
      ctx.scale(z, z);
      ctx.translate(-W / 2, -gy());
    }

    if (!FILM) {
      const inset = W >= 640 ? 24 : 12;
      ctx.fillStyle = THEME.plinth;
      ctx.fillRect(inset, gy() + 1, W - inset * 2, 1);
    }

    drawReflection(t);
    drawGlows(t);
    drawShadow(ranger);
    drawShadow(mage);
    drawRanger(ranger, t);
    drawMage(mage, t);
    drawRimFor(ranger, caches.rimR);
    drawRimFor(mage, caches.rimM);

    for (const pr of projectiles) drawProjectile(pr, t);

    // ice barrage AoE rings
    const ua = 4 * SC;
    for (const a of aoes) {
      const p = Math.min(1, (t - a.t0) / 700);
      const e = easeOut(p);
      ctx.strokeStyle = hexA(COL.ancest.ice, (1 - p) * 0.8);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(a.x, gy() - 2 * ua, e * 13 * ua, e * 5 * ua, 0, 0, 6.2832);
      ctx.stroke();
      ctx.strokeStyle = hexA('#e8f4ff', (1 - p) * 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(a.x, gy() - 2 * ua, e * 9 * ua, e * 3.4 * ua, 0, 0, 6.2832);
      ctx.stroke();
      ctx.fillStyle = hexA(COL.ancest.ice, (1 - p) * 0.15);
      ctx.beginPath();
      ctx.ellipse(a.x, gy(), e * 11 * ua, e * 2.4 * ua, 0, 0, 6.2832);
      ctx.fill();
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawAdditive(t);
    for (const s of splats) drawSplat(s, t);
    drawUI(t);
    for (const s of xpFloats) {
      const age = t - s.t0;
      ctx.globalAlpha = Math.max(0, 1 - age / 750);
      ctx.fillStyle = GOLD; /* OSRS-GOLD: game artifact */
      ctx.font = `${Math.max(11, 13 * SC)}px VT323, "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(s.txt, s.x, s.y - age * 0.025);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawCallouts(t);
  }

  function loop(t) {
    if (!running) { raf = 0; return; }
    const dt = Math.min(50, last ? t - last : 16);
    last = t;
    // camera: pointer intent + slow idle drift, environment only
    const ix = REDUCED ? 0 : 0.15 * Math.sin(t / 9000 * 6.2832);
    const iy = REDUCED ? 0 : 0.1 * Math.sin(t / 13000 * 6.2832 + 1.3);
    cam.x += ((ptx + ix) - cam.x) * 0.06;
    cam.y += ((pty + iy) - cam.y) * 0.06;
    if (watermark && !REDUCED) {
      watermark.style.transform = 'translate3d(' + (cam.x * 6).toFixed(1) + 'px,' + (cam.y * 3.6).toFixed(1) + 'px,0)';
    }
    try {
      update(t, dt);
      render(t);
    } catch (err) {
      // never let one bad frame kill the duel — log it and carry on
      if (window.console && console.error) console.error('duel frame error:', err);
    }
    raf = requestAnimationFrame(loop);
  }

  // parallax intent: mouse only, never touch
  if (!REDUCED && matchMedia('(hover: hover)').matches) {
    heroEl.addEventListener('pointermove', e => {
      ptx = (e.clientX / Math.max(1, W) - 0.5) * 2;
      pty = (e.clientY / Math.max(1, H) - 0.5) * 2;
    }, { passive: true });
    heroEl.addEventListener('pointerleave', () => { ptx = 0; pty = 0; }, { passive: true });
  }

  canvas.addEventListener('click', e => {
    if (REDUCED) return;
    const now = performance.now();
    if (mode === 'player') { playerAttack(false); return; }
    if (now < specReady) return;
    const rect = canvas.getBoundingClientRect();
    const f = (e.clientX - rect.left) < W / 2 ? ranger : mage;
    if (!startAttack(f, now, true)) return; // mid-windup or dead: no dud fireworks
    specReady = now + 1800;
    surgeT0 = now;
    if (f === ranger) flare.r = now; else flare.m = now;
    clogUnlock(f === ranger ? 'spec-marcus' : 'spec-deacon');
  });

  function playerAttack(spec) {
    if (mode !== 'player' || REDUCED) return false;
    const now = performance.now();
    if (now < (spec ? playerCd.spec : playerCd.atk)) return false;
    if (!startAttack(ranger, now, !!spec)) return false;
    if (spec) {
      playerCd.spec = now + 8000;
      surgeT0 = now;
      flare.r = now;
      clogUnlock('spec-marcus');
    } else {
      playerCd.atk = now + 1200;
    }
    return true;
  }

  // the scroll cinema and the duel HUD drive the fight through this
  window.__duel = {
    setCam(p) { camZ = Math.max(0, Math.min(1, p || 0)); },
    challenge(on) {
      mode = on ? 'player' : 'auto';
      duelResult = null;
      playerCd.atk = 0;
      playerCd.spec = performance.now() + 3000; // the special charges up first
    },
    playerAttack,
    getState() {
      const now = performance.now();
      return {
        mode,
        result: duelResult,
        atk: Math.max(0, Math.min(1, 1 - (playerCd.atk - now) / 1200)),
        spec: Math.max(0, Math.min(1, 1 - (playerCd.spec - now) / 8000)),
        marcusHp: ranger.hp, deaconHp: mage.hp, maxHp: ranger.maxHp,
      };
    },
    onResult: null,
  };

  let rt;
  let lastBuild = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      size();
      lastBuild = performance.now();
      if (REDUCED || !running) render(REDUCED ? 0 : last || 0);
    }, 180);
  });
  repaints.push(() => {
    // theme flips rebuild immediately; the global resize repaint skips the duplicate
    if (performance.now() - lastBuild > 250) buildCaches();
    if (REDUCED || !running) render(REDUCED ? 0 : last || 0);
  });

  function start() {
    size();
    if (REDUCED) {
      if (!W || !H) window.addEventListener('load', () => { size(); render(0); }, { once: true });
      else render(0);
      return;
    }
    const io = new IntersectionObserver(entries => {
      const vis = entries.some(en => en.isIntersecting);
      if (vis) {
        // fonts can resolve before first layout settles — re-measure on any drift
        if (W !== canvas.clientWidth || H !== canvas.clientHeight) size();
        running = true;
        last = 0;
        if (!nextAttack) scheduleNext(performance.now() + 400);
        // cancel-then-request makes restarts idempotent even after a bad frame
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      } else {
        running = false;
      }
    }, { threshold: 0.15 });
    io.observe(canvas);
  }

  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('19px VT323'),
      document.fonts.load('700 100px "IBM Plex Mono"'),
    ]).then(start, start);
  } else {
    start();
  }
})();

/* ---------- stubhub lens: live price sparkline ---------- */

(function initSpark() {
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

  function size() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
})();

/* ---------- vestra: allocation donut ---------- */

(function initDonut() {
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
})();

/* ---------- dial: watch scan & valuation ---------- */

(function initWatch() {
  const canvas = document.getElementById('watch-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const WATCHES = [
    { name: 'diver',  dial: '#12395a', hand: '#e9e7e0', mark: '#7fd4c1', low: 2850, est: 3120, high: 3480 },
    { name: 'chrono', dial: '#17171a', hand: '#e9e7e0', mark: '#d2a13c', low: 4200, est: 4680, high: 5150 },
    { name: 'field',  dial: '#2b2620', hand: '#e9e7e0', mark: '#c8b98a', low: 640,  est: 730,  high: 815 },
    { name: 'dress',  dial: '#e9e4d6', hand: '#2a2723', mark: '#8a7c52', low: 1150, est: 1280, high: 1420 },
  ];
  let W = 0, H = 0, running = false, raf = 0;
  let wi = 0, cur = WATCHES[0], phase = 'idle', phaseT0 = 0;

  function jitter(w) {
    // wobble the "market" a little so every scan reads differently
    const f = 0.98 + Math.random() * 0.04;
    const r10 = v => Math.round(v * f / 10) * 10;
    return { name: w.name, dial: w.dial, hand: w.hand, mark: w.mark, low: r10(w.low), est: r10(w.est), high: r10(w.high) };
  }

  function size() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      clogUnlock('watch-scan');
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
})();

/* ---------- grand exchange: live ledger from the GitHub API ---------- */

(function initTicker() {
  const el = document.getElementById('ge-ticker');
  if (!el || !window.fetch) return;
  const ledger = el.querySelector('.ge-link');
  if (ledger) ledger.addEventListener('click', () => clogUnlock('ge-ledger'));
  const rel = iso => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    const m = s / 60, h = m / 60, d = h / 24;
    if (m < 90) return Math.round(m) + ' min ago';
    if (h < 36) return Math.round(h) + ' hr ago';
    return Math.round(d) + ' days ago';
  };
  fetch('https://api.github.com/repos/Nerhh/deacondevs.com/commits?per_page=1')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(list => {
      const c = list[0];
      if (!c) return;
      let msg = (c.commit.message || '').split('\n')[0];
      if (msg.length > 72) msg = msg.slice(0, 71) + '…';
      document.getElementById('ge-msg').textContent = msg;
      document.getElementById('ge-sha').textContent = c.sha.slice(0, 7);
      document.getElementById('ge-when').textContent = rel(c.commit.author.date);
      el.hidden = false;
      // the offer fills GE-style once it scrolls into view
      const bar = document.getElementById('ge-bar');
      const fill = document.getElementById('ge-fill');
      const state = document.getElementById('ge-state');
      const complete = () => {
        bar.classList.add('done');
        state.textContent = 'offer complete';
      };
      if (REDUCED || !('IntersectionObserver' in window)) {
        fill.style.transition = 'none';
        fill.style.width = '100%';
        complete();
        return;
      }
      state.textContent = 'filling offer…';
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) {
          io.disconnect();
          requestAnimationFrame(() => { fill.style.width = '100%'; });
          fill.addEventListener('transitionend', complete, { once: true });
          setTimeout(complete, 2200); // safety if the transition event is missed
        }
      }, { threshold: 0.4 });
      io.observe(el);
    })
    .catch(() => { /* rate-limited or offline — show nothing rather than fake data */ });
})();

/* ---------- quest log ---------- */

(function initQuests() {
  const section = document.getElementById('quests');
  const qp = document.getElementById('quest-points');
  if (!section || !qp) return;
  let total = 0;
  // points are awarded on completion only, as the copy promises
  section.querySelectorAll('.quest-done').forEach(q => { total += parseInt(q.dataset.qp, 10) || 0; });
  if (REDUCED) { qp.textContent = total; return; }
  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) {
      countUp(qp, total, 900);
      io.disconnect();
    }
  }, { threshold: 0.25 });
  io.observe(section);
})();

/* ---------- OSRS xp drops on click ---------- */

let xpTotal = 0;
try { xpTotal = parseInt(localStorage.getItem('dd-xp'), 10) || 0; } catch (e) { /* ignore */ }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-xp]');
  if (!el) return;
  xpTotal += parseInt(el.dataset.xp, 10) || 0;
  try { localStorage.setItem('dd-xp', String(xpTotal)); } catch (e2) { /* ignore */ }
  if (xpTotal >= 100) clogUnlock('xp-100');
  if (REDUCED) return;
  const d = document.createElement('span');
  d.className = 'xp-drop';
  d.textContent = '+' + el.dataset.xp + ' xp';
  d.style.left = Math.max(8, e.clientX - 16) + 'px';
  d.style.top = Math.max(8, e.clientY - 26) + 'px';
  document.body.appendChild(d);
  d.addEventListener('animationend', () => d.remove());
  setTimeout(() => d.remove(), 1500);
});

/* ---------- npc contact dialogue ---------- */

(function initDialogue() {
  const box = document.getElementById('npc');
  if (!box) return;

  // pixel-art Marcus for the dialogue head — hooded, gold crest, red eyes
  const face = document.getElementById('npc-face');
  if (face) {
    const f = face.getContext('2d');
    const HEAD = [
      '...GGG...',
      '..HGGGH..',
      '.HGGGGGH.',
      '.HBBBBBH.',
      '.HBEBEBH.',
      '.HMMMMMH.',
      '..MMMMM..',
      '..RRRRR..',
      '.RRRRRRR.',
    ];
    const P = { G: '#d9a821', H: '#1d1a19', B: '#26221f', E: '#d93025', M: '#5f7370', R: '#8a2c22' };
    const cell = 8;
    HEAD.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const k = row[rx];
        if (k === '.') continue;
        f.fillStyle = P[k];
        f.fillRect(rx * cell, ry * cell, cell, cell);
      }
    });
  }

  const LINES = [
    'Ah, adventurer. You’ve reached the end of the catalogue — most viewings never make it past the plates.',
    'I’m Marcus. Proprietor. I built everything you just scrolled past — and the occasional LEGO city.',
    'Tickets, watches, wealth or bricks — what shall we discuss?',
  ];
  let idx = 0;
  const line = document.getElementById('npc-line');
  const opts = document.getElementById('npc-options');
  const cont = document.getElementById('npc-continue');

  function show() {
    line.textContent = LINES[idx];
    const last = idx >= LINES.length - 1;
    opts.hidden = !last;
    cont.hidden = last;
  }
  show();
  cont.addEventListener('click', () => {
    idx = Math.min(idx + 1, LINES.length - 1);
    show();
  });

  opts.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => { line.textContent = 'Safe travels, adventurer.'; });
  });
  document.getElementById('npc-email').addEventListener('click', () => {
    const rot13 = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
    const addr = rot13('znephf') + String.fromCharCode(64) + rot13('qrnpbaqrif') + '.' + rot13('pbz');
    line.innerHTML = 'You can write to me at <a href="mailto:' + addr + '">' + addr + '</a>. Tell them the duel sent you.';
    clogUnlock('email-reveal');
  });
})();

/* ---------- examine tooltips ---------- */

(function initExamine() {
  if (!window.matchMedia || !matchMedia('(hover: hover)').matches) return;
  const tip = document.createElement('div');
  tip.className = 'examine';
  document.body.appendChild(tip);
  let showing = false;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-ex]');
    if (!el) {
      if (showing) { tip.classList.remove('on'); showing = false; }
      return;
    }
    tip.textContent = el.dataset.ex;
    tip.classList.add('on');
    showing = true;
  });
  document.addEventListener('mousemove', e => {
    if (!showing) return;
    let x = e.clientX + 14, y = e.clientY + 18;
    const r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 10;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 10;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  document.addEventListener('click', () => { tip.classList.remove('on'); showing = false; });
})();

/* ---------- cursor torch: the visitor carries the gallery light across the plates ---------- */

(function initTorch() {
  if (REDUCED || !window.matchMedia || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
})();

/* ---------- chrome: header state + hero scroll dim ---------- */

(function initChrome() {
  const head = document.querySelector('.site-head');
  const hero = document.querySelector('.hero');
  const cine = !REDUCED && !!(window.gsap && window.ScrollTrigger);
  if (head && !hero) head.classList.add('scrolled');
  let ticking = false;
  const apply = () => {
    ticking = false;
    const y = window.scrollY || 0;
    if (head && hero) head.classList.toggle('scrolled', y > 40);
    if (hero && !cine) {
      // the scroll cinema owns the hero dim when it's running
      const k = Math.max(0, Math.min(1, y / ((hero.offsetHeight || 1) * 0.6)));
      hero.style.setProperty('--k', k.toFixed(3));
    }
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(apply); }
  }, { passive: true });
  apply();
})();

/* ---------- scroll reveal ---------- */

(function initReveal() {
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (REDUCED || !('IntersectionObserver' in window) || (window.gsap && window.ScrollTrigger)) {
    // reduced motion, ancient browsers, or the scroll cinema running the show
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el, i) => {
    el.style.transitionDelay = ((i % 4) * 70) + 'ms';
    io.observe(el);
  });
})();

/* ---------- global repaint on resize ---------- */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => repaints.forEach(fn => fn()), 200);
});

})();
