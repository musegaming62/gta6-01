// Solmar — keyboard and mouse input, kept in one place.
import { G } from './state.js';

export function initInput(canvas, onKey) {
  const keys = G.keys;
  const norm = (e) => e.key.toLowerCase();

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    if (!keys[norm(e)]) onKey(norm(e), true);
    keys[norm(e)] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[norm(e)] = false;
    onKey(norm(e), false);
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    G.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    G.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) G.mouse.down = true;
  });
  window.addEventListener('mouseup', () => { G.mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function axis() {
  // Returns {x, y} in -1..1 from WASD / arrows.
  const k = G.keys;
  const x = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
  const y = (k['s'] || k['arrowdown'] ? 1 : 0) - (k['w'] || k['arrowup'] ? 1 : 0);
  return { x, y };
}
