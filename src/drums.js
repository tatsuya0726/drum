// ドラムの楽器定義と、五線上の位置 → 楽器 の対応表。
// 位置 (step) は第5線(一番上の線)を 0 として、下へ半間(線→間)ごとに +1。
//   -2: 上第1線 (A5)  -1: 第5線の上の間 (G5)  0: 第5線 (F5)  1: 第4間 (E5)
//    2: 第4線 (D5)     3: 第3間 (C5)          4: 第3線 (B4)  5: 第2間 (A4)
//    6: 第2線 (G4)     7: 第1間 (F4)          8: 第1線 (E4)  9: 下の間 (D4)

export const PPQ = 48; // 4分音符あたりの tick 数 (16分=12, 3連8分=16, 3連16分=8)

export const INSTRUMENTS = [
  { id: 'crash', name: 'クラッシュ', short: 'CR', color: '#f59e0b' },
  { id: 'ride', name: 'ライド', short: 'RD', color: '#eab308' },
  { id: 'hho', name: 'ハイハット(オープン)', short: 'HO', color: '#84cc16' },
  { id: 'hhc', name: 'ハイハット', short: 'HH', color: '#22c55e' },
  { id: 'hhp', name: 'ハイハット(ペダル)', short: 'HP', color: '#14b8a6' },
  { id: 'tom1', name: 'ハイタム', short: 'T1', color: '#06b6d4' },
  { id: 'tom2', name: 'ロータム', short: 'T2', color: '#3b82f6' },
  { id: 'snare', name: 'スネア', short: 'SD', color: '#ef4444' },
  { id: 'rim', name: 'クロススティック', short: 'RM', color: '#ec4899' },
  { id: 'tom3', name: 'フロアタム', short: 'FT', color: '#8b5cf6' },
  { id: 'kick', name: 'バスドラム', short: 'BD', color: '#a3a3a3' },
];

export const INSTRUMENT_IDS = INSTRUMENTS.map((i) => i.id);
export const instrumentById = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

// 一般的なドラム譜の記譜法 (PAS / LilyPond / MuseScore の標準に近いもの)
const X_HEAD_MAP = {
  '-4': 'crash',
  '-3': 'crash',
  '-2': 'crash',
  '-1': 'hhc',
  0: 'ride',
  1: 'ride',
  2: 'hhc',
  3: 'rim',
};

const NORMAL_HEAD_MAP = {
  '-4': 'tom1',
  '-3': 'tom1',
  '-2': 'tom1',
  '-1': 'tom1',
  0: 'tom1',
  1: 'tom1',
  2: 'tom2',
  3: 'snare',
  4: 'tom2',
  5: 'tom3',
  6: 'tom3',
  7: 'kick',
  8: 'kick',
};

/** 符頭の種類 ('x' | 'filled' | 'open') と位置から楽器を決める */
export function instrumentFor(kind, step) {
  if (kind === 'x') {
    if (step >= 8) return 'hhp';
    if (step < -4) return 'crash';
    return X_HEAD_MAP[step] ?? 'hhc';
  }
  if (kind === 'open' && step <= -1) return 'crash'; // 五線より上の白玉は通常シンバルの伸ばし
  if (step < -4) return 'tom1';
  if (step > 8) return 'kick';
  return NORMAL_HEAD_MAP[step] ?? 'snare';
}
