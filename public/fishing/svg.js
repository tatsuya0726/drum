// 魚・仕掛け・結び方の図を SVG 文字列で作る。画像ファイルは使わない。

const BODY = {
  fusiform: 'M20,50 C45,24 120,20 163,45 L192,26 L186,50 L192,74 L163,55 C120,80 45,76 20,50Z',
  deep: 'M16,52 C38,10 110,6 150,38 L188,18 L180,50 L188,82 L150,62 C110,94 38,94 16,52Z',
  slender: 'M10,52 C40,38 130,38 170,46 L194,34 L188,52 L194,68 L170,56 C130,66 40,66 10,52Z',
  flat: 'M22,50 C42,8 150,6 172,50 C150,94 42,92 22,50Z M170,50 L194,38 L194,62Z',
  puffer: 'M24,50 C24,12 134,10 150,50 C134,90 24,88 24,50Z M148,50 L186,36 L186,64Z',
  ray: 'M104,14 C140,24 172,40 182,50 C172,60 140,76 104,86 C70,78 36,62 24,50 C36,38 70,22 104,14Z M24,50 L4,50',
  catfish: 'M12,50 C40,36 120,34 168,46 C176,34 188,38 194,46 C190,54 178,62 168,54 C120,66 40,64 12,50Z',
};

const DORSAL = {
  fusiform: 'M70,31 L92,12 L112,30Z',
  deep: 'M60,24 L84,2 L128,22Z',
  slender: 'M70,40 L90,26 L120,39Z',
  flat: 'M40,16 C80,2 130,2 160,18 C130,10 80,10 40,16Z',
  puffer: '',
  ray: '',
  catfish: 'M72,38 L86,16 L104,37Z',
};

let uid = 0;

/** 魚の絵。f = { shape, top, belly, fin, pattern, eye, label } */
export function fishSvg(f, { width = 200 } = {}) {
  const id = `g${uid++}`;
  const shape = f.shape || 'fusiform';
  const top = f.top || '#4a6b8a';
  const belly = f.belly || '#dfe7ee';
  const fin = f.fin || top;
  const body = BODY[shape];
  const parts = [];
  parts.push(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset=".52" stop-color="${top}"/>` +
    `<stop offset=".62" stop-color="${belly}"/><stop offset="1" stop-color="${belly}"/></linearGradient>` +
    `<clipPath id="c${id}"><path d="${body}"/></clipPath></defs>`);

  if (shape === 'octopus') return octopusSvg(f, width);

  if (DORSAL[shape]) parts.push(`<path d="${DORSAL[shape]}" fill="${fin}" opacity=".9"/>`);
  if (shape === 'catfish') {
    parts.push('<path d="M20,46 L6,36 M20,50 L4,50 M20,54 L8,66" stroke="#2c3a47" stroke-width="2" fill="none" stroke-linecap="round"/>');
  }
  if (shape === 'ray') {
    parts.push('<path d="M24,50 L2,50" stroke="#6b4f3a" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M10,50 L22,47" stroke="#d94b3f" stroke-width="3" stroke-linecap="round"/>');
  }
  parts.push(`<path d="${body}" fill="${shape === 'ray' ? top : `url(#${id})`}" stroke="#1f2a35" stroke-opacity=".35" stroke-width="1.5" fill-rule="nonzero"/>`);

  const clip = `clip-path="url(#c${id})"`;
  const pat = f.pattern || '';
  if (pat.includes('stripes')) {
    let s = '';
    for (let x = 52; x < 150; x += 17) s += `<path d="M${x},20 q6,30 -2,62" stroke="#1d2b38" stroke-opacity=".55" stroke-width="5" fill="none"/>`;
    parts.push(`<g ${clip}>${s}</g>`);
  }
  if (pat.includes('wavy')) {
    let s = '';
    for (let x = 48; x < 160; x += 14) s += `<path d="M${x},22 q7,7 0,14 t0,14" stroke="#1d2b38" stroke-opacity=".5" stroke-width="3.5" fill="none"/>`;
    parts.push(`<g ${clip}>${s}</g>`);
  }
  if (pat.includes('spots')) {
    let s = '';
    const dots = [[60, 38], [78, 44], [96, 36], [112, 46], [130, 40], [70, 56], [92, 54], [118, 58], [140, 50]];
    for (const [x, y] of dots) s += `<circle cx="${x}" cy="${y}" r="3.4" fill="#1d2b38" fill-opacity=".55"/>`;
    parts.push(`<g ${clip}>${s}</g>`);
  }
  if (pat.includes('bands')) {
    parts.push(`<g ${clip}><path d="M30,40 L180,40 M30,48 L180,48" stroke="#f1c24b" stroke-width="5" opacity=".85"/></g>`);
  }
  if (pat.includes('lateral')) {
    parts.push('<path d="M40,50 C80,44 130,46 165,50" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" fill="none"/>');
  }
  if (pat.includes('scutes')) {
    parts.push('<path d="M100,50 C130,47 150,48 165,50" stroke="#e8e8e8" stroke-width="3" stroke-dasharray="2 2" fill="none"/>');
  }
  if (pat.includes('belly-spots')) {
    parts.push(`<g ${clip}><circle cx="70" cy="64" r="3" fill="#1d2b38" fill-opacity=".4"/><circle cx="90" cy="68" r="3" fill="#1d2b38" fill-opacity=".4"/><circle cx="112" cy="66" r="3" fill="#1d2b38" fill-opacity=".4"/></g>`);
  }
  // えら・目
  const ex = shape === 'ray' ? 60 : shape === 'flat' ? 48 : 40;
  const ey = shape === 'ray' ? 44 : shape === 'flat' ? 38 : 46;
  if (shape !== 'ray') parts.push(`<path d="M${ex + 12},${ey - 12} q-8,18 0,34" stroke="#1f2a35" stroke-opacity=".35" stroke-width="1.6" fill="none"/>`);
  parts.push(`<circle cx="${ex}" cy="${ey}" r="5.2" fill="#fff"/><circle cx="${ex - 0.6}" cy="${ey}" r="3" fill="${f.eye || '#111'}"/>`);
  if (shape === 'flat') parts.push(`<circle cx="${ex + 16}" cy="${ey - 4}" r="4.4" fill="#fff"/><circle cx="${ex + 15.4}" cy="${ey - 4}" r="2.5" fill="#111"/>`);
  if (shape === 'ray') parts.push(`<circle cx="${ex + 12}" cy="${ey + 12}" r="3" fill="#fff"/><circle cx="${ex + 12}" cy="${ey + 12}" r="1.6" fill="#111"/>`);
  if (shape === 'puffer') parts.push('<path d="M30,60 q8,6 18,2" stroke="#1f2a35" stroke-opacity=".5" stroke-width="2" fill="none"/>');

  return `<svg class="fish-svg" viewBox="0 0 200 100" width="${width}" role="img" aria-label="${esc(f.label || '魚のイラスト')}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

function octopusSvg(f, width) {
  const top = f.top || '#d9b36b';
  let arms = '';
  for (let i = 0; i < 8; i++) {
    const x = 62 + i * 11;
    const dir = i % 2 ? 1 : -1;
    arms += `<path d="M${x},58 q${dir * 6},22 ${dir * -4},34 q${dir * -3},4 ${dir * 2},4" stroke="${top}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  }
  const rings = [[78, 32], [100, 24], [120, 34], [90, 44], [112, 46]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#2f7bd9" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="1.6" fill="#2f7bd9"/>`).join('');
  return `<svg class="fish-svg" viewBox="0 0 200 100" width="${width}" role="img" aria-label="${esc(f.label || 'タコのイラスト')}" xmlns="http://www.w3.org/2000/svg">` +
    `${arms}<path d="M58,58 C50,10 140,2 142,56 Z" fill="${top}" stroke="#1f2a35" stroke-opacity=".35" stroke-width="1.5"/>` +
    `${rings}<circle cx="86" cy="54" r="4.4" fill="#fff"/><circle cx="86" cy="54" r="2.4" fill="#111"/>` +
    `<circle cx="116" cy="54" r="4.4" fill="#fff"/><circle cx="116" cy="54" r="2.4" fill="#111"/></svg>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/* ---------- 仕掛けの図 (縦: 竿先の糸 → 仕掛け) ---------- */
const INK = '#2c3e50';
const LINE = '#5a6b7b';
function hook(x, y, s = 1) {
  return `<path d="M${x},${y} v${10 * s} q0,${9 * s} ${-7 * s},${9 * s} q${-6 * s},0 ${-6 * s},${-5 * s}" fill="none" stroke="#7b8794" stroke-width="2.2" stroke-linecap="round"/><circle cx="${x}" cy="${y - 1}" r="2" fill="none" stroke="#7b8794" stroke-width="1.4"/>`;
}
function sinker(x, y, c = '#8a8f98') {
  return `<path d="M${x},${y} l-7,16 q7,6 14,0Z" fill="${c}" stroke="${INK}" stroke-opacity=".4"/>`;
}
function swivel(x, y) {
  return `<ellipse cx="${x}" cy="${y}" rx="4" ry="6" fill="none" stroke="#7b8794" stroke-width="2"/>`;
}
function label(x, y, t, anchor = 'start') {
  return `<text x="${x}" y="${y}" font-size="11" fill="${INK}" text-anchor="${anchor}" font-family="system-ui,sans-serif">${esc(t)}</text>`;
}
function wrap(inner, h = 230) {
  return `<svg class="rig-svg" viewBox="0 0 220 ${h}" role="img" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

export function rigSvg(kind) {
  const L = (d) => `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="2"/>`;
  switch (kind) {
    case 'sabiki': {
      let s = L('M60,6 V196') + label(70, 14, '道糸') + swivel(60, 28) + label(70, 32, 'サルカン');
      for (let i = 0; i < 4; i++) {
        const y = 50 + i * 34;
        s += L(`M60,${y} h30`) + hook(90, y, 0.8) + `<path d="M92,${y + 14} l8,-3 m-8,3 l8,5 m-8,-5 l9,0" stroke="#f08a9b" stroke-width="2"/>`;
      }
      s += label(100, 60, 'ハリス付き針') + label(100, 72, '(魚皮・スキン)');
      s += `<rect x="46" y="196" width="28" height="26" rx="5" fill="#f6c453" stroke="${INK}" stroke-opacity=".4"/>` + label(80, 214, 'コマセかご');
      return wrap(s);
    }
    case 'nage': {
      let s = L('M60,6 V120') + label(70, 14, '道糸') + swivel(60, 130) + label(70, 134, 'サルカン');
      s += sinker(60, 138) + label(72, 150, 'オモリ(天秤)');
      s += L('M60,158 q30,6 60,18') + L('M60,158 q-18,14 -18,34') + hook(120, 176, 0.9) + hook(42, 192, 0.9);
      s += label(132, 192, '針を2本') + label(132, 206, '(青イソメなど)');
      return wrap(s);
    }
    case 'float': {
      let s = L('M60,6 V70') + label(70, 14, '道糸') +
        `<ellipse cx="60" cy="82" rx="8" ry="14" fill="#e8553e" stroke="${INK}" stroke-opacity=".4"/><rect x="58" y="62" width="4" height="10" fill="#fff"/>` + label(74, 86, 'ウキ');
      s += L('M60,96 V150') + sinker(60, 124) + label(72, 140, 'ガン玉');
      s += swivel(60, 154) + L('M60,160 V200') + hook(60, 200, 0.9) + label(74, 176, 'ハリス') + label(76, 222, '針+エサ');
      return wrap(s, 240);
    }
    case 'lure': {
      let s = L('M20,10 C60,10 90,40 130,60') + label(30, 8, '道糸(PEなど)');
      s += `<rect x="126" y="56" width="10" height="8" fill="none" stroke="#7b8794" stroke-width="2"/>` + label(128, 78, 'リーダー(フロロ等)');
      s += L('M136,60 q20,10 30,30') + swivel(166, 94) + label(176, 98, 'スナップ');
      s += `<path d="M162,108 q24,-8 44,6 q-20,16 -44,6Z" fill="#8fb3d9" stroke="${INK}" stroke-opacity=".5"/><circle cx="196" cy="112" r="2" fill="#111"/>`;
      s += `<path d="M178,122 l-3,10 M190,122 l3,10" stroke="#7b8794" stroke-width="2"/>` + label(130, 150, 'ミノー/メタルジグ');
      return wrap(s, 170);
    }
    case 'hera': {
      let s = L('M60,6 V50') + label(70, 14, '道糸') +
        `<rect x="56" y="24" width="8" height="6" fill="#444"/>` + label(70, 32, 'ウキゴム');
      s += `<rect x="55" y="40" width="10" height="50" rx="4" fill="#d99a3c" stroke="${INK}" stroke-opacity=".4"/><rect x="55" y="40" width="10" height="10" rx="4" fill="#e8553e"/>` + label(72, 68, 'パイプトップのウキ');
      s += L('M60,90 V130') + sinker(60, 112) + label(72, 124, 'オモリ');
      s += `<rect x="56" y="140" width="8" height="8" fill="#888"/>` + label(70, 146, 'ハリス止め');
      s += L('M60,148 V176') + hook(60, 176, 0.9) + label(74, 158, 'ハリス(道糸より細く)') + label(70, 214, '針+練りエサ');
      return wrap(s, 230);
    }
    default:
      return wrap('');
  }
}

/* ---------- 結びの図 ---------- */
const STRAND = '#e0912f'; // 本線
const TAIL = '#3a8f6b'; // 端糸

function knotWrap(inner) {
  return `<svg class="knot-svg" viewBox="0 0 240 140" role="img" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
function eye(x = 56, y = 70) {
  return `<g><path d="M${x - 40},${y + 36} L${x - 10},${y + 10}" stroke="#9aa5b1" stroke-width="5" stroke-linecap="round"/>` +
    `<ellipse cx="${x}" cy="${y}" rx="11" ry="14" fill="none" stroke="#9aa5b1" stroke-width="4"/></g>`;
}
const sw = (c) => `fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
function note(x, y, t, c = INK) {
  return `<text x="${x}" y="${y}" font-size="11" fill="${c}" font-family="system-ui,sans-serif">${esc(t)}</text>`;
}
const arrow = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 7;
  const p = (t) => `${x2 - h * Math.cos(a + t)},${y2 - h * Math.sin(a + t)}`;
  return `<path d="M${x1},${y1} L${x2},${y2} M${p(0.5)} L${x2},${y2} L${p(-0.5)}" fill="none" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"/>`;
};
const drop = (x, y) => `<path d="M${x},${y} q-7,10 0,14 q7,-4 0,-14Z" fill="#6cb4ee" stroke="#2f7bd9"/>`;
const coils = (x0, x1, y, n) => {
  let s = '';
  const dx = (x1 - x0) / n;
  for (let i = 0; i < n; i++) s += `<path d="M${x0 + i * dx},${y - 11} l${dx * 0.7},22" ${sw(TAIL)}/>`;
  return s;
};

/** 結び方ごとの手順図 (配列: 手順ごとに 1 枚) */
export const KNOT_DIAGRAMS = {
  uni: [
    // 1 ハリ穴に通して折り返す
    knotWrap(eye() + `<path d="M232,60 L56,60 M56,80 L168,80" ${sw(STRAND)}/><path d="M56,60 C44,60 44,80 56,80" ${sw(STRAND)}/>` +
      note(112, 52, '本線')),
    // 2 輪をつくる
    knotWrap(eye() + `<path d="M232,60 L56,60" ${sw(STRAND)}/><path d="M56,80 L170,80 C206,80 206,34 170,40 L120,46" ${sw(TAIL)}/>` +
      `<path d="M56,60 C44,60 44,80 56,80" ${sw(STRAND)}/>`),
    // 3 巻く
    knotWrap(eye() + `<path d="M232,60 L56,60 M56,80 L170,80" ${sw(STRAND)}/>` +
      `<path d="M56,60 C44,60 44,80 56,80" ${sw(STRAND)}/>` + coils(104, 164, 70, 5)),
    // 4 湿らせて締める
    knotWrap(eye() + `<path d="M232,60 L56,60 M56,80 L120,80" ${sw(STRAND)}/>` +
      `<path d="M56,60 C44,60 44,80 56,80" ${sw(STRAND)}/>` + coils(88, 120, 70, 4) + drop(150, 24) +
      arrow(200, 60, 230, 60)),
    // 5 カット
    knotWrap(eye() + `<path d="M232,60 L56,60" ${sw(STRAND)}/><path d="M56,60 C44,60 44,80 56,80 L100,80" ${sw(STRAND)}/>` +
      coils(74, 100, 70, 4) + `<path d="M104,86 l10,10 m0,-10 l-10,10" stroke="#c0392b" stroke-width="2"/>`),
  ],
  clinch: [
    knotWrap(eye() + `<path d="M232,66 L56,66 M56,74 L150,74" ${sw(STRAND)}/><path d="M56,66 C44,66 44,74 56,74" ${sw(STRAND)}/>`),
    knotWrap(eye() + `<path d="M232,66 L56,66" ${sw(STRAND)}/><path d="M56,66 C44,66 44,74 56,74 L96,74" ${sw(STRAND)}/>` +
      coils(100, 150, 70, 5)),
    knotWrap(eye() + `<path d="M232,66 L56,66" ${sw(STRAND)}/><path d="M56,66 C44,66 44,74 56,74 L96,74" ${sw(STRAND)}/>` +
      coils(98, 130, 70, 3) + `<path d="M130,74 C140,74 142,60 128,60 L100,60" ${sw(TAIL)}/><circle cx="82" cy="70" r="6" fill="none" stroke="#c0392b" stroke-width="2"/>`),
    knotWrap(eye() + `<path d="M232,66 L56,66" ${sw(STRAND)}/><path d="M56,66 C44,66 44,74 56,74 L96,74" ${sw(STRAND)}/>` +
      coils(98, 130, 70, 3) + `<ellipse cx="150" cy="70" rx="22" ry="14" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="4 3"/>`),
    knotWrap(eye() + `<path d="M232,66 L56,66" ${sw(STRAND)}/>` + coils(70, 106, 70, 4) + drop(150, 26) +
      arrow(200, 66, 230, 66)),
  ],
  densha: [
    knotWrap(`<path d="M8,56 L170,56" ${sw(STRAND)}/><path d="M232,84 L70,84" ${sw('#3b82c4')}/>` +
      note(10, 46, '糸A') + note(168, 106, '糸B', '#3b82c4')),
    knotWrap(`<path d="M8,56 L170,56" ${sw(STRAND)}/><path d="M232,84 L70,84" ${sw('#3b82c4')}/>` +
      `<path d="M70,84 C50,84 52,40 76,46 L110,60" ${sw('#3b82c4')}/>` + coils(86, 140, 70, 4)),
    knotWrap(`<path d="M8,56 L100,56 M140,56 L170,56" ${sw(STRAND)}/><path d="M232,84 L140,84" ${sw('#3b82c4')}/>` +
      coils(100, 140, 70, 4) + drop(40, 20)),
  ],
  eight: [
    knotWrap(`<path d="M232,70 L110,70 C80,70 80,40 110,40 L150,40" ${sw(STRAND)}/>`),
    knotWrap(`<path d="M232,70 L100,70" ${sw(STRAND)}/><path d="M100,70 C70,70 70,36 104,36 C130,36 120,80 96,80 L60,80" ${sw(STRAND)}/>`),
    knotWrap(`<path d="M232,70 L140,70 C108,70 108,46 132,46 C150,46 150,70 132,70" ${sw(STRAND)}/><circle cx="80" cy="60" r="24" fill="none" stroke="${STRAND}" stroke-width="3"/>` +
      drop(150, 14) + arrow(190, 70, 224, 70)),
  ],
};
