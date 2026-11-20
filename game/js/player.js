// The player on foot: WASD movement, sprint with stamina, mouse aim and
// shooting, punching, entering and leaving cars, health and pickups.
import { clamp, dist, angleTo } from './util.js';
import { WORLD_SIZE, collideBuildings, inOcean, onBeach } from './world.js';
import { burst, floatText } from './particles.js';
import { nearestCar } from './cars.js';
import { scarePeds } from './peds.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: 100,
    maxHealth: 100,
    stamina: 100,
    money: 0,
    ammo: 48,
    maxAmmo: 120,
    inCar: null,
    shootTimer: 0,
    punchTimer: 0,
    regenTimer: 0,
    walkPhase: 0,
    moving: false,
  };
}

export function damage(G, amount) {
  const p = G.player;
  if (p.health <= 0) return;
  p.health -= amount;
  p.regenTimer = 4;
  burst(G.particles, p.x, p.y, 5, '#ff5d5d', 100, 0.4, 4);
  if (p.health <= 0) {
    p.health = 0;
    G.police.wasted(G);
  }
}

export function addMoney(G, amount, x, y) {
  G.player.money += amount;
  floatText(G.particles, x !== undefined ? x : G.player.x, y !== undefined ? y : G.player.y - 20, '+$' + amount, '#ffd94d');
  G.audio.coin();
}

export function addAmmo(G, amount) {
  G.player.ammo = Math.min(G.player.maxAmmo, G.player.ammo + amount);
}

export function heal(G, amount) {
  G.player.health = Math.min(G.player.maxHealth, G.player.health + amount);
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;

  // Health regen out of combat.
  if (p.regenTimer > 0) p.regenTimer -= dt;
  else if (p.health > 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + 2.2 * dt);
  }

  if (p.inCar) {
    // Riding: position follows the car; engine hum follows speed.
    const car = p.inCar;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    G.audio.engine(Math.abs(car.speed) / car.maxSpeed);
    // Leave the car.
    if (input.hit('KeyE')) {
      const side = car.angle + Math.PI / 2;
      p.x = car.x + Math.cos(side) * 34;
      p.y = car.y + Math.sin(side) * 34;
      car.driver = null;
      p.inCar = null;
      G.audio.engine(0);
      G.audio.click();
    }
    return;
  }
  G.audio.engine(0);

  // Aim at the mouse (world coordinates).
  const wx = G.camera.x + (input.mouseX - G.view.w / 2);
  const wy = G.camera.y + (input.mouseY - G.view.h / 2);
  p.angle = angleTo(p.x, p.y, wx, wy);

  // Move.
  const ax = input.axes();
  const wantSprint = input.sprinting() && p.stamina > 1;
  let speed = wantSprint ? 235 : 150;
  if (onBeach(p.x, p.y)) speed *= 0.8;
  p.moving = ax.x !== 0 || ax.y !== 0;
  if (p.moving) {
    const len = Math.hypot(ax.x, ax.y) || 1;
    p.x += (ax.x / len) * speed * dt;
    p.y += (ax.y / len) * speed * dt;
    p.walkPhase += dt * (wantSprint ? 14 : 9);
    if (wantSprint) p.stamina = Math.max(0, p.stamina - 26 * dt);
  }
  if (!wantSprint) p.stamina = Math.min(100, p.stamina + 16 * dt);

  // Buildings, ocean and world bounds.
  const push = collideBuildings(G.world, p.x, p.y, 12);
  if (push) {
    p.x += push.x;
    p.y += push.y;
  }
  if (inOcean(p.x, p.y)) p.y = 3072;
  p.x = clamp(p.x, 24, WORLD_SIZE - 24);
  p.y = clamp(p.y, 24, WORLD_SIZE - 24);

  // Shooting.
  p.shootTimer -= dt;
  if (input.mouseDown && p.shootTimer <= 0 && p.ammo > 0) {
    p.shootTimer = 0.16;
    p.ammo -= 1;
    G.combat.playerShoot(G, p.x, p.y, p.angle);
    scarePeds(G, p.x, p.y, 420);
    G.police.addWanted(G, 0.25);
  }
  if (input.hit('KeyR') && p.ammo < p.maxAmmo) {
    p.ammo = p.maxAmmo;
    G.audio.click();
  }

  // Punch: knocks a nearby pedestrian down.
  p.punchTimer -= dt;
  if (input.hit('KeyF') && p.punchTimer <= 0) {
    p.punchTimer = 0.45;
    G.audio.punch();
    const fx = p.x + Math.cos(p.angle) * 26;
    const fy = p.y + Math.sin(p.angle) * 26;
    for (const ped of G.peds) {
      if (ped.down || ped.dead) continue;
      if (dist(fx, fy, ped.x, ped.y) < 26) {
        ped.down = true;
        ped.downTimer = 5;
        ped.vx = Math.cos(p.angle) * 160;
        ped.vy = Math.sin(p.angle) * 160;
        burst(G.particles, ped.x, ped.y, 6, '#ffe9a8', 110, 0.35, 4);
        G.police.addWanted(G, 0.5);
        break;
      }
    }
  }

  // Enter the nearest car.
  if (input.hit('KeyE')) {
    const car = nearestCar(G, p.x, p.y, 56);
    if (car && !car.dead) {
      car.driver = 'player';
      p.inCar = car;
      G.audio.click();
      if (!car.wasStolen) {
        car.wasStolen = true;
        G.police.addWanted(G, 1);
      }
      G.missions.onEnterCar(G, car);
    }
  }

  // Pickups (ammo and health crates scattered in the world).
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) < 26) {
      if (pk.kind === 'ammo') {
        addAmmo(G, 24);
        floatText(G.particles, pk.x, pk.y - 14, '+24 AMMO', '#7dd97a');
      } else {
        heal(G, 35);
        floatText(G.particles, pk.x, pk.y - 14, '+35 HP', '#ff7a7a');
      }
      G.audio.pickup();
      G.pickups.splice(i, 1);
    }
  }
}

export function drawPlayer(ctx, G) {
  const p = G.player;
  if (p.inCar || p.health <= 0) return;
  const bob = p.moving ? Math.sin(p.walkPhase) * 2 : 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Gun.
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 14, 4);
  // Body (Danny: dark jacket).
  ctx.fillStyle = '#2e4a6b';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  // Direction tick.
  ctx.fillStyle = '#ffd94d';
  ctx.fillRect(10, -1.5, 6, 3);
  ctx.restore();
  // Stamina arc when sprinting low.
  if (p.stamina < 35) {
    ctx.strokeStyle = 'rgba(255,217,77,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.stamina) / 100);
    ctx.stroke();
  }
}
