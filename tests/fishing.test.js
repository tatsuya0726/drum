import { describe, it, expect } from 'vitest';
import { FISH } from '../public/fishing/data/fish.js';
import { BAITS, METHODS, PLACES } from '../public/fishing/data/filters.js';
import { RIGS } from '../public/fishing/data/tackle.js';
import { KNOTS } from '../public/fishing/data/knots.js';
import { SPOTS, HAZARDS } from '../public/fishing/data/safety.js';
import { FUNA_CAUSES } from '../public/fishing/data/funa.js';
import { SOURCES } from '../public/fishing/data/sources.js';
import { KNOT_DIAGRAMS, fishSvg, rigSvg } from '../public/fishing/svg.js';
import { searchFish } from '../public/fishing/search.js';

const srcIds = (arr) => arr.flatMap((x) => [...(x.src || []), ...(x.extraSrc || [])]);

describe('釣り図鑑のデータ', () => {
  it('参照する ID がすべて存在する', () => {
    for (const f of FISH) {
      f.baits.forEach((b) => expect(BAITS[b], `${f.id}:${b}`).toBeTruthy());
      f.methods.forEach((m) => expect(METHODS[m], `${f.id}:${m}`).toBeTruthy());
      f.places.forEach((p) => expect(PLACES[p], `${f.id}:${p}`).toBeTruthy());
      f.months.forEach((m) => expect(m >= 1 && m <= 12).toBe(true));
      if (f.hazard) expect(HAZARDS.find((h) => h.id === f.hazard), f.id).toBeTruthy();
    }
    for (const r of RIGS) r.targets.forEach((t) => expect(FISH.find((f) => f.id === t), `${r.id}:${t}`).toBeTruthy());
    const all = [...FISH, ...RIGS, ...SPOTS, ...HAZARDS, ...FUNA_CAUSES];
    srcIds(all).forEach((id) => expect(SOURCES[id], id).toBeTruthy());
  });

  it('ID が重複しない', () => {
    for (const list of [FISH, RIGS, KNOTS, SPOTS, HAZARDS]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('立入禁止・利用可の場所には出典がある (出典なしは「要確認」だけ)', () => {
    for (const s of SPOTS) if (s.level !== 'check') expect(s.src.length, s.id).toBeGreaterThan(0);
    expect(SPOTS.some((s) => s.level === 'ng')).toBe(true);
  });

  it('危険な生物はすべて出典つき', () => {
    for (const h of HAZARDS) expect(h.src.length, h.id).toBeGreaterThan(0);
    for (const f of FISH.filter((x) => x.hazard)) expect(f.src.length, f.id).toBeGreaterThan(0);
  });

  it('結び方は手順の数だけ図がある', () => {
    for (const k of KNOTS) expect(KNOT_DIAGRAMS[k.id]?.length, k.id).toBe(k.steps.length);
  });

  it('図は SVG として組み立てられる', () => {
    for (const f of FISH) expect(fishSvg(f.art)).toMatch(/^<svg[\s\S]*<\/svg>$/);
    for (const r of RIGS) expect(rigSvg(r.rig)).toMatch(/<svg/);
  });
});

describe('searchFish', () => {
  it('名前 (かな・カナ) で探せる', () => {
    expect(searchFish({ q: 'あじ' }).map((f) => f.id)).toContain('aji');
    expect(searchFish({ q: 'ヒラメ' }).map((f) => f.id)).toEqual(['hirame']);
  });
  it('季節・餌・釣り方・場所で絞り込める', () => {
    expect(searchFish({ month: 1 }).every((f) => f.months.includes(1))).toBe(true);
    expect(searchFish({ bait: 'amiebi' }).map((f) => f.id)).toContain('aji');
    expect(searchFish({ method: 'hera' }).map((f) => f.id)).toContain('funa');
    expect(searchFish({ place: 'surf', month: 10 }).map((f) => f.id)).toContain('hirame');
  });
  it('条件が合わなければ空', () => {
    expect(searchFish({ q: 'ヒラメ', month: 5 })).toEqual([]);
  });
});
