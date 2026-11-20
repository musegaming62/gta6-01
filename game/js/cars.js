// Cars for Solmar: player driving physics with drift, traffic AI, damage.
// Depends on util, world, particles and audio only.

import { clamp, rand, choice, dist, TWO_PI } from './util.js';
import { WORLD, PITCH, resolveCircle, randomRoadPoint, isRoad } from './world.js';
import { spawnBurst, spawnSmoke, addShake } from './particles.js';
import { playExplosion, setEngine } from './audio.js';

export const CAR_TYPES = {
  sedan: { accel: 280, top: 330, turn: 2.7, w: 36, h: 19, hp: 80, colors: ['#7a8a99', '#5d7a5d', '#8a7a6a', '#6a6a7a'] },
  sports: { accel: 430, top: 540, turn: 3.2, w: 36, h: 18, hp: 70, colors: ['#d43a2f', '#e8b73a', '#2f8ad4', '#c23ad4'] },
  truck: { accel: 190, top: 250, turn: 2.1, w: 46, h: 21, hp: 150, colors: ['#8a7a4a', '#6a7a5a', '#7a5a3a'] },
  cruiser: { accel: 390, top: 480, turn: 3.1, w: 36, h: 19, hp: 110, colors: ['#22364f'] },
};

let nextCarId = 1;

export function spawnCar(state, type, x, y, angle, opts) {
  const o = opts || {};
  const def = CAR_TYPES[type];
  const car = {
    id: nextCarId++,
    type,
    x, y,
    angle: angle || 0,
    vx: 0, vy: 0,
    hp: def.hp,
    color: o.color || choice(def.colors),
    isPlayer: !!o.isPlayer,
    isPolice: type === 'cruiser' && !!o.isPolice,
    isTraffic: !!o.isTraffic,
    missionCar: !!o.missionCar,
    parked: !!o.parked,
    driver: o.driver !== undefined ? o.driver : true,
    dir: o.dir || 0, // traffic heading: 0=E,1=S,2=W,3=N
    lane: o.lane || 0,
    speedTarget: o.speedTarget || rand(120, 180),
    stuck: 0,
    smokeTimer: 0,
    skid: [],
    dead: false,
  };
  state.cars.push(car);
  return car;
}

function forwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

function damageCar(state, car, amount, fromX, fromY) {
  car.hp -= amount;
  spawnBurst(state, car.x, car.y, { count: 6, color: '#ffaa33', speed: 120, life: 0.4, size: 3 });
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    explodeCar(state, car);
  }
}

export function explodeCar(state, car) {
  spawnBurst(state, car.x, car.y, { count: 40, color: '#ff8833', speed: 320, life: 0.9, size: 5 });
  spawnBurst(state, car.x, car.y, { count: 20, color: '#ffdd55', speed: 220, life: 0.5, size: 4 });
  spawnSmoke(state, car.x, car.y);
  addShake(state, 12);
  playExplosion();
  // Hurt anything close by.
  for (const p of state.peds) {
    if (dist(p.x, p.y, car.x, car.y) < 110) p.hp -= 60;
  }
  if (state.player.inCar !== car && dist(state.player.x, state.player.y, car.x, car.y) < 110) {
    state.player.hp -= 35;
  }
  if (state.player.inCar === car) {
    state.player.hp -= 25;
    exitCar(state, true);
  }
}

// Player driving. input: {up, down, left, right} booleans.
export function drivePlayerCar(state, car, input, dt) {
  const def = CAR_TYPES[car.type];
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let fwd = forwardSpeed(car);
  const throttle = input.up ? 1 : input.down ? -0.65 : 0;
  if (throttle !== 0) {
    fwd += def.accel * throttle * dt;
    fwd = clamp(fwd, -def.top * 0.45, def.top);
  } else {
    fwd *= Math.max(0, 1 - 1.4 * dt);
    if (Math.abs(fwd) < 4) fwd = 0;
  }
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const authority = clamp(Math.abs(fwd) / 140, 0.3, 1);
  const drifting = Math.abs(steer) > 0 && Math.abs(fwd) > 260;
  car.angle += steer * def.turn * authority * dt * (fwd < 0 ? -1 : 1);
  // Rebuild velocity: forward component plus damped lateral component (drift).
  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  let lat = car.vx * -nfy + car.vy * nfx;
  const grip = drifting ? 2.4 : 9;
  lat *= Math.max(0, 1 - grip * dt);
  car.vx = nfx * fwd + -nfy * lat;
  car.vy = nfy * fwd + nfx * lat;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // Skid marks while drifting.
  if (drifting && Math.random() < 0.6) {
    car.skid.push({ x: car.x, y: car.y, a: car.angle, life: 2.5 });
    if (car.skid.length > 40) car.skid.shift();
  }
  for (let i = car.skid.length - 1; i >= 0; i--) {
    car.skid[i].life -= dt;
    if (car.skid[i].life <= 0) car.skid.splice(i, 1);
  }
  // Building collision: bounce and take damage on hard hits.
  const before = { x: car.x, y: car.y };
  const fixed = resolveCircle(state.city, car.x, car.y, 17);
  car.x = fixed.x;
  car.y = fixed.y;
  const hitSpeed = dist(before.x, before.y, car.x, car.y) / Math.max(dt, 0.001);
  const impact = Math.abs(fwd) - hitSpeed;
  if (impact > 120) {
    damageCar(state, car, impact * 0.08, car.x, car.y);
    fwd *= 0.35;
    car.vx = nfx * fwd + -nfy * lat * 0.5;
    car.vy = nfy * fwd + nfx * lat * 0.5;
    addShake(state, 3);
  }
  setEngine(Math.abs(fwd) / def.top);
}

export function exitCar(state, forced) {
  const car = state.player.inCar;
  if (!car) return;
  state.player.inCar = null;
  car.isPlayer = false;
  // Place the player beside the car.
  const side = Math.random() < 0.5 ? -1 : 1;
  const px = car.x + Math.cos(car.angle + Math.PI / 2) * side * 26;
  const py = car.y + Math.sin(car.angle + Math.PI / 2) * side * 26;
  const fixed = resolveCircle(state.city, px, py, 12);
  state.player.x = fixed.x;
  state.player.y = fixed.y;
  state.player.angle = car.angle;
  car.vx *= 0.3;
  car.vy *= 0.3;
  setEngine(0);
}

// Traffic AI: follow the road grid, turn at intersections, slow for cars ahead.
function updateTrafficCar(state, car, dt) {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const [dx, dy] = dirs[car.dir];
  const targetAngle = Math.atan2(dy, dx);
  // Ease toward the road heading.
  let da = targetAngle - car.angle;
  while (da > Math.PI) da -= TWO_PI;
  while (da < -Math.PI) da += TWO_PI;
  car.angle += clamp(da, -2.4 * dt, 2.4 * dt);
  // Slow down for a car ahead.
  let speed = car.speedTarget;
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * dx + oy * dy;
    const side = Math.abs(ox * -dy + oy * dx);
    if (ahead > 0 && ahead < 95 && side < 26) {
      speed = Math.min(speed, 40);
      break;
    }
  }
  // Slow for the player on foot ahead.
  if (!state.player.inCar) {
    const ox = state.player.x - car.x;
    const oy = state.player.y - car.y;
    const ahead = ox * dx + oy * dy;
    const side = Math.abs(ox * -dy + oy * dx);
    if (ahead > 0 && ahead < 80 && side < 24) speed = Math.min(speed, 30);
  }
  car.vx = Math.cos(car.angle) * speed;
  car.vy = Math.sin(car.angle) * speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // At an intersection (crossing a grid line), maybe turn.
  const nearX = Math.abs(((car.x % PITCH) + PITCH) % PITCH) < 14 || Math.abs(((car.x % PITCH) + PITCH) % PITCH - PITCH) < 14;
  const nearY = Math.abs(((car.y % PITCH) + PITCH) % PITCH) < 14 || Math.abs(((car.y % PITCH) + PITCH) % PITCH - PITCH) < 14;
  if (nearX && nearY && Math.random() < 0.02) {
    const roll = Math.random();
    if (roll < 0.3) car.dir = (car.dir + 1) % 4; // right
    else if (roll < 0.55) car.dir = (car.dir + 3) % 4; // left
  }
  // Keep on the road: nudge back to the lane center.
  if (car.dir === 0 || car.dir === 2) {
    const laneY = Math.round(car.y / PITCH) * PITCH + car.lane;
    car.y += (laneY - car.y) * Math.min(1, 2 * dt);
  } else {
    const laneX = Math.round(car.x / PITCH) * PITCH + car.lane;
    car.x += (laneX - car.x) * Math.min(1, 2 * dt);
  }
  // Off the world: respawn on a far road.
  if (car.x < -60 || car.x > WORLD + 60 || car.y < -60 || car.y > WORLD + 60) {
    const p = randomRoadPoint();
    car.x = p.x;
    car.y = p.y;
    car.dir = Math.floor(rand(0, 4));
  }
}

export function updateCars(state, dt) {
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    if (car.dead) {
      state.cars.splice(i, 1);
      continue;
    }
    if (car.isTraffic && !car.isPlayer) {
      updateTrafficCar(state, car, dt);
    } else if (!car.isPlayer && !car.parked) {
      // Parked or abandoned: gentle friction.
      car.vx *= Math.max(0, 1 - 3 * dt);
      car.vy *= Math.max(0, 1 - 3 * dt);
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      const fixed = resolveCircle(state.city, car.x, car.y, 17);
      car.x = fixed.x;
      car.y = fixed.y;
    }
    // Smoke when damaged.
    if (car.hp < 45) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        spawnSmoke(state, car.x, car.y);
      }
    }
  }
  // Simple car-car separation so traffic does not stack.
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const a = state.cars[i];
      const b = state.cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.01 && d < 34) {
        const push = (34 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

export function nearestCar(state, x, y, maxDist, filter) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (filter && !filter(car)) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function damageCarAt(state, car, amount) {
  damageCar(state, car, amount, car.x, car.y);
}

export function drawCars(ctx, state, cam) {
  for (const car of state.cars) {
    const def = CAR_TYPES[car.type];
    const sx = car.x - cam.x;
    const sy = car.y - cam.y;
    // Skid marks.
    for (const s of car.skid) {
      ctx.save();
      ctx.translate(s.x - cam.x, s.y - cam.y);
      ctx.rotate(s.a);
      ctx.globalAlpha = Math.min(0.5, s.life / 2.5);
      ctx.fillStyle = '#222';
      ctx.fillRect(-14, -8, 28, 3);
      ctx.fillRect(-14, 5, 28, 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-def.w / 2 + 2, -def.h / 2 + 3, def.w, def.h);
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-def.w / 2, -def.h / 2, def.w, def.h, 6);
    ctx.fill();
    // Windshield and roof.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.fillRect(def.w * 0.08, -def.h / 2 + 2, def.w * 0.22, def.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-def.w * 0.28, -def.h / 2 + 2, def.w * 0.26, def.h - 4);
    // Wheels.
    ctx.fillStyle = '#111';
    ctx.fillRect(-def.w / 2 + 2, -def.h / 2 - 2, 8, 4);
    ctx.fillRect(def.w / 2 - 10, -def.h / 2 - 2, 8, 4);
    ctx.fillRect(-def.w / 2 + 2, def.h / 2 - 2, 8, 4);
    ctx.fillRect(def.w / 2 - 10, def.h / 2 - 2, 8, 4);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(def.w / 2 - 2, -def.h / 2 + 2, 2, 4);
    ctx.fillRect(def.w / 2 - 2, def.h / 2 - 6, 2, 4);
    if (car.isPolice) {
      // Light bar, flashing.
      const flash = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2a2a' : '#2a6aff';
      ctx.fillRect(-4, -def.h / 2 - 1, 8, 4);
      ctx.fillStyle = flash ? '#2a6aff' : '#ff2a2a';
      ctx.fillRect(-4, def.h / 2 - 3, 8, 4);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-def.w / 2 + 4, -def.h / 2 + 3, 6, def.h - 6);
    }
    // Damage smoke tint.
    if (car.hp < 45) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.roundRect(-def.w / 2, -def.h / 2, def.w, def.h, 6);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
