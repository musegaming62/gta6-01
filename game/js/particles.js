// Particles, floating score text and screen shake for Solmar.

import { rand, TWO_PI } from './util.js';

export function spawnBurst(state, x, y, opts) {
  const o = opts || {};
  const n = o.count || 12;
  const color = o.color || '#ffcc66';
  const speed = o.speed || 140;
  const life = o.life || 0.6;
  const size = o.size || 3;
  for (let i = 0; i < n; i++) {
    const a = rand(TWO_PI);
    const s = rand(0.3, 1) * speed;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.5, 1) * life,
      maxLife: life,
      size: rand(0.6, 1.4) * size,
      color,
    });
  }
}

export function spawnSmoke(state, x, y) {
  state.particles.push({
    x: x + rand(-6, 6), y: y + rand(-6, 6),
    vx: rand(-8, 8), vy: rand(-30, -12),
    life: rand(0.7, 1.3), maxLife: 1.3,
    size: rand(5, 9), color: '#555555', smoke: true,
  });
}

export function spawnText(state, x, y, text, color) {
  state.texts.push({ x, y, text, color: color || '#ffd94a', life: 1.6, maxLife: 1.6 });
}

export function addShake(state, amount) {
  state.shake = Math.min(18, state.shake + amount);
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const t = state.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) state.texts.splice(i, 1);
  }
  state.shake = Math.max(0, state.shake - 40 * dt);
}

export function drawParticles(ctx, state, cam) {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = p.smoke ? a * 0.45 : a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, p.size * (p.smoke ? 1 + (1 - a) : 1), 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px Arial, sans-serif';
  for (const t of state.texts) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x - cam.x, t.y - cam.y);
  }
  ctx.globalAlpha = 1;
}
