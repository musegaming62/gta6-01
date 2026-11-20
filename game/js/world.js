// Solmar — the city. Deterministic generation (seeded RNG) of a 3200x3200
// coastal city: six named districts, a road grid, buildings, a beach and
// ocean to the south, and a harbour with docks on the east edge. Also owns
// collision queries and the ground/building drawing.

import { S, WORLD, ROAD_STEP, ROAD_HALF, BEACH_Y, WATER_Y } from './state.js';
import { mulberry32, clamp, randInt } from './util.js';

export const ROAD_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROAD_Y = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

export const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 1200, y1: 1200, palette: ['#b5654a', '#c97e5a', '#a85f46', '#d08a63'], ground: '#7fae6d' },
  { name: 'Downtown', x0: 1200, y0: 0, x1: 3200, y1: 1200, palette: ['#5b7fa6', '#6b8fb5', '#4e6d94', '#7d9cc0'], ground: '#8a8f96' },
  { name: 'La Vista', x0: 0, y0: 1200, x1: 1200, y1: 2200, palette: ['#e8b4b8', '#f2c9a0', '#d9a0a8', '#eec27a'], ground: '#86b364' },
  { name: 'Portside', x0: 1200, y0: 1200, x1: 3200, y1: 2200, palette: ['#8a7f74', '#7a6f66', '#9a8a7a', '#6e6258'], ground: '#9a938a' },
  { name: 'Marina Beach', x0: 0, y0: 2200, x1: 1600, y1: 3200, palette: ['#f2ead8', '#e8dcc0', '#ffffff', '#e0d0b0'], ground: '#e8d9a8' },
  { name: 'Hillside', x0: 1600, y0: 2200, x1: 3200, y1: 3200, palette: ['#6d8f6d', '#7fa07a', '#5d7f5d', '#8fae8a'], ground: '#7ba05b' },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function buildCity() {
  const rng = mulberry32(1337);
  const buildings = [];
  const trees = [];
  const spots = []; // parking spots on roadsides
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const landmarkBlocks = {
    bank: { bx: 4, by: 0, label: 'SOLMAR NATIONAL BANK', w: 150, h: 110 },
    chop: { bx: 5, by: 3, label: 'CHOP SHOP', w: 130, h: 90 },
    safe: { bx: 1, by: 3, label: 'SAFEHOUSE', w: 110, h: 90 },
    turf: { bx: 5, by: 5, label: 'VULTURE TURF', w: 0, h: 0 },
    pickup: { bx: 3, by: 1, label: 'PICKUP', w: 0, h: 0 },
  };

  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const x0 = ROAD_X[bx] + ROAD_HALF + 22;
      const y0 = ROAD_Y[by] + ROAD_HALF + 22;
      const x1 = ROAD_X[bx + 1] - ROAD_HALF - 22;
      const y1 = ROAD_Y[by + 1] - ROAD_HALF - 22;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      // Landmark blocks get their landmark instead of random buildings.
      let lm = null;
      for (const key in landmarkBlocks) {
        const L = landmarkBlocks[key];
        if (L.bx === bx && L.by === by) { lm = { key, ...L }; break; }
      }
      if (lm) {
        if (lm.w > 0) {
          buildings.push({ x: cx - lm.w / 2, y: cy - lm.h / 2, w: lm.w, h: lm.h, color: pick(d.palette), district: d.name, label: lm.label, landmark: lm.key });
        } else if (lm.key === 'turf') {
          // open lot: no building, gang spawn points around the centre
          buildings.push({ x: cx - 90, y: cy - 60, w: 60, h: 44, color: '#7a4a3a', district: d.name, label: 'WAREHOUSE', landmark: 'shed' });
        }
        continue;
      }
      // Beach strip: southern blocks are sand with palms, few buildings.
      if (cy > 2780) {
        for (let i = 0; i < 4; i++) {
          trees.push({ x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0), palm: true });
        }
        if (rng() < 0.35) {
          buildings.push({ x: cx - 55, y: cy - 40, w: 110, h: 80, color: pick(d.palette), district: d.name, label: '' });
        }
        continue;
      }
      if (rng() < 0.08) {
        // Park block: grass and trees, no building.
        for (let i = 0; i < 5; i++) {
          trees.push({ x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0), palm: false });
        }
        continue;
      }
      const two = rng() < 0.65;
      if (two) {
        const w1 = 90 + rng() * 50, h1 = 70 + rng() * 50;
        const w2 = 80 + rng() * 50, h2 = 60 + rng() * 40;
        buildings.push({ x: x0 + 8, y: y0 + 8, w: w1, h: h1, color: pick(d.palette), district: d.name, label: '' });
        buildings.push({ x: x1 - w2 - 8, y: y1 - h2 - 8, w: w2, h: h2, color: pick(d.palette), district: d.name, label: '' });
      } else {
        const w = 130 + rng() * 60, h = 100 + rng() * 60;
        buildings.push({ x: cx - w / 2, y: cy - h / 2, w, h, color: pick(d.palette), district: d.name, label: '' });
      }
      // A couple of trees in the block corners.
      if (rng() < 0.6) trees.push({ x: x0 + 14, y: y1 - 14, palm: false });
      if (rng() < 0.4) trees.push({ x: x1 - 14, y: y0 + 14, palm: false });
    }
  }

  // Parking spots along road edges for parked cars.
  for (let i = 0; i < 26; i++) {
    const vertical = rng() < 0.5;
    const road = ROAD_X[Math.floor(rng() * ROAD_X.length)];
    const along = 260 + rng() * 2680;
    const side = rng() < 0.5 ? -1 : 1;
    if (vertical) spots.push({ x: road + side * (ROAD_HALF + 16), y: along, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    else spots.push({ x: along, y: road + side * (ROAD_HALF + 16), angle: side > 0 ? 0 : Math.PI });
  }

  const landmarks = {};
  for (const b of buildings) {
    if (b.landmark) landmarks[b.landmark] = { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h };
  }
  // Fixed points that are not buildings.
  landmarks.pickup = { x: ROAD_X[3] + 200, y: ROAD_Y[1] + 200, w: 0, h: 0 };
  landmarks.turf = { x: ROAD_X[5] + 200, y: ROAD_Y[5] + 200, w: 0, h: 0 };
  landmarks.boat = { x: 3130, y: 2500, w: 0, h: 0 };
  landmarks.dock = { x: 3060, y: 2500, w: 0, h: 0 };

  S.world = { buildings, trees, spots, landmarks };
  return S.world;
}

export function solidAt(x, y, r) {
  if (x < r || y < r || x > WORLD - r || y > WORLD - r) return true;
  if (y > WATER_Y - r) return true; // ocean
  for (const b of S.world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of buildings/water/bounds. Returns true if it collided.
export function resolveCircle(e, r) {
  let hit = false;
  if (e.x < r) { e.x = r; hit = true; }
  if (e.y < r) { e.y = r; hit = true; }
  if (e.x > WORLD - r) { e.x = WORLD - r; hit = true; }
  if (e.y > WATER_Y - r) { e.y = WATER_Y - r; hit = true; }
  for (const b of S.world.buildings) {
    const cx = clamp(e.x, b.x, b.x + b.w);
    const cy = clamp(e.y, b.y, b.y + b.h);
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        e.x = cx + (dx / d) * r;
        e.y = cy + (dy / d) * r;
      } else {
        // centre inside the box: push out along the smallest overlap
        const left = e.x - b.x, right = b.x + b.w - e.x;
        const top = e.y - b.y, bottom = b.y + b.h - e.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) e.x = b.x - r;
        else if (m === right) e.x = b.x + b.w + r;
        else if (m === top) e.y = b.y - r;
        else e.y = b.y + b.h + r;
      }
    }
  }
  return hit;
}

// True when the segment from (x1,y1) to (x2,y2) crosses any building.
// Used for line of sight: cops and gang members cannot shoot through walls.
export function segmentHitsBuilding(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d / 14));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
    for (const b of S.world.buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
  }
  return false;
}

export function isOnRoad(x, y) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) < ROAD_HALF) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) < ROAD_HALF) return true;
  return false;
}

export function nearestRoad(x, y) {
  let best = null, bestD = 1e9;
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { axis: 'x', road: rx, along: y }; }
  }
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { axis: 'y', road: ry, along: x }; }
  }
  return best;
}

// --- Drawing ----------------------------------------------------------------

export function drawWorld(ctx, view) {
  const { x0, y0, x1, y1 } = view;
  // Ground base
  ctx.fillStyle = '#79a85e';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // District ground tints
  for (const d of DISTRICTS) {
    const ix0 = Math.max(d.x0, x0), iy0 = Math.max(d.y0, y0);
    const ix1 = Math.min(d.x1, x1), iy1 = Math.min(d.y1, y1);
    if (ix1 <= ix0 || iy1 <= iy0) continue;
    ctx.fillStyle = d.ground;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
    ctx.globalAlpha = 1;
  }
  // Beach and ocean
  if (y1 > BEACH_Y) {
    ctx.fillStyle = '#e8d9a0';
    ctx.fillRect(Math.max(x0, 0), BEACH_Y, Math.min(x1, WORLD) - Math.max(x0, 0), Math.min(y1, WATER_Y) - BEACH_Y);
    if (y1 > WATER_Y) {
      ctx.fillStyle = '#2f7fc4';
      ctx.fillRect(Math.max(x0, 0), WATER_Y, Math.min(x1, WORLD) - Math.max(x0, 0), y1 - WATER_Y);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let wy = WATER_Y + 24; wy < y1; wy += 46) {
        ctx.beginPath();
        for (let wx = Math.max(x0, 0); wx < Math.min(x1, WORLD); wx += 40) {
          ctx.moveTo(wx, wy + Math.sin(wx * 0.02 + wy) * 3);
          ctx.lineTo(wx + 20, wy + Math.sin(wx * 0.02 + wy) * 3);
        }
        ctx.stroke();
      }
    }
  }
  // Harbour docks (east edge)
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(3040, 2360, 90, 280);
  ctx.fillStyle = '#6e5638';
  ctx.fillRect(3040, 2360, 90, 12);
  // Roads
  ctx.fillStyle = '#3d3d42';
  for (const rx of ROAD_X) {
    if (rx + ROAD_HALF < x0 || rx - ROAD_HALF > x1) continue;
    ctx.fillRect(rx - ROAD_HALF, Math.max(y0, 0), ROAD_HALF * 2, Math.min(y1, WATER_Y) - Math.max(y0, 0));
  }
  for (const ry of ROAD_Y) {
    if (ry + ROAD_HALF < y0 || ry - ROAD_HALF > y1 || ry > WATER_Y) continue;
    ctx.fillRect(Math.max(x0, 0), ry - ROAD_HALF, Math.min(x1, WORLD) - Math.max(x0, 0), ROAD_HALF * 2);
  }
  // Centre dashes
  ctx.strokeStyle = 'rgba(240,220,90,0.8)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const rx of ROAD_X) {
    if (rx < x0 || rx > x1) continue;
    ctx.beginPath();
    ctx.moveTo(rx, Math.max(y0, 0));
    ctx.lineTo(rx, Math.min(y1, WATER_Y));
    ctx.stroke();
  }
  for (const ry of ROAD_Y) {
    if (ry < y0 || ry > y1 || ry > WATER_Y) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(x0, 0), ry);
    ctx.lineTo(Math.min(x1, WORLD), ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      if (rx < x0 - 80 || rx > x1 + 80 || ry < y0 - 80 || ry > y1 + 80) continue;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(rx - ROAD_HALF + 6 + i * 22, ry - 52, 10, 14);
        ctx.fillRect(rx - ROAD_HALF + 6 + i * 22, ry + 38, 10, 14);
      }
    }
  }
  // Trees
  for (const t of S.world.trees) {
    if (t.x < x0 - 20 || t.x > x1 + 20 || t.y < y0 - 20 || t.y > y1 + 20) continue;
    ctx.fillStyle = t.palm ? '#2f8f5b' : '#3e7d44';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.palm ? 13 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b4a2f';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Buildings
  for (const b of S.world.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // Roof detail: inner panel + windows
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(40,60,90,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 12, 9);
      }
    }
    if (b.label) {
      ctx.fillStyle = '#1d1d1d';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // Boat at the harbour
  ctx.save();
  ctx.translate(3130, 2500);
  ctx.fillStyle = '#f4f4f4';
  ctx.beginPath();
  ctx.ellipse(0, 0, 52, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-30, -8, 60, 16);
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -26, 6, 22);
  ctx.restore();
  // District names on the map (faint, big)
  ctx.fillStyle = 'rgba(20,40,20,0.16)';
  ctx.font = 'bold 44px Arial';
  ctx.textAlign = 'center';
  for (const d of DISTRICTS) {
    const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
    if (cx < x0 - 200 || cx > x1 + 200 || cy < y0 - 200 || cy > y1 + 200) continue;
    ctx.fillText(d.name.toUpperCase(), cx, cy);
  }
}

export function randomStreetPoint(rng) {
  const road = ROAD_X[Math.floor(rng() * ROAD_X.length)];
  const along = 300 + rng() * 2600;
  return { x: road, y: along };
}
