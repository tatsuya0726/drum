import { PPQ, instrumentFor } from '../drums.js';
import { assignSlots, clusterOnsets } from './rhythm.js';

function median(arr, fallback) {
  if (!arr.length) return fallback;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function headKey(kind, step) {
  return `${kind}:${step}`;
}

/**
 * ページごとの解析結果から譜面データを作る。
 * @param {Array} pages analyzePage の結果の配列
 * @param {object} opts { beats, beatUnit, mapping: { 'x:-1': 'hhc', ... } (任意) }
 */
export function buildScore(pages, opts = {}) {
  const beats = opts.beats ?? 4;
  const beatUnit = opts.beatUnit ?? 4;
  const mapping = opts.mapping ?? {};
  const ticksPerBeat = (PPQ * 4) / beatUnit;
  const slotsPerBeat = beatUnit === 8 ? 2 : 4; // 16分音符グリッド
  const slotTicks = ticksPerBeat / slotsPerBeat;
  let slots = beats * slotsPerBeat;

  // 小節線から1拍目の音までの典型的な距離 (五線間隔単位)
  const pads = [];
  for (const page of pages) {
    for (const st of page.staves) {
      for (const m of st.measures) {
        if (m.firstInSystem || !m.notes.length) continue;
        const first = Math.min(...m.notes.map((n) => n.x));
        pads.push((first - m.x0) / st.space);
      }
    }
  }
  const pad = Math.min(2.5, median(pads, 1.4));

  const measures = [];
  const headStats = {};
  pages.forEach((page, pageIndex) => {
    for (const st of page.staves) {
      for (const m of st.measures) {
        const onsets = clusterOnsets(m.notes, st.space);
        const xs = onsets.map((o) => o.x);
        const start = m.firstInSystem ? null : m.x0 + pad * st.space;
        let measureSlots = slots;
        let tickPerSlot = slotTicks;
        if (xs.length > slots) {
          measureSlots = slots * 2; // 32分音符
          tickPerSlot = slotTicks / 2;
        }
        const assigned = assignSlots(xs, { start, end: m.x1 }, measureSlots, (measureSlots / slots) * slotsPerBeat, st.space);
        const notes = [];
        onsets.forEach((o, i) => {
          for (const h of o.notes) {
            const key = headKey(h.kind, h.step);
            headStats[key] = (headStats[key] ?? 0) + 1;
            const inst = mapping[key] ?? instrumentFor(h.kind, h.step);
            if (inst === 'none') continue;
            const tick = assigned[i] * tickPerSlot;
            if (notes.some((n) => n.tick === tick && n.inst === inst)) continue;
            notes.push({ tick, inst, vel: 1, head: key });
          }
        });
        notes.sort((a, b) => a.tick - b.tick);
        measures.push({
          notes,
          grid: 4,
          source: {
            page: pageIndex,
            // ページに対する比率 (0..1)
            x0: m.x0 / page.width,
            x1: m.x1 / page.width,
            y0: (st.top - st.space * 3) / page.height,
            y1: (st.bottom + st.space * 3) / page.height,
            heads: m.notes.map((h) => ({
              x: h.x / page.width,
              y: h.y / page.height,
              key: headKey(h.kind, h.step),
            })),
          },
        });
      }
    }
  });
  return { timeSig: { beats, beatUnit }, measures, headStats };
}
