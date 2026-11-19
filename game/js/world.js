// Solmar — the static world layer: the whole city painted once onto an offscreen canvas,
// then blitted each frame. Also the collision queries the moving systems use.
import { WORLD, ROAD_AT, ROAD_W } from './state.js';
import { isSolid } from './city.js';
import { circleVsBox } from './utils.js';

// Paint the city once. Returns an offscreen canvas of WORLD x WORLD.
export function paintStaticLayer(city) {
  const c = document.createElement('canvas');
  c.width = WORLD; c.height = WORLD;
  const ctx = c.getContext('2d');

  // Ground: warm grass.
  ctx.fillStyle = '#8fb573';
  ctx.fillRect(0, 0, WORLD, WORLD);

  // Beach and ocean on the south edge.
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(0, city.beachY, WORLD, city.waterY - city.beachY);
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(0, city.waterY, WORLD, WORLD - city.waterY);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = 40; x < WORLD; x += 160) {
    ctx.fillRect(x, city.waterY + 14, 90, 3);
    ctx.fillRect(x + 70, city.waterY + 46, 70, 3);
  }

  // Parks.
  for (const p of city.parks) {
    ctx.fillStyle = '#6aa84f';
    ctx.fillRect(p.x - 8, p.y - 8, p.w + 16, p.h + 16);
    ctx.strokeStyle = '#d9c9a3';
    ctx.lineWidth = 4;
    ctx.strokeRect(p.x + 14, p.y + 14, p.w - 28, p.h - 28);
  }

  // Sidewalks: light strips along every road.
  ctx.fillStyle = '#c9bfa9';
  for (const r of ROAD_AT) {
    ctx.fillRect(0, r - ROAD_W / 2 - 12, WORLD, ROAD_W + 24);
    ctx.fillRect(r - ROAD_W / 2 - 12, 0, ROAD_W + 24, WORLD);
  }

  // Roads: asphalt with dashed centre lines and edge lines.
  for (const r of ROAD_AT) {
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(0, r - ROAD_W / 2, WORLD, ROAD_W);
    ctx.fillRect(r - ROAD_W / 2, 0, ROAD_W, WORLD);
  }
  ctx.fillStyle = '#f2d06b';
  for (const r of ROAD_AT) {
    for (let x = 0; x < WORLD; x += 64) ctx.fillRect(x, r - 2, 34, 4);
    for (let y = 0; y < WORLD; y += 64) ctx.fillRect(r - 2, y, 4, 34);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (const r of ROAD_AT) {
    ctx.beginPath(); ctx.moveTo(0, r - ROAD_W / 2 + 3); ctx.lineTo(WORLD, r - ROAD_W / 2 + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, r + ROAD_W / 2 - 3); ctx.lineTo(WORLD, r + ROAD_W / 2 - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r - ROAD_W / 2 + 3, 0); ctx.lineTo(r - ROAD_W / 2 + 3, WORLD); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r + ROAD_W / 2 - 3, 0); ctx.lineTo(r + ROAD_W / 2 - 3, WORLD); ctx.stroke();
  }

  // Zebra crossings at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  for (const rx of ROAD_AT) {
    for (const ry of ROAD_AT) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx - ROAD_W / 2 + 6 + i * 12, ry - ROAD_W / 2 - 12, 6, 10);
        ctx.fillRect(rx - ROAD_W / 2 + 6 + i * 12, ry + ROAD_W / 2 + 2, 6, 10);
      }
    }
  }

  // Buildings: long sun shadows, then the roof with detail.
  const sunX = 18, sunY = 12;
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + sunX, b.y + sunY, b.w, b.h);
  }
  for (const b of city.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Rooftop detail: a darker inset + a couple of AC units.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + 12, b.y + 12, 14, 10);
      ctx.fillRect(b.x + b.w - 26, b.y + b.h - 22, 14, 10);
    }
    if (b.tall > 24) {
      // Downtown tower: glass strip.
      ctx.fillStyle = 'rgba(120,190,220,0.5)';
      ctx.fillRect(b.x + b.w * 0.3, b.y + 6, b.w * 0.4, b.h - 12);
    }
  }

  // Trees and palms.
  for (const t of city.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(t.x + 5, t.y + 5, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.palm ? '#4e9b47' : '#3f7d3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b8e4e';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  return c;
}

// Push a circle out of every building it overlaps. Returns true on any hit.
export function collideBuildings(city, ent, r) {
  let hit = false;
  for (const b of city.buildings) {
    const push = circleVsBox(ent.x, ent.y, r, b);
    if (push) {
      ent.x += push.x; ent.y += push.y;
      hit = true;
    }
  }
  // Ocean blocks movement.
  if (ent.y > WORLD - 60) { ent.y = WORLD - 60; hit = true; }
  return hit;
}

// Keep an entity inside the world and out of the ocean.
export function clampToWorld(ent) {
  ent.x = Math.max(20, Math.min(WORLD - 20, ent.x));
  ent.y = Math.max(20, Math.min(WORLD - 20, ent.y));
}

export function solidAt(city, x, y) { return isSolid(city, x, y); }
