// どの画面からでも使える単独のメトロノーム。
// 譜面や音源ファイルに頼らず、専用の AudioContext と発振器だけで鳴らすので、
// PDF の読み込みや音源の読み込みに失敗していても必ず鳴る。

const LOOKAHEAD = 0.12; // 秒: この先までの音を予約する
const TICK_MS = 25;

export class Metronome {
  constructor() {
    this.ctx = null;
    this.bpm = 100;
    this.beats = 4;
    this.subdiv = 1; // 1拍を何個に分けて鳴らすか (1, 2, 3, 4)
    this.volume = 0.8;
    this.running = false;
    this.onBeat = null; // (beatIndex) => void 表示用
    this.timer = null;
    this.queue = [];
  }

  ensureContext() {
    if (!this.ctx) {
      // iPhone のマナーモードでも鳴るようにする (対応ブラウザのみ)
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {
        // 無視
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
    }
    this.out.gain.value = this.volume;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // iOS は無音を一度鳴らすと音が出るようになる
    const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  click(time, level) {
    // level: 0 = 小節の頭, 1 = 拍, 2 = 拍の中の細かい音
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = level === 0 ? 1800 : level === 1 ? 1200 : 900;
    const peak = level === 0 ? 0.5 : level === 1 ? 0.35 : 0.18;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  start() {
    this.ensureContext();
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.queue = [];
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
    const draw = () => {
      if (!this.running) return;
      const now = this.ctx.currentTime;
      while (this.queue.length && this.queue[0].time <= now) {
        const e = this.queue.shift();
        this.onBeat?.(e.beat);
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  schedule() {
    const ctx = this.ctx;
    // 画面が隠れてタイマーが遅れたときは、遅れた分を飛ばす
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const perBeat = this.subdiv;
      const beat = Math.floor(this.step / perBeat) % this.beats;
      const sub = this.step % perBeat;
      const level = sub ? 2 : beat === 0 ? 0 : 1;
      this.click(this.nextTime, level);
      if (!sub) this.queue.push({ time: this.nextTime, beat });
      this.step++;
      this.nextTime += 60 / this.bpm / perBeat;
    }
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.onBeat?.(-1);
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
    return this.running;
  }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
  }
}
