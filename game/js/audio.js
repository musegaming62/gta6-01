// Procedural WebAudio sounds for Solmar. No audio files, no dependencies.
// Every function is a no-op until initAudio() runs on a user gesture.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenLfo = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    // Looping engine hum, quiet until the player drives.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // Two-tone police siren, quiet until wanted.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
  } catch (e) {
    ctx = null;
  }
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function noiseBurst(dur, vol, cutoff) {
  if (!ctx) return;
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  } catch (e) { /* ignore */ }
}

export function playShot() {
  noiseBurst(0.12, 0.5, 2600);
  blip(160, 0.08, 'square', 0.18, 60);
}

export function playPunch() {
  noiseBurst(0.09, 0.4, 500);
  blip(90, 0.1, 'sine', 0.3, 45);
}

export function playExplosion() {
  noiseBurst(0.7, 0.8, 900);
  blip(70, 0.6, 'sine', 0.5, 28);
}

export function playPickup() {
  blip(660, 0.09, 'sine', 0.3);
  setTimeout(() => blip(990, 0.12, 'sine', 0.3), 70);
}

export function playJingle() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => setTimeout(() => blip(n, 0.16, 'triangle', 0.3), i * 110));
}

export function playClick() {
  blip(440, 0.05, 'square', 0.15);
}

export function playBusted() {
  blip(330, 0.25, 'sawtooth', 0.25, 110);
  setTimeout(() => blip(220, 0.4, 'sawtooth', 0.25, 80), 220);
}

export function setEngine(speed01) {
  if (!ctx || !engineOsc) return;
  try {
    engineOsc.frequency.value = 50 + speed01 * 130;
    engineGain.gain.value = speed01 > 0.05 ? 0.05 + speed01 * 0.06 : 0;
  } catch (e) { /* ignore */ }
}

export function setSiren(on) {
  if (!ctx || !sirenGain) return;
  try {
    sirenGain.gain.value = on ? 0.045 : 0;
  } catch (e) { /* ignore */ }
}
