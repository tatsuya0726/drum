// 練習用フレーズ集。パターン文字列は 16分音符 16 個 (1小節) ごと、x = 叩く

const P = (spec) => {
  // spec: { hhc: 'x.x.x.x.x.x.x.x.|...', ... }  "|" で小節を区切る
  const bars = Math.max(...Object.values(spec).map((s) => s.split('|').length));
  const measures = Array.from({ length: bars }, () => ({ grid: 4, notes: [] }));
  for (const [inst, str] of Object.entries(spec)) {
    str.split('|').forEach((bar, i) => {
      [...bar].forEach((c, k) => {
        if (c === 'x') measures[i].notes.push({ tick: k * 12, inst, vel: 1 });
      });
    });
  }
  for (const m of measures) m.notes.sort((a, b) => a.tick - b.tick);
  return measures;
};

const E8 = 'x.x.x.x.x.x.x.x.';
const E16 = 'xxxxxxxxxxxxxxxx';
const Q4 = 'x...x...x...x...';
const BACK = '....x.......x...';

export const CATEGORIES = [
  { id: 'basic', name: '基本ビート' },
  { id: 'kick', name: 'バスドラムのバリエーション' },
  { id: 'sixteen', name: '16ビート' },
  { id: 'sync', name: 'シンコペーション・裏拍' },
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
  ['r1', 'rudiment', 1, 70, 'シングルストローク', { snare: E16 }],
  ['r2', 'rudiment', 2, 70, 'ダブルストローク (8分)', { snare: E8 }],
  ['r3', 'rudiment', 2, 80, 'バスドラ 8分', { kick: E8, hhc: Q4 }],
  ['r4', 'rudiment', 3, 70, 'アクセント移動', { snare: E16, kick: 'x...x...x...x...' }],
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
