/* Admit — the wallet and the door.
   The page makes two phone keys with WebCrypto (P-256, non-extractable): yours, and the buyer's for
   the transfer. The wallet signs a real ADM1 code for every ten-second step, and each attempt goes
   through the door's checks in the order apps/server/src/services/scan.ts makes them. Only what is
   held up to the door is staged; every verdict is worked out. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;

MD.safe('admit', function admit() {
  const bench = document.querySelector('.ad-bench');
  const phoneWin = document.querySelector('.ad-phone');
  const doorWin = document.getElementById('ad-door');
  const canvas = document.getElementById('ad-ticket');
  const checks = Array.from(document.querySelectorAll('#ad-checks li'));
  const verdict = document.getElementById('ad-verdict');
  const codeEl = document.getElementById('ad-code');
  const tryBar = document.getElementById('ad-tries');
  const tries = Array.from(document.querySelectorAll('.ad-try'));
  const bars = tries.map(b => b.querySelector('.bar'));
  const caps = Array.from(document.querySelectorAll('#ad-caps li'));
  const logBody = document.getElementById('ad-log');
  const note = document.getElementById('ad-note');
  const phoneTitle = document.getElementById('ad-phone-title');
  if (!bench || !phoneWin || !doorWin || !canvas || checks.length !== 8 || !verdict || tries.length !== 5) return;
  const { REDUCED, INK, INK2, INK3, RULE, RULE2, PAPER, B4, font, fitText, rng } = MD;
  const R = Math.round;
  const two = n => String(n).padStart(2, '0');
  // the ticket's clock is the menu bar's: London time
  const LDN = window.Intl ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : null;
  const hms = ms => { if (LDN) return LDN.format(new Date(ms)); const d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()); };

  /* ---------- the protocol (packages/shared/src/protocol.ts) ---------- */

  const STEP_MS = 10000;
  const stepAt = ms => Math.floor(ms / STEP_MS);
  const TICKET_ID = '7K2QM9XRP4TD';
  const TICKET_RE = /^[0-9A-HJKMNP-TV-Z]{12}$/, KID_RE = /^[0-9A-Za-z]{8}$/, SIG_RE = /^[A-Za-z0-9_-]{86}$/;
  const enc = new TextEncoder();
  const signingInput = f => enc.encode(['ADM1', f.ticketId, f.version, f.kid, f.step].join('|'));
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const encode = c => `ADM1.${c.ticketId}.${c.version}.${c.kid}.${c.step}.${c.sig}`;
  // strict: anything that isn't exactly an ADM1 code is null
  function decode(raw) {
    const p = String(raw).trim().split('.');
    if (p.length !== 6 || p[0] !== 'ADM1') return null;
    const [, ticketId, version, kid, step, sig] = p;
    if (!TICKET_RE.test(ticketId) || !/^[1-9]\d{0,5}$/.test(version) || !KID_RE.test(kid) || !/^\d{1,13}$/.test(step) || !SIG_RE.test(sig)) return null;
    return { ticketId, version: Number(version), kid, step: Number(step), sig };
  }
  // one step of lateness (the walk to the door) and one of earliness (clock drift)
  function checkStep(step, nowMs) {
    const now = stepAt(nowMs);
    return step < now - 1 ? 'expired' : step > now + 1 ? 'future' : 'ok';
  }

  /* ---------- phones: a key pair made here, which can sign but never be read out ---------- */

  const subtle = window.isSecureContext && window.crypto && window.crypto.subtle;
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
  const KID_ABC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const seed = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() >>> 0);
  const rand = rng(seed);
  const newKid = () => { let s = ''; for (let i = 0; i < 8; i++) s += KID_ABC[Math.floor(rand() * 62)]; return s; };

  // without WebCrypto (an insecure origin) a keyed hash stands in, so the door still refuses what the phone didn't sign
  function macOf(secret, bytes) {
    const out = new Uint8Array(64);
    let h = secret >>> 0;
    for (let r = 0; r < 64; r++) {
      h ^= r * 0x9e3779b1;
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
      out[r] = (h >>> 11) & 255;
    }
    return out;
  }
  async function makePhone() {
    const kid = newKid();
    if (subtle) {
      try {
        const k = await subtle.generateKey(ALG, false, ['sign', 'verify']);
        return {
          kid, real: true,
          sign: async f => new Uint8Array(await subtle.sign(SIG, k.privateKey, signingInput(f))),
          verify: (f, sig) => subtle.verify(SIG, k.publicKey, sig, signingInput(f)),
        };
      } catch (e) { /* fall through to the stand-in */ }
    }
    const secret = Math.floor(rand() * 4294967296);
    return {
      kid, real: false,
      sign: async f => macOf(secret, signingInput(f)),
      verify: async (f, sig) => { const m = macOf(secret, signingInput(f)); return sig.length === 64 && m.every((b, i) => b === sig[i]); },
    };
  }
  async function signAt(phone, version, step) {
    const f = { ticketId: TICKET_ID, version, kid: phone.kid, step };
    return encode({ ...f, sig: b64u(await phone.sign(f)) });
  }

  /* ---------- the ticket, as the door's database holds it ---------- */

  let you = null, buyer = null;
  const phones = {};
  const T = { version: 1, kid: '', status: 'valid', first: 0 };
  const reset = () => { T.version = 1; T.kid = you.kid; T.status = 'valid'; T.first = 0; };
  // a transfer re-keys the ticket to the buyer's phone and bumps its version
  const transfer = () => { T.version = 2; T.kid = buyer.kid; };

  const COPY = {
    admitted: ['Admitted', 'Ticket valid.'],
    already_used: ['Already scanned', 'This ticket has already been used to get in.'],
    expired: ['Code expired', 'This looks like a screenshot, so ask them to open their wallet.'],
    superseded: ['Old ticket code', 'This ticket has been transferred to someone else.'],
    wrong_device: ['Wrong phone', 'Ask them to open the ticket on the phone that holds it.'],
    void: ['Ticket cancelled', 'This ticket was cancelled or refunded.'],
    listed: ['Listed for resale', 'The holder is reselling this ticket, so it can’t be used.'],
    invalid: ['Not a valid ticket', 'This code wasn’t issued by Admit or has been tampered with.'],
    future: ['Not a valid ticket', 'This code isn’t valid yet. Ask them to reopen the ticket.'],
  };

  // the door: returns how far the code got (0–7 is the check that refused it, 8 is admitted) and why
  async function door(raw, at) {
    const out = (reached, result) => ({ reached, result, at, first: T.first });
    const c = decode(raw);
    if (!c) return out(0, 'invalid');
    if (c.ticketId !== TICKET_ID) return out(1, 'invalid');
    if (T.status === 'void') return out(2, 'void');
    if (T.status === 'listed') return out(2, 'listed');
    if (c.version !== T.version) return out(3, 'superseded');
    const ph = phones[T.kid];
    if (!ph || c.kid !== T.kid) return out(4, 'wrong_device');
    if (!(await ph.verify(c, unb64u(c.sig)))) return out(5, 'invalid');
    const fresh = checkStep(c.step, at);
    if (fresh !== 'ok') return out(6, fresh);
    // the one conditional write: valid becomes used, once
    if (T.status !== 'valid') return out(7, 'already_used');
    T.status = 'used'; T.first = at;
    return out(8, 'admitted');
  }

  /* ---------- what gets held up ---------- */

  const TRIES = [
    { log: 'The phone', title: 'Wallet — your phone', async make(now) {
      reset();
      return { code: await signAt(you, 1, stepAt(now)), shot: 0 };
    } },
    { log: 'A screenshot, 30 s old', title: 'Photos — a screenshot', mark: 'step', async make(now) {
      reset();
      const at = now - 30000;
      return { code: await signAt(you, 1, stepAt(at)), shot: at };
    } },
    { log: 'A copy, shared', title: 'Messages — a copy from a friend', async make(now) {
      // the phone went in eight seconds ago; its code was captured and sent on at that moment
      reset();
      const at = now - 8000, live = await signAt(you, 1, stepAt(at));
      const first = await door(live, at);
      addLog(at, 'The phone', first);
      return { code: live, shot: at };
    } },
    { log: 'After a transfer', title: 'Photos — the seller’s copy', mark: 'version', async make(now) {
      reset();
      const at = now - 5000, code = await signAt(you, 1, stepAt(at));
      transfer();
      return { code, shot: at };
    } },
    { log: 'An edited copy', title: 'Photos — an edited copy', mark: 'step', async make(now) {
      reset();
      const at = now - 30000, c = decode(await signAt(you, 1, stepAt(at)));
      c.step = stepAt(now);
      return { code: encode(c), shot: at, edited: true };
    } },
  ];

  /* ---------- the wallet, drawn: event, tear line, code, security strip ---------- */

  const st = MD.stage(canvas);
  const g = st.ctx;
  const view = { mode: 'live', code: '', shot: 0, edited: false, scanned: 0 };
  let live = { step: -1, code: '' };
  let shown = { code: '', prev: '', since: 0 };

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
  const N = 25;
  const mcache = new Map();
  function matrix(code) {
    if (mcache.has(code)) return mcache.get(code);
    const r = rng(hash(code)), m = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) m[i] = r() < 0.5 ? 1 : 0;
    for (let i = 8; i < N - 8; i++) { m[6 * N + i] = m[i * N + 6] = (i + 1) & 1; }
    const finder = (ox, oy) => {
      for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) {
        const X = ox + x, Y = oy + y;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        m[Y * N + X] = ring === 3 || ring <= 1 ? 1 : 0;
      }
    };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    if (mcache.size > 12) mcache.clear();
    mcache.set(code, m);
    return m;
  }

  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); };
  function dotRect(x, y, w, h, c) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    g.fillStyle = c;
    for (let i = 0; i < w; i += 3) { g.fillRect(x + i, y, 1, 1); g.fillRect(x + i, y + h - 1, 1, 1); }
    for (let i = 0; i < h; i += 3) { g.fillRect(x, y + i, 1, 1); g.fillRect(x + w - 1, y + i, 1, 1); }
  }
  function wrapMono(str, maxW, size) {
    g.font = font(size);
    const per = Math.max(8, Math.floor(maxW / g.measureText('0').width));
    const out = [];
    for (let i = 0; i < str.length; i += per) out.push(str.slice(i, i + per));
    return out;
  }

  function draw(now) {
    const W = st.W, H = st.H;
    if (!W || !H) return;
    g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    rect(0, 0, W, H, PAPER);
    const shot = view.mode === 'shot';
    const frozen = shot ? view.shot : now;
    const pad = W < 360 ? 14 : 22, cx = pad, cw = W - pad * 2;
    let y = pad + 4;

    // a screenshot is a still picture of the wallet: a dotted frame and a label give it away
    if (shot) {
      dotRect(6, 6, W - 12, H - 12, INK);
      g.font = font(10, 500);
      const label = (view.edited ? 'EDITED  ' : 'SCREENSHOT  ') + hms(view.shot);
      const lw = g.measureText(label).width + 14;
      rect(W - 14 - lw, 0, lw, 17, INK);
      g.fillStyle = PAPER; g.textBaseline = 'middle'; g.textAlign = 'left';
      fitText(g, label, W - 14 - lw + 7, 9, lw - 12, 10, 500);
      y += 6;
    }

    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = INK;
    fitText(g, 'Fight Night 12', cx, y + 16, cw, 18, 500);
    g.fillStyle = INK3;
    fitText(g, 'Northside Boxing Club · Doors 19:00', cx, y + 36, cw, 11);
    y += 50;
    rect(cx, y, cw, 1, RULE);
    g.fillStyle = INK3;
    fitText(g, 'Ticket', cx, y + 18, cw * 0.4, 10);
    g.textAlign = 'right';
    fitText(g, 'Admission', cx + cw, y + 18, cw * 0.5, 10);
    g.fillStyle = INK; g.textAlign = 'left';
    fitText(g, '7K2Q-M9XR-P4TD', cx, y + 34, cw * 0.55, 12.5, 500);
    g.textAlign = 'right';
    fitText(g, 'General', cx + cw, y + 34, cw * 0.4, 12.5, 500);
    y += 48;

    // the tear line, with a notch either side
    g.fillStyle = INK3;
    for (let x = cx + 8; x < cx + cw - 8; x += 4) g.fillRect(R(x), R(y), 2, 1);
    g.beginPath(); g.arc(cx - pad, y, pad * 0.45, -Math.PI / 2, Math.PI / 2); g.fillStyle = RULE; g.fill();
    g.beginPath(); g.arc(cx + cw + pad, y, pad * 0.45, Math.PI / 2, Math.PI * 1.5); g.fill();
    y += 18;

    // the code: a fresh matrix arrives through a 4×4 Bayer dissolve over the old one
    const codeLines = wrapMono(view.code || 'ADM1…', cw, 9.5);
    const below = 26 + 12 + 18 + codeLines.length * 13 + 10;
    const side = Math.max(90, Math.min(cw - 30, H - y - below - (shot ? 10 : 4), 260));
    const mod = Math.max(2, Math.floor(side / N)), qs = mod * N;
    const qx = R(cx + (cw - qs) / 2), qy = R(y + (side - qs) / 2);
    if (view.scanned && !shot) {
      g.fillStyle = MD.pattern(g, 0.12, st.dpr); g.fillRect(qx, qy, qs, qs);
      rect(qx + qs * 0.12, qy + qs * 0.32, qs * 0.76, qs * 0.36, PAPER);
      g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(R(qx + qs * 0.12) + 0.5, R(qy + qs * 0.32) + 0.5, R(qs * 0.76) - 1, R(qs * 0.36) - 1);
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, 'You’re in', qx + qs / 2, qy + qs * 0.46, qs * 0.7, 20, 500);
      g.fillStyle = INK3;
      fitText(g, 'Scanned ' + hms(view.scanned), qx + qs / 2, qy + qs * 0.58, qs * 0.7, 10.5);
    } else if (view.code) {
      const cur = matrix(view.code), prev = shown.prev ? matrix(shown.prev) : null;
      const k = REDUCED || !prev ? 16 : Math.min(16, Math.floor(((now - shown.since) / 420) * 16));
      g.fillStyle = INK;
      for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
        const src = k >= 16 || B4[(yy & 3) * 4 + (xx & 3)] < k ? cur : prev;
        if (src[yy * N + xx]) g.fillRect(qx + xx * mod, qy + yy * mod, mod, mod);
      }
    }
    y = qy + qs + 12;

    // the security strip: ink, a sweeping line, a square blinking once a second, the clock.
    // Not live (scanned) it turns light and stops; in a screenshot it is simply frozen
    const sh = 26, sx = cx, sw = cw;
    const lit = !(view.scanned && !shot);
    rect(sx, y, sw, sh, lit ? INK : RULE);
    g.textBaseline = 'middle';
    if (lit) {
      g.fillStyle = PAPER;
      const p = ((frozen % 2400) + 2400) % 2400 / 2400;
      if (!REDUCED || shot) g.fillRect(R(sx + 3 + p * (sw - 7)), y + 4, 1, sh - 8);
      if (Math.floor(frozen / 500) % 2 === 0 || REDUCED) g.fillRect(sx + 8, y + sh / 2 - 3, 7, 7);
      g.textAlign = 'right';
      fitText(g, hms(frozen), sx + sw - 8, y + sh / 2 + 0.5, sw * 0.5, 12, 500);
      g.textAlign = 'left'; g.fillStyle = RULE2;
      fitText(g, 'LIVE', sx + 22, y + sh / 2 + 0.5, sw * 0.3, 10, 500);
    } else {
      g.fillStyle = INK2; g.textAlign = 'left';
      fitText(g, 'SCANNED', sx + 10, y + sh / 2 + 0.5, sw * 0.5, 10, 500);
      g.textAlign = 'right';
      fitText(g, hms(view.scanned), sx + sw - 8, y + sh / 2 + 0.5, sw * 0.5, 12, 500);
    }
    y += sh + 14;
    g.textAlign = 'left'; g.fillStyle = INK2;
    const ago = Math.max(0, Math.round((now - view.shot) / 1000));
    const line = view.scanned && !shot ? 'Show this screen if you leave and come back.'
      : shot ? 'Captured ' + ago + ' s ago. The picture doesn’t move.'
      : 'New code in ' + Math.max(1, Math.ceil((STEP_MS - (now % STEP_MS)) / 1000)) + ' s';
    fitText(g, line, cx, y, cw, 11);
    y += 18;
    if (!(view.scanned && !shot)) {
      g.fillStyle = INK3;
      codeLines.forEach((l, i) => fitText(g, l, cx, y + i * 13, cw, 9.5));
    }
  }

  /* ---------- the door, shown: checks tick in order; the first refusal stops the rest ---------- */

  function showCode(code, mark) {
    const p = code.split('.');
    if (p.length !== 6) { codeEl.textContent = code; return; }
    const part = (s, k) => {
      const span = document.createElement(mark === k ? 'mark' : 'span');
      span.textContent = s;
      return span;
    };
    codeEl.textContent = '';
    const names = ['adm', 'ticket', 'version', 'kid', 'step', 'sig'];
    p.forEach((s, i) => {
      if (i) codeEl.append('.');
      codeEl.append(part(i === 5 ? s.slice(0, 22) + '…' : s, names[i]));
    });
  }
  function setChecks(states) {
    checks.forEach((li, i) => {
      li.classList.remove('ok', 'no', 'skip');
      if (states[i]) li.classList.add(states[i]);
    });
  }
  function setVerdict(r) {
    const [title, detail] = COPY[r.result] || COPY.invalid;
    verdict.className = 'ad-verdict ' + (r.reached === 8 ? 'ok' : 'no');
    verdict.textContent = '';
    const b = document.createElement('b'); b.textContent = title;
    const s = document.createElement('span');
    s.textContent = detail + (r.result === 'already_used' && r.first ? ' First scan ' + hms(r.first) + ', Main entrance.' : '');
    verdict.append(b, s);
  }
  function addLog(at, what, r) {
    if (!logBody) return;
    const [title] = COPY[r.result] || COPY.invalid;
    const tr = document.createElement('tr');
    if (!REDUCED) tr.className = 'new';
    [hms(at), what, r.reached === 8 ? '✓ ' + title : '× ' + title + ', at check ' + (r.reached + 1)].forEach(t => {
      const td = document.createElement('td'); td.textContent = t; tr.append(td);
    });
    logBody.prepend(tr);
    while (logBody.rows.length > 6) logBody.deleteRow(-1);
  }

  /* ---------- running an attempt ---------- */

  let cur = -1, run = 0, queue = Promise.resolve(), started = false, logCleared = false;
  let tTry = 0, lastQ = -1;
  const DWELL = 7200;
  const timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

  function select(i) {
    cur = i;
    tries.forEach((b, k) => {
      b.setAttribute('aria-pressed', k === i ? 'true' : 'false');
      b.tabIndex = k === i ? 0 : -1;
      bars[k].style.transform = 'scaleX(0)';
    });
    caps.forEach((li, k) => li.classList.toggle('on', k === i));
    if (caps[i] && started) { MD.hide(caps[i]); MD.dissolve(caps[i], 0, 260); }
    tTry = 0; lastQ = -1;
  }

  function go(i, focus) {
    i = (i + TRIES.length) % TRIES.length;
    select(i);
    if (focus) tries[i].focus();
    const my = ++run;
    clearTimers();
    queue = queue.then(() => attempt(i, my)).catch(err => { if (window.console) console.error('marcus.gg: admit attempt failed', err); });
  }

  async function attempt(i, my) {
    if (my !== run) return;
    if (!logCleared && logBody) { logBody.textContent = ''; logCleared = true; }
    const tr = TRIES[i], now = Date.now();
    const held = await tr.make(now);
    if (my !== run) return;
    view.mode = held.shot ? 'shot' : 'live';
    view.shot = held.shot; view.edited = !!held.edited; view.scanned = 0;
    view.code = held.code;
    if (shown.code !== held.code) { shown.prev = shown.code; shown.code = held.code; shown.since = performance.now(); }
    if (phoneTitle) phoneTitle.textContent = tr.title;
    showCode(held.code, tr.mark);
    setChecks([]);
    verdict.className = 'ad-verdict';
    verdict.innerHTML = '<b>Checking…</b><span>Eight checks, in order.</span>';
    phoneWin.classList.add('active'); doorWin.classList.remove('active');
    paint();
    const r = await door(held.code, now);
    if (my !== run) return;
    addLog(now, tr.log, r);
    const states = checks.map((_, k) => (k < r.reached ? 'ok' : k === r.reached ? 'no' : 'skip'));
    const finish = () => {
      setChecks(states);
      setVerdict(r);
      if (!REDUCED) { MD.hide(verdict); MD.dissolve(verdict, 0, 300); }
      if (r.reached === 8 && view.mode === 'live') { view.scanned = now; paint(); }
    };
    if (REDUCED) { finish(); return; }
    // the code crosses to the door, then each check takes its turn
    later(() => { if (my === run) { phoneWin.classList.remove('active'); doorWin.classList.add('active'); } }, 240);
    const upto = Math.min(r.reached, 7);
    for (let k = 0; k <= upto; k++) later(() => { if (my === run) setChecks(states.map((s, j) => (j <= k ? s : null))); }, 380 + k * 150);
    later(() => { if (my === run) finish(); }, 380 + (upto + 1) * 150 + 60);
  }

  tries.forEach((b, k) => {
    b.tabIndex = k === 0 ? 0 : -1;
    b.addEventListener('click', () => go(k));
  });
  if (tryBar) tryBar.addEventListener('keydown', e => {
    let to = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = cur + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = cur - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = TRIES.length - 1;
    if (to === null) return;
    e.preventDefault();
    go(to, true);
  });

  // auto-advance pauses while a mouse is over the bench or the keys, or the keyboard is in them
  let hovering = 0, kbFocus = false;
  const focusVisible = el => { try { return el.matches(':focus-visible'); } catch (err) { return true; } };
  [bench, tryBar].forEach(el => {
    if (!el) return;
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering++; });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hovering = Math.max(0, hovering - 1); });
  });
  if (tryBar) {
    tryBar.addEventListener('focusin', e => { kbFocus = focusVisible(e.target); });
    tryBar.addEventListener('focusout', e => { if (!e.relatedTarget || !tryBar.contains(e.relatedTarget)) kbFocus = false; });
  }

  /* ---------- the live code: signed again every ten seconds ---------- */

  let signing = false;
  async function refreshLive(now) {
    const step = stepAt(now);
    if (signing || step === live.step || !you) return;
    signing = true;
    try {
      const code = await signAt(you, 1, step);
      live = { step, code };
      if (view.mode === 'live' && !view.scanned) {
        view.code = code;
        if (shown.code !== code) { shown.prev = shown.code; shown.code = code; shown.since = performance.now(); }
      }
    } finally { signing = false; }
  }

  let lastDraw = 0;
  const paint = () => draw(Date.now());
  MD.loop(bench, (t, dt) => {
    const now = Date.now();
    refreshLive(now);
    if (started && !REDUCED) {
      if (!(hovering || kbFocus)) {
        tTry += dt;
        if (tTry >= DWELL) go(cur + 1);
      }
      const q = Math.min(1, Math.floor((tTry / DWELL) * 30) / 30);
      if (q !== lastQ && bars[cur]) { lastQ = q; bars[cur].style.transform = 'scaleX(' + q + ')'; }
    }
    // the strip moves in steps; ten frames a second is plenty, and a fresh code gets every frame
    if (t - lastDraw >= 100 || performance.now() - shown.since < 460) { lastDraw = t; draw(now); }
  });
  MD.repaints.push(() => { st.size(); paint(); });

  /* ---------- start: make the two keys, then open the windows ---------- */

  Promise.all([makePhone(), makePhone()]).then(([a, b]) => {
    you = a; buyer = b;
    phones[a.kid] = a; phones[b.kid] = b;
    reset();
    if (note) note.textContent = a.real
      ? 'Every code above is signed in this browser with a P-256 key it made and can’t export, then checked as the door checks it. The event and ticket are invented.'
      : 'This browser can’t make keys here, so a keyed hash stands in for the signature; the checks are the door’s own. The event and ticket are invented.';
    return refreshLive(Date.now());
  }).then(() => {
    paint();
    const begin = () => { started = true; go(0); };
    if (REDUCED || !('IntersectionObserver' in window)) { begin(); return; }
    MD.onVisible(bench, () => {
      MD.zoomOpen(phoneWin, () => { MD.dissolve(phoneWin, 0, 380); });
      setTimeout(() => MD.zoomOpen(doorWin, () => { MD.dissolve(doorWin, 0, 380); setTimeout(begin, 420); }), 170);
    }, 0.25);
  }).catch(err => {
    if (window.console) console.error('marcus.gg: admit failed to start', err);
    MD.dissolve(phoneWin, 0, 1); MD.dissolve(doorWin, 0, 1);
  });

  if (!REDUCED && 'IntersectionObserver' in window) { MD.hide(phoneWin); MD.hide(doorWin); }
  select(0);
  paint();
});
})();
