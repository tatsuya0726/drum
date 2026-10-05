// フレーズを音符単位でずらす (フレーズの長さで一周する回転)
import { measureTicks } from '../audio/sequencer.js';

/**
 * @param {{ timeSig, measures }} phrase
 * @param {number} ticks ずらす量 (正で後ろ、負で前)。16分音符 = 12
 * @param {string[]|null} insts ずらす楽器 (null ならすべて)
 * @returns 新しい measures 配列
 */
export function shiftMeasures(phrase, ticks, insts = null) {
  const mt = measureTicks(phrase.timeSig);
  const total = mt * phrase.measures.length;
  const out = phrase.measures.map((m) => ({ ...m, notes: [] }));
  phrase.measures.forEach((m, i) => {
    for (const n of m.notes) {
      let abs = i * mt + n.tick;
      if (!insts || insts.includes(n.inst)) abs = (((abs + ticks) % total) + total) % total;
      const mi = Math.floor(abs / mt);
      const tick = abs - mi * mt;
      if (!out[mi].notes.some((x) => x.tick === tick && x.inst === n.inst)) out[mi].notes.push({ ...n, tick });
    }
  });
  for (const m of out) m.notes.sort((a, b) => a.tick - b.tick || a.inst.localeCompare(b.inst));
  return out;
}

/** ずらし方の説明 (例: "バスドラ 16分×1 後ろ") */
export function shiftLabel(ticks, instLabel) {
  if (!ticks) return '';
  const unit = ticks % 12 === 0 ? { t: 12, name: '16分' } : ticks % 16 === 0 ? { t: 16, name: '3連8分' } : { t: 6, name: '32分' };
  const n = Math.abs(ticks) / unit.t;
  return `${instLabel ? instLabel + ' ' : ''}${unit.name}×${n} ${ticks > 0 ? '後ろ' : '前'}`;
}
