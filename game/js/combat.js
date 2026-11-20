// Combat for Solmar: bullets, line-of-sight hits and explosions.

import { dist } from './util.js';
import { segmentHitsBuilding, pointInBuilding } from './world.js';
import { spawnBurst, addShake } from './particles.js';
import { playExplosion } from './audio.js';
import { damageCarAt } from './cars.js';

export function spawnBullet(state, x, y, angle, opts) {
  const o = opts || {};
  const speed = o.speed || 780;
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    from: o.from || 'player',
    dmg: o.dmg || 12,
    life: o.life || 1.1,
  });
}

export function updateBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    // Building hit: stop the bullet with a spark.
    if (!dead && segmentHitsBuilding(state.city, b.x, b.y, nx, ny)) {
      spawnBurst(state, nx, ny, { count: 4, color: '#ffdd88', speed: 80, life: 0.3, size: 2 });
      dead = true;
    }
    if (!dead) {
      // Hit a car.
      for (const car of state.cars) {
        if (car.dead) continue;
        if (dist(nx, ny, car.x, car.y) < 20) {
          damageCarAt(state, car, b.dmg);
          if (b.from === 'player') state.stats.hits++;
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.from !== 'player') {
      // Enemy bullet vs the player.
      const p = state.player;
      if (!p.inCar && dist(nx, ny, p.x, p.y) < 13) {
        p.hp -= b.dmg;
        p.lastDamage = state.time;
        spawnBurst(state, p.x, p.y, { count: 6, color: '#cc2222', speed: 100, life: 0.4, size: 3 });
        dead = true;
      } else if (p.inCar && dist(nx, ny, p.inCar.x, p.inCar.y) < 20) {
        damageCarAt(state, p.inCar, b.dmg * 0.5);
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      // Player bullet vs peds and cops.
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (dist(nx, ny, ped.x, ped.y) < 12) {
          ped.hp -= b.dmg;
          state.stats.hits++;
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of state.cops) {
          if (dist(nx, ny, cop.x, cop.y) < 12) {
            cop.hp -= b.dmg;
            state.stats.hits++;
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) {
      state.bullets.splice(i, 1);
    } else {
      b.x = nx;
      b.y = ny;
    }
  }
}

export function explodeAt(state, x, y, radius) {
  spawnBurst(state, x, y, { count: 36, color: '#ff8833', speed: 300, life: 0.8, size: 5 });
  spawnBurst(state, x, y, { count: 16, color: '#ffdd55', speed: 200, life: 0.5, size: 4 });
  addShake(state, 10);
  playExplosion();
  for (const ped of state.peds) {
    if (dist(ped.x, ped.y, x, y) < radius) ped.hp -= 70;
  }
  for (const cop of state.cops) {
    if (dist(cop.x, cop.y, x, y) < radius) cop.hp -= 70;
  }
  for (const car of state.cars) {
    if (dist(car.x, car.y, x, y) < radius) damageCarAt(state, car, 60);
  }
  if (!state.player.inCar && dist(state.player.x, state.player.y, x, y) < radius) {
    state.player.hp -= 30;
    state.player.lastDamage = state.time;
  }
}

export function drawBullets(ctx, state, cam) {
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of state.bullets) {
    ctx.moveTo(b.x - cam.x, b.y - cam.y);
    ctx.lineTo(b.x - b.vx * 0.02 - cam.x, b.y - b.vy * 0.02 - cam.y);
  }
  ctx.stroke();
}
