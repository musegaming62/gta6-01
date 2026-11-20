// The wanted system and police for Solmar: stars scale the response, foot cops
// chase and shoot (only with a clear line of sight), cruisers ram, and getting
// caught on foot means BUSTED.

import { clamp, rand, dist, angleTo, turnToward, TWO_PI } from './util.js';
import { resolveCircle, segmentHitsBuilding, randomRoadPoint } from './world.js';
import { spawnBullet } from './combat.js';
import { spawnCar } from './cars.js';
import { setSiren, playBusted } from './audio.js';
import { spawnBurst } from './particles.js';

export function addWanted(state, amount) {
  if (state.mode !== 'playing') return;
  const before = state.wanted;
  state.wanted = clamp(state.wanted + amount, 0, 5);
  state.wantedTimer = 0;
  if (state.wanted >= 1 && before < 1) setSiren(true);
}

function wantedStars(state) {
  return Math.floor(state.wanted);
}

export function updatePolice(state, dt) {
  const stars = wantedStars(state);
  // Wanted decays after a quiet spell out of sight.
  if (stars > 0) {
    state.wantedTimer += dt;
    const nearestCop = nearestCopDist(state);
    if (state.wantedTimer > 14 && nearestCop > 500) {
      state.wanted = Math.max(0, state.wanted - dt * 0.25);
      if (state.wanted < 1) setSiren(false);
    }
  }
  if (stars === 0) {
    // No heat: cops stand down and wander off.
    for (let i = state.cops.length - 1; i >= 0; i--) {
      const cop = state.cops[i];
      cop.x += Math.cos(cop.angle) * 40 * dt;
      cop.y += Math.sin(cop.angle) * 40 * dt;
      if (dist(cop.x, cop.y, state.player.x, state.player.y) > 700) state.cops.splice(i, 1);
    }
    return;
  }
  const player = state.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  // Spawn foot cops up to the star cap.
  const footCap = Math.min(2 + stars, 7);
  if (state.cops.length < footCap && Math.random() < dt * (0.5 + stars * 0.35)) {
    const p = randomRoadPoint();
    // Spawn near the player but off-screen.
    const a = rand(TWO_PI);
    const sx = px + Math.cos(a) * rand(420, 560);
    const sy = py + Math.sin(a) * rand(420, 560);
    state.cops.push({
      x: clamp(sx, 30, 3170), y: clamp(sy, 30, 3170),
      angle: angleTo(sx, sy, px, py),
      hp: 40, shootTimer: rand(0.6, 1.4),
    });
  }
  // Spawn cruisers up to the star cap.
  const cruiserCap = stars >= 2 ? Math.min(stars - 1, 3) : 0;
  let cruisers = 0;
  for (const car of state.cars) if (car.isPolice && !car.dead) cruisers++;
  if (cruisers < cruiserCap && Math.random() < dt * 0.5) {
    const a = rand(TWO_PI);
    const sx = px + Math.cos(a) * rand(500, 650);
    const sy = py + Math.sin(a) * rand(500, 650);
    const sp = randomRoadPoint();
    spawnCar(state, 'cruiser', sp.x, sp.y, 0, { isPolice: true, isTraffic: false });
  }
  // Foot cops: chase, shoot with line of sight, and bust the player.
  for (let i = state.cops.length - 1; i >= 0; i--) {
    const cop = state.cops[i];
    if (cop.hp <= 0) {
      spawnBurst(state, cop.x, cop.y, { count: 8, color: '#22364f', speed: 90, life: 0.5, size: 3 });
      addWanted(state, 1);
      state.cops.splice(i, 1);
      continue;
    }
    const d = dist(cop.x, cop.y, px, py);
    cop.angle = turnToward(cop.angle, angleTo(cop.x, cop.y, px, py), 4 * dt);
    if (d > 26) {
      const speed = 150 + stars * 14;
      cop.x += Math.cos(cop.angle) * speed * dt;
      cop.y += Math.sin(cop.angle) * speed * dt;
    }
    const fixed = resolveCircle(state.city, cop.x, cop.y, 10);
    cop.x = fixed.x;
    cop.y = fixed.y;
    // Shoot only with a clear line of sight.
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0 && d < 430 && d > 40) {
      cop.shootTimer = rand(1.2, 1.9);
      if (!segmentHitsBuilding(state.city, cop.x, cop.y, px, py)) {
        spawnBullet(state, cop.x, cop.y, cop.angle + (Math.random() - 0.5) * 0.12, { from: 'cop', speed: 560, dmg: 6 });
      }
    }
    // Busted: caught on foot by a cop while wanted.
    if (!player.inCar && d < 30 && stars >= 1) {
      state.bustTimer += dt;
      if (state.bustTimer > 2) {
        bustPlayer(state);
        return;
      }
    } else {
      state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
    }
  }
  // Cruisers ram the player's car (or chase on foot position).
  for (const car of state.cars) {
    if (!car.isPolice || car.dead || car.isPlayer) continue;
    const d = dist(car.x, car.y, px, py);
    const target = angleTo(car.x, car.y, px, py);
    let da = target - car.angle;
    while (da > Math.PI) da -= TWO_PI;
    while (da < -Math.PI) da += TWO_PI;
    car.angle += clamp(da, -2.6 * dt, 2.6 * dt);
    const speed = d > 120 ? 330 + stars * 20 : 200;
    car.vx = Math.cos(car.angle) * speed;
    car.vy = Math.sin(car.angle) * speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    const fixed = resolveCircle(state.city, car.x, car.y, 17);
    car.x = fixed.x;
    car.y = fixed.y;
    // Ram damage on contact with the player's car.
    if (player.inCar && d < 40) {
      player.inCar.hp -= 12 * dt * 4;
      player.inCar.vx += Math.cos(car.angle) * 60 * dt;
      player.inCar.vy += Math.sin(car.angle) * 60 * dt;
    }
  }
}

function nearestCopDist(state) {
  let best = 9999;
  for (const cop of state.cops) {
    best = Math.min(best, dist(cop.x, cop.y, state.player.x, state.player.y));
  }
  for (const car of state.cars) {
    if (car.isPolice) best = Math.min(best, dist(car.x, car.y, state.player.x, state.player.y));
  }
  return best;
}

function bustPlayer(state) {
  state.mode = 'busted';
  setSiren(false);
  playBusted();
}

export function drawCops(ctx, state, cam) {
  for (const cop of state.cops) {
    const sx = cop.x - cam.x;
    const sy = cop.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(cop.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 9, 7, 0, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#22364f';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#e8c88a';
    ctx.beginPath();
    ctx.arc(5, 0, 5, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#22364f';
    ctx.fillRect(2, -5, 6, 10);
    ctx.fillStyle = '#111';
    ctx.fillRect(8, -1.5, 11, 3);
    ctx.restore();
  }
}
