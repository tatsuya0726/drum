// 練習用フレーズ集。パターン文字列は 1小節ごと ("|" で区切る)、x = 叩く、g = ゴーストノート (弱く)。
// 1小節の文字数でマス目が決まる: 16 = 16分、12 = 3連8分、24 = 3連16分、32 = 32分

const BAR = 192; // 4/4 の1小節の tick 数

const P = (spec) => {
  const bars = Math.max(...Object.values(spec).map((s) => s.split('|').length));
  const measures = Array.from({ length: bars }, () => ({ grid: 4, notes: [] }));
  for (const [inst, str] of Object.entries(spec)) {
    str.split('|').forEach((bar, i) => {
      const step = BAR / bar.length;
      [...bar].forEach((c, k) => {
        if (c === 'x' || c === 'g') measures[i].notes.push({ tick: k * step, inst, vel: c === 'g' ? 0.45 : 1 });
      });
    });
  }
  for (const m of measures) {
    m.notes.sort((a, b) => a.tick - b.tick);
    // 編集用のマス目は一番細かい音に合わせる
    if (m.notes.some((n) => n.tick % 12)) {
      m.grid = m.notes.every((n) => n.tick % 16 === 0) ? 3 : m.notes.every((n) => n.tick % 8 === 0) ? 6 : 8;
    }
  }
  return measures;
};

const E8 = 'x.x.x.x.x.x.x.x.';
const E16 = 'xxxxxxxxxxxxxxxx';
const Q4 = 'x...x...x...x...';
const BACK = '....x.......x...';
// 3連8分 (1小節 12 マス) 用
const T4 = 'x..x..x..x..';
const TBACK = '...x.....x..';
const SHUF = 'x.xx.xx.xx.x';

export const CATEGORIES = [
  { id: 'basic', name: '基本ビート' },
  { id: 'kick', name: 'バスドラムのバリエーション' },
  { id: 'sixteen', name: '16ビート' },
  { id: 'sync', name: 'シンコペーション・裏拍' },
  { id: 'triplet', name: '3連符・シャッフル' },
  { id: 'fill', name: 'フィルイン' },
  { id: 'rudiment', name: '手足の基礎' },
];

const defs = [
  ['b1', 'basic', 1, 80, '4ビート', { ride: Q4, kick: 'x.......x.......', snare: BACK }],
  ['b2', 'basic', 1, 80, '8ビート 基本', { hhc: E8, kick: 'x.......x.......', snare: BACK }],
  ['b3', 'basic', 2, 90, '8ビート バスドラ追加', { hhc: E8, kick: 'x.......x.x.....', snare: BACK }],
  ['b4', 'basic', 2, 90, '8ビート 2小節', { hhc: `${E8}|${E8}`, kick: 'x.......x.x.....|x.x.....x.......', snare: `${BACK}|${BACK}` }],
  ['b5', 'basic', 2, 100, 'ライドで8ビート', { ride: E8, kick: 'x.....x.x.......', snare: BACK }],
  ['k1', 'kick', 2, 85, 'バスドラ 裏', { hhc: E8, kick: 'x.....x...x.....', snare: BACK }],
  ['k2', 'kick', 3, 85, 'バスドラ 16分裏', { hhc: E8, kick: 'x..x....x..x....', snare: BACK }],
  ['k3', 'kick', 3, 90, 'バスドラ 連打', { hhc: E8, kick: 'xx......xx......', snare: BACK }],
  ['k4', 'kick', 4, 80, 'バスドラ 4つ打ち+裏', { hhc: E8, kick: 'x...x..xx...x..x', snare: BACK }],
  ['s1', 'sixteen', 2, 75, '16ビート 基本', { hhc: E16, kick: 'x.......x.......', snare: BACK }],
  ['s2', 'sixteen', 3, 80, '16ビート バスドラ変化', { hhc: E16, kick: 'x.....x...x..x..', snare: BACK }],
  ['s3', 'sixteen', 3, 80, '16ビート 片手', { hhc: 'x.xxx.xxx.xxx.xx', kick: 'x.......x.......', snare: BACK }],
  ['s4', 'sixteen', 4, 85, 'ファンク', { hhc: E8, kick: 'x..x...x.xx.....', snare: '....x..x.x..x...' }],
  ['y1', 'sync', 2, 90, 'ハイハット裏打ち', { hhc: '..x...x...x...x.', kick: Q4, snare: BACK }],
  ['y2', 'sync', 3, 90, 'オープンハイハット', { hhc: 'x.x.x.x.x.x.x...', hho: '..............x.', kick: 'x.......x.x.....', snare: BACK }],
  ['y3', 'sync', 3, 85, '4分裏のスネア', { hhc: E8, kick: 'x.......x.......', snare: '......x.......x.' }],
  ['y4', 'sync', 4, 90, 'アンティシペーション', { hhc: `${E8}|x.x.x.x.x.x.x...`, crash: '................|..............x.', kick: 'x.......x.x.....|x.......x.....x.', snare: `${BACK}|${BACK}` }],
  ['f1', 'fill', 2, 80, 'スネア 16分フィル', { hhc: `${E8}|................`, kick: 'x.......x.......|................', snare: `${BACK}|xxxxxxxxxxxxxxxx`, crash: '................|................' }],
  ['f2', 'fill', 3, 80, 'タム回し', { hhc: `${E8}|................`, kick: 'x.......x.......|x...............', snare: `${BACK}|xxxx............`, tom1: '................|....xxxx........', tom2: '................|........xxxx....', tom3: '................|............xxxx' }],
  ['f3', 'fill', 4, 85, '3つ割りフィル', { hhc: `${E8}|................`, kick: 'x.......x.......|..x..x..x..x..x.', snare: `${BACK}|x..x..x..x..x..x` }],
  ['b6', 'basic', 3, 100, '8ビート オープンハイハット', { hhc: 'x.x.x.x.x.x.x...', hho: '..............x.', kick: 'x..x..x.x.......', snare: BACK }],
  ['b7', 'basic', 4, 110, '8ビート 2小節 変化', { hhc: `${E8}|x.x.x.x.x.x.x...`, hho: '................|..............x.', kick: 'x.......x.x.....|x..x..x...x..x..', snare: `${BACK}|....x.......x..x` }],
  ['k5', 'kick', 5, 90, 'バスドラ 16分連打', { hhc: E8, kick: 'x.xx..xx.xx...x.', snare: BACK }],
  ['k6', 'kick', 5, 85, 'バスドラ 3連16分', { hhc: 'x..x..x..x..x..x..x..x..', kick: 'xxx.........xxx.........', snare: '......x...........x.....' }],
  ['k7', 'kick', 6, 100, 'ツーバス 16分', { ride: Q4, kick: E16, snare: BACK }],
  ['s5', 'sixteen', 5, 90, 'ゴーストノート ファンク', { hhc: E8, kick: 'x.x....x..x.....', snare: '.g..x..g.g..x.g.' }],
  ['s6', 'sixteen', 5, 95, '16ビート バスドラ詰め', { hhc: 'xxxx.xxxxxxx.xxx', kick: 'x..x.x....xx..x.', snare: BACK }],
  ['s7', 'sixteen', 6, 100, 'リニア', { hhc: '.xx..xx.x.xx.x.x', kick: 'x..x...x.x....x.', snare: '....x.......x...' }],
  ['y5', 'sync', 5, 95, 'プッシュ (小節前の 16分)', { hhc: `${E8}|x.x.x.x.x.x.x...`, crash: '................|...............x', kick: 'x.......x.x.....|x.......x.x....x', snare: `${BACK}|${BACK}` }],
  ['y6', 'sync', 6, 90, 'ハイハット 16分裏', { hhc: '.x.x.x.x.x.x.x.x', kick: Q4, snare: BACK }],
  ['t1', 'triplet', 3, 80, '3連符 スネア', { snare: 'xxxxxxxxxxxx', kick: T4 }],
  ['t2', 'triplet', 4, 90, 'シャッフル', { hhc: SHUF, kick: 'x.....x.....', snare: TBACK }],
  ['t3', 'triplet', 4, 85, '3連符 バスドラ', { hhc: T4, kick: 'x.x...x.x..x', snare: TBACK }],
  ['t4', 'triplet', 5, 90, '手足 3つ割り (RLK)', { snare: 'xx.xx.xx.xx.', kick: '..x..x..x..x' }],
  ['t5', 'triplet', 6, 85, 'ハーフタイム シャッフル', { hhc: SHUF, kick: 'x.......x..x', snare: '.g..g.x...g.' }],
  ['t6', 'triplet', 6, 65, '3連16分 ハイハット', { hhc: 'xxxxxx.xxxxxxxxxxx.xxxxx', kick: 'x.....x.....x.....x.....', snare: '......x...........x.....' }],
  ['f4', 'fill', 5, 80, '3連16分 タム回し', { hhc: `${E8}|................`, kick: 'x.......x.......|x.....x.....x.....x.....', snare: `${BACK}|xxxxxx..................`, tom1: '................|......xxxxxx............', tom2: '................|............xxxxxx......', tom3: '................|..................xxxxxx' }],
  ['f5', 'fill', 5, 90, 'RLK フィル (3連8分)', { hhc: `${E8}|............`, kick: 'x.......x.......|..x..x..x..x', snare: `${BACK}|x..x..x..x..`, tom1: '................|.x..x..x..x.' }],
  ['f6', 'fill', 6, 70, '32分フィル', { hhc: `${E8}|................................`, kick: 'x.......x.......|x.......x.......x.......x.......', snare: `${BACK}|xxxxxxxxxxxxxxxx................`, tom1: '................|................xxxxxxxx........', tom3: '................|........................xxxxxxxx' }],
  ['r1', 'rudiment', 1, 70, 'シングルストローク', { snare: E16 }],
  ['r2', 'rudiment', 2, 70, 'ダブルストローク (8分)', { snare: E8 }],
  ['r3', 'rudiment', 2, 80, 'バスドラ 8分', { kick: E8, hhc: Q4 }],
  ['r4', 'rudiment', 3, 70, 'アクセント移動', { snare: E16, kick: 'x...x...x...x...' }],
  ['r5', 'rudiment', 4, 80, 'ゴーストとアクセント', { snare: 'xgggxgggxgggxggg', kick: Q4 }],
  ['r6', 'rudiment', 4, 80, 'パラディドル (タムとスネア)', { tom1: 'x.xx..x.x.xx..x.', snare: '.x..xx.x.x..xx.x', kick: Q4 }],
  ['r7', 'rudiment', 6, 60, 'ダブルストローク 32分', { snare: 'x'.repeat(32), kick: Q4 }],
];

export const PRESETS = defs.map(([id, category, level, bpm, title, spec]) => ({
  id: `preset:${id}`,
  preset: true,
  category,
  level,
  bpm,
  title,
  timeSig: { beats: 4, beatUnit: 4 },
  measures: P(spec),
}));

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) ?? null;
}
