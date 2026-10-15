import { SR } from '../../src/transcribe/core.js';

// テスト用の曲を合成する: ドラム + ベース + 和音 (伸びる音)
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
export function synthSong({ bpm, bars, lead = 0.83, pattern, swing = false, others = true }) {
  const beat = 60 / bpm;
  const len = Math.ceil((lead + bars * 4 * beat + 1) * SR);
  const out = new Float32Array(len);
  const rand = rng(7);
  const add = (t0, dur, fn) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < dur * SR && s0 + i < len; i++) out[s0 + i] += fn(i / SR);
  };
  // バスドラム: 下がっていく低い音 + 叩いた瞬間の短いアタック
  const kick = (t) => Math.sin(2 * Math.PI * (50 * t + 70 * 0.03 * (1 - Math.exp(-t / 0.03)))) * Math.exp(-t / 0.18) * 0.9 + rand() * 0.25 * Math.exp(-t / 0.004);
  // 1次の高域通過 (cut の周波数より下を弱める)
  const makeHp = (cut) => {
    const a = Math.exp((-2 * Math.PI * cut) / SR);
    let prevX = 0;
    let prevY = 0;
    return (x) => {
      const y = a * (prevY + x - prevX);
      prevX = x;
      prevY = y;
      return y;
    };
  };
  // スネア: 200Hz 付近の胴の音 + 1kHz より上のスナッピー (雑音)
  const snHp1 = makeHp(1000);
  const snHp2 = makeHp(1000);
  const snare = (t) => snHp2(snHp1(rand())) * 0.5 * Math.exp(-t / 0.07) + Math.sin(2 * Math.PI * 200 * t) * 0.5 * Math.exp(-t / 0.07);
  // ハイハット・クラッシュ: 6kHz より上の雑音
  const hh1 = makeHp(6000);
  const hh2 = makeHp(6000);
  const hh3 = makeHp(6000);
  const hat = (t) => hh3(hh2(hh1(rand()))) * 6 * Math.exp(-t / 0.035);
  const cr1 = makeHp(4000);
  const cr2 = makeHp(4000);
  const crash = (t) => cr2(cr1(rand())) * 0.5 * Math.exp(-t / 0.9);
  const expected = [];
  for (let b = 0; b < bars; b++) {
    for (const [inst, steps] of Object.entries(pattern(b))) {
      for (const st of steps) {
        const sub = swing ? 3 : 4;
        const t = lead + (b * 4 + st / sub) * beat;
        expected.push({ bar: b, inst, step: st });
        add(t, inst === 'crash' ? 1.5 : 0.4, { kick, snare, hhc: hat, crash }[inst]);
      }
    }
    if (others) {
      // ベース: 1拍ごとに音が変わる伸びる音 / 和音: 1小節ずっと
      const roots = [55, 65.4, 73.4, 49];
      for (let k = 0; k < 4; k++) {
        const f = roots[(b + k) % 4];
        add(lead + (b * 4 + k) * beat, beat, (t) => Math.sin(2 * Math.PI * f * t) * 0.35 * Math.min(1, t / 0.02));
      }
      const chord = [261.6, 329.6, 392, 523.3].map((f) => f * (b % 2 ? 1.122 : 1));
      add(lead + b * 4 * beat, 4 * beat, (t) => chord.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t), 0) * 0.06 * Math.min(1, t / 0.05));
    }
  }
  return { mono: out, expected, lead, beat };
}

