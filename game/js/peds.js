// Pedestrians: civilians who walk the sidewalks and flee from violence, and
// armed gang members who attack on sight during the Payback mission.
import { clamp, dist, angleTo, randRange, pick, mulberry32 } from './util.js';
import { ROAD_CENTERS, WORLD_SIZE, collideBuildings, isOnRoad, onBeach } from './world.js';
import { burst } from './particles.js';

const SHIRTS = ['#d94f4f', '#4f7dd9', '#4fd97a', '#d9b84f', '#9a4fd9', '#d94fa8', '#4fd9c9', '#e8e8e8'];
const SKINS = ['#e8b88a', '#c98d5f', '#8a5a3b', '#f0c8a0'];

let pedId = 0;

export function makePed(x, y, opts) {
  const o = opts || {};
  return {
    id: ++pedId,
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: o.speed || randRange(Math.random, 34, 62),
    shirt: o.shirt || pick(Math.random, SHIRTS),
    skin: o.skin || pick(Math.random, SKINS),
    isGang: !!o.isGang,
    isCop: !!o.isCop,
    health: o.isGang ? 60 : 30,
    down: false,
    downTimer: 0,
    dead: false,
    vx: 0,
    vy: 0,
    // Walking state.
    walkAngle: Math.random() * Math.PI * 2,
    walkTimer: randRange(Math.random, 2, 6),
    fleeing: 0,
    fleeX: 0,
    fleeY: 0,
    // Gang shooting.
    shootTimer: randRange(Math.random, 0.5, 1.5),
    // Cop behaviour.
    arrestTimer: 0,
  };
}

export function spawnPeds(G, n) {
  const rng = mulberry32(4242);
  for (let i = 0; i < n; i++) {
    const px = G.player.x;
    const py = G.player.y;
    const x = clamp(px + randRange(rng, -700, 700), 80, WORLD_SIZE - 80);
    const y = clamp(py + randRange(rng, -700, 700), 80, 2900);
    if (dist(x, y, px, py) < 160) continue;
    G.peds.push(makePed(x, y, {}));
  }
}

// A gunshot or explosion nearby makes every civilian run from the source.
export function scarePeds(G, x, y, radius) {
  for (const p of G.peds) {
    if (p.down || p.isGang || p.isCop) continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.fleeing = randRange(Math.random, 2.5, 4.5);
      p.fleeX = x;
      p.fleeY = y;
    }
  }
}

export function updatePeds(G, dt) {
  const px = G.player.x;
  const py = G.player.y;

  // Keep civilians topped up near the player (cap 24).
  let civ = 0;
  for (const p of G.peds) if (!p.isGang && !p.isCop && !p.dead) civ++;
  if (civ < 20 && Math.random() < 0.03) {
    const a = Math.random() * Math.PI * 2;
    const r = randRange(Math.random, 500, 750);
    const x = clamp(px + Math.cos(a) * r, 80, WORLD_SIZE - 80);
    const y = clamp(py + Math.sin(a) * r, 80, 2900);
    G.peds.push(makePed(x, y, {}));
  }

  for (let i = G.peds.length - 1; i >= 0; i--) {
    const p = G.peds[i];
    if (p.dead) {
      p.deadTimer = (p.deadTimer || 0) + dt;
      if (p.deadTimer > 10) G.peds.splice(i, 1);
      continue;
    }
    if (p.down) {
      p.downTimer -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.1, dt);
      p.vy *= Math.pow(0.1, dt);
      if (p.downTimer <= 0) {
        p.down = false;
        p.health = 30;
      }
      continue;
    }

    if (p.isCop) {
      updateCopPed(G, p, dt);
    } else if (p.isGang) {
      updateGangPed(G, p, dt);
    } else {
      updateCivilian(G, p, dt);
    }

    // World bounds and building collision.
    p.x = clamp(p.x, 30, WORLD_SIZE - 30);
    p.y = clamp(p.y, 30, 2900);
    const push = collideBuildings(G.world, p.x, p.y, 12);
    if (push) {
      p.x += push.x;
      p.y += push.y;
    }
  }
}

function updateCivilian(G, p, dt) {
  let speed = p.speed;
  let dir = p.walkAngle;
  if (p.fleeing > 0) {
    p.fleeing -= dt;
    dir = angleTo(p.fleeX, p.fleeY, p.x, p.y);
    speed = 150;
  } else {
    p.walkTimer -= dt;
    if (p.walkTimer <= 0) {
      p.walkTimer = randRange(Math.random, 2, 6);
      // Prefer walking along a road or the beach.
      if (isOnRoad(p.x, p.y) || onBeach(p.x, p.y)) {
        const axis = Math.random() < 0.5 ? 0 : Math.PI / 2;
        p.walkAngle = axis + (Math.random() < 0.5 ? 0 : Math.PI);
      } else {
        p.walkAngle = Math.random() * Math.PI * 2;
      }
    }
  }
  p.angle = dir;
  p.x += Math.cos(dir) * speed * dt;
  p.y += Math.sin(dir) * speed * dt;
}

function updateGangPed(G, p, dt) {
  const d = dist(p.x, p.y, G.player.x, G.player.y);
  if (d > 700) {
    // Too far to matter: hold position.
    return;
  }
  // Chase the player and shoot when in range.
  p.angle = angleTo(p.x, p.y, G.player.x, G.player.y);
  if (d > 130) {
    p.x += Math.cos(p.angle) * 105 * dt;
    p.y += Math.sin(p.angle) * 105 * dt;
  }
  p.shootTimer -= dt;
  if (p.shootTimer <= 0 && d < 420 && !G.player.inCar) {
    p.shootTimer = randRange(Math.random, 0.9, 1.6);
    G.combat.enemyShoot(G, p.x, p.y, p.angle + randRange(Math.random, -0.14, 0.14), 8);
    G.audio.enemyShot();
  } else if (p.shootTimer <= 0) {
    p.shootTimer = 0.4;
  }
}

function updateCopPed(G, p, dt) {
  const d = dist(p.x, p.y, G.player.x, G.player.y);
  p.angle = angleTo(p.x, p.y, G.player.x, G.player.y);
  if (d > 60) {
    const sp = 132;
    p.x += Math.cos(p.angle) * sp * dt;
    p.y += Math.sin(p.angle) * sp * dt;
  }
  // Arrest: standing next to the player on foot while wanted.
  if (d < 38 && !G.player.inCar && G.wanted > 0) {
    p.arrestTimer += dt;
    if (p.arrestTimer > 1.2) {
      G.police.busted(G);
    }
  } else {
    p.arrestTimer = 0;
  }
  // Cops shoot at the player from a distance.
  p.shootTimer -= dt;
  if (p.shootTimer <= 0 && d < 380 && d > 70 && !G.player.inCar) {
    p.shootTimer = randRange(Math.random, 1.1, 1.9);
    G.combat.enemyShoot(G, p.x, p.y, p.angle + randRange(Math.random, -0.18, 0.18), 6);
    G.audio.enemyShot();
  } else if (p.shootTimer <= 0) {
    p.shootTimer = 0.5;
  }
}

export function damagePed(G, p, dmg, fromX, fromY) {
  p.health -= dmg;
  const a = angleTo(fromX, fromY, p.x, p.y);
  p.x += Math.cos(a) * 8;
  p.y += Math.sin(a) * 8;
  if (p.health <= 0 && !p.dead) {
    p.dead = true;
    p.deadTimer = 0;
    burst(G.particles, p.x, p.y, 10, '#ff5d5d', 130, 0.5, 4);
    if (p.isGang) {
      G.missions.onGangKilled(G, p);
    }
  } else if (!p.isGang && !p.isCop) {
    p.fleeing = 3;
    p.fleeX = fromX;
    p.fleeY = fromY;
  }
}

export function drawPeds(ctx, G, cam) {
  for (const p of G.peds) {
    if (p.x < cam.x - cam.w / 2 - 40 || p.x > cam.x + cam.w / 2 + 40 ||
        p.y < cam.y - cam.h / 2 - 40 || p.y > cam.y + cam.h / 2 + 40) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.dead || p.down) {
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.globalAlpha = p.dead ? 0.5 : 0.85;
    } else {
      ctx.rotate(p.angle);
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    ctx.fillStyle = p.isCop ? '#1f2a44' : (p.isGang ? '#3a1f1f' : p.shirt);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (!p.dead && !p.down) {
      // Facing tick (gun for gang/cops).
      ctx.fillStyle = p.isGang || p.isCop ? '#222' : p.shirt;
      ctx.fillRect(8, -2, 9, 4);
      if (p.isCop) {
        ctx.fillStyle = '#dfe6f0';
        ctx.fillRect(-3, -11, 6, 3);
      }
      if (p.isGang) {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Gang health bar.
    if (p.isGang && !p.dead && !p.down) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - 14, p.y - 22, 28, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(p.x - 14, p.y - 22, 28 * Math.max(0, p.health / 60), 4);
    }
  }
}
