// Solmar — the story: five jobs from Mara the fixer, each a chain of objectives with a
// marker, a payout, and a phone call. Missions drive the game's progression and its save.
import { G } from './state.js';
import { PLACES } from './city.js';
import { dist, angleTo, clamp } from './utils.js';
import { addWanted, setWanted, showToast } from './wanted.js';
import { fireBullet } from './combat.js';
import { sfxMissionDone, sfxPhone, sfxCash, sfxEnemyShoot } from './audio.js';

export const MISSIONS = [
  {
    name: 'Hot Wheels',
    caller: 'MARA — THE RUSTY ANCHOR',
    briefing: 'First job, Danny. Steal any car off the street and bring it to Big Ray\'s chop shop. Don\'t bring the cops with you.',
    reward: 500,
    steps: [
      { type: 'enter_car', text: 'Steal a car (walk up to one and press E)' },
      { type: 'go', place: 'chopshop', text: 'Deliver the car to Big Ray\'s Chop Shop' },
    ],
  },
  {
    name: 'The Pickup',
    caller: 'MARA — THE RUSTY ANCHOR',
    briefing: 'A crate came in at the docks and it does not belong to the Vultures. Grab it and bring it to my bar. Quietly.',
    reward: 800,
    steps: [
      { type: 'go', place: 'docks', text: 'Pick up the crate at the Solmar Docks' },
      { type: 'go', place: 'bar', text: 'Bring the crate to the Rusty Anchor' },
    ],
  },
  {
    name: 'Getaway Driver',
    caller: 'MARA — THE RUSTY ANCHOR',
    briefing: 'Rico is hiding at the Palm Court Motel and the PD just got his name. Pick him up, lose the heat, and get him to the safehouse.',
    reward: 1200,
    steps: [
      { type: 'go', place: 'motel', text: 'Pick up Rico at the Palm Court Motel' },
      { type: 'escape', text: 'Lose the police — get your wanted level to zero' },
      { type: 'go', place: 'safehouse', text: 'Get Rico to the Safehouse' },
    ],
  },
  {
    name: 'Payback',
    caller: 'MARA — THE RUSTY ANCHOR',
    briefing: 'The Vultures hit our warehouse and took our guns. Go to their warehouse and deal with all four of them. Bring a gun.',
    reward: 1500,
    steps: [
      { type: 'go', place: 'warehouse', text: 'Reach the Vulture Warehouse' },
      { type: 'kill', count: 4, text: 'Take out all four Vultures' },
    ],
  },
  {
    name: 'The Big Score',
    caller: 'MARA — THE RUSTY ANCHOR',
    briefing: 'The bank. Grab the cash, then get to the boat at the harbour. This clears your debt, Danny — if you make it out.',
    reward: 5000,
    steps: [
      { type: 'go', place: 'bank', text: 'Get inside the Solmar National Bank' },
      { type: 'go', place: 'boat', text: 'Escape to the boat at the Harbour' },
    ],
  },
];

let phoneTimer = -1;

export function startMission(i) {
  const def = MISSIONS[i];
  if (!def) return;
  G.mission = { def, index: i, step: 0, spawned: false, ricoInCar: false, kills: 0 };
  G.missionIndex = i;
  updateMarker();
  ringPhone(def);
}

export function ringPhone(def) {
  sfxPhone();
  const el = document.getElementById('phone');
  const name = document.getElementById('phone-name');
  const text = document.getElementById('phone-text');
  if (!el || !name || !text) return;
  name.textContent = def.caller + ' — ' + def.name.toUpperCase();
  text.textContent = def.briefing;
  el.classList.remove('hidden');
  phoneTimer = 0;
}

export function dismissPhone() {
  const el = document.getElementById('phone');
  if (el) el.classList.add('hidden');
}

export function currentStep() {
  if (!G.mission) return null;
  return G.mission.def.steps[G.mission.step] || null;
}

export function objectiveText() {
  if (!G.mission) return { title: 'FREE ROAM', text: 'Solmar is yours. Cause trouble, or wait for Mara to call.', dist: '' };
  const step = currentStep();
  const p = G.player;
  let d = '';
  const m = markerPos();
  if (m && p) d = Math.round(dist(p.x, p.y, m.x, m.y)) + ' m away';
  return { title: 'MISSION ' + (G.mission.index + 1) + ' — ' + G.mission.def.name.toUpperCase(), text: step ? step.text : '', dist: d };
}

export function markerPos() {
  if (!G.mission) return null;
  const step = currentStep();
  if (!step) return null;
  if (step.type === 'go' && step.place) {
    const pl = PLACES[step.place];
    return { x: pl.x, y: pl.y, label: pl.name };
  }
  if (step.type === 'kill') {
    const pl = PLACES.warehouse;
    return { x: pl.x, y: pl.y, label: pl.name };
  }
  return null;
}

function updateMarker() {
  const m = markerPos();
  G.markers = m ? [{ x: m.x, y: m.y, label: m.label }] : [];
}

function completeStep() {
  const m = G.mission;
  m.step++;
  updateMarker();
  if (m.step >= m.def.steps.length) completeMission();
}

function completeMission() {
  const m = G.mission;
  G.money += m.def.reward;
  G.missionDone[m.index] = true;
  G.stats.missions++;
  sfxMissionDone();
  showToast('Mission complete — ' + m.def.name + ' — +' + '$' + m.def.reward.toLocaleString('en-US'), 3200);
  G.mission = null;
  G.markers = [];
  G.missionIndex = m.index + 1;
  if (typeof window !== 'undefined' && window.__solmarSave) window.__solmarSave();
  if (m.index + 1 < MISSIONS.length) {
    phoneTimer = 2.5;
    G._nextMission = m.index + 1;
  } else {
    G.mode = 'done';
    G.endReason = 'The Big Score is yours. Solmar is yours. Danny Voss is free.';
  }
}

export function restartMission() {
  const i = G.mission ? G.mission.index : G.missionIndex;
  if (i >= MISSIONS.length) return;
  // Clear mission NPCs and heat, put the player back at the bar.
  G.npcs = G.npcs.filter((n) => n.kind !== 'gang' && n.kind !== 'cop' && n.kind !== 'rico');
  setWanted(0);
  G.health = 100;
  const bar = PLACES.bar;
  if (G.player) {
    if (G.player.car) { G.player.car.kind = 'parked'; G.player.car = null; }
    G.player.x = bar.x + 60; G.player.y = bar.y + 40;
  }
  startMission(i);
  showToast('Mission restarted — ' + MISSIONS[i].name, 2000);
}

function spawnGang() {
  const wh = PLACES.warehouse;
  const spots = [
    { x: wh.x - 60, y: wh.y - 40 }, { x: wh.x + 60, y: wh.y - 50 },
    { x: wh.x - 40, y: wh.y + 60 }, { x: wh.x + 70, y: wh.y + 40 },
  ];
  for (const s of spots) {
    G.npcs.push({
      kind: 'gang', x: s.x, y: s.y, angle: 0, speed: 130,
      health: 100, shirt: '#3a3a3a', pants: '#2b2d42', skin: '#c68642',
      state: 'guard', targetX: s.x, targetY: s.y, shootTimer: 1 + Math.random(),
    });
  }
}

function spawnRico() {
  const mo = PLACES.motel;
  G.npcs.push({
    kind: 'rico', x: mo.x + 40, y: mo.y + 20, angle: 0, speed: 150,
    health: 100, shirt: '#f2cc8f', pants: '#2b2d42', skin: '#e0ac69',
    state: 'wait', targetX: mo.x + 40, targetY: mo.y + 20, shootTimer: 0,
  });
}

export function updateMission(dt) {
  if (phoneTimer > 0) {
    phoneTimer -= dt;
    if (phoneTimer <= 0 && G._nextMission !== undefined) {
      const i = G._nextMission;
      G._nextMission = undefined;
      startMission(i);
    }
  }
  const m = G.mission;
  if (!m) return;
  const step = currentStep();
  if (!step) return;
  const p = G.player;
  if (!p) return;

  if (step.type === 'enter_car') {
    if (p.car) completeStep();
  } else if (step.type === 'go') {
    const pl = PLACES[step.place];
    if (dist(p.x, p.y, pl.x, pl.y) < 70) {
      if (step.place === 'docks') {
        sfxCash();
        showToast('Crate secured. Now get it to the Rusty Anchor.', 2400);
      }
      if (step.place === 'motel' && !m.spawned) {
        m.spawned = true;
        spawnRico();
        showToast('Rico is with you. The cops are coming — move!', 2600);
        setWanted(2, 'The PD spotted Rico');
      }
      if (step.place === 'bank') {
        sfxCash();
        G.money += 200;
        showToast('Cash grabbed! The alarm is screaming — run for the boat!', 3000);
        setWanted(3, 'Bank alarm tripped');
      }
      completeStep();
    }
  } else if (step.type === 'escape') {
    if (G.wanted === 0) completeStep();
  } else if (step.type === 'kill') {
    if (!m.spawned) {
      m.spawned = true;
      spawnGang();
      showToast('Four Vultures. No mercy.', 2200);
    }
    const left = G.npcs.filter((n) => n.kind === 'gang' && n.health > 0).length;
    m.kills = 4 - left;
    if (left === 0) completeStep();
  }

  // Rico follows the player; he gets in the car when the player does.
  const rico = G.npcs.find((n) => n.kind === 'rico');
  if (rico && m.def.name === 'Getaway Driver') {
    if (p.car && dist(rico.x, rico.y, p.x, p.y) < 130 && !m.ricoInCar) {
      m.ricoInCar = true;
      G.npcs = G.npcs.filter((n) => n !== rico);
      showToast('Rico is in the car. Now lose the heat!', 2400);
    }
  }
}

// NPC brains: cops chase and try to grab the player; gang members hold ground and shoot;
// Rico waits, then follows.
export function updateNpcs(dt) {
  const p = G.player;
  if (!p) return;
  for (let i = G.npcs.length - 1; i >= 0; i--) {
    const n = G.npcs[i];
    if (n.health <= 0) {
      if (n.kind === 'gang') { G.npcs.splice(i, 1); continue; }
      G.npcs.splice(i, 1);
      continue;
    }
    const d = dist(n.x, n.y, p.x, p.y);
    if (n.kind === 'cop') {
      n.angle = angleTo(n.x, n.y, p.x, p.y);
      if (d > 18) {
        n.x += Math.cos(n.angle) * n.speed * dt;
        n.y += Math.sin(n.angle) * n.speed * dt;
      }
    } else if (n.kind === 'gang') {
      if (d < 380) {
        n.angle = angleTo(n.x, n.y, p.x, p.y);
        n.shootTimer -= dt;
        if (n.shootTimer <= 0 && !p.car) {
          n.shootTimer = 1.1 + Math.random() * 0.7;
          const spread = (Math.random() - 0.5) * 0.35;
          fireBullet(n.x, n.y, n.angle + spread, false);
          sfxEnemyShoot();
        }
        if (d > 200) {
          n.x += Math.cos(n.angle) * n.speed * 0.5 * dt;
          n.y += Math.sin(n.angle) * n.speed * 0.5 * dt;
        }
      }
    } else if (n.kind === 'rico') {
      if (d > 60) {
        n.angle = angleTo(n.x, n.y, p.x, p.y);
        n.x += Math.cos(n.angle) * n.speed * dt;
        n.y += Math.sin(n.angle) * n.speed * dt;
      }
    }
    // Keep NPCs out of buildings.
    for (const b of G.city.buildings) {
      if (n.x > b.x && n.x < b.x + b.w && n.y > b.y && n.y < b.y + b.h) {
        n.x -= Math.cos(n.angle) * n.speed * dt;
        n.y -= Math.sin(n.angle) * n.speed * dt;
        break;
      }
    }
  }
}

export function drawNpcs(ctx) {
  for (const n of G.npcs) {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(n.angle + Math.PI / 2);
    ctx.fillStyle = n.pants;
    ctx.fillRect(-3, 2, 2.6, 8);
    ctx.fillRect(0.4, 2, 2.6, 8);
    ctx.fillStyle = n.shirt;
    ctx.fillRect(-4.5, -6, 9, 9);
    ctx.fillStyle = n.skin;
    ctx.beginPath(); ctx.arc(0, -9, 4.5, 0, Math.PI * 2); ctx.fill();
    if (n.kind === 'gang') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-5, -6, 10, 3);
      ctx.fillStyle = '#222';
      ctx.fillRect(3, -2, 10, 2.5);
    }
    if (n.kind === 'cop') {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-4.5, -6, 9, 2);
    }
    ctx.restore();
    // Health bar for gang members.
    if (n.kind === 'gang' && n.health < 100) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(n.x - 12, n.y - 22, 24, 4);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(n.x - 12, n.y - 22, 24 * clamp(n.health / 100, 0, 1), 4);
    }
  }
}
