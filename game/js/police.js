// Solmar — the wanted system and the police. Wanted 0-5 stars; crimes raise
// it, quiet time lowers it. Foot cops chase and shoot; cruisers ram. A cop
// that stands next to the player on foot for long enough makes a bust.

import { S, WORLD } from './state.js';
import { clamp, rand, angleTo, turnToward, dist } from './util.js';
import { resolveCircle, ROAD_X, ROAD_Y, segmentHitsBuilding } from './world.js';
import { makeCar } from './cars.js';
import { fireBullet } from './combat.js';
import { blood, sparks } from './particles.js';

let uid = 1;

export function addWanted(n) {
  S.wanted = clamp(S.wanted + n, 0, 5);
  S.lastCrime = S.time;
  S.wantedQuiet = 0;
}

export function setWanted(n) {
  S.wanted = clamp(n, 0, 5);
  S.lastCrime = S.time;
  S.wantedQuiet = 0;
}

export function makeCop(x, y) {
  return {
    id: uid++, x, y, angle: rand(0, Math.PI * 2),
    hp: 50, state: 'chase', // chase | attack | down
    speed: 118, shootT: rand(0.4, 1.2), downT: 0, bustT: 0, hitT: 0,
  };
}

function spawnCop() {
  const p = S.player;
  const a = Math.random() * Math.PI * 2;
  const d = 620 + Math.random() * 260;
  const x = clamp(p.x + Math.cos(a) * d, 60, WORLD - 60);
  const y = clamp(p.y + Math.sin(a) * d, 60, WORLD - 60);
  const c = makeCop(x, y);
  S.cops.push(c);
  return c;
}

function spawnCruiser() {
  const p = S.player;
  const vertical = Math.random() < 0.5;
  const road = vertical
    ? ROAD_X[Math.floor(Math.random() * ROAD_X.length)]
    : ROAD_Y[Math.floor(Math.random() * ROAD_Y.length)];
  const along = clamp((vertical ? p.y : p.x) + (Math.random() < 0.5 ? -700 : 700), 120, WORLD - 120);
  const c = makeCar('police', vertical ? road : along, vertical ? along : road, vertical ? Math.PI / 2 : 0);
  c.driver = true;
  c.traffic = null;
  c.policeChase = true;
  S.cars.push(c);
  return c;
}

export function updatePolice(dt) {
  const p = S.player;
  if (!p) return;
  // Wanted decays after a long quiet stretch with no police nearby.
  if (S.wanted > 0 && S.time - S.lastCrime > 18) {
    let near = false;
    for (const c of S.cops) if (dist(c.x, c.y, p.x, p.y) < 420) { near = true; break; }
    if (!near) {
      for (const car of S.cars) {
        if (car.policeChase && dist(car.x, car.y, p.x, p.y) < 420) { near = true; break; }
      }
    }
    if (!near) {
      S.wantedQuiet += dt;
      if (S.wantedQuiet > 9) {
        S.wantedQuiet = 0;
        S.wanted = Math.max(0, S.wanted - 1);
      }
    } else {
      S.wantedQuiet = 0;
    }
  }

  // Keep the force at the right strength for the wanted level.
  if (S.wanted > 0 && S.mode === 'playing') {
    const wantFoot = Math.min(2 + S.wanted, 7);
    const wantCars = Math.min(Math.ceil(S.wanted / 2), 3);
    let foot = 0, cars = 0;
    for (const c of S.cops) if (c.state !== 'down') foot++;
    for (const car of S.cars) if (car.policeChase && !car.dead) cars++;
    if (foot < wantFoot && Math.random() < dt * 1.5) spawnCop();
    if (cars < wantCars && Math.random() < dt * 1.2) spawnCruiser();
  }

  // Foot cops: chase, then shoot in range; bust on contact.
  for (const c of S.cops) {
    if (c.state === 'down') {
      c.downT -= dt;
      if (c.downT <= 0) { c.state = 'chase'; c.hp = 50; }
      continue;
    }
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < 420) {
      c.angle = turnToward(c.angle, angleTo(c.x, c.y, p.x, p.y), 6 * dt);
      if (d > 30) {
        c.x += Math.cos(c.angle) * c.speed * dt;
        c.y += Math.sin(c.angle) * c.speed * dt;
        resolveCircle(c, 11);
      }
      if (d < 200) {
        c.shootT -= dt;
        // Cops cannot shoot through buildings: no line of sight, no shot.
        if (c.shootT <= 0 && !segmentHitsBuilding(c.x, c.y, p.x, p.y)) {
          c.shootT = 1.1 + Math.random() * 0.8;
          fireBullet(c.x, c.y, c.angle, 'cop', 6, 620);
        }
      }
      // Bust: a cop standing on the player on foot.
      if (!p.inCar && d < 34) {
        c.bustT += dt;
        if (c.bustT > 2.0) {
          S.mode = 'busted';
          S.failedReason = 'busted';
          return;
        }
      } else {
        c.bustT = 0;
      }
    } else {
      // Too far: walk back toward the player anyway.
      c.angle = turnToward(c.angle, angleTo(c.x, c.y, p.x, p.y), 4 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      resolveCircle(c, 11);
    }
  }

  // Police cruisers: chase the player's position and ram.
  for (const car of S.cars) {
    if (!car.policeChase || car.dead) continue;
    const d = dist(car.x, car.y, p.x, p.y);
    const want = angleTo(car.x, car.y, p.x, p.y);
    car.angle = turnToward(car.angle, want, 2.6 * dt);
    const speed = d > 90 ? 430 : 300;
    car.x += Math.cos(car.angle) * speed * dt;
    car.y += Math.sin(car.angle) * speed * dt;
    // Ram the player's car.
    if (p.inCar && dist(car.x, car.y, p.inCar.x, p.inCar.y) < 34) {
      p.inCar.hp -= 12 * dt;
      p.inCar.x += Math.cos(car.angle) * 40 * dt;
      p.inCar.y += Math.sin(car.angle) * 40 * dt;
      if (Math.random() < dt * 6) sparks(p.inCar.x, p.inCar.y, 2);
    }
    // Despawn far away when the heat is off.
    if (S.wanted === 0 && d > 1400) car.dead = true;
  }
  // Drop far-away downed cops.
  S.cops = S.cops.filter((c) => !(c.state === 'down' && dist(c.x, c.y, p.x, p.y) > 1200));
  if (S.cops.length > 12) S.cops.length = 12;
}

export function drawCops(ctx) {
  for (const c of S.cops) {
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.state === 'down') {
      ctx.rotate(c.angle + Math.PI / 2);
      ctx.fillStyle = '#1a2a6b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(c.angle);
    // Navy uniform + cap + gun.
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f2040';
    ctx.beginPath();
    ctx.arc(5, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(7, -2, 10, 3);
    ctx.restore();
  }
}
