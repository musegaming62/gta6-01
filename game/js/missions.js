// The five-mission story. Danny Voss owes money; fixer Mara hands him jobs.
// A small stage machine: each mission is a list of stages (go to a place, get in
// a car, deliver, survive a timer, defeat a set of enemies, escape), and the
// engine advances stages, pays out, and saves progress.
import { dist } from './util.js';
import { SPOTS } from './world.js';
import { makePed } from './peds.js';
import { floatText } from './particles.js';
import { addMoney } from './player.js';

export const MISSION_DEFS = [
  {
    name: 'Hot Wheels',
    reward: 500,
    briefing: 'Mara: Danny, I need a sports car. There is a red one parked downtown. Take it to the chop shop in the Foundry. Try not to get noticed.',
    stages: [
      { type: 'enterCar', label: 'Steal the red sports car downtown', target: SPOTS.sportsCar },
      { type: 'deliverCar', label: 'Deliver the sports car to the chop shop', target: SPOTS.chopShop },
    ],
  },
  {
    name: 'The Pickup',
    reward: 400,
    briefing: 'Mara: A package is waiting in Vista Hills. Pick it up on foot, then drop it in Palm Heights. No shooting unless you have to.',
    stages: [
      { type: 'pickup', label: 'Pick up the package in Vista Hills', target: SPOTS.pickupA },
      { type: 'deliver', label: 'Deliver the package to Palm Heights', target: SPOTS.pickupB },
    ],
  },
  {
    name: 'Getaway Driver',
    reward: 600,
    briefing: 'Mara: The heat is on. Lose the cops and reach the safehouse by the harbour. You have 75 seconds. Drive like you mean it.',
    timed: 75,
    startWanted: 2,
    stages: [
      { type: 'timed', label: 'Reach the safehouse before the timer runs out', target: SPOTS.safehouse },
    ],
  },
  {
    name: 'Payback',
    reward: 800,
    briefing: 'Mara: The Vultures jumped one of ours in the Foundry. Go to their turf and settle it. All four of them.',
    stages: [
      { type: 'goto', label: 'Go to the Vulture turf in the Foundry', target: SPOTS.turf },
      { type: 'kill', label: 'Defeat the Vulture gang (0 left)', target: SPOTS.turf, count: 4 },
    ],
  },
  {
    name: 'The Big Score',
    reward: 5000,
    briefing: 'Mara: This is it, Danny. Solmar National Bank. Walk in, hold the room for 20 seconds while the cops come, then run to the boat at the harbour. Do not get caught.',
    stages: [
      { type: 'holdout', label: 'Hold the bank for 20 seconds', target: SPOTS.bank, hold: 20 },
      { type: 'escape', label: 'Escape to the harbour boat', target: SPOTS.boat },
    ],
  },
];

export function createMissions() {
  return {
    index: 0, // current mission (0..4); 5 means all done
    stage: 0,
    timer: 0,
    holdTimer: 0,
    gangLeft: 0,
    gangSpawned: false,
    done: [false, false, false, false, false],
    active: false,
    car: null, // the car a deliver stage cares about
  };
}

export function currentDef(M) {
  return M.index < MISSION_DEFS.length ? MISSION_DEFS[M.index] : null;
}

export function currentStage(M) {
  const def = currentDef(M);
  if (!def) return null;
  return def.stages[M.stage] || null;
}

export function objectiveText(M) {
  const def = currentDef(M);
  if (!def) return 'All missions complete. Solmar is yours.';
  const st = currentStage(M);
  if (!st) return def.name;
  if (st.type === 'kill') return 'Defeat the Vulture gang (' + M.gangLeft + ' left)';
  return st.label;
}

export function startMission(G, index) {
  const M = G.missions;
  M.index = index;
  M.stage = 0;
  M.timer = 0;
  M.holdTimer = 0;
  M.gangLeft = 0;
  M.gangSpawned = false;
  M.car = null;
  M.active = true;
  const def = currentDef(M);
  if (!def) return;
  if (def.timed) M.timer = def.timed;
  if (def.startWanted) G.police.setWanted(G, def.startWanted);
  G.hud.showMessage(G, def.briefing, 7);
  G.save.save(G);
}

function advanceStage(G) {
  const M = G.missions;
  const def = currentDef(M);
  M.stage += 1;
  M.holdTimer = 0;
  if (M.stage >= def.stages.length) {
    completeMission(G);
  } else {
    const st = currentStage(M);
    if (st) G.hud.showMessage(G, st.label, 4);
  }
}

function completeMission(G) {
  const M = G.missions;
  const def = currentDef(M);
  M.done[M.index] = true;
  addMoney(G, def.reward, G.player.x, G.player.y - 30);
  G.audio.missionDone();
  G.hud.showBanner(G, def.name + ' complete  +$' + def.reward);
  G.save.save(G);
  M.active = false;
  const next = M.index + 1;
  if (next >= MISSION_DEFS.length) {
    // All five done: the game is won when the player reaches the boat already;
    // mission 5 ends at the boat, so winning is handled by its escape stage.
    M.index = next;
    return;
  }
  // Brief the next job after a short beat.
  setTimeout(() => {
    if (G.state !== 'playing') return;
    startMission(G, next);
  }, 2600);
}

export function onEnterCar(G, car) {
  const M = G.missions;
  if (!M.active) return;
  const st = currentStage(M);
  if (!st) return;
  if (st.type === 'enterCar' && car.missionCar) {
    M.car = car;
    advanceStage(G);
  }
}

export function onGangKilled(G, ped) {
  const M = G.missions;
  if (!M.active) return;
  const st = currentStage(M);
  if (!st || st.type !== 'kill') return;
  M.gangLeft = Math.max(0, M.gangLeft - 1);
  if (M.gangLeft <= 0) advanceStage(G);
}

function spawnGang(G) {
  const M = G.missions;
  if (M.gangSpawned) return;
  M.gangSpawned = true;
  const turf = SPOTS.turf;
  const spots = [
    { x: turf.x - 70, y: turf.y - 40 },
    { x: turf.x + 70, y: turf.y - 50 },
    { x: turf.x - 50, y: turf.y + 70 },
    { x: turf.x + 60, y: turf.y + 60 },
  ];
  for (const s of spots) {
    const g = makePed(s.x, s.y, { isGang: true, shirt: '#3a1f1f' });
    G.peds.push(g);
  }
  M.gangLeft = 4;
  G.hud.showMessage(G, 'The Vultures are here. Take them all down.', 4);
}

export function updateMissions(G, dt) {
  const M = G.missions;
  if (!M.active) return;
  const def = currentDef(M);
  if (!def) return;
  const st = currentStage(M);
  if (!st) return;
  const p = G.player;

  // Mission 3 timer.
  if (def.timed) {
    M.timer -= dt;
    if (M.timer <= 0) {
      M.timer = 0;
      G.hud.showMessage(G, 'Too slow. Mara is not happy — try again.', 4);
      G.police.clearWanted(G);
      startMission(G, M.index);
      return;
    }
  }

  const d = dist(p.x, p.y, st.target.x, st.target.y);

  if (st.type === 'goto' || st.type === 'pickup' || st.type === 'deliver' || st.type === 'timed' || st.type === 'escape') {
    if (d < 70) {
      if (st.type === 'pickup') {
        G.audio.pickup();
        floatText(G.particles, p.x, p.y - 24, 'PACKAGE SECURED', '#7dd97a');
      }
      if (st.type === 'escape') {
        // Reaching the boat ends the game in a win.
        advanceStage(G);
        if (G.state === 'playing') {
          G.state = 'win';
          G.audio.missionDone();
          G.hud.showWin(G);
        }
        return;
      }
      advanceStage(G);
    }
  } else if (st.type === 'deliverCar') {
    if (M.car && !M.car.dead && dist(M.car.x, M.car.y, st.target.x, st.target.y) < 90) {
      advanceStage(G);
    }
  } else if (st.type === 'holdout') {
    if (d < 110 && !p.inCar) {
      M.holdTimer += dt;
      if (M.holdTimer >= st.hold) {
        advanceStage(G);
      }
      // Police converge while the robbery runs.
      if (Math.random() < dt * 0.35) G.police.addWanted(G, 0.5);
    } else {
      M.holdTimer = Math.max(0, M.holdTimer - dt * 2);
    }
  } else if (st.type === 'kill') {
    if (!M.gangSpawned) spawnGang(G);
  }
  // The 'goto' stage of Payback spawns the gang when the player arrives.
  if (st.type === 'goto' && M.index === 3 && d < 120) {
    advanceStage(G);
  }
}
