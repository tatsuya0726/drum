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

/** 各行の最長の黒ラン(2px までの途切れは許容)を求める */
function longestRuns(bin, w, h) {
  const len = new Int32Array(h);
  const start = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let best = 0, bestStart = 0, cur = 0, curStart = 0, gap = 0;
    for (let x = 0; x < w; x++) {
      if (bin[row + x]) {
        if (cur === 0) curStart = x;
        cur += gap + 1;
        gap = 0;
        if (cur > best) {
          best = cur;
          bestStart = curStart;
        }
      } else if (cur > 0) {
        gap++;
        if (gap > 2) {
          cur = 0;
          gap = 0;
        }
      }
    }
    len[y] = best;
    start[y] = bestStart;
  }
  return { len, start };
}

/** 五線を検出する */
export function findStaves(bin, w, h) {
  const { len, start } = longestRuns(bin, w, h);
  const minRun = Math.max(40, w * 0.15);
  const lines = [];
  for (let y = 0; y < h; y++) {
    if (len[y] < minRun) continue;
    const last = lines[lines.length - 1];
    if (last && last.y1 === y - 1) {
      last.y1 = y;
      last.x0 = Math.min(last.x0, start[y]);
      last.x1 = Math.max(last.x1, start[y] + len[y] - 1);
    } else {
      lines.push({ y0: y, y1: y, x0: start[y], x1: start[y] + len[y] - 1 });
    }
  }
  for (const l of lines) {
    l.yc = (l.y0 + l.y1) / 2;
    l.t = l.y1 - l.y0 + 1;
  }

  const staves = [];
  let i = 0;
  while (i + 4 < lines.length) {
    const group = lines.slice(i, i + 5);
    const gaps = [];
    for (let k = 0; k < 4; k++) gaps.push(group[k + 1].yc - group[k].yc);
    const mean = gaps.reduce((a, b) => a + b, 0) / 4;
    const thick = Math.max(...group.map((l) => l.t));
    const ok =
      mean > thick * 2 + 2 &&
      mean < h / 8 &&
      gaps.every((g) => Math.abs(g - mean) <= Math.max(1.5, mean * 0.2)) &&
      group.every((l) => Math.abs(l.x0 - group[0].x0) < mean * 3 && Math.abs(l.x1 - group[0].x1) < mean * 3);
    if (!ok) {
      i++;
      continue;
    }
    const sorted = (arr) => [...arr].sort((a, b) => a - b);
    staves.push({
      lines: group.map((l) => l.yc),
      top: group[0].yc,
      bottom: group[4].yc,
      space: mean,
      thickness: group.reduce((a, l) => a + l.t, 0) / 5,
      left: sorted(group.map((l) => l.x0))[2],
      right: sorted(group.map((l) => l.x1))[2],
    });
    i += 5;
  }
  return staves;
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
      if (x1 - x0 + 1 <= space * 0.8) bars.push({ x0, x1 });
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
  const stemMin = space * 1.8;
  const stemWidth = Math.max(2, space * 0.3);
  for (let y = 0; y < r.rh; y++) {
    for (let x = 0; x < r.rw; x++) {
      const k = y * r.rw + x;
      if (r.vrun[k] >= stemMin && r.hrun[k] <= stemWidth) clean[(y + ry0) * w + x + rx0] = 0;
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
  return null;
}

/** 1つの五線について符頭を検出する */
export function findHeads(clean, w, staff, region) {
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
  return heads;
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
  const bin = toBinary(rgba, width, height);
  const staves = findStaves(bin, width, height);
  const result = [];
  for (const staff of staves) {
    const bars = findBarlines(bin, width, height, staff);
    const { clean, noLines, region } = cleanStaffRegion(bin, width, height, staff);
    const comps = components(noLines, width, region);
    const firstBar = bars.length ? bars[0].x : staff.right;
    const hEnd = headerEnd(comps, staff, firstBar);
    const heads = findHeads(clean, width, staff, region).filter((hd) => hd.x > hEnd);

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
      measures.push({ x0, x1, contentStart: k === 0 ? hEnd : x0, firstInSystem: k === 0, notes });
    }
    // 符頭が1つもない段頭の領域 (拍子記号だけの区間など) は捨てる
    if (measures.length > 1 && measures[0].notes.length === 0 && measures[0].x1 - hEnd < staff.space * 2) {
      measures.shift();
      measures[0].firstInSystem = true;
    }
    result.push({ ...staff, measures, headerEnd: hEnd });
  }
  return { width, height, staves: result };
}
