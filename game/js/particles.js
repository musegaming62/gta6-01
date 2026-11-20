// Particles, floating score text, skid marks and screen shake. No dependencies
// beyond util. Everything is capped so the frame rate stays smooth.
import { randRange, clamp } from './util.js';

export function createParticles() {
  return {
    list: [],
    texts: [],
    skids: [],
    trauma: 0,
  };
}

export function spawnParticle(P, x, y, opts) {
  if (P.list.length > 420) return;
  const o = opts || {};
  P.list.push({
    x, y,
    vx: o.vx !== undefined ? o.vx : randRange(Math.random, -60, 60),
    vy: o.vy !== undefined ? o.vy : randRange(Math.random, -60, 60),
    life: o.life || 0.5,
    maxLife: o.life || 0.5,
    size: o.size || 4,
    color: o.color || '#ffcf5d',
    drag: o.drag !== undefined ? o.drag : 0.9,
    grav: o.grav || 0,
  });
}

export function burst(P, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = randRange(Math.random, speed * 0.3, speed);
    spawnParticle(P, x, y, {
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: randRange(Math.random, life * 0.5, life),
      size: randRange(Math.random, size * 0.6, size * 1.4),
      color,
    });
  }
}

export function muzzle(P, x, y, angle) {
  for (let i = 0; i < 5; i++) {
    const spread = randRange(Math.random, -0.3, 0.3);
    const s = randRange(Math.random, 220, 420);
    spawnParticle(P, x, y, {
      vx: Math.cos(angle + spread) * s,
      vy: Math.sin(angle + spread) * s,
      life: 0.12,
      size: randRange(Math.random, 2, 4),
      color: i % 2 ? '#ffd94d' : '#ff9a3d',
      drag: 0.8,
    });
  }
}

export function smoke(P, x, y, big) {
  spawnParticle(P, x + randRange(Math.random, -6, 6), y + randRange(Math.random, -6, 6), {
    vx: randRange(Math.random, -12, 12),
    vy: randRange(Math.random, -34, -12),
    life: randRange(Math.random, 0.6, 1.1),
    size: big ? randRange(Math.random, 10, 16) : randRange(Math.random, 5, 9),
    color: '#555555',
    drag: 0.97,
  });
}

export function explosion(P, x, y) {
  burst(P, x, y, 26, '#ff7a2d', 260, 0.7, 6);
  burst(P, x, y, 14, '#ffd94d', 180, 0.5, 5);
  burst(P, x, y, 10, '#333333', 90, 1.1, 9);
  addTrauma(P, 0.7);
}

export function floatText(P, x, y, text, color) {
  if (P.texts.length > 24) return;
  P.texts.push({ x, y, text, color: color || '#ffd94d', life: 1.4, maxLife: 1.4 });
}

export function addSkid(P, x1, y1, x2, y2) {
  if (P.skids.length > 260) P.skids.shift();
  P.skids.push({ x1, y1, x2, y2, life: 5 });
}

export function addTrauma(P, amount) {
  P.trauma = clamp(P.trauma + amount, 0, 1);
}

export function updateParticles(P, dt) {
  for (let i = P.list.length - 1; i >= 0; i--) {
    const p = P.list[i];
    p.life -= dt;
    if (p.life <= 0) {
      P.list.splice(i, 1);
      continue;
    }
    p.vy += p.grav * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = P.texts.length - 1; i >= 0; i--) {
    const t = P.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) P.texts.splice(i, 1);
  }
  for (let i = P.skids.length - 1; i >= 0; i--) {
    P.skids[i].life -= dt;
    if (P.skids[i].life <= 0) P.skids.splice(i, 1);
  }
  P.trauma = Math.max(0, P.trauma - dt * 1.6);
}

export function shakeOffset(P) {
  const s = P.trauma * P.trauma * 16;
  return {
    x: (Math.random() * 2 - 1) * s,
    y: (Math.random() * 2 - 1) * s,
  };
}

export function drawParticles(ctx, P) {
  for (const s of P.skids) {
    ctx.strokeStyle = 'rgba(20,20,20,' + Math.min(0.5, s.life * 0.12) + ')';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  for (const p of P.list) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  for (const t of P.texts) {
    const a = clamp(t.life / t.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = t.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
