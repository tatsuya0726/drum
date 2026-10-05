import { describe, expect, it } from 'vitest';
import { shiftMeasures, shiftLabel } from '../src/game/shift.js';
import { detectOnsets } from '../src/game/onsets.js';
import { estimateLatency, scoreTake } from '../src/game/scoring.js';

const ts = { beats: 4, beatUnit: 4 };
const pat = (m, inst) => {
  const a = '.'.repeat(16).split('');
  for (const n of m.notes) if (n.inst === inst) a[n.tick / 12] = 'x';
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
          { tick: 48, inst: 'snare' },
          { tick: 120, inst: 'kick' },
          { tick: 144, inst: 'snare' },
          { tick: 180, inst: 'kick' },
        ],
      },
    ],
  };

  it('rotates every note by a 16th', () => {
    const m = shiftMeasures(phrase, 12)[0];
    expect(pat(m, 'kick')).toBe('xx.........x....');
    expect(pat(m, 'snare')).toBe('.....x.......x..');
  });

  it('shifts only the chosen instruments', () => {
    const m = shiftMeasures(phrase, -12, ['kick'])[0];
    expect(pat(m, 'kick')).toBe('.........x....xx');
    expect(pat(m, 'snare')).toBe('....x.......x...');
  });

  it('wraps across measures of a 2-bar phrase', () => {
    const two = { timeSig: ts, measures: [{ grid: 4, notes: [{ tick: 180, inst: 'kick' }] }, { grid: 4, notes: [{ tick: 180, inst: 'snare' }] }] };
    const out = shiftMeasures(two, 12);
    expect(out[1].notes).toEqual([{ tick: 0, inst: 'kick' }]);
    expect(out[0].notes).toEqual([{ tick: 0, inst: 'snare' }]);
  });

  it('describes the shift', () => {
    expect(shiftLabel(12, 'バスドラム')).toBe('バスドラム 16分×1 後ろ');
    expect(shiftLabel(-24)).toBe('16分×2 前');
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
