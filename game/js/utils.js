// Solmar — small math and random helpers shared by every system.
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
export function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
export function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Deterministic seeded RNG (mulberry32) so the city is the same every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Circle vs axis-aligned box push-out. Returns true when a collision happened.
export function circleVsBox(cx, cy, r, box) {
  const nx = clamp(cx, box.x, box.x + box.w);
  const ny = clamp(cy, box.y, box.y + box.h);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) return { x: 0, y: -r };
  const d = Math.sqrt(d2);
  return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
}

export function fmtMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
export function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km'; }
