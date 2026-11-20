// Solmar — pedestrians. Civilians stroll the sidewalks, cross at
// crosswalks, and flee from gunfire. Gang members are armed, hostile, and
// only appear for the Payback mission (and as ambient threats near the turf).

import { S, WORLD } from './state.js';
import { clamp, rand, pick, angleTo, turnToward, dist } from './util.js';
import { resolveCircle, isOnRoad, ROAD_X, ROAD_Y } from './world.js';

let uid = 1;

const SHIRTS = ['#e67e22', '#9b59b6', '#1abc9c', '#e74c3c', '#f39c12', '#3498db', '#fd79a8', '#00b894'];

export function makePed(x, y, gang) {
  return {
    id: uid++, x, y, angle: rand(0, Math.PI * 2),
    hp: gang ? 60 : 30, gang: !!gang,
    speed: gang ? 105 : 42 + rand(0, 26),
    state: 'walk', // walk | flee | down | chase | attack
    tx: x, ty: y, wait: rand(0, 2),
    shirt: gang ? '#8e1616' : pick(SHIRTS),
    skin: pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524']),
    downT: 0, shootT: rand(0.5, 1.5), fleeT: 0, hitT: 0,
  };
}

export function spawnPeds(count) {
  for (let i = 0; i < count; i++) {
    const road = ROAD_X[Math.floor(Math.random() * ROAD_X.length)];
    const along = 250 + Math.random() * 2600;
    const side = Math.random() < 0.5 ? -1 : 1;
    const vertical = Math.random() < 0.5;
    const x = vertical ? road + side * (ROAD_HALF_OFF) : along;
    const y = vertical ? along : road + side * ROAD_HALF_OFF;
    S.peds.push(makePed(x, y, false));
  }
}
const ROAD_HALF_OFF = 82;

export function spawnGang(n, cx, cy) {
  const made = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
    const p = makePed(cx + Math.cos(a) * (60 + rand(0, 70)), cy + Math.sin(a) * (60 + rand(0, 70)), true);
    p.state = 'chase';
    S.peds.push(p);
    made.push(p);
  }
  return made;
}

export function nearestPed(x, y, maxD, gangOnly) {
  let best = null, bestD = maxD * maxD;
  for (const p of S.peds) {
    if (p.state === 'down') continue;
    if (gangOnly && !p.gang) continue;
    const dx = p.x - x, dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = p; }
  }
  return best;
}

export function damagePed(p, amount) {
  if (p.state === 'down') return;
  p.hp -= amount;
  p.hitT = 0.25;
  if (p.hp <= 0) {
    p.hp = 0;
    p.state = 'down';
    p.downT = 6;
    S.stats.kills++;
  } else if (!p.gang) {
    p.state = 'flee';
    p.fleeT = 4;
  }
}

export function knockDown(p) {
  if (p.state === 'down') return;
  p.state = 'down';
  p.downT = 4;
  p.hp = Math.max(1, p.hp - 10);
}

function pickStrollTarget(p) {
  // Walk along a sidewalk: pick a point near a road, offset to the side.
  const vertical = Math.random() < 0.5;
  if (vertical) {
    const road = ROAD_X[Math.floor(Math.random() * ROAD_X.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    p.tx = road + side * ROAD_HALF_OFF;
    p.ty = clamp(p.y + rand(-260, 260), 120, WORLD - 120);
  } else {
    const road = ROAD_Y[Math.floor(Math.random() * ROAD_Y.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    p.tx = clamp(p.x + rand(-260, 260), 120, WORLD - 120);
    p.ty = road + side * ROAD_HALF_OFF;
  }
}

export function updatePeds(dt) {
  const pl = S.player;
  for (const p of S.peds) {
    if (p.state === 'down') {
      p.downT -= dt;
      if (p.downT <= 0) {
        // Civilians get up and run off; gang members stay down.
        if (p.gang) { p.state = 'down'; p.downT = 999; }
        else { p.state = 'flee'; p.fleeT = 3; p.hp = 20; }
      }
      continue;
    }
    if (p.hitT > 0) p.hitT -= dt;
    const dPl = pl ? dist(p.x, p.y, pl.x, pl.y) : 1e9;
    if (p.gang) {
      // Gang members hunt the player once close, or during Payback.
      const hunting = S.mission === 3 || dPl < 320;
      if (hunting && dPl > 26) {
        p.state = 'chase';
        p.angle = turnToward(p.angle, angleTo(p.x, p.y, pl.x, pl.y), 5 * dt);
        const sp = p.speed * 1.35;
        p.x += Math.cos(p.angle) * sp * dt;
        p.y += Math.sin(p.angle) * sp * dt;
        resolveCircle(p, 11);
      } else if (hunting) {
        p.state = 'attack';
      } else {
        p.state = 'walk';
      }
    } else if (p.state === 'flee') {
      p.fleeT -= dt;
      const a = angleTo(pl.x, pl.y, p.x, p.y);
      p.angle = turnToward(p.angle, a, 6 * dt);
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
      resolveCircle(p, 11);
      if (p.fleeT <= 0) p.state = 'walk';
    } else {
      // Stroll: walk to the target, then pick a new one.
      const d = dist(p.x, p.y, p.tx, p.ty);
      if (d < 14) {
        p.wait -= dt;
        if (p.wait <= 0) { pickStrollTarget(p); p.wait = rand(0, 3); }
      } else {
        p.angle = turnToward(p.angle, angleTo(p.x, p.y, p.tx, p.ty), 4 * dt);
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        resolveCircle(p, 11);
      }
      // Flee from nearby gunfire / violence.
      if (S.lastCrime > S.time - 1.2 && dPl < 260) {
        p.state = 'flee';
        p.fleeT = 3;
      }
    }
    p.x = clamp(p.x, 20, WORLD - 20);
    p.y = clamp(p.y, 20, WORLD - 20);
  }
  // Trim the crowd far from the player so the frame stays smooth.
  if (S.peds.length > 46) {
    S.peds.sort((a, b) => dist(a.x, a.y, pl.x, pl.y) - dist(b.x, b.y, pl.x, pl.y));
    S.peds.length = 46;
  }
}

export function drawPeds(ctx) {
  for (const p of S.peds) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.state === 'down') {
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.fillStyle = p.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(12, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    // Shadow + body
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(p.angle);
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(6, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (p.gang) {
      // Red bandana + gun.
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-2, -8, 5, 16);
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 9, 3);
    }
    if (p.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (p.gang && p.hp < 60) {
      // Health bar over gang members.
      ctx.fillStyle = '#222';
      ctx.fillRect(p.x - 13, p.y - 20, 26, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(p.x - 12, p.y - 19, 24 * (p.hp / 60), 2);
    }
  }
}
