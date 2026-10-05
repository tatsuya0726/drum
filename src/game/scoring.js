// 叩いたタイミングを手本と比べて採点する

export const WINDOWS = { perfect: 0.025, great: 0.05, good: 0.09 };

/**
 * @param {number[]} expected 手本の発音時刻 (秒, 昇順)
 * @param {Array<{time:number}>} hits 検出した打音 (秒, 昇順)。遅延補正済みであること
 * @returns {{ score, rank, counts, extra, meanOffset, spread, judgments }}
 *   judgments[i] = { expected, offset (秒, 正なら遅い) | null, grade: 'perfect'|'great'|'good'|'miss' }
 */
export function scoreTake(expected, hits) {
  const used = new Set();
  const judgments = expected.map((t) => ({ expected: t, offset: null, grade: 'miss' }));
  // 近いものから順に対応づける (1つの打音は1つの音符にだけ使う)
  const pairs = [];
  expected.forEach((t, i) => {
    hits.forEach((h, j) => {
      const d = h.time - t;
      if (Math.abs(d) <= WINDOWS.good) pairs.push({ i, j, d });
    });
  });
  pairs.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  const done = new Set();
  for (const p of pairs) {
    if (done.has(p.i) || used.has(p.j)) continue;
    done.add(p.i);
    used.add(p.j);
    const ad = Math.abs(p.d);
    judgments[p.i].offset = p.d;
    judgments[p.i].grade = ad <= WINDOWS.perfect ? 'perfect' : ad <= WINDOWS.great ? 'great' : 'good';
  }
  const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  for (const j of judgments) counts[j.grade]++;
  const extra = hits.length - used.size;

  const total = expected.length || 1;
  const points = counts.perfect * 1 + counts.great * 0.8 + counts.good * 0.45;
  // 余計な打音は少しだけ減点 (1つにつき 0.3 音分、最大で 3割)
  const penalty = Math.min(total * 0.3, extra * 0.3);
  const score = Math.max(0, Math.round(((points - penalty) / total) * 100));

  const offsets = judgments.filter((j) => j.offset != null).map((j) => j.offset);
  const meanOffset = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
  const spread = offsets.length > 1 ? Math.sqrt(offsets.reduce((a, b) => a + (b - meanOffset) ** 2, 0) / offsets.length) : 0;

  return { score, rank: rankOf(score), counts, extra, meanOffset, spread, judgments };
}

export function rankOf(score) {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export function starsOf(score) {
  return score >= 92 ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0;
}

/** 遅延補正の計測: クリックの時刻と検出した打音の差の中央値 */
export function estimateLatency(clickTimes, hits) {
  const diffs = [];
  for (const c of clickTimes) {
    let best = null;
    for (const h of hits) {
      const d = h.time - c;
      if (d > -0.05 && d < 0.4 && (best == null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best != null) diffs.push(best);
  }
  if (diffs.length < Math.ceil(clickTimes.length / 2)) return null;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}
