import { describe, expect, it } from 'vitest';
import { synthSong } from './fixtures/synth-song.js';
import { analyzeAudio, barsBpm, estimateTempo, trackBeats, transcribe } from '../src/transcribe/core.js';

const eight = (b) => ({
  hhc: [0, 2, 4, 6, 8, 10, 12, 14],
  kick: b % 2 ? [0, 8, 10] : [0, 6, 8],
  snare: [4, 12],
  ...(b % 4 === 0 ? { crash: [0] } : {}),
});

function check(res, expected, bars, { from = 1 } = {}) {
  const stats = {};
  for (const inst of ['kick', 'snare', 'hhc']) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let b = from; b < bars; b++) {
      const bar = res.bars[b];
      const tick = (st) => (st * 240) / (bar.grid);
      const exp = new Set(expected.filter((e) => e.bar === b && (e.inst === inst || (inst === 'hhc' && e.inst === 'crash'))).map((e) => tick(e.step)));
      const got = new Set(bar.notes.filter((n) => n.inst === inst || (inst === 'hhc' && n.inst === 'crash')).map((n) => n.tick));
      for (const t of got) (exp.has(t) ? tp++ : fp++);
      for (const t of exp) if (!got.has(t)) fn++;
    }
    stats[inst] = { p: tp / (tp + fp || 1), r: tp / (tp + fn || 1) };
  }
  return stats;
}

describe('曲からドラム譜を作る', () => {
  it('8ビート (ベース・和音入り) のテンポ・小節の頭・音を読み取る', () => {
    const bars = 12;
    const { mono, expected, lead } = synthSong({ bpm: 104, bars, pattern: eight });
    const feat = analyzeAudio(mono);
    const bpm = estimateTempo(feat.onset, feat.fps);
    expect(Math.abs(bpm - 104)).toBeLessThan(1.5);
    const beats = trackBeats(feat.onset, feat.fps, bpm);
    const res = transcribe(feat, beats);
    // 曲の最初のバスドラムの位置が小節の頭になる (その前は何もない小節)
    const first = res.bars.findIndex((b) => Math.abs(b.start - lead) < 0.03);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(res.bars.slice(0, first).every((b) => !b.notes.length)).toBe(true);
    res.bars = res.bars.slice(first);
    expect(Math.abs(barsBpm(res.bars) - 104)).toBeLessThan(1);
    const st = check(res, expected, bars);
    console.log(JSON.stringify(st), res.thresholds);
    for (const inst of ['kick', 'snare', 'hhc']) {
      expect(st[inst].p).toBeGreaterThan(0.85);
      expect(st[inst].r).toBeGreaterThan(0.85);
    }
    expect(res.bars[4].notes.some((n) => n.inst === 'crash' && n.tick === 0)).toBe(true);
  });

  it('16ビートと 3連 (シャッフル) を見分ける', () => {
    const bars = 8;
    const sixteen = synthSong({ bpm: 92, bars, pattern: () => ({ hhc: [...Array(16).keys()], kick: [0, 7, 10], snare: [4, 12] }) });
    let feat = analyzeAudio(sixteen.mono);
    let bpm = estimateTempo(feat.onset, feat.fps);
    let res = transcribe(feat, trackBeats(feat.onset, feat.fps, bpm));
    expect(Math.abs(bpm - 92)).toBeLessThan(1.5);
    expect(res.bars.every((b) => b.grid === 4)).toBe(true);
    let st = check(res, sixteen.expected, bars);
    console.log('16', JSON.stringify(st));
    expect(st.hhc.r).toBeGreaterThan(0.85);
    expect(st.kick.r).toBeGreaterThan(0.85);

    const shuffle = synthSong({ bpm: 96, bars, swing: true, pattern: () => ({ hhc: [0, 2, 3, 5, 6, 8, 9, 11], kick: [0, 6, 8], snare: [3, 9] }) });
    feat = analyzeAudio(shuffle.mono);
    bpm = estimateTempo(feat.onset, feat.fps);
    res = transcribe(feat, trackBeats(feat.onset, feat.fps, bpm));
    expect(Math.abs(bpm - 96)).toBeLessThan(1.5);
    expect(res.bars.slice(1).filter((b) => b.grid === 3).length).toBeGreaterThanOrEqual(bars - 2);
    st = check(res, shuffle.expected, bars);
    console.log('shuffle', JSON.stringify(st));
    expect(st.hhc.r).toBeGreaterThan(0.8);
    expect(st.snare.r).toBeGreaterThan(0.8);
  });
});
