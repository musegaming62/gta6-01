// Solmar's city: districts, roads, buildings, landmarks and collision helpers.
// The city is generated from a fixed seed, so it is identical every run.

import { mulberry32, seededRand, seededInt, seededChoice, clamp } from './util.js';

export const WORLD = 3200;
export const PITCH = 400; // road grid spacing
export const ROAD_W = 76; // road width
export const BEACH_Y = 2860; // sand starts here (south edge)
export const OCEAN_Y = 3060; // water starts here

const DISTRICT_DEFS = [
  { name: 'Hillside', x0: 0, y0: 0, x1: 1067, y1: 1600, ground: '#b3a586', roof: ['#b5654a', '#a85a40', '#c07a52'], wall: '#e6dcc4' },
  { name: 'Downtown', x0: 1067, y0: 0, x1: 2133, y1: 1600, ground: '#9aa0a8', roof: ['#5a6b7d', '#4a5a70', '#6b7d90'], wall: '#ccd3da' },
  { name: 'Industrial', x0: 2133, y0: 0, x1: 3200, y1: 1600, ground: '#8f8a80', roof: ['#6b5d4f', '#5d5245', '#7a6a55'], wall: '#a89f8d' },
  { name: 'Old Town', x0: 0, y0: 1600, x1: 1067, y1: 3200, ground: '#a89a7a', roof: ['#8a4a3a', '#7d4234', '#96553f'], wall: '#d8c8a8' },
  { name: 'Beachside', x0: 1067, y0: 1600, x1: 2133, y1: 3200, ground: '#c8b898', roof: ['#e8e0d0', '#dcd2bc', '#f0e8d8'], wall: '#f0e8d8' },
  { name: 'Port', x0: 2133, y0: 1600, x1: 3200, y1: 3200, ground: '#7a7f85', roof: ['#4a5a6a', '#3f4c5a', '#556575'], wall: '#9aa0a8' },
];

// Blocks (bx, by) reserved for landmarks, so no random building lands on them.
const RESERVED_BLOCKS = new Set(['3,1', '6,2']);

export function districtAt(x, y) {
  for (const d of DISTRICT_DEFS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICT_DEFS[1];
}

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  for (let bx = 0; bx < 8; bx++) {
    for (let by = 0; by < 8; by++) {
      const x0 = bx * PITCH + ROAD_W / 2 + 14;
      const y0 = by * PITCH + ROAD_W / 2 + 14;
      const x1 = (bx + 1) * PITCH - ROAD_W / 2 - 14;
      const y1 = (by + 1) * PITCH - ROAD_W / 2 - 14;
      if (y0 > BEACH_Y) continue; // beach strip stays open sand
      if (RESERVED_BLOCKS.has(bx + ',' + by)) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      const count = seededInt(rng, 1, 2);
      if (count === 1) {
        const w = seededRand(rng, 150, 240);
        const h = seededRand(rng, 130, 210);
        buildings.push({
          x: cx - w / 2, y: cy - h / 2, w, h,
          color: seededChoice(rng, d.roof), wall: d.wall, district: d.name,
        });
      } else {
        // Two lots side by side.
        const w1 = seededRand(rng, 90, 130);
        const w2 = seededRand(rng, 90, 130);
        const h1 = seededRand(rng, 110, 190);
        const h2 = seededRand(rng, 110, 190);
        buildings.push({ x: x0, y: y0, w: w1, h: h1, color: seededChoice(rng, d.roof), wall: d.wall, district: d.name });
        buildings.push({ x: x1 - w2, y: y1 - h2, w: w2, h: h2, color: seededChoice(rng, d.roof), wall: d.wall, district: d.name });
      }
      // A tree or two per block.
      const nTrees = seededInt(rng, 0, 2);
      for (let i = 0; i < nTrees; i++) {
        trees.push({ x: seededRand(rng, x0, x1), y: seededRand(rng, y0, y1), r: seededRand(rng, 10, 16) });
      }
    }
  }
  // Landmark buildings, placed inside their reserved blocks, off the roads.
  const bank = { x: 1400 - 110, y: 600 - 70, w: 220, h: 140, color: '#7d8a99', wall: '#d5dde3', district: 'Downtown', landmark: 'bank' };
  const chopShop = { x: 2600 - 100, y: 1000 - 60, w: 200, h: 120, color: '#5d5245', wall: '#8a7d68', district: 'Industrial', landmark: 'chop' };
  buildings.push(bank, chopShop);

  return {
    size: WORLD,
    districts: DISTRICT_DEFS,
    buildings,
    trees,
    landmarks: {
      bank: { x: 1400, y: 600, w: 220, h: 140 },
      chopShop: { x: 2600, y: 1000, w: 200, h: 120 },
      safehouse: { x: 1700, y: 2450 },
      turf: { x: 650, y: 2150 },
      pickupA: { x: 1250, y: 1050 },
      pickupB: { x: 2450, y: 2050 },
      harbour: { x: 2950, y: 2960 },
      boat: { x: 2950, y: 3100 },
    },
    start: { x: 1250, y: 1450 },
    missionCar: { x: 1180, y: 1380 },
  };
}

function roadCoord(v) {
  const r = ((v % PITCH) + PITCH) % PITCH;
  return r < ROAD_W / 2 || r > PITCH - ROAD_W / 2;
}

export function isRoad(x, y) {
  return roadCoord(x) || roadCoord(y);
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps. Returns a corrected position.
export function resolveCircle(city, x, y, r) {
  let px = x;
  let py = y;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of city.buildings) {
      const cx = clamp(px, b.x, b.x + b.w);
      const cy = clamp(py, b.y, b.y + b.h);
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 < 0.0001) {
        // Center inside the building: push out along the smallest axis.
        const left = px - b.x;
        const right = b.x + b.w - px;
        const top = py - b.y;
        const bottom = b.y + b.h - py;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px = b.x - r;
        else if (m === right) px = b.x + b.w + r;
        else if (m === top) py = b.y - r;
        else py = b.y + b.h + r;
      } else {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        px += dx * push;
        py += dy * push;
      }
    }
  }
  // Keep inside the world.
  px = clamp(px, r, WORLD - r);
  py = clamp(py, r, WORLD - r);
  return { x: px, y: py };
}

function segHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < rx || x1 > rx + rw) return false;
  } else {
    let t1 = (rx - x1) / dx;
    let t2 = (rx + rw - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < ry || y1 > ry + rh) return false;
  } else {
    let t1 = (ry - y1) / dy;
    let t2 = (ry + rh - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// True when the segment from (x1,y1) to (x2,y2) crosses any building.
export function segmentHitsBuilding(city, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (const b of city.buildings) {
    if (b.x > maxX || b.x + b.w < minX || b.y > maxY || b.y + b.h < minY) continue;
    if (segHitsRect(x1, y1, x2, y2, b.x, b.y, b.w, b.h)) return true;
  }
  return false;
}

// A random point on a road centerline.
export function randomRoadPoint() {
  const vertical = Math.random() < 0.5;
  const lane = Math.floor(Math.random() * 9) * PITCH;
  const along = Math.random() * WORLD;
  return vertical ? { x: lane, y: along } : { x: along, y: lane };
}

// A random point on a sidewalk (just off a road, inside a block edge).
export function randomSidewalkPoint() {
  const vertical = Math.random() < 0.5;
  const road = Math.floor(Math.random() * 9) * PITCH;
  const along = Math.random() * WORLD;
  const off = (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14);
  return vertical ? { x: road + off, y: along } : { x: along, y: road + off };
}
