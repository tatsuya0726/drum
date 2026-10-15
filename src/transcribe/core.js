// 曲の音からドラム譜を作る (ブラウザだけで動く簡易版)。
// 1. 短い区間ごとの周波数成分を帯域にまとめ、伸びる音 (ベース・ギター・歌) と打楽器を分ける (HPSS)
// 2. 低音 (バスドラム)・中高音 (スネア)・高音 (ハイハット) の立ち上がりの強さを求める
// 3. テンポと拍の位置を推定し (自己相関 + 動的計画法)、小節の頭を推定する
// 4. 拍を 16分 (または 3連) に分けた位置ごとに、各楽器を叩いたかを決める

import { PPQ } from '../drums.js';

export const SR = 22050;
const N = 1024;
const HOP = 256;
export const FPS = SR / HOP;
const F_MIN = 30;
const F_MAX = 11000;
const NB = 48;

// ------------------------------------------------------------ FFT

function makeFft(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j;
          const b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  };
}

function median(arr, tmp) {
  const n = arr.length;
  for (let i = 0; i < n; i++) tmp[i] = arr[i];
  const t = tmp.subarray(0, n);
  t.sort();
  return n % 2 ? t[(n - 1) / 2] : (t[n / 2 - 1] + t[n / 2]) / 2;
}

function percentile(values, p) {
  const s = Float32Array.from(values).sort();
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

// ------------------------------------------------------------ 特徴量

/**
 * @param {Float32Array} mono SR (22050Hz) のモノラル
 * @param {(p:number) => void} [progress] 0..1
 * @returns 帯域ごとの打楽器らしさの立ち上がり (フレームごと) など
 */
export function analyzeAudio(mono, progress) {
  // 音量をそろえる
  let peak = 0;
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
  const gain = peak > 0 ? 1 / peak : 1;
  // フレーム t は時刻 t / FPS を中心にした窓 (時刻と添字をそろえる)
  const frames = Math.max(1, Math.floor(mono.length / HOP));
  const fft = makeFft(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  // 周波数ビン → 帯域 (対数で等間隔)。ビンが入らない帯域は詰める
  const binBand = new Int16Array(N / 2 + 1).fill(-1);
  const raw = [];
  for (let k = 1; k <= N / 2; k++) {
    const f = (k * SR) / N;
    if (f < F_MIN || f > F_MAX) continue;
    binBand[k] = Math.min(NB - 1, Math.floor((NB * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN)));
    raw.push(binBand[k]);
  }
  const used = [...new Set(raw)].sort((a, b) => a - b);
  const remap = new Map(used.map((b, i) => [b, i]));
  for (let k = 0; k <= N / 2; k++) if (binBand[k] >= 0) binBand[k] = remap.get(binBand[k]);
  const nb = used.length;
  const center = used.map((b) => F_MIN * Math.pow(F_MAX / F_MIN, (b + 0.5) / NB));

  const B = new Float32Array(frames * nb);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let t = 0; t < frames; t++) {
    const o = t * HOP - N / 2;
    for (let i = 0; i < N; i++) {
      re[i] = (mono[o + i] ?? 0) * gain * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const row = t * nb;
    for (let k = 1; k <= N / 2; k++) {
      const b = binBand[k];
      if (b >= 0) B[row + b] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    if (progress && t % 2000 === 0) progress((0.6 * t) / frames);
  }

  // HPSS: 時間方向の中央値 = 伸びる音、帯域方向の中央値 = 打楽器
  const HT = 17;
  const HF = 5;
  const P = new Float32Array(frames * nb);
  const H = new Float32Array(frames * nb);
  const M = new Float32Array(frames * nb); // 打楽器らしさ (0..1)
  const col = new Float32Array(HT);
  const tmp = new Float32Array(Math.max(HT, HF));
  const rowv = new Float32Array(HF);
  for (let b = 0; b < nb; b++) {
    for (let t = 0; t < frames; t++) {
      let n = 0;
      for (let d = -8; d <= 8; d++) {
        const tt = t + d;
        if (tt >= 0 && tt < frames) col[n++] = B[tt * nb + b];
      }
      const h = median(col.subarray(0, n), tmp);
      let m = 0;
      for (let d = -2; d <= 2; d++) {
        const bb = b + d;
        if (bb >= 0 && bb < nb) rowv[m++] = B[t * nb + bb];
      }
      const p = median(rowv.subarray(0, m), tmp);
      const x = B[t * nb + b];
      const mask = (p * p) / (p * p + h * h + 1e-12);
      P[t * nb + b] = x * mask;
      M[t * nb + b] = mask;
      H[t * nb + b] = x * (1 - mask);
    }
    if (progress) progress(0.6 + (0.3 * (b + 1)) / nb);
  }

  // 帯域のまとまりごとの立ち上がり (対数の増え方)
  let maxP = 0;
  for (let i = 0; i < P.length; i++) maxP = Math.max(maxP, P[i]);
  const scale = maxP > 0 ? 1000 / maxP : 1;
  // 帯域ごとの立ち上がり (楽器の聞き分けに使う)
  // 元の音の増え方に、その瞬間の打楽器らしさを掛ける (ベースや和音の伸びる音の揺れを拾わない)。
  // 音色の形が残るよう、対数ではなく平方根で縮める
  let maxB = 0;
  for (let i = 0; i < B.length; i++) maxB = Math.max(maxB, B[i]);
  const bs = maxB > 0 ? 1000 / maxB : 1;
  const bandFlux = new Float32Array(frames * nb);
  for (let t = 1; t < frames; t++) {
    for (let b = 0; b < nb; b++) {
      const d = Math.sqrt(B[t * nb + b] * bs) - Math.sqrt(B[(t - 1) * nb + b] * bs);
      if (d > 0) bandFlux[t * nb + b] = d * M[t * nb + b];
    }
  }
  const ranges = { low: [30, 130], lowmid: [150, 350], mid: [1500, 5000], high: [6000, 11000] };
  const flux = {};
  const energy = {};
  for (const [name, [lo, hi]] of Object.entries(ranges)) {
    const bands = center.map((c, i) => (c >= lo && c < hi ? i : -1)).filter((i) => i >= 0);
    const f = new Float32Array(frames);
    const e = new Float32Array(frames);
    for (let t = 0; t < frames; t++) {
      let s = 0;
      let en = 0;
      for (const b of bands) {
        const cur = Math.log1p(P[t * nb + b] * scale);
        const prev = t > 0 ? Math.log1p(P[(t - 1) * nb + b] * scale) : cur;
        if (cur > prev) s += cur - prev;
        en += B[t * nb + b];
      }
      f[t] = s;
      e[t] = en;
    }
    // 曲全体のよくある大きさで割って、帯域どうしを比べやすくする
    const ref = percentile(f, 0.95) || 1;
    for (let t = 0; t < frames; t++) f[t] /= ref;
    flux[name] = f;
    energy[name] = e;
  }
  // 和音の変わり目 (伸びる音の変化)。小節の頭を決める手がかりにする
  let maxH = 0;
  for (let i = 0; i < H.length; i++) maxH = Math.max(maxH, H[i]);
  const hs = maxH > 0 ? 1000 / maxH : 1;
  const hb = center.map((c, i) => (c >= 80 && c < 2000 ? i : -1)).filter((i) => i >= 0);
  const LAG = 6;
  const harm = new Float32Array(frames);
  for (let t = LAG; t < frames; t++) {
    let s = 0;
    for (const b of hb) {
      const d = Math.log1p(H[t * nb + b] * hs) - Math.log1p(H[(t - LAG) * nb + b] * hs);
      if (d > 0) s += d;
    }
    harm[t] = s;
  }
  const href = percentile(harm, 0.95) || 1;
  for (let t = 0; t < frames; t++) harm[t] /= href;

  // テンポを求めるための全体の立ち上がり
  const env = new Float32Array(frames);
  for (let t = 0; t < frames; t++) env[t] = flux.low[t] + flux.mid[t] + flux.high[t] + 0.5 * flux.lowmid[t];
  // ゆっくりした変化を引く
  const W = Math.round(FPS * 0.4);
  const cs = new Float64Array(frames + 1);
  for (let t = 0; t < frames; t++) cs[t + 1] = cs[t] + env[t];
  const onset = new Float32Array(frames);
  for (let t = 0; t < frames; t++) {
    const a = Math.max(0, t - W);
    const b = Math.min(frames, t + W + 1);
    onset[t] = Math.max(0, env[t] - (cs[b] - cs[a]) / (b - a));
  }
  progress?.(1);
  return {
    fps: FPS,
    frames,
    duration: mono.length / SR,
    onset,
    low: flux.low,
    lowmid: flux.lowmid,
    mid: flux.mid,
    high: flux.high,
    highEnergy: energy.high,
    harm,
    bandFlux,
    centers: Float32Array.from(center),
  };
}

// ------------------------------------------------------------ テンポと拍

/** 自己相関からテンポを推定する (bpm を指定すると、その近くで探す) */
export function estimateTempo(onset, fps, { near } = {}) {
  const F = onset.length;
  const minBpm = near ? near * 0.92 : 55;
  const maxBpm = near ? near * 1.08 : 215;
  const maxLag = Math.ceil((60 * fps * 2) / minBpm) + 2;
  const ac = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let t = lag; t < F; t++) s += onset[t] * onset[t - lag];
    ac[lag] = s;
  }
  const at = (lag) => {
    const i = Math.floor(lag);
    const f = lag - i;
    return i + 1 > maxLag ? 0 : ac[i] * (1 - f) + ac[i + 1] * f;
  };
  let best = { bpm: 120, score: -Infinity };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.05) {
    const lag = (60 * fps) / bpm;
    // 倍・半分の周期も見て、拍の周期らしいものを選ぶ (速さは 120 前後を少し優先)
    const s = at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag / 2);
    const prior = near ? 1 : Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.85) ** 2);
    if (s * prior > best.score) best = { bpm, score: s * prior };
  }
  return best.bpm;
}

/** 動的計画法で拍の位置 (フレーム) を求める。テンポの小さな揺れについていく */
export function trackBeats(onset, fps, bpm) {
  const F = onset.length;
  const P = (60 * fps) / bpm;
  const alpha = 400;
  const score = new Float64Array(F);
  const back = new Int32Array(F).fill(-1);
  const lo = Math.round(P * 0.75);
  const hi = Math.round(P * 1.33);
  for (let t = 0; t < F; t++) {
    let best = 0;
    let arg = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const c = score[tau] - alpha * Math.log((t - tau) / P) ** 2;
      if (c > best) {
        best = c;
        arg = tau;
      }
    }
    score[t] = onset[t] + best;
    back[t] = arg;
  }
  // 最後の 1周期の中で一番よいところからたどる
  let end = F - 1;
  for (let t = Math.max(0, F - Math.ceil(P)); t < F; t++) if (score[t] > score[end]) end = t;
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) beats.push(t);
  beats.reverse();
  // 最初の拍より前にも、同じ間隔で拍を足す (曲の頭が静かなとき)
  while (beats.length > 1 && beats[0] - P >= 0) beats.unshift(beats[0] - P);
  return beats.map((f) => f / fps);
}

// ------------------------------------------------------------ 譜面にする

const valueAt = (arr, fps, time, w) => {
  const c = time * fps;
  let m = 0;
  for (let t = Math.floor(c - w); t <= Math.ceil(c + w); t++) if (t >= 0 && t < arr.length) m = Math.max(m, arr[t]);
  return m;
};

/** 大津の方法: 値の分布を 2つに分けるしきい値 (対数で) */
function otsu(values) {
  const v = values.filter((x) => x > 1e-4).map((x) => Math.log(x));
  if (v.length < 8) return Infinity;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const bins = 64;
  const hist = new Float64Array(bins);
  for (const x of v) hist[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo || 1)) * bins))]++;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let w0 = 0;
  let s0 = 0;
  let best = { k: bins / 2, v: -1 };
  for (let k = 0; k < bins; k++) {
    w0 += hist[k];
    s0 += k * hist[k];
    const w1 = v.length - w0;
    if (!w0 || !w1) continue;
    const m0 = s0 / w0;
    const m1 = (sum - s0) / w1;
    const between = w0 * w1 * (m0 - m1) ** 2;
    if (between > best.v) best = { k, v: between };
  }
  return Math.exp(lo + ((best.k + 1) / bins) * (hi - lo));
}

// ------------------------------------------------------------ 楽器の聞き分け

// 帯域: 低音 (バスドラムの胴)、スネアの響き (1〜5kHz の雑音)、高音 (ハイハット・シンバル)
const REGIONS = { low: [0, 130], wire: [1000, 5000], high: [6000, 20000] };

/** 時刻ごとの帯域の立ち上がりの合計 (前後 1フレームの最大) */
export function regionsAt(feat, times) {
  const nb = feat.centers.length;
  const idx = Object.fromEntries(Object.entries(REGIONS).map(([k, [lo, hi]]) => [k, [...feat.centers.keys()].filter((b) => feat.centers[b] >= lo && feat.centers[b] < hi)]));
  return times.map((t) => {
    const c = Math.round(t * feat.fps);
    const out = { low: 0, wire: 0, high: 0 };
    for (let f = c - 1; f <= c + 1; f++) {
      if (f < 0 || f >= feat.frames) continue;
      for (const k of Object.keys(out)) {
        let sum = 0;
        for (const b of idx[k]) sum += feat.bandFlux[f * nb + b];
        out[k] = Math.max(out[k], sum);
      }
    }
    return out;
  });
}

/**
 * 拍の位置と特徴量から小節ごとの譜面を作る (4/4 拍子)
 * @param {object} feat analyzeAudio の結果
 * @param {number[]} beats 拍の時刻 (秒)
 * @param {{ shift?: number, sensitivity?: number }} opts shift = 小節の頭を何拍ずらすか (自動の結果からの差)
 * @returns {{ bars: Array<{ start:number, end:number, grid:number, notes:Array }>, downbeat:number }}
 */
export function transcribe(feat, beats, { shift = 0, sensitivity = 0.5 } = {}) {
  const fps = feat.fps;
  const nBeats = beats.length;
  if (nBeats < 5) return { bars: [], downbeat: 0 };
  const beatEnd = (b) => (b + 1 < nBeats ? beats[b + 1] : beats[b] + (beats[b] - beats[b - 1]));

  // 拍ごとに 16分 (4つ) と 3連 (3つ) の位置の楽器の強さを求める
  const pos = [];
  for (let b = 0; b < nBeats; b++) {
    const s = beats[b];
    const d = beatEnd(b) - s;
    for (const k of [0, 1, 2, 3]) pos.push({ b, grid: 4, k, time: s + (k * d) / 4 });
    for (const k of [1, 2]) pos.push({ b, grid: 3, k, time: s + (k * d) / 3 });
  }
  const reg = regionsAt(
    feat,
    pos.map((p) => p.time),
  );
  // 曲ごとの音量の違いをならす (上位の値で割る)
  const ref = {};
  for (const k of ['low', 'wire', 'high']) ref[k] = percentile(reg.map((r) => r[k]), 0.97) || 1;
  pos.forEach((p, i) => {
    const r = reg[i];
    const low = r.low / ref.low;
    const wire = r.wire / ref.wire;
    // バスドラムは低音が強い (スネアの音にも少し低音があるので、1〜5kHz と比べる)
    p.kick = low >= 0.35 * wire ? low : 0;
    // スネアは 1〜5kHz の雑音が強く、低音は弱い (低音も強いならバスドラムのアタック)
    p.snare = low < 0.6 * wire ? wire : 0;
    p.hat = r.high / ref.high;
  });
  const at = new Map(pos.map((p) => [`${p.b}:${p.grid}:${p.k}`, p]));
  const beatPos = (b) => at.get(`${b}:4:0`);

  // 小節の頭: 1・3拍目にバスドラム、2・4拍目にスネアが来て、和音やクラッシュが変わる位置を選ぶ
  const harmB = beats.map((t) => valueAt(feat.harm, fps, t + 3 / fps, 4));
  // クラッシュらしさ: 高い音が 0.2〜0.35秒後も (間の一番小さい所でも) 半分近く残っている
  const he = feat.highEnergy;
  // (次の音の響きと間違えないよう、その間に強い立ち上がりがあるときは数えない)
  const sustainAt = (t) => {
    const f0 = Math.round(t * fps);
    let peak = 0;
    let rise = 0;
    for (let f = f0 - 1; f <= f0 + 3; f++) {
      peak = Math.max(peak, he[f] ?? 0);
      rise = Math.max(rise, feat.high[f] ?? 0);
    }
    for (let f = f0 + 4; f <= f0 + Math.round(0.35 * fps); f++) if ((feat.high[f] ?? 0) > rise * 0.5) return 0;
    let low = Infinity;
    for (let f = f0 + Math.round(0.2 * fps); f <= f0 + Math.round(0.35 * fps); f++) low = Math.min(low, he[f] ?? 0);
    return peak > 0 ? low / peak : 0;
  };
  const crashB = beats.map((t) => (sustainAt(t) > 0.4 ? 1 : 0));
  const kmax = 1;
  const smax = 1;
  let downbeat = 0;
  let bestS = -Infinity;
  for (let p = 0; p < 4; p++) {
    let sc = 0;
    for (let b = 0; b < nBeats; b++) {
      const r = (((b - p) % 4) + 4) % 4;
      const k = beatPos(b).kick / kmax;
      const sn = beatPos(b).snare / smax;
      if (r === 0) sc += k - 0.5 * sn + harmB[b] + 2 * crashB[b];
      else if (r === 2) sc += 0.5 * k + 0.3 * harmB[b];
      else sc += sn - 0.3 * k;
    }
    if (sc > bestS) {
      bestS = sc;
      downbeat = p;
    }
  }
  downbeat = (((downbeat + shift) % 4) + 4) % 4;

  // 楽器ごとのしきい値 (曲全体の分布から自動で決める)
  const k = Math.pow(2, (0.5 - sensitivity) * 2); // 感度が高いほどしきい値を下げる
  // 「鳴っていない」と「叩いた」を分ける (曲全体の分布から)。小さすぎる値は除く
  // ハイハットは他の音より小さいことが多いので下限を低めにする
  const floor = { kick: 0.3, snare: 0.3, hat: 0.1 };
  // バスドラムとスネアは、まず「何か鳴った所」を選び、その中でもう一度分ける
  // (ハイハットやベースから漏れてくる中くらいの値を、本当に叩いた音と分けるため)
  const thrOf = (key) => {
    const v = pos.map((p) => p[key]);
    let t = Math.max(otsu(v), floor[key]);
    if (key !== 'hat') {
      const cand = v.filter((x) => x >= t);
      const t2 = otsu(cand);
      // 上の組が少なすぎるとき (=ほとんど全部が本当の音) は分けない
      if (Number.isFinite(t2) && cand.filter((x) => x >= t2).length >= cand.length * 0.15 && t2 < 0.6) t = Math.max(t, t2);
    }
    return t * k;
  };
  const thr = { kick: thrOf('kick'), snare: thrOf('snare'), hat: thrOf('hat') };

  const bars = [];
  for (let b0 = downbeat; b0 + 4 <= nBeats; b0 += 4) {
    // 3連の位置の方が明らかに強い小節は 3連で書く
    let trip = 0;
    let six = 0;
    let half = 0;
    for (let b = b0; b < b0 + 4; b++) {
      const m = (p) => Math.min(1.5, p.kick / thr.kick) + Math.min(1.5, p.snare / thr.snare) + Math.min(1.5, p.hat / thr.hat);
      trip += m(at.get(`${b}:3:1`)) + m(at.get(`${b}:3:2`));
      six += m(at.get(`${b}:4:1`)) + m(at.get(`${b}:4:3`));
      half += m(at.get(`${b}:4:2`));
    }
    // 3連: 3連の位置に音があり、16分の位置や 8分の裏にはほとんど無い
    const grid = trip > 2 && trip > six * 1.5 && trip > half * 1.5 ? 3 : 4;
    const notes = [];
    for (let b = b0; b < b0 + 4; b++) {
      for (let kk = 0; kk < grid; kk++) {
        const p = kk === 0 ? beatPos(b) : at.get(`${b}:${grid}:${kk}`);
        const tick = (b - b0) * PPQ + (kk * PPQ) / grid;
        if (p.kick >= thr.kick) notes.push({ tick, inst: 'kick', vel: 1 });
        if (p.snare >= thr.snare) {
          // 拍の頭でない弱い音はゴーストノートにする
          const ghost = kk !== 0 && p.snare < thr.snare * 1.6;
          notes.push({ tick, inst: 'snare', vel: ghost ? 0.45 : 1 });
        }
        if (p.hat >= thr.hat) {
          // 強く、そのあと高い音が長く残るものはクラッシュ
          // 曲の中でも特に強い高音で、そのあとも長く響くものはクラッシュ
          const crash = p.hat >= thr.hat * 2 && sustainAt(p.time) > 0.3;
          notes.push({ tick, inst: crash ? 'crash' : 'hhc', vel: 1 });
        }
      }
    }
    fillHats(notes, grid, (tick) => {
      const b = b0 + Math.floor(tick / PPQ);
      const kk = Math.round(((tick % PPQ) / PPQ) * grid);
      return (kk === 0 ? beatPos(b) : at.get(`${b}:${grid}:${kk}`)).hat / thr.hat;
    });
    bars.push({ start: beats[b0], end: beatEnd(b0 + 3), grid, notes });
  }
  return { bars, downbeat, thresholds: thr };
}

/**
 * ハイハットは同じ間隔で刻むことが多い。8分 (または 16分・3連) の刻みがほぼそろっている小節では、
 * スネアなどに隠れて弱く見えた所も埋める
 */
function fillHats(notes, grid, strength) {
  const has = new Set(notes.filter((n) => n.inst === 'hhc' || n.inst === 'crash').map((n) => n.tick));
  const steps = grid === 3 ? [PPQ / 3] : [PPQ / 4, PPQ / 2];
  for (const step of steps) {
    const ticks = Array.from({ length: (4 * PPQ) / step }, (_, i) => i * step);
    const hit = ticks.filter((t) => has.has(t)).length;
    if (hit >= ticks.length * 0.7 && hit < ticks.length) {
      for (const t of ticks) if (!has.has(t) && strength(t) >= 0.35) notes.push({ tick: t, inst: 'hhc', vel: 1 });
      break;
    }
  }
  notes.sort((a, b) => a.tick - b.tick);
}

/** 小節の区間の平均テンポ */
export function barsBpm(bars) {
  if (!bars.length) return 120;
  const dur = bars[bars.length - 1].end - bars[0].start;
  return (240 * bars.length) / dur;
}

