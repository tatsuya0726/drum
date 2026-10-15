// メトロノームの鳴らし方 (間引き)。クリックが無い所でもテンポを保つ練習用

export const CLICK_MODES = [
  { id: 'all', label: '毎拍' },
  { id: 'gap1', label: '1小節鳴らして1小節休む', on: 1, off: 1 },
  { id: 'gap2', label: '2小節鳴らして2小節休む', on: 2, off: 2 },
  { id: 'gap4', label: '4小節鳴らして4小節休む', on: 4, off: 4 },
  { id: 'one', label: '小節の頭だけ' },
  { id: '24', label: '2拍目と4拍目だけ' },
  { id: 'and', label: '裏拍 (8分の裏) だけ' },
];

/** bar 小節目 (カウントの後を 0 とした通し番号) がクリックを休む小節か */
export function isRestBar(mode, bar) {
  const m = CLICK_MODES.find((c) => c.id === mode);
  if (!m?.off || bar < 0) return false;
  return bar % (m.on + m.off) >= m.on;
}

/**
 * bar 小節目で鳴らすクリック (小節内の tick と強拍かどうか)。
 * bar < 0 はカウントで、いつも毎拍鳴らす。
 */
export function clickTicks(mode, bar, beats, beatTicks) {
  const every = () => Array.from({ length: beats }, (_, b) => ({ tick: b * beatTicks, accent: b === 0 }));
  if (bar < 0 || !mode || mode === 'all') return every();
  if (isRestBar(mode, bar)) return [];
  switch (mode) {
    case 'one':
      return [{ tick: 0, accent: true }];
    case '24':
      return every().filter((_, b) => b % 2 === 1).map((c) => ({ ...c, accent: false }));
    case 'and':
      return Array.from({ length: beats }, (_, b) => ({ tick: b * beatTicks + beatTicks / 2, accent: false }));
    default:
      return every();
  }
}
