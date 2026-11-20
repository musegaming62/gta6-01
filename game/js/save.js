// Save and continue via localStorage. Stores money, completed missions, the
// current mission and stage, and the player's position.
const KEY = 'solmar-save-v1';

export function createSave() {
  return {
    save(G) {
      try {
        const data = {
          money: Math.floor(G.player.money),
          health: Math.round(G.player.health),
          ammo: G.player.ammo,
          x: Math.round(G.player.x),
          y: Math.round(G.player.y),
          mission: G.missions.index,
          stage: G.missions.stage,
          done: G.missions.done,
        };
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {
        // Storage may be unavailable (private mode); the game still plays.
      }
    },

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (typeof data !== 'object' || data === null) return null;
        return data;
      } catch (e) {
        return null;
      }
    },

    hasSave() {
      try {
        return localStorage.getItem(KEY) !== null;
      } catch (e) {
        return false;
      }
    },

    clear() {
      try {
        localStorage.removeItem(KEY);
      } catch (e) {}
    },
  };
}
