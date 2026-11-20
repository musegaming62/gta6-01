// Solmar: boot, game loop, camera, and rendering. Wires every module together
// and exposes window.__solmar so the game can be driven and inspected.
import { clamp, mulberry32, randRange } from './util.js';
import { buildWorld, drawWorld, SPOTS, WORLD_SIZE } from './world.js';
import { SoundFX } from './audio.js';
import { Input } from './input.js';
import { createParticles, updateParticles, drawParticles, shakeOffset } from './particles.js';
import { spawnParkedCars, updateCars, drawCars } from './cars.js';
import { spawnPeds, updatePeds, drawPeds } from './peds.js';
import { createCombat, updateCombat, drawBullets, playerShoot, enemyShoot } from './combat.js';
import { createPlayer, updatePlayer, drawPlayer } from './player.js';
import { createPolice, updatePolice, clearWanted, addWanted, setWanted, busted, wasted } from './police.js';
import { createMissions, updateMissions, startMission, currentDef, currentStage, onEnterCar, onGangKilled } from './missions.js';
import { createHud, bindHud, showMenu, hideMenu, showPause, hidePause, hideEnd, updateHud, showBusted, showWasted, showWin, showBanner, showMessage } from './hud.js';
import { createSave } from './save.js';
import { stageShot, shotFromUrl } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const G = {
  time: 0,
  state: 'menu', // menu | playing | paused | busted | wasted | win
  view: { w: 1280, h: 800 },
  camera: { x: 1500, y: 1650, w: 1280, h: 800 },
  world: null,
  player: null,
  cars: [],
  peds: [],
  pickups: [],
  particles: null,
  combat: null,
  police: null,
  missions: null,
  hud: null,
  save: null,
  audio: null,
  input: null,
};

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  G.view.w = w;
  G.view.h = h;
  G.camera.w = w;
  G.camera.h = h;
}

function spawnPickups() {
  const rng = mulberry32(999);
  const spots = [];
  for (let i = 0; i < 12; i++) {
    const x = randRange(rng, 200, WORLD_SIZE - 200);
    const y = randRange(rng, 200, 2850);
    spots.push({ x, y, kind: i % 3 === 0 ? 'health' : 'ammo' });
  }
  G.pickups = spots;
}

function resetRun(fromSave) {
  // Fresh world state for a new game or a continue.
  G.cars = [];
  G.peds = [];
  G.combat = createCombat();
  attachCombat(G);
  G.particles = createParticles();
  G.police = createPolice();
  attachPolice(G);
  G.missions = createMissions();
  attachMissions(G);
  spawnPickups();
  spawnParkedCars(G);
  spawnPeds(G, 18);
  const start = SPOTS.playerStart;
  G.player = createPlayer(start.x, start.y);
  if (fromSave) {
    G.player.money = fromSave.money || 0;
    G.player.health = fromSave.health || 100;
    G.player.ammo = fromSave.ammo || 48;
    G.player.x = fromSave.x || start.x;
    G.player.y = fromSave.y || start.y;
    G.missions.done = fromSave.done || [false, false, false, false, false];
    const idx = Math.min(fromSave.mission || 0, 4);
    G.missions.index = idx;
    G.missions.stage = fromSave.stage || 0;
  }
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
}

// Attach the module functions as methods on the subsystem objects, so other
// modules can call them through G (G.combat.enemyShoot, G.police.addWanted,
// G.missions.onEnterCar, G.hud.showMessage) without import cycles.
function attachCombat(g) {
  g.combat.playerShoot = (gg, x, y, angle) => playerShoot(gg, x, y, angle);
  g.combat.enemyShoot = (gg, x, y, angle, dmg) => enemyShoot(gg, x, y, angle, dmg);
}

function attachPolice(g) {
  g.police.addWanted = (gg, n) => addWanted(gg, n);
  g.police.setWanted = (gg, n) => setWanted(gg, n);
  g.police.clearWanted = (gg) => clearWanted(gg);
  g.police.busted = (gg) => busted(gg);
  g.police.wasted = (gg) => wasted(gg);
}

function attachMissions(g) {
  g.missions.onEnterCar = (gg, car) => onEnterCar(gg, car);
  g.missions.onGangKilled = (gg, ped) => onGangKilled(gg, ped);
}

function attachHud(g) {
  g.hud.showMessage = (gg, text, seconds) => showMessage(g.hud, text, seconds);
  g.hud.showBanner = (gg, text) => showBanner(g.hud, text);
  g.hud.showBusted = (gg) => showBusted(g.hud);
  g.hud.showWasted = (gg) => showWasted(g.hud);
  g.hud.showWin = (gg) => showWin(g.hud);
}

function startGame(fromSave) {
  G.audio.init();
  resetRun(fromSave);
  G.state = 'playing';
  hideMenu(G.hud);
  hideEnd(G.hud);
  hidePause(G.hud);
  if (fromSave) {
    const idx = G.missions.index;
    if (idx < 5) {
      G.missions.active = true;
      const def = currentDef(G.missions);
      if (def) G.hud.showMessage(G, def.briefing, 7);
    }
  } else {
    startMission(G, 0);
  }
}

function retry() {
  // Retry from the current mission: fresh health, no wanted, same progress.
  const idx = Math.min(G.missions.index, 4);
  const keepMoney = G.player.money;
  const keepDone = G.missions.done.slice();
  resetRun(null);
  G.player.money = keepMoney;
  G.missions.done = keepDone;
  G.state = 'playing';
  hideEnd(G.hud);
  hideMenu(G.hud);
  startMission(G, idx);
  G.hud.showMessage(G, 'Mara: Again. From the top.', 4);
}

function quitToMenu() {
  G.state = 'menu';
  G.audio.siren(false);
  G.audio.engine(0);
  hideEnd(G.hud);
  hidePause(G.hud);
  showMenu(G.hud, G);
}

function drawMarker(ctx) {
  const M = G.missions;
  if (!M.active) return;
  const st = currentStage(M);
  if (!st || !st.target) return;
  const t = st.target;
  const pulse = 1 + Math.sin(G.time * 4) * 0.15;
  // A gold beacon column and a ground ring at the objective.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#ffd94d';
  ctx.fillRect(t.x - 4, t.y - 260, 8, 260);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 46 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd94d';
  ctx.fill();
  ctx.restore();
  // Off-screen direction arrow at the screen edge.
  const sx = t.x - G.camera.x + G.view.w / 2;
  const sy = t.y - G.camera.y + G.view.h / 2;
  if (sx < 40 || sx > G.view.w - 40 || sy < 40 || sy > G.view.h - 40) {
    const cx = clamp(sx, 50, G.view.w - 50);
    const cy = clamp(sy, 50, G.view.h - 50);
    const a = Math.atan2(sy - G.view.h / 2, sx - G.view.w / 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawPickups(ctx) {
  for (const pk of G.pickups) {
    const bob = Math.sin(G.time * 3 + pk.x) * 2;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pk.kind === 'ammo') {
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', 0, 4);
    } else {
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
    }
    ctx.restore();
  }
}

function render() {
  const shake = shakeOffset(G.particles);
  ctx.clearRect(0, 0, G.view.w, G.view.h);
  ctx.save();
  ctx.translate(G.view.w / 2 - G.camera.x + shake.x, G.view.h / 2 - G.camera.y + shake.y);
  drawWorld(ctx, G.camera, G.world, G.time);
  drawMarker(ctx);
  drawPickups(ctx);
  drawCars(ctx, G, G.camera);
  drawPeds(ctx, G, G.camera);
  drawPlayer(ctx, G);
  drawBullets(ctx, G);
  drawParticles(ctx, G.particles);
  ctx.restore();
}

function update(dt) {
  if (G.state === 'playing') {
    if (G.input.hit('KeyP') || G.input.hit('Escape')) {
      G.state = 'paused';
      showPause(G.hud);
      G.audio.engine(0);
      G.audio.siren(false);
    } else {
      if (G.input.hit('KeyN') && !G.missions.active && G.missions.index < 5) {
        startMission(G, G.missions.index);
      }
      if (G.input.hit('KeyM')) {
        G.audio.muted = !G.audio.muted;
      }
      updatePlayer(G, dt);
      updateCars(G, dt);
      updatePeds(G, dt);
      updateCombat(G, dt);
      updatePolice(G, dt);
      updateMissions(G, dt);
      updateParticles(G.particles, dt);
      // Camera follows the player (or the car) with light smoothing.
      const tx = G.player.x;
      const ty = G.player.y;
      G.camera.x += (tx - G.camera.x) * Math.min(1, dt * 5);
      G.camera.y += (ty - G.camera.y) * Math.min(1, dt * 5);
      G.camera.x = clamp(G.camera.x, G.view.w / 2 - 100, WORLD_SIZE - G.view.w / 2 + 100);
      G.camera.y = clamp(G.camera.y, G.view.h / 2 - 100, WORLD_SIZE - G.view.h / 2 + 100);
      updateHud(G.hud, G, dt);
    }
  } else if (G.state === 'paused') {
    if (G.input.hit('KeyP') || G.input.hit('Escape')) {
      G.state = 'playing';
      hidePause(G.hud);
    }
  }
  // Always consume edge-triggered keys, even on the frame we pause, so the
  // same press cannot instantly resume the game on the next frame.
  G.input.endFrame();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  G.world = buildWorld(1337);
  G.audio = new SoundFX();
  G.input = new Input(canvas);
  G.hud = createHud();
  bindHud(G.hud, document);
  attachHud(G);
  G.save = createSave();
  G.particles = createParticles();
  G.combat = createCombat();
  attachCombat(G);
  G.police = createPolice();
  attachPolice(G);
  G.missions = createMissions();
  attachMissions(G);
  G.player = createPlayer(SPOTS.playerStart.x, SPOTS.playerStart.y);
  spawnPickups();
  spawnParkedCars(G);
  spawnPeds(G, 18);

  // Menu buttons.
  const H = G.hud.el;
  H['btn-start'].addEventListener('click', () => {
    G.audio.init();
    G.audio.click();
    G.save.clear();
    startGame(null);
  });
  H['btn-continue'].addEventListener('click', () => {
    G.audio.init();
    G.audio.click();
    const data = G.save.load();
    startGame(data);
  });
  H['btn-resume'].addEventListener('click', () => {
    G.audio.click();
    G.state = 'playing';
    hidePause(G.hud);
  });
  H['btn-restart'].addEventListener('click', () => {
    G.audio.click();
    hidePause(G.hud);
    const idx = Math.min(G.missions.index, 4);
    const keepMoney = G.player.money;
    const keepDone = G.missions.done.slice();
    resetRun(null);
    G.player.money = keepMoney;
    G.missions.done = keepDone;
    G.state = 'playing';
    startMission(G, idx);
  });
  H['btn-quit'].addEventListener('click', () => {
    G.audio.click();
    quitToMenu();
  });
  H['btn-retry'].addEventListener('click', () => {
    G.audio.click();
    retry();
  });
  H['btn-menu'].addEventListener('click', () => {
    G.audio.click();
    quitToMenu();
  });

  // Screenshot staging (?shot=chase|drive|mission|combat) skips the menu.
  const shot = shotFromUrl();
  if (shot) {
    stageShot(G, shot);
    hideMenu(G.hud);
    G.audio.init();
  } else {
    showMenu(G.hud, G);
  }

  // Test hook: the play-test drives the game through this object.
  window.__solmar = G;
  requestAnimationFrame(loop);
}

boot();
