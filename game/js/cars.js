// Solmar — cars. Arcade driving physics with drift, four car types,
// parked cars, and traffic AI that follows the road grid.

import { S, WORLD } from './state.js';
import { clamp, rand, pick, turnToward, angDiff, mulberry32 } from './util.js';
import { ROAD_X, ROAD_Y, solidAt, resolveCircle } from './world.js';
import { addSkid, sparks, smoke, addShake, burst } from './particles.js';
import { sfxExplode } from './audio.js';

export const CAR_TYPES = {
  sedan: { len: 46, wid: 23, accel: 300, top: 320, turn: 2.7, colors: ['#c0392b', '#2980b9', '#7f8c8d', '#16a085'] },
  sport: { len: 48, wid: 22, accel: 430, top: 480, turn: 3.2, colors: ['#e74c3c', '#f1c40f', '#8e44ad', '#e67e22'] },
  truck: { len: 58, wid: 25, accel: 210, top: 250, turn: 2.0, colors: ['#5d6d7e', '#935116', '#616a6b'] },
  police: { len: 47, wid: 23, accel: 370, top: 430, turn: 3.1, colors: ['#1a1a2e'] },
};

let uid = 1;

export function makeCar(type, x, y, angle) {
  const t = CAR_TYPES[type];
  return {
    id: uid++, type, x, y, angle: angle || 0,
    vx: 0, vy: 0, speed: 0, steer: 0,
    hp: 100, color: pick(t.colors), police: type === 'police',
    driver: false, // traffic car has a driver
    traffic: null, // traffic AI state
    dead: false, smokeT: 0, blip: Math.random() * Math.PI * 2,
  };
}

export function spawnParkedCars(rng) {
  const spots = S.world.spots;
  const types = ['sedan', 'sedan', 'sport', 'truck', 'sedan', 'sport'];
  for (let i = 0; i < Math.min(spots.length, 16); i++) {
    const sp = spots[i];
    const c = makeCar(types[i % types.length], sp.x, sp.y, sp.angle);
    S.cars.push(c);
  }
}

export function spawnTraffic(count) {
  const rng = mulberry32(4242);
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.5;
    const road = vertical ? ROAD_X[Math.floor(rng() * ROAD_X.length)] : ROAD_Y[Math.floor(rng() * ROAD_Y.length)];
    const along = 300 + rng() * 2600;
    const dir = rng() < 0.5 ? 1 : -1;
    const c = makeCar(pick(['sedan', 'sedan', 'truck']), vertical ? road : along, vertical ? along : road, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
    c.driver = true;
    c.traffic = { axis: vertical ? 'y' : 'x', road, dir, speed: 90 + rng() * 60, wait: 0 };
    S.cars.push(c);
  }
}

export function nearestCar(x, y, maxD) {
  let best = null, bestD = maxD * maxD;
  for (const c of S.cars) {
    if (c.dead) continue;
    const dx = c.x - x, dy = c.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = c; }
  }
  return best;
}

function carRadius(c) { return CAR_TYPES[c.type].len / 2; }

export function damageCar(c, amount, fromX, fromY) {
  if (c.dead) return;
  c.hp -= amount;
  sparks(c.x, c.y, 4);
  if (c.hp <= 0) {
    c.dead = true;
    c.hp = 0;
    burstExplode(c);
  }
}

function burstExplode(c) {
  burst(c.x, c.y, 26, '#ff7b24', 320, 0.8, 5);
  burst(c.x, c.y, 14, '#3a3a3a', 160, 1.1, 8);
  smoke(c.x, c.y);
  addShake(14);
  sfxExplode();
  if (S.player && S.player.inCar === c) {
    S.player.inCar = null;
    S.player.x = c.x + 30;
    S.player.y = c.y;
    S.player.hp -= 25;
  }
}

// Player driving input: throttle -1..1, steer -1..1.
export function driveCar(c, throttle, steer, dt) {
  const t = CAR_TYPES[c.type];
  const fwdX = Math.cos(c.angle), fwdY = Math.sin(c.angle);
  let forward = c.vx * fwdX + c.vy * fwdY;
  let latX = c.vx - fwdX * forward;
  let latY = c.vy - fwdY * forward;
  forward += throttle * t.accel * dt;
  forward -= forward * 0.55 * dt; // drag
  if (throttle === 0) forward -= forward * 1.1 * dt; // coast
  forward = clamp(forward, -t.top * 0.45, t.top);
  const spd = Math.abs(forward);
  // Steering: tighter radius at low speed (slow down for corners), and no
  // turning in place when stopped. The base factor is high enough that the
  // car still steers well at a crawl, so it can make tight intersection
  // turns without stalling mid-corner.
  const turnGrip = clamp(0.45 + 0.55 * (spd / t.top), 0, 1) * clamp(spd / 12, 0, 1);
  c.angle += steer * t.turn * turnGrip * dt * (forward < 0 ? -1 : 1);
  c.steer = steer;
  // Grip: lateral velocity decays toward the heading, frame-rate
  // independent. At low speed the car tracks its heading tightly (tight
  // turns); at high speed with hard steer it slides (drift) and leaves
  // skid marks.
  const gripRate = (Math.abs(steer) > 0.7 && spd > 210) ? 3.0 : 8.0;
  const decay = Math.exp(-gripRate * dt);
  latX *= decay; latY *= decay;
  const nfX = Math.cos(c.angle), nfY = Math.sin(c.angle);
  c.vx = nfX * forward + latX;
  c.vy = nfY * forward + latY;
  c.speed = forward;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  const latSpeed = Math.hypot(latX, latY);
  if (latSpeed > 55 && Math.random() < 0.6) {
    addSkid(c.x - nfX * 14, c.y - nfY * 14, c.angle);
  }
  if (c.hp < 45) {
    c.smokeT -= dt;
    if (c.smokeT <= 0) { c.smokeT = 0.12; smoke(c.x, c.y); }
  }
  // Building collision: bounce off.
  const r = carRadius(c);
  if (solidAt(c.x, c.y, r * 0.8)) {
    c.x -= c.vx * dt;
    c.y -= c.vy * dt;
    c.vx *= -0.35; c.vy *= -0.35;
    c.hp -= 3;
    sparks(c.x, c.y, 3);
    if (c.hp <= 0) damageCar(c, 1, c.x, c.y);
  }
  if (c.x < 30) c.x = 30;
  if (c.y < 30) c.y = 30;
  if (c.x > WORLD - 30) c.x = WORLD - 30;
  if (c.y > WORLD - 30) c.y = WORLD - 30;
}

function trafficTarget(c) {
  const t = c.traffic;
  if (t.axis === 'y') return { x: t.road, y: c.y + t.dir * 120 };
  return { x: c.x + t.dir * 120, y: t.road };
}

export function updateTraffic(dt) {
  for (const c of S.cars) {
    if (c.dead || !c.traffic) continue;
    const t = c.traffic;
    if (t.wait > 0) { t.wait -= dt; continue; }
    // Car ahead on the same lane? Slow down.
    let blocked = false;
    for (const o of S.cars) {
      if (o === c || o.dead) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      const ahead = t.axis === 'y' ? dy * t.dir : dx * t.dir;
      const side = t.axis === 'y' ? Math.abs(dx) : Math.abs(dy);
      if (ahead > 0 && ahead < 70 && side < 26) { blocked = true; break; }
    }
    const tgt = trafficTarget(c);
    const want = Math.atan2(tgt.y - c.y, tgt.x - c.x);
    c.angle = turnToward(c.angle, want, 2.2 * dt);
    const spd = blocked ? 0 : t.speed;
    c.x += Math.cos(c.angle) * spd * dt;
    c.y += Math.sin(c.angle) * spd * dt;
    c.speed = spd;
    // Reached an intersection? Maybe turn onto the crossing road.
    const roads = t.axis === 'y' ? ROAD_X : ROAD_Y;
    const along = t.axis === 'y' ? c.y : c.x;
    for (const r of roads) {
      if (Math.abs(along - r) < 6) {
        if (Math.random() < 0.3) {
          // Turn: switch axis, keep going on the new road.
          const newDir = Math.random() < 0.5 ? 1 : -1;
          if (t.axis === 'y') { t.axis = 'x'; t.road = r; t.dir = newDir; }
          else { t.axis = 'y'; t.road = r; t.dir = newDir; }
        }
        break;
      }
    }
    // Off the map: respawn on a random road.
    if (c.x < 60 || c.x > WORLD - 60 || c.y < 60 || c.y > WORLD - 60) {
      const vertical = Math.random() < 0.5;
      const road = vertical ? ROAD_X[Math.floor(Math.random() * ROAD_X.length)] : ROAD_Y[Math.floor(Math.random() * ROAD_Y.length)];
      const a = 300 + Math.random() * 2600;
      const dir = Math.random() < 0.5 ? 1 : -1;
      c.x = vertical ? road : a;
      c.y = vertical ? a : road;
      c.traffic.axis = vertical ? 'y' : 'x';
      c.traffic.road = road;
      c.traffic.dir = dir;
      c.angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    }
  }
  // Car-car separation (simple circle push).
  for (let i = 0; i < S.cars.length; i++) {
    const a = S.cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < S.cars.length; j++) {
      const b = S.cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 30;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

export function drawCars(ctx) {
  for (const c of S.cars) {
    if (c.dead) {
      // Burnt wreck.
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = '#222';
      ctx.fillRect(-22, -11, 44, 22);
      ctx.restore();
      continue;
    }
    const t = CAR_TYPES[c.type];
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-t.len / 2 + 3, -t.wid / 2 + 3, t.len, t.wid);
    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-t.len / 2 + 6, -t.wid / 2 - 3, 10, 5);
    ctx.fillRect(-t.len / 2 + 6, t.wid / 2 - 2, 10, 5);
    ctx.fillRect(t.len / 2 - 16, -t.wid / 2 - 3, 10, 5);
    ctx.fillRect(t.len / 2 - 16, t.wid / 2 - 2, 10, 5);
    // Body
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-t.len / 2, -t.wid / 2, t.len, t.wid, 6);
    ctx.fill();
    // Windshield + roof
    ctx.fillStyle = 'rgba(180,220,240,0.9)';
    ctx.fillRect(t.len / 2 - 18, -t.wid / 2 + 4, 9, t.wid - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-6, -t.wid / 2 + 4, 12, t.wid - 8);
    // Headlights
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(t.len / 2 - 2, -t.wid / 2 + 3, 3, 4);
    ctx.fillRect(t.len / 2 - 2, t.wid / 2 - 7, 3, 4);
    if (c.police) {
      // Police livery: white doors + light bar.
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(-8, -t.wid / 2 + 2, 14, t.wid - 4);
      ctx.fillStyle = (Math.floor(S.time * 4) % 2 === 0) ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-4, -t.wid / 2 - 1, 8, 5);
      ctx.fillStyle = (Math.floor(S.time * 4) % 2 === 0) ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-4, t.wid / 2 - 4, 8, 5);
    }
    ctx.restore();
  }
}
