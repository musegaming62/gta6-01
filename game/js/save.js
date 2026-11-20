// Solmar — save and continue via localStorage. Stores money, the next
// mission to play, and the player's position. A save is written on every
// mission completion and when the player pauses.

import { S } from './state.js';

const KEY = 'solmar-save-v1';

export function writeSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: S.money,
      mission: S.mission,
      x: S.player ? S.player.x : 1000,
      y: S.player ? S.player.y : 420,
    }));
    return true;
  } catch (e) {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.mission !== 'number') return null;
    return d;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return readSave() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
