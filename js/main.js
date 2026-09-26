/* marcus.gg — hand-rolled, zero dependencies */
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
    bg: v('--bg'), bg2: v('--bg2'), bg3: v('--bg3') || v('--bg2'), line2: v('--line2') || v('--line'),
    accent: v('--accent-bright'), green: v('--green'), red: v('--red'),
    chart: [v('--c1'), v('--c2'), v('--c3'), v('--c4')],
  };
}

const THEME_KEY = 'dd-theme';
function applyTheme(t) {
  root.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
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
    const go = () => { applyTheme(next); clogUnlock('theme-flip'); checkMoon(); };
    if (REDUCED || !document.startViewTransition) { go(); return; }
    // the new theme floods out from the button in a circle
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    let vt;
    try { vt = document.startViewTransition(go); } catch (e) { go(); return; }
    vt.ready.then(() => {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => { /* fell back to an instant swap */ });
  });
}

/* ---------- collection log: what has this visitor discovered? ---------- */

// 8x8 pixel icons for the collection log slots
const CLOG_ICONS = {
  'spec-marcus': { p: { y: '#ffb020', o: '#e07000' }, m: ['....yy..', '...yyo..', '..yyo...', '.yyyyyo.', '...yyo..', '..yyo...', '.yo.....', '.y......'] },
  'spec-deacon': { p: { c: '#9cc7ff', C: '#ffffff' }, m: ['...c....', '.c.c.c..', '..ccc...', 'cccCccc.', '..ccc...', '.c.c.c..', '...c....', '........'] },
  'duel-death':  { p: { g: '#6d6d6d', G: '#9a9a9a', d: '#4a4a4a' }, m: ['..gggg..', '.gGGGGg.', '.gGdGGg.', '.gdddGg.', '.gGdGGg.', '.gGdGGg.', '.gGGGGg.', 'gggggggg'] },
  'watch-scan':  { p: { s: '#8a7c52', w: '#c9c9c9', b: '#12395a', h: '#e9e7e0' }, m: ['..ssss..', '..s..s..', '.wwwwww.', 'wwbbbbww', 'wwbhhbww', 'wwbbbbww', '.wwwwww.', '..s..s..'] },
  'umbra-cycle': { p: { t: '#34d1c9', T: '#ffffff' }, m: ['..tttt..', '.t....t.', 't..tt..t', 't.t..t..', 't.t.T...', 't..tt..t', '.t....t.', '..tttt..'] },
  'theme-flip':  { p: { y: '#f5c518', Y: '#fff1a8' }, m: ['...y..y.', '.y.yy.y.', '..yYYy..', 'yyYYYYyy', '..yYYy..', '.y.yy.y.', '...y..y.', '........'] },
  'email-reveal':{ p: { p: '#8a7a58', P: '#e9dcb8' }, m: ['........', 'pppppppp', 'pPPPPPPp', 'pPpPPpPp', 'pPPppPPp', 'pPPPPPPp', 'pppppppp', '........'] },
  'ge-ledger':   { p: { g: '#b8860b', G: '#f5c518' }, m: ['........', '..gggg..', '.gGGGGg.', '.gGGGGg.', '..gggg..', '.gGGGGg.', '.gGGGGg.', '..gggg..'] },
  'xp-100':      { p: { y: '#ffe98a', b: '#8a6d1d', B: '#d9a821' }, m: ['.....y..', '....yy..', '..bbbb..', '.bBBBBbb', 'bBBBBBBb', '.bBBBBb.', '..bbbb..', '...bb...'] },
  'moon':        { p: { m: '#d8d4c8' }, m: ['...mmm..', '..mm....', '.mm.....', '.mm.....', '.mm.....', '..mm....', '...mmmm.', '........'] },
};
function drawIcon(canvas, icon) {
  const g = canvas.getContext('2d');
  icon.m.forEach((row, ry) => {
    for (let rx = 0; rx < 8; rx++) {
      const k = row[rx];
      if (k === '.') continue;
      g.fillStyle = icon.p[k];
      g.fillRect(rx, ry, 1, 1);
    }
  });
}

const CLOG_ENTRIES = [
  { id: 'spec-marcus', name: "Marcus's special attack", hint: 'unleash it in the duel' },
  { id: 'spec-deacon', name: "Deacon's special attack", hint: 'the mage answers too' },
  { id: 'duel-death', name: 'A fighter falls', hint: 'watch a duel to the end' },
  { id: 'watch-scan', name: 'A full dial scan', hint: 'let the watch finish its reading' },
  { id: 'umbra-cycle', name: 'Every shadow accounted for', hint: 'watch umbra open all of its sessions' },
  { id: 'theme-flip', name: 'Flipped the lights', hint: 'try the other theme' },
  { id: 'email-reveal', name: 'The secret email', hint: 'scrapers never find it' },
  { id: 'ge-ledger', name: 'The full ledger', hint: 'inspect the grand exchange' },
  { id: 'xp-100', name: '100 XP earned', hint: 'keep clicking things' },
  { id: 'moon', name: 'The night sky', hint: 'after dark, lights off' },
];
let clogState = {};
try { clogState = JSON.parse(localStorage.getItem('dd-clog') || '{}'); } catch (e) { /* ignore */ }

function clogRender(justId) {
  const grid = document.getElementById('clog-grid');
  const list = document.getElementById('clog-list');
  const count = document.getElementById('clog-count');
  const total = document.getElementById('clog-total');
  const box = document.getElementById('clog-box');
  if (!grid) return;
  grid.innerHTML = '';
  CLOG_ENTRIES.forEach(en => {
    const done = !!clogState[en.id];
    const li = document.createElement('li');
    li.className = 'slot' + (done ? ' done' : '') + (en.id === justId ? ' just' : '');
    li.setAttribute('data-ex', done ? en.name : en.name + ' — ' + en.hint);
    li.setAttribute('data-name', en.name);
    li.setAttribute('title', done ? en.name : en.hint);
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    drawIcon(c, CLOG_ICONS[en.id] || CLOG_ICONS.moon);
    li.appendChild(c);
    grid.appendChild(li);
  });
  if (list) {
    list.innerHTML = CLOG_ENTRIES.map(en => {
      const done = !!clogState[en.id];
      return '<li class="' + (done ? 'done' : '') + '"><b>' + en.name + '</b> — ' + en.hint + '</li>';
    }).join('');
  }
  const n = CLOG_ENTRIES.filter(en => clogState[en.id]).length;
  if (count) count.textContent = String(n);
  if (total) total.textContent = String(CLOG_ENTRIES.length);
  if (box) box.classList.toggle('complete', n === CLOG_ENTRIES.length);
}

function clogComplete() {
  return CLOG_ENTRIES.every(en => clogState[en.id]);
}

function clogUnlock(id) {
  if (clogState[id] || !CLOG_ENTRIES.some(en => en.id === id)) return;
  clogState[id] = Date.now();
  try { localStorage.setItem('dd-clog', JSON.stringify(clogState)); } catch (e) { /* ignore */ }
  clogRender(id);
  const finished = clogComplete() && !root.classList.contains('gilded');
  if (finished) root.classList.add('gilded');
  const entry = CLOG_ENTRIES.find(en => en.id === id);
  gameMessage('New item added to your collection log: ' + entry.name + '.', 'clog');
  if (finished) {
    setTimeout(() => {
      gameMessage('Collection log complete — gilded mode unlocked.', 'clog');
      fireworks(innerWidth / 2, innerHeight * 0.4);
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

/* ---------- hero: Marcus (range, Masori) vs Deacon (mage, Ancestral) ---------- */

(function initDuel() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, SC = 1, raf = 0, running = false, last = 0;
  let tufts = [], stars = [];

  const dark = () => root.getAttribute('data-theme') === 'dark';
  const gy = () => H - Math.max(22, H * 0.09);

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
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    SC = Math.max(0.5, Math.min(1.6, Math.min(H / 210, W / 420)));
    ranger.x = Math.max(W * 0.24, 76);
    mage.x = Math.min(W * 0.76, W - 76);
    tufts = [];
    for (let i = 0; i < Math.floor(W / 60); i++) tufts.push(Math.random() * W);
    stars = [];
    for (let i = 0; i < 26; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H * 0.45, s: Math.random() < 0.3 ? 2 : 1.4, p: Math.random() * 6.28 });
    }
  }

  // the scene follows the visitor's actual time of day — dark theme only,
  // celestial bodies look out of place on the paper theme
  function drawSky(t) {
    if (!dark()) return;
    const now = new Date();
    const tod = now.getHours() + now.getMinutes() / 60;
    const night = tod >= 19 || tod < 5;
    const golden = (tod >= 5 && tod < 7.5) || (tod >= 16.5 && tod < 19);
    if (night) {
      for (const st of stars) {
        const tw = REDUCED ? 0.75 : 0.55 + 0.45 * Math.sin(t / 900 + st.p);
        ctx.globalAlpha = 0.22 * tw;
        ctx.fillStyle = PAL.fg;
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
      ctx.globalAlpha = 1;
      const frac = Math.min(1, ((tod - 19 + 24) % 24) / 10);
      const mx = W * (0.12 + 0.76 * frac);
      const my = 34 + (1 - Math.sin(Math.PI * frac)) * 40;
      const mr = 11 * SC;
      ctx.fillStyle = hexA('#d8d4c8', 0.5);
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.2832); ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.85, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else {
      const frac = Math.max(0, Math.min(1, (tod - 5) / 14));
      const sr = 13 * SC;
      const sx = W * (0.12 + 0.76 * frac);
      // keep the full halo inside the canvas at the top of its arc
      const sy = sr * 2.2 + 8 + (1 - Math.sin(Math.PI * frac)) * 42;
      ctx.fillStyle = hexA('#e8c25a', 0.1);
      ctx.beginPath(); ctx.arc(sx, sy, sr * 2.1, 0, 6.2832); ctx.fill();
      ctx.fillStyle = hexA('#e8c25a', dark() ? 0.55 : 0.75);
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.2832); ctx.fill();
    }
    if (golden) {
      const grad = ctx.createLinearGradient(0, gy() - 70, 0, gy());
      grad.addColorStop(0, hexA('#e8955a', 0));
      grad.addColorStop(1, hexA('#e8955a', 0.08));
      ctx.fillStyle = grad;
      ctx.fillRect(0, gy() - 70, W, 70);
    }
  }

  /* ----- combat direction ----- */

  function scheduleNext(t) { nextAttack = t + 1200 + Math.random() * 900; }

  function startAttack(f, t, spec) {
    if (f.dead || f.phase !== 'idle' || respawnAt) return;
    f.phase = 'windup';
    f.phaseT = t;
    f.spec = spec;
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
      gameMessage(pr.from.name + ' has defeated ' + tgt.name + '.');
      clogUnlock('duel-death');
    }
  }

  /* ----- update ----- */

  function update(t, dt) {
    if (t > nextAttack && !ranger.dead && !mage.dead && !respawnAt) {
      startAttack(turn === 0 ? ranger : mage, t, false);
      turn ^= 1;
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
    ctx.fillStyle = dark() ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.14)';
    ctx.beginPath();
    ctx.ellipse(f.x, gy() + 0.5 * u, 4.2 * u, u, 0, 0, 6.2832);
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
    ctx.globalAlpha = deathTransform(f, t);
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
    ctx.globalAlpha = deathTransform(f, t);
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
    ctx.save();
    if (shake > 0.02) ctx.translate((Math.random() - 0.5) * shake * 7, (Math.random() - 0.5) * shake * 5);

    drawSky(t);

    // ground
    ctx.strokeStyle = PAL.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, gy() + 3 * SC);
    ctx.lineTo(W, gy() + 3 * SC);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const tx of tufts) {
      ctx.beginPath();
      ctx.moveTo(tx, gy() + 3 * SC);
      ctx.lineTo(tx - 1.5, gy() - 3 * SC);
      ctx.moveTo(tx + 2.5, gy() + 3 * SC);
      ctx.lineTo(tx + 3.5, gy() - 2 * SC);
      ctx.stroke();
    }

    drawShadow(ranger);
    drawShadow(mage);
    drawRanger(ranger, t);
    drawMage(mage, t);

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
    for (const s of splats) drawSplat(s, t);
    drawUI(t);
    for (const s of xpFloats) {
      const age = t - s.t0;
      ctx.globalAlpha = Math.max(0, 1 - age / 750);
      ctx.fillStyle = PAL.accent;
      ctx.font = `${Math.max(11, 13 * SC)}px VT323, "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(s.txt, s.x, s.y - age * 0.025);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function loop(t) {
    if (!running) { raf = 0; return; }
    const dt = Math.min(50, last ? t - last : 16);
    last = t;
    try {
      update(t, dt);
      render(t);
    } catch (err) {
      // never let one bad frame kill the duel — log it and carry on
      if (window.console && console.error) console.error('duel frame error:', err);
    }
    raf = requestAnimationFrame(loop);
  }

  canvas.addEventListener('click', e => {
    if (REDUCED) return;
    const now = performance.now();
    if (now < specReady) return;
    const rect = canvas.getBoundingClientRect();
    const f = (e.clientX - rect.left) < W / 2 ? ranger : mage;
    if (f.dead || respawnAt) return;
    specReady = now + 1800;
    startAttack(f, now, true);
    clogUnlock(f === ranger ? 'spec-marcus' : 'spec-deacon');
  });

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { size(); if (REDUCED) render(0); }, 180);
  });
  repaints.push(() => { if (REDUCED) { size(); render(0); } });

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
        if (!W || !H) size(); // fonts can resolve before first layout
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

/* ---------- umbra: every tab is its own browser ---------- */

(function initUmbra() {
  const canvas = document.getElementById('umbra-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // documentation-range IPs only (RFC 5737) — nothing here points at a real machine
  const IDS = [
    { host: 'bank.example', hue: '#34d1c9', ip: '198.51.100.9',  cc: 'GB', tz: 'Europe/London',     dev: 'Chrome 129 · macOS',   jar: 14, seed: 3 },
    { host: 'shop.example',     hue: '#f5c518', ip: '203.0.113.42',  cc: 'US', tz: 'America/New_York',  dev: 'Chrome 128 · Windows', jar: 9,  seed: 7 },
    { host: 'mail.example',     hue: '#a78bfa', ip: '192.0.2.131',   cc: 'DE', tz: 'Europe/Berlin',     dev: 'Chrome 129 · Windows', jar: 21, seed: 11 },
    { host: 'work.example',   hue: '#7dd3fc', ip: '198.51.100.77', cc: 'AU', tz: 'Australia/Sydney',  dev: 'Chrome 127 · macOS',   jar: 6,  seed: 5 },
    { host: 'ads.example',      hue: '#fb7185', ip: '192.0.2.44',    cc: 'CA', tz: 'America/Toronto',   dev: 'Chrome 129 · Linux',   jar: 12, seed: 13 },
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

  function size() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  function rr(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
    else { ctx.beginPath(); ctx.rect(x, y, w, h); }
  }

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
        ctx.fillStyle = r[3] ? col : PAL.fg;
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
        if (step >= IDS.length) { phase = 'seal'; phaseT0 = t; clogUnlock('umbra-cycle'); }
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
  let total = 0, done = 0;
  section.querySelectorAll('.quest').forEach(q => {
    const v = parseInt(q.dataset.qp, 10) || 0;
    total += v;
    if (q.classList.contains('quest-done')) done += v;
  });
  const fill = document.getElementById('qp-fill');
  const pct = total ? Math.round((done / total) * 100) + '%' : '0%';
  if (REDUCED) { qp.textContent = total; if (fill) fill.style.width = pct; return; }
  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) {
      countUp(qp, total, 900);
      if (fill) requestAnimationFrame(() => { fill.style.width = pct; });
      io.disconnect();
    }
  }, { threshold: 0.25 });
  io.observe(section);
})();

/* ---------- OSRS xp drops on click ---------- */

let xpTotal = 0;
try { xpTotal = parseInt(localStorage.getItem('dd-xp'), 10) || 0; } catch (e) { /* ignore */ }

if (xpTotal > 0) updateXpTracker(xpTotal, 0);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-xp]');
  if (!el) return;
  const gained = parseInt(el.dataset.xp, 10) || 0;
  xpTotal += gained;
  try { localStorage.setItem('dd-xp', String(xpTotal)); } catch (e2) { /* ignore */ }
  if (xpTotal >= 100) clogUnlock('xp-100');
  updateXpTracker(xpTotal, gained);
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
    'Hello, adventurer. You’ve reached the bottom of the page — most don’t make it this far.',
    'I’m Marcus. I build the sort of tools you just scrolled past — and the occasional LEGO city.',
    'Want to talk tickets, watches, wealth or bricks?',
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

/* ---------- scroll reveal ---------- */

(function initReveal() {
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (REDUCED || !('IntersectionObserver' in window)) {
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

/* ---------- login screen fires (the classic doom-fire propagation) ---------- */

(function initFires() {
  const cvs = ['fire-l', 'fire-r'].map(id => document.getElementById(id)).filter(Boolean);
  if (!cvs.length) return;
  const CW = 24, CH = 34, TORCH = 8; // fire cells, plus a torch under them
  // 32 heat levels, torch-coloured: nothing → ember red → orange → yellow → near-white
  const STOPS = [[0, 0, 0, 0], [40, 6, 0, 0.6], [110, 18, 0, 0.9], [170, 40, 4, 1], [214, 74, 10, 1], [240, 122, 18, 1], [255, 176, 32, 1], [255, 224, 96, 1], [255, 246, 200, 1]];
  const PALF = [];
  for (let i = 0; i < 32; i++) {
    const f = i / 31 * (STOPS.length - 1), k = Math.min(STOPS.length - 2, Math.floor(f)), p = f - k;
    const a = STOPS[k], b = STOPS[k + 1];
    PALF.push(`rgba(${Math.round(a[0] + (b[0] - a[0]) * p)},${Math.round(a[1] + (b[1] - a[1]) * p)},${Math.round(a[2] + (b[2] - a[2]) * p)},${(a[3] + (b[3] - a[3]) * p).toFixed(2)})`);
  }
  const fires = cvs.map(canvas => {
    canvas.width = CW;
    canvas.height = CH + TORCH;
    const heat = new Uint8Array(CW * CH);
    // the source row: hottest in the middle, tapering to the sides like a torch flame
    for (let x = 0; x < CW; x++) {
      const d = Math.abs(x - (CW - 1) / 2) / (CW / 2);
      heat[(CH - 1) * CW + x] = d < 0.42 ? 31 : d < 0.7 ? 22 : 8;
    }
    return { canvas, ctx: canvas.getContext('2d'), heat, seed: Math.random() * 1000 };
  });

  function step(f) {
    const h = f.heat;
    for (let x = 0; x < CW; x++) {
      for (let y = 1; y < CH; y++) {
        const src = y * CW + x;
        const r = (Math.random() * 3) | 0;
        let dx = x - r + 1;
        if (dx < 0) dx = 0; else if (dx >= CW) dx = CW - 1;
        const dst = (y - 1) * CW + dx;
        const v = h[src] - (r & 1) - (Math.random() < 0.18 ? 1 : 0);
        h[dst] = v < 0 ? 0 : v;
      }
    }
  }

  function draw(f) {
    const g = f.ctx;
    g.clearRect(0, 0, CW, CH + TORCH);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const v = f.heat[y * CW + x];
        if (!v) continue;
        g.fillStyle = PALF[v];
        g.fillRect(x, y, 1, 1);
      }
    }
    // the torch: iron sconce and a dark wooden handle
    const cx = CW / 2;
    g.fillStyle = '#5a5045'; g.fillRect(cx - 4, CH - 1, 8, 2);
    g.fillStyle = '#3b332b'; g.fillRect(cx - 3, CH + 1, 6, 1);
    g.fillStyle = '#4a3220'; g.fillRect(cx - 1, CH + 2, 2, TORCH - 2);
    g.fillStyle = '#2b1c12'; g.fillRect(cx, CH + 2, 1, TORCH - 2);
  }

  if (REDUCED) {
    fires.forEach(f => { for (let i = 0; i < 60; i++) step(f); draw(f); });
    return;
  }
  let running = false, raf = 0, last = 0;
  function loop(t) {
    if (!running) { raf = 0; return; }
    if (t - last > 42) { // ~24fps reads more like the original than 60
      last = t;
      fires.forEach(f => { step(f); draw(f); });
    }
    raf = requestAnimationFrame(loop);
  }
  const io = new IntersectionObserver(entries => {
    const vis = entries.some(e => e.isIntersecting);
    if (vis && !running) { running = true; if (!raf) raf = requestAnimationFrame(loop); }
    else if (!vis) running = false;
  }, { threshold: 0.1 });
  io.observe(cvs[0]);
})();

/* ---------- click cross: yellow to walk, red to interact ---------- */

(function initClickCross() {
  if (REDUCED || !window.matchMedia || !matchMedia('(pointer: fine)').matches) return;
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const interactive = e.target.closest('a, button, canvas, [data-xp], .slot, .quest-btn, input, label');
    const el = document.createElement('span');
    el.className = 'click-x ' + (interactive ? 'red' : 'yellow');
    el.style.left = e.clientX + 'px';
    el.style.top = e.clientY + 'px';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 700);
  }, { passive: true });
})();

/* ---------- fireworks: the level-up burst ---------- */

const fxCanvas = document.getElementById('fx');
const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;
let fxParts = [], fxRaf = 0;
function fxSize() {
  if (!fxCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = innerWidth * dpr;
  fxCanvas.height = innerHeight * dpr;
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function fxLoop() {
  fxCtx.clearRect(0, 0, innerWidth, innerHeight);
  fxParts = fxParts.filter(p => p.life > 0);
  for (const p of fxParts) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.vx *= 0.985; p.life--;
    fxCtx.globalAlpha = Math.min(1, p.life / 18);
    fxCtx.fillStyle = p.c;
    fxCtx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  fxCtx.globalAlpha = 1;
  if (fxParts.length) fxRaf = requestAnimationFrame(fxLoop); else { fxRaf = 0; fxCtx.clearRect(0, 0, innerWidth, innerHeight); }
}
function fireworks(x, y) {
  if (!fxCtx || REDUCED) return;
  if (!fxCanvas.width) fxSize();
  const COLS = ['#ffff00', '#ff3c3c', '#3cff3c', '#5ab4ff', '#ffffff', '#ff9a3c'];
  for (let b = 0; b < 3; b++) {
    const bx = x + (b - 1) * 26, by = y - 10 - b * 14;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 3.2;
      fxParts.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.6, s: Math.random() < 0.3 ? 3 : 2, c: COLS[(Math.random() * COLS.length) | 0], life: 34 + Math.random() * 26 });
    }
  }
  if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
}
if (fxCanvas) { fxSize(); window.addEventListener('resize', fxSize); }

/* ---------- chatbox: game messages ---------- */

let chatReady = false;
const chatQueue = [];
function toast(text, kind) {
  if (REDUCED) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || 'game');
  t.textContent = text;
  document.body.appendChild(t);
  t.addEventListener('animationend', () => t.remove());
  setTimeout(() => t.remove(), 4000);
}
function gameMessage(text, kind) {
  if (!chatReady) { chatQueue.push([text, kind]); return; }
  const log = document.getElementById('chat-log');
  const box = document.getElementById('chat');
  if (!log || !box) { toast(text, kind); return; }
  const line = document.createElement('div');
  line.className = 'chat-line ' + (kind || 'game') + (REDUCED ? '' : ' new');
  line.textContent = text;
  log.appendChild(line);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  // the chatbox is hidden on small screens — fall back to a brief toast there
  if (getComputedStyle(box).display === 'none') toast(text, kind);
}

(function initChat() {
  const box = document.getElementById('chat');
  const toggle = document.getElementById('chat-toggle');
  const hint = document.getElementById('chat-hint');
  chatReady = true;
  if (!box) { chatQueue.splice(0).forEach(([t, k]) => toast(t, k)); return; }
  const open = on => {
    box.classList.toggle('open', on);
    if (toggle) toggle.setAttribute('aria-expanded', String(on));
    if (hint) hint.textContent = on ? 'click to collapse' : 'click to expand';
    const log = document.getElementById('chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  };
  if (toggle) toggle.addEventListener('click', () => open(!box.classList.contains('open')));
  box.addEventListener('click', e => { if (!e.target.closest('button')) open(!box.classList.contains('open')); });
  gameMessage('Welcome to marcus.gg.');
  chatQueue.splice(0).forEach(([t, k]) => gameMessage(t, k));
  setTimeout(() => gameMessage('Marcus is currently building Umbra — a multi-session browser.'), 1400);
  setTimeout(() => gameMessage('Right-click things to examine them.'), 4200);
})();

/* ---------- xp: the real Old School table, a tracker, and level-ups ---------- */

const XP_TABLE = (() => {
  const t = [0, 0];
  let pts = 0;
  for (let l = 1; l < 99; l++) {
    pts += Math.floor(l + 300 * Math.pow(2, l / 7));
    t.push(Math.floor(pts / 4)); // t[L] = xp needed to reach level L
  }
  return t;
})();
function levelFor(xp) { let L = 1; while (L < 99 && xp >= XP_TABLE[L + 1]) L++; return L; }

(function drawLamp() {
  const c = document.getElementById('xp-lamp');
  if (!c) return;
  const g = c.getContext('2d');
  const MAP = ['.....y..', '....yy..', '..bbbb..', '.bBBBBbb', 'bBBBBBBb', '.bBBBBb.', '..bbbb..', '...bb...'];
  const P = { y: '#ffe98a', b: '#8a6d1d', B: '#d9a821' };
  MAP.forEach((row, ry) => { for (let rx = 0; rx < 8; rx++) { if (row[rx] === '.') continue; g.fillStyle = P[row[rx]]; g.fillRect(rx, ry, 1, 1); } });
})();

let xpLevel = null;
function updateXpTracker(total, gained) {
  const box = document.getElementById('xp-track');
  if (!box) return;
  const lvl = levelFor(total);
  const lvlEl = document.getElementById('xp-lvl');
  const totEl = document.getElementById('xp-total');
  if (lvlEl) lvlEl.textContent = String(lvl);
  if (totEl) totEl.textContent = total.toLocaleString('en-GB');
  box.hidden = false;
  if (xpLevel !== null && lvl > xpLevel && gained) {
    const r = box.getBoundingClientRect();
    fireworks(r.left + r.width / 2, r.top + r.height / 2);
    gameMessage("Congratulations, you've just advanced a Clicking level. Your Clicking level is now " + lvl + '.', 'level');
    const dlg = document.getElementById('lvl');
    const txt = document.getElementById('lvl-text');
    if (dlg && txt) {
      txt.textContent = 'Your Clicking level is now ' + lvl + '.';
      dlg.hidden = false;
      clearTimeout(dlg._t);
      dlg._t = setTimeout(() => { dlg.hidden = true; }, 6000);
    }
  }
  xpLevel = lvl;
}
(function initLevelDialog() {
  const close = document.getElementById('lvl-close');
  const dlg = document.getElementById('lvl');
  if (close && dlg) close.addEventListener('click', () => { dlg.hidden = true; });
})();

/* ---------- right-click: choose option ---------- */

(function initContextMenu() {
  if (!window.matchMedia || !matchMedia('(pointer: fine)').matches) return;
  const menu = document.createElement('div');
  menu.className = 'ctx';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);
  const close = () => { menu.hidden = true; };

  document.addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-ex]');
    if (!el || e.target.closest('a, input, textarea, .npc-options')) { close(); return; }
    e.preventDefault();
    const name = el.dataset.name || (el.querySelector('h3') || {}).textContent || 'this';
    const isNpc = /^(Marcus|Deacon|the duel)$/.test(name);
    const items = [];
    if (el.id === 'arena' || el.id === 'hero-canvas') {
      const canvas = document.getElementById('hero-canvas');
      const rect = canvas.getBoundingClientRect();
      const who = (e.clientX - rect.left) < rect.width / 2 ? 'Marcus' : 'Deacon';
      items.push({ act: 'Attack', obj: who, cls: 'obj-npc', run: () => {
        canvas.dispatchEvent(new MouseEvent('click', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
      } });
    }
    if (el.id === 'npc') items.push({ act: 'Talk-to', obj: 'Marcus', cls: 'obj-npc', run: () => {
      const c = document.getElementById('npc-continue');
      if (c && !c.hidden) c.click();
      el.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
    } });
    if (el.tagName === 'A' || el.dataset.href) items.push({ act: 'Open', obj: name, cls: 'obj-object', run: () => {
      const href = el.dataset.href || el.getAttribute('href');
      if (el.target === '_blank') window.open(href, '_blank', 'noopener'); else location.href = href;
    } });
    if (el.id === 'theme-toggle') items.push({ act: 'Toggle', obj: 'the lights', cls: 'obj-object', run: () => el.click() });
    items.push({ act: 'Examine', obj: name, cls: isNpc ? 'obj-npc' : 'obj-object', run: () => gameMessage(el.dataset.ex, 'examine') });
    items.push({ act: 'Cancel', run: close });

    menu.innerHTML = '<div class="ctx-title">Choose Option</div>';
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.innerHTML = it.act + (it.obj ? ' <span class="' + it.cls + '"></span>' : '');
      if (it.obj) b.querySelector('span').textContent = it.obj;
      b.addEventListener('click', ev => { ev.stopPropagation(); close(); it.run(); });
      menu.appendChild(b);
    });
    menu.hidden = false;
    // the game opens the menu with the title under the cursor, kept on-screen
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let x = e.clientX - mw / 2, y = e.clientY - 8;
    x = Math.max(4, Math.min(innerWidth - mw - 4, x));
    y = Math.max(4, Math.min(innerHeight - mh - 4, y));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('scroll', close, { passive: true });
  menu.addEventListener('mouseleave', close);
})();

/* ---------- quest journal: click a quest, the parchment unrolls ---------- */

(function initJournals() {
  document.querySelectorAll('.quest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.quest');
      const open = !li.classList.contains('open');
      document.querySelectorAll('.quest.open').forEach(q => { q.classList.remove('open'); q.querySelector('.quest-btn').setAttribute('aria-expanded', 'false'); });
      li.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) gameMessage('You open the quest journal: ' + btn.querySelector('.qname').textContent + '.');
    });
  });
})();

/* ---------- logout: back to the login screen ---------- */

(function initLogout() {
  const btn = document.getElementById('logout');
  if (!btn) return;
  btn.addEventListener('click', () => {
    gameMessage('You have been logged out. See you soon, adventurer.');
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    document.querySelectorAll('.quest.open').forEach(q => q.classList.remove('open'));
  });
})();

/* ---------- global repaint on resize ---------- */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => repaints.forEach(fn => fn()), 200);
});

})();
