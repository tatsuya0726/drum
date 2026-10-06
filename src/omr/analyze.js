// 楽譜画像 (1ページ分) から五線・小節線・符頭を検出する。
// 印刷/書き出しされたきれいなドラム譜(5線)を想定したヒューリスティック実装。

/** RGBA → 2値 (1 = 黒) */
export function toBinary(rgba, width, height, threshold = 170) {
  const bin = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < bin.length; i++, j += 4) {
    // 透明部分は白背景に合成する
    const a = rgba[j + 3] / 255;
    const lum = 255 - a * (255 - (rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114));
    bin[i] = lum < threshold ? 1 : 0;
  }
  return bin;
}

/** RGBA → 輝度 (0..255、透明部分は白背景に合成) */
export function toGray(rgba, width, height) {
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    g[i] = 255 - a * (255 - (rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114));
  }
  return g;
}

function grayToBinary(gray, threshold) {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < threshold ? 1 : 0;
  return bin;
}

/**
 * スキャンした楽譜の傾き (度) を推定する。横線 (五線) が水平になる角度で
 * 行ごとの黒画素数の分布が最も尖る、という性質を使う。
 */
export function estimateSkew(bin, w, h) {
  const f = Math.max(1, Math.round(w / 800));
  const sw = Math.floor(w / f);
  const sh = Math.floor(h / f);
  const xs = [];
  const ys = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let dark = 0;
      for (let dy = 0; dy < f && !dark; dy++) for (let dx = 0; dx < f; dx++) if (bin[(y * f + dy) * w + x * f + dx]) dark = 1;
      if (dark) {
        xs.push(x - sw / 2);
        ys.push(y);
      }
    }
  }
  if (xs.length < 100) return 0;
  const hist = new Float64Array(sh * 2);
  const score = (deg) => {
    const t = Math.tan((deg * Math.PI) / 180);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) {
      const y = Math.round(ys[i] - xs[i] * t + sh / 2);
      if (y >= 0 && y < hist.length) hist[y]++;
    }
    let s = 0;
    for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    return s;
  };
  let best = 0;
  let bestScore = score(0);
  for (let d = -3; d <= 3.001; d += 0.1) {
    const sc = score(d);
    if (sc > bestScore * 1.0001) {
      bestScore = sc;
      best = d;
    }
  }
  const center = best;
  for (let d = center - 0.1; d <= center + 0.1; d += 0.02) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return Math.round(best * 100) / 100;
}

/** 画像を回転して傾きを直す (中心まわり、外側は白) */
export function rotateGray(gray, w, h, deg) {
  const out = new Uint8Array(w * h).fill(255);
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 出力 (x, y) に対応する元画像の位置
      const dx = x - cx;
      const dy = y - cy;
      const sx = c * dx - sn * dy + cx;
      const sy = sn * dx + c * dy + cy;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * w + x0;
      out[y * w + x] = (gray[i] * (1 - fx) + gray[i + 1] * fx) * (1 - fy) + (gray[i + w] * (1 - fx) + gray[i + w + 1] * fx) * fy;
    }
  }
  return out;
}

/** 各行の長い黒ラン (maxGap px までの途切れは許容) をすべて返す */
function rowRuns(bin, w, h, minRun, maxGap = 2) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const runs = [];
    let cur = 0, curStart = 0, gap = 0;
    const close = () => {
      if (cur >= minRun) runs.push([curStart, curStart + cur - 1]);
      cur = 0;
      gap = 0;
    };
    for (let x = 0; x < w; x++) {
      if (bin[row + x]) {
        if (cur === 0) curStart = x;
        cur += gap + 1;
        gap = 0;
      } else if (cur > 0) {
        gap++;
        if (gap > maxGap) close();
      }
    }
    close();
    rows.push(runs);
  }
  return rows;
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * 五線を検出する。1行に複数の五線が左右に並ぶページ (教本の 2 列レイアウトなど) にも対応。
 * 返す順番は読む順 (段が左右に並ぶ列構成なら左の列から上→下、それ以外は上→下)
 */
export function findStaves(bin, w, h, { maxGap = 2 } = {}) {
  const minRun = Math.max(40, w * 0.1);
  const rows = rowRuns(bin, w, h, minRun, maxGap);

  // 縦に連続する同じ範囲のランを1本の線にまとめる
  const lines = [];
  let open = [];
  for (let y = 0; y < h; y++) {
    const next = [];
    for (const [x0, x1] of rows[y]) {
      const prev = open.find((l) => l.y1 === y - 1 && overlap(l.x0, l.x1, x0, x1) > Math.max(x1 - x0, l.x1 - l.x0) * 0.8);
      if (prev) {
        prev.y1 = y;
        prev.x0 = Math.min(prev.x0, x0);
        prev.x1 = Math.max(prev.x1, x1);
        next.push(prev);
      } else {
        const l = { y0: y, y1: y, x0, x1 };
        lines.push(l);
        next.push(l);
      }
    }
    open = next;
  }
  for (const l of lines) {
    l.yc = (l.y0 + l.y1) / 2;
    l.t = l.y1 - l.y0 + 1;
  }
  lines.sort((a, b) => a.yc - b.yc);

  // 横の範囲がそろっていて等間隔な 5 本を 1 つの五線にする
  const used = new Set();
  const staves = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const first = lines[i];
    const len = first.x1 - first.x0;
    const group = [i];
    for (let j = i + 1; j < lines.length && group.length < 5; j++) {
      if (used.has(j)) continue;
      const l = lines[j];
      if (overlap(first.x0, first.x1, l.x0, l.x1) < Math.max(len, l.x1 - l.x0) * 0.9) continue;
      const lastL = lines[group[group.length - 1]];
      const gap = l.yc - lastL.yc;
      if (group.length >= 2) {
        const g0 = lines[group[1]].yc - lines[group[0]].yc;
        if (Math.abs(gap - g0) > Math.max(1.5, g0 * 0.2)) {
          if (gap > g0 * 1.5) break;
          continue;
        }
      } else if (gap > h / 8) break;
      group.push(j);
    }
    if (group.length < 5) continue;
    const g = group.map((k) => lines[k]);
    const gaps = [];
    for (let k = 0; k < 4; k++) gaps.push(g[k + 1].yc - g[k].yc);
    const mean = gaps.reduce((a, b) => a + b, 0) / 4;
    const thick = Math.max(...g.map((l) => l.t));
    if (mean <= thick * 2 + 2) continue;
    for (const k of group) used.add(k);
    const sorted = (arr) => [...arr].sort((a, b) => a - b);
    staves.push({
      lines: g.map((l) => l.yc),
      top: g[0].yc,
      bottom: g[4].yc,
      space: mean,
      thickness: g.reduce((a, l) => a + l.t, 0) / 5,
      left: sorted(g.map((l) => l.x0))[2],
      right: sorted(g.map((l) => l.x1))[2],
    });
  }
  return readingOrder(staves, w);
}

/** 段が左右の列に分かれて並んでいれば列ごとに、そうでなければ上から順に並べる */
function readingOrder(staves, w) {
  const byY = [...staves].sort((a, b) => a.top - b.top || a.left - b.left);
  const sideBySide = staves.some((a) => staves.some((b) => a !== b && overlap(a.top, a.bottom, b.top, b.bottom) > 0 && (a.right < b.left || b.right < a.left)));
  if (!sideBySide) return byY;
  // 左端の位置で列に分ける
  const cols = [];
  for (const s of [...staves].sort((a, b) => a.left - b.left)) {
    const c = cols.find((col) => Math.abs(col.left - s.left) < w * 0.15 || overlap(col.left, col.right, s.left, s.right) > (s.right - s.left) * 0.5);
    if (c) {
      c.items.push(s);
      c.right = Math.max(c.right, s.right);
    } else cols.push({ left: s.left, right: s.right, items: [s] });
  }
  if (cols.some((c) => c.items.length < 2)) return byY;
  return cols.flatMap((c) => c.items.sort((a, b) => a.top - b.top));
}

/** 縦線のすぐ左右に符頭のような塊があるか (上向き符幹が五線全体にかかって小節線に見える場合を除く) */
function headBeside(bin, w, staff, x0, x1) {
  const { top, bottom, space, thickness, lines } = staff;
  const onLine = (y) => lines.some((ly) => Math.abs(y - ly) <= thickness / 2 + 1);
  const width = Math.round(space * 0.8);
  for (const [a, b] of [
    [x0 - width, x0 - 2],
    [x1 + 2, x1 + width],
  ]) {
    let dark = 0;
    for (let y = Math.round(top); y <= Math.round(bottom); y++) {
      if (onLine(y)) continue;
      for (let x = Math.max(0, a); x <= Math.min(w - 1, b); x++) dark += bin[y * w + x];
    }
    if (dark > space * space * 0.45) return true;
  }
  return false;
}

/** 小節線を検出する (五線の上端から下端までを貫き、五線の外にははみ出さない細い縦線) */
export function findBarlines(bin, w, h, staff) {
  const { top, bottom, space, left, right } = staff;
  const yTop = Math.round(top);
  const yBot = Math.round(bottom);
  const outA0 = Math.max(0, Math.round(top - space * 0.9));
  const outA1 = Math.round(top - space * 0.35);
  const outB0 = Math.round(bottom + space * 0.35);
  const outB1 = Math.min(h - 1, Math.round(bottom + space * 0.9));
  const cols = [];
  for (let x = Math.max(0, left - 2); x <= Math.min(w - 1, right + 2); x++) {
    let dark = 0;
    for (let y = yTop; y <= yBot; y++) dark += bin[y * w + x];
    if (dark < (yBot - yTop + 1) * 0.92) {
      cols.push(false);
      continue;
    }
    let outside = 0;
    for (let y = outA0; y <= outA1; y++) outside += bin[y * w + x];
    for (let y = outB0; y <= outB1; y++) outside += bin[y * w + x];
    cols.push(outside === 0);
  }
  const bars = [];
  let runStart = -1;
  for (let k = 0; k <= cols.length; k++) {
    if (k < cols.length && cols[k]) {
      if (runStart < 0) runStart = k;
    } else if (runStart >= 0) {
      const x0 = runStart + Math.max(0, left - 2);
      const x1 = k - 1 + Math.max(0, left - 2);
      if (x1 - x0 + 1 <= space * 0.8 && !headBeside(bin, w, staff, x0, x1)) bars.push({ x0, x1 });
      runStart = -1;
    }
  }
  // 複縦線・終止線などの近接した線はまとめる
  const merged = [];
  for (const b of bars) {
    const last = merged[merged.length - 1];
    if (last && b.x0 - last.x1 < space * 1.2) last.x1 = b.x1;
    else merged.push({ ...b });
  }
  return merged.map((b) => ({ x0: b.x0, x1: b.x1, x: (b.x0 + b.x1) / 2 }));
}

/** 指定領域内の縦ラン長・横ラン長を計算する */
function runLengths(img, w, rx0, ry0, rx1, ry1) {
  const rw = rx1 - rx0 + 1;
  const rh = ry1 - ry0 + 1;
  const vrun = new Uint16Array(rw * rh);
  const hrun = new Uint16Array(rw * rh);
  for (let x = 0; x < rw; x++) {
    let y = 0;
    while (y < rh) {
      if (!img[(y + ry0) * w + x + rx0]) {
        y++;
        continue;
      }
      let e = y;
      while (e < rh && img[(e + ry0) * w + x + rx0]) e++;
      for (let k = y; k < e; k++) vrun[k * rw + x] = e - y;
      y = e;
    }
  }
  for (let y = 0; y < rh; y++) {
    const row = (y + ry0) * w + rx0;
    let x = 0;
    while (x < rw) {
      if (!img[row + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < rw && img[row + e]) e++;
      for (let k = x; k < e; k++) hrun[y * rw + k] = e - x;
      x = e;
    }
  }
  return { vrun, hrun, rw, rh };
}

/** 五線・加線・符幹・小節線を消して、符頭などの塊だけを残す */
export function cleanStaffRegion(bin, w, h, staff) {
  const { top, bottom, space, thickness, left, right } = staff;
  const rx0 = Math.max(0, Math.floor(left - space * 2));
  const rx1 = Math.min(w - 1, Math.ceil(right + space));
  const ry0 = Math.max(0, Math.floor(top - space * 4.5));
  const ry1 = Math.min(h - 1, Math.ceil(bottom + space * 4.5));
  const region = { rx0, ry0, rx1, ry1 };
  const clean = new Uint8Array(bin);

  // 1) 細い横線 (五線・加線) を除去
  let r = runLengths(clean, w, rx0, ry0, rx1, ry1);
  const thinMax = Math.max(2, Math.round(thickness) + 2);
  const longMin = space * 1.2;
  // 線が引かれうる高さ (五線 + 上下3本ずつの加線) だけを対象にする
  const onLine = new Uint8Array(r.rh);
  const tol = thickness / 2 + 1.5;
  for (let k = -3; k <= 7; k++) {
    const ly = top + k * space - ry0;
    for (let y = Math.max(0, Math.floor(ly - tol)); y <= Math.min(r.rh - 1, Math.ceil(ly + tol)); y++) onLine[y] = 1;
  }
  for (let y = 0; y < r.rh; y++) {
    if (!onLine[y]) continue;
    for (let x = 0; x < r.rw; x++) {
      const k = y * r.rw + x;
      if (r.vrun[k] && r.vrun[k] <= thinMax && r.hrun[k] >= longMin) clean[(y + ry0) * w + x + rx0] = 0;
    }
  }

  const noLines = new Uint8Array(clean);

  // 2) 細い縦線 (符幹・小節線) を除去
  r = runLengths(clean, w, rx0, ry0, rx1, ry1);
  const stemMin = space * 1.0;
  const stemWidth = Math.max(2, space * 0.3);
  for (let y = 0; y < r.rh; y++) {
    for (let x = 0; x < r.rw; x++) {
      const k = y * r.rw + x;
      if (r.vrun[k] >= stemMin && r.hrun[k] <= stemWidth) clean[(y + ry0) * w + x + rx0] = 0;
    }
  }

  // 3) 長い横棒 (連桁) を除去。連桁にくっついた × 符頭を切り離すため
  r = runLengths(clean, w, rx0, ry0, rx1, ry1);
  const beamMin = space * 2.8;
  for (let y = 0; y < r.rh; y++) {
    for (let x = 0; x < r.rw; x++) {
      if (r.hrun[y * r.rw + x] >= beamMin) clean[(y + ry0) * w + x + rx0] = 0;
    }
  }
  return { clean, noLines, region };
}

/** 連結成分を列挙する (8近傍) */
export function components(img, w, region) {
  const { rx0, ry0, rx1, ry1 } = region;
  const seen = new Uint8Array(img.length);
  const out = [];
  const stack = [];
  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0; x <= rx1; x++) {
      const i = y * w + x;
      if (!img[i] || seen[i]) continue;
      let x0 = x, x1 = x, y0 = y, y1 = y, count = 0;
      seen[i] = 1;
      stack.push(i);
      while (stack.length) {
        const p = stack.pop();
        const py = (p / w) | 0;
        const px = p - py * w;
        count++;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = py + dy;
          if (ny < ry0 || ny > ry1) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            if (nx < rx0 || nx > rx1) continue;
            const q = ny * w + nx;
            if (img[q] && !seen[q]) {
              seen[q] = 1;
              stack.push(q);
            }
          }
        }
      }
      out.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, count });
    }
  }
  return out;
}

function darkIn(img, w, x0, y0, x1, y1) {
  let n = 0, total = 0;
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      n += img[y * w + x];
      total++;
    }
  }
  return total ? n / total : 0;
}

/**
 * 符頭らしい矩形を分類する。'filled'(黒玉) / 'x'(バツ) / 'open'(白玉) / null(符頭ではない)
 */
export function classifyHead(img, w, box, lenient = false) {
  const { x0, y0, x1, y1 } = box;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const fill = darkIn(img, w, x0, y0, x1, y1);
  if (fill < 0.22) return null;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const centerDark = darkIn(img, w, cx - bw * 0.12, cy - bh * 0.12, cx + bw * 0.12, cy + bh * 0.12);
  if (centerDark >= 0.5) {
    // × 符頭は上下の中央 (腕と腕のあいだ) が白い。符幹の切れ端で黒が多くても × とみなす
    const topMid = darkIn(img, w, cx - bw * 0.1, y0, cx + bw * 0.1, y0 + bh * 0.2);
    const botMid = darkIn(img, w, cx - bw * 0.1, y1 - bh * 0.2, cx + bw * 0.1, y1);
    if (fill >= 0.45 && topMid < 0.25 && botMid < 0.25) return 'x';
    if (fill >= 0.6) {
      // 楕円なら四隅は空いている (連桁の切れ端などの平行四辺形を除外)
      const q = 0.22;
      const corners = [
        darkIn(img, w, x0, y0, x0 + bw * q, y0 + bh * q),
        darkIn(img, w, x1 - bw * q, y0, x1, y0 + bh * q),
        darkIn(img, w, x0, y1 - bh * q, x0 + bw * q, y1),
        darkIn(img, w, x1 - bw * q, y1 - bh * q, x1, y1),
      ];
      return Math.min(...corners) > 0.8 ? null : 'filled';
    }
    // バツ印: 四隅付近に黒がある
    const q = 0.3;
    const corners = [
      darkIn(img, w, x0, y0, x0 + bw * q, y0 + bh * q),
      darkIn(img, w, x1 - bw * q, y0, x1, y0 + bh * q),
      darkIn(img, w, x0, y1 - bh * q, x0 + bw * q, y1),
      darkIn(img, w, x1 - bw * q, y1 - bh * q, x1, y1),
    ];
    if (corners.filter((c) => c > 0.1).length >= (lenient ? 2 : 3)) return 'x';
    return fill >= 0.45 ? 'filled' : null;
  }
  // 白玉: 中心を囲むリング
  const midRow = Math.round(cy);
  const midCol = Math.round(cx);
  let l = 0, rr = 0, u = 0, d = 0;
  for (let x = x0; x < cx; x++) l += img[midRow * w + x];
  for (let x = Math.ceil(cx); x <= x1; x++) rr += img[midRow * w + x];
  for (let y = y0; y < cy; y++) u += img[y * w + midCol];
  for (let y = Math.ceil(cy); y <= y1; y++) d += img[y * w + midCol];
  if (l && rr && u && d && fill < 0.75) return 'open';
  // 全音符: 上下の縁が五線と重なって消えていることがあるので、横長で左右の縁があれば白玉とみなす
  if (l && rr && (u || d) && bw >= bh * 1.4 && fill >= 0.3 && fill < 0.75) return 'open';
  return null;
}

/** 1つの五線について符頭を検出する */
export function findHeads(clean, w, staff, region, withStems = null) {
  const { space, top } = staff;
  const comps = mergeHalves(components(clean, w, region), space);
  const heads = [];
  const yMin = top - space * 2.7;
  const yMax = staff.bottom + space * 2.7;
  const minW = space * 0.75, maxW = space * 2.0;
  for (const c of comps) {
    if (c.w > maxW && c.w <= space * 3.8 && c.h >= space * 0.8 && c.h <= space * 2.2) {
      // 2度の同時打ちで左右にずれて接した符頭 (例: ハイハット + タム)
      const pair = splitSideBySide(clean, w, c, staff);
      if (pair) heads.push(...pair);
      continue;
    }
    if (c.w < minW || c.w > maxW) continue;
    const cy = (c.y0 + c.y1) / 2;
    if (cy < yMin || cy > yMax) continue;
    if (c.halves) {
      heads.push(makeHead(c, 'open', staff));
    } else if (c.h >= space * 0.8 && c.h <= space * 1.6) {
      const kind = classifyHead(clean, w, c);
      if (kind) heads.push(makeHead(c, kind, staff));
    } else if (c.h > space * 1.6 && c.h <= space * 4.5) {
      const stacked = splitStacked(clean, w, c, staff);
      if (stacked) {
        heads.push(...stacked);
        continue;
      }
      // 旗などが接している場合: 横幅の広い行のまとまりだけを取り出す
      for (const band of wideBands(clean, w, c, space * 0.75)) {
        if (band.h >= space * 0.8 && band.h <= space * 1.6) {
          const kind = classifyHead(clean, w, band);
          if (kind) heads.push(makeHead(band, kind, staff));
        } else {
          const parts = splitStacked(clean, w, band, staff);
          if (parts) heads.push(...parts);
        }
      }
    }
  }
  // 全音符以外は符幹があるはず (休符の切れ端などを除外)
  if (!withStems) return heads;
  const kept = heads.filter((hd) => {
    if (hd.kind === 'open') return true;
    const stem = findStem(withStems, w, hd, space);
    if (!stem) return false;
    hd.stem = stem;
    // 下向きの符幹の先にある旗は × に見えることがある:
    // 五線より下の × で、上に同じ符幹の黒玉があり、符幹がこの下でほとんど終わっているなら旗とみなす
    if (hd.kind === 'x' && hd.step >= 9) {
      const headAbove = heads.some(
        (o) => o !== hd && o.kind === 'filled' && o.x0 - 2 <= stem.x && o.x1 + 2 >= stem.x && o.y >= stem.top && hd.y - o.y >= space * 1.1,
      );
      if (headAbove && stem.bottom - hd.y1 < space * 1.8) return false;
    }
    // 上向きの符幹の旗も同じ: 五線より上の符頭で、下に同じ符幹の黒玉があり、符幹がすぐ上で終わっていれば旗
    if (hd.kind !== 'open' && hd.step <= -1) {
      const headBelow = heads.some(
        (o) => o !== hd && o.kind === 'filled' && o.step >= 0 && o.x0 - 2 <= stem.x && o.x1 + 2 >= stem.x && o.y <= stem.bottom && o.y - hd.y >= space * 1.1,
      );
      if (headBelow && hd.y0 - stem.top < space * 1.0) return false;
    }
    return true;
  });
  // 連桁・旗の本数 (8分=1, 16分=2, 32分=3) を数える
  for (const hd of kept) {
    if (!hd.stem) continue;
    const st = hd.stem;
    // 同じ符幹につながる符頭 (和音)。× 符頭は符幹の検出位置が少しずれるので、符頭の幅で判定する
    const onStem = kept.filter((o) => o === hd || (o.x0 - 3 <= st.x && o.x1 + 3 >= st.x && o.y0 <= st.bottom + 2 && o.y1 >= st.top - 2));
    hd.beams = countBeams(withStems, w, hd.stem, onStem, space);
    delete hd.stem;
  }
  return kept;
}

/**
 * 符幹の先 (符頭と反対側) にある連桁・旗の本数を数える。
 * 符幹の左右に少しずらした縦の線に沿って、太い横線を何本横切るかを見る
 */
export function countBeams(img, w, stem, heads, space) {
  const ys = heads.map((o) => o.y);
  const headTop = Math.min(...heads.map((o) => o.y0));
  const headBottom = Math.max(...heads.map((o) => o.y1));
  const up = stem.top < headTop - space * 0.5 && headTop - stem.top >= stem.bottom - headBottom; // 符頭が下、符幹が上へ
  const minRun = Math.max(2, Math.round(space * 0.28));
  const maxRun = space * 1.0;
  let best = 0;
  for (const dx of [-0.35, 0.35, -0.6, 0.6]) {
    const x = Math.round(stem.x + dx * space);
    if (x < 0 || x >= w) continue;
    let count = 0;
    let run = 0;
    const from = up ? stem.top - 1 : stem.bottom + 1;
    const limit = space * 2.4;
    const stop = up ? Math.min(stem.top + limit, headTop - space * 0.4) : Math.max(stem.bottom - limit, headBottom + space * 0.4);
    const step = up ? 1 : -1;
    for (let y = from; up ? y <= stop : y >= stop; y += step) {
      if (img[y * w + x]) run++;
      else {
        if (run >= minRun && run <= maxRun) count++;
        run = 0;
      }
    }
    if (run >= minRun && run <= maxRun) count++;
    best = Math.max(best, count);
  }
  void ys;
  return Math.min(4, best);
}

/** 符頭の左右どちらかの端から縦にまっすぐ伸びる線 (符幹) を探す。{ x, top, bottom } か null */
export function findStem(img, w, hd, space) {
  const need = space * 1.5 + (hd.y1 - hd.y0) * 0.5;
  const reach = Math.max(2, Math.round(space * 0.25));
  const h = img.length / w;
  let best = null;
  // 符幹は普通は符頭の左右の端にあるが、符頭と符幹の切れ端が一緒になって幅が広がることがあるので、幅全体を探す
  {
    for (let x = Math.round(hd.x0) - reach; x <= Math.round(hd.x1) + reach; x++) {
      if (x < 0 || x >= w) continue;
      for (const start of [Math.round(hd.y0), Math.round(hd.y), Math.round(hd.y1)]) {
        if (!img[start * w + x]) continue;
        let up = start;
        while (up > 0 && img[(up - 1) * w + x]) up--;
        let down = start;
        while (down < h - 1 && img[(down + 1) * w + x]) down++;
        const len = down - up + 1;
        if (len >= need && (!best || len > best.bottom - best.top + 1)) best = { x, top: up, bottom: down };
      }
    }
  }
  return best;
}

/** 五線と重なって上下の縁が消えた全音符 (左右2つに割れた塊) をまとめる */
function mergeHalves(comps, space) {
  const used = new Set();
  const out = [];
  const sorted = [...comps].sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const a = sorted[i];
    const half = (c) => c.w >= space * 0.4 && c.w <= space * 1.0 && c.h >= space * 0.6 && c.h <= space * 1.3;
    let merged = null;
    if (half(a)) {
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (b.x0 - a.x1 > space * 0.6) break;
        if (used.has(j) || !half(b) || b.x0 <= a.x1) continue;
        if (Math.abs(a.y0 - b.y0) <= space * 0.25 && Math.abs(a.y1 - b.y1) <= space * 0.25) {
          used.add(j);
          const x0 = a.x0, x1 = b.x1, y0 = Math.min(a.y0, b.y0), y1 = Math.max(a.y1, b.y1);
          merged = { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, count: a.count + b.count, halves: true };
          break;
        }
      }
    }
    out.push(merged ?? a);
  }
  return out;
}

/** 左右に接した2つの符頭 (2度の同時打ち) を切り分ける。失敗したら null */
function splitSideBySide(img, w, c, staff) {
  const { space } = staff;
  const headW = Math.round(Math.min(space * 1.6, Math.max(space * 0.9, c.w * 0.55)));
  const centerY = (xa, xb) => {
    let sum = 0, n = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      for (let x = xa; x <= xb; x++) {
        if (img[y * w + x]) {
          sum += y;
          n++;
        }
      }
    }
    return n ? sum / n : null;
  };
  const cols = [
    [c.x0, c.x0 + headW - 1],
    [c.x1 - headW + 1, c.x1],
  ];
  const cys = cols.map(([xa, xb]) => centerY(xa, xb));
  if (cys.includes(null)) return null;
  const dy = Math.abs(cys[0] - cys[1]);
  if (dy < space * 0.25 || dy > space * 0.8) return null;
  const parts = [];
  for (let k = 0; k < 2; k++) {
    const [xa, xb] = cols[k];
    const box = {
      x0: xa,
      x1: xb,
      y0: Math.max(c.y0, Math.round(cys[k] - space * 0.55)),
      y1: Math.min(c.y1, Math.round(cys[k] + space * 0.55)),
    };
    const kind = classifyHead(img, w, box, true);
    if (!kind) return null;
    parts.push(makeHead(box, kind, staff));
  }
  if (Math.abs(parts[0].step - parts[1].step) !== 1) return null;
  return parts;
}

/** 縦に重なった符頭 (例: バスドラ + フロアタム) を分割する。失敗したら null */
function splitStacked(img, w, box, staff) {
  const { space } = staff;
  const h = box.y1 - box.y0 + 1;
  if (h <= space * 1.6 || h > space * 3.4) return null;
  const n = Math.round(h / space);
  if (n < 2) return null;
  const ph = h / n;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const b = { x0: box.x0, x1: box.x1, y0: Math.round(box.y0 + ph * k), y1: Math.round(box.y0 + ph * (k + 1) - 1) };
    const kind = classifyHead(img, w, b);
    if (!kind) return null;
    parts.push(makeHead(b, kind, staff));
  }
  return parts;
}

/** 黒画素が minWidth 以上ある行が連続する帯を返す */
function wideBands(img, w, c, minWidth) {
  const bands = [];
  let cur = null;
  for (let y = c.y0; y <= c.y1 + 1; y++) {
    let n = 0, bx0 = Infinity, bx1 = -1;
    if (y <= c.y1) {
      for (let x = c.x0; x <= c.x1; x++) {
        if (img[y * w + x]) {
          n++;
          if (x < bx0) bx0 = x;
          bx1 = x;
        }
      }
    }
    if (n >= minWidth) {
      if (!cur) cur = { x0: bx0, x1: bx1, y0: y, y1: y };
      else {
        cur.x0 = Math.min(cur.x0, bx0);
        cur.x1 = Math.max(cur.x1, bx1);
        cur.y1 = y;
      }
    } else if (cur) {
      cur.h = cur.y1 - cur.y0 + 1;
      cur.w = cur.x1 - cur.x0 + 1;
      bands.push(cur);
      cur = null;
    }
  }
  return bands;
}

function makeHead(box, kind, staff) {
  const x = (box.x0 + box.x1) / 2;
  const y = (box.y0 + box.y1) / 2;
  return {
    x,
    y,
    x0: box.x0,
    y0: box.y0,
    x1: box.x1,
    y1: box.y1,
    kind,
    step: Math.round((y - staff.top) / (staff.space / 2)),
  };
}

/** 段頭の音部記号・拍子記号の右端を推定する (五線の内側に収まる背の高い記号) */
/**
 * 3連符の「3」を探す。五線の上下 (五線から離れた所) にある数字くらいの大きさの部品のうち、
 * 左側が上・中・下の3か所だけ黒く、右側が縦につながっている形を「3」とみなす
 */
export function findTripletMarks(bin, w, h, staff) {
  const { top, bottom, space, left, right } = staff;
  const rx0 = Math.max(0, Math.floor(left));
  const rx1 = Math.min(w - 1, Math.ceil(right));
  const marks = [];
  for (const [ya, yb] of [
    [top - space * 8, top - space * 0.25],
    [bottom + space * 0.25, bottom + space * 8],
  ]) {
    const ry0 = Math.max(0, Math.floor(ya));
    const ry1 = Math.min(h - 1, Math.ceil(yb));
    if (ry1 <= ry0) continue;
    for (const c of components(bin, w, { rx0, ry0, rx1, ry1 })) {
      if (c.h < space * 0.8 || c.h > space * 2.2 || c.w < space * 0.45 || c.w > space * 1.5 || c.w > c.h || c.w < c.h * 0.45) continue;
      if (c.y0 <= ry0 || c.y1 >= ry1) continue;
      if (isThree(bin, w, c)) marks.push({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 });
    }
  }
  return marks;
}

function isThree(bin, w, c) {
  // 各行の左端・右端の位置 (部品の幅に対する割合)
  const L = [];
  const R = [];
  for (let y = c.y0; y <= c.y1; y++) {
    let l = -1;
    let r = -1;
    for (let x = c.x0; x <= c.x1; x++) {
      if (bin[y * w + x]) {
        if (l < 0) l = x;
        r = x;
      }
    }
    L.push(l < 0 ? 1 : (l - c.x0) / c.w);
    R.push(r < 0 ? 0 : (r - c.x0 + 1) / c.w);
  }
  const n = L.length;
  const part = (arr, a, b, fn) => fn(...arr.slice(Math.floor(n * a), Math.max(Math.floor(n * a) + 1, Math.ceil(n * b))));
  // 左側に 2 つのくぼみ (上と下) があり、その間 (中央の横棒) と上下の端は左に張り出している
  const topL = part(L, 0, 0.25, Math.min);
  const gap1 = part(L, 0.15, 0.45, Math.max);
  const midL = part(L, 0.4, 0.6, Math.min);
  const gap2 = part(L, 0.55, 0.85, Math.max);
  const botL = part(L, 0.75, 1, Math.min);
  if (gap1 - Math.max(topL, midL) < 0.15 || gap2 - Math.max(midL, botL) < 0.15) return false;
  // 一番下は丸く終わる (「2」のような全幅の横棒ではない)
  const fill = (y) => {
    let k = 0;
    for (let x = c.x0; x <= c.x1; x++) k += bin[y * w + x];
    return k / c.w;
  };
  if (Math.max(fill(c.y1), fill(c.y1 - 1)) > 0.75) return false;
  // 右側はずっと右寄り (左が開いた形)
  return part(R, 0.1, 0.9, Math.min) >= 0.5;
}

/**
 * 五線の上下に書かれた手順 (R / L) の文字を探す。
 * 左に縦棒があり、右上が空いて下に横棒があれば L、右上に丸い部分があれば R とみなす。
 * 3 文字以上が同じ高さに並んでいるものだけを手順として使う
 */
export function findStickings(bin, w, h, staff, others = []) {
  const { top, bottom, space, left, right } = staff;
  const rx0 = Math.max(0, Math.floor(left));
  const rx1 = Math.min(w - 1, Math.ceil(right));
  const found = [];
  const unknownAll = [];
  for (const [ya, yb] of [
    [bottom + space * 0.4, bottom + space * 7],
    [top - space * 7, top - space * 0.4],
  ]) {
    const ry0 = Math.max(0, Math.floor(ya));
    const ry1 = Math.min(h - 1, Math.ceil(yb));
    if (ry1 <= ry0) continue;
    const comps = components(bin, w, { rx0, ry0, rx1, ry1 }).filter((c) => c.h >= space * 0.3);
    for (const c of comps) {
      if (c.h < space * 0.6 || c.h > space * 2.2 || c.w < space * 0.35 || c.w > space * 2 || c.w > c.h * 1.2) continue;
      if (c.y0 <= ry0 || c.y1 >= ry1) continue;
      const cy = (c.y0 + c.y1) / 2;
      const cx = (c.x0 + c.x1) / 2;
      // 別の段のほうが近い文字はその段のもの
      const dist = (st) => Math.max(0, st.top - cy, cy - st.bottom);
      if (others.some((o) => o !== staff && cx >= o.left && cx <= o.right && dist(o) < dist(staff))) continue;
      const hand = classifyRL(bin, w, c);
      if (!hand) {
        unknownAll.push({ x: cx, y: cy });
        continue;
      }
      // 単語の一部 (すぐ隣に R / L 以外の文字がある) なら手順ではない
      const inWord = comps.some(
        (o) => o !== c && o.y1 > c.y0 && o.y0 < c.y1 && (Math.abs(o.x0 - c.x1) < space * 0.35 || Math.abs(c.x0 - o.x1) < space * 0.35) && !classifyRL(bin, w, o),
      );
      if (!inWord) found.push({ hand, x0: c.x0, x1: c.x1, x: cx, y: cy });
    }
  }
  // 同じ高さに 3 つ以上並んだものだけ残す。読めない文字が多く混ざる列 (知らない字体など) は信用しない
  return found.filter((a) => {
    const row = found.filter((b) => Math.abs(b.y - a.y) < space * 0.6).length;
    const bad = unknownAll.filter((b) => Math.abs(b.y - a.y) < space * 0.6).length;
    return row >= 3 && bad <= row * 0.15;
  });
}

/** 部品の上 60% に、外とつながっていない白い部分 (輪の中) があるか */
function upperHole(bin, w, c) {
  const W = c.w + 2;
  const H = c.h + 2;
  const seen = new Uint8Array(W * H);
  const isDark = (x, y) => x >= 1 && y >= 1 && x <= c.w && y <= c.h && bin[(c.y0 + y - 1) * w + c.x0 + x - 1];
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (seen[q] || isDark(nx, ny)) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  let holes = 0;
  let sumY = 0;
  for (let y = 1; y <= c.h; y++) {
    for (let x = 1; x <= c.w; x++) {
      if (!seen[y * W + x] && !isDark(x, y)) {
        holes++;
        sumY += y - 1;
      }
    }
  }
  return holes >= c.w * c.h * 0.02 && sumY / holes < c.h * 0.6;
}

export function classifyRL(bin, w, c) {
  const dark = (x, y) => bin[y * w + x];
  const rows = c.h;
  const cols = c.w;
  // 左側の縦棒: ほぼすべての行で左 35% に黒がある
  const lw = Math.max(1, Math.round(cols * 0.35));
  let leftRows = 0;
  for (let y = c.y0; y <= c.y1; y++) {
    for (let x = c.x0; x < c.x0 + lw; x++) {
      if (dark(x, y)) {
        leftRows++;
        break;
      }
    }
  }
  if (leftRows < rows * 0.85) {
    // 手書き風の R (左の縦棒がまっすぐでない)
    let bottom = 0;
    for (let y = c.y0 + Math.floor(rows * 0.8); y <= c.y1; y++) {
      let k = 0;
      for (let x = c.x0; x <= c.x1; x++) k += dark(x, y);
      bottom = Math.max(bottom, k / cols);
    }
    return bottom >= 0.6 && upperHole(bin, w, c) ? 'R' : null;
  }
  const fillOf = (fx0, fx1, fy0, fy1) => {
    let k = 0;
    let n = 0;
    for (let y = c.y0 + Math.floor(rows * fy0); y < c.y0 + Math.ceil(rows * fy1); y++) {
      for (let x = c.x0 + Math.floor(cols * fx0); x < c.x0 + Math.ceil(cols * fx1); x++) {
        k += dark(x, y);
        n++;
      }
    }
    return n ? k / n : 0;
  };
  const topRight = fillOf(0.6, 1, 0.05, 0.4);
  const bottomBand = (() => {
    // 下の方の行で一番横に長く黒が続く割合
    let best = 0;
    for (let y = c.y0 + Math.floor(rows * 0.8); y <= c.y1; y++) {
      let k = 0;
      for (let x = c.x0; x <= c.x1; x++) k += dark(x, y);
      best = Math.max(best, k / cols);
    }
    return best;
  })();
  const midRight = fillOf(0.6, 1, 0.4, 0.65);
  if (topRight < 0.06 && midRight < 0.08 && bottomBand >= 0.55) return 'L';
  // 手書き風の R: 上半分に閉じた輪があり、下で右へ大きく払う
  if (bottomBand >= 0.6 && upperHole(bin, w, c)) return 'R';
  if (topRight >= 0.12 && fillOf(0.6, 1, 0.7, 1) >= 0.08) {
    // R は上の丸の中が空いていて、真ん中あたりに縦棒から右へ横棒が通る (「0」や「1」と区別する)
    if (fillOf(0.35, 0.6, 0.12, 0.3) > 0.35) return null;
    // 上は横棒で閉じている (「H」は上が開いている)
    if (fillOf(0.35, 0.6, 0, 0.15) < 0.12) return null;
    let bar = false;
    for (let y = c.y0 + Math.floor(rows * 0.3); y <= c.y0 + Math.ceil(rows * 0.6); y++) {
      let k = 0;
      const xs = c.x0 + Math.floor(cols * 0.15);
      const xe = c.x0 + Math.ceil(cols * 0.65);
      for (let x = xs; x < xe; x++) k += dark(x, y);
      if (k >= (xe - xs) * 0.7) bar = true;
    }
    return bar ? 'R' : null;
  }
  return null;
}

function headerEnd(comps, staff, firstBar) {
  const { left, top, bottom, space } = staff;
  let end = left + space * 2.5;
  for (const c of comps) {
    if (c.x0 > Math.min(firstBar, left + space * 9)) continue;
    const inside = c.y0 >= top - space * 0.4 && c.y1 <= bottom + space * 0.4;
    if (inside && c.h >= space * 1.4 && c.w >= space * 0.3 && c.w <= space * 4) end = Math.max(end, c.x1 + 1);
  }
  return end;
}

/**
 * 1ページ分の画像を解析する。
 * 戻り値の座標はピクセル単位 (呼び出し側で正規化する)
 */
export function analyzePage(rgba, width, height) {
  let gray = toGray(rgba, width, height);
  // スキャンした本は少し傾いていることが多いので、まっすぐに直してから読む
  const skew = estimateSkew(grayToBinary(gray, 200), width, height);
  if (Math.abs(skew) >= 0.05) gray = rotateGray(gray, width, height, skew);
  let bin = grayToBinary(gray, 170);
  let staves = findStaves(bin, width, height);
  // 薄くかすれた五線や少し曲がったスキャン: 淡い灰色も黒とみなし、線の途切れと 1px の上下のずれを許して探す。
  // こちらのほうが多く見つかればそれを使う
  const soft = grayToBinary(gray, 205);
  const thick = new Uint8Array(soft.length);
  for (let i = width; i < soft.length - width; i++) thick[i] = soft[i] | soft[i - width] | soft[i + width];
  const found = findStaves(thick, width, height, { maxGap: Math.round(width * 0.03) });
  if (found.length > staves.length) {
    bin = soft;
    staves = found;
  }
  // 同じ五線の一部を重ねて拾ったものは、長いほうだけ残す
  staves = staves.filter(
    (st) =>
      !staves.some(
        (o) => o !== st && Math.abs(o.top - st.top) < st.space && o.right - o.left > st.right - st.left && Math.min(o.right, st.right) - Math.max(o.left, st.left) > 0,
      ),
  );
  // 五線の間隔が他と大きく違うもの (文章の行などの誤検出) は捨てる
  if (staves.length >= 3) {
    const sp = staves.map((st) => st.space).sort((a, b) => a - b);
    const med = sp[Math.floor(sp.length / 2)];
    staves = staves.filter((st) => st.space < med * 1.5 && st.space > med / 1.5);
  }
  const result = [];
  for (const staff of staves) {
    const bars = findBarlines(bin, width, height, staff);
    const { clean, noLines, region } = cleanStaffRegion(bin, width, height, staff);
    const comps = components(noLines, width, region);
    const firstBar = bars.length ? bars[0].x : staff.right;
    const hEnd = headerEnd(comps, staff, firstBar);
    const heads = findHeads(clean, width, staff, region, noLines).filter((hd) => hd.x > hEnd);

    // 「3」は音符のまとまりの上下に書かれる。近くに符頭のないもの (練習番号の数字など) は除く
    const tripletMarks = findTripletMarks(bin, width, height, staff).filter((t) => heads.some((hd) => Math.abs(hd.x - t.x) < staff.space * 2.2 && Math.abs(hd.y - t.y) > staff.space * 0.9));
    // 「3」の数字を符頭と読まないようにする
    for (let i = heads.length - 1; i >= 0; i--) {
      const hd = heads[i];
      if (tripletMarks.some((t) => Math.abs(hd.x - t.x) < staff.space * 0.7 && Math.abs(hd.y - t.y) < staff.space * 0.9)) heads.splice(i, 1);
    }
    // 手順の文字は音符の真下 (真上) にある。近くに符頭のないもの (題名などの文字) は除き、3 つ以上並んだものだけ使う
    let stickMarks = findStickings(soft, width, height, staff, staves).filter((t) => heads.some((hd) => Math.abs(hd.x - t.x) < staff.space * 1.2));
    // 手順は段の上か下の 1 列に書かれるので、一番多く並んだ列だけ使う
    const rowOf = (a) => stickMarks.filter((b) => Math.abs(b.y - a.y) < staff.space * 0.6);
    const best = stickMarks.reduce((acc, a) => (rowOf(a).length > acc.length ? rowOf(a) : acc), []);
    stickMarks = best.length >= 3 ? best : [];
    // 小節の区切り
    const bounds = [];
    for (const b of bars) {
      if (b.x - (bounds.length ? bounds[bounds.length - 1] : staff.left) > staff.space * 2 || bounds.length === 0) bounds.push(b.x);
    }
    if (!bounds.length || bounds[0] - staff.left > staff.space * 2) bounds.unshift(staff.left);
    else bounds[0] = staff.left;
    if (staff.right - bounds[bounds.length - 1] > staff.space * 3) bounds.push(staff.right);

    const measures = [];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const x0 = bounds[k];
      const x1 = bounds[k + 1];
      const notes = heads.filter((hd) => hd.x > x0 && hd.x < x1);
      const triplets = tripletMarks.filter((t) => t.x > x0 && t.x < x1).length;
      const stickings = stickMarks.filter((t) => t.x > x0 && t.x < x1);
      measures.push({ x0, x1, contentStart: k === 0 ? hEnd : x0, firstInSystem: k === 0, notes, triplets, stickings });
    }
    // 符頭が1つもない段頭の領域 (拍子記号だけの区間など) は捨てる
    if (measures.length > 1 && measures[0].notes.length === 0 && measures[0].x1 - hEnd < staff.space * 2) {
      measures.shift();
      measures[0].firstInSystem = true;
    }
    result.push({ ...staff, measures, headerEnd: hEnd, tripletMarks });
  }
  return { width, height, skew, staves: result };
}
