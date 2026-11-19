// Solmar — combat: bullets, muzzle flashes, damage to people and cars, explosions.
import { G } from './state.js';
import { dist, angleTo, TAU } from './utils.js';
import { solidAt } from './world.js';
import { spawnSparks, spawnMuzzle, spawnSmoke } from './particles.js';
import { sfxHit } from './audio.js';
import { damageCar } from './cars.js';

export function fireBullet(x, y, angle, fromPlayer) {
  G.bullets.push({
    x: x + Math.cos(angle) * 18, y: y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * 720, vy: Math.sin(angle) * 720,
    life: 0, maxLife: 0.9, fromPlayer,
  });
  spawnMuzzle(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, angle);
}

export function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life >= b.maxLife;

    // Buildings stop bullets.
    if (!dead && solidAt(G.city, b.x, b.y)) {
      spawnSparks(b.x, b.y, 3);
      dead = true;
    }

    // Cars.
    if (!dead) {
      for (const car of G.cars) {
        if (car.wreck) continue;
        if (dist(b.x, b.y, car.x, car.y) < 22) {
          damageCar(car, b.fromPlayer ? 12 : 6);
          spawnSparks(b.x, b.y, 4);
          dead = true;
          break;
        }
      }
    }

    // People.
    if (!dead) {
      const p = G.player;
      if (!b.fromPlayer && p && !p.car && dist(b.x, b.y, p.x, p.y) < 10) {
        hurtPlayer(9);
        dead = true;
      }
      if (dead) { /* player hit */ }
      else {
        for (const npc of G.npcs) {
          if (npc.health <= 0) continue;
          if (dist(b.x, b.y, npc.x, npc.y) < 10) {
            npc.health -= b.fromPlayer ? 34 : 10;
            spawnSparks(b.x, b.y, 4);
            sfxHit();
            if (b.fromPlayer) G.stats.hits++;
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of G.peds) {
          if (ped.state === 'down') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 9) {
            ped.state = 'down';
            ped.health = 0;
            spawnSparks(b.x, b.y, 5);
            if (b.fromPlayer) {
              import('./wanted.js').then((m) => m.addWanted(1, 'You shot a pedestrian'));
            }
            dead = true;
            break;
          }
        }
      }
    }

    if (dead) G.bullets.splice(i, 1);
  }
}

export function hurtPlayer(amount) {
  if (G.mode !== 'playing') return;
  G.health -= amount;
  G.shake = Math.max(G.shake, 4);
  sfxHit();
  if (G.health <= 0) {
    G.health = 0;
    G.mode = 'wasted';
    G.endReason = 'You were wasted. The ambulance patched you up — minus $200.';
    G.money = Math.max(0, G.money - 200);
  }
}

export function drawBullets(ctx) {
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 2;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// A wrecked car near the player smokes; called from the main loop.
export function updateWrecks(dt) {
  void dt;
  for (const car of G.cars) {
    if (car.wreck && Math.random() < dt * 2) spawnSmoke(car.x, car.y, 1);
  }
}

export function carAimAngle(fromX, fromY, toX, toY) { return angleTo(fromX, fromY, toX, toY); }
export function aimAngleDeg(a) { return (a * 180) / Math.PI; }
export { TAU };
