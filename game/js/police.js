// Wanted level and police response. Stars rise with crime and decay when the
// player stays clean and out of sight; police spawn on foot and in cruisers
// and pursue, scaling with the wanted level.
import { clamp, dist, angleTo, randRange } from './util.js';
import { ROAD_CENTERS, WORLD_SIZE } from './world.js';
import { makeCar } from './cars.js';
import { makePed } from './peds.js';

export function createPolice() {
  return {
    wanted: 0,
    crimeTimer: 0, // time since the last crime
    decayTimer: 0,
    spawnTimer: 0,
  };
}

export function addWanted(G, n) {
  const pol = G.police;
  pol.wanted = clamp(pol.wanted + n, 0, 5);
  pol.crimeTimer = 0;
  if (pol.wanted >= 1) G.audio.siren(true);
}

export function setWanted(G, n) {
  G.police.wanted = clamp(n, 0, 5);
  G.police.crimeTimer = 0;
  if (G.police.wanted >= 1) G.audio.siren(true);
  else G.audio.siren(false);
}

export function clearWanted(G) {
  G.police.wanted = 0;
  G.audio.siren(false);
  // Send the police home.
  for (const p of G.peds) {
    if (p.isCop) p.dead = true;
  }
  for (const c of G.cars) {
    if (c.isPolice && c.driver !== 'player') c.dead = true;
  }
}

function spawnCopFoot(G) {
  const px = G.player.x;
  const py = G.player.y;
  const a = Math.random() * Math.PI * 2;
  const r = randRange(Math.random, 420, 650);
  const x = clamp(px + Math.cos(a) * r, 60, WORLD_SIZE - 60);
  const y = clamp(py + Math.sin(a) * r, 60, 2900);
  const cop = makePed(x, y, { isCop: true, shirt: '#1f2a44' });
  G.peds.push(cop);
  return cop;
}

function spawnCruiser(G) {
  const px = G.player.x;
  const py = G.player.y;
  // Put the cruiser on a road near the player.
  const a = Math.random() * Math.PI * 2;
  let x = clamp(px + Math.cos(a) * randRange(Math.random, 450, 650), 100, WORLD_SIZE - 100);
  let y = clamp(py + Math.sin(a) * randRange(Math.random, 450, 650), 100, 2900);
  const ix = ROAD_CENTERS.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b));
  const iy = ROAD_CENTERS.reduce((b, c) => (Math.abs(c - y) < Math.abs(b - y) ? c : b));
  // Snap to the nearer road centreline.
  if (Math.abs(x - ix) < Math.abs(y - iy)) x = ix;
  else y = iy;
  const car = makeCar('police', x, y, Math.random() * Math.PI * 2);
  car.isTraffic = false;
  car.driver = 'police';
  G.cars.push(car);
  return car;
}

export function updatePolice(G, dt) {
  const pol = G.police;
  const wanted = Math.floor(pol.wanted);
  pol.crimeTimer += dt;

  // Decay: no crime for a while and no cop nearby, stars fall off slowly.
  if (pol.wanted > 0 && pol.crimeTimer > 12) {
    let near = false;
    for (const p of G.peds) {
      if (p.isCop && dist(p.x, p.y, G.player.x, G.player.y) < 420) { near = true; break; }
    }
    if (!near) {
      for (const c of G.cars) {
        if (c.isPolice && dist(c.x, c.y, G.player.x, G.player.y) < 420) { near = true; break; }
      }
    }
    if (!near) {
      pol.decayTimer += dt;
      if (pol.decayTimer > 8) {
        pol.decayTimer = 0;
        pol.wanted = Math.max(0, pol.wanted - 1);
        if (pol.wanted < 1) G.audio.siren(false);
      }
    }
  }

  if (wanted < 1) return;

  // Maintain the police presence for the wanted level.
  pol.spawnTimer -= dt;
  if (pol.spawnTimer <= 0) {
    pol.spawnTimer = 1.2;
    let foot = 0;
    let cruisers = 0;
    for (const p of G.peds) if (p.isCop && !p.dead) foot++;
    for (const c of G.cars) if (c.isPolice && !c.dead && c.driver === 'police') cruisers++;
    const wantFoot = Math.min(wanted * 2, 6);
    const wantCruisers = Math.min(wanted, 3);
    if (foot < wantFoot) spawnCopFoot(G);
    else if (cruisers < wantCruisers) spawnCruiser(G);
  }

  // Cruiser pursuit: steer toward the player and ram.
  for (const c of G.cars) {
    if (!c.isPolice || c.dead || c.driver !== 'police') continue;
    const d = dist(c.x, c.y, G.player.x, G.player.y);
    if (d > 1300) {
      c.dead = true; // gave up, too far away
      continue;
    }
    const target = angleTo(c.x, c.y, G.player.x, G.player.y);
    const diff = ((target - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    c.control.steer = clamp(diff * 2.4, -1, 1);
    c.control.throttle = d > 60 ? 1 : 0.4;
    // Ram: if close and the player is in a car, push hard.
    if (d < 90 && G.player.inCar) {
      c.control.throttle = 1;
    }
  }
}

export function busted(G) {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  G.audio.siren(false);
  G.audio.busted();
  G.hud.showBusted(G);
}

export function wasted(G) {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  G.audio.siren(false);
  G.audio.busted();
  G.hud.showWasted(G);
}
