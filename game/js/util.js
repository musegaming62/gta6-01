// Shared math and random helpers for Solmar. No dependencies.

export const TWO_PI = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(a = 1, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + Math.random() * (b - a);
}

export function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

export function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

// Deterministic seeded RNG (mulberry32) so the city is identical every run.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRand(rng, a = 1, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + rng() * (b - a);
}

export function seededInt(rng, a, b) {
  return Math.floor(seededRand(rng, a, b + 1));
}

export function seededChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
