// Solmar — combat. Bullets, shooting, and damage. The player, police and
// gang members all fire through here; hits are resolved against peds, cops,
// cars and the player. Operates on S directly so no import cycle forms.

import { S } from './state.js';
import { dist, dist2 } from './util.js';
import { solidAt } from './world.js';
import { muzzle, blood, sparks } from './particles.js';
import { sfxShoot, sfxEnemyShoot, sfxHurt } from './audio.js';
import { damagePed } from './peds.js';
import { damageCar } from './cars.js';

export function fireBullet(x, y, angle, from, dmg, speed) {
  const spread = from === 'player' ? 0.05 : 0.16;
  const a = angle + (Math.random() - 0.5) * 2 * spread;
  S.bullets.push({
    x: x + Math.cos(a) * 16, y: y + Math.sin(a) * 16,
    vx: Math.cos(a) * (speed || 780), vy: Math.sin(a) * (speed || 780),
    life: 0.9, from, dmg: dmg || 20,
  });
  muzzle(x + Math.cos(a) * 16, y + Math.sin(a) * 16, a);
  if (from === 'player') sfxShoot();
  else sfxEnemyShoot();
}

export function damagePlayer(amount) {
  const p = S.player;
  if (!p || S.mode !== 'playing') return;
  p.hp -= amount;
  p.hurtT = 0.35;
  sfxHurt();
  if (p.hp <= 0) {
    p.hp = 0;
    S.mode = 'wasted';
    S.failedReason = 'wasted';
  }
}

function hitCircle(b, x, y, r) {
  return dist2(b.x, b.y, x, y) < r * r;
}

export function updateBullets(dt) {
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && solidAt(b.x, b.y, 2)) {
      sparks(b.x, b.y, 3);
      dead = true;
    }
    if (!dead && b.from !== 'player') {
      // Enemy bullets vs the player.
      const p = S.player;
      if (p && !p.inCar && hitCircle(b, p.x, p.y, 12)) {
        damagePlayer(b.dmg);
        blood(p.x, p.y);
        dead = true;
      } else if (p && p.inCar && hitCircle(b, p.inCar.x, p.inCar.y, 22)) {
        p.inCar.hp -= b.dmg * 0.4;
        sparks(p.inCar.x, p.inCar.y, 2);
        dead = true;
      }
    }
    if (!dead && b.from === 'player') {
      // Player bullets vs peds, cops and cars.
      for (const p of S.peds) {
        if (p.state !== 'down' && hitCircle(b, p.x, p.y, 12)) {
          damagePed(p, b.dmg);
          blood(p.x, p.y);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const c of S.cops) {
          if (c.state !== 'down' && hitCircle(b, c.x, c.y, 12)) {
            damageCop(c, b.dmg);
            blood(c.x, c.y);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of S.cars) {
          if (car.dead) continue;
          if (hitCircle(b, car.x, car.y, 24)) {
            damageCar(car, b.dmg * 0.5, b.x, b.y);
            sparks(car.x, car.y, 2);
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) S.bullets.splice(i, 1);
  }
}

// Cops live in S.cops (police.js owns them); damage is applied here so both
// shooters share one code path.
export function damageCop(c, amount) {
  if (c.state === 'down') return;
  c.hp -= amount;
  if (c.hp <= 0) {
    c.hp = 0;
    c.state = 'down';
    c.downT = 8;
    S.stats.kills++;
  }
}

export function drawBullets(ctx) {
  ctx.strokeStyle = '#ffe27a';
  ctx.lineWidth = 2;
  for (const b of S.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
