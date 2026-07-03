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
  });
}

/* ---------- hero: name rendered as LEGO-stud particles ---------- */

(function initHero() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, parts = [], rect = null, raf = 0;
  const mouse = { x: -9999, y: -9999 };

  const cacheRect = () => { rect = canvas.getBoundingClientRect(); };
  window.addEventListener('scroll', cacheRect, { passive: true });

  function sampleTargets() {
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const c = off.getContext('2d', { willReadFrequently: true });
    let fs = Math.min(H * 0.42, 168);
    c.font = `700 ${fs}px "IBM Plex Mono", monospace`;
    const maxW = W * 0.92;
    const tw = c.measureText('DEACON').width;
    if (tw > maxW) {
      fs = fs * maxW / tw;
      c.font = `700 ${fs}px "IBM Plex Mono", monospace`;
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.fillText('MARCUS', W / 2, H / 2 - fs * 0.56);
    c.fillText('DEACON', W / 2, H / 2 + fs * 0.56);
    const gap = Math.max(4, Math.round(fs / 20));
    const img = c.getImageData(0, 0, W, H).data;
    const pts = [];
    for (let y = 0; y < H; y += gap)
      for (let x = 0; x < W; x += gap)
        if (img[(y * W + x) * 4 + 3] > 128) pts.push({ x, y });
    return { pts, size: Math.max(2.5, gap - 1.5) };
  }

  function build() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cacheRect();
    const { pts, size } = sampleTargets();
    parts = pts.map(p => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.max(W, H) * (0.55 + Math.random() * 0.6);
      return {
        tx: p.x, ty: p.y,
        x: W / 2 + Math.cos(a) * r,
        y: H / 2 + Math.sin(a) * r,
        vx: 0, vy: 0, s: size,
        accent: Math.random() < 0.07,
        j: Math.random() * Math.PI * 2,
      };
    });
    if (REDUCED) {
      for (const p of parts) { p.x = p.tx; p.y = p.ty; }
      render();
    } else if (!raf) {
      raf = requestAnimationFrame(loop);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    const dark = root.getAttribute('data-theme') === 'dark';
    const stud = dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.14)';
    const round = typeof ctx.roundRect === 'function';
    for (const p of parts) {
      const s = p.s;
      ctx.fillStyle = p.accent ? PAL.accent : PAL.fg;
      if (round) {
        ctx.beginPath();
        ctx.roundRect(p.x - s / 2, p.y - s / 2, s, s, s * 0.28);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.fillStyle = stud;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.26, 0, 6.2832);
      ctx.fill();
    }
  }

  function step(t) {
    const mr = 90;
    for (const p of parts) {
      let ax = (p.tx - p.x) * 0.03;
      let ay = (p.ty - p.y) * 0.03;
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < mr * mr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const f = (1 - d / mr) * 1.9;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
      p.vx = (p.vx + ax) * 0.86;
      p.vy = (p.vy + ay) * 0.86;
      p.x += p.vx + Math.sin(t / 950 + p.j) * 0.07;
      p.y += p.vy + Math.cos(t / 1150 + p.j) * 0.07;
    }
  }

  function loop(t) {
    step(t);
    render();
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('mousemove', e => {
    if (!rect) cacheRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!rect) cacheRect();
    const t0 = e.touches[0];
    mouse.x = t0.clientX - rect.left;
    mouse.y = t0.clientY - rect.top;
  }, { passive: true });

  canvas.addEventListener('click', e => {
    if (REDUCED || !rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    for (const p of parts) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const f = Math.max(0, 1 - d / 340) * (12 + Math.random() * 12);
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }
  });

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(build, 180);
  });
  repaints.push(() => { if (parts.length && REDUCED) render(); });

  // sample the glyphs only once the display font is actually loaded
  const start = () => build();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 100px "IBM Plex Mono"').then(start, start);
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
    ctx.fillText('avg £' + avg.toFixed(0), pad + 2, Y(avg) - 8);

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

/* ---------- skills: levels on the genuine OSRS xp curve ---------- */

(function initSkills() {
  const section = document.getElementById('skills');
  const els = Array.from(document.querySelectorAll('.skill'));
  if (!section || !els.length) return;
  const totalEl = document.getElementById('total-level');

  function xpForLevel(L) {
    let pts = 0;
    for (let l = 1; l < L; l++) pts += Math.floor(l + 300 * Math.pow(2, l / 7));
    return Math.floor(pts / 4);
  }

  let totalLvl = 0;
  els.forEach(el => {
    const lvl = parseInt(el.dataset.level, 10) || 1;
    totalLvl += lvl;
    el.setAttribute('data-xp-label', xpForLevel(lvl).toLocaleString('en-GB') + ' xp');
  });

  function countUp(el, to, dur) {
    if (!el) return;
    if (REDUCED) { el.textContent = to; return; }
    const start = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.max(1, Math.round(to * easeOut(p)));
      if (p < 1) requestAnimationFrame(tick);
    };
    tick(start);
  }

  function play() {
    els.forEach((el, i) => {
      const lvl = parseInt(el.dataset.level, 10) || 1;
      const num = el.querySelector('.lvl');
      const bar = el.querySelector('.xp-bar i');
      window.setTimeout(() => {
        if (bar) bar.style.width = (lvl / 99 * 100) + '%';
        countUp(num, lvl, 900);
      }, REDUCED ? 0 : i * 70);
    });
    countUp(totalEl, totalLvl, 1500);
  }

  if (REDUCED) { play(); return; }
  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) {
      play();
      io.disconnect();
    }
  }, { threshold: 0.2 });
  io.observe(section);
})();

/* ---------- OSRS xp drops on click ---------- */

document.addEventListener('click', e => {
  if (REDUCED) return;
  const el = e.target.closest('[data-xp]');
  if (!el) return;
  const d = document.createElement('span');
  d.className = 'xp-drop';
  d.textContent = '+' + el.dataset.xp + ' xp';
  d.style.left = Math.max(8, e.clientX - 16) + 'px';
  d.style.top = Math.max(8, e.clientY - 26) + 'px';
  document.body.appendChild(d);
  d.addEventListener('animationend', () => d.remove());
  setTimeout(() => d.remove(), 1500);
});

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

/* ---------- global repaint on resize ---------- */

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => repaints.forEach(fn => fn()), 200);
});

})();
