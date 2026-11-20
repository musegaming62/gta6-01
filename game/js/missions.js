// The five-mission story for Solmar. Mara the fixer sends Danny Voss out to pay
// off a debt, one job at a time. Each mission has stages, a map marker, a timer
// where it matters, and a payout on completion.

import { dist } from './util.js';
import { spawnCar } from './cars.js';
import { spawnPed } from './peds.js';
import { addWanted } from './police.js';
import { spawnText } from './particles.js';
import { playJingle } from './audio.js';

export const MISSIONS = [
  { name: 'Hot Wheels', briefing: 'Mara: Steal that red sports car and bring it to the chop shop. No questions.', reward: 500 },
  { name: 'The Pickup', briefing: 'Mara: Grab the package downtown, then drop it at the port. Keep it quiet.', reward: 400 },
  { name: 'Getaway Driver', briefing: 'Mara: The heat is on. Reach the safehouse before the clock runs out.', reward: 800 },
  { name: 'Payback', briefing: 'Mara: The Vultures jumped one of ours. Go to their turf and finish all four.', reward: 1200 },
  { name: 'The Big Score', briefing: 'Mara: Rob Solmar National Bank, then get to the harbour boat. This clears the debt.', reward: 5000 },
];

export function startMission(state, index) {
  const m = state.mission;
  m.index = index;
  m.stage = 0;
  m.timer = 0;
  m.done = false;
  m.gangLeft = 0;
  const L = state.city.landmarks;
  if (index === 0) {
    m.target = { x: state.city.missionCar.x, y: state.city.missionCar.y };
    m.hint = 'Steal the red sports car';
    // The mission sports car, parked by the start.
    spawnCar(state, 'sports', state.city.missionCar.x, state.city.missionCar.y, -Math.PI / 2, { color: '#d43a2f', parked: true, driver: false, missionCar: true });
  } else if (index === 1) {
    m.target = { x: L.pickupA.x, y: L.pickupA.y };
    m.hint = 'Pick up the package downtown';
  } else if (index === 2) {
    m.timer = 75;
    m.target = { x: L.safehouse.x, y: L.safehouse.y };
    m.hint = 'Reach the safehouse in time';
    addWanted(state, 2);
  } else if (index === 3) {
    m.target = { x: L.turf.x, y: L.turf.y };
    m.hint = 'Defeat the four Vultures';
    m.gangLeft = 4;
    for (let i = 0; i < 4; i++) {
      spawnPed(state, L.turf.x + (i % 2) * 70 - 35, L.turf.y + Math.floor(i / 2) * 70 - 35, { gang: true });
    }
  } else if (index === 4) {
    m.target = { x: L.bank.x, y: L.bank.y };
    m.hint = 'Walk into Solmar National Bank';
  }
  state.objective = MISSIONS[index].briefing;
}

function completeMission(state) {
  const m = state.mission;
  const def = MISSIONS[m.index];
  state.money += def.reward;
  spawnText(state, state.player.x, state.player.y - 30, '+$' + def.reward, '#ffd94a');
  playJingle();
  state.objective = def.name + ' complete! +$' + def.reward;
  m.done = true;
  if (state.save) state.save();
}

function nextMission(state) {
  if (state.mode !== 'playing') return;
  const next = state.mission.index + 1;
  if (next >= MISSIONS.length) {
    state.mode = 'win';
    return;
  }
  startMission(state, next);
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (m.index < 0 || m.done) return;
  const p = state.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  // Mission 3 timer.
  if (m.index === 2) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'Out of time. Mara is not happy.');
      return;
    }
  }
  const L = state.city.landmarks;
  if (m.index === 0) {
    if (m.stage === 0) {
      // Stage 0: get in the mission sports car.
      if (p.inCar && p.inCar.missionCar) {
        m.stage = 1;
        m.target = { x: L.chopShop.x, y: L.chopShop.y };
        m.hint = 'Deliver the sports car to the chop shop';
        state.objective = 'Deliver the car to the chop shop';
      }
    } else if (dist(px, py, L.chopShop.x, L.chopShop.y) < 90) {
      completeMission(state);
      setTimeout(() => nextMission(state), 1200);
    }
  } else if (m.index === 1) {
    if (m.stage === 0) {
      if (!p.inCar && dist(p.x, p.y, L.pickupA.x, L.pickupA.y) < 42) {
        m.stage = 1;
        m.target = { x: L.pickupB.x, y: L.pickupB.y };
        m.hint = 'Deliver the package to the port';
        state.objective = 'Deliver the package to the port';
      }
    } else if (dist(px, py, L.pickupB.x, L.pickupB.y) < 70) {
      completeMission(state);
      setTimeout(() => nextMission(state), 1200);
    }
  } else if (m.index === 2) {
    if (dist(px, py, L.safehouse.x, L.safehouse.y) < 80) {
      completeMission(state);
      setTimeout(() => nextMission(state), 1200);
    }
  } else if (m.index === 3) {
    let left = 0;
    for (const ped of state.peds) if (ped.gang && !ped.dead) left++;
    m.gangLeft = left;
    m.hint = 'Vultures left: ' + left;
    if (left === 0) {
      completeMission(state);
      setTimeout(() => nextMission(state), 1200);
    }
  } else if (m.index === 4) {
    if (m.stage === 0) {
      if (!p.inCar && dist(p.x, p.y, L.bank.x, L.bank.y) < 80) {
        m.stage = 1;
        m.timer = 20;
        m.target = { x: L.boat.x, y: L.boat.y };
        m.hint = 'Hold up! Get to the harbour boat';
        state.objective = 'The vault is open — escape to the harbour boat!';
        addWanted(state, 4);
      }
    } else {
      m.timer -= dt;
      if (dist(px, py, L.boat.x, L.boat.y) < 90) {
        completeMission(state);
        state.mode = 'win';
      } else if (m.timer <= 0) {
        failMission(state, 'The police locked the bank down. Run!');
        m.stage = 0;
        m.target = { x: L.bank.x, y: L.bank.y };
        m.hint = 'Walk into Solmar National Bank';
      }
    }
  }
}

function failMission(state, message) {
  state.objective = message;
  state.mission.done = false;
  // Restart the current mission from its start.
  const idx = state.mission.index;
  setTimeout(() => {
    if (state.mode === 'playing') startMission(state, idx);
  }, 1500);
}

// The current objective marker, for the HUD and the minimap.
export function missionMarker(state) {
  const m = state.mission;
  if (m.index < 0 || m.done || !m.target) return null;
  return m.target;
}
