// フレーズ集ファイル (JSON) の読み込み・書き出し
// 形式: { format: 'drum-level-up-phrases', version: 1, name, phrases: [...] }
// フレーズは measures (tick 単位) か patterns (楽器ごとの文字列, "x" = 叩く, "|" = 小節線) で書ける
//   { title, bpm, timeSig: { beats, beatUnit }, steps: 16, patterns: { snare: 'x.x.x.x.|...', kick: '...' } }

import { INSTRUMENT_IDS, PPQ } from '../drums.js';

export const PACK_FORMAT = 'drum-level-up-phrases';

/** patterns 形式を measures に変換する */
export function patternsToMeasures(patterns, timeSig = { beats: 4, beatUnit: 4 }, steps) {
  const mTicks = (timeSig.beats * PPQ * 4) / timeSig.beatUnit;
  const bars = Math.max(...Object.values(patterns).map((s) => s.split('|').length));
  const measures = Array.from({ length: bars }, () => ({ grid: 4, notes: [] }));
  for (const [inst, str] of Object.entries(patterns)) {
    if (!INSTRUMENT_IDS.includes(inst)) throw new Error(`不明な楽器: ${inst}`);
    str.split('|').forEach((bar, i) => {
      const cells = [...bar.replace(/\s/g, '')];
      const n = steps ?? cells.length;
      const stepTicks = mTicks / n;
      if (!Number.isInteger(stepTicks)) throw new Error(`${n} 分割は表せません`);
      cells.forEach((c, k) => {
        if (c === 'x' || c === 'X' || c === 'o') measures[i].notes.push({ tick: k * stepTicks, inst, vel: c === 'X' ? 1 : c === 'o' ? 0.5 : 0.9 });
      });
      // マス目の細かさ (1拍あたりのマス数) は一番細かい楽器に合わせる
      measures[i].maxGrid = Math.max(measures[i].maxGrid ?? 0, n / (timeSig.beats * (4 / timeSig.beatUnit)));
    });
  }
  for (const m of measures) {
    m.notes.sort((a, b) => a.tick - b.tick);
    m.grid = [2, 3, 4, 6, 8].includes(m.maxGrid) ? m.maxGrid : 4;
    delete m.maxGrid;
  }
  return measures;
}

/** ファイルの中身を検証して、保存できる形のフレーズの配列にする */
export function parsePack(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data?.format !== PACK_FORMAT || !Array.isArray(data.phrases)) throw new Error('フレーズ集のファイルではありません');
  return data.phrases.map((p, i) => {
    const timeSig = p.timeSig ?? { beats: 4, beatUnit: 4 };
    const measures = p.measures ?? patternsToMeasures(p.patterns ?? {}, timeSig, p.steps);
    if (!measures.length || !measures.some((m) => m.notes.length)) throw new Error(`${i + 1}番目のフレーズに音符がありません`);
    return {
      title: String(p.title ?? `フレーズ ${i + 1}`),
      group: String(p.group ?? data.name ?? '取り込んだフレーズ'),
      bpm: Number(p.bpm) || 90,
      timeSig,
      measures,
    };
  });
}

export function makePack(name, docs) {
  return {
    format: PACK_FORMAT,
    version: 1,
    name,
    phrases: docs.map((d) => ({ title: d.title, group: d.group, bpm: d.bpm, timeSig: d.timeSig, measures: d.measures })),
  };
}
