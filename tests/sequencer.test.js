import { describe, expect, it } from 'vitest';
import { Sequencer } from '../src/audio/sequencer.js';

const score = {
  timeSig: { beats: 4, beatUnit: 4 },
  measures: [
    { notes: [{ tick: 0, inst: 'kick' }, { tick: 96, inst: 'snare' }] },
    { notes: [{ tick: 0, inst: 'kick' }, { tick: 24, inst: 'hhc' }] },
    { notes: [{ tick: 0, inst: 'crash' }] },
  ],
};

const notes = (events) => events.filter((e) => e.type === 'note');

describe('Sequencer', () => {
  it('schedules notes at the right times for the tempo', () => {
    const s = new Sequencer(score);
    s.bpm = 120; // 4分 = 0.5秒
    s.start(0, 0);
    const ev = notes(s.advance(100));
    expect(ev.map((e) => [e.inst, e.measure, +e.time.toFixed(3)])).toEqual([
      ['kick', 0, 0],
      ['snare', 0, 1],
      ['kick', 1, 2],
      ['hhc', 1, 2.25],
      ['crash', 2, 4],
    ]);
    expect(s.finished).toBe(true);
  });

  it('loops a measure range', () => {
    const s = new Sequencer(score);
    s.bpm = 120;
    s.loop = { enabled: true, start: 1, end: 1 };
    s.start(1, 0);
    const ev = notes(s.advance(6.1));
    expect(ev.filter((e) => e.inst === 'kick').map((e) => e.time)).toEqual([0, 2, 4, 6]);
    expect(ev.every((e) => e.measure === 1)).toBe(true);
  });

  it('raises the tempo on each loop when enabled', () => {
    const s = new Sequencer(score);
    s.bpm = 100;
    s.loop = { enabled: true, start: 0, end: 0 };
    s.tempoUp = { enabled: true, step: 5, max: 110 };
    s.start(0, 0);
    s.advance(20);
    expect(s.bpm).toBe(110);
  });

  it('applies tempo changes immediately', () => {
    const s = new Sequencer(score);
    s.bpm = 60;
    s.start(0, 0);
    s.advance(0.5); // 1拍目のみ
    s.bpm = 120;
    const ev = notes(s.advance(100));
    // 2拍目 (t=1) 以降は 0.5秒/拍
    expect(ev[0].inst).toBe('snare');
    expect(ev[0].time).toBeCloseTo(1.5);
  });

  it('plays a count-in and skips muted instruments', () => {
    const s = new Sequencer(score);
    s.bpm = 120;
    s.mutes.add('snare');
    s.start(0, 0, true);
    const ev = s.advance(2.6);
    expect(ev.filter((e) => e.type === 'click' && e.measure === -1)).toHaveLength(4);
    expect(notes(ev).map((e) => [e.inst, e.time])).toEqual([['kick', 2]]);
  });
});
