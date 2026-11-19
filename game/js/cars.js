// Solmar — cars: arcade driving physics, traffic that follows the road grid, parked cars,
// and police pursuit. All cars are plain data; the player drives one of them.
import { G, WORLD, ROAD_AT, ROAD_W } from './state.js';
import { clamp, dist, angleDiff, rand, randInt, pick, TAU } from './utils.js';
import { nearestRoad, onRoad } from './city.js';
import { collideBuildings, clampToWorld } from './world.js';
import { spawnSmoke, spawnSparks, spawnSkid, spawnFire, spawnRing } from './particles.js';
import { sfxCrash, sfxExplosion } from './audio.js';

export const CAR_MODELS = {
  sedan: { len: 44, wid: 20, maxSpeed: 380, accel: 300, color: '#c44536' },
  taxi: { len: 44, wid: 20, maxSpeed: 360, accel: 290, color: '#f2c14e' },
  van: { len: 52, wid: 22, maxSpeed: 300, accel: 230, color: '#7d8597' },
  sport: { len: 46, wid: 20, maxSpeed: 480, accel: 380, color: '#e63946' },
  truck: { len: 58, wid: 24, maxSpeed: 280, accel: 200, color: '#5a6b7d' },
  police: { len: 46, wid: 20, maxSpeed: 440, accel: 360, color: '#e8e8e8' },
};
const TRAFFIC_MODELS = ['sedan', 'taxi', 'van', 'sport', 'truck'];
const TRAFFIC_COLORS = ['#c44536', '#4a7c59', '#3d5a80', '#8d6b9e', '#b08968', '#6c757d', '#2a9d8f'];

export function makeCar(x, y, angle, model, kind) {
  const m = CAR_MODELS[model];
  return {
    x, y, angle, speed: 0, model, kind: kind || 'traffic',
    color: kind === 'police' ? '#e8e8e8' : pick(TRAFFIC_COLORS),
    health: 100, maxHealth: 100, wreck: false,
    axis: 'x', dir: 1, road: nearestRoad(y), cruise: rand(90, 135),
    lightPhase: Math.random() * TAU, stuckTimer: 0,
  };
}

// --- traffic ---

function spawnTrafficCar() {
  const p = G.player;
  for (let tries = 0; tries < 12; tries++) {
    const axis = Math.random() < 0.5 ? 'x' : 'y';
    const road = pick(ROAD_AT);
    const along = rand(100, WORLD - 100);
    const x = axis === 'x' ? along : road;
    const y = axis === 'x' ? road : along;
    if (p && dist(x, y, p.x, p.y) < 500) continue;
    if (dist(x, y, WORLD / 2, WORLD / 2) > 2400) continue;
    const car = makeCar(x, y, 0, pick(TRAFFIC_MODELS), 'traffic');
    car.axis = axis;
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.road = road;
    car.angle = axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = car.cruise;
    return car;
  }
  return null;
}

function spawnParkedCar() {
  const p = G.player;
  for (let tries = 0; tries < 12; tries++) {
    const road = pick(ROAD_AT);
    const along = rand(200, WORLD - 200);
    const side = Math.random() < 0.5;
    const x = side ? along : road + ROAD_W / 2 + 16;
    const y = side ? road + ROAD_W / 2 + 16 : along;
    if (p && dist(x, y, p.x, p.y) < 260) continue;
    const car = makeCar(x, y, side ? 0 : Math.PI / 2, pick(TRAFFIC_MODELS), 'parked');
    car.speed = 0;
    return car;
  }
  return null;
}

export function maintainTraffic(dt) {
  const p = G.player;
  if (!p) return;
  const traffic = G.cars.filter((c) => c.kind === 'traffic');
  const parked = G.cars.filter((c) => c.kind === 'parked');
  // Despawn far traffic, keep the streets alive near the player.
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if ((c.kind === 'traffic' || c.kind === 'police') && dist(c.x, c.y, p.x, p.y) > 1500) {
      if (c.kind === 'traffic') G.cars.splice(i, 1);
    }
  }
  if (traffic.length < 14) {
    const c = spawnTrafficCar();
    if (c) G.cars.push(c);
  }
  if (parked.length < 9) {
    const c = spawnParkedCar();
    if (c) G.cars.push(c);
  }
  void dt;
}

// Traffic follows its road; at intersections it may turn. Slows for cars ahead.
function updateTraffic(car, dt) {
  if (car.wreck) return;
  const lane = 22;
  const targetAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  car.angle += angleDiff(car.angle, targetAngle) * Math.min(1, dt * 6);

  // Car ahead in the same lane?
  let ahead = null;
  for (const o of G.cars) {
    if (o === car || o.wreck) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    const fwd = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
    const lat = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
    if (fwd > 0 && fwd < 70 && lat < 16) { ahead = o; break; }
  }
  const want = ahead ? 0 : car.cruise;
  car.speed += clamp(want - car.speed, -260 * dt, 200 * dt);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Stay in lane: pull the cross-axis coordinate back to the lane line.
  if (car.axis === 'x') {
    const laneY = car.road + (car.dir > 0 ? lane : -lane);
    car.y += (laneY - car.y) * Math.min(1, dt * 4);
  } else {
    const laneX = car.road + (car.dir > 0 ? -lane : lane);
    car.x += (laneX - car.x) * Math.min(1, dt * 4);
  }

  // At an intersection, maybe turn onto the crossing road (once per crossing).
  car.turnCooldown = (car.turnCooldown || 0) - dt;
  const cross = nearestRoad(car.axis === 'x' ? car.x : car.y);
  const along = car.axis === 'x' ? car.x : car.y;
  if (car.turnCooldown <= 0 && Math.abs(along - cross) < 6) {
    car.turnCooldown = 1.5;
    if (Math.random() < 0.4) {
      car.axis = car.axis === 'x' ? 'y' : 'x';
      car.road = cross;
      car.dir = Math.random() < 0.5 ? 1 : -1;
    }
  }
  if (car.x < 60 || car.x > WORLD - 60 || car.y < 60 || car.y > WORLD - 60) {
    car.speed = 0;
    car.angle += Math.PI;
    car.dir *= -1;
  }
  collideBuildings(G.city, car, 18);
}

// --- police ---

export function spawnPoliceCar() {
  const p = G.player;
  if (!p) return null;
  const a = rand(0, TAU);
  const d = rand(700, 900);
  let x = clamp(p.x + Math.cos(a) * d, 80, WORLD - 80);
  let y = clamp(p.y + Math.sin(a) * d, 80, WORLD - 80);
  if (!onRoad(x, y)) {
    x = nearestRoad(x);
    y = nearestRoad(y);
    if (!onRoad(x, y)) return null;
  }
  const car = makeCar(x, y, 0, 'police', 'police');
  car.speed = 200;
  return car;
}

function updatePolice(car, dt) {
  const p = G.player;
  if (car.wreck || !p) return;
  const want = Math.atan2(p.y - car.y, p.x - car.x);
  const turn = clamp(angleDiff(car.angle, want), -1, 1);
  const steer = 2.6 * dt * (car.speed > 0 ? 1 : -1);
  car.angle += clamp(turn, -steer, steer);
  const d = dist(car.x, car.y, p.x, p.y);
  const targetSpeed = d > 260 ? 430 : d > 90 ? 300 : 140;
  car.speed += clamp(targetSpeed - car.speed, -320 * dt, 300 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (collideBuildings(G.city, car, 18)) {
    car.speed *= 0.55;
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.2) { car.angle += Math.PI * 0.75; car.stuckTimer = 0; }
  } else {
    car.stuckTimer = 0;
  }
  clampToWorld(car);
  // Damage smoke when battered.
  if (car.health < 45 && Math.random() < dt * 6) spawnSmoke(car.x, car.y - 6, 1);
}

// --- shared ---

export function damageCar(car, amount, fromX, fromY) {
  if (car.wreck) return;
  car.health -= amount;
  spawnSparks(car.x, car.y, 4);
  if (fromX !== undefined) {
    const a = Math.atan2(car.y - fromY, car.x - fromX);
    car.x += Math.cos(a) * 4; car.y += Math.sin(a) * 4;
  }
  if (car.health <= 0) {
    car.health = 0;
    car.wreck = true;
    car.speed = 0;
    spawnFire(car.x, car.y, 14);
    spawnRing(car.x, car.y);
    sfxExplosion();
    G.shake = Math.max(G.shake, 10);
    // Chain: hurt nearby cars and people a little.
    for (const o of G.cars) {
      if (o !== car && !o.wreck && dist(o.x, o.y, car.x, car.y) < 90) damageCar(o, 40);
    }
  }
}

function collideCars(dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.wreck && b.wreck) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 34;
      if (d < min && d > 0.01) {
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        const push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const closing = Math.abs(a.speed - b.speed);
        if (closing > 120) {
          damageCar(a, 6); damageCar(b, 6);
          sfxCrash();
          G.shake = Math.max(G.shake, 3);
        }
        const tmp = a.speed;
        a.speed = b.speed * 0.5;
        b.speed = tmp * 0.5;
      }
    }
  }
  void dt;
}

export function updateCars(dt) {
  for (const car of G.cars) {
    if (car.kind === 'traffic') updateTraffic(car, dt);
    else if (car.kind === 'police') updatePolice(car, dt);
    else if (car.kind === 'player' && !car.wreck) {
      // Player car physics live in player.js; here only smoke when battered.
      if (car.health < 45 && Math.random() < dt * 6) spawnSmoke(car.x, car.y - 6, 1);
    }
  }
  collideCars(dt);
}

// --- drawing ---

export function drawCar(ctx, car) {
  const m = CAR_MODELS[car.model];
  ctx.save();
  ctx.translate(car.x, car.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(3, 5, m.len / 2, m.wid / 2 + 2, car.angle, 0, TAU); ctx.fill();
  ctx.rotate(car.angle);
  if (car.wreck) {
    ctx.fillStyle = '#222';
    ctx.fillRect(-m.len / 2, -m.wid / 2, m.len, m.wid);
    ctx.fillStyle = '#444';
    ctx.fillRect(-m.len / 2 + 6, -m.wid / 2 + 4, m.len - 12, m.wid - 8);
    ctx.restore();
    return;
  }
  // Wheels.
  ctx.fillStyle = '#111';
  ctx.fillRect(-m.len / 2 + 6, -m.wid / 2 - 3, 10, 5);
  ctx.fillRect(-m.len / 2 + 6, m.wid / 2 - 2, 10, 5);
  ctx.fillRect(m.len / 2 - 16, -m.wid / 2 - 3, 10, 5);
  ctx.fillRect(m.len / 2 - 16, m.wid / 2 - 2, 10, 5);
  // Body.
  ctx.fillStyle = car.color;
  ctx.beginPath();
  const r = 7;
  ctx.roundRect(-m.len / 2, -m.wid / 2, m.len, m.wid, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Windshield + roof + rear window.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  ctx.fillRect(m.len / 2 - 16, -m.wid / 2 + 3, 7, m.wid - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-4, -m.wid / 2 + 3, m.len / 2 - 12, m.wid - 6);
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  ctx.fillRect(-m.len / 2 + 5, -m.wid / 2 + 3, 6, m.wid - 6);
  // Headlights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(m.len / 2 - 2, -m.wid / 2 + 2, 2, 4);
  ctx.fillRect(m.len / 2 - 2, m.wid / 2 - 6, 2, 4);
  if (car.kind === 'police') {
    // Light bar, flashing red/blue.
    const t = Math.floor(G.time * 6) % 2;
    ctx.fillStyle = t === 0 ? '#ff2d2d' : '#2d7bff';
    ctx.fillRect(-2, -m.wid / 2 + 2, 6, 5);
    ctx.fillStyle = t === 0 ? '#2d7bff' : '#ff2d2d';
    ctx.fillRect(-2, m.wid / 2 - 7, 6, 5);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 2, 3);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-8, -m.wid / 2 + 2, 16, 3);
  }
  // Damage: cracks when hurt.
  if (car.health < 50) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -m.wid / 2 + 2); ctx.lineTo(6, 0); ctx.lineTo(0, m.wid / 2 - 2); ctx.stroke();
  }
  ctx.restore();
  void spawnSkid;
}
