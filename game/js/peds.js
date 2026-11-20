// Pedestrians for Solmar: sidewalk walkers, crosswalk crossers, fleeing civilians
// and gang members who attack on sight during the Payback mission.

import { clamp, rand, choice, dist, angleTo, turnToward, TWO_PI } from './util.js';
import { resolveCircle, randomSidewalkPoint, segmentHitsBuilding } from './world.js';
import { spawnBurst } from './particles.js';
import { spawnBullet } from './combat.js';

const SHIRT_COLORS = ['#d46a4a', '#4a7ad4', '#4ad47a', '#d4b84a', '#9a4ad4', '#e8e8e8', '#3a3a3a', '#c25a7a'];
const PANTS_COLORS = ['#2a3a4a', '#4a4a4a', '#6a5a3a', '#3a5a6a'];

let nextPedId = 1;

export function spawnPed(state, x, y, opts) {
  const o = opts || {};
  const ped = {
    id: nextPedId++,
    x, y,
    angle: rand(TWO_PI),
    speed: o.speed || rand(34, 62),
    hp: o.gang ? 60 : 30,
    gang: !!o.gang,
    fleeing: false,
    dead: false,
    target: null,
    wanderTimer: rand(1, 4),
    shootTimer: rand(0.8, 1.6),
    shirt: o.gang ? '#3a1a2a' : choice(SHIRT_COLORS),
    pants: o.gang ? '#1a1a1a' : choice(PANTS_COLORS),
    skin: choice(['#e8b88a', '#c98d5a', '#8a5a3a', '#f0c8a0']),
  };
  state.peds.push(ped);
  return ped;
}

// Civilians within earshot of gunfire run away from it.
export function scarePeds(state, x, y, radius) {
  for (const p of state.peds) {
    if (p.gang || p.dead) continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.fleeing = true;
      p.target = { x: p.x + (p.x - x), y: p.y + (p.y - y) };
    }
  }
}

export function updatePeds(state, dt) {
  const player = state.player;
  for (let i = state.peds.length - 1; i >= 0; i--) {
    const p = state.peds[i];
    if (p.dead || p.hp <= 0) {
      spawnBurst(state, p.x, p.y, { count: 8, color: '#cc2222', speed: 90, life: 0.5, size: 3 });
      state.peds.splice(i, 1);
      continue;
    }
    if (p.gang) {
      // Gang members hunt the player during Payback.
      const d = dist(p.x, p.y, player.x, player.y);
      const wantShoot = state.mission.index === 3 && !state.mission.done;
      if (wantShoot && d < 520) {
        p.angle = turnToward(p.angle, angleTo(p.x, p.y, player.x, player.y), 3 * dt);
        if (d > 90) {
          p.x += Math.cos(p.angle) * 95 * dt;
          p.y += Math.sin(p.angle) * 95 * dt;
        }
        p.shootTimer -= dt;
        if (p.shootTimer <= 0 && d < 420 && !segmentHitsBuilding(state.city, p.x, p.y, player.x, player.y)) {
          p.shootTimer = rand(1.1, 1.8);
          spawnBullet(state, p.x, p.y, p.angle, { from: 'gang', speed: 520, dmg: 7 });
        }
      } else {
        // Idle gang member: loiter near the turf.
        p.wanderTimer -= dt;
        if (p.wanderTimer <= 0) {
          p.wanderTimer = rand(2, 5);
          p.angle = rand(TWO_PI);
        }
        p.x += Math.cos(p.angle) * 14 * dt;
        p.y += Math.sin(p.angle) * 14 * dt;
      }
    } else if (p.fleeing && p.target) {
      p.angle = turnToward(p.angle, angleTo(p.x, p.y, p.target.x, p.target.y), 6 * dt);
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
      if (dist(p.x, p.y, player.x, player.y) > 420) {
        p.fleeing = false;
        p.target = null;
      }
    } else {
      // Wander the sidewalks; cross roads at random.
      p.wanderTimer -= dt;
      if (p.wanderTimer <= 0) {
        p.wanderTimer = rand(2, 6);
        p.angle = rand(TWO_PI);
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
    }
    const fixed = resolveCircle(state.city, p.x, p.y, 10);
    p.x = fixed.x;
    p.y = fixed.y;
    // Keep peds in the world and near the player (respawn far ones).
    if (p.x < 20 || p.x > 3180 || p.y < 20 || p.y > 3180) {
      const sp = randomSidewalkPoint();
      p.x = clamp(sp.x, 40, 3160);
      p.y = clamp(sp.y, 40, 3160);
      p.fleeing = false;
    }
  }
}

export function drawPeds(ctx, state, cam) {
  for (const p of state.peds) {
    const sx = p.x - cam.x;
    const sy = p.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(p.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 9, 7, 0, 0, TWO_PI);
    ctx.fill();
    // Body (shirt) and legs.
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = p.pants;
    ctx.fillRect(-9, -3, 5, 6);
    // Head.
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, TWO_PI);
    ctx.fill();
    if (p.gang) {
      // Red bandana stripe.
      ctx.fillStyle = '#cc2222';
      ctx.fillRect(0, -5, 6, 10);
      // Gun.
      ctx.fillStyle = '#222';
      ctx.fillRect(6, -1, 8, 2);
    }
    ctx.restore();
  }
}
