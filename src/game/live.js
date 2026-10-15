// ライブ採点: 録音はせず、マイクの音から叩いた瞬間をその場で見つけて知らせる。
// 直近 1.5 秒ぶんの音を持っておき、新しい音が届くたびにその範囲でアタックを探す。

import { detectOnsets } from './onsets.js';

const KEEP = 1.5; // 秒
const EDGE = 0.06; // 末尾ぎりぎりのアタックは次の回で確かめる

export class LiveListener {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} source マイクの音
   * @param {{ sensitivity?: number, onHit: (time: number) => void }} opts time は AudioContext の時計 (補正前)
   */
  constructor(ctx, source, { sensitivity = 0.5, onHit }) {
    this.ctx = ctx;
    this.source = source;
    this.sensitivity = sensitivity;
    this.onHit = onHit;
    this.chunks = [];
    this.lastHit = -Infinity;
  }

  start() {
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    sink.connect(this.ctx.destination);
    this.sink = sink;
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor');
    this.node.port.onmessage = (e) => this.push(e.data.time, e.data.data);
    this.source.connect(this.node);
    this.node.connect(sink);
  }

  stop() {
    try {
      this.source.disconnect(this.node);
      this.node.disconnect();
      this.node.port.postMessage('stop');
      this.sink.disconnect();
    } catch {
      // 無視
    }
    this.chunks = [];
  }

  push(time, data) {
    const sr = this.ctx.sampleRate;
    this.chunks.push({ time, data });
    // 古いぶんを捨てる
    while (this.chunks.length > 1 && this.chunks[this.chunks.length - 1].time - this.chunks[0].time > KEEP) this.chunks.shift();
    const start = this.chunks[0].time;
    const len = this.chunks.reduce((s, c) => s + c.data.length, 0);
    const buf = new Float32Array(len);
    let o = 0;
    let peak = 0;
    for (const c of this.chunks) {
      buf.set(c.data, o);
      o += c.data.length;
    }
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(buf[i]));
    // 静かなときに小さな雑音を拾わない (感度が高いほど小さい音も拾う)
    if (peak < 0.02 - this.sensitivity * 0.015) return;
    const end = start + len / sr;
    for (const on of detectOnsets(buf, sr, { sensitivity: this.sensitivity })) {
      const t = start + on.time;
      if (t <= this.lastHit + 0.045 || t > end - EDGE) continue;
      this.lastHit = t;
      this.onHit(t);
    }
  }
}
