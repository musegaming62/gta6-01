// Solmar — entry point. Boots the city, runs the game loop, owns the camera
// and the screens (menu, pause, busted, wasted, failed, win), and stages the
// four screenshot scenes from the ?shot= query parameter.

import { S, WORLD, freshPlayer, resetRun } from './state.js';
import { clamp, dist, angleTo } from './util.js';
import { buildCity, drawWorld, ROAD_X, segmentHitsBuilding } from './world.js';
import { initInput, isDown, wasPressed, consumePress, endFrame, mouse } from './input.js';
import { updatePlayer, drawPlayer, drawPickups, enterCar, spawnPickup } from './player.js';
import { drawCars, updateTraffic, spawnParkedCars, spawnTraffic, makeCar } from './cars.js';
import { updatePeds, drawPeds, spawnPeds, spawnGang } from './peds.js';
import { updatePolice, drawCops, setWanted } from './police.js';
import { updateBullets, drawBullets, fireBullet } from './combat.js';
import { updateMissions, startMission, missionObjective, retryMission, MISSIONS } from './missions.js';
import { updateParticles, drawParticles } from './particles.js';
import { initHud, updateHud } from './hud.js';
import { writeSave, readSave, hasSave } from './save.js';
import { ensureAudio, updateAudio, stopEngine, sfxClick, sfxMission } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewW = 1280;
let viewH = 800;
let lastT = 0;

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = viewW;
  canvas.height = viewH;
}
window.addEventListener('resize', resize);

function $(id) { return document.getElementById(id); }

function showOnly(id) {
  for (const name of ['menu', 'pause', 'busted', 'wasted', 'failed', 'win']) {
    const el = $('screen-' + name);
    if (el) el.style.display = name === id ? 'flex' : 'none';
  }
  const hud = $('hud');
  if (hud) hud.style.display = (id === null) ? 'block' : 'none';
}

function startGame(fromSave) {
  ensureAudio();
  resetRun();
  buildCity();
  S.player = freshPlayer(1000, 420);
  S.cam.x = S.player.x - viewW / 2;
  S.cam.y = S.player.y - viewH / 2;
  spawnParkedCars();
  spawnTraffic(12);
  spawnPeds(22);
  spawnPickup(1080, 480, 'health');
  spawnPickup(1420, 1020, 'ammo');
  spawnPickup(620, 1820, 'health');
  let mission = 0;
  if (fromSave) {
    const save = readSave();
    if (save) {
      S.money = save.money;
      mission = Math.min(save.mission, MISSIONS.length - 1);
      S.player.x = save.x;
      S.player.y = save.y;
    }
  }
  startMission(mission);
  S.mode = 'playing';
  showOnly(null);
  sfxClick();
}

function quitToMenu() {
  writeSave();
  stopEngine();
  S.mode = 'menu';
  showOnly('menu');
  $('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
}

function stageShot(shot) {
  const p = S.player;
  const L = S.world.landmarks;
  if (shot === 'chase') {
    // Downtown road, in a sports car, wanted 3, cruisers on the tail.
    const car = makeCar('sport', 1400, 1000, 0);
    S.cars.push(car);
    enterCar(p, car);
    p.x = 1400; p.y = 1000;
    startMission(2);
    S.missionTimer = 59;
    setWanted(3);
    for (let i = 0; i < 2; i++) {
      const c = makeCar('police', 1400 - 160 - i * 90, 1000 + (i % 2 ? 24 : -24), 0);
      c.policeChase = true;
      S.cars.push(c);
    }
    updatePolice(0.01);
  } else if (shot === 'drive') {
    const car = makeCar('sedan', 1000, 600, 0);
    S.cars.push(car);
    enterCar(p, car);
    p.x = 1000; p.y = 600;
    setWanted(0);
  } else if (shot === 'mission') {
    // On foot beside the red sports car, inside the gold mission ring.
    p.x = 980; p.y = 260;
    p.hp = 100;
    setWanted(0);
  } else if (shot === 'combat') {
    // On foot at the Vulture turf, four gang members closing in.
    startMission(3);
    p.x = L.turf.x;
    p.y = L.turf.y + 40;
    p.hp = 100;
    p.ammo = 12;
    setWanted(0);
  }
  S.mode = 'playing';
  showOnly(null);
}

function update(dt) {
  S.time += dt;
  if (S.bannerT > 0) S.bannerT -= dt;
  if (S.mode !== 'playing') return;
  if (wasPressed('KeyP') || wasPressed('Escape')) {
    S.mode = 'paused';
    showOnly('pause');
    writeSave();
    return;
  }
  updatePlayer(dt);
  updateTraffic(dt);
  updatePeds(dt);
  // Gang members in attack range shoot at the player (line of sight only:
  // they cannot shoot through buildings either).
  for (const ped of S.peds) {
    if (ped.gang && ped.state === 'attack' && S.player) {
      ped.shootT -= dt;
      if (ped.shootT <= 0 && !segmentHitsBuilding(ped.x, ped.y, S.player.x, S.player.y)) {
        ped.shootT = 1.1 + Math.random() * 0.8;
        fireBullet(ped.x, ped.y, angleTo(ped.x, ped.y, S.player.x, S.player.y), 'enemy', 9, 640);
      }
    }
  }
  updatePolice(dt);
  updateBullets(dt);
  updateMissions(dt);
  updateParticles(dt);
  // Camera follows the player with shake.
  const tx = clamp(S.player.x - viewW / 2, 0, Math.max(0, WORLD - viewW));
  const ty = clamp(S.player.y - viewH / 2, 0, Math.max(0, WORLD - viewH));
  S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 6);
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 6);
  const speedNorm = S.player.inCar ? Math.abs(S.player.inCar.speed) / 480 : S.player.speed / 285;
  updateAudio(dt, clamp(speedNorm, 0, 1), S.wanted);
  if (S.mode === 'busted') showOnly('busted');
  if (S.mode === 'wasted') showOnly('wasted');
  if (S.mode === 'failed') showOnly('failed');
  if (S.mode === 'win') showOnly('win');
}

function drawMissionMarker(ctx) {
  const obj = missionObjective();
  if (!obj || S.mode !== 'playing') return;
  const pulse = 1 + Math.sin(S.time * 4) * 0.12;
  ctx.save();
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,211,77,0.25)';
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, 34 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // Off-screen arrow pointing at the objective.
  const sx = obj.x - S.cam.x, sy = obj.y - S.cam.y;
  if (sx < 40 || sx > viewW - 40 || sy < 40 || sy > viewH - 40) {
    const cx = clamp(sx, 50, viewW - 50);
    const cy = clamp(sy, 50, viewH - 50);
    const a = Math.atan2(sy - viewH / 2, sx - viewW / 2);
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function render() {
  const shX = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  const shY = S.shake > 0 ? (Math.random() - 0.5) * S.shake : 0;
  const camX = S.cam.x + shX;
  const camY = S.cam.y + shY;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-camX, -camY);
  const view = { x0: camX - 40, y0: camY - 40, x1: camX + viewW + 40, y1: camY + viewH + 40 };
  drawWorld(ctx, view);
  drawMissionMarker(ctx);
  drawPickups(ctx);
  drawCars(ctx);
  drawPeds(ctx);
  drawCops(ctx);
  drawPlayer(ctx);
  drawBullets(ctx);
  drawParticles(ctx, { x: camX, y: camY });
  ctx.restore();
  // Hold-up progress bar for the bank robbery.
  if (S.mode === 'playing' && S.mission === 4 && S.missionStage === 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(viewW / 2 - 130, 84, 260, 22);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(viewW / 2 - 128, 86, 256 * clamp(S.holdup / 5, 0, 1), 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD-UP IN PROGRESS', viewW / 2, 78);
  }
  if (S.mode === 'playing') updateHud();
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  // Pause screen input. Consume the key so update() below does not see the
  // same press and immediately re-pause the game.
  if (S.mode === 'paused') {
    if (wasPressed('KeyP') || wasPressed('Escape')) {
      S.mode = 'playing';
      showOnly(null);
      consumePress('KeyP');
      consumePress('Escape');
    }
  }
  update(dt);
  render();
  endFrame();
  window.__solmarReady = true;
}

function boot() {
  resize();
  initInput(canvas);
  initHud();
  buildCity();
  S.player = freshPlayer(1000, 420);
  S.cam.x = S.player.x - viewW / 2;
  S.cam.y = S.player.y - viewH / 2;
  spawnParkedCars();
  spawnTraffic(10);
  spawnPeds(18);
  $('btn-start').addEventListener('click', () => startGame(false));
  $('btn-continue').addEventListener('click', () => startGame(true));
  $('btn-resume').addEventListener('click', () => { S.mode = 'playing'; showOnly(null); sfxClick(); });
  $('btn-restart').addEventListener('click', () => startGame(false));
  $('btn-quit').addEventListener('click', () => quitToMenu());
  $('btn-retry').addEventListener('click', () => { retryMission(); showOnly(null); });
  $('btn-retry-wasted').addEventListener('click', () => { retryMission(); showOnly(null); });
  $('btn-menu-busted').addEventListener('click', () => quitToMenu());
  $('btn-menu-wasted').addEventListener('click', () => quitToMenu());
  $('btn-menu-failed').addEventListener('click', () => quitToMenu());
  $('btn-retry-failed').addEventListener('click', () => { retryMission(); showOnly(null); });
  $('btn-again').addEventListener('click', () => startGame(false));
  $('btn-menu-win').addEventListener('click', () => quitToMenu());
  $('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';
  // Staged screenshot mode: ?shot=chase|drive|mission|combat
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    S.shot = shot;
    startGame(false);
    stageShot(shot);
  } else {
    showOnly('menu');
  }
  window.__solmar = { S, startGame, quitToMenu, retryMission, ROAD_X };
  requestAnimationFrame(loop);
}

boot();
