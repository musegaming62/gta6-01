// localStorage saves for Solmar: money, completed missions and player position.

const KEY = 'solmar-save-v1';

export function saveGame(state) {
  try {
    const data = {
      money: state.money,
      missionIndex: state.mission.index,
      player: { x: state.player.x, y: state.player.y },
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* ignore */ }
}
