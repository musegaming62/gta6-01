# Solmar — Open-World Crime Game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/musegaming62/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/musegaming62/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01): a complete
top-down 2D open-world crime game that runs offline in a desktop browser from
static files. Built from scratch with plain HTML5 Canvas and vanilla JavaScript —
no libraries, no network requests, no borrowed assets.

## The game

Danny Voss owes money to the wrong people. Mara, a fixer, hands him five jobs
across the coastal city of Solmar. Steal cars, outrun the police, settle scores
with the Vulture gang, and pull off the Big Score at the Solmar National Bank —
then escape to the harbour boat a free man.

Solmar is a 3200×3200 city with six districts (Old Town, Downtown, La Vista,
Portside, Marina Beach and Hillside), a road grid with traffic, pedestrians on
the sidewalks, a beach and ocean to the south, and a harbour with docks.

## Features

- **Open world on foot and by car** — walk, sprint, steal and drive four car
  types (sedan, sports car, truck, police cruiser) with arcade drift physics.
- **Traffic and pedestrians** — cars follow the road network and stop for
  each other; pedestrians stroll, cross at crosswalks, and flee from gunfire.
- **Wanted system** — 0 to 5 stars. Crimes raise the heat; foot cops chase
  and shoot, cruisers ram, and getting caught means BUSTED.
- **Five story missions** — Hot Wheels, The Pickup, Getaway Driver, Payback,
  and The Big Score, with briefing lines from Mara, objective markers, and
  cash rewards.
- **Combat** — mouse-aim shooting with limited ammo and reloads, punching,
  gang members with health bars, car explosions.
- **HUD with minimap** — health, money, wanted stars, ammo, mission
  objective, timer, and a live minimap showing the player, the objective,
  and police.
- **Menus and save** — start screen, pause, BUSTED / WASTED / mission-failed
  screens, a win screen, and a localStorage save with Continue.
- **Juice** — muzzle flashes, smoke, sparks, skid marks, screen shake,
  floating cash text, and procedural WebAudio (engine hum, gunshots, sirens,
  pickup chimes, mission jingles).

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move / drive |
| Shift | Sprint |
| Mouse | Aim |
| Left click | Shoot |
| R | Reload |
| F | Punch |
| E | Steal / exit car |
| P or Esc | Pause |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `game/index.html`.
The game needs no network access.

To build the submission dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — page, HUD DOM, menus
- `game/style.css` — HUD and menu styling
- `game/js/main.js` — boot, game loop, camera, screens, screenshot staging
- `game/js/world.js` — city generation, districts, collision, ground rendering
- `game/js/player.js` — on-foot movement, shooting, car entry
- `game/js/cars.js` — driving physics, car types, traffic AI
- `game/js/peds.js` — pedestrians and gang members
- `game/js/police.js` — wanted system, foot cops and cruiser pursuit
- `game/js/combat.js` — bullets and damage
- `game/js/missions.js` — story and the five missions
- `game/js/hud.js` — HUD updates and the minimap
- `game/js/audio.js` — procedural WebAudio sound
- `game/js/particles.js` — particles, floating text, skid marks, shake
- `game/js/save.js` — localStorage save / continue
- `game/js/state.js` — shared game state
- `game/js/input.js` — keyboard and mouse input
- `game/js/util.js` — math and random helpers

## Screenshots

Four staged shots of the game itself (`shots.json`): a police chase, driving
through traffic, a mission moment, and combat with the Vulture gang.

## License

MIT — see [LICENSE](LICENSE).
