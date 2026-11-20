# Solmar — Open-World Crime Game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/musegaming62/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/musegaming62/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmar** is a top-down 2D open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). It runs entirely offline in a
desktop browser from its own files — plain HTML5 Canvas and vanilla JavaScript, no libraries,
no network requests.

## The city

Solmar is a coastal city, 3200×3200 pixels, with six districts: Downtown, Portside, Marina
Beach, Palm Heights, the Foundry, and Vista Hills. The southern edge is a beach with the ocean
beyond it, and the harbour dock holds the boat that ends the story. A road grid connects every
district, with traffic and pedestrians moving through it.

## What you can do

- **Explore on foot and by car** — WASD to move, Shift to sprint, E to steal and drive any car.
- **Drive** — arcade physics with drift, four car types (sedan, sports car, truck, police cruiser).
- **Fight** — mouse aim, click to shoot, R to reload, F to punch.
- **Wanted system** — crimes raise 0–5 stars; police respond on foot and in cruisers, and will
  arrest (BUSTED) or kill (WASTED) Danny if they catch him. Lay low and the heat decays.
- **Five story missions** for fixer Mara, starring Danny Voss:
  1. **Hot Wheels** — steal a sports car and deliver it to the chop shop ($500).
  2. **The Pickup** — collect a package in Vista Hills and drop it in Palm Heights ($400).
  3. **Getaway Driver** — lose the cops and reach the safehouse in 75 seconds ($600).
  4. **Payback** — settle it with the four Vulture gang members in the Foundry ($800).
  5. **The Big Score** — rob Solmar National Bank and escape to the harbour boat ($5,000).
- **HUD with minimap** — health, money, wanted stars, ammo, objective, timer, and a live minimap.
- **Save and continue** — progress is stored in localStorage; the menu offers Continue.
- **Polish** — particles, skid marks, screen shake, procedural WebAudio (engine, gunshots,
  sirens, pickups, jingles), pause menu, and busted/wasted/win screens.

## Controls

| Key | Action |
|-----|--------|
| WASD / arrows | Move / drive |
| Shift | Sprint |
| Mouse | Aim |
| Left click | Shoot |
| R | Reload (refills ammo) |
| F | Punch |
| E | Enter / exit car |
| P / Esc | Pause |
| N | Start the next job |
| M | Mute |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or build the hand-in dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — the page: canvas, HUD, menus.
- `game/style.css` — HUD and menu styling.
- `game/js/` — one module per system: `main` (boot and loop), `world` (city generation),
  `player`, `cars` (driving and traffic), `peds`, `combat`, `police` (wanted system),
  `missions` (the five jobs), `hud` (DOM and minimap), `save`, `audio` (procedural sound),
  `particles`, `input`, `util`, `shots` (screenshot staging).
- `screenshots/` — four screenshots of the game itself: a police chase, driving, a mission,
  and combat.
- `main.ts` — hands the game in: copies `game/` and `screenshots/` and writes `dossier.json`.

## License

MIT — see [LICENSE](LICENSE).
