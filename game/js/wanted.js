// Solmar — the wanted system: crimes raise the heat, the police respond, and the heat
// only cools when the law loses sight of you.
import { G } from './state.js';
import { dist, clamp } from './utils.js';
import { spawnPoliceCar } from './cars.js';
import { scarePeds } from './peds.js';
import { sfxSirenBlip, sfxBusted } from './audio.js';

export function addWanted(stars, reason) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + stars, 0, 5);
  G.wantedTimer = 0;
  if (G.wanted > before) {
    showToast(reason + ' — wanted level ' + G.wanted, 2600);
    if (G.wanted >= 1) sfxSirenBlip();
  }
}

export function setWanted(stars, reason) {
  G.wanted = clamp(stars, 0, 5);
  G.wantedTimer = 0;
  if (reason) showToast(reason + ' — wanted level ' + G.wanted, 2600);
}

export function showToast(text, ms) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.style.opacity = '0'; }, ms || 2200);
}

// Police count the heat calls for: 1 star = 1 car, up to 4 cars at 5 stars.
function policeTarget() {
  return G.wanted === 0 ? 0 : G.wanted >= 4 ? 4 : G.wanted >= 2 ? 3 : G.wanted;
}

export function updateWanted(dt) {
  const p = G.player;
  if (!p) return;

  // Wanted cools off when no police car is near and no crime just happened.
  const police = G.cars.filter((c) => c.kind === 'police' && !c.wreck);
  const nearest = police.length ? Math.min(...police.map((c) => dist(c.x, c.y, p.x, p.y))) : Infinity;
  if (G.wanted > 0) {
    G.wantedTimer += dt;
    const coolAfter = G.wanted >= 3 ? 26 : 18;
    if (nearest > 700 && G.wantedTimer > coolAfter) {
      G.wanted--;
      G.wantedTimer = 0;
      showToast('The heat is cooling off… wanted level ' + G.wanted, 2000);
    }
  }

  // Spawn police to match the heat.
  const target = policeTarget();
  if (police.length < target && Math.random() < dt * 0.9) {
    const car = spawnPoliceCar();
    if (car) G.cars.push(car);
  }
  // No heat, no police: the extra cars drive off.
  if (G.wanted === 0) {
    for (let i = G.cars.length - 1; i >= 0; i--) {
      const c = G.cars[i];
      if (c.kind === 'police' && dist(c.x, c.y, p.x, p.y) > 900) G.cars.splice(i, 1);
    }
  }

  // Busted: a cop on foot touches the player while wanted, or a police car pins the
  // player on foot for a while.
  if (G.wanted > 0 && !p.car) {
    let touching = false;
    for (const c of police) {
      if (dist(c.x, c.y, p.x, p.y) < 34) { touching = true; break; }
    }
    for (const n of G.npcs) {
      if (n.kind === 'cop' && n.health > 0 && dist(n.x, n.y, p.x, p.y) < 20) { touching = true; break; }
    }
    if (touching) {
      G.bustedTimer += dt;
      if (G.bustedTimer > 1.6) {
        G.mode = 'busted';
        G.endReason = 'Busted by the Solmar PD. Bail cost you $200 — and the job is blown.';
        G.money = Math.max(0, G.money - 200);
        sfxBusted();
      }
    } else {
      G.bustedTimer = Math.max(0, G.bustedTimer - dt * 2);
    }
  } else {
    G.bustedTimer = 0;
  }

  // Foot cops get out of police cars that catch up to a player on foot.
  if (G.wanted >= 2 && !p.car) {
    for (const c of police) {
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < 120 && d > 40 && Math.random() < dt * 0.25) {
        const cops = G.npcs.filter((n) => n.kind === 'cop').length;
        if (cops < 3) {
          G.npcs.push({
            kind: 'cop', x: c.x + 24, y: c.y, angle: 0, speed: 165,
            health: 60, shirt: '#1d3557', pants: '#1d3557', skin: '#e0ac69',
            state: 'chase', targetX: p.x, targetY: p.y, shootTimer: 0,
          });
          scarePeds(c.x, c.y, 120);
        }
      }
    }
  }
}

export function anyPoliceNear(radius) {
  const p = G.player;
  if (!p) return false;
  return G.cars.some((c) => c.kind === 'police' && !c.wreck && dist(c.x, c.y, p.x, p.y) < radius);
}
