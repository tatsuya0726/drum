// 符頭の横位置から各音の拍位置を推定する。
// 楽譜ソフトは「音価が倍になると間隔が一定量増える」(対数的な)スペーシングで
// 音符を並べるので、音と音の間隔から音価を逆算し、小節の長さに合うように割り当てる。

const LOG2 = Math.log(2);

/** 同時に鳴る符頭をまとめて「発音位置」の列にする */
export function clusterOnsets(notes, space) {
  const sorted = [...notes].sort((a, b) => a.x - b.x);
  const clusters = [];
  for (const n of sorted) {
    const last = clusters[clusters.length - 1];
    // 2度の同時打ちは符頭が左右にずれて書かれる (段差1つ・符頭1個分の距離)
    const shifted =
      last && n.x - last.x0 <= space * 1.6 && last.notes.some((m) => Math.abs(m.step - n.step) === 1 && Math.abs(m.y - n.y) < space);
    if (last && (n.x - last.x0 <= space * 0.55 || shifted)) {
      last.notes.push(n);
      last.x = last.notes.reduce((s, m) => s + m.x, 0) / last.notes.length;
    } else {
      clusters.push({ x0: n.x, x: n.x, notes: [n] });
    }
  }
  return clusters;
}

// 拍の頭ほど音が置かれやすい (16分グリッド、1拍=4スロット想定)
function positionPenalty(slot, slotsPerBeat) {
  if (slot % slotsPerBeat === 0) return 0;
  if (slotsPerBeat % 2 === 0 && slot % (slotsPerBeat / 2) === 0) return 0.25;
  return 0.7;
}

// よく使う音価ほど選ばれやすい
function durationPenalty(d, slotsPerBeat) {
  const common = new Set([1, 2, 3, 4, 6, 8, 12, 16].map((v) => (v * slotsPerBeat) / 4));
  return common.has(d) ? 0 : 0.6;
}

/**
 * 小節内の発音位置 xs (昇順) にスロット番号を割り当てる。
 * @param {number[]} xs 発音位置の x 座標
 * @param {object} m { start: 1拍目に相当する x (なければ null), end: 小節の右端 x }
 * @param {number} slots 小節内のスロット数 (4/4 の16分なら 16)
 * @param {number} slotsPerBeat 1拍あたりのスロット数
 * @param {number} space 五線の間隔 (px)
 */
export function assignSlots(xs, m, slots, slotsPerBeat, space) {
  const n = xs.length;
  if (n === 0) return [];
  if (n > slots) {
    // グリッドより音が多い: 等間隔で丸める
    return xs.map((_, i) => Math.min(slots - 1, Math.round((i * slots) / n)));
  }
  // 各発音から次の発音(最後は小節線)までの距離
  const gaps = [];
  for (let i = 0; i < n; i++) gaps.push(Math.max(space * 0.3, (i + 1 < n ? xs[i + 1] : m.end + space * 0.55) - xs[i]));
  const lead = m.start == null ? 0 : xs[0] - m.start;
  const allowLeadRest = m.start != null && lead > space * 1.2;

  const logGaps = gaps.map((g) => Math.log(g));
  const leadLog = allowLeadRest ? Math.log(lead) : 0;
  const sigma = 0.16;
  const alphas = [0.35, 0.5, 0.7, 0.9, 1.2, 1.6];
  const minLog = Math.min(...logGaps, allowLeadRest ? leadLog : Infinity) - Math.log(1 + 1.6 * Math.log2(slots));
  const maxLog = Math.max(...logGaps);
  const bSteps = 36;

  let best = { cost: Infinity, slotsOut: null };
  const INF = Infinity;
  for (const alpha of alphas) {
    const logS = new Float64Array(slots + 1);
    for (let d = 1; d <= slots; d++) logS[d] = Math.log(1 + (alpha * Math.log(d)) / LOG2);
    for (let bi = 0; bi <= bSteps; bi++) {
      const logB = minLog + ((maxLog - minLog) * bi) / bSteps;
      // dp[i][s] = 発音 i をスロット s に置いたときの最小コスト
      const dp = new Float64Array(n * slots).fill(INF);
      const prev = new Int16Array(n * slots).fill(-1);
      for (let s = 0; s < slots; s++) {
        let c;
        if (s === 0) c = allowLeadRest ? 2.0 : 0;
        else if (allowLeadRest) c = ((leadLog - logB - logS[s]) / sigma) ** 2 + positionPenalty(s, slotsPerBeat) + 0.5;
        else continue;
        dp[s] = c;
      }
      for (let i = 0; i + 1 < n; i++) {
        for (let s = 0; s < slots; s++) {
          const base = dp[i * slots + s];
          if (base === INF) continue;
          for (let t = s + 1; t < slots; t++) {
            const d = t - s;
            const c =
              base +
              ((logGaps[i] - logB - logS[d]) / sigma) ** 2 +
              positionPenalty(t, slotsPerBeat) +
              durationPenalty(d, slotsPerBeat);
            const k = (i + 1) * slots + t;
            if (c < dp[k]) {
              dp[k] = c;
              prev[k] = s;
            }
          }
        }
      }
      // 最後の音から小節末まで
      for (let s = 0; s < slots; s++) {
        const base = dp[(n - 1) * slots + s];
        if (base === INF) continue;
        const d = slots - s;
        const c = base + ((logGaps[n - 1] - logB - logS[d]) / sigma) ** 2 + durationPenalty(d, slotsPerBeat) * 0.5;
        if (c < best.cost) {
          const out = new Array(n);
          let cur = s;
          for (let i = n - 1; i >= 0; i--) {
            out[i] = cur;
            cur = prev[i * slots + cur];
          }
          best = { cost: c, slotsOut: out };
        }
      }
    }
  }
  return best.slotsOut;
}
