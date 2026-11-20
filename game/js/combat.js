// Combat: bullets, hit detection against peds, cars and buildings, and the
// player's shooting. Bullets are fast, short-lived, and blocked by buildings.
import { dist } from './util.js';
import { pointInBuilding } from './world.js';
import { burst, muzzle } from './particles.js';
import { damagePed } from './peds.js';
import { damage } from './player.js';

export function createCombat() {
  return { bullets: [] };
}

export function playerShoot(G, x, y, angle) {
  const c = G.combat;
  if (c.bullets.length > 90) return;
  const speed = 820;
  c.bullets.push({
    x: x + Math.cos(angle) * 18,
    y: y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.9,
    dmg: 20,
    fromPlayer: true,
  });
  muzzle(G.particles, x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, angle);
  G.audio.shot();
}

export function enemyShoot(G, x, y, angle, dmg) {
  const c = G.combat;
  if (c.bullets.length > 90) return;
  const speed = 640;
  c.bullets.push({
    x: x + Math.cos(angle) * 16,
    y: y + Math.sin(angle) * 16,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.9,
    dmg: dmg || 7,
    fromPlayer: false,
  });
}

export function updateCombat(G, dt) {
  const c = G.combat;
  for (let i = c.bullets.length - 1; i >= 0; i--) {
    const b = c.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(G.world, b.x, b.y)) {
      burst(G.particles, b.x, b.y, 3, '#c9c9c9', 90, 0.25, 3);
      dead = true;
    }
    if (!dead && b.fromPlayer) {
      // Hit a pedestrian.
      for (const p of G.peds) {
        if (p.dead || p.down) continue;
        if (dist(b.x, b.y, p.x, p.y) < 13) {
          const wasAlive = !p.dead;
          damagePed(G, p, b.dmg, G.player.x, G.player.y);
          if (wasAlive && p.dead && !p.isGang && !p.isCop) {
            G.police.addWanted(G, 1);
          } else if (wasAlive && p.isCop && p.dead) {
            G.police.addWanted(G, 2);
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.fromPlayer) {
      // Hit a car.
      for (const car of G.cars) {
        if (car.dead) continue;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const ca = Math.cos(-car.angle);
        const sa = Math.sin(-car.angle);
        const lx = dx * ca - dy * sa;
        const ly = dx * sa + dy * ca;
        if (Math.abs(lx) < car.len / 2 + 2 && Math.abs(ly) < car.wid / 2 + 2) {
          car.health -= b.dmg;
          burst(G.particles, b.x, b.y, 4, '#ffb84d', 110, 0.3, 3);
          dead = true;
          break;
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      // Enemy bullet vs the player (on foot only).
      if (!G.player.inCar && dist(b.x, b.y, G.player.x, G.player.y) < 12) {
        damage(G, b.dmg);
        dead = true;
      }
      // Enemy bullet vs the player's car.
      if (!dead && G.player.inCar) {
        const car = G.player.inCar;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const ca = Math.cos(-car.angle);
        const sa = Math.sin(-car.angle);
        const lx = dx * ca - dy * sa;
        const ly = dx * sa + dy * ca;
        if (Math.abs(lx) < car.len / 2 + 2 && Math.abs(ly) < car.wid / 2 + 2) {
          car.health -= b.dmg;
          dead = true;
        }
      }
    }
    if (dead) c.bullets.splice(i, 1);
  }
}

export function drawBullets(ctx, G) {
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  for (const b of G.combat.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
