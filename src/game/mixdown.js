// 聞き返し用の音声を、採点に使ったのと同じ録音 (PCM) から作る。
// マイクの音はタイミング補正の分だけ前にずらし、メトロノームは鳴らした予定の時刻にぴったり置くので、
// 聞こえるずれ = 採点で見たずれ になる。

/**
 * @param {object} p
 * @param {Float32Array} p.pcm マイクの音 (sampleRate)
 * @param {number} p.sampleRate
 * @param {number} p.pcmStart pcm[0] の時刻 (AudioContext の時計)
 * @param {number} p.latency タイミング補正 (秒)
 * @param {Array<{time:number, accent:boolean}>} p.clicks メトロノームの時刻 (AudioContext の時計)。空なら入れない
 * @returns {Blob} WAV
 */
export function mixdownTake({ pcm, sampleRate, pcmStart, latency, clicks }) {
  // 少し軽くするため 44.1/48kHz は半分に落とす (ドラムの確認には十分)
  const down = sampleRate >= 44100 ? 2 : 1;
  const sr = sampleRate / down;
  const shift = Math.round(latency * sampleRate);
  const n = Math.max(1, Math.floor((pcm.length - Math.max(0, shift)) / down));
  const out = new Float32Array(n);
  // マイクの音: 補正の分だけ前へ
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < down; k++) s += pcm[i * down + k + shift] ?? 0;
    out[i] = s / down;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  // 小さく録れていたら持ち上げる
  const gain = peak > 0 ? Math.min(8, 0.8 / peak) : 1;
  for (let i = 0; i < n; i++) out[i] *= gain;
  // メトロノーム: アプリのクリックと同じような短いサイン波
  for (const c of clicks ?? []) {
    const at = Math.round((c.time - pcmStart) * sr);
    const f = c.accent ? 1760 : 1175;
    const amp = c.accent ? 0.5 : 0.32;
    const len = Math.round(0.06 * sr);
    for (let k = 0; k < len; k++) {
      const i = at + k;
      if (i < 0 || i >= n) continue;
      const env = Math.exp(-k / (0.012 * sr)) * Math.min(1, k / (0.001 * sr));
      out[i] += amp * env * Math.sin((2 * Math.PI * f * k) / sr);
    }
  }
  return encodeWav(out, sr);
}

function encodeWav(samples, sr) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}
