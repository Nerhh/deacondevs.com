/* Dial — one instrument, five screens: capture, identify, details, market, value.
   Every screen is drawn on a single canvas in ink, paper and ordered dither; the step bar
   above it is made of real buttons. Every figure on screen is computed from ARRIVALS
   with the same rules the Dial server uses, so steps 4 and 5 always agree. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;

MD.safe('dial', function dial() {
  const win = document.getElementById('dl-win');
  const canvas = document.getElementById('dl-canvas');
  const stepBar = document.getElementById('dl-steps');
  if (!win || !canvas || !stepBar) return;
  const fig = win.closest('[data-zoom]') || win;
  const buttons = Array.from(stepBar.querySelectorAll('.dl-step'));
  const bars = buttons.map(b => b.querySelector('.bar'));
  const caps = Array.from(document.querySelectorAll('#dl-caps li'));

  const { INK, INK2, INK3, RULE, RULE2, PAPER, B8, REDUCED } = MD;
  const TAU = Math.PI * 2;
  const R = Math.round;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const stepped = (p, n) => Math.floor(clamp01(p) * n) / n;
  const FINAL = 1e9; // "long after every animation": the resting state of a screen

  /* ---------- the demo market: illustrative full-set asking prices, in the order they arrive ---------- */

  const ARRIVALS = [
    3190, 4450, 2750, 640, 3550, 2980, 5250, 3090, 2450, 3750, 1920, 3290, 2850,
    4050, 3390, 2590, 3620, 1150, 3120, 4900, 2890, 3450, 2680, 3950, 3050, 1480,
    4290, 3250, 2940, 3690, 3150, 4650, 2790, 3340, 3850, 3490, 4180,
  ];

  // the server's rules (server/src/pricing/stats.ts): sort, find the median, drop anything under
  // 60% of it, then report the lowest remaining ask and the average of up to 20 lowest remaining
  function askStats(list, floorRatio, lowN) {
    const prices = list.filter(p => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
    if (prices.length < 3) return null;
    const mid = Math.floor(prices.length / 2);
    const med = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
    const kept = prices.filter(p => p >= med * floorRatio);
    const lowest = kept.slice(0, lowN);
    const avg = lowest.reduce((sum, p) => sum + p, 0) / lowest.length;
    return {
      sorted: prices, floor: med * floorRatio,
      sampleSize: prices.length, filteredOut: prices.length - kept.length,
      lowestAsk: R(kept[0]), lowNAverage: R(avg), lowN: lowest.length, median: R(med),
    };
  }
  const S = askStats(ARRIVALS, 0.6, 20);
  if (!S) return;
  const gbp = n => '£' + R(n).toLocaleString('en-GB');
  // arrival index of the i-th cheapest listing
  const ORDER = ARRIVALS.map((p, k) => k).sort((a, b) => ARRIVALS[a] - ARRIVALS[b] || a - b);

  // the prose quotes the same figures
  const FIG = {
    n: String(S.sampleSize), median: gbp(S.median), floor: gbp(S.floor), out: String(S.filteredOut),
    lowest: gbp(S.lowestAsk), avg: gbp(S.lowNAverage), lown: String(S.lowN),
  };
  document.querySelectorAll('[data-dl]').forEach(el => { if (FIG[el.dataset.dl]) el.textContent = FIG[el.dataset.dl]; });

  const CANDS = [
    { title: 'Example diver', sub: '39 mm · Ref. EX-39', conf: 'medium', level: 2, note: 'Check the case-back engraving.' },
    { title: 'Example diver', sub: '41 mm · Ref. EX-41', conf: 'medium', level: 2, note: 'Same dial as the 39 mm; check the case-back.' },
  ];
  const CONDITIONS = ['Unworn', 'Excellent', 'Good', 'Fair'];

  const LABELS = [
    'Viewfinder: an example diver’s watch, its hands at your local time, being photographed.',
    'Two candidates come back: Example diver 39 mm and 41 mm, both medium confidence, each with a note on how to verify it. The 39 mm is confirmed.',
    'Details form: year 2019, full set on, condition Excellent.',
    `${S.sampleSize} illustrative asking prices on a price axis. Median ${FIG.median}. A floor at 60% of the median, ${FIG.floor}, excludes ${S.filteredOut} listings. The lowest remaining ask is ${FIG.lowest}; the ${S.lowN} lowest remaining average ${FIG.avg}.`,
    `Result: lowest comparable ask ${FIG.lowest}; average of ${S.lowN} lowest ${FIG.avg}; median ask ${FIG.median}; ${S.sampleSize} comparable listings; ${S.filteredOut} suspiciously cheap listings excluded.`,
  ];

  /* ---------- canvas, dither patterns and drawing primitives ---------- */

  let W = 0, H = 0, dpr = 1;
  const pats = new Map();
  const st = MD.stage(canvas, s => { W = s.W; H = s.H; dpr = s.dpr; pats.clear(); });
  const g = st.ctx;
  W = st.W; H = st.H; dpr = st.dpr || 1;

  // a one-bit ordered-dither fill: `level` of the pixels (0..1) painted in `color`, on a CSS-pixel grid
  function dith(level, color) {
    const q = Math.max(0, Math.min(64, R(level * 64)));
    const k = Math.max(1, R(dpr));
    const key = q + color + k;
    let p = pats.get(key);
    if (p) return p;
    const c = document.createElement('canvas');
    c.width = c.height = 8 * k;
    const cg = c.getContext('2d');
    cg.fillStyle = color;
    for (let i = 0; i < 64; i++) if (B8[i] < q) cg.fillRect((i & 7) * k, (i >> 3) * k, k, k);
    p = g.createPattern(c, 'repeat');
    if (k !== 1 && p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    pats.set(key, p);
    return p;
  }

  function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); }
  function frame(x, y, w, h, c) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    g.fillStyle = c;
    g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  }
  function dotFrame(x, y, w, h, c) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    g.fillStyle = c;
    for (let i = 0; i < w; i += 2) { g.fillRect(x + i, y, 1, 1); g.fillRect(x + i, y + h - 1, 1, 1); }
    for (let i = 0; i < h; i += 2) { g.fillRect(x, y + i, 1, 1); g.fillRect(x + w - 1, y + i, 1, 1); }
  }
  const hline = (x0, x1, y, c) => rect(x0, y, x1 - x0, 1, c);
  const vline = (x, y0, y1, c) => rect(x, y0, 1, y1 - y0, c);
  function dotV(x, y0, y1, c, gap) {
    g.fillStyle = c;
    for (let y = R(y0); y < y1; y += gap || 2) g.fillRect(R(x), y, 1, 1);
  }
  function dotH(x0, x1, y, c, gap) {
    g.fillStyle = c;
    for (let x = R(x0); x < x1; x += gap || 2) g.fillRect(x, R(y), 1, 1);
  }
  function circle(x, y, r, fill, stroke) {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  // every label goes through MD.fitText, so nothing is ever clipped
  function text(str, x, y, maxW, size, weight, color, align) {
    g.fillStyle = color;
    g.textAlign = align || 'left';
    g.textBaseline = 'alphabetic';
    return MD.fitText(g, str, x, y, Math.max(8, maxW), size, weight);
  }
  function measure(str, size, weight) { g.font = MD.font(size, weight); return g.measureText(str).width; }
  // the size fitText would settle on for the whole string, so typing never changes size mid-word
  function fitSize(str, maxW, size, weight) {
    const floor = Math.max(8, R(size * 0.7));
    let sz = size;
    while (sz > floor && measure(str, sz, weight) > maxW) sz -= 0.5;
    return sz;
  }
  function wrap(str, maxW, size, weight) {
    g.font = MD.font(size, weight);
    const out = [];
    let cur = '';
    str.split(' ').forEach(w => {
      const next = cur ? cur + ' ' + w : w;
      if (!cur || g.measureText(next).width <= maxW) cur = next;
      else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    return out;
  }
  // text typed in behind a block caret; t is ms since typing began
  function typed(str, x, y, maxW, size, weight, color, t, cps) {
    if (t < 0) return;
    const per = cps || 30;
    const sz = fitSize(str, maxW, size, weight);
    const n = Math.min(str.length, Math.floor(t / per));
    if (n > 0) {
      g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      MD.fitText(g, str.slice(0, n), x, y, Math.max(8, maxW), sz, weight, sz);
    }
    const end = str.length * per;
    const caretOn = t < end || (t < end + 480 && Math.floor((t - end) / 160) % 2 === 0);
    if (caretOn) {
      const cx = x + (n ? measure(str.slice(0, n), sz, weight) : 0);
      if (cx + sz * 0.6 <= x + maxW + 2) rect(cx + 1, y - sz * 0.8, sz * 0.6, sz * 0.98, INK);
    }
  }
  // dotted rectangles growing from the centre, the way the site's windows zoom open
  function zoomRects(x, y, w, h, p) {
    const STEPS = 6, k = Math.floor(clamp01(p) * STEPS);
    for (let j = Math.max(0, k - 2); j <= k; j++) {
      const q = MD.easeOut(j / STEPS);
      const zw = Math.max(4, w * (0.1 + 0.9 * q)), zh = Math.max(4, h * (0.1 + 0.9 * q));
      dotFrame(x + (w - zw) / 2, y + (h - zh) / 2, zw, zh, INK);
    }
  }
  function corners(x, y, w, h, len, lw, c) {
    rect(x, y, len, lw, c); rect(x, y, lw, len, c);
    rect(x + w - len, y, len, lw, c); rect(x + w - lw, y, lw, len, c);
    rect(x, y + h - lw, len, lw, c); rect(x, y + h - len, lw, len, c);
    rect(x + w - len, y + h - lw, len, lw, c); rect(x + w - lw, y + h - len, lw, len, c);
  }
  // a push button with a one-pixel drop shadow; pressed, it drops into the shadow and inverts
  function button(label, x, y, w, h, pressed) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    if (pressed) {
      rect(x + 1, y + 1, w, h, INK);
      text(label, x + 1 + w / 2, y + 1 + h / 2 + 4, w - 16, 12, 500, PAPER, 'center');
    } else {
      rect(x + 1, y + 1, w, h, INK);
      rect(x, y, w, h, PAPER);
      frame(x, y, w, h, INK);
      text(label, x + w / 2, y + h / 2 + 4, w - 16, 12, 500, INK, 'center');
    }
  }
  // the classic arrow pointer, one bit: X ink, o paper
  const ARROW = [
    'X', 'XX', 'XoX', 'XooX', 'XoooX', 'XooooX', 'XoooooX', 'XooooooX', 'XoooooooX', 'XooooooooX',
    'XoooooXXXXX', 'XooXooX', 'XoX XooX', 'XX  XooX', 'X    XooX', '     XooX', '      XX',
  ];
  function pointer(x, y) {
    x = R(x); y = R(y);
    ARROW.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === 'X') rect(x + i, y + j, 1, 1, INK);
        else if (row[i] === 'o') rect(x + i, y + j, 1, 1, PAPER);
      }
    });
  }
  const two = n => String(n).padStart(2, '0');
  function clock() { const d = new Date(); return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); }

  const pad = () => (W < 520 ? 16 : 28);

  // screen heading: one line (two on a narrow screen), an optional note on the right, then a rule
  function header(title, right) {
    const P = pad(), room = W - 2 * P, hs = W < 520 ? 13 : 14;
    let lines = wrap(title, room, hs, 500);
    if (lines.length === 2) {
      // balance the two lines so no single word is left hanging
      let lo = room / 2, hi = room;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (wrap(title, m, hs, 500).length <= 2) hi = m; else lo = m; }
      lines = wrap(title, Math.ceil(hi) + 1, hs, 500);
    }
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];
    const rw = right ? measure(right, 11, 400) : 0;
    const showRight = !!right && lines.length === 1 && measure(lines[0], hs, 500) + rw + 28 <= room;
    let y = P + 14;
    lines.forEach((ln, i) => {
      text(ln, P, y, showRight ? room - rw - 28 : room, hs, 500, INK);
      if (i < lines.length - 1) y += hs + 7;
    });
    if (showRight) text(right, W - P, P + 14, rw + 2, 11, 400, INK3, 'right');
    hline(P, W - P, y + 12, RULE);
    return y + 13;
  }

  /* ---------- the watch: retro linework, hands on real local time ---------- */

  const NORM = { fg: INK, bg: PAPER };
  const INV = { fg: PAPER, bg: INK };

  function drawWatch(cx, cy, r, pal, full) {
    const fg = pal.fg, bg = pal.bg;
    // bracelet: three rows of links running out of the frame, the centre row dithered
    const bw = R(r * 0.9), bx = R(cx - bw / 2), linkH = Math.max(5, R(r * 0.16));
    const c0 = R(bx + bw * 0.3), c1 = R(bx + bw * 0.7);
    [-1, 1].forEach(dir => {
      const ya = dir < 0 ? cy - r * 3.2 : cy + r * 0.5, yb = dir < 0 ? cy - r * 0.5 : cy + r * 3.2;
      rect(bx, ya, bw, yb - ya, bg);
      g.fillStyle = dith(0.5, fg); g.fillRect(c0, R(ya), c1 - c0, R(yb - ya));
      [bx, c0, c1, bx + bw - 1].forEach(x => vline(x, ya, yb, fg));
      for (let k = 0; k < 24; k++) {
        const y = cy + dir * (r * 1.1 + k * linkH);
        hline(bx, bx + bw, y, fg);
      }
      // lugs either side of the bracelet
      const lw = Math.max(3, R(r * 0.1)), ly0 = dir < 0 ? cy - r * 1.12 : cy + r * 0.62, ly1 = dir < 0 ? cy - r * 0.62 : cy + r * 1.12;
      [bx - lw, bx + bw].forEach(x => { rect(x, ly0, lw, ly1 - ly0, bg); frame(x, ly0, lw + 1, ly1 - ly0, fg); });
    });
    // crown at three o'clock, knurled
    const cw = Math.max(4, R(r * 0.1)), ch = Math.max(6, R(r * 0.22));
    rect(cx + r - 2, cy - ch / 2, cw + 2, ch, bg);
    frame(cx + r - 2, cy - ch / 2, cw + 2, ch, fg);
    for (let y = R(cy - ch / 2) + 2; y < cy + ch / 2 - 2; y += 2) hline(cx + r + 1, cx + r + cw - 1, y, fg);
    // case
    circle(cx, cy, r, bg, fg);
    // bezel insert, dithered dark, with its minute scale knocked out in paper
    g.beginPath(); g.arc(cx, cy, r * 0.95, 0, TAU); g.arc(cx, cy, r * 0.77, 0, TAU, true);
    g.fillStyle = dith(0.8, fg); g.fill('evenodd');
    circle(cx, cy, r * 0.95, null, fg);
    g.strokeStyle = bg; g.lineCap = 'butt';
    for (let i = 1; i < 60; i++) {
      const five = i % 5 === 0;
      if (!five && i > 15) continue;
      const a = i / 60 * TAU - Math.PI / 2, r0 = r * 0.935, r1 = r * (five ? 0.84 : 0.885);
      g.lineWidth = five ? 1.6 : 1;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    // the pip at twelve
    const pip = r * 0.07;
    g.beginPath(); g.moveTo(cx - pip, cy - r * 0.93); g.lineTo(cx + pip, cy - r * 0.93); g.lineTo(cx, cy - r * 0.93 + pip * 1.6); g.closePath();
    g.fillStyle = bg; g.fill();
    // dial and chapter ring
    circle(cx, cy, r * 0.77, null, fg);
    circle(cx, cy, r * 0.74, bg, fg);
    g.strokeStyle = fg; g.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      if (r < 70 && i % 5) continue;
      const a = i / 60 * TAU - Math.PI / 2, r0 = r * 0.72, r1 = r * (i % 5 ? 0.695 : 0.665);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    // hour markers: a triangle at twelve, batons at three, six and nine, dots between
    g.fillStyle = fg;
    for (let h = 0; h < 12; h++) {
      const a = h / 12 * TAU - Math.PI / 2, mr = r * 0.57;
      g.save(); g.translate(cx + Math.cos(a) * mr, cy + Math.sin(a) * mr); g.rotate(a + Math.PI / 2);
      g.beginPath();
      if (h === 0) { const s = r * 0.075; g.moveTo(-s, -s * 0.9); g.lineTo(s, -s * 0.9); g.lineTo(0, s * 1.1); g.closePath(); }
      else if (h % 3 === 0) { const w = r * 0.05, l = r * 0.075; g.rect(-w / 2, -l, w, l * 2); }
      else g.arc(0, 0, r * 0.042, 0, TAU);
      g.fill();
      g.restore();
    }
    if (full && r >= 90) {
      g.fillStyle = fg; g.textAlign = 'center';
      MD.fitText(g, 'EXAMPLE', cx, cy - r * 0.26, r * 0.6, Math.max(8, R(r * 0.065)), 500, 8);
    }
    // hands: sword hour and minute hands with a lume slot, a lollipop seconds hand that ticks
    const d = new Date();
    const sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
    const hand = (turn, len, w) => {
      g.save(); g.translate(cx, cy); g.rotate(turn * TAU - Math.PI / 2);
      g.beginPath();
      g.moveTo(-len * 0.16, -w * 0.32); g.lineTo(len * 0.78, -w / 2); g.lineTo(len, 0); g.lineTo(len * 0.78, w / 2); g.lineTo(-len * 0.16, w * 0.32);
      g.closePath(); g.fillStyle = fg; g.fill();
      if (r >= 50) {
        g.beginPath(); g.moveTo(len * 0.26, -w * 0.18); g.lineTo(len * 0.74, -w * 0.24); g.lineTo(len * 0.74, w * 0.24); g.lineTo(len * 0.26, w * 0.18);
        g.closePath(); g.fillStyle = bg; g.fill();
      }
      g.restore();
    };
    hand(hr / 12, r * 0.4, Math.max(3, r * 0.085));
    hand(min / 60, r * 0.6, Math.max(2.5, r * 0.065));
    g.save(); g.translate(cx, cy); g.rotate(sec / 60 * TAU - Math.PI / 2);
    g.strokeStyle = fg; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-r * 0.16, 0); g.lineTo(r * 0.66, 0); g.stroke();
    g.beginPath(); g.arc(r * 0.48, 0, Math.max(1.5, r * 0.03), 0, TAU); g.fillStyle = bg; g.fill(); g.stroke();
    g.restore();
    circle(cx, cy, Math.max(1.5, r * 0.035), fg);
  }

  // the photo as a framed thumbnail, reused by Identify and Value
  function photo(x, y, s) {
    x = R(x); y = R(y); s = R(s);
    rect(x + 1, y + 1, s, s, INK);
    rect(x, y, s, s, PAPER);
    g.save(); g.beginPath(); g.rect(x + 1, y + 1, s - 2, s - 2); g.clip();
    drawWatch(x + s / 2, y + s / 2, s * 0.3, NORM, false);
    g.restore();
    frame(x, y, s, s, INK);
  }

  /* ---------- 1  Capture ---------- */

  const T1 = { focus: 320, scan: 420, scanDur: 1600, shut: 2150, shutDur: 90, status: 2450 };

  function drawCapture(t) {
    const P = pad();
    const top = header('What’s on your wrist?', 'Local time ' + clock());
    const foot = 50;
    const y0 = top + 18, y1 = H - P - foot;
    const size = R(Math.max(120, Math.min(W - 2 * P - 16, y1 - y0 - 12, 372)));
    const vx = R((W - size) / 2), vy = R(y0 + 6 + (y1 - y0 - 12 - size) / 2);
    const shut = t >= T1.shut && t < T1.shut + T1.shutDur;
    const pal = shut ? INV : NORM;

    g.save(); g.beginPath(); g.rect(vx, vy, size, size); g.clip();
    rect(vx, vy, size, size, pal.bg);
    drawWatch(vx + size / 2, vy + size / 2, size * 0.3, pal, true);
    // the scan line sweeps down in four-pixel steps, trailing a dithered band
    if (t >= T1.scan && t < T1.scan + T1.scanDur) {
      const y = vy + Math.floor(((t - T1.scan) / T1.scanDur) * size / 4) * 4;
      [0.3, 0.16, 0.07].forEach((lv, b) => { g.fillStyle = dith(lv, INK); g.fillRect(vx, R(y - (b + 1) * 6), size, 6); });
      rect(vx, y, size, 1, INK);
    }
    g.restore();

    // corner brackets step inward to lock focus
    const off = R((1 - stepped(t / T1.focus, 4)) * 16);
    const len = Math.max(12, R(size * 0.09));
    corners(vx - 8 - off, vy - 8 - off, size + 16 + off * 2, size + 16 + off * 2, len, 2, INK);

    // under the viewfinder: the shutter button, then the hand-off to the server
    const by = H - P - 34;
    if (t < T1.status) {
      const bw = Math.min(W - 2 * P, R(measure('Scan a watch', 12, 500) + 44));
      button('Scan a watch', (W - bw) / 2, by, bw, 30, t >= T1.shut && t < T1.shut + 260);
    } else {
      const msg = 'Photo taken. Identifying your watch…';
      const room = W - 2 * P;
      const sz = fitSize(msg, room, 12, 400);
      const mw = Math.min(room, measure(msg, sz, 400));
      typed(msg, R((W - mw) / 2), by + 19, room, 12, 400, INK2, t - T1.status, 24);
    }
  }

  /* ---------- 2  Identify ---------- */

  const T2 = { cards: [160, 360], zoom: 200, meter: 700, curIn: 1450, curDur: 720, click: 2300, dim: 2520, curOut: 3300 };

  function candidateCard(c, x, y, w, h, t0, t, st2) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    if (t < t0) return;
    if (t < t0 + T2.zoom) { zoomRects(x, y, w, h, (t - t0) / T2.zoom); return; }
    const dim = st2.dim, sel = st2.sel;
    const fg = dim ? INK3 : INK, fg2 = dim ? RULE2 : INK2, line = dim ? RULE2 : INK;
    rect(x, y, w, h, PAPER);
    frame(x, y, w, h, line);
    if (sel) frame(x + 1, y + 1, w - 2, h - 2, INK);
    const p = 14;
    // confidence: three squares and the word
    const on = Math.max(0, Math.min(c.level, Math.floor((t - t0 - T2.zoom - 200) / 140) + 1));
    const cwid = measure(c.conf, 11, 400);
    const mx = x + w - p - cwid - 8 - 3 * 8 - 2 * 3;
    for (let i = 0; i < 3; i++) {
      const sx = mx + i * 11, sy = y + p + 4;
      if (i < on) rect(sx, sy, 8, 8, fg); else frame(sx, sy, 8, 8, dim ? RULE2 : INK3);
    }
    text(c.conf, x + w - p, y + p + 12, cwid + 2, 11, 400, dim ? RULE2 : INK3, 'right');
    text(c.title, x + p, y + p + 13, mx - x - p - 10, 13, 500, fg);
    text(c.sub, x + p, y + p + 31, w - 2 * p, 11.5, 400, fg2);
    hline(x + p, x + w - p, y + p + 42, dim ? RULE : RULE);
    text('How to verify', x + p, y + p + 60, w - 2 * p, 10.5, 400, dim ? RULE2 : INK3);
    const lines = wrap(c.note, w - 2 * p, 12, 400);
    lines.forEach((ln, i) => text(ln, x + p, y + p + 78 + i * 17, w - 2 * p, 12, 400, fg2));
    // the checkbox
    const bx = x + p, by = y + h - p - 14;
    if (st2.pressed) rect(bx, by, 14, 14, INK); else { rect(bx, by, 14, 14, PAPER); frame(bx, by, 14, 14, dim ? RULE2 : INK); }
    if (st2.check > 0) {
      g.strokeStyle = INK; g.lineWidth = 2; g.lineCap = 'square'; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(bx + 3, by + 7); g.lineTo(bx + 6, by + 10);
      if (st2.check > 1) g.lineTo(bx + 11, by + 3);
      g.stroke();
    }
    text(sel ? 'Confirmed' : 'This one', bx + 22, by + 11, w - 2 * p - 22, 12, sel ? 500 : 400, sel ? INK : fg2);
  }

  function cardHeight(c, w) { return 14 + 78 + (wrap(c.note, w - 28, 12, 400).length - 1) * 17 + 18 + 14 + 14; }

  function drawIdentify(t) {
    const P = pad();
    const top = header('Is this your watch?', CANDS.length + ' candidates');
    const wide = W >= 640;
    const footLines = wrap('No reference database: you are the final check.', W - 2 * P, 11, 400);
    footLines.forEach((ln, i) => text(ln, P, H - P - (footLines.length - 1 - i) * 16, W - 2 * P, 11, 400, INK3));
    const areaY0 = top + 18, areaY1 = H - P - (footLines.length - 1) * 16 - 11 - 20;

    let x0 = P;
    const gap = wide ? 16 : 12;
    let cardW, ch, ys = [], xs = [];
    if (wide) {
      const th = R(Math.min(156, (W - 2 * P) * 0.2));
      x0 = P + th + 48;
      cardW = (W - P - x0 - gap) / 2;
      ch = Math.max(...CANDS.map(c => cardHeight(c, cardW)));
      const cy = R(areaY0 + (areaY1 - areaY0 - ch) / 2);
      xs = [x0, x0 + cardW + gap]; ys = [cy, cy];
      const ty = R(cy + (ch - th) / 2 - 8);
      photo(P, ty, th);
      text('Your photo', P, ty + th + 20, th, 11, 400, INK3);
      // the photo goes to the server; candidates come back
      const ax0 = P + th + 10, ax1 = x0 - 10, ay = ty + R(th / 2);
      const reach = ax0 + (ax1 - ax0) * stepped(t / 300, 6);
      dotH(ax0, reach, ay, INK3);
      if (t >= 300) { rect(ax1 - 3, ay - 3, 1, 7, INK3); rect(ax1 - 2, ay - 2, 1, 5, INK3); rect(ax1 - 1, ay - 1, 1, 3, INK3); rect(ax1, ay, 1, 1, INK3); }
    } else {
      cardW = W - 2 * P;
      ch = Math.max(...CANDS.map(c => cardHeight(c, cardW)));
      const total = ch * 2 + gap;
      const cy = R(areaY0 + Math.max(0, (areaY1 - areaY0 - total) / 2));
      xs = [P, P]; ys = [cy, cy + ch + gap];
    }

    const clicked = t >= T2.click + 110;
    CANDS.forEach((c, i) => {
      const s = i === 0
        ? { sel: clicked, pressed: t >= T2.click && t < T2.click + 110, check: t >= T2.click + 190 ? 2 : clicked ? 1 : 0, dim: false }
        : { sel: false, pressed: false, check: 0, dim: t >= T2.dim };
      candidateCard(c, xs[i], ys[i], cardW, ch, T2.cards[i], t, s);
    });

    // the pointer walks to the first card's checkbox and clicks it
    if (t >= T2.curIn && t < T2.curOut) {
      const tx = xs[0] + 14 + 7, ty = ys[0] + ch - 14 - 7;
      const sx = Math.min(W - P - 14, xs[0] + cardW * (wide ? 1.6 : 0.8)), sy = areaY1 - 6;
      const q = MD.easeInOut(stepped((t - T2.curIn) / T2.curDur, 9));
      pointer(sx + (tx - sx) * q, sy + (ty - sy) * q);
    }
  }

  /* ---------- 3  Details ---------- */

  const T3 = { type: 450, perChar: 150, toggle: 1500, toggleDur: 200, blink: 2000, blinkDur: 360, press: 3000, pressDur: 170 };

  function field(x, y, w, h, t) {
    rect(x, y, w, h, PAPER);
    frame(x, y, w, h, INK);
    const tx = x + 10, ty = y + h / 2 + 4.5;
    if (t < T3.type) text('e.g. 2021', tx, ty, w - 20, 13, 400, RULE2);
    else typed('2019', tx, ty, w - 20, 13, 400, INK, t - T3.type, T3.perChar);
  }
  function toggle(x, y, t) {
    const w = 46, h = 22, k = 18;
    const p = stepped((t - T3.toggle) / T3.toggleDur, 4);
    const kx = R(x + 2 + (w - k - 4) * p);
    rect(x, y, w, h, PAPER);
    if (p > 0) { g.fillStyle = dith(0.5, INK); g.fillRect(R(x + 1), R(y + 1), kx - R(x) - 1, h - 2); }
    frame(x, y, w, h, INK);
    rect(kx, y + 2, k, h - 4, PAPER); frame(kx, y + 2, k, h - 4, INK);
    vline(kx + k / 2 - 2, y + 7, y + h - 7, INK); vline(kx + k / 2 + 1, y + 7, y + h - 7, INK);
    text(p >= 1 ? 'Yes' : 'No', x + w + 12, y + h / 2 + 4.5, 40, 12, p >= 1 ? 500 : 400, p >= 1 ? INK : INK3);
  }
  function segments(x, y, w, t, cols) {
    const rows = Math.ceil(CONDITIONS.length / cols), ch = 28, gap = cols === 4 ? 0 : 6;
    const cw = (w - gap * (cols - 1)) / cols;
    const blinkOn = t >= T3.blink && (t >= T3.blink + T3.blinkDur || Math.floor((t - T3.blink) / 60) % 2 === 0);
    CONDITIONS.forEach((c, i) => {
      const cx = R(x + (i % cols) * (cw + gap)), cy = R(y + Math.floor(i / cols) * (ch + gap));
      const w2 = R(x + (i % cols + 1) * (cw + gap) - gap) - cx;
      const on = i === 1 && blinkOn;
      rect(cx, cy, w2, ch, on ? INK : PAPER);
      if (cols === 4) { frame(cx, cy, i === 3 ? w2 : w2 + 1, ch, INK); } else frame(cx, cy, w2, ch, INK);
      text(c, cx + w2 / 2, cy + ch / 2 + 4.5, w2 - 12, 12, on ? 500 : 400, on ? PAPER : INK2, 'center');
    });
    return rows * ch + (rows - 1) * gap;
  }

  function drawDetails(t) {
    const P = pad();
    const top = header('A couple of details a photo can’t tell us', 'Example diver 39 mm');
    const room = W - 2 * P;
    const wide = room >= 500;
    const fw = Math.min(room, 600), fx = R((W - fw) / 2);
    const segW4 = CONDITIONS.reduce((m, c) => Math.max(m, measure(c, 12, 400)), 0) + 26;
    const rowsDef = [
      { label: 'Year', hint: 'or leave blank', h: 30 },
      { label: 'Full set', hint: 'Original box and papers', h: 22 },
      { label: 'Condition', hint: '', h: 28 },
    ];
    if (wide) {
      const lw = 220, ctlX = fx + lw, ctlW = fw - lw;
      const cols = segW4 * 4 <= ctlW ? 4 : 2;
      const condH = cols === 4 ? 28 : 62;
      const rh = [66, 66, Math.max(66, condH + 32)];
      const formH = rh[0] + rh[1] + rh[2] + 24 + 32;
      let y = R(top + Math.max(16, (H - P - top - formH) / 2));
      hline(fx, fx + fw, y, RULE);
      rowsDef.forEach((r, i) => {
        const mid = y + rh[i] / 2;
        const lblY = r.hint ? mid - 3 : mid + 4.5;
        text(r.label, fx, lblY, lw - 20, 12.5, 500, INK);
        if (r.hint) text(r.hint, fx, lblY + 17, lw - 20, 11, 400, INK3);
        if (i === 0) field(ctlX, R(mid - 15), 132, 30, t);
        if (i === 1) toggle(ctlX, R(mid - 11), t);
        if (i === 2) segments(ctlX, R(mid - condH / 2), cols === 4 ? segW4 * 4 : ctlW, t, cols);
        y += rh[i];
        hline(fx, fx + fw, y, RULE);
      });
      const bw = R(measure('Get valuation', 12, 500) + 48);
      button('Get valuation', ctlX, y + 24, bw, 32, t >= T3.press && t < T3.press + T3.pressDur);
    } else {
      const cols = segW4 * 4 <= fw ? 4 : 2;
      const condH = cols === 4 ? 28 : 62;
      const rh = [30 + 44, 22 + 44, condH + 44];
      const formH = rh[0] + rh[1] + rh[2] + 18 + 32;
      let y = R(top + Math.max(14, (H - P - top - formH) / 2));
      rowsDef.forEach((r, i) => {
        const lblY = y + 18;
        const lw = measure(r.label, 12.5, 500);
        text(r.label, fx, lblY, fw, 12.5, 500, INK);
        if (r.hint) text(r.hint, fx + fw, lblY, Math.max(8, fw - lw - 16), 11, 400, INK3, 'right');
        const cy = y + 28;
        if (i === 0) field(fx, cy, Math.min(fw, 132), 30, t);
        if (i === 1) toggle(fx, cy, t);
        if (i === 2) segments(fx, cy, fw, t, cols);
        y += rh[i];
        if (i < 2) hline(fx, fx + fw, y - 8, RULE);
      });
      button('Get valuation', fx, y + 4, fw - 1, 32, t >= T3.press && t < T3.press + T3.pressDur);
    }
  }

  /* ---------- 4  Market: the signature ---------- */

  const T4 = {
    axis: 300, drop: 250, dropGap: 38, dropDur: 300, sort: 2150, sortDur: 520, sortGap: 10,
    med: 3200, medDur: 250, floor: 3750, floorDur: 800, low: 4750, lowGap: 40, bracket: 5550, avg: 5850, avgDur: 720,
  };

  // a price tag: a stepped point on the left, a hole, and a body
  function tagShape(x, y, w, h, color) {
    x = R(x); y = R(y);
    const n = Math.min(3, Math.floor(h / 2) - 1);
    g.fillStyle = color;
    for (let c = 0; c < n; c++) g.fillRect(x + c, y + (n - c), 1, h - 2 * (n - c));
    g.fillRect(x + n, y, w - n, h);
  }
  function tag(x, bottom, w, h, state) {
    const x0 = R(x - w / 2), y0 = R(bottom - h);
    if (state === 'out') {
      // faded to a sparse dither: dotted, excluded
      tagShape(x0, y0, w, h, dith(0.5, INK3));
      tagShape(x0 + 1, y0 + 1, w - 2, h - 2, PAPER);
      return;
    }
    tagShape(x0, y0, w, h, INK);
    if (state !== 'low') tagShape(x0 + 1, y0 + 1, w - 2, h - 2, PAPER);
    if (w >= 9) rect(x0 + Math.min(3, Math.floor(h / 2) - 1) + 1, y0 + Math.floor(h / 2), 1, 1, state === 'low' ? PAPER : INK);
  }
  function laneLabel(str, x, y, leftSide, x0, x1, color) {
    const w = measure(str, 11, 400);
    let lx = leftSide ? x - 6 - w : x + 6;
    lx = Math.max(x0, Math.min(x1 - w, lx));
    rect(lx - 2, y - 10, w + 4, 14, PAPER);
    text(str, lx, y, x1 - lx, 11, 400, color || INK);
  }

  function drawMarket(t) {
    const P = pad();
    const loading = t < T4.sort;
    const title = loading ? 'Pulling market data' + '.'.repeat(1 + (Math.floor(t / 280) % 3)) : 'Marketplace asking prices';
    const top = header(title, 'Full set only');
    const wide = W >= 640;
    const rowH = wide ? 23 : 20;
    const N = S.sampleSize;

    // geometry: the chart, and a readout beside it (below it on a narrow screen)
    let roX, roW, chX1;
    const chX0 = P;
    if (wide) { roW = R(Math.min(270, (W - 2 * P) * 0.34)); roX = W - P - roW; chX1 = roX - 40; }
    else { roX = P; roW = W - 2 * P; chX1 = W - P; }
    const chW = chX1 - chX0;
    const tw = Math.max(7, Math.min(18, R(chW / 31)));
    const th = Math.max(6, R(tw * 0.6));
    const MAXP = Math.ceil((S.sorted[N - 1] * 1.08) / 1000) * 1000;
    const X = p => chX0 + tw / 2 + (p / MAXP) * (chW - tw);

    // final resting places: a dot plot of tags, stacked where they would touch
    const fin = [];
    S.sorted.forEach(p => {
      const x = X(p);
      let lvl = 0;
      while (fin.some(f => f.lvl === lvl && Math.abs(f.x - x) < tw + 1)) lvl++;
      fin.push({ x, lvl });
    });
    // arrival row(s): the order the listings come in
    const perRow = Math.min(N, Math.floor(chW / (tw + 2)));
    const qRows = Math.ceil(N / perRow), per = Math.ceil(N / qRows);
    const levels = Math.max(qRows, Math.max(...fin.map(f => f.lvl)) + 1);
    const laneH = 16, under = 50;
    const roH = 6 * rowH;
    // the plot takes the room it is given, so the tags have somewhere to fall from
    const room = wide ? H - P - top - 28 : H - P - roH - 28 - top - 12;
    const stackH = Math.max(levels * (th + 2) + 30, Math.min(room - laneH * 3 - 8 - under, wide ? 170 : 150));
    const blockH = laneH * 3 + 8 + stackH + under;
    let by;
    if (wide) by = R(top + 14 + Math.max(0, (H - P - top - 14 - blockH) / 2));
    else by = R(top + 12 + Math.max(0, (H - P - roH - 24 - top - 12 - blockH) / 2));
    const laneY = [by + 11, by + 11 + laneH, by + 11 + laneH * 2];
    const axisY = by + laneH * 3 + 8 + stackH;
    const lvlBottom = l => axisY - 2 - l * (th + 2);
    const roY = wide ? R(by + (blockH - roH) / 2) : R(H - P - roH);

    // the axis draws itself, then its ticks
    const axP = stepped(t / T4.axis, 8);
    hline(chX0, chX0 + chW * axP, axisY, INK);
    const px1000 = (chW - tw) * 1000 / MAXP;
    const full = px1000 >= measure('£0,000', 10.5, 400) + 14;
    const stepV = full || px1000 >= measure('£0k', 10.5, 400) + 12 ? 1000 : 2000;
    if (axP >= 1) {
      for (let v = 0; v <= MAXP; v += stepV) {
        const x = X(v);
        vline(x, axisY + 1, axisY + 5, INK);
        const lab = v === 0 ? '£0' : full ? gbp(v) : '£' + v / 1000 + 'k';
        const lw = measure(lab, 10.5, 400);
        const lx = Math.max(chX0, Math.min(chX1 - lw, x - lw / 2));
        text(lab, lx, axisY + 18, lw + 2, 10.5, 400, INK3);
      }
    }

    // the floor sweeps in from the left; everything it passes is excluded
    const floorX = X(S.floor);
    const fP = t >= T4.floor ? stepped((t - T4.floor) / T4.floorDur, 16) : -1;
    const fx = fP < 0 ? -1e9 : chX0 + (floorX - chX0) * fP;
    let landed = 0, out = 0;
    for (let i = 0; i < N; i++) {
      const k = ORDER[i];
      const t0 = T4.drop + k * T4.dropGap;
      if (t < t0) continue;
      const row = Math.floor(k / per), j = k % per;
      const qx = chX0 + tw / 2 + (per > 1 ? j * (chW - tw) / (per - 1) : 0);
      const qy = lvlBottom(row);
      let x, y;
      const ts = T4.sort + i * T4.sortGap;
      if (t < ts) {
        // falls from the top of the plot, accelerating, in six steps
        const p = stepped((t - t0) / T4.dropDur, 6);
        const from = axisY - stackH + th + 2;
        x = qx; y = from + (qy - from) * p * p;
        if (p >= 1) landed++;
      } else {
        landed++;
        const q = MD.easeInOut(stepped((t - ts) / T4.sortDur, 6));
        x = qx + (fin[i].x - qx) * q;
        y = qy + (lvlBottom(fin[i].lvl) - qy) * q;
      }
      const j20 = i - S.filteredOut;
      let state = 'new';
      if (i < S.filteredOut && fx >= fin[i].x) { state = 'out'; out++; }
      else if (j20 >= 0 && j20 < S.lowN && t >= T4.low + j20 * T4.lowGap) state = 'low';
      tag(x, y, tw, th, state);
    }

    const mid = (chX0 + chX1) / 2;
    const labels = [];
    // median: a dotted line that grows up from the axis
    if (t >= T4.med) {
      const x = R(X(S.median));
      const p = stepped((t - T4.med) / T4.medDur, 5);
      dotV(x, axisY - (axisY - laneY[0] + 4) * p, axisY, INK);
      if (p >= 1) labels.push(['median', x, laneY[0], x >= mid, INK]);
    }
    // floor line, and the count once it has stopped
    if (fP >= 0) {
      const x = R(fx);
      vline(x, laneY[2] - 4, axisY, INK);
      labels.push(['floor', x, laneY[2], false, INK]);
      if (fP >= 1 && out > 0) labels.push([out + ' excluded', x, laneY[2], true, INK3]);
    }
    // bracket under the axis: the lowest 20 that remain
    const b0 = S.filteredOut, b1 = S.filteredOut + S.lowN - 1;
    const bx0 = R(fin[b0].x - tw / 2), bx1 = R(fin[b1].x + tw / 2), bY = axisY + 32;
    if (t >= T4.bracket) {
      const p = stepped((t - T4.bracket) / 200, 5);
      const cxm = (bx0 + bx1) / 2, half = (bx1 - bx0) / 2 * p;
      hline(cxm - half, cxm + half, bY, INK);
      if (p >= 1) {
        vline(bx0, bY - 5, bY, INK); vline(bx1 - 1, bY - 5, bY, INK);
        const lab = 'lowest ' + S.lowN;
        const lw = measure(lab, 11, 400);
        const lx = Math.max(chX0, Math.min(chX1 - lw, cxm - lw / 2));
        text(lab, lx, bY + 15, lw + 2, 11, 400, INK);
      }
    }
    // their average settles, swinging less each step
    if (t >= T4.avg) {
      const p = clamp01((t - T4.avg) / T4.avgDur), q = stepped(p, 14);
      const target = X(S.lowNAverage);
      const x = R(p >= 1 ? target : target + (bx1 - bx0) / 2 * Math.exp(-4.2 * q) * Math.cos(q * Math.PI * 3.5));
      rect(x, laneY[1] - 4, 1, axisY - laneY[1] + 4, INK);
      g.beginPath(); g.moveTo(x + 0.5, bY - 1); g.lineTo(x + 5.5, bY - 7); g.lineTo(x - 4.5, bY - 7); g.closePath();
      g.fillStyle = INK; g.fill();
      labels.push(['average', x, laneY[1], target >= mid, INK]);
    }
    // labels last, each on its own lane with a paper knock-out, so no line runs through a word
    labels.forEach(l => laneLabel(l[0], l[1], l[2], l[3], chX0, chX1, l[4]));

    // the readout: every figure here is the figure on the Value screen
    const rows = [
      ['Listings', String(Math.min(N, landed)), t >= T4.drop],
      ['Median', FIG.median, t >= T4.med + T4.medDur],
      ['Floor, 60% of median', FIG.floor, t >= T4.floor],
      ['Excluded', String(out), t >= T4.floor],
      ['Lowest ask', FIG.lowest, t >= T4.low],
      ['Average of ' + S.lowN + ' lowest', FIG.avg, t >= T4.avg + T4.avgDur],
    ];
    hline(roX, roX + roW, roY, INK);
    rows.forEach((r, i) => {
      const y = roY + i * rowH;
      const vw = measure(r[1], 12, 500);
      text(r[0], roX, y + rowH - 7, roW - vw - 16, 11.5, 400, r[2] ? INK2 : RULE2);
      text(r[2] ? r[1] : '—', roX + roW, y + rowH - 7, vw + 2, 12, 500, r[2] ? INK : RULE2, 'right');
      hline(roX, roX + roW, y + rowH, i === rows.length - 1 ? INK : RULE);
    });
  }

  /* ---------- 5  Value ---------- */

  const T5 = { card: 0, cardDur: 220, kicker: 260, count: 700, countDur: 720, cap: 1450, rows: [2450, 3150, 3650], note: 4150, btn: 5100 };

  function drawValue(t) {
    const P = pad();
    const top = header('Example diver 39 mm', 'GBP');
    const wide = W >= 700;
    const meta = 'Ref. EX-39 · 2019 · full set · excellent';
    let cx, cw, y0 = top + 18;
    if (wide) {
      const colW = R((W - 2 * P) * 0.36);
      const s = R(Math.min(colW - 24, H - P - top - 110, 220));
      const px = R(P + (colW - s) / 2), py = R(top + (H - P - top - s - 44) / 2);
      photo(px, py, s);
      text('Ref. EX-39 · 2019', px, py + s + 22, s, 11, 400, INK3);
      text('Full set · Excellent', px, py + s + 39, s, 11, 400, INK3);
      cw = Math.min(460, W - P - (P + colW + 24));
      cx = R(P + colW + 24 + (W - P - (P + colW + 24) - cw) / 2);
    } else {
      cw = W - 2 * P; cx = P;
      const ml = wrap(meta, cw, 11, 400);
      ml.forEach((ln, i) => text(ln, P, top + 20 + i * 16, cw, 11, 400, INK3));
      y0 = top + 20 + (ml.length - 1) * 16 + 18;
    }
    const p = wide ? 20 : 14, big = wide ? 46 : 34;
    const noteStr = S.filteredOut + ' suspiciously cheap listings excluded';
    const noteLines = wrap(noteStr, cw - 2 * p, 11.5, 400);
    const rowsH = 3 * 28;
    const ch = p + 12 + 10 + R(big * 0.78) + 24 + 16 + rowsH + 16 + noteLines.length * 17 + 14 + 32 + p;
    const cy = R(y0 + Math.max(0, (H - P - y0 - ch) / 2));
    cw = R(cw);

    if (t < T5.card + T5.cardDur) { zoomRects(cx, cy, cw, ch, (t - T5.card) / T5.cardDur); return; }
    rect(cx + 1, cy + 1, cw, ch, INK);
    rect(cx, cy, cw, ch, PAPER);
    frame(cx, cy, cw, ch, INK);
    const ix = cx + p, iw = cw - 2 * p;
    let y = cy + p + 12;
    typed('Marketplace asking prices', ix, y, iw, 10.5, 400, INK3, t - T5.kicker, 16);
    y += 10 + R(big * 0.78);
    if (t >= T5.count) {
      const q = stepped((t - T5.count) / T5.countDur, 12);
      const v = q >= 1 ? S.lowestAsk : R((S.lowestAsk * MD.easeOut(q)) / 10) * 10;
      text(gbp(v), ix, y, iw, big, 500, INK);
    }
    y += 24;
    typed('Lowest comparable ask', ix, y, iw, 12, 400, INK2, t - T5.cap, 22);
    y += 16;
    hline(ix, ix + iw, y, INK);
    const rows = [
      ['Average of ' + S.lowN + ' lowest', FIG.avg],
      ['Median ask', FIG.median],
      ['Comparable listings', String(S.sampleSize)],
    ];
    rows.forEach((r, i) => {
      const ry = y + i * 28;
      const vw = measure(r[1], 12.5, 500);
      const t0 = T5.rows[i];
      typed(r[0], ix, ry + 19, iw - vw - 16, 12, 400, INK2, t - t0, 22);
      if (t >= t0 + r[0].length * 22) text(r[1], ix + iw, ry + 19, vw + 2, 12.5, 500, INK, 'right');
      if (i < rows.length - 1) hline(ix, ix + iw, ry + 28, RULE);
    });
    y += rowsH;
    hline(ix, ix + iw, y, INK);
    y += 16;
    let tn = t - T5.note;
    noteLines.forEach((ln, i) => {
      typed(ln, ix, y + 12 + i * 17, iw, 11.5, 400, INK3, tn, 18);
      tn -= ln.length * 18 + 1;
    });
    y += noteLines.length * 17 + 14;
    if (t >= T5.btn) button('Scan another watch', ix, y, iw - 1, 32, false);
    else if (t >= T5.btn - 200) zoomRects(ix, y, iw, 32, (t - T5.btn + 200) / 200);
  }

  /* ---------- stepping ---------- */

  const SCREENS = [drawCapture, drawIdentify, drawDetails, drawMarket, drawValue];
  const DUR = [4200, 4400, 4200, 8800, 7000];         // how long each step holds before the next
  const ANIM = [T1.status + 1600, T2.curOut, T3.press + 400, T4.avg + T4.avgDur + 100, T5.btn + 100];
  let step = 0, tStep = 0, lastQ = -1, lastDraw = -1e9;
  let opened = REDUCED || !('IntersectionObserver' in window);
  let hovering = false, kbFocus = false;
  const tNow = () => (REDUCED ? FINAL : tStep);

  function draw() {
    if (!W || !H) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    rect(0, 0, W, H, PAPER);
    const t = tNow();
    SCREENS[step](t);
    // a new screen arrives through a dithered dissolve, six steps from paper
    if (!REDUCED && t < 200) { g.fillStyle = dith(1 - Math.ceil((t / 200) * 6) / 6, PAPER); g.fillRect(0, 0, W, H); }
  }

  function progress() {
    const q = REDUCED ? 0 : Math.min(1, Math.floor((tStep / DUR[step]) * 30) / 30);
    if (q !== lastQ) { lastQ = q; bars[step].style.transform = 'scaleX(' + q + ')'; }
  }

  function go(i, focus) {
    const prev = step;
    step = (i + SCREENS.length) % SCREENS.length;
    tStep = 0; lastQ = -1;
    buttons.forEach((b, k) => {
      const on = k === step;
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.tabIndex = on ? 0 : -1;
      bars[k].style.transform = 'scaleX(0)';
    });
    caps.forEach((li, k) => li.classList.toggle('on', k === step));
    if (prev !== step && caps[step]) { MD.hide(caps[step]); MD.dissolve(caps[step], 0, 260); }
    canvas.setAttribute('aria-label', LABELS[step]);
    if (focus) buttons[step].focus();
    draw();
  }

  buttons.forEach((b, k) => {
    b.tabIndex = k === 0 ? 0 : -1;
    b.addEventListener('click', () => go(k));
  });
  stepBar.addEventListener('keydown', e => {
    let to = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = step + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = step - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = SCREENS.length - 1;
    if (to === null) return;
    e.preventDefault();
    go(to, true);
  });

  // auto-advance pauses while a mouse is over the instrument or the keyboard is in it
  const focusVisible = el => { try { return el.matches(':focus-visible'); } catch (err) { return true; } };
  win.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering = true; });
  win.addEventListener('pointerleave', () => { hovering = false; });
  win.addEventListener('focusin', e => { kbFocus = focusVisible(e.target); });
  win.addEventListener('focusout', e => { if (!e.relatedTarget || !win.contains(e.relatedTarget)) kbFocus = false; });

  // the clock starts once the window has zoomed open
  fig.addEventListener('opened', () => { opened = true; tStep = 0; st.size(); draw(); });

  MD.loop(win, (now, dt) => {
    if (REDUCED) { draw(); return; }
    const paused = hovering || kbFocus;
    if (opened && !paused) {
      tStep += dt;
      if (tStep >= DUR[step]) go(step + 1);
    }
    progress();
    // motion is stepped, so 30 frames a second is plenty; a settled screen only needs its clock
    const settled = paused || tStep > ANIM[step];
    if (now - lastDraw >= (settled ? 250 : 30) || tStep < 220) { lastDraw = now; draw(); }
  });

  MD.repaints.push(() => { st.size(); draw(); });
  canvas.setAttribute('aria-label', LABELS[0]);
  draw();
});
})();
