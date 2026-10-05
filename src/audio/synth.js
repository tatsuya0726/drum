// Web Audio によるドラム音源 (サンプル音源なしで合成)

export class DrumSynth {
  constructor(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.drumBus = ctx.createGain();
    this.drumBus.connect(this.master);
    this.clickBus = ctx.createGain();
    this.clickBus.gain.value = 0.6;
    this.clickBus.connect(this.master);
    this.noise = this.makeNoise(2);
    this.openHat = null;
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  set volume(v) {
    this.master.gain.value = v;
  }

  set clickVolume(v) {
    this.clickBus.gain.value = v;
  }

  env(t, peak, decay, attack = 0.001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  osc(type, t, dur, f0, f1, sweep) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  chokeHat(t) {
    if (this.openHat && this.openHat.end > t) {
      const g = this.openHat.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value || 0.2, t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.02);
    }
    this.openHat = null;
  }

  hat(t, vel, decay, level) {
    const out = this.env(t, level * vel, decay);
    const src = this.noiseSrc(t, decay);
    src.connect(this.filter('highpass', 7000)).connect(this.filter('peaking', 10000, 1)).connect(out).connect(this.drumBus);
    // 金属的な成分
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const metal = this.ctx.createGain();
    metal.gain.value = 0.12;
    for (const r of ratios) this.osc('square', t, decay, 40 * r).connect(metal);
    metal.connect(this.filter('highpass', 8000)).connect(out);
    return out;
  }

  play(inst, t, vel = 1) {
    switch (inst) {
      case 'kick': {
        const g = this.env(t, 1.2 * vel, 0.35);
        this.osc('sine', t, 0.4, 140, 45, 0.12).connect(g).connect(this.drumBus);
        const c = this.env(t, 0.3 * vel, 0.02);
        this.noiseSrc(t, 0.03).connect(this.filter('lowpass', 3000)).connect(c).connect(this.drumBus);
        break;
      }
      case 'snare': {
        const n = this.env(t, 0.7 * vel, 0.18);
        this.noiseSrc(t, 0.2).connect(this.filter('highpass', 1200)).connect(n).connect(this.drumBus);
        const b = this.env(t, 0.6 * vel, 0.1);
        this.osc('triangle', t, 0.12, 240, 160, 0.08).connect(b).connect(this.drumBus);
        break;
      }
      case 'rim': {
        const g = this.env(t, 0.6 * vel, 0.04);
        this.osc('square', t, 0.05, 1700).connect(this.filter('bandpass', 1700, 3)).connect(g).connect(this.drumBus);
        const g2 = this.env(t, 0.4 * vel, 0.05);
        this.osc('triangle', t, 0.06, 500, 400, 0.05).connect(g2).connect(this.drumBus);
        break;
      }
      case 'tom1':
      case 'tom2':
      case 'tom3': {
        const f = { tom1: 220, tom2: 160, tom3: 110 }[inst];
        const d = { tom1: 0.3, tom2: 0.38, tom3: 0.5 }[inst];
        const g = this.env(t, 0.9 * vel, d);
        this.osc('sine', t, d + 0.05, f, f * 0.6, d).connect(g).connect(this.drumBus);
        const n = this.env(t, 0.15 * vel, 0.05);
        this.noiseSrc(t, 0.06).connect(this.filter('lowpass', 2500)).connect(n).connect(this.drumBus);
        break;
      }
      case 'hhc':
        this.chokeHat(t);
        this.hat(t, vel, 0.06, 0.45);
        break;
      case 'hhp':
        this.chokeHat(t);
        this.hat(t, vel, 0.05, 0.25);
        break;
      case 'hho': {
        this.chokeHat(t);
        const gain = this.hat(t, vel, 0.45, 0.4);
        this.openHat = { gain, end: t + 0.5 };
        break;
      }
      case 'crash': {
        const g = this.env(t, 0.55 * vel, 1.6, 0.003);
        this.noiseSrc(t, 1.7).connect(this.filter('highpass', 4000)).connect(g).connect(this.drumBus);
        const g2 = this.env(t, 0.25 * vel, 0.9, 0.003);
        this.noiseSrc(t, 1).connect(this.filter('bandpass', 6000, 0.5)).connect(g2).connect(this.drumBus);
        break;
      }
      case 'ride': {
        const g = this.env(t, 0.3 * vel, 0.7);
        this.noiseSrc(t, 0.8).connect(this.filter('bandpass', 9000, 1.5)).connect(g).connect(this.drumBus);
        const bell = this.ctx.createGain();
        bell.gain.value = 0.15;
        for (const f of [510, 760, 1200, 2700]) this.osc('square', t, 0.6, f).connect(bell);
        const g2 = this.env(t, 0.4 * vel, 0.5);
        bell.connect(this.filter('highpass', 2500)).connect(g2).connect(this.drumBus);
        break;
      }
      default:
        break;
    }
  }

  click(t, accent) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.5, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    this.osc('sine', t, 0.06, accent ? 1760 : 1175).connect(g).connect(this.clickBus);
  }
}
