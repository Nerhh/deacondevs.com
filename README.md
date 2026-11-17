# marcus.gg

My corner of the internet — [marcus.gg](https://marcus.gg).

Written by hand, on purpose: no frameworks, no build step, no dependencies. Plain HTML pages, one shared stylesheet plus one per project, a small shared script plus one per page, and one typeface (IBM Plex Mono, self-hosted).

Off-white paper, grey rules, ink. The motion is borrowed from older machines.

## Pages

| Path | What it is | How it's laid out |
| --- | --- | --- |
| `/` | Index | The top, then one row per featured project, each with its own live miniature, then one band to the rest. No section headers. |
| `/more/` | More projects | A two-up grid, a window and a miniature each. The index stays at four rows; everything else lives here. |
| `/umbra/` | Umbra, a multi-session desktop browser | A sticky split-screen story driven by scroll: one window splits into sealed partitions. |
| `/vestra/` | Vestra, a net-worth tracker | Full-screen typographic statements, one figure at a time. |
| `/dial/` | Dial, a watch valuer | A single instrument you step through: capture, identify, details, market, value. |
| `/tessera/` | Tessera, a ticket-price Chrome extension | A horizontal track: listings load, fall into zones, and become low, typical and high prices. |
| `/admit/` | Admit, ticketing whose tickets can't be copied | The wallet beside the door: real codes signed in your browser every ten seconds, and five attempts run through the door's eight checks. |
| `/tft-copilot/` | TFT Copilot, a decision engine for Teamfight Tactics | One instrument: the engine's exact roll-down programme on every change, a simulation checking it, then the tool split by the game clock. |
| `/404.html` | Not found | The front page with the top gone: a ring-out, seeded by the address. |

## The motion

- **Fig. 1.** A spinning top in a dish, ray-cast per cell through one orthographic camera (bowl, contact ring, flywheel, gear, tip, and a cap carrying the sphere), then reduced to one bit with the 8×8 Bayer dither. Pull the cord: pull speed sets the spin, and any wander throws it crooked. The physics is a small model, tuned by hand to behave like a real top: spin decays, a fast top rises and sleeps, precession quickens as it slows, and the tip rolls and dots its path on the dish. It ends in a sleep-out or a ring-out. Motion blur is a threshold: each pattern blends toward its average by how much of a turn passes in 1/60 s, so the lobes, then the teeth, then the ribs come back as it dies. Pull hard enough and, once it sleeps, the sphere comes out of the cap for a second. It still boots coarse to fine and takes its light from your cursor. The favicon and menu-bar icon are the cap's sphere, from the same renderer.
- **Windows zoom open.** Dotted rectangles grow from a window's centre to its frame, then its contents arrive through a dithered dissolve — seventeen 4×4 Bayer masks stepped in sequence.
- **Focus follows attention.** Only the focused window gets title-bar pinstripes and a close box.
- **Text types itself in** behind a block caret. In a monospace face `1ch` is exact, so plain CSS `steps()` keeps caret and text in lockstep.
- **Miniatures** are true to each project: sealed partitions that nothing crosses, a net-worth figure rolling over its history, listings cut at 60% of the median, listings falling into zones, a ticket code changing on the real ten-second clock beside a door's log, and a roll-down climbing towards its exact odds.
- **Fig. 2** is Fig. 1 taken apart, drawn as the one-colour leaflet that came in the box: inline SVG, so it reads and prints without JavaScript.
- **Drawn on twos.** New events in Fig. 1 and on the 404 hold for whole drawings, action on twos (1/12 s) and the quieter dissolves on threes (1/8 s), as television animation of the period did; the simulation underneath runs every frame.
- **With reduced motion,** every launch is run to its end at once and only its record is drawn.
- **Nothing on Admit or TFT Copilot is faked.** Admit's wallet makes a non-extractable P-256 key with WebCrypto and signs real ADM1 codes; the door verifies them in the server's order. TFT Copilot's roll-down is the engine's `odds.ts`, ported line for line.
- **Page changes** open like an iris, in steps (cross-document View Transitions where supported).
- Canvas text is always fitted to its box, so nothing clips at any width.
- Everything respects `prefers-reduced-motion`, and every word is readable with JavaScript off.

## Code

- `js/core.js` — shared: dither maths, the sphere renderer and the light it shares with the top, canvas staging, text fitting, visibility-gated loops, scroll progress, reveal effects, the miniature runner and window focus, the menu-bar clock. Exposed as `window.MD`.
- `js/top.js` — Fig. 1 and the 404: the top's renderer, its physics, and the cord.
- `js/home.js`, `js/more.js` (the miniatures on `/more/`) and one script per project page.
- `css/style.css` — shared tokens, the menu bar, windows, the index, and the project-page frame; each project page adds `css/<project>.css`.

## Running it

There's nothing to build. Any static file server works:

```sh
npx http-server .
```

Served in production by GitHub Pages.

## Colophon

The four featured projects each keep a quarter of the compass, as the Four Symbols of Chinese cosmology do; the last row of each Facts table, Bearing, gives it on the same compass the 404 reports from. The seals beside them follow Han eave-tile ends, reduced to each creature's hide; the boss at the centre is the sphere, because the centre belongs to earth and the sphere is a globe. Admit and TFT Copilot sit outside the compass, as the index stays at four rows. Read down the index, the quarters spell NEWS. Of the four colours, black and white were already here: the ink and the paper.

Fig. 1 is a nod to the spinning-top anime of 2001–03, *Bakuten Shoot Beyblade* (Madhouse, 2001) and its sequels, and to the instruction leaflets that came in the box. Nothing from the show is drawn: the top is generic, the physics is classical, and the four creatures are the Four Symbols, where the show found them too. Its countdown stops a beat short. Not affiliated with the show or the toy's makers.
