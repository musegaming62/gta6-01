// Cars: arcade driving physics with drift, traffic AI that follows the road
// grid by waypoints, parked cars, police cruisers, and collisions.
import { clamp, lerp, angleDiff, angleLerp, dist, randRange, pick, mulberry32 } from './util.js';
import { ROAD_CENTERS, WORLD_SIZE, collideBuildings, onBeach, inOcean, nearestRoadCoord } from './world.js';
import { burst, smoke, explosion, addSkid, addTrauma } from './particles.js';

export const CAR_TYPES = {
  sedan: { maxSpeed: 265, accel: 185, turn: 2.7, color: '#4a6fa5', len: 46, wid: 22 },
  sport: { maxSpeed: 385, accel: 265, turn: 3.1, color: '#c0392b', len: 46, wid: 21 },
  truck: { maxSpeed: 210, accel: 135, turn: 2.0, color: '#b07a2a', len: 56, wid: 24 },
  police: { maxSpeed: 345, accel: 245, turn: 3.0, color: '#222831', len: 48, wid: 22 },
};

let carId = 0;

export function makeCar(type, x, y, angle) {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    id: ++carId,
    type,
    x, y,
    angle: angle || 0,
    speed: 0,
    slide: 0,
    health: 100,
    color: t.color,
    len: t.len,
    wid: t.wid,
    maxSpeed: t.maxSpeed,
    accel: t.accel,
    turn: t.turn,
    isPolice: type === 'police',
    isTraffic: false,
    driver: null, // 'player' | 'ped' | null
    dead: false,
    smokeTimer: 0,
    // Traffic AI state.
    wp: null,
    prevWp: null,
    targetSpeed: 0,
    stuck: 0,
    // Control input, set by player/traffic/police code each frame.
    control: { throttle: 0, steer: 0 },
  };
}

// A random intersection (grid crossing) as a waypoint.
function randomIntersection(rng) {
  const c = pick(rng, ROAD_CENTERS);
  const d = pick(rng, ROAD_CENTERS);
  return { x: c, y: d };
}

// Neighbouring intersection of (ix, iy) in grid-index space.
function neighbourWp(rng, ix, iy, prev) {
  const options = [];
  if (ix > 0) options.push({ ix: ix - 1, iy });
  if (ix < ROAD_CENTERS.length - 1) options.push({ ix: ix + 1, iy });
  if (iy > 0) options.push({ ix, iy: iy - 1 });
  if (iy < ROAD_CENTERS.length - 1) options.push({ ix, iy: iy + 1 });
  // Avoid an immediate U-turn unless it is the only choice.
  const filtered = options.filter((o) => !(prev && o.ix === prev.ix && o.iy === prev.iy));
  const chosen = pick(rng, filtered.length ? filtered : options);
  return { x: ROAD_CENTERS[chosen.ix], y: ROAD_CENTERS[chosen.iy], ix: chosen.ix, iy: chosen.iy };
}

export function spawnTrafficCar(G, rng) {
  const wp = randomIntersection(rng);
  const type = pick(rng, ['sedan', 'sedan', 'sedan', 'sport', 'truck']);
  const car = makeCar(type, wp.x + randRange(rng, -30, 30), wp.y + randRange(rng, -30, 30), randRange(rng, 0, Math.PI * 2));
  car.isTraffic = true;
  car.targetSpeed = randRange(rng, 110, 165);
  // Start on a road: snap to the nearest road centreline.
  const ix = ROAD_CENTERS.indexOf(wp.x);
  const iy = ROAD_CENTERS.indexOf(wp.y);
  car.wp = neighbourWp(rng, ix, iy, null);
  car.prevWp = { ix, iy };
  G.cars.push(car);
  return car;
}

export function spawnParkedCars(G) {
  const rng = mulberry32(777);
  const spots = [];
  // Parked cars along road edges, away from the player start.
  for (let i = 0; i < 26; i++) {
    const horizontal = rng() < 0.5;
    const c = pick(rng, ROAD_CENTERS);
    const along = randRange(rng, 180, WORLD_SIZE - 180);
    const x = horizontal ? along : c + (rng() < 0.5 ? -62 : 62);
    const y = horizontal ? c + (rng() < 0.5 ? -62 : 62) : along;
    if (dist(x, y, 1500, 1650) < 260) continue;
    spots.push({ x, y, angle: horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) });
  }
  for (const s of spots) {
    const type = pick(rng, ['sedan', 'sedan', 'sport', 'truck', 'sedan']);
    const car = makeCar(type, s.x, s.y, s.angle);
    G.cars.push(car);
  }
  // The mission-1 sports car, parked at its marked spot.
  const sport = makeCar('sport', 1680, 1320, Math.PI / 2);
  sport.missionCar = true;
  G.cars.push(sport);
}

export function nearestCar(G, x, y, maxDist) {
  let best = null;
  let bd = maxDist * maxDist;
  for (const c of G.cars) {
    if (c.dead) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = c; }
  }
  return best;
}

function applyCarPhysics(G, car, dt) {
  const ctrl = car.control;
  const onSand = onBeach(car.x, car.y);
  const grip = onSand ? 0.55 : 1;
  const maxF = car.maxSpeed * grip;
  const maxR = car.maxSpeed * 0.45 * grip;

  // Throttle: +1 forward, -1 brake/reverse.
  if (ctrl.throttle > 0) {
    car.speed += car.accel * ctrl.throttle * dt;
  } else if (ctrl.throttle < 0) {
    if (car.speed > 8) car.speed -= car.accel * 1.4 * dt; // brake
    else car.speed -= car.accel * 0.6 * dt; // reverse
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  }
  car.speed = clamp(car.speed, -maxR, maxF);

  // Steering: stronger at speed, with drift when turning hard.
  const speedNorm = clamp(Math.abs(car.speed) / car.maxSpeed, 0, 1);
  const steerAmount = ctrl.steer * car.turn * (0.35 + 0.65 * speedNorm) * Math.sign(car.speed || 1);
  car.angle += steerAmount * dt;
  if (Math.abs(ctrl.steer) > 0.6 && Math.abs(car.speed) > 150) {
    car.slide += ctrl.steer * car.speed * 0.55 * dt;
  }
  car.slide *= Math.pow(0.12, dt);
  car.slide = clamp(car.slide, -160, 160);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  const vx = fx * car.speed + rx * car.slide;
  const vy = fy * car.speed + ry * car.slide;
  car.x += vx * dt;
  car.y += vy * dt;

  // Skid marks while drifting.
  if (Math.abs(car.slide) > 60 && Math.abs(car.speed) > 140) {
    const bx = car.x - fx * car.len * 0.4;
    const by = car.y - fy * car.len * 0.4;
    addSkid(G.particles, bx - rx * 8, by - ry * 8, bx - rx * 8 - vx * dt, by - ry * 8 - vy * dt);
    addSkid(G.particles, bx + rx * 8, by + ry * 8, bx + rx * 8 - vx * dt, by + ry * 8 - vy * dt);
  }

  // Stay in the world and out of the ocean.
  car.x = clamp(car.x, 30, WORLD_SIZE - 30);
  if (inOcean(car.x, car.y)) {
    car.y = 3070;
    car.speed *= 0.4;
  }
  car.y = clamp(car.y, 30, WORLD_SIZE - 30);
}

function collideCarWithBuildings(G, car) {
  const push = collideBuildings(G.world, car.x, car.y, car.len * 0.42);
  if (push) {
    const impact = Math.abs(car.speed);
    car.x += push.x;
    car.y += push.y;
    if (impact > 90) {
      car.health -= impact * 0.06;
      burst(G.particles, car.x, car.y, 6, '#ffb84d', 140, 0.4, 4);
      if (car.driver === 'player') addTrauma(G.particles, 0.25);
    }
    car.speed *= 0.45;
    car.slide *= 0.5;
  }
}

function collideCars(G, car) {
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const min = (car.len + other.len) * 0.36;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      car.x -= nx * push;
      car.y -= ny * push;
      other.x += nx * push;
      other.y += ny * push;
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 120) {
        car.health -= rel * 0.03;
        other.health -= rel * 0.03;
        burst(G.particles, (car.x + other.x) / 2, (car.y + other.y) / 2, 5, '#ffb84d', 120, 0.35, 4);
      }
      const avg = (car.speed + other.speed) / 2;
      car.speed = lerp(car.speed, avg, 0.4);
      other.speed = lerp(other.speed, avg, 0.4);
    }
  }
}

function trafficControl(G, car, dt) {
  // A staged or freshly spawned traffic car may not have a waypoint yet.
  if (!car.wp) {
    const ix = ROAD_CENTERS.indexOf(nearestRoadCoord(car.x));
    const iy = ROAD_CENTERS.indexOf(nearestRoadCoord(car.y));
    car.prevWp = { ix, iy };
    car.wp = neighbourWp(Math.random, ix, iy, null);
    car.targetSpeed = car.targetSpeed || 130;
  }
  // Drive toward the current waypoint; pick the next intersection on arrival.
  const dx = car.wp.x - car.x;
  const dy = car.wp.y - car.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 46) {
    const next = neighbourWp(Math.random, car.wp.ix, car.wp.iy, car.prevWp);
    car.prevWp = { ix: car.wp.ix, iy: car.wp.iy };
    car.wp = next;
    return;
  }
  const targetAngle = Math.atan2(dy, dx);
  const diff = angleDiff(car.angle, targetAngle);
  car.control.steer = clamp(diff * 2.2, -1, 1);
  // Slow down for a car directly ahead.
  let ahead = false;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const along = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
    const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
    if (along > 0 && along < 78 && side < 26) { ahead = true; break; }
  }
  // Also slow for pedestrians crossing right in front.
  if (!ahead) {
    for (const p of G.peds) {
      if (p.down) continue;
      const ox = p.x - car.x;
      const oy = p.y - car.y;
      const along = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (along > 0 && along < 60 && side < 20) { ahead = true; break; }
    }
  }
  const want = ahead ? 0 : car.targetSpeed;
  car.control.throttle = car.speed < want ? 1 : (car.speed > want + 10 ? -0.4 : 0);
}

function updateCarDamage(G, car, dt) {
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    explosion(G.particles, car.x, car.y);
    G.audio.explosion();
    addTrauma(G.particles, 0.6);
    if (car.driver === 'player') {
      G.player.inCar = null;
      G.player.x = car.x + 40;
      G.player.y = car.y + 40;
      G.player.health -= 25;
    }
    car.driver = null;
  } else if (car.health < 45) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.12;
      smoke(G.particles, car.x, car.y - 6, true);
    }
  }
}

export function updateCars(G, dt) {
  const rng = Math.random;
  // Keep traffic topped up near the player.
  let traffic = 0;
  for (const c of G.cars) if (c.isTraffic && !c.dead) traffic++;
  if (traffic < 10 && rng() < 0.02) {
    const car = spawnTrafficCar(G, rng);
    // Spawn on a road near the player, not on top of them.
    const px = G.player.x;
    const py = G.player.y;
    car.x = clamp(px + (rng() < 0.5 ? -1 : 1) * randRange(rng, 500, 800), 100, WORLD_SIZE - 100);
    car.y = clamp(py + (rng() < 0.5 ? -1 : 1) * randRange(rng, 500, 800), 100, 2900);
    const ix = ROAD_CENTERS.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
    const iy = ROAD_CENTERS.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
    car.x = ix;
    car.y = iy;
    car.wp = neighbourWp(rng, ROAD_CENTERS.indexOf(ix), ROAD_CENTERS.indexOf(iy), null);
  }

  for (let i = G.cars.length - 1; i >= 0; i--) {
    const car = G.cars[i];
    if (car.dead) {
      // Leave a burnt husk for a while, then remove it.
      car.deadTimer = (car.deadTimer || 0) + dt;
      if (car.deadTimer > 14) G.cars.splice(i, 1);
      continue;
    }
    if (car.driver === 'player') {
      const ax = G.input.axes();
      car.control.throttle = -ax.y;
      car.control.steer = ax.x;
    } else if (car.isTraffic) {
      trafficControl(G, car, dt);
    } else if (car.isPolice) {
      // Police cruisers are driven by police.js via car.control; idle if unset.
      if (!car.control || (car.control.throttle === 0 && car.control.steer === 0)) {
        car.control.throttle = 0;
        car.control.steer = 0;
      }
    } else {
      // Parked car: no control.
      car.control.throttle = 0;
      car.control.steer = 0;
    }
    applyCarPhysics(G, car, dt);
    collideCarWithBuildings(G, car);
    collideCars(G, car);

    // Car running over a pedestrian.
    for (const p of G.peds) {
      if (p.down || p.dead) continue;
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < car.len * 0.5 && Math.abs(car.speed) > 60) {
        p.down = true;
        p.downTimer = 6;
        p.vx = Math.cos(car.angle) * car.speed * 0.6;
        p.vy = Math.sin(car.angle) * car.speed * 0.6;
        burst(G.particles, p.x, p.y, 8, '#ff5d5d', 120, 0.5, 4);
        if (car.driver === 'player') {
          G.police.addWanted(G, 1);
          G.audio.punch();
        }
      }
    }
    updateCarDamage(G, car, dt);
  }
}

export function drawCars(ctx, G, cam) {
  for (const car of G.cars) {
    if (car.x < cam.x - cam.w / 2 - 80 || car.x > cam.x + cam.w / 2 + 80 ||
        car.y < cam.y - cam.h / 2 - 80 || car.y > cam.y + cam.h / 2 + 80) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    if (car.dead) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#1c1c1c';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid);
      ctx.fillStyle = car.color;
    }
    // Body.
    ctx.beginPath();
    ctx.roundRect(-car.len / 2, -car.wid / 2, car.len, car.wid, 7);
    ctx.fill();
    if (!car.dead) {
      // Cabin / windshield.
      ctx.fillStyle = 'rgba(20,30,40,0.85)';
      ctx.beginPath();
      ctx.roundRect(-car.len * 0.12, -car.wid / 2 + 4, car.len * 0.3, car.wid - 8, 4);
      ctx.fill();
      // Headlights.
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(car.len / 2 - 3, -car.wid / 2 + 3, 3, 5);
      ctx.fillRect(car.len / 2 - 3, car.wid / 2 - 8, 3, 5);
      if (car.isPolice) {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(-car.len / 2 + 4, -car.wid / 2 + 2, car.len - 8, 5);
        ctx.fillRect(-car.len / 2 + 4, car.wid / 2 - 7, car.len - 8, 5);
        // Light bar, flashing with time.
        const flash = Math.floor(G.time * 6) % 2 === 0;
        ctx.fillStyle = flash ? '#ff2d2d' : '#2d7dff';
        ctx.fillRect(-6, -car.wid / 2 + 2, 12, 6);
        ctx.fillStyle = flash ? '#2d7dff' : '#ff2d2d';
        ctx.fillRect(-6, car.wid / 2 - 8, 12, 6);
      }
      if (car.missionCar) {
        ctx.strokeStyle = '#ffd94d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-car.len / 2 - 4, -car.wid / 2 - 4, car.len + 8, car.wid + 8, 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
