// Solmar — procedural WebAudio sound. Everything is synthesised; no audio
// files. The context is created lazily on the first user gesture (autoplay
// policy), and every effect is a short oscillator/noise burst.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenHigh = false;
let sirenT = 0;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 40;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  } catch (e) {
    ctx = null;
  }
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq || 1800;
  const g = ctx.createGain();
  g.gain.value = vol || 0.3;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

export function sfxShoot() { noiseBurst(0.12, 0.5, 2600); blip(190, 0.08, 'square', 0.18, 60); }
export function sfxEnemyShoot() { noiseBurst(0.1, 0.22, 1500); }
export function sfxPunch() { noiseBurst(0.08, 0.35, 900); }
export function sfxPickup() { blip(660, 0.09, 'sine', 0.25); blip(990, 0.12, 'sine', 0.22); }
export function sfxCash() { blip(880, 0.1, 'sine', 0.25); setTimeout(() => blip(1320, 0.16, 'sine', 0.25), 90); }
export function sfxMission() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.28), i * 110));
}
export function sfxFail() { blip(320, 0.25, 'sawtooth', 0.2, 140); }
export function sfxHurt() { blip(140, 0.15, 'sawtooth', 0.25, 70); }
export function sfxExplode() { noiseBurst(0.6, 0.6, 700); blip(90, 0.5, 'sine', 0.4, 30); }
export function sfxCarDoor() { noiseBurst(0.07, 0.25, 700); }
export function sfxClick() { blip(900, 0.05, 'square', 0.12); }

// Called every frame: engine hum follows speed, siren wails while wanted.
export function updateAudio(dt, speedNorm, wanted) {
  if (!ctx) return;
  if (engineOsc && engineGain) {
    engineOsc.frequency.value = 38 + speedNorm * 95;
    engineGain.gain.value = speedNorm > 0.02 ? 0.05 + speedNorm * 0.05 : 0;
  }
  if (sirenOsc && sirenGain) {
    if (wanted > 0) {
      sirenT += dt;
      if (sirenT > 0.45) {
        sirenT = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 920 : 640;
      }
      sirenGain.gain.value = 0.035;
    } else {
      sirenGain.gain.value = 0;
    }
  }
}

export function stopEngine() {
  if (engineGain) engineGain.gain.value = 0;
  if (sirenGain) sirenGain.gain.value = 0;
}
