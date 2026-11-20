// Solmar — the HUD: health bar, money, wanted stars, ammo, objective text,
// timer, banners, and the minimap canvas. DOM lives in index.html; this
// module updates it every frame and draws the minimap.

import { S, WORLD } from './state.js';
import { fmtMoney, fmtTime, clamp } from './util.js';
import { missionObjective, MISSIONS } from './missions.js';

let el = {};
let mini = null;
let mctx = null;

export function initHud() {
  el = {
    hp: document.getElementById('hp-fill'),
    hpText: document.getElementById('hp-text'),
    money: document.getElementById('money'),
    stars: document.getElementById('stars'),
    ammo: document.getElementById('ammo'),
    objective: document.getElementById('objective'),
    timer: document.getElementById('timer'),
    banner: document.getElementById('banner'),
    missionName: document.getElementById('mission-name'),
    msg: document.getElementById('mission-msg'),
  };
  mini = document.getElementById('minimap');
  if (mini) mctx = mini.getContext('2d');
}

export function updateHud() {
  const p = S.player;
  if (!p) return;
  if (el.hp) {
    el.hp.style.width = clamp(p.hp, 0, 100) + '%';
    el.hp.style.background = p.hp > 50 ? '#2ecc71' : p.hp > 25 ? '#f39c12' : '#e74c3c';
  }
  if (el.hpText) el.hpText.textContent = Math.ceil(p.hp);
  if (el.money) el.money.textContent = fmtMoney(S.money);
  if (el.stars) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < S.wanted ? '★' : '☆';
    el.stars.textContent = s;
    el.stars.style.color = S.wanted > 0 ? '#ffd34d' : 'rgba(255,255,255,0.5)';
  }
  if (el.ammo) {
    el.ammo.textContent = p.inCar ? '—' : (p.reloading > 0 ? 'RELOADING' : p.ammo + ' / ' + p.reserve);
  }
  if (el.objective) {
    const obj = missionObjective();
    el.objective.textContent = obj ? obj.label : '';
  }
  if (el.timer) {
    el.timer.textContent = S.missionTimer > 0 ? fmtTime(S.missionTimer) : '';
    el.timer.style.color = S.missionTimer > 0 && S.missionTimer < 15 ? '#ff5b5b' : '#fff';
  }
  if (el.missionName) el.missionName.textContent = 'MISSION ' + (S.mission + 1) + '/5 — ' + MISSIONS[S.mission].name;
  if (el.msg) el.msg.textContent = S.missionMsg;
  if (el.banner) {
    if (S.bannerT > 0) {
      el.banner.textContent = S.banner;
      el.banner.style.opacity = '1';
    } else {
      el.banner.style.opacity = '0';
    }
  }
  drawMinimap();
}

function drawMinimap() {
  if (!mctx || !S.world) return;
  const W = mini.width, H = mini.height;
  const k = W / WORLD;
  mctx.fillStyle = '#1d2b1d';
  mctx.fillRect(0, 0, W, H);
  // Water + beach
  mctx.fillStyle = '#2f7fc4';
  mctx.fillRect(0, 3060 * k, W, H - 3060 * k);
  mctx.fillStyle = '#e8d9a0';
  mctx.fillRect(0, 2900 * k, W, (3060 - 2900) * k);
  // Roads
  mctx.fillStyle = '#3d3d42';
  for (let i = 0; i < 8; i++) {
    mctx.fillRect(200 * k + i * 400 * k - 3, 0, 6, H);
    mctx.fillRect(0, 200 * k + i * 400 * k - 3, W, 6);
  }
  // Buildings
  mctx.fillStyle = 'rgba(220,220,220,0.7)';
  for (const b of S.world.buildings) {
    mctx.fillRect(b.x * k, b.y * k, Math.max(2, b.w * k), Math.max(2, b.h * k));
  }
  // Mission marker
  const obj = missionObjective();
  if (obj) {
    const pulse = 4 + Math.sin(S.time * 5) * 2;
    mctx.fillStyle = '#ffd34d';
    mctx.beginPath();
    mctx.arc(obj.x * k, obj.y * k, pulse, 0, Math.PI * 2);
    mctx.fill();
  }
  // Police dots
  mctx.fillStyle = '#4d8bff';
  for (const c of S.cops) {
    if (c.state === 'down') continue;
    mctx.fillRect(c.x * k - 1.5, c.y * k - 1.5, 3, 3);
  }
  for (const car of S.cars) {
    if (car.policeChase && !car.dead) mctx.fillRect(car.x * k - 1.5, car.y * k - 1.5, 3, 3);
  }
  // Player
  const p = S.player;
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  mctx.arc(p.x * k, p.y * k, 3.5, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = '#0f766e';
  mctx.lineWidth = 2;
  mctx.stroke();
}
