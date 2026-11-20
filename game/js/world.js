// Solmar: the coastal city. A fixed-seed generated 3200x3200 open world with a
// road grid, six districts, a beach and ocean along the south edge, and a harbour
// dock. All layout is deterministic (seed 1337) so every load builds the same city.
import { clamp, mulberry32, randInt, randRange, pick, circleRectPush, pointInRect } from './util.js';

export const WORLD_SIZE = 3200;
export const ROAD_W = 100;
export const ROAD_CENTERS = [300, 700, 1100, 1500, 1900, 2300, 2700];

// Fixed mission/story locations. Kept clear of buildings by the generator.
export const SPOTS = {
  playerStart: { x: 1500, y: 1650, label: 'Downtown' },
  sportsCar: { x: 1680, y: 1320, label: 'Sports car' },
  chopShop: { x: 900, y: 2350, label: 'Chop shop' },
  pickupA: { x: 2500, y: 900, label: 'Pickup point' },
  pickupB: { x: 700, y: 700, label: 'Drop-off' },
  safehouse: { x: 2900, y: 2830, label: 'Safehouse' },
  turf: { x: 520, y: 1950, label: 'Vulture turf' },
  bank: { x: 1500, y: 1500, label: 'Solmar National Bank' },
  boat: { x: 3050, y: 2970, label: 'Harbour boat' },
};

const DISTRICTS = [
  { id: 'downtown', name: 'Downtown', base: '#8a8f7a', roofs: ['#5d6b7a', '#6b7a8a', '#7a6b5d', '#4d5a6b'] },
  { id: 'port', name: 'Portside', base: '#7d8478', roofs: ['#8a6f4d', '#6f7a6b', '#7a5d4d'] },
  { id: 'beach', name: 'Marina Beach', base: '#d9c48f', roofs: ['#c9a86a', '#b89a5d'] },
  { id: 'heights', name: 'Palm Heights', base: '#7fae6e', roofs: ['#a8543f', '#b06a4a', '#8a5a3f'] },
  { id: 'foundry', name: 'Foundry', base: '#8a8578', roofs: ['#6b6b6b', '#7a7a72', '#5d5d55'] },
  { id: 'hills', name: 'Vista Hills', base: '#86a860', roofs: ['#7a4a3f', '#94553f', '#6b4a3f'] },
];

export function districtAt(x, y) {
  if (y >= 2700) return 'beach';
  if (x >= 2500 && y < 1500) return 'port';
  if (x >= 2100 && y < 1100) return 'hills';
  if (x < 1100 && y < 1100) return 'heights';
  if (x < 1100 && y >= 1500) return 'foundry';
  return 'downtown';
}

function districtDef(id) {
  return DISTRICTS.find((d) => d.id === id);
}

export function buildWorld(seed) {
  const rng = mulberry32(seed || 1337);
  const buildings = [];
  const trees = [];
  const parks = [];

  // Clear zones around story spots: no building may cover one.
  const clearZones = Object.values(SPOTS).map((s) => ({ x: s.x, y: s.y, r: 80 }));

  // City blocks sit between road centrelines. A block spans 350..650, 750..1050, ...
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const x0 = ROAD_CENTERS[bx] + ROAD_W / 2 + 10;
      const y0 = ROAD_CENTERS[by] + ROAD_W / 2 + 10;
      const x1 = ROAD_CENTERS[bx + 1] !== undefined
        ? ROAD_CENTERS[bx + 1] - ROAD_W / 2 - 10
        : WORLD_SIZE - 40;
      const y1 = ROAD_CENTERS[by + 1] !== undefined
        ? ROAD_CENTERS[by + 1] - ROAD_W / 2 - 10
        : 2920 - 10;
      if (x1 <= x0 + 40 || y1 <= y0 + 40) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const def = districtDef(district);

      // Residential and hills blocks sometimes become parks instead of buildings.
      if ((district === 'heights' || district === 'hills') && chance(rng, 0.18)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 6; t++) {
          trees.push({ x: randRange(rng, x0 + 20, x1 - 20), y: randRange(rng, y0 + 20, y1 - 20), r: randRange(rng, 10, 16) });
        }
        continue;
      }

      // One large building, or a pair of smaller ones, per block.
      const count = district === 'downtown' ? 2 : (chance(rng, 0.88) ? 2 : 1);
      for (let i = 0; i < count; i++) {
        let bw;
        let bh;
        let px;
        let py;
        if (count === 1) {
          bw = randRange(rng, (x1 - x0) * 0.45, (x1 - x0) * 0.8);
          bh = randRange(rng, (y1 - y0) * 0.45, (y1 - y0) * 0.8);
          px = cx - bw / 2 + randRange(rng, -20, 20);
          py = cy - bh / 2 + randRange(rng, -20, 20);
        } else {
          bw = (x1 - x0) / 2 - 24;
          bh = randRange(rng, (y1 - y0) * 0.4, (y1 - y0) * 0.7);
          px = i === 0 ? x0 + 8 : x0 + (x1 - x0) / 2 + 8;
          py = y0 + (y1 - y0 - bh) / 2;
        }
        // Keep story spots clear.
        const hitSpot = clearZones.some((z) => {
          const nx = clamp(z.x, px, px + bw);
          const ny = clamp(z.y, py, py + bh);
          const dx = z.x - nx;
          const dy = z.y - ny;
          return dx * dx + dy * dy < z.r * z.r;
        });
        if (hitSpot) continue;
        buildings.push({
          x: px, y: py, w: bw, h: bh,
          district,
          roof: pick(rng, def.roofs),
          tall: district === 'downtown' && chance(rng, 0.5),
        });
      }

      // A few street trees on block corners.
      if (chance(rng, 0.4)) {
        trees.push({ x: x0 + 14, y: y0 + 14, r: randRange(rng, 8, 13) });
      }
    }
  }

  // The bank is a landmark: a wide building in the block just south-east of the
  // downtown spot, clear of the roads so traffic keeps flowing.
  buildings.push({
    x: SPOTS.bank.x + 60, y: SPOTS.bank.y + 60, w: 180, h: 120,
    district: 'downtown', roof: '#c9a227', tall: true, landmark: 'bank',
  });
  // Chop shop: a low warehouse in the block just south of its spot, off the road.
  buildings.push({
    x: SPOTS.chopShop.x - 80, y: SPOTS.chopShop.y + 70, w: 160, h: 110,
    district: 'foundry', roof: '#7a3f2e', tall: false, landmark: 'chop',
  });

  // Beach palms along the sand.
  for (let i = 0; i < 26; i++) {
    trees.push({
      x: randRange(rng, 80, WORLD_SIZE - 80),
      y: randRange(rng, 2940, 3040),
      r: randRange(rng, 9, 14),
      palm: true,
    });
  }

  return {
    size: WORLD_SIZE,
    buildings,
    trees,
    parks,
    seed: seed || 1337,
    buildingCount: buildings.length,
  };
}

export function isOnRoad(x, y) {
  for (const c of ROAD_CENTERS) {
    if (Math.abs(x - c) <= ROAD_W / 2) return true;
    if (Math.abs(y - c) <= ROAD_W / 2) return true;
  }
  return false;
}

export function inOcean(x, y) {
  return y > 3080;
}

export function onBeach(x, y) {
  return y > 2920 && y <= 3080;
}

// Push a circle out of every building it overlaps. Returns total push applied.
export function collideBuildings(world, x, y, r) {
  let px = 0;
  let py = 0;
  let hit = false;
  for (const b of world.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const push = circleRectPush(x, y, r, b.x, b.y, b.w, b.h);
    if (push) {
      px += push.x;
      py += push.y;
      hit = true;
    }
  }
  return hit ? { x: px, y: py } : null;
}

export function pointInBuilding(world, x, y) {
  for (const b of world.buildings) {
    if (pointInRect(x, y, b.x, b.y, b.w, b.h)) return b;
  }
  return null;
}

// Nearest road centreline coordinate to a point (for traffic AI recovery).
export function nearestRoadCoord(v) {
  let best = ROAD_CENTERS[0];
  let bd = Infinity;
  for (const c of ROAD_CENTERS) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function chance(rng, p) {
  return rng() < p;
}

// ---- Rendering ----

export function drawWorld(ctx, cam, world, time) {
  const vw = cam.w;
  const vh = cam.h;
  const x0 = cam.x - vw / 2 - 60;
  const y0 = cam.y - vh / 2 - 60;
  const x1 = cam.x + vw / 2 + 60;
  const y1 = cam.y + vh / 2 + 60;

  // Ground: district base colours in big tiles.
  ctx.fillStyle = '#7d8478';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const tile = 400;
  for (let tx = Math.max(0, Math.floor(x0 / tile) * tile); tx < x1; tx += tile) {
    for (let ty = Math.max(0, Math.floor(y0 / tile) * tile); ty < y1; ty += tile) {
      const d = districtDef(districtAt(tx + tile / 2, ty + tile / 2));
      ctx.fillStyle = d.base;
      ctx.fillRect(tx, ty, tile, tile);
    }
  }

  // Ocean and beach along the south edge.
  if (y1 > 2920) {
    ctx.fillStyle = '#e0cd96';
    ctx.fillRect(Math.max(x0, 0), 2920, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), Math.min(y1, 3080) - 2920);
    ctx.fillStyle = '#2f6fb0';
    ctx.fillRect(Math.max(x0, 0), 3080, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), Math.min(y1, WORLD_SIZE) - 3080);
    // Animated wave line at the waterline.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let wx = Math.max(x0, 0); wx < Math.min(x1, WORLD_SIZE); wx += 40) {
      const wy = 3080 + Math.sin(wx * 0.01 + time * 1.4) * 4;
      if (wx === Math.max(x0, 0)) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
  }

  // Parks.
  for (const p of world.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#5d9a4a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  // Roads: dark asphalt with centre dashes.
  ctx.fillStyle = '#3d3d42';
  for (const c of ROAD_CENTERS) {
    if (c + ROAD_W / 2 >= x0 && c - ROAD_W / 2 <= x1) {
      ctx.fillRect(c - ROAD_W / 2, Math.max(y0, 0), ROAD_W, Math.min(y1, 2920) - Math.max(y0, 0));
    }
    if (c + ROAD_W / 2 >= y0 && c - ROAD_W / 2 <= y1) {
      ctx.fillRect(Math.max(x0, 0), c - ROAD_W / 2, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), ROAD_W);
    }
  }
  // Sidewalk edges.
  ctx.fillStyle = '#9a9a92';
  for (const c of ROAD_CENTERS) {
    if (c + ROAD_W / 2 + 8 >= x0 && c - ROAD_W / 2 - 8 <= x1) {
      ctx.fillRect(c - ROAD_W / 2 - 8, Math.max(y0, 0), 8, Math.min(y1, 2920) - Math.max(y0, 0));
      ctx.fillRect(c + ROAD_W / 2, Math.max(y0, 0), 8, Math.min(y1, 2920) - Math.max(y0, 0));
    }
    if (c + ROAD_W / 2 + 8 >= y0 && c - ROAD_W / 2 - 8 <= y1) {
      ctx.fillRect(Math.max(x0, 0), c - ROAD_W / 2 - 8, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), 8);
      ctx.fillRect(Math.max(x0, 0), c + ROAD_W / 2, Math.min(x1, WORLD_SIZE) - Math.max(x0, 0), 8);
    }
  }
  // Lane dashes.
  ctx.strokeStyle = 'rgba(230,230,200,0.7)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const c of ROAD_CENTERS) {
    if (c >= y0 && c <= y1) {
      ctx.moveTo(Math.max(x0, 0), c);
      ctx.lineTo(Math.min(x1, WORLD_SIZE), c);
    }
    if (c >= x0 && c <= x1) {
      ctx.moveTo(c, Math.max(y0, 0));
      ctx.lineTo(c, Math.min(y1, 2920));
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Buildings with a drop shadow and a lighter roof inset.
  for (const b of world.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    if (b.tall) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    }
    if (b.landmark === 'bank') {
      ctx.fillStyle = '#fff8d0';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', b.x + b.w / 2, b.y + b.h / 2 + 9);
    }
    if (b.landmark === 'chop') {
      ctx.fillStyle = '#ffd0a0';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CHOP SHOP', b.x + b.w / 2, b.y + b.h / 2 + 5);
    }
  }

  // Trees.
  for (const t of world.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#2f6b2f';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f8a3f';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // Harbour dock and boat at the south-east shoreline.
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(2980, 2920, 140, 60);
  ctx.fillStyle = '#8a6a3f';
  ctx.fillRect(2980, 2920, 140, 10);
  drawBoat(ctx, SPOTS.boat.x, SPOTS.boat.y, time);
}

export function drawBoat(ctx, x, y, time) {
  const bob = Math.sin(time * 1.2) * 2;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = '#f0f0e8';
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.lineTo(42, 0);
  ctx.lineTo(30, 16);
  ctx.lineTo(-30, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-14, -26, 28, 26);
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(-4, -40, 8, 16);
  ctx.restore();
}
