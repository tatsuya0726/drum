// 採点結果を細かく見る: 楽器別・拍の位置別のズレ、苦手な小節、クリックが無い所でのテンポのずれ、だんだん走る/もたる

const GROUPS = [
  { id: 'kick', name: 'バスドラム', insts: ['kick'] },
  { id: 'snare', name: 'スネア', insts: ['snare', 'rim'] },
  { id: 'hh', name: 'ハイハット', insts: ['hhc', 'hho', 'hhp'] },
  { id: 'cym', name: 'シンバル', insts: ['crash', 'ride'] },
  { id: 'tom', name: 'タム', insts: ['tom1', 'tom2', 'tom3'] },
];

const POSITIONS = [
  { id: 'down', name: '拍の頭', test: (f) => f === 0 },
  { id: 'and', name: '8分の裏', test: (f) => near(f, 1 / 2) },
  { id: 'e', name: '16分の2・4つ目', test: (f) => near(f, 1 / 4) || near(f, 3 / 4) },
  { id: 'trip', name: '3連の2・3つ目', test: (f) => near(f, 1 / 3) || near(f, 2 / 3) },
  { id: 'other', name: '細かい音 (6連・5連・32分など)', test: () => true },
];
const near = (a, b) => Math.abs(a - b) < 1e-6;

const POINTS = { perfect: 1, great: 0.8, good: 0.45, miss: 0 };

function summarize(js) {
  const offs = js.filter((j) => j.offset != null).map((j) => j.offset);
  const n = js.length;
  const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : null;
  const spread = offs.length > 1 ? Math.sqrt(offs.reduce((a, b) => a + (b - mean) ** 2, 0) / offs.length) : null;
  const score = n ? Math.round((js.reduce((s, j) => s + POINTS[j.grade], 0) / n) * 100) : null;
  return { n, hit: offs.length, miss: n - offs.length, mean, spread, score };
}

const ms = (s) => `${s > 0 ? '+' : ''}${Math.round(s * 1000)}ms`;

/**
 * @param {object} a
 * @param {Array<{offset:number|null, grade:string, expected?:number}>} a.judgments loops × onsets 個 (ループ順)
 * @param {Array<{measure:number, tick:number, insts:string[]}>} a.onsets フレーズ1回分の発音位置
 * @param {number} a.measures フレーズの小節数
 * @param {number} a.beatTicks 1拍の tick 数
 * @param {(bar:number) => boolean} [a.restBar] 通しの小節番号でクリックを休んでいたか
 */
export function analyzeTake({ judgments, onsets, measures, beatTicks, restBar }) {
  const per = onsets.length;
  if (!per || !judgments.length) return null;
  const rows = judgments.map((j, k) => {
    const o = onsets[k % per];
    const loop = Math.floor(k / per);
    return { ...j, ...o, loop, bar: loop * measures + o.measure, frac: (o.tick % beatTicks) / beatTicks };
  });

  const byInst = GROUPS.map((gr) => ({ id: gr.id, name: gr.name, ...summarize(rows.filter((r) => r.insts.some((i) => gr.insts.includes(i)))) })).filter((x) => x.n);
  const byPos = [];
  const left = new Set(rows);
  for (const p of POSITIONS) {
    const js = [...left].filter((r) => p.test(r.frac));
    js.forEach((r) => left.delete(r));
    if (js.length) byPos.push({ id: p.id, name: p.name, ...summarize(js) });
  }
  const byMeasure = Array.from({ length: measures }, (_, m) => ({ measure: m, ...summarize(rows.filter((r) => r.measure === m)) }));
  // 苦手な小節: 全体より明らかに低い所 (2小節以上のフレーズだけ)
  const all = summarize(rows);
  const weak =
    measures >= 2
      ? byMeasure
          .filter((m) => m.score != null && m.score < 90 && m.score <= all.score - 5)
          .sort((a, b) => a.score - b.score)
          .slice(0, 3)
      : [];

  // クリックを休んだ小節と鳴っていた小節の比較
  let gap = null;
  if (restBar && rows.some((r) => restBar(r.bar))) {
    gap = { click: summarize(rows.filter((r) => !restBar(r.bar))), rest: summarize(rows.filter((r) => restBar(r.bar))) };
  }

  // だんだん走る / もたる: 最初と最後の 3分の1 の平均の差
  let drift = null;
  const hits = rows.filter((r) => r.offset != null);
  if (hits.length >= 9) {
    const t = Math.floor(hits.length / 3);
    const first = summarize(hits.slice(0, t)).mean;
    const last = summarize(hits.slice(-t)).mean;
    drift = last - first;
  }

  return { all, byInst, byPos, byMeasure, weak, gap, drift, tips: tipsFor({ all, byInst, byPos, weak, gap, drift }) };
}

/** 結果から一言アドバイスを作る (大事なものから最大 3つ) */
function tipsFor({ all, byInst, byPos, weak, gap, drift }) {
  const tips = [];
  if (gap && gap.rest.mean != null && gap.click.mean != null) {
    const d = gap.rest.mean - gap.click.mean;
    if (Math.abs(d) >= 0.012) tips.push(`クリックが無い小節で ${Math.round(Math.abs(d) * 1000)}ms ${d < 0 ? '走って' : 'もたって'}います。頭の中で 8分や 16分を数え続けてみましょう`);
    else tips.push('クリックが無くてもテンポを保てています。休む小節を増やしてみましょう');
  }
  if (drift != null && Math.abs(drift) >= 0.012) tips.push(`後半ほど ${Math.round(Math.abs(drift) * 1000)}ms ${drift < 0 ? '走って (早くなって)' : 'もたって (遅くなって)'}います。最後まで同じ力で叩くことを意識しましょう`);
  const off = [...byInst, ...byPos].filter((x) => x.mean != null && x.hit >= 3 && Math.abs(x.mean - (all.mean ?? 0)) >= 0.012);
  off.sort((a, b) => Math.abs(b.mean - all.mean) - Math.abs(a.mean - all.mean));
  if (off[0]) tips.push(`${off[0].name}だけ他より ${Math.round(Math.abs(off[0].mean - all.mean) * 1000)}ms ${off[0].mean < all.mean ? '早い' : '遅い'}です。その音だけをゆっくり叩いて合わせてみましょう`);
  const missy = [...byPos, ...byInst].filter((x) => x.n >= 3 && x.miss / x.n >= 0.25).sort((a, b) => b.miss / b.n - a.miss / a.n);
  if (missy[0]) tips.push(`${missy[0].name}の音が抜けがちです (${missy[0].miss}/${missy[0].n})`);
  if (weak[0]) tips.push(`${weak[0].measure + 1}小節目が苦手なようです (${weak[0].score}点)。その小節だけループして練習しましょう`);
  if (all.spread != null && all.spread <= 0.01 && all.miss === 0) tips.push('ばらつき ±10ms 以内。プロのレコーディング並みの安定感です! テンポを上げてみましょう');
  else if (all.spread != null && all.spread >= 0.03) tips.push(`ばらつきが ±${Math.round(all.spread * 1000)}ms あります。テンポを 10 ほど落として、全部 Perfect を目指しましょう`);
  return tips.slice(0, 3);
}

export { ms as formatMs };
