// Solmar's entry point: boot, game loop, camera, world rendering, menus and
// the screenshot shot setup. This is the file the page loads.

import { clamp, rand, dist, TWO_PI } from './util.js';
import { buildCity, WORLD, PITCH, ROAD_W, BEACH_Y, OCEAN_Y, pointInBuilding } from './world.js';
import { createInput, attachInput, isDown, wasPressed, endFrame } from './input.js';
import { initAudio, setEngine, setSiren, playClick, playJingle } from './audio.js';
import { updateParticles, drawParticles, spawnBurst, spawnText, addShake } from './particles.js';
import { spawnCar, updateCars, drawCars, drivePlayerCar, exitCar, nearestCar } from './cars.js';
import { spawnPed, updatePeds, drawPeds } from './peds.js';
import { createPlayer, updatePlayer, drawPlayer, drawPickups } from './player.js';
import { updateBullets, drawBullets } from './combat.js';
import { addWanted, updatePolice, drawCops } from './police.js';
import { MISSIONS, startMission, updateMissions, missionMarker } from './missions.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { initHud, updateHud, showBanner } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function createState() {
  const city = buildCity(1337);
  const state = {
    mode: 'menu',
    time: 0,
    money: 0,
    wanted: 0,
    wantedTimer: 0,
    bustTimer: 0,
    city,
    player: createPlayer(city.start.x, city.start.y),
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    texts: [],
    pickups: [],
    mission: { index: -1, stage: 0, timer: 0, target: null, hint: '', done: false, gangLeft: 0 },
    objective: 'Welcome to Solmar. Press Start and make your name.',
    camera: { x: city.start.x - 400, y: city.start.y - 300 },
    shake: 0,
    input: createInput(),
    stats: { shots: 0, hits: 0 },
    save: null,
  };
  state.save = () => saveGame(state);
  return state;
}

const state = createState();
attachInput(state.input, canvas);
initHud();
window.__solmarState = state;

// Populate the world: traffic, parked cars, pedestrians, pickups.
function populateWorld() {
  const types = ['sedan', 'sedan', 'sedan', 'sports', 'truck'];
  for (let i = 0; i < 14; i++) {
    const p = randomRoadPoint();
    const dir = Math.floor(rand(0, 4));
    spawnCar(state, types[i % types.length], p.x, p.y, dir * Math.PI / 2, {
      isTraffic: true, dir, lane: (i % 2 === 0 ? -14 : 14),
    });
  }
  for (let i = 0; i < 8; i++) {
    const p = randomRoadPoint();
    spawnCar(state, types[(i + 2) % types.length], p.x + rand(-20, 20), p.y + rand(-20, 20), rand(TWO_PI), { parked: true });
  }
  for (let i = 0; i < 18; i++) {
    const p = randomSidewalkPoint();
    spawnPed(state, p.x, p.y, {});
  }
  // Health and ammo pickups around the city.
  const spots = [
    { x: 1250, y: 1650, kind: 'health' },
    { x: 1650, y: 1250, kind: 'ammo' },
    { x: 850, y: 2050, kind: 'health' },
    { x: 2250, y: 1450, kind: 'ammo' },
    { x: 2050, y: 2450, kind: 'money' },
    { x: 450, y: 1250, kind: 'money' },
  ];
  for (const s of spots) state.pickups.push({ ...s });
}

function randomRoadPoint() {
  const vertical = Math.random() < 0.5;
  const lane = Math.floor(Math.random() * 9) * PITCH;
  const along = Math.random() * WORLD;
  return vertical ? { x: lane, y: along } : { x: along, y: lane };
}

function randomSidewalkPoint() {
  const vertical = Math.random() < 0.5;
  const road = Math.floor(Math.random() * 9) * PITCH;
  const along = Math.random() * WORLD;
  const off = (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14);
  return vertical ? { x: road + off, y: along } : { x: along, y: road + off };
}

populateWorld();

// ---- Shot setup: the harness loads ?shot=<name> to take each screenshot. ----
function setupShot(shot) {
  const L = state.city.landmarks;
  state.mode = 'playing';
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  if (shot === 'chase') {
    // Police chase: player in a sports car, wanted 3, cruisers behind.
    const car = spawnCar(state, 'sports', 1800, 1200, 0, { color: '#d43a2f', isPlayer: true });
    state.player.inCar = car;
    state.player.x = 1800;
    state.player.y = 1200;
    state.wanted = 3;
    setSiren(true);
    spawnCar(state, 'cruiser', 1560, 1200, 0, { isPolice: true });
    spawnCar(state, 'cruiser', 1640, 1240, 0, { isPolice: true });
    startMission(state, 2);
    state.mission.timer = 54;
    state.objective = 'Getaway Driver — reach the safehouse!';
  } else if (shot === 'drive') {
    // City driving with traffic and pedestrians.
    const car = spawnCar(state, 'sedan', 1200, 1200, Math.PI / 2, { color: '#7a8a99', isPlayer: true });
    state.player.inCar = car;
    state.player.x = 1200;
    state.player.y = 1200;
    startMission(state, 0);
    state.objective = 'Hot Wheels — steal the red sports car';
  } else if (shot === 'mission') {
    // On foot at the mission objective marker.
    state.player.x = L.pickupA.x - 40;
    state.player.y = L.pickupA.y + 30;
    startMission(state, 1);
    state.objective = 'The Pickup — grab the package';
  } else if (shot === 'combat') {
    // Payback combat at the gang turf.
    state.player.x = L.turf.x - 120;
    state.player.y = L.turf.y + 60;
    state.player.hp = 78;
    state.wanted = 2;
    startMission(state, 3);
    state.objective = 'Payback — defeat the Vultures';
  }
  // Let the scene settle for a moment so the shot is stable.
  for (let i = 0; i < 30; i++) update(state, 1 / 30);
}

// ---- Update ----

function update(state, dt) {
  const input = state.input;
  const p = state.player;
  // Mouse position in world coordinates (camera is top-left).
  input.mouse.wx = input.mouse.x + state.camera.x;
  input.mouse.wy = input.mouse.y + state.camera.y;
  if (p.inCar) {
    const driving = {
      up: isDown(input, 'KeyW', 'ArrowUp'),
      down: isDown(input, 'KeyS', 'ArrowDown'),
      left: isDown(input, 'KeyA', 'ArrowLeft'),
      right: isDown(input, 'KeyD', 'ArrowRight'),
    };
    drivePlayerCar(state, p.inCar, driving, dt);
    if (wasPressed(input, 'KeyE')) exitCar(state, false);
  } else {
    updatePlayer(state, dt);
  }
  updateCars(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt);
  updateBullets(state, dt);
  updateParticles(state, dt);
  updateMissions(state, dt);
  // Death.
  if (p.hp <= 0 && state.mode === 'playing') {
    state.mode = 'wasted';
    setSiren(false);
    setEngine(0);
    showOverlay('wasted');
  }
  // Pause on P or Escape (single press only: `pressed` clears each frame).
  if (wasPressed(input, 'KeyP', 'Escape')) {
    state.mode = 'paused';
    setEngine(0);
    showOverlay('pause');
  }
}

// ---- Rendering ----

function viewRect() {
  return {
    x0: state.camera.x - 60, y0: state.camera.y - 60,
    x1: state.camera.x + canvas.width + 60, y1: state.camera.y + canvas.height + 60,
  };
}

function render(state) {
  const cam = state.camera;
  // Follow the player (or their car), clamped to the world.
  const px = state.player.inCar ? state.player.inCar.x : state.player.x;
  const py = state.player.inCar ? state.player.inCar.y : state.player.y;
  if (state.mode !== 'menu') {
    cam.x = clamp(px - canvas.width / 2, 0, Math.max(0, WORLD - canvas.width));
    cam.y = clamp(py - canvas.height / 2, 0, Math.max(0, WORLD - canvas.height));
  } else {
    // Slow pan across the city behind the menu.
    cam.x = 700 + Math.sin(state.time * 0.05) * 500;
    cam.y = 900 + Math.cos(state.time * 0.04) * 300;
  }
  const shx = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
  const shy = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
  const ox = cam.x + shx;
  const oy = cam.y + shy;
  const view = { x0: ox - 60, y0: oy - 60, x1: ox + canvas.width + 60, y1: oy + canvas.height + 60 };
  const drawCam = { x: ox, y: oy };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Ground: district colours.
  for (const d of state.city.districts) {
    if (d.x1 < view.x0 || d.x0 > view.x1 || d.y1 < view.y0 || d.y0 > view.y1) continue;
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x0 - ox, d.y0 - oy, d.x1 - d.x0, d.y1 - d.y0);
  }
  // Beach and ocean at the south edge.
  ctx.fillStyle = '#d8c890';
  ctx.fillRect(0 - ox, BEACH_Y - oy, WORLD, OCEAN_Y - BEACH_Y);
  ctx.fillStyle = '#3a7ac8';
  ctx.fillRect(0 - ox, OCEAN_Y - oy, WORLD, WORLD - OCEAN_Y);
  // Ocean waves.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const wy = OCEAN_Y + 30 + i * 22 + Math.sin(state.time * 1.5 + i) * 3;
    if (wy < view.y0 || wy > view.y1) continue;
    ctx.beginPath();
    ctx.moveTo(0 - ox, wy - oy);
    ctx.lineTo(WORLD - ox, wy - oy);
    ctx.stroke();
  }
  // Roads.
  ctx.fillStyle = '#3a3a3f';
  for (let i = 0; i <= 8; i++) {
    const c = i * PITCH;
    if (c + ROAD_W / 2 > view.x0 && c - ROAD_W / 2 < view.x1) {
      ctx.fillRect(c - ROAD_W / 2 - ox, 0 - oy, ROAD_W, WORLD);
    }
    if (c + ROAD_W / 2 > view.y0 && c - ROAD_W / 2 < view.y1) {
      ctx.fillRect(0 - ox, c - ROAD_W / 2 - oy, WORLD, ROAD_W);
    }
  }
  // Lane dashes.
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (let i = 0; i <= 8; i++) {
    const c = i * PITCH;
    ctx.beginPath();
    ctx.moveTo(c - ox, 0 - oy);
    ctx.lineTo(c - ox, WORLD - oy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0 - ox, c - oy);
    ctx.lineTo(WORLD - ox, c - oy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Sidewalk strips along roads.
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i <= 8; i++) {
    const c = i * PITCH;
    ctx.fillRect(c - ROAD_W / 2 - 10 - ox, 0 - oy, 10, WORLD);
    ctx.fillRect(c + ROAD_W / 2 - ox, 0 - oy, 10, WORLD);
    ctx.fillRect(0 - ox, c - ROAD_W / 2 - 10 - oy, WORLD, 10);
    ctx.fillRect(0 - ox, c + ROAD_W / 2 - oy, WORLD, 10);
  }
  // Harbour docks and boat.
  const L = state.city.landmarks;
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(L.harbour.x - 90 - ox, L.harbour.y - 40 - oy, 180, 16);
  ctx.fillRect(L.harbour.x - 90 - ox, L.harbour.y + 10 - oy, 180, 16);
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath();
  ctx.ellipse(L.boat.x - ox, L.boat.y - oy, 46, 16, 0, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = '#2a6aff';
  ctx.fillRect(L.boat.x - 30 - ox, L.boat.y - 8 - oy, 60, 16);
  // Buildings.
  for (const b of state.city.buildings) {
    if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 4 - ox, b.y + 5 - oy, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x - ox, b.y - oy, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 6 - ox, b.y + 6 - oy, b.w - 12, b.h - 12);
    // Windows.
    ctx.fillStyle = 'rgba(255,255,200,0.5)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 30));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx + cy) % 2 === 0) continue;
        ctx.fillRect(b.x + 12 + cx * 30 - ox, b.y + 12 + cy * 26 - oy, 10, 8);
      }
    }
    if (b.landmark === 'bank') {
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('$ BANK $', b.x + b.w / 2 - ox, b.y + b.h / 2 + 8 - oy);
    } else if (b.landmark === 'chop') {
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CHOP SHOP', b.x + b.w / 2 - ox, b.y + b.h / 2 + 6 - oy);
    }
  }
  // Trees.
  for (const t of state.city.trees) {
    if (t.x < view.x0 || t.x > view.x1 || t.y < view.y0 || t.y > view.y1) continue;
    ctx.fillStyle = '#3a6a2a';
    ctx.beginPath();
    ctx.arc(t.x - ox, t.y - oy, t.r, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#4a7a35';
    ctx.beginPath();
    ctx.arc(t.x - 3 - ox, t.y - 3 - oy, t.r * 0.7, 0, TWO_PI);
    ctx.fill();
  }
  // Mission marker: pulsing ring and a beam.
  const marker = missionMarker(state);
  if (marker && state.mode === 'playing') {
    const pulse = 26 + Math.sin(state.time * 5) * 6;
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(marker.x - ox, marker.y - oy, pulse, 0, TWO_PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,217,74,0.25)';
    ctx.beginPath();
    ctx.arc(marker.x - ox, marker.y - oy, pulse, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.moveTo(marker.x - ox, marker.y - 46 - oy);
    ctx.lineTo(marker.x + 10 - ox, marker.y - 26 - oy);
    ctx.lineTo(marker.x - 10 - ox, marker.y - 26 - oy);
    ctx.closePath();
    ctx.fill();
    // Edge arrow when the marker is off-screen.
    const ex = clamp(marker.x, ox + 40, ox + canvas.width - 40);
    const ey = clamp(marker.y, oy + 40, oy + canvas.height - 40);
    if (ex !== marker.x || ey !== marker.y) {
      const a = Math.atan2(marker.y - (oy + canvas.height / 2), marker.x - (ox + canvas.width / 2));
      ctx.save();
      ctx.translate(ex - ox, ey - oy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  drawPickups(ctx, state, drawCam);
  drawCars(ctx, state, drawCam);
  drawPeds(ctx, state, drawCam);
  drawCops(ctx, state, drawCam);
  drawPlayer(ctx, state, drawCam);
  drawBullets(ctx, state, drawCam);
  drawParticles(ctx, state, drawCam);
  ctx.textAlign = 'left';
}

// ---- Overlays and menus ----

function showOverlay(which) {
  const ids = ['menu', 'pause', 'busted', 'wasted', 'win'];
  for (const id of ids) document.getElementById(id).style.display = 'none';
  document.getElementById('hud').style.display = which === 'menu' ? 'none' : 'block';
  if (which) document.getElementById(which).style.display = 'flex';
}

function newGame() {
  initAudio();
  playClick();
  clearSave();
  resetWorld();
  state.money = 0;
  state.wanted = 0;
  startMission(state, 0);
  state.mode = 'playing';
  showOverlay(null);
  showBanner('Mission 1: Hot Wheels');
}

function continueGame() {
  initAudio();
  playClick();
  const data = loadGame();
  if (!data) return newGame();
  resetWorld();
  state.money = data.money;
  state.player.x = data.player.x;
  state.player.y = data.player.y;
  state.wanted = 0;
  startMission(state, Math.min(data.missionIndex, MISSIONS.length - 1));
  state.mode = 'playing';
  showOverlay(null);
  showBanner('Welcome back, Danny');
}

// Rebuild the world population after a retry or a new game.
function resetWorld() {
  state.cars.length = 0;
  state.peds.length = 0;
  state.cops.length = 0;
  state.bullets.length = 0;
  state.particles.length = 0;
  state.texts.length = 0;
  state.pickups.length = 0;
  state.player = createPlayer(state.city.start.x, state.city.start.y);
  state.bustTimer = 0;
  state.wantedTimer = 0;
  populateWorld();
}

function retryMission() {
  initAudio();
  playClick();
  const idx = Math.max(0, state.mission.index);
  state.player.hp = state.player.maxHp;
  state.player.x = state.city.start.x;
  state.player.y = state.city.start.y;
  if (state.player.inCar) {
    state.player.inCar.isPlayer = false;
    state.player.inCar = null;
  }
  state.cops.length = 0;
  state.bullets.length = 0;
  state.wanted = 0;
  setSiren(false);
  setEngine(0);
  startMission(state, idx);
  state.mode = 'playing';
  showOverlay(null);
  showBanner('Try again, Danny');
}

function resumeGame() {
  initAudio();
  playClick();
  state.mode = 'playing';
  showOverlay(null);
}

function quitToMenu() {
  playClick();
  state.mode = 'menu';
  setSiren(false);
  setEngine(0);
  showOverlay('menu');
  refreshMenuButtons();
}

function refreshMenuButtons() {
  const cont = document.getElementById('btn-continue');
  cont.style.display = hasSave() ? 'block' : 'none';
}

document.getElementById('btn-start').addEventListener('click', newGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => { playClick(); newGame(); });
document.getElementById('btn-quit').addEventListener('click', quitToMenu);
document.getElementById('btn-retry').addEventListener('click', retryMission);
document.getElementById('btn-retry2').addEventListener('click', retryMission);
document.getElementById('btn-again').addEventListener('click', () => { playClick(); newGame(); });
document.getElementById('btn-menu2').addEventListener('click', quitToMenu);
canvas.addEventListener('mousedown', initAudio);
refreshMenuButtons();

// ---- Main loop ----

let last = performance.now();
let firstFrame = true;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;
  if (state.mode === 'playing') {
    update(state, dt);
  } else if (state.mode === 'paused') {
    if (wasPressed(state.input, 'KeyP', 'Escape')) resumeGame();
  }
  render(state);
  if (state.mode === 'playing') updateHud(state);
  endFrame(state.input);
  if (firstFrame) {
    firstFrame = false;
    window.__solmarReady = true;
  }
  requestAnimationFrame(frame);
}

// Shot mode: the harness loads the game with ?shot=<name>.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  setupShot(shot);
} else {
  showOverlay('menu');
}
requestAnimationFrame(frame);
