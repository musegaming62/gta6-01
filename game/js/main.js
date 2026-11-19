// Solmar — boot, game loop, camera, rendering, menus and screenshot staging.
// The game is a top-down open world: drive, walk, steal, shoot, run from the law,
// and work five jobs for Mara. Everything is drawn on canvas; every sound is synthesized.
import { G, WORLD, ROAD_AT } from './state.js';
import { clamp, lerp, dist, rand, pick, TAU } from './utils.js';
import { generateCity, PLACES, onRoad } from './city.js';
import { paintStaticLayer } from './world.js';
import { initInput } from './input.js';
import { makePlayer, updatePlayer, tryEnterExit, drawPlayer } from './player.js';
import { updateCars, maintainTraffic, drawCar, makeCar, spawnPoliceCar } from './cars.js';
import { updatePeds, maintainPeds, drawPed, scarePeds } from './peds.js';
import { updateBullets, drawBullets, updateWrecks } from './combat.js';
import { updateWanted, anyPoliceNear, setWanted } from './wanted.js';
import { startMission, updateMission, updateNpcs, drawNpcs, dismissPhone, restartMission, MISSIONS } from './missions.js';
import { updateParticles, drawParticles, spawnSmoke } from './particles.js';
import { initHud, updateHud, drawMinimap } from './hud.js';
import { hasSave, saveGame, loadSave, applySave, spawnPoint } from './save.js';
import { initAudio, resumeAudio, setMuted, updateSiren, startMusic, stopMusic } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = 1280, VH = 800;

// ---- screenshot staging: ?shot=chase|drive|mission|combat|foot|start ----
const params = new URLSearchParams(window.location.search);
G.shot = params.get('shot');

function el(id) { return document.getElementById(id); }
function show(id) { el(id).classList.remove('hidden'); }
function hide(id) { el(id).classList.add('hidden'); }

function boot() {
  G.city = generateCity();
  G.staticLayer = paintStaticLayer(G.city);
  G.player = makePlayer(PLACES.bar.x + 80, PLACES.bar.y + 60);
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  initHud();
  initInput(canvas, onKeyDown);
  window.__solmarSave = saveGame;

  // Menu buttons.
  el('btn-start').addEventListener('click', () => startGame(false));
  el('btn-continue').addEventListener('click', () => startGame(true));
  el('btn-resume').addEventListener('click', () => togglePause(false));
  el('btn-save').addEventListener('click', () => {
    const ok = saveGame();
    el('save-note').textContent = ok ? 'Saved. Progress is safe.' : 'Save failed — storage unavailable.';
  });
  el('btn-restart-mission').addEventListener('click', () => {
    togglePause(false);
    restartMission();
  });
  el('btn-quit').addEventListener('click', () => {
    togglePause(false);
    toMenu();
  });
  el('phone-ok').addEventListener('click', dismissPhone);
  if (hasSave()) show('btn-continue');
  G.saveSlot = hasSave();

  // A staged shot starts the game immediately, with the phone hidden.
  if (G.shot && G.shot !== 'start') {
    stageShot(G.shot);
  }
  requestAnimationFrame(loop);
}

function onKeyDown(key, down) {
  if (!down) return;
  if (key === 'm') { setMuted(!G.muted); return; }
  if (G.mode === 'menu') {
    if (key === 'enter') startGame(false);
    return;
  }
  if (key === 'p' || key === 'escape') {
    if (G.mode === 'playing' || G.mode === 'paused') togglePause(G.mode === 'playing');
    return;
  }
  if (G.mode === 'busted' || G.mode === 'wasted' || G.mode === 'done') {
    if (key === 'enter') respawn();
    return;
  }
  if (G.mode !== 'playing') return;
  if (key === 'e') tryEnterExit();
  if (key === 'r') restartMission();
}

function startGame(fromSave) {
  initAudio();
  resumeAudio();
  hide('menu');
  hide('pause');
  hide('banner');
  show('hud');
  G.mode = 'playing';
  if (fromSave) {
    const data = loadSave();
    if (data) applySave(data);
  } else {
    const sp = spawnPoint();
    G.player.x = sp.x; G.player.y = sp.y;
    G.player.car = null;
    G.money = 0; G.health = 100; G.ammo = 24;
    G.missionIndex = 0;
    G.missionDone = [false, false, false, false, false];
  }
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  startMusic();
  if (!G.shot) {
    // Fresh games open with Mara's first call.
    if (G.missionIndex < MISSIONS.length && !G.mission) startMission(G.missionIndex);
  }
  // Hide the controls hint after a while.
  setTimeout(() => { const h = el('hint'); if (h) h.style.opacity = '0'; }, 25000);
}

function toMenu() {
  G.mode = 'menu';
  hide('hud');
  hide('pause');
  hide('banner');
  hide('phone');
  show('menu');
  stopMusic();
  if (hasSave()) show('btn-continue');
}

function togglePause(pause) {
  if (pause) {
    G.mode = 'paused';
    show('pause');
  } else {
    G.mode = 'playing';
    hide('pause');
    resumeAudio();
  }
}

function respawn() {
  const hospital = PLACES.hospital;
  G.player.x = hospital.x + 40;
  G.player.y = hospital.y + 40;
  if (G.player.car) { G.player.car.kind = 'parked'; G.player.car = null; }
  G.health = 100;
  setWanted(0);
  G.npcs = [];
  for (const c of G.cars) if (c.kind === 'police') c.wreck = false;
  G.cars = G.cars.filter((c) => c.kind !== 'police');
  G.mode = 'playing';
  hide('banner');
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  if (G.mission) restartMission();
}

// ---- screenshot staging ----

function stageShot(shot) {
  hide('menu');
  show('hud');
  const hint = el('hint');
  if (hint) hint.style.display = 'none';
  G.mode = 'playing';
  initAudio();
  const p = G.player;
  if (shot === 'drive') {
    const car = makeCar(1400, 1400, 0, 'sport', 'player');
    car.speed = 300;
    G.cars.push(car);
    p.car = car; p.x = car.x; p.y = car.y;
  } else if (shot === 'chase') {
    const car = makeCar(1400, 1400, 0, 'sport', 'player');
    car.speed = 320;
    G.cars.push(car);
    p.car = car; p.x = car.x; p.y = car.y;
    setWanted(3, '');
    for (let i = 0; i < 3; i++) {
      const pc = spawnPoliceCar();
      if (pc) { pc.x = 1400 - 260 - i * 90; pc.y = 1400 + (i - 1) * 70; G.cars.push(pc); }
    }
    G.mission = { def: MISSIONS[2], index: 2, step: 1, spawned: true, ricoInCar: true, kills: 0 };
    G.markers = [{ x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: 'Safehouse' }];
  } else if (shot === 'mission') {
    const car = makeCar(PLACES.motel.x - 120, 2200, Math.PI / 2, 'sedan', 'player');
    G.cars.push(car);
    p.car = car; p.x = car.x; p.y = car.y;
    G.mission = { def: MISSIONS[2], index: 2, step: 0, spawned: false, ricoInCar: false, kills: 0 };
    G.markers = [{ x: PLACES.motel.x, y: PLACES.motel.y, label: 'Palm Court Motel' }];
    setWanted(1, '');
  } else if (shot === 'combat') {
    p.x = PLACES.warehouse.x - 120; p.y = PLACES.warehouse.y + 40;
    p.angle = 0;
    G.ammo = 48;
    G.mission = { def: MISSIONS[3], index: 3, step: 1, spawned: true, ricoInCar: false, kills: 1 };
    G.markers = [{ x: PLACES.warehouse.x, y: PLACES.warehouse.y, label: 'Vulture Warehouse' }];
    const spots = [
      { x: PLACES.warehouse.x - 60, y: PLACES.warehouse.y - 40 },
      { x: PLACES.warehouse.x + 60, y: PLACES.warehouse.y - 50 },
      { x: PLACES.warehouse.x - 40, y: PLACES.warehouse.y + 60 },
      { x: PLACES.warehouse.x + 70, y: PLACES.warehouse.y + 40 },
    ];
    for (const s of spots) {
      G.npcs.push({ kind: 'gang', x: s.x, y: s.y, angle: Math.PI, speed: 130, health: 100,
        shirt: '#3a3a3a', pants: '#2b2d42', skin: '#c68642', state: 'guard',
        targetX: s.x, targetY: s.y, shootTimer: 1 });
    }
    setWanted(2, '');
  } else if (shot === 'foot') {
    p.x = 1600; p.y = 1600;
    p.angle = -Math.PI / 2;
  }
  G.camera.x = p.x;
  G.camera.y = p.y;
  if (G.shot) startMusic();
}

// ---- loop ----

let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (G.mode === 'playing' || G.mode === 'menu') update(dt);
  render();
  if (G.mode === 'playing') {
    updateHud();
    drawMinimap();
  }
}

function update(dt) {
  G.time += dt;
  // Mouse world position for aiming.
  const cam = G.camera;
  G.mouse.wx = cam.x + (G.mouse.x - VW / 2) / cam.zoom;
  G.mouse.wy = cam.y + (G.mouse.y - VH / 2) / cam.zoom;

  maintainTraffic(dt);
  maintainPeds();
  updateCars(dt);
  updatePeds(dt);
  updateNpcs(dt);
  updateBullets(dt);
  updateParticles(dt);
  updateWrecks(dt);

  if (G.mode === 'playing') {
    updatePlayer(dt);
    updateWanted(dt);
    updateMission(dt);
    // Camera follows the player, zooming out a little at speed.
    const p = G.player;
    const targetZoom = p.car ? 0.82 : 1;
    cam.zoom = lerp(cam.zoom, targetZoom, dt * 2);
    cam.x = lerp(cam.x, p.x, Math.min(1, dt * 5));
    cam.y = lerp(cam.y, p.y, Math.min(1, dt * 5));
    // Busted / wasted banners.
    if (G.mode === 'busted' || G.mode === 'wasted' || G.mode === 'done') showBanner();
  } else {
    // Menu: slow cinematic pan across downtown with traffic alive.
    cam.zoom = lerp(cam.zoom, 0.75, dt);
    cam.x = 1600 + Math.sin(G.time * 0.05) * 500;
    cam.y = 1600 + Math.cos(G.time * 0.04) * 400;
  }

  updateSiren(anyPoliceNear(500));
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
}

function showBanner() {
  const b = el('banner');
  const title = el('banner-title');
  const sub = el('banner-sub');
  if (G.mode === 'busted') { title.textContent = 'BUSTED'; title.style.color = '#7fb3ff'; }
  else if (G.mode === 'wasted') { title.textContent = 'WASTED'; title.style.color = '#ff6b6b'; }
  else { title.textContent = 'SOLMAR IS YOURS'; title.style.color = '#ffd166'; }
  sub.textContent = G.endReason;
  b.classList.remove('hidden');
}

// ---- render ----

function render() {
  const cam = G.camera;
  ctx.fillStyle = '#0c0e14';
  ctx.fillRect(0, 0, VW, VH);
  const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
  const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;

  ctx.save();
  ctx.translate(VW / 2, VH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

  // Static city.
  ctx.drawImage(G.staticLayer, 0, 0);

  // Objective beacon: a pulsing diamond and a shaft of light.
  for (const m of G.markers) {
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = 'rgba(255,209,102,0.12)';
    ctx.fillRect(-14, -260, 28, 260);
    ctx.fillStyle = '#ffd166';
    ctx.rotate(Math.PI / 4);
    const s = 16 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // Pickups.
  for (const pk of G.pickups) drawPickup(pk);

  // Cars, peds, npcs, player, bullets, particles.
  for (const car of G.cars) drawCar(ctx, car);
  for (const ped of G.peds) drawPed(ctx, ped);
  drawNpcs(ctx);
  drawPlayer(ctx);
  drawBullets(ctx);
  drawParticles(ctx);
  ctx.restore();

  // Warm golden-hour light: a soft vignette and a sun tint.
  const grad = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
  grad.addColorStop(0, 'rgba(255,190,90,0.05)');
  grad.addColorStop(1, 'rgba(20,10,40,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VW, VH);

  // Low-health vignette.
  if (G.mode === 'playing' && G.health < 35) {
    const danger = (1 - G.health / 35) * (0.25 + Math.sin(G.time * 6) * 0.08);
    const dg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8);
    dg.addColorStop(0, 'rgba(180,0,0,0)');
    dg.addColorStop(1, 'rgba(180,0,0,' + danger.toFixed(3) + ')');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, VW, VH);
  }

  // District label.
  if (G.mode === 'playing') {
    const d = districtName(G.player ? G.player.x : 0, G.player ? G.player.y : 0);
    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(d, 16, VH - 52);
  }
}

function drawPickup(pk) {
  ctx.save();
  ctx.translate(pk.x, pk.y);
  const bob = Math.sin(G.time * 4 + pk.x) * 3;
  ctx.translate(0, bob);
  if (pk.kind === 'health') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = '#2a9d8f';
    ctx.fillRect(-2.5, -7, 5, 14);
    ctx.fillRect(-7, -2.5, 14, 5);
  } else if (pk.kind === 'ammo') {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-5, -6, 2, 12);
    ctx.fillRect(0, -6, 2, 12);
    ctx.fillRect(5, -6, 2, 12);
  } else {
    ctx.fillStyle = '#7ee081';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a5c2a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 4);
  }
  ctx.restore();
}

function districtName(x, y) {
  if (y >= 2840) return 'Solmar Beach';
  if (x >= 2200 && y >= 2400) return 'Harbour';
  if (x >= 1000 && x < 2200 && y >= 1000 && y < 2200) return 'Downtown';
  if (x < 1000 && y < 1000) return 'Palm Heights';
  if (x < 1000 && y >= 1400) return 'Old Town';
  if (x >= 2200 && y < 1000) return 'Industrial';
  return 'Midtown';
}

boot();
