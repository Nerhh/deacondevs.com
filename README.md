# marcus.gg

My corner of the internet — [marcus.gg](https://marcus.gg).

Hand-built, on purpose: no frameworks, no build step, no dependencies. Hand-written HTML, one stylesheet, one JavaScript file.

## Bits I'm fond of

- **The duel.** An Old School RuneScape-style fight rendered on canvas — me as a Masori ranger versus me as an Ancestral mage. Projectile arcs, pixel hitsplats, HP bars, freezes, deaths and respawns. Click a fighter to unleash their special attack.
- **The charts are real.** The project cards render live, animated data on canvas — not screenshots.
- **The quest log.** Things I've shipped and things I'm building, tracked like quests. No self-assigned skill levels.
- **XP drops.** Click any link. You'll see.
- **The favicon is a hitsplat.** It hits a 73, naturally.
- My email never appears in the page source — scrapers get nothing, humans get a click-to-reveal.
- Dark terminal theme or old-paper light theme, and everything respects `prefers-reduced-motion`.

## Running it

There's nothing to build. Any static file server works:

```sh
npx http-server .
```

Served in production by GitHub Pages.
