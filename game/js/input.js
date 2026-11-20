// Solmar — keyboard and mouse input. Tracks held keys, pressed-this-frame
// edges, and the mouse position in screen space. main.js converts the mouse
// to world space with the camera.

export const keys = {};
export const pressed = {};
export const mouse = { x: 0, y: 0, down: false, clicked: false };

const ALIASES = {
  ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD',
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const code = ALIASES[e.code] || e.code;
    if (!keys[code]) pressed[code] = true;
    keys[code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const code = ALIASES[e.code] || e.code;
    keys[code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function endFrame() {
  for (const k in pressed) pressed[k] = false;
  mouse.clicked = false;
}

export function isDown(code) { return !!keys[code]; }
export function wasPressed(code) { return !!pressed[code]; }
export function consumePress(code) { pressed[code] = false; }
export function axis() {
  let x = 0, y = 0;
  if (keys.KeyA) x -= 1;
  if (keys.KeyD) x += 1;
  if (keys.KeyW) y -= 1;
  if (keys.KeyS) y += 1;
  return { x, y };
}
