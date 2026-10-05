import { DrumSynth } from './synth.js';
import { Sequencer } from './sequencer.js';

const LOOKAHEAD = 0.12; // 秒
const INTERVAL = 25; // ms

/** Sequencer を AudioContext 上で鳴らす */
export class Player {
  constructor() {
    this.ctx = null;
    this.synth = null;
    this.seq = new Sequencer({ timeSig: { beats: 4, beatUnit: 4 }, measures: [] });
    this.timer = null;
    this.markers = [];
    this.playing = false;
    this.countIn = false;
    this.onEnd = null;
    this.onTempo = null;
    this.seq.onLoop = (bpm) => this.onTempo?.(bpm);
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      this.synth = new DrumSynth(this.ctx);
      this.synth.volume = this._volume ?? 0.8;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  set volume(v) {
    this._volume = v;
    if (this.synth) this.synth.volume = v;
  }

  setScore(score) {
    this.seq.score = score;
  }

  play(fromMeasure) {
    this.ensureContext();
    const loop = this.seq.loop;
    let start = fromMeasure;
    if (loop.enabled && (start < loop.start || start > loop.end)) start = loop.start;
    this.seq.start(start, this.ctx.currentTime + 0.08, this.countIn);
    this.markers = [];
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), INTERVAL);
    this.pump();
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this.seq.running = false;
    this.markers = [];
  }

  pump() {
    if (!this.playing) return;
    const events = this.seq.advance(this.ctx.currentTime + LOOKAHEAD);
    for (const e of events) {
      if (e.type === 'note') this.synth.play(e.inst, e.time, e.vel);
      else if (e.type === 'click') this.synth.click(e.time, e.accent);
      if (e.type === 'pos' || e.type === 'click' || e.type === 'end') this.markers.push(e);
    }
    // 古いマーカーを捨てる
    const now = this.ctx.currentTime;
    while (this.markers.length > 1 && this.markers[1].time <= now) this.markers.shift();
    if (this.seq.finished && this.markers.length && this.markers[this.markers.length - 1].type === 'end') {
      const endTime = this.markers[this.markers.length - 1].time;
      if (now >= endTime) {
        this.stop();
        this.onEnd?.();
      }
    }
  }

  /** 現在鳴っている位置 { measure, tick } (カウントイン中は measure = -1) */
  position() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    let cur = null;
    for (const m of this.markers) {
      if (m.time <= now) cur = m;
      else break;
    }
    if (!cur || cur.type === 'end') return null;
    return { measure: cur.measure, tick: cur.tick };
  }

  /** 楽器を1回鳴らす (エディタでの試聴用) */
  preview(inst) {
    this.ensureContext();
    this.synth.play(inst, this.ctx.currentTime + 0.01, 1);
  }
}
