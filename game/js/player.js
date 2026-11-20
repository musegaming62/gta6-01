// Solmar — the player on foot. WASD movement with sprint stamina, mouse
// aim, shooting and reloading, punching, stealing cars with E, and picking
// up health/ammo. Driving itself lives in cars.js.

import { S } from './state.js';
import { clamp, dist, angleTo } from './util.js';
import { resolveCircle } from './world.js';
import { axis, isDown, wasPressed, mouse } from './input.js';
import { nearestCar, driveCar, damageCar } from './cars.js';
import { fireBullet } from './combat.js';
import { blood, floatText, burst } from './particles.js';
import { sfxPickup, sfxPunch, sfxCarDoor, sfxCash } from './audio.js';
import { addWanted } from './police.js';
import { nearestPed, knockDown, makePed } from './peds.js';

const WALK_SPEED = 175;
const SPRINT_SPEED = 285;

export function updatePlayer(dt) {
  const p = S.player;
  if (!p) return;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.punchT > 0) p.punchT -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;

  // Aim follows the mouse (world space).
  const wx = S.cam.x + mouse.x;
  const wy = S.cam.y + mouse.y;
  p.aimX = wx;
  p.aimY = wy;
  if (!p.inCar) p.angle = angleTo(p.x, p.y, wx, wy);

  // Reload timer.
  if (p.reloading > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const need = p.mag - p.ammo;
      const take = Math.min(need, p.reserve);
      p.ammo += take;
      p.reserve -= take;
      p.reloading = 0;
    }
  }

  if (p.inCar) {
    updateDriving(p, dt);
  } else {
    updateOnFoot(p, dt);
  }

  // Pickups.
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const pk = S.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      if (pk.kind === 'health') {
        p.hp = Math.min(p.maxHp, p.hp + 40);
        floatText(p.x, p.y - 18, '+40 HP', '#7be07b');
      } else if (pk.kind === 'ammo') {
        p.reserve += 48;
        floatText(p.x, p.y - 18, '+48 AMMO', '#ffd34d');
      } else if (pk.kind === 'cash') {
        S.money += pk.amount;
        floatText(p.x, p.y - 18, '+$' + pk.amount, '#7be07b');
        sfxCash();
      }
      sfxPickup();
      S.pickups.splice(i, 1);
    }
  }
}

function updateOnFoot(p, dt) {
  const mv = axis();
  const sprint = isDown('ShiftLeft') || isDown('ShiftRight');
  let speed = WALK_SPEED;
  if (sprint && p.stamina > 0 && (mv.x !== 0 || mv.y !== 0)) {
    speed = SPRINT_SPEED;
    p.stamina = Math.max(0, p.stamina - 26 * dt);
    p.sprinting = true;
  } else {
    p.sprinting = false;
    p.stamina = Math.min(100, p.stamina + 16 * dt);
  }
  const len = Math.hypot(mv.x, mv.y) || 1;
  p.vx = (mv.x / len) * speed;
  p.vy = (mv.y / len) * speed;
  if (mv.x === 0 && mv.y === 0) { p.vx = 0; p.vy = 0; }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.speed = Math.hypot(p.vx, p.vy);
  resolveCircle(p, 12);
  // Health regen out of combat.
  if (S.time - S.lastCrime > 12 && p.hp > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + 2.5 * dt);
  }

  // Shoot.
  if (mouse.down && !p.reloading && p.punchT <= 0) {
    if (S.time - p.lastShot > 0.16) {
      if (p.ammo > 0) {
        p.lastShot = S.time;
        p.ammo--;
        S.stats.shots++;
        fireBullet(p.x + Math.cos(p.angle) * 14, p.y + Math.sin(p.angle) * 14, p.angle, 'player', 20, 820);
        if (S.wanted < 1) addWanted(1);
        S.lastCrime = S.time;
      } else if (p.reserve > 0) {
        startReload(p);
      }
    }
  }
  if (wasPressed('KeyR') && p.ammo < p.mag && p.reserve > 0 && !p.reloading) {
    startReload(p);
  }
  // Punch.
  if (wasPressed('KeyF') && p.punchCd <= 0) {
    p.punchT = 0.22;
    p.punchCd = 0.45;
    sfxPunch();
    const target = nearestPed(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 34, false);
    if (target) {
      knockDown(target);
      blood(target.x, target.y);
      addWanted(1);
    }
  }
  // Enter a car.
  if (wasPressed('KeyE')) {
    const car = nearestCar(p.x, p.y, 64);
    if (car) enterCar(p, car);
  }
}

function startReload(p) {
  p.reloading = 1;
  p.reloadT = 0.85;
}

export function enterCar(p, car) {
  if (car.driver) {
    // Throw the driver out as a pedestrian.
    car.driver = false;
    car.traffic = null;
    const ped = makePed(car.x + 40, car.y + 20, false);
    ped.state = 'flee';
    ped.fleeT = 3;
    S.peds.push(ped);
  }
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  sfxCarDoor();
  if (!car.police) {
    addWanted(1);
    S.stats.carsStolen++;
  }
}

function updateDriving(p, dt) {
  const car = p.inCar;
  if (!car || car.dead) {
    p.inCar = null;
    return;
  }
  const throttle = (isDown('KeyW') ? 1 : 0) + (isDown('KeyS') ? -0.7 : 0);
  const steer = (isDown('KeyA') ? -1 : 0) + (isDown('KeyD') ? 1 : 0);
  driveCar(car, throttle, steer, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = Math.abs(car.speed);
  // Run over pedestrians.
  for (const ped of S.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 26 && Math.abs(car.speed) > 60) {
      knockDown(ped);
      blood(ped.x, ped.y);
      addWanted(1);
    }
  }
  // Exit the car.
  if (wasPressed('KeyE')) {
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 34;
    p.y = car.y + Math.sin(side) * 34;
    resolveCircle(p, 12);
    p.inCar = null;
    sfxCarDoor();
  }
  // Shooting from a car is not allowed; the wheel is the weapon.
}

export function drawPlayer(ctx) {
  const p = S.player;
  if (!p || p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // Danny Voss: teal jacket, dark jeans.
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(6, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Gun.
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 13, 3.5);
  if (p.punchT > 0) {
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(16, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.hurtT > 0) {
    ctx.fillStyle = 'rgba(255,40,40,0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (p.reloading > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('RELOADING…', p.x, p.y - 20);
  }
}

export function spawnPickup(x, y, kind, amount) {
  S.pickups.push({ x, y, kind, amount: amount || 0, bob: Math.random() * 6 });
}

export function drawPickups(ctx) {
  for (const pk of S.pickups) {
    const bob = Math.sin(S.time * 3 + pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-2.5, -7, 5, 14);
      ctx.fillRect(-7, -2.5, 14, 5);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#222';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', 0, 4);
    } else {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    }
    ctx.restore();
  }
}
