import { describe, expect, it } from 'vitest';
import { shiftMeasures, shiftLabel } from '../src/game/shift.js';
import { detectOnsets } from '../src/game/onsets.js';
import { estimateLatency, scoreTake } from '../src/game/scoring.js';
import { PPQ } from '../src/drums.js';
const T = PPQ / 48; // テストの数値は 4分音符=48 の単位で書く

const ts = { beats: 4, beatUnit: 4 };
const pat = (m, inst) => {
  const a = '.'.repeat(16).split('');
  for (const n of m.notes) if (n.inst === inst) a[n.tick / (12 * T)] = 'x';
  return a.join('');
};

describe('shiftMeasures', () => {
  const phrase = {
    timeSig: ts,
    measures: [
      {
        grid: 4,
        notes: [
          { tick: 0, inst: 'kick' },
          { tick: 48 * T, inst: 'snare' },
          { tick: 120 * T, inst: 'kick' },
          { tick: 144 * T, inst: 'snare' },
          { tick: 180 * T, inst: 'kick' },
        ],
      },
    ],
  };

  it('rotates every note by a 16th', () => {
    const m = shiftMeasures(phrase, 12 * T)[0];
    expect(pat(m, 'kick')).toBe('xx.........x....');
    expect(pat(m, 'snare')).toBe('.....x.......x..');
  });

  it('shifts only the chosen instruments', () => {
    const m = shiftMeasures(phrase, -12 * T, ['kick'])[0];
    expect(pat(m, 'kick')).toBe('.........x....xx');
    expect(pat(m, 'snare')).toBe('....x.......x...');
  });

  it('wraps across measures of a 2-bar phrase', () => {
    const two = { timeSig: ts, measures: [{ grid: 4, notes: [{ tick: 180 * T, inst: 'kick' }] }, { grid: 4, notes: [{ tick: 180 * T, inst: 'snare' }] }] };
    const out = shiftMeasures(two, 12 * T);
    expect(out[1].notes).toEqual([{ tick: 0, inst: 'kick' }]);
    expect(out[0].notes).toEqual([{ tick: 0, inst: 'snare' }]);
  });

  it('describes the shift', () => {
    expect(shiftLabel(12 * T, 'バスドラム')).toBe('バスドラム 16分×1 後ろ');
    expect(shiftLabel(-24 * T)).toBe('16分×2 前');
  });
});

// テスト用の録音: 指定時刻にドラムっぽい音 (減衰するノイズ) を置く
function synth(times, { sr = 44100, dur = 4, levels = [], noise = 0.002 } = {}) {
  const x = new Float32Array(sr * dur);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < x.length; i++) x[i] = rnd() * noise;
  times.forEach((t, k) => {
    const a = levels[k] ?? 0.8;
    const s0 = Math.round(t * sr);
    for (let i = 0; i < sr * 0.25 && s0 + i < x.length; i++) {
      x[s0 + i] += a * rnd() * Math.exp(-i / (sr * 0.03)) + a * 0.5 * Math.sin((2 * Math.PI * 120 * i) / sr) * Math.exp(-i / (sr * 0.06));
    }
  });
  return { x, sr };
}

describe('detectOnsets', () => {
  it('finds each hit within a few milliseconds', () => {
    const times = [0.5, 0.75, 1.0, 1.125, 1.25, 1.5, 2.0, 2.0625, 2.5];
    const { x, sr } = synth(times, { levels: [0.9, 0.5, 0.9, 0.3, 0.6, 0.9, 0.8, 0.4, 0.9] });
    const found = detectOnsets(x, sr);
    expect(found.length).toBe(times.length);
    found.forEach((f, i) => expect(Math.abs(f.time - times[i])).toBeLessThan(0.004));
  });

  it('ignores background noise', () => {
    const { x, sr } = synth([], { noise: 0.01 });
    expect(detectOnsets(x, sr).length).toBeLessThanOrEqual(1);
  });
});

describe('scoreTake', () => {
  it('gives 100 for perfect timing', () => {
    const exp = [0, 0.5, 1, 1.5];
    const r = scoreTake(exp, exp.map((time) => ({ time: time + 0.005 })));
    expect(r.score).toBe(100);
    expect(r.rank).toBe('S');
    expect(r.counts.perfect).toBe(4);
  });

  it('grades early/late hits and misses', () => {
    const exp = [0, 0.5, 1, 1.5];
    const r = scoreTake(exp, [{ time: 0.04 }, { time: 0.43 }, { time: 1.0 }, { time: 3 }]);
    expect(r.judgments.map((j) => j.grade)).toEqual(['great', 'good', 'perfect', 'miss']);
    expect(r.extra).toBe(1);
    expect(r.score).toBeLessThan(70);
    expect(r.meanOffset).toBeCloseTo((0.04 - 0.07 + 0) / 3, 5);
  });

  it('estimates latency from calibration taps', () => {
    const clicks = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
    const hits = clicks.map((c, i) => ({ time: c + 0.08 + (i % 2 ? 0.01 : -0.01) }));
    expect(estimateLatency(clicks, hits)).toBeCloseTo(0.09, 3);
  });
});

import { makePack, parsePack, patternsToMeasures } from '../src/game/pack.js';

describe('phrase packs', () => {
  it('converts pattern strings to measures', () => {
    const m = patternsToMeasures({ snare: 'x.x.x.x.x.x.x.x.|xxxxxxxxxxxxxxxx', kick: 'x.......x.......' });
    expect(m).toHaveLength(2);
    expect(m[0].notes.filter((n) => n.inst === 'snare').map((n) => n.tick / T)).toEqual([0, 24, 48, 72, 96, 120, 144, 168]);
    expect(m[1].notes).toHaveLength(16);
    expect(m[0].grid).toBe(4);
  });

  it('supports triplet grids', () => {
    const m = patternsToMeasures({ snare: 'x.xx.xx.xx.x' });
    expect(m[0].grid).toBe(3);
    expect(m[0].notes.map((n) => n.tick / T)).toEqual([0, 32, 48, 80, 96, 128, 144, 176]);
  });

  it('round-trips a pack', () => {
    const phrases = parsePack({ format: 'drum-level-up-phrases', version: 1, name: 'Book', phrases: [{ title: 'Ex 1', bpm: 80, patterns: { snare: 'x.x.x.x.x.x.x.x.' } }] });
    expect(phrases[0]).toMatchObject({ title: 'Ex 1', group: 'Book', bpm: 80 });
    const again = parsePack(makePack('Book', phrases));
    expect(again[0].measures).toEqual(phrases[0].measures);
  });

  it('rejects other files', () => {
    expect(() => parsePack({ hello: 1 })).toThrow();
  });
});

describe('tick unit migration', () => {
  it('converts packs written with the old unit (quarter = 48)', () => {
    const [p] = parsePack({ format: 'drum-level-up-phrases', version: 1, phrases: [{ title: 'old', measures: [{ grid: 4, notes: [{ tick: 12, inst: 'snare' }, { tick: 16, inst: 'kick' }] }] }] });
    expect(p.measures[0].notes.map((n) => n.tick)).toEqual([PPQ / 4, PPQ / 3]);
  });
  it('keeps packs already in the current unit', () => {
    const [p] = parsePack({ format: 'drum-level-up-phrases', version: 1, ppq: PPQ, phrases: [{ title: 'new', measures: [{ grid: 4, notes: [{ tick: PPQ / 5, inst: 'snare' }] }] }] });
    expect(p.measures[0].notes[0].tick).toBe(PPQ / 5);
  });
});

import { mixdownTake } from '../src/game/mixdown.js';

describe('playback mixdown', () => {
  it('puts the mic hits on the metronome clicks after removing the latency', async () => {
    const sr = 48000;
    const pcmStart = 10; // pcm[0] の時刻
    const latency = 0.12;
    const clicks = [0.5, 1.0, 1.5].map((t, k) => ({ time: pcmStart + t, accent: k === 0 }));
    // 叩いた音はクリックぴったりに叩いて、補正値の分だけ遅れて録音された
    const pcm = new Float32Array(sr * 2);
    for (const c of clicks) pcm[Math.round((c.time - pcmStart + latency) * sr)] = 0.9;
    const wav = mixdownTake({ pcm, sampleRate: sr, pcmStart, latency, clicks });
    const bytes = new DataView(await wav.arrayBuffer());
    const out = [];
    for (let i = 44; i < bytes.byteLength; i += 2) out.push(bytes.getInt16(i, true) / 0x7fff);
    const osr = sr / 2;
    for (const c of clicks) {
      const at = Math.round((c.time - pcmStart) * osr);
      // クリックの頭の位置に、叩いた音 (大きな値) がある
      expect(Math.max(...out.slice(at - 2, at + 3).map(Math.abs))).toBeGreaterThan(0.3);
    }
  });
});
