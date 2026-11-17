/* marcus.gg — Fig. 1, a spinning top in a dish, and the 404's ring-out.
   One orthographic camera 28° above the dish, ray-cast per cell, lit like the sphere and reduced
   to one bit. The physics is a small model tuned by hand to behave like a real top, not a rigid-body
   integration: spin decays, a fast top rises and sleeps, precession quickens as it slows, and the
   tip rolls and dots its path on the dish. New events hold for whole drawings, action on twos
   (1/12 s) and the quieter dissolves on threes (1/8 s); the simulation underneath runs every step. */
(() => {
'use strict';
const MD = window.MD;
if (!MD) return;
const { REDUCED, INK32, B4, B8, clamp, lerp, rng, lit, rim, globe } = MD;

const TWOS = 1000 / 12, THREES = 125;
const TAU = Math.PI * 2, DT = 1 / 120;
const DROP = 0.25, SCRAPE = 0.25, CHATTER = 1.0;
const rpm2w = r => (r * TAU) / 60, w2rpm = w => (w * 60) / TAU;

/* ---------- the physics: one 1/120 s step, verbatim from the spec ---------- */

// returns 'ring-out' | 'knock' | 'scrape' | null
function step(s) {
  const dt = 1 / 120;
  s.w -= (4 + 0.06 * s.w) * dt;                                  // spin decays
  if (s.w > 80) s.th -= 1.0 * (s.th - 0.004) * dt;                // fast: it rises and sleeps
  else s.th += 1.85 * ((80 - s.w) / 80) * (s.th + 0.02) * dt;    // slow: it falls away
  s.ph += (218 / Math.max(s.w, 5)) * dt;                         // precession quickens as it dies
  const roll = 0.04 * s.w * Math.sin(s.th);                      // the tip rolls, square to its lean
  s.vx += (-27 * s.x - 0.6 * s.vx) * dt;                         // the dish pulls to the centre (27/s² is
  s.vz += (-27 * s.z - 0.6 * s.vz) * dt;                         // true for a dish 40 cm across, 5.6 cm deep)
  s.x += (s.vx - Math.sin(s.ph) * roll) * dt;
  s.z += (s.vz + Math.cos(s.ph) * roll) * dt;
  s.t += dt;
  const r = Math.hypot(s.x, s.z);
  if (r > 0.96) {
    const nx = s.x / r, nz = s.z / r, vr = s.vx * nx + s.vz * nz;
    if (vr > 0.9) return 'ring-out';
    if (vr > 0) { s.vx -= 1.5 * vr * nx; s.vz -= 1.5 * vr * nz; s.x = nx * 0.96; s.z = nz * 0.96; s.w *= 0.94; return 'knock'; }
  }
  if (s.th > 0.55 || s.w <= 1) return 'scrape';                  // the ring's edge meets the dish
  return null;
}

// 32-bit FNV-1a, to seed the 404 from its address
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const DEMO = Object.freeze({ rpm: 2600, th: 0.04, p: [-0.5, -0.1], v: [0, 2.2], ph: 0 });
const fresh = L => ({ w: rpm2w(L.rpm), th: L.th, ph: L.ph || 0, x: L.p[0], z: L.p[1], vx: L.v[0], vz: L.v[1], t: 0 });
// the compass the 404 reports from: 0° is the far side of the dish, clockwise seen from above
const bearing = (x, z) => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;

// run a launch to its end. Times are from the moment the cord clears, so they include the drop;
// a sleep-out also includes the scrape and the chatter
function simulate(L) {
  const s = fresh(L), trace = [s.x, s.z];
  let asleepFrom = null, wobbleFrom = null;
  for (let i = 1; i <= 120 * 90; i++) {
    const e = step(s);
    if (i % 2 === 0) trace.push(s.x, s.z);
    if (asleepFrom === null && s.th < 0.01 && s.w > 80) asleepFrom = s.t + DROP;
    if (wobbleFrom === null && s.w <= 80) wobbleFrom = s.t + DROP;
    if (e === 'ring-out' || e === 'scrape') {
      trace.push(s.x, s.z);
      const out = e === 'ring-out' ? 'ring-out' : 'sleep-out';
      return {
        outcome: out, t: s.t + DROP + (out === 'sleep-out' ? SCRAPE + CHATTER : 0),
        asleepFrom, wobbleFrom, end: [s.x, s.z], ph: s.ph, bearing: bearing(s.x, s.z), trace: new Float32Array(trace),
      };
    }
  }
  return { outcome: 'sleep-out', t: 90, asleepFrom, wobbleFrom, end: [s.x, s.z], ph: s.ph, bearing: 0, trace: new Float32Array(trace) };
}

// a pull: s in canvas widths per second over the last 60 ms; w the largest vertical departure ÷ canvas
// width; sigma +1 if that departure was downward (toward you)
function fromPull(s, w, sigma) {
  const rpm = Math.round(clamp(600 + 600 * s, 600, 4800) / 10) * 10;
  const we = clamp(w - 0.03, 0, 0.25);
  const th = 0.04 + 1.2 * we;
  const v = Math.min(9, (50 * we * rpm) / 4800);
  const n = Math.hypot(0.5, sigma), d = [0.5 / n, sigma / n];
  return { rpm, th, p: [-0.5, -0.1], v: [v * d[0], 2.2 + v * d[1]], ph: v > 0 ? Math.atan2(-d[0], d[1]) : 0 };
}
function tapLaunch(n) {
  const r = rng(n + 1);
  const a = ((-20 + 40 * r()) * Math.PI) / 180, rpm = 2200 + 100 * Math.floor(13 * r());
  return { rpm, th: DEMO.th, p: DEMO.p.slice(), v: [-2.2 * Math.sin(a), 2.2 * Math.cos(a)], ph: 0 };
}
function holdLaunch(teeth) {
  return { rpm: Math.round(600 + (4200 * teeth) / 24), th: DEMO.th, p: DEMO.p.slice(), v: DEMO.v.slice(), ph: 0 };
}
function nfLaunch(path) {
  const beta = TAU * rng(fnv1a(path))(), d = [Math.sin(beta), -Math.cos(beta)];
  return { rpm: 4200, th: 0.1, p: [-0.8 * d[0], -0.8 * d[1]], v: [3.6 * d[0], 3.6 * d[1]], ph: Math.atan2(-d[0], d[1]) };
}

/* ---------- the camera ---------- */

const EL = (28 * Math.PI) / 180, cE = Math.cos(EL), sE = Math.sin(EL);
const DY = -sE, DZ = -cE;                         // the ray's direction (x is constant along it)
const KB = 0.28;                                  // the bowl: y = 0.28·r², rim radius 1
const LIGHT = [-0.55, -0.45, 0.8], BOOT_LIGHT = [0.9, -0.2, -0.55];
const SEAT_Y = 0.92;                              // the seated top's tip, hanging under the launcher

/* ---------- the top: a body of revolution, modelled on no toy ---------- */

// heights (h) along the axis from the tip; radii (ρ) from the axis
const TIP_H = 0.06, TIP_K = 0.83;
const GEAR_R = 0.07, GEAR_H0 = 0.06, GEAR_H1 = 0.11;
const FLY_R = 0.20, FLY_H0 = 0.11, FLY_H1 = 0.135;
const RING_C = 0.17, RING_B = 0.055, RING_A = 0.26, RING_AE = 0.325;   // base and lobe-envelope semi-axes
const CAP_C = 0.19, CAP_R = 0.10, CAP_H0 = 0.2;
const lobe = a => { const c = Math.cos(3 * a); return c > 0 ? c * c * c * c : 0; };

/* ---------- a figure: the renderer, the choreography and the input ---------- */

function figure(canvas) {
  const mode = canvas.dataset.top === 'ringout' ? 'ringout' : 'hero';
  const stage = canvas.parentElement;
  const fig = canvas.closest('figure');
  const cap = fig && fig.querySelector('[data-top-cap]');
  const live = stage.querySelector('[aria-live]');
  const g = canvas.getContext('2d');
  const off = document.createElement('canvas');
  const og = off.getContext('2d');
  const HERO = mode === 'hero';

  /* --- sizing: N×N cells, scaled up with smoothing off, as the sphere was --- */
  let S = 0, dpr = 0, cell = 2, baseCell = 2, N = 0, R = 0, img = null, buf = null;
  let I = null, force = null, top1 = null, partMap = null;   // intensities, forced ink (1) / paper (2), which top and part own each cell
  let surf = null, hx = null, hz = null, hy = null, nrm = null, ridge = null, dishLit = null;
  function setCell(c) {
    cell = c;
    if (!S) return;
    N = Math.max(24, Math.floor(S / c));
    R = 0.45 * N;
    off.width = N; off.height = N;
    img = og.createImageData(N, N);
    buf = new Uint32Array(img.data.buffer);
    I = new Float32Array(N * N); force = new Uint8Array(N * N); top1 = new Uint8Array(N * N); partMap = new Uint8Array(N * N);
    buildDish();
    restamp();
  }
  function size() {
    const w = canvas.clientWidth, d = Math.min(window.devicePixelRatio || 1, 2);
    if (w === S && d === dpr && N) return false;
    S = w; dpr = d;
    if (!S) return false;
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(S * dpr);
    setCell(cell);
    return true;
  }
  const colOf = x => 0.5 * N + R * x;
  const rowOf = (y, z) => 0.691 * N + R * (z * sE - y * cE);

  /* --- the dish, cached per cell size: which surface each cell sees, where, and its normal --- */
  // surfaces: 0 nothing, 1 bowl, 2 lip, 3 outer wall, 4 table
  function buildDish() {
    const n2 = N * N;
    surf = new Uint8Array(n2); hx = new Float32Array(n2); hy = new Float32Array(n2); hz = new Float32Array(n2);
    nrm = new Float32Array(n2 * 3); ridge = new Uint8Array(n2); dishLit = new Float32Array(n2);
    const A = KB * cE * cE;
    for (let j = 0, i = 0; j < N; j++) {
      const v = (j + 0.5 - 0.691 * N) / R;
      for (let c = 0; c < N; c++, i++) {
        const u = (c + 0.5 - 0.5 * N) / R;
        let best = Infinity, kind = 0, X = u, Y = 0, Z = 0;
        // the bowl: k(u² + z(t)²) − y(t) = 0
        const B = sE - 2 * KB * v * sE * cE, C = KB * (u * u + v * v * sE * sE) + v * cE, D = B * B - 4 * A * C;
        if (D >= 0) {
          const q = Math.sqrt(D);
          for (const t of [(-B - q) / (2 * A), (-B + q) / (2 * A)]) {
            const z = v * sE - t * cE;
            if (u * u + z * z <= 1 && t < best) { best = t; kind = 1; Y = -v * cE - t * sE; Z = z; }
          }
        }
        // the lip: y = 0.28, 1 ≤ r ≤ 1.06
        { const t = (-v * cE - KB) / sE, z = v * sE - t * cE, r2 = u * u + z * z;
          if (r2 >= 1 && r2 <= 1.06 * 1.06 && t < best) { best = t; kind = 2; Y = KB; Z = z; } }
        // the outer wall: r = 1.06, 0 ≤ y ≤ 0.28, the near side only
        if (Math.abs(u) <= 1.06) {
          const z = Math.sqrt(1.06 * 1.06 - u * u), t = (v * sE - z) / cE, y = -v * cE - t * sE;
          if (y >= 0 && y <= KB && t < best) { best = t; kind = 3; Y = y; Z = z; }
        }
        // the table: y = 0 beyond the wall
        if (!kind) { const z = v / sE; if (u * u + z * z > 1.06 * 1.06) { kind = 4; Y = 0; Z = z; } }
        surf[i] = kind; hx[i] = X; hy[i] = Y; hz[i] = Z;
        if (kind === 1) {
          const nx = -2 * KB * X, nz = -2 * KB * Z, l = Math.hypot(nx, 1, nz);
          nrm[i * 3] = nx / l; nrm[i * 3 + 1] = 1 / l; nrm[i * 3 + 2] = nz / l;
          const r8 = 8 * Math.hypot(X, Z), k = Math.round(r8);
          ridge[i] = k >= 1 && k <= 7 && Math.abs(r8 - k) < 0.03 ? 1 : 0;
        } else if (kind === 2) { nrm[i * 3 + 1] = 1; }
        else if (kind === 3) { nrm[i * 3] = X / 1.06; nrm[i * 3 + 2] = Z / 1.06; }
      }
    }
  }

  /* --- the light: screen-space, as the sphere's, turned into the world --- */
  const lightS = HERO ? BOOT_LIGHT.slice() : LIGHT.slice();
  const L = [0, 0, 0], Hh = [0, 0, 0];
  function worldLight() {
    const lx = lightS[0], ly = lightS[1], lz = lightS[2];
    let x = lx, y = -ly * cE + lz * sE, z = ly * sE + lz * cE;
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    L[0] = x; L[1] = y; L[2] = z;
    let a = x, b = y + sE, c = z + cE; const m = Math.hypot(a, b, c) || 1;
    Hh[0] = a / m; Hh[1] = b / m; Hh[2] = c / m;
  }
  const shade = (nx, ny, nz, k) => lit(nx, ny, nz, L[0], L[1], L[2], Hh[0], Hh[1], Hh[2], k);
  const rimOf = (nx, ny, nz) => rim(Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), ny * sE + nz * cE);

  function drawDish(topShadow) {
    const n2 = N * N;
    // the bowl's shadow on the table: shadeOrb's floor formula
    const bsx = -0.18 * L[0], bsz = -0.18 * L[2];
    for (let i = 0; i < n2; i++) {
      const k = surf[i];
      let v = 1;
      if (k === 4 || k === 0) {
        if (k === 4) { const ex = (hx[i] - bsx) / 1.18, ez = (hz[i] - bsz) / 1.18, e2 = ex * ex + ez * ez; if (e2 < 1) v = 0.52 + 0.48 * e2; }
      } else {
        const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
        // the dish is pale plastic: its light sits in the upper part of the tone range, so the top reads against it
        const l = shade(nx, ny, nz, 36);
        v = k === 3 ? 0.62 + 0.4 * l : 0.68 + 0.45 * l;
        if (ridge[i]) v *= 0.38;
        if (k === 1 && topShadow) {
          const ex = (hx[i] - topShadow[0]) / 0.27, ez = (hz[i] - topShadow[1]) / 0.27, e2 = ex * ex + ez * ez;
          if (e2 < 1) v *= 0.55 + 0.45 * e2;
        }
      }
      I[i] = v; force[i] = 0; top1[i] = 0;
    }
    // ink where one surface meets another: the rim, the lip and the foot of the wall
    for (let j = 0, i = 0; j < N; j++) for (let c = 0; c < N; c++, i++) {
      const k = surf[i];
      if (!k) continue;
      const r = c < N - 1 ? surf[i + 1] : k, d = j < N - 1 ? surf[i + N] : k;
      if (r !== k && (k !== 4 || r !== 0)) force[(k === 4 ? i + 1 : i)] = 1;
      if (d !== k && (k !== 4 || d !== 0)) force[(k === 4 ? i + N : i)] = 1;
    }
  }

  /* --- the top: one 3×3 frame per drawing, analytic hits per cell inside its bounds --- */
  const F = new Float64Array(9);
  function frameOf(th, ph) {
    const ax = Math.sin(th) * Math.cos(ph), ay = Math.cos(th), az = Math.sin(th) * Math.sin(ph);
    // e1 = normalise(a × ẑ), e2 = e1 × a
    let ex = ay, ey = -ax, ez = 0;
    const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    const fx = ey * az - ez * ay, fy = ez * ax - ex * az, fz = ex * ay - ey * ax;
    F[0] = ex; F[1] = ey; F[2] = ez; F[3] = ax; F[4] = ay; F[5] = az; F[6] = fx; F[7] = fy; F[8] = fz;
  }
  // a top in the scene: tip at (x, y, z), lean th towards ph, spin phase psi, spin w (rad/s), mask level 0–16
  function drawTop(T) {
    frameOf(T.th, T.ph);
    const ax = F[3], ay = F[4], az = F[5];
    // bounds: a sphere of radius 0.35 about tip + 0.15·a
    const bx = T.x + 0.15 * ax, by = T.y + 0.15 * ay, bz = T.z + 0.15 * az;
    const pc = colOf(bx), pr = rowOf(by, bz), pad = 0.35 * R + 2;
    const c0 = Math.max(0, Math.floor(pc - pad)), c1 = Math.min(N - 1, Math.ceil(pc + pad));
    const r0 = Math.max(0, Math.floor(pr - pad)), r1 = Math.min(N - 1, Math.ceil(pr + pad));
    T.box = [c0, r0, c1, r1];
    if (c1 < c0 || r1 < r0) return;
    capCells.length = 0;
    // the ray's direction in the top's frame (the same for every cell)
    const dx = F[0] * 0 + F[1] * DY + F[2] * DZ, dy = F[3] * 0 + F[4] * DY + F[5] * DZ, dz = F[6] * 0 + F[7] * DY + F[8] * DZ;
    // motion blur at a fixed 1/60 s exposure
    const sig = T.w / 60;
    const b3 = Math.min(1, (sig * 3) / TAU), b8 = Math.min(1, (sig * 8) / TAU), b12 = Math.min(1, (sig * 12) / TAU);
    const psi = T.psi, lvl = T.mask == null ? 16 : T.mask;
    for (let j = r0; j <= r1; j++) {
      const v = (j + 0.5 - 0.691 * N) / R;
      for (let c = c0; c <= c1; c++) {
        if (lvl < 16 && B4[(j & 3) * 4 + (c & 3)] >= lvl) continue;
        const u = (c + 0.5 - 0.5 * N) / R;
        // the ray's origin (t = 0) relative to the tip, in the top's frame
        const wx = u - T.x, wy = -v * cE - T.y, wz = v * sE - T.z;
        const ox = F[0] * wx + F[1] * wy + F[2] * wz, oy = F[3] * wx + F[4] * wy + F[5] * wz, oz = F[6] * wx + F[7] * wy + F[8] * wz;
        // nearest hit on the solid body (cap, base ring, flywheel, gear, tip)
        let tb = Infinity, part = 0;
        // cap sphere (above h 0.2)
        {
          const px = ox, py = oy - CAP_C, pz = oz;
          const b = px * dx + py * dy + pz * dz, cc = px * px + py * py + pz * pz - CAP_R * CAP_R, D = b * b - cc;
          if (D >= 0) { const t = -b - Math.sqrt(D); if (oy + t * dy >= CAP_H0 && t < tb) { tb = t; part = 5; } }
        }
        // base ring: spheroid with radial semi-axis 0.26
        let hit = sph(ox, oy, oz, dx, dy, dz, RING_A);
        if (hit < tb) { tb = hit; part = 4; }
        // flywheel and gear: cylinder sides
        hit = cyl(ox, oy, oz, dx, dy, dz, FLY_R, FLY_H0, FLY_H1);
        if (hit < tb) { tb = hit; part = 3; }
        hit = cyl(ox, oy, oz, dx, dy, dz, GEAR_R, GEAR_H0, GEAR_H1);
        if (hit < tb) { tb = hit; part = 2; }
        hit = cone(ox, oy, oz, dx, dy, dz);
        if (hit < tb) { tb = hit; part = 1; }
        // the lobed envelope (radial semi-axis 0.325)
        const te = sph(ox, oy, oz, dx, dy, dz, RING_AE);
        let cov = 0, Ie = 0;
        if (te < tb) {
          const x = ox + te * dx, y = oy + te * dy, z = oz + te * dz, rho = Math.hypot(x, z);
          const al = Math.atan2(z, x) - psi;
          if (rho <= RING_A) cov = 1;
          else {
            const q = (rho / RING_A - 1) / 0.25;
            const c0b = lobe(al) >= q ? 1 : 0, cbar = Math.acos(Math.pow(Math.min(1, q), 0.25)) / Math.PI;
            cov = lerp(c0b, cbar, b3);
          }
          if (cov > 0) Ie = ringShade(x, y, z, rho, al, RING_AE, b3, b12);
        }
        if (!part && cov <= 0) continue;
        let Ib = 0;
        if (part) {
          const t = tb, x = ox + t * dx, y = oy + t * dy, z = oz + t * dz;
          Ib = partShade(part, x, y, z, psi, b8, b3, b12, T.capOut);
        }
        const i = j * N + c;
        const behind = part ? Ib : I[i];
        I[i] = cov > 0 ? cov * Ie + (1 - cov) * behind : Ib;
        force[i] = 0;
        if (part || cov > 0.5) { top1[i] = T.id; partMap[i] = cov > 0.5 || part === 4 ? 4 : part; }
        if (part === 5 && T.capOut && cov <= 0) capCells.push(i);
      }
    }
  }
  // the cel line: one cell of ink where a top's own cells meet anything else
  function outlineTop(T) {
    if (!T.box) return;
    const [c0, r0, c1, r1] = T.box, id = T.id;
    for (let j = r0; j <= r1; j++) for (let c = c0; c <= c1; c++) {
      const i = j * N + c;
      if (top1[i] !== id) continue;
      if (c === 0 || c === N - 1 || j === 0 || j === N - 1 || top1[i - 1] !== id || top1[i + 1] !== id || top1[i - N] !== id || top1[i + N] !== id) { force[i] = 1; continue; }
      // and where one part meets another: the cap's dome, the flywheel's band, the gear
      const pm = partMap[i];
      if ((partMap[i + 1] !== pm && pm > partMap[i + 1]) || (partMap[i + N] !== pm && pm > partMap[i + N]) ||
          (partMap[i - 1] !== pm && pm > partMap[i - 1]) || (partMap[i - N] !== pm && pm > partMap[i - N])) force[i] = 1;
    }
  }
  // the sphere is out: the cap shows as paper inside a one-cell ink outline
  const capCells = [];
  function outlineCap() {
    if (!capCells.length) return;
    const set = new Set(capCells);
    for (const i of capCells) { force[i] = 2; if (!set.has(i - 1) || !set.has(i + 1) || !set.has(i - N) || !set.has(i + N)) force[i] = 1; }
    capCells.length = 0;
  }
  // spheroid about h = 0.17 with radial semi-axis a: nearest t, or Infinity
  function sph(ox, oy, oz, dx, dy, dz, a) {
    const X = ox / a, Y = (oy - RING_C) / RING_B, Z = oz / a, ex = dx / a, ey = dy / RING_B, ez = dz / a;
    const A = ex * ex + ey * ey + ez * ez, b = X * ex + Y * ey + Z * ez, C = X * X + Y * Y + Z * Z - 1, D = b * b - A * C;
    return D < 0 ? Infinity : (-b - Math.sqrt(D)) / A;
  }
  function cyl(ox, oy, oz, dx, dy, dz, r, h0, h1) {
    const A = dx * dx + dz * dz, b = ox * dx + oz * dz, C = ox * ox + oz * oz - r * r, D = b * b - A * C;
    if (D < 0 || A < 1e-9) return Infinity;
    const t = (-b - Math.sqrt(D)) / A, h = oy + t * dy;
    return h >= h0 && h <= h1 ? t : Infinity;
  }
  function cone(ox, oy, oz, dx, dy, dz) {
    const k2 = TIP_K * TIP_K;
    const A = dx * dx + dz * dz - k2 * dy * dy, b = ox * dx + oz * dz - k2 * oy * dy, C = ox * ox + oz * oz - k2 * oy * oy;
    const D = b * b - A * C;
    if (D < 0 || Math.abs(A) < 1e-9) return Infinity;
    const q = Math.sqrt(D);
    let best = Infinity;
    for (const t of [(-b - q) / A, (-b + q) / A]) { const h = oy + t * dy; if (h >= 0 && h <= TIP_H && t < best) best = t; }
    return best;
  }
  // world normal from a local one
  function toWorld(nx, ny, nz) {
    const x = F[0] * nx + F[3] * ny + F[6] * nz, y = F[1] * nx + F[4] * ny + F[7] * nz, z = F[2] * nx + F[5] * ny + F[8] * nz;
    const l = Math.hypot(x, y, z) || 1;
    W[0] = x / l; W[1] = y / l; W[2] = z / l;
  }
  const W = [0, 0, 0];
  const pat = (on, duty, b) => lerp(on ? 1 : 0, duty, b);
  function ringShade(x, y, z, rho, al, a, b3, b12) {
    toWorld(x / (a * a), (y - RING_C) / (RING_B * RING_B), z / (a * a));
    let v = 0.25 + 0.85 * shade(W[0], W[1], W[2], 36);
    if (y > RING_C) {
      // twelve ribs and three sectors centred on the lobes: they blur into tone at speed
      let f = ((al / TAU) * 12) % 1; if (f < 0) f += 1;
      v *= 1 - (1 - 0.38) * pat(f < 0.16, 0.16, b12);
      let g3 = ((al / TAU) * 3 + 0.25) % 1; if (g3 < 0) g3 += 1;
      v *= 1 - (1 - 0.72) * pat(g3 < 0.5, 0.5, b3);
    }
    return v + rimOf(W[0], W[1], W[2]);
  }
  function partShade(part, x, y, z, psi, b8, b3, b12, capOut) {
    let v;
    if (part === 5) {
      if (capOut) return 1;                               // the sphere is out: the cap shows empty
      toWorld(x, y - CAP_C, z);
      v = shade(W[0], W[1], W[2], 36);
    } else if (part === 4) {
      return ringShade(x, y, z, Math.hypot(x, z), Math.atan2(z, x) - psi, RING_A, b3, b12);
    } else if (part === 3) {
      toWorld(x, 0, z);
      v = -0.1 + 1.15 * shade(W[0], W[1], W[2], 120);      // steel: hard contrast and the one metallic glint
    } else if (part === 2) {
      toWorld(x, 0, z);
      v = 0.05 + 0.6 * shade(W[0], W[1], W[2], 36);
      let f = (((Math.atan2(z, x) - psi) / TAU) * 8) % 1; if (f < 0) f += 1;
      v *= 1 - (1 - 0.4) * pat(f < 0.25, 0.25, b8);
    } else {
      const rho = Math.hypot(x, z) || 1;
      toWorld(x / rho, -TIP_K, z / rho);
      v = 0.05 + 0.6 * shade(W[0], W[1], W[2], 36);
    }
    return v + rimOf(W[0], W[1], W[2]);
  }

  /* --- line work into the forced layer --- */
  function put(c, j, val) { if (c >= 0 && c < N && j >= 0 && j < N) force[j * N + c] = val; }
  function line(x0, y0, x1, y1, val) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, guard = 4 * N;
    for (;;) { put(x0, y0, val); if ((x0 === x1 && y0 === y1) || !guard--) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  function cross(cx, cy) { for (let k = -2; k <= 2; k++) { put(Math.round(cx) + k, Math.round(cy) + k, 1); put(Math.round(cx) + k, Math.round(cy) - k, 1); } }
  // concentration lines: from the border toward a point, stopping short of it
  function rays(px, py, count, seed) {
    const r = rng(seed);
    for (let k = 0; k < count; k++) {
      const a = ((k + (r() - 0.5) * 0.6) / count) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const far = 1.5 * N, stop = (0.22 + 0.12 * r()) * N;
      let ex = px + ca * far, ey = py + sa * far;
      // clip the outer end to the canvas
      const tx = ca > 0 ? (N - 1 - px) / ca : ca < 0 ? -px / ca : Infinity, ty = sa > 0 ? (N - 1 - py) / sa : sa < 0 ? -py / sa : Infinity;
      const tm = Math.min(tx, ty);
      if (tm <= stop) continue;
      ex = px + ca * tm; ey = py + sa * tm;
      line(ex, ey, px + ca * stop, py + sa * stop, 1);
    }
  }

  /* --- the launcher, flat 1-bit, in fractions of N --- */
  const TEETH = 24;
  const launcher = { teeth: 0, pinion: 0, gone: 0, mask: 16, hover: false, focus: false };
  function gripX(teeth) { return (0.46 + (0.5 * Math.floor(teeth)) / TEETH) * N; }
  function drawLauncher() {
    if (!HERO) return;
    const n = N, lvl = launcher.mask;
    const vis = (c, j) => lvl >= 16 || B4[(j & 3) * 4 + (c & 3)] < lvl;
    // housing
    const x0 = Math.round(0.12 * n), x1 = Math.round(0.40 * n), y0 = Math.round(0.07 * n), y1 = Math.round(0.15 * n);
    for (let j = y0; j <= y1; j++) for (let c = x0; c <= x1; c++) { const i = j * n + c; I[i] = 0.75; force[i] = (j === y0 || j === y1 || c === x0 || c === x1) ? 1 : 0; }
    // pinion with eight teeth, turning 15° per tooth cleared
    const pcx = 0.36 * n, pcy = 0.11 * n, pr = Math.max(2, 0.03 * n);
    for (let k = 0; k < 64; k++) { const a = (k / 64) * TAU; put(Math.round(pcx + Math.cos(a) * pr), Math.round(pcy + Math.sin(a) * pr), 1); }
    for (let k = 0; k < 8; k++) { const a = launcher.pinion + (k / 8) * TAU; put(Math.round(pcx + Math.cos(a) * (pr + 1)), Math.round(pcy + Math.sin(a) * (pr + 1)), 1); }
    // the cord: a line out of the housing to the grip, with tooth stubs counted back from the grip
    if (launcher.gone >= 1 || lvl <= 0) return;
    const shift = launcher.gone * 0.6 * n;
    const gx = gripX(launcher.teeth) + shift, cy = Math.round(0.11 * n), step = (0.5 * n) / TEETH;
    for (let c = x1 + 1; c <= Math.min(n - 1, Math.round(gx)); c++) if (vis(c, cy)) put(c, cy, 1);
    for (let k = 1; k < 64; k++) { const c = Math.round(gx - k * step); if (c <= x1) break; if (c < n && vis(c, cy + 1)) { put(c, cy + 1, 1); put(c, cy + 2, 1); } }
    // the grip: a bar two cells wide; hovered or focused, inverted inside an ink box
    const gy0 = Math.round(0.065 * n), gy1 = Math.round(0.155 * n), gc = Math.round(gx);
    if (launcher.hover || launcher.focus) {
      const bx0 = Math.round(gx - 0.025 * n), bx1 = Math.round(gx + 0.025 * n);
      for (let j = gy0 - 1; j <= gy1 + 1; j++) for (let c = bx0; c <= bx1; c++) put(c, j, 1);
      for (let j = gy0; j <= gy1; j++) { put(gc, j, 2); put(gc + 1, j, 2); }
    } else for (let j = gy0; j <= gy1; j++) { if (vis(gc, j)) { put(gc, j, 1); put(gc + 1, j, 1); } }
  }

  /* --- the trace: a dot every two cells of path, on the dish's surface --- */
  let trace = new Float32Array(7200), tn = 0;           // x, z pairs
  let stamps = [], carry = 0, lastStamp = null;
  function cellOfDish(x, z) { const r2 = x * x + z * z; return [colOf(x), rowOf(KB * Math.min(1, r2), z)]; }
  function stampFrom(k) {
    for (let p = Math.max(1, k); p < tn; p++) {
      const a = cellOfDish(trace[(p - 1) * 2], trace[(p - 1) * 2 + 1]), b = cellOfDish(trace[p * 2], trace[p * 2 + 1]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = 2 - carry;
      while (d <= len) { const f = d / len; stamps.push(Math.floor(a[0] + (b[0] - a[0]) * f), Math.floor(a[1] + (b[1] - a[1]) * f)); d += 2; }
      carry = len - (d - 2);
    }
    lastStamp = tn;
  }
  function restamp() { stamps = []; carry = 0; if (tn) { stamps.push(Math.floor(cellOfDish(trace[0], trace[1])[0]), Math.floor(cellOfDish(trace[0], trace[1])[1])); stampFrom(1); } }
  function addTrace(x, z) {
    if (tn * 2 + 2 > trace.length) { const t2 = new Float32Array(trace.length * 2); t2.set(trace); trace = t2; }
    trace[tn * 2] = x; trace[tn * 2 + 1] = z; tn++;
    if (tn === 1) { const a = cellOfDish(x, z); stamps.push(Math.floor(a[0]), Math.floor(a[1])); lastStamp = 1; }
    else if (N) stampFrom(lastStamp);
  }
  function setTrace(arr) { tn = 0; stamps = []; carry = 0; lastStamp = null; for (let k = 0; k < arr.length; k += 2) addTrace(arr[k], arr[k + 1]); }
  function clearTrace() { tn = 0; stamps = []; carry = 0; lastStamp = null; }
  function drawTrace() { for (let k = 0; k < stamps.length; k += 2) { const c = stamps[k], j = stamps[k + 1]; if (c >= 0 && c < N && j >= 0 && j < N && surf[j * N + c] === 1) force[j * N + c] = 1; } }

  /* --- the run: physics state and choreography --- */
  const ID_LIVE = 1, ID_SEAT = 2;
  let s = null;                  // physics state while a top is in the dish
  // phases: boot, armed, count, selfpull, drop, run, scrape, chatter, impact, exit, held, pickup, rearm, done
  let phase = 'boot', pt = 0;    // and the visible time it began
  let vt = 0, acc = 0, steps = 0, psi = 0, seatW = 0;
  let launchL = null, launchN = 0, outcome = null, endMark = null, oldMask = -1, rearmIn = false;
  let fx = [];                   // line bursts and sparks: { kind, at, x, y, n, seed, a }
  let pullBy = 'self', riseDone = false, pickedAt = null;
  let holdTh = 0, holdPh = 0, chatterPh = 0, topY = 0;
  let exitDir = null, exitAt = 0, pullAgainAt = -1;
  let invert = false, invertAt = 0, riseState = null, liveBox = null;
  const nowRecord = () => ({ v: 1, launch: launchL, n: launchN, up: pickedAt, rise: riseDone });

  function seatedTop() { return { id: ID_SEAT, x: -0.5, y: SEAT_Y, z: -0.1, th: 0, ph: 0, psi: 0, w: seatW, mask: launcher.mask }; }
  // is the live top in the dish (or falling into it) this drawing?
  const topPresent = () => !!s && (phase === 'drop' || phase === 'run' || phase === 'scrape' || phase === 'chatter' ||
    (phase === 'held' && outcome === 'sleep-out') || (phase === 'pickup' && oldMask > 0) || (phase === 'rearm' && oldMask > 0));
  function liveTop() {
    let th = holdTh, ph = holdPh, w = 0;
    if (phase === 'run' || phase === 'drop') {
      const nut = Math.min(0.06, 0.004 * Math.pow(80 / Math.max(s.w, 1), 2)), nu = Math.min(6, s.w / 40);
      th = phase === 'run' ? s.th + nut * Math.sin(TAU * nu * s.t) : s.th; ph = s.ph; w = s.w;
    }
    return { id: ID_LIVE, x: s.x, y: phase === 'drop' ? topY : KB * (s.x * s.x + s.z * s.z), z: s.z, th, ph, psi, w, mask: oldMask >= 0 ? oldMask : 16 };
  }

  /* --- caption and announcements --- */
  let capText = '', capShown = null, capAt = -1e9;
  const fmt = n => Math.round(n).toLocaleString('en-GB');
  const secs = t => (Math.round(t * 10) / 10).toFixed(1);
  function caption(t, now) { capText = t; if (now || vt - capAt >= 120) flushCap(); }
  function flushCap() { if (cap && capShown !== capText) { cap.textContent = capText; capShown = capText; } capAt = vt; }
  function announce(text) { if (!live) return; live.textContent = ''; setTimeout(() => { live.textContent = text; }, 60); }
  const endText = (o, t) => (o === 'sleep-out' ? 'sleep-out · ' : o === 'ring-out' ? 'ring-out · ' : 'picked up · ') + secs(t) + ' s';
  const endSpoken = (o, t) => (o === 'sleep-out' ? 'Sleep-out after ' : o === 'ring-out' ? 'Ring-out after ' : 'Picked up after ') + secs(t) + ' seconds.';
  const nfText = deg => 'ring-out at ' + String(Math.round(deg) % 360).padStart(3, '0') + '°';

  /* --- storage: one key, per tab; in memory when storage is blocked --- */
  const KEY = 'mg.fig1';
  let memo = null;
  function load() { try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (v && v.v === 1) return v; } catch (e) { /* blocked */ } return memo; }
  function save(rec) { memo = rec; try { sessionStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* kept in memory */ } }

  /* ---------- drawing a frame ---------- */

  const times = [];
  let stepped = 0;   // 0: never stepped, 1: stepped up, 2: stepped back (never again)
  function render() {
    if (!N) return;
    const t0 = performance.now();
    worldLight();
    const present = topPresent();
    drawDish(present && !(phase === 'drop' && topY > 0.5) ? [s.x - 0.12 * L[0], s.z - 0.12 * L[2]] : null);
    drawTrace();
    if (endMark && !present) cross(endMark[0], endMark[1]);
    liveBox = null;
    if (present) { const T = liveTop(); T.capOut = !!(riseState && riseState.capOut); drawTop(T); outlineTop(T); outlineCap(); liveBox = T.box; }
    if (phase === 'exit' && exitDir) drawExit();
    if (HERO && launcher.mask > 0 && (phase === 'boot' || phase === 'armed' || phase === 'count' || phase === 'selfpull' || phase === 'rearm')) { const T = seatedTop(); drawTop(T); if (T.mask >= 16) outlineTop(T); }
    drawLauncher();
    if (riseState) drawRise();
    for (const e of fx) drawFx(e);
    for (let j = 0, i = 0; j < N; j++) {
      const row = (j & 7) << 3;
      for (let c = 0; c < N; c++, i++) {
        let ink = force[i] === 1 ? true : force[i] === 2 ? false : I[i] < (B8[row + (c & 7)] + 0.5) / 64;
        if (invert) ink = !ink;
        buf[i] = ink ? INK32 : 0;
      }
    }
    og.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = false;
    const side = Math.round(N * cell * dpr), o = Math.round((canvas.width - side) / 2);
    g.drawImage(off, o, o, side, side);
    placeCord();
    // a slow machine steps up a cell size (2 → 3 → 4), and may step back once
    if (bootK >= BOOT.length) {
      times.push(performance.now() - t0);
      if (stepped < 2 && times.length >= (stepped === 1 ? 60 : 30)) {
        const m = times.slice().sort((x, y) => x - y)[times.length >> 1];
        if (m > 10 && baseCell < 4) { baseCell++; stepped = 1; setCell(baseCell); }
        else if (stepped === 1 && m < 4) { baseCell--; stepped = 2; setCell(baseCell); }
        times.length = 0;
      }
      if (times.length > 60) times.shift();
    }
  }

  function drawFx(e) {
    const k = Math.floor((vt - e.at) / TWOS);
    if (k < 0) return;
    if (e.kind === 'lines') { if (k < 3) rays(e.x, e.y, e.n, e.seed + k * 7919); }
    else if (e.kind === 'sparks' && k < 4) {
      const r = rng(e.seed);
      for (let m = 0; m < 5; m++) {
        const a = e.a + ((r() - 0.5) * 100 * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), d0 = 2 + 4 * k;
        line(e.x + ca * d0, e.y + sa * d0, e.x + ca * (d0 + 3), e.y + sa * (d0 + 3), 1);
      }
    }
  }
  // the exit: six drawings over the lip and away, leaning outward
  function drawExit() {
    const k = Math.floor((vt - exitAt) / TWOS) + 1;
    if (k >= 6) return;
    const x = exitDir[0] * (0.96 + 0.18 * k), z = exitDir[1] * (0.96 + 0.18 * k), y = 0.28 + 0.25 * k - 0.06 * k * k;
    const T = { id: ID_LIVE, x, y, z, th: 0.3 + 0.12 * k, ph: Math.atan2(exitDir[1], exitDir[0]), psi, w: s ? s.w : 0, mask: 16 };
    drawTop(T); outlineTop(T);
  }

  /* ---------- the rise: the sphere comes out of the cap ---------- */

  function drawRise() {
    const st = riseState, k = Math.floor((vt - st.at) / TWOS);
    if (k >= 24) return;
    const T = st.capCell;
    // which cells take the rise's layers: 2 in (masks 8, 16), 18 at 16, 4 out (12, 8, 4, 0)
    const lvl = k < 2 ? (k + 1) * 8 : k < 20 ? 16 : [12, 8, 4, 0][k - 20];
    st.capOut = k >= 2 && k < 23;
    if (lvl <= 0) return;
    const up = clamp((k - 1) / 6, 0, 1);
    const fx0 = clamp(T[0], 0.28 * N, 0.72 * N);
    const sx = lerp(T[0], fx0, up), sy = lerp(T[1], 0.30 * N, up), rad = lerp(CAP_R * R, 0.22 * N, up);
    const rot = st.rot + (k >= 8 ? ((k - 8) * 7.5 * Math.PI) / 180 : 0);
    const ln = Math.hypot(lightS[0], lightS[1], lightS[2]) || 1;
    const lx = lightS[0] / ln, ly = lightS[1] / ln, lz = lightS[2] / ln;
    let a = lx, b = ly, c2 = lz + 1; const hn = Math.hypot(a, b, c2) || 1; a /= hn; b /= hn; c2 /= hn;
    const wide = Math.max(1, 1.4 / (0.0188 * rad));
    const w0 = CAP_R * R * 1.4, w1 = 0.16 * N, reach = lerp(T[1], -1, up);
    for (let j = 0, i = 0; j < N; j++) {
      const row = (j & 3) * 4;
      for (let c = 0; c < N; c++, i++) {
        if (B4[row + (c & 3)] >= lvl || top1[i] === ID_LIVE) continue;   // the top stays as it is
        if (k >= 2) {
          const dx = (c + 0.5 - sx) / rad, dy = (j + 0.5 - sy) / rad, r2 = dx * dx + dy * dy;
          if (r2 <= 1) {
            const nz = Math.sqrt(1 - r2), diff = Math.max(0, dx * lx + dy * ly + nz * lz);
            let v = lit(dx, dy, nz, lx, ly, lz, a, b, c2, 36);
            if (globe(dx, dy, nz, rot, wide)) v = diff > 0.18 ? v * 0.38 : 0.36;
            I[i] = v + rim(diff, nz); force[i] = 0;
            continue;
          }
          if (j <= T[1] && j >= reach) {
            const f = 1 - j / Math.max(1, T[1]), half = lerp(w0, w1, f) / 2, cx = lerp(T[0], fx0, f);
            if (Math.abs(c + 0.5 - cx) <= half) { I[i] = 1; force[i] = 2; continue; }
          }
        }
        force[i] = B4[row + (c & 3)] < 4 ? 1 : 2;     // a flat 25% tone
      }
    }
    if (k < 8) rays(T[0], T[1], 24, 31 * k + 7);
  }

  /* ---------- the choreography, on the visible clock ---------- */

  const toPhase = p => { phase = p; pt = vt; };
  const BOOT = REDUCED ? [] : [16, 11, 8, 6, 4, 3, 2];
  let bootK = BOOT.length ? 1 : 0;
  let demoPlanned = false, countAt = -1, countFor = 'demo', halfAt = -1;
  const DROP_HERO = [SEAT_Y, 0.80, 0.36], DROP_NF = [2.2, 1.98, 1.30];

  function startCount(forWhom) {
    countFor = forWhom; toPhase('count'); countAt = vt;
    if (cordBtn) cordBtn.setAttribute('aria-disabled', 'true');
  }
  function beginLaunch(Lr, by) {
    launchL = Lr; pullBy = by; launchN++;
    outcome = null; endMark = null; pickedAt = null; oldMask = -1; riseState = null; invert = false;
    clearTrace();
    s = fresh(Lr); acc = 0; steps = 0; psi = 0;
    addTrace(s.x, s.z);
    save(nowRecord());
    if (cordBtn) cordBtn.setAttribute('aria-disabled', 'false');
    if (REDUCED) { finishInstantly(Lr, by); return; }
    launcher.gone = 0; topY = HERO ? DROP_HERO[0] : DROP_NF[0];
    toPhase('drop');
    labels();
  }
  // reduced motion: the whole run at once, then its record
  function finishInstantly(Lr, by) {
    const res = simulate(Lr);
    setTrace(res.trace);
    outcome = res.outcome;
    endMark = outcome === 'ring-out' ? rimPoint(res.end) : dishCell(res.end[0], res.end[1]);
    s = null;
    caption(HERO ? endText(outcome, res.t) : nfText(res.bearing), true);
    if (HERO && by !== 'demo') announce(endSpoken(outcome, res.t));
    launcher.teeth = 0; launcher.gone = 0; launcher.mask = 16; seatW = 0;
    toPhase(HERO ? 'armed' : 'done');
    labels();
    draw();
  }
  const dishCell = (x, z) => [colOf(x), rowOf(KB * (x * x + z * z), z)];
  function rimPoint(end) { const r = Math.hypot(end[0], end[1]) || 1; return [colOf(end[0] / r), rowOf(KB, end[1] / r)]; }

  function update(dt) {
    vt += dt;
    // light: follows the cursor for 4 s after it moves, otherwise eases to rest
    const tgt = !REDUCED && pointerFresh() ? pointerLight() : LIGHT;
    const k = REDUCED ? 1 : 1 - Math.exp(-dt / 260);
    lightS[0] += (tgt[0] - lightS[0]) * k; lightS[1] += (tgt[1] - lightS[1]) * k; lightS[2] += (tgt[2] - lightS[2]) * k;
    // boot cascade: coarse to fine, as the sphere did
    if (bootK < BOOT.length && vt >= 380 + (bootK - 1) * 130) { setCell(Math.max(BOOT[bootK], baseCell)); bootK++; }
    if (inViewHalf && halfAt < 0) halfAt = vt;
    fx = fx.filter(e => vt - e.at < 6 * TWOS);
    if (invert && vt - invertAt >= TWOS) invert = false;
    if (!HERO) nfTick();
    switch (phase) {
      case 'boot':
        if (vt >= 1400) { toPhase(HERO ? 'armed' : phase); if (HERO) armedCaption(); }
        break;
      case 'armed':
        if (HERO && demoPlanned && halfAt >= 0 && vt >= Math.max(2500, halfAt + 600)) { demoPlanned = false; startCount('demo'); }
        if (pullAgainAt > 0 && vt >= pullAgainAt) { pullAgainAt = -1; armedCaption(true); }
        break;
      case 'count': {
        // 3, 2, 1, then one empty beat in which the cord pulls itself
        const n = Math.floor((vt - countAt) / 500);
        if (n < 3) caption(String(3 - n), true);
        else { caption('', true); toPhase('selfpull'); pullFrom = launcher.teeth; }
        break;
      }
      case 'selfpull': {
        const n = Math.min(3, Math.floor((vt - pt) / TWOS) + 1);
        setTeeth(Math.min(TEETH, pullFrom + n * 8));
        seatW = rpm2w(launchRpmFor(countFor) * (launcher.teeth / TEETH));
        if (vt - pt >= 3 * TWOS) beginLaunch(countFor === 'demo' ? { rpm: DEMO.rpm, th: DEMO.th, p: DEMO.p.slice(), v: DEMO.v.slice(), ph: 0 } : tapLaunch(launchN), countFor);
        break;
      }
      case 'drop': {
        const n = Math.floor((vt - pt) / TWOS);
        launcher.gone = Math.min(1, (n + 1) / 2);
        topY = (HERO ? DROP_HERO : DROP_NF)[Math.min(2, n)];
        if (vt - pt >= 3 * TWOS) { toPhase('run'); acc = 0; landed(); }
        break;
      }
      case 'run': runPhysics(dt); break;
      case 'scrape': {
        const f = clamp((vt - pt) / (SCRAPE * 1000), 0, 1);
        holdTh = 0.55 + 0.03 * f;
        if (f >= 1) { toPhase('chatter'); chatterPh = holdPh; }
        break;
      }
      case 'chatter': {
        // Euler's-disk chatter: the lean whirls faster and faster, then stops dead
        const f = clamp((vt - pt) / (CHATTER * 1000), 0, 1);
        chatterPh += (218 / 5) * (1 + 3 * f) * (dt / 1000);
        holdTh = 0.58; holdPh = chatterPh;
        if (f >= 1) endRun();
        break;
      }
      case 'impact':
        if (vt - pt >= TWOS) { toPhase('exit'); exitAt = vt; }
        break;
      case 'exit':
        if (vt - exitAt >= 6 * TWOS) {
          if (HERO) toPhase('held');
          else { toPhase('done'); caption(nfText(bearing(exitDir[0], exitDir[1])), true); s = null; }
        }
        break;
      case 'held':
        if (vt - pt >= (outcome === 'ring-out' ? 1000 : 1600)) startRearm(false);
        break;
      case 'pickup':
        oldMask = [12, 8, 4, 0][Math.min(3, Math.floor((vt - pt) / THREES))];
        if (vt - pt >= 4 * THREES) startRearm(true);
        break;
      case 'rearm': {
        // threes: the old top dissolves out (12, 8, 4, 0), then a fresh top and cord dissolve in (4, 8, 12, 16)
        const n = Math.floor((vt - pt) / THREES), outN = rearmIn ? 0 : 4;
        if (n < outN) oldMask = [12, 8, 4, 0][n];
        else { oldMask = 0; launcher.mask = [4, 8, 12, 16][Math.min(3, n - outN)]; launcher.teeth = 0; launcher.gone = 0; }
        if (n >= outN + 4) { oldMask = -1; s = null; toPhase('armed'); pullAgainAt = vt + 4000; labels(); armedCaption(); }
        break;
      }
      default: break;
    }
  }
  let pullFrom = 0;
  const launchRpmFor = who => (who === 'demo' ? DEMO.rpm : tapLaunch(launchN).rpm);
  function setTeeth(teeth) {
    if (teeth === launcher.teeth) return;
    launcher.pinion += ((teeth - launcher.teeth) * 15 * Math.PI) / 180;
    launcher.teeth = teeth;
  }
  function landed() {
    if (!HERO) return;
    const p = dishCell(s.x, s.z);
    fx.push({ kind: 'lines', at: vt, x: p[0], y: p[1], n: 16, seed: launchN * 977 + 1 });
  }
  function runPhysics(dt) {
    acc += dt / 1000;
    while (acc >= DT) {
      acc -= DT;
      const e = step(s);
      steps++;
      // every second step is one 1/60 s tick: the trace takes a point, the spin phase is sampled
      if (steps % 2 === 0) { addTrace(s.x, s.z); psi = (psi + s.w / 60) % TAU; }
      if (e === 'knock') {
        const p = dishCell(s.x, s.z);
        fx.push({ kind: 'lines', at: vt, x: p[0], y: p[1], n: 16, seed: launchN * 131 + steps });
      } else if (e === 'ring-out') { ringOut(); return; }
      else if (e === 'scrape') { addTrace(s.x, s.z); holdTh = 0.55; holdPh = s.ph; toPhase('scrape'); labels(); return; }
      // the rise: a hard launch's first asleep drawing, once per tab
      if (HERO && !riseDone && pullBy === 'visitor' && launchL.rpm >= 4200 && s.th < 0.01 && s.w > 80) startRise();
    }
    if (!HERO) return;
    const rpm = fmt(w2rpm(s.w));
    caption(s.th < 0.01 && s.w > 80 ? rpm + ' rpm · asleep' : rpm + ' rpm · tilt ' + String(Math.round((s.th * 180) / Math.PI)).padStart(2, '0') + '°');
  }
  function ringOut() {
    const r = Math.hypot(s.x, s.z) || 1;
    exitDir = [s.x / r, s.z / r];
    const p = [colOf(exitDir[0]), rowOf(KB, exitDir[1])];
    endMark = p;
    outcome = 'ring-out';
    toPhase('impact');
    invert = true; invertAt = vt;
    fx.push({ kind: 'lines', at: vt + TWOS, x: p[0], y: p[1], n: 24, seed: launchN * 31 + 3 });
    const q = [colOf(exitDir[0] * 1.3), rowOf(KB, exitDir[1] * 1.3)];
    fx.push({ kind: 'sparks', at: vt + TWOS, x: p[0], y: p[1], a: Math.atan2(q[1] - p[1], q[0] - p[0]), seed: launchN * 17 + 5 });
    const t = s.t + DROP;
    if (HERO) {
      caption(endText('ring-out', t), true);
      if (pullBy !== 'demo') announce(endSpoken('ring-out', t));
    }
    labels();
  }
  function endRun() {
    outcome = 'sleep-out';
    const t = s.t + DROP + SCRAPE + CHATTER;
    endMark = dishCell(s.x, s.z);
    caption(endText(outcome, t), true);
    if (pullBy !== 'demo') announce(endSpoken(outcome, t));
    toPhase('held');
  }
  function pickUp() {
    if (!s) return;
    const t = s.t + DROP;
    outcome = 'picked up';
    endMark = dishCell(s.x, s.z);
    pickedAt = t;
    save(nowRecord());
    caption(endText(outcome, t), true);
    announce(endSpoken(outcome, t));
    holdTh = s.th; holdPh = s.ph;
    riseState = null;
    oldMask = 16;
    toPhase('pickup');
    labels();
  }
  function startRearm(afterPick) {
    rearmIn = afterPick || outcome === 'ring-out';
    oldMask = afterPick ? 0 : 16;
    launcher.mask = 0; launcher.teeth = 0; launcher.gone = 0; seatW = 0;
    toPhase('rearm');
  }
  function startRise() {
    riseDone = true;
    save(nowRecord());
    frameOf(s.th, s.ph);
    const y = KB * (s.x * s.x + s.z * s.z);
    riseState = { at: vt, capCell: [colOf(s.x + F[3] * CAP_C), rowOf(y + F[4] * CAP_C, s.z + F[5] * CAP_C)], rot: 0.9, capOut: false };
  }
  function armedCaption(again) {
    if (!HERO) return;
    const kb = cordBtn && document.activeElement === cordBtn;
    caption(kb ? 'space to pull' : again ? 'pull again' : outcome ? capText : 'pull the cord →', true);
  }

  /* ---------- the loop: full rate in play, on twos when only waiting, stopped at rest ---------- */

  let raf = 0, last = 0, inView = false, inViewHalf = false, lastDraw = -1e9, dirty = true;
  const busy = () => phase === 'run' || phase === 'drop' || phase === 'selfpull' || phase === 'scrape' || phase === 'chatter' || phase === 'impact' || phase === 'exit' || pulling || !!riseState || fx.length > 0 || winding;
  const pending = () => phase === 'boot' || phase === 'count' || phase === 'held' || phase === 'pickup' || phase === 'rearm' || pullAgainAt > 0 || (HERO && demoPlanned) || bootK < BOOT.length || nfPending;
  function lightAtRest() {
    if (pointerFresh()) return false;
    return Math.abs(lightS[0] - LIGHT[0]) + Math.abs(lightS[1] - LIGHT[1]) + Math.abs(lightS[2] - LIGHT[2]) < 0.002;
  }
  let frozen = false;
  function frame(t) {
    raf = 0;
    if (frozen) return;
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    if (inView && !document.hidden) {
      update(dt);
      tickInput(dt);
      const full = busy();
      if (full || dirty || t - lastDraw >= TWOS) { render(); lastDraw = t; dirty = false; }
      if (full || pending() || !lightAtRest()) { raf = requestAnimationFrame(frame); return; }
      render();
    }
    last = 0;
  }
  function wake() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
  function draw() { dirty = true; if (N) render(); }

  /* ---------- the pointer's light ---------- */
  let px = 0, py = 0, pointerT = -1e9;
  const pointerFresh = () => performance.now() - pointerT < 4000;
  function pointerLight() {
    const r = canvas.getBoundingClientRect();
    return [clamp((px - (r.left + r.width / 2)) / 360, -1.4, 1.4), clamp((py - (r.top + r.height * 0.44)) / 360, -1.4, 1.4), 0.75];
  }
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY; pointerT = performance.now();
    if (!REDUCED) wake();
  }, { passive: true });

  /* ---------- input: one model for every pointer, and a button for the keyboard ---------- */

  let cordBtn = null, how = null;
  let pulling = false, press = null, winding = false, windT = 0, keySeq = null, scrollT = -1e9;
  const scrollGuard = () => performance.now() - scrollT < 400;
  window.addEventListener('scroll', () => { scrollT = performance.now(); }, { passive: true });
  function cellPx() { const r = canvas.getBoundingClientRect(); const o = (r.width - N * cell) / 2; return { r, o }; }
  function gripCss() {
    const { r, o } = cellPx();
    return { x: r.left + o + (gripX(launcher.teeth) + 1) * cell, y: r.top + o + 0.11 * N * cell };
  }
  function inCordZone(e) {
    if (!HERO || !N) return false;
    const gp = gripCss();
    if (Math.abs(e.clientX - gp.x) <= 22 && Math.abs(e.clientY - gp.y) <= 22) return true;
    if (e.pointerType === 'touch') {
      const { r, o } = cellPx();
      const x0 = r.left + o + 0.40 * N * cell;
      return e.clientX >= x0 && e.clientX <= gp.x + 22 && Math.abs(e.clientY - gp.y) <= 22;
    }
    return false;
  }
  function inTop(e) {
    if (!liveBox || !s) return false;
    const { r, o } = cellPx();
    const x = (e.clientX - r.left - o) / cell, y = (e.clientY - r.top - o) / cell, m = 8 / cell;
    return x >= liveBox[0] - m && x <= liveBox[2] + 1 + m && y >= liveBox[1] - m && y <= liveBox[3] + 1 + m;
  }
  const armed = () => phase === 'armed' || (phase === 'boot' && HERO);
  const running = () => phase === 'run' || phase === 'drop';

  // the pull, sampled: speed over the last 60 ms, and the largest vertical departure
  let samples = [];
  function onDown(e) {
    if (!HERO || e.button > 0) return;
    if (phase === 'held' || phase === 'rearm' || phase === 'pickup' || riseState || phase === 'impact' || phase === 'exit' || phase === 'scrape' || phase === 'chatter') return;
    if (armed() || phase === 'count') {
      if (!inCordZone(e)) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), teeth0: launcher.teeth, engaged: false, dev: 0, devSign: 1, type: e.pointerType };
      samples = [[performance.now(), e.clientX]];
      wake();
    } else if (running() && inTop(e)) {
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), pick: true, type: e.pointerType };
    }
  }
  function onMove(e) {
    const over = HERO && armed() && N && inCordZone(e);
    if (e.pointerType !== 'touch' && launcher.hover !== over) { launcher.hover = !!over; draw(); }
    stage.style.cursor = pulling ? 'grabbing' : over ? 'grab' : (running() && inTop(e)) ? 'pointer' : '';
    if (!press || e.pointerId !== press.id || press.pick) return;
    const dxp = e.clientX - press.x;
    if (!press.engaged && dxp > 10) {
      press.engaged = true; pulling = true;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      // a pull that engages takes over the count, the demo's included
      if (phase === 'count' || demoPlanned) { demoPlanned = false; countAt = -1; toPhase('armed'); if (cordBtn) cordBtn.setAttribute('aria-disabled', 'false'); }
    }
    if (!press.engaged) return;
    const dev = e.clientY - press.y;
    if (Math.abs(dev) > press.dev) { press.dev = Math.abs(dev); press.devSign = dev > 0 ? 1 : -1; }
    const toothPx = ((0.5 * N) / TEETH) * cell;
    const teeth = clamp(press.teeth0 + Math.floor(dxp / toothPx), launcher.teeth, TEETH);   // the pawl: never back
    const now = performance.now();
    samples.push([now, e.clientX]);
    while (samples.length > 2 && now - samples[0][0] > 60) samples.shift();
    if (teeth !== launcher.teeth) {
      setTeeth(teeth);
      const spd = pullSpeed();
      seatW = rpm2w(clamp(600 + 600 * spd, 600, 4800) * (teeth / TEETH));
      caption(fmt(w2rpm(seatW)) + ' rpm', true);
      if (teeth >= TEETH) {
        const L = fromPull(spd, press.dev / canvas.clientWidth, press.devSign);
        press = null; pulling = false;
        beginLaunch(L, 'visitor');
      }
      draw(); wake();
    }
  }
  function pullSpeed() {
    if (samples.length < 2) return 0;
    const a = samples[0], b = samples[samples.length - 1];
    const dtp = Math.max(1, b[0] - a[0]);
    return ((b[1] - a[1]) / canvas.clientWidth) / (dtp / 1000);
  }
  function onUp(e) {
    if (!press || e.pointerId !== press.id) return;
    const p = press; press = null;
    const wasPull = pulling; pulling = false;
    if (wasPull) { armedCaption(); draw(); return; }
    const quick = performance.now() - p.t <= 300 && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 10;
    if (!quick || scrollGuard()) return;
    if (p.pick) { if (running()) pickUp(); wake(); return; }
    if (armed() && phase !== 'count') tapToLaunch();
  }
  function onCancel(e) { scrollT = performance.now(); if (press && e.pointerId === press.id) { press = null; pulling = false; } }
  function tapToLaunch() {
    demoPlanned = false;
    if (REDUCED) { beginLaunch(tapLaunch(launchN), 'visitor'); return; }
    startCount('visitor'); wake();
  }

  // keyboard: Space or Enter on the cord button. A tap counts in; a hold winds the cord
  function onKeyDown(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    if (keySeq) return;
    if (phase === 'count') { keySeq = { swallow: true }; return; }
    if (running()) { keySeq = { swallow: true }; pickUp(); wake(); return; }
    if (armed()) { keySeq = { t: performance.now(), wound: 0 }; winding = true; windT = 0; demoPlanned = false; wake(); return; }
    keySeq = { swallow: true };
  }
  function onKeyUp(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    const k = keySeq; keySeq = null; winding = false;
    if (!k || k.swallow) return;
    if (k.wound < 1) { launcher.teeth = 0; tapToLaunch(); return; }
    const teeth = launcher.teeth;
    beginLaunch(holdLaunch(teeth), 'visitor');
  }
  function tickInput(dt) {
    if (!winding || !keySeq || keySeq.swallow) return;
    windT += dt;
    if (windT < 250) return;
    const teeth = Math.min(TEETH, Math.floor((windT - 250) / 40) + 1);
    if (teeth !== launcher.teeth) {
      setTeeth(teeth); keySeq.wound = teeth;
      seatW = rpm2w((600 + (4200 * teeth) / TEETH) * (teeth / TEETH));
      caption(fmt(600 + (4200 * teeth) / TEETH) + ' rpm', true);
    }
    if (teeth >= TEETH) { keySeq = { swallow: true }; winding = false; beginLaunch(holdLaunch(TEETH), 'visitor'); }
  }
  function onClick() {
    if (keySeq) return;                 // the AT path only: a key sequence is handled by the keys
    if (running()) { pickUp(); wake(); return; }
    if (armed()) tapToLaunch();
  }
  function labels() {
    if (!cordBtn) return;
    const run = running() || phase === 'scrape' || phase === 'chatter';
    cordBtn.querySelector('span').textContent = run ? 'Pick up the top' : 'Pull the ripcord';
    if (run) cordBtn.removeAttribute('aria-describedby'); else cordBtn.setAttribute('aria-describedby', how.id);
  }
  function placeCord() {
    if (!cordBtn || !N) return;
    const { o } = cellPx();
    let x = o + (gripX(launcher.teeth) + 1) * cell, y = o + 0.11 * N * cell;
    // during a run the button picks the top up, so its focus ring frames the top
    if (liveBox && (running() || phase === 'scrape' || phase === 'chatter')) {
      x = o + ((liveBox[0] + liveBox[2] + 1) / 2) * cell; y = o + ((liveBox[1] + liveBox[3] + 1) / 2) * cell;
    }
    const w = canvas.clientWidth;
    cordBtn.style.transform = 'translate(' + Math.round(clamp(x - 22, 0, w - 44)) + 'px,' + Math.round(clamp(y - 22, 0, w - 44)) + 'px)';
  }

  /* ---------- the 404 ---------- */

  let nfPending = false, nfSeenAt = -1;
  function nfTick() {
    if (!nfPending) return;
    if (nfSeenAt < 0 && inViewHalf) nfSeenAt = vt;
    if (nfSeenAt < 0) return;
    if (vt >= Math.max(1800, nfSeenAt + 600)) {
      nfPending = false;
      const Lr = nfLaunch(location.pathname);
      launchL = Lr; pullBy = 'self';
      s = fresh(Lr); acc = 0; steps = 0; clearTrace(); addTrace(s.x, s.z);
      topY = DROP_NF[0]; toPhase('drop');
    }
  }

  /* ---------- mount ---------- */

  function mount() {
    size();
    if (!N) return false;
    worldLight();
    const rec = HERO ? load() : null;
    if (HERO) {
      cordBtn = document.createElement('button');
      cordBtn.type = 'button';
      cordBtn.className = 'fig-cord';
      const sp = document.createElement('span'); sp.className = 'sr-only'; cordBtn.append(sp);
      how = document.createElement('p');
      how.id = (canvas.id || 'fig1') + '-how'; how.className = 'sr-only';
      how.textContent = 'Press to launch after a count of three, or hold to wind the cord.';
      stage.append(cordBtn, how);
      cordBtn.addEventListener('keydown', onKeyDown);
      cordBtn.addEventListener('keyup', onKeyUp);
      cordBtn.addEventListener('click', onClick);
      cordBtn.addEventListener('focus', () => {
        launcher.focus = true;
        // keyboard focus arms the launcher: the demo stands down if it hasn't pulled yet
        if (demoPlanned) demoPlanned = false;
        if (phase === 'count' && countFor === 'demo') { toPhase('armed'); cordBtn.setAttribute('aria-disabled', 'false'); }
        if (armed()) armedCaption();
        draw(); wake();
      });
      cordBtn.addEventListener('blur', () => { launcher.focus = false; if (armed()) armedCaption(pullAgainAt < 0 && !!outcome); draw(); });
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onCancel);
      stage.addEventListener('pointerleave', () => { if (launcher.hover) { launcher.hover = false; draw(); } });
      labels();
      if (rec && rec.launch) {
        // a return visit: the stored launch's record, armed
        launchN = rec.n || 1; riseDone = !!rec.rise;
        showRecord(rec.launch, rec.up);
        phase = 'armed'; pullAgainAt = REDUCED ? -1 : 4000;
      } else if (REDUCED) {
        showRecord(DEMO, null);
        phase = 'armed';
      } else {
        demoPlanned = true;
        caption('pull the cord →', true);
      }
    } else {
      const np = document.getElementById('nf-path');
      if (np) { np.textContent = 'Asked for ' + location.pathname; np.hidden = false; }
      if (REDUCED) { const res = simulate(nfLaunch(location.pathname)); setTrace(res.trace); endMark = rimPoint(res.end); caption(nfText(res.bearing), true); phase = 'done'; }
      else { nfPending = true; phase = 'boot'; caption('', true); }
    }
    if (!REDUCED && bootK < BOOT.length) setCell(BOOT[0]);
    return true;
  }
  // a finished launch's record: its dotted path, the × where it ended, its caption
  function showRecord(Lr, up) {
    const res = simulate(Lr);
    let tr = res.trace, endAt = res.end, out = res.outcome, t = res.t;
    if (up != null) {
      const n = Math.max(1, Math.min(tr.length / 2, Math.round(((up - DROP) * 120) / 2) + 1));
      tr = tr.slice(0, n * 2); endAt = [tr[n * 2 - 2], tr[n * 2 - 1]]; out = 'picked up'; t = up;
    }
    setTrace(tr);
    endMark = out === 'ring-out' ? rimPoint(endAt) : dishCell(endAt[0], endAt[1]);
    outcome = out;
    caption(endText(out, t), true);
  }

  // the canvas stays hidden (and out of the accessibility tree) until its first drawing
  if (!mount()) return null;
  render();
  canvas.hidden = false;
  stage.classList.add('fig-live');
  size();
  render();

  const io = new IntersectionObserver(es => {
    for (const en of es) { inView = en.isIntersecting; inViewHalf = en.intersectionRatio >= 0.5; }
    if (inView) wake();
  }, { threshold: [0, 0.5] });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  MD.repaints.push(() => { if (size()) render(); });

  wake();
  // a launch held at time t (from the cord clearing): for still images such as the share card
  function pose(o) {
    frozen = true;
    size();
    const Lr = o.launch || DEMO;
    s = fresh(Lr); clearTrace(); addTrace(s.x, s.z); steps = 0; psi = o.psi || 0; outcome = null; endMark = null;
    const n = Math.max(0, Math.round(((o.t == null ? 8 : o.t) - DROP) * 120));
    for (let k = 0; k < n; k++) { const e = step(s); steps++; if (steps % 2 === 0) { addTrace(s.x, s.z); psi = (psi + s.w / 60) % TAU; } if (e === 'ring-out' || e === 'scrape') break; }
    if (o.light) { lightS[0] = o.light[0]; lightS[1] = o.light[1]; lightS[2] = o.light[2]; }
    if (o.cell) { baseCell = o.cell; bootK = BOOT.length; setCell(o.cell); }
    phase = 'run'; launcher.teeth = 0; launcher.gone = 1; launcher.mask = 16; riseState = null; fx = []; invert = false;
    if (o.w != null) s.w = o.w;
    render();
  }
  return { pose, get phase() { return phase; } };
}

/* ---------- held poses: a launch at a given time, for still images ---------- */

MD.top = { TWOS, THREES, DEMO, step, simulate, fromPull, tapLaunch, holdLaunch, nfLaunch, fnv1a, bearing, EL, figures: [] };

MD.safe('top', function mountTops() {
  document.querySelectorAll('canvas[data-top]').forEach(c => { MD.safe('top-' + (c.id || 'fig'), () => { const f = figure(c); if (f) MD.top.figures.push(f); }); });
});
})();
