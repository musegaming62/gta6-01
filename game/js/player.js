// Solmar — the player: on foot (walk, sprint, aim, shoot, punch) and behind the wheel
// (arcade car physics with drift and handbrake). E steals and exits cars.
import { G, WORLD } from './state.js';
import { clamp, dist, angleTo, angleDiff, TAU } from './utils.js';
import { axis } from './input.js';
import { collideBuildings, clampToWorld } from './world.js';
import { fireBullet } from './combat.js';
import { spawnSkid, spawnSmoke } from './particles.js';
import { sfxShoot, sfxPunch, sfxPickup, updateEngine } from './audio.js';
import { addWanted } from './wanted.js';
import { scarePeds } from './peds.js';
import { damageCar, CAR_MODELS } from './cars.js';

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    car: null, // the car being driven, or null on foot
    shootTimer: 0, punchTimer: 0, punchCooldown: 0,
    walkPhase: 0, moving: false,
  };
}

function nearestCar(maxDist) {
  const p = G.player;
  let best = null, bd = maxDist;
  for (const car of G.cars) {
    if (car.wreck) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(car) {
  const p = G.player;
  if (!car || p.car) return;
  const wasParkedOrTraffic = car.kind === 'traffic' || car.kind === 'parked';
  p.car = car;
  car.kind = 'player';
  p.angle = car.angle;
  if (wasParkedOrTraffic) {
    G.stats.carsStolen++;
    addWanted(1, 'You stole a car');
    scarePeds(car.x, car.y, 160);
  }
}

export function exitCar() {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.speed = 0;
  car.kind = 'parked';
  // Step out to the side.
  const side = Math.PI / 2;
  p.x = car.x + Math.cos(car.angle + side) * 26;
  p.y = car.y + Math.sin(car.angle + side) * 26;
  p.angle = car.angle;
  p.car = null;
  clampToWorld(p);
  collideBuildings(G.city, p, 10);
}

function updateOnFoot(dt) {
  const p = G.player;
  const a = axis();
  const sprint = G.keys['shift'];
  const speed = sprint ? 300 : 195;
  const mx = a.x, my = a.y;
  const len = Math.hypot(mx, my) || 1;
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.walkPhase += dt * 11;
  }
  // Face the mouse.
  p.angle = angleTo(p.x, p.y, G.mouse.wx, G.mouse.wy);
  collideBuildings(G.city, p, 10);
  clampToWorld(p);

  // Shooting: hold to fire, limited by ammo and fire rate.
  p.shootTimer -= dt;
  if (G.mouse.down && p.shootTimer <= 0 && G.ammo > 0) {
    p.shootTimer = 0.22;
    G.ammo--;
    G.stats.shots++;
    fireBullet(p.x, p.y, p.angle, true);
    sfxShoot();
    G.shake = Math.max(G.shake, 1.5);
    scarePeds(p.x, p.y, 260);
    if (G.wanted < 1) addWanted(1, 'Shots fired');
  }

  // Punch: short range, no ammo, knocks people down.
  p.punchCooldown -= dt;
  if (G.keys[' '] && p.punchCooldown <= 0) {
    p.punchCooldown = 0.45;
    p.punchTimer = 0.18;
    sfxPunch();
    const hx = p.x + Math.cos(p.angle) * 26;
    const hy = p.y + Math.sin(p.angle) * 26;
    for (const ped of G.peds) {
      if (ped.state !== 'down' && dist(hx, hy, ped.x, ped.y) < 18) {
        ped.state = 'down'; ped.health = 0;
        addWanted(1, 'You beat up a pedestrian');
      }
    }
    for (const n of G.npcs) {
      if ((n.kind === 'gang' || n.kind === 'cop') && n.health > 0 && dist(hx, hy, n.x, n.y) < 20) {
        n.health -= 25;
      }
    }
  }
  if (p.punchTimer > 0) p.punchTimer -= dt;
}

function updateDriving(dt) {
  const p = G.player;
  const car = p.car;
  if (!car || car.wreck) {
    if (car && car.wreck) {
      // The car blew up under you: get out, hurt.
      p.car = null;
      p.x = car.x + 30; p.y = car.y + 30;
      G.health = Math.max(1, G.health - 25);
    }
    return;
  }
  const m = CAR_MODELS[car.model];
  const a = axis();
  const handbrake = !!G.keys[' '];

  // Throttle: W accelerates forward, S brakes then reverses.
  if (a.y < 0) car.speed += m.accel * dt;
  else if (a.y > 0) {
    if (car.speed > 20) car.speed -= m.accel * 1.4 * dt;
    else car.speed -= m.accel * 0.55 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  car.speed = clamp(car.speed, -160, m.maxSpeed);

  // Steering scales with speed; handbrake sharpens it and bleeds speed.
  const steerInput = a.x;
  const speedFactor = clamp(Math.abs(car.speed) / 220, 0, 1);
  const steerRate = (handbrake ? 3.4 : 2.1) * speedFactor;
  car.angle += steerInput * steerRate * dt * (car.speed >= 0 ? 1 : -1);
  if (handbrake) {
    car.speed *= 1 - 1.6 * dt;
    if (Math.abs(car.speed) > 150 && Math.abs(steerInput) > 0.2) {
      spawnSkid(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, car.angle);
    }
  }

  const prevX = car.x, prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (collideBuildings(G.city, car, 18)) {
    const impact = Math.abs(car.speed);
    if (impact > 180) {
      damageCar(car, Math.floor(impact / 28));
      G.shake = Math.max(G.shake, 5);
      spawnSmoke(car.x, car.y, 3);
      if (impact > 260) addWanted(0, '');
    }
    car.speed *= 0.4;
    car.x = prevX; car.y = prevY;
    collideBuildings(G.city, car, 18);
  }
  clampToWorld(car);

  // Running over pedestrians.
  for (const ped of G.peds) {
    if (ped.state !== 'down' && Math.abs(car.speed) > 120 && dist(ped.x, ped.y, car.x, car.y) < 24) {
      ped.state = 'down'; ped.health = 0;
      addWanted(1, 'You ran over a pedestrian');
    }
  }

  p.x = car.x; p.y = car.y;
  p.angle = car.angle;
  updateEngine(clamp(Math.abs(car.speed) / m.maxSpeed, 0, 1), true);
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  if (p.car) updateDriving(dt);
  else {
    updateOnFoot(dt);
    updateEngine(0, false);
  }

  // Pickups.
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) < 26) {
      if (pk.kind === 'health') G.health = clamp(G.health + 40, 0, G.maxHealth);
      else if (pk.kind === 'ammo') G.ammo = clamp(G.ammo + 24, 0, G.maxAmmo);
      else if (pk.kind === 'cash') G.money += pk.amount;
      sfxPickup();
      G.pickups.splice(i, 1);
    }
  }
}

export function tryEnterExit() {
  const p = G.player;
  if (p.car) { exitCar(); return; }
  const car = nearestCar(46);
  if (car) enterCar(car);
}

export function drawPlayer(ctx) {
  const p = G.player;
  if (!p || p.car) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 3, 9, 6, 0, 0, TAU); ctx.fill();
  ctx.rotate(p.angle + Math.PI / 2);
  const bob = p.moving ? Math.sin(p.walkPhase) * 1.6 : 0;
  // Legs.
  ctx.fillStyle = '#2b2d42';
  ctx.fillRect(-3.4, 2 + bob * 0.5, 3, 9);
  ctx.fillRect(0.4, 2 - bob * 0.5, 3, 9);
  // Jacket (Danny's red jacket).
  ctx.fillStyle = '#c44536';
  ctx.fillRect(-5, -7, 10, 10);
  ctx.fillStyle = '#f4f1de';
  ctx.fillRect(-5, -7, 10, 2.5);
  // Head.
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath(); ctx.arc(0, -10, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2d42';
  ctx.beginPath(); ctx.arc(0, -11.5, 5, Math.PI, 0); ctx.fill();
  // Gun.
  ctx.fillStyle = '#222';
  ctx.fillRect(3, -14, 3, 12);
  // Punch.
  if (p.punchTimer > 0) {
    ctx.fillStyle = '#e0ac69';
    ctx.beginPath(); ctx.arc(0, -20, 4.5, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // Crosshair at the mouse.
  const mx = G.mouse.x, my = G.mouse.y;
  const cam = G.camera;
  const sx = (G.mouse.wx - cam.x) * cam.zoom + 640;
  const sy = (G.mouse.wy - cam.y) * cam.zoom + 400;
  void mx; void my;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(sx, sy, 9, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 13, sy); ctx.lineTo(sx - 5, sy);
  ctx.moveTo(sx + 5, sy); ctx.lineTo(sx + 13, sy);
  ctx.moveTo(sx, sy - 13); ctx.lineTo(sx, sy - 5);
  ctx.moveTo(sx, sy + 5); ctx.lineTo(sx, sy + 13);
  ctx.stroke();
}

export function playerScreenPos() {
  return { x: G.player ? G.player.x : 0, y: G.player ? G.player.y : 0 };
}
