# marcus.gg

My corner of the internet — [marcus.gg](https://marcus.gg).

Written by hand, on purpose: no frameworks, no build step, no dependencies. One HTML page per route, one stylesheet, one script, and one typeface (IBM Plex Mono, self-hosted).

Off-white paper, grey rules, ink. The motion is borrowed from older machines.

## The motion

- **Fig. 1.** A sphere shaded per pixel — diffuse, specular, a rim on the unlit side, a turning globe grid — then reduced to one bit with an 8×8 Bayer dither. It boots from coarse blocks to fine dither, is lit from wherever your cursor is, wanders on its own when you leave it alone, and turns with inertia when you drag it. The favicon and the menu-bar icon come from the same renderer.
- **Windows zoom open.** Each project is a window. As it scrolls into view, dotted rectangles grow from its centre to its frame, then its contents arrive through a dithered dissolve — seventeen 4×4 Bayer masks stepped in sequence.
- **Focus follows attention.** Only the focused window gets title-bar pinstripes and a close box: the one nearest the middle of the screen, or the one under the cursor.
- **Text types itself in.** Headings are uncovered one character at a time behind a block caret. In a monospace face `1ch` is exact, so the caret and the text move in lockstep with plain CSS `steps()`.
- **The menu bar.** London time, cursor coordinates, and a two-digit counter that rolls to the section you are reading.
- **The email.** Never in the page source. On request it is decoded letter by letter, each character turning thirteen places through the alphabet, the way it was encoded.
- **Page changes** open like an iris, in steps (cross-document View Transitions where supported).
- The **project demos** are live canvases, not screenshots: Umbra's five isolated tabs, Vestra's allocation ring, StubHub Lens's price chart, and Dial's watch scan.
- Everything respects `prefers-reduced-motion`, and every word is readable with JavaScript off.

## Running it

There's nothing to build. Any static file server works:

```sh
npx http-server .
```

Served in production by GitHub Pages.
