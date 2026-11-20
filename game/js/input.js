// Keyboard and mouse input for Solmar. No dependencies.
// `down` tracks held keys; `pressed` tracks keys pressed since the last frame and is
// cleared by endFrame(), so a single press (e.g. P to pause) never fires twice.

export function createInput() {
  return {
    down: new Set(),
    pressed: new Set(),
    mouse: { x: 0, y: 0, down: false, pressed: false },
    locked: false,
  };
}

export function attachInput(input, canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.down.add(e.code);
    input.pressed.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    input.down.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.down.clear();
    input.mouse.down = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - r.left;
    input.mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouse.down = true;
      input.mouse.pressed = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function isDown(input, ...codes) {
  for (const c of codes) if (input.down.has(c)) return true;
  return false;
}

export function wasPressed(input, ...codes) {
  for (const c of codes) if (input.pressed.has(c)) return true;
  return false;
}

// Call once per frame after the update step, so edge presses are consumed.
export function endFrame(input) {
  input.pressed.clear();
  input.mouse.pressed = false;
}
