// Solmar — saves to localStorage: money, mission progress, the player's spot and vitals.
// A save never leaves the player's own browser.
import { G } from './state.js';
import { PLACES } from './city.js';

const KEY = 'solmar-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveGame() {
  const p = G.player;
  if (!p) return false;
  const data = {
    v: 1,
    money: G.money,
    health: G.health,
    ammo: G.ammo,
    missionIndex: G.missionIndex,
    missionDone: G.missionDone,
    x: p.x, y: p.y,
    wanted: 0,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* no storage */ }
}

export function applySave(data) {
  G.money = data.money || 0;
  G.health = data.health || 100;
  G.ammo = data.ammo || 24;
  G.missionIndex = data.missionIndex || 0;
  G.missionDone = data.missionDone || [false, false, false, false, false];
  const p = G.player;
  if (p && typeof data.x === 'number') {
    p.x = data.x;
    p.y = data.y;
  }
  G.wanted = 0;
}

export function spawnPoint() {
  // New game: Danny starts outside Mara's bar.
  const bar = PLACES.bar;
  return { x: bar.x + 80, y: bar.y + 60 };
}
