import { PPQ } from '../drums.js';

export function ticksPerBeat(timeSig) {
  return (PPQ * 4) / timeSig.beatUnit;
}

export function measureTicks(timeSig) {
  return timeSig.beats * ticksPerBeat(timeSig);
}

/**
 * 譜面を時間軸に沿って進め、発音イベントを生成する (AudioContext に依存しない)。
 * テンポ変更・ループ・カウントインに対応。
 */
export class Sequencer {
  constructor(score) {
    this.score = score;
    this.bpm = 100; // 4分音符 = bpm
    this.loop = { enabled: false, start: 0, end: 0 };
    this.metronome = true;
    this.tempoUp = { enabled: false, step: 2, max: 160 };
    this.mutes = new Set();
    this.onLoop = null; // ループで先頭に戻ったとき (bpm 変更の通知用)
    this.running = false;
  }

  /** 演奏開始位置を設定する。time = 最初の音の時刻 */
  start(measure, time, countIn = false) {
    this.measure = measure;
    this.tick = 0;
    this.time = time;
    this.countIn = countIn ? 1 : 0;
    this.countTick = 0;
    this.running = true;
    this.finished = false;
  }

  get secPerTick() {
    return 60 / (this.bpm * PPQ);
  }

  /** time < until の範囲のイベントを返す */
  advance(until) {
    const out = [];
    const ts = this.score.timeSig;
    const beatTicks = ticksPerBeat(ts);
    const mTicks = measureTicks(ts);
    let guard = 0;
    while (this.running && this.time < until && guard++ < 10000) {
      if (this.countIn > 0) {
        out.push({ type: 'click', time: this.time, accent: this.countTick === 0, measure: -1, tick: this.countTick });
        this.countTick += beatTicks;
        this.time += beatTicks * this.secPerTick;
        if (this.countTick >= mTicks) this.countIn = 0;
        continue;
      }
      const m = this.score.measures[this.measure];
      if (!m) {
        out.push({ type: 'end', time: this.time });
        this.running = false;
        this.finished = true;
        break;
      }
      out.push({ type: 'pos', time: this.time, measure: this.measure, tick: this.tick });
      if (this.metronome && this.tick % beatTicks === 0) {
        out.push({ type: 'click', time: this.time, accent: this.tick === 0, measure: this.measure, tick: this.tick });
      }
      for (const n of m.notes) {
        if (n.tick === this.tick && !this.mutes.has(n.inst)) {
          out.push({ type: 'note', time: this.time, inst: n.inst, vel: n.vel ?? 1, measure: this.measure, tick: this.tick });
        }
      }
      // 次のイベント位置 (次の音 or 次の拍)
      let next = (Math.floor(this.tick / beatTicks) + 1) * beatTicks;
      for (const n of m.notes) if (n.tick > this.tick && n.tick < next) next = n.tick;
      if (next >= mTicks) {
        this.time += (mTicks - this.tick) * this.secPerTick;
        this.tick = 0;
        if (this.loop.enabled && this.measure === this.loop.end) {
          this.measure = this.loop.start;
          if (this.tempoUp.enabled && this.bpm < this.tempoUp.max) {
            this.bpm = Math.min(this.tempoUp.max, this.bpm + this.tempoUp.step);
            this.onLoop?.(this.bpm);
          }
        } else {
          this.measure++;
        }
      } else {
        this.time += (next - this.tick) * this.secPerTick;
        this.tick = next;
      }
    }
    return out;
  }
}
