// 1小節分の音符 (tick と楽器) を、楽譜に書くための「音符・休符の並び」に変換する。
// VexFlow に依存しない純粋な関数なのでテストしやすい。

import { PPQ } from '../drums.js';

// 楽器ごとの五線上の位置 (percussion 記号のキー) と符頭、声部
export const NOTATION = {
  crash: { key: 'a/5/x2', voice: 'up' },
  ride: { key: 'f/5/x2', voice: 'up' },
  hhc: { key: 'g/5/x2', voice: 'up' },
  hho: { key: 'g/5/x2', voice: 'up', open: true },
  tom1: { key: 'e/5', voice: 'up' },
  tom2: { key: 'd/5', voice: 'up' },
  snare: { key: 'c/5', voice: 'up' },
  rim: { key: 'c/5/cx', voice: 'up' },
  tom3: { key: 'a/4', voice: 'up' },
  kick: { key: 'f/4', voice: 'down' },
  hhp: { key: 'd/4/x2', voice: 'down' },
};

// tick 数 → VexFlow の音価
const DURATIONS = [
  [PPQ * 4, 'w'],
  [PPQ * 3, 'hd'],
  [PPQ * 2, 'h'],
  [(PPQ * 3) / 2, 'qd'],
  [PPQ, 'q'],
  [(PPQ * 3) / 4, '8d'],
  [PPQ / 2, '8'],
  [(PPQ * 3) / 8, '16d'],
  [PPQ / 4, '16'],
  [PPQ / 8, '32'],
];

/** ticks を表せる音価のうち最大のもの (ちょうど表せなければ小さい音価の組み合わせ) */
export function splitDuration(ticks) {
  const out = [];
  let rest = ticks;
  while (rest > 0) {
    const d = DURATIONS.find(([t]) => t <= rest);
    if (!d) break;
    out.push(d);
    rest -= d[0];
  }
  return out;
}

/** 拍のまとまり (連桁をつなぐ単位) の長さ */
export function groupTicks(timeSig) {
  const beat = (PPQ * 4) / timeSig.beatUnit;
  if (timeSig.beatUnit === 8 && timeSig.beats % 3 === 0) return beat * 3; // 6/8・12/8 は付点4分ごと
  return beat;
}

/** まとまりの中の音の位置をすべて表せる、いちばん粗い単位を選ぶ */
function chooseUnit(group, offsets) {
  const candidates = group === PPQ * 1.5 ? [group, PPQ / 2, PPQ / 4, PPQ / 8] : [group, group / 2, group / 4, group / 3, group / 6, group / 8];
  for (const u of candidates) {
    if (!Number.isInteger(u)) continue;
    if (offsets.every((o) => o % u === 0)) return u;
  }
  return PPQ / 8;
}

/**
 * 1声部・1小節の並びを作る
 * @returns {Array<{ ticks, duration, rest, keys, insts, tuplet? , group }>} tuplet は {num, occupied}
 */
export function voiceTokens(notes, timeSig, voice) {
  const g = groupTicks(timeSig);
  const total = (timeSig.beats * PPQ * 4) / timeSig.beatUnit;
  const mine = notes.filter((n) => NOTATION[n.inst]?.voice === voice);
  if (!mine.length) {
    return [{ ticks: total, duration: 'w', rest: true, keys: [], insts: [], group: 0, whole: true }];
  }
  const tokens = [];
  for (let start = 0, gi = 0; start < total; start += g, gi++) {
    const len = Math.min(g, total - start);
    const inGroup = mine.filter((n) => n.tick >= start && n.tick < start + len);
    if (!inGroup.length) {
      for (const [t, d] of splitDuration(len)) tokens.push({ ticks: t, duration: d, rest: true, keys: [], insts: [], group: gi });
      continue;
    }
    const byOffset = new Map();
    for (const n of inGroup) {
      const off = n.tick - start;
      if (!byOffset.has(off)) byOffset.set(off, []);
      byOffset.get(off).push(n.inst);
    }
    const offsets = [...byOffset.keys()].sort((a, b) => a - b);
    const u = chooseUnit(len, offsets);
    const triplet = (PPQ % u !== 0 || u === PPQ / 3 || u === PPQ / 6) && len === PPQ;
    const slots = Math.round(len / u);
    // 位置ごとに音 or 休符を並べる
    let pos = 0;
    const pushRest = (ticks) => {
      if (triplet) {
        for (let k = 0; k < ticks / u; k++) tokens.push(tripletToken(u, true, [], gi));
      } else {
        for (const [t, d] of splitDuration(ticks)) tokens.push({ ticks: t, duration: d, rest: true, keys: [], insts: [], group: gi });
      }
    };
    for (let k = 0; k < offsets.length; k++) {
      const off = Math.round(offsets[k] / u) * u;
      if (off > pos) pushRest(off - pos);
      const next = k + 1 < offsets.length ? Math.round(offsets[k + 1] / u) * u : slots * u;
      const insts = [...new Set(byOffset.get(offsets[k]))];
      if (triplet) {
        tokens.push(tripletToken(u, false, insts, gi));
        if (next - off > u) pushRest(next - off - u);
      } else {
        const parts = splitDuration(next - off);
        const [t, d] = parts[0];
        tokens.push({ ticks: t, duration: d, rest: false, insts, keys: keysFor(insts), group: gi });
        if (next - off - t > 0) pushRest(next - off - t);
      }
      pos = next;
    }
  }
  return mergeRests(tokens, timeSig);
}

function tripletToken(u, rest, insts, group) {
  // 3連8分 (16tick) / 3連16分 (8tick)
  const duration = u === PPQ / 3 ? '8' : '16';
  return {
    ticks: u,
    duration,
    rest,
    insts,
    keys: rest ? [] : keysFor(insts),
    group,
    tuplet: { num: 3, occupied: 2 },
  };
}

function keysFor(insts) {
  const keys = [...new Set(insts.map((i) => NOTATION[i].key))];
  return keys;
}

/** 4分休符が2つ並び、2拍目の頭から始まるなら2分休符にまとめる (x/4 のみ) */
function mergeRests(tokens, timeSig) {
  if (timeSig.beatUnit !== 4) return tokens;
  const out = [];
  let tick = 0;
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a.rest && b?.rest && a.duration === 'q' && b.duration === 'q' && tick % (PPQ * 2) === 0) {
      out.push({ ...a, ticks: PPQ * 2, duration: 'h' });
      tick += PPQ * 2;
      i++;
      continue;
    }
    out.push(a);
    tick += a.ticks;
  }
  return out;
}
