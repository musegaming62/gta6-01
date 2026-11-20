// HUD: health, money, wanted stars, ammo, objective and timer as DOM, plus a
// canvas minimap, mission banners, Mara's messages, and the menu screens.
import { formatMoney, formatTime, clamp } from './util.js';
import { WORLD_SIZE } from './world.js';
import { currentStage } from './missions.js';

export function createHud() {
  return {
    el: {},
    bannerTimer: 0,
    messageTimer: 0,
  };
}

export function bindHud(H, doc) {
  const ids = ['hud', 'health-fill', 'health-text', 'money', 'stars', 'ammo', 'objective',
    'timer', 'message', 'banner', 'minimap', 'menu', 'menu-title', 'menu-sub',
    'btn-start', 'btn-continue', 'btn-resume', 'btn-restart', 'btn-quit',
    'pause', 'end', 'end-title', 'end-text', 'btn-retry', 'btn-menu'];
  for (const id of ids) {
    const el = doc.getElementById(id);
    if (el) H.el[id] = el;
  }
}

export function showMenu(H, G) {
  H.el['menu'].classList.remove('hidden');
  H.el['pause'].classList.add('hidden');
  H.el['end'].classList.add('hidden');
  H.el['hud'].classList.add('hidden');
  H.el['menu-title'].textContent = 'SOLMAR';
  H.el['menu-sub'].textContent = 'Danny Voss owes money. Mara has jobs. Take the city.';
  const hasSave = G.save.hasSave();
  H.el['btn-continue'].style.display = hasSave ? 'inline-block' : 'none';
  H.el['btn-start'].textContent = hasSave ? 'New Game' : 'Start';
}

export function hideMenu(H) {
  H.el['menu'].classList.add('hidden');
  H.el['hud'].classList.remove('hidden');
}

export function showPause(H) {
  H.el['pause'].classList.remove('hidden');
}

export function hidePause(H) {
  H.el['pause'].classList.add('hidden');
}

export function showBusted(H) {
  showEnd(H, 'BUSTED', 'The Solmar PD caught up with Danny. Mara is already working on bail.');
}

export function showWasted(H) {
  showEnd(H, 'WASTED', 'Danny is down. The city keeps moving without him.');
}

export function showWin(H) {
  showEnd(H, 'THE BIG SCORE', 'Danny sails out of Solmar harbour $5,000 richer. Mara is already planning the next job.');
}

function showEnd(H, title, text) {
  H.el['end'].classList.remove('hidden');
  H.el['end-title'].textContent = title;
  H.el['end-text'].textContent = text;
  H.el['btn-retry'].style.display = title === 'THE BIG SCORE' ? 'none' : 'inline-block';
}

export function hideEnd(H) {
  H.el['end'].classList.add('hidden');
}

export function showBanner(H, text) {
  H.el['banner'].textContent = text;
  H.el['banner'].classList.remove('hidden');
  H.bannerTimer = 3.2;
}

export function showMessage(H, text, seconds) {
  H.el['message'].textContent = text;
  H.el['message'].classList.remove('hidden');
  H.messageTimer = seconds || 5;
}

export function updateHud(H, G, dt) {
  if (H.bannerTimer > 0) {
    H.bannerTimer -= dt;
    if (H.bannerTimer <= 0) H.el['banner'].classList.add('hidden');
  }
  if (H.messageTimer > 0) {
    H.messageTimer -= dt;
    if (H.messageTimer <= 0) H.el['message'].classList.add('hidden');
  }
  const p = G.player;
  H.el['health-fill'].style.width = clamp(p.health, 0, 100) + '%';
  H.el['health-text'].textContent = Math.ceil(p.health) + ' HP';
  H.el['money'].textContent = formatMoney(p.money);
  const stars = Math.floor(G.police.wanted);
  let starHtml = '';
  for (let i = 0; i < 5; i++) {
    starHtml += i < stars ? '★' : '☆';
  }
  H.el['stars'].textContent = starHtml;
  H.el['stars'].style.color = stars > 0 ? '#ffd94d' : '#cccccc';
  H.el['ammo'].textContent = p.inCar ? 'DRIVING' : 'AMMO ' + p.ammo;
  H.el['objective'].textContent = G.missions.active
    ? objectiveText(G.missions)
    : 'Talk to Mara — press N for the next job';
  if (G.missions.active && G.missions.timer > 0) {
    H.el['timer'].textContent = formatTime(G.missions.timer);
    H.el['timer'].classList.remove('hidden');
  } else if (G.missions.active && G.missions.holdTimer > 0) {
    H.el['timer'].textContent = 'HOLD ' + Math.ceil(G.missions.holdTimer) + 's';
    H.el['timer'].classList.remove('hidden');
  } else {
    H.el['timer'].classList.add('hidden');
  }
  drawMinimap(H, G);
}

function drawMinimap(H, G) {
  const cv = H.el['minimap'];
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  const scale = S / WORLD_SIZE;
  ctx.clearRect(0, 0, S, S);
  // Water and ground.
  ctx.fillStyle = '#2f6fb0';
  ctx.fillRect(0, S * 3080 / WORLD_SIZE, S, S - S * 3080 / WORLD_SIZE);
  ctx.fillStyle = '#6b7a5d';
  ctx.fillRect(0, 0, S, S * 2920 / WORLD_SIZE);
  ctx.fillStyle = '#e0cd96';
  ctx.fillRect(0, S * 2920 / WORLD_SIZE, S, S * 160 / WORLD_SIZE);
  // Roads.
  ctx.fillStyle = '#3d3d42';
  for (const c of [300, 700, 1100, 1500, 1900, 2300, 2700]) {
    ctx.fillRect(c * scale - 2, 0, 4, S);
    ctx.fillRect(0, c * scale - 2, S, 4);
  }
  // Mission marker.
  const target = missionTarget(G);
  if (target) {
    const pulse = 4 + Math.sin(G.time * 5) * 1.5;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(target.x * scale, target.y * scale, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(target.x * scale, target.y * scale, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police dots.
  ctx.fillStyle = '#2d7dff';
  for (const p of G.peds) {
    if (p.isCop && !p.dead) {
      ctx.fillRect(p.x * scale - 1.5, p.y * scale - 1.5, 3, 3);
    }
  }
  for (const c of G.cars) {
    if (c.isPolice && !c.dead) {
      ctx.fillRect(c.x * scale - 1.5, c.y * scale - 1.5, 3, 3);
    }
  }
  // Player arrow.
  const p = G.player;
  ctx.save();
  ctx.translate(p.x * scale, p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Viewport box.
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    (G.camera.x - G.view.w / 2) * scale,
    (G.camera.y - G.view.h / 2) * scale,
    G.view.w * scale,
    G.view.h * scale
  );
}

function missionTarget(G) {
  const M = G.missions;
  if (!M.active) return null;
  const st = currentStage(M);
  return st ? st.target : null;
}

function objectiveText(M) {
  const st = currentStage(M);
  if (!st) return 'All missions complete. Solmar is yours.';
  if (st.type === 'kill') return 'Defeat the Vulture gang (' + M.gangLeft + ' left)';
  return st.label;
}
