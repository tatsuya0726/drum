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

// 拍の中の位置ごとの置かれやすさ。1拍を slotsPerBeat 個に分けたときの位置 (拍内の割合) で決める。
// 3連の位置は普通の位置より少しだけ選ばれにくくして、どちらとも取れるときは普通のリズムにする
function positionPenalty(slot, slotsPerBeat) {
  const r = slot % slotsPerBeat;
  if (r === 0) return 0;
  const f = r / slotsPerBeat;
  const is = (den) => Math.abs(f * den - Math.round(f * den)) < 1e-9;
  if (is(2)) return 0.25;
  if (is(4)) return 0.7;
  if (is(3)) return 1.6;
  if (is(8)) return 0.7;
  if (is(6)) return 2.2;
  return Infinity;
}

// よく使う音価ほど選ばれやすい
function durationPenalty(d, slotsPerBeat) {
  const q = (d * 4) / slotsPerBeat; // 16分音符いくつ分か
  if ([1, 2, 3, 4, 6, 8, 12, 16].some((v) => Math.abs(q - v) < 1e-9)) return 0;
  const t = (d * 3) / slotsPerBeat; // 3連8分いくつ分か
  if ([0.5, 1, 2].some((v) => Math.abs(t - v) < 1e-9)) return 0.6;
  return 0.6;
}

/**
 * 小節内の発音位置 xs (昇順) にスロット番号を割り当てる。
 * @param {number[]} xs 発音位置の x 座標
 * @param {object} m { start: 1拍目に相当する x (なければ null), end: 小節の右端 x }
 * @param {number} slots 小節内のスロット数 (4/4 の16分なら 16)
 * @param {number} slotsPerBeat 1拍あたりのスロット数
 * @param {number} space 五線の間隔 (px)
 */
/**
 * values[i]: 連桁・旗から読んだ音価 (スロット数)。null なら不明。
 * 次の音までの長さが音価と同じなら自然、長ければ (後ろに休符がある) 少し不自然、短ければありえない
 */
function straightValuePenalty(v, d) {
  if (d === v) return 0;
  if (d === v * 1.5) return 0.4; // 付点
  if (d > v) return 1.2;
  return 9;
}

// triplets のときは、連桁の本数が同じ 3連符 (長さ 2/3) とも読める
function valuePenalty(v, d, triplets, slotsPerBeat) {
  if (v == null) return 0;
  const p = straightValuePenalty(v, d);
  // 3連の4分音符はまれなので、連桁・旗のある音符だけ 3連とも読む
  if (!triplets || v >= slotsPerBeat) return p;
  const tv = (v * 2) / 3;
  if (!Number.isInteger(tv)) return p;
  const tp = d === tv ? 1.0 : d > tv && d % tv === 0 ? 1.2 : 9;
  return Math.min(p, tp);
}

export function assignSlots(xs, m, slots, slotsPerBeat, space, values = [], { triplets = false, unit = 1 } = {}) {
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
  // 音が1つだけの小節 (全音符など) は中央寄りに書かれることがあるので、よほど離れていなければ1拍目とみなす
  const allowLeadRest = m.start != null && lead > space * (n === 1 ? 4 : 1.2);

  const logGaps = gaps.map((g) => Math.log(g));
  const leadLog = allowLeadRest ? Math.log(lead) : 0;
  const sigma = 0.16;
  const alphas = [0.35, 0.5, 0.7, 0.9, 1.2, 1.6];
  const minLog = Math.min(...logGaps, allowLeadRest ? leadLog : Infinity) - Math.log(1 + 1.6 * Math.log2(slots / unit));
  const maxLog = Math.max(...logGaps);
  const bSteps = 36;

  const endWeight = triplets ? 0.3 : 1;
  const posPen = Array.from({ length: slots }, (_, t) => positionPenalty(t, slotsPerBeat));
  let best = { cost: Infinity, slotsOut: null };
  const INF = Infinity;
  for (const alpha of alphas) {
    const logS = new Float64Array(slots + 1);
    // unit スロットを基準の長さ (間隔の増え始め) とする
    for (let d = 1; d <= slots; d++) logS[d] = Math.log(Math.max(0.05, 1 + (alpha * Math.log(d / unit)) / LOG2));
    for (let bi = 0; bi <= bSteps; bi++) {
      const logB = minLog + ((maxLog - minLog) * bi) / bSteps;
      // dp[i][s] = 発音 i をスロット s に置いたときの最小コスト
      const dp = new Float64Array(n * slots).fill(INF);
      const prev = new Int16Array(n * slots).fill(-1);
      for (let s = 0; s < slots; s++) {
        let c;
        if (s === 0) c = allowLeadRest ? 2.0 : 0;
        else if (allowLeadRest && posPen[s] !== Infinity) c = ((leadLog - logB - logS[s]) / sigma) ** 2 + posPen[s] + 0.5;
        else continue;
        dp[s] = c;
      }
      for (let i = 0; i + 1 < n; i++) {
        for (let s = 0; s < slots; s++) {
          const base = dp[i * slots + s];
          if (base === INF) continue;
          for (let t = s + 1; t < slots; t++) {
            if (posPen[t] === Infinity) continue;
            const d = t - s;
            const c =
              base +
              ((logGaps[i] - logB - logS[d]) / sigma) ** 2 +
              posPen[t] +
              durationPenalty(d, slotsPerBeat) +
              valuePenalty(values[i], d, triplets, slotsPerBeat);
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
        // 最後の音から小節線までの間隔は楽譜ソフトによってまちまちなので、3連符もありうるときは弱めに見る
        const c = base + endWeight * ((logGaps[n - 1] - logB - logS[d]) / sigma) ** 2 + durationPenalty(d, slotsPerBeat) * 0.5 + valuePenalty(values[n - 1], d, triplets, slotsPerBeat);
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
  // 当てはまる並べ方が見つからないときは等間隔で丸める
  return best.slotsOut ?? xs.map((_, i) => Math.min(slots - 1, Math.round((i * slots) / n)));
}
