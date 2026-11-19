// Solmar — every sound is synthesized with WebAudio. No audio files, no network.
import { G } from './state.js';

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let musicTimer = null;
let sirenTimer = null;
let sirenHigh = false;
let musicStep = 0;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Engine hum: two detuned saws through a lowpass, pitch follows speed.
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  const engineOsc2 = ctx.createOscillator();
  engineOsc2.type = 'square';
  engineOsc2.frequency.value = 28;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 420;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
  engineOsc2.start();
  engineOsc._sub = engineOsc2;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  G.muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function noiseBuffer(seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || G.muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx || G.muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq || 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

export function sfxShoot() { noiseBurst(0.12, 0.5, 2400); blip(220, 0.08, 'square', 0.18, 60); }
export function sfxEnemyShoot() { noiseBurst(0.1, 0.3, 1800); }
export function sfxPunch() { noiseBurst(0.08, 0.35, 700); }
export function sfxHit() { blip(140, 0.1, 'square', 0.2, 70); }
export function sfxPickup() { blip(660, 0.09, 'sine', 0.25); setTimeout(() => blip(990, 0.12, 'sine', 0.25), 70); }
export function sfxCash() { blip(880, 0.08, 'triangle', 0.22); setTimeout(() => blip(1320, 0.14, 'triangle', 0.22), 80); }
export function sfxCrash() { noiseBurst(0.25, 0.5, 500); }
export function sfxExplosion() { noiseBurst(0.7, 0.7, 400); blip(90, 0.5, 'sine', 0.5, 30); }
export function sfxSirenBlip() { blip(950, 0.15, 'square', 0.12, 700); }
export function sfxMissionDone() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.28), i * 110));
}
export function sfxBusted() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.2), i * 160)); }
export function sfxPhone() { blip(1200, 0.1, 'sine', 0.2); setTimeout(() => blip(1200, 0.1, 'sine', 0.2), 180); }

// Engine hum follows the driven car's speed (0..1).
export function updateEngine(speedNorm, driving) {
  if (!ctx || !engineOsc) return;
  const target = driving && !G.muted ? 0.05 + speedNorm * 0.1 : 0;
  engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
  const f = 50 + speedNorm * 130;
  engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
  if (engineOsc._sub) engineOsc2Set(engineOsc._sub, f / 2);
  engineFilter.frequency.setTargetAtTime(320 + speedNorm * 900, ctx.currentTime, 0.1);
}
function engineOsc2Set(osc, f) { osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08); }

// Two-tone police siren while any police car is near.
export function updateSiren(near) {
  if (!ctx) return;
  if (near && !G.muted && !sirenTimer) {
    sirenTimer = setInterval(() => {
      sirenHigh = !sirenHigh;
      blip(sirenHigh ? 880 : 660, 0.32, 'square', 0.05);
    }, 340);
  } else if (!near && sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
}

// A lazy sun-soaked groove: bass line + hats, scheduled in 8th notes at 96 BPM.
const BASS = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 73.4, 0, 65.4, 0];
export function startMusic() {
  if (!ctx || musicTimer) return;
  musicTimer = setInterval(() => {
    if (G.muted || !G.musicOn || G.mode !== 'playing') return;
    const f = BASS[musicStep % BASS.length];
    if (f) blip(f, 0.22, 'sine', 0.16);
    if (musicStep % 2 === 0) noiseBurst(0.03, 0.05, 6000);
    musicStep++;
  }, 312);
}
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
