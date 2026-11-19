// Solmar — pedestrians: they stroll the sidewalks, scatter from gunfire and speeding cars,
// and remember being hit (the wanted system notices).
import { G, WORLD, ROAD_AT, ROAD_W } from './state.js';
import { dist, rand, pick, TAU, clamp } from './utils.js';
import { collideBuildings, clampToWorld } from './world.js';
import { spawnSparks } from './particles.js';

const SHIRTS = ['#e07a5f', '#81b29a', '#f2cc8f', '#3d5a80', '#e63946', '#f4f1de', '#8d6b9e', '#2a9d8f'];
const PANTS = ['#2b2d42', '#5a5a5a', '#3d5a80', '#6b4226'];

export function makePed(x, y) {
  return {
    x, y, angle: rand(0, TAU), speed: rand(28, 52),
    shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    state: 'walk', // walk | flee | down
    targetX: x, targetY: y, wait: rand(0, 3),
    health: 100, fleeTimer: 0,
  };
}

function pickStrollTarget(ped) {
  // Stroll along a sidewalk: pick a point on a nearby road's edge.
  const road = pick(ROAD_AT);
  const along = rand(120, WORLD - 120);
  if (Math.random() < 0.5) {
    ped.targetX = along;
    ped.targetY = road + (Math.random() < 0.5 ? ROAD_W / 2 + 14 : -ROAD_W / 2 - 14);
  } else {
    ped.targetX = road + (Math.random() < 0.5 ? ROAD_W / 2 + 14 : -ROAD_W / 2 - 14);
    ped.targetY = along;
  }
}

function spawnPed() {
  const p = G.player;
  for (let tries = 0; tries < 10; tries++) {
    const road = pick(ROAD_AT);
    const along = rand(120, WORLD - 120);
    const side = Math.random() < 0.5;
    const x = side ? along : road + ROAD_W / 2 + 14;
    const y = side ? road + ROAD_W / 2 + 14 : along;
    if (p && dist(x, y, p.x, p.y) < 320) continue;
    return makePed(x, y);
  }
  return null;
}

export function maintainPeds() {
  const p = G.player;
  if (!p) return;
  // Despawn the far ones.
  for (let i = G.peds.length - 1; i >= 0; i--) {
    if (dist(G.peds[i].x, G.peds[i].y, p.x, p.y) > 1400) G.peds.splice(i, 1);
  }
  while (G.peds.length < 22) {
    const ped = spawnPed();
    if (!ped) break;
    G.peds.push(ped);
  }
}

export function scarePeds(x, y, radius) {
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.targetX = ped.x + Math.cos(a) * 260;
      ped.targetY = ped.y + Math.sin(a) * 260;
    }
  }
}

export function updatePeds(dt) {
  const p = G.player;
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    if (ped.state === 'down') continue;
    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
    else if (ped.state === 'flee') ped.state = 'walk';

    const speed = ped.state === 'flee' ? ped.speed * 2.6 : ped.speed;
    const d = dist(ped.x, ped.y, ped.targetX, ped.targetY);
    if (d < 12) {
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      ped.wait = rand(1, 5);
      pickStrollTarget(ped);
      continue;
    }
    ped.angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    collideBuildings(G.city, ped, 8);
    clampToWorld(ped);

    // Run over by a fast car: knocked down, hard.
    if (p && p.car && p.car.speed > 120 && dist(ped.x, ped.y, p.car.x, p.car.y) < 26) {
      knockDown(ped, p.car.x, p.car.y, true);
    }
    for (const car of G.cars) {
      if (car.kind === 'traffic' && car.speed > 100 && dist(ped.x, ped.y, car.x, car.y) < 24) {
        knockDown(ped, car.x, car.y, false);
      }
    }
  }
}

export function knockDown(ped, fromX, fromY, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.health = 0;
  spawnSparks(ped.x, ped.y, 6);
  const a = Math.atan2(ped.y - fromY, ped.x - fromX);
  ped.x += Math.cos(a) * 14;
  ped.y += Math.sin(a) * 14;
  if (byPlayer) {
    import('./wanted.js').then((m) => m.addWanted(1, 'You hit a pedestrian'));
  }
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 3, 8, 5, 0, 0, TAU); ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-3, -2, 6, 16);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-4, -12, 8, 11);
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(0, -15, 4, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle + Math.PI / 2);
  const bob = Math.sin(G.time * 9 + ped.x) * 1.5;
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-3, 2 + bob * 0.4, 2.6, 8);
  ctx.fillRect(0.4, 2 - bob * 0.4, 2.6, 8);
  ctx.fillStyle = ped.shirt;
  ctx.fillRect(-4.5, -6, 9, 9);
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(0, -9, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(0, -10.5, 4.5, Math.PI, 0); ctx.fill();
  ctx.restore();
  void clamp;
}
