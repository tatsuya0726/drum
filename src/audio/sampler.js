// 生ドラムのサンプル音源 (Virtuosity Drums / CC0、メタル用バスドラムのみ BJA Pacific / CC BY-SA 3.0 US)。読み込み前や失敗時は合成音で鳴らす。

const BASE = 'sounds/';

// 楽器ごとのファイル・音量 (dB)・再生速度 (ピッチ)
const KIT = {
  kick: { file: 'virtuosity/kick-mid', gain: -1 },
  snare: { file: 'virtuosity/snare', gain: -2 },
  rim: { file: 'virtuosity/rim', gain: 0 },
  hhc: { file: 'virtuosity/hhc', gain: 7 },
  hho: { file: 'virtuosity/hho', gain: 5 },
  hhp: { file: 'virtuosity/hhp', gain: 10 },
  tom1: { file: 'virtuosity/tom1', gain: 0 },
  tom2: { file: 'virtuosity/tom3', gain: 0, rate: 1.19 }, // ロータムの音を少し高くしてミドルタムに
  tom3: { file: 'virtuosity/tom3', gain: 0 },
  ride: { file: 'virtuosity/ride', gain: 6 },
  crash: { file: 'virtuosity/crash', gain: 2 },
};
const VARIANTS = 2;

// バスドラムの音色: 'mid' はスマホのスピーカーでも聞こえるように中音域を強調した音、'natural' は録音そのまま、
// 'metal' は BJA Pacific キット (CC BY-SA 3.0 US) のタイトでアタックの強い音
const KICK_TONES = {
  mid: { file: 'virtuosity/kick-mid', gain: -1 },
  metal: { file: 'bja-pacific/kick-metal', gain: -1 },
  natural: { file: 'virtuosity/kick', gain: 0 },
};
const ALL_FILES = new Set([...Object.values(KIT).map((k) => k.file), ...Object.values(KICK_TONES).map((k) => k.file)]);

/** MP3 の先頭の無音 (エンコーダ遅延) を取り除く */
function trimLeadingSilence(ctx, buf) {
  const ch = buf.getChannelData(0);
  let start = 0;
  while (start < ch.length && Math.abs(ch[start]) < 0.002) start++;
  start = Math.max(0, start - Math.round(buf.sampleRate * 0.001));
  if (start === 0) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length - start, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(start), c);
  return out;
}

export class SampleKit {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.buffers = {};
    this.counter = 0;
    this.openHat = null;
    this.ready = this.load();
  }

  async load() {
    await Promise.all(
      [...ALL_FILES].flatMap((file) =>
        Array.from({ length: VARIANTS }, async (_, i) => {
          const url = new URL(`${BASE}${file}-${i + 1}.mp3`, document.baseURI);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${url}: ${res.status}`);
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          (this.buffers[file] ??= [])[i] = trimLeadingSilence(this.ctx, buf);
        }),
      ),
    );
    return true;
  }

  setKickTone(tone) {
    KIT.kick = { ...(KICK_TONES[tone] ?? KICK_TONES.mid) };
  }

  has(inst) {
    const def = KIT[inst];
    return !!(def && this.buffers[def.file]?.filter(Boolean).length === VARIANTS);
  }

  chokeHat(t) {
    if (this.openHat) {
      const { gain, src } = this.openHat;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, 0.015);
      src.stop(t + 0.15);
      this.openHat = null;
    }
  }

  play(inst, t, vel = 1, level = 1) {
    const def = KIT[inst];
    const bufs = this.buffers[def.file];
    // 同じ音が続くと機械的に聞こえるので、テイクを交互に使う
    const buf = bufs[this.counter++ % VARIANTS];
    if (inst === 'hhc' || inst === 'hhp' || inst === 'hho') this.chokeHat(t);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = def.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = 10 ** (def.gain / 20) * vel * level;
    src.connect(gain).connect(this.out);
    src.start(t);
    if (inst === 'hho') this.openHat = { src, gain };
  }
}
