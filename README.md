# marcus.gg

My corner of the internet — [marcus.gg](https://marcus.gg).

Hand-built, on purpose: no frameworks, no build step, no dependencies. Hand-written HTML, one stylesheet, one JavaScript file.

## Bits I'm fond of

- **The duel.** An Old School RuneScape-style fight rendered on canvas — me as a Masori ranger versus me as an Ancestral mage. Projectile arcs, pixel hitsplats, HP bars, freezes, deaths and respawns. Click a fighter to unleash their special attack. It now lives in its own framed scene beside the headline.
- **The Umbra demo.** A browser window drawn on canvas that opens five tabs, and every tab carries its own identity — exit IP, timezone, device, cookie jar and a fingerprint drawn as three arcs (a nod to the Umbra mark). Switch tabs and the whole identity morphs; nothing is shared between them. Watch it open all five and the collection log notices.
- **The charts are real.** Every project card renders live, animated data on canvas — not screenshots.
- **The quest log.** Things I've shipped and things I'm building, tracked like quests, with a progress bar. No self-assigned skill levels.
- **Spotlight cards.** Move the cursor over a project and a glow follows it around the card's border. Umbra's is teal.
- **The theme wipe.** Flip the lights and the new theme floods out from the button in a circle (View Transitions, with an instant fallback).
- **Decoding labels.** Section kickers scramble into place as they scroll into view; headlines rise out of a mask on load.
- **XP drops.** Click any link. You'll see.
- **The favicon is a hitsplat.** It hits a 73, naturally.
- My email never appears in the page source — scrapers get nothing, humans get a click-to-reveal from the NPC at the bottom.
- Dark terminal theme or warm-paper light theme, and everything respects `prefers-reduced-motion`.

## Type

IBM Plex Mono is the terminal voice, Instrument Serif is the display voice, and VT323 does the pixel work inside the duel.

## Running it

There's nothing to build. Any static file server works:

```sh
npx http-server .
```

Served in production by GitHub Pages.
