/* cinema.js — scroll-driven direction. GSAP ScrollTrigger + Lenis conduct;
   main.js still draws every pixel. Loaded after main.js so window.__duel exists. */
(() => {
'use strict';

if (!window.gsap || !window.ScrollTrigger || !window.Lenis) return;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

const root = document.documentElement;
root.classList.add('cine');
gsap.registerPlugin(ScrollTrigger);

/* ---------- smooth scroll: Lenis feeds ScrollTrigger ---------- */

const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

// same-page anchors ride the smooth scroll instead of jumping
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (!id || id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    lenis.scrollTo(el, { offset: -64 });
  });
});

/* ---------- act I: the pinned hero — title card, then the camera pushes into the fight ---------- */

const hero = document.querySelector('.hero');
const title = document.getElementById('hero-title');
const challengeBtn = document.getElementById('challenge-btn');

if (hero && title) {
  const heroTl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: '+=240%',
      scrub: 0.6,
      pin: true,
      anticipatePin: 1,
      onUpdate(self) {
        if (window.__duel) {
          window.__duel.setCam(Math.max(0, Math.min(1, (self.progress - 0.08) / 0.42)));
        }
      },
    },
  });
  heroTl
    .to(title, { autoAlpha: 0, scale: 1.4, filter: 'blur(8px)', ease: 'power2.in', duration: 0.22 }, 0)
    .fromTo('.watermark', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: 'none' }, 0.12)
    .from('.plate-frame', { autoAlpha: 0, scale: 1.05, duration: 0.18, ease: 'none' }, 0.24)
    .from('.plate-cap', { autoAlpha: 0, y: -14, stagger: 0.03, duration: 0.14, ease: 'none' }, 0.3)
    .from('.hero-editorial', { autoAlpha: 0, y: 48, duration: 0.18, ease: 'none' }, 0.42)
    .from(challengeBtn, { autoAlpha: 0, y: 24, duration: 0.12, ease: 'none' }, 0.58)
    .to({}, { duration: 0.3 }); // hold: the fight plays out at full zoom
}

/* ---------- act II: chapters assemble themselves as the visitor scrolls ---------- */

function buildIn(el, extra) {
  gsap.from(el, Object.assign({
    y: 80, autoAlpha: 0, rotateX: 7, transformOrigin: '50% 100%', ease: 'none',
    scrollTrigger: { trigger: el, start: 'top 96%', end: 'top 62%', scrub: 0.5 },
  }, extra || {}));
}

gsap.utils.toArray([
  '.section-h', '.section-note', '.quest', '.clog-item',
  '.about-col p', '.npc', '.log-entry',
]).forEach(el => buildIn(el));
gsap.utils.toArray('.ge').forEach(el => buildIn(el, { y: 60, rotateX: 4 }));
const foot = document.querySelector('footer');
if (foot) buildIn(foot, { y: 30, rotateX: 0 });

/* ---------- the catalogue: a pinned horizontal gallery on wide screens ---------- */

const track = document.querySelector('#projects .cards');
function cardFallback() {
  gsap.utils.toArray('.card').forEach(el => buildIn(el, { y: 100, rotateX: 9 }));
}
if (track && window.innerWidth >= 900) {
  const gallery = document.getElementById('projects');
  track.classList.add('h-on');
  gallery.classList.add('wide');
  const dist = () => Math.max(0, track.scrollWidth - window.innerWidth + 160);
  if (dist() < 80) {
    track.classList.remove('h-on');
    gallery.classList.remove('wide');
    cardFallback();
  } else {
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: '#projects',
        start: 'top top',
        end: () => '+=' + Math.round(dist() + window.innerHeight * 0.35),
        scrub: 0.6,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
  }
} else if (track) {
  cardFallback();
}

/* ---------- chapter tints: the room's light changes as the story moves ---------- */

const tintLayer = document.createElement('div');
tintLayer.className = 'tint-layer';
tintLayer.setAttribute('aria-hidden', 'true');
document.body.appendChild(tintLayer);

const TINTS = [
  ['.hero', 'rgba(0,0,0,0)'],
  ['#projects', 'rgba(63,80,180,0.12)'],
  ['#quests', 'rgba(217,180,91,0.08)'],
  ['#clog', 'rgba(160,95,208,0.11)'],
  ['#about', 'rgba(52,140,120,0.09)'],
  ['#contact', 'rgba(205,125,42,0.09)'],
];
TINTS.forEach(([sel, col]) => {
  const el = document.querySelector(sel);
  if (!el) return;
  ScrollTrigger.create({
    trigger: el, start: 'top 55%', end: 'bottom 45%',
    onToggle(self) {
      if (self.isActive) gsap.to(tintLayer, { backgroundColor: col, duration: 0.9, overwrite: 'auto' });
    },
  });
});

/* ---------- the playable duel: you are Marcus ---------- */

const ui = document.getElementById('duel-ui');
const banner = document.getElementById('duel-banner');
const orbA = document.getElementById('orb-atk');
const orbS = document.getElementById('orb-spec');
const fleeBtn = document.getElementById('duel-exit');

if (ui && challengeBtn && window.__duel) {
  challengeBtn.hidden = false; // the cinema is running; the arena is open

  const setOrb = (orb, v) => {
    orb.style.setProperty('--p', v.toFixed(3));
    orb.classList.toggle('ready', v >= 0.999);
  };

  challengeBtn.addEventListener('click', () => {
    window.__duel.challenge(true);
    challengeBtn.hidden = true;
    ui.hidden = false;
    gsap.fromTo(ui.children, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.07, duration: 0.4, ease: 'power3.out' });
  });

  fleeBtn.addEventListener('click', () => {
    window.__duel.challenge(false);
    ui.hidden = true;
    challengeBtn.hidden = false;
    banner.hidden = true;
  });

  orbA.addEventListener('click', () => window.__duel.playerAttack(false));
  orbS.addEventListener('click', () => window.__duel.playerAttack(true));
  window.addEventListener('keydown', e => {
    if (ui.hidden) return;
    if (e.code === 'Space') { e.preventDefault(); window.__duel.playerAttack(true); }
    else if (e.code === 'KeyA' || e.code === 'Enter') window.__duel.playerAttack(false);
  });

  gsap.ticker.add(() => {
    if (ui.hidden || !window.__duel) return;
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

/* ---------- measurements settle late: fonts, images, layout ---------- */

window.addEventListener('load', () => ScrollTrigger.refresh());
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}

})();
