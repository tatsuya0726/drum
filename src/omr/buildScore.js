import { PPQ, gridForTicks, instrumentFor } from '../drums.js';
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
        // 「3」「5」の記号がある小節では連符の位置も候補にする。
        // 記号がなくても 1小節の音の数が「拍数 × 5」なら 5連符とみなす (記号を省いた教本向け)
        // (記号なしは、全部の音が 16分の連桁 (2本) のときだけ。32分が混ざる 5つ割りは普通のリズム)
        const all16 = beams.length > 0 && beams.every((b) => b === 2);
        const quintuplets =
          beatUnit === 4 && ((m.quintuplets > (m.triplets ?? 0) && xs.length >= 5) || (!m.triplets && !m.quintuplets && xs.length === beats * 5 && all16));
        const triplets = beatUnit === 4 && !quintuplets && m.triplets > 0;
        const fine = has32 || (!quintuplets && xs.length > slots);
        let spb = slotsPerBeat * (fine ? 2 : 1);
        if (triplets) spb *= 3;
        if (quintuplets) spb *= 5;
        const measureSlots = (slots / slotsPerBeat) * spb;
        const tickPerSlot = ticksPerBeat / spb;
        const values = onsets.map((o, i) => {
          if (beams[i] == null) return null;
          const open = o.notes.every((n) => n.kind === 'open');
          if (beams[i] === 0) return open ? null : spb;
          const v = spb / 2 ** beams[i]; // 8分 = 半拍
          return Number.isInteger(v) && v >= 1 ? v : null;
        });
        // 連符の記号の真下 (真上) にある num 個の音を 1つのまとまりとする
        const groups = [];
        for (const mk of m.tupletMarks ?? []) {
          if ((mk.num === 5 && !quintuplets) || (mk.num === 3 && !triplets) || xs.length < mk.num) continue;
          let c = 0;
          for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - mk.x) < Math.abs(xs[c] - mk.x)) c = i;
          const startIdx = Math.max(0, Math.min(xs.length - mk.num, c - Math.floor(mk.num / 2)));
          if (!groups.some((g) => g.start === startIdx)) groups.push({ start: startIdx, num: mk.num });
        }
        const assigned = assignSlots(xs, { start, end: m.x1 }, measureSlots, spb, st.space, values, { triplets, quintuplets, unit: spb / (fine ? 8 : 4), groups });
        // 手順 (R / L) の文字を一番近い発音に割り当てる (足の音には付けない)
        const stickOf = new Map();
        const pairs = [];
        (m.stickings ?? []).forEach((t, ti) => {
          onsets.forEach((o, oi) => {
            const d = Math.abs(o.x - t.x);
            if (d < st.space * 1.2) pairs.push({ d, ti, oi, hand: t.hand });
          });
        });
        pairs.sort((a, b) => a.d - b.d);
        const usedT = new Set();
        for (const pr of pairs) {
          if (usedT.has(pr.ti) || stickOf.has(pr.oi)) continue;
          usedT.add(pr.ti);
          stickOf.set(pr.oi, pr.hand);
        }
        const notes = [];
        onsets.forEach((o, i) => {
          for (const h of o.notes) {
            const key = headKey(h.kind, h.step);
            headStats[key] = (headStats[key] ?? 0) + 1;
            const inst = mapping[key] ?? instrumentFor(h.kind, h.step);
            if (inst === 'none') continue;
            const tick = assigned[i] * tickPerSlot;
            if (notes.some((n) => n.tick === tick && n.inst === inst)) continue;
            const note = { tick, inst, vel: 1, head: key };
            if (stickOf.has(i) && inst !== 'kick' && inst !== 'hhp') note.stick = stickOf.get(i);
            notes.push(note);
          }
        });
        notes.sort((a, b) => a.tick - b.tick);
        // 編集用のマス目: 3連符だけの小節は 3連のマス目にする
        const grid = gridForTicks(notes.map((n) => n.tick));
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
