// 録音した音から「叩いた瞬間」(アタック) を検出する

/**
 * @param {Float32Array} samples モノラル PCM
 * @param {number} sampleRate
 * @param {object} [opt]
 * @param {number} [opt.minInterval] 連続した検出の最小間隔 (秒)
 * @param {number} [opt.sensitivity] 0..1 (大きいほど小さい音も拾う)
 * @returns {Array<{ time: number, level: number }>} time は先頭からの秒、level は 0..1 (最大音量比)
 */
export function detectOnsets(samples, sampleRate, opt = {}) {
  const minInterval = opt.minInterval ?? 0.045;
  const sensitivity = opt.sensitivity ?? 0.5;
  const hop = Math.max(32, Math.round(sampleRate * 0.0025)); // 2.5ms
  const win = hop * 4; // 10ms
  const n = Math.floor((samples.length - win) / hop);
  if (n <= 2) return [];

  // 低域のゴロゴロ (足音・エアコン) を除くため一次ハイパス (約 60Hz)
  const hp = new Float32Array(samples.length);
  const a = Math.exp((-2 * Math.PI * 60) / sampleRate);
  let prevX = 0, prevY = 0;
  for (let i = 0; i < samples.length; i++) {
    const y = a * (prevY + samples[i] - prevX);
    hp[i] = y;
    prevX = samples[i];
    prevY = y;
  }

  // フレームごとのエネルギー (dB)
  const env = new Float32Array(n);
  let peak = 1e-9;
  for (let f = 0; f < n; f++) {
    let s = 0;
    const o = f * hop;
    for (let k = 0; k < win; k++) s += hp[o + k] * hp[o + k];
    const rms = Math.sqrt(s / win);
    env[f] = rms;
    if (rms > peak) peak = rms;
  }
  const db = Array.from(env, (v) => 20 * Math.log10(v / peak + 1e-9));

  // 立ち上がり (前のフレームとの差) が大きく、かつ十分な大きさのフレーム
  const floorDb = -24 - sensitivity * 24; // 最大音量から -24〜-48dB まで
  const riseDb = 7 - sensitivity * 5;
  const lookback = Math.round(0.02 / (hop / sampleRate)); // 20ms 前と比べる
  const out = [];
  let last = -Infinity;
  for (let f = lookback; f < n - 1; f++) {
    if (db[f] < floorDb) continue;
    let minPrev = Infinity;
    for (let k = 1; k <= lookback; k++) minPrev = Math.min(minPrev, db[f - k]);
    if (db[f] - minPrev < riseDb) continue;
    // 立ち上がりの頂点まで進める (同じアタックを何度も数えない)
    let g = f;
    while (g + 1 < n && db[g + 1] > db[g]) g++;
    const t = onsetTime(hp, f * hop, (g + 4) * hop, sampleRate);
    if (t - last >= minInterval) {
      out.push({ time: t, level: Math.pow(10, db[g] / 20) });
      last = t;
    }
    f = g + Math.round(minInterval / (hop / sampleRate) / 2);
  }
  return out;
}

/** アタックの開始時刻: 直前の残響より大きく、ピークの 30% を最初に超えたサンプル */
function onsetTime(x, from, to, sampleRate) {
  const start = Math.max(0, from - 256);
  const end = Math.min(x.length, to);
  let pk = 0;
  for (let i = start; i < end; i++) pk = Math.max(pk, Math.abs(x[i]));
  let pre = 0;
  for (let i = Math.max(0, start - 256); i < start; i++) pre = Math.max(pre, Math.abs(x[i]));
  const th = Math.max(pk * 0.3, Math.min(pk * 0.8, pre * 1.3));
  for (let i = start; i < end; i++) if (Math.abs(x[i]) >= th) return i / sampleRate;
  return from / sampleRate;
}
