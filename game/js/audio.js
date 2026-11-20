// Procedural sound effects with WebAudio. No audio files, no network.
// Everything is synthesized: oscillators for tones, filtered noise for impacts.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.sirenOn = false;
    this.sirenNodes = null;
    this.engineNodes = null;
    this.muted = false;
  }

  // Must be called from a user gesture (start button) so the context may start.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // Shared white-noise buffer for percussive sounds.
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, type) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  shot() {
    this._noise(0.09, 0.5, 2800, 'highpass');
    this._tone(160, 0.08, 'square', 0.18, 60);
  }

  enemyShot() {
    this._noise(0.07, 0.25, 2200, 'highpass');
  }

  punch() {
    this._noise(0.08, 0.35, 500);
    this._tone(90, 0.07, 'sine', 0.25, 50);
  }

  explosion() {
    this._noise(0.7, 0.6, 400);
    this._tone(70, 0.6, 'sine', 0.4, 30);
  }

  pickup() {
    this._tone(660, 0.09, 'sine', 0.22);
    this._tone(990, 0.12, 'sine', 0.18);
  }

  coin() {
    this._tone(880, 0.07, 'triangle', 0.2);
    this._tone(1320, 0.14, 'triangle', 0.16);
  }

  click() {
    this._tone(440, 0.05, 'square', 0.12);
  }

  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.22, 'triangle', 0.22), i * 90);
    });
  }

  busted() {
    this._tone(220, 0.5, 'sawtooth', 0.2, 110);
  }

  // Two-tone police siren loop; call with true/false. Quiet so it never dominates.
  siren(on) {
    if (!this.ctx || on === this.sirenOn) return;
    this.sirenOn = on;
    if (!on) {
      if (this.sirenNodes) {
        try { this.sirenNodes.osc.stop(); } catch (e) {}
        this.sirenNodes = null;
      }
      return;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    gain.gain.value = 0.045;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.7;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.sirenNodes = { osc, lfo };
  }

  // Engine hum that follows the driven car's speed (0..1). Call every frame.
  engine(level) {
    if (!this.ctx) return;
    if (level <= 0.02) {
      if (this.engineNodes) {
        try { this.engineNodes.osc.stop(); } catch (e) {}
        this.engineNodes = null;
      }
      return;
    }
    if (!this.engineNodes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      gain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.engineNodes = { osc, gain };
    }
    const n = this.engineNodes;
    n.osc.frequency.setTargetAtTime(55 + level * 130, this.ctx.currentTime, 0.08);
    n.gain.gain.setTargetAtTime(0.02 + level * 0.05, this.ctx.currentTime, 0.1);
  }
}
