import { describe, expect, it } from 'vitest';
import { voiceTokens } from '../src/notation/tokens.js';

const ts = { beats: 4, beatUnit: 4 };
const notes = (spec) =>
  Object.entries(spec).flatMap(([inst, pattern]) => [...pattern].flatMap((c, i) => (c === 'x' ? [{ tick: i * 12, inst }] : [])));
const durs = (tokens) => tokens.map((t) => (t.rest ? `${t.duration}r` : t.duration)).join(' ');

describe('voiceTokens', () => {
  it('writes an 8-beat hi-hat as eighth notes', () => {
    expect(durs(voiceTokens(notes({ hhc: 'x.x.x.x.x.x.x.x.' }), ts, 'up'))).toBe('8 8 8 8 8 8 8 8');
  });

  it('writes kick on 1 and 3 as quarter notes with rests', () => {
    expect(durs(voiceTokens(notes({ kick: 'x.......x.......' }), ts, 'down'))).toBe('q qr q qr');
  });

  it('merges two quarter rests into a half rest', () => {
    expect(durs(voiceTokens(notes({ crash: 'x...............' }), ts, 'up'))).toBe('q qr hr');
  });

  it('uses dotted values for syncopation', () => {
    expect(durs(voiceTokens(notes({ kick: 'x..x...x........' }), ts, 'down'))).toBe('8d 16 8dr 16 hr');
  });

  it('writes an empty voice as a whole rest', () => {
    expect(durs(voiceTokens(notes({ hhc: 'x...' }), ts, 'down'))).toBe('wr');
  });

  it('puts voices on the right side (cymbals/snare up, kick/pedal down)', () => {
    const n = notes({ hhc: 'x...', snare: 'x...', kick: 'x...', hhp: '....x' });
    expect(voiceTokens(n, ts, 'up')[0].insts.sort()).toEqual(['hhc', 'snare']);
    expect(voiceTokens(n, ts, 'down')[0].insts).toEqual(['kick']);
  });

  it('detects eighth-note triplets', () => {
    const t = voiceTokens([0, 16, 32].map((tick) => ({ tick, inst: 'ride' })), { beats: 1, beatUnit: 4 }, 'up');
    expect(t.map((x) => [x.duration, !!x.tuplet])).toEqual([
      ['8', true],
      ['8', true],
      ['8', true],
    ]);
  });
});
