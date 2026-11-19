// Solmar — city generation. One deterministic layout: a road grid, blocks of buildings,
// parks, a beach and harbour on the south edge, and the named places the story uses.
import { mulberry32, randInt } from './utils.js';
import { WORLD, ROAD_AT, ROAD_W, BEACH_Y, WATER_Y } from './state.js';

export const DISTRICTS = {
  downtown: { x0: 1000, y0: 1000, x1: 2200, y1: 2200, name: 'Downtown' },
  harbor: { x0: 2200, y0: 2400, x1: 3200, y1: 3200, name: 'Harbour' },
  heights: { x0: 200, y0: 200, x1: 1000, y1: 1000, name: 'Palm Heights' },
  oldtown: { x0: 200, y0: 1400, x1: 1000, y1: 2600, name: 'Old Town' },
  industrial: { x0: 2200, y0: 200, x1: 3200, y1: 1000, name: 'Industrial' },
};

function districtAt(x, y) {
  for (const key of Object.keys(DISTRICTS)) {
    const d = DISTRICTS[key];
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return key;
  }
  return 'midtown';
}

// Named story places, each on a block corner with a marker position.
export const PLACES = {
  hospital: { name: 'Solmar General Hospital', x: 760, y: 1560, color: '#e8e8e8' },
  bar: { name: "Mara's Bar — The Rusty Anchor", x: 1160, y: 1960, color: '#c98a4b' },
  chopshop: { name: "Big Ray's Chop Shop", x: 2360, y: 760, color: '#8d99ae' },
  bank: { name: 'Solmar National Bank', x: 1560, y: 1160, color: '#d9c27a' },
  warehouse: { name: 'Vulture Warehouse', x: 2760, y: 560, color: '#7a6a58' },
  motel: { name: 'Palm Court Motel', x: 560, y: 2360, color: '#e07a5f' },
  safehouse: { name: 'Safehouse', x: 560, y: 560, color: '#81b29a' },
  docks: { name: 'Solmar Docks', x: 2560, y: 2920, color: '#6a8eae' },
  boat: { name: 'Escape Boat', x: 2920, y: 2960, color: '#f2cc8f' },
  policehq: { name: 'Solmar PD Headquarters', x: 1960, y: 1560, color: '#3d5a80' },
};

const ROOF_COLORS = {
  downtown: ['#5a6b7d', '#6b7d8f', '#4a5a6a', '#7d8a99', '#3f5a6b'],
  harbor: ['#7a6a58', '#8d7d6b', '#6a7a72'],
  heights: ['#c96f4a', '#d9a05b', '#b5533c', '#e07a5f', '#8fa98f'],
  oldtown: ['#a9714b', '#b5855a', '#96684a', '#c08552'],
  industrial: ['#6b6b6b', '#7a7a7a', '#5a5a5a'],
  midtown: ['#8a7d6b', '#7d8a7d', '#a08a6b', '#6b7d8a'],
};

export function generateCity() {
  const rng = mulberry32(20261117);
  const buildings = [];
  const trees = [];
  const parks = [];

  // Blocks sit between roads: block i spans [ROAD_AT[i]+ROAD_W/2+14, ROAD_AT[i+1]-ROAD_W/2-14].
  const edges = [...ROAD_AT, 3000];
  for (let bi = 0; bi < ROAD_AT.length; bi++) {
    for (let bj = 0; bj < ROAD_AT.length; bj++) {
      const x0 = ROAD_AT[bi] + ROAD_W / 2 + 16;
      const y0 = ROAD_AT[bj] + ROAD_W / 2 + 16;
      const x1 = edges[bi + 1] - ROAD_W / 2 - 16;
      const y1 = edges[bj + 1] - ROAD_W / 2 - 16;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      // The south strip is beach: no buildings below BEACH_Y - 120.
      if (y0 > BEACH_Y - 140) continue;
      // A few blocks are parks.
      if (rng() < 0.14) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district });
        const n = 6 + Math.floor(rng() * 6);
        for (let t = 0; t < n; t++) {
          trees.push({ x: x0 + 20 + rng() * (x1 - x0 - 40), y: y0 + 20 + rng() * (y1 - y0 - 40), r: 10 + rng() * 6 });
        }
        continue;
      }
      // 1-3 buildings per block.
      const n = district === 'downtown' ? (rng() < 0.5 ? 1 : 2) : 1 + Math.floor(rng() * 2);
      const cols = ROOF_COLORS[district];
      for (let b = 0; b < n; b++) {
        const bw = 70 + rng() * 110;
        const bh = 70 + rng() * 110;
        const bx = x0 + 8 + rng() * Math.max(1, x1 - x0 - bw - 16);
        const by = y0 + 8 + rng() * Math.max(1, y1 - y0 - bh - 16);
        const tall = district === 'downtown' ? 14 + rng() * 26 : 4 + rng() * 8;
        buildings.push({
          x: bx, y: by, w: bw, h: bh, tall,
          color: cols[Math.floor(rng() * cols.length)],
          district, roof: rng() < 0.5,
        });
      }
      // Street trees on the block corners.
      if (rng() < 0.6) trees.push({ x: x0 + 6, y: y0 + 6, r: 9 + rng() * 4 });
      if (rng() < 0.6) trees.push({ x: x1 - 6, y: y1 - 6, r: 9 + rng() * 4 });
    }
  }

  // Palm rows along the beach.
  for (let x = 120; x < WORLD - 120; x += 90 + randInt(0, 40)) {
    trees.push({ x, y: BEACH_Y + 30 + Math.random() * 40, r: 11, palm: true });
  }

  return {
    buildings, trees, parks,
    waterY: WATER_Y, beachY: BEACH_Y,
    places: PLACES,
  };
}

// True when (x,y) is inside a building (solid) or in the ocean (not walkable).
export function isSolid(city, x, y) {
  if (y >= WATER_Y) return true;
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// Nearest road centreline coordinate on the given axis.
export function nearestRoad(v) {
  let best = ROAD_AT[0], bd = Math.abs(v - best);
  for (const r of ROAD_AT) {
    const d = Math.abs(v - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// Is (x,y) on a road (drivable)?
export function onRoad(x, y) {
  const onV = ROAD_AT.some((r) => Math.abs(x - r) <= ROAD_W / 2);
  const onH = ROAD_AT.some((r) => Math.abs(y - r) <= ROAD_W / 2);
  return onV || onH;
}
