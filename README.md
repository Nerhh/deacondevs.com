# deacondevs.com

Personal portfolio for Marcus Deacon. Retro-minimal, hand-built — no frameworks, no build step, zero dependencies. Just `index.html`, one stylesheet, and one JavaScript file.

## What's in it

- **The duel** — a fully hand-coded OSRS-style combat scene: Marcus (ranger in Masori-inspired gear) versus Deacon (mage in Ancestral-inspired robes), with projectile arcs, particle trails, hitsplats, HP bars, freeze effects, screen shake, death/respawn cycles, and click-triggered special attacks.
- **Live project demos** — the StubHub Lens card runs a live mean-reverting price sparkline with rolling average and deal detection; the Vestra card animates an allocation donut with a counting net-worth figure (demo data).
- **Quest log** — shipped work and works-in-progress as OSRS quests, with quest points that count up on scroll. Honest by design: no self-assigned skill levels.
- **XP drops** — clicking any link awards XP, RuneScape style.
- **Scraper-resistant email** — the address never appears in the HTML source; it's ROT13-assembled in JavaScript on first click (which also copies it to the clipboard), and a second click opens the mail app.
- **Dark/light theme** — dark terminal vs. old-paper light, persisted in localStorage, respects `prefers-color-scheme`.
- **Accessibility** — full `prefers-reduced-motion` support, semantic HTML, focus styles, noscript fallback.

## Local preview

```sh
npx http-server . -p 4173
# then open http://localhost:4173
```

(Any static file server works — there is nothing to build.)

## Deploying with a Squarespace-registered domain

Squarespace can't host raw custom HTML, so host the files elsewhere (free) and point the domain at it.

### Option A: GitHub Pages (recommended)

1. Create a GitHub repo (e.g. `deacondevs/deacondevs.com`), push this folder to it.
2. Repo → Settings → Pages → Source: `main` branch, root. The included `CNAME` file already says `deacondevs.com`.
3. In Pages settings, set the custom domain to `deacondevs.com` and enable **Enforce HTTPS** (available once DNS propagates).
4. In Squarespace: **Domains → deacondevs.com → DNS Settings**, add:

   | Type  | Host | Value                   |
   |-------|------|-------------------------|
   | A     | @    | 185.199.108.153         |
   | A     | @    | 185.199.109.153         |
   | A     | @    | 185.199.110.153         |
   | A     | @    | 185.199.111.153         |
   | CNAME | www  | `<your-gh-user>.github.io` |

   Remove any conflicting Squarespace default A/CNAME records on `@` and `www`.

Cloudflare Pages or Netlify work just as well — drag-and-drop the folder, then follow their custom-domain DNS instructions instead.

## TODO before going live

- [ ] Tweak the demo numbers if you like (`TOTAL`, allocation segments in `js/main.js`).
- [ ] Add or update quests in the `#quests` section of `index.html` (`data-qp` attributes feed the quest-point counter).
