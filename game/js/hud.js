// Solmar — the HUD: DOM readouts (health, money, wanted stars, ammo, objective, speed)
// and the canvas minimap with roads, the player, police, traffic and the mission marker.
import { G, WORLD, ROAD_AT } from './state.js';
import { fmtMoney, fmtDist, clamp } from './utils.js';
import { objectiveText, markerPos } from './missions.js';
import { CAR_MODELS } from './cars.js';

let minimapCtx = null;
let lastStars = -1;

export function initHud() {
  const mm = document.getElementById('minimap');
  if (mm) minimapCtx = mm.getContext('2d');
}

export function updateHud() {
  const healthFill = document.getElementById('health-fill');
  if (healthFill) healthFill.style.width = clamp((G.health / G.maxHealth) * 100, 0, 100) + '%';
  const money = document.getElementById('money');
  if (money) money.textContent = fmtMoney(G.money);
  const ammo = document.getElementById('ammo');
  if (ammo) ammo.textContent = G.player && G.player.car ? 'DRIVING' : 'AMMO ' + G.ammo;
  const speed = document.getElementById('speed');
  if (speed) {
    if (G.player && G.player.car) {
      const m = CAR_MODELS[G.player.car.model];
      const kmh = Math.round((Math.abs(G.player.car.speed) / m.maxSpeed) * 180);
      speed.textContent = kmh + ' km/h';
    } else {
      speed.textContent = '';
    }
  }
  // Wanted stars, rebuilt only when the level changes.
  if (G.wanted !== lastStars) {
    lastStars = G.wanted;
    const row = document.getElementById('wanted-row');
    if (row) {
      row.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('span');
        s.className = 'star' + (i < G.wanted ? '' : ' off');
        s.textContent = '★';
        row.appendChild(s);
      }
    }
  }
  const obj = objectiveText();
  const t = document.getElementById('objective-title');
  const x = document.getElementById('objective-text');
  const d = document.getElementById('objective-dist');
  if (t) t.textContent = obj.title;
  if (x) x.textContent = obj.text;
  if (d) d.textContent = obj.dist;
}

export function drawMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const S = 200 / WORLD;
  const city = G.city;
  ctx.clearRect(0, 0, 200, 200);
  // Water + sand.
  ctx.fillStyle = '#2e86ab';
  ctx.fillRect(0, city.waterY * S, 200, 200 - city.waterY * S);
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(0, city.beachY * S, 200, (city.waterY - city.beachY) * S);
  // Ground.
  ctx.fillStyle = '#5d7d4a';
  ctx.fillRect(0, 0, 200, city.beachY * S);
  // Buildings as dark dots.
  ctx.fillStyle = 'rgba(20,24,32,0.8)';
  for (const b of city.buildings) {
    ctx.fillRect(b.x * S, b.y * S, Math.max(1.5, b.w * S), Math.max(1.5, b.h * S));
  }
  // Roads.
  ctx.strokeStyle = '#c9c2b2';
  ctx.lineWidth = 2;
  for (const r of ROAD_AT) {
    ctx.beginPath(); ctx.moveTo(0, r * S); ctx.lineTo(200, r * S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * S, 0); ctx.lineTo(r * S, 200); ctx.stroke();
  }
  // Mission marker: pulsing yellow diamond.
  const m = markerPos();
  if (m) {
    const pulse = 4 + Math.sin(G.time * 5) * 2;
    ctx.fillStyle = '#ffd166';
    ctx.save();
    ctx.translate(m.x * S, m.y * S);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.restore();
  }
  // Traffic: faint white dots.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const car of G.cars) {
    if (car.kind === 'traffic') ctx.fillRect(car.x * S - 1, car.y * S - 1, 2, 2);
  }
  // Police: red dots.
  ctx.fillStyle = '#ff2d2d';
  for (const car of G.cars) {
    if (car.kind === 'police' && !car.wreck) {
      ctx.beginPath(); ctx.arc(car.x * S, car.y * S, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Player: white arrow.
  const p = G.player;
  if (p) {
    ctx.save();
    ctx.translate(p.x * S, p.y * S);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Viewport frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  const cam = G.camera;
  const vw = 1280 / cam.zoom * S, vh = 800 / cam.zoom * S;
  ctx.strokeRect((cam.x - 640 / cam.zoom) * S, (cam.y - 400 / cam.zoom) * S, vw, vh);
}
