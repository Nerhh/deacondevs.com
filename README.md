# marcus.gg

My corner of the internet — [marcus.gg](https://marcus.gg).

Hand-built, on purpose: no frameworks, no build step, no dependencies. Hand-written HTML, one stylesheet, one JavaScript file. The interface is Old School RuneScape's: pixel type for the chrome, bevelled stone panels, parchment for journals, red/yellow/green for status.

## Bits I'm fond of

- **The login screen.** Two fires burn either side of the welcome box, propagated cell by cell on canvas the way the old fire effects were. Enter, or read the adventure log.
- **The duel.** An Old School RuneScape-style fight rendered on canvas — me as a Masori ranger versus me as an Ancestral mage. Projectile arcs, pixel hitsplats, HP bars, freezes, deaths and respawns. Click a fighter to unleash their special attack, or right-click and choose **Attack**.
- **Right-click anything.** A proper *Choose Option* menu: Examine, Attack, Talk-to, Open, Cancel. Examine text goes to the chatbox, as it should.
- **The chatbox.** Game messages in the bottom-left: welcome, examines, kills in the duel, collection-log unlocks, level-ups. Click to expand.
- **XP that levels.** Clicking earns XP; levels follow the real Old School experience table (83 to level 2, 174 to level 3…). A level-up brings the fireworks and the “Congratulations” dialogue.
- **The click cross.** Yellow to walk, red to interact.
- **The Umbra demo.** A browser window drawn on canvas that opens five tabs, and every tab carries its own identity — exit IP, timezone, device, cookie jar and a fingerprint drawn as three arcs (a nod to the Umbra mark). Switch tabs and the whole identity morphs; nothing is shared between them.
- **The charts are real.** Every project card renders live, animated data on canvas — not screenshots.
- **The quest list.** Red not started, yellow in progress, green complete. Click a quest and its journal unrolls on parchment. No self-assigned skill levels.
- **The collection log.** Ten item slots with pixel icons; obtained items light up, the rest sit as dark silhouettes. Fill it and the page turns gilded.
- **The favicon is a hitsplat.** It hits a 73, naturally.
- My email never appears in the page source — scrapers get nothing, humans get a click-to-reveal from the NPC at the bottom.
- Dark theme or parchment theme (the toggle floods the page in a circle), and everything respects `prefers-reduced-motion`.

## Type

VT323 is the interface voice, IBM Plex Mono is the reading voice.

## Running it

There's nothing to build. Any static file server works:

```sh
npx http-server .
```

Served in production by GitHub Pages.
