// Solmar — the story and the five missions. Mara, a fixer, hands Danny
// Voss jobs to pay off a debt. Each mission has stages, an objective marker
// on the map and minimap, a briefing line, and a cash reward.

import { S } from './state.js';
import { dist, clamp } from './util.js';
import { makeCar, nearestCar } from './cars.js';
import { spawnGang, nearestPed } from './peds.js';
import { setWanted, addWanted } from './police.js';
import { floatText, burst } from './particles.js';
import { sfxMission, sfxFail, sfxCash } from './audio.js';
import { spawnPickup } from './player.js';

export const MISSIONS = [
  { name: 'Hot Wheels', brief: 'Mara: "Steal a sports car and bring it to the chop shop. Quick and clean."', reward: 500 },
  { name: 'The Pickup', brief: 'Mara: "Grab the package downtown, then run it to the port. No cops, no problems."', reward: 750 },
  { name: 'Getaway Driver', brief: 'Mara: "The heat is on you already. Lose them and reach the safehouse in time."', reward: 1000 },
  { name: 'Payback', brief: 'Mara: "The Vultures jumped one of ours. Go to their turf and settle it."', reward: 1500 },
  { name: 'The Big Score', brief: 'Mara: "The National Bank. Five seconds inside, then run for the boat. This clears your debt."', reward: 5000 },
];

let missionCar = null;
let gang = [];

export function missionObjective() {
  const L = S.world.landmarks;
  const m = S.mission;
  if (m === 0) {
    if (S.missionStage === 0) return missionCar ? { x: missionCar.x, y: missionCar.y, label: 'Steal the sports car' } : null;
    return { x: L.chop.x, y: L.chop.y, label: 'Deliver to the Chop Shop' };
  }
  if (m === 1) {
    if (S.missionStage === 0) return { x: L.pickup.x, y: L.pickup.y, label: 'Pick up the package' };
    return { x: L.dock.x, y: L.dock.y, label: 'Deliver to the Port' };
  }
  if (m === 2) return { x: L.safe.x, y: L.safe.y, label: 'Reach the Safehouse' };
  if (m === 3) return { x: L.turf.x, y: L.turf.y, label: 'Defeat the Vultures' };
  if (m === 4) {
    if (S.missionStage === 0) return { x: L.bank.x, y: L.bank.y, label: 'Enter the Bank' };
    if (S.missionStage === 1) return { x: L.bank.x, y: L.bank.y, label: 'Hold up in progress…' };
    return { x: L.boat.x, y: L.boat.y, label: 'Escape to the Boat' };
  }
  return null;
}

export function startMission(i) {
  S.mission = i;
  S.missionStage = 0;
  S.missionTimer = 0;
  S.holdup = 0;
  missionCar = null;
  gang = [];
  const M = MISSIONS[i];
  S.missionMsg = M.brief;
  S.banner = 'MISSION ' + (i + 1) + ' — ' + M.name.toUpperCase();
  S.bannerT = 3.2;
  sfxMission();
  const L = S.world.landmarks;
  const p = S.player;
  if (i === 0) {
    // A sports car waits two blocks from the player's start.
    missionCar = makeCar('sport', 1020, 260, 0);
    S.cars.push(missionCar);
    spawnPickup(980, 300, 'ammo');
  } else if (i === 2) {
    S.missionTimer = 75;
    setWanted(2);
  } else if (i === 3) {
    gang = spawnGang(4, L.turf.x, L.turf.y);
  } else if (i === 4) {
    setWanted(0);
  }
}

function completeMission() {
  const M = MISSIONS[S.mission];
  S.money += M.reward;
  S.stats.missionsDone++;
  floatText(S.player.x, S.player.y - 26, '+$' + M.reward, '#7be07b');
  burst(S.player.x, S.player.y, 18, '#ffd34d', 200, 0.7, 3);
  sfxCash();
  sfxMission();
  S.banner = 'MISSION COMPLETE — +$' + M.reward;
  S.bannerT = 3;
  // Save progress.
  try {
    localStorage.setItem('solmar-save-v1', JSON.stringify({
      money: S.money, mission: Math.min(S.mission + 1, MISSIONS.length - 1),
      x: S.player.x, y: S.player.y,
    }));
  } catch (e) { /* storage unavailable */ }
  if (S.mission >= MISSIONS.length - 1) {
    S.mode = 'win';
    return;
  }
  startMission(S.mission + 1);
}

export function failMission(reason) {
  S.mode = 'failed';
  S.failedReason = reason || 'failed';
  sfxFail();
}

export function updateMissions(dt) {
  const p = S.player;
  if (!p || S.mode !== 'playing') return;
  const L = S.world.landmarks;
  const obj = missionObjective();
  if (S.missionTimer > 0) {
    S.missionTimer -= dt;
    if (S.missionTimer <= 0) {
      S.missionTimer = 0;
      failMission('time');
      return;
    }
  }
  const m = S.mission;
  if (m === 0) {
    if (S.missionStage === 0) {
      if (p.inCar === missionCar) {
        S.missionStage = 1;
        S.missionMsg = 'Mara: "Nice wheels. Now bring it to the chop shop in Portside."';
      }
    } else if (p.inCar === missionCar && dist(p.x, p.y, L.chop.x, L.chop.y) < 70) {
      completeMission();
    }
  } else if (m === 1) {
    if (S.missionStage === 0) {
      if (!p.inCar && dist(p.x, p.y, L.pickup.x, L.pickup.y) < 40) {
        S.missionStage = 1;
        S.missionMsg = 'Mara: "Package secured. Now the port — and keep it quiet."';
        floatText(p.x, p.y - 20, 'PACKAGE', '#ffd34d');
      }
    } else if (dist(p.x, p.y, L.dock.x, L.dock.y) < 70) {
      completeMission();
    }
  } else if (m === 2) {
    if (dist(p.x, p.y, L.safe.x, L.safe.y) < 70) {
      setWanted(0);
      completeMission();
    }
  } else if (m === 3) {
    const alive = gang.filter((g) => g.state !== 'down').length;
    if (alive === 0 && gang.length > 0) {
      completeMission();
    }
  } else if (m === 4) {
    if (S.missionStage === 0) {
      if (!p.inCar && dist(p.x, p.y, L.bank.x, L.bank.y) < 60) {
        S.missionStage = 1;
        S.missionMsg = 'Mara: "Stay inside the bank. Five seconds. The cops are coming."';
        setWanted(4);
      }
    } else if (S.missionStage === 1) {
      if (dist(p.x, p.y, L.bank.x, L.bank.y) < 80) {
        S.holdup += dt;
        if (S.holdup >= 5) {
          S.missionStage = 2;
          S.missionMsg = 'Mara: "Got it! Now RUN to the boat at the harbour!"';
          spawnPickup(L.bank.x, L.bank.y + 60, 'cash', 0);
        }
      } else {
        S.holdup = Math.max(0, S.holdup - dt * 2);
      }
    } else if (dist(p.x, p.y, L.boat.x, L.boat.y) < 70) {
      completeMission();
    }
  }
  // Mission marker ring pulse is drawn by main.js from missionObjective().
}

export function retryMission() {
  const p = S.player;
  p.hp = p.maxHp;
  p.inCar = null;
  // Put the player back near the current mission's start point.
  const L = S.world.landmarks;
  const starts = [
    { x: 1000, y: 420 },
    { x: 1400, y: 420 },
    { x: 600, y: 1400 },
    { x: 2600, y: 2600 },
    { x: 1800, y: 300 },
  ];
  const s = starts[S.mission] || starts[0];
  p.x = s.x;
  p.y = s.y;
  p.vx = 0; p.vy = 0;
  setWanted(S.mission === 2 ? 2 : 0);
  startMission(S.mission);
  S.mode = 'playing';
}
