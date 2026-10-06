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
        // 連桁・旗の本数から読んだ音価 (16分 = 1 スロット)
        const beams = onsets.map((o) => {
          const bs = o.notes.map((n) => n.beams).filter((b) => b != null);
          return bs.length ? Math.max(...bs) : null;
        });
        const has32 = beams.some((b) => b >= 3);
        // 「3」の記号がある小節では 3連符も読めるように 1拍を 12 (32分があれば 24) に分けたグリッドで割り当てる
        const triplets = beatUnit === 4 && m.triplets > 0;
        const fine = has32 || xs.length > slots;
        let spb = slotsPerBeat * (fine ? 2 : 1);
        if (triplets) spb *= 3;
        const measureSlots = (slots / slotsPerBeat) * spb;
        const tickPerSlot = ticksPerBeat / spb;
        const values = onsets.map((o, i) => {
          if (beams[i] == null) return null;
          const open = o.notes.every((n) => n.kind === 'open');
          if (beams[i] === 0) return open ? null : spb;
          const v = spb / 2 ** beams[i]; // 8分 = 半拍
          return Number.isInteger(v) && v >= 1 ? v : null;
        });
        const assigned = assignSlots(xs, { start, end: m.x1 }, measureSlots, spb, st.space, values, { triplets, unit: spb / (fine ? 8 : 4) });
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
        // 編集用のマス目: 3連符だけの小節は 3連のマス目にする
        let grid = 4;
        if (notes.some((n) => n.tick % 12)) {
          if (notes.every((n) => n.tick % 16 === 0)) grid = 3;
          else if (notes.every((n) => n.tick % 8 === 0)) grid = 6;
          else if (notes.every((n) => n.tick % 6 === 0)) grid = 8;
        }
        measures.push({
          notes,
          grid,
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
