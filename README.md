# marcus.gg

My corner of the internet — [marcus.gg](https://marcus.gg).

Written by hand, on purpose: no frameworks, no build step, no dependencies. Plain HTML pages, one shared stylesheet plus one per project, a small shared script plus one per page, and one typeface (IBM Plex Mono, self-hosted).

Off-white paper, grey rules, ink. The motion is borrowed from older machines.

## Pages

| Path | What it is | How it's laid out |
| --- | --- | --- |
| `/` | Index | The sphere, then one row per project, each with its own live miniature. No section headers. |
| `/umbra/` | Umbra, a multi-session desktop browser | A sticky split-screen story driven by scroll: one window splits into sealed partitions. |
| `/vestra/` | Vestra, a net-worth tracker | Full-screen typographic statements, one figure at a time. |
| `/dial/` | Dial, a watch valuer | A single instrument you step through: capture, identify, details, market, value. |
| `/insights/` | Section Price Insights, a Chrome extension | A horizontal track: listings load, fall into zones, and become low, typical and high prices. |

## The motion

- **Fig. 1.** A sphere shaded per pixel — diffuse, specular, a rim on the unlit side, a turning globe grid — then reduced to one bit with an 8×8 Bayer dither. It boots from coarse blocks to fine dither, is lit from wherever your cursor is, and turns with inertia when you drag it. The favicon and menu-bar icon come from the same renderer.
- **Windows zoom open.** Dotted rectangles grow from a window's centre to its frame, then its contents arrive through a dithered dissolve — seventeen 4×4 Bayer masks stepped in sequence.
- **Focus follows attention.** Only the focused window gets title-bar pinstripes and a close box.
- **Text types itself in** behind a block caret. In a monospace face `1ch` is exact, so plain CSS `steps()` keeps caret and text in lockstep.
- **Miniatures** on the index are true to each project: sealed partitions that nothing crosses, a net-worth figure rolling over its history, listings cut at 60% of the median, and listings falling into zones.
- **Page changes** open like an iris, in steps (cross-document View Transitions where supported).
- Canvas text is always fitted to its box, so nothing clips at any width.
- Everything respects `prefers-reduced-motion`, and every word is readable with JavaScript off.

## Code

- `js/core.js` — shared: dither maths, the sphere renderer, canvas staging, text fitting, visibility-gated loops, scroll progress, reveal effects, the menu-bar clock. Exposed as `window.MD`.
- `js/home.js` and one script per project page.
- `css/style.css` — shared tokens, the menu bar, windows, the index, and the project-page frame; each project page adds `css/<project>.css`.

## Running it

There's nothing to build. Any static file server works:

```sh
npx http-server .
```

Served in production by GitHub Pages.
