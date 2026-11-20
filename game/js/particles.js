// Solmar — particles, floating text, skid marks and screen shake. All
// effects are data in S; main.js draws them after the world.

import { S } from './state.js';
import { rand, clamp } from './util.js';

export function burst(x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rand(0.3, 1) * speed;
    S.parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(0.5, 1) * life, maxLife: life, color, size: rand(0.6, 1.4) * size,
    });
  }
}

export function smoke(x, y) {
  S.parts.push({
    x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-8, 8), vy: rand(-26, -10),
    life: rand(0.6, 1.2), maxLife: 1.2, color: 'rgba(90,90,90,0.5)', size: rand(6, 12), grow: true,
  });
}

export function sparks(x, y, n) { burst(x, y, n || 8, '#ffd34d', 260, 0.4, 2.5); }
export function blood(x, y) { burst(x, y, 10, '#c0392b', 170, 0.5, 3); }
export function muzzle(x, y, angle) {
  for (let i = 0; i < 5; i++) {
    const a = angle + rand(-0.35, 0.35);
    const v = rand(200, 380);
    S.parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 0.09, maxLife: 0.09, color: i % 2 ? '#ffe27a' : '#ff9d2e', size: 2.5,
    });
  }
}

export function floatText(x, y, text, color) {
  S.floats.push({ x, y, text, color: color || '#fff', life: 1.4, maxLife: 1.4 });
}

export function addSkid(x, y, angle) {
  S.skids.push({ x, y, angle, life: 3 });
  if (S.skids.length > 220) S.skids.shift();
}

export function addShake(amount) {
  S.shake = clamp(S.shake + amount, 0, 22);
}

export function updateParticles(dt) {
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.life -= dt;
    if (p.life <= 0) { S.parts.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    if (p.grow) p.size += 14 * dt;
  }
  for (let i = S.floats.length - 1; i >= 0; i--) {
    const f = S.floats[i];
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) S.floats.splice(i, 1);
  }
  for (let i = S.skids.length - 1; i >= 0; i--) {
    S.skids[i].life -= dt;
    if (S.skids[i].life <= 0) S.skids.splice(i, 1);
  }
  S.shake = Math.max(0, S.shake - dt * 30);
}

export function drawParticles(ctx, cam) {
  for (const s of S.skids) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, s.life * 0.25);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 7, s.y - Math.sin(s.angle) * 7);
    ctx.lineTo(s.x + Math.cos(s.angle) * 7, s.y + Math.sin(s.angle) * 7);
    ctx.stroke();
    ctx.restore();
  }
  for (const p of S.parts) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center';
  for (const f of S.floats) {
    ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
