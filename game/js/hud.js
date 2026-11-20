// The HUD for Solmar: health, money, wanted stars, ammo, objective text, the
// mission banner and the minimap.

import { WORLD, BEACH_Y, OCEAN_Y } from './world.js';
import { missionMarker } from './missions.js';

let els = null;

export function initHud() {
  els = {
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    money: document.getElementById('money'),
    stars: document.getElementById('stars'),
    ammo: document.getElementById('ammo'),
    objective: document.getElementById('objective'),
    missionName: document.getElementById('mission-name'),
    timer: document.getElementById('timer'),
    banner: document.getElementById('banner'),
    minimap: document.getElementById('minimap'),
  };
  return els;
}

let bannerTimer = null;

export function showBanner(text, ms) {
  if (!els || !els.banner) return;
  els.banner.textContent = text;
  els.banner.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms || 2400);
}

export function updateHud(state) {
  if (!els) return;
  const p = state.player;
  const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
  els.healthFill.style.width = hpPct + '%';
  els.healthFill.style.background = hpPct > 50 ? '#4ad47a' : hpPct > 25 ? '#e8b73a' : '#d43a2f';
  els.healthText.textContent = hpPct;
  els.money.textContent = '$' + state.money.toLocaleString('en-US');
  const stars = Math.floor(state.wanted);
  els.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  els.stars.style.color = stars > 0 ? '#ffd94a' : '#888';
  if (p.inCar) {
    els.ammo.textContent = 'DRIVING';
  } else {
    els.ammo.textContent = 'AMMO ' + p.ammo + ' / ' + p.ammoReserve;
  }
  els.objective.textContent = state.objective || '';
  const m = state.mission;
  if (m.index >= 0) {
    els.missionName.textContent = (m.done ? '✓ ' : '') + 'Mission ' + (m.index + 1) + '/5';
  } else {
    els.missionName.textContent = '';
  }
  if ((m.index === 2 || (m.index === 4 && m.stage === 1)) && m.timer > 0 && !m.done) {
    const t = Math.max(0, Math.ceil(m.timer));
    els.timer.textContent = '⏱ ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    els.timer.style.display = 'block';
  } else {
    els.timer.style.display = 'none';
  }
  drawMinimap(state);
}

function drawMinimap(state) {
  const cv = els.minimap;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  const k = S / WORLD;
  ctx.clearRect(0, 0, S, S);
  // Ground.
  ctx.fillStyle = '#8a8a7a';
  ctx.fillRect(0, 0, S, S);
  // Districts.
  for (const d of state.city.districts) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x0 * k, d.y0 * k, (d.x1 - d.x0) * k, (d.y1 - d.y0) * k);
  }
  // Ocean and beach.
  ctx.fillStyle = '#3a7ac8';
  ctx.fillRect(0, OCEAN_Y * k, S, S - OCEAN_Y * k);
  ctx.fillStyle = '#d8c890';
  ctx.fillRect(0, BEACH_Y * k, S, (OCEAN_Y - BEACH_Y) * k);
  // Roads.
  ctx.strokeStyle = '#3a3a3f';
  ctx.lineWidth = Math.max(1, 76 * k * 0.6);
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 400 * k, 0);
    ctx.lineTo(i * 400 * k, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 400 * k);
    ctx.lineTo(S, i * 400 * k);
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = 'rgba(40,40,50,0.7)';
  for (const b of state.city.buildings) {
    ctx.fillRect(b.x * k, b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k));
  }
  // Mission marker.
  const marker = missionMarker(state);
  if (marker) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(marker.x * k, marker.y * k, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a10';
    ctx.beginPath();
    ctx.arc(marker.x * k, marker.y * k, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police dots.
  ctx.fillStyle = '#2a6aff';
  for (const cop of state.cops) {
    ctx.fillRect(cop.x * k - 1.5, cop.y * k - 1.5, 3, 3);
  }
  for (const car of state.cars) {
    if (car.isPolice) ctx.fillRect(car.x * k - 1.5, car.y * k - 1.5, 3, 3);
  }
  // Player arrow.
  const p = state.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  const pa = p.inCar ? p.inCar.angle : p.angle;
  ctx.save();
  ctx.translate(px * k, py * k);
  ctx.rotate(pa);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
