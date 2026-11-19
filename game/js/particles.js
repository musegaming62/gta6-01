// Solmar — particles: smoke, sparks, fire, skid marks and shockwave rings.
import { G } from './state.js';
import { rand } from './utils.js';

export function addParticle(p) { G.particles.push(p); }

export function spawnSmoke(x, y, n) {
  for (let i = 0; i < (n || 3); i++) {
    addParticle({ kind: 'smoke', x: x + rand(-6, 6), y: y + rand(-6, 6),
      vx: rand(-12, 12), vy: rand(-22, -6), life: 0, maxLife: rand(0.6, 1.2), size: rand(6, 12) });
  }
}
export function spawnSparks(x, y, n) {
  for (let i = 0; i < (n || 8); i++) {
    const a = rand(0, Math.PI * 2), s = rand(80, 260);
    addParticle({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0, maxLife: rand(0.15, 0.4), size: rand(1.5, 3) });
  }
}
export function spawnFire(x, y, n) {
  for (let i = 0; i < (n || 10); i++) {
    const a = rand(0, Math.PI * 2), s = rand(20, 120);
    addParticle({ kind: 'fire', x: x + rand(-10, 10), y: y + rand(-10, 10),
      vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, maxLife: rand(0.3, 0.7), size: rand(4, 10) });
  }
}
export function spawnSkid(x, y, angle) {
  addParticle({ kind: 'skid', x, y, angle, vx: 0, vy: 0, life: 0, maxLife: 2.5, size: 5 });
}
export function spawnRing(x, y) {
  addParticle({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, maxLife: 0.45, size: 8 });
}
export function spawnMuzzle(x, y, angle) {
  addParticle({ kind: 'muzzle', x, y, angle, vx: 0, vy: 0, life: 0, maxLife: 0.07, size: 12 });
}

export function updateParticles(dt) {
  const list = G.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life += dt;
    if (p.life >= p.maxLife) { list.splice(i, 1); continue; }
    if (p.kind !== 'skid' && p.kind !== 'ring' && p.kind !== 'muzzle') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }
    if (p.kind === 'ring') p.size += 260 * dt;
  }
  if (list.length > 600) list.splice(0, list.length - 600);
}

export function drawParticles(ctx) {
  for (const p of G.particles) {
    const t = p.life / p.maxLife;
    if (p.kind === 'smoke') {
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + t), 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === 'fire') {
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.fillStyle = t < 0.5 ? '#ff9f1c' : '#e63946';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'skid') {
      ctx.globalAlpha = 0.4 * (1 - t * 0.7);
      ctx.fillStyle = '#1a1a1a';
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.fillRect(-7, -2.5, 14, 5);
      ctx.restore();
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'muzzle') {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffe066';
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, -4); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
