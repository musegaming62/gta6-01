# Solmar — Open World Crime Game

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/musegaming62/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/musegaming62/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down 2D open-world crime game built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). No Rockstar assets,
names or maps — Solmar is its own city, with its own people, story and crimes.

## The game

Danny Voss owes money to dangerous people. His fixer Mara has five jobs that
clear the debt — if he survives them. Explore the coastal city of Solmar on
foot and by car: steal vehicles, outrun the police, fight the Vulture gang and
rob the Solmar National Bank before escaping to the harbour boat.

- **Open world:** a 3200×3200 coastal city with six named districts, a beach and
  ocean on the south edge, a harbour with docks and a boat, a road grid, traffic
  and pedestrians.
- **On foot and by car:** WASD movement, sprint with stamina, mouse aim, shooting,
  punching, carjacking (E) and arcade driving with drift and skid marks.
- **Wanted system:** 0–5 stars. Crimes raise it; foot cops and police cruisers
  respond, with line-of-sight shooting, ramming and BUSTED / WASTED screens.
- **Five missions:** Hot Wheels, The Pickup, Getaway Driver (timed), Payback
  (defeat four Vulture gang members) and The Big Score (bank robbery + harbour
  escape), with briefing lines from Mara and cash rewards.
- **HUD and save:** health, money, wanted stars, ammo, mission objective, a live
  minimap, start / pause / continue screens and a localStorage save.
- **Feel:** procedural WebAudio (engine, gunshots, sirens, jingles), particles,
  muzzle flashes, smoke, explosions, screen shake and floating reward text.

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no
network requests — `game/` is plain static files.

To hand the entry in (what `main.ts` does):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive a car |
| Shift | Sprint |
| Mouse | Aim |
| Click | Shoot |
| R | Reload |
| F | Punch |
| E | Steal / exit car |
| P / Esc | Pause |

## Structure

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with the vendored make.fun library.
- `game/index.html`, `game/style.css` — the page and its HUD/menus.
- `game/js/main.js` — boot, game loop, camera, world rendering, menus.
- `game/js/world.js` — the seeded city generator and collision helpers.
- `game/js/cars.js` — driving physics, drift, traffic AI, damage.
- `game/js/peds.js` — pedestrians, fleeing civilians, gang members.
- `game/js/player.js` — on-foot movement, shooting, punching, carjacking.
- `game/js/combat.js` — bullets, line of sight, explosions.
- `game/js/police.js` — the wanted system and police pursuit.
- `game/js/missions.js` — the five-mission story.
- `game/js/hud.js` — HUD, objective text and the minimap.
- `game/js/particles.js` — particles, floating text, screen shake.
- `game/js/audio.js` — procedural WebAudio sounds.
- `game/js/input.js` — keyboard and mouse input.
- `game/js/save.js` — localStorage saves.
- `game/js/util.js` — math and random helpers.

## License

MIT. See [LICENSE](LICENSE).
