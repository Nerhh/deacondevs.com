/* Umbra — the project page: one pinned stage, five chapters.
   The stage is a single canvas. A browser window splits into sealed sessions,
   sends each one out to its own place, lines one profile's readings up, and
   ends on the scorecard. Scroll moves the story on; time keeps it alive. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;

MD.safe('umbra', function umbra() {
  const { INK, INK2, INK3, RULE2, PAPER, REDUCED, clamp, lerp } = MD;
  const section = document.getElementById('um-story');
  if (!section) return;
  const chapters = Array.from(section.querySelectorAll('.um-ch'));

  const TAU = Math.PI * 2, round = Math.round;
  const seg = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const steps = (v, n) => Math.floor(clamp(v, 0, 1) * n + 1e-6) / n;

  /* ---------- the story's data ---------- */

  // documentation-range addresses only (RFC 5737): nothing here points at a real machine
  const PROFILES = [
    { cc: 'GB', ip: '198.51.100.14' },
    { cc: 'US', ip: '203.0.113.7' },
    { cc: 'DE', ip: '192.0.2.44' },
    { cc: 'AU', ip: '198.51.100.77' },
    { cc: 'CA', ip: '203.0.113.42' },
  ];
  PROFILES.forEach((p, i) => {
    p.id = 'p' + (i + 1);
    p.names = ['profile ' + (i + 1), p.id];
    p.namesAt = ['profile ' + (i + 1) + ' · ' + p.cc, p.id + ' · ' + p.cc, p.id];
  });
  const TAG = PROFILES[0].cc + ' · ' + PROFILES[0].ip;

  // the focused profile's readings, outermost ring first; off is where each tick starts, in radians away from true
  const READINGS = [
    { k: 'time zone', v: 'Europe/London', r: 14.2, off: 2.5 },
    { k: 'locale', v: 'en-GB', r: 11.8, off: -1.15 },
    { k: 'screen', v: '1440 × 900', r: 9.4, off: 1.2 },
    { k: 'graphics', v: 'Apple M2', r: 7.0, off: -1.05 },
    { k: 'TLS', v: 'Chrome 129', r: 4.6, off: 2.0 },
  ];

  /* ---------- the Umbra mark, on its 24-unit grid ----------
     three ridges and two outer rings, all cut short by one shadow disc at the upper right, around a core dot */
  const SHADOW_D = Math.hypot(7.237, 7.237), SHADOW_R = 7.40;
  const span = r => {
    const h = Math.acos(clamp((r * r + SHADOW_D * SHADOW_D - SHADOW_R * SHADOW_R) / (2 * r * SHADOW_D), -1, 1));
    return [-Math.PI / 4 + h, Math.PI * 7 / 4 - h];
  };
  const SPANS = {};
  [14.2, 11.8, 9.4, 7.0, 4.6].forEach(r => { SPANS[r] = span(r); });

  /* ---------- one-bit tones: 2px ordered-dither cells, crisp at any pixel ratio ---------- */

  const tiles = new Map(), pats = new WeakMap();
  function tone(g, level, dpr, color) {
    const k = clamp(round(level * 16), 0, 16), c = Math.max(1, round(2 * dpr)), key = k + '@' + dpr + (color || '');
    let m = pats.get(g);
    if (!m) { m = new Map(); pats.set(g, m); }
    let p = m.get(key);
    if (!p) {
      let tile = tiles.get(key);
      if (!tile) {
        tile = document.createElement('canvas');
        tile.width = tile.height = 4 * c;
        const tg = tile.getContext('2d');
        tg.fillStyle = color || INK;
        for (let i = 0; i < 16; i++) if (MD.B4[i] < k) tg.fillRect((i & 3) * c, (i >> 2) * c, c, c);
        tiles.set(key, tile);
      }
      p = g.createPattern(tile, 'repeat');
      if (p.setTransform) p.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
      m.set(key, p);
    }
    return p;
  }

  /* ---------- drawing primitives: whole pixels, square corners ---------- */

  const hl = (g, x, y, w) => g.fillRect(x, y, w, 1);
  const vl = (g, x, y, h) => g.fillRect(x, y, 1, h);
  function frame(g, x, y, w, h) { hl(g, x, y, w); hl(g, x, y + h - 1, w); vl(g, x, y, h); vl(g, x + w - 1, y, h); }
  function textW(g, s, size, weight) { g.font = MD.font(size, weight); return g.measureText(s).width; }
  function label(g, s, x, y, maxW, size, weight, color, align) {
    g.fillStyle = color;
    g.textAlign = align || 'left';
    g.textBaseline = 'middle';
    return MD.fitText(g, s, x, y, maxW, size, weight, 8);
  }
  // a dotted line of single pixels, drawn up to a fraction of its length
  function dots(g, x0, y0, x1, y1, gap, upto) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (!L) return;
    const n = Math.floor((L * upto) / gap);
    for (let i = 0; i <= n; i++) {
      const t = (i * gap) / L;
      g.fillRect(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), 1, 1);
    }
  }
  function dotArc(g, cx, cy, r, a0, a1, gap, phase) {
    const n = Math.floor(((a1 - a0) * r) / gap);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + phase) * gap) / r;
      g.fillRect(round(cx + Math.cos(a) * r), round(cy + Math.sin(a) * r), 1, 1);
    }
  }
  // the check mark, as a seven-by-six pixel glyph (the typeface has none)
  const TICK = ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'];
  function tick(g, x, y, color) {
    g.fillStyle = color;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) if (TICK[r][c] === '#') g.fillRect(x + c, y + r, 1, 1);
  }
  function checkbox(g, x, y, state, dpr) {
    g.fillStyle = PAPER; g.fillRect(x, y, 11, 11);
    g.fillStyle = INK; frame(g, x, y, 11, 11);
    if (state >= 1) tick(g, x + 2, y + 3, INK);
    else if (state > 0) { g.fillStyle = tone(g, 0.5, dpr); g.fillRect(x + 2, y + 2, 7, 7); }
  }
  // a window from an older machine: pinstriped title bar, close box, 1px shadow
  function win(g, x, y, w, h, title, fs) {
    g.fillStyle = PAPER; g.fillRect(x, y, w, h);
    g.fillStyle = INK;
    frame(g, x, y, w, h);
    hl(g, x + 1, y + h, w); vl(g, x + w, y + 1, h);
    hl(g, x, y + 20, w);
    for (let yy = y + 4; yy < y + 17; yy += 2) hl(g, x + 3, yy, w - 6);
    g.fillStyle = PAPER; g.fillRect(x + 8, y + 3, 15, 15);
    g.fillStyle = INK; frame(g, x + 10, y + 5, 11, 11);
    const tw = Math.min(textW(g, title, fs, 500), w - 90);
    g.fillStyle = PAPER; g.fillRect(round(x + w / 2 - tw / 2 - 9), y + 2, round(tw + 18), 17);
    label(g, title, round(x + w / 2), y + 11, w - 90, fs, 500, INK, 'center');
  }
  // the desktop behind everything: the faintest ordered-dither tone, as an old machine's pattern
  function desk(g, W, H, dpr) {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    g.fillStyle = tone(g, 1 / 16, dpr, MD.RULE);
    g.fillRect(0, 0, W, H);
  }
  function sizes(W, H) {
    return { m: round(clamp(Math.min(W, H) * 0.06, 12, 36)), fs: W < 400 ? 9.5 : W < 520 ? 10 : 11 };
  }

  /* ---------- chapters 1–3: the browser, its partitions, their exits ---------- */

  const labelCache = new Map();
  function exitLabels(g, W, m, fs) {
    const key = W * 100 + fs;
    let L = labelCache.get(key);
    if (!L) {
      let ipW = 0;
      for (const p of PROFILES) ipW = Math.max(ipW, textW(g, p.ip, fs, 400));
      const slot = (W - 2 * m) / 5, stagger = ipW + 10 > slot, row = round(fs * 2.9);
      L = { ipW, slot, stagger, row, h: (stagger ? 2 : 1) * row + 8 };
      labelCache.set(key, L);
    }
    return L;
  }

  const WALLS = [0, 0, 0, 0];
  function browserGeo(g, W, H, xs) {
    const { m, fs } = sizes(W, H);
    const lab = exitLabels(g, W, m, fs);
    const TB = 20, TS = round(fs + 12);
    // chapter 3 lifts the window and narrows it, in six steps, to make room for the horizon
    const k = steps(seg(xs, 1.2, 1.56), 6);
    const hy = H - m - lab.h;
    const ww0 = Math.min(W - 2 * m, 620), wh0 = Math.min(H - 2 * m, round(ww0 * 0.9));
    const ww3 = Math.min(ww0, round((W - 2 * m) * 0.8));
    const wh3 = clamp(round((hy - m) * 0.52), TB + TS + 40, wh0);
    const w = round(lerp(ww0, ww3, k)), h = round(lerp(wh0, wh3, k));
    const x = round((W - w) / 2), y = round(lerp((H - wh0) / 2, m, k));
    const cx = x + 1, cy = y + TB + TS + 1, cw = w - 2, ch = h - TB - TS - 2;
    // chapter 2 draws the four walls in, one after another, eight steps each
    for (let j = 0; j < 4; j++) WALLS[j] = round(steps(seg(xs, 0.22 + j * 0.1, 0.52 + j * 0.1), 8) * ch);
    return { m, fs, lab, TB, TS, k, hy, x, y, w, h, cx, cy, cw, ch, walls: WALLS, s: W < 420 ? 5 : 7 };
  }

  // where the cookies rest in a still: [x within its partition, height (1 = the floor)]
  const STILL_ONE = [[0.16, 1], [0.47, 0.32], [0.8, 0.7]];
  const STILL_MANY = [[0.22, 1], [0.66, 0.46], [0.4, 0.14], [0.7, 1], [0.3, 0.62]];

  function browserScene(g, W, H, S, G, dpr) {
    const xs = Math.min(S.xs, 2.5);
    const { m, fs, lab, TB, TS, hy, x, y, w, h, cx, cy, cw, ch, walls, s } = G;
    const colW = cw / 5, focus = xs > 2.14;
    desk(g, W, H, dpr);

    // chapter 3: the horizon, and one dotted exit per partition
    const hp = steps(seg(xs, 1.34, 1.56), 8);
    if (hp > 0) {
      const half = hp * (W / 2 - m);
      g.fillStyle = INK;
      hl(g, round(W / 2 - half), hy, round(half * 2));
      g.fillStyle = tone(g, 0.25, dpr);
      g.fillRect(round(W / 2 - half), hy + 2, round(half * 2), 2);
    }
    for (let i = 0; i < 5; i++) {
      const lp = steps(seg(xs, 1.46 + i * 0.06, 1.7 + i * 0.06), 8);
      if (!lp) continue;
      const P = PROFILES[i];
      const sx = round(cx + (i + 0.5) * colW), sy = y + h + 3;
      const hx = round(m + ((i + 0.5) * (W - 2 * m)) / 5), ey = hy - 4;
      g.fillStyle = INK;
      dots(g, sx, sy, hx, ey, focus && i === 0 ? 1 : 3, lp);
      if (lp < 1) continue;
      g.fillRect(hx - 2, hy - 2, 5, 5);
      // a packet on its way out, one dot at a time
      if (S.live) {
        const per = 1500 + i * 170, L = Math.hypot(hx - sx, ey - sy), n = Math.max(1, Math.floor(L / 3));
        const t = Math.floor((((S.now + i * 397) % per) / per) * n) / n;
        g.fillRect(round(sx + (hx - sx) * t) - 1, round(sy + (ey - sy) * t) - 1, 3, 3);
      }
      const r = lab.stagger && (i & 1) ? 1 : 0;
      const top = hy + 9 + r * lab.row;
      const lw = Math.min(lab.stagger ? 2 * lab.slot - 10 : lab.slot - 6, W - 6);
      const half = Math.min(lw, lab.ipW) / 2;
      const lx = round(clamp(hx, 3 + half, W - 3 - half));
      if (r) { g.fillStyle = INK3; dots(g, hx, hy + 6, hx, top - 1, 2, 1); }
      const cyc = top + round(fs * 0.62);
      g.fillStyle = PAPER;
      g.fillRect(round(lx - half - 4), top - 2, round(half * 2 + 8), round(fs * 2.6) + 3);
      if (focus && i === 0) {
        const bw = round(textW(g, P.cc, fs + 1, 600) + 10);
        g.fillStyle = INK; g.fillRect(round(lx - bw / 2), cyc - round(fs * 0.75), bw, round(fs * 1.5));
        label(g, P.cc, lx, cyc, lw, fs + 1, 600, PAPER, 'center');
      } else label(g, P.cc, lx, cyc, lw, fs + 1, 600, INK, 'center');
      label(g, P.ip, lx, top + round(fs * 1.95), lw, fs, 400, INK2, 'center');
    }

    // the window
    win(g, x, y, w, h, 'Umbra', fs);

    // tabs: one to begin with, then one above each partition as its wall comes down
    const ty = y + TB + 1;
    let open = 0;
    for (let i = 0; i < 5; i++) {
      if (i > 0 && !walls[i - 1]) break;
      open = i + 1;
      const x0 = round(cx + i * colW), x1 = round(cx + (i + 1) * colW);
      const on = focus && i === 0;
      if (on) { g.fillStyle = INK; g.fillRect(x0, ty, x1 - x0, TS - 1); }
      if (i < 4) { g.fillStyle = INK; vl(g, x1, ty, TS - 1); }
      const lp = steps(seg(xs, 1.46 + i * 0.06, 1.7 + i * 0.06), 8);
      const names = lp >= 1 ? PROFILES[i].namesAt : PROFILES[i].names;
      let name = names[names.length - 1];
      for (const n of names) if (textW(g, n, fs, 400) <= x1 - x0 - 12) { name = n; break; }
      label(g, name, round((x0 + x1) / 2), ty + round((TS - 1) / 2), x1 - x0 - 8, fs, 400, on ? PAPER : INK, 'center');
    }
    if (open < 5) {
      const ux = round(cx + open * colW) + 1;
      g.fillStyle = tone(g, 0.125, dpr);
      g.fillRect(ux, ty, x + w - 1 - ux, TS - 1);
    }
    g.fillStyle = INK;
    hl(g, x, y + TB + TS, w);

    // the walls: a dithered band between two rules, with a plotter's head while it draws
    for (let j = 0; j < 4; j++) {
      const len = walls[j];
      if (!len) continue;
      const xc = round(cx + (j + 1) * colW);
      g.fillStyle = INK;
      vl(g, xc - 2, cy, len); vl(g, xc + 2, cy, len);
      g.fillStyle = tone(g, 0.5, dpr);
      g.fillRect(xc - 1, cy, 3, len);
      if (len < ch) { g.fillStyle = INK; g.fillRect(xc - 3, cy + len - 3, 7, 4); }
    }

    // the cookies
    g.save();
    g.beginPath(); g.rect(cx, cy, cw, ch); g.clip();
    g.fillStyle = INK;
    if (S.live) {
      for (const c of sim.list) g.fillRect(round(cx + c.u), round(cy + c.v), s, s);
    } else if (xs < 0.5) {
      for (const f of STILL_ONE) g.fillRect(round(cx + f[0] * (cw - s)), round(cy + f[1] * (ch - s)), s, s);
    } else {
      for (let k = 0; k < 5; k++) {
        const lo = k * colW + (k ? 4 : 1), hi = (k + 1) * colW - (k < 4 ? 4 : 1) - s;
        for (let j = 0; j < 3; j++) {
          const f = STILL_MANY[(k * 2 + j) % 5];
          g.fillRect(round(cx + lerp(lo, hi, f[0])), round(cy + f[1] * (ch - s)), s, s);
        }
      }
    }
    g.restore();
  }

  /* ---------- chapter 4: the mark, and five readings brought into line ---------- */

  function alignP(i, S) {
    return S.live ? steps(seg(S.now - S.alignT0 - 120 - i * 230, 0, 620), 8) : 1;
  }
  const COHERENT_AT = 120 + 4 * 230 + 620 + 180;

  function markScene(g, W, H, S, dpr) {
    const { m, fs } = sizes(W, H);
    desk(g, W, H, dpr);
    const side = W > H * 0.9;
    // the readings sit in a small window of their own: tw by th, with a pad inside
    const pad = W < 420 ? 9 : 12;
    const tw = side ? (W >= 600 ? clamp(round(W * 0.38), 250, 330) : clamp(round(W * 0.34), 118, 220)) : Math.min(W - 2 * m, 420);
    const iw = tw - 2 * pad, keys = iw >= 200;
    const rh = round(fs * (side && H < 420 ? 2.05 : 2.3)), foot = round(fs * 2.8);
    const th = 21 + 2 * pad + 5 * rh + foot, tagH = round(fs + 12);
    let u, cx, cy, tx, ty;
    if (side) {
      const aw = W - tw - 3 * m, ah = H - 2 * m - tagH - 10;
      u = Math.min(15, Math.min(aw, ah) / 2 / 15.2);
      cx = round(m + aw / 2);
      cy = round((H - (30.4 * u + 10 + tagH)) / 2 + 15.2 * u);
      tx = W - m - tw;
      ty = round((H - th) / 2);
    } else {
      const ah = H - 2 * m - tagH - 30 - th;
      u = Math.min(15, Math.min(W - 2 * m, ah) / 2 / 15.2);
      cx = round(W / 2);
      cy = round((H - (30.4 * u + 30 + tagH + th)) / 2 + 15.2 * u);
      tx = round((W - tw) / 2);
      ty = round(cy + 15.2 * u + 30 + tagH);
    }
    u = Math.max(u, 2.5);

    let agreed = 0;
    for (let i = 0; i < 5; i++) if (alignP(i, S) >= 1) agreed++;
    const all = agreed === 5;

    // the outer two rings, dotted and marching slowly
    g.fillStyle = INK3;
    const phase = S.live ? (Math.floor(S.now / 220) % 4) / 4 : 0;
    dotArc(g, cx, cy, 14.2 * u, SPANS[14.2][0], SPANS[14.2][1], 4, phase);
    dotArc(g, cx, cy, 11.8 * u, SPANS[11.8][0], SPANS[11.8][1], 4, 1 - phase);

    // the bearing: dotted until every reading lies on it
    const tagY = round(cy + 15.2 * u + 10);
    g.fillStyle = all ? INK : RULE2;
    if (all) vl(g, cx, cy, tagY - cy);
    else dots(g, cx, cy, cx, tagY, 3, 1);

    // the three ridges: dithered bands with an ink edge and round ends, as the mark has
    const hw = Math.max(2, 0.675 * u);
    for (const r of [9.4, 7.0, 4.6]) {
      const [a0, a1] = SPANS[r], rr = r * u;
      g.beginPath();
      g.arc(cx, cy, rr + hw, a0, a1);
      g.arc(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, hw, a1, a1 + Math.PI);
      g.arc(cx, cy, rr - hw, a1, a0, true);
      g.arc(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, hw, a0 + Math.PI, a0 + TAU);
      g.closePath();
      g.fillStyle = tone(g, 0.5, dpr);
      g.fill();
      g.strokeStyle = INK; g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = INK;
    g.beginPath(); g.arc(cx - 0.4 * u, cy + 0.4 * u, Math.max(2, 1.05 * u), 0, TAU); g.fill();

    // the five readings, as ticks turning along their rings in steps
    const L = Math.max(6, Math.min(round(1.35 * u + 8), round(2.4 * u - 3)));
    for (let i = 0; i < 5; i++) {
      const R0 = READINGS[i], a = Math.PI / 2 + R0.off * (1 - alignP(i, S));
      g.save();
      g.translate(round(cx + Math.cos(a) * R0.r * u), round(cy + Math.sin(a) * R0.r * u));
      g.rotate(a);
      g.fillStyle = PAPER; g.fillRect(-L / 2 - 1, -3, L + 2, 6);
      g.fillStyle = INK; g.fillRect(-L / 2, -2, L, 4);
      g.restore();
    }

    // the region the readings must agree with
    const maxTag = side ? W - tw - 3 * m : W - 2 * m;
    const tgw = round(Math.min(textW(g, TAG, fs, 500) + 18, maxTag));
    const tgx = round(clamp(cx - tgw / 2, 2, W - 2 - tgw));
    g.fillStyle = all ? INK : PAPER; g.fillRect(tgx, tagY, tgw, tagH);
    g.fillStyle = INK; frame(g, tgx, tagY, tgw, tagH);
    label(g, TAG, tgx + tgw / 2, tagY + round(tagH / 2), tgw - 12, fs, 500, all ? PAPER : INK, 'center');

    // the readings, ticked off as each one lands
    win(g, tx, ty, tw, th, 'Readings', fs);
    const ix = tx + pad, iy = ty + 21 + pad;
    const keyW = keys ? round(textW(g, 'time zone', fs, 400) + fs * 1.6) : 0;
    for (let i = 0; i < 5; i++) {
      const R0 = READINGS[i], p = alignP(i, S), yc = iy + i * rh + round(rh / 2);
      if (keys) label(g, R0.k, ix, yc, keyW - 6, fs, 400, INK3);
      label(g, R0.v, ix + keyW, yc, iw - keyW - 20, fs, p >= 1 ? 500 : 400, p >= 1 ? INK : INK3);
      checkbox(g, ix + iw - 11, yc - 5, p >= 1 ? 1 : p > 0 ? 0.5 : 0, dpr);
      if (i < 4) { g.fillStyle = tone(g, 0.5, dpr); g.fillRect(ix, iy + (i + 1) * rh, iw, 1); }
    }
    const fy = iy + 5 * rh + 3;
    g.fillStyle = INK; hl(g, ix, fy, iw);
    const fyc = fy + round((foot - 3) / 2) + 1;
    label(g, agreed + ' / 5', ix + iw, fyc, iw / 2, fs, 400, INK3, 'right');
    const tc = S.live ? S.now - S.alignT0 - COHERENT_AT : 1e9;
    const n = clamp(Math.floor(tc / 55), 0, 8);
    if (n > 0) {
      const word = 'coherent'.slice(0, n);
      label(g, word, ix, fyc, iw / 2, fs, 600, INK);
      const wx = ix + textW(g, word, fs, 600);
      if (tc < 8 * 55 + 90) { g.fillStyle = INK; g.fillRect(round(wx + 1), fyc - round(fs * 0.6), round(fs * 0.6), round(fs * 1.2)); }
      else tick(g, round(wx + fs * 0.7), fyc - 3, INK);
    }
  }

  /* ---------- chapter 5: the scorecard ---------- */

  // per row: cells ticked (0–4) and verdict (0 waiting, 1 checking, 2 isolated), packed as cells * 10 + verdict
  function scoreState(i, S) {
    if (!S.live) return 42;
    const t = S.now - S.scoreT0 - 150 - i * 380;
    if (t < 0) return 0;
    return Math.min(4, Math.floor(t / 90)) * 10 + (t >= 470 ? 2 : 1);
  }
  function markIcon(g, x, y, size) {
    const u = size / 24;
    g.strokeStyle = INK; g.lineWidth = Math.max(1, 1.35 * u); g.lineCap = 'round';
    for (const r of [9.4, 7.0, 4.6]) { g.beginPath(); g.arc(x + 12 * u, y + 12 * u, r * u, SPANS[r][0], SPANS[r][1]); g.stroke(); }
    g.lineCap = 'butt';
    g.fillStyle = INK;
    g.beginPath(); g.arc(x + 11.6 * u, y + 12.4 * u, 1.05 * u, 0, TAU); g.fill();
  }

  function scoreScene(g, W, H, S, dpr) {
    const { m } = sizes(W, H);
    const fs = W >= 560 && H >= 640 ? 12 : sizes(W, H).fs;
    desk(g, W, H, dpr);
    const dw = Math.min(W - 2 * m, 560), pad = round(clamp(dw * 0.04, 10, 20)), inner = dw - 2 * pad;
    const cw1 = textW(g, '0', fs, 400), gap = round(cw1 * 2);
    const wP = cw1 * 2, wC = cw1 * 2, wIP = cw1 * 13, wV = cw1 * 8 + 8;
    const boxes = wP + wC + wIP + wV + 4 * gap + 4 * 11 + 3 * 5 <= inner;
    const head = H >= 280 ? round(Math.max(46, fs * (H >= 640 ? 5.4 : 4.4))) : 0;
    const foot = round(fs * (H >= 640 ? 4 : 3.4));
    const rh = round(clamp((H - 2 * m - 21 - 2 * pad - head - foot) / 5, fs * 1.9, fs * (H >= 640 ? 3.3 : 2.8)));
    const dh = 21 + 2 * pad + head + 5 * rh + foot;
    const dx = round((W - dw) / 2), dy = round(Math.max(4, (H - dh) / 2));
    win(g, dx, dy, dw, dh, 'Scorecard', fs);
    const px = dx + pad, right = dx + dw - pad;
    let yy = dy + 21 + pad;

    if (head) {
      const icon = Math.min(head - 14, 32);
      markIcon(g, px, yy + round((head - 10 - icon) / 2), icon);
      const lx = px + icon + 14;
      label(g, 'Self-consistency', lx, yy + round(head * 0.26), right - lx, fs + 1, 600, INK);
      label(g, 'exit IP · WebRTC · region · seed', lx, yy + round(head * 0.58), right - lx, fs, 400, INK3);
      g.fillStyle = INK; hl(g, px, yy + head - 4, inner);
      yy += head;
    }

    let done = 0;
    for (let i = 0; i < 5; i++) {
      const P = PROFILES[i], st = scoreState(i, S), cells = Math.floor(st / 10), v = st % 10;
      if (v === 2) done++;
      const yc = yy + i * rh + round(rh / 2);
      let x = px;
      label(g, P.id, x, yc, wP + 2, fs, 500, INK); x += wP + gap;
      label(g, P.cc, x, yc, wC + 2, fs, 600, INK); x += wC + gap;
      label(g, P.ip, x, yc, wIP + 2, fs, 400, INK2); x += wIP + gap;
      if (boxes) for (let c = 0; c < 4; c++) checkbox(g, round(x + c * 16), yc - 5, c < cells || v === 2 ? 1 : v === 1 && c === cells ? 0.5 : 0, dpr);
      if (v === 2) {
        const vw = round(textW(g, 'isolated', fs, 500) + 10);
        g.fillStyle = INK; g.fillRect(right - vw, yc - round(fs * 0.8), vw, round(fs * 1.6));
        label(g, 'isolated', right - 5, yc, vw - 8, fs, 500, PAPER, 'right');
      } else label(g, v === 1 ? 'checking' : '·', right - 5, yc, wV, fs, 400, INK3, 'right');
      if (i < 4) { g.fillStyle = tone(g, 0.5, dpr); g.fillRect(px, yy + (i + 1) * rh, inner, 1); }
    }

    // the separation counter
    const fy = yy + 5 * rh + 3;
    g.fillStyle = INK; hl(g, px, fy, inner);
    const yc = fy + round((foot - 3) / 2) + 1;
    const counter = done + ' / 5 separate', caretW = round(fs * 0.6);
    const cW = textW(g, counter, fs, 600), labW = textW(g, 'separation', fs, 400), barW = 5 * 13 - 3;
    let bx = px;
    if (labW + 14 + barW + 14 + cW + caretW + 4 <= inner) { label(g, 'separation', px, yc, labW + 2, fs, 400, INK3); bx = px + round(labW) + 14; }
    for (let c = 0; c < 5; c++) {
      const cx = bx + c * 13;
      g.fillStyle = INK; frame(g, cx, yc - 5, 10, 10);
      const st = scoreState(c, S) % 10;
      if (st === 2) g.fillRect(cx + 2, yc - 3, 6, 6);
      else if (st === 1) { g.fillStyle = tone(g, 0.5, dpr); g.fillRect(cx + 2, yc - 3, 6, 6); }
    }
    const cx2 = right - caretW - 4;
    label(g, counter, cx2, yc, cx2 - bx - barW - 10, fs, 600, INK, 'right');
    if (S.live && done === 5 && Math.floor(S.now / 530) % 2 === 0) { g.fillStyle = INK; g.fillRect(cx2 + 3, yc - round(fs * 0.6), caretW, round(fs * 1.2)); }
  }

  function scene(g, W, H, which, S, dpr) {
    if (which === 0) browserScene(g, W, H, S, S.G || browserGeo(g, W, H, Math.min(S.xs, 2.5)), dpr);
    else if (which === 1) markScene(g, W, H, S, dpr);
    else scoreScene(g, W, H, S, dpr);
  }

  /* ---------- the cookies: gravity, a floor, and walls that only stop what they reach ---------- */

  const sim = { list: [], cw: 0, ch: 0, dropT0: 0, dropped: 0, seed: 11 };
  const rand = () => { sim.seed = (sim.seed * 1664525 + 1013904223) >>> 0; return sim.seed / 4294967296; };
  function spawn(u, v, home, kind) {
    sim.list.push({ u, v, home, kind, vx: (rand() - 0.5) * 160, vy: 0 });
    if (sim.list.length > 64) {
      const i = sim.list.findIndex(c => c.kind === 2);
      sim.list.splice(i >= 0 ? i : 0, 1);
    }
  }
  function physics(dt, G) {
    const { cw, ch, walls, s } = G;
    if (cw < 20 || ch < 20) return;
    if (!sim.cw) {
      sim.cw = cw; sim.ch = ch;
      [[0.18, 0.2, 110], [0.52, 0.6, -80], [0.8, 0.35, 60]].forEach(f => sim.list.push({ u: f[0] * cw, v: f[1] * ch, home: 0, kind: 0, vx: f[2], vy: 0 }));
    }
    if (cw !== sim.cw || ch !== sim.ch) {
      const fx = cw / sim.cw, fy = ch / sim.ch;
      for (const c of sim.list) { c.u *= fx; c.v *= fy; }
      sim.cw = cw; sim.ch = ch;
    }
    const colW = cw / 5, grav = ch * 2.4 + 320, rest = 0.86, low = Math.sqrt(2 * grav * ch * 0.12);
    const n = dt > 20 ? 2 : 1, h = dt / 1000 / n;
    for (let it = 0; it < n; it++) {
      for (const c of sim.list) {
        c.vy += grav * h; c.u += c.vx * h; c.v += c.vy * h;
        if (c.v + s > ch) {
          c.v = ch - s; c.vy = -Math.abs(c.vy) * rest;
          if (-c.vy < low) { c.vy = -Math.sqrt(2 * grav * ch * (0.3 + rand() * 0.5)); c.vx += (rand() - 0.5) * 120; }
        }
        if (c.v < 0) { c.v = 0; c.vy = Math.abs(c.vy) * rest; }
        if (c.u < 0) { c.u = 0; c.vx = Math.abs(c.vx); }
        if (c.u + s > cw) { c.u = cw - s; c.vx = -Math.abs(c.vx); }
        const k = c.home;
        if (k < 4 && walls[k] > c.v) { const rb = (k + 1) * colW - 3; if (c.u + s > rb) { c.u = rb - s; c.vx = -Math.abs(c.vx); } }
        if (k > 0 && walls[k - 1] > c.v) { const lb = k * colW + 3; if (c.u < lb) { c.u = lb; c.vx = Math.abs(c.vx); } }
        c.home = clamp(Math.floor((c.u + s / 2) / colW), 0, 4);
        c.vx = clamp(c.vx, -220, 220);
      }
    }
  }

  /* ---------- reduced motion: a settled still in every chapter ---------- */

  if (REDUCED) {
    chapters.forEach((el, k) => {
      const c = el.querySelector('.um-still');
      if (!c) return;
      const s = MD.stage(c);
      const S = { xs: k, live: false, now: 0, G: null };
      const paint = () => {
        s.size();
        labelCache.clear();
        if (!s.W || !s.H) return;
        s.ctx.imageSmoothingEnabled = false;
        scene(s.ctx, s.W, s.H, k < 3 ? 0 : k - 2, S, s.dpr);
      };
      paint();
      MD.repaints.push(paint);
    });
    return;
  }

  /* ---------- the pinned stage ---------- */

  const canvas = document.getElementById('um-canvas');
  const stageEl = section.querySelector('.um-stage');
  if (!canvas || !stageEl) return;
  const liveEl = document.getElementById('um-live'), stepEl = document.getElementById('um-step');
  const off = document.createElement('canvas'), og = off.getContext('2d');
  const st = MD.stage(canvas, s => { off.width = s.canvas.width; off.height = s.canvas.height; });
  const narrow = window.matchMedia('(max-width: 900px)');
  const DZ = 440;
  const M = { span: 0, yRead: 0, centers: [] };
  const S = { xs: 0, live: true, now: 0, scene: 0, from: 0, tx0: -1e9, alignT0: 0, scoreT0: 0, G: null };

  // cache the section's geometry; per frame the only layout read is MD.progress
  function measure() {
    st.size();
    labelCache.clear();
    const vh = window.innerHeight;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 30;
    M.span = Math.max(0, section.offsetHeight - vh);
    M.yRead = ((narrow.matches ? bar + stageEl.offsetHeight : bar) + vh) / 2;
    M.centers = chapters.map(c => c.offsetTop + c.offsetHeight / 2);
  }
  // which chapter sits on the reading line, as a continuous 0–4
  function readX() {
    const y = MD.progress(section) * M.span + M.yRead, c = M.centers;
    if (!c.length || y <= c[0]) return 0;
    for (let k = 0; k < c.length - 1; k++) if (y < c[k + 1]) return k + (y - c[k]) / (c[k + 1] - c[k]);
    return c.length - 1;
  }
  const sceneFor = xs => (xs < 2.5 ? 0 : xs < 3.5 ? 1 : 2);
  function pickScene(t) {
    const cur = S.scene, lo = cur === 0 ? -9 : cur === 1 ? 2.5 : 3.5, hi = cur === 0 ? 2.5 : cur === 1 ? 3.5 : 9;
    if (S.xs >= lo - 0.04 && S.xs < hi + 0.04) return;
    S.from = cur; S.scene = sceneFor(S.xs); S.tx0 = t;
    if (S.scene === 1) S.alignT0 = t + DZ;
    if (S.scene === 2) S.scoreT0 = t + DZ;
  }
  function drops(t) {
    const G = S.G;
    if (S.xs >= 0.86) {
      if (!sim.dropT0) sim.dropT0 = t;
      while (sim.dropped < 10 && t >= sim.dropT0 + sim.dropped * 160) {
        const k = sim.dropped % 5, colW = G.cw / 5;
        spawn(k * colW + colW * (0.3 + rand() * 0.4) - G.s / 2, 0, k, 1);
        sim.dropped++;
      }
    } else if (S.xs < 0.5 && sim.dropT0) {
      sim.list = sim.list.filter(c => c.kind !== 1);
      sim.dropT0 = 0; sim.dropped = 0;
    }
  }
  function dropInto(k, u, v) {
    const G = S.G;
    if (!G) return;
    const colW = G.cw / 5;
    if (u == null) u = k * colW + colW * (0.3 + rand() * 0.4);
    spawn(clamp(u - G.s / 2, 0, G.cw - G.s), clamp(v == null ? 0 : v - G.s / 2, 0, G.ch - G.s), k, 2);
  }

  function render(t, dissolving) {
    const g = st.ctx, W = st.W, H = st.H, dpr = st.dpr;
    g.imageSmoothingEnabled = false;
    if (!dissolving) { scene(g, W, H, S.scene, S, dpr); return; }
    // the incoming scene arrives through a stepped ordered-dither mask, as the page's text does
    const lvl = Math.max(1, Math.ceil(((t - S.tx0) / DZ) * 16));
    scene(g, W, H, S.from, S, dpr);
    og.setTransform(dpr, 0, 0, dpr, 0, 0);
    og.imageSmoothingEnabled = false;
    scene(og, W, H, S.scene, S, dpr);
    og.globalCompositeOperation = 'destination-in';
    og.fillStyle = tone(og, lvl / 16, dpr);
    og.fillRect(0, 0, W, H);
    og.globalCompositeOperation = 'source-over';
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(off, 0, 0);
    g.restore();
  }

  let lastKey = -1;
  function status() {
    const c = clamp(round(S.xs), 0, 4), n = sim.list.length;
    let a = 0, d = 0;
    if (S.scene === 1) for (let i = 0; i < 5; i++) if (alignP(i, S) >= 1) a++;
    if (S.scene === 2) for (let i = 0; i < 5; i++) if (scoreState(i, S) % 10 === 2) d++;
    const key = c * 1e6 + n * 1e3 + a * 10 + d;
    if (key === lastKey) return;
    lastKey = key;
    liveEl.textContent = c === 0 ? '1 window · 1 session · ' + n + (n === 1 ? ' cookie' : ' cookies')
      : c === 1 ? '5 sessions · ' + n + ' cookies · 0 shared'
      : c === 2 ? '5 profiles · 5 exit IPs · 5 regions'
      : c === 3 ? PROFILES[0].id + ' · ' + PROFILES[0].cc + ' · ' + a + ' / 5 readings agree'
      : d + ' / 5 separate';
    stepEl.textContent = '0' + (c + 1) + ' / 05';
  }

  function onFrame(t, dt) {
    S.now = t;
    const x = readX();
    S.xs += (x - S.xs) * (1 - Math.exp(-dt / 110));
    if (Math.abs(x - S.xs) < 1e-3) S.xs = x;
    pickScene(t);
    if (!st.W || !st.H) return;
    const dissolving = S.from !== S.scene && t - S.tx0 < DZ;
    if (S.scene === 0 || (dissolving && S.from === 0)) {
      S.G = browserGeo(st.ctx, st.W, st.H, Math.min(S.xs, 2.5));
      drops(t);
      physics(dt, S.G);
    }
    render(t, dissolving);
    status();
  }

  measure();
  S.xs = readX();
  S.scene = S.from = sceneFor(S.xs);
  S.alignT0 = S.scoreT0 = performance.now();
  S.G = browserGeo(st.ctx, st.W, st.H, Math.min(S.xs, 2.5));
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(section);
  MD.repaints.push(measure);
  MD.loop(canvas, onFrame);

  // input: a click in a partition drops a cookie there; on the mark or the scorecard it plays the step again
  const at = e => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const inContent = (px, py) => {
    const G = S.G;
    return S.scene === 0 && G && px >= G.cx && px < G.cx + G.cw && py >= G.cy && py < G.cy + G.ch;
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const [px, py] = at(e);
    if (inContent(px, py)) {
      const G = S.G, u = px - G.cx;
      dropInto(clamp(Math.floor(u / (G.cw / 5)), 0, 4), u, py - G.cy);
    } else if (S.scene === 1) S.alignT0 = performance.now() + 60;
    else if (S.scene === 2) S.scoreT0 = performance.now() + 60;
  });
  if (MD.FINE) {
    let cur = '';
    canvas.addEventListener('pointermove', e => {
      const [px, py] = at(e);
      const want = inContent(px, py) ? 'crosshair' : S.scene ? 'pointer' : '';
      if (want !== cur) { canvas.style.cursor = want; cur = want; }
    });
  }
  // the same, from real keys beside each chapter
  section.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => dropInto(+b.dataset.drop)));
  section.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'align') S.alignT0 = performance.now() + 60;
    else S.scoreT0 = performance.now() + 60;
  }));
});
})();
