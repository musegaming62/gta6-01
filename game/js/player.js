// The player on foot for Solmar: movement, sprint, aiming, shooting, punching,
// stealing cars and picking things up.

import { clamp, dist, angleTo, TWO_PI } from './util.js';
import { resolveCircle, pointInBuilding } from './world.js';
import { spawnBullet } from './combat.js';
import { nearestCar, exitCar } from './cars.js';
import { scarePeds } from './peds.js';
import { playShot, playPunch, playPickup } from './audio.js';
import { addWanted } from './police.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    ammo: 12,
    ammoReserve: 60,
    inCar: null,
    speed: 0,
    punchTimer: 0,
    shootTimer: 0,
    lastDamage: -99,
    moving: false,
  };
}

export function updatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;
  if (p.inCar) return; // driving is handled by cars.js
  p.punchTimer -= dt;
  p.shootTimer -= dt;
  // Aim at the mouse (world coordinates are set by main.js each frame).
  const mx = input.mouse.wx || p.x;
  const my = input.mouse.wy || p.y;
  p.angle = angleTo(p.x, p.y, mx, my);
  // Movement.
  let mxv = 0;
  let myv = 0;
  if (input.down.has('KeyW') || input.down.has('ArrowUp')) myv -= 1;
  if (input.down.has('KeyS') || input.down.has('ArrowDown')) myv += 1;
  if (input.down.has('KeyA') || input.down.has('ArrowLeft')) mxv -= 1;
  if (input.down.has('KeyD') || input.down.has('ArrowRight')) mxv += 1;
  const sprinting = (input.down.has('ShiftLeft') || input.down.has('ShiftRight')) && p.stamina > 1;
  const speed = sprinting ? 265 : 165;
  const len = Math.hypot(mxv, myv);
  p.moving = len > 0;
  if (len > 0) {
    p.x += (mxv / len) * speed * dt;
    p.y += (myv / len) * speed * dt;
    if (sprinting) p.stamina = Math.max(0, p.stamina - 26 * dt);
  }
  if (!sprinting) p.stamina = Math.min(100, p.stamina + 16 * dt);
  const fixed = resolveCircle(state.city, p.x, p.y, 12);
  p.x = fixed.x;
  p.y = fixed.y;
  // Health regen out of combat.
  if (state.time - p.lastDamage > 6 && p.hp > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + 4 * dt);
  }
  // Shoot.
  if (input.mouse.down && p.shootTimer <= 0) {
    if (p.ammo > 0) {
      p.shootTimer = 0.16;
      p.ammo--;
      state.stats.shots++;
      const gx = p.x + Math.cos(p.angle) * 16;
      const gy = p.y + Math.sin(p.angle) * 16;
      spawnBullet(state, gx, gy, p.angle + (Math.random() - 0.5) * 0.05, { from: 'player', dmg: 14 });
      playShot();
      scarePeds(state, p.x, p.y, 380);
      addWanted(state, 0.35);
    } else if (p.ammoReserve > 0) {
      // Auto reload when the magazine is empty.
      reload(state);
    }
  }
  // Reload.
  if (input.pressed.has('KeyR')) reload(state);
  // Punch.
  if (input.pressed.has('KeyF') && p.punchTimer <= 0) {
    p.punchTimer = 0.45;
    playPunch();
    const px = p.x + Math.cos(p.angle) * 26;
    const py = p.y + Math.sin(p.angle) * 26;
    for (const ped of state.peds) {
      if (!ped.dead && dist(px, py, ped.x, ped.y) < 26) {
        ped.hp -= 25;
        ped.fleeing = true;
        ped.target = { x: ped.x + (ped.x - p.x) * 2, y: ped.y + (ped.y - p.y) * 2 };
      }
    }
    for (const cop of state.cops) {
      if (dist(px, py, cop.x, cop.y) < 26) cop.hp -= 25;
    }
    addWanted(state, 0.3);
  }
  // Enter / exit a car.
  if (input.pressed.has('KeyE')) {
    const car = nearestCar(state, p.x, p.y, 46, (c) => !c.dead);
    if (car) {
      p.inCar = car;
      car.isPlayer = true;
      car.isTraffic = false;
      car.parked = false;
      if (car.driver) {
        // Throw the driver out onto the sidewalk.
        car.driver = false;
        state.peds.push({
          id: 9000 + Math.floor(Math.random() * 999),
          x: car.x + 30, y: car.y + 30, angle: 0, speed: 60, hp: 30,
          gang: false, fleeing: true, dead: false, target: { x: car.x + 300, y: car.y + 300 },
          wanderTimer: 2, shootTimer: 1, shirt: '#4a7ad4', pants: '#2a3a4a', skin: '#e8b88a',
        });
      }
      addWanted(state, 1);
      playPickup();
    }
  }
  // Pickups.
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) < 24) {
      if (pk.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + 40);
      if (pk.kind === 'ammo') p.ammoReserve += 24;
      if (pk.kind === 'money') {
        state.money += 50;
      }
      playPickup();
      state.pickups.splice(i, 1);
    }
  }
}

function reload(state) {
  const p = state.player;
  if (p.ammo >= 12 || p.ammoReserve <= 0) return;
  const need = 12 - p.ammo;
  const take = Math.min(need, p.ammoReserve);
  p.ammo += take;
  p.ammoReserve -= take;
  p.shootTimer = Math.max(p.shootTimer, 0.35);
}

export function drawPlayer(ctx, state, cam) {
  const p = state.player;
  if (p.inCar || p.hp <= 0) return;
  const sx = p.x - cam.x;
  const sy = p.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 10, 8, 0, 0, TWO_PI);
  ctx.fill();
  ctx.rotate(p.angle);
  // Legs and torso.
  ctx.fillStyle = '#2a3a4a';
  ctx.fillRect(-8, -4, 6, 8);
  ctx.fillStyle = '#d46a4a';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, TWO_PI);
  ctx.fill();
  // Head and gun.
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(5, 0, 5.5, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -1.5, 12, 3);
  // Muzzle flash while shooting.
  if (p.shootTimer > 0.1) {
    ctx.fillStyle = '#ffdd55';
    ctx.beginPath();
    ctx.arc(22, 0, 6, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPickups(ctx, state, cam) {
  for (const pk of state.pickups) {
    const sx = pk.x - cam.x;
    const sy = pk.y - cam.y;
    const bob = Math.sin(state.time * 4 + pk.x) * 2;
    ctx.save();
    ctx.translate(sx, sy + bob);
    if (pk.kind === 'health') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#cc2222';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#d4b84a';
      ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = '#7a5a10';
      ctx.fillRect(-6, -3, 12, 3);
    } else {
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#7a5a10';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    }
    ctx.restore();
  }
}
